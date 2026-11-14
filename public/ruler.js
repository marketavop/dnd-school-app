const DEFAULT_FEET_PER_CELL = 5;

function assertPositiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

/** Convert a pointer position in the viewport into the existing map-space coordinates. */
export function pointerToMapPoint(pointer, mapRect, mapScale) {
  assertPositiveFinite(mapScale, 'mapScale');
  return {
    x: (pointer.clientX - mapRect.left) / mapScale,
    y: (pointer.clientY - mapRect.top) / mapScale,
  };
}

/** Return the zero-based column and row containing a map-space point. */
export function mapPointToCell(point, cellSize) {
  assertPositiveFinite(cellSize, 'cellSize');
  return {
    x: Math.floor(point.x / cellSize),
    y: Math.floor(point.y / cellSize),
  };
}

/** Convert a pointer position directly to the cell under it. */
export function pointerToCell(pointer, mapRect, mapScale, cellSize) {
  return mapPointToCell(pointerToMapPoint(pointer, mapRect, mapScale), cellSize);
}

/** Return the map-space center of a zero-based cell. */
export function cellCenter(cell, cellSize) {
  assertPositiveFinite(cellSize, 'cellSize');
  return {
    x: (cell.x + 0.5) * cellSize,
    y: (cell.y + 0.5) * cellSize,
  };
}

/** Measure local grid distance; diagonal movement costs the same as straight movement. */
export function measureDistanceFeet(start, end, feetPerCell = DEFAULT_FEET_PER_CELL) {
  assertPositiveFinite(feetPerCell, 'feetPerCell');
  return Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) * feetPerCell;
}
