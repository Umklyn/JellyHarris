const burger = document.querySelector('.nav-burger');
const navLinks = document.querySelector('.nav-links');

if (burger && navLinks) {
  burger.addEventListener('click', () => {
    const open = navLinks.classList.toggle('nav-open');
    burger.setAttribute('aria-expanded', open);
    burger.classList.toggle('is-open', open);
  });

  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('nav-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', false);
    });
  });
}
