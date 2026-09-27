# VoxCPM2

OpenBMB's VoxCPM2 (Apache 2.0): 30 languages, voices designed from a description or cloned from a recording, 48 kHz. `speak --engine voxcpm`, the default on a machine with an NVIDIA GPU of 8 GB and `uv`.

- **Languages:** Arabic, Burmese, Chinese, Danish, Dutch, English, Finnish, French, German, Greek, Hebrew, Hindi, Indonesian, Italian, Japanese, Khmer, Korean, Lao, Malay, Norwegian, Polish, Portuguese, Russian, Spanish, Swahili, Swedish, Tagalog, Thai, Turkish, Vietnamese. Also 9 Chinese dialects, Cantonese among them.
- **First run:** `uv` builds a Python environment, and a 4.7 GB model downloads unless a checkpoint is on disk. `--device cpu` works, very slowly.

## How `speak` uses it

1. **The voice:** with `--voice`, it designs a reference once by speaking the script's opening (25 words or more) and saves it as `<out>.voice.wav`. With `--reference`, the user's recording is the voice.
2. **The narration:** the whole script is one generation, one take, cloning that reference. Each generation is a separate draw of the voice, so one take keeps it the same person from start to end. A line with its own delivery note is its own short generation, a timed script keeps each line apart, and a script over 700 words splits at a sentence end. One generation can run to about 11 minutes of audio.
3. **The shape:** the script's words are found in the take. Each sentence gets its own span, and the silence at each blank line and `[pause]` mark is set to its length.
4. **The check:** the take is heard back as a whole. A failing take regenerates under a new seed, up to 3 tries, and the best is kept. A take that fails every try is spoken again by beats, then by sentences.
5. **The polish** (`narration.md`, Voice polish) evens its loudness and de-esses it. Its pace is set in the take, from `--style` or a delivery note. A time stretch turns its faint crackle in an "s" into audible static.

## The voice

- **Describe it** in English in three layers. Who: gender, age, role. Texture: pitch, timbre. Delivery: emotion and scenario. The words steer the read: presenter words ("friendly", "confident", "energetic") give an ad read, and a scenario ("talking to one person", "telling a story at night") gives its own delivery.

  | Narration          | Example `--voice` (a range, never a menu)                                                                               |
  | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
  | Lesson or tutorial | `"(A man in his thirties with a deep, warm voice. Calm and unhurried, explaining something to one person he knows.)"`   |
  | Product launch     | `"(A woman in her late twenties with a bright, clear voice. Upbeat and confident, presenting a new product on stage.)"` |
  | Documentary        | `"(An older man with a low, textured voice. Measured and thoughtful, narrating a nature documentary.)"`                 |
  | Children's story   | `"(A young woman with a soft, gentle voice. Playful and warm, reading a bedtime story to a child.)"`                    |

- **Always design one.** Without `--voice` or `--reference`, the model picks its own voice.
- **Listen to `<out>.voice.wav` first** for the voice itself: its timbre, age and accent. If it is wrong, change `--voice` or `--seed`. A new seed designs a new voice. It is the clip cloned from, not the finished sound: VoxCPM2 takes its timbre and pace and generates the audio fresh, so a crackle in its "s" can be absent from the takes. Judge sound quality in the takes.
- **Clone** with `--reference voice.wav`: 5 to 30 s of clean speech, only the user's own voice, or a voice they have consent to use. Cloning is the sure way to a specific accent: a described voice drifts toward the model's most common accent.
- **Hi-Fi cloning (`--hifi`):** clones from the reference and its exact transcript, which holds the voice closer to it. A designed voice keeps the words it was designed on, and a user's recording is transcribed with Whisper. VoxCPM2 ignores `--style` in this mode; a line's own delivery note still applies to that line.
- **One voice holds:** every `speak` call with the same `--voice`, `--seed` and `--language` clones the same reference, so per-scene files match. `--reference <out>.voice.wav` gives another video the same voice.

## Delivery

- **Write an instruction as sound:** tone, emotion and pace, the way VoxCPM2's guide does: `(slightly faster, cheerful tone)`, `(speaking very fast, bright and full)`. Describe how the voice behaves, never what the line means: `(curious tone, rising intonation)`, not `(asking a question)`.
- **`--style "(calm, warm tone, slow pace)"`** steers every generation. It changes emotion, pace and delivery, never the voice.
- **The reference sets the pace:** a clone speaks near its reference's pace. Measured on one voice, with the same style and no pace words, a reference at 4.3 syllables per second (pauses included) gave clones at 5.0, and a reference spoken slowly, at 3.8, gave 3.9. A clone also takes the reference's manner: an emphatic reference, with a harsh "s", gives emphatic clones. So a designed voice speaks its opening again from itself, calm and natural at a slow pace, and that becomes the reference (once more, very slowly, if it is still faster than 3.9). Without "natural", the re-spoken reference sounded angry. The design as first spoken stays in the cache as `voice-<key>.design.wav`. A breathy reference, with breath between its words, gives clones a stray "hh" through their words. So the breaths in a reference's pauses are turned down by 20 dB, the speech untouched: a designed voice's reference in place, and a user's recording through a copy in the cache (the recording itself is never changed). Record a voice to clone calm and natural, at the pace the narration wants.
- **Pace is set in the take:** `speak` never time-stretches VoxCPM2. Pace words move it less than the reference does. Measured on one voice and excerpt (syllables per second while speaking):

  | Pace words        | Pace |
  | ----------------- | ---- |
  | none              | 5.0  |
  | "unhurried pace"  | 5.1  |
  | "slow pace"       | 4.3  |
  | "speaking slowly" | 4.2  |

  A delivery note replaces `--style`, so a pace in `--style` never reaches a noted line: write it into each note too.

