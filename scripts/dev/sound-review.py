# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=2", "scipy>=1.13", "soundfile>=0.12", "torch>=2.4", "transformers>=4.45"]
# ///
"""Developer review of the sound catalog: harshness limits and recognizability.

Usage:
  node scripts/dev/render-sounds.mjs <dir>
  uv run scripts/dev/sound-review.py <dir> [--no-model]

Numeric limits (every rendered form):
  sharpness   DIN 45692-style, loudest 100 ms, acum. Fail above 2.6: the sound reads as harsh.
  hiss        energy above 8 kHz against the whole, dB. Fail above -10: audible hiss or fizz.
  tail        last 5 ms against the loudest 50 ms, dB. Fail above -20: the sound is cut off, not finished.
              Builds that stop on their cue (endsOnCue: riser, reverse, drone) are exempt.
  true peak   4x oversampled, dBTP. Fail above -1.

Recognizability (base variant only, --no-model skips it): the LAION CLAP model scores each sound against every
sound's `says` text. Each text's average score is removed first, so a text the model likes for everything gets no
edge. rank is where the sound's own text lands among all texts. Warn above rank 10.

Exit 1 when any sound fails a numeric limit.
"""

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import hilbert, resample_poly, welch

SHARP_FAIL, HISS_FAIL, TAIL_FAIL, TP_FAIL, RANK_WARN = 2.6, -10.0, -20.0, -1.0, 10


def bark(f):
    return 13 * np.arctan(0.00076 * f) + 3.5 * np.arctan((f / 7500) ** 2)


def sharpness(m, sr):
    n = int(0.1 * sr)
    if len(m) > n:
        e = np.convolve(m**2, np.ones(n), "valid")
        i = int(np.argmax(e))
        m = m[i:i + n]
    f, p = welch(m, sr, nperseg=min(len(m), 2048))
    z = bark(f)
    spec = np.array([p[(z >= k) & (z < k + 1)].sum() ** 0.23 for k in range(24)])
    zc = np.arange(24) + 0.5
    g = np.where(zc <= 15.8, 1.0, 0.15 * np.exp(0.42 * (zc - 15.8)) + 0.85)
    return float(0.11 * (spec * g * zc).sum() / (spec.sum() + 1e-12))


def measure(path):
    x, sr = sf.read(path, dtype="float64", always_2d=True)
    m = x.mean(axis=1)
    f, p = welch(m, sr, nperseg=min(len(m), 4096))
    hiss = 10 * np.log10(p[f > 8000].sum() / (p.sum() + 1e-20) + 1e-20)
    w = int(0.05 * sr)
    loud = np.sqrt(np.convolve(m**2, np.ones(w) / w, "valid").max() + 1e-20)
    tail = 20 * np.log10(np.sqrt((m[-int(0.005 * sr):] ** 2).mean()) / loud + 1e-12)
    tp = 20 * np.log10(np.abs(resample_poly(x, 4, 1, axis=0)).max() + 1e-12)
    return {"sharp": round(sharpness(m, sr), 2), "hiss": round(hiss, 1), "tail": round(tail, 1), "tp": round(tp, 1)}


def recognizability(files, labels, says_of):
    import torch
    from transformers import ClapModel, ClapProcessor

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    mid = "laion/larger_clap_general"
    model = ClapModel.from_pretrained(mid).to(dev).eval()
    proc = ClapProcessor.from_pretrained(mid)
    texts = sorted(set(says_of.values()))
    clips = []
    for f in files:
        x, sr = sf.read(f, dtype="float32", always_2d=True)
        a = resample_poly(x.mean(axis=1), 48000, sr).astype(np.float32)
        clips.append(np.pad(a, (0, max(0, 48000 - len(a)))))
    with torch.inference_mode():
        te = model.get_text_features(**proc(text=texts, return_tensors="pt", padding=True).to(dev))
        te = torch.nn.functional.normalize(getattr(te, "pooler_output", te), dim=-1)
        ae = model.get_audio_features(**proc(audio=clips, sampling_rate=48000, return_tensors="pt").to(dev))
        ae = torch.nn.functional.normalize(getattr(ae, "pooler_output", ae), dim=-1)
        s = (ae @ te.T).float().cpu().numpy()
    s = (s - s.mean(axis=0, keepdims=True)) / (s.std(axis=0, keepdims=True) + 1e-9)
    out = {}
    for i, label in enumerate(labels):
        own = texts.index(says_of[label])
        order = np.argsort(-s[i])
        out[label] = (int(np.where(order == own)[0][0]) + 1, texts[order[0]])
    return out, len(texts)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    root = Path(sys.argv[1])
    index = json.loads((root / "sounds.json").read_text())
    rows, fails = [], 0
    for label, meta in index.items():
        r = measure(root / f"{label}.wav")
        why = [k for k, bad in (("sharp", r["sharp"] > SHARP_FAIL), ("hiss", r["hiss"] > HISS_FAIL),
                                ("tail", r["tail"] > TAIL_FAIL and not meta.get("endsOnCue")), ("tp", r["tp"] > TP_FAIL)) if bad]
        fails += bool(why)
        rows.append((label, meta, r, why))
    ranks, n = ({}, 0)
    if "--no-model" not in sys.argv:
        base = [label for label, *_ in rows if label.endswith("_v0")]
        ranks, n = recognizability([root / f"{b}.wav" for b in base], base, {b: index[b]["says"] for b in base})
    print(f"{'sound':<22}{'sharp':>6}{'hiss':>7}{'tail':>7}{'tp':>6}  {'rank':<8}verdict")
    for label, meta, r, why in rows:
        rank = ranks.get(label)
        rk = f"{rank[0]}/{n}" if rank else ""
        note = "FAIL " + ",".join(why) if why else "ok"
        if rank and rank[0] > RANK_WARN:
            note += f"  warn: heard as '{rank[1]}'"
        print(f"{label:<22}{r['sharp']:>6}{r['hiss']:>7}{r['tail']:>7}{r['tp']:>6}  {rk:<8}{note}")
    print(f"\n{len(rows)} sounds, {fails} failing a numeric limit.")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
