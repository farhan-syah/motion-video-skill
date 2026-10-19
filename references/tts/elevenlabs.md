# ElevenLabs

The user's paid ElevenLabs account, through the API. Not a `speak` engine: it runs from the template `templates/tts-elevenlabs.mjs`, copied into the project: `mkdir -p tools && cp <skill-dir>/templates/tts-elevenlabs.mjs tools/`. It needs `ELEVENLABS_API_KEY`, or a `.env` in the project, or `~/.config/elevenlabs/api_key`. The key is never printed, logged or put in a request other than its header. A paid plan is required for the API: a free plan returns 402.

Ask the user for the voice and pass its id as `ELEVEN_VOICE`. The template has no default voice. Use the model they choose.

- **Default model:** the template defaults to `eleven_v4`. In October 2026 it was the newest model (90+ languages), and `eleven_multilingual_v2` was legacy.
- **Current models:** run `GET /v1/models` for what the account offers now.
- **Changing the model:** listen to 3 representative sentences first.

## How the template works

- **Two files:** `ear.txt` is what the voice speaks. `script.txt` is the written words for `transcribe` and captions. Their paragraphs (blank-line blocks) must match one to one. Only punctuation, case and spacing can differ, plus `{written|spoken}` forms.
- **One take per piece, not per script.** A piece is a line, or the text between `[pause]` marks. Each take is sent with the previous and next piece as context (`previous_text`, `next_text`), so intonation carries across the cuts. Each take is cached by its inputs, so a re-run pays only for changed text.
The general rules for joining takes are in `narration.md`, Joining takes. The template applies them as follows.

- **Exact silence between takes.** The template sets every gap itself:

  | In `ear.txt`         | Silence after the take                                  |
  | -------------------- | ------------------------------------------------------- |
  | Line break           | 0.45 s, and a new take                                  |
  | `[pause]`            | 0.6 s, and a new take                                   |
  | `[pause N]`          | exactly N s, and a new take                             |
  | Blank line           | 0.8 s (1.1 s after a question)                          |
  | `[section]` block    | 0.8 s more, at a chapter change (`[section N]`: N s more) |

  The marks match the skill's `speak` marks (`narration.md`, Pauses). `speak` has no `[section]` mark. In the template it is a block of its own, not a paragraph. `script.txt` has no block for it.
- **Fades:** 20 ms in and 120 ms out, set in the template (`ELEVEN_FADE_OUT`).
- **Tail check.** The template reads the mean level of the last 120 ms of each take. A take above -42 dB ended while the voice was still loud: its last syllable is clipped. It retries with another seed up to 4 times and keeps the quietest end. A few takes can stay loud after the retries (a word that ends hard). The fade covers them. Listen to these.

## What differs from VoxCPM2 and Kokoro

| | ElevenLabs | VoxCPM2 | Kokoro |
| - | - | - | - |
| Pause at a full stop | Short and uneven. Never rely on it. | Set by punctuation, then `speak` resets blank lines and `[pause]` marks | Exact marks |
| Pause marks inside a take | `<break time="1.0s" />` works on Multilingual v2 and Flash (up to 3 s). Overuse speeds the speech or adds noise. Eleven v3 and v4 do not take it: they use audio tags such as `[pause]` and punctuation. Users report breaks ignored on some voices. | Not used | Not used |
| What fixes a run-on list | Separate takes with exact silence | `[pause]` marks, a delivery note per line | Marks |
| A clipped end | Check the tail level, retry the take | `speak` checks and retries | Not seen |
| Delivery notes | Not supported: they are dropped | Delivery notes, `--style` | `--speed` only |
| Takes | Per piece, cached, seed retry | One take, `--reroll` | One pass |

- **Do not use `<break>` tags as the main method.** They depend on the model and the voice. Separate takes with exact silence work on every model.
- **Ear punctuation** (`narration.md`, Prepare the script for speech) applies unchanged. Add a `[pause 0.3]` only where a comma is too short.
- **Seed:** each take uses a seed built from its paragraph and piece number. A retry or an edit then changes only that take.

## Check the result

- Run `transcribe` and compare the heard words with `script.txt` (`narration.md`, Check the result).
- Read the plan (`assets/voiceover.plan.json`): the start, length and following silence of every take. The template writes no `voiceover.phrases.json`, so `transcribe` applies no phrase-span alignment. It also runs no Whisper check of its own: run `transcribe` and compare.
- At a join that feels abrupt (`narration.md`, Joining takes), use a longer `[pause N]` or `[section N]`.
- **Listen for breaths.** A mid-sentence comma can render as a pause with an audible breath. In one test (one voice, four sentences) `eleven_multilingual_v2` put breaths 10 to 15 dB under the speech at ear commas. `eleven_v4` put none, or one at about -18 dB, and the user preferred it by ear. Plainer commas removed the v2 breaths and shortened the sentence by 1.9 s. `stability` 0.8 and `use_speaker_boost` off did not. On a model with audible breaths, keep a comma only where the voice must pause. Check by ear.

Sources, retrieved October 2026, from the ElevenLabs help center:

- "How can I add pauses?"
- "Do pauses and SSML phoneme tags work with the API?"
