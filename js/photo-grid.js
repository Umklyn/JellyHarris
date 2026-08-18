// Photo-grid rows must be exactly as tall as a column is wide, otherwise a
// 2-row "vertical" cell doesn't line up with its neighbors (the row track
// has nothing else to size itself from, since the <img> inside is absolutely
// positioned). We measure the actual column width and pin --cell-size to it.
function sizeGrid(grid) {
  const style = getComputedStyle(grid);
  const cols = style.gridTemplateColumns.split(" ").length;
  const gap = parseFloat(style.columnGap) || 0;
  const cell = (grid.clientWidth - gap * (cols - 1)) / cols;
  if (cell > 0) grid.style.setProperty("--cell-size", `${cell}px`);
}

export function sizePhotoGrids(root = document) {
  root.querySelectorAll(".photo-grid").forEach(sizeGrid);
}

// A single window resize doesn't catch every reason a grid's width can
// change after our first measurement (e.g. a scrollbar appearing once
// images finish loading and the page grows taller than the viewport).
// ResizeObserver reacts to the grid's own box changing, whatever the cause,
// so cell size never gets frozen at a stale width.
const gridObserver = new ResizeObserver(entries => {
  entries.forEach(entry => sizeGrid(entry.target));
});

export function watchPhotoGrids(root = document) {
  root.querySelectorAll(".photo-grid").forEach(grid => gridObserver.observe(grid));
}
