import { useState, useCallback, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  FileText,
  Trash2,
  Download,
  RotateCw,
  Wand2,
  Plus,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import { PDFDocument, degrees as pdfDegrees } from "pdf-lib";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf";
// @ts-expect-error - Vite's ?url import suffix has no TypeScript declaration
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";
GlobalWorkerOptions.workerSrc = workerSrc;
import { ptToMm, mmToPt, mmToPx } from "@/utils/units";
import {
  NestingRect,
  NestingCanvas,
  NestingConfig,
  autoNest,
  nestRectangles,
  getRotatedDimensions,
} from "@/utils/nesting";

// ── Types ──────────────────────────────────────────────────────────
interface UploadedFile {
  name: string;
  bytes: ArrayBuffer;
  pages: PageInfo[];
}

interface PageInfo {
  index: number; // 1-indexed within its PDF
  widthMM: number;
  heightMM: number;
  thumbnail?: string;
}

type PageSizePreset = "A4" | "A3" | "Letter" | "Tabloid" | "Custom";

const PAGE_PRESETS: Record<PageSizePreset, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 215.9, h: 279.4 },
  Tabloid: { w: 279.4, h: 431.8 },
  Custom: { w: 300, h: 300 },
};

const ROTATION_PRESETS = [0, 90, 180, 270];

