// Tracking layer for generated barcodes: duplicate detection + used/unused usage sync.
// Backed by the public.generated_barcodes table (one row per code per project).
import { supabase } from "./client";
import { listBatchBarcodeStatuses } from "@/integrations/ondi/api";

export interface DuplicateMatch {
  code: string;
  project_id: string | null;
  project_name: string | null;
  created_at: string;
}

export interface DuplicateSummary {
  matches: DuplicateMatch[];
  /** distinct projects the duplicate codes already live in */
  projects: { id: string; name: string; count: number }[];
  total: number;
}

const CHUNK = 500;

/** Record the codes generated/saved for a project (enables dup-detection + usage sync). */
export async function recordGeneratedCodes(params: {
  projectId: string;
  codes: string[];
  batchName?: string | null;
  ondiBatchId?: string | null;
}): Promise<void> {
  const { projectId, codes, batchName, ondiBatchId } = params;
  if (!codes.length) return;
  const rows = codes.map((code) => ({
    code,
    project_id: projectId,
    batch_name: batchName ?? null,
    ondi_batch_id: ondiBatchId ?? null,
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("generated_barcodes").insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }
}

/** Find which of the incoming codes already exist, and in which project(s). */
export async function findDuplicateCodes(codes: string[]): Promise<DuplicateSummary> {
  const empty: DuplicateSummary = { matches: [], projects: [], total: 0 };
  if (!codes.length) return empty;

  const raw: { code: string; project_id: string | null; created_at: string }[] = [];
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("generated_barcodes")
      .select("code, project_id, created_at")
      .in("code", slice);
    if (error) throw error;
    if (data) raw.push(...data);
  }
  if (!raw.length) return empty;

  // resolve project names in one query
  const projectIds = [...new Set(raw.map((m) => m.project_id).filter((x): x is string => !!x))];
  const nameById = new Map<string, string>();
  if (projectIds.length) {
    const { data: projs, error } = await supabase
      .from("projects")
      .select("id, name")
      .in("id", projectIds);
    if (error) throw error;
    for (const p of projs ?? []) nameById.set(p.id, p.name);
  }

  const matches: DuplicateMatch[] = raw.map((m) => ({
    code: m.code,
    project_id: m.project_id,
    project_name: m.project_id ? nameById.get(m.project_id) ?? null : null,
    created_at: m.created_at,
  }));

  const byProject = new Map<string, { id: string; name: string; count: number }>();
  for (const m of matches) {
    if (!m.project_id) continue;
    const cur = byProject.get(m.project_id);
    if (cur) cur.count += 1;
    else byProject.set(m.project_id, { id: m.project_id, name: m.project_name ?? "(unknown project)", count: 1 });
  }

  return { matches, projects: [...byProject.values()], total: matches.length };
}

export interface PrintedBatch {
  printedAt: string;
  projectName: string;
}

/**
 * Find which of the given Ondi batches were already printed (a project exists with that
 * ondi_batch_id AND a non-null printed_at). One query; returns a map keyed by
 * ondi_batch_id with the MOST RECENT printed_at per batch (if several projects printed it).
 */
export async function getPrintedBatches(
  ondiBatchIds: string[]
): Promise<Record<string, PrintedBatch>> {
  const ids = [...new Set(ondiBatchIds.filter((x): x is string => !!x))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("projects")
    .select("name, ondi_batch_id, printed_at")
    .in("ondi_batch_id", ids)
    .not("printed_at", "is", null);
  if (error) throw error;

  const byBatch: Record<string, PrintedBatch> = {};
  for (const r of data ?? []) {
    const batchId = r.ondi_batch_id;
    const printedAt = r.printed_at;
    if (!batchId || !printedAt) continue;
    const cur = byBatch[batchId];
    if (!cur || printedAt > cur.printedAt) {
      byBatch[batchId] = { printedAt, projectName: r.name ?? "(unnamed project)" };
    }
  }
  return byBatch;
}

export interface PrintedFlag {
  name: string;
  printedAt: string;
  projectName: string;
}

/**
 * For a list of named items (with optional ondiBatchId), return the ones whose Ondi batch
 * was already printed before — flattened to { name, printedAt, projectName }. This is the
 * exact transform shared by Quick Print and Multi Batch's pre-generate guard. Empty input
 * (or none with an ondiBatchId) → [].
 */
export async function flagPrintedBatches(
  items: { name: string; ondiBatchId?: string | null }[]
): Promise<PrintedFlag[]> {
  const ondiBatchIds = items.map((i) => i.ondiBatchId).filter((x): x is string => !!x);
  if (!ondiBatchIds.length) return [];
  const printed = await getPrintedBatches(ondiBatchIds);
  return items
    .filter((i) => i.ondiBatchId && printed[i.ondiBatchId])
    .map((i) => ({
      name: i.name,
      printedAt: printed[i.ondiBatchId!].printedAt,
      projectName: printed[i.ondiBatchId!].projectName,
    }));
}

export interface PulledBatchInfo {
  /** name of the (most recent) project that pulled this Ondi batch */
  projectName: string;
  /** cached % of this batch's recorded codes marked used, if it has been synced at least once */
  cachedUsedPct?: number;
}

/**
 * For a list of Ondi batch ids, return a map ondiBatchId → { projectName, cachedUsedPct? }
 * for the batches we have ALREADY pulled (a project exists with that ondi_batch_id).
 * Lets the picker show a "✓ Pulled" badge so staff don't re-pull. Two batched reads,
 * NOT N+1: one over `projects` (existence + name) and one over `generated_barcodes`
 * (cached usage), both filtered by the ondiBatchId list.
 */
export async function getPulledBatchIds(
  ondiBatchIds: string[]
): Promise<Record<string, PulledBatchInfo>> {
  const ids = [...new Set(ondiBatchIds.filter((x): x is string => !!x))];
  if (!ids.length) return {};

  // 1) which batches map to a project (+ its name) — keep the most-recently-created project per batch
  const { data: projs, error: pErr } = await supabase
    .from("projects")
    .select("name, ondi_batch_id, created_at")
    .in("ondi_batch_id", ids);
  if (pErr) throw pErr;

  const out: Record<string, PulledBatchInfo> = {};
  const newestByBatch: Record<string, string> = {}; // batchId → created_at of the chosen project
  for (const r of projs ?? []) {
    const batchId = r.ondi_batch_id;
    if (!batchId) continue;
    const createdAt = r.created_at ?? "";
    if (!(batchId in out) || createdAt > (newestByBatch[batchId] ?? "")) {
      out[batchId] = { projectName: r.name ?? "(unnamed project)" };
      newestByBatch[batchId] = createdAt;
    }
  }
  if (Object.keys(out).length === 0) return {};

  // 2) cached usage % per batch — one aggregate read over generated_barcodes by ondi_batch_id
  const { data: codes, error: cErr } = await supabase
    .from("generated_barcodes")
    .select("ondi_batch_id, used, used_synced_at")
    .in("ondi_batch_id", Object.keys(out));
  if (cErr) throw cErr;

  const agg: Record<string, { total: number; used: number; synced: boolean }> = {};
  for (const r of codes ?? []) {
    const batchId = r.ondi_batch_id;
    if (!batchId || !(batchId in out)) continue;
    const a = (agg[batchId] ??= { total: 0, used: 0, synced: false });
    a.total += 1;
    if (r.used) a.used += 1;
    if (r.used_synced_at) a.synced = true;
  }
  for (const [batchId, a] of Object.entries(agg)) {
    // only show a % once the batch has been synced from Ondi at least once
    if (a.synced && a.total > 0) out[batchId].cachedUsedPct = Math.round((a.used / a.total) * 100);
  }

  return out;
}

export interface UsageCounts {
  total: number;
  used: number;
  unused: number;
  syncedAt: string;
}

export type StockStatus = "ok" | "low" | "critical";

/**
 * Classify remaining stock from usage counts. Single source of truth for the
 * "running low / prepare a new batch" thresholds used by Branch Stock and Projects.
 *   critical: synced AND (0 unused, or < 10% of codes still unused)
 *   low:      synced AND < 25% of codes still unused
 *   ok:       not synced, no data, or plenty left
 */
export function stockStatus(
  c: UsageCounts | null | undefined,
  synced: boolean
): StockStatus {
  if (!synced || !c || c.total <= 0) return "ok";
  const unusedFraction = c.unused / c.total;
  if (c.unused === 0 || unusedFraction < 0.1) return "critical";
  if (unusedFraction < 0.25) return "low";
  return "ok";
}

/**
 * Sync used/unused status for a project's codes from Ondi.
 * A code is "used" when Ondi no longer reports it as `available`
 * (i.e. a shipment/order has consumed it).
 */
export async function syncUsageFromOndi(params: {
  projectId: string;
  ondiBatchId: string;
}): Promise<UsageCounts> {
  const { projectId, ondiBatchId } = params;

  const statuses = await listBatchBarcodeStatuses(ondiBatchId);
  const usedByCode = new Map<string, boolean>();
  for (const s of statuses) {
    usedByCode.set(s.code, (s.status || "").toLowerCase() !== "available");
  }

  // load this project's recorded codes
  const { data: rows, error } = await supabase
    .from("generated_barcodes")
    .select("id, code")
    .eq("project_id", projectId);
  if (error) throw error;

  const syncedAt = new Date().toISOString();
  let used = 0;
  const usedIds: string[] = [];
  const unusedIds: string[] = [];
  for (const r of rows ?? []) {
    const isUsed = usedByCode.get(r.code) ?? false;
    if (isUsed) {
      used += 1;
      usedIds.push(r.id);
    } else {
      unusedIds.push(r.id);
    }
  }

  // persist in two bulk updates
  if (usedIds.length) {
    const { error: e1 } = await supabase
      .from("generated_barcodes")
      .update({ used: true, used_synced_at: syncedAt })
      .in("id", usedIds);
    if (e1) throw e1;
  }
  if (unusedIds.length) {
    const { error: e2 } = await supabase
      .from("generated_barcodes")
      .update({ used: false, used_synced_at: syncedAt })
      .in("id", unusedIds);
    if (e2) throw e2;
  }

  const total = (rows ?? []).length;
  return { total, used, unused: total - used, syncedAt };
}

export interface CodeRow {
  id: string;
  code: string;
  used: boolean;
  used_synced_at: string | null;
  batch_name: string | null;
  created_at: string;
}

/**
 * Fetch every recorded code for a project (paginated so the PostgREST 1000-row cap
 * can't silently truncate large batches).
 */
export async function getProjectCodes(projectId: string): Promise<CodeRow[]> {
  const PAGE = 1000;
  const all: CodeRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("generated_barcodes")
      .select("id, code, used, used_synced_at, batch_name, created_at")
      .eq("project_id", projectId)
      .order("code", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as CodeRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/**
 * One aggregate read of cached usage for ALL projects (no Ondi call, no N+1).
 * Groups generated_barcodes by project_id in a single query and only surfaces
 * projects that have actually been synced at least once (have a used_synced_at).
 */
export async function getUsageByProject(): Promise<Record<string, UsageCounts>> {
  const { data, error } = await supabase
    .from("generated_barcodes")
    .select("project_id, used, used_synced_at");
  if (error) throw error;

  const agg: Record<string, { total: number; used: number; synced?: string }> = {};
  for (const r of data ?? []) {
    if (!r.project_id) continue;
    const a = (agg[r.project_id] ??= { total: 0, used: 0 });
    a.total += 1;
    if (r.used) a.used += 1;
    if (r.used_synced_at && (!a.synced || r.used_synced_at > a.synced)) a.synced = r.used_synced_at;
  }
  const usage: Record<string, UsageCounts> = {};
  for (const [pid, a] of Object.entries(agg)) {
    if (a.synced) usage[pid] = { total: a.total, used: a.used, unused: a.total - a.used, syncedAt: a.synced };
  }
  return usage;
}

export interface BulkSyncResult {
  ok: number;
  failed: number;
  counts: Record<string, UsageCounts>;
}

/**
 * Sync usage from Ondi for several batches at once with a bounded concurrency
 * (so we don't hammer Ondi). Per-batch failures are tolerated and counted;
 * onResult fires after each success so the caller can update UI incrementally.
 */
export async function bulkSyncUsageFromOndi(
  targets: { projectId: string; ondiBatchId: string }[],
  opts?: { concurrency?: number; onResult?: (projectId: string, counts: UsageCounts) => void }
): Promise<BulkSyncResult> {
  const concurrency = Math.max(1, opts?.concurrency ?? 5);
  const counts: Record<string, UsageCounts> = {};
  let ok = 0;
  let failed = 0;

  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const t = targets[cursor++];
      try {
        const c = await syncUsageFromOndi(t);
        counts[t.projectId] = c;
        ok += 1;
        opts?.onResult?.(t.projectId, c);
      } catch (e) {
        failed += 1;
        console.warn("Usage sync failed for project", t.projectId, e);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return { ok, failed, counts };
}

/** Read cached usage counts for a project (no Ondi call). */
export async function getCachedUsage(projectId: string): Promise<UsageCounts | null> {
  const { data, error } = await supabase
    .from("generated_barcodes")
    .select("used, used_synced_at")
    .eq("project_id", projectId);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const synced = data.find((d) => d.used_synced_at)?.used_synced_at;
  if (!synced) return null; // never synced yet
  const used = data.filter((d) => d.used).length;
  return { total: data.length, used, unused: data.length - used, syncedAt: synced };
}
