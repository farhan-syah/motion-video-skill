# Changelog

What each version adds. `node scripts/video.mjs version` prints the installed one. Versions follow [Semantic Versioning](https://semver.org/): major breaks existing projects, minor adds features, patch fixes.

## [Unreleased]

## [1.0.0]

First release.

**Direction**

- Workflow from brief to video: sweep, gather facts, ask when it matters, direct, build, check, render, review, deliver.
- Facts come from the user's material first, and research fills only the gaps. Every claim on screen has a source.
- Three concepts per video, then the strongest: story shape, world, compositions, copy system and sound.
- A reference video lends its format and devices. Its look is copied only when asked.

**Building**

- Scenes in HTML, CSS and SVG, with a seek contract so every frame renders exactly.
- Kit: entrances and exits, UI parts, 1854 Lucide icons, atmospheres, 3D worlds, leader lines, counters, typing, drawn strokes, word splits.
- Any Fontsource family with `font`. GSAP, Three.js and Lottie with `lib`. Supplied footage with `footage`.
- `map`: countries, highlights, pins and routes from Natural Earth, or precise GeoJSON. Map parts animate, and colors follow the scene palette.

**Sound**

- Synthesized effects bound to the motion that makes them: pops, hits, whooshes, strokes, UI sounds and more, tuned to a key, a material and an energy arc.
- The user's music, cut to its beats with `beats`.
- Voice, music and effects mix together. Music and effects duck under speech, loudness is normalized, and the true peak is held.
- Under narration, effects sit in pauses and never on a word.

**Narration**

- Any source: a recording (audio or video), a script (plain or with times per line), or subtitles (`.srt`, `.vtt`). The user's words and voice are used as given.
- `speak`: local text to speech with Kokoro (English), VoxCPM2 (30 languages, voice design and cloning), any transformers.js model, or any TTS command.
- Pacing from line breaks and `[pause]` marks, `--speed`, and a pace report.
- A speech check on every take: extra speech, missing words, and numbers. Failed phrases regenerate, takes are cached, and `--reroll` redraws one phrase.
- `transcribe`: word timing from a local Whisper model, on the script's exact words.
- Word-synced captions, and `data-say` sync between on-screen text and speech.

**Checks and output**

- `check`: text size, contrast, reading time, overlap, safe area, timing, and narration sync, with a still sheet per scene.
- `audit`: each sound against its motion, masking under speech, and the sound arc.
- Frame-exact rendering on GPU or CPU, drafts at half size, parallel pages, and cached frames.
- A master MP4 and a `-compressed.mp4` copy for chat apps and uploads.

**Setup**

- `doctor`: the machine, speech engines, models and the user's files, before directing.
- `version` and `update`. Models on disk are used before any download. Everything runs locally.
