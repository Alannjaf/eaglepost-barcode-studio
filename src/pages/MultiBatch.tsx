import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SupabaseStorageService } from "@/services/storage/SupabaseStorageService";
import { prepareBatchSettings, exportSingleBatch, clearBatchCache, preloadDesign, clearBatchEngineCache } from "@/utils/batchExport";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useProjectStore } from "@/store/useProjectStore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { 
  Upload, 
  FileText, 
  Trash2, 
  Download, 
  Layers, 
  ChevronRight,
  ChevronLeft,
  FileSpreadsheet,
  Package,
  Loader2,
  Check,
  AlertCircle,
  Search,
  ChevronsLeft,
  ChevronsRight,
  FolderPlus,
  FolderOpen,
  Plus,
  Barcode,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import JSZip from "jszip";
import OndiBatchPicker, { type PickedBatch } from "@/components/ondi/OndiBatchPicker";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  recordGeneratedCodes,
  findDuplicateCodes,
  flagPrintedBatches,
  type DuplicateSummary,
  type PrintedFlag,
} from "@/integrations/supabase/tracking";
import DuplicateWarningDialog from "@/components/DuplicateWarningDialog";

interface ProjectRow {
  id: string;
  name: string;
  settings?: Record<string, unknown> | null; // Made optional - loaded on demand
  next_code: string;
  current_design_file_id: string | null;
}

interface FolderRow {
  id: string;
  name: string;
  color: string | null;
}

interface CsvFile {
  id: string;
  name: string;
  values: string[];
  ondiBatchId?: string;
  institutionName?: string;
  branchName?: string;
}

interface PendingFile {
  name: string;
  content: string;
}

interface ParsedColumn {
  name: string;
  index: number;
  values: string[];
  preview: string[];
}

type BatchStatus = "pending" | "processing" | "done" | "error";

interface BatchItem {
  csvFile: CsvFile;
  status: BatchStatus;
  errorMessage?: string;
  generatedProjectId?: string; // Store created project ID
}

interface GeneratedPdfInfo {
  name: string;
  bytes: Uint8Array;
  csvFileId: string;
}

