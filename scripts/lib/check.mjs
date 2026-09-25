import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openScene } from './browser.mjs';
import { SOUNDS, collectCues, measureImpacts } from './sfx.mjs';
import { cueSoundErrors } from './sound-policy.mjs';

// Thresholds. Each one traces to a source in references/craft.md.
const SAFE = 0.05; // EBU R 95 graphics-safe margin per edge.
const MIN_TEXT = 28 / 1080; // Smallest legible text as a fraction of the short side.
const READ_WPS = 3; // BBC subtitle guidance: 160-180 words per minute.
const READ_MIN = 0.8; // Netflix: an event holds at least 20 frames.
const CONTRAST_BODY = 4.5; // WCAG 2.2 SC 1.4.3.
const CONTRAST_LARGE = 3;
const LARGE_TEXT = 48 / 1080;
const LINEAR_MAX = 2000; // Linear easing is allowed only for ambient motion longer than this (ms).
const CROWD = 4;
const SMALL_GRACE = 600; // Text may pass below MIN_TEXT this long (ms) during an entrance, exit or zoom-through. // This many layers entering on the same frame reads as one flat block.

// Runs in the page. Returns every visible run of text with its box, effective opacity and size.
function collectText(short) {
  const out = [];
  const vw = innerWidth;
  const vh = innerHeight;
  const label = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 3; e = e.parentElement) {
      let p = e.localName;
      if (e.id) p += `#${e.id}`;
      else if (e.classList.length) p += `.${[...e.classList].slice(0, 2).join('.')}`;
      parts.unshift(p);
    }
    return parts.join(' > ');
  };
  const all = [document.body, ...document.body.querySelectorAll('*')];
  const ids = new Map(all.map((e, i) => [e, i]));
  const opacityOf = new Map();
  const effOpacity = (el) => {
    if (!el || el === document.documentElement) return 1;
    if (!opacityOf.has(el)) opacityOf.set(el, Number(getComputedStyle(el).opacity) * effOpacity(el.parentElement));
    return opacityOf.get(el);
  };
  // Linear part of an element's own transform: rotate, then scale, then transform (CSS order, translation dropped).
  const own = (cs) => {
    let m = new DOMMatrix();
    const rot = cs.rotate;
    if (rot && rot !== 'none') {
      const p = rot.split(/\s+/);
      const ang = parseFloat(p[p.length - 1]) * (p[p.length - 1].endsWith('rad') ? 180 / Math.PI : p[p.length - 1].endsWith('turn') ? 360 : 1);
      const ax = p.length === 4 ? p.slice(0, 3).map(Number) : p[0] === 'x' ? [1, 0, 0] : p[0] === 'y' ? [0, 1, 0] : [0, 0, 1];
      m = m.rotateAxisAngle(ax[0], ax[1], ax[2], ang);
    }
    const sc = cs.scale;
    if (sc && sc !== 'none') {
      const p = sc.split(/\s+/).map(parseFloat);
      m = m.scale(p[0], p[1] ?? p[0], p[2] ?? 1);
    }
    if (cs.transform && cs.transform !== 'none') {
      const t = new DOMMatrix(cs.transform);
      t.m41 = t.m42 = t.m43 = 0;
      m = m.multiply(t);
    }
    return m;
  };
  const overlapOk = (el) => !!el.closest('[data-overlap-ok]');
  // Opaque content painted above the text at a point: anything but the text's own subtree and ancestors.
  const coveredAt = (el, x, y) => {
    for (const top of document.elementsFromPoint(x, y)) {
      if (top === el || el.contains(top)) return null;
      if (top.contains(el)) return null;
      if (overlapOk(top) || effOpacity(top) < 0.3) continue;
      const s = getComputedStyle(top);
      const bgAlpha = Number((s.backgroundColor.match(/[\d.]+(?=\))/) || [s.backgroundColor.startsWith('rgba') ? 0 : 1])[0]);
      // An SVG root is hit across its whole box. Only filled shapes inside it paint over text; strokes are thin.
      const filledShape = top instanceof SVGGeometryElement && s.fill !== 'none' && Number(s.fillOpacity) > 0.3;
      const opaque = ['img', 'canvas', 'video'].includes(top.localName) || filledShape || s.backgroundImage !== 'none' || (s.backgroundColor !== 'transparent' && bgAlpha > 0.3);
      if (opaque) return top;
    }
    return null;
  };
  for (const el of all) {
    const idx = ids.get(el);
    const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!texts.length) continue;
    let hidden = false;
    let clip = { l: 0, t: 0, r: vw, b: vh };
    let mat = new DOMMatrix();
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') hidden = true;
      mat = own(cs).multiply(mat);
      if (e !== el && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.clipPath !== 'none')) {
        const r = e.getBoundingClientRect();
        clip = { l: Math.max(clip.l, r.left), t: Math.max(clip.t, r.top), r: Math.min(clip.r, r.right), b: Math.min(clip.b, r.bottom) };
      }
    }
    const opacity = effOpacity(el);
    if (hidden || opacity < 0.02) continue;
    const cs = getComputedStyle(el);
    // Screen-space scale of the text's vertical axis, and its in-plane rotation.
    const vy = mat.transformPoint(new DOMPoint(0, 1, 0, 0));
    const vx = mat.transformPoint(new DOMPoint(1, 0, 0, 0));
    const sy = Math.hypot(vy.x, vy.y);
    const theta = Math.atan2(vx.y, vx.x);
    const c = Math.abs(Math.cos(theta));
    const s = Math.abs(Math.sin(theta));
    // Range rects span the font's full content area. Clamp each to the line height, where the ink sits.
    const lh = parseFloat(cs.lineHeight) * sy;
    const range = document.createRange();
    let box = null;
    for (const t of texts) {
      range.selectNodeContents(t);
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        // A rotated rect's screen box is inflated. Recover the upright size, centered on the same point.
        let w = r.width;
        let h = r.height;
        if (s > 0.003 && Math.abs(c * c - s * s) > 0.1) {
          w = Math.max(1, (r.width * c - r.height * s) / (c * c - s * s));
          h = Math.max(1, (r.height * c - r.width * s) / (c * c - s * s));
        }
        if (Number.isFinite(lh) && lh < h) h = lh;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const q = { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
        box = box ? { l: Math.min(box.l, q.l), t: Math.min(box.t, q.t), r: Math.max(box.r, q.r), b: Math.max(box.b, q.b) } : q;
      }
    }
    if (!box) continue;
    const full = box;
    box = { l: Math.max(box.l, clip.l), t: Math.max(box.t, clip.t), r: Math.min(box.r, clip.r), b: Math.min(box.b, clip.b) };
    if (box.r - box.l < 1 || box.b - box.t < 1) continue;
    let covered = 0;
    let coverer = null;
    // World text ([data-world], a 3D .viewport) is part of the scene. The fixed .hud may cover it by design.
    const world = !!el.closest('[data-world], .viewport');
    const hud = !!el.closest('.hud');
    let underHud = 0;
    // Sample only where the text is drawn: inside the element's own clip when it hides overflow.
    let probe = box;
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      const r = el.getBoundingClientRect();
      probe = { l: Math.max(box.l, r.left), t: Math.max(box.t, r.top), r: Math.min(box.r, r.right), b: Math.min(box.b, r.bottom) };
    }
    if (opacity >= 0.5 && probe.r - probe.l >= 1 && probe.b - probe.t >= 1) {
      for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.35], [0.75, 0.35], [0.25, 0.65], [0.75, 0.65]]) {
        const hit = coveredAt(el, probe.l + (probe.r - probe.l) * fx, probe.t + (probe.b - probe.t) * fy);
        if (hit && world && hit.closest('.hud')) underHud++;
        else if (hit) {
          covered++;
          coverer ??= label(hit);
        }
      }
    }
    const text = texts.map((t) => t.textContent).join(' ').replace(/\s+/g, ' ').trim();
    out.push({
      id: idx,
      label: label(el),
      text: text.length > 40 ? `${text.slice(0, 40)}…` : text,
      // Separators such as "·", "—" or "/" are not words to read.
      words: text.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length,
      box,
      full,
      opacity,
      overlapOk: overlapOk(el),
      // UI texture: small real UI inside a device, read through a callout, headline or caption instead.
      texture: !!el.closest('[data-texture]'),
      world,
      hud,
      underHud: underHud >= 3,
      occluded: covered >= 3 && !overlapOk(el) ? coverer : null,
      px: (parseFloat(cs.fontSize) * sy) / short,
      // Screen scale of the text from its transform chain: above 1 means a camera push or zoom enlarges it.
      scale: sy,
      color: cs.color,
      clipText: cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text',
      family: cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, ''),
      overflow: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 ? ['hidden', 'clip', 'scroll', 'auto'].includes(cs.overflowX) || ['hidden', 'clip', 'scroll', 'auto'].includes(cs.overflowY) : false,
      ancestors: (() => {
        const a = [];
        for (let e = el.parentElement; e && ids.has(e); e = e.parentElement) a.push(ids.get(e));
        return a;
      })(),
    });
  }
  return out;
}

