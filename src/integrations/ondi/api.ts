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

// --- Institutions (verified shape: { id, user_id, users: { full_name, email } }) ---
// Cached ~5 min; pass { force: true } to bypass (e.g. an explicit refresh).
export async function listInstitutions(opts?: { force?: boolean }): Promise<OndiInstitution[]> {
  return cached("institutions", TTL_INSTITUTIONS, !!opts?.force, async () => {
    const json = await ondiGet("/delivery/institutions", { page: 1, limit: 100 });
    return ondiRows<OndiInstitutionRow>(json).map((i) => ({
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
    const json = await ondiGet(`/delivery/institutions/${institutionUserId}/branches`, {
      page: 1,
      limit: 200,
    });
    return ondiRows<OndiBranchRow>(json).map((b) => ({
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
    const json = await ondiGet(`/delivery/institutions/${institutionUserId}/barcode-batches`, {
      branch_id: branchId,
      page: 1,
      limit: 100,
    });
    return ondiRows<OndiBatchRow>(json).map((b) => ({
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

const BARCODE_PAGE_LIMIT = 500;
const BARCODE_PAGE_CAP = 50; // safety cap (25k codes)
const PAGE_WINDOW = 4; // pages fetched concurrently after the first

/**
 * Paginate a batch's `/barcodes` endpoint, parallelizing after the first page.
 * Page 1 runs alone (cheap probe). If it was full (== limit), subsequent pages are
 * fetched in concurrent WINDOWS of PAGE_WINDOW and we stop as soon as any page in a
 * window comes back < limit (no more data). NOT cached — print pulls must be fresh.
 * Rows are appended strictly by page index so ordering stays stable.
 */
async function paginateBarcodes(
  batchId: string,
  status?: string
): Promise<(string | OndiBarcodeRow)[]> {
  const fetchPage = async (page: number): Promise<(string | OndiBarcodeRow)[]> => {
    const json = await ondiGet(`/delivery/barcode-batches/${batchId}/barcodes`, {
      page,
      limit: BARCODE_PAGE_LIMIT,
      status,
    });
    return ondiRows<string | OndiBarcodeRow>(json);
  };

  const all: (string | OndiBarcodeRow)[] = [];
  const first = await fetchPage(1);
  all.push(...first);
  if (first.length < BARCODE_PAGE_LIMIT) return all; // single page covered the whole batch

  let nextPage = 2;
  for (;;) {
    // build a window of consecutive pages, respecting the safety cap
    const pages: number[] = [];
    while (pages.length < PAGE_WINDOW && nextPage <= BARCODE_PAGE_CAP) pages.push(nextPage++);
    if (pages.length === 0) break;

    const results = await Promise.all(pages.map((p) => fetchPage(p)));
    let done = false;
    for (const rows of results) {
      // append in page order; rows is already in this window's order
      all.push(...rows);
      if (rows.length < BARCODE_PAGE_LIMIT) done = true; // a short page = end of data
    }
    if (done) break;
  }
  return all;
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
