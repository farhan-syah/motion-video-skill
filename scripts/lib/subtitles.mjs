// Subtitle files (SRT, WebVTT) as a narration's script: each cue is a phrase with its time in the audio, so a user's
// existing subtitles give both the exact words and where each line is spoken.
import { readFileSync } from 'node:fs';

const isSubtitles = (file) => /\.(srt|vtt)$/i.test(file);

// "00:01:02,500" or "01:02.500" in seconds.
function seconds(stamp) {
  const parts = stamp.trim().replace(',', '.').split(':').map(Number);
  return parts.reduce((t, v) => t * 60 + v, 0);
}

// Cues as [{ start, end, text }], in file order. Markup (<i>, {\an8}) and speaker tags stay out of the text.
export function parseSubtitles(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const words = lines
      .slice(at + 1)
      .join(' ')
      .replace(/<[^>]+>|\{[^}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (words) cues.push({ start: seconds(a), end: seconds(b.trim().split(/\s+/)[0]), text: words });
  }
  return cues;
}

// A time as users write it in a script: "5", "5s", "5 sec", "0:05", "00:00:05", "1:02.5".
const TIME = String.raw`\d+(?::\d{1,2}){0,2}(?:[.,]\d+)?\s*(?:s|sec|secs|seconds?|saat)?`;
const STAMP = new RegExp(String.raw`^\s*[\[(]?\s*(${TIME})\s*(?:(?:-|–|—|to|hingga|sampai)\s*(${TIME}))?\s*[\])]?\s*(?:[:|\-–—.)]\s*|\s+)(.*)$`, 'i');
const toSeconds = (t) => seconds(t.replace(/\s*(?:s|sec|secs|seconds?|saat)$/i, ''));

// A script with rough times, as users write it in a brief: one line per time.
//   0-5s: Korang tahu tak?        [00:05] Kuala Lumpur ni...        10 sec - The end.
// A line without a time continues the line before it. Returns [{ start, end, text }] (end null when not given), or
// null when fewer than two lines carry a time: a plain script.
export function parseTimedScript(text) {
  const cues = [];
  let timed = 0;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (!line.trim()) {
      if (cues.length) cues[cues.length - 1].text += '\n';
      continue;
    }
    const m = STAMP.exec(line);
    // A bare number that starts a sentence ("5 people came") is not a time: a time needs a unit, a colon, a range,
    // brackets, or a separator after it.
    const head = m ? line.slice(0, line.length - m[3].length) : '';
    const marked = m && (/[:s]|sec|saat/i.test(m[1]) || m[2] || /^\s*[[(]/.test(line) || /^[\s\d.,]+[|\-–—.):]/.test(head));
    // A year that opens a line ("1857: …") is not a time: a plain number over 10 minutes needs a colon to be one.
    const plausible = m && (m[1].includes(':') || toSeconds(m[1]) <= 600);
    const looksTimed = marked && plausible && m[3].trim();
    if (looksTimed) {
      timed++;
      cues.push({ start: toSeconds(m[1]), end: m[2] ? toSeconds(m[2]) : null, text: m[3] });
    } else if (cues.length) cues[cues.length - 1].text += `\n${line}`;
    else cues.push({ start: 0, end: null, text: line });
  }
  if (timed < 2) return null;
  for (const c of cues) c.text = c.text.trim();
  return cues.filter((c) => c.text);
}

// A script file's spoken words and, for subtitles, its phrase spans: { text, phrases, targets }. phrases: exact spans
// from subtitles, else null. targets: the times a timed script asks for each line, else null. Time stamps are never
// part of the text.
export function readScript(file) {
  const raw = readFileSync(file, 'utf8');
  if (!isSubtitles(file)) {
    const timed = parseTimedScript(raw);
    return timed ? { text: timed.map((c) => c.text).join('\n'), phrases: null, targets: timed } : { text: raw, phrases: null, targets: null };
  }
  const cues = parseSubtitles(raw);
  if (!cues.length) throw new Error(`${file} holds no subtitle cues ("00:00:01,000 --> 00:00:03,000" lines with text).`);
  return { text: cues.map((c) => c.text).join(' '), phrases: cues };
}