// Runs in the page. Describes every animation's timing so the linter can judge it.
function describeAnimations() {
  return document.getAnimations().map((a) => {
    const t = a.effect.getComputedTiming();
    const kf = a.effect.getKeyframes();
    const easings = [a.effect.getTiming().easing, ...kf.slice(0, -1).map((k) => k.easing)];
    const props = [...new Set(kf.flatMap((k) => Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))))];
    const el = a.effect.target;
    // An opacity or filter animation on an element that holds 3D content flattens that content.
    const flattens3d = !!el && props.some((p) => p === 'opacity' || p === 'filter') && !!el.querySelector('.cube, .lid, .stand, .laptop') && !!el.closest('.world');
    return {
      flattens3d,
      name: a.animationName || a.transitionProperty || a.id || 'waapi',
      kind: a.constructor.name,
      target: el ? `${el.localName}${el.id ? `#${el.id}` : el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}` : '?',
      targetText: el?.textContent?.trim().slice(0, 30) ?? '',
      delay: t.delay,
      duration: t.duration,
      iterations: t.iterations,
      linear: easings.every((e) => e === 'linear'),
      props,
    };
  });
}

function fontFamilies() {
  const loaded = new Set();
  for (const f of document.fonts) if (f.status === 'loaded') loaded.add(f.family.replace(/^["']|["']$/g, ''));
  return [...loaded];
}

// Runs in the page. Share of a 192x108 grid covered by visible shapes: filled or bordered boxes, images, SVG, canvas.
// Text alone does not count: a headline over chrome is still an empty frame.
// Full-frame layers (backgrounds, grids, grain) are skipped, since they are there in an empty frame too.
function openingCoverage() {
  const W = 192;
  const H = 108;
  const cells = new Uint8Array(W * H);
  const vw = innerWidth;
  const vh = innerHeight;
  const opacityOf = (el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') return 0;
      o *= Number(s.opacity);
    }
    return o;
  };
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
    if (r.width * r.height > vw * vh * 0.6) continue;
    const s = getComputedStyle(el);
    const filled = (s.backgroundColor !== 'transparent' && !/rgba\([^)]*,\s*0\)/.test(s.backgroundColor)) || s.backgroundImage !== 'none';
    const bordered = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none';
    const media = ['img', 'svg', 'canvas', 'video'].includes(el.localName);
    // Display type is content: a beat that opens on giant words is not empty. Small labels and captions are chrome.
    const display = parseFloat(s.fontSize) >= Math.min(vw, vh) * 0.06 && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!(filled || bordered || media || display)) continue;
    if (opacityOf(el) < 0.5) continue;
    const x0 = Math.max(0, Math.floor((r.left / vw) * W));
    const x1 = Math.min(W, Math.ceil((r.right / vw) * W));
    const y0 = Math.max(0, Math.floor((r.top / vh) * H));
    const y1 = Math.min(H, Math.ceil((r.bottom / vh) * H));
    // An outline alone covers only its edge, so an empty frame drawn around nothing does not count as content.
    const outlineOnly = !filled && !media && !display;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) if (!outlineOnly || y === y0 || y === y1 - 1 || x === x0 || x === x1 - 1) cells[y * W + x] = 1;
    }
  }
  return cells.reduce((a, b) => a + b, 0) / cells.length;
}

