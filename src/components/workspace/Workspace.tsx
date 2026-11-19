import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useWorkspaceStore, DEFAULT_PAGE_NUMBER, type PageSizePreset, type BarcodeType, type JobSettings, type BarcodeSettings, type Placement, type HistoryItem } from "@/store/useWorkspaceStore";
import { loadPdfMeta, renderPagePreview, renderPagePreviewStretched, exportMergedPdf, generateBarcodeCanvas } from "@/utils/pdf";
import { mmToPx, clamp } from "@/utils/units";
import { SupabaseStorageService } from "@/services/storage/SupabaseStorageService";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useProjectStore } from "@/store/useProjectStore";
import { PDFDocument } from "pdf-lib";
import CsvImport from "./CsvImport";
import { HistoryPanel } from "./sections/HistoryPanel";
import { EditorHeader } from "./sections/EditorHeader";
import { CanvasPreview } from "./sections/CanvasPreview";
import { PageSetupSection } from "./sections/PageSetupSection";
import { BarcodeSettingsSection } from "./sections/BarcodeSettingsSection";
import {
  ArrowLeft, FileUp, Barcode, Layers, Clock,
  X, Menu, PanelRightClose, PanelRightOpen, PanelLeftClose, Sun, Moon
} from "lucide-react";

// Shape of the JSONB snapshot/settings blob persisted per project (all fields optional/partial).
type ProjectSnapshot = {
  job?: JobSettings;
  barcode?: BarcodeSettings;
  placementsByPage?: Record<number, Placement[]>;
  designFileId?: string;
  sequenceNextBody?: string;
  importedNumbers?: string[];
  currentNumberIndex?: number;
  digitsCount?: number;
  applyCount?: number;
  currentPage?: number;
  applyToAllPages?: boolean;
};

// Default placement helper
const createDefaultPlacement = (barcode: { widthMM: number; heightMM: number; fontSize: number }, offset = 0): Placement => ({
  xMM: 10 + offset * 20,
  yMM: 10 + offset * 20,
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
});

const DPI_PREVIEW = 150;

