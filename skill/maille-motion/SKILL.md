---
name: maille-motion
description: Make short animated ASCII films with the Maille engine — a creature scene, a landscape, a photo brought to life with light motion, or type — composed shot by shot and rendered frame-exact to MP4. Use when the user wants an ASCII video, an animated ASCII loop, a photo turned into a living ASCII scene, or anything built with Maille or maille.js.
---

# Maille motion

Maille draws scenes as a grid of characters on a canvas. The engine is deterministic: `render(ctx, t)` depends only on the options and the time `t`, so any frame can be drawn on its own. That is what makes a real film possible: you compose the timeline in an HTML page, then capture every frame at an exact time and encode it, instead of screen-recording a live page.

The website (https://maille-pi.vercel.app) is the quick version: pick a scene, drop an image or type text, embed it. This skill is the full process behind the films: choosing the scene, giving a photo its own motion, cutting several shots together with type, and rendering a clean MP4.

## What you need

- `assets/maille.js` (bundled copy of the engine). Fetch the latest with `curl -o maille.js https://maille-pi.vercel.app/maille.js` when the network allows, otherwise use the bundled one.
- Node 18+, Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`), and ffmpeg.
- `templates/film.html`: a page that plays a timeline of shots and exposes `seek(t)`.
- `scripts/render.mjs`: captures every frame of that page and pipes it to ffmpeg.

## Process

### 1. Brief

Settle four things before writing any code, and ask only for what you cannot infer:

- **Format**: 9:16 (1080×1920) for reels, 16:9 (1920×1080) for sites and YouTube, 1:1 or 4:5 for feeds.
- **Length**: a loop is 6 to 12 s, a short film 15 to 45 s. Fewer shots that breathe beat many quick cuts.
- **Subject per shot**: a built-in scene, the user's photo, or text.
- **Words on screen**, if any, written by the user or agreed with them.

### 2. Pick the scenes

Start from the built-in scenes and presets (see `reference/config.md`):

| Scene | Good for | Key options |
| --- | --- | --- |
| `sharks`, `mantas` | dark, calm, top-down water | `count`, `size`, `heading`, `spread`, `speciesSet` |
| `koi` | pond, colour, close framing | `count`, `koiPads`, `varieties`, `sides` |
| `birds` | sky, motion across frame | `count`, `heading`, `spread` |
| `alpenglow` | landscape, light changing over time | `agDaylight`, `agCycle`, `agClouds`, palettes |
| `waves` | horizon, rhythm | `size`, `heading` |
| `image` | the user's photo | `src`, `anim`, `threshold`, `color`, `invert` |
| `text` | titles, a word as the subject | `text`, `anim`, `textFont` |

Grain is set by `cols` (columns across the frame). Coarse grain (48 to 80) reads as graphic and works for creatures; fine grain (140 to 240) keeps a photo recognisable. Pick one grain per film and only change it on purpose.

### 3. Bring a photo to life

A still photo should feel filmed, not filtered. Give it light motion with `anim` (spec in `reference/photo-motion.md`):

1. Look at the picture and list what would move in real life: a head that nods, a jaw that chews, ears that flick, grass or leaves in wind, water.
2. Place each one as a soft ellipse in image coordinates (0 to 1, from the top-left): `bob` for a head, `jaw` for a mouth, `flick` for ears and tails, `sway` for trees and plants. Add `wind` bands for grass, hair or foliage.
3. Keep amplitudes small (`amp` 0.006 to 0.02 for bob and sway, 0.1 to 0.16 for jaw and flick). Big motion tears the picture and gives the trick away.
4. Add `breathe` (0.02 to 0.03) for a slow camera drift on every photo.
5. Render a few frames at different times, look at them, and adjust positions until the moving pieces sit exactly on the subject.

`Maille.MOTION.photo` and `Maille.MOTION.text` are safe generic defaults when there is no time to map the picture.

### 4. Compose the film

Copy `templates/film.html` next to `maille.js` and edit the `SHOTS` array. Each shot has a start and end time, a scene config and an optional title. The template already handles:

- crossfades between shots with `presence` (cells dissolve in and out, which looks native to ASCII, unlike an opacity fade),
- room for type with `cutout` (a band of the frame where nothing is drawn),
- titles set in the same monospaced font, aligned to the character grid,
- a fixed `seed` per shot so every render is identical.

Rules that keep it looking intentional:

- One idea per shot, held long enough to read (at least 2.5 s, 4 s with words).
- Motion leads the eye to the type, never across it.
- Keep the palette coherent across shots: one family of colours, or `color: false` on photos with a single tint.
- Text on screen is short, in the user's words, and on the grid.

### 5. Preview, then render

Open the page in a browser to check timing (`?t=12.5` jumps to a time, space pauses). When it is right, render:

```bash
node scripts/render.mjs film.html --fps 30 --out film.mp4
```

The script reads the size and duration from the page, calls `seek(t)` for every frame, and encodes H.264 (`-preset veryfast -crf 18`, yuv420p) so the file plays everywhere. Use `--fps 60` for fast motion, `--from` and `--to` to render a section.

Do not render the final film until the user asks for it. Render stills first (`--still 4.2` writes one PNG) and show them.

### 6. Check before handing over

- Look at a still from each shot and at every transition.
- Check that the loop point matches if it is a loop (first and last frame).
- Check the type: spelling, no word cut by the grid, readable on a phone.
- Play the MP4 once from start to end.

## Embedding instead of a video

When the user wants the scene live on a site rather than as a file:

```html
<script src="https://maille-pi.vercel.app/maille.js" defer></script>
<maille-scene config='{"scene":"koi","count":7}' style="display:block;width:100%;aspect-ratio:1/1"></maille-scene>
```

The element pauses off screen and respects reduced motion. `scene.set({...})`, `scene.seek(t)` and `scene.presence = 0.5` work from JavaScript.
