# Changelog

What each version adds. `node scripts/video.mjs version` prints the installed one. Versions follow [Semantic Versioning](https://semver.org/): major breaks existing projects, minor adds features, patch fixes.

## [Unreleased]

- VoxCPM2 designs one reference voice from the script's opening (`voiceover.voice.wav`), then speaks one beat per generation instead of one sentence. The voice holds, and the delivery connects.
- `speak --style` steers VoxCPM2's delivery. `--cfg` and `--steps` default to 1.6 and 16, a relaxed read.
- VoxCPM2 voices non-verbal tags (`[sigh]`, `[laughing]`, `[Uhm]`). Captions, the speech check and other engines drop them.
- VoxCPM2 keeps one designed voice across `speak` calls with the same `--voice`, `--seed` and `--language`.
- `doctor` warns when the GPU lacks free memory for VoxCPM2, and `speak` explains an out-of-memory stop.
- Fixed: the pace reading counted silence, so its suggested `--speed` overshot. A pace of 4.5 no longer reads as slow.
- Fixed: "eleven hundred" and "twenty-five hundred" read as 1100 and 2500 in the speech check.
- Fixed: hard consonants no longer count as clicks.
- Fixed: the audit judged appearances by glyph movement, failing cues the renderer placed right.
- Fixed: narrated videos reach the loudness target.
- A word both recognizers miss is marked `ok ?`.
- The pace target is 4.1 syllables per second (3.5 to 4.7), calmer than before. `--pace` or `tts.pace` sets another.
- `voiceover.takes.json` records the voice's seed, so a later run keeps the voice and its re-rolls without `--seed`.
- Fixed: "8GB" matches "gigabytes", and a compound heard as two words ("MMS -TTS") counts as heard.
- `speak` picks the best engine the machine runs when none is named: VoxCPM2 with an NVIDIA GPU of 8 GB and `uv`, else Kokoro. `doctor` names it.

## [1.1.0]

- `speak --model` runs Hugging Face TTS models without ONNX weights in Python on the CPU, such as MMS-TTS in 1,100+ languages.
- `speak --command` speaks phrase by phrase, so pauses and timed scripts work. `--one-call` keeps the single call.
- `references/tts.md`: engines by language and machine, and how to add a voice or model.
- `doctor` names the CPU voices for other languages and their license.
- Fixed: `speak` no longer overwrites a source script that sits at its output path.

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

- Synthesized effects bound to their motion, tuned to a key, a material and an energy arc.
- The user's music, cut to its beats with `beats`.
- One mix: music and effects duck under speech, loudness is normalized, the true peak is held.
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
