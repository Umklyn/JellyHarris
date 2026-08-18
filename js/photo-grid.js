// Photo-grid rows must be exactly as tall as a column is wide, otherwise a
// 2-row "vertical" cell doesn't line up with its neighbors (the row track
// has nothing else to size itself from, since the <img> inside is absolutely
// positioned). We measure the actual column width and pin --cell-size to it.
export function sizePhotoGrids(root = document) {
  root.querySelectorAll(".photo-grid").forEach(grid => {
    const style = getComputedStyle(grid);
    const cols = style.gridTemplateColumns.split(" ").length;
    const gap = parseFloat(style.columnGap) || 0;
    const cell = (grid.clientWidth - gap * (cols - 1)) / cols;
    if (cell > 0) grid.style.setProperty("--cell-size", `${cell}px`);
  });
}

window.addEventListener("resize", () => sizePhotoGrids());
