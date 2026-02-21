/* ============================================
   TREEZ AFRICA SYSTEMS — Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // ---- Preloader ----
  const preloader = document.querySelector('.preloader');
  window.addEventListener('load', () => {
    setTimeout(() => {
      preloader?.classList.add('hidden');
      document.body.classList.add('loaded');
    }, 800);
  });

  // Fallback: ensure body loads even if load event already fired
  setTimeout(() => {
    preloader?.classList.add('hidden');
    document.body.classList.add('loaded');
  }, 2000);

  // ---- Smart Navbar: hide on scroll-down, show on scroll-up ----
  const header = document.querySelector('.header');
  let lastScrollY = 0;
  let scrollThreshold = 80;   // minimum scroll before hiding kicks in
  let ticking = false;

  const handleScroll = () => {
    const currentScrollY = window.scrollY;

    // Add/remove the "scrolled" glass-intensify class
    if (currentScrollY > 50) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
      header?.classList.remove('header-hidden'); // always show at top
    }

    // Hide / show logic (only after passing threshold)
    if (currentScrollY > scrollThreshold) {
      if (currentScrollY > lastScrollY + 5) {
        // Scrolling DOWN → hide
        header?.classList.add('header-hidden');
      } else if (currentScrollY < lastScrollY - 5) {
        // Scrolling UP → show
        header?.classList.remove('header-hidden');
      }
    }

    lastScrollY = currentScrollY;

    // Back to top button
    const backToTop = document.querySelector('.back-to-top');
    if (currentScrollY > 500) {
      backToTop?.classList.add('visible');
    } else {
      backToTop?.classList.remove('visible');
    }

    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(handleScroll);
      ticking = true;
    }
  });

  handleScroll();

  // ---- Mobile Menu Toggle ----
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');

  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileNav?.classList.toggle('active');
    document.body.style.overflow = mobileNav?.classList.contains('active') ? 'hidden' : '';

    // Keep header visible when mobile menu is open
    if (mobileNav?.classList.contains('active')) {
      header?.classList.remove('header-hidden');
    }
  });

  // Close mobile nav on link click
  document.querySelectorAll('.mobile-nav .nav-link, .mobile-nav .btn').forEach(link => {
    link.addEventListener('click', () => {
      hamburger?.classList.remove('active');
      mobileNav?.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  // ---- Smooth Scroll for anchor links ----
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ---- Back to Top ----
  document.querySelector('.back-to-top')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ---- Active Nav Link ----
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link, .mobile-nav .nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
});
