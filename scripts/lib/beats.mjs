import { spawn } from 'node:child_process';
import { keyFromChroma } from './sound-tuning.mjs';

export const SR = 22050;
const WIN = 1024;
export const HOP = 256; // ~11.6 ms per onset frame.

export function decode(file, start = 0) {
  return new Promise((res, rej) => {
    // A true channel average: ffmpeg's default -ac 1 downmix adds 3 dB to correlated stereo, which misreports peaks.
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(start), '-i', file, '-af', 'aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0+0.5*c1', '-ar', String(SR), '-f', 'f32le', '-']);
    const chunks = [];
    let err = '';
    ff.stdout.on('data', (d) => chunks.push(d));
    ff.stderr.on('data', (d) => (err += d));
    ff.on('error', (e) => rej(new Error(`ffmpeg failed to start: ${e.message}`)));
    ff.on('close', (code) => {
      if (code !== 0) return rej(new Error(`ffmpeg cannot decode ${file}: ${err.trim()}`));
      const buf = Buffer.concat(chunks);
      res(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)));
    });
  });
}

// In-place radix-2 FFT.
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

// Spectral-flux onset envelope, plus bass energy and RMS per frame. Frame f is centered at (f*HOP + WIN/2)/SR seconds.
export function features(x) {
  const frames = Math.max(0, Math.floor((x.length - WIN) / HOP));
  const hann = Float32Array.from({ length: WIN }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WIN));
  const bassBin = Math.ceil((150 * WIN) / SR);
  const onset = new Float32Array(frames);
  const bass = new Float32Array(frames);
  const rms = new Float32Array(frames);
  let prev = new Float32Array(WIN / 2);
  const re = new Float32Array(WIN);
  const im = new Float32Array(WIN);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < WIN; i++) {
      const v = x[f * HOP + i];
      e += v * v;
      re[i] = v * hann[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / WIN);
    fft(re, im);
    const mag = new Float32Array(WIN / 2);
    let flux = 0;
    let b = 0;
    for (let k = 1; k < WIN / 2; k++) {
      mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      const d = mag[k] - prev[k];
      if (d > 0) flux += d;
      if (k <= bassBin) b += mag[k];
    }
    onset[f] = flux;
    bass[f] = b;
    prev = mag;
  }
  // Remove the local mean so sustained loudness does not read as onsets.
  const w = Math.round(0.5 / (HOP / SR));
  const env = new Float32Array(frames);
  let sum = 0;
  for (let f = 0; f < frames; f++) {
    sum += onset[f];
    if (f >= w) sum -= onset[f - w];
    env[f] = Math.max(0, onset[f] - sum / Math.min(f + 1, w));
  }
  const sd = Math.sqrt(env.reduce((s, v) => s + v * v, 0) / Math.max(1, frames)) || 1;
  for (let f = 0; f < frames; f++) env[f] /= sd;
  return { env, bass, rms };
}

// Key of a track: pitch-class energy from 65 Hz-2 kHz, matched against major and minor key profiles.
export function keyOf(x) {
  const N = 8192;
  const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const pc = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) {
    const hz = (k * SR) / N;
    if (hz >= 65 && hz <= 2000) pc[k] = (((Math.round(12 * Math.log2(hz / 440) + 69)) % 12) + 12) % 12;
  }
  const chroma = new Float64Array(12);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let o = 0; o + N <= x.length; o += N / 2) {
    for (let i = 0; i < N; i++) {
      re[i] = x[o + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    // Per-frame normalization: loud passages do not outvote the rest of the track.
    const frame = new Float64Array(12);
    for (let k = 1; k < N / 2; k++) if (pc[k] >= 0) frame[pc[k]] += Math.hypot(re[k], im[k]);
    const total = frame.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < 12; i++) chroma[i] += frame[i] / total;
  }
  return keyFromChroma(Array.from(chroma));
}

export async function detectKey(file) {
  const x = await decode(file, 0);
  if (x.length < SR * 2) throw new Error(`${file} is shorter than 2 seconds. Key detection needs more audio.`);
  return keyOf(x);
}

// Tempo by autocorrelation of the onset envelope, weighted toward 120 BPM.
function tempo(env) {
  const fr = SR / HOP;
  let best = { score: -Infinity, period: 0 };
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * fr;
    const l0 = Math.floor(lag);
    const t = lag - l0;
    let ac = 0;
    for (let i = 0; i + l0 + 1 < env.length; i++) ac += env[i] * ((1 - t) * env[i + l0] + t * env[i + l0 + 1]);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const score = (ac / env.length) * prior;
    if (score > best.score) best = { score, period: lag, bpm };
  }
  return best;
}

