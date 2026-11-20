# Photo motion (`anim`)

Light motion applied to a still picture before it is turned into characters, so the photo feels filmed. Everything is in image coordinates: `x` and `y` run from 0 to 1 from the top-left of the picture, whatever its size. Motion is deterministic in `t`.

```js
anim: {
  breathe: 0.025,                  // slow camera drift and zoom, 0.02 to 0.03
  wind: [                          // rows sway sideways inside a box
    { x0: 0, x1: 0.36, y0: 0.62, y1: 1, amp: 0.008, f: 1.4 },
    { x0: 0.6, x1: 1, y0: 0.35, y1: 0.75, amp: 0.006, f: 1.1, up: true },
  ],
  parts: [                         // soft-edged ellipses moved on top of the picture
    { kind: 'bob',   x: 0.5,   y: 0.42, rx: 0.3,  ry: 0.42, amp: 0.012, f: 0.9 },
    { kind: 'jaw',   x: 0.495, y: 0.66, rx: 0.11, ry: 0.11, amp: 0.16,  f: 1.3 },
    { kind: 'flick', x: 0.29,  y: 0.43, rx: 0.1,  ry: 0.12, amp: 0.12,  f: 0.7 },
    { kind: 'sway',  x: 0.1,   y: 0.3,  rx: 0.12, ry: 0.28, amp: 0.012, f: 0.7 },
  ],
}
animAmount: 1                      // scales every amplitude, 0 = still
```

## Wind

`{ x0, x1, y0, y1, amp, f, up, flat }`. Rows inside the box slide left and right on a soft wave. The motion grows towards the bottom of the box (grass, hair hanging down); `up: true` makes it grow towards the top (treetops, ears of wheat); `flat: true` moves every row the same amount (text, flags). `amp` is a share of the picture width: 0.005 to 0.012. `f` is the speed, 1 to 1.6.

## Parts

| kind | What it does | Use for | amp |
| --- | --- | --- | --- |
| `bob` | moves the piece up and down with a slight tilt, pivoting below its centre | a head that nods, a body that breathes | 0.008 to 0.015 |
| `jaw` | stretches the piece downwards now and then | a mouth chewing, a beak | 0.1 to 0.18 |
| `flick` | a quick twitch, then rest | ears, a tail, a wing tip | 0.1 to 0.15 |
| `sway` | leans the piece around its base | trees, plants, a standing figure | 0.008 to 0.015 |

`x, y` is the centre of the ellipse, `rx, ry` its radii (shares of width and height). The edge is feathered, so make the ellipse a little larger than the feature. `f` sets the rhythm; give each part a different `f` so they never move in sync.

## Method

1. Open the picture and note the pixel positions of each feature, then divide by width and height.
2. Start with `breathe` and one or two parts. Render stills at t = 0, 1.3, 2.7 and 4.1 s and compare.
3. If a piece tears or doubles, the ellipse is too small or the amplitude too large.
4. Stop when motion is noticed only after a second or two of looking. That is the right amount.

## Generic defaults

```js
Maille.MOTION.photo  // { breathe: 0.03, wind: [{ x0: 0, x1: 1, y0: 0.55, y1: 1, amp: 0.007, f: 1.3 }] }
Maille.MOTION.text   // { breathe: 0.02, wind: [{ x0: 0, x1: 1, y0: 0, y1: 1, amp: 0.014, f: 1.6, flat: true }] }
```
