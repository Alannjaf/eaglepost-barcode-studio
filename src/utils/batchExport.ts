import { PDFDocument, StandardFonts, rgb, degrees, PDFPage } from "pdf-lib";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { mmToPt } from "@/utils/units";
import type { BarcodeSettings, JobSettings, Placement, MultiUpSettings } from "@/store/useWorkspaceStore";

// ============================================================================
// ULTRA-FAST BATCH EXPORT ENGINE V2
// Vector-based barcode rendering - no PNG conversion overhead
// Target: 150+ batches/minute
// ============================================================================

interface CachedBatchEngine {
  srcDoc: PDFDocument;
  srcBytes: ArrayBuffer;
  srcPdfBytes: Uint8Array; // Pre-serialized for embedding - HUGE speed boost
  meta: { pageCount: number; pageSizesMM: { width: number; height: number }[] };
}

let cachedEngine: CachedBatchEngine | null = null;

// Barcode pattern cache - avoid regenerating same barcodes
const barcodePatternCache = new Map<string, { bars: boolean[]; width: number }>();
const qrPatternCache = new Map<string, boolean[][]>();

// Clear cached engine - MUST be called when leaving MultiBatch to avoid conflicts
export function clearBatchEngineCache(): void {
  cachedEngine = null;
  barcodePatternCache.clear();
  qrPatternCache.clear();
}

export async function preloadDesign(bytes: ArrayBuffer): Promise<{
  pageCount: number;
  pageSizesMM: { width: number; height: number }[];
}> {
  const srcDoc = await PDFDocument.load(bytes);
  const pageCount = srcDoc.getPageCount();
  const pageSizesMM: { width: number; height: number }[] = [];
  
  for (let i = 0; i < pageCount; i++) {
    const page = srcDoc.getPage(i);
    const { width, height } = page.getSize();
    pageSizesMM.push({ width: width * 0.352778, height: height * 0.352778 });
  }
  
  // Pre-serialize source PDF ONCE - avoids calling .save() per batch
  const srcPdfBytes = await srcDoc.save();
  
  cachedEngine = { srcDoc, srcBytes: bytes, srcPdfBytes, meta: { pageCount, pageSizesMM } };
  return { pageCount, pageSizesMM };
}

export interface BatchExportSettings {
  job: JobSettings;
  barcode: BarcodeSettings;
  placementsByPage: Record<number, Placement[]>;
  applyToAllPages: boolean;
  currentPage: number;
  digitsCount: number;
}

export interface BatchItem {
  name: string;
  values: string[];
}

function normalizeMultiUp(multiUp: Partial<MultiUpSettings> | undefined, fallback: MultiUpSettings): MultiUpSettings {
  return { ...fallback, ...(multiUp ?? {}) };
}

// Shape of the persisted project `settings` JSONB blob (all fields optional — older
// projects may omit any of them, so each access is defensive).
export interface ProjectSettingsBlob {
  job?: Partial<JobSettings> & { multiUp?: Partial<MultiUpSettings> };
  barcode?: Partial<BarcodeSettings>;
  placementsByPage?: Record<number, Placement[]>;
  applyToAllPages?: boolean;
  currentPage?: number;
  digitsCount?: number;
}

export function prepareBatchSettings(
  rawProjectSettings: unknown,
  fallbackJob: JobSettings,
  fallbackBarcode: BarcodeSettings,
  fallbackPlacementsByPage?: Record<number, Placement[]>
): BatchExportSettings {
  // The persisted column comes back as untyped JSON; narrow it once to the known blob shape.
  const projectSettings: ProjectSettingsBlob =
    rawProjectSettings && typeof rawProjectSettings === "object"
      ? (rawProjectSettings as ProjectSettingsBlob)
      : {};

  const effectiveJob: JobSettings = {
    ...fallbackJob,
    ...(projectSettings?.job ?? {}),
    multiUp: normalizeMultiUp(projectSettings?.job?.multiUp, fallbackJob.multiUp),
  };
  const effectiveBarcode: BarcodeSettings = {
    ...fallbackBarcode,
    ...(projectSettings?.barcode ?? {}),
  };
  const effectivePlacementsByPage: Record<number, Placement[]> =
    projectSettings?.placementsByPage ?? fallbackPlacementsByPage ?? {
      1: [{
        xMM: 10, yMM: 10,
        widthMM: effectiveBarcode.widthMM,
        heightMM: effectiveBarcode.heightMM,
        fontSize: effectiveBarcode.fontSize,
        id: crypto.randomUUID(),
        showText: true, textBgColor: "", textColor: "#000000",
        textPosition: "bottom" as const,
        bold: false, italic: false, underline: false, codeOnly: false,
      }],
    };

  return {
    job: effectiveJob,
    barcode: effectiveBarcode,
    placementsByPage: effectivePlacementsByPage,
    applyToAllPages: projectSettings?.applyToAllPages ?? true,
    currentPage: Math.max(1, Number(projectSettings?.currentPage ?? 1) || 1),
    digitsCount: Number(projectSettings?.digitsCount ?? 12) || 12,
  };
}

