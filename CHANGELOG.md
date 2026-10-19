# Changelog

All notable changes to this skill are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.0] - 2026-10-19

### Added

- `references/delivery.md`, Listing text and covers: one text file per video, a series title form, two hashtag lists, chapters, and one cover template for a series. It names the vertical safe zones and how to split a long film into standalone parts.
- `templates/timeline.mjs`, `templates/words.js` and `templates/subtitles.mjs`: scene timing from the narration's words, the `at()` and `data-w` anchors, SRT and VTT files, and YouTube chapter lines. See `references/narration.md`, Scenes that follow the narration.
- `video.json` `"outDir"`: the output folder, relative to the manifest, default `out`. Several manifests can share one project directory, each with its own frame cache, check stamp and outputs. The default `output` is `<outDir>/video.mp4`.

### Changed

- `render --draft` writes `out/draft.mp4`, never the master. The thumbnail and the compressed copy come from a full render only.
- `check` keeps text in a 9:16 frame clear of the platform bands: the top 170 px and bottom 480 px of 1920.
- `templates/ui.css` lifts captions to 28% from the bottom in a tall frame, clear of the platform bands.
- `SKILL.md` picks the platform output in Direct (step 4), not at Deliver.
- The sound system moved from `references/building.md` to `references/sound.md`. Each duplicated rule has one owner file, and `SKILL.md` keeps routing only.
- `templates/tts-elevenlabs.mjs` needs `ELEVEN_VOICE`, pauses 0.8 s at a blank line like `speak`, and keeps no project name in its messages.

### Fixed

- `references/delivery.md` said the `-compressed.mp4` copy is 1080p. It keeps the master's size.

## [1.6.0] - 2026-10-19

### Added

- `render --capture png|jpeg`: JPEG q92 frames in a full-quality render. About 35% faster than PNG, files about 50% larger. Default `png`.
- `references/delivery.md`: the output per platform (ratio, size, fps, upload copy), YouTube 1440p and HEVC rules, and screen recording for footage. `SKILL.md` asks for the platform and for captions, and routes to it.
- `references/tts/elevenlabs.md` and `templates/tts-elevenlabs.mjs`: ElevenLabs narration as one cached take per piece, with exact silence, a section pause, fades, a tail-level retry, and `eleven_v4` as the default model. It records the breath finding for `eleven_multilingual_v2`.
- `references/narration.md`, Joining takes: exact silence, a pause at section changes, fades, tail checks and ear punctuation for any engine that gives separate takes. Captions are asked first and left out of text-heavy videos.
- `references/direction.md`, Teaching films: aspirational tone, one worked example, no disclaimer framing, spoken-name and copy audits.
- `references/building.md`, Frame determinism: fixes for "Pixels change on real time".

### Changed

- `render` runs one Chromium per worker, not one for all pages. One Chromium serialises screenshot encoding, so PNG capture stayed near 15 fps at any page count. Measured on a 24-thread machine at 2560x1440: 8 pages in one browser 14.7 fps, 8 browsers 56.7, 12 browsers 68.1. The default `--jobs` cap rises from 8 to 12.

### Fixed

- `render --scale` produced frames at the manifest size. The capture clip now carries the scale, so `--scale 1.3333334` gives 2560x1440.

## [1.5.0] - 2026-10-11

### Added

- `check` warns when a visible element in scene 1 is still entering at frame 0, the thumbnail, and names how far through its entrance it is. It reads each animation's computed timing, so a custom `--in-dur` and a stagger count.
- `speak` warns when it designs a voice from an opening of fewer than 25 words: the reference is short and holds the voice loosely.
- The setup notes say when `uv` is needed: only for the skill's Python runner, which runs VoxCPM2 without a CUDA `blazr` and `--model` voices with PyTorch-only weights.

### Changed

