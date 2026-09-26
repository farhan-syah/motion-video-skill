# Narration: voice, timing and captions

A narrated video is timed to its words. The voice comes first, then its word timings, then the picture and the captions follow them.

## Start from what the user brings

The user's material always wins over what the skill would make. Use it as given, fill only what is missing, and ask before changing any of it.

| The user brings | Do |
|---|---|
| A recording (voice memo, podcast clip, a video with speech, TTS audio from any service) | Use it as the voiceover: any file ffmpeg reads, video included. Never replace a person's voice with TTS, and never re-speak their words. Its timing is fixed: the picture follows it. `"start": -2` skips its first 2 seconds. |
| A recording and its script | Both: the script gives the captions their exact words (`voiceover.script`). |
| A recording with no script | `transcribe` it, then read the words back. Write a script from them with names and terms spelled right, and use it as `voiceover.script`. |
| A recording cut per scene | Each file as that scene's `audio`, with its `script`. Each scene lengthens to fit its clip. |
| A script as plain text (in the brief or a file) | Their words, word for word, spoken with `speak`. Add only line breaks and pause marks, which change no word. Ask before changing a word, even to fix grammar or spell out a number. When the speech check fails on one of their words, show them what was heard and propose a fix. |
| A script with times per line ("0-5s: …", "[00:05] …", "10 sec - …") | `speak script.txt`: each line starts at its time. It reports a line that runs past its slot or starts late: shorten it with the user, or give it more time. Size the scenes to the same times. |
| Subtitles (`.srt`, `.vtt`) with a recording | The subtitle file as `voiceover.script`: its words go on screen, and its times keep each line's words in place. |
| Their own voice, to clone | `--reference their-voice.wav` (VoxCPM2), or their own cloning TTS through `--command`. Only their voice, or a voice they have consent for. |
| Their own TTS or a paid service | `--command` with its CLI, or `"tts": { "command": … }` in the config for every video. |
| A language, an accent or a voice in mind | The engine that can speak it (below). Never narrate in a language the chosen voice cannot speak. With none, ask for their TTS or a recording. |
| Only a topic, and narration asked for | Write the script from the gathered facts, then `speak` it. |
| Nothing about voice | No narration unless the video needs it. On-screen text carries the copy. Ask when it matters (SKILL.md, step 3). |

- **Mixed languages:** speech that switches languages (Malay with English words, Manglish, Taglish) is normal. Transcribe it with the main language's `--language`, and check the English words in `heard`.

## Choose the voice

- **Voice choice:** pick one voice for the whole video, matched to the subject and the audience. With a described voice (VoxCPM2 `--voice`), name what the audience hears as their own: age, accent, region, tone. A narrator with the wrong accent reads as foreign to the audience.
- **Script first:** when the skill writes the script, it comes before any audio, and every fact in it comes from the gathered facts (`direction.md`, §0).
- **Native wording:** when the skill writes the script, write it in the audience's spoken language from the start, never as a translation of English. Use the words and sentence shapes a native narrator of short videos uses, not textbook or formal register, and no word the audience would not say. When a writing skill for that language is available, follow it.
- **Pace:** an explainer reads best at about 4.5 to 5.5 syllables per second while speaking. Faster tires the listener, even when every word is clear. `speak` prints the pace and the `--speed` to reach it (`--speed 0.85` is 15% slower, pitch kept). `"tts": { "speed": 0.9 }` in the config sets it for every video. The video length follows the narration.
- **Spoken, not read:** write narration as it is said aloud: short phrases, one per line, with a beat before a number or a reveal. A long written sentence read out sounds like a document, not a narrator.

## Text to speech

`speak script.txt` writes `assets/voiceover.wav` and the script beside it (`assets/voiceover.txt`, with the pause marks removed, for captions and `transcribe`).

