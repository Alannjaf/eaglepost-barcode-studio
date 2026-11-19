import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown, ChevronRight, Settings, Bold, Italic,
  AlignStartVertical, AlignEndVertical, AlignStartHorizontal, AlignEndHorizontal,
  AlignCenterVertical, AlignCenterHorizontal, AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";
import {
  DEFAULT_PAGE_SIZES, DEFAULT_MULTI_UP, DEFAULT_PAGE_NUMBER,
  type PageSizePreset, type JobSettings,
} from "@/store/useWorkspaceStore";

export interface PageSetupSectionProps {
  pageSetupOpen: boolean;
  setPageSetupOpen: (open: boolean) => void;
  job: JobSettings;
  setJob: (job: Partial<JobSettings>) => void;
}

function PageSetupSectionInner({
  pageSetupOpen,
  setPageSetupOpen,
  job,
  setJob,
}: PageSetupSectionProps) {
  return (
          <Collapsible open={pageSetupOpen} onOpenChange={setPageSetupOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Settings className="h-4 w-4 text-primary" />
                <span>Page Setup</span>
              </div>
              {pageSetupOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-3">
                <div className="grid grid-cols-2 gap-2 items-center text-sm">
                  <Label className="text-xs">Size</Label>
                  <Select
                    value={job.pageSizePreset}
                    onValueChange={(v) => {
                      const preset = v as PageSizePreset;
                      const base = preset === "Custom" ? job.pageSizeMM : DEFAULT_PAGE_SIZES[preset];
                      const size = job.orientation === "landscape" ? { width: base.height, height: base.width } : base;
                      setJob({ pageSizePreset: preset, pageSizeMM: size });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Page Size" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A4">A4</SelectItem>
                      <SelectItem value="A5">A5</SelectItem>
                      <SelectItem value="Letter">Letter</SelectItem>
                      <SelectItem value="Custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label className="text-xs">Orientation</Label>
                  <Select
                    value={job.orientation}
                    onValueChange={(val) => {
                      const v = val as "portrait" | "landscape";
                      if (job.pageSizePreset === "Custom") {
                        setJob({ orientation: v, pageSizeMM: v === job.orientation ? job.pageSizeMM : { width: job.pageSizeMM.height, height: job.pageSizeMM.width } });
                      } else {
                        const base = DEFAULT_PAGE_SIZES[job.pageSizePreset];
                        const size = v === "landscape" ? { width: base.height, height: base.width } : base;
                        setJob({ orientation: v, pageSizeMM: size });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Orientation" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                    </SelectContent>
                  </Select>

                  <Label className="text-xs">Width (mm)</Label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={job.pageSizeMM.width}
                    onChange={(e) => setJob({ pageSizeMM: { ...job.pageSizeMM, width: Number(e.target.value) } })}
                    disabled={job.pageSizePreset !== "Custom"}
                  />

                  <Label className="text-xs">Height (mm)</Label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={job.pageSizeMM.height}
                    onChange={(e) => setJob({ pageSizeMM: { ...job.pageSizeMM, height: Number(e.target.value) } })}
                    disabled={job.pageSizePreset !== "Custom"}
                  />

                  <Label className="text-xs">Fit to page</Label>
                  <div className="flex justify-end"><Switch checked={job.fitToPage} onCheckedChange={(v) => setJob({ fitToPage: v })} /></div>

                  <Label className={`text-xs ${job.fitToPage || job.multiUp?.enabled ? 'opacity-50' : ''}`}>Design Width (mm)</Label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={job.designWidthMM || 100}
                    onChange={(e) => setJob({ designWidthMM: Number(e.target.value) })}
                    disabled={job.fitToPage || job.multiUp?.enabled}
                  />

                  <Label className={`text-xs ${job.fitToPage || job.multiUp?.enabled ? 'opacity-50' : ''}`}>Design Height (mm)</Label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={job.designHeightMM || 100}
                    onChange={(e) => setJob({ designHeightMM: Number(e.target.value) })}
                    disabled={job.fitToPage || job.multiUp?.enabled}
                  />

                  <Label className="text-xs">Canvas Color</Label>
                  <input
                    type="color"
                    className="h-8 w-full cursor-pointer rounded border border-input"
                    value={job.canvasColor || "#ffffff"}
                    onChange={(e) => setJob({ canvasColor: e.target.value })}
                    title="Printing area background"
                  />

                  <Label className="text-xs">Margin Color</Label>
                  <input
                    type="color"
                    className="h-8 w-full cursor-pointer rounded border border-input"
                    value={job.marginColor || "#f5f5f5"}
                    onChange={(e) => setJob({ marginColor: e.target.value })}
                    title="Margin space background"
                  />
                </div>

            {/* Invoice Mode - Page Numbers */}
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">It's Invoice</Label>
                <Switch
                  checked={job.isInvoice ?? false}
                  onCheckedChange={(v) => setJob({
                    isInvoice: v,
                    pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), enabled: v }
                  })}
                />
              </div>

              {(job.isInvoice ?? false) && (
                <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                  <p className="text-xs text-muted-foreground">Add page numbers to your invoice</p>

                  {/* Position */}
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <Label className="text-xs col-span-4 font-medium">Position (mm)</Label>
                    <Label className="text-xs">X</Label>
                    <Input
                      type="number"
                      step="0.5"
                      className="h-7 text-xs"
                      value={(job.pageNumber || DEFAULT_PAGE_NUMBER).xMM}
                      onChange={(e) => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), xMM: Number(e.target.value) || 10 } })}
                    />
                    <Label className="text-xs">Y</Label>
                    <Input
                      type="number"
                      step="0.5"
                      className="h-7 text-xs"
                      value={(job.pageNumber || DEFAULT_PAGE_NUMBER).yMM}
                      onChange={(e) => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), yMM: Number(e.target.value) || 10 } })}
                    />
                  </div>

                  {/* Font */}
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <Label className="text-xs col-span-2">Font</Label>
                    <Select
                      value={(job.pageNumber || DEFAULT_PAGE_NUMBER).fontFamily}
                      onValueChange={(val: "Helvetica" | "TimesRoman" | "Courier") => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), fontFamily: val } })}
                    >
                      <SelectTrigger className="h-7 text-xs col-span-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Courier" className="text-xs">Courier</SelectItem>
                        <SelectItem value="Helvetica" className="text-xs">Helvetica</SelectItem>
                        <SelectItem value="TimesRoman" className="text-xs">Times</SelectItem>
                      </SelectContent>
                    </Select>
                    <Label className="text-xs">Size</Label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={(job.pageNumber || DEFAULT_PAGE_NUMBER).fontSize}
                      onChange={(e) => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), fontSize: Number(e.target.value) || 10 } })}
                    />
                    <Label className="text-xs">Start #</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="h-7 text-xs"
                      value={String((job.pageNumber || DEFAULT_PAGE_NUMBER).startNumber)}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), startNumber: val === "" ? 0 : parseInt(val, 10) } });
                      }}
                    />
                  </div>

                  {/* Digits */}
                  <div className="grid grid-cols-[auto,1fr] items-center gap-2 text-xs">
                    <Label className="text-xs">Digits</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      className="h-7 text-xs"
                      value={(job.pageNumber || DEFAULT_PAGE_NUMBER).digits || 1}
                      onChange={(e) => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), digits: Math.max(1, Math.min(10, Number(e.target.value) || 1)) } })}
                    />
                  </div>

                  {/* Style */}
                  <div className="flex items-center gap-2 text-xs">
                    <Button
                      variant={(job.pageNumber || DEFAULT_PAGE_NUMBER).bold ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), bold: !(job.pageNumber || DEFAULT_PAGE_NUMBER).bold } })}
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant={(job.pageNumber || DEFAULT_PAGE_NUMBER).italic ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), italic: !(job.pageNumber || DEFAULT_PAGE_NUMBER).italic } })}
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </Button>
                    <Label className="text-xs ml-auto">Color</Label>
                    <input
                      type="color"
                      className="h-7 w-12 cursor-pointer rounded border border-input"
                      value={(job.pageNumber || DEFAULT_PAGE_NUMBER).color || "#000000"}
                      onChange={(e) => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), color: e.target.value } })}
                    />
                  </div>

                  {/* Alignment */}
                  <div className="flex items-center gap-2 text-xs">
                    <Label className="text-xs">Align</Label>
                    <Button
                      variant={(job.pageNumber || DEFAULT_PAGE_NUMBER).alignment === "left" ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), alignment: "left" } })}
                      title="Left align"
                    >
                      <AlignLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant={(job.pageNumber || DEFAULT_PAGE_NUMBER).alignment === "center" ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), alignment: "center" } })}
                      title="Center align"
                    >
                      <AlignCenter className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant={(job.pageNumber || DEFAULT_PAGE_NUMBER).alignment === "right" ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), alignment: "right" } })}
                      title="Right align"
                    >
                      <AlignRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Prefix/Suffix */}
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <Label className="text-xs">Prefix</Label>
                    <Input
                      type="text"
                      className="h-7 text-xs"
                      value={(job.pageNumber || DEFAULT_PAGE_NUMBER).prefix || ""}
                      onChange={(e) => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), prefix: e.target.value } })}
                      placeholder="Page "
                    />
                    <Label className="text-xs">Suffix</Label>
                    <Input
                      type="text"
                      className="h-7 text-xs"
                      value={(job.pageNumber || DEFAULT_PAGE_NUMBER).suffix || ""}
                      onChange={(e) => setJob({ pageNumber: { ...(job.pageNumber || DEFAULT_PAGE_NUMBER), suffix: e.target.value } })}
                      placeholder=" of X"
                    />
                  </div>

                  <p className="text-[10px] text-muted-foreground italic">
                    Tip: Drag the page number on the canvas to position it
                  </p>
                </div>
              )}
            </div>

            {/* Multi-up / Imposition Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Multi-up Mode</Label>
                <Switch
                  checked={job.multiUp?.enabled || false}
                  onCheckedChange={(v) => setJob({ multiUp: { ...(job.multiUp || DEFAULT_MULTI_UP), enabled: v } })}
                />
              </div>

              {job.multiUp?.enabled && (
                <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                  <p className="text-xs text-muted-foreground">Place multiple designs on one page</p>

                  {/* Design Size */}
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <Label className="text-xs col-span-4 font-medium">Design Size (mm)</Label>
                    <Label className="text-xs">Width</Label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={job.multiUp?.designWidthMM || 50}
                      onChange={(e) => setJob({ multiUp: { ...job.multiUp!, designWidthMM: Number(e.target.value) } })}
                    />
                    <Label className="text-xs">Height</Label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={job.multiUp?.designHeightMM || 30}
                      onChange={(e) => setJob({ multiUp: { ...job.multiUp!, designHeightMM: Number(e.target.value) } })}
                    />
                  </div>

                  {/* Margins */}
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <Label className="text-xs col-span-4 font-medium">Margins (mm)</Label>
                    <Label className="text-xs">Top</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 text-xs"
                      value={job.multiUp?.marginTopMM ?? 10}
                      onChange={(e) => setJob({ multiUp: { ...job.multiUp!, marginTopMM: Number(e.target.value) } })}
                    />
                    <Label className="text-xs">Bottom</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 text-xs"
                      value={job.multiUp?.marginBottomMM ?? 10}
                      onChange={(e) => setJob({ multiUp: { ...job.multiUp!, marginBottomMM: Number(e.target.value) } })}
                    />
                    <Label className="text-xs">Left</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 text-xs"
                      value={job.multiUp?.marginLeftMM ?? 10}
                      onChange={(e) => setJob({ multiUp: { ...job.multiUp!, marginLeftMM: Number(e.target.value) } })}
                    />
                    <Label className="text-xs">Right</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 text-xs"
                      value={job.multiUp?.marginRightMM ?? 10}
                      onChange={(e) => setJob({ multiUp: { ...job.multiUp!, marginRightMM: Number(e.target.value) } })}
                    />
                  </div>

                  {/* Gaps */}
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <Label className="text-xs col-span-4 font-medium">Gaps (mm)</Label>
                    <Label className="text-xs">Gap X</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 text-xs"
                      value={job.multiUp?.gapXMM ?? 5}
                      onChange={(e) => setJob({ multiUp: { ...job.multiUp!, gapXMM: Number(e.target.value) } })}
                    />
                    <Label className="text-xs">Gap Y</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 text-xs"
                      value={job.multiUp?.gapYMM ?? 5}
                      onChange={(e) => setJob({ multiUp: { ...job.multiUp!, gapYMM: Number(e.target.value) } })}
                    />
                  </div>

                  {/* Multi-up Colors */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Label className="text-xs col-span-2 font-medium">Colors</Label>
                    <Label className="text-xs">Margin Area</Label>
                    <input
                      type="color"
                      className="h-7 w-full cursor-pointer rounded border border-input"
                      value={job.multiUp?.marginAreaColor || "#e0e0e0"}
                      onChange={(e) => setJob({ multiUp: { ...job.multiUp!, marginAreaColor: e.target.value } })}
                      title="Color for margin area around grid"
                    />
                    <Label className="text-xs">Gap Color</Label>
                    <input
                      type="color"
                      className="h-7 w-full cursor-pointer rounded border border-input"
                      value={job.multiUp?.gapColor || "#d0d0d0"}
                      onChange={(e) => setJob({ multiUp: { ...job.multiUp!, gapColor: e.target.value } })}
                      title="Color for gaps between designs"
                    />
                  </div>

                  {/* Design Alignment */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Design Alignment</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Horizontal</Label>
                        <div className="flex gap-1">
                          <Button
                            variant={job.multiUp?.designAlignH === "left" ? "default" : "outline"}
                            size="sm"
                            className="h-7 flex-1 p-0"
                            onClick={() => setJob({ multiUp: { ...job.multiUp!, designAlignH: "left" } })}
                            title="Align Left"
                          >
                            <AlignStartVertical className="h-3 w-3" />
                          </Button>
                          <Button
                            variant={job.multiUp?.designAlignH === "center" ? "default" : "outline"}
                            size="sm"
                            className="h-7 flex-1 p-0"
                            onClick={() => setJob({ multiUp: { ...job.multiUp!, designAlignH: "center" } })}
                            title="Align Center"
                          >
                            <AlignCenterVertical className="h-3 w-3" />
                          </Button>
                          <Button
                            variant={job.multiUp?.designAlignH === "right" ? "default" : "outline"}
                            size="sm"
                            className="h-7 flex-1 p-0"
                            onClick={() => setJob({ multiUp: { ...job.multiUp!, designAlignH: "right" } })}
                            title="Align Right"
                          >
                            <AlignEndVertical className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Vertical</Label>
                        <div className="flex gap-1">
                          <Button
                            variant={job.multiUp?.designAlignV === "top" ? "default" : "outline"}
                            size="sm"
                            className="h-7 flex-1 p-0"
                            onClick={() => setJob({ multiUp: { ...job.multiUp!, designAlignV: "top" } })}
                            title="Align Top"
                          >
                            <AlignStartHorizontal className="h-3 w-3" />
                          </Button>
                          <Button
                            variant={job.multiUp?.designAlignV === "center" ? "default" : "outline"}
                            size="sm"
                            className="h-7 flex-1 p-0"
                            onClick={() => setJob({ multiUp: { ...job.multiUp!, designAlignV: "center" } })}
                            title="Align Middle"
                          >
                            <AlignCenterHorizontal className="h-3 w-3" />
                          </Button>
                          <Button
                            variant={job.multiUp?.designAlignV === "bottom" ? "default" : "outline"}
                            size="sm"
                            className="h-7 flex-1 p-0"
                            onClick={() => setJob({ multiUp: { ...job.multiUp!, designAlignV: "bottom" } })}
                            title="Align Bottom"
                          >
                            <AlignEndHorizontal className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
              </CollapsibleContent>
            </Collapsible>
  );
}

export const PageSetupSection = React.memo(PageSetupSectionInner);
export default PageSetupSection;
