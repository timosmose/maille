# Maille settings

A config is a plain object. Anything left out takes its default. `Maille.resolve(partial)` fills the defaults, `Maille.compact(cfg)` keeps only what differs, `Maille.toEngine(cfg, image)` turns it into engine options.

## Every scene

| Key | Default | Effect |
| --- | --- | --- |
| `scene` | `alpenglow` | `sharks`, `mantas`, `koi`, `birds`, `waves`, `landscape`, `alpenglow`, `image`, `text` |
| `seed` | 7 | layout of creatures, clouds, noise. Fix it per shot so renders repeat |
| `cols` | 200 | columns across the frame (the grain) |
| `cellAspect` | 1.5 | cell height relative to width |
| `speed` | 1 | time scale |
| `ramp` | `@8%SX#t;:` | body characters, dense to light. Others: `@%#*+=-:.`, `MWNXK0Okxdol:,.`, `█▓▒░`, `10`, `●•·` |
| `edgeChars`, `highChars` | | outline and highlight characters |
| `font` | JetBrains Mono | any monospaced font loaded on the page |
| `brightness`, `saturation` | 1 | colour adjustments |
| `glitch` | 0.06 | share of cells that flash an accent colour |
| `flicker` | 2.4 | glow dots flicker rate |
| `glow`, `grid`, `trails` | true | glow dots in empty cells, grid lines, wakes and spray |
| `bgAuto`, `background` | true, `#050506` | scene background, or a fixed colour, or `transparent` |
| `presence` | 1 | share of cells drawn, 0 to 1. Animate it for dissolves |
| `cutout` | null | `[x0, x1, fade]`: a vertical band left empty, for type |

## Creatures (`sharks`, `mantas`, `koi`, `birds`)

`count`, `size`, `heading` (degrees, -90 swims up), `spread` (degrees of variation), `contour` (shaped outlines), `ambient` (caustics and particles). Sharks: `speciesSet` = `mix`, `grey`, `sand`, `hammer`. Koi: `koiPads`, `koiRipples`, `varieties` (kohaku, tancho, sanke, showa, utsuri, asagi, shusui, chagoi, kujaku, butterfly, silver, gold), `pointer` and `splash` for interaction. `sides` (0.05 to 0.45) keeps creatures in two side bands, leaving the centre clear.

## Waves and landscape

`size` (swell or relief), `heading` (0 travels right, 180 left).

## Alpenglow

`agDaylight` (0 dusk to 1 day), `agCycle` and `agCycleSpeed`, `agClouds`, `agCloudSpeed`, `agMist`, `agStars`, `agBirds`, `agFireflies`, `agSnow`, `agRugged`, `agPeak1`, `agPeak2`, `agHaze`, `agSun`, `agSunX`, `agSunY`, `agTrees`, `agTreeScale`, `agFlowers`, `agWind`, `agGrass`, and `agPalettes.dusk` / `agPalettes.day` (colour per element).

## Image and text

`src` (URL or data URL of the picture), `anim` and `animAmount` (see photo-motion.md), `size` (zoom), `threshold` (brightness under which a cell stays empty: 0.05 to 0.15 for photos), `color` (keep the picture's colours), `invert`. Text: `text` (`\n` for new lines), `textFont` (CSS font, e.g. `700 200px Inter`).

## Presets

`alpenglow`, `golden-hour`, `alpine-day`, `day-cycle`, `fine-grain`, `sharks`, `mantas`, `koi`, `gulls`, `night-ocean`, `type`, `alpine-cow`, `meadow`, `binary-sea`, `hammerheads`, `gold-koi`, `koi-lanes`, `starlings`, `block-alps`. `Maille.PRESETS[name].config` holds each one.

## Engine

```js
const engine = Maille.create({ width: 1080, height: 1920, scene: 'koi', cols: 64 });
engine.render(ctx, t);       // draw the frame at t seconds
engine.set({ count: 9 });    // change settings
engine.refresh();            // after a font finishes loading
```