// Inlined helpers
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  } : { r: 0, g: 0, b: 0 };
};

const computeEan13Check = (val: string) => {
  const digits = (val.match(/\d/g) || []).join("");
  const body = digits.slice(0, 12).padStart(12, "0");
  let sum = 0;
  for (let j = 0; j < 12; j++) sum += Number(body[j]) * (j % 2 === 0 ? 1 : 3);
  return body + String((10 - (sum % 10)) % 10);
};

// FAST: Get barcode bar pattern (cached)
function getBarcodePattern(type: string, value: string): { bars: boolean[]; width: number } {
  const key = `${type}:${value}`;
  if (barcodePatternCache.has(key)) return barcodePatternCache.get(key)!;
  
  const canvas = document.createElement("canvas");
  const formatMap: Record<string, string> = {
    code128: "CODE128", ean13: "EAN13", ean8: "EAN8",
    upca: "UPC", code39: "CODE39", itf: "ITF", codabar: "codabar",
  };
  
  JsBarcode(canvas, value, {
    displayValue: false, margin: 0, width: 1, height: 50,
    background: "#ffffff", lineColor: "#000000",
    format: formatMap[type] || "CODE128",
  });
  
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, 1);
  const bars: boolean[] = [];
  for (let x = 0; x < canvas.width; x++) {
    const idx = x * 4;
    bars.push(imageData.data[idx] < 128); // true = black bar
  }
  
  const result = { bars, width: canvas.width };
  barcodePatternCache.set(key, result);
  return result;
}

// FAST: Get QR pattern (cached)
async function getQRPattern(value: string): Promise<boolean[][]> {
  if (qrPatternCache.has(value)) return qrPatternCache.get(value)!;
  
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, value, { margin: 0, scale: 1, errorCorrectionLevel: "M" });
  
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pattern: boolean[][] = [];
  
  for (let y = 0; y < canvas.height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      row.push(imageData.data[idx] < 128);
    }
    pattern.push(row);
  }
  
  qrPatternCache.set(value, pattern);
  return pattern;
}

// ULTRA-FAST: Draw barcode directly as vector rectangles
function drawBarcodeVector(
  page: PDFPage,
  type: string,
  value: string,
  xPt: number,
  yPt: number,
  widthPt: number,
  heightPt: number,
  rotation: number,
  qrPattern?: boolean[][]
) {
  if (type === "qr" && qrPattern) {
    const moduleSize = widthPt / qrPattern.length;
    for (let row = 0; row < qrPattern.length; row++) {
      for (let col = 0; col < qrPattern[row].length; col++) {
        if (qrPattern[row][col]) {
          page.drawRectangle({
            x: xPt + col * moduleSize,
            y: yPt + heightPt - (row + 1) * moduleSize,
            width: moduleSize + 0.5, // slight overlap to prevent gaps
            height: moduleSize + 0.5,
            color: rgb(0, 0, 0),
            rotate: degrees(-rotation),
          });
        }
      }
    }
  } else {
    const pattern = getBarcodePattern(type, value);
    const barWidth = widthPt / pattern.width;
    
    // Optimize: merge consecutive black bars into single rectangles
    let startX = -1;
    for (let i = 0; i <= pattern.bars.length; i++) {
      const isBlack = i < pattern.bars.length && pattern.bars[i];
      if (isBlack && startX === -1) {
        startX = i;
      } else if (!isBlack && startX !== -1) {
        page.drawRectangle({
          x: xPt + startX * barWidth,
          y: yPt,
          width: (i - startX) * barWidth,
          height: heightPt,
          color: rgb(0, 0, 0),
          rotate: degrees(-rotation),
        });
        startX = -1;
      }
    }
  }
}

