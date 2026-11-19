// Local, offline replacement for the Supabase client used by the desktop app.
// Implements only the subset of the supabase-js API this app calls (tables, storage, one RPC),
// backed by IndexedDB inside the app's own profile folder. Nothing leaves the PC.
import { createStore, entries, set, del, clear, get, type UseStore } from "idb-keyval";

type Row = Record<string, any>;
type Result<T = any> = { data: T; error: { message: string } | null; count?: number | null };

export const TABLES = ["projects", "folders", "history_items", "project_files", "generated_barcodes"] as const;
type TableName = (typeof TABLES)[number];

const nowIso = () => new Date().toISOString();

const DEFAULTS: Record<string, () => Row> = {
  projects: () => ({
    notes: null,
    tags: [],
    settings: {},
    next_code: "010101010101",
    current_design_file_id: null,
    folder_id: null,
    sort_order: 0,
    printed_at: null,
    ondi_batch_id: null,
    institution_name: null,
    branch_name: null,
    is_template: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  }),
  folders: () => ({ parent_folder_id: null, color: "#6366f1", created_at: nowIso(), updated_at: nowIso() }),
  history_items: () => ({ show_text: true, rotation: 0, apply_to_all_pages: false, fit_to_page: false, created_at: nowIso() }),
  project_files: () => ({ created_at: nowIso() }),
  generated_barcodes: () => ({ used: false, used_synced_at: null, created_at: nowIso() }),
};
const HAS_UPDATED_AT = new Set(["projects", "folders"]);

// ---------- storage (one IndexedDB database per table; idb-keyval allows one store per db) ----------
const stores = new Map<string, UseStore>();
function store(name: string): UseStore {
  let s = stores.get(name);
  if (!s) {
    s = createStore(`bt-${name}`, "rows");
    stores.set(name, s);
  }
  return s;
}

const cache = new Map<string, Promise<Map<string, Row>>>();
function table(name: string): Promise<Map<string, Row>> {
  let p = cache.get(name);
  if (!p) {
    p = entries<string, Row>(store(name)).then((es) => new Map(es));
    cache.set(name, p);
  }
  return p;
}

async function putRow(name: string, row: Row) {
  (await table(name)).set(row.id, row);
  await set(row.id, row, store(name));
}
async function removeRow(name: string, id: string) {
  (await table(name)).delete(id);
  await del(id, store(name));
}

// ---------- query builder ----------
type Filter = (r: Row) => boolean;

function project(row: Row, cols: string | undefined): Row {
  if (!cols || cols.trim() === "*" || cols.trim() === "") return { ...row };
  const out: Row = {};
  for (const c of cols.split(",").map((s) => s.trim()).filter(Boolean)) out[c] = row[c] ?? null;
  return out;
}

function containsVal(hay: any, needle: any): boolean {
  if (Array.isArray(needle)) return Array.isArray(hay) && needle.every((n) => hay.some((h) => JSON.stringify(h) === JSON.stringify(n)));
  if (needle && typeof needle === "object") {
    if (!hay || typeof hay !== "object") return false;
    return Object.entries(needle).every(([k, v]) => containsVal(hay[k], v));
  }
  return hay === needle;
}

