# Changelog

All notable changes to this skill are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `doctor` says when a sandbox may hide the browser and the GPU.

### Changed

- Palette rules name where a generated palette drifts, and ask for three candidate palettes before choosing one.

### Fixed

- `transcribe` drops words a recognizer invents in digital silence.
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

[unreleased]: https://github.com/farhan-syah/motion-video-skill/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/farhan-syah/motion-video-skill/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/farhan-syah/motion-video-skill/releases/tag/v1.0.0
