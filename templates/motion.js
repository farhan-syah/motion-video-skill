// motion-video runtime: the seek contract for anything CSS @keyframes cannot drive.
// The renderer calls window.__video.seek(ms) after it seeks every CSS animation to ms.
// Register scripted drawing with window.__video.on((ms) => { ... }). Draw from ms alone, never from a clock.

(() => {
  const hooks = [];
  const easeOut = (x) => 1 - (1 - x) ** 4;
  const clamp = (x) => Math.min(1, Math.max(0, x));

  // <span data-count="1250" data-at="0.6" data-dur="1.2" data-decimals="0" data-prefix="$" data-suffix="k" [data-ease="linear"]>
  function counters(ms) {
    for (const el of document.querySelectorAll('[data-count]')) {
      const d = el.dataset;
      const from = Number(d.from ?? 0);
      const to = Number(d.count);
      const x = clamp((ms / 1000 - Number(d.at ?? 0)) / Number(d.dur ?? 1.2));
      const p = d.ease === 'linear' ? x : easeOut(x);
      const decimals = Number(d.decimals ?? 0);
      const value = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(from + (to - from) * p);
      el.textContent = `${d.prefix ?? ''}${value}${d.suffix ?? ''}`;
    }
  }

  // <span data-type data-at="1.0" data-cps="22">Text that types itself</span>
  function typing(ms) {
    for (const el of document.querySelectorAll('[data-type]')) {
      const d = el.dataset;
      d.full ??= el.textContent;
      const n = Math.floor(clamp((ms / 1000 - Number(d.at ?? 0)) * Number(d.cps ?? 22) / d.full.length) * d.full.length);
      el.textContent = d.full.slice(0, n);
      d.state = n === 0 ? 'idle' : n < d.full.length ? 'typing' : 'done';
    }
  }

  // <path data-draw data-at="1.2" data-dur="0.8" data-dash="8 10" d="…"/> draws the stroke on, solid or dashed.
  function drawing(ms) {
    for (const el of document.querySelectorAll('[data-draw]')) {
      const d = el.dataset;
      const len = el.getTotalLength();
      const shown = len * easeOut(clamp((ms / 1000 - Number(d.at ?? 0)) / Number(d.dur ?? 0.8)));
      // A round cap paints a dot even at zero length: hide the stroke until it starts.
      el.style.strokeOpacity = shown > 0 ? '' : '0';
      if (!d.dash) {
        el.style.strokeDasharray = `${shown} ${len + 1}`;
        continue;
      }
      const [dash, gap] = d.dash.split(/\s+/).map(Number);
      const parts = [];
      for (let run = 0; run < shown; run += dash + gap) parts.push(Math.min(dash, shown - run), gap);
      parts.push(0, len + 1);
      el.style.strokeDasharray = parts.join(' ');
    }
  }

  // <i data-icon="credit-card"></i> becomes an inline Lucide line icon from icons.js, sized 1em, drawn in currentColor.
  // --icon-stroke sets the line weight (default 2), --icon-fill fills closed shapes (default none).
  // data-draw data-at data-dur on the <i> draws every stroke of the icon on, like a <path data-draw>.
  function icons() {
    for (const el of document.querySelectorAll('[data-icon]:not([data-icon-done])')) {
      el.dataset.iconDone = '';
      const body = window.__icons?.[el.dataset.icon];
      if (!window.__icons) console.error(`data-icon="${el.dataset.icon}": icons.js is not loaded. Add <script src="../icons.js"></script> before motion.js.`);
      else if (!body) console.error(`data-icon="${el.dataset.icon}": no such icon. Find a name in references/icons.txt.`);
      if (!body) continue;
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
      if (!el.hasAttribute('data-draw')) continue;
      for (const shape of el.querySelectorAll('svg > *')) {
        shape.setAttribute('data-draw', '');
        for (const k of ['at', 'dur']) if (el.dataset[k]) shape.setAttribute(`data-${k}`, el.dataset[k]);
      }
      el.removeAttribute('data-draw');
    }
  }
  document.addEventListener('DOMContentLoaded', icons);

  // Kinetic type: <h1 data-split="words" data-in="rise" data-t="0.2" data-stagger="0.06" data-mask>Every word lands</h1>
  // wraps each word (or each letter with data-split="chars") in its own .m with the next --i, so the entrance
  // runs word by word. data-mask clips each piece in a line mask, for --in:reveal. Nested tags keep their styling.
  const secs = (v, d) => (v == null ? d : /[a-z]$/i.test(v) ? v : `${v}s`);
  function split() {
    for (const el of document.querySelectorAll('[data-split]:not([data-split-done])')) {
      const d = el.dataset;
      d.splitDone = '';
      const chars = d.split === 'chars';
      if (d.stagger) el.style.setProperty('--stagger', secs(d.stagger));
      let i = 0;
      const piece = (text) => {
        const m = document.createElement('span');
        m.className = 'm';
        m.textContent = text;
        m.style.cssText = `--in:${d.in ?? 'rise'}; --t:${secs(d.t, '0s')}; --i:${i++}`;
        if (d.out) m.style.setProperty('--out', d.out);
        if (!('mask' in d)) return m;
        const mask = document.createElement('span');
        mask.className = 'split-mask';
        mask.append(m);
        return mask;
      };
      const walk = (node) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 1) {
            if (!child.matches('[data-icon], svg')) walk(child);
            continue;
          }
          if (child.nodeType !== 3 || !child.textContent.trim()) continue;
          const frag = document.createDocumentFragment();
          for (const part of child.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) frag.append(part);
            else if (!chars) frag.append(piece(part));
            else {
              // Letters of one word stay on one line.
              const word = document.createElement('span');
              word.className = 'split-word';
              for (const ch of part) word.append(piece(ch));
              frag.append(word);
            }
          }
          child.replaceWith(frag);
        }
      };
      walk(el);
    }
  }
  document.addEventListener('DOMContentLoaded', split);

  // Footage as an image sequence (video.mjs footage writes the frames and prints this tag):
  // <img data-frames="../assets/clip" data-count="150" data-fps="30" data-at="0.5" [data-loop]>
  // Each frame shows the file for the video time, so footage stays frame-exact. It holds its first frame before
  // data-at and its last frame after the end, unless data-loop.
  const frameSrc = (d, i) => `${d.frames}/${String(i + 1).padStart(4, '0')}.${d.ext ?? 'jpg'}`;
  async function footage(ms) {
    const jobs = [];
    for (const el of document.querySelectorAll('img[data-frames]')) {
      const d = el.dataset;
      const n = Number(d.count);
      let i = Math.floor((ms / 1000 - Number(d.at ?? 0)) * Number(d.fps ?? 30));
      i = 'loop' in d ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i));
      const src = frameSrc(d, i);
      if (el.getAttribute('src') === src) continue;
      el.setAttribute('src', src);
      jobs.push(el.decode().catch(() => console.error(`data-frames: cannot load ${src}.`)));
    }
    await Promise.all(jobs);
  }
  document.addEventListener('DOMContentLoaded', () => {
    for (const el of document.querySelectorAll('img[data-frames]:not([src])')) el.setAttribute('src', frameSrc(el.dataset, 0));
  });

  // A line that joins two elements and follows them as they move: a callout leader, a connection tree, a flight path.
  // <svg class="links"><path data-from="#row" data-to="#card" data-draw data-at="1.2" data-dash="4 6"/></svg>
  // data-shape: curve (default), elbow or straight. data-from-at / data-to-at: an anchor inside the element as
  // "x% y%" of its box. Without one, the line leaves and enters on the facing edges.
  const toPoint = (at, r) => {
    const [x, y] = at.split(/\s+/).map((v) => parseFloat(v) / 100);
    return [r.left + r.width * x, r.top + r.height * y];
  };
  function links() {
    for (const el of document.querySelectorAll('[data-from][data-to]')) {
      const d = el.dataset;
      const from = document.querySelector(d.from);
      const to = document.querySelector(d.to);
      if (!from || !to) {
        if (!d.linkError) console.error(`data-from="${d.from}" data-to="${d.to}": no element matches ${from ? d.to : d.from}.`);
        d.linkError = '';
        continue;
      }
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const across = Math.abs(dx) >= Math.abs(dy);
      const p = d.fromAt ? toPoint(d.fromAt, a) : across ? [dx > 0 ? a.right : a.left, a.top + a.height / 2] : [a.left + a.width / 2, dy > 0 ? a.bottom : a.top];
      const q = d.toAt ? toPoint(d.toAt, b) : across ? [dx > 0 ? b.left : b.right, b.top + b.height / 2] : [b.left + b.width / 2, dy > 0 ? b.top : b.bottom];
      // Client pixels to the svg's own units, through any transform on the way.
      const inv = el.ownerSVGElement.getScreenCTM().inverse();
      const [x1, y1] = ((pt) => [pt.x, pt.y])(new DOMPoint(...p).matrixTransform(inv));
      const [x2, y2] = ((pt) => [pt.x, pt.y])(new DOMPoint(...q).matrixTransform(inv));
      const shape = d.shape ?? 'curve';
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      el.setAttribute('d', shape === 'straight' ? `M${x1} ${y1}L${x2} ${y2}`
        : shape === 'elbow' ? (across ? `M${x1} ${y1}H${mx}V${y2}H${x2}` : `M${x1} ${y1}V${my}H${x2}V${y2}`)
        : across ? `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}` : `M${x1} ${y1}C${x1} ${my} ${x2} ${my} ${x2} ${y2}`);
    }
  }

  // Async setup the renderer waits for before frame 0: a 3D model, a Lottie file, footage frames.
  const waits = [];

  // Drives a timeline from the video clock, offset by at seconds: a paused GSAP timeline (seek), a Lottie
  // animation (goToAndStop), or a Web Animation (currentTime). Anything else must use on().
  function use(tl, at = 0) {
    if (typeof tl.goToAndStop === 'function') {
      if (!tl.isLoaded) waits.push(new Promise((r) => tl.addEventListener('DOMLoaded', r)));
      hooks.push((ms) => { tl.goToAndStop(Math.max(0, ms - at * 1000), false); });
    } else if (typeof tl.seek === 'function') {
      tl.pause?.();
      // Braces, not an arrow expression: a GSAP timeline is thenable, and awaiting it waits for the paused timeline to end.
      hooks.push((ms) => { tl.seek(Math.max(0, ms / 1000 - at), false); });
    } else if ('currentTime' in tl) {
      tl.pause?.();
      hooks.push((ms) => { tl.currentTime = Math.max(0, ms - at * 1000); });
    } else {
      console.error('__video.use: pass a GSAP timeline, a Lottie animation or a Web Animation. Draw anything else with __video.on((ms) => ...).');
    }
    return tl;
  }

  window.__video = {
    on(fn) {
      hooks.push(fn);
    },
    use,
    wait(promise) {
      waits.push(Promise.resolve(promise));
      return promise;
    },
    // Setup can register more waits while it runs, so wait until no new ones appear.
    get ready() {
      return (async () => {
        for (let n = -1; n !== waits.length; ) {
          n = waits.length;
          await Promise.all(waits);
        }
      })();
    },
    async seek(ms) {
      icons();
      split();
      await footage(ms);
      counters(ms);
      typing(ms);
      links();
      drawing(ms);
      for (const fn of hooks) {
        const r = fn(ms);
        if (typeof r?.then !== 'function') continue;
        // A hook that never settles would stall the render with no message. A GSAP timeline returned from an
        // arrow expression is the usual cause: it is thenable and resolves only when the timeline ends.
        let timer;
        await Promise.race([r, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error(`__video.on hook did not settle within 10 s at ${ms} ms. Return nothing, or a promise that resolves once this frame is drawn: ${String(fn).slice(0, 80)}`)), 10000); })]);
        clearTimeout(timer);
      }
    },
  };

  // Outside the renderer (a normal browser tab), play the scene in real time for previewing.
  if (!navigator.webdriver) {
    const t0 = performance.now();
    const tick = () => {
      window.__video.seek(performance.now() - t0);
      requestAnimationFrame(tick);
    };
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(tick));
  }
})();
