// Cuts the video to the narration. Copy to tools/ in the project. Run after every change to the voice or to chapters.json:
//   node ~/.claude/skills/motion-video/scripts/video.mjs transcribe     (writes out/voice/words.json)
//   node tools/timeline.mjs
// Reads  chapters.json: each scene's id and the phrase it starts on, in order. An optional "chapter" title per scene
//        also prints YouTube chapter lines (first at 0:00).
// Writes video.json (scene durations, other fields kept) and out/anchors.js (word times per scene, scene-local).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const FPS = JSON.parse(readFileSync("video.json", "utf8")).fps ?? 60;
const LEAD = 0.55; // a scene starts this long before its first word, so the picture arrives first
const TAIL = Number(process.argv[2] ?? 4.5); // the end card holds this long after the last word: node tools/timeline.mjs [seconds]
const chapters = JSON.parse(readFileSync("chapters.json", "utf8"));
const words = JSON.parse(readFileSync("out/voice/words.json", "utf8")).words;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// One token per word piece, so "Sentinel-2" is two tokens, and a phrase matches across them.
const stream = [];
words.forEach((w, wi) => norm(w.text).split(" ").filter(Boolean).forEach((tok) => stream.push({ tok, wi })));

function find(phrase, from) {
  const t = norm(phrase).split(" ");
  for (let i = from; i + t.length <= stream.length; i++) {
    if (t.every((tok, k) => stream[i + k].tok === tok)) return { word: stream[i].wi, next: i + t.length };
  }
  throw new Error(`phrase not found after token ${from}: "${phrase}"`);
}

const frame = (s) => Math.round(s * FPS) / FPS;
let cursor = 0;
const starts = chapters.map((c, k) => {
  const hit = find(c.start, cursor);
  cursor = hit.next;
  const w = words[hit.word];
  const prevEnd = hit.word > 0 ? words[hit.word - 1].end : 0;
  const t = k === 0 ? 0 : frame(Math.max(prevEnd + 0.15, w.start - LEAD));
  return { ...c, t, word: hit.word };
});
const end = frame(words.at(-1).end + TAIL);
starts.forEach((s, k) => (s.dur = frame((starts[k + 1]?.t ?? end) - s.t)));

const manifest = JSON.parse(readFileSync("video.json", "utf8"));
const old = new Map((manifest.scenes ?? []).map((s) => [s.file, s]));
manifest.scenes = starts.map((s) => ({ ...(old.get(`scenes/${s.id}.html`) ?? {}), file: `scenes/${s.id}.html`, duration: s.dur }));
writeFileSync("video.json", JSON.stringify(manifest, null, 2) + "\n");

const scenes = Object.fromEntries(
  starts.map((s) => [
    s.id,
    {
      start: s.t,
      dur: s.dur,
      words: words
        .filter((w) => w.end > s.t - 1.5 && w.start < s.t + s.dur + 1.5)
        .map((w) => [w.text, +(w.start - s.t).toFixed(3), +(w.end - s.t).toFixed(3)]),
    },
  ]),
);
mkdirSync("out", { recursive: true });
writeFileSync("out/anchors.js", `window.__SCENES = ${JSON.stringify(scenes)};\n`);

const total = starts.reduce((n, s) => n + s.dur, 0);
console.log(`${starts.length} scenes, ${total.toFixed(1)} s total (voice ends at ${words.at(-1).end.toFixed(1)} s)`);
starts.forEach((s) => console.log(`${s.t.toFixed(1).padStart(7)}  ${s.dur.toFixed(1).padStart(5)}  ${s.id}`));

// YouTube chapters: scenes that carry a "chapter" title, as m:ss lines. The first must start at 0:00.
const titled = starts.filter((s) => s.chapter);
if (titled.length) {
  console.log("\nchapters:");
  titled.forEach((s, k) => {
    const t = k === 0 ? 0 : Math.floor(s.t);
    console.log(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} ${s.chapter}`);
  });
}