// ── Component ──────────────────────────────────────────────────────
export default function Nesting() {
  // Files & pages
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canvas config
  const [preset, setPreset] = useState<PageSizePreset>("A4");
  const [canvasW, setCanvasW] = useState(210);
  const [canvasH, setCanvasH] = useState(297);
  const [marginTop, setMarginTop] = useState(5);
  const [marginBottom, setMarginBottom] = useState(5);
  const [marginLeft, setMarginLeft] = useState(5);
  const [marginRight, setMarginRight] = useState(5);
  const [gap, setGap] = useState(3);

  // Per-page rotations keyed by "fileIdx-pageIdx"
  const [rotations, setRotations] = useState<Record<string, number>>({});

  // Result
  const [canvases, setCanvases] = useState<NestingCanvas[]>([]);
  const [currentCanvasIdx, setCurrentCanvasIdx] = useState(0);
  const [zoom, setZoom] = useState(1);

  // State
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);

  // Canvas preview ref
  const previewRef = useRef<HTMLCanvasElement>(null);

  // ── File upload ───────────────────────────────────────────────────
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected) return;
      setLoading(true);

      const newFiles: UploadedFile[] = [];
      for (const file of Array.from(selected)) {
        if (file.type !== "application/pdf") {
          continue;
        }
        const bytes = await file.arrayBuffer();
        const pdf = await getDocument({ data: bytes.slice(0) }).promise;

        const pages: PageInfo[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          // Generate thumbnail
          const thumbScale = 120 / Math.max(vp.width, vp.height);
          const thumbVp = page.getViewport({ scale: thumbScale });
          const c = document.createElement("canvas");
          c.width = thumbVp.width;
          c.height = thumbVp.height;
          const ctx = c.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport: thumbVp }).promise;
          pages.push({
            index: i,
            widthMM: ptToMm(vp.width),
            heightMM: ptToMm(vp.height),
            thumbnail: c.toDataURL(),
          });
        }
        newFiles.push({ name: file.name, bytes, pages });
      }

      setFiles((prev) => [...prev, ...newFiles]);
      setLoading(false);
      if (e.target) e.target.value = "";
    },
    []
  );

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setCanvases([]);
  };

  // ── Preset change ─────────────────────────────────────────────────
  useEffect(() => {
    if (preset !== "Custom") {
      setCanvasW(PAGE_PRESETS[preset].w);
      setCanvasH(PAGE_PRESETS[preset].h);
    }
  }, [preset]);

  // ── Build nesting rects ───────────────────────────────────────────
  const buildRects = useCallback((): NestingRect[] => {
    const rects: NestingRect[] = [];
    files.forEach((file, fi) => {
      file.pages.forEach((page) => {
        const key = `${fi}-${page.index}`;
        rects.push({
          id: key,
          widthMM: page.widthMM,
          heightMM: page.heightMM,
          rotation: rotations[key] ?? 0,
          sourcePageIndex: page.index,
          sourceFileIndex: fi,
        });
      });
    });
    return rects;
  }, [files, rotations]);

  // ── Run nesting ───────────────────────────────────────────────────
  const runAutoNest = useCallback(() => {
    const rects = buildRects();
    if (rects.length === 0) {
      return;
    }
    const config: NestingConfig = {
      canvasWidthMM: canvasW,
      canvasHeightMM: canvasH,
      marginTopMM: marginTop,
      marginBottomMM: marginBottom,
      marginLeftMM: marginLeft,
      marginRightMM: marginRight,
      gapMM: gap,
    };
    const result = autoNest(rects, config);
    setCanvases(result);
    setCurrentCanvasIdx(0);
    
  }, [buildRects, canvasW, canvasH, marginTop, marginBottom, marginLeft, marginRight, gap]);

  const runManualNest = useCallback(() => {
    const rects = buildRects();
    if (rects.length === 0) {
      return;
    }
    const config: NestingConfig = {
      canvasWidthMM: canvasW,
      canvasHeightMM: canvasH,
      marginTopMM: marginTop,
      marginBottomMM: marginBottom,
      marginLeftMM: marginLeft,
      marginRightMM: marginRight,
      gapMM: gap,
    };
    const result = nestRectangles(rects, config);
    setCanvases(result);
    setCurrentCanvasIdx(0);
    
  }, [buildRects, canvasW, canvasH, marginTop, marginBottom, marginLeft, marginRight, gap]);

  // ── Rotation helpers ──────────────────────────────────────────────
  const setPageRotation = (key: string, deg: number) => {
    setRotations((prev) => ({ ...prev, [key]: deg % 360 }));
  };

  // ── Canvas preview rendering ──────────────────────────────────────
  useEffect(() => {
    if (canvases.length === 0 || !previewRef.current) return;
    const canvas = canvases[currentCanvasIdx];
    if (!canvas) return;

    const dpi = 150;
    const el = previewRef.current;
    const pxW = mmToPx(canvas.widthMM, dpi) * zoom;
    const pxH = mmToPx(canvas.heightMM, dpi) * zoom;
    el.width = pxW;
    el.height = pxH;
    const ctx = el.getContext("2d")!;

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pxW, pxH);

    // Margin area (light grey border)
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    const ml = mmToPx(marginLeft, dpi) * zoom;
    const mt = mmToPx(marginTop, dpi) * zoom;
    const mr = mmToPx(marginRight, dpi) * zoom;
    const mb = mmToPx(marginBottom, dpi) * zoom;
    ctx.strokeRect(ml, mt, pxW - ml - mr, pxH - mt - mb);

    // Draw placement outlines
    for (const p of canvas.placements) {
      const x = mmToPx(p.xMM, dpi) * zoom;
      const y = mmToPx(p.yMM, dpi) * zoom;
      const w = mmToPx(p.placedWidthMM, dpi) * zoom;
      const h = mmToPx(p.placedHeightMM, dpi) * zoom;

      // Fill with light blue
      ctx.fillStyle = "hsl(210, 60%, 95%)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "hsl(210, 60%, 50%)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);

      // Label
      ctx.fillStyle = "hsl(210, 60%, 30%)";
      ctx.font = `${Math.max(10, 12 * zoom)}px Inter, sans-serif`;
      const file = files[p.sourceFileIndex];
      const label = file
        ? `${file.name.slice(0, 15)} p${p.sourcePageIndex}`
        : `p${p.sourcePageIndex}`;
      ctx.fillText(label, x + 4, y + 16 * zoom);

      // Rotation indicator
      if (p.rotation !== 0) {
        ctx.fillStyle = "hsl(47, 96%, 45%)";
        ctx.font = `bold ${Math.max(9, 10 * zoom)}px Inter, sans-serif`;
        ctx.fillText(`↻ ${p.rotation}°`, x + 4, y + 30 * zoom);
      }

      // Dimensions
      ctx.fillStyle = "hsl(220, 9%, 46%)";
      ctx.font = `${Math.max(8, 9 * zoom)}px Inter, sans-serif`;
      ctx.fillText(
        `${p.placedWidthMM.toFixed(1)}×${p.placedHeightMM.toFixed(1)}mm`,
        x + 4,
        y + h - 6 * zoom
      );
    }
  }, [canvases, currentCanvasIdx, zoom, files, marginLeft, marginTop, marginRight, marginBottom]);

  // ── High-quality PDF rendering on preview ─────────────────────────
  const [renderedPreviews, setRenderedPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    if (canvases.length === 0) return;
    const canvas = canvases[currentCanvasIdx];
    if (!canvas) return;

    // Render each placed page as an image
    const renderPages = async () => {
      const previews: Record<string, string> = {};
      for (const p of canvas.placements) {
        const key = p.id;
        if (renderedPreviews[key]) {
          previews[key] = renderedPreviews[key];
          continue;
        }
        const file = files[p.sourceFileIndex];
        if (!file) continue;
        try {
          const pdf = await getDocument({ data: file.bytes.slice(0) }).promise;
          const page = await pdf.getPage(p.sourcePageIndex);
          const vp = page.getViewport({ scale: 1 });
          const targetPx = mmToPx(Math.max(p.widthMM, p.heightMM), 150);
          const scale = targetPx / Math.max(vp.width, vp.height);
          const renderVp = page.getViewport({ scale });
          const c = document.createElement("canvas");
          c.width = renderVp.width;
          c.height = renderVp.height;
          const ctx = c.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport: renderVp }).promise;
          previews[key] = c.toDataURL();
        } catch {
          // skip
        }
      }
      setRenderedPreviews((prev) => ({ ...prev, ...previews }));
    };
    renderPages();
  }, [canvases, currentCanvasIdx, files]);

  // Re-draw preview with actual page renders
  useEffect(() => {
    if (canvases.length === 0 || !previewRef.current) return;
    const canvas = canvases[currentCanvasIdx];
    if (!canvas) return;

    const dpi = 150;
    const el = previewRef.current;
    const pxW = mmToPx(canvas.widthMM, dpi) * zoom;
    const pxH = mmToPx(canvas.heightMM, dpi) * zoom;
    el.width = pxW;
    el.height = pxH;
    const ctx = el.getContext("2d")!;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pxW, pxH);

    // Margins
    ctx.strokeStyle = "hsl(220, 13%, 91%)";
    ctx.setLineDash([4, 4]);
    const ml = mmToPx(marginLeft, dpi) * zoom;
    const mt = mmToPx(marginTop, dpi) * zoom;
    const mr = mmToPx(marginRight, dpi) * zoom;
    const mb = mmToPx(marginBottom, dpi) * zoom;
    ctx.strokeRect(ml, mt, pxW - ml - mr, pxH - mt - mb);
    ctx.setLineDash([]);

    // Draw pages
    const drawPromises: Promise<void>[] = [];
    for (const p of canvas.placements) {
      const x = mmToPx(p.xMM, dpi) * zoom;
      const y = mmToPx(p.yMM, dpi) * zoom;
      const w = mmToPx(p.placedWidthMM, dpi) * zoom;
      const h = mmToPx(p.placedHeightMM, dpi) * zoom;

      const imgSrc = renderedPreviews[p.id];
      if (imgSrc) {
        const prom = new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            ctx.save();
            ctx.translate(x + w / 2, y + h / 2);
            ctx.rotate((p.rotation * Math.PI) / 180);
            // After rotation, draw centered
            const dim = getRotatedDimensions(p.widthMM, p.heightMM, p.rotation);
            const drawW = mmToPx(p.widthMM, dpi) * zoom;
            const drawH = mmToPx(p.heightMM, dpi) * zoom;
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.restore();
            resolve();
          };
          img.onerror = () => resolve();
          img.src = imgSrc;
        });
        drawPromises.push(prom);
      } else {
        ctx.fillStyle = "hsl(210, 60%, 95%)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "hsl(210, 60%, 50%)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    }

    // Re-render after images load
    Promise.all(drawPromises).then(() => {
      // Overlay gap/margin lines
      ctx.strokeStyle = "hsl(220, 13%, 91%)";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(ml, mt, pxW - ml - mr, pxH - mt - mb);
      ctx.setLineDash([]);
    });
  }, [canvases, currentCanvasIdx, zoom, renderedPreviews, marginLeft, marginTop, marginRight, marginBottom]);

  // ── Export ────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (canvases.length === 0) {
      return;
    }
    setExporting(true);
    try {
      const outPdf = await PDFDocument.create();

      for (const nestCanvas of canvases) {
        const pageW = mmToPt(nestCanvas.widthMM);
        const pageH = mmToPt(nestCanvas.heightMM);
        const outPage = outPdf.addPage([pageW, pageH]);

        for (const p of nestCanvas.placements) {
          const file = files[p.sourceFileIndex];
          if (!file) continue;

          const srcDoc = await PDFDocument.load(file.bytes.slice(0));
          const [embeddedPage] = await outPdf.embedPdf(srcDoc, [
            p.sourcePageIndex - 1,
          ]);

          const xPt = mmToPt(p.xMM);
          // pdf-lib uses bottom-left origin
          const yPt = pageH - mmToPt(p.yMM) - mmToPt(p.placedHeightMM);
          const wPt = mmToPt(p.placedWidthMM);
          const hPt = mmToPt(p.placedHeightMM);

          if (p.rotation === 0 || p.rotation === 360) {
            outPage.drawPage(embeddedPage, {
              x: xPt,
              y: yPt,
              width: wPt,
              height: hPt,
            });
          } else {
            // For rotated pages, translate to center then rotate
            const cx = xPt + wPt / 2;
            const cy = yPt + hPt / 2;
            const origWPt = mmToPt(p.widthMM);
            const origHPt = mmToPt(p.heightMM);

            outPage.drawPage(embeddedPage, {
              x: cx - origWPt / 2,
              y: cy - origHPt / 2,
              width: origWPt,
              height: origHPt,
              rotate: pdfDegrees(p.rotation),
              xSkew: pdfDegrees(0),
              ySkew: pdfDegrees(0),
            });
          }
        }
      }

      const pdfBytes = await outPdf.save();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nested-output-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  }, [canvases, files]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-2rem)] gap-4 p-4 overflow-hidden">
        {/* Left Panel — Settings */}
        <ScrollArea className="w-80 shrink-0">
          <div className="space-y-4 pr-3">
            {/* Upload */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  Upload PDFs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add PDF Files
                </Button>

                {/* File list */}
                {files.map((f, fi) => (
                  <div
                    key={fi}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted text-sm"
                  >
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {f.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {f.pages.length} page(s)
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => removeFile(fi)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Canvas Size */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Canvas Size
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Preset</Label>
                  <Select
                    value={preset}
                    onValueChange={(v) => setPreset(v as PageSizePreset)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(PAGE_PRESETS).map((k) => (
                        <SelectItem key={k} value={k}>
                          {k}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Width (mm)</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={canvasW}
                      onChange={(e) => {
                        setCanvasW(Number(e.target.value));
                        setPreset("Custom");
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Height (mm)</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={canvasH}
                      onChange={(e) => {
                        setCanvasH(Number(e.target.value));
                        setPreset("Custom");
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Margins & Gap */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Margins & Gap
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Top (mm)</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={marginTop}
                      onChange={(e) => setMarginTop(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Bottom (mm)</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={marginBottom}
                      onChange={(e) => setMarginBottom(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Left (mm)</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={marginLeft}
                      onChange={(e) => setMarginLeft(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Right (mm)</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={marginRight}
                      onChange={(e) => setMarginRight(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Gap between pages (mm)</Label>
                  <Input
                    type="number"
                    className="h-9"
                    value={gap}
                    onChange={(e) => setGap(Number(e.target.value))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Page Rotations */}
            {files.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <RotateCw className="h-4 w-4 text-primary" />
                    Page Rotation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                  {files.map((file, fi) =>
                    file.pages.map((page) => {
                      const key = `${fi}-${page.index}`;
                      const rot = rotations[key] ?? 0;
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-2 text-xs"
                        >
                          {page.thumbnail && (
                            <img
                              src={page.thumbnail}
                              className="w-8 h-8 rounded object-cover border border-border"
                              alt=""
                            />
                          )}
                          <span className="flex-1 truncate text-foreground">
                            {file.name.slice(0, 12)} p{page.index}
                          </span>
                          <Select
                            value={String(rot)}
                            onValueChange={(v) =>
                              setPageRotation(key, Number(v))
                            }
                          >
                            <SelectTrigger className="h-7 w-20 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROTATION_PRESETS.map((d) => (
                                <SelectItem key={d} value={String(d)}>
                                  {d}°
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            className="h-7 w-16 text-xs"
                            placeholder="Custom°"
                            min={0}
                            max={359}
                            value={
                              ROTATION_PRESETS.includes(rot) ? "" : rot
                            }
                            onChange={(e) => {
                              const v = Number(e.target.value) || 0;
                              setPageRotation(key, v);
                            }}
                          />
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={runAutoNest}
                disabled={files.length === 0}
              >
                <Wand2 className="h-4 w-4 mr-2" />
                Auto Nest
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={runManualNest}
                disabled={files.length === 0}
              >
                <RotateCw className="h-4 w-4 mr-2" />
                Nest with Current Rotations
              </Button>
              <Separator />
              <Button
                variant="outline"
                className="w-full"
                onClick={handleExport}
                disabled={canvases.length === 0 || exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export PDF
              </Button>
            </div>
          </div>
        </ScrollArea>

        {/* Right — Preview */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={currentCanvasIdx <= 0}
                onClick={() => setCurrentCanvasIdx((i) => i - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {canvases.length === 0
                  ? "No layout"
                  : `Canvas ${currentCanvasIdx + 1} of ${canvases.length}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={currentCanvasIdx >= canvases.length - 1}
                onClick={() => setCurrentCanvasIdx((i) => i + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto rounded-xl border border-border bg-muted/30 flex items-start justify-center p-6">
            {canvases.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                <Wand2 className="h-12 w-12 opacity-30" />
                <p className="text-sm">
                  Upload PDFs and click <strong>Auto Nest</strong> to arrange
                  pages
                </p>
              </div>
            ) : (
              <canvas
                ref={previewRef}
                className="shadow-lg rounded"
                style={{ imageRendering: "auto" }}
              />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
