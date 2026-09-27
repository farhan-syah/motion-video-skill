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
| Nothing about voice                                                 | No narration unless the video needs it. On-screen text carries the copy. Ask when it matters (SKILL.md, step 3).                                                             |

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

- **First line orients:** it names the subject or the question, before any scenario ("Three ways to cut your water bill.", not "So you open the app.").
- **Pace:** `speak` aims at about 4.1 syllables per second while speaking (3.5 to 4.7), a relaxed explainer. Match it to the narration: a lesson reads slower, a launch or an ad faster. A natural take inside the range needs no change. `speak` prints the pace and how to reach the range.
  - **VoxCPM2:** the reference sets most of the pace. A designed voice is spoken again calm and natural at a slow pace, and a recording to clone is best recorded that way. Pace words in `--style` and every delivery note ("slow pace") adjust it (`tts/voxcpm2.md`). It is never time-stretched: a stretch turns its faint crackle in an "s" into audible static, so `--speed` is ignored for it.
  - **Kokoro:** `--speed` sets its speed natively.
  - **Other engines:** `--speed` time-stretches the result (`0.85` is 15% slower, pitch kept).
  - **Target:** `--pace 4.2` sets another target, for a calmer or brisker read. `"tts": { "speed": 0.9, "pace": 4.3 }` sets both for every video.

## Text to speech

`speak script.txt` writes `assets/voiceover.wav`, and `assets/voiceover.txt` beside it without the pause marks (for captions and `transcribe`). A source script at that path keeps its marks: the spoken words then go to `voiceover.spoken.txt`. With `--written script.txt`, `voiceover.txt` holds the written script's words and punctuation instead. Set `"voiceover": { "file": …, "script": … }` as `speak` prints it.

- **Engine:** choosing one, and the steps for any engine: `references/tts.md`. Each engine's voice, delivery and writing rules: its guide in `references/tts/`.

### Prepare the script for speech

A voice reads only the text. Its punctuation, spelling and word order are all it has for pauses, stress and pronunciation. When the user supplied the audio, none of this applies. Otherwise, pick the engine first (`references/tts.md`) and read its guide (`references/tts/<engine>.md`): marks, notes and tags behave differently per engine. Then prepare the whole script before `speak`:

1. **Run `speak script.txt --review`.** It generates nothing and lists what a voice is likely to misread: flags, file names and addresses, letters mixed with digits, digits outside English, a missing breath after an opening word, sentences of 9 words or more with no breath, lines with no end punctuation, and with VoxCPM2 a question without its own delivery note or sharing its line with other sentences.
2. **Punctuate for the ear, not for grammar.** To a voice, a comma is a pause, and a pause is emphasis: it lets the listener rest, and it gives weight to the word before or after it. Put a mark where the listener should pause, or where a word should land, never only where grammar puts one. The voice pauses only where the text marks it. How long each mark pauses depends on the engine: its guide in `references/tts/` gives the measured lengths.

   - **Comma:** a short breath, wherever a listener needs a break, even where grammar has none:

     | Breath                             | Written                            | Spoken                                       |
     | ---------------------------------- | ---------------------------------- | -------------------------------------------- |
     | After an opening word              | Then the bees seal it.             | Then, the bees seal it.                      |
     | After the subject, before its verb | The morning train leaves at six.   | The morning train, leaves at six.            |
     | Around a middle "then"             | It cools then the glaze goes on.   | It cools, then, the glaze goes on.           |
     | Before a joined phrase             | They pack the boxes and load them. | They pack the boxes, and load them.          |
     | A closing "too", either way        | Bring a friend too. (runs on)      | Bring a friend, too. (a pause, for emphasis) |

     Grammar forbids the comma between a subject and its verb, and a voice needs it most there. Which breaths a line takes is the writer's call: "So, how long does it take?" and "So how long does it take?" ask different things.

   - **Period, ellipsis, em dash and question mark:** a full stop, a held or trailing pause, a set-off aside, and a rising end. Their lengths, and whether a mark pauses at all, differ by engine (its guide).

   Read each sentence as it will be heard. A word that can be a noun or a verb after a noun ("the project records sound") is read as part of the noun unless a comma or a rewording separates them.

   - **Two scripts:** ear punctuation reads as errors in captions. Keep the grammar version in its own file, with the same words, and pass both: `speak ear.txt --written script.txt`. The voice speaks the ear script. Captions, `transcribe` and phrase spans show the written one. `speak` stops before any audio when their words differ. Only punctuation, case and spacing can differ.

3. **Give every unusual token a spoken form** with `{written|spoken}`: names, acronyms a voice reads as a word, symbols, file names, versions.
4. **End every question with "?"**, and every statement with a period. With VoxCPM2, a question also needs a line of its own with a delivery note, or the take's delivery can flatten it into a statement (`tts/voxcpm2.md`). `--review` flags a question without one.
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

### Writing for a generated voice

