# Text to speech: engines, languages and machines

`speak` turns a script into narration with one of four engines. With no engine flag or config, it picks the best engine this machine runs: VoxCPM2 when its GPU and `uv` are here, else Kokoro. Run `doctor` first: its `tts default` line names that engine.

## Pick an engine

| Language       | Machine                          | Engine                                                                                                        |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Any of 30      | NVIDIA GPU with 8 GB, and `uv`   | VoxCPM2, the default there. Described or cloned voices.                                                       |
| English        | Any, CPU only included           | Kokoro, the default without that GPU. `--engine kokoro` also gives a fast English draft on any machine.       |
| 1,100+         | Any, CPU only included, and `uv` | MMS-TTS: `--model facebook/mms-tts-<iso>`. One plain voice per language. Non-commercial use only.             |
| Any            | Any                              | The user's recording, or their own TTS through `--command`. Both beat a generated voice the user never heard. |
| No engine fits | Any                              | No narration. Ask for a recording, or carry the copy in on-screen text.                                       |

- **Never** narrate a language the engine does not speak. Kokoro reads Malay text as English. Without VoxCPM2, `speak --language` with another language stops and names the options.
- **A voice for VoxCPM2:** design one with `--voice "(…)"` for every video. Without it, the model picks its own voice.
- **License:** MMS-TTS is CC-BY-NC 4.0, so never use it in a commercial video (an ad, a product teaser, a client job). Ask what the video is for when unsure. Kokoro and VoxCPM2 are Apache 2.0.
- **Quality order** for a language other than English: the user's recording, the user's TTS, a cloned or designed VoxCPM2 voice, then MMS-TTS.

## Engines

| Engine               | Flag                           | Languages                                    | Runs on                                           | First run                                                                |
| -------------------- | ------------------------------ | -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| Kokoro-82M           | none                           | English (US `af_*` `am_*`, UK `bf_*` `bm_*`) | CPU, fast                                         | The speech runtime (about 500 MB, shared with Whisper) and a 90 MB model |
| VoxCPM2              | `--engine voxcpm`              | 30, listed below                             | NVIDIA GPU, 8 GB. `--device cpu` works, very slow | A Python environment and a 4.7 GB model, unless on disk                  |
| An ONNX model        | `--model Xenova/mms-tts-spa`   | The model's                                  | CPU, in Node                                      | The model                                                                |
| A PyTorch-only model | `--model facebook/mms-tts-zlm` | The model's                                  | CPU, in Python through `uv`                       | A 1.1 GB Python environment (once), then the model                       |
| Any TTS              | `--command "…"`                | The tool's                                   | Wherever the tool runs                            | Whatever the tool needs                                                  |

- **Kokoro voices:** `af_heart` (default), `af_alloy`, `af_aoede`, `af_bella`, `af_jessica`, `af_kore`, `af_nicole`, `af_nova`, `af_river`, `af_sarah`, `af_sky`, `am_adam`, `am_echo`, `am_eric`, `am_fenrir`, `am_liam`, `am_michael`, `am_onyx`, `am_puck`, `am_santa`, `bf_alice`, `bf_emma`, `bf_isabella`, `bf_lily`, `bm_daniel`, `bm_fable`, `bm_george`, `bm_lewis`. `a` is American, `b` British, `f` female, `m` male.
- **VoxCPM2 languages:** Arabic, Burmese, Chinese, Danish, Dutch, English, Finnish, French, German, Greek, Hebrew, Hindi, Indonesian, Italian, Japanese, Khmer, Korean, Lao, Malay, Norwegian, Polish, Portuguese, Russian, Spanish, Swahili, Swedish, Tagalog, Thai, Turkish, Vietnamese. Also 9 Chinese dialects, Cantonese among them.
- **ONNX MMS voices** (run in Node, no Python): `Xenova/mms-tts-` with `eng`, `spa`, `fra`, `deu`, `por`, `rus`, `ara`, `hin`, `kor`, `vie`, `ron`, `yor`.
- **Every other MMS language** runs from `facebook/mms-tts-<iso>`, where `<iso>` is its ISO 639-3 code: `zlm` Malay, `ind` Indonesian, `tha` Thai, `tgl` Tagalog. Find a code on the hub: `huggingface.co/models?search=mms-tts-`.
- **Rendering** needs no GPU either. `doctor` names the drawing and encoding modes.

Tested: `Xenova/mms-tts-spa` and `facebook/mms-tts-zlm` on the CPU, both passing the speech check.

## VoxCPM2

`speak` makes VoxCPM2 narration in two steps:

1. **The voice:** with `--voice`, it designs a reference once by speaking the script's opening (25 words or more, about 10 s). It saves it as `voiceover.voice.wav` beside the audio. With `--reference`, the user's recording is the voice.
2. **The narration:** each beat (the text between blank lines or `[pause]` marks, at most 40 words) is one generation that clones that reference. The model sets the pauses inside a beat from the punctuation and meaning. A beat that fails every take is spoken sentence by sentence.

