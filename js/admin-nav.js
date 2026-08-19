const burger = document.getElementById('admin-burger');
const sidebar = document.getElementById('admin-sidebar');
const overlay = document.getElementById('admin-sidebar-overlay');

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
  burger.classList.remove('is-open');
  burger.setAttribute('aria-expanded', 'false');
}

function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.add('open');
  burger.classList.add('is-open');
  burger.setAttribute('aria-expanded', 'true');
}

if (burger && sidebar && overlay) {
  burger.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  overlay.addEventListener('click', closeSidebar);

  sidebar.querySelectorAll('.sidebar-btn, .sidebar-logout').forEach(btn => {
    btn.addEventListener('click', closeSidebar);
  });
}
