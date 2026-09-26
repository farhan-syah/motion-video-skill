# /// script
# requires-python = ">=3.10"
# dependencies = ["voxcpm>=2.0.3", "soundfile", "numpy", "torch"]
# ///
"""Narration with VoxCPM2 (OpenBMB, Apache 2.0): 30 languages, voice design and voice cloning, 48 kHz.

Run by `video.mjs speak --engine voxcpm` through `uv run`, which builds this script's environment on first use.
The model loads once and speaks each sentence of a JSON list into its own WAV: seg-000.wav, seg-001.wav, ... in --dir.
video.mjs splits the script, checks each sentence by transcribing it back, and calls this again for the sentences
to regenerate, with new seeds.

One voice holds across sentences: with --reference every sentence clones that recording. Otherwise the first
sentence is designed from --voice (or the model's default voice) and saved as anchor.wav in --dir, and every later
sentence, in this run or a later one, clones it.

Usage: uv run voxcpm_speak.py --sentences list.json --dir DIR [--voice "(A calm male narrator)"]
       [--reference voice.wav] [--model openbmb/VoxCPM2]
       list.json: [{"index": 0, "text": "...", "seed": 7}, ...]
"""
import argparse
import json
import os
import sys

import numpy as np
import soundfile as sf
import torch
from voxcpm import VoxCPM


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sentences", required=True)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--voice", default="")
    ap.add_argument("--reference", default="")
    ap.add_argument("--model", default="openbmb/VoxCPM2")
    a = ap.parse_args()

    with open(a.sentences, encoding="utf-8") as f:
        todo = json.load(f)
    if not todo:
        sys.exit("voxcpm_speak: no sentences to speak.")
    voice = a.voice.strip()
    if voice and not voice.startswith("("):
        voice = f"({voice})"
    anchor_file = os.path.join(a.dir, "anchor.wav")
    anchor = a.reference or (anchor_file if os.path.exists(anchor_file) else None)

    model = VoxCPM.from_pretrained(a.model, load_denoiser=False)
    rate = model.tts_model.sample_rate
    for n, s in enumerate(todo):
        # The seed makes a take repeatable: the same sentence and seed give the same audio.
        torch.manual_seed(s["seed"])
        if anchor:
            wav = model.generate(text=s["text"], reference_wav_path=anchor, cfg_value=2.0, inference_timesteps=10)
        else:
            wav = model.generate(text=f"{voice}{s['text']}", cfg_value=2.0, inference_timesteps=10)
            # The first designed sentence becomes the voice every later sentence clones.
            sf.write(anchor_file, wav, rate)
            anchor = anchor_file
        sf.write(os.path.join(a.dir, f"seg-{s['index']:03d}.wav"), np.asarray(wav, dtype=np.float32), rate, subtype="PCM_16")
        print(f"voxcpm: {n + 1}/{len(todo)} sentences", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
