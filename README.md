# Maille

Animated ASCII scenes you tune in a studio and embed anywhere.

Static site, no build step. Deploy the folder as-is (Vercel: framework "Other", output directory = root).

| File | Role |
| --- | --- |
| `index.html` | The tool: full-screen preview, one scene per kind in the bottom bar, your image or text, settings panel open by default (main + More), embed code, PNG and video |
| `maille.js` | The library: rendering engine + `<maille-scene>` web component (the file embeds load) |
| `e.html` | Iframe embed: `e.html?preset=alpine-day` or `e.html?c=<config>` |
| `docs.html` | Public docs: script embed, iframe embed, attributes, presets, JS API |
| `vercel.json` | CORS on `maille.js` so other sites can load it, iframe allowed everywhere |
| `favicon.svg` | Icon |
| `skill/maille-motion/` | Claude skill: method, film template, frame-exact render script |
| `maille-skill.zip`, `film.html` | The skill zipped, and its starter film playing live on `skill.html`. Rebuild both after editing the skill or maille.js: `sh skill/build.sh` |
| `skill.html` | The skill page: download, prompts to try, install for the Claude app and Claude Code |

## Embed

```html
<script src="https://YOUR-DOMAIN/maille.js" defer></script>
<maille-scene preset="alpenglow" style="display:block;width:100%;aspect-ratio:16/9"></maille-scene>
```

The **Copy embed code** button writes this with your exact settings in `config`.

## To do before sharing publicly

- Link previews: `og.png` (1200×630) is included. Once the domain is known, make the `og:image` URL in `index.html` absolute (`https://YOUR-DOMAIN/og.png`) and add the same tag to `docs.html`.
- Optional: minify `maille.js` (`npx terser maille.js -c -m -o maille.js`), about 64 KB down to 35 KB.