- **Numbers:** in languages other than English, write them as words. A voice can read digits in English. Captions show the spoken words.
- **Written and spoken forms:** when a name or term must be said differently from how it is written, write both: `{SQL|sequel}`, `{v2.1|version two point one}`, `{km/h|kilometres per hour}`. Captions and on-screen text show the written form. The voice says the spoken form, and the speech check listens for it. Never write a spelled-out form alone, or captions show it.
- **Engine rules:** delivery notes, tags and other engine-specific writing live in the engine's guide.

### Voice polish

`speak` processes the generated voice as its own layer and reports what it did. Only the loudness step works sentence by sentence. `--raw` skips it.

- **No time stretch:** polish never changes the pace. A stretch turns a voice's faint crackle in an "s" into audible static.
- **Loudness:** each sentence's speech moves toward the median level, by at most 6 dB, with 40 ms ramps. A long take tends to start louder than it goes on.
- **Compression:** a gentle compressor evens loud and soft syllables: threshold -22 dB, ratio 1.5, a 30 dB soft knee, 2 ms attack, 450 ms release, +3.6 dB make-up. It runs before de-essing, since it lifts the soft parts, an "s" among them.
- **De-essing:** where an "s" rises above the voice's vowels, the 4.5–11 kHz band is turned down to 4 dB under them.
- **Normalizing:** last, the whole voice is centered on zero with its peak at -1 dB, so a long take ends balanced.

The user's own recordings never pass through it.

### Speech check

`speak` transcribes every take and compares it with the script.

- **Words:** extra speech (babble after the text, a stray word) and missing words.
- **Numbers:** every number must be heard as the script says it.
- **Glitches (VoxCPM2):** a click in a pause is smoothed, and a thump before or after the speech is silenced, in place. Speech itself is never edited: inside a word, a /t/ or /k/ burst has a click's shape. A click the repair leaves is marked `ok ?`: listen to it. A take cut off mid-sound is spoken again. Every take's edges fade over a few milliseconds, so joins never click.
- **Doubtful words:** when a passing phrase has words heard differently, a second Whisper model hears it too. A word both models miss is marked `ok ?`: listen to it.
- **Stray pauses:** a pause over 0.45 s between two words with no punctuation between them is marked `ok ?`. A voice phrases by how it reads the grammar, so a word that can be a noun or a verb ("the support team calls each customer") can pull the pause to the wrong place. A comma where the break belongs, or a rewording, sets it.
- **`ok ?` without audio playback:** reword the line, or give the name a spoken form (`{written|spoken}`), then run `speak` again. The line is settled when both recognizers hear it as written.
- **Delivery (VoxCPM2):** a part whose pitch peaks above 1.6 times the voice's usual pitch is marked `ok ?`: it can sound shouted or excited. Listen, then calm its note or re-roll it.

- **Per engine:** VoxCPM2 checks each take and regenerates a failing one under a new seed, up to 3 tries. A take that fails every try is spoken again by beats, then by sentences. Other engines get one check of the whole file.
- **Output:** every part as heard. A remaining problem prints its fix and exits 1: reword it, or re-roll it where the engine allows (`tts/voxcpm2.md`).
- **`--language`** sets the recognizer's language.

### Phrase spans

`speak` writes where each phrase sits in the audio (`voiceover.phrases.json`). `transcribe` keeps each phrase's words inside its span, so no word drifts across a pause.

## Time the picture to the words

1. **Transcribe:** `transcribe` prints each word at its video time (local Whisper). With no file named, it reads the manifest's narration and writes `out/voice/words.json`, the video timeline captions read, plus `out/voice/<name>.words.json` per narration file. With a file named, it writes only `out/voice/<name>.words.json`.
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
- **Outline:** it takes the fill's opposite tone. An outline in the fill's own tone fills in the letters, and `check` warns on it. A fixed box behind the caption band never fits, since lines differ in length.
- **Exact words:** captions show the script's words when the narration has a script, else the recognized words. Give TTS narration its script.
- **Timing:** captions follow the transcript on the video clock, so they stay in sync across cuts. `check` skips reading time for captions, since the speech sets their pace.
- **Contrast:** `check` measures each word in its colors at that frame. A word on its pill is measured against the pill. A `-webkit-text-stroke` counts as its edge.

## Check the result

- **In `check`:** `data-say` lines are held to their words. A missing transcript fails with the command to run.
- **Round trip:** after `render`, run `transcribe out/video.mp4 --script assets/voiceover.txt`. Compare `heard` in its words file with the script. A mismatch shows a mispronounced or cut-off word, or a recognizer's spelling of a name. `transcribe` drops words heard in digital silence, which a recognizer can invent after the last line.
- **Effects under speech:** the voice leads. Use an effect only for a reason the voice does not give: a transition, the payoff. At most 2 in a scene, each in a pause.
  - `check` warns on an effect over a word and names the next pause. It also warns on more than 2 in a scene.
  - `audit` judges effects on their own stem (`out/voice/effects.wav`). It warns when the voice masks one by more than 12 dB.
- **Listen:** when audio playback is available, listen once through. Report when it was not.
