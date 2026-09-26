# Text to speech: engines, languages and machines

`speak` turns a script into narration with one of four engines. Pick the engine from the language and the machine, never from habit. Run `doctor` first: its SPEECH section names what this machine runs.

## Pick an engine

| Language       | Machine                          | Engine                                                                                                        |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| English        | Any, CPU only included           | Kokoro, the default. No flag.                                                                                 |
| Any of 30      | NVIDIA GPU with 8 GB, and `uv`   | VoxCPM2: `--engine voxcpm`. Described or cloned voices.                                                       |
| 1,100+         | Any, CPU only included, and `uv` | MMS-TTS: `--model facebook/mms-tts-<iso>`. One plain voice per language. Non-commercial use only.             |
| Any            | Any                              | The user's recording, or their own TTS through `--command`. Both beat a generated voice the user never heard. |
| No engine fits | Any                              | No narration. Ask for a recording, or carry the copy in on-screen text.                                       |

- **Never** narrate a language the engine does not speak. Kokoro reads Malay text as English.
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

- **VoxCPM2 languages:** Arabic, Burmese, Chinese, Danish, Dutch, English, Finnish, French, German, Greek, Hebrew, Hindi, Indonesian, Italian, Japanese, Khmer, Korean, Lao, Malay, Norwegian, Polish, Portuguese, Russian, Spanish, Swahili, Swedish, Tagalog, Thai, Turkish, Vietnamese. Also 9 Chinese dialects, Cantonese among them.
- **ONNX MMS voices** (run in Node, no Python): `Xenova/mms-tts-` with `eng`, `spa`, `fra`, `deu`, `por`, `rus`, `ara`, `hin`, `kor`, `vie`, `ron`, `yor`.
- **Every other MMS language** runs from `facebook/mms-tts-<iso>`, where `<iso>` is its ISO 639-3 code: `zlm` Malay, `ind` Indonesian, `tha` Thai, `tgl` Tagalog. Find a code on the hub: `huggingface.co/models?search=mms-tts-`.
- **Rendering** needs no GPU either. `doctor` names the drawing and encoding modes.

Tested: `Xenova/mms-tts-spa` and `facebook/mms-tts-zlm` on the CPU, both passing the speech check.

## VoxCPM2

- **Described voice:** `--voice "(A deep, confident young male narrator, Malaysian accent)"`. Write it in English, naming age, pitch (baritone, deep), tone and accent. Descriptions in other languages came out higher and less clear.
- **Tune a voice** on one line first. Try a few descriptions and seeds, and keep the one that reads back best.
- **Accent drift:** a described voice drifts toward the model's most common accent. For a sure accent, clone a native speaker with `--reference`, with their consent.
- **One voice holds:** later phrases clone the first phrase's voice.
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
- **Pace:** `speak` prints it and the `--speed` that reaches 4.5 to 5.5 syllables per second. The MMS voices tested spoke slowly and needed `--speed 1.2` to `1.5`.
