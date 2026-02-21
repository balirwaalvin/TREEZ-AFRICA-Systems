/* ============================================
   TREEZ AFRICA SYSTEMS — Animations JS
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ---- Scroll Reveal (IntersectionObserver) ----
  const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // ---- Stagger children reveal ----
  const staggerContainers = document.querySelectorAll('.stagger');

  const staggerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const children = entry.target.children;
        Array.from(children).forEach((child, i) => {
          setTimeout(() => {
            child.classList.add('revealed');
          }, i * 120);
        });
      }
    });
  }, {
    threshold: 0.1
  });

  staggerContainers.forEach(el => staggerObserver.observe(el));

  // ---- Counter Animation ----
  const counters = document.querySelectorAll('.counter-value');

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.getAttribute('data-target'));
        const suffix = el.getAttribute('data-suffix') || '';
        const duration = 2000;
        const startTime = performance.now();

        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Ease out quad
          const eased = 1 - (1 - progress) * (1 - progress);
          const current = Math.floor(eased * target);

          el.textContent = current + suffix;

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            el.textContent = target + suffix;
          }
        };

        requestAnimationFrame(animate);
        counterObserver.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(el => counterObserver.observe(el));

  // ---- Parallax on mouse move (hero section) ----
  const hero = document.querySelector('.hero');
  if (hero) {
    const floatingIcons = hero.querySelectorAll('.hero-icon-float');

    hero.addEventListener('mousemove', (e) => {
      const { clientX, clientY } = e;
      const { left, top, width, height } = hero.getBoundingClientRect();
      const x = (clientX - left) / width - 0.5;
      const y = (clientY - top) / height - 0.5;

      floatingIcons.forEach((icon, i) => {
        const speed = (i + 1) * 15;
        icon.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
      });
    });
  }

  // ---- Tilt effect on cards ----
  document.querySelectorAll('.card-tilt').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const { left, top, width, height } = card.getBoundingClientRect();
      const x = (e.clientX - left) / width - 0.5;
      const y = (e.clientY - top) / height - 0.5;

      card.style.transform = `perspective(1000px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-5px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateY(0) rotateX(0) translateY(0)';
    });
  });

  // ---- Typed text effect ----
  const typedElements = document.querySelectorAll('.typed-text');
  typedElements.forEach(el => {
    const words = JSON.parse(el.getAttribute('data-words') || '[]');
    if (words.length === 0) return;

    let wordIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let isPaused = false;

    const type = () => {
      const currentWord = words[wordIndex];

      if (isPaused) {
        isPaused = false;
        isDeleting = true;
        setTimeout(type, 50);
        return;
      }

      if (isDeleting) {
        el.textContent = currentWord.substring(0, charIndex - 1);
        charIndex--;

        if (charIndex === 0) {
          isDeleting = false;
          wordIndex = (wordIndex + 1) % words.length;
          setTimeout(type, 300);
          return;
        }
      } else {
        el.textContent = currentWord.substring(0, charIndex + 1);
        charIndex++;

        if (charIndex === currentWord.length) {
          isPaused = true;
          setTimeout(type, 2000);
          return;
        }
      }

      setTimeout(type, isDeleting ? 40 : 80);
    };

    setTimeout(type, 1000);
  });
});

