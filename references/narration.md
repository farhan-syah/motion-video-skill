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
| Their own voice, to clone                                           | `--reference their-voice.wav` (VoxCPM2), or their cloning TTS through `--command`. Only their own voice, or a voice they have consent to use.                                |
| Their own TTS or a paid service                                     | `--command` with its CLI, or `"tts": { "command": … }` in the config.                                                                                                        |
| A language, accent or voice in mind                                 | An engine that speaks it (`references/tts.md`). Never narrate a language the voice cannot speak. With none, ask for their TTS or a recording.                                |
| Only a topic, with narration asked for                              | Write the script from the gathered facts, then `speak` it.                                                                                                                   |
| Nothing about voice                                                 | No narration unless the video needs it. On-screen text carries the copy. Ask when it matters (`direction.md`, Ask the user).                                                             |

- **Mixed languages** (Malay with English words, Manglish, Taglish): pass the main language's `--language`. Check the English words in `heard`.

## Choose the voice

- **One voice** per video, matched to the subject and audience. A described voice names what the audience hears as their own: age, accent, region, tone.
- **Script first:** when the skill writes the script, it comes before any audio. Every fact in it comes from the gathered facts (`direction.md`, §0).
- **Native wording:** write in the audience's spoken language, never translated from English. Use a native short-video narrator's words, not textbook register. Follow a writing skill for that language when one exists.
- **Spoken, not read:** short phrases, one per line, with a beat before a number or a reveal. Written prose read aloud sounds flat. A speaker uses devices like these, as a range to draw from, never a menu:

  | Device                     | What the listener hears                     | For example                                    |
  | -------------------------- | ------------------------------------------- | ---------------------------------------------- |
  | Contractions               | Speech, not a document                      | "it's", "you'll", "that's"                     |
  | Varied sentence length     | Rhythm. A short line after a long one lands | "It took three years. Three."                  |
  | A question to the listener | An invitation to think along                | "So where does all that water go?"             |
  | An aside                   | A person talking, not a manual              | "— and yes, it's free —"                       |
  | A connecting reaction      | A turn in the thought                       | "Okay.", "Here's the thing:", "Right,"         |
  | A held pause               | Suspense before a reveal                    | "And then… the door opened."                   |
  | A sound a person makes     | A laugh, a sigh, a thinking sound           | `[laughing]`, `[sigh]`, `[Uhm]` (VoxCPM2 tags) |
  | A change of feeling        | Emotion that moves with the story           | A delivery note on that line (VoxCPM2)         |

- **First line orients:** it names the subject or the question, before any scenario. "Three ways to cut your water bill." orients. "So you open the app." does not.
- **Pace:** `speak` aims at about 4.1 syllables per second while speaking (3.5 to 4.7), a relaxed explainer. Match it to the narration: a lesson reads slower, a launch or an ad faster. A natural take inside the range needs no change. `speak` prints the pace and how to reach the range.
  - **VoxCPM2:** the reference sets the pace. A designed voice is spoken again calm and natural at a slow pace. A recording to clone is best recorded that way. Pace words in `--style` or a note skew the voice, so they stay out (`tts/voxcpm2.md`). A take outside the range needs another reference: a recording at the pace wanted, or a new `--seed`. It is never time-stretched, and `--speed` is ignored for it. A stretch turns its faint crackle in an "s" into audible static.
  - **Kokoro:** `--speed` sets its speed natively.
  - **Other engines:** `--speed` time-stretches the result (`0.85` is 15% slower, pitch kept).
  - **Target:** `--pace 4.2` sets another target, for a calmer or brisker read. `"tts": { "speed": 0.9, "pace": 4.3 }` sets both for every video.

## Text to speech

`speak script.txt` writes `assets/voiceover.wav`, and `assets/voiceover.txt` beside it without the pause marks (for captions and `transcribe`). A source script at that path keeps its marks: the spoken words then go to `voiceover.spoken.txt`. With `--written script.txt`, `voiceover.txt` holds the written script's words and punctuation instead. Set `"voiceover": { "file": …, "script": … }` as `speak` prints it.

- **Engine:** choosing one, and the steps for any engine: `references/tts.md`. Each engine's voice, delivery and writing rules: its guide in `references/tts/`.

### Prepare the script for speech

A voice reads only the text. Its punctuation, spelling and word order are all it has for pauses, stress and pronunciation. When the user supplied the audio, none of this applies.

Otherwise, work in this order:

1. **Pick the engine** (`references/tts.md`).
2. **Read its guide** (`references/tts/<engine>.md`) before writing. Marks, notes and tags behave differently per engine.
3. **Prepare the whole script** before `speak`, with the steps below.

Steps to prepare the script:

