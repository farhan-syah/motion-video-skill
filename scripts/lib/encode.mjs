import { spawn, spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const BT709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

// How much of the loudest moment's lead the limiter may take. 1.5 dB of fast, oversampled limiting on a hit stays
// inaudible, and lets a sparse mix with a sharp peak reach its loudness target.
const LEAD_LOSS_DB = Number(process.env.MOTION_VIDEO_LEAD_LOSS ?? 1.5);

// An audio step that runs past this is stuck: ffmpeg's scheduler can deadlock and then ignores SIGTERM.
const STALL_MS = 10 * 60 * 1000;

function run(args, input, level = 'error') {
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', level, '-y', ...args], { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let stderr = '';
  ff.stderr.on('data', (d) => (stderr += d));
  // Frame encoding (input piped in) runs as long as the capture feeds it, so only the other steps get a watchdog.
  let stalled = false;
  const stall = input ? null : setTimeout(() => { stalled = true; ff.kill('SIGKILL'); }, STALL_MS);
  const done = new Promise((res, rej) => {
    ff.on('error', (e) => rej(new Error(`ffmpeg failed to start: ${e.message}. Install ffmpeg and put it on PATH.`)));
    ff.on('close', (code) => {
      clearTimeout(stall);
      if (stalled) rej(new Error(`ffmpeg made no exit in ${STALL_MS / 60000} min and was killed. Run the command again. If it stalls again, report the ffmpeg version (ffmpeg -version).\nargs: ${args.join(' ')}`));
      else if (code === 0) res(stderr);
      else rej(new Error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-4).join(' | ')}\nargs: ${args.join(' ')}`));
    });
  });
  return { ff, done };
}

let nvenc = null;
// NVENC when the GPU and driver support it. Measured against libx264 slow CRF 16: -77% CPU instructions, higher SSIM, ~50% larger file.
// MOTION_VIDEO_NVENC=0 forces libx264.
export function disableNvenc() {
  nvenc = false;
}

export function hasNvenc() {
  if (nvenc == null) {
    nvenc = process.env.MOTION_VIDEO_NVENC !== '0' && spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=s=256x256:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-']).status === 0;
  }
  return nvenc;
}

// Streams captured frames into one H.264 segment. Converts sRGB to BT.709 limited range explicitly.
export function frameEncoder(fps, out, { format = 'png', draft = false } = {}) {
  const quality = hasNvenc()
    ? ['-c:v', 'h264_nvenc', '-preset', draft ? 'p4' : 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', draft ? '23' : '16', '-b:v', '0', '-profile:v', 'high']
    : ['-c:v', 'libx264', ...(draft ? ['-preset', 'veryfast', '-crf', '23'] : ['-preset', 'slow', '-crf', '16', '-tune', 'animation'])];
  const inMatrix = format === 'jpeg' ? ':in_color_matrix=bt601:in_range=pc' : '';
  const { ff, done } = run(
    [
      '-f', 'image2pipe', '-framerate', String(fps), '-c:v', format === 'jpeg' ? 'mjpeg' : 'png', '-i', '-',
      '-vf', `scale=trunc(iw/2)*2:trunc(ih/2)*2:out_color_matrix=bt709:out_range=tv${inMatrix},format=yuv420p`,
      ...quality, '-g', String(fps * 2), '-video_track_timescale', String(fps * 1000), ...BT709, '-an', out,
    ],
    true,
  );
  let broken = null;
  ff.stdin.on('error', (e) => (broken = e));
  // When the encoder dies (an NVENC session it could not open), the pipe breaks first. Throw ffmpeg's own error,
  // which names the encoder, so render can fall back to libx264, and never wait for a drain that cannot come.
  const failed = done.then(() => null, (e) => e);
  return {
    async write(buf) {
      if (broken) throw (await failed) ?? broken;
      if (!ff.stdin.write(buf)) {
        const e = await Promise.race([new Promise((r) => ff.stdin.once('drain', () => r(null))), failed]);
        if (e) throw e;
      }
    },
    async end() {
      ff.stdin.end();
      await done;
    },
    async abort() {
      ff.stdin.destroy();
      ff.kill('SIGKILL');
      await done.catch(() => {});
    },
  };
}

export async function concatSegments(segments, listPath, out) {
  writeFileSync(listPath, segments.map((s) => `file '${s.replaceAll("'", "'\\''")}'`).join('\n') + '\n');
  await run(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', out]).done;
}

// Mixes voiceover, sound effects and music. Music and effects duck under voice. Loudness is normalized to -14 LUFS.
// voice and sfx: [{ file, at (s), volume? }]. Clips sharing a file decode once and split.
// direction (optional): { room: { ir, wet } | null, fadeIn, fadeOut }.
// bed (optional): { fragments: [{ file, at, gainDb, pan }], abOut }. It joins after the
// loudness gain, so it never shifts the foreground's level, and it ducks under every hit and word. With abOut,
// the same mix without the bed is also written there, for a matched-level comparison.
// Each sfx clip may carry `space` (0-1): its send into the shared room. Dry UI sounds send nothing.
// fxStem (optional): a path for the effects alone, as they sit in the mix (ducked, with their room), before the
// loudness gain. Written only when voice is present: the audit judges effects on it, since speech dominates the mix.
export async function muxAudio(video, out, { voice = [], sfx = [], music = null, direction = null, bed = null, fxStem = null }, total) {
  if (voice.length === 0 && sfx.length === 0 && !music) {
    await run(['-i', video, '-c', 'copy', '-movflags', '+faststart', out]).done;
    return null;
  }
  const inputs = ['-i', video];
  const graph = [];
  const fmt = 'aformat=sample_rates=48000:channel_layouts=stereo';
  let n = 1;
  const bus = (clips, name, withSend = false) => {
    if (!clips.length) return null;
    const byFile = new Map();
    for (const c of clips) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c]);
    const legs = [];
    const sends = [];
    for (const [file, list] of byFile) {
      inputs.push('-i', file);
      const idx = n++;
      const tags = list.map((_, j) => `[${name}${idx}_${j}]`);
      graph.push(`[${idx}:a]${fmt},asplit=${list.length}${tags.join('')}`);
      list.forEach((c, j) => {
        const leg = `${name}${idx}_${j}d`;
        // tone: shelf gain at 3 kHz from the energy curve. A soft tease sounds darker, a hit brighter.
        const tone = c.tone ? `,treble=g=${c.tone}:f=3000:t=q:w=0.7` : '';
        // pan: -1 left to 1 right, constant power, so a hit keeps its loudness as it moves off center.
        const a = ((c.pan ?? 0) + 1) * (Math.PI / 4);
        const pan = c.pan ? `,pan=stereo|c0=${(Math.cos(a) * Math.SQRT2).toFixed(3)}*c0|c1=${(Math.sin(a) * Math.SQRT2).toFixed(3)}*c1` : '';
        // Each leg is padded and trimmed to the video's length before any amix. ffmpeg 9 deadlocks at random (about
        // 1 run in 3) when delayed legs meet an apad placed after the amix.
        // A clip that started before this render's first frame (a video-wide voiceover under a scene render) is
        // trimmed to where the render begins.
        const lead = c.at < 0 ? `atrim=start=${(-c.at).toFixed(3)},asetpts=PTS-STARTPTS,` : '';
        const shaped = `${tags[j]}${lead}adelay=delays=${Math.round(Math.max(0, c.at) * 1000)}:all=1,volume=${(c.volume ?? 1).toFixed(3)}${tone}${pan},apad,atrim=0:${total.toFixed(3)}`;
        if (withSend && c.space > 0) {
          graph.push(`${shaped},asplit=2[${leg}][${leg}r]`);
          graph.push(`[${leg}r]volume=${c.space.toFixed(3)}[${leg}s]`);
          sends.push(`[${leg}s]`);
        } else {
          graph.push(`${shaped}[${leg}]`);
        }
        legs.push(`[${leg}]`);
      });
    }
    graph.push(`${legs.join('')}amix=inputs=${legs.length}:normalize=0:duration=longest[${name}]`);
    if (sends.length) graph.push(`${sends.join('')}amix=inputs=${sends.length}:normalize=0:duration=longest[${name}send]`);
    return { name, send: sends.length ? `${name}send` : null };
  };
  const voBus = bus(voice, 'vo');
  const vo = voBus?.name ?? null;
  // Effects sit under the voice and never trigger ducking. Their sends feed one shared room.
  const fxBus = bus(sfx.map((c) => ({ ...c, volume: (c.volume ?? 1) * 0.5 })), 'fx', !!direction?.room);
  const fx = fxBus?.name ?? null;
  const parts = [];
  if (fxBus?.send && direction?.room) {
    inputs.push('-i', direction.room.ir);
    graph.push(`[${n++}:a]${fmt}[ir]`);
    // The room tail rings on past the dry sound: this is the feathered end a clipped effect lacks.
    graph.push(`[${fxBus.send}][ir]afir=dry=0:wet=1:gtype=peak,volume=${direction.room.wet.toFixed(3)},atrim=0:${total.toFixed(3)}[room]`);
    parts.push('[room]');
  }
  const stem = fxStem && fx && voice.length ? [] : null;
  // Speech stays on top: music ducks hard under it, effects more gently, so a hit never masks a word.
  const keys = [music && vo ? 'voKeyM' : null, fx && vo ? 'voKeyF' : null].filter(Boolean);
  if (vo) {
    graph.push(`[${vo}]asplit=${keys.length + 1}[voOut]${keys.map((k) => `[${k}]`).join('')}`);
    parts.push('[voOut]');
  }
  if (music) {
    inputs.push('-ss', String(music.start ?? 0), '-stream_loop', '-1', '-i', music.file);
    const fadeAt = Math.max(0, total - 2).toFixed(3);
    graph.push(`[${n++}:a]${fmt},atrim=0:${total.toFixed(3)},volume=${music.volume},afade=t=in:d=1,afade=t=out:st=${fadeAt}:d=2[bed]`);
    if (vo) {
      graph.push('[bed][voKeyM]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck]');
      parts.push('[duck]');
    } else {
      parts.push('[bed]');
    }
  }
  if (fx && vo) {
    graph.push(`[${fx}][voKeyF]sidechaincompress=threshold=0.03:ratio=3:attack=10:release=250[fxduck]`);
    parts.push('[fxduck]');
  } else if (fx) parts.push(`[${fx}]`);
  if (stem) {
    // Each effects part feeds both the mix and the stem.
    for (const p of parts.filter((x) => x === '[fxduck]' || x === '[room]')) {
      const name = p.slice(1, -1);
      graph.push(`${p}asplit=2[${name}m][${name}s]`);
      parts[parts.indexOf(p)] = `[${name}m]`;
      stem.push(`[${name}s]`);
    }
  }
  // The mix breathes in from silence and resolves out, instead of starting and stopping on a hard edge.
  const fadeIn = direction?.fadeIn ?? 0;
  const fadeOut = Math.min(direction?.fadeOut ?? 0, total / 2);
  const edges = [fadeIn > 0 ? `afade=t=in:d=${fadeIn.toFixed(3)}:curve=qsin` : null, fadeOut > 0 ? `afade=t=out:st=${(total - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}:curve=qsin` : null].filter(Boolean);
  graph.push(`${parts.join('')}amix=inputs=${parts.length}:normalize=0:duration=longest,atrim=0:${total.toFixed(3)}${edges.map((e) => `,${e}`).join('')}[aout]`);
  // The stem carries the same fades as the mix: an effect the fade swallows is judged as silent there too.
  if (stem) graph.push(`${stem.join('')}amix=inputs=${stem.length}:normalize=0:duration=longest,atrim=0:${total.toFixed(3)}${edges.map((e) => `,${e}`).join('')}[fxstem]`);
  // Two-pass loudness: mix to a file, measure it, then apply one linear gain. One pass drifts on short clips.
  const mixed = `${out}.mix.wav`;
  const stemOut = stem ? ['-map', '[fxstem]', '-c:a', 'pcm_f32le', '-ar', '48000', fxStem] : [];
  await run([...inputs, '-filter_complex', graph.join(';'), '-map', '[aout]', '-c:a', 'pcm_f32le', '-ar', '48000', mixed, ...stemOut]).done;
  // Loudness gating skips silence, so sparse effects alone would be pushed as loud as speech. They get a lower target.
  const targetI = vo || music ? -14 : -18;
  // Effects alone peak no higher than -6 dBTP: sharp clicks near full scale are painful. Voice and music keep -1.5.
  const ceilingDb = vo || music ? -1.5 : -6;
  const log = await run(['-i', mixed, '-af', `loudnorm=I=${targetI}:TP=${ceilingDb}:print_format=json`, '-f', 'null', '-'], false, 'info').done;
  const json = log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1);
  let m;
  try {
    m = JSON.parse(json);
  } catch {
    throw new Error(`ffmpeg loudnorm printed no measurement for ${mixed}. Check the audio inputs decode.`);
  }
  const measured = Number(m.input_i);
  if (!Number.isFinite(measured)) throw new Error(`ffmpeg measured no integrated loudness for ${mixed} (input_i "${m.input_i}"): the mix is silent.`);
  // One exact linear gain to the target, then a limiter for any peak over the ceiling. loudnorm's own second pass
  // silently switches to dynamic compression when a sparse effects mix has a wide loudness range, which makes
  // data-sfx-vol and energy changes land unpredictably. Linear gain keeps every relative level as designed.
  // The limiter lowers integrated loudness on peaky mixes, so the gain is re-measured after limiting and corrected.
  // The target never outranks the arc. The limiter may trim brief peaks, but the gain stops rising before the loudest
  // moment (400 ms momentary loudness) loses more than LEAD_LOSS_DB of its lead over the rest of the mix. A sparse mix that
  // cannot reach the target within that ships quieter, so the payoff keeps its contrast.
  let limitDb = ceilingDb - 0.5;
  const peakIn = Number(m.input_tp);
  const probe = async (g) => {
    const log2 = await run(['-i', mixed, '-af', `${chain(g)},ebur128`, '-f', 'null', '-'], false, 'info').done;
    const ms = [...log2.matchAll(/M:\s*(-?[\d.]+)/g)].map((x) => Number(x[1])).filter((v) => v > -70).sort((a, b) => a - b);
    const i = Number(log2.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop()?.match(/-?[\d.]+/)?.[0]);
    // Lead: the loudest moment over the 90th percentile of the audible moments.
    return { i, lead: ms.length ? ms[ms.length - 1] - ms[Math.floor(ms.length * 0.9)] : 0 };
  };
  // The limiter runs 4x oversampled, so it also catches peaks between samples (true peak), which AAC rebuilds.
  const limiter = () => `aresample=192000,alimiter=limit=${(10 ** (limitDb / 20)).toFixed(4)}:level=false:attack=1:release=60,aresample=48000`;
  const chain = (g) => `volume=${g.toFixed(2)}dB,${limiter()}`;
  // Gain with no limiting at all, and the lead there. Above it, two binary searches: the gain that reaches the
  // target, and the highest gain that keeps the lead. The lower of the two wins.
  const clean = Number.isFinite(peakIn) ? limitDb - peakIn : targetI - measured;
  const base = await probe(clean);
  let gainMax = Infinity;
  let gainDb = clean;
  if (!Number.isFinite(base.i) || base.i < targetI - 0.5) {
    const search = async (ok) => {
      let lo = clean;
      let hi = clean + 18;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        if (await ok(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    gainMax = await search(async (g) => (await probe(g)).lead >= base.lead - LEAD_LOSS_DB);
    const reach = await search(async (g) => (await probe(g)).i <= targetI);
    gainDb = Math.min(reach, gainMax);
  } else {
    gainDb = clean + (targetI - base.i);
  }
  // Loudness and true peak hold for the delivered file, so both are measured after AAC encoding: the encoder
  // rebuilds peaks between samples and still trims some top end. A peak overshoot lowers the gain and the limit
  // together, so the limiting depth stays where the search put it. A loudness miss moves the gain, never past gainMax.
  const encode = async (file, withBed) => {
    const args = ['-i', video, '-i', mixed];
    let map;
    if (withBed) {
      const g = ['[1:a]asplit=2[fg][key]'];
      const parts = [];
      let k = 2;
      for (const f of bed.fragments) {
        args.push('-i', f.file);
        const a = ((f.pan ?? 0) + 1) * (Math.PI / 4);
        // Fragments sit on the same scale as the effects: the effects bus half-gain, then the loudness gain.
        g.push(`[${k++}:a]${fmt},adelay=delays=${Math.round(f.at * 1000)}:all=1,volume=${(f.gainDb + gainDb - 6.02).toFixed(2)}dB,apad,atrim=0:${total.toFixed(3)},pan=stereo|c0=${(Math.cos(a) * Math.SQRT2).toFixed(3)}*c0|c1=${(Math.sin(a) * Math.SQRT2).toFixed(3)}*c1[f${parts.length}]`);
        parts.push(`[f${parts.length}]`);
      }
      const edges = [fadeIn > 0 ? `,afade=t=in:d=${fadeIn.toFixed(3)}:curve=qsin` : '', fadeOut > 0 ? `,afade=t=out:st=${(total - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}:curve=qsin` : ''].join('');
      g.push(`${parts.join('')}amix=inputs=${parts.length}:normalize=0:duration=longest,atrim=0:${total.toFixed(3)}${edges}[bedraw]`);
      // Every hit and word pushes the bed down, and it breathes back in over 350 ms.
      g.push(`[key]volume=${gainDb.toFixed(2)}dB[keyg]`);
      g.push('[bedraw][keyg]sidechaincompress=threshold=0.02:ratio=4:attack=5:release=350[bed]');
      g.push(`[fg]volume=${gainDb.toFixed(2)}dB[fgg]`);
      g.push(`[fgg][bed]amix=inputs=2:normalize=0:duration=first,${limiter()}[a]`);
      args.push('-filter_complex', g.join(';'));
      map = ['-map', '0:v', '-map', '[a]'];
    } else {
      args.push('-af', chain(gainDb));
      map = ['-map', '0:v', '-map', '1:a'];
    }
    await run([...args, ...map, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-cutoff', '20000', '-t', total.toFixed(3), '-movflags', '+faststart', file]).done;
    return measureAudio(file);
  };
  const hasBed = !!bed && bed.fragments.length > 0;
  let got = null;
  for (let pass = 0; pass < 5; pass++) {
    got = await encode(out, hasBed);
    if (!Number.isFinite(got.i) || !Number.isFinite(got.tp)) break;
    if (got.tp > ceilingDb) {
      const over = got.tp - ceilingDb + 0.2;
      limitDb -= over;
      gainDb -= over;
      continue;
    }
    const next = Math.min(gainDb + targetI - got.i, gainMax + (limitDb - (ceilingDb - 0.5)));
    if (Math.abs(got.i - targetI) <= 0.5 || Math.abs(next - gainDb) < 0.05) break;
    gainDb = next;
  }
  // The comparison without the bed keeps the delivered file's exact gain and limit: only the bed differs.
  if (hasBed && bed.abOut) await encode(bed.abOut, false);
  rmSync(mixed, { force: true });
  return { loudness: got?.i, truePeak: got?.tp, target: targetI, ceiling: ceilingDb, leadLoss: LEAD_LOSS_DB, held: Number.isFinite(got?.i) && got.i < targetI - 0.5, gainDb, fxStem: stem ? fxStem : null };
}

// Integrated loudness (LUFS) and true peak (dBTP) of a file's audio, as delivered.
export async function measureAudio(file) {
  const log = await run(['-nostats', '-i', file, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'], false, 'info').done;
  const summary = log.slice(log.lastIndexOf('Summary:'));
  return {
    i: Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]),
    tp: Number(summary.match(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/)?.[1]),
  };
}

export async function truePeak(file) {
  return (await measureAudio(file)).tp;
}

export async function tileImages(pngs, out, { cols = 4, width = 480 } = {}) {
  const rows = Math.ceil(pngs.length / cols);
  const { ff, done } = run(['-f', 'image2pipe', '-c:v', 'png', '-i', '-', '-vf', `scale=${width}:-2,tile=${cols}x${rows}:padding=8:margin=8:color=0x808080`, '-frames:v', '1', out], true);
  for (const p of pngs) if (!ff.stdin.write(p)) await new Promise((r) => ff.stdin.once('drain', r));
  ff.stdin.end();
  await done;
}

// A compressed copy for chat apps and social uploads: the same picture and audio in a slow x264 encode. NVENC at
// its master quality spends several times the bits a flat motion-graphics frame needs. Measured on a 65 s promo:
// 36.2 MB master, 9.4 MB compressed copy at SSIM 0.997.
export async function compressedCopy(video, out) {
  await run(['-i', video, '-map', '0', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '6000k', '-bufsize', '12000k', '-tune', 'animation', '-pix_fmt', 'yuv420p', ...BT709, '-c:a', 'copy', '-movflags', '+faststart', out]).done;
}

export async function videoSheet(video, out, duration, { count = 16, cols = 4, width = 480 } = {}) {
  const rows = Math.ceil(count / cols);
  await run(['-i', video, '-vf', `fps=${count}/${duration.toFixed(3)},scale=${width}:-2,tile=${cols}x${rows}:padding=8:margin=8:color=0x808080`, '-frames:v', '1', out]).done;
}
