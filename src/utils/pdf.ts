import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf";
// @ts-expect-error - Vite's ?url import suffix has no TypeScript declaration
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";
// Configure worker (legacy build is most bundler-friendly)
GlobalWorkerOptions.workerSrc = workerSrc;
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { mmToPt, ptToMm, mmToPx } from "@/utils/units";
import type { BarcodeSettings, JobSettings, Placement, MultiUpSettings, PageNumberSettings } from "@/store/useWorkspaceStore";

export interface LoadedPdfInfo {
  pageCount: number;
  pageSizesMM: { width: number; height: number }[];
}

// Robust loader that falls back to no-worker mode if needed
async function loadPdf(bytes: ArrayBuffer) {
  // Clone buffer to avoid detaching the original (used later for export)
  const data = bytes.slice(0);
  try {
    return await getDocument({ data }).promise;
  } catch (e1) {
    try {
      const data2 = bytes.slice(0);
      return await getDocument({ data: data2, useWorker: false }).promise;
    } catch (e2) {
      console.error("pdfjs getDocument failed", e1, e2);
      throw e2;
    }
  }
}



export async function loadPdfMeta(bytes: ArrayBuffer): Promise<LoadedPdfInfo> {
  const pdf = await loadPdf(bytes);
  const pageSizesMM = [] as { width: number; height: number }[];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    pageSizesMM.push({ width: ptToMm(viewport.width), height: ptToMm(viewport.height) });
  }
  return { pageCount: pdf.numPages, pageSizesMM };
}

export async function renderPagePreview(
  bytes: ArrayBuffer,
  pageIndex: number, // 1-indexed
  targetPageMM: { width: number; height: number },
  fitToPage: boolean,
  dpi = 150,
  designSizeMM?: { width: number; height: number } // optional custom design size when fitToPage is off
): Promise<HTMLCanvasElement> {
  const pdf = await loadPdf(bytes);
  const page = await pdf.getPage(pageIndex);
  const originalViewport = page.getViewport({ scale: 1 });
  const origWidthMM = ptToMm(originalViewport.width);
  const origHeightMM = ptToMm(originalViewport.height);

  // Canvas size equals target page size in px at given DPI
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = Math.round(mmToPx(targetPageMM.width, dpi));
  canvas.height = Math.round(mmToPx(targetPageMM.height, dpi));

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Compute scale for original design
  let renderWidthMM = origWidthMM;
  let renderHeightMM = origHeightMM;
  if (fitToPage) {
    const scale = Math.min(
      targetPageMM.width / origWidthMM,
      targetPageMM.height / origHeightMM
    );
    renderWidthMM = origWidthMM * scale;
    renderHeightMM = origHeightMM * scale;
  } else if (designSizeMM) {
    // Use custom design size when fitToPage is off
    renderWidthMM = designSizeMM.width;
    renderHeightMM = designSizeMM.height;
  }
  // Centering offsets in px
  const offsetX = Math.round((mmToPx(targetPageMM.width, dpi) - mmToPx(renderWidthMM, dpi)) / 2);
  const offsetY = Math.round((mmToPx(targetPageMM.height, dpi) - mmToPx(renderHeightMM, dpi)) / 2);

  const scaleForPdfJs = mmToPx(renderWidthMM, dpi) / originalViewport.width;
  const viewport = page.getViewport({ scale: scaleForPdfJs });

  const renderCanvas = document.createElement("canvas");
  renderCanvas.width = Math.round(viewport.width);
  renderCanvas.height = Math.round(viewport.height);
  const renderCtx = renderCanvas.getContext("2d")!;

  await page.render({ canvasContext: renderCtx, viewport }).promise;

  ctx.drawImage(renderCanvas, offsetX, offsetY);

  return canvas;
}