export default function MultiBatch() {
  const navigate = useNavigate();
  const { setProject, setPendingCsvData } = useProjectStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // Step 1: Project selection
  const [styleMode, setStyleMode] = useState<"choose" | "create">("choose");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;
  
  // Step 2: CSV files
  const [csvFiles, setCsvFiles] = useState<CsvFile[]>([]);
  const [showOndi, setShowOndi] = useState(false);
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [pendingFileQueue, setPendingFileQueue] = useState<PendingFile[]>([]);
  const [currentPendingFile, setCurrentPendingFile] = useState<PendingFile | null>(null);
  const [parsedColumns, setParsedColumns] = useState<ParsedColumn[]>([]);
  const [selectedColumnIndex, setSelectedColumnIndex] = useState<number | null>(null);
  
  // Step 3: Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [generatedPdfs, setGeneratedPdfs] = useState<GeneratedPdfInfo[]>([]);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [batchesPerSecond, setBatchesPerSecond] = useState(0);

  // Move to folder dialog
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isMoving, setIsMoving] = useState(false);

  // Pre-generate warning: duplicate codes AND/OR already-printed batches (one combined dialog).
  const [showDupDialog, setShowDupDialog] = useState(false);
  const [dupSummary, setDupSummary] = useState<DuplicateSummary | null>(null);
  const [printedWarn, setPrintedWarn] = useState<PrintedFlag[]>([]);
  const [dupProceedLabel, setDupProceedLabel] = useState("Generate anyway");
  const [pendingDupAction, setPendingDupAction] = useState<(() => void) | null>(null);
  // When off, generate + keep the PDFs for "Save as Projects" without auto-downloading the ZIP.
  const [downloadZip, setDownloadZip] = useState(true);

  // Timer effect for speed meter - 1s interval for minimal overhead
  useEffect(() => {
    if (!isProcessing || !processingStartTime) {
      return;
    }
    const interval = setInterval(() => {
      const elapsed = (performance.now() - processingStartTime) / 1000;
      setElapsedSeconds(elapsed);
      if (processedCount > 0 && elapsed > 0) {
        setBatchesPerSecond(processedCount / elapsed);
      }
    }, 1000); // 1s interval - minimal overhead
    return () => clearInterval(interval);
  }, [isProcessing, processingStartTime, processedCount]);

  // Clear batch engine cache when leaving the page to prevent conflicts with regular editor
  useEffect(() => {
    return () => {
      clearBatchEngineCache();
      clearBatchCache();
    };
  }, []);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async (retryCount = 0) => {
    setLoadingProjects(true);
    try {
      // Only fetch essential fields (not settings which can be very large)
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, next_code, current_design_file_id")
        .not("current_design_file_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(100);
      
      if (error) {
        console.error("Failed to load projects:", error);
        // Retry up to 2 times on failure
        if (retryCount < 2) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return loadProjects(retryCount + 1);
        }
      } else {
        setProjects(data || []);
      }
    } catch (err) {
      console.error("Error loading projects:", err);
      if (retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return loadProjects(retryCount + 1);
      }
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadFolders = async () => {
    setLoadingFolders(true);
    const { data, error } = await supabase
      .from("folders")
      .select("id, name, color")
      .order("name", { ascending: true });

    if (data) setFolders(data);
    if (error) notifyError("Couldn't load folders", error);
    setLoadingFolders(false);
  };

  const parseColumns = useCallback((content: string): ParsedColumn[] => {
    try {
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length === 0) return [];

      const firstLine = lines[0];
      let delimiter = ',';
      if (firstLine.includes('\t')) delimiter = '\t';
      else if (firstLine.includes(';')) delimiter = ';';

      const headers = firstLine.split(delimiter).map(h => h.trim().replace(/"/g, ''));
      const dataRows = lines.slice(1);
      const columnData: string[][] = headers.map(() => []);

      dataRows.forEach(line => {
        const values = line.split(delimiter).map(val => val.trim().replace(/"/g, ''));
        values.forEach((val, idx) => {
          if (idx < columnData.length) {
            const cleaned = val.replace(/[^a-zA-Z0-9]/g, '');
            if (cleaned && cleaned.length > 0) {
              columnData[idx].push(cleaned);
            }
          }
        });
      });

      return headers.map((name, index) => ({
        name: name || `Column ${index + 1}`,
        index,
        values: columnData[index],
        preview: columnData[index].slice(0, 5),
      })).filter(col => col.values.length > 0);
    } catch (error) {
      console.error("Column parse error:", error);
      return [];
    }
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const columns = parseColumns(content);
      
      if (columns.length === 0) {
        return;
      }
      
      const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      
      // Add to queue
      setPendingFileQueue(prev => [...prev, { name: fileName, content }]);
    };
    reader.readAsText(file);
  }, [parseColumns]);

  // Process queue: when dialog is closed and queue has items, open next
  useEffect(() => {
    if (!showColumnDialog && pendingFileQueue.length > 0 && !currentPendingFile) {
      const [next, ...rest] = pendingFileQueue;
      setPendingFileQueue(rest);
      setCurrentPendingFile(next);
      const columns = parseColumns(next.content);
      setParsedColumns(columns);
      setSelectedColumnIndex(0);
      setShowColumnDialog(true);
    }
  }, [showColumnDialog, pendingFileQueue, currentPendingFile, parseColumns]);

  const handleColumnConfirm = () => {
    if (selectedColumnIndex === null || !currentPendingFile) {
      return;
    }
    
    const selectedColumn = parsedColumns[selectedColumnIndex];
    if (!selectedColumn || selectedColumn.values.length === 0) {
      return;
    }
    
    const newCsvFile: CsvFile = {
      id: crypto.randomUUID(),
      name: currentPendingFile.name,
      values: selectedColumn.values,
    };
    
    setCsvFiles(prev => [...prev, newCsvFile]);
    setShowColumnDialog(false);
    setCurrentPendingFile(null);
    setParsedColumns([]);
    setSelectedColumnIndex(null);
  };

  // Apply same column selection to all remaining files in queue
  const handleSelectForAll = () => {
    if (selectedColumnIndex === null || !currentPendingFile) {
      return;
    }
    
    const selectedColumn = parsedColumns[selectedColumnIndex];
    if (!selectedColumn || selectedColumn.values.length === 0) {
      return;
    }
    
    const newFiles: CsvFile[] = [];
    
    // Add current file
    newFiles.push({
      id: crypto.randomUUID(),
      name: currentPendingFile.name,
      values: selectedColumn.values,
    });
    
    // Process all remaining files in queue with same column index
    let skippedCount = 0;
    for (const pendingFile of pendingFileQueue) {
      const columns = parseColumns(pendingFile.content);
      if (columns.length > selectedColumnIndex) {
        const col = columns[selectedColumnIndex];
        if (col && col.values.length > 0) {
          newFiles.push({
            id: crypto.randomUUID(),
            name: pendingFile.name,
            values: col.values,
          });
        } else {
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    }
    
    setCsvFiles(prev => [...prev, ...newFiles]);
    setPendingFileQueue([]); // Clear the queue
    setShowColumnDialog(false);
    setCurrentPendingFile(null);
    setParsedColumns([]);
    setSelectedColumnIndex(null);

    if (skippedCount > 0) {
      notifyError(`${skippedCount} file(s) had no values in that column and were skipped.`);
    }
  };

  const handleColumnSkip = () => {
    setShowColumnDialog(false);
    setCurrentPendingFile(null);
    setParsedColumns([]);
    setSelectedColumnIndex(null);
  };

  const removeCsvFile = (id: string) => {
    setCsvFiles(prev => prev.filter(f => f.id !== id));
  };

  // Each Ondi barcode batch becomes a batch (same as a CSV file: name + values)
  const handleOndiPick = (picked: PickedBatch[]) => {
    const newFiles: CsvFile[] = picked.map((b) => ({
      id: crypto.randomUUID(),
      name: b.name,
      values: b.values,
      ondiBatchId: b.ondiBatchId,
      institutionName: b.institutionName,
      branchName: b.branchName,
    }));
    setCsvFiles((prev) => [...prev, ...newFiles]);
  };

  // Suggest a folder/project name from the Ondi origin: "<Institution> - <Branch>"
  const suggestedFolderName = (): string => {
    const withOrigin = csvFiles.find((c) => c.institutionName || c.branchName);
    if (!withOrigin) return "";
    const inst = withOrigin.institutionName?.trim();
    const branch = withOrigin.branchName?.trim();
    if (inst && branch) return `${inst} - ${branch}`;
    return inst || branch || "";
  };

  // Shared pre-generate guard: warn ONCE if any code was already generated before AND/OR
  // any picked batch was already printed before; otherwise run the action straight through.
  const guardBeforeGenerate = async (
    files: CsvFile[],
    proceedLabel: string,
    action: () => void
  ) => {
    let summary: DuplicateSummary | null = null;
    let flaggedPrinted: PrintedFlag[] = [];

    const codes = files.flatMap((f) => f.values);
    try {
      const s = await findDuplicateCodes(codes);
      if (s.total > 0) summary = s;
    } catch (e) {
      console.warn("Duplicate check failed", e);
    }

    try {
      flaggedPrinted = await flagPrintedBatches(files);
    } catch (e) {
      console.warn("Printed-batch check failed", e);
    }

    if (summary || flaggedPrinted.length) {
      setDupSummary(summary);
      setPrintedWarn(flaggedPrinted);
      setDupProceedLabel(proceedLabel);
      setPendingDupAction(() => action);
      setShowDupDialog(true);
      return;
    }
    action();
  };

  // "Edit in editor": create a NEW project (a copy of the template's style seeded with this
  // batch's codes) and open it — so tweaks are saved to this project and never pollute the template.
  const doEditInEditor = async () => {
    const template = projects.find((p) => p.id === selectedProjectId);
    if (csvFiles.length !== 1 || !template) return;
    const csv = csvFiles[0];
    try {
      const { data: tpl, error } = await supabase
        .from("projects")
        .select("settings, next_code, current_design_file_id")
        .eq("id", template.id)
        .single();
      if (error || !tpl?.current_design_file_id) {
        notifyError("Couldn't open the template for editing", error);
        return;
      }

      const tplSettings = (tpl.settings ?? {}) as Record<string, unknown>;
      const {
        importedNumbers: _importedNumbers,
        currentNumberIndex: _currentNumberIndex,
        applyCount: _applyCount,
        placementsByPage: rawPlacements,
        ...otherSettings
      } = tplSettings as {
        importedNumbers?: unknown;
        currentNumberIndex?: unknown;
        applyCount?: unknown;
        placementsByPage?: Record<string, unknown>;
      };

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

      const newSettings = {
        ...otherSettings,
        placementsByPage: cleanPlacements,
        applyToAllPages: true,
        currentPage: 1,
        importedNumbers: csv.values,
        currentNumberIndex: 0,
        applyCount: Math.max(1, csv.values.length || 1),
      };

      const suggestedName = suggestedFolderName() || csv.name;

      const { data: newProject, error: insErr } = await supabase
        .from("projects")
        .insert({
          name: suggestedName,
          settings: newSettings,
          current_design_file_id: tpl.current_design_file_id,
          next_code: tpl.next_code ?? "0",
          ondi_batch_id: csv.ondiBatchId ?? null,
          institution_name: csv.institutionName ?? null,
          branch_name: csv.branchName ?? null,
        })
        .select("id")
        .single();

      if (insErr || !newProject) {
        notifyError("Couldn't create the project", insErr);
        return;
      }

      if (csv.values.length) {
        try {
          await recordGeneratedCodes({
            projectId: newProject.id,
            codes: csv.values,
            batchName: suggestedName,
            ondiBatchId: csv.ondiBatchId ?? null,
          });
        } catch (e) {
          console.warn("Project created, but failed to record codes for tracking", e);
        }
      }

      setPendingCsvData(csv.values);
      setProject(newProject.id, suggestedName);
      notifySuccess("Opening in editor", "Your tweaks save to this new project — the template stays untouched.");
      navigate("/editor");
    } catch (e) {
      notifyError("Couldn't open editor", e);
    }
  };

  const handleEditInEditor = () => {
    if (csvFiles.length !== 1) return;
    void guardBeforeGenerate([csvFiles[0]], "Edit anyway", () => void doEditInEditor());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv') || file.type === 'text/plain') {
        handleFileSelect(file);
      }
    });
  };

  const handleMultipleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => handleFileSelect(file));
    e.target.value = ""; // Reset input
  };

  // Guard: warn if any incoming code was already generated before, or any batch already printed,
  // then generate.
  const processBatches = async () => {
    if (!selectedProjectId || csvFiles.length === 0) return;
    await guardBeforeGenerate(csvFiles, "Generate anyway", () => void runProcessBatches());
  };

  const openExistingProject = (projectId: string, projectName: string) => {
    setShowDupDialog(false);
    setProject(projectId, projectName);
    navigate("/editor");
  };

  const runProcessBatches = async () => {
    if (!selectedProjectId || csvFiles.length === 0) return;

    const project = projects.find(p => p.id === selectedProjectId);
    if (!project || !project.current_design_file_id) {
      return;
    }

    setStep(3);
    setIsProcessing(true);
    setBatches(csvFiles.map(csv => ({ csvFile: csv, status: "pending" as BatchStatus })));
    setProcessedCount(0);
    setGeneratedPdfs([]);
    setElapsedSeconds(0);
    setBatchesPerSecond(0);

    const startTime = performance.now();
    setProcessingStartTime(startTime);

    // Load design file and project settings in parallel
    const [designRec, projectData] = await Promise.all([
      SupabaseStorageService.getFile(project.current_design_file_id),
      supabase.from("projects").select("settings").eq("id", selectedProjectId).single()
    ]);
    
    if (!designRec?.bytes) {
      setIsProcessing(false);
      setProcessingStartTime(null);
      return;
    }

    // Pre-load and cache PDF structure
    await preloadDesign(designRec.bytes);

    const defaults = useWorkspaceStore.getState();
    const settings = projectData.data?.settings ?? {};
    
    // Pre-compute all settings ONCE (not per batch)
    const batchSettings = prepareBatchSettings(
      settings,
      defaults.job,
      defaults.barcode,
      defaults.placementsByPage
    );

    // MAXIMUM concurrency - 30 parallel batches
    const CONCURRENCY = 30;
    const pdfs: GeneratedPdfInfo[] = new Array(csvFiles.length);
    const batchStatuses: BatchStatus[] = new Array(csvFiles.length).fill("pending");
    let completedCount = 0;

    // Minimal UI updates - only every 1s or when forced
    let lastUpdateTime = performance.now();
    const UPDATE_INTERVAL = 1000;
    
    const updateProgress = (force = false) => {
      const now = performance.now();
      if (force || now - lastUpdateTime > UPDATE_INTERVAL) {
        lastUpdateTime = now;
        setProcessedCount(completedCount);
        // Only update batch statuses on force (final update) to reduce React overhead
        if (force) {
          setBatches(csvFiles.map((csv, idx) => ({ 
            csvFile: csv, 
            status: batchStatuses[idx] 
          })));
        }
      }
    };

    const processSingleBatch = async (index: number): Promise<number> => {
      const csvFile = csvFiles[index];
      batchStatuses[index] = "processing";

      try {
        const pdfBytes = await exportSingleBatch(
          designRec.bytes,
          { name: csvFile.name, values: csvFile.values },
          batchSettings
        );

        pdfs[index] = {
          name: csvFile.name,
          bytes: pdfBytes,
          csvFileId: csvFile.id,
        };
        batchStatuses[index] = "done";
      } catch (error) {
        console.error(`Error processing batch ${csvFile.name}:`, error);
        batchStatuses[index] = "error";
      }

      completedCount++;
      updateProgress();
      return index;
    };

    // Process all batches with maximum parallelism using a semaphore pattern
    const active = new Set<Promise<number>>();
    
    for (let i = 0; i < csvFiles.length; i++) {
      const promise = processSingleBatch(i);
      active.add(promise);
      promise.then(() => active.delete(promise));
      
      // When we hit concurrency limit, wait for one to finish
      if (active.size >= CONCURRENCY) {
        await Promise.race(active);
      }
    }
    
    // Wait for remaining batches
    await Promise.all(active);

    // Final state update
    updateProgress(true);

    // Clear cache after processing
    clearBatchCache();

    // Filter out undefined entries (failed batches)
    const successfulPdfs = pdfs.filter((p): p is GeneratedPdfInfo => p !== undefined);
    
    // Store generated PDFs for potential folder move
    setGeneratedPdfs(successfulPdfs);

    // Create ZIP file with no compression for maximum speed (skip if the user opted out)
    if (downloadZip && successfulPdfs.length > 0) {
      const zip = new JSZip();
      for (const pdf of successfulPdfs) {
        zip.file(`${pdf.name}.pdf`, pdf.bytes);
      }

      try {
        const zipBlob = await zip.generateAsync({ 
          type: "blob",
          compression: "STORE"
        });
        const objectUrl = URL.createObjectURL(zipBlob);
        
        const safeName = (project.name || "multi-batch").replace(/[^a-zA-Z0-9._-]+/g, "_");
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `${safeName}_${timestamp}.zip`;

        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      } catch (error) {
        console.error("Failed to create ZIP:", error);
      }
    }

    setIsProcessing(false);
    setProcessingStartTime(null);
  };

  const openMoveDialog = async () => {
    setShowMoveDialog(true);
    setSelectedFolderId(null);
    setIsCreatingFolder(false);
    // Auto-suggest a folder name from the Ondi institution/branch (editable).
    setNewFolderName(suggestedFolderName());
    await loadFolders();
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;

    const { data, error } = await supabase
      .from("folders")
      .insert({ name })
      .select("id, name, color")
      .single();

    if (error) {
      notifyError("Couldn't create folder", error);
      return;
    }

    if (data) {
      setFolders((prev) => [...prev, data]);
      setSelectedFolderId(data.id);
      setIsCreatingFolder(false);
      setNewFolderName("");
      notifySuccess(`Folder "${data.name}" created`);
    }
  };

  const handleMoveToFolder = async () => {
    if (!selectedFolderId || generatedPdfs.length === 0 || !selectedProjectId) return;

    setIsMoving(true);

    try {
      // Fetch full template project including its design file ID
      const { data: templateFull, error: templateError } = await supabase
        .from("projects")
        .select("settings, next_code, current_design_file_id")
        .eq("id", selectedProjectId)
        .single();

      if (templateError) throw templateError;

      const templateDesignFileId = templateFull?.current_design_file_id;
      if (!templateDesignFileId) {
        notifyError("The selected template has no design file — can't save projects.");
        return;
      }

      const templateSettings = (templateFull?.settings ?? {}) as {
        importedNumbers?: unknown;
        currentNumberIndex?: unknown;
        applyCount?: unknown;
        placementsByPage?: Record<string, unknown>;
      };

      // Extract only the style settings we need, stripping anything CSV-specific from the TEMPLATE.
      // We'll attach the per-batch CSV values per created project below.
      const {
        importedNumbers: _importedNumbers,
        currentNumberIndex: _currentNumberIndex,
        applyCount: _applyCount,
        placementsByPage: rawPlacements,
        ...otherSettings
      } = templateSettings;

      // Clean up placementsByPage to only keep page 1 placements.
      // When applyToAllPages is true, only page 1 is used as the source.
      let cleanPlacements: Record<string, unknown> = {};
      if (rawPlacements) {
        if (rawPlacements["1"] && Array.isArray(rawPlacements["1"])) {
          cleanPlacements = { "1": rawPlacements["1"] };
        } else {
          const firstKey = Object.keys(rawPlacements).sort((a, b) => Number(a) - Number(b))[0];
          if (firstKey && Array.isArray(rawPlacements[firstKey])) {
            cleanPlacements = { "1": rawPlacements[firstKey] };
          }
        }
      }

      // Create a new project for each generated PDF, preserving the STYLE from the template
      // and attaching the correct CSV numbers for that batch so the preview matches "all squares".
      let created = 0;
      for (const pdf of generatedPdfs) {
        const csv = csvFiles.find((c) => c.id === pdf.csvFileId);
        const numbers = csv?.values ?? [];

        // Name consistently with "Edit in editor": "<Institution> - <Branch>" when pulled from Ondi.
        // With several batches at once, append the batch prefix to keep names unique.
        const originName = [csv?.institutionName, csv?.branchName].filter(Boolean).join(" - ");
        const projectName = originName
          ? (generatedPdfs.length > 1 ? `${originName} — ${pdf.name}` : originName)
          : pdf.name;

        const settingsForThisProject = {
          ...otherSettings,
          placementsByPage: cleanPlacements,
          applyToAllPages: true,
          currentPage: 1,
          // Attach the exact values used for this batch so the sheet restores correctly
          importedNumbers: numbers,
          currentNumberIndex: 0,
          applyCount: Math.max(1, numbers.length || 1),
        };

        const { data: newProject, error: insertError } = await supabase
          .from("projects")
          .insert({
            name: projectName,
            folder_id: selectedFolderId,
            settings: settingsForThisProject,
            // Use the template's original design file so placements remain editable
            current_design_file_id: templateDesignFileId,
            next_code: templateFull?.next_code ?? "0",
            // Carry the Ondi origin so usage-sync + auto-naming work later
            ondi_batch_id: csv?.ondiBatchId ?? null,
            institution_name: csv?.institutionName ?? null,
            branch_name: csv?.branchName ?? null,
          })
          .select("id")
          .single();

        if (insertError) {
          notifyError(`Couldn't save project "${pdf.name}"`, insertError);
          continue;
        }

        created += 1;

        // Record the codes for duplicate-detection + usage tracking (best-effort).
        if (newProject?.id && numbers.length) {
          try {
            await recordGeneratedCodes({
              projectId: newProject.id,
              codes: numbers,
              batchName: pdf.name,
              ondiBatchId: csv?.ondiBatchId ?? null,
            });
          } catch (e) {
            console.warn("Project saved, but failed to record codes for tracking", e);
          }
        }
      }

      setShowMoveDialog(false);
      if (created > 0) {
        notifySuccess(
          `Saved ${created} project${created !== 1 ? "s" : ""}`,
          "Find them under Projects."
        );
      }
    } catch (error) {
      notifyError("Failed to save projects", error);
    } finally {
      setIsMoving(false);
    }
  };

  const resetAndGoBack = () => {
    setStep(1);
    setCsvFiles([]);
    setBatches([]);
    setProcessedCount(0);
    setSelectedProjectId(null);
    setGeneratedPdfs([]);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const canProceedToStep2 = selectedProjectId !== null;
  const canProceedToStep3 = csvFiles.length > 0;

  // Filter and paginate projects
  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.next_code.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / ITEMS_PER_PAGE));
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Layers className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Multi Batch Export</h1>
          </div>
          <p className="text-muted-foreground">
            Combine multiple CSV files into separate PDF exports, downloaded together as a ZIP
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step >= s 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground"
              }`}>
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              <span className={`text-sm ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
                {s === 1 ? "Select Project" : s === 2 ? "Add CSV Files" : "Process"}
              </span>
              {s < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Step 1: Project Selection */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Select Project Style
              </CardTitle>
              <CardDescription>
                Choose an existing project as the template, or create a new style for your batches.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Style Mode Toggle */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStyleMode("create");
                    setSelectedProjectId(null);
                  }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    styleMode === "create"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className={`p-3 rounded-full ${styleMode === "create" ? "bg-primary/10" : "bg-muted"}`}>
                    <Plus className={`h-6 w-6 ${styleMode === "create" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <span className={`font-medium ${styleMode === "create" ? "text-foreground" : "text-muted-foreground"}`}>
                    Create New Style
                  </span>
                  <span className="text-xs text-muted-foreground text-center">
                    Start fresh with a new template
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStyleMode("choose")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    styleMode === "choose"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className={`p-3 rounded-full ${styleMode === "choose" ? "bg-primary/10" : "bg-muted"}`}>
                    <FileText className={`h-6 w-6 ${styleMode === "choose" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <span className={`font-medium ${styleMode === "choose" ? "text-foreground" : "text-muted-foreground"}`}>
                    Use Existing Style
                  </span>
                  <span className="text-xs text-muted-foreground text-center">
                    Select from your projects
                  </span>
                </button>
              </div>

              {/* Create New Style Panel */}
              {styleMode === "create" && (
                <div className="border rounded-lg p-6 bg-muted/30 text-center space-y-4">
                  <div className="p-4 rounded-full bg-primary/10 w-fit mx-auto">
                    <Plus className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground mb-1">Create a New Project Style</h3>
                    <p className="text-sm text-muted-foreground">
                      You'll be taken to the editor to upload a design file and configure your barcode settings.
                      Once saved, return here to use it as your batch template.
                    </p>
                  </div>
                  <Button onClick={() => navigate("/projects/new")} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create New Project
                  </Button>
                </div>
              )}

              {/* Choose Existing Style Panel */}
              {styleMode === "choose" && (
                <>
                  {loadingProjects ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No projects with design files found</p>
                      <Button variant="outline" className="mt-4" onClick={() => navigate("/projects")}>
                        Go to Projects
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Search Input */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search projects..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>

                      {filteredProjects.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No projects match "{searchQuery}"</p>
                        </div>
                      ) : (
                        <>
                          <RadioGroup
                            value={selectedProjectId || ""}
                            onValueChange={setSelectedProjectId}
                            className="space-y-2"
                          >
                            {paginatedProjects.map((project) => (
                              <div
                                key={project.id}
                                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                                  selectedProjectId === project.id 
                                    ? 'border-primary bg-primary/5' 
                                    : 'border-border hover:border-muted-foreground/50'
                                }`}
                                onClick={() => setSelectedProjectId(project.id)}
                              >
                                <div className="flex items-center gap-3">
                                  <RadioGroupItem value={project.id} id={project.id} />
                                  <Label htmlFor={project.id} className="flex-1 cursor-pointer">
                                    <span className="font-medium">{project.name}</span>
                                    <span className="text-xs text-muted-foreground ml-2">
                                      Next: {project.next_code}
                                    </span>
                                  </Label>
                                </div>
                              </div>
                            ))}
                          </RadioGroup>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                          <span className="text-xs text-muted-foreground">
                            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredProjects.length)} of {filteredProjects.length}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setCurrentPage(1)}
                              disabled={currentPage === 1}
                            >
                              <ChevronsLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm px-2">
                              {currentPage} / {totalPages}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              disabled={currentPage === totalPages}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setCurrentPage(totalPages)}
                              disabled={currentPage === totalPages}
                            >
                              <ChevronsRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Continue button - only show when choosing existing style */}
              {styleMode === "choose" && (
                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={() => setStep(2)} 
                    disabled={!canProceedToStep2}
                  >
                    Continue
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: CSV Files */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Add CSV Files
              </CardTitle>
              <CardDescription>
                Upload multiple CSV files. Each file will generate a separate PDF named after the CSV file.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Selected project info */}
              {selectedProject && (
                <div className="mb-4 p-3 bg-muted/50 rounded-lg flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Using project: <strong>{selectedProject.name}</strong></span>
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setStep(1)}>
                    Change
                  </Button>
                </div>
              )}

              {/* Pull from Ondi */}
              <div className="mb-4 flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
                <Barcode className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Pull barcode batches from Ondi</p>
                  <p className="text-xs text-muted-foreground">
                    Skip the CSV — load a branch's barcode batches straight from Ondi
                  </p>
                </div>
                <Button variant="default" size="sm" className="gap-2" onClick={() => setShowOndi(true)}>
                  <Barcode className="h-4 w-4" />
                  From Ondi
                </Button>
              </div>

              <div className="relative mb-4 text-center">
                <span className="text-xs text-muted-foreground bg-background px-2">or upload CSV</span>
              </div>

              {/* Upload area */}
              <div
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors mb-4"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => document.getElementById('multi-csv-file')?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-1">
                  Click to select or drag & drop CSV files
                </p>
                <p className="text-xs text-muted-foreground">
                  You can select multiple files at once
                </p>
              </div>
              <input
                id="multi-csv-file"
                type="file"
                accept=".csv,.txt"
                multiple
                className="hidden"
                onChange={handleMultipleFileSelect}
              />

              {/* Added files list */}
              {csvFiles.length > 0 && (
                <div className="space-y-2 mb-4">
                  <Label className="text-sm font-medium">Added Files ({csvFiles.length})</Label>
                  {csvFiles.map((file) => (
                    <div 
                      key={file.id} 
                      className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{file.values.length} codes</p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => removeCsvFile(file.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              <label className="flex items-center gap-2 mb-3 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={downloadZip}
                  onChange={(e) => setDownloadZip(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Download the ZIP after generating (off = just save as projects)
              </label>

              <div className="flex flex-col sm:flex-row sm:justify-between gap-2 mt-6">
                <Button variant="outline" onClick={() => setStep(1)} className="sm:order-1">
                  Back
                </Button>
                <div className="flex flex-col sm:flex-row gap-2 sm:order-2">
                  {csvFiles.length === 1 && (
                    <Button variant="secondary" onClick={handleEditInEditor}>
                      <FileText className="h-4 w-4 mr-2" />
                      Edit in editor
                    </Button>
                  )}
                  <Button
                    onClick={processBatches}
                    disabled={!canProceedToStep3}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloadZip ? "Generate & Download ZIP" : "Generate"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Processing */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {isProcessing ? "Processing Batches..." : "Complete!"}
              </CardTitle>
              <CardDescription>
                {isProcessing 
                  ? `Processing ${processedCount} of ${batches.length} batches`
                  : `Generated ${batches.filter(b => b.status === "done").length} PDFs`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Speed Meter */}
              <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-muted/30 rounded-lg">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">
                    {elapsedSeconds.toFixed(1)}s
                  </p>
                  <p className="text-xs text-muted-foreground">Elapsed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">
                    {batchesPerSecond.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">Batches/sec</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">
                    {isProcessing && batchesPerSecond > 0 
                      ? ((batches.length - processedCount) / batchesPerSecond).toFixed(1) + "s"
                      : "—"
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">ETA</p>
                </div>
              </div>

              <Progress 
                value={(processedCount / batches.length) * 100} 
                className="mb-4"
              />
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {batches.map((batch, idx) => (
                  <div 
                    key={batch.csvFile.id} 
                    className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
                  >
                    {batch.status === "pending" && (
                      <div className="h-4 w-4 rounded-full bg-muted-foreground/30" />
                    )}
                    {batch.status === "processing" && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    {batch.status === "done" && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                    {batch.status === "error" && (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{batch.csvFile.name}.pdf</p>
                      {batch.errorMessage && (
                        <p className="text-xs text-destructive truncate">{batch.errorMessage}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {batch.csvFile.values.length} pages
                    </span>
                  </div>
                ))}
              </div>
              
              {!isProcessing && (
                <div className="flex flex-col sm:flex-row justify-center gap-3 mt-6">
                  {generatedPdfs.length > 0 && (
                    <Button variant="outline" onClick={openMoveDialog}>
                      <FolderPlus className="h-4 w-4 mr-2" />
                      Save as Projects
                    </Button>
                  )}
                  <Button onClick={resetAndGoBack}>
                    Start New Batch
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Column Selection Dialog */}
      <Dialog open={showColumnDialog} onOpenChange={(open) => {
        if (!open) handleColumnSkip();
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Select Column for "{currentPendingFile?.name || ""}"
              {pendingFileQueue.length > 0 && (
                <span className="text-xs text-muted-foreground ml-2">
                  (+{pendingFileQueue.length} more)
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Choose which column contains the barcode values to use for this batch.
            </DialogDescription>
          </DialogHeader>
          
          <RadioGroup
            value={selectedColumnIndex?.toString() || ""}
            onValueChange={(val) => setSelectedColumnIndex(parseInt(val))}
            className="space-y-3 max-h-64 overflow-y-auto"
          >
            {parsedColumns.map((col, idx) => (
              <div
                key={idx}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  selectedColumnIndex === idx 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-muted-foreground/50'
                }`}
                onClick={() => setSelectedColumnIndex(idx)}
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={idx.toString()} id={`col-${idx}`} />
                  <div className="flex-1 min-w-0">
                    <Label htmlFor={`col-${idx}`} className="font-medium cursor-pointer">
                      {col.name}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {col.values.length} values
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {col.preview.slice(0, 3).map((val, vIdx) => (
                        <span 
                          key={vIdx}
                          className="text-xs bg-muted px-2 py-0.5 rounded font-mono"
                        >
                          {val}
                        </span>
                      ))}
                      {col.values.length > 3 && (
                        <span className="text-xs text-muted-foreground px-2 py-0.5">
                          +{col.values.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </RadioGroup>

          <div className="flex justify-between gap-2 pt-4">
            <Button variant="ghost" onClick={handleColumnSkip}>
              Skip
            </Button>
            <div className="flex gap-2">
              {pendingFileQueue.length > 0 && (
                <Button 
                  variant="secondary"
                  onClick={handleSelectForAll}
                  disabled={selectedColumnIndex === null}
                >
                  Use for All ({pendingFileQueue.length + 1})
                </Button>
              )}
              <Button 
                onClick={handleColumnConfirm}
                disabled={selectedColumnIndex === null}
              >
                Add File
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to Folder Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5" />
              Save as Projects
            </DialogTitle>
            <DialogDescription>
              Create {generatedPdfs.length} new project(s) from the generated PDFs. Select a folder to organize them.
            </DialogDescription>
          </DialogHeader>

          {loadingFolders ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Create new folder option */}
              {isCreatingFolder ? (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                    autoFocus
                  />
                  <Button size="sm" onClick={handleCreateFolder}>
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsCreatingFolder(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setIsCreatingFolder(true)}
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Create New Folder
                </Button>
              )}

              {/* Folder list */}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {folders.length === 0 && !isCreatingFolder && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No folders yet. Create one above.
                  </p>
                )}
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedFolderId === folder.id
                        ? "border-2 border-primary bg-primary/5"
                        : "border border-border hover:border-muted-foreground/50"
                    }`}
                    onClick={() => setSelectedFolderId(folder.id)}
                  >
                    <FolderOpen 
                      className="h-4 w-4" 
                      style={{ color: folder.color || "#6366f1" }}
                    />
                    <span className="text-sm font-medium">{folder.name}</span>
                    {selectedFolderId === folder.id && (
                      <Check className="h-4 w-4 text-primary ml-auto" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoveDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleMoveToFolder}
              disabled={!selectedFolderId || isMoving}
            >
              {isMoving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Create {generatedPdfs.length} Projects
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pull-from-Ondi picker (multi-select) */}
      <OndiBatchPicker
        isOpen={showOndi}
        onClose={() => setShowOndi(false)}
        multi
        onPick={handleOndiPick}
      />

      {/* Combined pre-generate warning: already-printed batches AND/OR duplicate codes (one dialog) */}
      <DuplicateWarningDialog
        open={showDupDialog}
        summary={dupSummary}
        printedBatches={printedWarn}
        proceedLabel={dupProceedLabel}
        onProceed={() => {
          setShowDupDialog(false);
          pendingDupAction?.();
          setPendingDupAction(null);
        }}
        onCancel={() => {
          setShowDupDialog(false);
          setPendingDupAction(null);
        }}
        onOpenProject={openExistingProject}
      />
    </DashboardLayout>
  );
}
