# /// script
# requires-python = ">=3.10"
# dependencies = ["transformers>=4.52,<5", "torch", "soundfile", "numpy", "scipy"]
# [[tool.uv.index]]
# name = "pytorch-cpu"
# url = "https://download.pytorch.org/whl/cpu"
# explicit = true
# [tool.uv.sources]
# torch = { index = "pytorch-cpu" }
# ///
"""Narration with any Hugging Face model the transformers text-to-speech pipeline loads, on the CPU.

Run by `video.mjs speak --model ID` through `uv run` when the model has no ONNX weights for transformers.js.
Covers Meta's MMS-TTS voices (facebook/mms-tts-<iso>, over 1,100 languages), Bark, SpeechT5 and the like.
The model loads once and speaks each sentence of a JSON list into its own WAV: seg-000.wav, seg-001.wav, ... in --dir.
Torch comes from the CPU wheel index: a small TTS model runs fast on the CPU and needs no GPU.

Usage: uv run hf_speak.py --sentences list.json --dir DIR --model facebook/mms-tts-zlm
       list.json: [{"index": 0, "text": "...", "seed": 7}, ...]
"""
import argparse
import json
import os
import sys

import numpy as np
import soundfile as sf
import torch
from transformers import pipeline


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sentences", required=True)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--model", required=True)
    a = ap.parse_args()

    with open(a.sentences, encoding="utf-8") as f:
        todo = json.load(f)
    if not todo:
        sys.exit("hf_speak: no sentences to speak.")

    tts = pipeline("text-to-speech", model=a.model, device="cpu")
    for n, s in enumerate(todo):
        # The seed makes a take repeatable: MMS and other sampling models vary between runs otherwise.
        torch.manual_seed(s.get("seed", 7))
        out = tts(s["text"])
        wav = np.asarray(out["audio"], dtype=np.float32).squeeze()
        sf.write(os.path.join(a.dir, f"seg-{s['index']:03d}.wav"), wav, out["sampling_rate"], subtype="PCM_16")
        print(f"hf: {n + 1}/{len(todo)} sentences", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
