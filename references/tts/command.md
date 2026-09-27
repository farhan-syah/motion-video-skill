# The user's own TTS

`speak --command "<template>"` runs any text-to-speech tool: a local CLI (Piper, XTTS, F5), a cloud service's CLI, a quantized runner, or a small script. Use it whenever the user already has a TTS or a paid voice.

## The template

| Placeholder   | Becomes                                                        |
| ------------- | -------------------------------------------------------------- |
| `{text}`      | The phrase, shell-quoted                                       |
| `{text_file}` | A file holding the phrase                                      |
| `{out}`       | The audio file the command must write, any format ffmpeg reads |
| `{voice}`     | `--voice`                                                      |
| `{reference}` | `--reference`: a recording to clone                            |

- **Piper:** `--command "piper --model voice.onnx --output_file {out} < {text_file}"`
- **A script:** `--command "uv run my_tts.py --text-file {text_file} --out {out}"`
- **Default:** `{ "tts": { "command": "…" } }` in `~/.config/motion-video/config.json`.

## How `speak` uses it

- **Marks:** how long each mark pauses is untested for this engine. Speak one line with a comma, an em dash and an ellipsis first, and hear or measure it.
- **Phrase by phrase:** the command runs once per sentence, and the script's pause marks join the results exactly. Timed scripts and phrase spans work as with the built-in engines.
- **`--one-call`:** runs the command once on the whole script, for a tool that loads slowly on every call. Pause marks are dropped, and a timed script cannot be placed. `"oneCall": true` in the config sets it.
- **Output:** any sample rate or channels. It becomes 48 kHz mono.
- **Voice and delivery:** whatever the tool offers, passed through `{voice}` and `{reference}`. Delivery notes and tags are dropped.
- **Cloning:** `{reference}` only for the user's own voice, or a voice they have consent to use.
- **The check:** the whole file is heard back once. A problem prints and exits 1.
