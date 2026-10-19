# Delivery: recording, export and upload

For a video that goes to YouTube or social platforms. Platforms re-encode every upload, so the goal is the cleanest source at a resolution that earns their better playback encodes, without an oversized file.

## Choose the output for the platform

The platform sets the aspect ratio, size and length before any scene is written. Ask where the video plays (`SKILL.md`, step 3). When the user does not say, propose the default below with its reason and let them change it. A video for several platforms gets one master in the widest format, plus a derived copy for each other.

| Platform | Aspect, size | Notes |
| -------- | ------------ | ----- |
| YouTube, long form | 16:9, 2560x1440, 60 fps | Master for the YouTube rules below. Upload the master or its HEVC copy. |
| YouTube Shorts, Instagram Reels, TikTok | 9:16, 1080x1920, 30 or 60 fps | Compose for vertical in the manifest (`width` 1080, `height` 1920). Keep text and faces clear of the top and bottom platform bands. Keep under the platform's current length limit. |
| Facebook and Instagram feed | 4:5 (1080x1350) or 1:1 (1080x1080), or 16:9 1920x1080 | Vertical and square fill more of a phone feed. Most viewers watch muted, so a silent version must still teach: on-screen text carries it. |
| LinkedIn, X | 16:9 or 1:1, 1920x1080 or 1080x1080 | Check the platform's current file size and length limits before rendering. |
| Website, docs, README | 16:9, 1920x1080 | Use the `-compressed.mp4` copy. Add a poster image from `out/thumbnail.png`. |
| Talk, meeting, slide embed | 16:9, 1920x1080, 30 fps | Large type, no reliance on audio. |
| Chat, email, review | 16:9, 1280x720 or 1920x1080 | Under the app's size limit. The `-compressed.mp4` copy. |

Rules that follow from the platform:

- **Vertical safe zones (1080x1920):** platform UI covers about the top 170 px and the bottom 480 px, and the right 120 px at mid height. Put nothing the viewer must read there. Burned-in captions sit just above the bottom band, since most viewers watch muted. YouTube Shorts takes 9:16 up to 3 minutes (fetch the current limit before relying on it), so one master serves Shorts, Reels and TikTok.
- **A long film as a series:** a film over the platform's reel length splits into standalone parts of 1.5 to 2.5 minutes cut from the same voice. Each part opens with a line that gives its context and ends with a line that names the next part. Build each part as its own project with its own timeline.
- **Aspect ratio is a design decision.** A change of ratio rebuilds the composition. Scale 16:9 scenes into a vertical frame only for a quick social cut, and say so.
- **Platform limits change.** Fetch the current limit (length, size, ratio) before promising a delivery. Report any limit the video exceeds.
- **Several outputs:** render the master once, then derive the rest with ffmpeg from the master. Report each file with its size, resolution and intended platform.

## Rules

- **Render at the delivery size.** Scenes are vector and text, so a larger render adds real detail. An upscale of a 1080p render does not. For YouTube, render 2560x1440 with `render --scale 1.3333334` on a 1920x1080 manifest.
- **Use 60 fps** for UI motion, scrolling and animation. Use 30 fps only for slow, static material.
- **Master in H.264** as `render` writes it (High, yuv420p, BT.709, faststart). Keep the master. Derive every upload copy from it, never from another copy.
- **One resize at most.** Each scaling step softens text. Capture at native size, then scale once, with `lanczos`.
- **Text survives compression only when large.** Keep the 28 px minimum from `craft.md`. Avoid sharpening: halos around text grow after re-encoding.
- **Audio:** AAC 192 kbps, 48 kHz, -14 LUFS (the render already normalizes).

## Which resolution

