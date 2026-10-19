// Narration from ElevenLabs. Each sentence group is its own take, with the neighbouring takes as context so
// intonation carries across the cuts. The silence between takes is exact, set here and never left to the model.
// Every take is cached by its inputs, so a re-run pays only for changed text.
//
//   node tools/tts-elevenlabs.mjs [--dry]
//
// Reads  ear.txt (spoken script) and script.txt (written script), one paragraph per blank-line block.
//        Pauses in ear.txt, the same marks as the motion-video skill:
//          blank line         0.8 s between paragraphs (1.1 s after a question)
//          line break         0.45 s breath, and a new take
//          [pause] [pause N]  0.6 s or exactly N s, and a new take
//          [section]          a block of its own at a chapter change: 0.8 s more silence after the take before it
//                             ([section 1.2] for exactly 1.2 s more). It is not a paragraph, so script.txt has no block for it.
//        {written|spoken} forms keep the spoken side. A leading (delivery note) is dropped.
// Writes assets/voiceover.wav (48 kHz mono), assets/voiceover.txt (the written words, for `transcribe`),
//        assets/voiceover.plan.json (take file, text, start time and length of every take).
// Key:   $ELEVENLABS_API_KEY, else .env, else the first line of ~/.config/elevenlabs/api_key. It is never printed.
// Env:   ELEVEN_VOICE (required), ELEVEN_MODEL, ELEVEN_FORMAT, ELEVEN_STABILITY, ELEVEN_SIMILARITY,
//        ELEVEN_STYLE, ELEVEN_SPEED, ELEVEN_SEED, ELEVEN_PAUSE, ELEVEN_LINE_PAUSE, ELEVEN_RETRY, ELEVEN_TAIL_OK, ELEVEN_FADE_OUT.
//
// Why exact silence: a model's own pause at a full stop is short and uneven, and `<break>` tags work only on the
// older models (not on Eleven v3 or v4), so a list of short sentences runs together. Separate takes always pause.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DRY = process.argv.includes("--dry");
const VOICE = process.env.ELEVEN_VOICE;
if (!VOICE) throw new Error("ELEVEN_VOICE is not set. Pass the voice id the user chose: ELEVEN_VOICE=<id> node tools/tts-elevenlabs.mjs");
const MODEL = process.env.ELEVEN_MODEL ?? "eleven_v4";
const FORMAT = process.env.ELEVEN_FORMAT ?? "mp3_44100_128";
const SETTINGS = {
  stability: Number(process.env.ELEVEN_STABILITY ?? 0.55),
  similarity_boost: Number(process.env.ELEVEN_SIMILARITY ?? 0.75),
  style: Number(process.env.ELEVEN_STYLE ?? 0),
  speed: Number(process.env.ELEVEN_SPEED ?? 1),
  use_speaker_boost: true,
};
const SEED = Number(process.env.ELEVEN_SEED ?? 7);
const PAUSE = Number(process.env.ELEVEN_PAUSE ?? 0.8);
const PAUSE_AFTER_QUESTION = PAUSE + 0.3;
const LINE_PAUSE = Number(process.env.ELEVEN_LINE_PAUSE ?? 0.45);
const MARK_PAUSE = 0.6;
const TAIL_OK = Number(process.env.ELEVEN_TAIL_OK ?? -42); // mean dB of the last 120 ms
const MAX_RETRY = Number(process.env.ELEVEN_RETRY ?? 4);
const FADE_OUT = Number(process.env.ELEVEN_FADE_OUT ?? 0.12); // seconds: a take never stops dead against silence
const FADE_IN = 0.02;
const SECTION_PAUSE = 0.8;
const CACHE = "assets/eleven";

const note = /^\((?:[^)]*)\)\s*/; // a leading delivery note, VoxCPM2 only
const MARK = /\s*\[pause(?:\s+([\d.]+))?\]\s*/;
const spoken = (s) => s.replace(/\{[^|}]*\|([^}]*)\}/g, "$1");
const written = (s) => s.replace(/\{([^|}]*)\|[^}]*\}/g, "$1");
const blocks = (file) => readFileSync(file, "utf8").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

// The written script: one string per paragraph, no marks.
const text = blocks("script.txt").map((b) => written(b.split("\n").map((l) => l.replace(note, "").trim()).filter(Boolean).join(" ")).replace(new RegExp(MARK, "g"), " ").replace(/\s+/g, " ").trim());

// The spoken script: one take per line piece. `after` is the silence that follows the take.
const takes = [];
const SECTION = /^\[section(?:\s+([\d.]+))?\]$/;
const earBlocks = [];
const extra = new Map(); // paragraph index -> extra silence after its last take, from a [section] block that follows it
for (const b of blocks("ear.txt")) {
  const m = SECTION.exec(b);
  if (m) extra.set(earBlocks.length - 1, Number(m[1] ?? SECTION_PAUSE));
  else earBlocks.push(b);
}
earBlocks.forEach((b, para) => {
  const lines = b.split("\n").map((l) => l.replace(note, "").trim()).filter(Boolean);
  lines.forEach((line, li) => {
    const parts = line.split(MARK); // text, number, text, number, ...
    for (let k = 0; k < parts.length; k += 2) {
      const t = spoken(parts[k]).trim();
      if (!t) continue;
      const hasMark = k + 1 < parts.length;
      const mark = hasMark ? (parts[k + 1] === undefined ? MARK_PAUSE : Number(parts[k + 1])) : null;
      const lastOfLine = k + 2 >= parts.length || !spoken(parts.slice(k + 2).filter((_, n) => n % 2 === 0).join("")).trim();
      const lastOfPara = li === lines.length - 1 && lastOfLine;
      let after;
      if (lastOfPara) after = /\?$/.test(t) ? PAUSE_AFTER_QUESTION : PAUSE;
      else if (mark !== null) after = mark;
      else after = LINE_PAUSE;
      takes.push({ para, text: t, after: after + (lastOfPara ? extra.get(para) ?? 0 : 0) });
    }
  });
});
if (earBlocks.length !== text.length) throw new Error(`ear.txt has ${earBlocks.length} paragraphs, script.txt has ${text.length}`);
takes.forEach((t, g) => {
  t.j = takes.slice(0, g).filter((u) => u.para === t.para).length;
});
const chars = takes.reduce((n, t) => n + t.text.length, 0);

