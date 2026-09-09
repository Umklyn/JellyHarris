(function () {
  var saved = localStorage.getItem('theme');
  var theme = saved || 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
