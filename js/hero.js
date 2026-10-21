/* ============================================
   TREEZ AFRICA SYSTEMS — Homepage Hero
   Dot-matrix Africa network (Kampala hub, packets
   travelling to regional nodes) + headline decode.
   Pure SVG: packet motion is SMIL, so it costs no
   JavaScript per frame and pauses when off-screen.
   ============================================ */

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Run once the preloader has gone (body.loaded), so motion isn't spent behind it
  const whenLoaded = (fn) => {
    if (document.body.classList.contains('loaded')) return fn();
    const mo = new MutationObserver(() => {
      if (document.body.classList.contains('loaded')) {
        mo.disconnect();
        fn();
      }
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  };

  // ---- Network map ----
  const host = document.querySelector('.hero-network-map');

  if (host) {
    const NS = 'http://www.w3.org/2000/svg';

    // Simplified coastline as [lon, lat] — only needs to be good enough for a dot matrix
    const MAINLAND = [
      [-5.8, 35.8], [-2, 35.1], [3, 36.8], [10.2, 37.2], [11, 36.8], [10.5, 34.5], [11.5, 33.2],
      [15, 32.4], [19, 30.3], [20.1, 32], [23.5, 32.6], [25.2, 31.6], [29.9, 31.2], [32.3, 31.3],
      [32.6, 29.9], [34.2, 27.5], [35.5, 24], [37.2, 19.6], [38.6, 17.5], [39.7, 15.5], [41.7, 13.4],
      [43.3, 12.5], [43.3, 11.5], [44.5, 10.4], [47, 11.1], [51.2, 11.8], [51, 10.4], [49.8, 7.8],
      [48, 4.8], [45.3, 2], [42.6, -0.6], [40.9, -2.2], [39.6, -4.5], [39.3, -6.8], [39.6, -9.5],
      [40.5, -11], [40.6, -15], [37, -17.6], [35.4, -21.6], [35.5, -24], [32.9, -25.9], [32.4, -28.6],
      [31, -29.9], [28.6, -32.4], [25.7, -34], [22.1, -34.1], [20, -34.8], [18.4, -34.3], [18.3, -32.2],
      [16.5, -28.6], [15.2, -26.8], [14.5, -22.9], [13.4, -20.6], [11.8, -17.3], [12.3, -13.8], [13.6, -11.4],
      [13.2, -8.8], [12.2, -6], [11.8, -4.4], [9.3, -1], [9.5, 2], [9.7, 4], [8.5, 4.6], [6, 4.3],
      [5, 5.9], [3.4, 6.4], [1.2, 6.1], [-2, 4.8], [-4.2, 5.2], [-7.5, 4.4], [-9.5, 5.6], [-11.5, 6.9],
      [-13.2, 8.5], [-14.8, 10.6], [-16.7, 12.5], [-17.4, 14.7], [-16.5, 16.2], [-16.1, 18.5], [-16.5, 19.9],
      [-17, 21], [-15.8, 23.9], [-14.5, 26], [-12.9, 27.9], [-11.2, 28.5], [-9.7, 30.4], [-9.8, 31.6],
      [-8.5, 33.3], [-6.8, 34.1]
    ];
    const MADAGASCAR = [
      [49.3, -12], [50.5, -15.5], [49.8, -17.3], [48.5, -20.5], [47.1, -24.9], [45.2, -25.5],
      [43.7, -23.5], [43.4, -21.7], [44.4, -19.8], [44, -17.2], [44.4, -16.2], [46.3, -15.6], [47.8, -13.5]
    ];

    const HUB = { name: 'Kampala', lon: 32.58, lat: 0.35 };
    const NODES = [
      { name: 'Nairobi', lon: 36.8, lat: -1.3 },
      { name: 'Kigali', lon: 30.06, lat: -1.95 },
      { name: 'Dar es Salaam', lon: 39.3, lat: -6.8 },
      { name: 'Addis Ababa', lon: 38.7, lat: 9.0, label: true },
      { name: 'Cairo', lon: 31.2, lat: 30.0, label: true },
      { name: 'Lagos', lon: 3.4, lat: 6.5, label: true },
      { name: 'Accra', lon: -0.2, lat: 5.6 },
      { name: 'Dakar', lon: -17.0, lat: 14.7 },
      { name: 'Kinshasa', lon: 15.3, lat: -4.3 },
      { name: 'Lusaka', lon: 28.3, lat: -15.4 },
      { name: 'Johannesburg', lon: 28.0, lat: -26.2, label: true }
    ];

    // Equirectangular projection into a 600 × 640 viewBox
    const W = 600, H = 640;
    const LON0 = -19, LON1 = 53, LAT0 = 38, LAT1 = -37;
    const px = (lon) => ((lon - LON0) / (LON1 - LON0)) * W;
    const py = (lat) => ((LAT0 - lat) / (LAT0 - LAT1)) * H;

    const inside = (poly, x, y) => {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };

    // Dots go into three paths of differing brightness for texture. Each dot is
    // a zero-length segment with a round cap — one element instead of ~900 circles.
    const STEP = 1.6;
    const dotPaths = ['', '', ''];
    let seed = 7;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let lat = LAT0; lat >= LAT1; lat -= STEP) {
      for (let lon = LON0; lon <= LON1; lon += STEP) {
        if (inside(MAINLAND, lon, lat) || inside(MADAGASCAR, lon, lat)) {
          const r = rand();
          dotPaths[r < 0.12 ? 2 : r < 0.45 ? 1 : 0] += `M${px(lon).toFixed(1)} ${py(lat).toFixed(1)}h0`;
        }
      }
    }

    const el = (tag, attrs, parent) => {
      const node = document.createElementNS(NS, tag);
      for (const k in attrs) node.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(node);
      return node;
    };

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' });
    const defs = el('defs', {}, svg);

    // Scan band: a gradient that sweeps down, revealed only through the dots
    const grad = el('linearGradient', { id: 'hnScanGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0', 'stop-color': '#FFB020', 'stop-opacity': '0' }, grad);
    el('stop', { offset: '0.5', 'stop-color': '#FFB020', 'stop-opacity': '0.9' }, grad);
    el('stop', { offset: '1', 'stop-color': '#FFB020', 'stop-opacity': '0' }, grad);
    const mask = el('mask', { id: 'hnDotMask' }, defs);
    el('path', { d: dotPaths.join(''), class: 'hn-dots-mask' }, mask);

    el('path', { d: dotPaths[0], class: 'hn-dots hn-dots-0' }, svg);
    el('path', { d: dotPaths[1], class: 'hn-dots hn-dots-1' }, svg);
    el('path', { d: dotPaths[2], class: 'hn-dots hn-dots-2' }, svg);

    const scanGroup = el('g', { mask: 'url(#hnDotMask)' }, svg);
    const scan = el('rect', { x: 0, y: -140, width: W, height: 140, fill: 'url(#hnScanGrad)' }, scanGroup);
    el('animate', { attributeName: 'y', from: -140, to: H, dur: '7s', repeatCount: 'indefinite' }, scan);

    // Links: curved routes from the hub, bowed perpendicular to their direction
    const hx = px(HUB.lon), hy = py(HUB.lat);
    const links = el('g', { class: 'hn-links' }, svg);
    const packets = el('g', {}, svg);

    NODES.forEach((n, i) => {
      const x = px(n.lon), y = py(n.lat);
      const dx = x - hx, dy = y - hy;
      const bow = 0.18 * (i % 2 ? 1 : -1);
      const cx = (hx + x) / 2 - dy * bow, cy = (hy + y) / 2 + dx * bow;
      const id = `hnRoute${i}`;
      el('path', { id, d: `M${hx.toFixed(1)} ${hy.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`, class: 'hn-link' }, links);

      // One packet out (amber) and one back (green) per route, de-synchronised.
      // Negative begin = already mid-flight, so no packet idles at the origin.
      const dur = 1.6 + Math.hypot(dx, dy) / 160;
      [['hn-packet', '0;1', 0], ['hn-packet hn-packet-in', '1;0', 0.5]].forEach(([cls, keyPoints, phase]) => {
        const dot = el('circle', { r: 2.6, class: cls }, packets);
        const motion = el('animateMotion', {
          dur: `${dur.toFixed(2)}s`,
          begin: `-${((i * 0.37 + phase * dur) % dur).toFixed(2)}s`,
          repeatCount: 'indefinite',
          keyPoints,
          keyTimes: '0;1',
          calcMode: 'linear'
        }, dot);
        const mpath = el('mpath', { href: `#${id}` }, motion);
        mpath.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#${id}`);
      });

      el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.4, class: 'hn-node' }, svg);
      if (n.label) {
        const t = el('text', { x: (x + 8).toFixed(1), y: (y + 4).toFixed(1), class: 'hn-label' }, svg);
        t.textContent = n.name.toUpperCase();
      }
    });

    // Hub with pulsing rings
    el('circle', { cx: hx, cy: hy, r: 6, class: 'hn-ring' }, svg);
    el('circle', { cx: hx, cy: hy, r: 6, class: 'hn-ring hn-ring-2' }, svg);
    el('circle', { cx: hx, cy: hy, r: 5, class: 'hn-hub' }, svg);
    const hubLabel = el('text', { x: hx + 12, y: hy - 8, class: 'hn-label hn-label-hub' }, svg);
    hubLabel.textContent = 'KAMPALA // HQ';

    host.appendChild(svg);

    // Route log: cycles through the links like a tail of a sync log
    const log = document.querySelector('.hero-network-log');
    let logTimer = null;
    let logIndex = 0;
    const writeLog = () => {
      if (!log) return;
      const n = NODES[logIndex++ % NODES.length];
      log.innerHTML = `<span class="hn-log-prompt">&gt;</span> sync kampala &rarr; ${n.name.toLowerCase()} <span class="hn-log-ok">ok</span>`;
    };
    writeLog();

    const setRunning = (running) => {
      if (running && !reduceMotion) {
        svg.unpauseAnimations();
        if (!logTimer) logTimer = setInterval(writeLog, 2200);
      } else {
        svg.pauseAnimations();
        clearInterval(logTimer);
        logTimer = null;
      }
    };

    setRunning(false);
    whenLoaded(() => {
      new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting)).observe(host);
    });
  }

  // ---- Headline decode: emphasis text resolves from noise, left to right ----
  const emphasis = document.querySelector('.hero-emphasis');

  if (emphasis && !reduceMotion) {
    const finalText = emphasis.textContent;
    const glyphs = 'abcdefghijklnopqrstuvxyz';
    emphasis.setAttribute('aria-label', finalText);

    whenLoaded(() => {
      const duration = 900;
      const start = performance.now();
      const frame = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const resolved = Math.floor(progress * finalText.length);
        let out = finalText.slice(0, resolved);
        for (let i = resolved; i < finalText.length; i++) {
          const ch = finalText[i];
          out += /[a-z]/i.test(ch) ? glyphs[(Math.random() * glyphs.length) | 0] : ch;
        }
        emphasis.textContent = out;
        if (progress < 1) requestAnimationFrame(frame);
        else emphasis.removeAttribute('aria-label');
      };
      requestAnimationFrame(frame);
    });
  }
})();