// Runs in the page. Boxes of the screen text: the headline ([data-headline], else the first h1, h2, .hero or .title)
// and every text element in a .hud. Text inside [data-world] or a 3D .viewport belongs to the world and moves with the camera.
// settled: no entrance, exit or beat animation runs on the element or an ancestor. Animations that span 90% of the scene
// or more are camera moves, so they count as drift, not as an entrance.
function readingBoxes(sceneMs) {
  // Only a headline marked data-headline is a chapter headline held to one slot. Statements move with each beat.
  const head = document.querySelector('[data-headline]');
  const hudText = [...document.querySelectorAll('.hud *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const els = [...new Set([head, ...hudText].filter(Boolean))].filter((e) => !hudText.some((h) => h !== e && e.contains(h) && e !== head));
  // Type that changes its own width, weight or size on purpose is a type device, not camera drift.
  const FONT = ['fontStretch', 'fontWeight', 'fontVariationSettings', 'fontSize', 'letterSpacing'];
  const typeDevice = (el) => el.getAnimations({ subtree: true }).some((a) => a.effect.getKeyframes().some((k) => FONT.some((f) => f in k)));
  const busy = (el) => {
    for (let e = el; e; e = e.parentElement) {
      for (const a of e.getAnimations()) {
        const ct = a.effect.getComputedTiming();
        if (ct.activeDuration >= sceneMs * 0.9) continue;
        if (ct.localTime >= ct.delay && ct.localTime < ct.delay + ct.activeDuration) return true;
        // An entrance still waiting to start holds its from-state (fill backwards): the text is not on screen yet.
        const fill = a.effect.getTiming().fill;
        if (ct.localTime < ct.delay && (fill === 'both' || fill === 'backwards')) return true;
      }
    }
    return false;
  };
  return els.map((el, key) => {
    const r = el.getBoundingClientRect();
    return {
      key,
      headline: el === head,
      hud: !!el.closest('.hud'),
      world: !!el.closest('[data-world], .viewport'),
      settled: !busy(el),
      typeDevice: typeDevice(el),
      l: r.left,
      t: r.top,
      w: r.width,
      h: r.height,
      text: el.innerText.trim().replace(/\s+/g, ' ').slice(0, 40),
    };
  });
}

function hasSeek() {
  return typeof window.__video?.seek === 'function';
}

const lum = (rgb) => {
  const c = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const parseRgb = (s) => {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { rgb: [r, g, b], a };
};
const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`;

// Samples the median background luminance in a ring just outside each text box.
async function ringLuminance(decoder, png, boxes) {
  return decoder.evaluate(
    async ({ b64, boxes }) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const L = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return boxes.map((b) => {
        const vals = [];
        const pad = 4;
        const push = (x, y) => {
          x = Math.round(x);
          y = Math.round(y);
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
          const i = (y * img.width + x) * 4;
          vals.push(0.2126 * L(d[i]) + 0.7152 * L(d[i + 1]) + 0.0722 * L(d[i + 2]));
        };
        for (let x = b.l - pad; x <= b.r + pad; x += 2) {
          push(x, b.t - pad);
          push(x, b.b + pad);
        }
        for (let y = b.t - pad; y <= b.b + pad; y += 2) {
          push(b.l - pad, y);
          push(b.r + pad, y);
        }
        vals.sort((a, b) => a - b);
        return vals.length ? vals[Math.floor(vals.length / 2)] : null;
      });
    },
    { b64: png.toString('base64'), boxes },
  );
}

// carry: text still readable at the previous scene's last frame, with its readable time, for match cuts.
export async function checkScene(browser, m, scene, carry = null) {
  const findings = [];
  const add = (level, at, what, fix) => findings.push({ level, scene: scene.name, at, what, fix });
  const short = Math.min(m.width, m.height);
  const sc = await openScene(browser, m, scene);
  const decoder = await (await browser.newContext()).newPage();
  try {
    const dur = scene.duration * 1000;
    const anims = await sc.page.evaluate(describeAnimations);
    const seekable = await sc.page.evaluate(hasSeek);
    const loadedFamilies = new Set(await sc.page.evaluate(fontFamilies));
    const cueList = await measureImpacts(sc.page, sc.seek, await sc.page.evaluate(collectCues), m.fps);
    for (const c of cueList) {
      if (c.ownAndChildren && !c.problem) {
        add('warn', c.at, `data-sfx "${c.sound}" on ${c.target} has its own animation and ${c.ownAndChildren} animated children, so it sounds once, at its own arrival, not once per child.`, 'For one accent per child, put data-sfx on a wrapper with no animation of its own. For a single sound on the group\'s own move, add data-sfx-once.');
      }
      // A dimmed element (0.3-0.6) is a deliberate choice and still visible. Near-invisible is almost always a hidden parent.
      if (c.finalOpacity != null && c.finalOpacity < 0.15 && !c.problem) {
        add('warn', c.at, `data-sfx "${c.sound}" on ${c.target} plays while its element is nearly invisible (opacity ${c.finalOpacity.toFixed(2)} when its motion ends), so the sound has nothing to belong to.`, 'Move data-sfx to the element that becomes visible, or check whether a parent is still hidden at that moment.');
      }
      if (c.problem) add('error', null, `data-sfx on ${c.target}: ${c.problem}.`, 'Fix the attribute value.');
      if (!SOUNDS[c.sound]) add('error', c.at, `Unknown data-sfx "${c.sound}" on ${c.target}.`, `Use one of: ${Object.keys(SOUNDS).join(', ')}.`);
      if (c.src && !existsSync(resolve(dirname(scene.file), c.src))) add('error', c.at, `data-sfx-src "${c.src}" on ${c.target} does not exist (resolved from the scene's folder: ${resolve(dirname(scene.file), c.src)}).`, 'Fix the path, or remove data-sfx-src to use the synthesized sound.');
      // A hand-typed time that misses its element's own impact is heard as out of sync. 80 ms is about where viewers notice.
      if (c.manual && c.impact != null && c.sound !== 'type' && Math.abs(c.at - c.impact) > 80) {
        add('warn', c.at, `data-sfx "${c.sound}" on ${c.target} plays at ${fmt(c.at)}, but that element's motion lands at ${fmt(c.impact)}.`, 'Remove data-sfx-at so the sound binds to the motion, or put data-sfx on the element that moves at that time.');
      }
    }
    for (const { index, message } of cueSoundErrors(cueList, (cue) => cue.at / 1000)) {
      add('error', cueList[index].at, message, 'Match data-sfx-intent to the visible event and separate overlapping impacts.');
    }

    // Animation timing lint.
    if (!anims.length && !seekable) add('warn', null, 'Scene has no animation. A static frame reads as a frozen video.', 'Add entrance motion and slow ambient drift.');
    const starts = new Map();
    for (const a of anims) {
      if (a.flattens3d) add('error', a.delay, `"${a.name}" on ${a.target} animates opacity or filter around 3D props, which flattens them for the rest of the scene.`, 'Use a transform-only entrance on 3D props: pop-in, drop-in, grow-x or grow-y.');
      if (a.kind === 'CSSTransition') add('error', null, `CSS transition on ${a.target}. Transitions start on real time and cannot be seeked reliably.`, 'Replace the transition with @keyframes and animation-delay.');
      const finite = Number.isFinite(a.iterations) && Number.isFinite(a.duration);
      const ambient = a.duration >= dur * 0.9;
      if (a.linear && finite && !ambient && a.duration <= LINEAR_MAX && a.props.some((p) => ['transform', 'translate', 'scale', 'rotate', 'opacity', 'top', 'left', 'clipPath', 'filter'].includes(p))) {
        add('warn', a.delay, `"${a.name}" on ${a.target} uses linear easing over ${fmt(a.duration)}.`, 'Use --ease-out for entrances and --ease-in for exits.');
      }
      if (finite && a.delay < dur && a.delay + a.duration * a.iterations > dur + 1) {
        add('warn', dur, `"${a.name}" on ${a.target} ends at ${fmt(a.delay + a.duration * a.iterations)}, after the scene cut at ${fmt(dur)}.`, 'Finish the motion before the scene ends, or lengthen the scene.');
      }
      if (a.delay >= dur && finite) add('warn', a.delay, `"${a.name}" on ${a.target} starts at ${fmt(a.delay)}, after the scene ends.`, 'Remove it or move it earlier.');
      if (finite && a.delay > 0 && a.delay < dur && !a.name.includes('out')) {
        const k = Math.round(a.delay / 10);
        starts.set(k, (starts.get(k) ?? new Set()).add(a.target + a.targetText));
      }
    }
    for (const [k, targets] of starts) {
      if (targets.size >= CROWD) add('warn', k * 10, `${targets.size} layers start on the same frame.`, 'Stagger entrances with --i so layers arrive in order: background, visual, headline, support.');
    }

    // Timeline scan.
    const step = 1000 / Math.max(10, m.fps / 2);
    const seen = new Map();
    const collided = new Map();
    const reported = new Set();
    for (let t = 0; t <= dur; t += step) {
      await sc.seek(t);
      const items = await sc.page.evaluate(collectText, short);
      for (const it of items) {
        const s = seen.get(it.id) ?? { it, visible: 0, unsafe: 0, firstSolid: null, lastSolid: null, smallFor: 0, minPx: Infinity, minAt: 0, occludedFor: 0, occludedBy: null, occludedAt: 0 };
        s.it = it;
        if (it.opacity >= 0.5) {
          s.visible += step;
          // Entrances pass through small sizes briefly. Only text that stays small is an error.
          if (it.px < MIN_TEXT && !it.texture) {
            s.smallFor += step;
            if (it.px < s.minPx) {
              s.minPx = it.px;
              s.minAt = t;
            }
          }
          if (it.occluded && !it.texture) {
            s.occludedFor += step;
            s.occludedBy ??= it.occluded;
            if (s.occludedFor <= step) s.occludedAt = t;
          }
        }
        // Dimmed context (below 0.9 opacity) may leave the safe area during camera moves.
        // So may world text while the camera pushes in or pans: the move crops the world on purpose.
        // World text that the camera moves at any point in the scene counts as moved, so the slow ends of an eased
        // pan are exempt too.
        s.firstBox ??= it.box;
        if (it.world && Math.hypot(it.box.l - s.firstBox.l, it.box.t - s.firstBox.t) > 2) s.moved = true;
        if (it.opacity >= 0.9 && !(it.world && it.scale > 1.02)) {
          const mx = SAFE * m.width;
          const my = SAFE * m.height;
          if (it.box.l < mx - 1 || it.box.t < my - 1 || it.box.r > m.width - mx + 1 || it.box.b > m.height - my + 1) {
            s.unsafe += step;
            s.unsafeScale = Math.max(s.unsafeScale ?? 0, it.scale);
          }
        }
        if (it.opacity >= 0.95) {
          s.firstSolid ??= t;
          s.lastSolid = t;
        }
        if (it.overflow && !reported.has(`o${it.id}`)) {
          reported.add(`o${it.id}`);
          add('error', t, `Text overflows its box and is clipped: ${it.label} "${it.text}".`, 'Shorten the text, widen the box, or lower the size one step on the type scale.');
        }
        if (!it.clipText && it.family && !loadedFamilies.has(it.family) && !reported.has(`f${it.family}`)) {
          reported.add(`f${it.family}`);
          add('error', t, `Font "${it.family}" is not a loaded @font-face, so it renders with a machine-dependent system font.`, 'Declare it with @font-face from a local .woff2 file, or use a bundled family.');
        }
        seen.set(it.id, s);
      }
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          if (a.opacity < 0.15 || b.opacity < 0.15 || a.overlapOk || b.overlapOk || a.texture || b.texture) continue;
          if (a.ancestors.includes(b.id) || b.ancestors.includes(a.id)) continue;
          // World text passing under a HUD card is hidden by the card, not colliding with its text.
          if ((a.world && b.hud && a.underHud) || (b.world && a.hud && b.underHud)) continue;
          // Inline neighbours touch by a pixel or two. A collision needs real overlap on both axes.
          const ow = Math.min(a.box.r, b.box.r) - Math.max(a.box.l, b.box.l);
          const oh = Math.min(a.box.b, b.box.b) - Math.max(a.box.t, b.box.t);
          const area = overlap(a.box, b.box);
          const minArea = Math.min((a.box.r - a.box.l) * (a.box.b - a.box.t), (b.box.r - b.box.l) * (b.box.b - b.box.t));
          if (ow > 4 && oh > 4 && area > 0.03 * minArea) {
            const key = `${a.id}:${b.id}`;
            const c = collided.get(key) ?? { a, b, from: t, to: t };
            c.to = t;
            collided.set(key, c);
          }
        }
      }
    }
    // A pass-through while things move (under a quarter second) is not a collision the eye reads.
    for (const c of collided.values()) {
      if (c.to - c.from + step <= 250) continue;
      add('error', c.from, `Text collides from ${fmt(c.from)} to ${fmt(c.to)}: "${c.a.text}" (${c.a.label}) and "${c.b.text}" (${c.b.label}).`, 'Give each element its own motion corridor, or exit one before the other enters.');
    }
    for (const s of seen.values()) {
      const { it } = s;
      if (s.unsafe > 300 && !(it.world && s.moved) && !it.texture) {
        const pushed = (s.unsafeScale ?? 1) > 1.02;
        add(
          'error',
          null,
          `Text sits outside the 5% safe area for ${fmt(s.unsafe)}: "${it.text}".${pushed ? ` A camera push or zoom scales it ${s.unsafeScale.toFixed(2)}x at that moment.` : ''}`,
          pushed ? 'Place the text further inside .safe so it stays inside at full push, or reduce the camera scale. If the push crops the world on purpose, mark the world wrapper data-world.' : 'Keep resting text inside .safe. World text that a pan or push carries past the edge is exempt: mark its wrapper data-world.',
        );
      }
      if (s.smallFor > SMALL_GRACE) {
        add('error', s.minAt, `Text is below the ${(MIN_TEXT * 1080).toFixed(0)}px minimum for ${fmt(s.smallFor)}, down to ${(s.minPx * 1080).toFixed(1)}px at 1080p: "${it.text}".`, 'Use --fs-label or larger. If a camera zoom-out shrinks it, raise the size or reduce the zoom-out.');
      }
      if (s.occludedFor > 300) {
        add('error', s.occludedAt, `Text is covered for ${fmt(s.occludedFor)} by ${s.occludedBy}: "${it.text}".`, 'Move one of them, or mark a deliberate overlay (stamp, badge) with data-overlap-ok.');
      }
      const need = Math.max(READ_MIN, it.words / READ_WPS) * 1000;
      // Text carried across a match cut keeps the reading time it already had at the end of the previous scene.
      const carried = s.firstSolid != null && s.firstSolid <= 2 * step ? (carry?.get(it.text) ?? 0) : 0;
      if (!it.texture && s.visible > 0 && s.visible + carried + step < need) {
        add('warn', s.firstSolid, `"${it.text}" is readable for ${fmt(s.visible)}. ${it.words} words need ${fmt(need)}.`, 'Hold it longer, or cut words.');
        // Kept so a parallel check can credit the reading time a match cut carries in from the previous scene.
        findings[findings.length - 1].read = { text: it.text, visible: s.visible, need, step, atStart: s.firstSolid != null && s.firstSolid <= 2 * step };
      }
    }

    // Text still readable on the last sampled frame carries into the next scene's reading time.
    findings.carry = new Map([...seen.values()].filter((s) => s.lastSolid != null && s.lastSolid >= dur - 2 * step).map((s) => [s.it.text, s.visible]));

    // Contrast, measured on the rendered frame where each text first sits fully opaque.
    const byTime = new Map();
    for (const s of seen.values()) {
      if (s.firstSolid == null || s.it.clipText || s.it.texture) continue;
      const color = parseRgb(s.it.color);
      if (!color || color.a < 1) continue;
      const t = Math.min(s.lastSolid, s.firstSolid + 500);
      const list = byTime.get(t) ?? [];
      list.push({ s, color });
      byTime.set(t, list);
    }
    for (const [t, list] of byTime) {
      await sc.seek(t);
      const items = await sc.page.evaluate(collectText, short);
      const png = await sc.capture('png');
      const live = list.map(({ s, color }) => ({ s, color, it: items.find((x) => x.id === s.it.id) })).filter((x) => x.it);
      const bgs = await ringLuminance(decoder, png, live.map((x) => x.it.full));
      live.forEach(({ it, color }, i) => {
        if (bgs[i] == null) return;
        const r = ratio(lum(color.rgb), bgs[i]);
        const min = it.px >= LARGE_TEXT ? CONTRAST_LARGE : CONTRAST_BODY;
        if (r < min) add('error', t, `Contrast ${r.toFixed(2)}:1 is below ${min}:1 for "${it.text}".`, 'Darken the background behind it or change the text color token.');
      });
    }

    // Sound hierarchy: one primary sound per scene plus a few quiet ones. More turns direction into noise.
    const sounding = cueList.filter((c) => !c.problem && c.sound !== 'type');
    if (sounding.length > 4) {
      add('warn', null, `${sounding.length} sound cues in one scene (${sounding.map((c) => c.sound).join(', ')}). A scene carries one primary sound and at most 3 quiet secondaries.`, 'Keep the verb moment\'s sound, cut or merge the rest, or cue a container once.');
    }
    for (const c of sounding) {
      if (c.subs?.length > 8 && !c.accentCap) add('warn', c.at, `data-sfx "${c.sound}" on ${c.target} would sound ${c.subs.length} accents.`, 'Cap it with data-sfx-accents="3" or "4".');
    }

    // An opening frame with only a headline (or nothing) reads as a dead cut. The motif should be on screen by 0.4 s.
    await sc.seek(Math.min(400, dur));
    const coverage = await sc.page.evaluate(openingCoverage);
    // The end card is exempt: a small lockup on a calm frame is its job.
    const endCard = m.scenes.length > 1 && scene.index === m.scenes.length;
    if (coverage < 0.03 && !endCard) add('warn', 400, `The scene opens near-empty: shapes cover ${(coverage * 100).toFixed(1)}% of the frame at 0.4 s, so only text and chrome show.`, "Put the motif on screen at the cut: start its entrance at a negative --t, or match-cut it from the previous scene.");

    // Screen text holds still once it has entered. The camera moves the world under it, never the reading layer.
    // World text ([data-world], .viewport) moves with the camera by design and is skipped.
    const tracks = new Map();
    for (let f = 0.1; f < 0.96; f += 0.05) {
      await sc.seek(dur * f);
      for (const b of await sc.page.evaluate(readingBoxes, dur)) {
        if (b.world || b.typeDevice || !b.settled || b.w <= 0) continue;
        if (!tracks.has(b.key)) tracks.set(b.key, []);
        tracks.get(b.key).push({ ...b, at: dur * f });
      }
    }
    for (const bs of tracks.values()) {
      if (bs.length < 2) continue;
      const [a] = bs;
      const cx = (b) => b.l + b.w / 2;
      const cy = (b) => b.t + b.h / 2;
      const move = Math.max(...bs.map((b) => Math.hypot(cx(b) - cx(a), cy(b) - cy(a))));
      const grow = Math.max(...bs.map((b) => Math.abs(b.w / a.w - 1)));
      if (move > short * 0.005 || grow > 0.015) {
        add('warn', a.at, `Screen text "${a.text}" drifts ${move.toFixed(0)}px and scales ${(grow * 100).toFixed(1)}% while it is on screen. It moves with the camera, so it wobbles instead of reading as a fixed title.`, 'Move it into the fixed .hud layer, out of the moving wrapper. If it is part of the world (a label on a prop, a logo in the scene), mark its wrapper data-world.');
      }
      // Only a chapter headline system (a headline in the .hud) holds one slot. Statements move with each composition.
      if (a.headline && a.hud) findings.headline = { scene: scene.name, l: a.l, t: a.t, text: a.text };
    }

    // Real-time leak test: the same seek must give the same pixels after real time passes.
    const mid = Math.min(dur, dur / 2);
    // Waits are coprime-ish so a periodic timer cannot land on the same phase every time.
    // A second round confirms a leak, so one slow paint on a loaded machine is not reported.
    let leaks = 0;
    for (let round = 0; round < 2 && leaks === round; round++) {
      const hashes = new Set();
      for (const wait of [0, 137, 311, 523]) {
        if (wait) await sc.page.waitForTimeout(wait);
        await sc.seek(mid);
        hashes.add(createHash('md5').update(await sc.capture('png')).digest('hex'));
      }
      if (hashes.size > 1) leaks++;
    }
    if (leaks === 2) add('error', mid, 'Pixels change on real time at a fixed seek position. Something runs on rAF, setInterval, Date, <video>, a GIF, or a transition.', 'Drive all motion from CSS @keyframes or window.__video.seek(ms).');

    for (const e of sc.errors) add('error', null, e, 'Fix the page so it loads with no errors.');
  } finally {
    await decoder.context().close();
    await sc.close();
  }
  return findings;
}

// Chapter scenes share one screen-headline slot, so the title never jumps between cuts. World headlines are not tracked.
// The hook and the end card are free to differ. Outliers from the median slot get a warning.
export function headlineSlotFindings(slots, m) {
  const inner = slots.slice(1, -1).filter(Boolean);
  if (inner.length < 3) return [];
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const l = median(inner.map((x) => x.l));
  const t = median(inner.map((x) => x.t));
  return inner
    .filter((x) => Math.abs(x.l - l) > m.width * 0.02 || Math.abs(x.t - t) > m.height * 0.03)
    .map((x) => ({
      level: 'warn',
      scene: x.scene,
      at: null,
      what: `The headline "${x.text}" sits at ${Math.round(x.l)},${Math.round(x.t)}px, but the other chapter scenes put it at ${Math.round(l)},${Math.round(t)}px. The title jumps across the cut.`,
      fix: 'Put every chapter headline in the same .hud slot. Change the slot only on a deliberate layout change.',
    }));
}
