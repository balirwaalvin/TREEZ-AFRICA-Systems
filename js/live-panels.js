/* ============================================
   TREEZ AFRICA SYSTEMS — Live Panels
   Makes the coded system panels behave like the
   systems they depict: ticking metrics, streaming
   transactions, deploy logs, uptime history.
   Every loop runs only while its panel is on screen,
   and nothing animates under prefers-reduced-motion —
   the static HTML is already the finished state.
   ============================================ */

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => n.toLocaleString('en-US');

  // Start a loop when `el` scrolls into view and stop it when it leaves
  const whileVisible = (el, start, stop) => {
    new IntersectionObserver(([entry]) => {
      entry.isIntersecting ? start() : stop();
    }, { threshold: 0.2 }).observe(el);
  };

  const every = (el, ms, tick) => {
    let timer = null;
    whileVisible(el,
      () => { if (!timer) timer = setInterval(tick, ms); },
      () => { clearInterval(timer); timer = null; });
  };

  // ---- Uptime history: 90 daily bars (built even under reduced motion — it's data, not motion) ----
  document.querySelectorAll('[data-uptime-bars]').forEach(bar => {
    const wrap = document.createElement('div');
    wrap.className = 'uptime-history';
    const bars = document.createElement('div');
    bars.className = 'uptime-bars';
    for (let day = 0; day < 90; day++) {
      const b = document.createElement('span');
      // 99.98% over 90 days ≈ 26 minutes of degradation — one amber day
      if (day === 53) {
        b.className = 'is-degraded';
        b.title = '37 days ago · degraded 26 min';
      }
      b.style.setProperty('--d', `${day * 8}ms`);
      bars.appendChild(b);
    }
    const scale = document.createElement('div');
    scale.className = 'uptime-scale';
    scale.innerHTML = '<span>90 days ago</span><span>today</span>';
    wrap.append(bars, scale);
    bar.replaceWith(wrap);
  });

  if (reduceMotion) return;

  // ---- Ticking metrics: <b data-live="4820" data-jitter="90" data-suffix="ms"> ----
  document.querySelectorAll('[data-live]').forEach(el => {
    const base = parseFloat(el.dataset.live);
    const jitter = parseFloat(el.dataset.jitter || '0');
    const suffix = el.dataset.suffix || '';
    every(el, 1600, () => {
      const value = Math.round(base + (Math.random() * 2 - 1) * jitter);
      el.textContent = fmt(value) + suffix;
      el.classList.remove('is-ticking');
      void el.offsetWidth; // restart the flash animation
      el.classList.add('is-ticking');
    });
  });

  // ---- Transaction ledger: new rows stream in at the top ----
  document.querySelectorAll('[data-txn-stream]').forEach(stream => {
    const counter = stream.parentElement.querySelector('[data-txn-count]');
    let processed = parseInt((counter?.textContent || '0').replace(/,/g, ''), 10);
    let txn = 0;
    stream.querySelectorAll('.panel-row span:first-child').forEach(s => {
      const m = s.textContent.match(/TXN-(\d+)/);
      if (m) txn = Math.max(txn, parseInt(m[1], 10));
    });

    const kinds = [['deposit', false], ['transfer', true], ['deposit', false], ['withdrawal', true], ['bill payment', true]];

    every(stream, 2400, () => {
      const [kind, debit] = kinds[(Math.random() * kinds.length) | 0];
      const amount = Math.round((Math.random() ** 2 * 18 + 0.15) * 100) * 10000;
      const row = document.createElement('div');
      row.className = 'panel-row txn-enter';
      row.innerHTML = `<span>TXN-${++txn} &middot; ${kind}</span>` +
        `<span class="mono-amount${debit ? ' debit' : ''}">${debit ? '&minus;' : '+'} UGX ${fmt(amount)}</span>`;
      stream.prepend(row);
      stream.lastElementChild.remove();

      processed += 1 + ((Math.random() * 3) | 0);
      if (counter) counter.textContent = fmt(processed);
    });
  });

  // ---- Deploy log: replays the release, line by line, on a loop ----
  document.querySelectorAll('[data-deploy-log]').forEach(log => {
    const lines = Array.from(log.children);
    const command = lines[0];
    const commandText = command.textContent;
    let timer = null;
    let running = false;

    const wait = (ms) => new Promise(resolve => { timer = setTimeout(resolve, ms); });

    const play = async () => {
      while (running) {
        lines.forEach(l => l.classList.add('is-pending'));
        command.textContent = '';
        command.classList.remove('is-pending');
        command.classList.add('is-typing');
        for (let i = 1; i <= commandText.length && running; i++) {
          command.textContent = commandText.slice(0, i);
          await wait(28);
        }
        command.classList.remove('is-typing');
        for (const line of lines.slice(1)) {
          if (!running) return;
          await wait(520);
          line.classList.remove('is-pending');
        }
        await wait(3800);
      }
    };

    whileVisible(log,
      () => { if (!running) { running = true; play(); } },
      () => {
        running = false;
        clearTimeout(timer);
        command.textContent = commandText;
        command.classList.remove('is-typing');
        lines.forEach(l => l.classList.remove('is-pending'));
      });
  });
})();