function cmp(a: any, b: any): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1; // nulls last (Postgres default for ASC)
  if (b === null || b === undefined) return -1;
  return a < b ? -1 : 1;
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private cols?: string;
  private returning = false;
  private payload: Row[] = [];
  private patch: Row = {};
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim?: number;
  private from_?: number;
  private to_?: number;
  private one: "" | "single" | "maybe" = "";
  private countMode = false;
  private headOnly = false;

  constructor(private tableName: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.cols = cols;
    else {
      this.returning = true;
      this.cols = cols;
    }
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  insert(v: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(v) ? v : [v];
    return this;
  }
  upsert(v: Row | Row[]) {
    this.op = "upsert";
    this.payload = Array.isArray(v) ? v : [v];
    return this;
  }
  update(v: Row) {
    this.op = "update";
    this.patch = v;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(c: string, v: any) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  neq(c: string, v: any) {
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  in(c: string, vs: any[]) {
    const s = new Set(vs);
    this.filters.push((r) => s.has(r[c]));
    return this;
  }
  is(c: string, v: any) {
    this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v));
    return this;
  }
  not(c: string, op: string, v: any) {
    if (op === "is") this.filters.push((r) => (v === null ? r[c] !== null && r[c] !== undefined : r[c] !== v));
    else if (op === "eq") this.filters.push((r) => r[c] !== v);
    else throw new Error(`localdb: unsupported not(${op})`);
    return this;
  }
  match(obj: Row) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  contains(c: string, v: any) {
    this.filters.push((r) => containsVal(r[c], v));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(from: number, to: number) {
    this.from_ = from;
    this.to_ = to;
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return this.run()
      .catch((e) => ({ data: null, error: { message: e?.message ?? String(e) } }) as Result)
      .then(ok, bad);
  }

  private async run(): Promise<Result> {
    const name = this.tableName;
    const t = await table(name);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let rows: Row[] = [];

    if (this.op === "insert" || this.op === "upsert") {
      for (const p of this.payload) {
        const existing = p.id ? t.get(p.id) : undefined;
        if (existing && this.op === "insert") throw new Error(`duplicate key value (id ${p.id})`);
        const base = existing ?? { id: crypto.randomUUID(), ...(DEFAULTS[name]?.() ?? { created_at: nowIso() }) };
        const row = { ...base, ...stripUndefined(p) };
        if (existing && HAS_UPDATED_AT.has(name)) row.updated_at = nowIso();
        await putRow(name, row);
        rows.push(row);
      }
      if (!this.returning) return { data: null, error: null };
    } else if (this.op === "update") {
      for (const r of [...t.values()].filter(match)) {
        const row = { ...r, ...stripUndefined(this.patch) };
        if (HAS_UPDATED_AT.has(name) && !("updated_at" in this.patch)) row.updated_at = nowIso();
        await putRow(name, row);
        rows.push(row);
      }
      if (!this.returning) return { data: null, error: null };
    } else if (this.op === "delete") {
      rows = [...t.values()].filter(match);
      for (const r of rows) await cascadeDelete(name, r.id);
      if (!this.returning) return { data: null, error: null };
    } else {
      rows = [...t.values()].filter(match);
    }

    if (this.orders.length) {
      rows.sort((a, b) => {
        for (const o of this.orders) {
          const c = cmp(a[o.col], b[o.col]);
          if (c) return o.asc ? c : -c;
        }
        return 0;
      });
    }
    const total = rows.length;
    if (this.from_ !== undefined) rows = rows.slice(this.from_, (this.to_ ?? rows.length - 1) + 1);
    if (this.lim !== undefined) rows = rows.slice(0, this.lim);
    const data = rows.map((r) => project(r, this.cols));

    if (this.one) {
      if (data.length === 0) {
        if (this.one === "maybe") return { data: null, error: null };
        return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
      }
      if (data.length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
      return { data: data[0], error: null };
    }
    if (this.headOnly) return { data: null, error: null, count: total };
    return { data, error: null, count: this.countMode ? total : null };
  }
}

function stripUndefined(o: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

async function cascadeDelete(name: string, id: string) {
  await removeRow(name, id);
  if (name === "projects") {
    for (const child of ["history_items", "generated_barcodes", "project_files"]) {
      const t = await table(child);
      for (const r of [...t.values()]) if (r.project_id === id) await removeRow(child, r.id);
    }
  }
  if (name === "folders") {
    for (const r of [...(await table("projects")).values()])
      if (r.folder_id === id) await putRow("projects", { ...r, folder_id: null });
    for (const r of [...(await table("folders")).values()])
      if (r.parent_folder_id === id) await putRow("folders", { ...r, parent_folder_id: null });
  }
}

// ---------- file storage (designs + exports buckets) ----------
export interface FileRecord {
  bucket: string;
  path: string;
  mime: string;
  bytes: ArrayBuffer;
  created_at: string;
}
const filesStore = () => store("files");

function bucket(b: string) {
  const key = (p: string) => `${b}:${p}`;
  return {
    async upload(path: string, blob: Blob, opts?: { upsert?: boolean }) {
      try {
        if (!opts?.upsert && (await get(key(path), filesStore()))) return { data: null, error: { message: "The resource already exists" } };
        const rec: FileRecord = { bucket: b, path, mime: blob.type || "application/octet-stream", bytes: await blob.arrayBuffer(), created_at: nowIso() };
        await set(key(path), rec, filesStore());
        return { data: { path }, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message ?? String(e) } };
      }
    },
    async download(path: string) {
      const rec = await get<FileRecord>(key(path), filesStore());
      if (!rec) return { data: null, error: { message: "Object not found" } };
      return { data: new Blob([rec.bytes], { type: rec.mime }), error: null };
    },
    async remove(paths: string[]) {
      for (const p of paths) await del(key(p), filesStore());
      return { data: paths.map((p) => ({ name: p })), error: null };
    },
    async list(_prefix?: string, opts?: { limit?: number }) {
      const all = (await entries<string, FileRecord>(filesStore())).filter(([, r]) => r.bucket === b).map(([, r]) => ({ name: r.path }));
      return { data: opts?.limit ? all.slice(0, opts.limit) : all, error: null };
    },
  };
}

// ---------- RPC ----------
async function rpc(fn: string): Promise<Result> {
  if (fn === "get_barcode_search_data") {
    const rows = [...(await table("projects")).values()].map((p) => ({
      project_id: p.id,
      project_name: p.name,
      barcode_type: p.settings?.barcode?.type ?? "code128",
      next_code: p.next_code ?? null,
      imported_count: Array.isArray(p.settings?.importedNumbers) ? p.settings.importedNumbers.length : 0,
    }));
    return { data: rows, error: null };
  }
  return { data: null, error: { message: `Unknown function ${fn}` } };
}

export const localdb = {
  from: (t: string) => new Query(t),
  rpc,
  storage: { from: bucket },
};

// ---------- backup / restore ----------
export const BACKUP_FORMAT = "eaglepost-barcode-backup";

/** Build a .zip backup holding every table (data.json) and every stored file (files/...). */
export async function exportBackup(): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const tables: Record<string, Row[]> = {};
  for (const t of TABLES) tables[t] = [...(await table(t)).values()];
  const files = await entries<string, FileRecord>(filesStore());
  const fileIndex = files.map(([k, r], i) => ({ key: k, bucket: r.bucket, path: r.path, mime: r.mime, created_at: r.created_at, entry: `files/${i}` }));
  zip.file("data.json", JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: nowIso(), tables, files: fileIndex }));
  files.forEach(([, r], i) => zip.file(`files/${i}`, r.bytes));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export interface ImportSummary {
  projects: number;
  folders: number;
  codes: number;
  files: number;
}

