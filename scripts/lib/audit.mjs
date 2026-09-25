import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { HOP, SR, decode, features, fft } from './beats.mjs';
import { cueSoundErrors, soundProfileErrors } from './sound-policy.mjs';

// Measures sound-to-motion sync and checks material and sound shape on a rendered video.
// Audio events come from spectral-flux onsets. Visual events come from frame differences inside each cue's element box.

// Motion analysis frame size: a 26 px prop at 1080p still covers about 5 analysis pixels, and 30 s of frames fit in memory.
const MW = 384;
const MH = 216;

// How each sound class must line up with its element's motion. Times in ms.
// Tolerances follow ITU-R BT.1359: sound more than ~45 ms early or ~125 ms late reads as out of sync.
const CLASS = {
  contact: { sounds: ['slam', 'thud', 'snap', 'click', 'tap', 'paper', 'stamp', 'coin', 'drop', 'shutter', 'toggle-on', 'toggle-off'], rule: 'lands inside its motion, at contact', early: 60, late: 110 },
  appear: { sounds: ['pop', 'blip', 'tick', 'ding', 'success', 'shimmer', 'error', 'spring', 'downer', 'boom', 'pluck', 'glitch', 'sting', 'warning', 'jelly', 'hit', 'subdrop'], rule: 'sits inside the motion', early: 60, late: 110 },
  swell: { sounds: ['whoosh', 'swoosh'], rule: 'centers on the fastest motion', early: 150, late: 150 },
  build: { sounds: ['riser', 'reverse', 'drone'], rule: 'crests inside the reveal it builds to', early: 150, late: 150 },
  stroke: { sounds: ['draw', 'zip', 'drag', 'ticker', 'spin', 'flick'], rule: 'starts with its motion', early: 60, late: 110 },
};
export const classOf = (sound) => Object.entries(CLASS).find(([, c]) => c.sounds.includes(sound))?.[0] ?? null;

// Match a placed source against the rendered mix, allowing small codec timing shifts.
export function sourceSimilarity(mix, source, start) {
  if (!Number.isFinite(start) || !source.length) return 0;
  const expected = Math.round(start * SR);
  const available = Math.max(0, Math.min(source.length, mix.length - expected));
  if (available < 256) return 0;
  const minimumCoverage = Math.max(32, Math.floor(Math.ceil(available / 8) * 0.8));
  let best = 0;
  for (let shift = -Math.round(0.04 * SR); shift <= Math.round(0.04 * SR); shift++) {
    let dot = 0;
    let mixEnergy = 0;
    let sourceEnergy = 0;
    let covered = 0;
    for (let i = 0; i < source.length; i += 8) {
      const j = expected + shift + i;
      if (j < 0 || j >= mix.length) continue;
      covered++;
      const a = mix[j];
      const b = source[i];
      dot += a * b;
      mixEnergy += a * a;
      sourceEnergy += b * b;
    }
    if (covered >= minimumCoverage && mixEnergy > 0 && sourceEnergy > 0) best = Math.max(best, Math.abs(dot) / Math.sqrt(mixEnergy * sourceEnergy));
  }
  return best;
}

export function sourceMatchThreshold(sourceLength) {
  const compared = Math.max(1, Math.ceil(sourceLength / 8));
  const candidates = 2 * Math.round(0.04 * SR) + 1;
  return Math.max(0.22, 1.4 * Math.sqrt((2 * Math.log(candidates)) / compared));
}

function readAll(args) {
  return new Promise((res, rej) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
    const chunks = [];
    let err = '';
    ff.stdout.on('data', (d) => chunks.push(d));
    ff.stderr.on('data', (d) => (err += d));
    ff.on('error', (e) => rej(new Error(`ffmpeg failed to start: ${e.message}`)));
    ff.on('close', (code) => (code === 0 ? res(Buffer.concat(chunks)) : rej(new Error(`ffmpeg failed: ${err.trim()}`))));
  });
}