- **Pauses in the script:** a line break is a breath (0.45 s), a blank line a beat between story parts (0.8 s), a sentence end inside a line a short stop (0.3 s). `[pause]` (0.6 s) or `[pause 1.2]` sets an exact pause anywhere. Kokoro, VoxCPM2 and `--model` engines speak each phrase alone and join them with these pauses. A `--command` engine gets the whole script as one text, without the marks.

Then set `"voiceover": { "file": "assets/voiceover.wav", "script": "assets/voiceover.txt" }`.

| Engine | How | Fits |
|---|---|---|
| Kokoro (default) | `speak script.txt [--voice af_heart] [--speed 1]` | English, local, no setup. American voices `af_*`, `am_*`; British `bf_*`, `bm_*`. |
| VoxCPM2 | `speak script.txt --engine voxcpm [--voice "(A warm, calm male narrator)"] [--reference voice.wav]` | 30 languages (including Malay, Indonesian, Thai, Chinese, Arabic), 48 kHz, a voice described in words or cloned from a recording. Needs an NVIDIA GPU with 8 GB, and `uv` for its Python environment. |
| Any transformers.js TTS model | `speak script.txt --model Xenova/mms-tts-eng` | A Hugging Face model with ONNX weights, run locally |
| Any TTS the user runs | `speak script.txt --command "piper --model voice.onnx --output_file {out} < {text_file}"` | Other languages, cloned or premium voices, cloud services |

- **Command placeholders:** `{text}` (the script, quoted for the shell), `{text_file}` (a file holding it), `{out}` (the audio file the command writes, any format ffmpeg reads), `{voice}` and `{reference}` (a recording to clone). The output becomes 48 kHz mono WAV.
- **VoxCPM2 voice:** `--voice` describes it in words. Write the description in English even for another language's narration, and name the pitch (baritone, deep) and the accent: descriptions written in Malay came out higher and less clear. A described voice can drift toward the model's most common accent. For a sure accent, clone a native speaker's recording with `--reference`. Try a few descriptions and seeds on one line first, and keep the one that is deepest and read back best. `--reference` clones a recording, only with the speaker's consent. One voice holds across the script: later sentences clone the first.
- **VoxCPM2 model:** a checkpoint already on disk loads offline: `"tts": { "checkpoint": "/path" }` in the config, else a complete copy in the model folder or the Hugging Face cache. With none, the first run downloads about 4.7 GB. `doctor` names the checkpoint it found.
- **A quantized model (GGUF):** the runner that reads it goes in `--command`, in the shape `"<runner> --gguf /models/voxcpm2-q6_k.gguf --text {text} --ref {reference} --out {out}"`, with that runner's own flags.
- **Numbers in other languages:** write them as words ("sembilan belas lima puluh"), since a voice can read digits in English. Captions still show the spoken words, timed across the digits the recognizer writes.
- **Defaults:** set once in `~/.config/motion-video/config.json`: `{ "tts": { "engine": "voxcpm", "voice": "(…)" } }`, `{ "tts": { "command": "…" } }`, or `{ "tts": { "model": "…", "voice": "…" } }`. Flags override it.
- **Models:** a copy on disk is used first, else a download once into the model folder (`cli.md`, Setup).
- **Short phrases:** VoxCPM2, cloning above all, garbles a phrase of one or two words far more often than a longer one. Give each line three words or more: join a short opener to the next line ("Korang tahu tak, Kuala Lumpur ni…").
- **Takes are kept:** each phrase's take is kept by its text, voice and seed (`~/.cache/motion-video/speak`). A re-run speaks only the phrases that changed, and every other phrase stays exactly as it was. `--reroll 3,10` draws new takes for those phrases alone.
- **Speech check:** `speak` transcribes what it made and compares it with the script: extra speech (a generated voice can babble on after the text, or add a stray word), missing words, and every number, which must be heard as the script says it. VoxCPM2 checks each phrase alone and regenerates a failing one under a new seed, up to 3 tries, keeping the best take. Other engines get one check of the whole file. `speak` prints every phrase as it was heard. A problem that remains is printed with the fix, and `speak` exits 1: reword that phrase (a number said another way often fixes it), or draw new takes of it with `--reroll`. A passing phrase can still carry one misheard word: read the heard lines, and re-roll a phrase whose key word (a name, a number) is wrong. `--language` sets the recognizer's language.
- **Phrase spans:** `speak` writes where each phrase sits in the audio (`voiceover.phrases.json`). `transcribe` keeps each phrase's words inside its own span, so no word drifts across a pause.