if (DRY) {
  console.log(`${earBlocks.length} paragraphs, ${takes.length} takes, ${chars} characters, voice ${VOICE}, model ${MODEL}, ${FORMAT}`);
  takes.forEach((t, g) => console.log(String(g + 1).padStart(3), `p${t.para + 1}.${t.j}`, `[${t.text.length}] +${t.after}s`, t.text.slice(0, 80)));
  process.exit(0);
}

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  if (existsSync(".env")) {
    const line = readFileSync(".env", "utf8").split("\n").find((l) => /^\s*ELEVENLABS_API_KEY\s*=/.test(l));
    const value = line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  const f = join(homedir(), ".config/elevenlabs/api_key");
  if (existsSync(f)) return readFileSync(f, "utf8").split("\n")[0].trim();
  throw new Error("No ElevenLabs key. Put it in the project's .env as ELEVENLABS_API_KEY=..., or set $ELEVENLABS_API_KEY.");
}

const duration = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }));
function tailLevel(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(Math.max(0, duration(file) - 0.12)), "-t", "0.12", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const m = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr);
  return m ? Number(m[1]) : -99;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function take(g, attempt = 0) {
  const t = takes[g];
  // The first take of a paragraph keeps the seed it had when a paragraph was one take, so cached takes stay valid.
  const body = { text: t.text, model_id: MODEL, voice_settings: SETTINGS, seed: SEED + t.para + t.j * 100 + attempt * 1000, previous_text: takes[g - 1]?.text, next_text: takes[g + 1]?.text };
  const key = createHash("sha1").update(JSON.stringify([VOICE, FORMAT, body])).digest("hex").slice(0, 16);
  const file = join(CACHE, `${String(g + 1).padStart(3, "0")}-${key}.${FORMAT.split("_")[0] === "mp3" ? "mp3" : "wav"}`);
  if (existsSync(file)) return { file, cached: true };
  for (let tries = 1; ; tries++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=${FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey(), "content-type": "application/json", accept: "audio/*" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return { file, cached: false };
    }
    const detail = (await res.text()).slice(0, 300);
    if ([401, 402, 403, 404, 422].includes(res.status)) throw new Error(`ElevenLabs ${res.status} on take ${g + 1}: ${detail}`);
    if (tries >= 5) throw new Error(`ElevenLabs ${res.status} after ${tries} tries on take ${g + 1}: ${detail}`);
    await sleep(1500 * tries);
  }
}

mkdirSync(CACHE, { recursive: true });
const plan = [];
for (let g = 0; g < takes.length; g++) {
  // A take that ends while the voice is still loud lost its last syllable. Retry with another seed, keep the quietest end.
  let best = { t: await take(g, 0), attempt: 0 };
  best.tail = tailLevel(best.t.file);
  for (let attempt = 1; attempt <= MAX_RETRY && best.tail > TAIL_OK; attempt++) {
    const alt = await take(g, attempt), tail = tailLevel(alt.file);
    if (tail < best.tail) best = { t: alt, tail, attempt };
  }
  const dur = duration(best.t.file);
  plan.push({ g: g + 1, para: takes[g].para + 1, j: takes[g].j, file: best.t.file, dur, text: takes[g].text, pauseAfter: takes[g].after });
  process.stdout.write(`${best.t.cached ? "cached" : "made  "} ${String(g + 1).padStart(3)}/${takes.length} p${takes[g].para + 1}.${takes[g].j} ${dur.toFixed(1)}s end ${best.tail.toFixed(0)} dB\n`);
}

// Join the takes with exact silence between them, as one 48 kHz mono file.
let t0 = 0;
for (const p of plan) { p.start = t0; t0 += p.dur + p.pauseAfter; }
const inputs = plan.flatMap((p) => ["-i", p.file]);
const filters = plan.map((p, k) => `[${k}:a]aresample=48000,aformat=channel_layouts=mono,afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${Math.max(0, p.dur - FADE_OUT).toFixed(3)}:d=${FADE_OUT},apad=pad_dur=${p.pauseAfter.toFixed(3)}[a${k}]`);
const graph = `${filters.join(";")};${plan.map((_, k) => `[a${k}]`).join("")}concat=n=${plan.length}:v=0:a=1[out]`;
execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", "-ac", "1", "assets/voiceover.wav"], { maxBuffer: 1 << 26 });
writeFileSync("assets/voiceover.txt", text.join("\n\n") + "\n");
writeFileSync("assets/voiceover.plan.json", JSON.stringify(plan, null, 1));
console.log(`assets/voiceover.wav ${t0.toFixed(1)} s, ${earBlocks.length} paragraphs, ${takes.length} takes, ${chars} characters (cached takes cost nothing)`);
