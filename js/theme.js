const themeToggle = document.querySelector('.theme-toggle');

const MOON_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

function updateThemeIcon(theme) {
  if (!themeToggle) return;
  const icon = theme === 'dark' ? SUN_ICON : MOON_ICON;
  const iconHolder = themeToggle.querySelector('.theme-toggle-icon');
  const label = themeToggle.querySelector('.theme-toggle-label');
  if (iconHolder) {
    iconHolder.innerHTML = icon;
    if (label) label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  } else {
    themeToggle.innerHTML = icon;
  }
}

if (themeToggle) {
  updateThemeIcon(document.documentElement.getAttribute('data-theme') || 'light');

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  });
}
