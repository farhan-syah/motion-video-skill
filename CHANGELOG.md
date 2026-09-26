# Changelog

All notable changes to this skill are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `speak` polishes a generated voice sentence by sentence: pace and loudness evened, then de-essing. `--raw` skips it.
- `render` writes each audio layer to `out/stems/`: voice, music and effects, as they sit in the mix.
- `speak --hifi` clones VoxCPM2 from the reference and its exact transcript. A designed voice saves the words it was designed on.

### Changed

- VoxCPM2 speaks the whole script as one take, then sets the silence at each blank line and `[pause]` mark. A failing take is spoken again by beats, then by sentences.
- VoxCPM2 phrase spans are per sentence.
- The pitch-swing check runs per sentence and skips questions, sentences under 0.8 s of voicing and octave errors.
- `narration.md` covers punctuating a script for the ear: what a comma, period, ellipsis, dash and question mark do to the voice.
- `speak --review` flags sentences over 14 words with no inner punctuation, and with VoxCPM2 a question without its own line and delivery note.
- `narration.md` lists the devices spoken narration uses, and the VoxCPM2 guide states what makes a read flat or expressive.
- The VoxCPM2 guide states how delivery notes behave, with an example of a script directed where it turns.

### Fixed

- A dash or ellipsis standing alone counts as a break in the stray-pause check.
- A click in a take is repaired in place before the take is judged, instead of failing the take.

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

[unreleased]: https://github.com/farhan-syah/motion-video-skill/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/farhan-syah/motion-video-skill/releases/tag/v1.0.0