/**
 * Restore a backup zip. mode "replace" wipes local data first; "merge" adds/overwrites by id
 * and keeps everything else.
 */
export async function importBackup(file: Blob, mode: "replace" | "merge"): Promise<ImportSummary> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file("data.json");
  if (!dataFile) throw new Error("This is not a barcode app backup (data.json missing).");
  const data = JSON.parse(await dataFile.async("string"));
  if (data.format !== BACKUP_FORMAT) throw new Error("This is not a barcode app backup.");

  if (mode === "replace") await wipeAll();

  for (const t of TABLES) for (const row of data.tables?.[t] ?? []) if (row?.id) await putRow(t, row);
  let fileCount = 0;
  for (const f of data.files ?? []) {
    const entry = zip.file(f.entry);
    if (!entry) continue;
    const rec: FileRecord = { bucket: f.bucket, path: f.path, mime: f.mime, created_at: f.created_at, bytes: await entry.async("arraybuffer") };
    await set(f.key, rec, filesStore());
    fileCount++;
  }
  return {
    projects: data.tables?.projects?.length ?? 0,
    folders: data.tables?.folders?.length ?? 0,
    codes: data.tables?.generated_barcodes?.length ?? 0,
    files: fileCount,
  };
}

export async function wipeAll() {
  for (const t of TABLES) {
    await clear(store(t));
    cache.delete(t);
  }
  await clear(filesStore());
}

/** True when this PC has no projects yet (used to seed the starter templates once). */
export async function isEmpty(): Promise<boolean> {
  return (await table("projects")).size === 0 && (await table("folders")).size === 0;
}