// ULTRA-FAST single batch export - minimal overhead, maximum reuse
export async function exportSingleBatch(
  designBytes: ArrayBuffer,
  batch: BatchItem,
  settings: BatchExportSettings
): Promise<Uint8Array> {
  // Use cached engine or create new one
  if (!cachedEngine || cachedEngine.srcBytes !== designBytes) {
    await preloadDesign(designBytes);
  }
  const engine = cachedEngine!;
  const { job, barcode, placementsByPage, applyToAllPages, currentPage } = settings;
  const count = batch.values.length;
  const multiUp = job.multiUp;
  const targetPageMM = job.pageSizeMM;
  
  // Pre-compute placements
  const placementsForExport: Record<number, Placement[]> = applyToAllPages
    ? { 1: placementsByPage[1] ?? placementsByPage[currentPage] ?? [] }
    : placementsByPage;

  const selectedPages = applyToAllPages
    ? new Array(count).fill(currentPage)
    : Object.keys(placementsForExport)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);

  // Fast barcode value mapping
  const bodyLen = barcode.type === "ean13" ? 12 : settings.digitsCount;
  const isEan13 = barcode.type === "ean13";
  const pageBarcodeValues = batch.values.map((num) => 
    isEan13 ? num.replace(/\D/g, "").slice(0, bodyLen).padStart(bodyLen, "0") : num
  );

  const sourcePageForExport = selectedPages[0] ?? currentPage;
  const sourcePageSizeMM = engine.meta.pageSizesMM[sourcePageForExport - 1] || { width: 100, height: 100 };

  // Create output PDF
  const out = await PDFDocument.create();
  
  // Embed source PDF once
  const srcPageCount = engine.srcDoc.getPageCount();
  const indices = selectedPages.map((p) => ((p - 1) % srcPageCount));
  const unique = Array.from(new Set(indices));
  // Use pre-serialized bytes instead of calling .save() every time
  const embeddedUnique = await out.embedPdf(engine.srcPdfBytes, unique);
  const embeddedMap = new Map<number, typeof embeddedUnique[number]>();
  unique.forEach((idx, i) => embeddedMap.set(idx, embeddedUnique[i]));

  // Embed fonts once
  const fontFamily = barcode.fontFamily;
  const getFontName = (bold: boolean, italic: boolean) => {
    if (fontFamily === "TimesRoman") {
      if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
      if (bold) return StandardFonts.TimesRomanBold;
      if (italic) return StandardFonts.TimesRomanItalic;
      return StandardFonts.TimesRoman;
    }
    if (fontFamily === "Courier") {
      if (bold && italic) return StandardFonts.CourierBoldOblique;
      if (bold) return StandardFonts.CourierBold;
      if (italic) return StandardFonts.CourierOblique;
      return StandardFonts.Courier;
    }
    if (bold && italic) return StandardFonts.HelveticaBoldOblique;
    if (bold) return StandardFonts.HelveticaBold;
    if (italic) return StandardFonts.HelveticaOblique;
    return StandardFonts.Helvetica;
  };
  
  const fontNormal = await out.embedFont(getFontName(false, false));
  const fontBold = await out.embedFont(getFontName(true, false));
  const fontItalic = await out.embedFont(getFontName(false, true));
  const fontBoldItalic = await out.embedFont(getFontName(true, true));
  
  const pickFont = (p: Placement) => {
    const bold = p.bold ?? false;
    const italic = p.italic ?? false;
    if (bold && italic) return fontBoldItalic;
    if (bold) return fontBold;
    if (italic) return fontItalic;
    return fontNormal;
  };

  // Check if multi-up mode
  if (multiUp?.enabled) {
    const designWidthMM = multiUp.designWidthMM || 50;
    const designHeightMM = multiUp.designHeightMM || 30;
    const availableWidthMM = targetPageMM.width - multiUp.marginLeftMM - multiUp.marginRightMM;
    const availableHeightMM = targetPageMM.height - multiUp.marginTopMM - multiUp.marginBottomMM;
    const copiesPerRow = Math.max(1, Math.floor((availableWidthMM + multiUp.gapXMM) / (designWidthMM + multiUp.gapXMM)));
    const copiesPerCol = Math.max(1, Math.floor((availableHeightMM + multiUp.gapYMM) / (designHeightMM + multiUp.gapYMM)));
    const copiesPerPage = copiesPerRow * copiesPerCol;
    const usedWidthMM = copiesPerRow * designWidthMM + (copiesPerRow - 1) * multiUp.gapXMM;
    const usedHeightMM = copiesPerCol * designHeightMM + (copiesPerCol - 1) * multiUp.gapYMM;
    
    const alignH = multiUp.designAlignH || "center";
    const alignV = multiUp.designAlignV || "center";
    let offsetXMM = multiUp.marginLeftMM;
    if (alignH === "center") offsetXMM += (availableWidthMM - usedWidthMM) / 2;
    else if (alignH === "right") offsetXMM += availableWidthMM - usedWidthMM;
    let offsetYMM = multiUp.marginTopMM;
    if (alignV === "center") offsetYMM += (availableHeightMM - usedHeightMM) / 2;
    else if (alignV === "bottom") offsetYMM += availableHeightMM - usedHeightMM;

    const totalCopies = count;
    const totalPages = Math.ceil(totalCopies / copiesPerPage);
    const sourcePageIndex = indices[0] || 0;
    const embeddedSourcePage = embeddedMap.get(sourcePageIndex);
    const origWidthMM = sourcePageSizeMM.width;
    const origHeightMM = sourcePageSizeMM.height;
    const scaleX = designWidthMM / origWidthMM;
    const scaleY = designHeightMM / origHeightMM;
    const targetWpt = mmToPt(targetPageMM.width);
    const targetHpt = mmToPt(targetPageMM.height);

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const page = out.addPage([targetWpt, targetHpt]);
      
      // Background colors
      if (job.canvasColor) {
        const bg = hexToRgb(job.canvasColor);
        page.drawRectangle({ x: 0, y: 0, width: targetWpt, height: targetHpt, color: rgb(bg.r, bg.g, bg.b) });
      }
      if (multiUp.marginAreaColor) {
        const mc = hexToRgb(multiUp.marginAreaColor);
        page.drawRectangle({ x: 0, y: 0, width: targetWpt, height: targetHpt, color: rgb(mc.r, mc.g, mc.b) });
      }
      if (multiUp.gapColor) {
        const gc = hexToRgb(multiUp.gapColor);
        page.drawRectangle({
          x: mmToPt(multiUp.marginLeftMM), y: mmToPt(multiUp.marginBottomMM),
          width: mmToPt(availableWidthMM), height: mmToPt(availableHeightMM),
          color: rgb(gc.r, gc.g, gc.b)
        });
      }

      for (let cellIdx = 0; cellIdx < copiesPerPage; cellIdx++) {
        const copyIndex = pageIdx * copiesPerPage + cellIdx;
        if (copyIndex >= totalCopies) break;

        const row = Math.floor(cellIdx / copiesPerRow);
        const col = cellIdx % copiesPerRow;
        const cellXMM = offsetXMM + col * (designWidthMM + multiUp.gapXMM);
        const cellYMM = offsetYMM + row * (designHeightMM + multiUp.gapYMM);
        const cellXpt = mmToPt(cellXMM);
        const cellYpt = targetHpt - mmToPt(cellYMM) - mmToPt(designHeightMM);
        const cellWpt = mmToPt(designWidthMM);
        const cellHpt = mmToPt(designHeightMM);

        if (embeddedSourcePage) {
          page.drawPage(embeddedSourcePage, { x: cellXpt, y: cellYpt, width: cellWpt, height: cellHpt });
        }

        const effectiveValue = pageBarcodeValues[copyIndex] ?? barcode.value;
        const pagePlacements = applyToAllPages ? (placementsForExport[1] ?? []) : (placementsForExport[selectedPages[0]] ?? []);

        for (const placement of pagePlacements) {
          const barcodeXMM = placement.xMM * scaleX;
          const barcodeYMM = placement.yMM * scaleY;
          const barcodeWMM = (placement.widthMM || barcode.widthMM) * scaleX;
          const barcodeHMM = (placement.heightMM || barcode.heightMM) * scaleY;

          const bxPt = cellXpt + mmToPt(barcodeXMM);
          const byPt = cellYpt + cellHpt - mmToPt(barcodeYMM) - mmToPt(barcodeHMM);
          const bwPt = mmToPt(barcodeWMM);
          const bhPt = mmToPt(barcodeHMM);

          // Draw white background for barcode
          page.drawRectangle({
            x: bxPt, y: byPt, width: bwPt, height: bhPt,
            color: rgb(1, 1, 1),
            rotate: degrees(-barcode.rotation),
          });

          // VECTOR BARCODE - no PNG conversion!
          const qrPattern = barcode.type === "qr" ? await getQRPattern(effectiveValue) : undefined;
          drawBarcodeVector(page, barcode.type, effectiveValue, bxPt, byPt, bwPt, bhPt, barcode.rotation, qrPattern);

          // Text rendering
          const showText = placement.showText ?? barcode.showText ?? true;
          if (showText) {
            const fullTextValue = barcode.type === "ean13" ? computeEan13Check(effectiveValue) : effectiveValue;
            let displayText = fullTextValue;
            if (barcode.separator && barcode.separatorPositions?.length) {
              const chars = displayText.split("");
              const positions = [...barcode.separatorPositions].sort((a, b) => b - a);
              for (const pos of positions) {
                if (pos > 0 && pos < chars.length) chars.splice(pos, 0, barcode.separator);
              }
              displayText = chars.join("");
            }
            const text = displayText.split("").join(" ");
            const baseFontSize = placement.fontSize || barcode.fontSize;
            const fontSize = baseFontSize * scaleX;
            const spacingPt = mmToPt(barcode.textSpacingMM * scaleY);
            const fontToUse = pickFont(placement);
            const textWidth = fontToUse.widthOfTextAtSize(text, fontSize);
            const textColor = placement.textColor || "#000000";
            const textRgb = hexToRgb(textColor);
            const textPosition = placement.textPosition || "bottom";
            const isTop = textPosition === "top";
            const angleRad = (-barcode.rotation * Math.PI) / 180;
            const localTx = (bwPt - textWidth) / 2;
            const localTy = isTop ? bhPt + spacingPt + fontSize * 0.2 : -fontSize - spacingPt;
            const tx = bxPt + localTx * Math.cos(angleRad) - localTy * Math.sin(angleRad);
            const ty = byPt + localTx * Math.sin(angleRad) + localTy * Math.cos(angleRad);

            const textBgColor = placement.textBgColor;
            if (textBgColor) {
              const bgRgb = hexToRgb(textBgColor);
              const rectHeight = fontSize * 1.4;
              const localRectY = localTy - fontSize * 0.2;
              const rx = bxPt + 0 * Math.cos(angleRad) - localRectY * Math.sin(angleRad);
              const ry = byPt + 0 * Math.sin(angleRad) + localRectY * Math.cos(angleRad);
              page.drawRectangle({
                x: rx, y: ry, width: bwPt, height: rectHeight,
                color: rgb(bgRgb.r, bgRgb.g, bgRgb.b),
                rotate: degrees(-barcode.rotation),
              });
            }

            page.drawText(text, {
              x: tx, y: ty, size: fontSize, font: fontToUse,
              color: rgb(textRgb.r, textRgb.g, textRgb.b),
              rotate: degrees(-barcode.rotation),
            });

            if (placement.underline) {
              const thickness = Math.max(0.5, fontSize / 18);
              const localLineY = localTy - thickness;
              const sx = bxPt + localTx * Math.cos(angleRad) - localLineY * Math.sin(angleRad);
              const sy = byPt + localTx * Math.sin(angleRad) + localLineY * Math.cos(angleRad);
              const ex = bxPt + (localTx + textWidth) * Math.cos(angleRad) - localLineY * Math.sin(angleRad);
              const ey = byPt + (localTx + textWidth) * Math.sin(angleRad) + localLineY * Math.cos(angleRad);
              page.drawLine({
                start: { x: sx, y: sy }, end: { x: ex, y: ey },
                thickness, color: rgb(textRgb.r, textRgb.g, textRgb.b),
              });
            }
          }
        }
      }
    }
  } else {
    // Non-multi-up mode - single page per barcode value
    const targetWpt = mmToPt(targetPageMM.width);
    const targetHpt = mmToPt(targetPageMM.height);
    
    for (let i = 0; i < count; i++) {
      const srcIdx = indices[i % indices.length];
      const embedded = embeddedMap.get(srcIdx);
      const page = out.addPage([targetWpt, targetHpt]);
      
      if (job.canvasColor) {
        const bg = hexToRgb(job.canvasColor);
        page.drawRectangle({ x: 0, y: 0, width: targetWpt, height: targetHpt, color: rgb(bg.r, bg.g, bg.b) });
      }
      
      if (embedded) {
        const embeddedSize = embedded.scale(1);
        let drawW = embeddedSize.width;
        let drawH = embeddedSize.height;
        if (job.fitToPage) {
          const scale = Math.min(targetWpt / embeddedSize.width, targetHpt / embeddedSize.height);
          drawW = embeddedSize.width * scale;
          drawH = embeddedSize.height * scale;
        }
        const drawX = (targetWpt - drawW) / 2;
        const drawY = (targetHpt - drawH) / 2;
        page.drawPage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
      }
      
      const effectiveValue = pageBarcodeValues[i] ?? barcode.value;
      const pIdx = selectedPages[i % selectedPages.length];
      const pagePlacements = applyToAllPages ? (placementsForExport[1] ?? []) : (placementsForExport[pIdx] ?? []);
      
      for (const placement of pagePlacements) {
        const bxPt = mmToPt(placement.xMM);
        const byPt = targetHpt - mmToPt(placement.yMM) - mmToPt(placement.heightMM || barcode.heightMM);
        const bwPt = mmToPt(placement.widthMM || barcode.widthMM);
        const bhPt = mmToPt(placement.heightMM || barcode.heightMM);
        
        // Draw white background for barcode
        page.drawRectangle({
          x: bxPt, y: byPt, width: bwPt, height: bhPt,
          color: rgb(1, 1, 1),
          rotate: degrees(-barcode.rotation),
        });

        // VECTOR BARCODE - no PNG conversion!
        const qrPattern = barcode.type === "qr" ? await getQRPattern(effectiveValue) : undefined;
        drawBarcodeVector(page, barcode.type, effectiveValue, bxPt, byPt, bwPt, bhPt, barcode.rotation, qrPattern);
        
        const showText = placement.showText ?? barcode.showText ?? true;
        if (showText) {
          const fullTextValue = barcode.type === "ean13" ? computeEan13Check(effectiveValue) : effectiveValue;
          let displayText = fullTextValue;
          if (barcode.separator && barcode.separatorPositions?.length) {
            const chars = displayText.split("");
            const positions = [...barcode.separatorPositions].sort((a, b) => b - a);
            for (const pos of positions) {
              if (pos > 0 && pos < chars.length) chars.splice(pos, 0, barcode.separator);
            }
            displayText = chars.join("");
          }
          const text = displayText.split("").join(" ");
          const fontSize = placement.fontSize || barcode.fontSize;
          const spacingPt = mmToPt(barcode.textSpacingMM);
          const fontToUse = pickFont(placement);
          const textWidth = fontToUse.widthOfTextAtSize(text, fontSize);
          const textColor = placement.textColor || "#000000";
          const textRgb = hexToRgb(textColor);
          const textPosition = placement.textPosition || "bottom";
          const isTop = textPosition === "top";
          const angleRad = (-barcode.rotation * Math.PI) / 180;
          const localTx = (bwPt - textWidth) / 2;
          const localTy = isTop ? bhPt + spacingPt + fontSize * 0.2 : -fontSize - spacingPt;
          const tx = bxPt + localTx * Math.cos(angleRad) - localTy * Math.sin(angleRad);
          const ty = byPt + localTx * Math.sin(angleRad) + localTy * Math.cos(angleRad);

          page.drawText(text, {
            x: tx, y: ty, size: fontSize, font: fontToUse,
            color: rgb(textRgb.r, textRgb.g, textRgb.b),
            rotate: degrees(-barcode.rotation),
          });
        }
      }
    }
  }

  return out.save();
}

// Clear cache when done
export function clearBatchCache() {
  cachedEngine = null;
}