1. **Run `speak script.txt --review`.** It generates nothing. It lists what a voice is likely to misread:
   - Flags, file names and addresses.
   - Letters mixed with digits, and digits outside English.
   - A missing breath after an opening word.
   - Sentences of 9 words or more with no breath.
   - Lines with no end punctuation.
   - With VoxCPM2: a question without its own delivery note, or sharing its line with other sentences.
2. **Punctuate for the ear, not for grammar.** To a voice, a comma is a pause, and a pause is emphasis. It lets the listener rest, and it gives weight to the word before or after it. Put a mark where the listener pauses, or where a word lands, never only where grammar puts one. The voice pauses only where the text marks it. How long each mark pauses depends on the engine. Its guide in `references/tts/` gives the measured lengths.

   - **Comma:** a short breath, wherever a listener needs a break, even where grammar has none:

     | Breath                             | Written                            | Spoken                                       |
     | ---------------------------------- | ---------------------------------- | -------------------------------------------- |
     | After an opening word              | Then the bees seal it.             | Then, the bees seal it.                      |
     | After the subject, before its verb | The morning train leaves at six.   | The morning train, leaves at six.            |
     | Around a middle "then"             | It cools then the glaze goes on.   | It cools, then, the glaze goes on.           |
     | Before a joined phrase             | They pack the boxes and load them. | They pack the boxes, and load them.          |
     | A closing "too", either way        | Bring a friend too. (runs on)      | Bring a friend, too. (a pause, for emphasis) |

     Grammar forbids the comma between a subject and its verb, and a voice needs it most there. Which breaths a line takes is the writer's call. "So, how long does it take?" and "So how long does it take?" ask different things.

   - **Other marks:**
     - Period: a full stop.
     - Ellipsis: a held or trailing pause.
     - Em dash: a set-off aside.
     - Question mark: a rising end.

     Their lengths, and whether a mark pauses at all, differ by engine (its guide).

   Read each sentence as it will be heard. A word after a noun can be a noun or a verb ("the project records sound"). The voice reads it as part of the noun, unless a comma or a rewording separates them. After a VoxCPM2 take, re-roll a stray pause instead. Any edit to the text draws its whole part again (Speech check).

   - **Two scripts:** ear punctuation reads as errors in captions. Keep the grammar version in its own file, with the same words, and pass both: `speak ear.txt --written script.txt`. The voice speaks the ear script. Captions, `transcribe` and phrase spans show the written one. `speak` stops before any audio when their words differ. Only punctuation, case and spacing can differ.

3. **Give every unusual token a spoken form** with `{written|spoken}`. Unusual tokens are names, acronyms a voice reads as a word, symbols, file names and versions.
4. **End every question with "?"**, and every statement with a period. With VoxCPM2, a question also needs a line of its own with a delivery note. Without one, the take's delivery can flatten it into a statement (`tts/voxcpm2.md`). `--review` flags a question without one.
5. **Run `--review` again**, then `speak`.

After `speak`, its check reports what still went wrong in the audio (Speech check, below).

### Pauses

| In the script              | Pause                          |
| -------------------------- | ------------------------------ |
| Line break                 | 0.45 s breath                  |
| Blank line                 | 0.8 s beat between story parts |
| Sentence end inside a line | 0.3 s                          |
| `[pause]` / `[pause 1.2]`  | 0.6 s / exactly 1.2 s          |

Kokoro, Hugging Face models and the user's TTS keep every mark exact. VoxCPM2 speaks the script as one take and sets its pauses from punctuation. `speak` then sets the silence at each blank line and `[pause]` mark to its length (`tts/voxcpm2.md`).

### Joining takes

Any engine that gives separate takes, or any recording cut into parts, needs these when the parts are joined:

- **Exact silence between takes.** Never rely on a model's own pause at a full stop. It is short and uneven, and a list of short sentences runs together. Put each short sentence of a list in its own take, with a set gap.
- **A silent pause at every section change.** At a chapter or scene-group change, add 0.8 to 1.2 s to the usual gap. Joining takes with only the usual gap shows the cut as an abrupt stop.
- **Listen at every join.** Hear each chapter change and each list. A gap that feels abrupt takes a longer pause.
- **Fade every take.** At least 100 ms out and 20 ms in. A take must never end or begin dead against silence.
- **Read the end of every take.** A take that ends while the voice is still loud lost its last syllable. Regenerate it, or cut the sentence so the take ends on a falling word.
- **Punctuate for the ear first.** A long sentence with no commas runs on. Break it where a listener breathes.

Per engine: `tts/elevenlabs.md` and `tts/voxcpm2.md`.

### Scenes that follow the narration

Time every scene of a narrated video to its words.

