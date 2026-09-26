# /// script
# requires-python = ">=3.10"
# dependencies = ["voxcpm>=2.0.3", "soundfile", "numpy", "torch"]
# ///
"""Narration with VoxCPM2 (OpenBMB, Apache 2.0): 30 languages, voice design and voice cloning, 48 kHz.

Run by `video.mjs speak --engine voxcpm` through `uv run`, which builds this script's environment on first use.
The model loads once and speaks each part of a JSON list (a beat of the script, or one sentence) into its own WAV:
seg-000.wav, seg-001.wav, ... in --dir. video.mjs splits the script, checks each part by transcribing it back, and
calls this again for the parts to regenerate, with new seeds.

One voice holds across parts: with --reference every part clones that recording. Otherwise the one part given is
designed from --voice (or the model's default voice) and saved as anchor.wav in --dir, and video.mjs passes it as
the reference for every later part.

Usage: uv run voxcpm_speak.py --sentences list.json --dir DIR [--voice "(A calm male narrator)"]
       [--reference voice.wav] [--style "(relaxed, explaining)"] [--cfg 2.0] [--steps 10] [--model openbmb/VoxCPM2]
       list.json: [{"index": 0, "text": "...", "seed": 7, "style": "(optional delivery for this part)"}, ...]
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
    # Delivery to steer every cloned part toward: "(relaxed, explaining to a friend)". Hi-Fi cloning (prompt audio plus
    # its transcript) ignores it and reads it aloud, so cloning here uses the reference alone.
    ap.add_argument("--style", default="")
    # Guidance: 1.0-2.0 relaxed and natural, above 2.0 stricter to the text with more noise. Steps: 4-30, more is more
    # natural and slower.
    # Hi-Fi cloning: the reference's exact transcript. Identity holds far closer; the model ignores style then.
    ap.add_argument("--prompt-text", default="")
    ap.add_argument("--cfg", type=float, default=2.0)
    ap.add_argument("--steps", type=int, default=10)
    a = ap.parse_args()

    with open(a.sentences, encoding="utf-8") as f:
        todo = json.load(f)
    if not todo:
        sys.exit("voxcpm_speak: no sentences to speak.")
    paren = lambda t: t if not t or t.startswith("(") else f"({t})"
    voice = paren(a.voice.strip())
    style = paren(a.style.strip())
    anchor_file = os.path.join(a.dir, "anchor.wav")
    anchor = a.reference or (anchor_file if os.path.exists(anchor_file) else None)

    model = VoxCPM.from_pretrained(a.model, load_denoiser=False)
    rate = model.tts_model.sample_rate
    for n, s in enumerate(todo):
        # The seed makes a take repeatable: the same sentence and seed give the same audio.
        torch.manual_seed(s["seed"])
        if anchor and a.prompt_text and not s.get("style"):
            wav = model.generate(text=s["text"], prompt_wav_path=anchor, prompt_text=a.prompt_text, reference_wav_path=anchor, cfg_value=a.cfg, inference_timesteps=a.steps)
        elif anchor:
            # A part's own delivery note ("(asking a question)") replaces --style for it.
            wav = model.generate(text=f"{paren(s.get('style', '')) or style}{s['text']}", reference_wav_path=anchor, cfg_value=a.cfg, inference_timesteps=a.steps)
        else:
            wav = model.generate(text=f"{voice}{s['text']}", cfg_value=a.cfg, inference_timesteps=a.steps)
            # The first designed sentence becomes the voice every later sentence clones.
            sf.write(anchor_file, wav, rate)
            anchor = anchor_file
        sf.write(os.path.join(a.dir, f"seg-{s['index']:03d}.wav"), np.asarray(wav, dtype=np.float32), rate, subtype="PCM_16")
        print(f"voxcpm: {n + 1}/{len(todo)} sentences", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
