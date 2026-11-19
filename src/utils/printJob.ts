// Quick-print helper: turn a template project + one or more code batches into a single
// print-ready PDF (all batches merged into one document, so staff can print in one shot).
// Reuses the same export engine as Multi Batch — no new rendering logic.
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { SupabaseStorageService } from "@/services/storage/SupabaseStorageService";
import {
  prepareBatchSettings,
  preloadDesign,
  exportSingleBatch,
  clearBatchCache,
} from "@/utils/batchExport";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { recordGeneratedCodes } from "@/integrations/supabase/tracking";

export interface PrintBatch {
  name: string;
  values: string[];
}

export interface PrintPickedBatch extends PrintBatch {
  ondiBatchId?: string;
  institutionName?: string;
  branchName?: string;
}

/**
 * Generate one merged print-ready PDF for the given batches off a template project.
 * Each batch's pages are appended in order. Throws on a missing template/design.
 */
export async function generatePrintPdf(
  templateId: string,
  batches: PrintBatch[]
): Promise<Uint8Array> {
  const usable = batches.filter((b) => b.values.length > 0);
  if (!usable.length) throw new Error("No codes to print.");

  // Load the template's design file + persisted settings.
  const { data: tpl, error } = await supabase
    .from("projects")
    .select("settings, current_design_file_id")
    .eq("id", templateId)
    .single();
  if (error || !tpl?.current_design_file_id) {
    throw new Error("The selected template has no design file.");
  }

  const designRec = await SupabaseStorageService.getFile(tpl.current_design_file_id);
  if (!designRec?.bytes) throw new Error("Couldn't load the template's design file.");

  await preloadDesign(designRec.bytes);

  const defaults = useWorkspaceStore.getState();
  const batchSettings = prepareBatchSettings(
    tpl.settings ?? {},
    defaults.job,
    defaults.barcode,
    defaults.placementsByPage
  );

  try {
    // Render each batch, then merge into a single document.
    const perBatch: Uint8Array[] = [];
    for (const b of usable) {
      perBatch.push(await exportSingleBatch(designRec.bytes, { name: b.name, values: b.values }, batchSettings));
    }

    if (perBatch.length === 1) return perBatch[0];

    const merged = await PDFDocument.create();
    for (const bytes of perBatch) {
      const doc = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    return merged.save();
  } finally {
    clearBatchCache();
  }
}

/**
 * Save each printed batch as a tracked project (marked printed now), so it shows up under
 * Projects with usage-sync + the per-code view available. Best-effort — returns how many
 * projects were created; a failure on one batch doesn't abort the rest.
 * ponytail: re-printing the same branch creates another project each time; add dedup-by-batch
 * if the Projects list gets noisy.
 */
export async function createPrintedProjects(
  templateId: string,
  batches: PrintPickedBatch[]
): Promise<number> {
  const { data: tpl, error } = await supabase
    .from("projects")
    .select("settings, next_code, current_design_file_id")
    .eq("id", templateId)
    .single();
  if (error || !tpl?.current_design_file_id) {
    throw new Error("The selected template has no design file.");
  }

  const tplSettings = (tpl.settings ?? {}) as {
    importedNumbers?: unknown;
    currentNumberIndex?: unknown;
    applyCount?: unknown;
    placementsByPage?: Record<string, unknown>;
  };
  const {
    importedNumbers: _importedNumbers,
    currentNumberIndex: _currentNumberIndex,
    applyCount: _applyCount,
    placementsByPage: rawPlacements,
    ...otherSettings
  } = tplSettings;

  // Keep only page-1 placements (applyToAllPages uses page 1 as the source).
  let cleanPlacements: Record<string, unknown> = {};
  if (rawPlacements) {
    if (Array.isArray(rawPlacements["1"])) {
      cleanPlacements = { "1": rawPlacements["1"] };
    } else {
      const firstKey = Object.keys(rawPlacements).sort((a, b) => Number(a) - Number(b))[0];
      if (firstKey && Array.isArray(rawPlacements[firstKey])) {
        cleanPlacements = { "1": rawPlacements[firstKey] };
      }
    }
  }

  const printedAt = new Date().toISOString();
  let created = 0;
  for (const b of batches) {
    if (!b.values.length) continue;
    const name = branchCodeName(b.branchName || b.institutionName, [b.name], b.values.length);

    const settings = {
      ...otherSettings,
      placementsByPage: cleanPlacements,
      applyToAllPages: true,
      currentPage: 1,
      importedNumbers: b.values,
      currentNumberIndex: 0,
      applyCount: Math.max(1, b.values.length),
    };

    const { data: newProject, error: insErr } = await supabase
      .from("projects")
      .insert({
        name,
        settings,
        current_design_file_id: tpl.current_design_file_id,
        next_code: tpl.next_code ?? "0",
        printed_at: printedAt,
        ondi_batch_id: b.ondiBatchId ?? null,
        institution_name: b.institutionName ?? null,
        branch_name: b.branchName ?? null,
      })
      .select("id")
      .single();

    if (insErr || !newProject) {
      console.warn("Quick Print: couldn't save tracked project for", name, insErr);
      continue;
    }
    created += 1;

    try {
      await recordGeneratedCodes({
        projectId: newProject.id,
        codes: b.values,
        batchName: name,
        ondiBatchId: b.ondiBatchId ?? null,
      });
    } catch (e) {
      console.warn("Quick Print: project saved but code-tracking failed for", name, e);
    }
  }
  return created;
}

/** Trigger a browser download of PDF bytes. */
/** Make a name safe for a file while keeping Kurdish/Arabic letters (only strips characters
 *  Windows forbids in file names). */
export function safeFileName(name: string, fallback = "barcodes"): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  return clean.slice(0, 150) || fallback;
}

/** "Branch name - GE00059 - 1000 pcs" (several batches: "Branch - GE00059 + GE00060 - 2000 pcs",
 *  or "+ N more"). */
export function branchCodeName(branchName: string | undefined, codes: string[], quantity?: number): string {
  const list = codes.filter(Boolean);
  const codePart = list.length > 3 ? `${list[0]} + ${list.length - 1} more` : list.join(" + ");
  const qtyPart = quantity ? `${quantity} pcs` : "";
  return safeFileName([branchName, codePart, qtyPart].filter(Boolean).join(" - "));
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open PDF bytes in a new tab and fire the print dialog once it loads. */
export function openAndPrint(bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.addEventListener("load", () => {
      try {
        win.focus();
        win.print();
      } catch {
        /* some browsers block programmatic print on cross-origin blob — user can Ctrl+P */
      }
    });
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
