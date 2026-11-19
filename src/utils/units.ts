export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

export function ptToMm(pt: number): number {
  return (pt / PT_PER_INCH) * MM_PER_INCH;
}

export function mmToPx(mm: number, dpi = 150): number {
  return (mm / MM_PER_INCH) * dpi;
}

export function pxToMm(px: number, dpi = 150): number {
  return (px / dpi) * MM_PER_INCH;
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
