/* ============================================
   TREEZ AFRICA SYSTEMS — Command Palette (Ctrl/Cmd K)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('cmdkOverlay');
  const input = document.getElementById('cmdkInput');
  const results = document.getElementById('cmdkResults');
  const trigger = document.querySelector('.cmdk-trigger');
  if (!overlay || !input || !results) return;

  const items = [
    { label: 'Home', hint: 'Overview', href: '/', group: 'Pages' },
    { label: 'About', hint: 'History, team', href: '/about/', group: 'Pages' },
    { label: 'Services', hint: 'What we build', href: '/services/', group: 'Pages' },
    { label: 'Partners', hint: 'Who we build with', href: '/portfolio/', group: 'Pages' },
    { label: 'Blog', hint: 'Insights & articles', href: '/blog/', group: 'Pages' },
    { label: 'Contact', hint: 'Get in touch', href: '/contact/', group: 'Pages' },
    { label: 'Book a project', hint: 'Start a consultation', href: '/booking/', group: 'Actions' },
    { label: 'Call us', hint: '+256 700 000 000', href: 'tel:+256700000000', group: 'Actions' },
    { label: 'Email us', hint: 'info@treezafrica.systems', href: 'mailto:info@treezafrica.systems', group: 'Actions' },
    { label: 'Web Application Development', hint: 'Service', href: '/services/', group: 'Services' },
    { label: 'Mobile App Development', hint: 'Service', href: '/services/', group: 'Services' },
    { label: 'Enterprise Banking Systems', hint: 'Service', href: '/services/', group: 'Services' },
    { label: 'System Maintenance & Support', hint: 'Service', href: '/services/', group: 'Services' },
    { label: 'IT Consulting & Planning', hint: 'Service', href: '/services/', group: 'Services' },
    { label: 'FAQ', hint: 'Common questions', href: '/contact/', group: 'Pages' }
  ];

  let activeIndex = 0;
  let filtered = items;

  function render() {
    results.innerHTML = '';
    if (!filtered.length) {
      results.innerHTML = '<div class="cmdk-empty">No results</div>';
      return;
    }
    let lastGroup = '';
    filtered.forEach((item, i) => {
      if (item.group !== lastGroup) {
        const groupEl = document.createElement('div');
        groupEl.className = 'cmdk-group';
        groupEl.textContent = item.group;
        results.appendChild(groupEl);
        lastGroup = item.group;
      }
      const row = document.createElement('a');
      row.href = item.href;
      row.className = 'cmdk-item' + (i === activeIndex ? ' active' : '');
      const labelEl = document.createElement('span');
      labelEl.className = 'cmdk-item-label';
      labelEl.textContent = item.label;
      const hintEl = document.createElement('span');
      hintEl.className = 'cmdk-item-hint';
      hintEl.textContent = item.hint;
      row.appendChild(labelEl);
      row.appendChild(hintEl);
      row.addEventListener('mouseenter', () => {
        activeIndex = i;
        render();
      });
      results.appendChild(row);
    });
  }

  function filterItems(query) {
    const q = query.trim().toLowerCase();
    filtered = !q ? items : items.filter((i) => (i.label + ' ' + i.hint).toLowerCase().includes(q));
    activeIndex = 0;
    render();
  }

  function openPalette() {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    input.value = '';
    filterItems('');
    setTimeout(() => input.focus(), 10);
  }

  function closePalette() {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }

  trigger?.addEventListener('click', openPalette);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePalette();
  });
  input.addEventListener('input', () => filterItems(input.value));

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      overlay.hidden ? openPalette() : closePalette();
      return;
    }
    if (overlay.hidden) return;
    if (e.key === 'Escape') {
      closePalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) window.location.href = item.href;
    }
  });

  if (trigger) {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
    const kbd = trigger.querySelector('.cmdk-kbd');
    if (kbd && isMac) kbd.textContent = '⌘K';
  }
});
