# Kokoro

Kokoro-82M (Apache 2.0) through kokoro-js: English only, on any CPU, fast. The default on a machine without VoxCPM2. `speak --engine kokoro`, or any Kokoro voice name with `--voice`.

- **First run:** the speech runtime (about 500 MB, shared with Whisper) and a 90 MB model.
- **Never** give it another language: it reads every word as English.

## Voices

`--voice af_heart` (default). `a` is American, `b` British, `f` female, `m` male.

| Group         | Voices                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| American, `f` | `af_heart`, `af_alloy`, `af_aoede`, `af_bella`, `af_jessica`, `af_kore`, `af_nicole`, `af_nova`, `af_river`, `af_sarah`, `af_sky` |
| American, `m` | `am_adam`, `am_echo`, `am_eric`, `am_fenrir`, `am_liam`, `am_michael`, `am_onyx`, `am_puck`, `am_santa`                           |
| British, `f`  | `bf_alice`, `bf_emma`, `bf_isabella`, `bf_lily`                                                                                   |
| British, `m`  | `bm_daniel`, `bm_fable`, `bm_george`, `bm_lewis`                                                                                  |

Try two or three voices on one line, and keep the one that fits the narration.

## How `speak` uses it

- **Phrase by phrase:** each sentence is spoken alone, and the script's pause marks join them exactly (`narration.md`, Pauses).
- **Marks, measured on Kokoro:** a comma pauses about 0.27 s. An em dash barely pauses (about 0.09 s), so it gives no longer break here: use a period or `[pause]` for one. A period or ellipsis ends a phrase, and `speak` joins phrases with its own pause (Pauses, in `narration.md`).
- **Speed:** `--speed` changes Kokoro's own speaking rate, with no time-stretch.
- **Delivery:** none beyond the voice and speed. Delivery notes and tags are dropped.
- **The check:** the whole file is heard back once. A problem prints and exits 1: reword the line and run again. There are no cached takes and no `--reroll`.