// Multi-up needs a preview that matches export: the source PDF page stretched to the
// target size (non-uniform scaling if aspect ratios differ).
export async function renderPagePreviewStretched(
  bytes: ArrayBuffer,
  pageIndex: number, // 1-indexed
  targetMM: { width: number; height: number },
  dpi = 150
): Promise<HTMLCanvasElement> {
  const pdf = await loadPdf(bytes);
  const page = await pdf.getPage(pageIndex);
  const originalViewport = page.getViewport({ scale: 1 });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const targetWpx = Math.round(mmToPx(targetMM.width, dpi));
  const targetHpx = Math.round(mmToPx(targetMM.height, dpi));
  canvas.width = Math.max(1, targetWpx);
  canvas.height = Math.max(1, targetHpx);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Render with a uniform scale (width-based) then stretch into the target frame.
  const scaleForPdfJs = targetWpx / originalViewport.width;
  const viewport = page.getViewport({ scale: scaleForPdfJs });

  const renderCanvas = document.createElement("canvas");
  renderCanvas.width = Math.max(1, Math.round(viewport.width));
  renderCanvas.height = Math.max(1, Math.round(viewport.height));
  const renderCtx = renderCanvas.getContext("2d")!;

  await page.render({ canvasContext: renderCtx, viewport }).promise;

  ctx.drawImage(renderCanvas, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function generateBarcodeCanvas(settings: BarcodeSettings, target?: { widthPx: number; heightPx: number }): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  
  if (settings.type === "qr") {
    // For QR codes, generate at high resolution for crisp rendering
    const qrScale = target ? Math.max(8, Math.ceil(Math.max(target.widthPx, target.heightPx) / 50)) : 8;
    await QRCode.toCanvas(canvas, settings.value, {
      margin: 0,
      errorCorrectionLevel: "M",
      scale: qrScale,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } else {
    // For linear barcodes, calculate bar width to render at target resolution directly
    // This avoids scaling artifacts by generating at the exact target size
    const targetWidth = target?.widthPx || 200;
    const targetHeight = target?.heightPx || 80;
    
    // JsBarcode's width option is the width of each bar in px
    // We want to generate at a high enough resolution, then scale if needed
    // Generate at 2x-4x for crisp preview, especially for larger barcodes
    const scaleFactor = Math.max(2, Math.min(4, Math.ceil(targetWidth / 100)));
    
    // Map our barcode types to JsBarcode format strings
    const formatMap: Record<string, string> = {
      code128: "CODE128",
      ean13: "EAN13",
      ean8: "EAN8",
      upca: "UPC",
      code39: "CODE39",
      itf: "ITF",
      codabar: "codabar",
    };
    
    JsBarcode(canvas, settings.value, {
      displayValue: false,
      margin: 0,
      width: scaleFactor, // thicker bars for higher resolution
      height: Math.max(100, targetHeight * scaleFactor / 2),
      background: "#ffffff",
      lineColor: "#000000",
      format: formatMap[settings.type] || "CODE128",
    });
  }

  // If target size is provided, scale barcode to exactly match the frame
  if (target) {
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(1, Math.round(target.widthPx));
    scaled.height = Math.max(1, Math.round(target.heightPx));
    const sctx = scaled.getContext("2d")!;
    // CRITICAL: Disable image smoothing for barcodes - they need crisp hard edges
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, scaled.width, scaled.height);
    sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    return scaled;
  }

  return canvas;
}


export interface ExportParams {
  originalBytes: ArrayBuffer;
  pageCount: number;
  targetPageMM: { width: number; height: number };
  fitToPage: boolean;
  designSizeMM?: { width: number; height: number }; // custom design size when fitToPage is off
  placements: Record<number, Placement[]>; // 1-indexed pages that have placements (array per page)
  applyToAll: boolean;
  barcode: BarcodeSettings;
  selectedPages?: number[]; // 1-indexed pages to export; defaults to all
  pageBarcodeValues?: string[]; // optional per-page barcode values (length must match selectedPages)
  multiUp?: MultiUpSettings; // optional multi-up/imposition settings
  // Helps keep multi-up scaling consistent with the preview (pdf.js measured sizes).
  sourcePageSizeMM?: { width: number; height: number };
  canvasColor?: string; // Background color for the canvas
  pageNumber?: PageNumberSettings; // optional page number settings for invoice mode
}

export async function exportMergedPdf(params: ExportParams): Promise<Uint8Array> {
  const { originalBytes, pageCount, targetPageMM, fitToPage, placements, applyToAll, barcode, multiUp } = params;

  // Prepare new PDF
  const out = await PDFDocument.create();
  const src = await PDFDocument.load(originalBytes);

  // Embed standard fonts for text (include style variants for bold/italic)
  const family = barcode.fontFamily;
  const fontForVariant = (variant: "normal" | "bold" | "italic" | "boldItalic") => {
    if (family === "TimesRoman") {
      if (variant === "bold") return StandardFonts.TimesRomanBold;
      if (variant === "italic") return StandardFonts.TimesRomanItalic;
      if (variant === "boldItalic") return StandardFonts.TimesRomanBoldItalic;
      return StandardFonts.TimesRoman;
    }
    if (family === "Courier") {
      if (variant === "bold") return StandardFonts.CourierBold;
      if (variant === "italic") return StandardFonts.CourierOblique;
      if (variant === "boldItalic") return StandardFonts.CourierBoldOblique;
      return StandardFonts.Courier;
    }
    // Helvetica
    if (variant === "bold") return StandardFonts.HelveticaBold;
    if (variant === "italic") return StandardFonts.HelveticaOblique;
    if (variant === "boldItalic") return StandardFonts.HelveticaBoldOblique;
    return StandardFonts.Helvetica;
  };

  const fontNormal = await out.embedFont(fontForVariant("normal"));
  const fontBold = await out.embedFont(fontForVariant("bold"));
  const fontItalic = await out.embedFont(fontForVariant("italic"));
  const fontBoldItalic = await out.embedFont(fontForVariant("boldItalic"));

  const pickFont = (placement: Placement) => {
    const bold = placement.bold ?? false;
    const italic = placement.italic ?? false;
    if (bold && italic) return fontBoldItalic;
    if (bold) return fontBold;
    if (italic) return fontItalic;
    return fontNormal;
  };

  // Rotate a local point (lx, ly) around an anchor (ax, ay) by `rad`.
  // This is used to keep barcode image + text perfectly grouped during rotation.
  const rotatePoint = (ax: number, ay: number, lx: number, ly: number, rad: number) => ({
    x: ax + lx * Math.cos(rad) - ly * Math.sin(rad),
    y: ay + lx * Math.sin(rad) + ly * Math.cos(rad),
  });

  const exportedPages = (params.selectedPages && params.selectedPages.length > 0)
    ? params.selectedPages
    : Array.from({ length: pageCount }, (_, i) => i + 1);

  // Map exported pages to valid source page indices (wrap around if source has fewer pages)
  const srcPageCount = src.getPageCount();
  const indices = exportedPages.map((p) => ((p - 1) % srcPageCount));
  const unique = Array.from(new Set(indices));
  const embeddedUnique = await out.embedPdf(await src.save(), unique);
  const embeddedMap = new Map<number, typeof embeddedUnique[number]>();
  unique.forEach((idx, i) => embeddedMap.set(idx, embeddedUnique[i]));

  // Check if multi-up mode is enabled
  if (multiUp?.enabled) {
    // Use design dimensions from multiUp settings
    const designWidthMM = multiUp.designWidthMM || 50;
    const designHeightMM = multiUp.designHeightMM || 30;

    // Calculate available area
    const availableWidthMM = targetPageMM.width - multiUp.marginLeftMM - multiUp.marginRightMM;
    const availableHeightMM = targetPageMM.height - multiUp.marginTopMM - multiUp.marginBottomMM;

    // Calculate how many copies fit per row/column
    const copiesPerRow = Math.max(1, Math.floor((availableWidthMM + multiUp.gapXMM) / (designWidthMM + multiUp.gapXMM)));
    const copiesPerCol = Math.max(1, Math.floor((availableHeightMM + multiUp.gapYMM) / (designHeightMM + multiUp.gapYMM)));
    const copiesPerPage = copiesPerRow * copiesPerCol;

    // Calculate the actual used width/height
    const usedWidthMM = copiesPerRow * designWidthMM + (copiesPerRow - 1) * multiUp.gapXMM;
    const usedHeightMM = copiesPerCol * designHeightMM + (copiesPerCol - 1) * multiUp.gapYMM;
    
    // Calculate offset based on alignment settings
    const alignH = multiUp.designAlignH || "center";
    const alignV = multiUp.designAlignV || "center";
    
    let offsetXMM = multiUp.marginLeftMM;
    if (alignH === "center") {
      offsetXMM += (availableWidthMM - usedWidthMM) / 2;
    } else if (alignH === "right") {
      offsetXMM += availableWidthMM - usedWidthMM;
    }
    // alignH === "left" means offsetXMM stays at marginLeftMM
    
    let offsetYMM = multiUp.marginTopMM;
    if (alignV === "center") {
      offsetYMM += (availableHeightMM - usedHeightMM) / 2;
    } else if (alignV === "bottom") {
      offsetYMM += availableHeightMM - usedHeightMM;
    }
    // alignV === "top" means offsetYMM stays at marginTopMM

    // Total copies needed = number of pages to export (each page has its own barcode value)
    const totalCopies = exportedPages.length;
    const totalPages = Math.ceil(totalCopies / copiesPerPage);
    
    // Get the source page to embed (use first page of source PDF)
    const sourcePageIndex = indices[0] || 0;
    const embeddedSourcePage = embeddedMap.get(sourcePageIndex);
    
    // Get the original page dimensions (prefer pdf.js-measured sizes passed from the UI)
    const origPageSize = embeddedSourcePage
      ? embeddedSourcePage.scale(1)
      : { width: mmToPt(designWidthMM), height: mmToPt(designHeightMM) };

    const origWidthMM = params.sourcePageSizeMM?.width ?? ptToMm(origPageSize.width);
    const origHeightMM = params.sourcePageSizeMM?.height ?? ptToMm(origPageSize.height);

    // Scale factors from original design to cell size
    const scaleX = designWidthMM / origWidthMM;
    const scaleY = designHeightMM / origHeightMM;

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const targetWpt = mmToPt(targetPageMM.width);
      const targetHpt = mmToPt(targetPageMM.height);
      const page = out.addPage([targetWpt, targetHpt]);

      // Helper to convert hex color to rgb values (0-1 range)
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16) / 255,
          g: parseInt(result[2], 16) / 255,
          b: parseInt(result[3], 16) / 255,
        } : { r: 1, g: 1, b: 1 };
      };

      // Draw canvas background color first
      if (params.canvasColor) {
        const bgColor = hexToRgb(params.canvasColor);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: targetWpt,
          height: targetHpt,
          color: rgb(bgColor.r, bgColor.g, bgColor.b),
        });
      }

      // Draw margin area color (entire page except will be covered by gap/design areas)
      if (multiUp.marginAreaColor) {
        const marginColor = hexToRgb(multiUp.marginAreaColor);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: targetWpt,
          height: targetHpt,
          color: rgb(marginColor.r, marginColor.g, marginColor.b),
        });
      }

      // Draw gap color in the content area (inside margins)
      if (multiUp.gapColor) {
        const gapColor = hexToRgb(multiUp.gapColor);
        page.drawRectangle({
          x: mmToPt(multiUp.marginLeftMM),
          y: mmToPt(multiUp.marginBottomMM),
          width: mmToPt(availableWidthMM),
          height: mmToPt(availableHeightMM),
          color: rgb(gapColor.r, gapColor.g, gapColor.b),
        });
      }

      // Draw grid of copies on this page (centered)
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

        // Draw the source PDF page in this cell (scaled to fit)
        if (embeddedSourcePage) {
          page.drawPage(embeddedSourcePage, {
            x: cellXpt,
            y: cellYpt,
            width: cellWpt,
            height: cellHpt,
          });
        }

        // Get the barcode value for this copy
        // Use nullish coalescing to preserve empty strings from CSV
        const effectiveValue = (params.pageBarcodeValues && params.pageBarcodeValues[copyIndex] !== undefined) 
          ? params.pageBarcodeValues[copyIndex] 
          : barcode.value;

        // Get placements for barcodes
        const pagePlacements = applyToAll ? (placements[1] ?? []) : (placements[exportedPages[0]] ?? []);
        
        // Draw each barcode placement within this cell
        for (const placement of pagePlacements) {
          const placementBarcode: BarcodeSettings = { 
            ...barcode, 
            value: effectiveValue, 
            widthMM: placement.widthMM || barcode.widthMM, 
            heightMM: placement.heightMM || barcode.heightMM 
          };

          // Calculate barcode position and size scaled to cell
          // Placement coordinates are in original design mm, scale to cell mm
          const barcodeXMM = placement.xMM * scaleX;
          const barcodeYMM = placement.yMM * scaleY;
          const barcodeWMM = (placement.widthMM || barcode.widthMM) * scaleX;
          const barcodeHMM = (placement.heightMM || barcode.heightMM) * scaleY;

          // Draw barcode (render at target pixel size for crisp/accurate scaling)
          const bcCanvas = await generateBarcodeCanvas(placementBarcode, {
            widthPx: mmToPx(barcodeWMM, 300),
            heightPx: mmToPx(barcodeHMM, 300),
          });
          const bcBlob: Blob = await new Promise((res) => bcCanvas.toBlob((b) => res(b!), "image/png"));
          const bcBytes = new Uint8Array(await bcBlob.arrayBuffer());
          const embeddedBc = await out.embedPng(bcBytes);

          const bxPt = cellXpt + mmToPt(barcodeXMM);
          const byPt = cellYpt + cellHpt - mmToPt(barcodeYMM) - mmToPt(barcodeHMM);
          const bwPt = mmToPt(barcodeWMM);
          const bhPt = mmToPt(barcodeHMM);

          page.drawImage(embeddedBc, {
            x: bxPt,
            y: byPt,
            width: bwPt,
            height: bhPt,
            // CSS rotation is clockwise; PDF rotation is counter-clockwise.
            rotate: degrees(-barcode.rotation),
          });

          // Draw text if enabled (per-placement setting)
          const showPlacementText = placement.showText ?? barcode.showText ?? true;
          if (showPlacementText) {
            const computeEan13 = (val: string) => {
              const digits = (val.match(/\d/g) || []).join("");
              const body = digits.slice(0, 12).padStart(12, "0");
              let sum = 0;
              for (let j = 0; j < 12; j++) {
                const n = Number(body[j]);
                sum += (j % 2 === 0) ? n : n * 3;
              }
              const check = (10 - (sum % 10)) % 10;
              return body + String(check);
            };

            const fullTextValue = barcode.type === "ean13" ? computeEan13(effectiveValue) : effectiveValue;
            
            // Apply separator formatting if configured
            let displayText = fullTextValue;
            if (barcode.separator && barcode.separatorPositions && barcode.separatorPositions.length > 0) {
              const chars = displayText.split("");
              const positions = [...barcode.separatorPositions].sort((a, b) => b - a); // Sort descending to insert from end
              for (const pos of positions) {
                if (pos > 0 && pos < chars.length) {
                  chars.splice(pos, 0, barcode.separator);
                }
              }
              displayText = chars.join("");
            }
            
            const text = displayText.split("").join(" ");
            const baseFontSize = placement.fontSize || barcode.fontSize;
            const fontSize = baseFontSize * scaleX;
            const spacingPt = mmToPt(barcode.textSpacingMM * scaleY);
            const fontToUse = pickFont(placement);
            const textWidth = fontToUse.widthOfTextAtSize(text, fontSize);

            // Get text color (default to black)
            const textColor = placement.textColor || "#000000";
            const textRgb = hexToRgb(textColor);

            // Get text position (default to bottom)
            const textPosition = placement.textPosition || "bottom";
            const isTop = textPosition === "top";

            // Keep text/underline/background in the same rotated group as the barcode.
            const angleRad = (-barcode.rotation * Math.PI) / 180;
            const localTx = (bwPt - textWidth) / 2;
            const localTy = isTop
              ? bhPt + spacingPt + fontSize * 0.2 // above the barcode
              : -fontSize - spacingPt;            // below the barcode

            const { x: tx, y: tyFinal } = rotatePoint(bxPt, byPt, localTx, localTy, angleRad);

            // Draw text background if color is set (after calculating final position)
            const textBgColor = placement.textBgColor;
            if (textBgColor) {
              const bgRgb = hexToRgb(textBgColor);
              const rectHeight = fontSize * 1.4;
              const localRectY = localTy - fontSize * 0.2;
              const rect = rotatePoint(bxPt, byPt, 0, localRectY, angleRad);
              page.drawRectangle({
                x: rect.x,
                y: rect.y,
                width: bwPt,
                height: rectHeight,
                color: rgb(bgRgb.r, bgRgb.g, bgRgb.b),
                rotate: degrees(-barcode.rotation),
              });
            }

            page.drawText(text, {
              x: tx,
              y: tyFinal,
              size: fontSize,
              font: fontToUse,
              color: rgb(textRgb.r, textRgb.g, textRgb.b),
              rotate: degrees(-barcode.rotation),
            });

            if (placement.underline) {
              const thickness = Math.max(0.5, fontSize / 18);
              const localLineY = localTy - thickness;
              const s = rotatePoint(bxPt, byPt, localTx, localLineY, angleRad);
              const e = rotatePoint(bxPt, byPt, localTx + textWidth, localLineY, angleRad);
              page.drawLine({
                start: { x: s.x, y: s.y },
                end: { x: e.x, y: e.y },
                thickness,
                color: rgb(textRgb.r, textRgb.g, textRgb.b),
              });
            }
          }
        }
      }

      // Draw page number if invoice mode is enabled (multi-up mode)
      if (params.pageNumber?.enabled) {
        const pn = params.pageNumber;
        const pageNum = pn.startNumber + pageIdx;
        const digits = pn.digits || 1;
        const paddedNum = String(pageNum).padStart(digits, '0');
        const pageText = `${pn.prefix || ""}${paddedNum}${pn.suffix || ""}`;
        
        // Pick font based on bold/italic settings
        const pnFontName = pn.fontFamily === "TimesRoman" 
          ? (pn.bold && pn.italic ? StandardFonts.TimesRomanBoldItalic : pn.bold ? StandardFonts.TimesRomanBold : pn.italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman)
          : pn.fontFamily === "Courier"
            ? (pn.bold && pn.italic ? StandardFonts.CourierBoldOblique : pn.bold ? StandardFonts.CourierBold : pn.italic ? StandardFonts.CourierOblique : StandardFonts.Courier)
            : (pn.bold && pn.italic ? StandardFonts.HelveticaBoldOblique : pn.bold ? StandardFonts.HelveticaBold : pn.italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica);
        
        const pnFont = await out.embedFont(pnFontName);
        const pnColor = hexToRgb(pn.color || "#000000");
        
        // Calculate text width for alignment
        const textWidth = pnFont.widthOfTextAtSize(pageText, pn.fontSize);
        const baseX = mmToPt(pn.xMM);
        
        // Apply alignment
        let pnX = baseX;
        if (pn.alignment === "center") {
          pnX = baseX - textWidth / 2;
        } else if (pn.alignment === "right") {
          pnX = baseX - textWidth;
        }
        
        const pnY = targetHpt - mmToPt(pn.yMM) - pn.fontSize;
        
        page.drawText(pageText, {
          x: pnX,
          y: pnY,
          size: pn.fontSize,
          font: pnFont,
          color: rgb(pnColor.r, pnColor.g, pnColor.b),
        });
      }
    }

    return await out.save();
  }

  // Normal mode (non-multi-up)
  // Helper to convert hex color to rgb values (0-1 range)
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
    } : { r: 1, g: 1, b: 1 };
  };

  for (let i = 0; i < exportedPages.length; i++) {
    const targetWpt = mmToPt(targetPageMM.width);
    const targetHpt = mmToPt(targetPageMM.height);
    const page = out.addPage([targetWpt, targetHpt]);

    // Draw canvas background color first
    if (params.canvasColor) {
      const bgColor = hexToRgb(params.canvasColor);
      page.drawRectangle({
        x: 0,
        y: 0,
        width: targetWpt,
        height: targetHpt,
        color: rgb(bgColor.r, bgColor.g, bgColor.b),
      });
    }

    const origPage = embeddedMap.get(indices[i])!;
    const origSize = origPage.scale(1);
    const origWpt = origSize.width;
    const origHpt = origSize.height;

    let drawW = origWpt;
    let drawH = origHpt;
    if (fitToPage) {
      const scale = Math.min(targetWpt / origWpt, targetHpt / origHpt);
      drawW = origWpt * scale;
      drawH = origHpt * scale;
    } else if (params.designSizeMM) {
      // Use custom design size when fitToPage is off
      drawW = mmToPt(params.designSizeMM.width);
      drawH = mmToPt(params.designSizeMM.height);
    }
    const offsetX = (targetWpt - drawW) / 2;
    const offsetY = (targetHpt - drawH) / 2;

    page.drawPage(origPage, { x: offsetX, y: offsetY, width: drawW, height: drawH });

    const pageNo = exportedPages[i];
    const pagePlacements = applyToAll ? (placements[1] ?? placements[pageNo] ?? []) : (placements[pageNo] ?? []);
    if (pagePlacements.length === 0) continue;

    // Draw all placements on this page
    for (const placement of pagePlacements) {
      const bw = mmToPt(placement.widthMM || barcode.widthMM);
      const bh = mmToPt(placement.heightMM || barcode.heightMM);
      // Add design offset when fitToPage is off (design is centered on page)
      const x = mmToPt(placement.xMM) + offsetX;
      const y = targetHpt - mmToPt(placement.yMM) - bh - offsetY;

      // Determine barcode value for this page
      // Use nullish coalescing to preserve empty strings from CSV
      const effectiveValue = (params.pageBarcodeValues && params.pageBarcodeValues[i] !== undefined) ? params.pageBarcodeValues[i] : barcode.value;
      const pageBarcode: BarcodeSettings = { ...barcode, value: effectiveValue, widthMM: placement.widthMM || barcode.widthMM, heightMM: placement.heightMM || barcode.heightMM };

      // Embed barcode image for this placement (render at target pixel size for crisp/accurate scaling)
      const bcCanvas = await generateBarcodeCanvas(pageBarcode, {
        widthPx: mmToPx(placement.widthMM || barcode.widthMM, 300),
        heightPx: mmToPx(placement.heightMM || barcode.heightMM, 300),
      });
      const bcBlob: Blob = await new Promise((res) => bcCanvas.toBlob((b) => res(b!), "image/png"));
      const bcBytes = new Uint8Array(await bcBlob.arrayBuffer());
      const embeddedBc = await out.embedPng(bcBytes);

      // Only draw barcode image if not in "code only" mode (per-placement or global)
      const isCodeOnly = placement.codeOnly ?? barcode.codeOnly ?? false;
      if (!isCodeOnly) {
        page.drawImage(embeddedBc, {
          x,
          y,
          width: bw,
          height: bh,
          // CSS rotation is clockwise; PDF rotation is counter-clockwise.
          rotate: degrees(-barcode.rotation),
        });
      }

      // Draw text if enabled (per-placement setting)
      const showPlacementText = placement.showText ?? barcode.showText ?? true;
      if (showPlacementText) {
        // For EAN-13, ensure proper check digit in displayed text
        const computeEan13 = (val: string) => {
          const digits = (val.match(/\d/g) || []).join("");
          const body = digits.slice(0, 12).padStart(12, "0");
          let sum = 0;
          for (let j = 0; j < 12; j++) {
            const n = Number(body[j]);
            sum += (j % 2 === 0) ? n : n * 3; // positions 1,3,5... are even-weighted in zero-indexed loop
          }
          const check = (10 - (sum % 10)) % 10;
          return body + String(check);
        };

        const fullTextValue = barcode.type === "ean13" ? computeEan13(effectiveValue) : effectiveValue;
        
        // Apply separator formatting if configured
        let displayText = fullTextValue;
        if (barcode.separator && barcode.separatorPositions && barcode.separatorPositions.length > 0) {
          const chars = displayText.split("");
          const positions = [...barcode.separatorPositions].sort((a, b) => b - a); // Sort descending to insert from end
          for (const pos of positions) {
            if (pos > 0 && pos < chars.length) {
              chars.splice(pos, 0, barcode.separator);
            }
          }
          displayText = chars.join("");
        }
        
        const text = displayText.split("").join(" ");
        const fontSize = placement.fontSize || barcode.fontSize;
        const spacingPt = mmToPt(barcode.textSpacingMM);
        const fontToUse = pickFont(placement);
        const textWidth = fontToUse.widthOfTextAtSize(text, fontSize);

        // Get text color (default to black)
        const textColor = placement.textColor || "#000000";
        const textRgb = hexToRgb(textColor);

        // Get text position (default to bottom)
        const textPosition = placement.textPosition || "bottom";
        const isTop = textPosition === "top";

        // Keep text/underline/background in the same rotated group as the barcode.
        const angleRad = (-barcode.rotation * Math.PI) / 180;
        const localTx = (bw - textWidth) / 2;
        const localTy = isTop
          ? bh + spacingPt + fontSize * 0.2 // above the barcode
          : -fontSize - spacingPt;          // below the barcode

        const { x: tx, y: tyFinal } = rotatePoint(x, y, localTx, localTy, angleRad);

        // Draw text background if color is set (after calculating final position)
        const textBgColor = placement.textBgColor;
        if (textBgColor) {
          const bgRgb = hexToRgb(textBgColor);
          const rectHeight = fontSize * 1.4;
          const localRectY = localTy - fontSize * 0.2;
          const rect = rotatePoint(x, y, 0, localRectY, angleRad);
          page.drawRectangle({
            x: rect.x,
            y: rect.y,
            width: bw,
            height: rectHeight,
            color: rgb(bgRgb.r, bgRgb.g, bgRgb.b),
            rotate: degrees(-barcode.rotation),
          });
        }

        page.drawText(text, {
          x: tx,
          y: tyFinal,
          size: fontSize,
          font: fontToUse,
          color: rgb(textRgb.r, textRgb.g, textRgb.b),
          rotate: degrees(-barcode.rotation),
        });

        if (placement.underline) {
          const thickness = Math.max(0.5, fontSize / 18);
          const localLineY = localTy - thickness;
          const s = rotatePoint(x, y, localTx, localLineY, angleRad);
          const e = rotatePoint(x, y, localTx + textWidth, localLineY, angleRad);
          page.drawLine({
            start: { x: s.x, y: s.y },
            end: { x: e.x, y: e.y },
            thickness,
            color: rgb(textRgb.r, textRgb.g, textRgb.b),
          });
        }
      }
    }

    // Draw page number if invoice mode is enabled
    if (params.pageNumber?.enabled) {
      const pn = params.pageNumber;
      const pageNum = pn.startNumber + i;
      const digits = pn.digits || 1;
      const paddedNum = String(pageNum).padStart(digits, '0');
      const pageText = `${pn.prefix || ""}${paddedNum}${pn.suffix || ""}`;
      
      // Pick font based on bold/italic settings
      const pnFontName = pn.fontFamily === "TimesRoman" 
        ? (pn.bold && pn.italic ? StandardFonts.TimesRomanBoldItalic : pn.bold ? StandardFonts.TimesRomanBold : pn.italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman)
        : pn.fontFamily === "Courier"
          ? (pn.bold && pn.italic ? StandardFonts.CourierBoldOblique : pn.bold ? StandardFonts.CourierBold : pn.italic ? StandardFonts.CourierOblique : StandardFonts.Courier)
          : (pn.bold && pn.italic ? StandardFonts.HelveticaBoldOblique : pn.bold ? StandardFonts.HelveticaBold : pn.italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica);
      
      const pnFont = await out.embedFont(pnFontName);
      const pnColor = hexToRgb(pn.color || "#000000");
      
      // Calculate text width for alignment
      const textWidth = pnFont.widthOfTextAtSize(pageText, pn.fontSize);
      const baseX = mmToPt(pn.xMM) + offsetX; // Add design offset
      
      // Apply alignment
      let pnX = baseX;
      if (pn.alignment === "center") {
        pnX = baseX - textWidth / 2;
      } else if (pn.alignment === "right") {
        pnX = baseX - textWidth;
      }
      
      const pnY = targetHpt - mmToPt(pn.yMM) - pn.fontSize - offsetY; // Add design offset
      
      page.drawText(pageText, {
        x: pnX,
        y: pnY,
        size: pn.fontSize,
        font: pnFont,
        color: rgb(pnColor.r, pnColor.g, pnColor.b),
      });
    }
  }

  return await out.save();
}