1. Run `transcribe`. It writes `out/voice/words.json`.
2. Copy `templates/timeline.mjs` to `tools/` and `templates/words.js` to `lib/`.
3. Write `chapters.json`, one entry per scene in order: `{"id": "03-scattered", "start": "first words of the scene", "chapter": "optional YouTube title"}`.
4. Run `node tools/timeline.mjs [tail]`. It sets each scene's duration in `video.json` and writes `out/anchors.js`. A scene starts 0.55 s before its first word. The last scene holds `tail` seconds after the last word (default 4.5). Scenes with a `chapter` title also print as YouTube chapter lines.
5. In each scene, load `../out/anchors.js`, then `../lib/words.js`. Use `at("phrase")`, `endAt("phrase")`, `data-w="phrase"` and `data-w-out="phrase"` (header of `words.js`).
6. Run steps 1 and 4 again after every change to the voice or to `chapters.json`.

### Writing for a generated voice

- **Numbers:** in languages other than English, write them as words. A voice can read digits in English. Captions show the spoken words.
- **Written and spoken forms:** when a name or term must be said differently from how it is written, write both: `{SQL|sequel}`, `{v2.1|version two point one}`, `{km/h|kilometres per hour}`. Captions and on-screen text show the written form. The voice says the spoken form, and the speech check listens for it. Never write a spelled-out form alone, or captions show it.
- **Engine rules:** delivery notes, tags and other engine-specific writing live in the engine's guide.

### Voice polish

`speak` processes the generated voice as its own layer and reports what it did. Only the loudness step works sentence by sentence. `--raw` skips it.

- **No time stretch:** polish never changes the pace. A stretch turns a voice's faint crackle in an "s" into audible static.
- **Loudness:** each sentence's speech moves toward the median level, by at most 6 dB, with 40 ms ramps. A long take tends to start louder than it goes on.
- **Compression:** a gentle compressor evens loud and soft syllables. It runs before de-essing, since it lifts the soft parts, an "s" among them.

  | Setting   | Value   |
  | --------- | ------- |
  | Threshold | -22 dB  |
  | Ratio     | 1.5     |
  | Soft knee | 30 dB   |
  | Attack    | 2 ms    |
  | Release   | 450 ms  |
  | Make-up   | +3.6 dB |

- **De-essing:** an "s" can rise above the voice's vowels. There, the 4.5–11 kHz band is turned down to 4 dB under them.
- **Normalizing:** last, the whole voice is centered on zero with its peak at -1 dB. A long take then ends balanced.

The user's own recordings never pass through it.

### Speech check

`speak` transcribes every take and compares it with the script.

- **Words:** extra speech (babble after the text, a stray word) and missing words.
- **Numbers:** every number must be heard as the script says it.
- **Glitches (VoxCPM2):** a click in a pause is smoothed in place. A thump before or after the speech is silenced in place. Speech itself is never edited: inside a word, a /t/ or /k/ burst has a click's shape. A click the repair leaves is marked `ok ?`: listen to it. A take cut off mid-sound is spoken again. Every take's edges fade over a few milliseconds, so joins never click.
- **Doubtful words:** when a passing phrase has words heard differently, a second Whisper model hears it too. A word both models miss is marked `ok ?`: listen to it.
- **Stray pauses:** a pause over 0.45 s between two words with no punctuation between them is marked `ok ?`. A voice phrases by how it reads the grammar. A noun-or-verb word can pull the pause astray: "the support team calls each customer".
  - Kokoro and other engines: a comma where the break belongs, or a rewording, sets it.
  - VoxCPM2: listen to it, and `--reroll` the part if it is heard. An edit to the text draws the whole part again, and the new take can pause somewhere else. Each stray pause counts against a take, so retries and re-rolls keep the take with fewer.
- **`ok ?` without audio playback:** fix the part, then run `speak` again. The line is settled when both recognizers hear it as written.
  - Kokoro and other engines: reword the line, or give the name a spoken form (`{written|spoken}`).
  - VoxCPM2: `--reroll` the part first, for a doubtful name as well as a stray pause or pitch peak. Re-roll it up to 3 times. A spoken form or a rewording draws the whole part again, and the new take can go wrong somewhere else. Give the name a spoken form only when the re-rolls still miss it.
- **Delivery (VoxCPM2):** a part can peak above 1.6 times the voice's usual pitch. It is marked `ok ?`, since it can sound shouted or excited. Listen, then calm its note or re-roll it.

- **Per engine:** VoxCPM2 checks each take and regenerates a failing one under a new seed, up to 3 tries. A take that fails every try is spoken again by beats, then by sentences. Other engines get one check of the whole file.
- **Output:** every part as heard, then a summary that counts the parts marked `ok ?`. Only a problem exits 1. An `ok ?` part exits 0 and needs a listen. A remaining problem prints its fix: reword it, or re-roll it where the engine allows (`tts/voxcpm2.md`).
- **`--language`** sets the recognizer's language.

### Phrase spans

