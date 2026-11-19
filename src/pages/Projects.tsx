import { useState, useEffect } from "react";
import { safeFileName } from "@/utils/printJob";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProjectStore } from "@/store/useProjectStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { SupabaseStorageService } from "@/services/storage/SupabaseStorageService";
import { generateProjectExportPdf, type ExportableProjectSettings } from "@/utils/projectExport";
import type { Json } from "@/integrations/supabase/types";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  FolderOpen,
  Clock,
  Barcode,
  FileText,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  Check,
  Copy,
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  CheckSquare,
  Square,
  FolderInput,
  ArrowUpDown,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  Palette,
  FileSpreadsheet,
  Download,
  Printer,
  Activity,
  Loader2,
  Lock,
  AlertTriangle,
} from "lucide-react";
import CsvImport from "@/components/workspace/CsvImport";
import { notifyError, notifySuccess, notifyInfo } from "@/lib/notify";
import {
  syncUsageFromOndi,
  getUsageByProject,
  bulkSyncUsageFromOndi,
  stockStatus,
  type UsageCounts,
} from "@/integrations/supabase/tracking";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FolderRow {
  id: string;
  name: string;
  parent_folder_id?: string | null;
  created_at: string;
  updated_at: string;
  color?: string | null;
}

const FOLDER_COLORS = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Emerald", value: "#10b981" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Purple", value: "#a855f7" },
  { name: "Orange", value: "#f97316" },
  { name: "Teal", value: "#14b8a6" },
];

interface ProjectRow {
  id: string;
  name: string;
  notes?: string | null;
  tags?: string[] | null;
  next_code: string;
  updated_at: string;
  created_at: string;
  folder_id?: string | null;
  sort_order?: number | null;
  printed_at?: string | null;
  ondi_batch_id?: string | null;
  institution_name?: string | null;
  branch_name?: string | null;
  is_template?: boolean | null;
}

