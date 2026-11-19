import React from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Download, Maximize2, Plus, Minus, Check,
  PanelLeftOpen, ChevronsLeft, ChevronsRight, Loader2,
} from "lucide-react";
import { clamp } from "@/utils/units";
import type { JobSettings } from "@/store/useWorkspaceStore";

interface MultiUpGridInfo {
  copiesPerPage: number;
}

export interface EditorHeaderProps {
  leftCollapsed: boolean;
  toggleLeftCollapsed: () => void;
  zoom: number;
  setZoom: (z: number) => void;
  handleFit: () => void;
  multiUpGrid: MultiUpGridInfo | null;
  applyCount: number;
  job: JobSettings;
  pageCount: number;
  currentPage: number;
  setCurrentPage: (p: number) => void;
  hydrated: boolean;
  saveState: "idle" | "saving" | "saved";
  onExport: () => void;
  pdfArrayBuffer?: ArrayBuffer;
  isExporting: boolean;
}

function EditorHeaderInner({
  leftCollapsed,
  toggleLeftCollapsed,
  zoom,
  setZoom,
  handleFit,
  multiUpGrid,
  applyCount,
  job,
  pageCount,
  currentPage,
  setCurrentPage,
  hydrated,
  saveState,
  onExport,
  pdfArrayBuffer,
  isExporting,
}: EditorHeaderProps) {
  return (
    <div className="bg-card border-b p-3 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Expand the left settings panel — only shown while collapsed (panel is off-screen) */}
        {leftCollapsed && (
          <Button
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex h-8 w-8 p-0"
            onClick={toggleLeftCollapsed}
            title="Show settings panel"
            aria-label="Show settings panel"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </Button>
        )}
        <h3 className="text-sm font-semibold">Canvas Preview</h3>
        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(clamp(zoom - 0.1, 0.25, 4))}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <div className="text-xs font-medium w-12 text-center text-muted-foreground">
            {Math.round(zoom * 100)}%
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(clamp(zoom + 0.1, 0.25, 4))}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleFit} title="Fit to view">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {/* Page navigation - always visible */}
        {(() => {
          const copiesPerPage = multiUpGrid?.copiesPerPage || 1;
          const totalCodes = Math.max(applyCount, 1);
          const multiUpPageCount = job.multiUp?.enabled ? Math.ceil(totalCodes / copiesPerPage) : totalCodes;
          const maxPages = Math.max(pageCount || 1, multiUpPageCount);

          return (
            <div className="flex items-center gap-1 ml-2">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setCurrentPage(1)} disabled={currentPage <= 1} title="First page">
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} title="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-xs text-muted-foreground min-w-[6rem] text-center">
                Page {currentPage} / {maxPages}
              </div>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setCurrentPage(Math.min(maxPages, currentPage + 1))} disabled={currentPage >= maxPages} title="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setCurrentPage(maxPages)} disabled={currentPage >= maxPages} title="Last page">
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          );
        })()}
      </div>
      <div className="flex items-center gap-3">
        {/* Auto-save indicator — only after the project has hydrated, so it never flashes on load */}
        {hydrated && saveState !== "idle" && (
          <div
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            aria-live="polite"
            title={saveState === "saving" ? "Saving changes" : "All changes saved"}
          >
            {saveState === "saving" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 text-primary" />
                <span>Saved</span>
              </>
            )}
          </div>
        )}
        <Button size="sm" className="h-8 px-3 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={onExport} disabled={!pdfArrayBuffer || isExporting}>
          {isExporting ? (
            <>
              <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Export
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export const EditorHeader = React.memo(EditorHeaderInner);
export default EditorHeader;
