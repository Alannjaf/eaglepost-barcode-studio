import React from "react";
import { FileUp } from "lucide-react";
import { mmToPx } from "@/utils/units";
import type { JobSettings, BarcodeSettings, Placement } from "@/store/useWorkspaceStore";

const DPI_PREVIEW = 150;

interface MultiUpGridInfo {
  designWidthMM: number;
  designHeightMM: number;
  origWidthMM: number;
  origHeightMM: number;
  scaleX: number;
  scaleY: number;
  copiesPerRow: number;
  copiesPerCol: number;
  copiesPerPage: number;
  positions: { x: number; y: number }[];
}

export interface CanvasPreviewProps {
  // Refs
  scrollRef: React.RefObject<HTMLDivElement>;
  previewRef: React.RefObject<HTMLDivElement>;
  // Pointer handlers (drag/resize lifecycle lives in the parent)
  onMouseMove: (e: React.PointerEvent) => void;
  onMouseUp: () => void;
  onMouseDown: (e: React.PointerEvent, placementIdx: number) => void;
  // Drag-state setters/refs used by inline pointer handlers (multi-up first-cell + resize + page number)
  setSelectedPlacementIndex: (index: number) => void;
  setDragging: (v: boolean) => void;
  dragStart: React.MutableRefObject<{ x: number; y: number; origX: number; origY: number } | null>;
  setResizing: (v: boolean) => void;
  resizeStart: React.MutableRefObject<{ x: number; y: number; w: number; h: number; mx: number; my: number; font: number } | null>;
  setDraggingPageNumber: (v: boolean) => void;
  pageNumDragStart: React.MutableRefObject<{ x: number; y: number; origX: number; origY: number } | null>;
  removePlacement: (page: number, placementIndex: number) => void;
  // Values
  job: JobSettings;
  barcode: BarcodeSettings;
  ticksX: number[];
  ticksY: number[];
  zoom: number;
  previewUrl: string | null;
  multiUpPreviewUrl: string | null;
  pdfArrayBuffer?: ArrayBuffer;
  hydrated: boolean;
  multiUpGrid: MultiUpGridInfo | null;
  currentPlacements: Placement[];
  currentPage: number;
  barcodePreviews: Record<string, string>;
  selectedPlacementIndex: number;
  applyCount: number;
  formattedPreviewCode: string;
  cssFontFamily: string;
  // Helper functions (kept in parent so they stay bound to live state)
  getBarcodeBodyForIndex: (absoluteIndex: number) => string;
  ean13CheckDigit: (body: string) => string;
  formatWithSeparator: (code: string) => string;
  effectivePlacement: (placement: Placement, idx: number) => Placement;
}

