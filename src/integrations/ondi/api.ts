// Typed Ondi data helpers used by the "Pull from Ondi" feature.
// Hierarchy: Institution -> Branch -> Barcode batch -> Barcodes.
import { ondiGet, ondiRows } from "./client";

// --- In-memory TTL cache for the LIST reads (institutions/branches/batches) ---
// Re-opening the picker or re-navigating the Institution→Branch→Batch tree no longer
// refetches every time. The actual barcode-value pulls (listBatchBarcodes /
// listBatchBarcodeStatuses) are NEVER cached — those must be fresh when printing.
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const listCache = new Map<string, CacheEntry<unknown>>();

const TTL_INSTITUTIONS = 5 * 60 * 1000; // 5 min
const TTL_BRANCHES = 5 * 60 * 1000; // 5 min
const TTL_BATCHES = 60 * 1000; // 60s — batches change more often

/** Read-through cache: returns the cached value if fresh, else runs `fetcher` and stores it.
 *  `force: true` bypasses the cache (refetch + refresh the entry). */
async function cached<T>(key: string, ttl: number, force: boolean, fetcher: () => Promise<T>): Promise<T> {
  if (!force) {
    const hit = listCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  }
  const value = await fetcher();
  listCache.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
}

/** Clear all cached Ondi list reads (call when the user explicitly hits a refresh control). */
export function clearOndiCache(): void {
  listCache.clear();
}

export interface OndiInstitution {
  id: string;
  userId: string; // branches link to this via institution_user_id
  name: string;
  email?: string;
}

export interface OndiBranch {
  id: string;
  name: string;
  code: string;
  institutionUserId: string;
  isActive: boolean;
}

export interface OndiBatch {
  id: string;
  prefix: string; // e.g. "GE00059" — the batch identifier shown to the user
  quantity: number;
  status: string; // available | printed | ...
  startSequence?: number;
  endSequence?: number;
  printFileUrl?: string | null;
  createdAt?: string; // ISO date from raw.created_at || raw.inserted_at, if Ondi sends one
  raw: OndiBatchRow;
}

// --- Raw row shapes returned by the Ondi backend (snake_case, all fields optional) ---
interface OndiInstitutionRow {
  id: string;
  user_id: string;
  users?: { full_name?: string; email?: string };
  business_details?: { name?: string };
}

interface OndiBranchRow {
  id: string;
  name: string;
  code: string;
  institution_user_id?: string;
  is_active: boolean;
}

interface OndiBatchRow {
  id: string;
  prefix?: string;
  quantity?: number;
  status?: string;
  start_sequence?: number;
  end_sequence?: number;
  print_file_url?: string | null;
  created_at?: string;
  inserted_at?: string;
}

interface OndiBarcodeRow {
  barcode_value?: string;
  value?: string;
  code?: string;
  status?: string;
}

// --- Paging ---
// Ondi returns at most 100 rows per request, whatever `limit` we ask for, plus
// { pagination: { page, limit, total, total_pages } }. Always read every page.
const ONDI_PAGE_SIZE = 100;
const MAX_PAGES = 1000; // safety cap (100k rows)
const PAGE_WINDOW = 4; // pages fetched at the same time after the first

async function fetchAllPages<T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T[]> {
  const fetchPage = async (page: number) => {
    const json = await ondiGet(path, { ...params, page, limit: ONDI_PAGE_SIZE });
    const p = (json as { pagination?: { total_pages?: number; limit?: number } })?.pagination;
    return { rows: ondiRows<T>(json), totalPages: p?.total_pages, pageSize: p?.limit };
  };
  const first = await fetchPage(1);
  const all: T[] = [...first.rows];
  const pageSize = first.pageSize || first.rows.length || ONDI_PAGE_SIZE;
  const lastPage = Math.min(first.totalPages ?? MAX_PAGES, MAX_PAGES);
  if (first.rows.length === 0 || (first.totalPages === undefined && first.rows.length < pageSize)) return all;

  let next = 2;
  while (next <= lastPage) {
    const pages: number[] = [];
    while (pages.length < PAGE_WINDOW && next <= lastPage) pages.push(next++);
    const results = await Promise.all(pages.map(fetchPage));
    let done = false;
    for (const r of results) {
      if (done) break;
      all.push(...r.rows); // keep page order
      if (r.rows.length < pageSize) done = true; // short page = end of data
    }
    if (done) break;
  }
  return all;
}

