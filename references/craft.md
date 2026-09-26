# Craft rules and review

`check` enforces the measurable rules. This file holds the thresholds and the visual review that `check` cannot do.

## Thresholds

| Rule                 | Value                                                                                                                                                                | Source                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Graphics-safe margin | 5% per edge                                                                                                                                                          | EBU R 95                                                                         |
| Minimum text         | 28px at 1080p on the short side, measured through every transform. Dips below it last at most 0.6s, during an entrance, exit or zoom-through.                        | Derived: BBC subtitles use 7–8% line height. Phone viewing halves apparent size. |
| Covered text         | Opaque content sits over visible text for at most 0.3s, unless marked `data-overlap-ok`                                                                              | Legibility                                                                       |
| Text collision       | Two texts overlap for at most 0.25s, such as a chip flying past a label. `data-overlap-ok` allows a deliberate overlap for good.                                     | Legibility                                                                       |
| Safe area            | Applies to text at 0.9 opacity or more. Dimmed context can leave it during camera moves.                                                                             | EBU R 95                                                                         |
| Effects density      | At most about one sound effect per beat. At most 4 cues per scene, plus typing: one primary, the rest quiet. A container over 8 children carries `data-sfx-accents`. | Practice. Not sourced.                                                           |
| Opening frame        | Shapes or display type (6% of the short side or larger) cover at least 3% of the frame 0.4 s into each scene. Small labels and captions do not count.                | Practice. Not sourced.                                                           |
| Sound sync           | Contact and appear sounds fall inside their element's motion, at most 60 ms early or 110 ms late. Swells center on peak motion within 150 ms.                        | ITU-R BT.1359: detectable at about 45 ms audio-early, 125 ms audio-late          |
| Small speakers       | Each effect keeps 60% or more of its energy between 150 Hz and 5 kHz                                                                                                 | Laptop and phone speakers roll off below about 150 Hz                            |
| Reading speed        | 3 words/s, and at least 0.8s per text                                                                                                                                | BBC subtitles 160–180 wpm. Netflix minimum event: 20 frames.                     |
| Contrast             | 4.5:1 body, 3:1 for text ≥48px at 1080p                                                                                                                              | WCAG 2.2 SC 1.4.3                                                                |
| Flashes              | At most 3 per second                                                                                                                                                 | WCAG 2.2 SC 2.3.1                                                                |
| Entrance easing      | Decelerate: `--ease-out`, `--ease-emph`                                                                                                                              | Material 3 motion tokens                                                         |
| Exit easing          | Accelerate: `--ease-in`                                                                                                                                              | Material 3 motion tokens                                                         |
| Entrance duration    | 0.5–1.0s for text and props. 0.3–0.5s for exits.                                                                                                                     | Material 3 extra-long tokens, stretched for video                                |
| Stagger              | 0.06–0.12s between siblings                                                                                                                                          | Practice. Not sourced.                                                           |
| Layer order          | Background, then visual, then headline, then support                                                                                                                 | Practice. Not sourced.                                                           |

## Sound audit

`audit` reads `out/cues.json` (written by `render`) and the rendered video:

- **Audio:** it finds onsets by spectral flux.
- **Motion:** it measures frame change inside each cue's element box, with cut frames excluded.
- **Verdict:** each cue is judged by its sound class. Cues on a cut pass as "lands on a cut". A container cue is judged per accent against each child's box, and fails when more than 20% of accents miss.
- **Arc attribution:** a transition pre-lapped across a cut counts toward the scene it leads into.
- **Sound choice:** each cue's intent and material must match the sound catalog. Transient files starting within 100 ms need an explicit layer override.
- **Sound shape:** every recorded source must match its recipe duration, texture class and small-speaker energy. A missing source needs a new render.
- **Rendered audio:** each placed source is matched against the final mix. Missing or masked cues fail, including cues on cuts.
- **Silent motion:** big motion with no sound nearby is listed as INFO, an editorial choice.
- **Arc:** each scene's loudest 400 ms is compared with its planned peak `energy`.
  - **Curves:** each planned peak in an energy curve must play at least 2 dB over the trough beside it. A peak with no sound warns.
  - **Order:** a rank correlation under 0.5 warns.
  - **Payoff:** a peak-energy scene more than 1.5 dB under the loudest scene warns.
- **Edges:** a first or last 40 ms within 6 dB of the programme level fails as a hard start or stop. An effect cut off by the video's end fails.

