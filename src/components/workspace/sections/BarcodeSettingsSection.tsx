import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown, ChevronRight, Barcode, Pencil, Check, X,
  AlignStartVertical, AlignEndVertical, AlignStartHorizontal, AlignEndHorizontal,
  AlignCenterVertical, AlignCenterHorizontal,
} from "lucide-react";
import type { JobSettings, BarcodeType, BarcodeSettings, Placement } from "@/store/useWorkspaceStore";

export interface BarcodeSettingsSectionProps {
  barcodeSettingsOpen: boolean;
  setBarcodeSettingsOpen: (open: boolean) => void;
  formattedPreviewCode: string;
  importedNumbers: string[];
  digitsCount: number;
  setDigitsCount: (n: number) => void;
  barcode: BarcodeSettings;
  setBarcode: (b: Partial<BarcodeSettings>) => void;
  genSystemCode: (len: number) => string;
  sequenceNextBody?: string;
  setSequenceNext: (v: string) => void;
  allowedStartLen: number;
  setCsvImportOpen: (open: boolean) => void;
  setImportedNumbers: (v: string[]) => void;
  setCurrentNumberIndex: (n: number) => void;
  setApplyCount: (n: number) => void;
  pageCount: number;
  currentPlacements: Placement[];
  addPlacement: (page: number) => void;
  removePlacement: (page: number, placementIndex: number) => void;
  currentPage: number;
  selectedPlacementIndex: number;
  setSelectedPlacementIndex: (index: number) => void;
  setPlacement: (page: number, placementIndex: number, placement: Partial<Placement>) => void;
  currentPlacement: Placement;
  pdfArrayBuffer?: ArrayBuffer;
  job: JobSettings;
  isEditingPosition: boolean;
  setIsEditingPosition: (v: boolean) => void;
  editPosX: number;
  setEditPosX: (n: number) => void;
  editPosY: number;
  setEditPosY: (n: number) => void;
}

