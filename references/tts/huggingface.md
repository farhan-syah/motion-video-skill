# Hugging Face models

`speak --model <id>` runs a Hugging Face text-to-speech model locally, on the CPU. Use it for a language no other engine here speaks.

## How it runs

| Weights      | Runs                                                                                | First run                                   |
| ------------ | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| ONNX         | In Node, through transformers.js                                                    | The model                                   |
| PyTorch only | In Python, through the transformers pipeline (`scripts/tts/hf_speak.py`), with `uv` | A 1.1 GB Python environment, then the model |

- **Loads in neither:** the model is not a transformers text-to-speech model (Parler, F5 and XTTS need their own package). Run it through `--command` (`command.md`).
- **Phrase by phrase:** each sentence is spoken alone, and the script's pause marks join them exactly.
- **Voice and delivery:** the model's own. `--voice`, delivery notes and tags do not apply. `--speed` time-stretches the result, pitch kept.
- **The check:** the whole file is heard back once. A problem prints and exits 1.

## Choose a model

1. **Find it:** `huggingface.co/models?pipeline_tag=text-to-speech` with the language filter. Read the card for language, license and hardware.
2. **Check the license:** it must allow commercial use and put no limit on the audio it makes. Skip any research-only or non-commercial model, however good it sounds.
3. **Try one line:** `speak "one sentence in that language" --model <id> --language <code> --out test.wav`.
4. **Judge it:** the speech check must pass. Then read the pace line and listen when possible.