function CanvasPreviewInner({
  scrollRef,
  previewRef,
  onMouseMove,
  onMouseUp,
  onMouseDown,
  setSelectedPlacementIndex,
  setDragging,
  dragStart,
  setResizing,
  resizeStart,
  setDraggingPageNumber,
  pageNumDragStart,
  removePlacement,
  job,
  barcode,
  ticksX,
  ticksY,
  zoom,
  previewUrl,
  multiUpPreviewUrl,
  pdfArrayBuffer,
  hydrated,
  multiUpGrid,
  currentPlacements,
  currentPage,
  barcodePreviews,
  selectedPlacementIndex,
  applyCount,
  formattedPreviewCode,
  cssFontFamily,
  getBarcodeBodyForIndex,
  ean13CheckDigit,
  formatWithSeparator,
  effectivePlacement,
}: CanvasPreviewProps) {
  return (
            <div ref={scrollRef} className="flex-1 overflow-auto p-4 flex items-start justify-center">
            {/* Rulers */}
            <div className="relative flex-shrink-0" style={{ backgroundColor: job.marginColor || "#f5f5f5" }} onPointerMove={onMouseMove} onPointerUp={onMouseUp} onPointerLeave={onMouseUp}>
              <div className="relative inline-block">
                {/* Top ruler */}
                <div className="absolute -top-8 left-0 right-0 h-8 bg-secondary flex">
                  {ticksX.map((mm) => (
                    <div key={mm} style={{ width: mmToPx(10, Math.round(DPI_PREVIEW * zoom)) }} className="relative">
                      <div className="absolute bottom-0 left-0 right-0 h-4 border-r" />
                      <div className="absolute top-0 left-0 text-[10px] px-1 text-muted-foreground">{mm}</div>
                    </div>
                  ))}
                </div>
                {/* Left ruler */}
                <div className="absolute -left-10 top-0 bottom-0 w-10 bg-secondary">
                  {ticksY.map((mm) => (
                    <div key={mm} style={{ height: mmToPx(10, Math.round(DPI_PREVIEW * zoom)) }} className="relative">
                      <div className="absolute right-0 top-0 bottom-0 w-4 border-b" />
                      <div className="absolute right-6 top-0 text-[10px] text-muted-foreground">{mm}</div>
                    </div>
                  ))}
                </div>

                {/* Canvas area */}
                <div ref={previewRef} className="relative border rounded-md border-border" style={{ width: mmToPx(job.pageSizeMM.width, Math.round(DPI_PREVIEW * zoom)), height: mmToPx(job.pageSizeMM.height, Math.round(DPI_PREVIEW * zoom)), backgroundColor: job.canvasColor || "#ffffff", backgroundImage: (!job.multiUp?.enabled && previewUrl) ? `url(${previewUrl})` : undefined, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", backgroundPosition: "center" }}>

                {/* Empty / loading state — so a project with no design (or a slow design load)
                    reads clearly instead of a confusing blank canvas. */}
                {!pdfArrayBuffer && !job.multiUp?.enabled && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-6 pointer-events-none">
                    <FileUp className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {hydrated ? "No design loaded" : "Loading design…"}
                    </p>
                    <p className="text-xs text-muted-foreground/70 max-w-xs">
                      {hydrated
                        ? "This project has no design file yet. Upload a PDF from the “Design File” panel on the left."
                        : "If this stays empty, the design didn’t load — go back and reopen the project."}
                    </p>
                  </div>
                )}

                {/* Multi-up mode: Show grid of design copies with barcodes */}
                  {job.multiUp?.enabled && multiUpGrid && (
                    <>
                      {/* Margin area background - fills the entire canvas then covered by gap color in content area */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: job.multiUp.marginAreaColor || "#e0e0e0" }}
                      />

                      {/* Content area (inside margins) with gap color */}
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          left: mmToPx(job.multiUp.marginLeftMM, Math.round(DPI_PREVIEW * zoom)),
                          top: mmToPx(job.multiUp.marginTopMM, Math.round(DPI_PREVIEW * zoom)),
                          width: mmToPx(job.pageSizeMM.width - job.multiUp.marginLeftMM - job.multiUp.marginRightMM, Math.round(DPI_PREVIEW * zoom)),
                          height: mmToPx(job.pageSizeMM.height - job.multiUp.marginTopMM - job.multiUp.marginBottomMM, Math.round(DPI_PREVIEW * zoom)),
                          backgroundColor: job.multiUp.gapColor || "#d0d0d0",
                        }}
                      />

                      {/* Margin guides */}
                      <div
                        className="absolute border border-dashed border-muted-foreground/30 pointer-events-none"
                        style={{
                          left: mmToPx(job.multiUp.marginLeftMM, Math.round(DPI_PREVIEW * zoom)),
                          top: mmToPx(job.multiUp.marginTopMM, Math.round(DPI_PREVIEW * zoom)),
                          width: mmToPx(job.pageSizeMM.width - job.multiUp.marginLeftMM - job.multiUp.marginRightMM, Math.round(DPI_PREVIEW * zoom)),
                          height: mmToPx(job.pageSizeMM.height - job.multiUp.marginTopMM - job.multiUp.marginBottomMM, Math.round(DPI_PREVIEW * zoom)),
                        }}
                      />

                      {/* Grid cells - each showing the imported design with barcode overlay */}
                      {multiUpGrid.positions.map((pos, idx) => {
                        const isFirstCell = idx === 0;
                        const cellDpi = Math.round(DPI_PREVIEW * zoom);
                        // Use consistent scale factors from multiUpGrid
                        const { scaleX, scaleY } = multiUpGrid;

                        // Calculate the absolute barcode index for this cell
                        const pageStartIndex = (currentPage - 1) * multiUpGrid.copiesPerPage;
                        const absoluteIndex = pageStartIndex + idx;
                        const cellBarcodeBody = getBarcodeBodyForIndex(absoluteIndex);
                        const cellPreviewCode = barcode.type === "ean13"
                          ? cellBarcodeBody + ean13CheckDigit(cellBarcodeBody)
                          : cellBarcodeBody;
                        const cellFormattedCode = formatWithSeparator(cellPreviewCode);

                        return (
                        <React.Fragment key={`multiup-${idx}`}>
                          {/* Design copy container */}
                          <div
                            className={`absolute border overflow-hidden ${isFirstCell ? 'border-primary' : 'border-primary/30'}`}
                            style={{
                              left: mmToPx(pos.x, cellDpi),
                              top: mmToPx(pos.y, cellDpi),
                              width: mmToPx(multiUpGrid.designWidthMM, cellDpi),
                              height: mmToPx(multiUpGrid.designHeightMM, cellDpi),
                            }}
                            title={`Cell ${idx + 1}: ${Math.round(pos.x)}mm, ${Math.round(pos.y)}mm - ${cellPreviewCode}`}
                          >
                            {/* Show the imported PDF design as background */}
                            {(multiUpPreviewUrl || previewUrl) && (
                              <img
                                src={multiUpPreviewUrl || previewUrl!}
                                alt={`Design copy ${idx + 1}`}
                                className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                              />
                            )}
                            {/* Cell index overlay */}
                            <div className={`absolute top-1 left-1 text-[10px] font-medium px-1 rounded ${isFirstCell ? 'text-destructive-foreground bg-destructive' : 'text-secondary-foreground bg-secondary'}`}>
                              #{idx + 1}{isFirstCell && ' (Edit here)'}
                            </div>

                            {/* Barcode overlays - only first cell is interactive */}
                            {currentPlacements.map((storedPlacement, pIdx) => {
                              // PERF (Fix A): render the live drag/resize values for the active placement.
                              const placement = effectivePlacement(storedPlacement, pIdx);
                              const scaledX = placement.xMM * scaleX;
                              const scaledY = placement.yMM * scaleY;
                              const scaledW = (placement.widthMM || barcode.widthMM) * scaleX;
                              const scaledH = (placement.heightMM || barcode.heightMM) * scaleY;

                              // Use the per-cell barcode preview key
                              const barcodePreviewKey = `cell-${idx}-placement-${pIdx}`;

                              const isTop = placement.textPosition === "top";
                              const showText = placement.showText ?? true;
                              const placementFontSize = placement.fontSize || barcode.fontSize;
                              const textFontSizePx = Math.max(6, Math.round(placementFontSize * cellDpi / 72 * scaleX));
                              const textHeightMM = placementFontSize * 0.4 * scaleY;
                              const totalTextHeightMM = showText ? textHeightMM + barcode.textSpacingMM * scaleY : 0;

                              return (
                              <div
                                key={`cell-${idx}-barcode-${pIdx}`}
                                className={`absolute ${isFirstCell ? 'cursor-move border touch-none' : 'pointer-events-none'} ${isFirstCell && pIdx === selectedPlacementIndex ? 'border-primary' : isFirstCell ? 'border-accent hover:border-primary/50' : 'border-transparent'}`}
                                style={{
                                  left: mmToPx(scaledX, cellDpi),
                                  top: mmToPx(scaledY - (isTop && showText ? totalTextHeightMM : 0), cellDpi),
                                  width: mmToPx(scaledW, cellDpi),
                                  height: mmToPx(scaledH + totalTextHeightMM, cellDpi),
                                  transform: `rotate(${barcode.rotation}deg)`,
                                  transformOrigin: "top left",
                                  zIndex: isFirstCell && pIdx === selectedPlacementIndex ? 20 : 10,
                                }}
                                onPointerDown={isFirstCell ? (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedPlacementIndex(pIdx);
                                  setDragging(true);
                                  dragStart.current = {
                                    x: e.clientX,
                                    y: e.clientY,
                                    origX: placement.xMM,
                                    origY: placement.yMM,
                                  };
                                } : undefined}
                              >
                                {/* Text above barcode (if position is top) */}
                                {showText && isTop && (
                                  <div className="relative" style={{ height: mmToPx(totalTextHeightMM, cellDpi) }}>
                                    {placement.textBgColor && (
                                      <div
                                        className="absolute inset-0"
                                        style={{ backgroundColor: placement.textBgColor }}
                                      />
                                    )}
                                    <div
                                      className="absolute inset-0 flex items-end justify-center pointer-events-none"
                                      style={{
                                        fontFamily: cssFontFamily,
                                        fontSize: `${textFontSizePx}px`,
                                        fontWeight: placement.bold ? "bold" : "normal",
                                        fontStyle: placement.italic ? "italic" : "normal",
                                        textDecoration: placement.underline ? "underline" : "none",
                                        color: placement.textColor || "#000000",
                                        paddingBottom: mmToPx(barcode.textSpacingMM * scaleY / 2, cellDpi),
                                      }}
                                    >
                                      {cellFormattedCode.split("").join(" ")}
                                    </div>
                                  </div>
                                )}

                                {/* Barcode image */}
                                <div
                                  className={`relative ${isFirstCell && pIdx === selectedPlacementIndex ? 'bg-primary/30' : isFirstCell ? 'bg-accent/20' : ''}`}
                                  style={{ height: mmToPx(scaledH, cellDpi) }}
                                >
                                  {barcodePreviews[barcodePreviewKey] && !(placement.codeOnly ?? barcode.codeOnly) && (
                                    <img
                                      src={barcodePreviews[barcodePreviewKey]}
                                      alt="Barcode"
                                      className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                                    />
                                  )}
                                  {/* Resize handle on first cell */}
                                  {isFirstCell && pIdx === selectedPlacementIndex && (
                                    <div
                                      className="absolute bottom-0 right-0 w-5 h-5 bg-destructive cursor-se-resize rounded-tl z-30 touch-none"
                                      onPointerDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setResizing(true);
                                        resizeStart.current = {
                                          x: e.clientX,
                                          y: e.clientY,
                                          w: placement.widthMM || barcode.widthMM,
                                          h: placement.heightMM || barcode.heightMM,
                                          mx: e.clientX,
                                          my: e.clientY,
                                          font: placement.fontSize || barcode.fontSize,
                                        };
                                      }}
                                    />
                                  )}
                                </div>

                                {/* Text below barcode (if position is bottom) */}
                                {showText && !isTop && (
                                  <div className="relative" style={{ height: mmToPx(totalTextHeightMM, cellDpi) }}>
                                    {placement.textBgColor && (
                                      <div
                                        className="absolute inset-0"
                                        style={{ backgroundColor: placement.textBgColor }}
                                      />
                                    )}
                                    <div
                                      className="absolute inset-0 flex items-start justify-center pointer-events-none"
                                      style={{
                                        fontFamily: cssFontFamily,
                                        fontSize: `${textFontSizePx}px`,
                                        fontWeight: placement.bold ? "bold" : "normal",
                                        fontStyle: placement.italic ? "italic" : "normal",
                                        textDecoration: placement.underline ? "underline" : "none",
                                        color: placement.textColor || "#000000",
                                        paddingTop: mmToPx(barcode.textSpacingMM * scaleY / 2, cellDpi),
                                      }}
                                    >
                                      {cellFormattedCode.split("").join(" ")}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )})}
                          </div>
                        </React.Fragment>
                      );})}

                      {/* Info overlay */}
                      <div className="absolute bottom-2 left-2 bg-background/90 text-xs p-2 rounded border">
                        <div>{multiUpGrid.copiesPerRow} × {multiUpGrid.copiesPerCol} = {multiUpGrid.copiesPerPage} per page</div>
                        <div className="text-muted-foreground">
                          {Math.ceil(applyCount / multiUpGrid.copiesPerPage)} page{Math.ceil(applyCount / multiUpGrid.copiesPerPage) > 1 ? 's' : ''} for {applyCount} copies
                        </div>
                      </div>
                    </>
                  )}

                  {/* Normal mode: Barcode overlays with integrated text - render all placements on current page */}
                  {!job.multiUp?.enabled && pdfArrayBuffer && (() => {
                    const dpi = Math.round(DPI_PREVIEW * zoom);

                    // Calculate design offset when fitToPage is off (design is centered on page)
                    let designOffsetXMM = 0;
                    let designOffsetYMM = 0;
                    if (!job.fitToPage) {
                      const designW = job.designWidthMM || job.pageSizeMM.width;
                      const designH = job.designHeightMM || job.pageSizeMM.height;
                      designOffsetXMM = (job.pageSizeMM.width - designW) / 2;
                      designOffsetYMM = (job.pageSizeMM.height - designH) / 2;
                    }

                    return currentPlacements.map((storedPlacement, idx) => {
                      // PERF (Fix A): render the live drag/resize values for the active placement.
                      const placement = effectivePlacement(storedPlacement, idx);
                      const placementW = placement.widthMM || barcode.widthMM;
                      const placementH = placement.heightMM || barcode.heightMM;
                      const isTop = placement.textPosition === "top";
                      const placementFontSize = placement.fontSize || barcode.fontSize;
                      const textHeightMM = placementFontSize * 0.4;
                      const textFontSizePx = Math.round(placementFontSize * dpi / 72);

                      // Calculate total height including text if shown
                      const showText = placement.showText ?? true;
                      const totalTextHeightMM = showText ? textHeightMM + barcode.textSpacingMM : 0;

                      // Apply design offset to placement position
                      const adjustedXMM = placement.xMM + designOffsetXMM;
                      const adjustedYMM = placement.yMM + designOffsetYMM;

                      // For rotated barcodes, we need a wrapper that contains both barcode and text
                      // The wrapper is positioned and rotated as a unit
                      return (
                        <div
                          key={placement.id || idx}
                          className={`absolute border cursor-move touch-none ${idx === selectedPlacementIndex ? 'border-primary' : 'border-accent hover:border-primary/50'}`}
                          style={{
                            left: mmToPx(adjustedXMM, dpi),
                            top: mmToPx(adjustedYMM - (isTop && showText ? totalTextHeightMM : 0), dpi),
                            width: mmToPx(placementW, dpi),
                            height: mmToPx(placementH + totalTextHeightMM, dpi),
                            transform: `rotate(${barcode.rotation}deg)`,
                            transformOrigin: "top left",
                            zIndex: idx === selectedPlacementIndex ? 20 : 10,
                            willChange: "left, top, width, height, transform",
                          }}
                          onPointerDown={(e) => onMouseDown(e, idx)}
                          title={`Barcode ${idx + 1}: x: ${Math.round(placement.xMM)}mm, y: ${Math.round(placement.yMM)}mm, ${Math.round(placementW)}×${Math.round(placementH)}mm`}
                        >
                        {/* Text above barcode (if position is top) */}
                        {showText && isTop && (
                          <div className="relative" style={{ height: mmToPx(totalTextHeightMM, dpi) }}>
                            {placement.textBgColor && (
                              <div
                                className="absolute inset-0"
                                style={{ backgroundColor: placement.textBgColor }}
                              />
                            )}
                            <div
                              className="absolute inset-0 flex items-end justify-center pointer-events-none"
                              style={{
                                fontFamily: cssFontFamily,
                                fontSize: `${textFontSizePx}px`,
                                fontWeight: placement.bold ? "bold" : "normal",
                                fontStyle: placement.italic ? "italic" : "normal",
                                textDecoration: placement.underline ? "underline" : "none",
                                color: placement.textColor || "#000000",
                                paddingBottom: mmToPx(barcode.textSpacingMM / 2, dpi),
                              }}
                            >
                              {formattedPreviewCode.split("").join(" ")}
                            </div>
                          </div>
                        )}

                        {/* Barcode image */}
                        <div
                          className={`relative ${idx === selectedPlacementIndex ? 'bg-primary/30' : 'bg-accent/20'}`}
                          style={{ height: mmToPx(placementH, dpi) }}
                        >
                          {barcodePreviews[placement.id || String(idx)] && !(placement.codeOnly ?? barcode.codeOnly) && (
                            <img
                              src={barcodePreviews[placement.id || String(idx)]}
                              alt="Barcode preview"
                              className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                            />
                          )}
                          {/* Resize handle (bottom-right of barcode area) - only on selected */}
                          {idx === selectedPlacementIndex && (
                            <div
                              className="absolute -right-1.5 -bottom-1.5 w-5 h-5 bg-primary rounded-sm cursor-se-resize z-30 touch-none"
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setResizing(true);
                                resizeStart.current = { x: placement.xMM, y: placement.yMM, w: placementW, h: placementH, mx: e.clientX, my: e.clientY, font: barcode.fontSize };
                              }}
                              title="Drag to resize"
                            />
                          )}
                          {/* Delete button - only on selected and if more than one placement */}
                          {idx === selectedPlacementIndex && currentPlacements.length > 1 && (
                            <button
                              className="absolute -top-2 -right-2 w-4 h-4 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center hover:bg-destructive/80 z-30"
                              onClick={(e) => {
                                e.stopPropagation();
                                removePlacement(currentPage, idx);
                              }}
                              title="Remove this barcode"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        {/* Text below barcode (if position is bottom) */}
                        {showText && !isTop && (
                          <div className="relative" style={{ height: mmToPx(totalTextHeightMM, dpi) }}>
                            {placement.textBgColor && (
                              <div
                                className="absolute inset-0"
                                style={{ backgroundColor: placement.textBgColor }}
                              />
                            )}
                            <div
                              className="absolute inset-0 flex items-start justify-center pointer-events-none"
                              style={{
                                fontFamily: cssFontFamily,
                                fontSize: `${textFontSizePx}px`,
                                fontWeight: placement.bold ? "bold" : "normal",
                                fontStyle: placement.italic ? "italic" : "normal",
                                textDecoration: placement.underline ? "underline" : "none",
                                color: placement.textColor || "#000000",
                                paddingTop: mmToPx(barcode.textSpacingMM / 2, dpi),
                              }}
                            >
                              {formattedPreviewCode.split("").join(" ")}
                            </div>
                          </div>
                        )}
                      </div>
                      );
                    });
                  })()}

                  {/* Page Number Preview (Invoice Mode) - Draggable */}
                  {job.isInvoice && job.pageNumber?.enabled && (() => {
                    const dpi = Math.round(DPI_PREVIEW * zoom);
                    // Calculate design offset when fitToPage is off (design is centered on page)
                    let designOffsetXMM = 0;
                    let designOffsetYMM = 0;
                    if (!job.fitToPage) {
                      const designW = job.designWidthMM || job.pageSizeMM.width;
                      const designH = job.designHeightMM || job.pageSizeMM.height;
                      designOffsetXMM = (job.pageSizeMM.width - designW) / 2;
                      designOffsetYMM = (job.pageSizeMM.height - designH) / 2;
                    }

                    const adjustedXMM = job.pageNumber.xMM + designOffsetXMM;
                    const adjustedYMM = job.pageNumber.yMM + designOffsetYMM;

                    return (
                      <div
                        className="absolute z-50 cursor-move select-none touch-none border border-dashed border-primary/50 px-1 rounded hover:border-primary"
                        style={{
                          left: mmToPx(adjustedXMM, dpi),
                          top: mmToPx(adjustedYMM, dpi),
                          fontFamily: job.pageNumber.fontFamily === "Courier" ? "Courier, monospace" : job.pageNumber.fontFamily === "TimesRoman" ? "Times New Roman, serif" : "Helvetica, Arial, sans-serif",
                          fontSize: `${Math.round(job.pageNumber.fontSize * dpi / 72)}px`,
                          fontWeight: job.pageNumber.bold ? "bold" : "normal",
                          fontStyle: job.pageNumber.italic ? "italic" : "normal",
                          color: job.pageNumber.color || "#000000",
                          whiteSpace: "nowrap",
                          textAlign: job.pageNumber.alignment || "left",
                          transform: job.pageNumber.alignment === "center" ? "translateX(-50%)" : job.pageNumber.alignment === "right" ? "translateX(-100%)" : "none",
                        }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggingPageNumber(true);
                          pageNumDragStart.current = {
                            x: e.clientX,
                            y: e.clientY,
                            origX: job.pageNumber!.xMM,
                            origY: job.pageNumber!.yMM,
                          };
                        }}
                        title="Drag to reposition page number"
                      >
                        {(() => {
                          const pageNum = (job.pageNumber.startNumber ?? 0) + (currentPage - 1);
                          const digits = job.pageNumber.digits || 1;
                          const paddedNum = String(pageNum).padStart(digits, '0');
                          return `${job.pageNumber.prefix || ""}${paddedNum}${job.pageNumber.suffix || ""}`;
                        })()}
                      </div>
                    );
                  })()}
              </div>
            </div>
            </div>
            </div>
  );
}

export const CanvasPreview = React.memo(CanvasPreviewInner);
export default CanvasPreview;