`speak` writes where each phrase sits in the audio (`voiceover.phrases.json`). `transcribe` keeps each phrase's words inside its span, so no word drifts across a pause.

## Time the picture to the words

1. **Transcribe:** `transcribe` prints each word at its video time (local Whisper). With no file named, it reads the manifest's narration. It writes `out/voice/words.json`, the video timeline captions read. It also writes `out/voice/<name>.words.json` per narration file. With a file named, it writes only `out/voice/<name>.words.json`.
   - With a script (`voiceover.script`, a scene's `script`, or `--script`), the script's words take the recognized times.
   - A voiceover longer than the scenes is still read, with the overrun printed.
   - `transcribe` runs in `blazr` when installed. Otherwise the first run installs the speech runtime (about 500 MB).
   - `blazr` loads Whisper safetensors (`openai/whisper-base`, `openai/whisper-small`) and downloads a missing one on first use. A model with ONNX or `.bin` weights only makes `blazr` exit 3, and the skill's own runner takes over.
2. **Plan to it:** in `direction.md`, give each beat the words it plays under. Place cuts in pauses between phrases.
3. **Time to it:** set each entrance's `--t` from the word times. A line lands about 0.2 s before its first word, a verb moment on its word.
4. **Mark it:** give every on-screen line that repeats the narration `data-say`, or `data-say="the spoken phrase"` when the text differs. `check` fails a line that is off screen while its words are spoken. It warns when one appears late or leaves early.

- **Accuracy:** word starts land within about 0.1 s. A word after a pause starts where its sound rises. Every word ends where its sound stops. Matching allows about one misheard word in four. Numbers and words of 4 letters or fewer match only exactly.
- **Language and model:** pass `--language` for narration outside English. It then uses the small model (`onnx-community/whisper-small_timestamped`), which hears other languages better. English uses the faster base model. `--model` or `"asr": { "model": "…" }` overrides.
- **Per scene or whole video:** `"voiceover"` plays one file across the video. A scene's `"audio"` plays narration cut per scene, and the scene lengthens to fit it.
- **After a change:** run `transcribe` again after replacing the audio or the script.

## Captions

A word-synced caption track: `<div class="captions" data-captions="../out/voice/words.json"></div>`, in every scene that shows it.

- **Ask first:** captions are the user's decision. Never add a caption track on your own.
  - **Choices:** burned-in captions, a subtitle file (`.srt`, `.vtt`), both, or neither.
  - **Consent:** burned-in captions and a subtitle file each need the user's yes.
  - **Default:** neither, when the user has not said.
- **Text-heavy videos:** the scenes can already carry labels, statements and annotations that follow the narration. A caption track then repeats them. Leave it out. Keep the bottom band clear only if the user wants subtitles added later.
- **Without narration:** a caption-track copy system is on-screen copy, one line per beat (`direction.md`, §7). Use it only when the user asked for captions, or the picture carries no other text.
- **Subtitle file:** a separate deliverable from the video. Copy `templates/subtitles.mjs` to `tools/` and run it. It writes `out/subtitles.srt` and `out/subtitles.vtt` from `out/voice/words.json`: at most two lines of 42 characters, 1 to 6 s per cue. The video itself stays clean.

- **Lines:** words group into lines of at most `data-max` words (default 3), breaking at punctuation and pauses. A line shows from its first word until the next line.
- **Highlight:** the spoken word carries `.on` (a pill in `--caption-on`). Every spoken word carries `.said`, for a fill-as-you-speak style.
- **Place and style:** `--captions-y` sets the distance from the bottom. `--caption-edge` colors the solid outline that keeps white words readable on any frame. Restyle `.captions` and `.captions .w.on` freely. Keep other text out of the caption band.
- **Outline:** it takes the fill's opposite tone. An outline in the fill's own tone fills in the letters, and `check` warns on it. A fixed box behind the caption band never fits, since lines differ in length.
- **Exact words:** captions show the script's words when the narration has a script, else the recognized words. Give TTS narration its script.
- **Timing:** captions follow the transcript on the video clock, so they stay in sync across cuts. `check` skips reading time for captions, since the speech sets their pace.
- **Contrast:** `check` measures each word in its colors at that frame. A word on its pill is measured against the pill. A `-webkit-text-stroke` counts as its edge.

## Check the result

- **In `check`:** `data-say` lines are held to their words. A missing transcript fails with the command to run.
- **Round trip:** after `render`, run `transcribe out/video.mp4 --script assets/voiceover.txt`. Compare `heard` in its words file with the script. A mismatch shows a mispronounced or cut-off word, or a recognizer's spelling of a name. `transcribe` drops words heard in digital silence, which a recognizer can invent after the last line.
- **Effects under speech:** caps, `check` and `audit` rules are in `sound.md`, Under a voice or music.
- **Listen:** when audio playback is available, listen once through. Report when it was not.
