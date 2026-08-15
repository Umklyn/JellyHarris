document.addEventListener("contextmenu", e => {
  if (e.target.tagName === "IMG") e.preventDefault();
});

document.addEventListener("dragstart", e => {
  if (e.target.tagName === "IMG") e.preventDefault();
});
