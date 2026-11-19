import { loadPdfMeta, exportMergedPdf } from "@/utils/pdf";
import type { BarcodeSettings, JobSettings, Placement, MultiUpSettings } from "@/store/useWorkspaceStore";

export type ExportableProjectSettings = {
  job?: JobSettings;
  barcode?: BarcodeSettings;
  placementsByPage?: Record<number, Placement[]>;
  applyToAllPages?: boolean;
  applyCount?: number;
  currentPage?: number;
  importedNumbers?: string[];
  currentNumberIndex?: number;
  digitsCount?: number;
};

export type GenerateProjectExportParams = {
  designBytes: ArrayBuffer;
  settings: ExportableProjectSettings;
  nextCode: string; // next sequential body (same as sequenceNextBody in editor)
  // Fallbacks (from zustand defaults) to keep exports robust even if settings are partial
  fallbackJob: JobSettings;
  fallbackBarcode: BarcodeSettings;
  fallbackPlacementsByPage?: Record<number, Placement[]>;
};

function getDefaultPlacements(barcode: BarcodeSettings): Record<number, Placement[]> {
  return {
    1: [
      {
        xMM: 10,
        yMM: 10,
        widthMM: barcode.widthMM,
        heightMM: barcode.heightMM,
        fontSize: barcode.fontSize,
        id: crypto.randomUUID(),
        showText: true,
        textBgColor: "",
        textColor: "#000000",
        textPosition: "bottom",
        bold: false,
        italic: false,
        underline: false,
        codeOnly: false,
      },
    ],
  };
}

function normalizeMultiUp(multiUp: Partial<MultiUpSettings> | undefined, fallback: MultiUpSettings): MultiUpSettings {
  return {
    ...fallback,
    ...(multiUp ?? {}),
  };
}

