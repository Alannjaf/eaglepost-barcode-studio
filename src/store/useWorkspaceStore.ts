import { create } from "zustand";

export type PageSizePreset = "A4" | "A5" | "Letter" | "Custom";

export interface PageSizeMM {
  width: number; // mm
  height: number; // mm
}

export type BarcodeType = "code128" | "ean13" | "ean8" | "upca" | "code39" | "itf" | "codabar" | "qr";

export interface BarcodeSettings {
  value: string;
  type: BarcodeType;
  showText: boolean;
  textBg: boolean;
  textSpacingMM: number;
  fontFamily: "Helvetica" | "TimesRoman" | "Courier"; // pdf-lib standard fonts
  fontSize: number; // pt equivalent rendered in mm via conversion
  widthMM: number;
  heightMM: number;
  rotation: 0 | 90 | 180 | 270;
  quietZoneMM: number;
  separator: string; // Separator to insert in barcode display (e.g., "-")
  separatorPositions: number[]; // Positions to insert separator (e.g., [3, 6] for XXX-XXX-XXX)
  separatorPositionsRaw?: string; // Raw input while typing (to allow commas)
  codeOnly: boolean; // When true, only show text (no barcode graphic)
}

export interface Placement {
  xMM: number; // top-left origin in mm
  yMM: number; // top-left origin in mm
  widthMM: number; // barcode width in mm
  heightMM: number; // barcode height in mm
  fontSize: number; // font size in pt for this placement
  id: string;  // unique identifier for the placement
  // Per-placement text controls
  showText: boolean;
  textBgColor: string; // hex color for text background, empty = transparent
  textColor: string; // hex color for text, defaults to black
  textPosition: "bottom" | "top"; // position of text relative to barcode
  bold: boolean;
  italic: boolean;
  underline: boolean;
  codeOnly: boolean; // When true, only show text (no barcode graphic) for this placement
}

export type DesignAlignH = "left" | "center" | "right";
export type DesignAlignV = "top" | "center" | "bottom";

export interface MultiUpSettings {
  enabled: boolean;
  designWidthMM: number; // width of each design copy
  designHeightMM: number; // height of each design copy
  marginTopMM: number;
  marginBottomMM: number;
  marginLeftMM: number;
  marginRightMM: number;
  gapXMM: number; // horizontal gap between copies
  gapYMM: number; // vertical gap between copies
  marginAreaColor: string; // color for margin area (around the grid)
  gapColor: string; // color for gaps between designs
  designAlignH: DesignAlignH; // horizontal alignment of design within cell
  designAlignV: DesignAlignV; // vertical alignment of design within cell
}

// Invoice page number settings
export type TextAlignment = "left" | "center" | "right";

export interface PageNumberSettings {
  enabled: boolean;
  xMM: number; // position from left
  yMM: number; // position from top
  fontFamily: "Helvetica" | "TimesRoman" | "Courier";
  fontSize: number; // pt
  bold: boolean;
  italic: boolean;
  color: string; // hex color
  startNumber: number; // starting page number
  digits: number; // number of digits for zero-padding (e.g., 2 = "01", 3 = "001")
  prefix: string; // text before number (e.g., "Page ")
  suffix: string; // text after number (e.g., " of X")
  alignment: TextAlignment; // text alignment
}

export const DEFAULT_PAGE_NUMBER: PageNumberSettings = {
  enabled: false,
  xMM: 105, // center of A4
  yMM: 280, // near bottom of A4
  fontFamily: "Helvetica",
  fontSize: 10,
  bold: false,
  italic: false,
  color: "#000000",
  startNumber: 0,
  digits: 1, // default 1 digit (no padding)
  prefix: "",
  suffix: "",
  alignment: "left",
};

export interface JobSettings {
  pageSizePreset: PageSizePreset;
  pageSizeMM: PageSizeMM;
  orientation: "portrait" | "landscape";
  fitToPage: boolean;
  designWidthMM: number; // design width for single design mode (when fitToPage is off)
  designHeightMM: number; // design height for single design mode (when fitToPage is off)
  multiUp: MultiUpSettings;
  canvasColor: string; // Background color for the printing area
  marginColor: string; // Background color for the margin space
  isInvoice?: boolean; // Invoice mode flag (optional for backward compatibility)
  pageNumber?: PageNumberSettings; // Page number settings for invoice mode (optional for backward compatibility)
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  designFileName: string;
  designFileId: string; // storage key
  pages: number;
  barcodeValue: string;
  barcodeType: BarcodeType;
  showText: boolean;
  textBg: boolean;
  fontFamily: "Helvetica" | "TimesRoman" | "Courier";
  fontSize: number;
  textSpacingMM: number;
  quietZoneMM: number;
  widthMM: number;
  heightMM: number;
  rotation: number;
  posXMM: number;
  posYMM: number;
  applyToAllPages: boolean;
  appliedPages: number[];
  pageSizePreset: PageSizePreset;
  pageWidthMM: number;
  pageHeightMM: number;
  fitToPage: boolean;
  exportFileId?: string; // storage key for exported PDF
  sequenceStart?: string; // exact sequence start used during export
  snapshot?: unknown; // full restore snapshot (job/barcode/placements/etc)
}

