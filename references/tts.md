# Text to speech: choosing and using an engine

`speak` turns a script into narration with one of four engines. This page holds what is true for every engine. Each engine's own rules live in its guide, and only that guide applies to it:

| Engine               | Guide                           |
| -------------------- | ------------------------------- |
| VoxCPM2              | `references/tts/voxcpm2.md`     |
| Kokoro               | `references/tts/kokoro.md`      |
| A Hugging Face model | `references/tts/huggingface.md` |
| The user's own TTS   | `references/tts/command.md`     |

## Pick an engine

With no engine flag or config, `speak` picks the best engine this machine runs: VoxCPM2 when an NVIDIA GPU with 8 GB and `uv` are here, else Kokoro. `doctor` names it on its `tts default` line.

| Language       | Machine                          | Engine                                                                                                        |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Any of 30      | NVIDIA GPU with 8 GB, and `uv`   | VoxCPM2, the default there                                                                                    |
| English        | Any, CPU only included           | Kokoro, the default without that GPU                                                                          |
| The model's    | Any, CPU only included, and `uv` | A Hugging Face model whose license allows the video's use                                                     |
| Any            | Any                              | The user's recording, or their own TTS through `--command`. Both beat a generated voice the user never heard. |
| No engine fits | Any                              | No narration. Ask for a recording, or carry the copy in on-screen text.                                       |

- **Never** narrate a language the engine does not speak. Without VoxCPM2, `speak --language` with a language Kokoro lacks stops and names the options.
- **License:** use only an engine or model whose license allows the video's use, commercial use included. Kokoro and VoxCPM2 are Apache 2.0. Never use a model whose license bars commercial use or restricts its outputs.
- **Quality order** for a language other than English: the user's recording, the user's TTS, VoxCPM2, then a Hugging Face model.

## What each engine can do

| Engine             | Voice                           | Delivery control                           | Pauses                                                       | Takes                                 |
| ------------------ | ------------------------------- | ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------- |
| VoxCPM2            | Described (`--voice`) or cloned | `--style`, delivery notes, non-verbal tags | Blank lines and marks set after the take, punctuation inside | One take, cached, retried, `--reroll` |
| Kokoro             | 28 named voices                 | `--speed` only                             | Every mark exact                                             | One pass, checked whole               |
| Hugging Face model | The model's voice               | `--speed` only                             | Every mark exact                                             | One pass, checked whole               |
| User's TTS         | Whatever the tool offers        | Whatever the tool offers                   | Every mark exact, or none with `--one-call`                  | One pass, checked whole               |

A script feature an engine lacks is dropped for it, never spoken: delivery notes and tags are VoxCPM2 only.

Every engine's output gets the voice polish: loudness evened sentence by sentence, gentle compression, de-essing, and normalizing to a -1 dB peak (`narration.md`, Voice polish). It never changes the pace. The user's own recordings are never changed.

## Steps for any engine

1. **Match the voice to the narration:** its purpose, audience and the user's wishes. Ask when the voice matters and the brief does not say.
2. **Write the script** per `narration.md`, plus the engine guide's writing rules.
3. **Try one beat** with the chosen voice before the whole script.
4. **Speak the script** as one file: `speak script.txt`. Pass `--language` for narration outside English.
5. **Read the speech check** (`narration.md`, Speech check). A problem exits 1 with its fix.
6. **Read the pace line.** A natural take inside the printed range needs no change. Outside it, the line says how to reach it for that engine.
7. **Listen once** when playback is available. Report when it was not.

## Defaults

Set once in `~/.config/motion-video/config.json`. Flags override it.

| Goal                 | Config                                                          |
| -------------------- | --------------------------------------------------------------- |
| One engine and voice | `{ "tts": { "engine": "voxcpm", "voice": "(…)" } }`             |
| A Hugging Face model | `{ "tts": { "model": "<model id>" } }`                          |
| The user's TTS       | `{ "tts": { "command": "…" } }`                                 |
| Speed and pace       | `{ "tts": { "speed": 0.9, "pace": 4.3 } }` (speed: not VoxCPM2) |

## Speech check across languages

`speak` hears every take back with Whisper, which covers about 99 languages. Pass `--language` with the script's language. For a language Whisper does not know, the check cannot judge the take: listen instead, and report that the check could not run.

## Add a voice or a language

Follow these steps when no engine here fits the user's language, voice or machine.

1. **Ask first:** the user's recording or the TTS they already use beats any model you pick.
2. **Find a model:** search `huggingface.co/models?pipeline_tag=text-to-speech` with the language filter. Read its card for language, license and hardware. Use only a model whose license allows the video's use.
3. **Run it:** a model the transformers text-to-speech pipeline loads goes in `--model` (`references/tts/huggingface.md`). Anything else goes in `--command` (`references/tts/command.md`).
4. **Try it on one line** with `--language`, then judge the speech check, the pace and, when possible, the sound.
5. **Make it the default** once it works (Defaults, above).

- **A new built-in engine** for everyone: see `CONTRIBUTING.md`.