// --- Institutions (verified shape: { id, user_id, users: { full_name, email } }) ---
// Cached ~5 min; pass { force: true } to bypass (e.g. an explicit refresh).
export async function listInstitutions(opts?: { force?: boolean }): Promise<OndiInstitution[]> {
  return cached("institutions", TTL_INSTITUTIONS, !!opts?.force, async () => {
    const rows = await fetchAllPages<OndiInstitutionRow>("/delivery/institutions");
    return rows.map((i) => ({
      id: i.id,
      userId: i.user_id,
      name: i.users?.full_name ?? i.business_details?.name ?? i.id,
      email: i.users?.email,
    }));
  });
}

// --- Branches for an institution (nested endpoint the admin UI uses) ---
// verified shape: { id, name, code, institution_user_id, is_active }. Cached ~5 min per institution.
export async function listBranches(
  institutionUserId: string,
  opts?: { force?: boolean }
): Promise<OndiBranch[]> {
  return cached(`branches:${institutionUserId}`, TTL_BRANCHES, !!opts?.force, async () => {
    const rows = await fetchAllPages<OndiBranchRow>(`/delivery/institutions/${institutionUserId}/branches`);
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      institutionUserId: b.institution_user_id ?? institutionUserId,
      isActive: b.is_active,
    }));
  });
}

// --- Barcode batches for a branch (verified live: nested under the institution, filtered by branch) ---
// Cached ~60s per (institution, branch); pass { force: true } to bypass on explicit refresh.
export async function listBatches(
  institutionUserId: string,
  branchId: string,
  opts?: { force?: boolean }
): Promise<OndiBatch[]> {
  return cached(`batches:${institutionUserId}:${branchId}`, TTL_BATCHES, !!opts?.force, async () => {
    const rows = await fetchAllPages<OndiBatchRow>(`/delivery/institutions/${institutionUserId}/barcode-batches`, {
      branch_id: branchId,
    });
    return rows.map((b) => ({
      id: b.id,
      prefix: b.prefix ?? b.id,
      quantity: b.quantity ?? 0,
      status: b.status ?? "",
      startSequence: b.start_sequence,
      endSequence: b.end_sequence,
      printFileUrl: b.print_file_url,
      createdAt: b.created_at ?? b.inserted_at,
      raw: b,
    }));
  });
}

/** Every barcode row of a batch (all pages). NOT cached — print pulls must be fresh. */
function paginateBarcodes(batchId: string, status?: string): Promise<(string | OndiBarcodeRow)[]> {
  return fetchAllPages<string | OndiBarcodeRow>(`/delivery/barcode-batches/${batchId}/barcodes`, { status });
}

/** Pull every barcode of a batch WITH its Ondi status (available | used | printed | …).
 *  Used to compute used-vs-unused for a saved project. */
export async function listBatchBarcodeStatuses(
  batchId: string
): Promise<{ code: string; status: string }[]> {
  const out: { code: string; status: string }[] = [];
  for (const r of await paginateBarcodes(batchId)) {
    const code = typeof r === "string" ? r : r.barcode_value ?? r.value ?? r.code;
    const status = typeof r === "string" ? "" : r.status ?? "";
    if (code) out.push({ code: String(code), status: String(status) });
  }
  return out;
}

/** Pull the barcode VALUES of a batch. By default returns the WHOLE batch (every code);
 *  pass a status (e.g. "available") to filter to un-used codes only. */
export async function listBatchBarcodes(batchId: string, status?: string): Promise<string[]> {
  const out: string[] = [];
  for (const r of await paginateBarcodes(batchId, status)) {
    const v = typeof r === "string" ? r : r.barcode_value ?? r.value ?? r.code;
    if (v) out.push(String(v));
  }
  return out;
}