## Time the picture to the words

1. **Transcribe:** run `transcribe`. A new voiceover may run past the scenes: `transcribe` still reads it and says how far, so the scenes can be sized to its words. It prints every spoken word at its video time, from a local Whisper model, and writes the whole video's words to `out/voice/words.json`. With a known script (`voiceover.script`, a scene's `script`, or `--script`), the words come from the script, on the recognized timings. The first run installs the speech runtime (about 500 MB).
2. **Plan to it:** in `direction.md`, give each beat the words it plays under, and place cuts in pauses between phrases.
3. **Time to it:** set each entrance's `--t` from the word times: a line lands about 0.2 s before its first word, a verb moment on its word.
4. **Mark it:** give every on-screen line that repeats the narration `data-say`, or `data-say="the spoken phrase"` when the text differs. `check` then fails a line that is off screen while its words are spoken, and warns when it appears late or leaves early.

- **Accuracy:** word starts land within about 0.1 s. A word that follows a pause starts where its sound rises, and every word ends where its sound stops. Matching allows about one misheard word in four. Numbers match only exactly.
- **Language and model:** it detects the language. `--language` fixes it, and pass it for any narration outside English: a non-English language uses the small Whisper model (`onnx-community/whisper-small_timestamped`), which hears and times other languages better, and English uses the faster base model. `--model` picks one, and `"asr": { "model": "…" }` in the config sets it for every command.
- **Per scene or whole video:** `"voiceover"` plays one file across the video. A scene's `"audio"` plays narration cut per scene, and the scene lengthens to fit it.
- **After a change:** transcribe again after replacing the audio or the script.

## Captions

A word-synced caption track, as in short-form video: `<div class="captions" data-captions="../out/voice/words.json"></div>`, in every scene that shows it.

- **Lines:** words group into short lines, at most `data-max` words (default 3), breaking at punctuation and pauses. A line shows from its first word until the next line.
- **Highlight:** the word being spoken carries `.on` (a pill in `--caption-on`). Every spoken word carries `.said`, for a fill-as-you-speak style.
- **Place and style:** `--captions-y` sets the distance from the bottom. `--caption-edge` colors the solid outline that keeps white words readable on light and dark frames. Restyle `.captions` and `.captions .w.on` freely. Keep other text out of the caption band.
- **Exact words:** captions show the script's words when the narration has a script, and the recognized words otherwise. Give TTS narration its script.
- **Timing:** it follows the transcript on the video clock, so it stays in sync across cuts. `check` skips reading time for captions: the speech sets their pace.
- **Contrast:** `check` measures each word in the colors it has at that frame. A word on its pill is measured against the pill, and a `-webkit-text-stroke` counts as its edge.

## Check the result

- **In `check`:** `data-say` lines are held to their words. A missing transcript fails with the command to run.
- **Round trip:** after `render`, run `transcribe out/video.mp4 --script assets/voiceover.txt`. Compare `heard` in its words file with the script. A mismatch shows a mispronounced or cut-off word, or a recognizer spelling of a name.
- **Effects under speech:** the voice leads, and an effect on top of a word distracts from it. Use an effect only with a clear reason the voice does not give: a transition between parts, the payoff landing, a sound the picture makes that the story needs. At most 2 in a scene, each in a pause. `check` warns on an effect over a word, naming the next pause, and on more than 2 in a narrated scene. `audit` judges effects on their own stem (`out/voice/effects.wav`) and warns when the voice masks one by more than 12 dB. With no clear reason, leave the moment to the voice.
- **Listen:** when audio playback is available, listen once through. Report when it was not.