- The scene template starts its hero and HUD line a full entrance early (`--t: calc(-1 * var(--in-dur, var(--dur-in)))`), so frame 0 of the opening scene shows them at rest. Later scenes keep `-0.2s`, which cuts mid-entrance.
- The palette is written once, in `:root` of `base.css` (and `--surface` and `--on-accent` in `ui.css`), dark or light. `class="light"` switches only grain and surface shadows. The old light values wait in a comment as a ready light palette. A scene that relied on `class="light"` for its colors must paste that palette into `:root`.
- `check` tests each cue's sound against the narration over the window `audit` measures: from its start, lead-in included, over its first 80-300 ms. Typing cues and each container accent are tested too. One shared function sets the window for both commands.
- `<skill-dir>` is defined once: the absolute path of the directory `SKILL.md` loaded from.
- The speech check summary counts the parts marked `ok ?`, with their part numbers and kinds. It no longer says every phrase was heard back as written when some need a listen. The exit code stays 0.
- A VoxCPM2 stray pause advises `--reroll`, not a comma: any edit to the text draws the whole part again. Each stray pause counts against a take, so retries and re-rolls keep the take with fewer.
- `speak` and `transcribe` run in `blazr` (https://github.com/ml-rust/blazr) when version 0.1.2 or newer, built with the `audio` feature, is installed. Flags, outputs and exit codes stay the same. The config key `"blazr"` names the binary, and `"blazr": false` turns it off. A configured `blazr` that cannot run the command is an error. When `blazr` is missing, too old, or exits 3, the skill's own runner speaks or transcribes as before. With a CUDA `blazr`, VoxCPM2 needs no `uv`.
- The developer sound review runs in `blazr sound-review <dir> [--no-model]`, with no `uv` or PyTorch. `scripts/dev/sound-review.py` stays.
- `building.md` says what `--out-t` counts: seconds from the scene's start, the clock `--t` uses. An exit still running at the cut is cut mid-way, since the next scene and the end card open on their own frame 0.
- The workflow step that runs `init` says it writes a placeholder `scenes/01-hook.html` and a one-scene `video.json` to replace.
- `narration.md` sends a doubtful name in a VoxCPM2 take to `--reroll` first, up to 3 times. A spoken form draws the whole part again, so it comes only when the re-rolls still miss the name.

### Fixed

- A plain `.tile` draws its icon in `--tile-ink`, `--on-accent` by default, so the icon reads on the accent of a dark or a light palette. A brand `--tile` sets its own `--tile-ink`.
- `cli.md` and `--help` match what `render` does: a render of the whole video, draft or not, runs `audit` and writes `out/sheet.png`, `out/thumbnail.png` and `out/stems/`. Only a non-draft render writes the compressed copy.
- `SKILL.md` no longer sends a render's review to a second `audit` run: `render` already ran it. A sound-only fix needs `render` again.
- `tts.md` no longer says every Hugging Face model needs `uv`. Only PyTorch-only weights do.
- The near-empty-opening advice in `check` no longer pushes scene 1 to a mid-entrance frame 0.
- `check` no longer crashes on text over a `color-mix()` fill, such as the default card. It reads every computed color as sRGB.
- `render --scene` on a one-scene video runs `audit` and writes `out/sheet.png`, as a render of the whole video does.
- `check` no longer reports caption words in a `.hud` as screen text that drifts with the camera. It matched text across frames by its place in the page, and each caption line replaces its words, so it compared different words, some mid-pop. A caption track is one box now, measured by the block that holds it, and every text element keeps its own track across frames.
- `.chip` text mixes its color with `--fg`, not black, so it passes the contrast rule on the dark and the light palette. `.tile.soft` tints toward `--bg` and `--fg` the same way: on the dark palette its icon was light gray on near-white.
- A caption line that shows at video time 0 opens at rest, so frame 0, the thumbnail, never shows it dim mid-pop. A project made earlier keeps its own `motion.js`: copy the template's over it.

## [1.4.1] - 2026-09-27

### Fixed

- VoxCPM2 takes its pace from the reference alone. The guide, `narration.md` and the pace line no longer suggest pace words in `--style` or a note: on top of the slow reference they skewed the voice and dragged words out. A take outside the range needs another reference or `--seed`.

## [1.4.0] - 2026-09-27

### Added

- `check` warns when a text's outline is nearly its fill's color, which fills in the letters.
- `speak` polishes a generated voice: loudness evened per sentence, gentle compression, de-essing, then the whole voice normalized to a -1 dB peak. It never changes the pace. `--raw` skips it.
- `render` writes each audio layer to `out/stems/`: voice, music and effects, as they sit in the mix.
- `speak --hifi` clones VoxCPM2 from the reference and its exact transcript. A designed voice saves the words it was designed on.
- `speak --written FILE` pairs the ear script with a written one. The voice speaks the ear script's pauses. Captions and `transcribe` show the written script's punctuation. Scripts whose words differ stop `speak` before any audio, with exit code 2.

### Changed

- Before VoxCPM2 clones a reference, the breaths in its pauses are turned down by 20 dB, a thin reference's bass is lifted, and the reference is compressed gently, then normalized to a -1 dB peak. Clones no longer take on a breathy manner. A user's recording is cloned from a copy, and the recording is never changed. A voice `speak` prepared itself, passed back as `--reference`, is used as it is.
- A designed VoxCPM2 voice speaks its opening again, calm and natural at a slow pace, and that becomes the reference. Clones follow the reference's pace and manner. The first design stays in the cache as `voice-<key>.design.wav`.
- VoxCPM2 is never time-stretched: `--speed` and `tts.speed` are ignored for it, with a warning. The pace line points to `--style` and every delivery note. A stretch turned the voice's faint crackle in an "s" into audible static.
- VoxCPM2 speaks the whole script as one take (a line with a delivery note is its own take, and a script over 700 words splits), then sets the silence at each blank line and `[pause]` mark. A failing take is spoken again by beats, then by sentences.
- VoxCPM2 phrase spans are per sentence.
- The pitch-swing check runs per sentence and skips questions, sentences under 0.8 s of voicing and octave errors.
- `narration.md` covers punctuating a script for the ear, with before-and-after examples of where a spoken sentence breathes.
- How long each punctuation mark pauses is documented per engine, measured on VoxCPM2 and Kokoro. A script for text to speech is written after reading the engine's guide.
- `speak --review` flags a missing breath after an opening word, sentences of 9 words or more with no breath, and with VoxCPM2 a question without its own line and delivery note.
- `narration.md` lists the devices spoken narration uses.
- The VoxCPM2 guide states how delivery notes behave and what makes a read flat or expressive, with a directed example.
- `--reroll`: a fresh take that passes as well as the earlier one replaces it.
- `speak`'s `ok ?` lines name the part number `--reroll` takes.

### Fixed

- The docs and cloning guidance name the voice that can be cloned: the user's own, or one they have consent to use.
- A dash or ellipsis standing alone counts as a break in the stray-pause check.
- VoxCPM2 repairs a click or a thump in a take in place instead of speaking the take again. A click left after the repair is marked `ok ?`. A designed voice's reference is repaired the same way.
- The click check counts only a spike in a pause. Inside speech it had flagged /t/ bursts as clicks.

## [1.3.0] - 2026-09-26

### Added

- `speak` flags a VoxCPM2 part whose pitch swings far above the voice's usual pitch.
- `{written|spoken}` script syntax: captions show the written form, and the voice says the spoken form.
- `doctor` says when a sandbox may hide the browser and the GPU.
- `speak --review` lists what a voice is likely to misread in a script, before any audio. `speak` prints the same review first.
- `speak` flags a pause where the script has no break.
- The sound intent error names the intents the sound fits and the sounds that fit the intent.

### Changed

- The VoxCPM2 guide states how delivery notes and energy words change the voice.
- Palette rules name where a generated palette drifts, and ask for three candidate palettes before choosing one.

### Fixed

- `narration.md` states the file names `transcribe` writes.
- `transcribe` drops words a recognizer invents in digital silence.
- The audit measures an appearance over the element's whole box, so text scaling into place no longer marks a correctly placed sound as early.
- The palette guidance no longer gives genre example palettes.

## [1.2.0] - 2026-09-26

### Added

- `speak --style` sets the VoxCPM2 delivery for the whole script.
- Delivery notes at the start of a script line set the VoxCPM2 delivery for that line.
- VoxCPM2 non-verbal tags (`[laughing]`, `[sigh]` and the other recommended tags) in scripts.
- `speak --cfg` and `--steps` for VoxCPM2.
- `speak --pace` and the `tts.pace` config key set the pace target.
- `speak` writes the designed VoxCPM2 voice to `<out>.voice.wav`.
- `speak` de-esses generated speech.
- Engine guides in `references/tts/`: VoxCPM2, Kokoro, Hugging Face models and the user's own TTS.
- `doctor` warns when free GPU memory is under 8 GB.
- `render` writes frame 0 as `out/thumbnail.png`.
- `speak` reports how much de-essing it applied.
- Direction and craft rules for the opening: the subject is named in the first 3 s, and frame 0 works as a thumbnail.

### Changed

- `speak` picks the best engine the machine runs when none is named: VoxCPM2 with an NVIDIA GPU of 8 GB and `uv`, else Kokoro.
- VoxCPM2 designs one reference voice from the script's opening, then speaks one beat per generation.
- A VoxCPM2 voice is reused across `speak` calls with the same `--voice`, `--seed` and `--language`.
- `voiceover.takes.json` records the voice's seed. A later run without `--seed` keeps the voice and its takes.
- VoxCPM2 defaults to cfg 1.6 and 16 steps.
- Pace target is 4.1 syllables per second, with a range of 3.5 to 4.7.
- Pace is measured over sounding speech only.
- `references/tts.md` covers only what applies to every engine.
- A word both recognizers miss is marked `ok ?`.
- Narrated mixes always reach the loudness target.
- `speak` explains a VoxCPM2 out-of-memory stop.
- A VoxCPM2 part's first seed comes from its text, not its position.
- `--scene N` matches the number a scene's file name starts with.

### Removed

- MMS-TTS recommendations in `doctor`, `speak` and the docs: its license bars commercial use.

### Fixed

- Numbers such as "eleven hundred" read as 1100 in the speech check.
- Data units (GB, MB, GHz) match their spoken words in the speech check.
- Words the recognizer splits apart rejoin in the speech check.
- Hard consonants no longer count as clicks.
- The audit judges an appearance sound by the element's fastest change, not by glyph movement.

## [1.1.0] - 2026-09-26

### Added

- `speak --model` runs Hugging Face TTS models without ONNX weights in Python on the CPU.
- `speak --one-call` runs a TTS command once for the whole script.
- `references/tts.md`: engines by language and machine, and how to add a voice or model.
- `doctor` lists CPU voices for other languages and their license.

### Changed

- `speak --command` runs the command once per phrase.

### Fixed

- `speak` no longer overwrites a source script at its output path.

## [1.0.0] - 2026-09-26

### Added

- Workflow from brief to video: sweep, gather facts, ask, direct, build, check, render, review, deliver.
- Facts from the user's material first, with sources for every claim on screen.
- Three concepts per video, with the strongest chosen.
- Reference videos lend format and devices.
- Scenes in HTML, CSS and SVG with a seek contract for frame-exact rendering.
- Kit: entrances and exits, UI parts, Lucide icons, atmospheres, 3D worlds, leader lines, counters, typing, drawn strokes, word splits.
- `font`, `lib` and `footage` commands.
- `map`: countries, highlights, pins and routes from Natural Earth or GeoJSON.
- Synthesized sound effects bound to motion, with key, material and energy arc.
- `beats` for the user's music.
- Mix with ducking, loudness normalization and a true-peak limit.
- Narration from a recording, a script, a timed script or subtitles.
- `speak`: Kokoro, VoxCPM2, transformers.js models and TTS commands, with pause marks, `--speed`, a pace report, a speech check, cached takes and `--reroll`.
- `transcribe`: word timing from a local Whisper model.
- Word-synced captions and `data-say` sync.
- `check`: text size, contrast, reading time, overlap, safe area, timing and narration sync.
- `audit`: sound sync, masking under speech and the sound arc.
- Rendering on GPU or CPU, draft renders, parallel pages and cached frames.
- Master MP4 and `-compressed.mp4` copy.
- `doctor`, `version` and `update` commands.

[unreleased]: https://github.com/farhan-syah/motion-video-skill/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/farhan-syah/motion-video-skill/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/farhan-syah/motion-video-skill/releases/tag/v1.0.0
