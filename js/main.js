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

  // ---- Navbar scroll effect ----
  const header = document.querySelector('.header');
  const handleScroll = () => {
    if (window.scrollY > 50) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }

    // Back to top button
    const backToTop = document.querySelector('.back-to-top');
    if (window.scrollY > 500) {
      backToTop?.classList.add('visible');
    } else {
      backToTop?.classList.remove('visible');
    }
  };

  window.addEventListener('scroll', handleScroll);
  handleScroll();

  // ---- Mobile Menu Toggle ----
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');

  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileNav?.classList.toggle('active');
    document.body.style.overflow = mobileNav?.classList.contains('active') ? 'hidden' : '';
  });

  // Close mobile nav on link click
  document.querySelectorAll('.mobile-nav .nav-link').forEach(link => {
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

