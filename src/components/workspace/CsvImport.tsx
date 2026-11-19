import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, FileText, ArrowLeft, Barcode } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import OndiBatchPicker, { type PickedBatch } from "@/components/ondi/OndiBatchPicker";
import DuplicateWarningDialog from "@/components/DuplicateWarningDialog";
import { findDuplicateCodes, type DuplicateSummary } from "@/integrations/supabase/tracking";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "@/store/useProjectStore";

interface CsvImportProps {
  onImport: (numbers: string[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedColumn {
  name: string;
  index: number;
  values: string[];
  preview: string[];
}

export default function CsvImport({ onImport, isOpen, onClose }: CsvImportProps) {
  const [csvData, setCsvData] = useState<string>("");
  const [columns, setColumns] = useState<ParsedColumn[]>([]);
  const [selectedColumnIndex, setSelectedColumnIndex] = useState<number | null>(null);
  const [step, setStep] = useState<"upload" | "select">("upload");
  const [showOndi, setShowOndi] = useState(false);
  const [showDup, setShowDup] = useState(false);
  const [dupSummary, setDupSummary] = useState<DuplicateSummary | null>(null);
  const [pendingValues, setPendingValues] = useState<string[] | null>(null);
  const navigate = useNavigate();
  const { setProject } = useProjectStore();

  const finishImport = (values: string[]) => {
    onImport(values);
    resetLocalState();
    onClose();
  };

  // Warn if these codes were already generated before; otherwise import straight away.
  const checkThenImport = async (values: string[]) => {
    try {
      const summary = await findDuplicateCodes(values);
      if (summary.total > 0) {
        setPendingValues(values);
        setDupSummary(summary);
        setShowDup(true);
        return;
      }
    } catch (e) {
      console.warn("Duplicate check failed", e);
    }
    finishImport(values);
  };

  const openExistingProject = (projectId: string, projectName: string) => {
    setShowDup(false);
    setProject(projectId, projectName);
    resetLocalState();
    onClose();
    navigate("/editor");
  };

  const handleOndiPick = (picked: PickedBatch[]) => {
    const values = picked.flatMap((b) => b.values);
    if (values.length === 0) return;
    void checkThenImport(values);
  };

  // Reset every time the dialog opens so switching projects doesn't show stale CSV content.
  const resetLocalState = useCallback(() => {
    setCsvData("");
    setColumns([]);
    setSelectedColumnIndex(null);
    setStep("upload");
  }, []);

  useEffect(() => {
    if (isOpen) resetLocalState();
  }, [isOpen, resetLocalState]);

  const parseColumns = useCallback((content: string): ParsedColumn[] => {
    try {
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length === 0) return [];

      // Detect delimiter
      const firstLine = lines[0];
      let delimiter = ',';
      if (firstLine.includes('\t')) delimiter = '\t';
      else if (firstLine.includes(';')) delimiter = ';';

      // Parse header (first row)
      const headers = firstLine.split(delimiter).map(h => h.trim().replace(/"/g, ''));
      
      // Parse all rows
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

      // Create column objects
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
      setCsvData(content);
      const parsedColumns = parseColumns(content);
      
      if (parsedColumns.length === 0) {
        return;
      }
      
      setColumns(parsedColumns);
      
      // Always default to first column
      setSelectedColumnIndex(0);
      
      setStep("select");
    };
    reader.readAsText(file);
  }, [parseColumns]);

  const handleTextAreaChange = useCallback((value: string) => {
    setCsvData(value);
  }, []);

  const handleParseText = () => {
    if (!csvData.trim()) {
      return;
    }
    const parsedColumns = parseColumns(csvData);
    
    if (parsedColumns.length === 0) {
      return;
    }
    
    setColumns(parsedColumns);
    
    // Always default to first column
    setSelectedColumnIndex(0);
    
    setStep("select");
  };

  const handleImport = () => {
    if (selectedColumnIndex === null) {
      return;
    }
    
    const selectedColumn = columns[selectedColumnIndex];
    if (!selectedColumn || selectedColumn.values.length === 0) {
      return;
    }

    void checkThenImport(selectedColumn.values);
  };

  const handleBack = () => {
    setStep("upload");
    setSelectedColumnIndex(null);
  };

  const handleClose = () => {
    resetLocalState();
    onClose();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => 
      file.type === 'text/csv' || 
      file.name.toLowerCase().endsWith('.csv') ||
      file.type === 'text/plain'
    );
    
    if (csvFile) {
      handleFileSelect(csvFile);
    } else {
      /* dropped item wasn't a CSV/plain-text file; ignore the drop */
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "select" && (
              <Button variant="ghost" size="sm" onClick={handleBack} className="mr-2 h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <FileText className="h-5 w-5" />
            {step === "upload" ? "Import from CSV" : "Select Column"}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {step === "upload" && (
            <>
              {/* Pull from Ondi */}
              <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
                <Barcode className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Pull from Ondi</p>
                  <p className="text-xs text-muted-foreground">
                    Load a branch's barcode batch directly — no CSV needed
                  </p>
                </div>
                <Button size="sm" className="gap-2" onClick={() => setShowOndi(true)}>
                  <Barcode className="h-4 w-4" />
                  From Ondi
                </Button>
              </div>

              <div className="relative text-center">
                <span className="text-xs text-muted-foreground bg-background px-2">or use a CSV</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="csv-file">Upload CSV File</Label>
                <div
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('csv-file')?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-1">
                    Click to select or drag & drop a CSV file
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You'll be able to choose which column to import
                  </p>
                </div>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="csv-text">Or Paste CSV Content</Label>
                <textarea
                  id="csv-text"
                  className="w-full h-32 p-3 border rounded-md resize-none text-sm font-mono bg-background"
                  placeholder="Paste your CSV content here..."
                  value={csvData}
                  onChange={(e) => handleTextAreaChange(e.target.value)}
                />
                <Button 
                  variant="secondary" 
                  onClick={handleParseText}
                  disabled={!csvData.trim()}
                  className="w-full"
                >
                  Parse Content
                </Button>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {step === "select" && (
            <>
              <div className="space-y-2">
                <Label>Select Column to Import</Label>
                <RadioGroup
                  value={selectedColumnIndex?.toString() || ""}
                  onValueChange={(val) => setSelectedColumnIndex(parseInt(val))}
                  className="space-y-3"
                >
                  {columns.map((col, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                        selectedColumnIndex === idx 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                      onClick={() => setSelectedColumnIndex(idx)}
                    >
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value={idx.toString()} id={`col-${idx}`} />
                        <div className="flex-1 min-w-0">
                          <Label 
                            htmlFor={`col-${idx}`} 
                            className="font-medium cursor-pointer"
                          >
                            {col.name}
                          </Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            {col.values.length} values
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {col.preview.map((val, vIdx) => (
                              <span 
                                key={vIdx}
                                className="text-xs bg-muted px-2 py-0.5 rounded font-mono"
                              >
                                {val}
                              </span>
                            ))}
                            {col.values.length > 5 && (
                              <span className="text-xs text-muted-foreground px-2 py-0.5">
                                +{col.values.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleImport}
                  disabled={selectedColumnIndex === null}
                >
                  Import {selectedColumnIndex !== null && columns[selectedColumnIndex] 
                    ? `${columns[selectedColumnIndex].values.length} Codes` 
                    : ""}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>

      {/* Pull-from-Ondi picker (single batch -> import its codes) */}
      <OndiBatchPicker
        isOpen={showOndi}
        onClose={() => setShowOndi(false)}
        onPick={handleOndiPick}
      />

      {/* Duplicate-code warning before importing */}
      <DuplicateWarningDialog
        open={showDup}
        summary={dupSummary}
        proceedLabel="Import anyway"
        onProceed={() => {
          setShowDup(false);
          if (pendingValues) finishImport(pendingValues);
        }}
        onCancel={() => setShowDup(false)}
        onOpenProject={openExistingProject}
      />
    </Dialog>
  );
}