export default function Projects() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<"project" | "folder">("project");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  // Folder dialogs
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveProjectId, setMoveProjectId] = useState<string | null>(null);
  
  // Drag and drop
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  
  // Bulk selection
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  
  // Sorting
  const [sortBy, setSortBy] = useState<"date" | "name" | "manual">("manual");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [dragReorderProjectId, setDragReorderProjectId] = useState<string | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
  
  // CSV Import
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportProjectId, setCsvImportProjectId] = useState<string | null>(null);

  // Print status + Ondi usage tracking
  const [usageByProject, setUsageByProject] = useState<Record<string, UsageCounts>>({});
  const [syncingProjectId, setSyncingProjectId] = useState<string | null>(null);
  const [printFilter, setPrintFilter] = useState<"all" | "printed" | "not-printed" | "unused">("all");
  const [bulkSyncing, setBulkSyncing] = useState(false);

  // Template-edit guard: when a user opens a template, confirm before editing it directly.
  const [templateToEdit, setTemplateToEdit] = useState<ProjectRow | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { setProject, selectedProjectId: currentProjectId, setPendingCsvData } = useProjectStore();
  const { resetProject } = useWorkspaceStore();

  useEffect(() => {
    document.title = "Projects | BarcodeGo";
    loadData();
    
    // Restore folder from navigation state if coming back from editor
    const state = location.state as { folderId?: string | null } | null;
    if (state?.folderId !== undefined) {
      setCurrentFolderId(state.folderId);
      // Clear the state to prevent re-applying on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [projectsRes, foldersRes, usageRes] = await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, notes, tags, next_code, updated_at, created_at, folder_id, sort_order, printed_at, ondi_batch_id, institution_name, branch_name, is_template"
        )
        .order("updated_at", { ascending: false }),
      supabase
        .from("folders")
        .select("*")
        .order("name", { ascending: true }),
      // Cached usage, one aggregate query (no N+1). Only synced-at-least-once projects surface.
      getUsageByProject().catch((e) => {
        notifyError("Couldn't load usage counts", e);
        return {} as Record<string, UsageCounts>;
      }),
    ]);
    if (projectsRes.error) notifyError("Couldn't load projects", projectsRes.error);
    if (foldersRes.error) notifyError("Couldn't load folders", foldersRes.error);
    const loadedProjects = projectsRes.data ?? [];
    if (projectsRes.data) setProjects(loadedProjects);
    if (foldersRes.data) setFolders(foldersRes.data);
    setUsageByProject(usageRes);
    setLoading(false);

    // Throttled background auto-sync (Feature 3): only when the freshest cached
    // sync across Ondi-pulled projects is older than 10 min — avoids hammering Ondi.
    void maybeAutoSyncUsage(loadedProjects, usageRes);
  };

  // Auto-sync usage in the background if the cache is stale (>10 min). Never blocks render.
  const AUTO_SYNC_STALE_MS = 10 * 60 * 1000;
  const maybeAutoSyncUsage = async (
    loadedProjects: ProjectRow[],
    usage: Record<string, UsageCounts>
  ) => {
    const ondiTargets = loadedProjects.filter((p) => p.ondi_batch_id);
    if (!ondiTargets.length) return;
    // Freshest sync timestamp we have cached across those Ondi projects (null = never synced).
    let freshest = 0;
    for (const p of ondiTargets) {
      const t = usage[p.id]?.syncedAt;
      if (t) freshest = Math.max(freshest, new Date(t).getTime());
    }
    if (freshest && Date.now() - freshest < AUTO_SYNC_STALE_MS) return; // still fresh
    try {
      const { counts } = await bulkSyncUsageFromOndi(
        ondiTargets.map((p) => ({ projectId: p.id, ondiBatchId: p.ondi_batch_id as string })),
        {
          concurrency: 5,
          onResult: (pid, c) => setUsageByProject((prev) => ({ ...prev, [pid]: c })),
        }
      );
      if (Object.keys(counts).length) notifyInfo("Usage refreshed from Ondi in the background");
    } catch (e) {
      // Background task — log only, don't toast an error on every navigation.
      console.warn("Background usage auto-sync failed", e);
    }
  };

  const currentFolder = folders.find(f => f.id === currentFolderId);
  const foldersInView = folders.filter(f => f.parent_folder_id === currentFolderId);

  // Defined before use — sortedProjectsInView calls this during render.
  const matchesPrintFilter = (p: ProjectRow) => {
    if (printFilter === "printed") return !!p.printed_at;
    if (printFilter === "not-printed") return !p.printed_at;
    if (printFilter === "unused") return (usageByProject[p.id]?.unused ?? 0) > 0;
    return true;
  };

  // Sort projects based on current sort settings
  const sortedProjectsInView = projects
    .filter(p => p.folder_id === currentFolderId && matchesPrintFilter(p))
    .sort((a, b) => {
      if (sortBy === "name") {
        const comparison = a.name.localeCompare(b.name);
        return sortOrder === "asc" ? comparison : -comparison;
      } else if (sortBy === "manual") {
        const orderA = a.sort_order ?? 0;
        const orderB = b.sort_order ?? 0;
        return sortOrder === "asc" ? orderA - orderB : orderB - orderA;
      } else {
        const dateA = new Date(a.updated_at).getTime();
        const dateB = new Date(b.updated_at).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      }
    });
  
  // Keep projectsInView for counts but use sortedProjectsInView for display
  const projectsInView = projects.filter(p => p.folder_id === currentFolderId);

  // Summary tile (Feature 2) — derived from the same cached usage aggregate.
  // "Low on stock" = a synced Ondi batch with <10% of its codes still unused
  // (== "critical" in the shared stockStatus classifier).
  const batchesWithUnused = projectsInView.filter((p) => (usageByProject[p.id]?.unused ?? 0) > 0).length;
  const lowStockBatches = projectsInView.filter(
    (p) => stockStatus(usageByProject[p.id], !!usageByProject[p.id]?.syncedAt) === "critical"
  ).length;

  const toggleSort = (newSortBy: "date" | "name" | "manual") => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(newSortBy);
      if (newSortBy === "name") {
        setSortOrder("asc");
      } else if (newSortBy === "manual") {
        setSortOrder("asc");
      } else {
        setSortOrder("desc");
      }
    }
  };

  // Drag reorder handlers for manual sorting
  const handleReorderDragStart = (e: React.DragEvent, projectId: string) => {
    if (sortBy !== "manual") return;
    setDragReorderProjectId(projectId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("reorder", projectId);
  };

  const handleReorderDragOver = (e: React.DragEvent, projectId: string) => {
    if (sortBy !== "manual" || !dragReorderProjectId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (projectId !== dragReorderProjectId) {
      setDragOverProjectId(projectId);
    }
  };

  const handleReorderDragLeave = () => {
    setDragOverProjectId(null);
  };

  const handleReorderDrop = async (e: React.DragEvent, targetProjectId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("reorder");
    if (!sourceId || sourceId === targetProjectId || sortBy !== "manual") {
      setDragReorderProjectId(null);
      setDragOverProjectId(null);
      return;
    }

    // Reorder in local state first
    const currentList = [...sortedProjectsInView];
    const sourceIndex = currentList.findIndex(p => p.id === sourceId);
    const targetIndex = currentList.findIndex(p => p.id === targetProjectId);
    
    if (sourceIndex === -1 || targetIndex === -1) return;

    // Remove source and insert at target position
    const [movedProject] = currentList.splice(sourceIndex, 1);
    currentList.splice(targetIndex, 0, movedProject);

    // Update sort_order for all affected projects
    const updates = currentList.map((p, index) => ({
      id: p.id,
      sort_order: index + 1
    }));

    // Update local state immediately for responsiveness
    setProjects(prev => {
      const updated = [...prev];
      updates.forEach(u => {
        const idx = updated.findIndex(p => p.id === u.id);
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], sort_order: u.sort_order };
        }
      });
      return updated;
    });

    // Persist to database
    for (const update of updates) {
      await supabase
        .from("projects")
        .update({ sort_order: update.sort_order })
        .eq("id", update.id);
    }

    setDragReorderProjectId(null);
    setDragOverProjectId(null);
  };

  const handleReorderDragEnd = () => {
    setDragReorderProjectId(null);
    setDragOverProjectId(null);
  };

  // Build breadcrumb path
  const getBreadcrumbPath = () => {
    const path: FolderRow[] = [];
    let current = currentFolder;
    while (current) {
      path.unshift(current);
      current = folders.find(f => f.id === current?.parent_folder_id);
    }
    return path;
  };
  const breadcrumbPath = getBreadcrumbPath();

  // Enter the editor for a project. Templates are intercepted (Feature 5) so the
  // user can choose to edit a copy instead of mutating the master design.
  const enterEditor = (p: ProjectRow) => {
    // IMPORTANT: reset workspace before entering editor.
    // Otherwise projects with null settings (or no history snapshot) can inherit
    // non-editable/stale state from the previously opened project.
    resetProject();
    setPendingCsvData(null);
    setProject(p.id, p.name, currentFolderId);
    navigate("/editor");
  };

  const openProject = (p: ProjectRow) => {
    if (p.is_template) {
      setTemplateToEdit(p);
      return;
    }
    enterEditor(p);
  };

  const openCsvImport = (p: ProjectRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setCsvImportProjectId(p.id);
    setCsvImportOpen(true);
  };

  const handleCsvImportComplete = async (values: string[]) => {
    if (!csvImportProjectId || values.length === 0) return;
    const project = projects.find(p => p.id === csvImportProjectId);
    if (!project) return;

    const firstValue = values[0];

    // Fetch existing settings so we can persist the CSV list for export-from-projects
    const { data: existing, error: existingError } = await supabase
      .from("projects")
      .select("settings")
      .eq("id", csvImportProjectId)
      .maybeSingle();

    if (existingError) {
      console.error(existingError);
      return;
    }

    const existingSettings = (existing?.settings ?? {}) as {
      digitsCount?: number;
      barcode?: { type?: string };
      [key: string]: unknown;
    };
    const updatedSettings = {
      ...existingSettings,
      importedNumbers: values,
      currentNumberIndex: 0,
      applyCount: values.length,
      // Keep digitsCount if it exists (important for exact restore); otherwise pick a safe default.
      digitsCount:
        existingSettings.digitsCount ??
        (existingSettings.barcode?.type === "ean13" ? 12 : 12),
    } as Json;

    const { error } = await supabase
      .from("projects")
      .update({ next_code: firstValue, settings: updatedSettings })
      .eq("id", csvImportProjectId);

    if (error) {
      console.error(error);
      return;
    }

    // Update local state to reflect next_code (list view)
    setProjects(projects.map(p =>
      p.id === csvImportProjectId ? { ...p, next_code: firstValue } : p
    ));

    // Still keep this for the editor (immediate UX when user opens it)
    setPendingCsvData(values);

    setCsvImportOpen(false);
    setCsvImportProjectId(null);
  };

  const downloadLatestExport = async (p: ProjectRow, e: React.MouseEvent) => {
    e.stopPropagation();

    

    try {
      const { data: fullProject, error: projectError } = await supabase
        .from("projects")
        .select("id, name, settings, next_code, current_design_file_id")
        .eq("id", p.id)
        .maybeSingle();

      if (projectError || !fullProject) {
        console.error(projectError);
        return;
      }

      if (!fullProject.current_design_file_id) {
        return;
      }

      const designRec = await SupabaseStorageService.getFile(fullProject.current_design_file_id);
      if (!designRec?.bytes) {
        return;
      }

      const defaults = useWorkspaceStore.getState();
      const settings = (fullProject.settings ?? {}) as ExportableProjectSettings & {
        currentNumberIndex?: number;
      };

      const {
        pdfBytes,
        selectedPages,
        pageBarcodeValues,
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
      } = await generateProjectExportPdf({
        designBytes: designRec.bytes,
        settings,
        nextCode: fullProject.next_code || "",
        fallbackJob: defaults.job,
        fallbackBarcode: defaults.barcode,
        fallbackPlacementsByPage: defaults.placementsByPage,
      });

      // Download immediately
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(blob);

      const safeName = safeFileName(fullProject.name || "export");
      const filename = `${safeName}.pdf`;

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      // Save to history/storage in background (never block download)
      void (async () => {
        try {
          const exportName = `${safeName}_barcode.pdf`;
          const exportId = await SupabaseStorageService.saveFile({
            name: exportName,
            mime: "application/pdf",
            bytes: pdfBytes.buffer as ArrayBuffer,
          });

          const historyPlacements = effectiveApplyToAllPages
            ? (effectivePlacementsByPage[1] || effectivePlacementsByPage[effectiveCurrentPage])
            : effectivePlacementsByPage[effectiveCurrentPage];
          const placement = historyPlacements?.[0] || { xMM: 10, yMM: 10, id: "" };

          const snapshot = {
            job: effectiveJob,
            barcode: effectiveBarcode,
            placementsByPage: effectivePlacementsByPage,
            sequenceNextBody: fullProject.next_code || "",
            designFileId: fullProject.current_design_file_id,
            pdfName: designRec.name,
            importedNumbers: effectiveImportedNumbers,
            currentNumberIndex: settings.currentNumberIndex ?? 0,
            applyCount: effectiveApplyCount,
            digitsCount: effectiveDigitsCount,
            currentPage: effectiveCurrentPage,
            applyToAllPages: effectiveApplyToAllPages,
          };

          await supabase.from("history_items").insert([
            {
              project_id: fullProject.id,
              design_file_name: designRec.name,
              design_file_id: fullProject.current_design_file_id,
              export_file_id: exportId,
              pages: selectedPages.length,
              barcode_value: effectiveBarcode.value,
              barcode_type: effectiveBarcode.type,
              show_text: effectiveBarcode.showText,
              font_family: effectiveBarcode.fontFamily,
              font_size: effectiveBarcode.fontSize,
              quiet_zone_mm: effectiveBarcode.quietZoneMM,
              width_mm: effectiveBarcode.widthMM,
              height_mm: effectiveBarcode.heightMM,
              rotation: effectiveBarcode.rotation,
              pos_x_mm: placement.xMM,
              pos_y_mm: placement.yMM,
              apply_to_all_pages: effectiveApplyToAllPages,
              applied_pages: selectedPages,
              page_size_preset: effectiveJob.pageSizePreset,
              page_width_mm: effectiveJob.pageSizeMM.width,
              page_height_mm: effectiveJob.pageSizeMM.height,
              fit_to_page: effectiveJob.fitToPage,
              sequence_start: sequenceStart,
              snapshot: snapshot as unknown as Json,
              timestamp: Date.now(),
            },
          ]);

          // Keep sequential exports advancing like the editor does
          if (nextSequenceBodyIfSequential) {
            await supabase
              .from("projects")
              .update({ next_code: nextSequenceBodyIfSequential })
              .eq("id", fullProject.id);
          }
        } catch (err) {
          console.warn("Export downloaded, but failed to save to history/storage", err);
        }
      })();

    } catch (err) {
      console.error(err);
    } finally {
      /* no cleanup needed; download + history save are self-contained */
    }
  };

  // Manual print marking (Phase 3) — never automatic.
  const togglePrinted = async (p: ProjectRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = p.printed_at ? null : new Date().toISOString();
    const { error } = await supabase.from("projects").update({ printed_at: newVal }).eq("id", p.id);
    if (error) {
      notifyError("Couldn't update print status", error);
      return;
    }
    setProjects(projects.map((x) => (x.id === p.id ? { ...x, printed_at: newVal } : x)));
    notifySuccess(newVal ? "Marked as printed" : "Marked as not printed");
  };

  // Sync used/unused from Ondi (Phase 4) — only meaningful for Ondi-pulled batches.
  const syncUsage = async (p: ProjectRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!p.ondi_batch_id) {
      notifyError("This project wasn't pulled from Ondi, so there's no usage to sync.");
      return;
    }
    setSyncingProjectId(p.id);
    try {
      const counts = await syncUsageFromOndi({ projectId: p.id, ondiBatchId: p.ondi_batch_id });
      setUsageByProject((prev) => ({ ...prev, [p.id]: counts }));
      notifySuccess(`Usage synced`, `${counts.used} used / ${counts.unused} unused of ${counts.total}`);
    } catch (err) {
      notifyError("Couldn't sync usage from Ondi", err);
    } finally {
      setSyncingProjectId(null);
    }
  };

  // Bulk mark printed/not-printed for the selected projects (one query).
  const bulkMarkPrinted = async (printed: boolean) => {
    const ids = [...selectedProjects];
    if (!ids.length) return;
    const val = printed ? new Date().toISOString() : null;
    const { error } = await supabase.from("projects").update({ printed_at: val }).in("id", ids);
    if (error) {
      notifyError("Couldn't update print status", error);
      return;
    }
    setProjects(projects.map((p) => (selectedProjects.has(p.id) ? { ...p, printed_at: val } : p)));
    notifySuccess(`${ids.length} project${ids.length !== 1 ? "s" : ""} marked ${printed ? "printed" : "not printed"}`);
    clearSelection();
  };

  // Run a concurrency-capped bulk usage sync over the given Ondi projects, with a progress toast.
  const runBulkSync = async (targets: ProjectRow[]) => {
    if (!targets.length) {
      notifyError("None of these projects were pulled from Ondi.");
      return;
    }
    setBulkSyncing(true);
    notifyInfo(`Syncing ${targets.length} batch${targets.length !== 1 ? "es" : ""}…`);
    try {
      const { ok, failed } = await bulkSyncUsageFromOndi(
        targets.map((p) => ({ projectId: p.id, ondiBatchId: p.ondi_batch_id as string })),
        {
          concurrency: 5,
          onResult: (pid, c) => setUsageByProject((prev) => ({ ...prev, [pid]: c })),
        }
      );
      if (failed) notifyError(`Synced ${ok}/${targets.length}; ${failed} failed`);
      else notifySuccess(`Synced usage for ${ok} project${ok !== 1 ? "s" : ""}`);
    } finally {
      setBulkSyncing(false);
    }
  };

  // Bulk sync usage from Ondi for the selected Ondi-pulled projects (multi-select toolbar).
  const bulkSyncUsage = () =>
    runBulkSync(projects.filter((p) => selectedProjects.has(p.id) && p.ondi_batch_id));

  // Sync usage for every Ondi-pulled project currently in view (header button).
  const syncAllShown = () =>
    runBulkSync(sortedProjectsInView.filter((p) => p.ondi_batch_id));

  const openFolder = (folder: FolderRow) => {
    setCurrentFolderId(folder.id);
  };

  const goBack = () => {
    if (currentFolder?.parent_folder_id) {
      setCurrentFolderId(currentFolder.parent_folder_id);
    } else {
      setCurrentFolderId(null);
    }
  };

  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId);
  };

  // Project actions
  const startRename = (p: ProjectRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name);
  };

  const saveRename = async () => {
    if (!editingId || !editName.trim()) {
      setEditingId(null);
      return;
    }
    await supabase.from("projects").update({ name: editName.trim() }).eq("id", editingId);
    setProjects(projects.map(p => p.id === editingId ? { ...p, name: editName.trim() } : p));
    setEditingId(null);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    
    if (deleteType === "folder") {
      // Move projects in this folder to root
      await supabase.from("projects").update({ folder_id: null }).eq("folder_id", deleteId);
      // Delete the folder
      await supabase.from("folders").delete().eq("id", deleteId);
      setFolders(folders.filter(f => f.id !== deleteId));
      setProjects(projects.map(p => p.folder_id === deleteId ? { ...p, folder_id: null } : p));
      if (currentFolderId === deleteId) {
        setCurrentFolderId(null);
      }
    } else {
      // Delete history items first
      await supabase.from("history_items").delete().eq("project_id", deleteId);
      // Then delete project
      await supabase.from("projects").delete().eq("id", deleteId);
      setProjects(projects.filter(p => p.id !== deleteId));
      // If deleting current project, reset
      if (currentProjectId === deleteId) {
        resetProject();
      }
    }
    setDeleteId(null);
  };

  // Core duplication: copies the project (never the is_template flag — copies are
  // editable working projects) and returns the new row. Shared by the ⋮ menu and
  // the template "Edit a copy" path. Does NOT reload the list itself.
  const createProjectCopy = async (p: ProjectRow): Promise<ProjectRow | null> => {
    const { data: fullProject } = await supabase
      .from("projects")
      .select("*")
      .eq("id", p.id)
      .single();

    if (!fullProject) return null;

    // Get the original project's sort_order
    const originalSortOrder = p.sort_order ?? 0;

    // Shift sort_order of all projects after the original
    const projectsToShift = projects.filter(
      proj => proj.folder_id === p.folder_id && (proj.sort_order ?? 0) > originalSortOrder
    );

    for (const proj of projectsToShift) {
      await supabase
        .from("projects")
        .update({ sort_order: (proj.sort_order ?? 0) + 1 })
        .eq("id", proj.id);
    }

    const { data: newProject, error } = await supabase
      .from("projects")
      .insert({
        name: `${p.name} (Copy)`,
        notes: fullProject.notes,
        tags: fullProject.tags,
        next_code: fullProject.next_code,
        settings: fullProject.settings,
        current_design_file_id: fullProject.current_design_file_id,
        folder_id: fullProject.folder_id,
        sort_order: originalSortOrder + 1,
      })
      .select()
      .single();

    if (error || !newProject) {
      notifyError("Failed to duplicate project", error);
      return null;
    }
    return newProject as ProjectRow;
  };

  const duplicateProject = async (p: ProjectRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const newProject = await createProjectCopy(p);
    if (!newProject) return;
    await loadData();
    // Start rename mode for the new project
    setEditingId(newProject.id);
    setEditName(newProject.name);
  };

  // Template guard actions (Feature 5).
  const editTemplateCopy = async () => {
    const tpl = templateToEdit;
    if (!tpl) return;
    setTemplateToEdit(null);
    const copy = await createProjectCopy(tpl);
    if (!copy) return;
    setProjects((prev) => [copy, ...prev]);
    enterEditor(copy);
  };

  const editTemplateAnyway = () => {
    const tpl = templateToEdit;
    if (!tpl) return;
    setTemplateToEdit(null);
    enterEditor(tpl);
  };

  const toggleTemplate = async (p: ProjectRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !p.is_template;
    const { error } = await supabase.from("projects").update({ is_template: newVal }).eq("id", p.id);
    if (error) {
      notifyError("Couldn't update template flag", error);
      return;
    }
    setProjects(projects.map((x) => (x.id === p.id ? { ...x, is_template: newVal } : x)));
    notifySuccess(newVal ? "Marked as template" : "Unmarked template");
  };

  // Folder actions
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const { data, error } = await supabase
      .from("folders")
      .insert({ 
        name: newFolderName.trim(),
        parent_folder_id: currentFolderId 
      })
      .select()
      .single();
    
    if (error) {
      notifyError("Couldn't create folder", error);
      return;
    }
    if (data) {
      setFolders([...folders, data].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setNewFolderName("");
    setShowNewFolderDialog(false);
  };

  const startFolderRename = (folder: FolderRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolderId(folder.id);
    setEditFolderName(folder.name);
  };

  const saveFolderRename = async () => {
    if (!editingFolderId || !editFolderName.trim()) {
      setEditingFolderId(null);
      return;
    }
    await supabase.from("folders").update({ name: editFolderName.trim() }).eq("id", editingFolderId);
    setFolders(folders.map(f => f.id === editingFolderId ? { ...f, name: editFolderName.trim() } : f));
    setEditingFolderId(null);
  };

  const changeFolderColor = async (folderId: string, color: string) => {
    await supabase.from("folders").update({ color }).eq("id", folderId);
    setFolders(folders.map(f => f.id === folderId ? { ...f, color } : f));
  };

  const openMoveDialog = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMoveProjectId(projectId);
    setShowMoveDialog(true);
  };

  const moveProject = async (targetFolderId: string | null) => {
    if (!moveProjectId) return;
    await supabase.from("projects").update({ folder_id: targetFolderId }).eq("id", moveProjectId);
    setProjects(projects.map(p => p.id === moveProjectId ? { ...p, folder_id: targetFolderId } : p));
    setMoveProjectId(null);
    setShowMoveDialog(false);
  };

  const getProjectCountInFolder = (folderId: string) => {
    return projects.filter(p => p.folder_id === folderId).length;
  };

  const getSubfolderCount = (folderId: string) => {
    return folders.filter(f => f.parent_folder_id === folderId).length;
  };

  // Bulk selection helpers
  const totalSelected = selectedProjects.size + selectedFolders.size;
  const allInViewSelected = 
    foldersInView.length + projectsInView.length > 0 &&
    foldersInView.every(f => selectedFolders.has(f.id)) && 
    projectsInView.every(p => selectedProjects.has(p.id));
  
  const toggleSelectAll = () => {
    if (allInViewSelected) {
      // Deselect all in current view
      const newSelectedFolders = new Set(selectedFolders);
      const newSelectedProjects = new Set(selectedProjects);
      foldersInView.forEach(f => newSelectedFolders.delete(f.id));
      projectsInView.forEach(p => newSelectedProjects.delete(p.id));
      setSelectedFolders(newSelectedFolders);
      setSelectedProjects(newSelectedProjects);
    } else {
      // Select all in current view
      const newSelectedFolders = new Set(selectedFolders);
      const newSelectedProjects = new Set(selectedProjects);
      foldersInView.forEach(f => newSelectedFolders.add(f.id));
      projectsInView.forEach(p => newSelectedProjects.add(p.id));
      setSelectedFolders(newSelectedFolders);
      setSelectedProjects(newSelectedProjects);
    }
  };

  const toggleFolderSelection = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedFolders);
    if (newSelected.has(folderId)) {
      newSelected.delete(folderId);
    } else {
      newSelected.add(folderId);
    }
    setSelectedFolders(newSelected);
  };

  const toggleProjectSelection = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedProjects(newSelected);
  };

  const clearSelection = () => {
    setSelectedProjects(new Set());
    setSelectedFolders(new Set());
  };

  const confirmBulkDelete = async () => {
    // Delete selected folders (move their projects to root)
    for (const folderId of selectedFolders) {
      await supabase.from("projects").update({ folder_id: null }).eq("folder_id", folderId);
      await supabase.from("folders").delete().eq("id", folderId);
    }
    
    // Delete selected projects
    for (const projectId of selectedProjects) {
      await supabase.from("history_items").delete().eq("project_id", projectId);
      await supabase.from("projects").delete().eq("id", projectId);
      if (currentProjectId === projectId) {
        resetProject();
      }
    }
    
    // Update local state
    setFolders(folders.filter(f => !selectedFolders.has(f.id)));
    setProjects(prev => {
      let updated = prev.filter(p => !selectedProjects.has(p.id));
      // Move projects from deleted folders to root
      updated = updated.map(p => selectedFolders.has(p.folder_id || '') ? { ...p, folder_id: null } : p);
      return updated;
    });
    
    clearSelection();
    setShowBulkDeleteDialog(false);
  };

  const bulkMoveProjects = async (targetFolderId: string | null) => {
    // Move selected projects
    for (const projectId of selectedProjects) {
      await supabase.from("projects").update({ folder_id: targetFolderId }).eq("id", projectId);
    }
    
    setProjects(projects.map(p => 
      selectedProjects.has(p.id) ? { ...p, folder_id: targetFolderId } : p
    ));
    
    clearSelection();
    setShowBulkMoveDialog(false);
  };

  const duplicateSelected = async () => {
    for (const projectId of selectedProjects) {
      const project = projects.find(p => p.id === projectId);
      if (!project) continue;
      
      const { data: fullProject } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      
      if (!fullProject) continue;
      
      await supabase
        .from("projects")
        .insert({
          name: `${project.name} (Copy)`,
          notes: fullProject.notes,
          tags: fullProject.tags,
          next_code: fullProject.next_code,
          settings: fullProject.settings,
          current_design_file_id: fullProject.current_design_file_id,
          folder_id: fullProject.folder_id,
        });
    }
    
    clearSelection();
    await loadData();
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    setDraggedProjectId(projectId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", projectId);
  };

  const handleDragEnd = () => {
    setDraggedProjectId(null);
    setDragOverFolderId(null);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = () => {
    setDragOverFolderId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    const projectId = e.dataTransfer.getData("text/plain");
    if (!projectId) return;
    
    await supabase.from("projects").update({ folder_id: targetFolderId }).eq("id", projectId);
    setProjects(projects.map(p => p.id === projectId ? { ...p, folder_id: targetFolderId } : p));
    setDraggedProjectId(null);
    setDragOverFolderId(null);
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            {currentFolderId && (
              <Button variant="ghost" size="icon" onClick={goBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              {/* Breadcrumb navigation */}
              {breadcrumbPath.length > 0 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                  <button 
                    onClick={() => navigateToFolder(null)}
                    className="hover:text-foreground transition-colors"
                  >
                    Projects
                  </button>
                  {breadcrumbPath.map((folder, index) => (
                    <span key={folder.id} className="flex items-center gap-1">
                      <ChevronRight className="h-3 w-3" />
                      {index === breadcrumbPath.length - 1 ? (
                        <span className="text-foreground">{folder.name}</span>
                      ) : (
                        <button 
                          onClick={() => navigateToFolder(folder.id)}
                          className="hover:text-foreground transition-colors"
                        >
                          {folder.name}
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <h1 className="text-2xl font-bold text-foreground">
                {currentFolder ? currentFolder.name : "Projects"}
              </h1>
              <p className="text-muted-foreground mt-1">
                {currentFolder 
                  ? `${foldersInView.length} subfolder${foldersInView.length !== 1 ? 's' : ''}, ${projectsInView.length} project${projectsInView.length !== 1 ? 's' : ''}`
                  : "Manage your barcode overlay projects"
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowNewFolderDialog(true)} className="gap-2">
              <FolderPlus className="h-4 w-4" />
              New Folder
            </Button>
            <Button onClick={() => navigate("/projects/new")} className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>

        {/* Bulk Selection Toolbar */}
        {totalSelected > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">
                {totalSelected} selected
              </span>
              <Button variant="ghost" size="sm" onClick={clearSelection} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {selectedProjects.size > 0 && selectedFolders.size === 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => bulkMarkPrinted(true)} className="h-7 text-xs gap-1">
                    <Printer className="h-3 w-3" />
                    Mark printed
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => bulkMarkPrinted(false)} className="h-7 text-xs gap-1">
                    <Printer className="h-3 w-3" />
                    Unprinted
                  </Button>
                  <Button variant="outline" size="sm" onClick={bulkSyncUsage} disabled={bulkSyncing} className="h-7 text-xs gap-1">
                    {bulkSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                    Sync usage
                  </Button>
                  <Button variant="outline" size="sm" onClick={duplicateSelected} className="h-7 text-xs gap-1">
                    <Copy className="h-3 w-3" />
                    Duplicate
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowBulkMoveDialog(true)} className="h-7 text-xs gap-1">
                    <FolderInput className="h-3 w-3" />
                    Move
                  </Button>
                </>
              )}
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => setShowBulkDeleteDialog(true)} 
                className="h-7 text-xs gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* Summary tile (Feature 2) — only when there's something worth flagging */}
        {!loading && (batchesWithUnused > 0 || lowStockBatches > 0) && (
          <div className="mb-4 p-3 rounded-xl bg-secondary/40 border border-border flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <Activity className="h-4 w-4 text-primary shrink-0" />
            {batchesWithUnused > 0 && (
              <span>
                <span className="font-medium text-foreground">{batchesWithUnused}</span> batch
                {batchesWithUnused !== 1 ? "es have" : " has"} unused codes
              </span>
            )}
            {batchesWithUnused > 0 && lowStockBatches > 0 && <span className="text-muted-foreground/50">·</span>}
            {lowStockBatches > 0 && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="font-medium">{lowStockBatches}</span> low on stock
              </span>
            )}
          </div>
        )}

        {/* Content */}
        <div className="dashboard-card">
          <div className="dashboard-card-header flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {(foldersInView.length > 0 || projectsInView.length > 0) && (
                <Checkbox 
                  checked={allInViewSelected}
                  onCheckedChange={toggleSelectAll}
                  className="h-4 w-4"
                />
              )}
              <h2 className="dashboard-card-title">
                {currentFolder ? "Projects" : "Your Projects"}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Sync usage for all Ondi-pulled projects in view (Feature 3) */}
              {sortedProjectsInView.some((p) => p.ondi_batch_id) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncAllShown}
                  disabled={bulkSyncing}
                  className="h-7 text-xs gap-1"
                  title="Sync used/unused from Ondi for every batch shown"
                >
                  {bulkSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                  Sync usage
                </Button>
              )}
              {/* Print / usage filter */}
              <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-secondary/30">
                {([
                  ["all", "All"],
                  ["not-printed", "Not printed"],
                  ["printed", "Printed"],
                  ["unused", "Unused"],
                ] as const).map(([val, label]) => (
                  <Button
                    key={val}
                    variant={printFilter === val ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setPrintFilter(val)}
                    className="h-7 text-xs px-2"
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {/* Sort buttons */}
              <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-secondary/30">
                <Button
                  variant={sortBy === "date" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleSort("date")}
                  className="h-7 text-xs gap-1 px-2"
                >
                  <Clock className="h-3 w-3" />
                  Date
                  {sortBy === "date" && (
                    <span className="text-[10px] text-muted-foreground">
                      {sortOrder === "desc" ? "↓" : "↑"}
                    </span>
                  )}
                </Button>
                <Button
                  variant={sortBy === "name" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleSort("name")}
                  className="h-7 text-xs gap-1 px-2"
                >
                  <ArrowDownAZ className="h-3 w-3" />
                  Name
                  {sortBy === "name" && (
                    <span className="text-[10px] text-muted-foreground">
                      {sortOrder === "asc" ? "↓" : "↑"}
                    </span>
                  )}
                </Button>
                <Button
                  variant={sortBy === "manual" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleSort("manual")}
                  className="h-7 text-xs gap-1 px-2"
                >
                  <ArrowUpDown className="h-3 w-3" />
                  Manual
                  {sortBy === "manual" && (
                    <span className="text-[10px] text-muted-foreground">
                      {sortOrder === "asc" ? "↓" : "↑"}
                    </span>
                  )}
                </Button>
              </div>
              <span className="badge badge-primary whitespace-nowrap shrink-0">
                {currentFolderId
                  ? `${projectsInView.length} project${projectsInView.length !== 1 ? 's' : ''}`
                  : `${folders.length} folder${folders.length !== 1 ? 's' : ''}, ${projects.length} project${projects.length !== 1 ? 's' : ''}`
                }
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Loading...</p>
            </div>
          ) : foldersInView.length === 0 && projectsInView.length === 0 ? (
            <div className="py-12 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {currentFolderId ? "No projects in this folder" : "No projects yet"}
              </p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {currentFolderId ? "Create a new project above" : "Create your first project or folder above"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Folders */}
              {foldersInView.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => editingFolderId !== folder.id && openFolder(folder)}
                  onDragOver={(e) => handleDragOver(e, folder.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, folder.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left group ${editingFolderId !== folder.id ? 'cursor-pointer' : ''} ${selectedFolders.has(folder.id) ? 'ring-2 ring-primary bg-primary/10' : ''} ${dragOverFolderId === folder.id ? 'bg-primary/20 ring-2 ring-primary scale-[1.02]' : 'bg-secondary/30 hover:bg-secondary/60'}`}
                >
                  <Checkbox 
                    checked={selectedFolders.has(folder.id)}
                    onCheckedChange={() => {}}
                    onClick={(e) => toggleFolderSelection(folder.id, e)}
                    className="h-4 w-4 flex-shrink-0"
                  />
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${folder.color || '#6366f1'}20` }}
                  >
                    <Folder className="h-5 w-5" style={{ color: folder.color || '#6366f1' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingFolderId === folder.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Input
                          value={editFolderName}
                          onChange={(e) => setEditFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveFolderRename();
                            if (e.key === "Escape") setEditingFolderId(null);
                          }}
                          className="h-7 text-sm"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={saveFolderRename}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingFolderId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-medium text-foreground truncate">{folder.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {getSubfolderCount(folder.id) > 0 && `${getSubfolderCount(folder.id)} subfolder${getSubfolderCount(folder.id) !== 1 ? 's' : ''}, `}
                          {getProjectCountInFolder(folder.id)} project{getProjectCountInFolder(folder.id) !== 1 ? 's' : ''}
                        </p>
                      </>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={(e) => startFolderRename(folder, e)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Palette className="h-4 w-4 mr-2" />
                          Color
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <div className="grid grid-cols-4 gap-1 p-2">
                            {FOLDER_COLORS.map((c) => (
                              <button
                                key={c.value}
                                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${folder.color === c.value ? 'border-foreground' : 'border-transparent'}`}
                                style={{ backgroundColor: c.value }}
                                onClick={() => changeFolderColor(folder.id, c.value)}
                                title={c.name}
                              />
                            ))}
                          </div>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteType("folder");
                          setDeleteId(folder.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}

              {/* Projects */}
              {sortedProjectsInView.map((p) => (
                <div
                  key={p.id}
                  draggable={editingId !== p.id}
                  onDragStart={(e) => {
                    if (sortBy === "manual") {
                      handleReorderDragStart(e, p.id);
                    } else {
                      handleDragStart(e, p.id);
                    }
                  }}
                  onDragEnd={() => {
                    if (sortBy === "manual") {
                      handleReorderDragEnd();
                    } else {
                      handleDragEnd();
                    }
                  }}
                  onDragOver={(e) => {
                    if (sortBy === "manual") {
                      handleReorderDragOver(e, p.id);
                    }
                  }}
                  onDragLeave={handleReorderDragLeave}
                  onDrop={(e) => {
                    if (sortBy === "manual") {
                      handleReorderDrop(e, p.id);
                    }
                  }}
                  onClick={() => editingId !== p.id && openProject(p)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left group ${editingId !== p.id ? 'cursor-pointer cursor-grab active:cursor-grabbing' : ''} ${selectedProjects.has(p.id) ? 'ring-2 ring-primary bg-primary/10' : ''} ${draggedProjectId === p.id || dragReorderProjectId === p.id ? 'opacity-50 scale-95' : ''} ${dragOverProjectId === p.id ? 'ring-2 ring-primary bg-primary/20' : 'bg-secondary/30 hover:bg-secondary/60'}`}
                >
                  <Checkbox 
                    checked={selectedProjects.has(p.id)}
                    onCheckedChange={() => {}}
                    onClick={(e) => toggleProjectSelection(p.id, e)}
                    className="h-4 w-4 flex-shrink-0"
                  />
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === p.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="h-7 text-sm"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={saveRename}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="font-medium text-foreground truncate">{p.name}</h3>
                          {p.is_template && (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                              <Lock className="h-2.5 w-2.5" />
                              Template
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Barcode className="h-3 w-3" />
                            Next: {p.next_code}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Updated: {format(new Date(p.updated_at), "MMM d, yyyy")}
                          </span>
                          {p.printed_at && (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <Printer className="h-3 w-3" />
                              Printed {format(new Date(p.printed_at), "MMM d")}
                            </span>
                          )}
                          {usageByProject[p.id] && (
                            <button
                              className="flex items-center gap-1 text-primary hover:underline"
                              title="View per-code usage"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/projects/${p.id}/codes`);
                              }}
                            >
                              <Activity className="h-3 w-3" />
                              {usageByProject[p.id].used} used / {usageByProject[p.id].unused} unused
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Desktop: hover icons. Mobile: hidden — these live in the ⋮ menu below. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hidden sm:inline-flex h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => downloadLatestExport(p, e)}
                      title="Download Latest Export"
                    >
                      <Download className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hidden sm:inline-flex h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => openCsvImport(p, e)}
                      title="Import CSV & Open"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hidden sm:inline-flex h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => duplicateProject(p, e)}
                      title="Duplicate"
                    >
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Mobile-only quick actions (desktop has the hover icons) */}
                        <DropdownMenuItem className="sm:hidden" onClick={(e) => downloadLatestExport(p, e)}>
                          <Download className="h-4 w-4 mr-2" />
                          Download Latest
                        </DropdownMenuItem>
                        <DropdownMenuItem className="sm:hidden" onClick={(e) => openCsvImport(p, e)}>
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Import CSV & Open
                        </DropdownMenuItem>
                        <DropdownMenuItem className="sm:hidden" onClick={(e) => duplicateProject(p, e)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="sm:hidden" />
                        <DropdownMenuItem onClick={(e) => startRename(p, e)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => openMoveDialog(p.id, e)}>
                          <Folder className="h-4 w-4 mr-2" />
                          Move to Folder
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/projects/${p.id}/codes`);
                          }}
                        >
                          <Activity className="h-4 w-4 mr-2" />
                          View codes &amp; usage
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => togglePrinted(p, e)}>
                          <Printer className="h-4 w-4 mr-2" />
                          {p.printed_at ? "Mark as not printed" : "Mark as printed"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => toggleTemplate(p, e)}>
                          <Lock className="h-4 w-4 mr-2" />
                          {p.is_template ? "Unmark template" : "Mark as template"}
                        </DropdownMenuItem>
                        {p.ondi_batch_id && (
                          <DropdownMenuItem
                            onClick={(e) => syncUsage(p, e)}
                            disabled={syncingProjectId === p.id}
                          >
                            {syncingProjectId === p.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Activity className="h-4 w-4 mr-2" />
                            )}
                            Sync usage from Ondi
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteType("project");
                            setDeleteId(p.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteType === "folder" ? "Folder" : "Project"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteType === "folder" 
                ? "Are you sure you want to delete this folder? Projects inside will be moved to the root level."
                : "Are you sure you want to delete this project? This will also delete all export history. This action cannot be undone."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template edit guard (Feature 5) */}
      <AlertDialog open={!!templateToEdit} onOpenChange={(o) => !o && setTemplateToEdit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              This is a template
            </AlertDialogTitle>
            <AlertDialogDescription>
              Edit a <span className="font-medium text-foreground">copy</span> instead? Editing the
              template directly changes the master design for everyone. (Recommended: edit a copy.)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={editTemplateAnyway}>
              Edit template anyway
            </Button>
            <AlertDialogAction onClick={editTemplateCopy}>Edit a copy</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder{currentFolder ? ` in "${currentFolder.name}"` : ''}</DialogTitle>
            <DialogDescription>Enter a name for your new folder.</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            onKeyDown={(e) => {
              if (e.key === "Enter") createFolder();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>Cancel</Button>
            <Button onClick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Folder Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
            <DialogDescription>Select a folder to move this project to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => moveProject(null)}
            >
              <FolderOpen className="h-4 w-4" />
              Root (No Folder)
            </Button>
            {folders
              .filter(f => f.id !== moveProjectId) // Can't move to self
              .map((folder) => {
                // Build folder path for display
                const getFolderPath = (f: FolderRow): string => {
                  const path: string[] = [f.name];
                  let parent = folders.find(p => p.id === f.parent_folder_id);
                  while (parent) {
                    path.unshift(parent.name);
                    parent = folders.find(p => p.id === parent?.parent_folder_id);
                  }
                  return path.join(' / ');
                };
                return (
                  <Button
                    key={folder.id}
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => moveProject(folder.id)}
                  >
                    <Folder className="h-4 w-4 text-amber-500" />
                    {getFolderPath(folder)}
                  </Button>
                );
              })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoveDialog(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {totalSelected} item{totalSelected !== 1 ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedFolders.size > 0 && `${selectedFolders.size} folder${selectedFolders.size !== 1 ? 's' : ''}`}
              {selectedFolders.size > 0 && selectedProjects.size > 0 && ' and '}
              {selectedProjects.size > 0 && `${selectedProjects.size} project${selectedProjects.size !== 1 ? 's' : ''}`}?
              {selectedFolders.size > 0 && ' Projects inside deleted folders will be moved to the root level.'}
              {selectedProjects.size > 0 && ' All export history for deleted projects will also be removed.'}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Move Dialog */}
      <Dialog open={showBulkMoveDialog} onOpenChange={setShowBulkMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedProjects.size} project{selectedProjects.size !== 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>Select a folder to move the selected projects to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => bulkMoveProjects(null)}
            >
              <FolderOpen className="h-4 w-4" />
              Root (No Folder)
            </Button>
            {folders.map((folder) => {
              const getFolderPath = (f: FolderRow): string => {
                const path: string[] = [f.name];
                let parent = folders.find(p => p.id === f.parent_folder_id);
                while (parent) {
                  path.unshift(parent.name);
                  parent = folders.find(p => p.id === parent?.parent_folder_id);
                }
                return path.join(' / ');
              };
              return (
                <Button
                  key={folder.id}
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => bulkMoveProjects(folder.id)}
                >
                  <Folder className="h-4 w-4 text-amber-500" />
                  {getFolderPath(folder)}
                </Button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkMoveDialog(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Modal */}
      <CsvImport
        isOpen={csvImportOpen}
        onClose={() => {
          setCsvImportOpen(false);
          setCsvImportProjectId(null);
        }}
        onImport={handleCsvImportComplete}
      />
    </DashboardLayout>
  );
}
