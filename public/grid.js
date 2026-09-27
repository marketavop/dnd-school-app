export function renderGrid(document, grid, width, height, cellSize) {
  grid.setAttribute('width', width);
  grid.setAttribute('height', height);
  grid.setAttribute('viewBox', `0 0 ${width} ${height}`);
  grid.replaceChildren();
  function line(x1, y1, x2, y2) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    for (const [name, value] of Object.entries({ x1, y1, x2, y2 })) {
      element.setAttribute(name, value);
    }
    grid.append(element);
  }
  for (let x = 0; x <= width; x += cellSize) line(x, 0, x, height);
  for (let y = 0; y <= height; y += cellSize) line(0, y, width, y);
}