// Dynamic-programming beat tracker (Ellis 2007): onset strength plus tempo consistency.
function track(env, period) {
  const n = env.length;
  const score = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  const tight = 100;
  for (let t = 0; t < n; t++) {
    let bestV = 0;
    let bestP = -1;
    for (let p = Math.max(0, Math.round(t - 2 * period)); p <= t - Math.round(period / 2); p++) {
      const v = score[p] - tight * Math.log((t - p) / period) ** 2;
      if (v > bestV || bestP < 0) {
        bestV = v;
        bestP = p;
      }
    }
    score[t] = env[t] + (bestP >= 0 ? bestV : 0);
    back[t] = bestP;
  }
  let t = 0;
  for (let i = Math.max(0, n - Math.round(period)); i < n; i++) if (score[i] > score[t]) t = i;
  const beats = [];
  for (; t >= 0; t = back[t]) beats.unshift(t);
  return beats;
}

// Analyzes the whole track, then shifts by `start`, so the bar phase never depends on the offset.
export async function analyzeBeats(file, { start = 0 } = {}) {
  const abs = await analyzeTrack(file);
  const rel = (list) => list.map((t) => Number((t - start).toFixed(3))).filter((t) => t >= -0.005);
  const alignedStart = abs.downbeats.find((t) => t >= start - 0.005) ?? start;
  return {
    file,
    start,
    trackDuration: abs.duration,
    bpm: abs.bpm,
    beat: abs.beat,
    beats: rel(abs.beats),
    downbeats: rel(abs.downbeats),
    hits: rel(abs.hits),
    bars: abs.bars.filter((b) => b.start >= start - 0.005).map((b) => ({ start: Number((b.start - start).toFixed(3)), energy: b.energy })),
    // A music.start on a downbeat makes video time 0 a bar start, so "bars" scenes cut on downbeats.
    alignedStart: Number(alignedStart.toFixed(3)),
    // The track's key: tonal effects are tuned to it when "sound.key" is "auto".
    key: abs.key,
    absolute: { downbeats: abs.downbeats, hits: abs.hits },
  };
}

async function analyzeTrack(file) {
  const x = await decode(file, 0);
  if (x.length < SR * 2) throw new Error(`${file} is shorter than 2 seconds. Beat analysis needs more audio.`);
  const key = keyOf(x);
  const { env, bass, rms } = features(x);
  const { period, bpm } = tempo(env);
  const frames = track(env, period);
  const sec = (f) => Number(((f * HOP + WIN / 2) / SR).toFixed(3));
  // Downbeat: the phase of four whose beats carry the most bass onset.
  let phase = 0;
  let bestBass = -Infinity;
  for (let p = 0; p < 4; p++) {
    let s = 0;
    let c = 0;
    for (let i = p; i < frames.length; i += 4) {
      s += bass[frames[i]] + env[frames[i]];
      c++;
    }
    if (c && s / c > bestBass) {
      bestBass = s / c;
      phase = p;
    }
  }
  const beats = frames.map(sec);
  // Refine tempo with a least-squares line through the tracked beats; the autocorrelation grid is coarse.
  let fitted = bpm;
  if (beats.length >= 8) {
    const n = beats.length;
    const mx = (n - 1) / 2;
    const my = beats.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let den = 0;
    beats.forEach((y, i) => {
      num += (i - mx) * (y - my);
      den += (i - mx) ** 2;
    });
    fitted = 60 / (num / den);
  }
  const downbeats = beats.filter((_, i) => i % 4 === phase);
  // Bar energy, and hits: bars at least 1.5x louder than the two bars before them.
  const bars = downbeats.map((t, i) => {
    const a = Math.round((t * SR) / HOP);
    const b = i + 1 < downbeats.length ? Math.round((downbeats[i + 1] * SR) / HOP) : rms.length;
    let e = 0;
    for (let f = a; f < b; f++) e += rms[f];
    return { start: t, energy: e / Math.max(1, b - a) };
  });
  const peak = Math.max(...bars.map((b) => b.energy), 1e-9);
  for (const b of bars) b.energy = Number((b.energy / peak).toFixed(3));
  const hits = bars.filter((b, i) => i >= 2 && b.energy >= 1.5 * ((bars[i - 1].energy + bars[i - 2].energy) / 2) && b.energy > 0.4).map((b) => b.start);
  return { duration: Number((x.length / SR).toFixed(3)), bpm: Number(fitted.toFixed(2)), beat: Number((60 / fitted).toFixed(4)), beats, downbeats, bars, hits, key };
}