export default function Workspace() {
  const {
    pdfArrayBuffer,
    pdfName,
    pageCount,
    currentPage,
    pageSizesMM,
    thumbnails,
    job,
    barcode,
    placementsByPage,
    selectedPlacementIndex,
    applyToAllPages,
    zoom,
    history,
    setPdf,
    setCurrentPage,
    setJob,
    setBarcode,
    setPlacement,
    addPlacement,
    removePlacement,
    setSelectedPlacementIndex,
    setApplyToAll,
    setZoom,
    addHistory,
    setHistory,
    deleteHistory,
    sequenceNextBody,
    setSequenceNext,
    resetProject,
  } = useWorkspaceStore();

  const navigate = useNavigate();
  const { selectedProjectId, selectedProjectName, clearProject, consumePendingCsvData } = useProjectStore();

  const [designFileId, setDesignFileId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [multiUpPreviewUrl, setMultiUpPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number; mx: number; my: number; font: number } | null>(null);
  // PERF (Fix A): during an active drag/resize we update cheap local state instead of writing
  // to the store on every pointer-move. The store write happens once on pointer-up. The canvas
  // renders the affected placement at these live values while interacting.
  const [dragLive, setDragLive] = useState<{ placementIndex: number; xMM: number; yMM: number } | null>(null);
  const [resizeLive, setResizeLive] = useState<{ placementIndex: number; widthMM: number; heightMM: number } | null>(null);
  // Save indicator state (auto-save lifecycle). "saved" is shown briefly then returns to idle.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  // One-time CSV auto-unlock for bulk-generated projects (prevents "locked" editor on re-open)
  const autoClearedCsvForProjectId = useRef<string | null>(null);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(Math.max(1, pageCount));
  const [applyCount, setApplyCount] = useState<number>(Math.max(1, pageCount));
  const [digitsCount, setDigitsCount] = useState<number>(barcode.type === "ean13" ? 13 : barcode.type === "qr" ? 8 : 12);
  const [barcodePreviews, setBarcodePreviews] = useState<Record<string, string>>({});
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [importedNumbers, setImportedNumbers] = useState<string[]>([]);
  const [currentNumberIndex, setCurrentNumberIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStartTime, setExportStartTime] = useState<number | null>(null);
  const [exportElapsed, setExportElapsed] = useState(0);
  
  // Manual position editing state
  const [isEditingPosition, setIsEditingPosition] = useState(false);
  const [editPosX, setEditPosX] = useState<number>(0);
  const [editPosY, setEditPosY] = useState<number>(0);
  
  // Page number dragging state
  const [draggingPageNumber, setDraggingPageNumber] = useState(false);
  const pageNumDragStart = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  
  // Responsive sidebar/panel state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop collapse of the editor's left settings panel (for more preview space).
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("editorLeftCollapsed") === "1"; } catch { return false; }
  });
  const toggleLeftCollapsed = () =>
    setLeftCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("editorLeftCollapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') || 
             !document.documentElement.classList.contains('light');
    }
    return true;
  });

  // When generating more pages than the source PDF has (CSV/sequence), keep the preview
  // locked to the last available design page instead of crashing on invalid page indexes.
  const designPageForPreview = Math.min(Math.max(1, currentPage), Math.max(1, pageCount || 1));

  const genSystemCode = (len: number) => {
    // generate numeric string of length len
    const arr = new Uint32Array(len);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr);
    let s = "";
    for (let i = 0; i < len; i++) s += ((arr[i] ?? Date.now() + i) % 10).toString();
    return s.slice(0, len).padStart(len, "0");
  };

  useEffect(() => {
    if (!barcode.value) setBarcode({ value: genSystemCode(digitsCount) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!pdfArrayBuffer) return;
    // Only auto-generate if empty (do NOT override restored projects)
    if (!barcode.value) setBarcode({ value: genSystemCode(digitsCount) });
  }, [pdfArrayBuffer, digitsCount, barcode.value, setBarcode]);
  // Keep digitsCount user-controlled (important for pixel-perfect re-open)
  // NOTE: EAN-13 specifics are handled in export logic (12-digit body + check digit).

  // Export timer effect
  useEffect(() => {
    if (!isExporting || !exportStartTime) {
      setExportElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setExportElapsed(Math.floor((Date.now() - exportStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isExporting, exportStartTime]);


  // Load preview when inputs change
  useEffect(() => {
    const revoked: string | null = null;
    (async () => {
      if (!pdfArrayBuffer) return;
      // When fitToPage is off, use custom design size
      const designSizeMM = !job.fitToPage ? { width: job.designWidthMM || 100, height: job.designHeightMM || 100 } : undefined;
      const canvas = await renderPagePreview(
        pdfArrayBuffer,
        designPageForPreview,
        job.pageSizeMM,
        job.fitToPage,
        Math.round(DPI_PREVIEW * zoom),
        designSizeMM
      );
      const url = canvas.toDataURL("image/png");
      setPreviewUrl(url);
      if (revoked) URL.revokeObjectURL(revoked);
    })();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [pdfArrayBuffer, designPageForPreview, job.pageSizeMM.width, job.pageSizeMM.height, job.fitToPage, job.designWidthMM, job.designHeightMM, zoom]);

  // In multi-up mode, the cell background should match export (stretched to cell size).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pdfArrayBuffer || !job.multiUp?.enabled) {
        if (!cancelled) setMultiUpPreviewUrl(null);
        return;
      }
      const designWidthMM = job.multiUp.designWidthMM || 50;
      const designHeightMM = job.multiUp.designHeightMM || 30;
      const canvas = await renderPagePreviewStretched(
        pdfArrayBuffer,
        designPageForPreview,
        { width: designWidthMM, height: designHeightMM },
        Math.round(DPI_PREVIEW * zoom)
      );
      if (!cancelled) setMultiUpPreviewUrl(canvas.toDataURL("image/png"));
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfArrayBuffer, designPageForPreview, job.multiUp?.enabled, job.multiUp?.designWidthMM, job.multiUp?.designHeightMM, zoom]);

  useEffect(() => {
    const pc = pageCount || 1;
    setRangeEnd(pc);
    // applyCount is explicitly controlled by the user/CSV import and must not be auto-overridden on re-open.
  }, [pageCount]);

  // Reset workspace state when switching projects
  const [lastProjectId, setLastProjectId] = useState<string | null>(selectedProjectId);
  const [projectResetDone, setProjectResetDone] = useState(false);
  
  useEffect(() => {
    if (selectedProjectId !== lastProjectId) {
      // Clear workspace state for new project
      resetProject();
      setDesignFileId(null);
      setHydrated(false);
      setImportedNumbers([]);
      setCurrentNumberIndex(0);
      setLastProjectId(selectedProjectId);
      setProjectResetDone(true);
    }
  }, [selectedProjectId, lastProjectId, resetProject]);

  // Load project settings and (optionally) last design - automatically restores from latest history if available
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!selectedProjectId) return;
      
      // Wait for reset to complete on project switch
      if (selectedProjectId === lastProjectId && !projectResetDone && !hydrated) {
        // First load - no reset needed
      } else if (selectedProjectId === lastProjectId && !projectResetDone) {
        return; // Still waiting for reset
      }
      
      setProjectResetDone(false);
      setHydrated(false);

      // Fetch project and latest history item in parallel
      const [projectResult, historyResult] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, settings, next_code, current_design_file_id")
          .eq("id", selectedProjectId)
          .maybeSingle(),
        supabase
          .from("history_items")
          .select("*")
          .eq("project_id", selectedProjectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const data = projectResult.data;
      const latestHistory = historyResult.data;

      // Check if we should restore from history snapshot
      const snapshot = (latestHistory?.snapshot ?? null) as ProjectSnapshot | null;
      const hasValidSnapshot = snapshot && (snapshot.job || snapshot.barcode || snapshot.placementsByPage);

      const projectDesignFileId = data?.current_design_file_id || null;
      
      // Determine which design file to load - prefer history's design if available
      const designIdToLoad = hasValidSnapshot && snapshot?.designFileId 
        ? snapshot.designFileId 
        : projectDesignFileId;
      
      if (designIdToLoad) setDesignFileId(designIdToLoad);
      
      // Use history's next_code if available, otherwise project's
      if (hasValidSnapshot && typeof snapshot?.sequenceNextBody === "string") {
        setSequenceNext(snapshot.sequenceNextBody);
      } else if (data?.next_code) {
        setSequenceNext(data.next_code);
      }

      let effectiveJob = job;
      let savedPage = 1;

      if (hasValidSnapshot) {
        // Restore from the latest history snapshot for pixel-perfect re-open
        try {
          // Restore UI-only state (CSV + counts)
          const restoredImportedNumbers = Array.isArray(snapshot.importedNumbers) ? snapshot.importedNumbers : [];
          setImportedNumbers(restoredImportedNumbers);
          setCurrentNumberIndex(typeof snapshot.currentNumberIndex === "number" ? snapshot.currentNumberIndex : 0);

          if (typeof snapshot.digitsCount === "number") setDigitsCount(snapshot.digitsCount);

          // IMPORTANT: applyCount must restore exactly as saved
          if (typeof snapshot.applyCount === "number") {
            setApplyCount(Math.max(1, snapshot.applyCount));
          } else if (restoredImportedNumbers.length > 0) {
            setApplyCount(Math.max(1, restoredImportedNumbers.length));
          }

          if (typeof snapshot.currentPage === "number") savedPage = Math.max(1, snapshot.currentPage);
          setApplyToAll(typeof snapshot.applyToAllPages === "boolean" ? snapshot.applyToAllPages : true);

          if (snapshot.job) {
            const restoredJob = {
              ...snapshot.job,
              isInvoice: snapshot.job.isInvoice ?? false,
              pageNumber: snapshot.job.pageNumber ?? undefined,
            };
            setJob(restoredJob);
            effectiveJob = { ...effectiveJob, ...restoredJob };
          }
          if (snapshot.barcode) setBarcode(snapshot.barcode);
          if (snapshot.placementsByPage) useWorkspaceStore.setState({ placementsByPage: snapshot.placementsByPage });
        } catch (e) {
          console.warn("Failed to restore from history snapshot", e);
        }
      } else if (data?.settings) {
        // Fall back to project settings if no history
        try {
          const s = data.settings as ProjectSnapshot;

          // Restore UI-only state (CSV + counts) for perfect re-open
          if (typeof s.digitsCount === "number") setDigitsCount(s.digitsCount);

          const restoredImportedNumbers = Array.isArray(s.importedNumbers) ? (s.importedNumbers as string[]) : [];
          if (restoredImportedNumbers.length > 0) {
            setImportedNumbers(restoredImportedNumbers);
            setCurrentNumberIndex(typeof s.currentNumberIndex === "number" ? s.currentNumberIndex : 0);
          }

          const restoredApplyCount =
            typeof s.applyCount === "number"
              ? Math.max(1, s.applyCount)
              : restoredImportedNumbers.length > 0
                ? Math.max(1, restoredImportedNumbers.length)
                : undefined;
          if (typeof restoredApplyCount === "number") setApplyCount(restoredApplyCount);

          if (typeof s.currentPage === "number") savedPage = Math.max(1, s.currentPage);
          if (typeof s.applyToAllPages === "boolean") setApplyToAll(s.applyToAllPages);

          if (s.job) {
            // Ensure old projects get default values for new properties
            const restoredJob = {
              ...s.job,
              isInvoice: s.job.isInvoice ?? false,
              pageNumber: s.job.pageNumber ?? undefined,
            };
            setJob(restoredJob);
            effectiveJob = { ...effectiveJob, ...restoredJob };
          }
          if (s.barcode) setBarcode(s.barcode);
          if (s.placementsByPage) useWorkspaceStore.setState({ placementsByPage: s.placementsByPage });
        } catch {
          /* malformed project settings; fall through with defaults */
        }
      }

      // Load the design file (always load for this project)
      if (designIdToLoad) {
        try {
          const rec = await SupabaseStorageService.getFile(designIdToLoad);
          if (rec?.bytes && !cancelled) {
            const meta = await loadPdfMeta(rec.bytes);
            const thumbs: string[] = [];
            for (let i = 1; i <= meta.pageCount; i++) {
              const thumbCanvas = await renderPagePreview(rec.bytes, i, effectiveJob.pageSizeMM, effectiveJob.fitToPage, 72);
              thumbs.push(thumbCanvas.toDataURL("image/png"));
            }
            setPdf({ bytes: rec.bytes, name: rec.name, pageCount: meta.pageCount, pageSizes: meta.pageSizesMM, thumbnails: thumbs });
            setCurrentPage(Math.min(savedPage, meta.pageCount));
          }
        } catch {
          /* design file failed to load; leave the canvas empty */
        }
      }

      if (!cancelled) setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, projectResetDone]);

  // Consume pending CSV data from Projects page
  useEffect(() => {
    if (!hydrated) return;
    
    const pendingData = consumePendingCsvData();
    if (pendingData && pendingData.length > 0) {
      setImportedNumbers(pendingData);
      setCurrentNumberIndex(0);
      setApplyCount(pendingData.length);
    }
  }, [hydrated, consumePendingCsvData]);

  // Clean up legacy bulk-generated projects that accumulated placements for many pages.
  // Bulk outputs are typically named "... batch-###".
  // NOTE: We do NOT auto-clear importedNumbers anymore because batch projects should restore
  // the exact sheet values; users can clear CSV manually if they want to switch to sequential.
  useEffect(() => {
    if (!hydrated) return;
    if (!selectedProjectId) return;
    if (autoClearedCsvForProjectId.current === selectedProjectId) return;
    if (!selectedProjectName) return;

    if (!/batch-/i.test(selectedProjectName)) return;

    // CRITICAL FIX: Clean up polluted placementsByPage.
    // Template projects may have accumulated placements for many pages (1, 10, 100, etc.)
    // When applyToAllPages is true, only page 1 should have placements.
    const currentPlacements = placementsByPage;
    const pageKeys = Object.keys(currentPlacements);
    if (pageKeys.length > 1 || (pageKeys.length === 1 && pageKeys[0] !== "1")) {
      const page1Placements = currentPlacements[1] || currentPlacements["1"];
      if (page1Placements && Array.isArray(page1Placements) && page1Placements.length > 0) {
        useWorkspaceStore.setState({
          placementsByPage: { 1: page1Placements },
          applyToAllPages: true,
        });
      } else {
        const firstKey = pageKeys.sort((a, b) => Number(a) - Number(b))[0];
        const firstPlacements = currentPlacements[Number(firstKey)] || currentPlacements[firstKey];
        if (firstPlacements && Array.isArray(firstPlacements) && firstPlacements.length > 0) {
          useWorkspaceStore.setState({
            placementsByPage: { 1: firstPlacements },
            applyToAllPages: true,
          });
        }
      }
    }

    // If this is a multi-up template and applyCount is too small, the preview will only show
    // one cell populated. Ensure at least one full sheet is visible.
    const mu = job.multiUp;
    if (mu?.enabled) {
      const designWidthMM = mu.designWidthMM || 50;
      const designHeightMM = mu.designHeightMM || 30;
      const gapXMM = mu.gapXMM ?? 0;
      const gapYMM = mu.gapYMM ?? 0;
      const marginLeftMM = mu.marginLeftMM ?? 0;
      const marginRightMM = mu.marginRightMM ?? 0;
      const marginTopMM = mu.marginTopMM ?? 0;
      const marginBottomMM = mu.marginBottomMM ?? 0;

      const availableWidthMM = job.pageSizeMM.width - marginLeftMM - marginRightMM;
      const availableHeightMM = job.pageSizeMM.height - marginTopMM - marginBottomMM;

      const copiesPerRow = Math.max(1, Math.floor((availableWidthMM + gapXMM) / (designWidthMM + gapXMM)));
      const copiesPerCol = Math.max(1, Math.floor((availableHeightMM + gapYMM) / (designHeightMM + gapYMM)));
      const copiesPerPage = copiesPerRow * copiesPerCol;

      if (applyCount < copiesPerPage) setApplyCount(copiesPerPage);
    }

    autoClearedCsvForProjectId.current = selectedProjectId;
  }, [hydrated, selectedProjectId, selectedProjectName, placementsByPage, job.pageSizeMM.width, job.pageSizeMM.height, job.multiUp, applyCount]);

  // Auto-save project settings so reopening is pixel-perfect
  useEffect(() => {
    if (!selectedProjectId || !hydrated) return;

    const handle = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const settingsToSave = {
          job,
          barcode,
          placementsByPage,
          // UI-only state needed for exact restore
          importedNumbers,
          currentNumberIndex,
          applyCount,
          digitsCount,
          currentPage,
          applyToAllPages,
        } as unknown as Json;
        await supabase
          .from("projects")
          .update({
            settings: settingsToSave,
            next_code: sequenceNextBody || "0",
            current_design_file_id: designFileId,
          })
          .eq("id", selectedProjectId);
        setSaveState("saved");
      } catch (e) {
        console.warn("Auto-save failed", e);
        setSaveState("idle");
      }
    }, 700);

    return () => window.clearTimeout(handle);
  }, [selectedProjectId, hydrated, job, barcode, placementsByPage, sequenceNextBody, designFileId, importedNumbers, currentNumberIndex, applyCount, digitsCount, currentPage, applyToAllPages]);

  // Fade the "Saved" indicator back to idle after a short moment.
  useEffect(() => {
    if (saveState !== "saved") return;
    const handle = window.setTimeout(() => setSaveState("idle"), 1500);
    return () => window.clearTimeout(handle);
  }, [saveState]);

  // Load export history from Supabase
  useEffect(() => {
    (async () => {
      if (!selectedProjectId) {
        setHistory([]);
        return;
      }
      const { data, error } = await supabase
        .from("history_items")
        .select("*")
        .eq("project_id", selectedProjectId as string)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.warn("Failed to load history", error);
        return;
      }
      if (data) {
        const mapped = data.map((r) => ({
          id: r.id,
          timestamp: r.timestamp ?? Date.now(),
          designFileName: r.design_file_name,
          designFileId: r.design_file_id,
          pages: r.pages,
          barcodeValue: r.barcode_value,
          barcodeType: r.barcode_type as BarcodeType,
          showText: r.show_text,
          textBg: false,
          textSpacingMM: 2,
          fontFamily: r.font_family as HistoryItem["fontFamily"],
          fontSize: r.font_size,
          quietZoneMM: r.quiet_zone_mm,
          widthMM: r.width_mm,
          heightMM: r.height_mm,
          rotation: r.rotation,
          posXMM: r.pos_x_mm,
          posYMM: r.pos_y_mm,
          applyToAllPages: r.apply_to_all_pages,
          appliedPages: r.applied_pages,
          pageSizePreset: r.page_size_preset as PageSizePreset,
          pageWidthMM: r.page_width_mm,
          pageHeightMM: r.page_height_mm,
          fitToPage: r.fit_to_page,
          exportFileId: r.export_file_id || undefined,
          snapshot: r.snapshot || undefined,
        }) as HistoryItem);
        setHistory(mapped);
      }
    })();
  }, [selectedProjectId, setHistory]);

  const currentPlacements = useMemo(() => {
    // When "Apply to all pages" is enabled, placements are edited/stored on page 1.
    // Always prefer page 1 in that mode to avoid "empty currentPage" making the canvas non-editable.
    if (applyToAllPages) {
      return placementsByPage[1] ?? placementsByPage[currentPage] ?? [];
    }
    return placementsByPage[currentPage] ?? placementsByPage[1] ?? [];
  }, [placementsByPage, currentPage, applyToAllPages]);

  // Safety net: ensure there is always at least one placement to edit after opening a project.
  // This prevents projects with empty/null saved settings (or stale empty arrays) from appearing "not editable".
  useEffect(() => {
    if (!pdfArrayBuffer) return;

    if (applyToAllPages) {
      const p1 = placementsByPage[1] ?? [];
      const pc = placementsByPage[currentPage] ?? [];
      if (p1.length === 0 && pc.length === 0) {
        useWorkspaceStore.setState((s) => ({
          placementsByPage: { ...s.placementsByPage, 1: [createDefaultPlacement(s.barcode)] },
          selectedPlacementIndex: 0,
        }));
      }
      return;
    }

    const cur = placementsByPage[currentPage] ?? [];
    if (cur.length === 0) {
      useWorkspaceStore.setState((s) => ({
        placementsByPage: { ...s.placementsByPage, [currentPage]: [createDefaultPlacement(s.barcode)] },
        selectedPlacementIndex: 0,
      }));
    }
  }, [pdfArrayBuffer, applyToAllPages, currentPage, placementsByPage]);

  // Helper to compute barcode body for any absolute index (for per-cell previews)
  const getBarcodeBodyForIndex = useMemo(() => {
    const bodyLen = barcode.type === "ean13" ? 12 : digitsCount;

    const normalizeEanBody = (val: string) =>
      (val || "").replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0");

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

    return (absoluteIndex: number): string => {
      if (importedNumbers.length > 0) {
        const raw = importedNumbers[absoluteIndex % importedNumbers.length] ?? "";
        return barcode.type === "ean13" ? normalizeEanBody(raw) : raw;
      }

      if (barcode.type === "ean13") {
        const start = normalizeEanBody(sequenceNextBody || "");
        const v = (BigInt(start || "0") + BigInt(absoluteIndex)).toString();
        return v.padStart(bodyLen, "0");
      }

      const start = (sequenceNextBody || "").slice(0, bodyLen);
      return incrementAlphanumeric(start, absoluteIndex);
    };
  }, [barcode.type, digitsCount, importedNumbers, sequenceNextBody]);

  // For the current page preview (used for single-barcode preview in normal mode)
  const previewBarcodeBody = useMemo(() => {
    const idx = Math.max(0, currentPage - 1); // 0-based
    return getBarcodeBodyForIndex(idx);
  }, [currentPage, getBarcodeBodyForIndex]);

  // PERF (Fix B): a signature of ONLY the fields that change the rasterized barcode IMAGE
  // (value/type/separator + each placement's SIZE). Dragging changes a placement's x/y, which is
  // NOT in this signature, so moving a barcode no longer re-rasterizes every barcode PNG.
  const barcodeImageSignature = useMemo(() => {
    const sizes = currentPlacements
      .map((p) => `${p.id}:${p.widthMM || barcode.widthMM}x${p.heightMM || barcode.heightMM}`)
      .join("|");
    return [
      barcode.value,
      barcode.type,
      barcode.separator,
      (barcode.separatorPositions || []).join(","),
      barcode.widthMM,
      barcode.heightMM,
      barcode.rotation,
      sizes,
    ].join("~");
  }, [
    barcode.value,
    barcode.type,
    barcode.separator,
    barcode.separatorPositions,
    barcode.widthMM,
    barcode.heightMM,
    barcode.rotation,
    currentPlacements,
  ]);

  // Generate on-canvas barcode previews at the *actual* rendered size (so resizing feels flexible)
  // In multi-up mode, we generate a preview for EACH cell in the grid (each with unique barcode value)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const dpi = Math.round(DPI_PREVIEW * zoom);

        const multiUpEnabled = !!job.multiUp?.enabled;
        const origW = pageSizesMM[designPageForPreview - 1]?.width || job.pageSizeMM.width;
        const origH = pageSizesMM[designPageForPreview - 1]?.height || job.pageSizeMM.height;
        const designW = job.multiUp?.designWidthMM || 50;
        const designH = job.multiUp?.designHeightMM || 30;
        const scaleX = multiUpEnabled ? designW / origW : 1;
        const scaleY = multiUpEnabled ? designH / origH : 1;

        // Calculate copies per page for multi-up mode
        let copiesPerPage = 1;
        if (multiUpEnabled && job.multiUp) {
          const availableWidthMM = job.pageSizeMM.width - job.multiUp.marginLeftMM - job.multiUp.marginRightMM;
          const availableHeightMM = job.pageSizeMM.height - job.multiUp.marginTopMM - job.multiUp.marginBottomMM;
          const copiesPerRow = Math.max(1, Math.floor((availableWidthMM + job.multiUp.gapXMM) / (designW + job.multiUp.gapXMM)));
          const copiesPerCol = Math.max(1, Math.floor((availableHeightMM + job.multiUp.gapYMM) / (designH + job.multiUp.gapYMM)));
          copiesPerPage = copiesPerRow * copiesPerCol;
        }

        // Calculate the starting absolute index for current page
        const pageStartIndex = multiUpEnabled ? (currentPage - 1) * copiesPerPage : (currentPage - 1);

        if (multiUpEnabled) {
          // In multi-up mode: generate barcode preview for each cell in the grid
          const entries: [string, string][] = [];
          for (let cellIdx = 0; cellIdx < copiesPerPage; cellIdx++) {
            const absoluteIndex = pageStartIndex + cellIdx;
            const cellBarcodeBody = getBarcodeBodyForIndex(absoluteIndex);
            
            // Generate barcode for each placement in this cell
            for (let pIdx = 0; pIdx < currentPlacements.length; pIdx++) {
              const placement = currentPlacements[pIdx];
              const wMM = (placement.widthMM || barcode.widthMM) * scaleX;
              const hMM = (placement.heightMM || barcode.heightMM) * scaleY;
              const widthPx = mmToPx(wMM, dpi);
              const heightPx = mmToPx(hMM, dpi);

              const canvas = await generateBarcodeCanvas(
                { ...barcode, value: cellBarcodeBody },
                { widthPx, heightPx }
              );
              // Key format: "cell-{cellIdx}-placement-{pIdx}"
              entries.push([`cell-${cellIdx}-placement-${pIdx}`, canvas.toDataURL("image/png")]);
            }
          }
          if (!cancelled) setBarcodePreviews(Object.fromEntries(entries));
        } else {
          // Normal mode: one barcode per placement using the current page's value
          const entries = await Promise.all(
            currentPlacements.map(async (placement, idx) => {
              const wMM = (placement.widthMM || barcode.widthMM) * scaleX;
              const hMM = (placement.heightMM || barcode.heightMM) * scaleY;
              const widthPx = mmToPx(wMM, dpi);
              const heightPx = mmToPx(hMM, dpi);

              const canvas = await generateBarcodeCanvas(
                { ...barcode, value: previewBarcodeBody },
                { widthPx, heightPx }
              );
              return [placement.id || String(idx), canvas.toDataURL("image/png")] as const;
            })
          );
          if (!cancelled) setBarcodePreviews(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) setBarcodePreviews({});
      }
    })();

    return () => {
      cancelled = true;
    };
    // `barcode` and `currentPlacements` are read inside but intentionally NOT deps — only the
    // image-affecting subset (captured by barcodeImageSignature) should re-trigger rasterization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // PERF (Fix B): depend on a signature of image-affecting fields, NOT the whole `barcode`
    // object or full `currentPlacements`. Position-only (x/y) changes no longer re-rasterize.
    barcodeImageSignature,
    currentPage,
    designPageForPreview,
    digitsCount,
    getBarcodeBodyForIndex,
    job.multiUp?.enabled,
    job.multiUp?.designWidthMM,
    job.multiUp?.designHeightMM,
    job.multiUp?.marginLeftMM,
    job.multiUp?.marginRightMM,
    job.multiUp?.marginTopMM,
    job.multiUp?.marginBottomMM,
    job.multiUp?.gapXMM,
    job.multiUp?.gapYMM,
    job.pageSizeMM.width,
    job.pageSizeMM.height,
    pageSizesMM,
    previewBarcodeBody,
    zoom,
  ]);


  const currentPlacement = useMemo(() => {
    const defaultP = createDefaultPlacement(barcode);
    return currentPlacements[selectedPlacementIndex] || currentPlacements[0] || defaultP;
  }, [currentPlacements, selectedPlacementIndex, barcode.widthMM, barcode.heightMM, barcode.fontSize]);

  const pageHasPlacement = useMemo(() => {
    return currentPlacements.length > 0;
  }, [currentPlacements]);

  const cssFontFamily = useMemo(() => {
    switch (barcode.fontFamily) {
      case "TimesRoman":
        return '"Times New Roman", Times, serif';
      case "Courier":
        return '"Courier New", Courier, monospace';
      default:
        return 'Helvetica, Arial, sans-serif';
    }
  }, [barcode.fontFamily]);

  const hrText = useMemo(() => (barcode.value || "").split("").join(" "), [barcode.value]);

  const allowedStartLen = useMemo(() => (barcode.type === "ean13" ? 12 : digitsCount), [barcode.type, digitsCount]);

  const ean13CheckDigit = (body: string) => {
    const digits = body.split('').map((d) => parseInt(d, 10) || 0);
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }
    const mod = sum % 10;
    return String((10 - mod) % 10);
  };

  const previewCode = useMemo(() => {
    return barcode.type === "ean13"
      ? previewBarcodeBody + ean13CheckDigit(previewBarcodeBody)
      : previewBarcodeBody;
  }, [barcode.type, previewBarcodeBody]);

  // Multi-up grid calculation
  const multiUpGrid = useMemo(() => {
    if (!job.multiUp?.enabled) return null;
    
    // Use design dimensions from multiUp settings
    const designWidthMM = job.multiUp.designWidthMM || 50;
    const designHeightMM = job.multiUp.designHeightMM || 30;
    
    // Get the original page size (for calculating relative barcode positions)
    const origWidthMM = pageSizesMM[designPageForPreview - 1]?.width || job.pageSizeMM.width;
    const origHeightMM = pageSizesMM[designPageForPreview - 1]?.height || job.pageSizeMM.height;
    
    // Scale factors from original design to cell size
    const scaleX = designWidthMM / origWidthMM;
    const scaleY = designHeightMM / origHeightMM;
    
    const availableWidthMM = job.pageSizeMM.width - job.multiUp.marginLeftMM - job.multiUp.marginRightMM;
    const availableHeightMM = job.pageSizeMM.height - job.multiUp.marginTopMM - job.multiUp.marginBottomMM;
    
    const copiesPerRow = Math.max(1, Math.floor((availableWidthMM + job.multiUp.gapXMM) / (designWidthMM + job.multiUp.gapXMM)));
    const copiesPerCol = Math.max(1, Math.floor((availableHeightMM + job.multiUp.gapYMM) / (designHeightMM + job.multiUp.gapYMM)));
    const copiesPerPage = copiesPerRow * copiesPerCol;
    
    // Calculate the actual used width/height
    const usedWidthMM = copiesPerRow * designWidthMM + (copiesPerRow - 1) * job.multiUp.gapXMM;
    const usedHeightMM = copiesPerCol * designHeightMM + (copiesPerCol - 1) * job.multiUp.gapYMM;
    
    // Calculate offset based on alignment settings
    const alignH = job.multiUp.designAlignH || "center";
    const alignV = job.multiUp.designAlignV || "center";
    
    let offsetXMM = job.multiUp.marginLeftMM;
    if (alignH === "center") {
      offsetXMM += (availableWidthMM - usedWidthMM) / 2;
    } else if (alignH === "right") {
      offsetXMM += availableWidthMM - usedWidthMM;
    }
    // alignH === "left" means offsetXMM stays at marginLeftMM
    
    let offsetYMM = job.multiUp.marginTopMM;
    if (alignV === "center") {
      offsetYMM += (availableHeightMM - usedHeightMM) / 2;
    } else if (alignV === "bottom") {
      offsetYMM += availableHeightMM - usedHeightMM;
    }
    // alignV === "top" means offsetYMM stays at marginTopMM
    
    // Generate grid positions (centered)
    const positions: { x: number; y: number }[] = [];
    for (let row = 0; row < copiesPerCol; row++) {
      for (let col = 0; col < copiesPerRow; col++) {
        positions.push({
          x: offsetXMM + col * (designWidthMM + job.multiUp.gapXMM),
          y: offsetYMM + row * (designHeightMM + job.multiUp.gapYMM),
        });
      }
    }
    
    return {
      designWidthMM,
      designHeightMM,
      origWidthMM,
      origHeightMM,
      scaleX,
      scaleY,
      copiesPerRow,
      copiesPerCol,
      copiesPerPage,
      positions,
    };
  }, [job.multiUp, job.pageSizeMM, pageSizesMM, designPageForPreview]);

  // Width/height ratio of the uploaded design; with "Keep design ratio" on, the multi-up cell
  // height follows the width so the design is never stretched (also fixes older projects).
  const designRatio = useMemo(() => {
    const p = pageSizesMM[designPageForPreview - 1];
    return p && p.width > 0 && p.height > 0 ? p.width / p.height : null;
  }, [pageSizesMM, designPageForPreview]);
  useEffect(() => {
    const mu = job.multiUp;
    if (!mu?.enabled || !designRatio || !(mu.keepRatio ?? true)) return;
    const w = mu.designWidthMM || 50;
    const h = Math.round((w / designRatio) * 10) / 10;
    if (Math.abs((mu.designHeightMM || 30) - h) > 0.05) setJob({ multiUp: { ...mu, designWidthMM: w, designHeightMM: h } });
  }, [designRatio, job.multiUp, setJob]);
  
  // Format barcode text with separators
  const formatWithSeparator = (code: string) => {
    if (!barcode.separator || !barcode.separatorPositions || barcode.separatorPositions.length === 0) {
      return code;
    }
    const chars = code.split("");
    const positions = [...barcode.separatorPositions].sort((a, b) => b - a);
    for (const pos of positions) {
      if (pos > 0 && pos < chars.length) {
        chars.splice(pos, 0, barcode.separator);
      }
    }
    return chars.join("");
  };
  
  const formattedPreviewCode = useMemo(() => formatWithSeparator(previewCode), [previewCode, barcode.separator, barcode.separatorPositions]);
  
  // UI collapse states
  const [pageSetupOpen, setPageSetupOpen] = useState(true);
  const [barcodeSettingsOpen, setBarcodeSettingsOpen] = useState(true);
  const [placementsOpen, setPlacementsOpen] = useState(false);

  const onFileChange = async (file?: File) => {
    if (!file) return;
    const bytes = await file.arrayBuffer();

    const persistDesign = async (designBytes: ArrayBuffer, designName: string) => {
      if (!selectedProjectId) return;
      try {
        const id = await SupabaseStorageService.saveFile({
          name: designName,
          mime: "application/pdf",
          bytes: designBytes,
        });
        setDesignFileId(id);
        await supabase.from("projects").update({ current_design_file_id: id }).eq("id", selectedProjectId);
      } catch (e) {
        console.warn("Failed to persist design file", e);
      }
    };

    try {
      const meta = await loadPdfMeta(bytes);

      // generate thumbnails
      const thumbs: string[] = [];
      for (let i = 1; i <= meta.pageCount; i++) {
        const thumbCanvas = await renderPagePreview(bytes, i, job.pageSizeMM, job.fitToPage, 72);
        thumbs.push(thumbCanvas.toDataURL("image/png"));
      }

      setPdf({ bytes, name: file.name, pageCount: meta.pageCount, pageSizes: meta.pageSizesMM, thumbnails: thumbs });
      
      // Auto-populate design dimensions from the first page's actual size
      const firstPageSize = meta.pageSizesMM[0];
      if (firstPageSize) {
        setJob({ 
          designWidthMM: Math.round(firstPageSize.width * 10) / 10, 
          designHeightMM: Math.round(firstPageSize.height * 10) / 10 
        });
      }
      
      await persistDesign(bytes, file.name);
    } catch (err: unknown) {
      console.error("PDF load error", err);
      try {
        // Fallback: parse with pdf-lib and show blank previews so user can still place + export
        const doc = await PDFDocument.load(bytes);
        const pages = doc.getPageCount();
        const thumbs: string[] = [];
        for (let i = 1; i <= pages; i++) {
          const c = document.createElement("canvas");
          c.width = Math.round(mmToPx(job.pageSizeMM.width, 72));
          c.height = Math.round(mmToPx(job.pageSizeMM.height, 72));
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, c.width, c.height);
          thumbs.push(c.toDataURL("image/png"));
        }
        setPdf({ bytes, name: file.name, pageCount: pages, pageSizes: Array(pages).fill({ ...job.pageSizeMM }), thumbnails: thumbs });
        // Set design dimensions to page size in fallback mode
        setJob({ designWidthMM: job.pageSizeMM.width, designHeightMM: job.pageSizeMM.height });
        await persistDesign(bytes, file.name);
      } catch (e2: unknown) {
        console.error("Fallback failed", e2);
      }
    }
  };
  const onApplyCurrent = () => {
    // no-op: placement is already tracked as you drag. This button just ensures applyToAll is off
    setApplyToAll(false);
  };

  const onApplyAll = () => {
    const basePlacements = currentPlacements.length > 0 ? currentPlacements : [createDefaultPlacement(barcode)];
    setApplyToAll(true);
    const count = Math.max(1, Math.min(applyCount, pageCount));
    useWorkspaceStore.setState((s) => {
      const updated = { ...s.placementsByPage } as typeof s.placementsByPage;
      for (let i = 1; i <= count; i++) updated[i] = basePlacements.map(p => ({ ...p, id: crypto.randomUUID() }));
      return { placementsByPage: updated };
    });
  };
  const onApplyRange = () => {
    const basePlacements = currentPlacements.length > 0 ? currentPlacements : (placementsByPage[1] || [createDefaultPlacement(barcode)]);
    const start = Math.max(1, Math.min(rangeStart, pageCount));
    const end = Math.max(1, Math.min(rangeEnd, pageCount));
    const s = Math.min(start, end);
    const e = Math.max(start, end);
    useWorkspaceStore.setState((st) => {
      const updated = { ...st.placementsByPage } as typeof st.placementsByPage;
      for (let i = s; i <= e; i++) updated[i] = basePlacements.map(p => ({ ...p, id: crypto.randomUUID() }));
      return { placementsByPage: updated };
    });
    setApplyToAll(false);
  };

  const handleCsvImport = (values: string[]) => {
    setImportedNumbers(values);
    setCurrentNumberIndex(0);
    if (values.length > 0) {
      // Set the sequence to use the first imported value
      setSequenceNext(values[0]);
      
      // Set the pages to generate count to match CSV count
      setApplyCount(values.length);
      
      // Apply to all pages with the current placements
      const basePlacements = currentPlacements.length > 0 ? currentPlacements : (placementsByPage[1] || [createDefaultPlacement(barcode)]);
      useWorkspaceStore.setState((s) => {
        const updated = { ...s.placementsByPage } as typeof s.placementsByPage;
        for (let i = 1; i <= values.length; i++) updated[i] = basePlacements.map(p => ({ ...p, id: crypto.randomUUID() }));
        return { placementsByPage: updated };
      });
      setApplyToAll(true);
      
    }
  };

  const onExport = async () => {
    if (!pdfArrayBuffer) return;
    const placements = { ...placementsByPage };
    if (Object.keys(placements).length === 0) return;
    
    setIsExporting(true);
    setExportStartTime(Date.now());
    setExportElapsed(0);
    
    try {
      // Determine exported pages: if applying to all, repeat first page to match requested count
      const count = applyToAllPages ? Math.max(1, applyCount) : Object.keys(placements).length;
      const selectedPages = applyToAllPages
        ? Array.from({ length: count }, () => currentPage)
        : Object.keys(placements).map((k) => Number(k)).sort((a, b) => a - b);

      // Generate per-page barcode values
      const bodyLen = barcode.type === "ean13" ? 12 : digitsCount;
      let pageBarcodeValues: string[];

      if (importedNumbers.length > 0) {
        // Use exactly the imported numbers - one number per page
        // Use as-is for Code128/QR, truncate only for EAN-13
        pageBarcodeValues = importedNumbers.slice(0, count).map((num) => {
          if (barcode.type === "ean13") {
            return num.replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0");
          }
          return num;
        });

        // If we need more pages than numbers, repeat the sequence
        while (pageBarcodeValues.length < count) {
          const remainingNeeded = count - pageBarcodeValues.length;
          const additionalNumbers = importedNumbers.slice(0, remainingNeeded).map((num) => {
            if (barcode.type === "ean13") {
              return num.replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0");
            }
            return num;
          });
          pageBarcodeValues.push(...additionalNumbers);
        }
      } else {
        // Use sequential generation - EAN-13 requires digits; Code128/QR can use alphanumeric
        if (barcode.type === "ean13") {
          const start = (sequenceNextBody || "").replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0");
          const incString = (n: number) => {
            const v = (BigInt(start || "0") + BigInt(n)).toString();
            return v.padStart(bodyLen, "0");
          };
          pageBarcodeValues = selectedPages.map((_, idx) => incString(idx));
        } else {
          // For Code128/QR: increment alphanumeric sequences
          const start = (sequenceNextBody || "").slice(0, bodyLen);
          const incrementAlphanumeric = (str: string, n: number): string => {
            if (!str) return str;
            // Check if it's purely numeric - use BigInt for large numbers
            if (/^\d+$/.test(str)) {
              const v = (BigInt(str) + BigInt(n)).toString();
              return v.padStart(str.length, "0");
            }
            // For alphanumeric: increment the trailing number portion
            const match = str.match(/^(.*?)(\d+)$/);
            if (match) {
              const prefix = match[1];
              const numPart = match[2];
              const incremented = (BigInt(numPart) + BigInt(n)).toString().padStart(numPart.length, "0");
              return prefix + incremented;
            }
            // No numeric suffix - just return as-is for first, append index for rest
            return n === 0 ? str : str + n;
          };
          pageBarcodeValues = selectedPages.map((_, idx) => incrementAlphanumeric(start, idx));
        }
      }

      // Debug logging for CSV export troubleshooting
      console.log("[Export] importedNumbers:", importedNumbers.length, importedNumbers.slice(0, 5));
      console.log("[Export] pageBarcodeValues:", pageBarcodeValues.length, pageBarcodeValues.slice(0, 5));
      console.log("[Export] applyToAllPages:", applyToAllPages, "applyCount:", applyCount, "count:", count);

      const sourcePageForExport = selectedPages[0] ?? currentPage;
      const sourcePageSizeMM = pageSizesMM[sourcePageForExport - 1];

      // 1) Generate the PDF (must succeed)
      const out = await exportMergedPdf({
        originalBytes: pdfArrayBuffer,
        pageCount,
        targetPageMM: job.pageSizeMM,
        fitToPage: job.fitToPage,
        designSizeMM:
          !job.fitToPage && !job.multiUp?.enabled
            ? { width: job.designWidthMM || 100, height: job.designHeightMM || 100 }
            : undefined,
        placements,
        applyToAll: applyToAllPages,
        barcode,
        selectedPages,
        pageBarcodeValues,
        multiUp: job.multiUp,
        sourcePageSizeMM,
        canvasColor: job.canvasColor,
        pageNumber: job.isInvoice ? job.pageNumber : undefined,
      });

      const blob = new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
      const exportName = `${selectedProjectName || pdfName?.replace(/\.pdf$/i, "") || "export"}.pdf`;

      // 2) Download immediately (even if saving fails)
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportName;
      a.click();
      URL.revokeObjectURL(url);

      // 3) Advance sequence locally
      if (importedNumbers.length === 0) {
        const start = (sequenceNextBody || "").replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0");
        const nextBase = (BigInt(start || "0") + BigInt(count)).toString().padStart(bodyLen, "0");
        setSequenceNext(nextBase);
      }

      // 4) Save to history/storage in background; never block the download
      void (async () => {
        try {
          const designId = await SupabaseStorageService.saveFile({
            name: pdfName || "design.pdf",
            mime: "application/pdf",
            bytes: pdfArrayBuffer as ArrayBuffer,
          });

          const exportId = await SupabaseStorageService.saveFile({
            name: exportName,
            mime: "application/pdf",
            bytes: out.buffer as ArrayBuffer,
          });

          const historyPlacements = applyToAllPages
            ? (placementsByPage[1] || placementsByPage[currentPage])
            : placementsByPage[currentPage];
          const placement = historyPlacements?.[0] || { xMM: 10, yMM: 10, id: "" };

          const snapshot = {
            job,
            barcode,
            placementsByPage,
            sequenceNextBody: sequenceNextBody || "",
            designFileId: designId,
            pdfName: pdfName || "design.pdf",
            importedNumbers,
            currentNumberIndex,
            applyCount,
            digitsCount,
            currentPage,
            applyToAllPages,
          };

          addHistory({
            id: Math.random().toString(36).slice(2),
            timestamp: Date.now(),
            designFileName: pdfName || "design.pdf",
            designFileId: designId,
            pages: pageCount,
            barcodeValue: barcode.value,
            barcodeType: barcode.type,
            showText: barcode.showText,
            textBg: barcode.textBg,
            fontFamily: barcode.fontFamily,
            fontSize: barcode.fontSize,
            textSpacingMM: barcode.textSpacingMM,
            quietZoneMM: barcode.quietZoneMM,
            widthMM: barcode.widthMM,
            heightMM: barcode.heightMM,
            rotation: barcode.rotation,
            posXMM: placement.xMM,
            posYMM: placement.yMM,
            applyToAllPages,
            appliedPages: selectedPages,
            pageSizePreset: job.pageSizePreset,
            pageWidthMM: job.pageSizeMM.width,
            pageHeightMM: job.pageSizeMM.height,
            fitToPage: job.fitToPage,
            exportFileId: exportId,
            sequenceStart:
              importedNumbers.length > 0
                ? pageBarcodeValues[0]
                : (sequenceNextBody || "").replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0"),
            snapshot,
          });

          if (!selectedProjectId) return;

          await supabase.from("history_items").insert([
            {
              project_id: selectedProjectId,
              design_file_name: pdfName || "design.pdf",
              design_file_id: designId,
              export_file_id: exportId,
              pages: pageCount,
              barcode_value: barcode.value,
              barcode_type: barcode.type,
              show_text: barcode.showText,
              font_family: barcode.fontFamily,
              font_size: barcode.fontSize,
              quiet_zone_mm: barcode.quietZoneMM,
              width_mm: barcode.widthMM,
              height_mm: barcode.heightMM,
              rotation: barcode.rotation,
              pos_x_mm: placement.xMM,
              pos_y_mm: placement.yMM,
              apply_to_all_pages: applyToAllPages,
              applied_pages: selectedPages,
              page_size_preset: job.pageSizePreset,
              page_width_mm: job.pageSizeMM.width,
              page_height_mm: job.pageSizeMM.height,
              fit_to_page: job.fitToPage,
              sequence_start:
                importedNumbers.length > 0
                  ? pageBarcodeValues[0]
                  : (sequenceNextBody || "").replace(/[^0-9]/g, "").slice(0, bodyLen).padStart(bodyLen, "0"),
              snapshot: snapshot as unknown as Json,
              timestamp: Date.now(),
            },
          ]);
        } catch (e) {
          console.warn("Export downloaded, but failed to save to history/storage", e);
        }
      })();

      setApplyToAll(false);
      setApplyCount(1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
      setExportStartTime(null);
    }
  };
  
  // Format elapsed time as mm:ss
  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // History actions (extracted from inline JSX handlers; behavior unchanged)
  const handleHistoryDelete = async (id: string) => {
    // Delete from database first
    await supabase.from("history_items").delete().eq("id", id);
    // Then remove from local store
    deleteHistory(id);
  };

  const handleHistoryDownload = async (h: HistoryItem) => {
    const file = await SupabaseStorageService.getFile(h.exportFileId!);
    if (!file) return;
    const blob = new Blob([file.bytes], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleHistoryReopen = async (h: HistoryItem) => {
    // Reset any active interactions so restored placements behave predictably
    setDragging(false);
    setResizing(false);
    dragStart.current = null;
    resizeStart.current = null;

    const snapshot = h.snapshot as ProjectSnapshot | undefined;

    const designIdToLoad = snapshot?.designFileId || h.designFileId;
    const design = await SupabaseStorageService.getFile(designIdToLoad);
    if (!design) return;

    // Restore UI-only state (CSV + counts)
    const restoredImportedNumbers = Array.isArray(snapshot?.importedNumbers) ? snapshot.importedNumbers : [];
    setImportedNumbers(restoredImportedNumbers);
    setCurrentNumberIndex(typeof snapshot?.currentNumberIndex === "number" ? snapshot.currentNumberIndex : 0);

    if (typeof snapshot?.digitsCount === "number") setDigitsCount(snapshot.digitsCount);

    // IMPORTANT: applyCount must restore exactly as saved (can be > CSV length if repeating)
    if (typeof snapshot?.applyCount === "number") {
      setApplyCount(Math.max(1, snapshot.applyCount));
    } else if (restoredImportedNumbers.length > 0) {
      setApplyCount(Math.max(1, restoredImportedNumbers.length));
    } else {
      setApplyCount(Math.max(1, h.pages || 1));
    }

    // Restore editor state
    if (snapshot?.job) setJob(snapshot.job);
    if (snapshot?.barcode) setBarcode(snapshot.barcode);
    if (snapshot?.placementsByPage) useWorkspaceStore.setState({ placementsByPage: snapshot.placementsByPage });
    if (typeof snapshot?.sequenceNextBody === "string") setSequenceNext(snapshot.sequenceNextBody);

    setApplyToAll(typeof snapshot?.applyToAllPages === "boolean" ? snapshot.applyToAllPages : !!h.applyToAllPages);
    setDesignFileId(designIdToLoad);

    const jobForThumbs = snapshot?.job || { pageSizeMM: { width: h.pageWidthMM, height: h.pageHeightMM }, fitToPage: h.fitToPage };

    // Rebuild thumbnails using the *restored* job settings
    const meta = await loadPdfMeta(design.bytes);
    const thumbs: string[] = [];
    for (let i = 1; i <= meta.pageCount; i++) {
      const c = await renderPagePreview(design.bytes, i, jobForThumbs.pageSizeMM, jobForThumbs.fitToPage, 72);
      thumbs.push(c.toDataURL("image/png"));
    }
    setPdf({ bytes: design.bytes, name: design.name, pageCount: meta.pageCount, pageSizes: meta.pageSizesMM, thumbnails: thumbs });

    // Restore current page + selection after PDF hydrates
    const restorePage = typeof snapshot?.currentPage === "number" ? snapshot.currentPage : 1;
    setCurrentPage(Math.min(Math.max(1, restorePage), meta.pageCount));
    setSelectedPlacementIndex(0);

    // If no snapshot (older history), fall back to legacy fields
    if (!snapshot) {
      setJob({ pageSizePreset: h.pageSizePreset, pageSizeMM: { width: h.pageWidthMM, height: h.pageHeightMM }, fitToPage: h.fitToPage });
      setBarcode({
        value: h.barcodeValue,
        type: h.barcodeType,
        showText: h.showText,
        textBg: h.textBg,
        fontFamily: h.fontFamily,
        fontSize: h.fontSize,
        textSpacingMM: h.textSpacingMM,
        quietZoneMM: h.quietZoneMM,
        widthMM: h.widthMM,
        heightMM: h.heightMM,
        rotation: h.rotation as BarcodeSettings["rotation"],
      });
      setDigitsCount(h.barcodeType === "ean13" ? 13 : (h.barcodeValue || "").length);
      setSequenceNext(h.sequenceStart || (h.barcodeValue || "").replace(/[^0-9]/g, ""));
      setApplyToAll(h.applyToAllPages);
      useWorkspaceStore.setState((s) => ({
        placementsByPage: {
          ...s.placementsByPage,
          1: [
            {
              xMM: h.posXMM,
              yMM: h.posYMM,
              widthMM: h.widthMM,
              heightMM: h.heightMM,
              fontSize: h.fontSize,
              id: crypto.randomUUID(),
              showText: h.showText ?? true,
              textBgColor: "",
              textColor: "#000000",
              textPosition: "bottom" as const,
              bold: false,
              italic: false,
              underline: false,
              codeOnly: false,
            },
          ],
        },
      }));
    }
  };

  // Dragging logic inside preview area
  const previewRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Mouse navigation in the preview: middle button drags the page around, Ctrl + wheel zooms
  // around the mouse pointer. Native listeners so the wheel can stop the browser's page zoom.
  const zoomAnchor = useRef<{ cx: number; cy: number; mx: number; my: number; ratio: number } | null>(null);
  const navAttached = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || navAttached.current === el) return;
    navAttached.current = el;
    let pan: { x: number; y: number; left: number; top: number; id: number } | null = null;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const z = useWorkspaceStore.getState().zoom;
      const step = Math.min(Math.abs(e.deltaY), 100) / 100; // trackpads send small steps
      const next = clamp(z * (e.deltaY < 0 ? 1 + 0.15 * step : 1 / (1 + 0.15 * step)), 0.25, 4);
      if (next === z) return;
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      zoomAnchor.current = { cx: el.scrollLeft + mx, cy: el.scrollTop + my, mx, my, ratio: next / z };
      useWorkspaceStore.getState().setZoom(next);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault(); // no auto-scroll cursor
      pan = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!pan) return;
      el.scrollLeft = pan.left - (e.clientX - pan.x);
      el.scrollTop = pan.top - (e.clientY - pan.y);
    };
    const onUp = () => {
      if (!pan) return;
      try { el.releasePointerCapture(pan.id); } catch { /* already released */ }
      pan = null;
      el.style.cursor = "";
    };
    const noAux = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("mousedown", noAux);
    el.addEventListener("auxclick", noAux);
  });
  // After a Ctrl+wheel zoom, keep the spot under the mouse in place.
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const el = scrollRef.current;
    if (!a || !el) return;
    zoomAnchor.current = null;
    el.scrollLeft = a.cx * a.ratio - a.mx;
    el.scrollTop = a.cy * a.ratio - a.my;
  }, [zoom]);

  const handleFit = () => {
    const cont = scrollRef.current;
    if (!cont) return;
    const baseW = mmToPx(job.pageSizeMM.width, DPI_PREVIEW);
    const baseH = mmToPx(job.pageSizeMM.height, DPI_PREVIEW);
    // Account for padding/rulers (approximately 40px for ruler)
    const availW = cont.clientWidth - 50;
    const availH = cont.clientHeight - 50;
    if (baseW <= 0 || baseH <= 0 || availW <= 0 || availH <= 0) return;
    const fitW = availW / baseW;
    const fitH = availH / baseH;
    const fit = Math.min(fitW, fitH);
    setZoom(clamp(fit * 0.95, 0.25, 4)); // 95% to add a bit of margin
  };

  const onMouseDown = (e: React.PointerEvent, placementIdx: number) => {
    if (!previewRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedPlacementIndex(placementIdx);
    setDragging(true);
    const overlay = currentPlacements[placementIdx] || createDefaultPlacement(barcode);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      origX: overlay.xMM,
      origY: overlay.yMM,
    };
  };
  const onMouseMove = (e: React.PointerEvent) => {
    if (!previewRef.current) return;

    const pxPerMM = mmToPx(1, Math.round(DPI_PREVIEW * zoom));

    // Page number dragging
    if (draggingPageNumber && pageNumDragStart.current) {
      const dxPx = e.clientX - pageNumDragStart.current.x;
      const dyPx = e.clientY - pageNumDragStart.current.y;
      const dxMM = dxPx / pxPerMM;
      const dyMM = dyPx / pxPerMM;
      const newX = clamp(pageNumDragStart.current.origX + dxMM, 0, job.pageSizeMM.width - 20);
      const newY = clamp(pageNumDragStart.current.origY + dyMM, 0, job.pageSizeMM.height - 10);
      setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), xMM: newX, yMM: newY } });
      return;
    }

    if (resizing && resizeStart.current) {
      const dxPx = e.clientX - resizeStart.current.mx;
      const dyPx = e.clientY - resizeStart.current.my;
      const dxMM = dxPx / pxPerMM;
      const dyMM = dyPx / pxPerMM;

      // When rotated, resize should happen in the barcode's *local* axes.
      // CSS transform rotates clockwise, so we invert the rotation matrix (negative angle).
      const angleRad = -(barcode.rotation * Math.PI) / 180;
      const dxLocalMM = dxMM * Math.cos(angleRad) - dyMM * Math.sin(angleRad);
      const dyLocalMM = dxMM * Math.sin(angleRad) + dyMM * Math.cos(angleRad);

      const currentPl = currentPlacements[selectedPlacementIndex] || createDefaultPlacement(barcode);
      // Use design size for bounds when fitToPage is off
      const boundsW = !job.fitToPage ? (job.designWidthMM || job.pageSizeMM.width) : job.pageSizeMM.width;
      const boundsH = !job.fitToPage ? (job.designHeightMM || job.pageSizeMM.height) : job.pageSizeMM.height;
      const maxW = boundsW - currentPl.xMM;
      const maxH = boundsH - currentPl.yMM;
      const newW = clamp(resizeStart.current.w + dxLocalMM, 5, maxW);
      const newH = clamp(resizeStart.current.h + dyLocalMM, 5, maxH);
      // PERF (Fix A): update local live size only; commit to the store on pointer-up.
      setResizeLive({ placementIndex: selectedPlacementIndex, widthMM: newW, heightMM: newH });
      return;
    }

    if (!dragging || !dragStart.current) return;
    const dxPx = e.clientX - dragStart.current.x;
    const dyPx = e.clientY - dragStart.current.y;
    const dxMM = dxPx / pxPerMM;
    const dyMM = dyPx / pxPerMM;

    const newX = dragStart.current.origX + dxMM;
    const newY = dragStart.current.origY + dyMM;

    const placementW = currentPlacements[selectedPlacementIndex]?.widthMM || barcode.widthMM;
    const placementH = currentPlacements[selectedPlacementIndex]?.heightMM || barcode.heightMM;

    // Use design size for bounds when fitToPage is off
    const boundsW = !job.fitToPage ? (job.designWidthMM || job.pageSizeMM.width) : job.pageSizeMM.width;
    const boundsH = !job.fitToPage ? (job.designHeightMM || job.pageSizeMM.height) : job.pageSizeMM.height;
    const maxX = boundsW - placementW;
    const maxY = boundsH - placementH;

    // PERF (Fix A): update local live position only; commit to the store on pointer-up.
    setDragLive({ placementIndex: selectedPlacementIndex, xMM: clamp(newX, 0, maxX), yMM: clamp(newY, 0, maxY) });
  };
  const onMouseUp = () => {
    // PERF (Fix A): commit the final live drag/resize value to the store exactly once.
    // Same clamped numbers, same applyToAllPages routing (via setPlacement) as before.
    if (dragging && dragLive) {
      setPlacement(currentPage, dragLive.placementIndex, { xMM: dragLive.xMM, yMM: dragLive.yMM });
    }
    if (resizing && resizeLive) {
      setPlacement(currentPage, resizeLive.placementIndex, { widthMM: resizeLive.widthMM, heightMM: resizeLive.heightMM });
    }
    setDragLive(null);
    setResizeLive(null);
    setDragging(false);
    dragStart.current = null;
    setResizing(false);
    resizeStart.current = null;
    setDraggingPageNumber(false);
    pageNumDragStart.current = null;
  };

  // PERF (Fix A): return the placement's render values, overlaid with the in-progress live
  // drag/resize for the placement currently being manipulated. Store values are used otherwise.
  const effectivePlacement = (placement: Placement, idx: number): Placement => {
    let p = placement;
    if (dragLive && dragLive.placementIndex === idx) {
      p = { ...p, xMM: dragLive.xMM, yMM: dragLive.yMM };
    }
    if (resizeLive && resizeLive.placementIndex === idx) {
      p = { ...p, widthMM: resizeLive.widthMM, heightMM: resizeLive.heightMM };
    }
    return p;
  };

  // Ruler ticks
  const ticksX = useMemo(() => {
    const arr: number[] = [];
    for (let x = 0; x <= job.pageSizeMM.width; x += 10) arr.push(x);
    return arr;
  }, [job.pageSizeMM.width]);
  const ticksY = useMemo(() => {
    const arr: number[] = [];
    for (let y = 0; y <= job.pageSizeMM.height; y += 10) arr.push(y);
    return arr;
  }, [job.pageSizeMM.height]);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      
      {/* Sidebar */}
      <aside className={`app-sidebar custom-scrollbar transition-transform duration-300 ${sidebarOpen ? 'open' : ''} ${leftCollapsed ? 'lg:-translate-x-full' : ''}`}>
        {/* Logo */}
        <div className="px-6 py-5 flex items-center gap-3 border-b border-sidebar-border">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-400 flex items-center justify-center">
            <Barcode className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">BarcodeGo</h1>
            <p className="text-[10px] text-muted-foreground">PDF Overlay Tool</p>
          </div>
        </div>

        {/* Project Info */}
        <div className="px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start gap-2 text-muted-foreground hover:text-foreground h-auto py-2"
              onClick={() => {
                const folderId = useProjectStore.getState().selectedFolderId;
                clearProject();
                navigate("/projects", { state: { folderId } });
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs">Back to Projects</span>
            </Button>
            {/* Collapse the panel (desktop) — an expand button appears in the canvas header */}
            <Button
              variant="ghost"
              size="sm"
              className="hidden lg:inline-flex h-8 w-8 p-0 shrink-0 text-muted-foreground"
              onClick={toggleLeftCollapsed}
              title="Hide settings panel"
              aria-label="Hide settings panel"
            >
              <PanelLeftClose className="h-5 w-5" />
            </Button>
          </div>
          <div className="mt-3 p-3 rounded-xl bg-sidebar-accent">
            <p className="text-sm font-semibold text-sidebar-accent-foreground truncate">
              {selectedProjectName || "Untitled Project"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{pdfName || "No design loaded"}</p>
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {/* Upload Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileUp className="h-4 w-4 text-primary" />
              <span>Design File</span>
            </div>
            <div className="relative">
              <Input 
                accept=".pdf,application/pdf" 
                type="file" 
                onChange={(e) => onFileChange(e.target.files?.[0])}
                className="file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer text-xs"
              />
            </div>
            {pdfName && (
              <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
                <div className="h-8 w-8 bg-primary/10 rounded flex items-center justify-center">
                  <FileUp className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{pdfName}</p>
                  <p className="text-xs text-muted-foreground">{pageCount} page{pageCount !== 1 ? 's' : ''}</p>
                </div>
              </div>
            )}
          </div>

          {/* Pages to Generate - Top Priority */}
          <div className="space-y-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers className="h-4 w-4 text-primary" />
              <span>Pages to Generate</span>
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label className="text-xs">Count</Label>
              <Input 
                type="number" 
                className="h-8 text-xs"
                min={1} 
                max={500} 
                value={applyCount} 
                disabled={importedNumbers.length > 0}
                onChange={(e) => {
                  if (importedNumbers.length > 0) return;
                  const raw = Number(e.target.value) || 1;
                  const count = Math.max(1, Math.min(raw, 500));
                  setApplyCount(count);
                  const basePlacements = currentPlacements.length > 0 ? currentPlacements : (placementsByPage[1] || [createDefaultPlacement(barcode)]);
                  useWorkspaceStore.setState((s) => {
                    const updated = { ...s.placementsByPage } as typeof s.placementsByPage;
                    for (let i = 1; i <= Math.min(count, s.pageCount || 1); i++) updated[i] = basePlacements.map(p => ({ ...p, id: crypto.randomUUID() }));
                    return { placementsByPage: updated };
                  });
                  setApplyToAll(true);
                }} 
              />
            </div>
            {importedNumbers.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Count locked to CSV size ({importedNumbers.length})
              </div>
            )}
          </div>

          <Separator className="bg-sidebar-border" />

          {/* Page Setup Section */}
          <PageSetupSection
            designRatio={designRatio}
            pageSetupOpen={pageSetupOpen}
            setPageSetupOpen={setPageSetupOpen}
            job={job}
            setJob={setJob}
          />

            <Separator />

            {/* Barcode Section */}
            <BarcodeSettingsSection
              barcodeSettingsOpen={barcodeSettingsOpen}
              setBarcodeSettingsOpen={setBarcodeSettingsOpen}
              formattedPreviewCode={formattedPreviewCode}
              importedNumbers={importedNumbers}
              digitsCount={digitsCount}
              setDigitsCount={setDigitsCount}
              barcode={barcode}
              setBarcode={setBarcode}
              genSystemCode={genSystemCode}
              sequenceNextBody={sequenceNextBody}
              setSequenceNext={setSequenceNext}
              allowedStartLen={allowedStartLen}
              setCsvImportOpen={setCsvImportOpen}
              setImportedNumbers={setImportedNumbers}
              setCurrentNumberIndex={setCurrentNumberIndex}
              setApplyCount={setApplyCount}
              pageCount={pageCount}
              currentPlacements={currentPlacements}
              addPlacement={addPlacement}
              removePlacement={removePlacement}
              currentPage={currentPage}
              selectedPlacementIndex={selectedPlacementIndex}
              setSelectedPlacementIndex={setSelectedPlacementIndex}
              setPlacement={setPlacement}
              currentPlacement={currentPlacement}
              pdfArrayBuffer={pdfArrayBuffer}
              job={job}
              isEditingPosition={isEditingPosition}
              setIsEditingPosition={setIsEditingPosition}
              editPosX={editPosX}
              setEditPosX={setEditPosX}
              editPosY={editPosY}
              setEditPosY={setEditPosY}
            />
          </div>
          
          {/* Theme Toggle */}
          <div className="px-4 py-3 border-t border-sidebar-border mt-auto">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                const newMode = !isDarkMode;
                setIsDarkMode(newMode);
                if (newMode) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.classList.remove('light');
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                }
              }}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="text-xs">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </Button>
          </div>
      </aside>

      <main className={`min-h-screen transition-[padding] duration-300 ${leftCollapsed ? 'lg:pl-0' : 'lg:pl-80'}`}>
        {/* Mobile Header */}
        <div className="lg:hidden sticky top-0 z-20 bg-card border-b border-border p-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold">{selectedProjectName || "Editor"}</span>
          <Button variant="ghost" size="sm" onClick={() => setRightPanelOpen(!rightPanelOpen)}>
            {rightPanelOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
          </Button>
        </div>
        
        {/* Main Content Grid */}
        <div className="flex h-[calc(100vh-3rem)] lg:h-screen">
          {/* Center Canvas - Fixed between sidebars */}
          <div className={`flex-1 flex flex-col bg-background transition-all overflow-hidden ${rightPanelOpen ? 'lg:mr-80' : ''}`}>
            {/* Canvas Header */}
            <EditorHeader
              leftCollapsed={leftCollapsed}
              toggleLeftCollapsed={toggleLeftCollapsed}
              zoom={zoom}
              setZoom={setZoom}
              handleFit={handleFit}
              multiUpGrid={multiUpGrid}
              applyCount={applyCount}
              job={job}
              pageCount={pageCount}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              hydrated={hydrated}
              saveState={saveState}
              onExport={onExport}
              pdfArrayBuffer={pdfArrayBuffer}
              isExporting={isExporting}
            />

            {/* Canvas Content - Scrollable & Centered */}
            <CanvasPreview
              scrollRef={scrollRef}
              previewRef={previewRef}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseDown={onMouseDown}
              setSelectedPlacementIndex={setSelectedPlacementIndex}
              setDragging={setDragging}
              dragStart={dragStart}
              setResizing={setResizing}
              resizeStart={resizeStart}
              setDraggingPageNumber={setDraggingPageNumber}
              pageNumDragStart={pageNumDragStart}
              removePlacement={removePlacement}
              job={job}
              barcode={barcode}
              ticksX={ticksX}
              ticksY={ticksY}
              zoom={zoom}
              previewUrl={previewUrl}
              multiUpPreviewUrl={multiUpPreviewUrl}
              pdfArrayBuffer={pdfArrayBuffer}
              hydrated={hydrated}
              multiUpGrid={multiUpGrid}
              currentPlacements={currentPlacements}
              currentPage={currentPage}
              barcodePreviews={barcodePreviews}
              selectedPlacementIndex={selectedPlacementIndex}
              applyCount={applyCount}
              formattedPreviewCode={formattedPreviewCode}
              cssFontFamily={cssFontFamily}
              getBarcodeBodyForIndex={getBarcodeBodyForIndex}
              ean13CheckDigit={ean13CheckDigit}
              formatWithSeparator={formatWithSeparator}
              effectivePlacement={effectivePlacement}
            />
          </div>
          {/* Right Panel - Export Preview & History */}
          <aside className={`fixed right-0 top-0 h-screen w-80 bg-card border-l border-border z-20 transform transition-transform duration-300 overflow-y-auto custom-scrollbar ${rightPanelOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0`}>
            <div className="sticky top-0 bg-card border-b border-border p-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Export & History</span>
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setRightPanelOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <HistoryPanel
              applyToAllPages={applyToAllPages}
              applyCount={applyCount}
              job={job}
              multiUpGrid={multiUpGrid}
              thumbnails={thumbnails}
              currentPage={currentPage}
              history={history}
              onDeleteHistory={handleHistoryDelete}
              onDownloadHistory={handleHistoryDownload}
              onReopenHistory={handleHistoryReopen}
            />
          </aside>
        </div>
      </main>
      
      {/* CSV Import Modal */}
      <CsvImport
        isOpen={csvImportOpen}
        onClose={() => setCsvImportOpen(false)}
        onImport={handleCsvImport}
      />
      
      {/* Export Progress Dialog */}
      <Dialog open={isExporting} onOpenChange={(open) => {
        if (!open) {
          setIsExporting(false);
          setExportStartTime(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8 space-y-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-primary/20 rounded-full" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Exporting PDF</h3>
              <p className="text-muted-foreground text-sm">Please wait while your PDF is being generated...</p>
            </div>
            <div className="flex items-center gap-2 text-2xl font-mono font-bold text-primary">
              <Clock className="h-5 w-5" />
              {formatElapsedTime(exportElapsed)}
            </div>
            <p className="text-xs text-muted-foreground">
              {applyCount > 1 ? `Generating ${applyCount} pages...` : 'Generating PDF...'}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setIsExporting(false);
                setExportStartTime(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