function BarcodeSettingsSectionInner({
  barcodeSettingsOpen,
  setBarcodeSettingsOpen,
  formattedPreviewCode,
  importedNumbers,
  digitsCount,
  setDigitsCount,
  barcode,
  setBarcode,
  genSystemCode,
  sequenceNextBody,
  setSequenceNext,
  allowedStartLen,
  setCsvImportOpen,
  setImportedNumbers,
  setCurrentNumberIndex,
  setApplyCount,
  pageCount,
  currentPlacements,
  addPlacement,
  removePlacement,
  currentPage,
  selectedPlacementIndex,
  setSelectedPlacementIndex,
  setPlacement,
  currentPlacement,
  pdfArrayBuffer,
  job,
  isEditingPosition,
  setIsEditingPosition,
  editPosX,
  setEditPosX,
  editPosY,
  setEditPosY,
}: BarcodeSettingsSectionProps) {
  return (
            <Collapsible open={barcodeSettingsOpen} onOpenChange={setBarcodeSettingsOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-muted transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Barcode className="h-4 w-4 text-primary" />
                  <span>Barcode Settings</span>
                </div>
                {barcodeSettingsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                <div className="grid grid-cols-2 gap-2 items-center text-sm">
                  <Label className="text-xs">Code</Label>
                  <div className="text-xs select-all font-mono truncate">{formattedPreviewCode}</div>

              <Label className={`text-xs ${importedNumbers.length > 0 ? 'opacity-50' : ''}`}>Digits</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                min={barcode.type === "ean13" ? 12 : 1}
                max={64}
                value={digitsCount}
                disabled={importedNumbers.length > 0}
                onChange={(e) => {
                  const raw = Number(e.target.value) || 1;
                  const len = Math.max(barcode.type === "ean13" ? 12 : 1, Math.min(raw, 64));
                  setDigitsCount(len);
                  setBarcode({ value: genSystemCode(len) });
                  const current = barcode.type === "ean13"
                    ? (sequenceNextBody || "").replace(/[^0-9]/g, "")
                    : (sequenceNextBody || "");
                  const allowed = barcode.type === "ean13" ? 12 : len;
                  setSequenceNext(current.slice(0, allowed));
                }}
              />

              <Label className={`text-xs ${importedNumbers.length > 0 ? 'opacity-50' : ''}`}>Start number</Label>
              <div className="flex gap-1">
                <Input
                  type="text"
                  className="h-8 text-xs"
                  inputMode={barcode.type === "ean13" ? "numeric" : "text"}
                  pattern={barcode.type === "ean13" ? "\\d*" : undefined}
                  placeholder={barcode.type === "ean13" ? "12-digit body" : "Start value"}
                  value={sequenceNextBody || ""}
                  maxLength={allowedStartLen}
                  disabled={importedNumbers.length > 0}
                  onChange={(e) => {
                    const v = barcode.type === "ean13"
                      ? (e.target.value || "").replace(/[^0-9]/g, "")
                      : (e.target.value || "");
                    const clamped = v.slice(0, allowedStartLen);
                    setSequenceNext(clamped);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setCsvImportOpen(true)}
                  title="Import numbers from CSV"
                >
                  CSV
                </Button>
              </div>

              {importedNumbers.length > 0 && (
                <div className="col-span-2 space-y-1">
                  <div className="text-xs text-muted-foreground">
                    Using CSV ({importedNumbers.length} numbers)
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setImportedNumbers([]);
                      setCurrentNumberIndex(0);
                      setApplyCount(Math.max(1, pageCount));
                    }}
                  >
                    Clear
                  </Button>
                </div>
              )}

              <Label className="text-xs">Type</Label>
              <Select
                value={barcode.type}
                onValueChange={(v) => setBarcode({ type: v as BarcodeType })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="code128">Code 128</SelectItem>
                  <SelectItem value="ean13">EAN-13</SelectItem>
                  <SelectItem value="qr">QR</SelectItem>
                </SelectContent>
              </Select>

              <Label className="text-xs">Rotation</Label>
              <Select value={String(barcode.rotation)} onValueChange={(v) => setBarcode({ rotation: Number(v) as BarcodeSettings["rotation"] })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0°</SelectItem>
                  <SelectItem value="90">90°</SelectItem>
                  <SelectItem value="180">180°</SelectItem>
                  <SelectItem value="270">270°</SelectItem>
                </SelectContent>
              </Select>


              <Label className="text-xs">Font</Label>
              <Select value={barcode.fontFamily} onValueChange={(v) => setBarcode({ fontFamily: v as BarcodeSettings["fontFamily"] })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Helvetica">Helvetica</SelectItem>
                  <SelectItem value="TimesRoman">Times</SelectItem>
                  <SelectItem value="Courier">Courier</SelectItem>
                </SelectContent>
              </Select>

              <Label className="text-xs">Font size (pt)</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={barcode.fontSize}
                title="Changes the text size of every barcode on this page"
                onChange={(e) => {
                  const size = Number(e.target.value);
                  setBarcode({ fontSize: size });
                  // Each placed barcode keeps its own size, so apply the new size to them too.
                  if (size > 0) currentPlacements.forEach((_, i) => setPlacement(currentPage, i, { fontSize: size }));
                }}
              />

              <Label className="text-xs">Text spacing (mm)</Label>
              <Input type="number" className="h-8 text-xs" value={barcode.textSpacingMM} onChange={(e) => setBarcode({ textSpacingMM: Number(e.target.value) })} />

              {/* Separator settings for Code128 and QR */}
              {barcode.type !== "ean13" && (
                <>
                  <Label className="text-xs">Separator</Label>
                  <Input
                    type="text"
                    className="h-8 text-xs"
                    maxLength={1}
                    placeholder="-"
                    value={barcode.separator || ""}
                    onChange={(e) => setBarcode({ separator: e.target.value.slice(0, 1) })}
                  />

                  <Label className="text-xs">Positions</Label>
                  <Input
                    type="text"
                    className="h-8 text-xs"
                    placeholder="3,6,9"
                    value={barcode.separatorPositionsRaw ?? (barcode.separatorPositions || []).join(",")}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const positions = raw
                        .split(",")
                        .map(s => parseInt(s.trim(), 10))
                        .filter(n => !isNaN(n) && n > 0);
                      setBarcode({ separatorPositions: positions, separatorPositionsRaw: raw });
                    }}
                    onBlur={() => {
                      // Clean up raw value on blur
                      setBarcode({ separatorPositionsRaw: undefined });
                    }}
                  />
                  {barcode.separator && barcode.separatorPositions && barcode.separatorPositions.length > 0 && (
                    <div className="col-span-2 text-xs text-muted-foreground bg-muted p-1 rounded truncate">
                      {formattedPreviewCode}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Multiple barcodes per page controls */}
            <div className="mt-3 p-3 bg-muted/50 rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Barcodes on page</Label>
                <span className="text-sm text-muted-foreground">{currentPlacements.length}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => addPlacement(currentPage)}
                  disabled={!pdfArrayBuffer || currentPlacements.length >= 10}
                >
                  + Add Barcode
                </Button>
                {currentPlacements.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removePlacement(currentPage, selectedPlacementIndex)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              {currentPlacements.length > 0 && (
                <div className="space-y-2">
                  {currentPlacements.map((p, idx) => (
                    <div
                      key={p.id || idx}
                      className={`flex items-center gap-2 p-2 rounded text-xs cursor-pointer ${idx === selectedPlacementIndex ? 'bg-primary/20 border border-primary' : 'bg-muted/30 hover:bg-muted/50'}`}
                      onClick={() => setSelectedPlacementIndex(idx)}
                    >
                      <span className="font-medium w-5">{idx + 1}</span>
                      <span className="text-muted-foreground flex-1">
                        {Math.round(p.widthMM || barcode.widthMM)}×{Math.round(p.heightMM || barcode.heightMM)}mm
                      </span>
                      <span className="text-muted-foreground">
                        {p.fontSize || barcode.fontSize}pt
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Per-placement text controls */}
              {currentPlacements.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs font-medium">Settings for #{selectedPlacementIndex + 1}</Label>

                  <div className="grid grid-cols-2 gap-2 items-center">
                    <Label className="text-xs">Width (mm)</Label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={currentPlacement.widthMM || barcode.widthMM}
                      onChange={(e) => setPlacement(currentPage, selectedPlacementIndex, { widthMM: Number(e.target.value) })}
                    />

                    <Label className="text-xs">Height (mm)</Label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={currentPlacement.heightMM || barcode.heightMM}
                      onChange={(e) => setPlacement(currentPage, selectedPlacementIndex, { heightMM: Number(e.target.value) })}
                    />


                    <Label className="text-xs">Font size (pt)</Label>
                    <Input
                      type="number"
                      min={1}
                      step={0.5}
                      className="h-7 text-xs"
                      value={currentPlacement.fontSize || barcode.fontSize}
                      onChange={(e) => {
                        const size = Number(e.target.value);
                        if (size > 0) setPlacement(currentPage, selectedPlacementIndex, { fontSize: size });
                      }}
                    />

                    <Label className="text-xs">Show text</Label>
                    <div className="flex justify-end">
                      <Switch
                        checked={currentPlacement.showText ?? true}
                        onCheckedChange={(v) => setPlacement(currentPage, selectedPlacementIndex, { showText: v })}
                      />
                    </div>

                    <Label className="text-xs">Text BG color</Label>
                    <div className="flex gap-1 items-center">
                      <input
                        type="color"
                        className="h-7 w-12 cursor-pointer rounded border border-input"
                        value={currentPlacement.textBgColor || "#ffffff"}
                        onChange={(e) => setPlacement(currentPage, selectedPlacementIndex, { textBgColor: e.target.value })}
                        title="Text background color"
                        disabled={!currentPlacement.showText}
                      />
                      {currentPlacement.textBgColor && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setPlacement(currentPage, selectedPlacementIndex, { textBgColor: "" })}
                        >
                          Clear
                        </Button>
                      )}
                    </div>

                    <Label className="text-xs">Text Color</Label>
                    <input
                      type="color"
                      className="h-7 w-full cursor-pointer rounded border border-input"
                      value={currentPlacement.textColor || "#000000"}
                      onChange={(e) => setPlacement(currentPage, selectedPlacementIndex, { textColor: e.target.value })}
                      title="Text color"
                      disabled={!currentPlacement.showText}
                    />

                    <Label className="text-xs">Text Position</Label>
                    <Select
                      value={currentPlacement.textPosition || "bottom"}
                      onValueChange={(v) => setPlacement(currentPage, selectedPlacementIndex, { textPosition: v as "top" | "bottom" })}
                      disabled={!currentPlacement.showText}
                    >
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom">Bottom</SelectItem>
                        <SelectItem value="top">Top</SelectItem>
                      </SelectContent>
                    </Select>

                    <Label className="text-xs">Style</Label>
                    <div className="flex gap-1">
                      <Button
                        variant={currentPlacement.bold ? "default" : "outline"}
                        size="sm"
                        className="h-7 w-7 p-0 font-bold"
                        onClick={() => setPlacement(currentPage, selectedPlacementIndex, { bold: !currentPlacement.bold })}
                        disabled={!currentPlacement.showText}
                      >
                        B
                      </Button>
                      <Button
                        variant={currentPlacement.italic ? "default" : "outline"}
                        size="sm"
                        className="h-7 w-7 p-0 italic"
                        onClick={() => setPlacement(currentPage, selectedPlacementIndex, { italic: !currentPlacement.italic })}
                        disabled={!currentPlacement.showText}
                      >
                        I
                      </Button>
                      <Button
                        variant={currentPlacement.underline ? "default" : "outline"}
                        size="sm"
                        className="h-7 w-7 p-0 underline"
                        onClick={() => setPlacement(currentPage, selectedPlacementIndex, { underline: !currentPlacement.underline })}
                        disabled={!currentPlacement.showText}
                      >
                        U
                      </Button>
                    </div>

                    {/* Alignment Controls */}
                    <Label className="text-xs">Align</Label>
                    <div className="flex gap-1 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setPlacement(currentPage, selectedPlacementIndex, { xMM: 0 })}
                        title="Align Left"
                        disabled={!pdfArrayBuffer}
                      >
                        <AlignStartVertical className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          const pageW = job.multiUp?.enabled ? (job.multiUp.designWidthMM || 50) : job.pageSizeMM.width;
                          const plW = currentPlacement.widthMM || barcode.widthMM;
                          setPlacement(currentPage, selectedPlacementIndex, { xMM: (pageW - plW) / 2 });
                        }}
                        title="Align Center Horizontal"
                        disabled={!pdfArrayBuffer}
                      >
                        <AlignCenterVertical className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          const pageW = job.multiUp?.enabled ? (job.multiUp.designWidthMM || 50) : job.pageSizeMM.width;
                          const plW = currentPlacement.widthMM || barcode.widthMM;
                          setPlacement(currentPage, selectedPlacementIndex, { xMM: pageW - plW });
                        }}
                        title="Align Right"
                        disabled={!pdfArrayBuffer}
                      >
                        <AlignEndVertical className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setPlacement(currentPage, selectedPlacementIndex, { yMM: 0 })}
                        title="Align Top"
                        disabled={!pdfArrayBuffer}
                      >
                        <AlignStartHorizontal className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          const pageH = job.multiUp?.enabled ? (job.multiUp.designHeightMM || 30) : job.pageSizeMM.height;
                          const plH = currentPlacement.heightMM || barcode.heightMM;
                          setPlacement(currentPage, selectedPlacementIndex, { yMM: (pageH - plH) / 2 });
                        }}
                        title="Align Center Vertical"
                        disabled={!pdfArrayBuffer}
                      >
                        <AlignCenterHorizontal className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          const pageH = job.multiUp?.enabled ? (job.multiUp.designHeightMM || 30) : job.pageSizeMM.height;
                          const plH = currentPlacement.heightMM || barcode.heightMM;
                          setPlacement(currentPage, selectedPlacementIndex, { yMM: pageH - plH });
                        }}
                        title="Align Bottom"
                        disabled={!pdfArrayBuffer}
                      >
                        <AlignEndHorizontal className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Manual Position Editing */}
                    <Label className="text-xs">Position</Label>
                    <div className="col-span-1">
                      {!isEditingPosition ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-full text-xs gap-1"
                          onClick={() => {
                            setEditPosX(currentPlacement.xMM ?? 10);
                            setEditPosY(currentPlacement.yMM ?? 10);
                            setIsEditingPosition(true);
                          }}
                          disabled={!pdfArrayBuffer}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                      ) : (
                        <div className="flex gap-1">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setPlacement(currentPage, selectedPlacementIndex, { xMM: editPosX, yMM: editPosY });
                              setIsEditingPosition(false);
                            }}
                            title="Save position"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setIsEditingPosition(false)}
                            title="Cancel"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {isEditingPosition && (
                      <>
                        <Label className="text-xs">X (mm)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          className="h-7 text-xs"
                          value={editPosX}
                          onChange={(e) => setEditPosX(Number(e.target.value))}
                        />
                        <Label className="text-xs">Y (mm)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          className="h-7 text-xs"
                          value={editPosY}
                          onChange={(e) => setEditPosY(Number(e.target.value))}
                        />
                      </>
                    )}

                    {!isEditingPosition && (
                      <div className="col-span-2 text-xs text-muted-foreground">
                        X: {(currentPlacement.xMM ?? 0).toFixed(1)}mm, Y: {(currentPlacement.yMM ?? 0).toFixed(1)}mm
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

              </CollapsibleContent>
            </Collapsible>
  );
}

export const BarcodeSettingsSection = React.memo(BarcodeSettingsSectionInner);
export default BarcodeSettingsSection;
