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
| A language, accent or voice in mind                                 | An engine that speaks it (`references/tts.md`). Never narrate a language the voice cannot speak. With none, ask for their TTS or a recording.                                |
| Only a topic, with narration asked for                              | Write the script from the gathered facts, then `speak` it.                                                                                                                   |
| Nothing about voice                                                 | No narration unless the video needs it. On-screen text carries the copy. Ask when it matters (SKILL.md, step 3).                                                             |

- **Mixed languages** (Malay with English words, Manglish, Taglish): pass the main language's `--language`. Check the English words in `heard`.

## Choose the voice

- **One voice** per video, matched to the subject and audience. A described voice names what the audience hears as their own: age, accent, region, tone.
- **Script first:** when the skill writes the script, it comes before any audio. Every fact in it comes from the gathered facts (`direction.md`, §0).
- **Native wording:** write in the audience's spoken language, never translated from English. Use a native short-video narrator's words, not textbook register. Follow a writing skill for that language when one exists.
- **Spoken, not read:** short phrases, one per line, with a beat before a number or a reveal.
- **Pace:** `speak` aims at about 4.1 syllables per second while speaking (3.5 to 4.7), a relaxed explainer. Match it to the narration: a lesson reads slower, a launch or an ad faster. A natural take inside the range needs no `--speed`. `speak` prints the pace and the `--speed` that reaches it (`0.85` is 15% slower, pitch kept). `--pace 4.2` sets another target, for a calmer or brisker read. `"tts": { "speed": 0.9, "pace": 4.3 }` sets both for every video.

## Text to speech

`speak script.txt` writes `assets/voiceover.wav`, and `assets/voiceover.txt` beside it without the pause marks (for captions and `transcribe`). A source script at that path keeps its marks: the spoken words then go to `voiceover.spoken.txt`. Set `"voiceover": { "file": …, "script": … }` as `speak` prints it.

- **Engine:** the best this machine runs by default: VoxCPM2 (30 languages, NVIDIA GPU), else Kokoro (English, CPU). `--engine kokoro|voxcpm`, `--model <Hugging Face id>` (any language a model speaks, CPU) or `--command` (any TTS). Choosing one, languages, hardware and adding a new voice: `references/tts.md`.

### Pauses

| In the script              | Pause                          |
| -------------------------- | ------------------------------ |
| Line break                 | 0.45 s breath                  |
| Blank line                 | 0.8 s beat between story parts |
| Sentence end inside a line | 0.3 s                          |
| `[pause]` / `[pause 1.2]`  | 0.6 s / exactly 1.2 s          |

- **Kokoro, `--model` and `--command`** speak each phrase alone and join them with these pauses. `--command … --one-call` gets the whole script as one text, without the marks.
- **VoxCPM2** speaks each beat whole, so only blank lines and `[pause]` marks are exact there. Inside a beat, its punctuation sets the pauses: a period or question mark a clear pause, a comma a short one, "…" a hesitation. Split a sentence for a stronger pause.

### Writing for a generated voice

- **Numbers:** in other languages, write them as words ("sembilan belas lima puluh"). A voice can read digits in English. Captions still show the spoken words.
- **Short phrases:** VoxCPM2 garbles a beat of one or two words far more often. Join it to the line before or after.
- **Non-verbal tags (VoxCPM2):** `[laughing]`, `[sigh]`, `[Uhm]`, `[Shh]`, `[Question-ah]`, `[Question-ei]`, `[Question-en]`, `[Question-oh]`, `[Surprise-wa]`, `[Surprise-yo]`, `[Dissatisfaction-hnn]`, written where the sound happens. Use them rarely, at most one per sentence. Captions and the speech check leave them out, and other engines drop them.

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
- **Chosen takes are recorded** in `voiceover.takes.json` with the voice's seed, re-rolls included. A later run (a new `--speed`, one reworded line) keeps them and the seed, so `--seed` is needed only once. A different `--seed` starts over.
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
