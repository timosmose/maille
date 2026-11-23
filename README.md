# Maille

Animated ASCII scenes you tune in a studio and embed anywhere.

Static site, no build step. Deploy the folder as-is (Vercel: framework "Other", output directory = root).

| File | Role |
| --- | --- |
| `index.html` | The tool: full-screen preview, one scene per kind in the bottom bar, your image or text, settings panel open by default (main + More), embed code, PNG and video |
| `maille.js` | The library: rendering engine + `<maille-scene>` web component (the file embeds load) |
| `e.html` | Iframe embed: `e.html?preset=alpine-day` or `e.html?c=<config>` |
| `about.html` | About: live showcase, what Maille is for, embed reference (script, iframe, attributes, JS), the Claude skill, open source; sharks in the margins as on timdalverny.com. `docs.html` redirects here |
| `vercel.json` | CORS on `maille.js` so other sites can load it, iframe allowed everywhere |
| `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | The Maille mark |
| `fonts/` | JetBrains Mono (OFL), served with the script so embeds make no third-party font request |
| `skill/maille-motion/` | Claude skill: method, film template, frame-exact render script |
| `maille-skill.zip` | The skill zipped. Rebuild after editing the skill or maille.js: `sh skill/build.sh` |
| `skill.html` | The skill page: download, prompts to try, install for the Claude app and Claude Code; koi and sharks in the margins as on timdalverny.com |

## Embed

```html
<script src="https://YOUR-DOMAIN/maille.js" defer></script>
<maille-scene preset="alpenglow" style="display:block;width:100%;aspect-ratio:16/9"></maille-scene>
```

The **Copy embed code** button writes this with your exact settings in `config`.

## License

MIT, see `LICENSE`. JetBrains Mono is under the SIL Open Font License.
