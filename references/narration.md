# Narration: voice, timing and captions

A narrated video follows its words: voice first, then word times, then picture and captions.

## Start from what the user brings

The user's material wins. Use it as given, fill only the gaps, and ask before changing any of it.

| The user brings                                                     | Do                                                                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A recording (voice memo, podcast, video, TTS audio)                 | Use it as `voiceover`, any file ffmpeg reads. Never replace or re-speak it. The picture follows its timing. `"start": -2` skips its first 2 s.                               |
| A recording and its script                                          | Set both: the script gives captions their exact words (`voiceover.script`).                                                                                                  |
| A recording, no script                                              | Run `transcribe`. Write the script from its words, names spelled right, as `voiceover.script`.                                                                               |
| A recording cut per scene                                           | Each file as that scene's `audio`, with its `script`. Each scene lengthens to fit its clip.                                                                                  |
| A plain script (brief or file)                                      | `speak` their words exactly, adding only line breaks and pause marks. Ask before changing any word. If a word fails the speech check, show what was heard and propose a fix. |
| A script with times per line (`0-5s: …`, `[00:05] …`, `10 sec - …`) | `speak` starts each line at its time and reports lines that overrun. Shorten them with the user, or give more time. Size scenes to the same times.                           |
| Subtitles (`.srt`, `.vtt`) with a recording                         | The file as `voiceover.script`: its words go on screen, its times hold each line in place.                                                                                   |
| Their own voice, to clone                                           | `--reference their-voice.wav` (VoxCPM2), or their cloning TTS through `--command`. Only their voice, or one they have consent for.                                           |
| Their own TTS or a paid service                                     | `--command` with its CLI, or `"tts": { "command": … }` in the config.                                                                                                        |
| A language, accent or voice in mind                                 | An engine that speaks it (below). Never narrate a language the voice cannot speak. With none, ask for their TTS or a recording.                                              |
| Only a topic, with narration asked for                              | Write the script from the gathered facts, then `speak` it.                                                                                                                   |
| Nothing about voice                                                 | No narration unless the video needs it. On-screen text carries the copy. Ask when it matters (SKILL.md, step 3).                                                             |

- **Mixed languages** (Malay with English words, Manglish, Taglish): pass the main language's `--language`. Check the English words in `heard`.

## Choose the voice

- **One voice** per video, matched to the subject and audience. A described voice names what the audience hears as their own: age, accent, region, tone.
- **Script first:** when the skill writes the script, it comes before any audio. Every fact in it comes from the gathered facts (`direction.md`, §0).
- **Native wording:** write in the audience's spoken language, never translated from English. Use a native short-video narrator's words, not textbook register. Follow a writing skill for that language when one exists.
- **Spoken, not read:** short phrases, one per line, with a beat before a number or a reveal.
- **Pace:** 4.5 to 5.5 syllables per second while speaking. Faster tires the listener. `speak` prints the pace and the `--speed` that reaches it (`0.85` is 15% slower, pitch kept). `"tts": { "speed": 0.9 }` sets it for every video.

## Text to speech

`speak script.txt` writes `assets/voiceover.wav`, and `assets/voiceover.txt` beside it without the pause marks (for captions and `transcribe`). Then set `"voiceover": { "file": "assets/voiceover.wav", "script": "assets/voiceover.txt" }`.

| Engine                        | How                                                                                                 | Fits                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Kokoro (default)              | `speak script.txt [--voice af_heart] [--speed 1]`                                                   | English, local, no setup. American `af_*`, `am_*`. British `bf_*`, `bm_*`.                         |
| VoxCPM2                       | `speak script.txt --engine voxcpm [--voice "(A warm, calm male narrator)"] [--reference voice.wav]` | 30 languages including Malay, described or cloned voices. Needs an NVIDIA GPU with 8 GB, and `uv`. |
| Any transformers.js TTS model | `speak script.txt --model Xenova/mms-tts-eng`                                                       | A Hugging Face model with ONNX weights, run locally                                                |
| Any TTS the user runs         | `speak script.txt --command "piper --model voice.onnx --output_file {out} < {text_file}"`           | Other languages, cloned or premium voices, cloud services                                          |

### Pauses

| In the script              | Pause                          |
| -------------------------- | ------------------------------ |
| Line break                 | 0.45 s breath                  |
| Blank line                 | 0.8 s beat between story parts |
| Sentence end inside a line | 0.3 s                          |
| `[pause]` / `[pause 1.2]`  | 0.6 s / exactly 1.2 s          |

Kokoro, VoxCPM2 and `--model` speak each phrase alone and join them with these pauses. A `--command` engine gets the whole script as one text, without the marks.

### Engines and models

- **Command placeholders:** `{text}` (the script, shell-quoted), `{text_file}`, `{voice}`, `{reference}` (a recording to clone).
- **`{out}`:** the audio the command writes, any format ffmpeg reads. It becomes 48 kHz mono WAV.
- **VoxCPM2 `--voice`:** write it in English, naming pitch (baritone, deep) and accent. Malay-language descriptions came out higher and less clear. Try a few descriptions and seeds on one line, and keep the one that reads back best.
- **VoxCPM2 accent:** a described voice drifts toward the model's most common accent. For a sure accent, clone a native speaker with `--reference`, with their consent. Later phrases clone the first, so one voice holds.
- **VoxCPM2 model:** loads offline from `"tts": { "checkpoint": "/path" }`, the model folder, or the Hugging Face cache. With none, the first run downloads about 4.7 GB. `doctor` names the checkpoint it finds.
- **Quantized model (GGUF):** its runner goes in `--command`, in the shape `"<runner> --gguf /models/voxcpm2-q6_k.gguf --text {text} --ref {reference} --out {out}"`, with that runner's flags.
- **Defaults:** set once in `~/.config/motion-video/config.json`: `{ "tts": { "engine": "voxcpm", "voice": "(…)" } }`, `{ "tts": { "command": "…" } }`, or `{ "tts": { "model": "…", "voice": "…" } }`. Flags override it.