interface WorkspaceState {
  // PDF
  pdfArrayBuffer?: ArrayBuffer;
  pdfName?: string;
  pageCount: number;
  currentPage: number;
  pageSizesMM: PageSizeMM[]; // original page sizes
  thumbnails: string[]; // data URLs

  // Job
  job: JobSettings;

  // Barcode
  barcode: BarcodeSettings;
  placementsByPage: Record<number, Placement[]>; // 1-indexed page -> array of placements
  selectedPlacementIndex: number; // which placement is currently selected for editing
  applyToAllPages: boolean;

  // Sequence generator (numeric string body, e.g., 12 digits for EAN-13)
  sequenceNextBody?: string;

  // View
  zoom: number; // 1 = 100%

  // History
  history: HistoryItem[];

  // Actions
  setPdf: (
    data: { bytes: ArrayBuffer; name: string; pageCount: number; pageSizes: PageSizeMM[]; thumbnails: string[] }
  ) => void;
  setCurrentPage: (p: number) => void;
  setJob: (job: Partial<JobSettings>) => void;
  setBarcode: (b: Partial<BarcodeSettings>) => void;
  setPlacement: (page: number, placementIndex: number, placement: Partial<Placement>) => void;
  addPlacement: (page: number) => void;
  removePlacement: (page: number, placementIndex: number) => void;
  setSelectedPlacementIndex: (index: number) => void;
  setApplyToAll: (v: boolean) => void;
  setZoom: (z: number) => void;
  addHistory: (item: HistoryItem) => void;
  setHistory: (items: HistoryItem[]) => void;
  deleteHistory: (id: string) => void;
  setSequenceNext: (v: string) => void;
  resetProject: () => void; // Reset all state for new project
}

export const DEFAULT_PAGE_SIZES: Record<PageSizePreset, PageSizeMM> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Custom: { width: 210, height: 297 },
};