export async function generateProjectExportPdf(params: GenerateProjectExportParams): Promise<{
  pdfBytes: Uint8Array;
  selectedPages: number[];
  pageBarcodeValues: string[];
  meta: { pageCount: number; pageSizesMM: { width: number; height: number }[] };
  effectiveJob: JobSettings;
  effectiveBarcode: BarcodeSettings;
  effectivePlacementsByPage: Record<number, Placement[]>;
  effectiveApplyToAllPages: boolean;
  effectiveApplyCount: number;
  effectiveCurrentPage: number;
  effectiveImportedNumbers: string[];
  effectiveDigitsCount: number;
  sequenceStart: string;
  nextSequenceBodyIfSequential: string | null;
}> {
  const meta = await loadPdfMeta(params.designBytes);

  const effectiveJob: JobSettings = {
    ...params.fallbackJob,
    ...(params.settings.job ?? {}),
    multiUp: normalizeMultiUp(params.settings.job?.multiUp, params.fallbackJob.multiUp),
  };

  const effectiveBarcode: BarcodeSettings = {
    ...params.fallbackBarcode,
    ...(params.settings.barcode ?? {}),
  };

  const effectivePlacementsByPage: Record<number, Placement[]> =
    params.settings.placementsByPage ?? params.fallbackPlacementsByPage ?? getDefaultPlacements(effectiveBarcode);

  const effectiveApplyToAllPages = params.settings.applyToAllPages ?? true;
  const effectiveImportedNumbers = Array.isArray(params.settings.importedNumbers) ? params.settings.importedNumbers : [];

  const applyCountFromSettings = Number(params.settings.applyCount ?? 1) || 1;
  const effectiveApplyCount = Math.max(1, effectiveImportedNumbers.length > 0 ? effectiveImportedNumbers.length : applyCountFromSettings);

  const effectiveCurrentPage = Math.max(1, Number(params.settings.currentPage ?? 1) || 1);

  const effectiveDigitsCount =
    Number(
      params.settings.digitsCount ??
        (effectiveBarcode.type === "ean13" ? 12 : (effectiveBarcode.value?.length ?? 12))
    ) || 12;

  // Placements param for exportMergedPdf: if applyToAll, only page 1 is used
  const placementsForExport: Record<number, Placement[]> = effectiveApplyToAllPages
    ? { 1: effectivePlacementsByPage[1] ?? effectivePlacementsByPage[effectiveCurrentPage] ?? [] }
    : effectivePlacementsByPage;

  // Determine exported pages
  const count = effectiveApplyToAllPages ? effectiveApplyCount : Object.keys(placementsForExport).length;
  const selectedPages = effectiveApplyToAllPages
    ? Array.from({ length: count }, () => effectiveCurrentPage)
    : Object.keys(placementsForExport)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);

  // Generate per-page barcode values
  const bodyLen = effectiveBarcode.type === "ean13" ? 12 : effectiveDigitsCount;
  let pageBarcodeValues: string[];

  const nextCode = params.nextCode || "";

  if (effectiveImportedNumbers.length > 0) {
    pageBarcodeValues = effectiveImportedNumbers.slice(0, count).map((num) => {
      if (effectiveBarcode.type === "ean13") {
        return num.replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0");
      }
      return num;
    });

    while (pageBarcodeValues.length < count) {
      const remainingNeeded = count - pageBarcodeValues.length;
      const additional = effectiveImportedNumbers.slice(0, remainingNeeded).map((num) => {
        if (effectiveBarcode.type === "ean13") {
          return num.replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0");
        }
        return num;
      });
      pageBarcodeValues.push(...additional);
    }
  } else {
    if (effectiveBarcode.type === "ean13") {
      const start = (nextCode || "").replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0");
      const incString = (n: number) => {
        const v = (BigInt(start || "0") + BigInt(n)).toString();
        return v.padStart(bodyLen, "0");
      };
      pageBarcodeValues = selectedPages.map((_, idx) => incString(idx));
    } else {
      const start = (nextCode || "").slice(0, bodyLen);
      const incrementAlphanumeric = (str: string, n: number): string => {
        if (!str) return str;
        if (/^\d+$/.test(str)) {
          const v = (BigInt(str) + BigInt(n)).toString();
          return v.padStart(str.length, "0");
        }
        const match = str.match(/^(.*?)(\d+)$/);
        if (match) {
          const prefix = match[1];
          const numPart = match[2];
          const incremented = (BigInt(numPart) + BigInt(n)).toString().padStart(numPart.length, "0");
          return prefix + incremented;
        }
        return n === 0 ? str : str + n;
      };
      pageBarcodeValues = selectedPages.map((_, idx) => incrementAlphanumeric(start, idx));
    }
  }

  const sourcePageForExport = selectedPages[0] ?? effectiveCurrentPage;
  const sourcePageSizeMM = meta.pageSizesMM[sourcePageForExport - 1];

  const pdfBytes = await exportMergedPdf({
    originalBytes: params.designBytes,
    pageCount: meta.pageCount,
    targetPageMM: effectiveJob.pageSizeMM,
    fitToPage: effectiveJob.fitToPage,
    designSizeMM:
      !effectiveJob.fitToPage && !effectiveJob.multiUp?.enabled
        ? { width: effectiveJob.designWidthMM || 100, height: effectiveJob.designHeightMM || 100 }
        : undefined,
    placements: placementsForExport,
    applyToAll: effectiveApplyToAllPages,
    barcode: effectiveBarcode,
    selectedPages,
    pageBarcodeValues,
    multiUp: effectiveJob.multiUp,
    sourcePageSizeMM,
    canvasColor: effectiveJob.canvasColor,
  });

  const sequenceStart = effectiveImportedNumbers.length > 0 ? pageBarcodeValues[0] : pageBarcodeValues[0] ?? "";

  // If sequential: compute what next_code should become after export
  let nextSequenceBodyIfSequential: string | null = null;
  if (effectiveImportedNumbers.length === 0) {
    if (effectiveBarcode.type === "ean13") {
      const start = (nextCode || "").replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0");
      nextSequenceBodyIfSequential = (BigInt(start || "0") + BigInt(count)).toString().padStart(bodyLen, "0");
    } else {
      // For non-numeric sequences we keep next_code as-is (editor doesn't have a single correct rule for all cases)
      nextSequenceBodyIfSequential = null;
    }
  }

  return {
    pdfBytes,
    selectedPages,
    pageBarcodeValues,
    meta,
    effectiveJob,
    effectiveBarcode,
    effectivePlacementsByPage,
    effectiveApplyToAllPages,
    effectiveApplyCount,
    effectiveCurrentPage,
    effectiveImportedNumbers,
    effectiveDigitsCount,
    sequenceStart,
    nextSequenceBodyIfSequential,
  };
}