### Writing for a generated voice

- **Numbers:** in other languages, write them as words ("sembilan belas lima puluh"). A voice can read digits in English. Captions still show the spoken words.
- **Short phrases:** VoxCPM2 garbles one- or two-word lines far more often. Give each line 3 words or more ("Korang tahu tak, Kuala Lumpur ni…").

### Speech check

`speak` transcribes every take and compares it with the script.

- **Words:** extra speech (babble after the text, a stray word) and missing words.
- **Numbers:** every number must be heard as the script says it.
- **Glitches:** a click, a thump before or after the speech, and a take cut off mid-sound. Every take's edges fade over a few milliseconds, so joins never click.
- **Doubtful words:** when a passing phrase has words heard differently, a second Whisper model hears it too. A word both models miss is marked `ok ?`: listen to it.

- **VoxCPM2:** each phrase is checked alone. A failing phrase regenerates under a new seed, up to 3 tries, keeping the best take. Other engines get one check of the whole file.
- **Output:** every phrase as heard. A remaining problem prints its fix and exits 1: reword the phrase, or `--reroll` it. Re-roll a passing phrase whose key word (a name, a number) is wrong.
- **`--language`** sets the recognizer's language.

### Takes and phrase spans

- **Takes are kept** by text, voice and seed (`~/.cache/motion-video/speak`). A re-run speaks only changed phrases. Every other phrase keeps its exact audio.
- **Chosen takes are recorded** in `voiceover.takes.json`, re-rolls included. A later run (a new `--speed`, one reworded line) keeps them. An explicit `--seed` starts over.
- **`--reroll 3,10`** draws new takes for those phrases alone. The earlier take stays in the running, so a worse draw never replaces it.
- **Phrase spans:** `speak` writes where each phrase sits in the audio (`voiceover.phrases.json`). `transcribe` keeps each phrase's words inside its span, so no word drifts across a pause.

## Time the picture to the words

1. **Transcribe:** `transcribe` prints each word at its video time (local Whisper) and writes `out/voice/words.json`.
   - With a script (`voiceover.script`, a scene's `script`, or `--script`), the script's words take the recognized times.
   - A voiceover longer than the scenes is still read, with the overrun printed.
   - The first run installs the speech runtime (about 500 MB).
2. **Plan to it:** in `direction.md`, give each beat the words it plays under. Place cuts in pauses between phrases.
3. **Time to it:** set each entrance's `--t` from the word times. A line lands about 0.2 s before its first word, a verb moment on its word.
4. **Mark it:** give every on-screen line that repeats the narration `data-say`, or `data-say="the spoken phrase"` when the text differs. `check` fails a line that is off screen while its words are spoken. It warns when one appears late or leaves early.

- **Accuracy:** word starts land within about 0.1 s. A word after a pause starts where its sound rises. Every word ends where its sound stops. Matching allows about one misheard word in four. Numbers and words of 4 letters or fewer match only exactly.
- **Language and model:** pass `--language` for narration outside English. It then uses the small model (`onnx-community/whisper-small_timestamped`), which hears other languages better. English uses the faster base model. `--model` or `"asr": { "model": "…" }` overrides.
- **Per scene or whole video:** `"voiceover"` plays one file across the video. A scene's `"audio"` plays narration cut per scene, and the scene lengthens to fit it.
- **After a change:** run `transcribe` again after replacing the audio or the script.

## Captions

A word-synced caption track: `<div class="captions" data-captions="../out/voice/words.json"></div>`, in every scene that shows it.

- **Lines:** words group into lines of at most `data-max` words (default 3), breaking at punctuation and pauses. A line shows from its first word until the next line.
- **Highlight:** the spoken word carries `.on` (a pill in `--caption-on`). Every spoken word carries `.said`, for a fill-as-you-speak style.
- **Place and style:** `--captions-y` sets the distance from the bottom. `--caption-edge` colors the solid outline that keeps white words readable on any frame. Restyle `.captions` and `.captions .w.on` freely. Keep other text out of the caption band.
- **Exact words:** captions show the script's words when the narration has a script, else the recognized words. Give TTS narration its script.
- **Timing:** captions follow the transcript on the video clock, so they stay in sync across cuts. `check` skips reading time for captions, since the speech sets their pace.
- **Contrast:** `check` measures each word in its colors at that frame. A word on its pill is measured against the pill. A `-webkit-text-stroke` counts as its edge.

## Check the result

- **In `check`:** `data-say` lines are held to their words. A missing transcript fails with the command to run.
- **Round trip:** after `render`, run `transcribe out/video.mp4 --script assets/voiceover.txt`. Compare `heard` in its words file with the script. A mismatch shows a mispronounced or cut-off word, or a recognizer's spelling of a name.
- **Effects under speech:** the voice leads. Use an effect only for a reason the voice does not give: a transition, the payoff. At most 2 in a scene, each in a pause.
  - `check` warns on an effect over a word and names the next pause. It also warns on more than 2 in a scene.
  - `audit` judges effects on their own stem (`out/voice/effects.wav`). It warns when the voice masks one by more than 12 dB.
- **Listen:** when audio playback is available, listen once through. Report when it was not.