- **Why beats:** every generation is a separate draw of the voice. One generation per sentence made about 21 draws a minute, and the voice drifted between them. Beats keep it to about 8, with connected delivery.
- **Described voice:** write `--voice` in English in three layers. Who: gender, age, role. Texture: pitch, timbre. Delivery: emotion and scenario. Descriptions in other languages came out higher and less clear.
- **Match the voice to the narration:** its purpose, audience and the user's wishes set every layer. The words in the description steer the read: presenter words ("friendly", "confident", "energetic") give an ad or sales read, and a scenario ("talking to one person", "telling a story at night") gives its own delivery. Ask the user when the voice matters and the brief does not say.

  | Narration          | Example `--voice` (a range, never a menu)                                                                               |
  | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
  | Lesson or tutorial | `"(A man in his thirties with a deep, warm voice. Calm and unhurried, explaining something to one person he knows.)"`   |
  | Product launch     | `"(A woman in her late twenties with a bright, clear voice. Upbeat and confident, presenting a new product on stage.)"` |
  | Documentary        | `"(An older man with a low, textured voice. Measured and thoughtful, narrating a nature documentary.)"`                 |
  | Children's story   | `"(A young woman with a soft, gentle voice. Playful and warm, reading a bedtime story to a child.)"`                    |

- **Untested examples:** the table's descriptions show the layers, and none was heard. A "friendly, confident, clear … explaining a tool" description gave a sales read in one test where a teaching tone was wanted.
- **Delivery:** `--style "(relaxed and conversational, explaining to a friend)"` steers every cloned beat. It changes emotion, pace and delivery, never the voice itself.
- **Listen to the voice first:** play `voiceover.voice.wav` before judging the rest. If it is wrong, change `--voice` or `--seed`, and nothing else is kept.
- **One voice holds:** every `speak` call with the same `--voice`, `--seed` and `--language` clones the same reference, so per-scene files match. `voiceover.takes.json` records the seed, so a later run needs no `--seed`. `--reference voiceover.voice.wav` gives another video the same voice.
- **Settings:** `--cfg 1.6 --steps 16` by default. Guidance 1.0–2.0 is relaxed and natural, and above 2.0 follows the text more strictly with more noise. More steps (up to 30) are more natural and slower.
- **Accent drift:** a described voice drifts toward the model's most common accent. For a sure accent, clone a native speaker with `--reference`, with their consent. A reference of 5 to 30 s works.
- **Checkpoint:** loads offline from `"tts": { "checkpoint": "/path" }`, the model folder, or the Hugging Face cache. `doctor` names the one it finds.
- **Quantized (GGUF):** its runner goes in `--command`, shaped like `"<runner> --gguf /models/voxcpm2-q6_k.gguf --text {text} --ref {reference} --out {out}"`, with that runner's flags.

## Add a voice or a language

Follow these steps when no listed engine fits the user's language, voice or machine.

1. **Ask first:** the user's recording or the TTS they already use beats any model you pick.
2. **Find a model:** search `huggingface.co/models?pipeline_tag=text-to-speech` with the language filter. Read its card for language, license and hardware. Use only a model whose license allows the video's use: many TTS models are non-commercial.
3. **Try it on one line:** `speak "one sentence in that language" --model <id> --language <code> --out test.wav`. ONNX weights run in Node. Other weights run through the transformers pipeline in Python.
4. **Judge the take:** the speech check must pass. Then compare the pace with the target and listen once when playback is available.
5. **Wrap anything else in a command:** a CLI, a cloud service, a GGUF runner, or a model that needs extra arguments (a speaker id, a style) goes in `--command`. A small script that loads the model and writes `{out}` works.
6. **Make it the default** once it works: `~/.config/motion-video/config.json`, below.

- **Fails in Python:** the model is not a transformers text-to-speech model (Parler, F5, XTTS need their own package). Run it through `--command`.
- **A new built-in engine** for everyone: see `CONTRIBUTING.md`.

## Command engines

`--command` runs any TTS through a shell template.

| Placeholder   | Becomes                                                        |
| ------------- | -------------------------------------------------------------- |
| `{text}`      | The phrase, shell-quoted                                       |
| `{text_file}` | A file holding the phrase                                      |
| `{out}`       | The audio file the command must write, any format ffmpeg reads |
| `{voice}`     | `--voice`                                                      |
| `{reference}` | `--reference`: a recording to clone                            |

- **Per phrase:** the command runs once per phrase. The script's pauses, timed lines and phrase spans hold, as with the built-in engines.
- **`--one-call`:** runs it once on the whole script, for a tool that loads slowly on every call. Pause marks are dropped, and a timed script cannot be placed.
- **Output:** any sample rate or channels. It becomes 48 kHz mono.
- **Examples:**
  - Piper: `--command "piper --model voice.onnx --output_file {out} < {text_file}"`
  - A Python script: `--command "uv run my_tts.py --text-file {text_file} --out {out}"`

## Defaults

Set once in `~/.config/motion-video/config.json`. Flags override it.

| Goal                   | Config                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| VoxCPM2 with one voice | `{ "tts": { "engine": "voxcpm", "voice": "(…)" } }`                       |
| A Hugging Face model   | `{ "tts": { "model": "facebook/mms-tts-zlm" } }`                          |
| The user's TTS         | `{ "tts": { "command": "…" } }`, plus `"oneCall": true` for a slow loader |
| Slower narration       | `{ "tts": { "speed": 0.9 } }`                                             |

## Speech check across languages

`speak` hears every take back with Whisper, which covers about 99 languages. Pass `--language` with the script's language.

- **VoxCPM2** checks each phrase alone and regenerates a failing one. Other engines get one check of the whole file.
- **A language Whisper does not know:** the check cannot judge it. Listen instead, and report that the check could not run.
- **Pace:** `speak` prints it and the `--speed` that reaches the target (4.1 syllables per second, or `--pace`). The MMS voices tested spoke slowly and needed `--speed 1.2` to `1.5`.
