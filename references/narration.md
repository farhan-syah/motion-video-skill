# Narration: voice, timing and captions

A narrated video is timed to its words. The voice comes first, then its word timings, then the picture and the captions follow them.

## Choose the voice

| Situation | Use |
|---|---|
| The user supplied a recording | That recording. Never replace a person's voice with TTS. |
| The user supplied a script, or asked for narration, in English | `speak` with the default engine, or the user's configured engine |
| Narration in another language, or a better voice than the default | VoxCPM2 when `doctor` reports it available. Otherwise the user's own TTS: the engine in their config, `--command`, or `--model`. With none, ask which TTS they use, or for a recording. Never narrate in a language the chosen voice cannot speak. |
| No narration asked | None. On-screen text carries the copy. A `data-captions` track needs speech to follow. |

- **Voice choice:** pick one voice for the whole video, matched to the subject and the audience.
- **Script first:** write the script before any audio. Every fact in it comes from the gathered facts (`direction.md`, §0).
- **Pace:** about 2.5 words per second reads naturally in a short explainer. The video length follows the narration.

## Text to speech

`speak script.txt` writes `assets/voiceover.wav` and the script beside it (`assets/voiceover.txt`). Then set `"voiceover": { "file": "assets/voiceover.wav", "script": "assets/voiceover.txt" }`.

| Engine | How | Fits |
|---|---|---|
| Kokoro (default) | `speak script.txt [--voice af_heart] [--speed 1]` | English, local, no setup. American voices `af_*`, `am_*`; British `bf_*`, `bm_*`. |
| VoxCPM2 | `speak script.txt --engine voxcpm [--voice "(A warm, calm male narrator)"] [--reference voice.wav]` | 30 languages (including Malay, Indonesian, Thai, Chinese, Arabic), 48 kHz, a voice described in words or cloned from a recording. Needs an NVIDIA GPU with 8 GB, and `uv` for its Python environment. |
| Any transformers.js TTS model | `speak script.txt --model Xenova/mms-tts-eng` | A Hugging Face model with ONNX weights, run locally |
| Any TTS the user runs | `speak script.txt --command "piper --model voice.onnx --output_file {out} < {text_file}"` | Other languages, cloned or premium voices, cloud services |

- **Command placeholders:** `{text}` (the script, quoted for the shell), `{text_file}` (a file holding it), `{out}` (the audio file the command writes, any format ffmpeg reads), `{voice}` and `{reference}` (a recording to clone). The output becomes 48 kHz mono WAV.
- **VoxCPM2 voice:** `--voice` describes it in words, in any language. `--reference` clones a recording, only with the speaker's consent. One voice holds across the script: later sentences clone the first.
- **VoxCPM2 model:** a checkpoint already on disk loads offline: `"tts": { "checkpoint": "/path" }` in the config, else a complete copy in the model folder or the Hugging Face cache. With none, the first run downloads about 4.7 GB. `doctor` names the checkpoint it found.
- **A quantized model (GGUF):** the runner that reads it goes in `--command`, in the shape `"<runner> --gguf /models/voxcpm2-q6_k.gguf --text {text} --ref {reference} --out {out}"`, with that runner's own flags.
- **Numbers in other languages:** write them as words ("sembilan belas lima puluh"), since a voice can read digits in English. Recognition can mishear digits too.
- **Defaults:** set once in `~/.config/motion-video/config.json`: `{ "tts": { "engine": "voxcpm", "voice": "(…)" } }`, `{ "tts": { "command": "…" } }`, or `{ "tts": { "model": "…", "voice": "…" } }`. Flags override it.
- **Models:** a copy on disk is used first, else a download once into the model folder (`cli.md`, Setup).

## Time the picture to the words

1. **Transcribe:** run `transcribe`. It prints every spoken word at its video time, from a local Whisper model, and writes the whole video's words to `out/voice/words.json`. With a known script (`voiceover.script`, a scene's `script`, or `--script`), the words come from the script, on the recognized timings. The first run installs the speech runtime (about 500 MB).
2. **Plan to it:** in `direction.md`, give each beat the words it plays under, and place cuts in pauses between phrases.
3. **Time to it:** set each entrance's `--t` from the word times: a line lands about 0.2 s before its first word, a verb moment on its word.
4. **Mark it:** give every on-screen line that repeats the narration `data-say`, or `data-say="the spoken phrase"` when the text differs. `check` then fails a line that is off screen while its words are spoken, and warns when it appears late or leaves early.

- **Accuracy:** word starts land within about 0.1 s. A word that follows a pause starts where its sound rises, and every word ends where its sound stops. Matching allows about one misheard word in four. Numbers match only exactly.
- **Language:** it detects the language. `--language` fixes it. `--model onnx-community/whisper-small_timestamped` is slower and more accurate for noisy audio or accents. `"asr": { "model": "…" }` in the config sets the default.
- **Per scene or whole video:** `"voiceover"` plays one file across the video. A scene's `"audio"` plays narration cut per scene, and the scene lengthens to fit it.
- **After a change:** transcribe again after replacing the audio or the script.

## Captions

A word-synced caption track, as in short-form video: `<div class="captions" data-captions="../out/voice/words.json"></div>`, in every scene that shows it.

- **Lines:** words group into short lines, at most `data-max` words (default 3), breaking at punctuation and pauses. A line shows from its first word until the next line.
- **Highlight:** the word being spoken carries `.on` (a pill in `--caption-on`). Every spoken word carries `.said`, for a fill-as-you-speak style.
- **Place and style:** `--captions-y` sets the distance from the bottom. Restyle `.captions` and `.captions .w.on` freely. Keep other text out of the caption band.
- **Exact words:** captions show the script's words when the narration has a script, and the recognized words otherwise. Give TTS narration its script.
- **Timing:** it follows the transcript on the video clock, so it stays in sync across cuts. `check` skips reading time for captions: the speech sets their pace.
- **Contrast:** `check` measures each word in the colors it has at that frame. A word on its pill is measured against the pill, and a `-webkit-text-stroke` counts as its edge.

## Check the result

- **In `check`:** `data-say` lines are held to their words. A missing transcript fails with the command to run.
- **Round trip:** after `render`, run `transcribe out/video.mp4 --script assets/voiceover.txt`. Compare `heard` in its words file with the script. A mismatch shows a mispronounced or cut-off word, or a recognizer spelling of a name.
- **Effects under speech:** effects duck under the voice. `audit` judges them on their own stem (`out/voice/effects.wav`) and warns when the voice masks one by more than 12 dB. Place effects in pauses between phrases, or on moments with no speech.
- **Listen:** when audio playback is available, listen once through. Report when it was not.
