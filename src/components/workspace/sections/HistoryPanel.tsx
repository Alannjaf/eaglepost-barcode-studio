import React from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Layers, History, Clock, Trash2 } from "lucide-react";
import type { HistoryItem, JobSettings } from "@/store/useWorkspaceStore";

interface MultiUpGridInfo {
  copiesPerRow: number;
  copiesPerCol: number;
  copiesPerPage: number;
  designWidthMM: number;
  designHeightMM: number;
}

export interface HistoryPanelProps {
  applyToAllPages: boolean;
  applyCount: number;
  job: JobSettings;
  multiUpGrid: MultiUpGridInfo | null;
  thumbnails: string[];
  currentPage: number;
  history: HistoryItem[];
  onDeleteHistory: (id: string) => void | Promise<void>;
  onDownloadHistory: (h: HistoryItem) => void | Promise<void>;
  onReopenHistory: (h: HistoryItem) => void | Promise<void>;
}

function HistoryPanelInner({
  applyToAllPages,
  applyCount,
  job,
  multiUpGrid,
  thumbnails,
  currentPage,
  history,
  onDeleteHistory,
  onDownloadHistory,
  onReopenHistory,
}: HistoryPanelProps) {
  return (
    <div className="p-4 space-y-4 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Export Preview */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layers className="h-4 w-4 text-primary" />
          <span>Export Preview</span>
        </div>

        {applyToAllPages && applyCount > 0 && (
          <>
            {job.multiUp?.enabled && multiUpGrid ? (
              <>
                <h3 className="text-sm font-semibold text-foreground my-3">
                  Will export {applyCount} barcode{applyCount > 1 ? "s" : ""} on {Math.ceil(applyCount / multiUpGrid.copiesPerPage)} page{Math.ceil(applyCount / multiUpGrid.copiesPerPage) > 1 ? "s" : ""}
                </h3>
                <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted rounded">
                  <div>Layout: {multiUpGrid.copiesPerRow} × {multiUpGrid.copiesPerCol} = {multiUpGrid.copiesPerPage} per page</div>
                  <div>Barcode size: {Math.round(multiUpGrid.designWidthMM)}×{Math.round(multiUpGrid.designHeightMM)}mm</div>
                  <div>Margins: T{job.multiUp.marginTopMM} R{job.multiUp.marginRightMM} B{job.multiUp.marginBottomMM} L{job.multiUp.marginLeftMM}mm</div>
                  <div>Gap: {job.multiUp.gapXMM}×{job.multiUp.gapYMM}mm</div>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-foreground my-3">Will export {applyCount} page{applyCount > 1 ? "s" : ""}</h3>
                <div className="max-h-[30vh] overflow-auto pr-1">
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: applyCount }).map((_, i) => {
                      const dup = thumbnails[currentPage - 1] ?? thumbnails[0] ?? "./placeholder.svg";
                      return (
                        <div key={`exp-${i}`} className="border rounded overflow-hidden opacity-90">
                          <img src={dup} alt={`Export page ${i + 1}`} className="w-full h-32 object-contain bg-background block" loading="lazy" />
                          <div className="text-center text-xs py-1">{i + 1}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <Separator />

      {/* History Section */}
      <div className="space-y-3 flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="h-4 w-4 text-primary" />
          <span>Export History</span>
        </div>
        <div className="space-y-2 flex-1 overflow-auto">
      {history.length === 0 && <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg text-center">No exports yet</div>}
      {history.map((h) => (
        <div key={h.id} className="p-3 bg-muted/50 hover:bg-muted rounded-lg border border-border/50 transition-colors group">
          <div className="flex items-start gap-2">
            <div className="h-8 w-8 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{h.designFileName}</div>
              <div className="text-xs text-muted-foreground">{new Date(h.timestamp).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">{h.barcodeType.toUpperCase()}: {h.barcodeValue}</div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDeleteHistory(h.id)}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2 mt-2">
            {h.exportFileId && (
              <Button size="sm" variant="outline" onClick={() => onDownloadHistory(h)}>Download</Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => onReopenHistory(h)}>Re-open</Button>
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

export const HistoryPanel = React.memo(HistoryPanelInner);
export default HistoryPanel;
