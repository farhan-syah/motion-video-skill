// Renders every effect the catalog can produce into one folder, for the developer sound review.
// Usage: node scripts/dev/render-sounds.mjs <out-dir>
// Writes <out-dir>/<label>.wav and <out-dir>/sounds.json ({ label: { sound, says, texture, form, endsOnCue } }).
//   form: variant, pitch, span, material or key. The review judges every form against the same limits.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MATERIAL_AWARE, MATERIALS, PITCH_RANGE, SOUND_META, SOUNDS, SPAN, SPANNING, soundFile } from '../lib/sfx.mjs';
import { parseKey } from '../lib/sound-tuning.mjs';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/dev/render-sounds.mjs <out-dir>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const index = {};
const put = (label, sound, form, file) => {
  copyFileSync(file, join(out, `${label}.wav`));
  const m = SOUND_META[sound];
  // A build (riser, reverse, drone) stops on its cue, under the hit it leads into: its end is not judged as a cut-off.
  const endsOnCue = SOUNDS[sound].anchor === 'peak' && SOUNDS[sound].release != null;
  index[label] = { sound, says: m.says, texture: m.texture, form, endsOnCue };
};

const minor = parseKey('A minor');
for (const name of Object.keys(SOUNDS)) {
  const s = SOUNDS[name];
  for (let v = 0; v < 4; v++) put(`${name}_v${v}`, name, 'variant', soundFile(name, { variant: v }));
  if (SPANNING.has(name)) {
    const [lo, hi] = SPAN[name].span;
    put(`${name}_short`, name, 'span', soundFile(name, { dur: lo }));
    put(`${name}_long`, name, 'span', soundFile(name, { dur: hi }));
  } else if (!s.fixedPitch) {
    put(`${name}_low`, name, 'pitch', soundFile(name, { pitch: PITCH_RANGE[0] }));
    put(`${name}_high`, name, 'pitch', soundFile(name, { pitch: PITCH_RANGE[1] }));
  }
  if (s.tune) put(`${name}_aminor`, name, 'key', soundFile(name, { key: minor }));
  if (MATERIAL_AWARE.has(name)) for (const material of Object.keys(MATERIALS)) put(`${name}_${material}`, name, 'material', soundFile(name, { material }));
}
writeFileSync(join(out, 'sounds.json'), JSON.stringify(index, null, 1));
console.log(`${Object.keys(index).length} sounds in ${resolve(out)}`);