async function grayFrames(video) {
  const buf = await readAll(['-i', video, '-vf', `scale=${MW}:${MH},format=gray`, '-f', 'rawvideo', '-']);
  const n = Math.floor(buf.length / (MW * MH));
  return Array.from({ length: n }, (_, i) => buf.subarray(i * MW * MH, (i + 1) * MW * MH));
}

// Pixel indexes inside a box (analysis coordinates).
function boxPixels(box) {
  const x0 = Math.max(0, Math.floor(box.l));
  const y0 = Math.max(0, Math.floor(box.t));
  const x1 = Math.min(MW, Math.ceil(box.l + box.w));
  const y1 = Math.min(MH, Math.ceil(box.t + box.h));
  const px = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.push(y * MW + x);
  return px;
}

// Mean absolute pixel change from the previous frame over a set of pixels. 0-255 scale.
function motionIn(frames, pixels) {
  const out = new Float32Array(frames.length);
  const n = Math.max(1, pixels.length);
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i];
    const b = frames[i - 1];
    let s = 0;
    for (const p of pixels) s += Math.abs(a[p] - b[p]);
    out[i] = s / n;
  }
  return out;
}

// Pixels an element leaves changed around its event: net difference between 0.7 s before and after.
// A thin line drawing across a mostly empty box is invisible in the box average, but it owns these pixels.
// Motion that returns to its start state (a button press) leaves no net change, so it cannot claim the cue.
function netChangeMask(frames, pixels, fps, t) {
  const a = frames[Math.max(0, Math.round((t - 0.7) * fps))];
  const b = frames[Math.min(frames.length - 1, Math.round((t + 0.7) * fps))];
  return pixels.filter((p) => Math.abs(a[p] - b[p]) > 12);
}

// Onsets: local maxima of the spectral-flux envelope above an adaptive floor, at least 50 ms apart.
function onsets(env, rms) {
  const sec = (f) => (f * HOP + 512) / SR;
  const floor = 1.2;
  const quiet = 10 ** (-50 / 20);
  const out = [];
  for (let f = 2; f < env.length - 2; f++) {
    if (env[f] < floor || rms[f] < quiet) continue;
    if (env[f] < env[f - 1] || env[f] < env[f - 2] || env[f] <= env[f + 1] || env[f] < env[f + 2]) continue;
    const t = sec(f);
    if (out.length && t - out[out.length - 1].t < 0.05) {
      if (env[f] > out[out.length - 1].strength) out[out.length - 1] = { t, strength: env[f] };
      continue;
    }
    out.push({ t, strength: env[f] });
  }
  return out;
}

// The motion segment that belongs to an event. Every local peak within reach becomes a segment (start and settle
// where energy falls under 25% of that peak, or under the floor). The segment containing the event wins, else the
// nearest one. The largest peak nearby is often a different element, so it is never chosen by size alone.
function motionAround(m, fps, t, floor, reach = 0.6) {
  const at = (i) => (i - 0.5) / fps; // Difference i is the change between frames i-1 and i.
  const a = Math.max(1, Math.floor((t - reach) * fps));
  const b = Math.min(m.length - 2, Math.ceil((t + reach) * fps));
  const segments = [];
  for (let p = a; p <= b; p++) {
    if (m[p] < floor || m[p] < m[p - 1] || m[p] < m[p + 1]) continue;
    const cut = Math.max(floor, m[p] * 0.25);
    let s = p;
    while (s > 1 && m[s - 1] > cut) s--;
    let e = p;
    while (e < m.length - 1 && m[e + 1] > cut) e++;
    const seg = { peak: m[p], start: at(s), peakAt: at(p), settle: at(e + 1) };
    if (!segments.some((x) => x.start === seg.start && x.settle === seg.settle)) segments.push(seg);
  }
  if (!segments.length) {
    let p = a;
    for (let i = a; i <= b; i++) if (m[i] > m[p]) p = i;
    return { peak: m[p], start: at(p), peakAt: at(p), settle: at(p) };
  }
  const dist = (s) => (t < s.start ? s.start - t : t > s.settle ? t - s.settle : 0);
  return segments.reduce((best, s) => (dist(s) < dist(best) || (dist(s) === dist(best) && s.peak > best.peak) ? s : best));
}

