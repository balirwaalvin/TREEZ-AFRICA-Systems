/* ============================================
   TREEZ AFRICA SYSTEMS — Testimonials Slider
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const track = document.querySelector('.testimonial-track');
  const items = document.querySelectorAll('.testimonial-item');
  const prevBtn = document.querySelector('.testimonial-prev');
  const nextBtn = document.querySelector('.testimonial-next');
  const dotsContainer = document.querySelector('.testimonial-dots');

  if (!track || items.length === 0) return;

  let currentIndex = 0;
  let autoPlayInterval;
  const totalItems = items.length;

  // Create dots
  items.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.classList.add('testimonial-dot');
    if (i === 0) dot.classList.add('active');
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer?.appendChild(dot);
  });

  const dots = document.querySelectorAll('.testimonial-dot');

  function goToSlide(index) {
    currentIndex = index;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentIndex);
    });
  }

  function nextSlide() {
    goToSlide((currentIndex + 1) % totalItems);
  }

  function prevSlide() {
    goToSlide((currentIndex - 1 + totalItems) % totalItems);
  }

  prevBtn?.addEventListener('click', () => {
    prevSlide();
    resetAutoPlay();
  });

  nextBtn?.addEventListener('click', () => {
    nextSlide();
    resetAutoPlay();
  });

  // Auto play
  function startAutoPlay() {
    autoPlayInterval = setInterval(nextSlide, 5000);
  }

  function resetAutoPlay() {
    clearInterval(autoPlayInterval);
    startAutoPlay();
  }

  startAutoPlay();

  // Pause on hover
  const slider = document.querySelector('.testimonials-slider');
  slider?.addEventListener('mouseenter', () => clearInterval(autoPlayInterval));
  slider?.addEventListener('mouseleave', startAutoPlay);

  // Touch/swipe support
  let touchStartX = 0;
  let touchEndX = 0;

  track.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextSlide();
      else prevSlide();
      resetAutoPlay();
    }
  }, { passive: true });
});

