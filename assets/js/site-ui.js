(() => {
  const THEME_STORAGE_KEY = 'edge-theme-v2';
  const root = document.documentElement;
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  function applyTheme(theme, persist = false) {
    const activeTheme = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', activeTheme);
    root.style.colorScheme = activeTheme;

    if (persist) localStorage.setItem(THEME_STORAGE_KEY, activeTheme);

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
      const label = nextTheme === 'dark' ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح';
      button.innerHTML = `<i class="fa-solid fa-${nextTheme === 'dark' ? 'moon' : 'sun'}" aria-hidden="true"></i>`;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(activeTheme === 'dark'));
      button.title = label;
    });

    document.querySelectorAll('[data-theme-logo-light][data-theme-logo-dark]').forEach(image => {
      image.src = activeTheme === 'dark'
        ? image.getAttribute('data-theme-logo-dark')
        : image.getAttribute('data-theme-logo-light');
    });
  }

  applyTheme(savedTheme);

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(root.getAttribute('data-theme'));

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
      });
    });

    const navMenu = document.getElementById('nav-menu');
    const mobileMenuButton = document.getElementById('mobile-menu-btn');

    function closeMobileNavigation() {
      navMenu?.classList.remove('open');
      navMenu?.querySelectorAll('.nav-dropdown[open]').forEach(dropdown => dropdown.removeAttribute('open'));
      if (mobileMenuButton) {
        mobileMenuButton.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
        mobileMenuButton.setAttribute('aria-expanded', 'false');
        mobileMenuButton.setAttribute('aria-label', 'فتح القائمة');
      }
    }

    mobileMenuButton?.addEventListener('click', () => {
      const isOpen = navMenu?.classList.toggle('open');
      mobileMenuButton.innerHTML = isOpen
        ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
      mobileMenuButton.setAttribute('aria-expanded', String(Boolean(isOpen)));
      mobileMenuButton.setAttribute('aria-label', isOpen ? 'إغلاق القائمة' : 'فتح القائمة');
    });

    navMenu?.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeMobileNavigation);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && navMenu?.classList.contains('open')) {
        closeMobileNavigation();
        mobileMenuButton?.focus();
      }
    });

    document.addEventListener('click', event => {
      if (!navMenu?.classList.contains('open')) return;
      const path = event.composedPath();
      if (!navMenu.contains(event.target) && !path.includes(mobileMenuButton)) {
        closeMobileNavigation();
      }
    });
  });

  window.addEventListener('storage', event => {
    if (event.key === THEME_STORAGE_KEY) applyTheme(event.newValue);
  });
})();
