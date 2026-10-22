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

  // ---- Kampala clock (a real reading, so it runs regardless of motion settings) ----
  document.querySelectorAll('[data-eat-clock]').forEach(el => {
    const clock = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Kampala', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const tick = () => { el.textContent = clock.format(new Date()); };
    tick();
    setInterval(tick, 1000);
  });

  // ---- Partner graph: TREEZ hub wired to each partner, packets on every link ----
  document.querySelectorAll('[data-partner-graph]').forEach(host => {
    const names = Array.from(host.querySelectorAll('li')).map(li => li.textContent.trim());
    const NS = 'http://www.w3.org/2000/svg';
    const W = 420, H = 320, cx = W / 2, cy = H / 2;
    const el = (tag, attrs, parent) => {
      const node = document.createElementNS(NS, tag);
      for (const k in attrs) node.setAttribute(k, attrs[k]);
      parent.appendChild(node);
      return node;
    };

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('aria-hidden', 'true');
    const links = el('g', {}, svg);
    const packets = el('g', {}, svg);
    const nodes = el('g', {}, svg);

    names.forEach((name, i) => {
      const a = (i / names.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * 138, y = cy + Math.sin(a) * 118;
      const id = `pgLink${i}`;
      el('path', { id, d: `M${cx} ${cy}L${x.toFixed(1)} ${y.toFixed(1)}`, class: 'pg-link' }, links);

      const dur = 1.8 + (i % 3) * 0.5;
      const dot = el('circle', { r: 2.4, class: i % 2 ? 'pg-packet pg-packet-in' : 'pg-packet' }, packets);
      const motion = el('animateMotion', {
        dur: `${dur}s`, begin: `-${(i * 0.41) % dur}s`, repeatCount: 'indefinite',
        keyPoints: i % 2 ? '1;0' : '0;1', keyTimes: '0;1', calcMode: 'linear'
      }, dot);
      const mpath = el('mpath', { href: `#${id}` }, motion);
      mpath.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#${id}`);

      el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 4, class: 'pg-node' }, nodes);
      const right = Math.cos(a) >= -0.05;
      const label = el('text', {
        x: (x + (right ? 9 : -9)).toFixed(1), y: (y + 4).toFixed(1),
        'text-anchor': right ? 'start' : 'end', class: 'pg-label'
      }, nodes);
      label.textContent = name;
    });

    el('circle', { cx, cy, r: 26, class: 'pg-hub-ring' }, nodes);
    el('circle', { cx, cy, r: 20, class: 'pg-hub' }, nodes);
    const hubText = el('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', class: 'pg-hub-label' }, nodes);
    hubText.textContent = 'TREEZ';

    host.replaceChildren(svg);
    if (reduceMotion) svg.pauseAnimations();
    else whileVisible(host, () => svg.unpauseAnimations(), () => svg.pauseAnimations());
  });

  if (reduceMotion) return;

  // ---- CI run: stages go pending → running → passed, then a new run starts ----
  document.querySelectorAll('[data-ci-run]').forEach(run => {
    const stages = Array.from(run.querySelectorAll('.ci-stage'));
    const status = run.querySelector('[data-ci-status]');
    const runId = run.querySelector('[data-ci-run-id]');
    let timer = null;
    let running = false;
    const wait = (ms) => new Promise(resolve => { timer = setTimeout(resolve, ms); });
    const setStage = (stage, state) => {
      stage.classList.remove('is-pending', 'is-running', 'is-passed');
      stage.classList.add(`is-${state}`);
    };

    const play = async () => {
      while (running) {
        stages.forEach(s => setStage(s, 'pending'));
        status.textContent = 'running';
        status.classList.add('is-running');
        await wait(700);
        for (const stage of stages) {
          if (!running) return;
          setStage(stage, 'running');
          await wait(900 + Math.random() * 700);
          setStage(stage, 'passed');
        }
        status.textContent = 'passed';
        status.classList.remove('is-running');
        await wait(3600);
        if (runId) runId.textContent = parseInt(runId.textContent, 10) + 1;
      }
    };

    whileVisible(run,
      () => { if (!running) { running = true; play(); } },
      () => {
        running = false;
        clearTimeout(timer);
        stages.forEach(s => setStage(s, 'passed'));
        status.textContent = 'passed';
        status.classList.remove('is-running');
      });
  });

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
  // Lines are re-read each pass, so a page may swap them (e.g. the blog feed
  // once posts arrive from Appwrite); the first child is always the command.
  document.querySelectorAll('[data-deploy-log]').forEach(log => {
    const lines = () => Array.from(log.children);
    const command = log.firstElementChild;
    const commandText = command.textContent;
    let timer = null;
    let running = false;

    const wait = (ms) => new Promise(resolve => { timer = setTimeout(resolve, ms); });

    const play = async () => {
      while (running) {
        lines().forEach(l => l.classList.add('is-pending'));
        command.textContent = '';
        command.classList.remove('is-pending');
        command.classList.add('is-typing');
        for (let i = 1; i <= commandText.length && running; i++) {
          command.textContent = commandText.slice(0, i);
          await wait(28);
        }
        command.classList.remove('is-typing');
        for (const line of lines().slice(1)) {
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
        lines().forEach(l => l.classList.remove('is-pending'));
      });
  });
})();