| Target | Size | Why |
| ------ | ---- | --- |
| YouTube, default | 2560x1440, 60 fps | Reported to receive VP9 playback encodes more often than 1080p. Text stays sharper. |
| YouTube, smaller upload | 2048x1152 | Only 14% more pixels than 1080p. Reported to trigger VP9. Community-observed, not a YouTube guarantee. |
| YouTube, maximum | 3840x2160 | `render --scale 2`. Large source, long processing. |
| Facebook, chat, review | 1920x1080 | The `-compressed.mp4` copy from `render`. |

YouTube chooses the playback codec. No upload setting forces VP9 or AV1. After processing ends, open the video, right-click the player, choose Stats for nerds and read Codecs: `avc1` is H.264, `vp09` is VP9, `av01` is AV1. If `avc1` remains at 2048x1152, try 2560x1440. The 8K-segment trick for AV1 is experimental and can break the upload: do not use it.

## Upload copy

YouTube accepts the H.264 master as is. Its published H.264 SDR upload bitrates are 8 Mbps (30 fps) and 12 Mbps (60 fps) at 1080p, 16 and 24 Mbps at 1440p, 35 to 45 and 53 to 68 Mbps at 4K. A smaller HEVC copy, made from the master on an NVIDIA GPU:

```
ffmpeg -i out/video.mp4 -c:v hevc_nvenc -preset p6 -rc vbr -cq 20 -b:v 0 -pix_fmt yuv420p -tag:v hvc1 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a copy -movflags +faststart out/video-youtube.mp4
```

Size estimate in GB: (video Mbps + audio Mbps) × seconds ÷ 8000. Check the real size, since `-cq` sets quality, not bitrate. Compare an unlisted upload of the master and the copy when the difference matters.

## Recording a screen (demos, footage)

- **Capture at the monitor's native size** and frame rate. Do not capture at a size the page then scales.
- **Quality-based rate control, not a fixed bitrate.** In OBS: Matroska (.mkv), NVENC HEVC, CQP 19 to 21, keyframe interval 2 s, preset P5, two-pass, adaptive quantization on, B-frames 2, NV12, Rec. 709, limited range. The RTX 30 series has no hardware AV1 encoder.
- **Cut the footage into scenes with `footage`**, which keeps the pixels frame-exact. Re-record only when the page itself changed.
- **A pointer and clicks** read best with the system arrow, a pointing hand on buttons, and a closed hand only while dragging.

## Listing text and covers

The listing title, description, and cover serve search and showcase pages. They need not match titles inside the video or the project files.

- **Files together:** the video, its cover, and its text file sit in one folder with one base name (`part-3-why-it-is-slow.mp4`, `.png`, `.txt`). Fill the text file with real text. Report each unknown, such as the full-film link.
- **Title:** lead with the result or what the video shows. Name the subject and the measured thing: "X runs the job in 46% less time". Never use a topic label or a bare percentage.
- **Series title:** `<series name> - <what this video shows> (Part x of N)`. The series name is identical in every title. The user can change it. A full film keeps its own title and joins the playlist.
- **Length:** YouTube titles stay under 100 characters. Add `#Shorts` to a Shorts title.
- **Caption and description:** sentences of 20 words or fewer, one idea each, with concrete subjects and no filler. No slogans, fragments, or "not X, but Y" contrasts. Name who does what. Order for a part: title, body, next part, full-film link.
- **Hashtags:** write two lists. Line one: `#` tags separated by spaces (TikTok, Instagram, Facebook). Line two: tags without `#`, separated by commas (YouTube tags).
- **Claims:** repeat only what the film supports. A modelled number says so and lists its assumptions. Call a product "open source" only when its licence is.
- **Chapters:** long YouTube films get timestamps from the final timeline. Start at `0:00`. Use at least three, each at least 10 s.
- **Covers:** one template per series, so viewers group the videos by sight. Include the series name, a large part number with progress marks, a key frame, the title, and the logo. Keep key content in the middle 4:5 of a vertical cover. Render covers from HTML at delivery size.

## Captions

A subtitle file (`.srt`, `.vtt`) is a separate deliverable and needs the user's yes. A video with enough on-screen text carries no caption track (`narration.md`, Captions).