export const DEFAULT_MULTI_UP: MultiUpSettings = {
  enabled: false,
  designWidthMM: 50,
  designHeightMM: 30,
  marginTopMM: 10,
  marginBottomMM: 10,
  marginLeftMM: 10,
  marginRightMM: 10,
  gapXMM: 5,
  gapYMM: 5,
  marginAreaColor: "#e0e0e0",
  gapColor: "#d0d0d0",
  designAlignH: "center",
  designAlignV: "center",
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  pageCount: 0,
  currentPage: 1,
  pageSizesMM: [],
  thumbnails: [],
  job: {
    pageSizePreset: "A4",
    pageSizeMM: DEFAULT_PAGE_SIZES["A4"],
    orientation: "portrait",
    fitToPage: true,
    designWidthMM: 100,
    designHeightMM: 100,
    multiUp: DEFAULT_MULTI_UP,
    canvasColor: "#ffffff",
    marginColor: "#f5f5f5",
    isInvoice: false,
    pageNumber: DEFAULT_PAGE_NUMBER,
  },
  barcode: {
    value: "123456789012",
    type: "code128",
    showText: true,
    textBg: false,
    textSpacingMM: 2,
    fontFamily: "Helvetica",
    fontSize: 10,
    widthMM: 50,
    heightMM: 20,
    rotation: 0,
    quietZoneMM: 2,
    separator: "",
    separatorPositions: [],
    codeOnly: false,
  },
  placementsByPage: {},
  selectedPlacementIndex: 0,
  applyToAllPages: true,
  sequenceNextBody: "010101010101", // default 12-digit starting pattern 01...
  zoom: 1,
  history: [],

  setPdf: ({ bytes, name, pageCount, pageSizes, thumbnails }) =>
    set((s) => {
      const hasExistingPlacements = Object.keys(s.placementsByPage || {}).length > 0;
      return {
        pdfArrayBuffer: bytes,
        pdfName: name,
        pageCount,
        pageSizesMM: pageSizes,
        thumbnails,
        currentPage: 1,
        placementsByPage: hasExistingPlacements
          ? s.placementsByPage
          : {
              1: [
                {
                  xMM: 10,
                  yMM: 10,
                  widthMM: s.barcode.widthMM,
                  heightMM: s.barcode.heightMM,
                  fontSize: s.barcode.fontSize,
                  id: crypto.randomUUID(),
                  showText: true,
                  textBgColor: "",
                  textColor: "#000000",
                  textPosition: "bottom",
                  bold: false,
                  italic: false,
                  underline: false,
                  codeOnly: false,
                },
              ],
            },
        selectedPlacementIndex: 0,
      };
    }),
  setCurrentPage: (p) => set({ currentPage: p, selectedPlacementIndex: 0 }),
  setJob: (job) => set((s) => ({ job: { ...s.job, ...job } })),
  setBarcode: (b) => set((s) => ({ barcode: { ...s.barcode, ...b } })),
  setPlacement: (page, placementIndex, placement) =>
    set((s) => {
      const targetPage = s.applyToAllPages ? 1 : page;
      const existing = s.placementsByPage[targetPage] || [];
      const updated = [...existing];
      if (updated[placementIndex]) {
        updated[placementIndex] = { ...updated[placementIndex], ...placement };
      }
      return { placementsByPage: { ...s.placementsByPage, [targetPage]: updated } };
    }),
  addPlacement: (page) =>
    set((s) => {
      const targetPage = s.applyToAllPages ? 1 : page;
      const existing = s.placementsByPage[targetPage] || [];
      const newPlacement: Placement = {
        xMM: 10 + existing.length * 20,
        yMM: 10 + existing.length * 20,
        widthMM: s.barcode.widthMM,
        heightMM: s.barcode.heightMM,
        fontSize: s.barcode.fontSize,
        id: crypto.randomUUID(),
        showText: true,
        textBgColor: "",
        textColor: "#000000",
        textPosition: "bottom",
        bold: false,
        italic: false,
        underline: false,
        codeOnly: false,
      };
      return {
        placementsByPage: { ...s.placementsByPage, [targetPage]: [...existing, newPlacement] },
        selectedPlacementIndex: existing.length,
      };
    }),
  removePlacement: (page, placementIndex) =>
    set((s) => {
      const targetPage = s.applyToAllPages ? 1 : page;
      const existing = s.placementsByPage[targetPage] || [];
      if (existing.length <= 1) return {}; // Keep at least one placement
      const updated = existing.filter((_, i) => i !== placementIndex);
      return {
        placementsByPage: { ...s.placementsByPage, [targetPage]: updated },
        selectedPlacementIndex: Math.min(s.selectedPlacementIndex, updated.length - 1),
      };
    }),
  setSelectedPlacementIndex: (index) => set({ selectedPlacementIndex: index }),
  setApplyToAll: (v) => set({ applyToAllPages: v }),
  setZoom: (z) => set({ zoom: Math.max(0.25, Math.min(4, z)) }),
  addHistory: (item) => set((s) => ({ history: [item, ...s.history] })),
  setHistory: (items) => set({ history: items }),
  deleteHistory: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
  setSequenceNext: (v) => set({ sequenceNextBody: v }),
  resetProject: () => set(() => ({
    pdfArrayBuffer: undefined,
    pdfName: undefined,
    pageCount: 0,
    currentPage: 1,
    pageSizesMM: [],
    thumbnails: [],
    job: {
      pageSizePreset: "A4",
      pageSizeMM: DEFAULT_PAGE_SIZES["A4"],
      orientation: "portrait",
      fitToPage: true,
      designWidthMM: 100,
      designHeightMM: 100,
      multiUp: DEFAULT_MULTI_UP,
      canvasColor: "#ffffff",
      marginColor: "#f5f5f5",
      isInvoice: false,
      pageNumber: DEFAULT_PAGE_NUMBER,
    },
    barcode: {
      value: "123456789012",
      type: "code128",
      showText: true,
      textBg: false,
      textSpacingMM: 2,
      fontFamily: "Helvetica",
      fontSize: 10,
      widthMM: 50,
      heightMM: 20,
      rotation: 0,
      quietZoneMM: 2,
      separator: "",
      separatorPositions: [],
      codeOnly: false,
    },
    placementsByPage: {},
    selectedPlacementIndex: 0,
    applyToAllPages: true,
    sequenceNextBody: "010101010101",
    zoom: 1,
    history: [],
  })),
}));