`out/audit.png` puts frame thumbnails, the waveform, onsets, the motion curve, cuts and each cue's sound and intent on one time axis. Compare every label with the visible action: a false intent label can pass numeric checks.

`sounds` profiles every effect (length, peak, RMS, spectral centroid, noisiness, small-speaker energy share) and exits with an error when a recipe loses its declared shape. Run it after editing a recipe. Numbers cannot judge whether a sound feels natural: listen when playback is available, and report when it was not.

### Changing a sound recipe

Recipes live in `scripts/lib/sound-catalog.mjs`, synthesis primitives and materials in `scripts/lib/sound-synth.mjs`, keys in `scripts/lib/sound-tuning.mjs`. After any change, run from the skill folder:

```
node scripts/dev/render-sounds.mjs /tmp/sound-review
uv run scripts/dev/sound-review.py /tmp/sound-review
```

It renders every form a video can produce (variants, both pitch ends, both span ends, every material, a minor key) and checks each:

| Check                      | Fails above                 | Catches                                                                                              |
| -------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sharpness (loudest 100 ms) | 2.6 acum                    | Harsh, piercing tone                                                                                 |
| Energy above 8 kHz         | −10 dB of the whole         | Hiss and fizz                                                                                        |
| Last 5 ms                  | −20 dB of the loudest 50 ms | A sound cut off instead of finished. Builds that stop on their cue are exempt.                       |
| True peak                  | −1 dBTP                     | Clipping                                                                                             |
| Recognizability            | warns above rank 10         | An audio-text model (LAION CLAP) no longer hears the sound as its `says` description in `SOUND_META` |

It exits 1 on any failing limit. Fix every failure and warning before committing a recipe. `--no-model` skips recognizability. The review needs `uv`, and its first run downloads PyTorch and the model (several GB). The video pipeline stays Node-only.

## Visual review

Open each scene's sheet from `check --scene N` (in `out/stills/`) with Read. Fix each frame that fails a row:

| Look for                                                                                     | Fix                                                                                                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Two things fighting for attention                                                            | One focal point per frame. Dim or shrink the rest.                                                                 |
| Dead frame: nothing moves                                                                    | Give the content an action or idle loop. Push slowly only on a held static image.                                  |
| Every beat has the same layout                                                               | Pick each beat's composition from `concepts.md`: giant type, big number, collage, UI demo, split, and more.        |
| Every scene zooms or pushes in                                                               | Hold the camera still where the content moves. Keep pushes for static images and deliberate moves.                 |
| Two families in one line look mismatched: one word reads smaller, thinner or like a footnote | Match x-height and weight, set the odd word larger, or keep the line in one family.                                |
| A sound bigger or smaller than its moment on screen                                          | Match the sound's weight and length to the size and speed of what moves.                                           |
| Headline or caption swims with the camera                                                    | Move it to the `.hud`. If it belongs to the world, mark its wrapper `data-world`.                                  |
| Headline jumps position between chapter scenes                                               | Use one `.hud` slot for every chapter headline.                                                                    |
| Opening is empty or only chrome (a small label, a thin line)                                 | Bring the beat's subject in at the cut, whether giant type or an object: a negative `--t` entrance or a match cut. |
| Placeholder shape where the product's real artifact belongs                                  | Rebuild the real UI, file or output it stands for.                                                                 |
| Empty area over a third of the frame with no purpose                                         | Scale the hero up, or bring the camera closer.                                                                     |
| Misaligned edges                                                                             | Snap to the grid or to a shared edge.                                                                              |
| Flat look                                                                                    | Add depth: shadow, overlap, parallax, light pool, grain.                                                           |
| Text on busy background                                                                      | Put a surface card behind it.                                                                                      |
| Style drift between scenes                                                                   | Reuse the same tokens, radii, shadows and camera language.                                                         |
| Rebuilt UI looks unlike the reference                                                        | Compare side by side. Match colors, radii and spacing.                                                             |
| Motion peaks off the beat                                                                    | Move the cue to the nearest beat from `beats.json`.                                                                |

Also check one frame mid-entrance with `still <t>`: it shows overlaps a resting frame hides.

## Final pass

- **Sheet:** `render` writes `out/sheet.png`. Open it.
- **Opening:** the first frame works as a thumbnail: the subject or title readable as a still, not a blank, a logo or chrome. By 3 s, a stranger knows what the video is about.
- **End card:** it holds long enough to read, and the video ends on it.
