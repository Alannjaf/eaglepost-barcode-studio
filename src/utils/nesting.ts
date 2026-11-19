/**
 * PDF Nesting / Bin-Packing Algorithm
 * Places rectangular PDF pages onto canvases with rotation, gaps, and margins.
 */

export interface NestingRect {
  id: string;
  widthMM: number;
  heightMM: number;
  rotation: number; // degrees
  sourcePageIndex: number; // 1-indexed page from source PDF
  sourceFileIndex: number; // index into uploaded files array
}

export interface PlacedRect extends NestingRect {
  xMM: number;
  yMM: number;
  placedWidthMM: number;
  placedHeightMM: number;
}

export interface NestingCanvas {
  widthMM: number;
  heightMM: number;
  placements: PlacedRect[];
}

export interface NestingConfig {
  canvasWidthMM: number;
  canvasHeightMM: number;
  marginTopMM: number;
  marginBottomMM: number;
  marginLeftMM: number;
  marginRightMM: number;
  gapMM: number; // uniform gap between items
}

/**
 * Get effective dimensions after rotation
 */
export function getRotatedDimensions(
  w: number,
  h: number,
  rotationDeg: number
): { width: number; height: number } {
  const r = ((rotationDeg % 360) + 360) % 360;
  if (r === 90 || r === 270) {
    return { width: h, height: w };
  }
  if (r === 0 || r === 180) {
    return { width: w, height: h };
  }
  // Arbitrary angle: compute bounding box
  const rad = (r * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: w * cos + h * sin,
    height: w * sin + h * cos,
  };
}

/**
 * Shelf-based bin packing with best-fit decreasing height.
 * Returns array of canvases (pages) with placed rectangles.
 */
export function nestRectangles(
  rects: NestingRect[],
  config: NestingConfig
): NestingCanvas[] {
  const usableW =
    config.canvasWidthMM - config.marginLeftMM - config.marginRightMM;
  const usableH =
    config.canvasHeightMM - config.marginTopMM - config.marginBottomMM;

  if (usableW <= 0 || usableH <= 0) return [];

  // Compute effective sizes
  const items = rects.map((r) => {
    const dim = getRotatedDimensions(r.widthMM, r.heightMM, r.rotation);
    return { ...r, placedWidthMM: dim.width, placedHeightMM: dim.height };
  });

  // Sort by height descending (best-fit decreasing)
  items.sort((a, b) => b.placedHeightMM - a.placedHeightMM);

  const canvases: NestingCanvas[] = [];

  // Shelf packing
  interface Shelf {
    yStart: number;
    height: number;
    xCursor: number;
  }

  let currentShelves: Shelf[] = [];
  let currentCanvas: PlacedRect[] = [];

  const startNewCanvas = () => {
    if (currentCanvas.length > 0) {
      canvases.push({
        widthMM: config.canvasWidthMM,
        heightMM: config.canvasHeightMM,
        placements: currentCanvas,
      });
    }
    currentCanvas = [];
    currentShelves = [];
  };

  for (const item of items) {
    if (item.placedWidthMM > usableW || item.placedHeightMM > usableH) {
      // Item too large even alone — try to scale or skip
      // For now, place it alone on a canvas
      startNewCanvas();
      currentCanvas.push({
        ...item,
        xMM: config.marginLeftMM,
        yMM: config.marginTopMM,
      });
      startNewCanvas();
      continue;
    }

    let placed = false;

    // Try to fit in existing shelf
    for (const shelf of currentShelves) {
      if (
        item.placedWidthMM <= usableW - shelf.xCursor &&
        item.placedHeightMM <= shelf.height
      ) {
        currentCanvas.push({
          ...item,
          xMM: config.marginLeftMM + shelf.xCursor,
          yMM: config.marginTopMM + shelf.yStart,
        });
        shelf.xCursor += item.placedWidthMM + config.gapMM;
        placed = true;
        break;
      }
    }

    if (!placed) {
      // New shelf
      const shelfY =
        currentShelves.length === 0
          ? 0
          : currentShelves[currentShelves.length - 1].yStart +
            currentShelves[currentShelves.length - 1].height +
            config.gapMM;

      if (shelfY + item.placedHeightMM > usableH) {
        // No room on current canvas, start new one
        startNewCanvas();
        currentShelves = [];
      }

      const finalShelfY =
        currentShelves.length === 0
          ? 0
          : currentShelves[currentShelves.length - 1].yStart +
            currentShelves[currentShelves.length - 1].height +
            config.gapMM;

      currentShelves.push({
        yStart: finalShelfY,
        height: item.placedHeightMM,
        xCursor: item.placedWidthMM + config.gapMM,
      });

      currentCanvas.push({
        ...item,
        xMM: config.marginLeftMM,
        yMM: config.marginTopMM + finalShelfY,
      });
    }
  }

  // Flush remaining
  if (currentCanvas.length > 0) {
    canvases.push({
      widthMM: config.canvasWidthMM,
      heightMM: config.canvasHeightMM,
      placements: currentCanvas,
    });
  }

  return canvases;
}

/**
 * Auto-nest: try both original and 90° rotation for each rect, pick best fit.
 */
export function autoNest(
  rects: NestingRect[],
  config: NestingConfig
): NestingCanvas[] {
  // Try original orientations
  const result1 = nestRectangles(rects, config);

  // Try with each rect also rotated 90°
  const rotated = rects.map((r) => ({
    ...r,
    rotation: (r.rotation + 90) % 360,
  }));
  const result2 = nestRectangles(rotated, config);

  // Try mixed: for each rect, pick the orientation that minimizes waste
  const mixed = rects.map((r) => {
    const dim0 = getRotatedDimensions(r.widthMM, r.heightMM, r.rotation);
    const dim90 = getRotatedDimensions(r.widthMM, r.heightMM, (r.rotation + 90) % 360);
    // Prefer the orientation that is "taller" (better shelf packing)
    if (dim90.height > dim0.height) {
      return { ...r, rotation: (r.rotation + 90) % 360 };
    }
    return r;
  });
  const result3 = nestRectangles(mixed, config);

  // Pick the result with fewest canvases
  const results = [result1, result2, result3];
  results.sort((a, b) => a.length - b.length);
  return results[0];
}
