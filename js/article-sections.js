// Turns the flat HTML produced by Quill into colored <section> blocks.
// The editor stores "section-break" marker divs (data-bg holds the color,
// empty = back to default background) between the article's top-level
// nodes. Everything from one marker up to the next (or the end) gets
// wrapped into a <section style="background:...">. Markers themselves
// are dropped from the output.
function isDarkColor(hex) {
  if (!hex) return false;
  const c = hex.replace('#', '');
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

export function wrapArticleSections(html) {
  if (!html || !html.includes('section-break')) return html || '';

  const source = document.createElement('div');
  source.innerHTML = html;
  const out = document.createElement('div');
  let current = null;

  [...source.childNodes].forEach(node => {
    if (node.nodeType === 1 && node.classList.contains('section-break')) {
      const color = node.dataset.bg || '';
      if (color) {
        current = document.createElement('section');
        current.className = 'article-section' + (isDarkColor(color) ? ' is-dark' : '');
        current.style.background = color;
        out.appendChild(current);
      } else {
        current = null;
      }
      return;
    }
    (current || out).appendChild(node);
  });

  return out.innerHTML;
}