export async function auditVideo(cueLog) {
  const { video, width, height, fps, cues, cuts = [] } = cueLog;
  const [samples, frames] = await Promise.all([decode(video), grayFrames(video)]);
  const { env, rms } = features(samples);
  const heard = onsets(env, rms);
  const sx = MW / width;
  const sy = MH / height;
  const full = { l: 0, t: 0, w: MW, h: MH };
  // A hard cut changes every pixel in one frame. It is not any element's motion, so cut frames are blanked.
  const cutFrames = cuts.map((t) => Math.round(t * fps));
  const motion = (pixels) => {
    const m = motionIn(frames, pixels);
    for (const i of cutFrames) if (i > 0 && i < m.length) m[i] = 0;
    return m;
  };
  const global = motion(boxPixels(full));
  const sorted = [...global].sort((x, y) => x - y);
  const noise = Math.max(0.15, sorted[Math.floor(sorted.length / 2)] * 2);

  // One sound event against the motion in one element box: { mv, deltaMs, region, fail (message or null) }.
  const judge = (rawBox, event, cls) => {
    // The element's final box, padded 15% so its edges still count. Wider padding picks up neighbours.
    const box = rawBox ? { l: (rawBox.l - rawBox.w * 0.15) * sx, t: (rawBox.t - rawBox.h * 0.15) * sy, w: rawBox.w * 1.3 * sx, h: rawBox.h * 1.3 * sy } : full;
    const inBox = boxPixels(box);
    const mask = netChangeMask(frames, inBox, fps, event);
    const sparse = mask.length >= 6 && mask.length < inBox.length * 0.25;
    const local = motion(sparse ? mask : inBox);
    const region = sparse ? `${mask.length} changed px` : 'box';
    const lsorted = [...local].sort((x, y) => x - y);
    const floor = Math.max(noise * 0.5, lsorted[Math.floor(lsorted.length / 2)] * 2, 0.1);
    const mv = motionAround(local, fps, event, floor);
    if (mv.peak < floor) return { mv, region, deltaMs: null, fail: `no visible motion in its element's box within 0.6 s (peak change ${mv.peak.toFixed(2)} under floor ${floor.toFixed(2)})` };
    // Contact and appear sounds must fall inside their motion segment. Swells center on its peak. Strokes start with it.
    const delta = cls === 'swell' ? (event - mv.peakAt) * 1000 : cls === 'stroke' ? (event - mv.start) * 1000 : event < mv.start ? (event - mv.start) * 1000 : event > mv.settle ? (event - mv.settle) * 1000 : 0;
    const tol = CLASS[cls];
    const fail = delta < -tol.early ? `${Math.round(-delta)} ms early: it ${tol.rule}` : delta > tol.late ? `${Math.round(delta)} ms late: it ${tol.rule}` : null;
    return { mv, region, deltaMs: Math.round(delta), fail };
  };

  const results = cues.map((c) => {
    const cls = classOf(c.sound);
    const r = { ...c, cls, verdict: 'ok', notes: [] };
    if (c.sound === 'type' || !cls) {
      r.verdict = 'skip';
      return r;
    }
    // Every pixel changes on a cut, so element motion there cannot be measured. A sound on the cut syncs with the cut.
    const cut = cuts.find((t) => Math.abs(c.event - t) <= 1.5 / fps);
    if (cut != null) {
      r.deltaMs = Math.round((c.event - cut) * 1000);
      r.notes.push('lands on a cut');
      return r;
    }
    // Audio: a detected onset near where the sound file starts. Swells and builds rise too slowly to mark one.
    if (cls === 'contact' || cls === 'appear') {
      const near = heard.filter((o) => Math.abs(o.t - c.start) < 0.06);
      r.heardAt = near.length ? near.reduce((x, y) => (Math.abs(x.t - c.start) < Math.abs(y.t - c.start) ? x : y)).t : null;
      // A missing onset alone is weak evidence: a louder tail still ringing hides new onsets from spectral flux.
      // It fails only if the source match below also cannot find the sound in the mix.
      if (r.heardAt == null) r.onsetMissing = true;
    }
    // A container cue is judged per accent: each child's landing against motion in that child's own box.
    // The container's union box would dilute one child's motion across the whole group.
    if (c.accents?.length > 1) {
      const judged = c.accents.map((a) => judge(a.box, a.event, cls));
      const bad = judged.filter((j) => j.fail);
      r.motion = judged[0].mv;
      r.deltaMs = judged[0].deltaMs;
      r.region = `${judged.length} accents`;
      if (bad.length > judged.length * 0.2) {
        r.verdict = 'fail';
        r.notes.push(`${bad.length}/${judged.length} accents miss their child's motion, e.g. ${bad[0].fail}`);
      }
      return r;
    }
    const j = judge(c.box, c.event, cls);
    r.motion = j.mv;
    r.region = j.region;
    r.deltaMs = j.deltaMs;
    if (j.fail) {
      r.verdict = 'fail';
      r.notes.push(j.fail);
    }
    return r;
  });

  for (const { index, message } of cueSoundErrors(cues, (cue) => cue.event)) {
    results[index].verdict = 'fail';
    results[index].notes.push(message);
  }
  const profiles = new Map();
  const waves = new Map();
  for (const r of results) {
    const source = r.sourceFile ?? r.file;
    if (!source || !existsSync(source)) {
      r.verdict = 'fail';
      r.notes.push('Sound source is unavailable. Run render again to record and check the effect.');
      continue;
    }
    if (!profiles.has(source)) profiles.set(source, await profileSound(source));
    for (const message of soundProfileErrors(r.sound, profiles.get(source), r.d, { struck: r.struck, src: r.src })) {
      r.verdict = 'fail';
      r.notes.push(message);
    }
    if (!r.file || !existsSync(r.file)) {
      r.verdict = 'fail';
      r.notes.push('Placed sound file is unavailable. Run render again.');
      continue;
    }
    // Typing keys are a texture, not synced one by one: a soft key under a riser is masked the way a real one is.
    if (r.sound === 'type') continue;
    if (!waves.has(r.file)) waves.set(r.file, await decode(r.file));
    const wave = waves.get(r.file);
    r.similarity = sourceSimilarity(samples, wave, r.start);
    const available = Math.max(0, Math.min(wave.length, samples.length - Math.round(r.start * SR)));
    const threshold = sourceMatchThreshold(available);
    if (r.similarity < threshold) {
      r.verdict = 'fail';
      r.notes.push(`Sound source match is ${r.similarity.toFixed(2)} in the rendered mix, under ${threshold.toFixed(2)}. Check masking or volume.`);
      if (r.onsetMissing) r.notes.push('No audible onset at its start either.');
    } else if (r.onsetMissing) {
      r.notes.push('No separate onset (another sound is still ringing), but the source is present in the mix.');
    }
  }

  // Big motions with no sound: global change peaks well above the floor, with no cue within 0.3 s. Cuts are excluded.
  const silent = [];
  for (let i = 2; i < global.length - 2; i++) {
    if (cutFrames.some((f) => Math.abs(f - i) <= 1)) continue;
    if (global[i] < noise * 4 || global[i] < global[i - 1] || global[i] < global[i + 1]) continue;
    const t = (i - 0.5) / fps;
    if (cues.some((c) => (t >= c.start && t <= c.start + (c.d ?? 0)) || [c.event, ...(c.accents ?? []).map((a) => a.event)].some((e) => Math.abs(e - t) < 0.3))) continue;
    if (silent.length && t - silent[silent.length - 1].t < 0.4) continue;
    silent.push({ t, strength: global[i] / noise });
  }
  silent.sort((a, b) => b.strength - a.strength);

  return { results, heard, silent: silent.slice(0, 8), rms, global, noise, fps, cuts, duration: frames.length / fps, arc: auditArc(cueLog, samples, frames.length / fps) };
}

