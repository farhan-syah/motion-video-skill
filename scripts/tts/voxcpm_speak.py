# /// script
# requires-python = ">=3.10"
# dependencies = ["voxcpm>=2.0.3", "soundfile", "numpy", "torch"]
# ///
"""Narration with VoxCPM2 (OpenBMB, Apache 2.0): 30 languages, voice design and voice cloning, 48 kHz.

Run by `video.mjs speak --engine voxcpm` through `uv run`, which builds this script's environment on first use.
The model loads once. The script is spoken sentence by sentence, joined with a short pause. One voice holds across
sentences: with --reference every sentence clones that recording, otherwise the first sentence is designed from
--voice (or the model's default voice) and every later sentence clones it.

Usage: uv run voxcpm_speak.py --script script.txt --out voiceover.wav [--voice "(A calm male narrator)"]
       [--reference voice.wav] [--model openbmb/VoxCPM2] [--seed 7] [--pause 0.28]
"""
import argparse
import os
import re
import sys
import tempfile

import numpy as np
import soundfile as sf
import torch
from voxcpm import VoxCPM


def sentences(text):
    parts = re.findall(r"[^.!?…。！？]+(?:[.!?…。！？]+[\"')\]」』]*|$)", re.sub(r"\s+", " ", text))
    return [p.strip() for p in parts if p.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--voice", default="")
    ap.add_argument("--reference", default="")
    ap.add_argument("--model", default="openbmb/VoxCPM2")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--pause", type=float, default=0.28)
    a = ap.parse_args()

    with open(a.script, encoding="utf-8") as f:
        said = sentences(f.read())
    if not said:
        sys.exit("voxcpm_speak: the script is empty.")
    voice = a.voice.strip()
    if voice and not voice.startswith("("):
        voice = f"({voice})"

    model = VoxCPM.from_pretrained(a.model, load_denoiser=False)
    rate = model.tts_model.sample_rate
    gap = np.zeros(int(rate * a.pause), dtype=np.float32)
    parts = []
    with tempfile.TemporaryDirectory() as tmp:
        anchor = a.reference or None
        for i, s in enumerate(said):
            # A fixed seed per sentence: the same script gives the same audio.
            torch.manual_seed(a.seed + i)
            if anchor:
                wav = model.generate(text=s, reference_wav_path=anchor, cfg_value=2.0, inference_timesteps=10)
            else:
                wav = model.generate(text=f"{voice}{s}", cfg_value=2.0, inference_timesteps=10)
                # The first designed sentence becomes the voice every later sentence clones.
                anchor = os.path.join(tmp, "anchor.wav")
                sf.write(anchor, wav, rate)
            if parts:
                parts.append(gap)
            parts.append(np.asarray(wav, dtype=np.float32))
            print(f"voxcpm: {i + 1}/{len(said)} sentences", file=sys.stderr, flush=True)
    sf.write(a.out, np.concatenate(parts), rate, subtype="PCM_16")


if __name__ == "__main__":
    main()
