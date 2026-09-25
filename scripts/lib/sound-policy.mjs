import { MATERIALS, SOUND_META, SOUNDS, soundLead } from './sfx.mjs';

// Compare the visible event declared by each cue with the sound catalog.
export function cueSoundErrors(cues, timeOf) {
  const errors = [];
  const transients = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const meta = SOUND_META[cue.sound];
    if (cue.problem || cue.volume === 0) continue;
    if (!meta) {
      if (SOUNDS[cue.sound]) errors.push({ index: i, message: `"${cue.sound}" has no intent or texture metadata. Add it to SOUND_META before rendering.` });
      continue;
    }
    if (!cue.intent) {
      errors.push({ index: i, message: `${cue.target} needs data-sfx-intent for "${cue.sound}". Name its visible action, or mark its material.` });
    } else if (!meta.intents.includes(cue.intent)) {
      errors.push({ index: i, message: `"${cue.sound}" on ${cue.target} does not match intent "${cue.intent}". Use a sound whose intent matches the visible action.` });
    }
    // A struck material (wood, glass, ...) only recolors a sound. Paper is a material that is also a sound.
    if (cue.material && cue.materialBinds !== false && !MATERIALS[cue.material] && !meta.intents.includes(cue.material)) {
      errors.push({ index: i, message: `"${cue.sound}" on ${cue.target} does not match material "${cue.material}". Use a sound that matches the marked material, or give the cue its own data-sfx-intent.` });
    }
    if (meta.transient && cue.layer !== 'allow') {
      const start = Number.isFinite(cue.start) ? cue.start : timeOf(cue) - soundLead(cue.sound, cue.anchor, cue.params);
      transients.push({ cue, index: i, time: start });
    }
  }
  transients.sort((a, b) => a.time - b.time);
  for (let i = 1; i < transients.length; i++) {
    const previous = transients[i - 1];
    const current = transients[i];
    if (current.time - previous.time >= 0.1) continue;
    errors.push({ index: previous.index, message: `"${previous.cue.sound}" on ${previous.cue.target} starts within 100 ms of "${current.cue.sound}" on ${current.cue.target}. Separate the impacts or mark a deliberate layer.` });
  }
  return errors;
}

// Compare each recorded source with its own recipe and expected texture.
// expected: the length this cue was rendered at (dynamic sounds follow their motion); defaults to the recipe length.
// struck: the material a contact was rendered in. src: a user file. Both change the texture, so it is not judged.
export function soundProfileErrors(name, profile, expected, { struck = null, src = null } = {}) {
  const sound = SOUNDS[name];
  const meta = SOUND_META[name];
  if (!sound || !meta) return [`No sound design metadata exists for "${name}".`];
  const errors = [];
  const d = expected ?? sound.d;
  if (Math.abs(profile.duration - d) > 0.012) errors.push(`"${name}" lasts ${profile.duration.toFixed(2)}s; this cue was rendered at ${d.toFixed(2)}s. Render again.`);
  const texture = struck || src ? 'mixed' : meta.texture;
  if (texture === 'noise' && profile.flatness < 0.1) errors.push(`"${name}" is too tonal for its noise texture.`);
  if (texture === 'tone' && profile.flatness > 0.2) errors.push(`"${name}" is too noisy for its tonal texture.`);
  if (profile.speakerShare < 0.6) errors.push(`"${name}" loses too much energy on small speakers.`);
  return errors;
}