// RMS level in dBFS of a sample range.
function levelDb(x, a, b) {
  let s = 0;
  const i0 = Math.max(0, Math.floor(a));
  const i1 = Math.min(x.length, Math.ceil(b));
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return i1 > i0 ? 10 * Math.log10(s / (i1 - i0) + 1e-12) : -120;
}

// Spearman rank correlation: does measured loudness rise and fall in the planned order?
export function rankCorrelation(a, b) {
  const rank = (v) => {
    const order = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(v.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 1;
}

// Checks the soundtrack's shape against its direction: loudness per scene follows the planned energy, the payoff
// scene is the loudest, the mix starts and ends by breathing (no hard edge), and no effect is cut off by the end.
export function auditArc(cueLog, samples, duration) {
  const findings = [];
  const plan = cueLog.plan ?? [];
  // A scene's level is its loudest 400 ms: the moment a listener remembers. An average would reward busy scenes.
  // A transition pre-lapped across a cut belongs to the scene it leads into. Windows it covers in the scene before
  // the cut are skipped, so a whoosh into scene 3 cannot make scene 2 read loud.
  const transitions = (cueLog.cues ?? []).filter((c) => /^cut into /.test(c.target ?? '')).map((c) => ({ from: c.start, to: c.start + (c.d ?? 0), into: c.event }));
  const peakWindow = (p) => {
    const skip = transitions.filter((x) => Math.abs(x.into - p.start) > 0.02);
    let best = -120;
    for (let t = p.start + 0.15; t + 0.4 <= p.end - 0.15; t += 0.1) {
      if (skip.some((x) => t < x.to && t + 0.4 > x.from)) continue;
      best = Math.max(best, levelDb(samples, t * SR, (t + 0.4) * SR));
    }
    return best;
  };
  const scenes = plan.map((p) => ({ ...p, db: peakWindow(p), floor: levelDb(samples, (p.start + 0.15) * SR, (p.end - 0.15) * SR) }));
  if (scenes.length >= 3 && new Set(scenes.map((s) => s.energy)).size >= 2) {
    const rho = rankCorrelation(scenes.map((s) => s.energy), scenes.map((s) => s.db));
    if (rho < 0.5) findings.push({ level: 'warn', msg: `Loudness does not follow the planned energy (rank correlation ${rho.toFixed(2)}, want 0.5 or more). A low-energy scene is too busy, or a high-energy scene too sparse.` });
    // Scenes tied at the top energy share the payoff: the loudest of them must hold it.
    const top = Math.max(...scenes.map((s) => s.energy));
    const planned = scenes.filter((s) => s.energy === top).reduce((a, b) => (b.db > a.db ? b : a));
    const loudest = Math.max(...scenes.map((s) => s.db));
    if (planned.db < loudest - 1.5) findings.push({ level: 'warn', msg: `The peak-energy scene "${planned.scene}" plays ${(loudest - planned.db).toFixed(1)} dB under the loudest scene. Give the payoff the biggest sound.` });
  }
  findings.push(...contrastFindings(plan, samples, transitions));
  // Edges: the first and last 40 ms must sit well under the programme level, or the track starts or stops on a cut.
  const body = levelDb(samples, 0, samples.length);
  const head = levelDb(samples, 0, 0.04 * SR);
  const tail = levelDb(samples, samples.length - 0.04 * SR, samples.length);
  if (body > -70 && head > body - 6) findings.push({ level: 'fail', msg: `The soundtrack starts on a hard edge (first 40 ms at ${head.toFixed(1)} dB against ${body.toFixed(1)} dB overall). Set "sound.fadeIn".` });
  if (body > -70 && tail > body - 6) findings.push({ level: 'fail', msg: `The soundtrack stops on a hard edge (last 40 ms at ${tail.toFixed(1)} dB against ${body.toFixed(1)} dB overall). Set "sound.fadeOut", or hold the end card longer.` });
  // An effect whose dry sound runs past the end is cut, not resolved.
  const fadeOut = cueLog.sound?.fadeOut ?? 0;
  for (const c of cueLog.cues ?? []) {
    const over = c.start + (c.d ?? 0) - duration;
    if (over > 0.02) findings.push({ level: 'fail', msg: `"${c.sound}" at ${c.event.toFixed(2)}s runs ${over.toFixed(2)}s past the end of the video and is cut off. Cue it earlier or hold the end card longer.` });
    else if (fadeOut > 0 && c.sound === 'boom' && c.start + (c.d ?? 0) > duration - fadeOut * 0.5) findings.push({ level: 'warn', msg: `"boom" at ${c.event.toFixed(2)}s rings into the final fade. Land the payoff earlier so it can resolve.` });
  }
  return { scenes, findings };
}

// Turns in a scene's energy curve: each peak and trough, as a plateau with its span in video seconds.
export function energyTurns(curve, start, end) {
  const flat = [];
  for (const [t, e] of curve) {
    const last = flat[flat.length - 1];
    if (last && Math.abs(last.e - e) < 1e-6) last.to = t;
    else flat.push({ from: t, to: t, e });
  }
  if (!flat.length) return [];
  flat[0].from = Math.min(flat[0].from, start);
  flat[flat.length - 1].to = Math.max(flat[flat.length - 1].to, end);
  return flat
    .map((p, i) => {
      const prev = flat[i - 1]?.e;
      const next = flat[i + 1]?.e;
      const peak = (prev == null || p.e > prev) && (next == null || p.e > next);
      const trough = (prev == null || p.e < prev) && (next == null || p.e < next);
      return peak || trough ? { ...p, kind: peak ? 'peak' : 'trough' } : null;
    })
    .filter(Boolean);
}

// A planned change inside a scene must be heard: every peak plays louder than the troughs beside it.
// A peak is heard as its loudest 400 ms across its plateau plus 0.3 s either side, since a hit can land on the ramp.
// A trough is heard across its plateau only, so the hit it leads into never counts as the soft part.
// Transitions pre-lapped into the next scene are skipped, as in the per-scene arc.
function contrastFindings(plan, samples, transitions = []) {
  const out = [];
  for (const p of plan) {
    if (!p.curve || p.curve.length < 2) continue;
    const turns = energyTurns(p.curve, p.start, p.end);
    const skip = transitions.filter((x) => Math.abs(x.into - p.start) > 0.02);
    const heard = (x) => {
      const pad = x.kind === 'peak' ? 0.3 : 0;
      let a = Math.max(p.start, x.from - pad);
      let b = Math.min(p.end, x.to + pad);
      if (b - a < 0.2) [a, b] = [Math.max(p.start, (a + b) / 2 - 0.1), Math.min(p.end, (a + b) / 2 + 0.1)];
      const w = Math.min(0.4, b - a);
      let best = -120;
      for (let t = a; t + w <= b + 1e-9; t += 0.05) {
        if (skip.some((y) => t < y.to && t + w > y.from)) continue;
        best = Math.max(best, levelDb(samples, t * SR, (t + w) * SR));
      }
      return best;
    };
    for (let i = 1; i < turns.length; i++) {
      const [x, y] = [turns[i - 1], turns[i]];
      if (Math.abs(x.e - y.e) < 0.3) continue;
      const [lo, hi] = x.e < y.e ? [x, y] : [y, x];
      const dLo = heard(lo);
      const dHi = heard(hi);
      const at = (z) => `${((z.from + z.to) / 2).toFixed(2)}s`;
      if (dHi <= -70) out.push({ level: 'warn', msg: `Scene "${p.scene}" plans an energy peak of ${hi.e} at ${at(hi)}, but nothing sounds there. Cue the hit, or move the peak onto it.` });
      else if (dHi - dLo < 2) out.push({ level: 'warn', msg: `Scene "${p.scene}": the ${hi.e} peak at ${at(hi)} plays only ${(dHi - dLo).toFixed(1)} dB over the ${lo.e} ${lo.kind} at ${at(lo)} (want 2 dB or more). Quiet the soft part, give the peak its primary sound, or move the peak onto the hit.` });
    }
  }
  return out;
}

// Numeric profile of a sound file. Timbre still needs a listening check when available.
export async function profileSound(file) {
  const x = await decode(file);
  const N = 1024;
  const bins = N / 2;
  const hz = (k) => (k * SR) / N;
  let peak = 0;
  let sumSq = 0;
  for (const v of x) {
    peak = Math.max(peak, Math.abs(v));
    sumSq += v * v;
  }
  const power = new Float64Array(bins);
  let flatSum = 0;
  let frames = 0;
  for (let o = 0; o + N <= Math.max(N, x.length); o += N / 2) {
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[o + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    // Flatness is measured in the speaker band only. Over the full band, a noise with its hiss filtered off reads as
    // a tone, which rewards harsh top end. Inside 150 Hz-5 kHz, tones read near 0 and filtered noise reads 0.1 or more.
    let logSum = 0;
    let linSum = 0;
    let n = 0;
    let e = 0;
    for (let k = 1; k < bins; k++) {
      const p = re[k] * re[k] + im[k] * im[k] + 1e-12;
      power[k] += p;
      e += p;
      if (hz(k) < 150 || hz(k) > 5000) continue;
      logSum += Math.log(p);
      linSum += p;
      n++;
    }
    if (e > 1e-6) {
      flatSum += Math.exp(logSum / n) / (linSum / n);
      frames++;
    }
  }
  let total = 0;
  let centroid = 0;
  let low = 0;
  let speaker = 0;
  for (let k = 1; k < bins; k++) {
    total += power[k];
    centroid += hz(k) * power[k];
    if (hz(k) < 150) low += power[k];
    else if (hz(k) <= 5000) speaker += power[k];
  }
  const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  return {
    duration: x.length / SR,
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sumSq / x.length)),
    centroidHz: centroid / total,
    flatness: frames ? flatSum / frames : 0,
    lowShare: low / total,
    speakerShare: speaker / total,
  };
}

// HTML for the timeline image: thumbnails, waveform, onsets, motion and labelled cues on one time axis.
export function timelineHtml(a, thumbs, thumbStep) {
  const data = JSON.stringify({
    duration: a.duration,
    rms: Array.from(a.rms, (v) => Number(v.toFixed(5))),
    hop: HOP / SR,
    heard: a.heard.map((o) => Number(o.t.toFixed(3))),
    motion: Array.from(a.global, (v) => Number(v.toFixed(3))),
    fps: a.fps,
    noise: a.noise,
    cues: a.results.map((r) => ({ t: r.event, s: r.sound, intent: r.intent ?? '?', v: r.verdict, d: r.deltaMs })),
    silent: a.silent.map((s) => s.t),
    cuts: a.cuts,
    thumbs,
    thumbStep,
  });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#101318;color:#e6e9ef;font:13px/1.2 Inter,system-ui,sans-serif}
.row{position:relative;margin:10px 16px 18px}
.thumbs{display:flex;height:68px}.thumbs img{width:120px;height:68px;object-fit:cover}
canvas{display:block}
.key{padding:10px 16px;color:#9aa4b8}.key b{padding:1px 6px;border-radius:4px;margin-right:6px}
</style></head><body>
<div class="key"><b style="background:#16a34a">ok</b><b style="background:#dc2626">fail</b><b style="background:#6b7280">skip</b>
 waveform (blue, dB) · detected onsets (white ticks) · motion (amber) · cuts (dashed) · big motion with no sound (red ▲) · 1 s gridlines</div>
<div id="rows"></div>
<script>
const D=${data};const PX=240,ROW=8;
const rows=document.getElementById('rows');
for(let r0=0;r0<D.duration;r0+=ROW){
  const row=document.createElement('div');row.className='row';
  const th=document.createElement('div');th.className='thumbs';
  for(let t=r0;t<Math.min(D.duration,r0+ROW)-1e-6;t+=D.thumbStep){const i=Math.round(t/D.thumbStep);if(D.thumbs[i]){const im=document.createElement('img');im.src=D.thumbs[i];th.appendChild(im);}}
  row.appendChild(th);
  const span=Math.min(ROW,D.duration-r0);
  const c=document.createElement('canvas');c.width=Math.ceil(span*PX);c.height=190;row.appendChild(c);rows.appendChild(row);
  const g=c.getContext('2d');const X=t=>(t-r0)*PX;
  g.strokeStyle='#262c36';for(let s=0;s<=Math.floor(span+1e-6);s++){g.beginPath();g.moveTo(s*PX,0);g.lineTo(s*PX,190);g.stroke();g.fillStyle='#6b7280';g.fillText((r0+s).toFixed(0)+'s',s*PX+3,188);}
  g.fillStyle='#3b82f6';
  for(let f=0;f<D.rms.length;f++){const t=f*D.hop;if(t<r0||t>=r0+ROW)continue;const db=Math.max(-60,20*Math.log10(D.rms[f]+1e-9));const h=(db+60)/60*70;g.fillRect(X(t),75-h,Math.max(1,D.hop*PX),h);}
  g.strokeStyle='#fff';for(const t of D.heard){if(t<r0||t>=r0+ROW)continue;g.beginPath();g.moveTo(X(t),0);g.lineTo(X(t),8);g.stroke();}
  const mMax=Math.max(...D.motion,D.noise*6);g.strokeStyle='#f59e0b';g.beginPath();
  for(let i=0;i<D.motion.length;i++){const t=(i-0.5)/D.fps;if(t<r0||t>=r0+ROW)continue;const y=165-D.motion[i]/mMax*80;i?g.lineTo(X(t),y):g.moveTo(X(t),y);}g.stroke();
  g.setLineDash([4,4]);g.strokeStyle='#94a3b8';for(const t of D.cuts){if(t<r0||t>=r0+ROW)continue;g.beginPath();g.moveTo(X(t),0);g.lineTo(X(t),180);g.stroke();g.fillStyle='#94a3b8';g.fillText('cut',X(t)+3,20);}g.setLineDash([]);
  for(const t of D.silent){if(t<r0||t>=r0+ROW)continue;g.fillStyle='#dc2626';g.fillText('▲',X(t)-4,176);}
  let lane=0;
  for(const q of D.cues){if(q.t<r0||q.t>=r0+ROW)continue;const col=q.v==='ok'?'#16a34a':q.v==='fail'?'#dc2626':'#6b7280';
    g.strokeStyle=col;g.lineWidth=2;g.beginPath();g.moveTo(X(q.t),10);g.lineTo(X(q.t),170);g.stroke();g.lineWidth=1;
    g.fillStyle=col;const y=90+(lane++%3)*14;g.fillText(q.s+'/'+q.intent+(q.d!=null&&q.v!=='skip'?(q.d>=0?' +':' ')+q.d+'ms':''),X(q.t)+3,y);}
}
</script></body></html>`;
}