- **Delivery notes** open a line and replace `--style` for that line only, as its own generation, since an instruction covers everything a generation speaks: `(calm, curious tone, rising intonation) Where does the water go?`.
  - A question spoken in the beat's delivery reads as a statement. A note gives it its own intonation.
  - A short note that keeps one word of the base tone changes the line and holds the voice. A note without it swings the line far from the rest, and one appended to a long style is outweighed by it.
- **How notes behave:**
  - A note is direction for one line: where its delivery should differ from the base, such as a question, a turn, a reveal or a close. Where and how often is the writer's call.
  - Each noted line is its own generation, so each note is one more draw of the voice.
  - A note describes delivery, never the voice. Words for pitch, age, gender or timbre ("low", "deep", "young", "husky") belong in `--voice`. In a note or `--style` they ask for a different speaker, and the line drifts from the reference.
  - A note written as a way of speaking follows VoxCPM2's own guide: `(Speaking slowly with a whispering, mysterious tone)`.
  - Tone and intonation notes change the line's melody. In one test, notes asking for slowness ("slower", "patient", "drawing the listener in") also added pauses inside the sentence.
  - Energy words ("animated", "bright", "excited", "energetic") push the voice toward shouting. `--style` sets the base once for every line without a note.
- **A directed script,** as one example of direction where the script turns, never a template. Narrative lines keep the base delivery, and a note marks the question, the reveal, the moment of wonder and the close:

  ```text
  (Asking warmly, with genuine curiosity, rising at the end) Ever wondered where honey actually comes from?

  It starts with one bee… and one flower.
  She drinks the nectar, stores it in a second stomach, and flies home.

  (Speaking with a hint of a smile, like sharing a clever trick) Then comes the clever part. The bees fan their wings, hundreds of them at once, until most of the water is gone.

  (calm, curious tone, rising intonation) And one bee, over her whole life?
  (Speaking softly, with quiet wonder) She makes about a twelfth of a teaspoon.

  (Speaking warmly, bringing it to a gentle close) So next time you open a jar… that's the work of thousands of bees.
  ```

- **Expression:** one `--style` over every line, with no notes or tags, gives an even read across the whole video. Emotion comes from notes where the feeling changes and tags where a person would make the sound. Contractions, questions and asides in the script change the read before any note does.
- **Results vary between runs:** re-roll a line whose delivery misses (`--reroll`), up to 3 times.
- **Non-verbal tags**, written where the sound happens: `[laughing]`, `[sigh]`, `[Uhm]`, `[Shh]`, `[Question-ah]`, `[Question-ei]`, `[Question-en]`, `[Question-oh]`, `[Surprise-wa]`, `[Surprise-yo]`, `[Dissatisfaction-hnn]`. VoxCPM2's guide advises using them sparingly, at most one per sentence, in lowercase where the tag has it.
- Notes and tags are never shown in captions or checked.

## Writing for it

- **Marks, measured on VoxCPM2:**

  | Mark         | Pause                         | Emphasis                                 |
  | ------------ | ----------------------------- | ---------------------------------------- |
  | Comma `,`    | Short                         | Light: the word before or after it lands |
  | Em dash `—`  | Longer, 0.5–0.7 s in one test | Strong: the word after it lands hard     |
  | Ellipsis `…` | Held, trailing                | Suspense, or a thought left open         |
  | Period `.`   | A full stop                   | The end of a thought                     |

  Write the em dash itself, with a space on each side: a hyphen does not pause. A pair of em dashes sets off an aside.

- **Pauses inside a beat** come from punctuation: a period or question mark gives a clear pause, a comma a short one, an em dash "—" a longer one with more weight on the next word, "…" a hesitation. Split a sentence for a stronger pause. Only blank lines and `[pause]` marks are exact.
- **Short beats:** a beat of one or two words fails far more often. Join it to the line before or after.
- **Numbers:** in languages other than English, write them as words.

## Takes and settings

- **Takes are cached** by voice, delivery, text and seed (`~/.cache/motion-video/speak/voxcpm`). A re-run speaks only changed beats.
- **`<out>.takes.json`** records each chosen take and the voice's seed. A later run without `--seed` keeps both. A different `--seed` starts over. Keep the file beside the audio: moving the old audio aside keeps its takes only when this file stays.
- **A part's first seed comes from its text,** so adding or splitting a line leaves every other part's take as it was.
- **`--reroll 3,5`** draws new takes for those beats. The earlier take stays in the running, so a worse draw never replaces it.
- **`--cfg 1.6 --steps 16`** by default. Guidance 1.0–2.0 is relaxed and natural, and above 2.0 follows the text more strictly with more noise. More steps (up to 30) are more natural and slower.
- **Checkpoint:** loads offline from `"tts": { "checkpoint": "/path" }`, the model folder, or the Hugging Face cache. `doctor` names the one it finds.
- **Out of GPU memory:** `speak` says how much is free. Another process holds the rest (`nvidia-smi` lists it).
- **Quantized (GGUF):** run its runner through `--command` (`command.md`), shaped like `"<runner> --gguf voxcpm2-q6_k.gguf --text {text} --ref {reference} --out {out}"`.
