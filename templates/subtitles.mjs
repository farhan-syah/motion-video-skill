// English subtitles from the narration word times. Copy to tools/ in the project.
//   node tools/subtitles.mjs
// Reads  out/voice/words.json. Writes out/subtitles.srt and out/subtitles.vtt.
// A cue holds at most two lines of 42 characters. It breaks at a sentence end first, then at a comma, then at the
// character limit, and stays on screen at least 1 s and at most 6 s.
import { readFileSync, writeFileSync } from "node:fs";

const words = JSON.parse(readFileSync("out/voice/words.json", "utf8")).words.filter((w) => w.text.trim());
const LINE = 42, MAX_LINES = 2, MIN = 1.0, MAX = 6.0, LEAD = 0.08, TAIL = 0.25;

const cues = [];
let cur = [];
const textOf = (ws) => ws.map((w) => w.text).join(" ");
const flush = () => { if (cur.length) cues.push(cur); cur = []; };
for (const w of words) {
  const next = [...cur, w];
  const tooLong = textOf(next).length > LINE * MAX_LINES || (cur.length && w.end - cur[0].start > MAX);
  const gap = cur.length && w.start - cur[cur.length - 1].end > 0.9;
  if (tooLong || gap) flush();
  cur.push(w);
  const len = textOf(cur).length;
  if (/[.?!]["”)]?$/.test(w.text)) flush();
  else if (/[,;:]$/.test(w.text) && len > LINE * 0.6) flush();
}
flush();

// Wrap a cue's text into balanced lines.
function wrap(s) {
  if (s.length <= LINE) return [s];
  const ws = s.split(" ");
  let best = null;
  for (let k = 1; k < ws.length; k++) {
    const a = ws.slice(0, k).join(" "), b = ws.slice(k).join(" ");
    if (a.length > LINE || b.length > LINE) continue;
    const score = Math.abs(a.length - b.length);
    if (!best || score < best.score) best = { score, lines: [a, b] };
  }
  return best ? best.lines : [s];
}

const ts = (t, sep) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0"), m = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0"), r = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s}${sep}${r}`;
};

const rows = cues.map((c, i) => {
  const start = c[0].start - LEAD;
  let end = Math.max(c[c.length - 1].end + TAIL, start + MIN);
  const nextStart = cues[i + 1] ? cues[i + 1][0].start - LEAD : Infinity;
  end = Math.min(end, nextStart - 0.04);
  return { start, end, lines: wrap(textOf(c)) };
});

writeFileSync("out/subtitles.srt", rows.map((r, i) => `${i + 1}\n${ts(r.start, ",")} --> ${ts(r.end, ",")}\n${r.lines.join("\n")}\n`).join("\n"));
writeFileSync("out/subtitles.vtt", "WEBVTT\n\n" + rows.map((r) => `${ts(r.start, ".")} --> ${ts(r.end, ".")}\n${r.lines.join("\n")}\n`).join("\n"));
console.log(`${rows.length} cues, last ends ${rows[rows.length - 1].end.toFixed(1)} s`);
