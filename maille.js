/*
 * ascii-field.js
 * Generic ASCII cell renderer (canvas 2D) with interchangeable scenes:
 *   sharks · mantas · koi · birds · waves · landscape · image (image, video or canvas source) · text
 *
 * Deterministic for procedural scenes: render(ctx, t) depends only on options + t.
 *
 *   const f = AsciiField.create({ scene: 'waves', width: 1080, height: 1920, cols: 64 });
 *   f.render(ctx, t);
 *   f.set({ scene: 'image', source: myImgOrVideo, threshold: 0.3, color: true });
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.AsciiField = api; root.AsciiSharks = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const NONE = 0, EDGE = 1, BODY = 2, HIGH = 3, MARK = 4, DARK = 5;

  const RAMP = ['@', '8', '%', 'S', 'X', '#', 't', ';', ':'];
  const EDGE_SOFT = ['.', ',', "'", '`'];
  const EDGE_HARD = [':', ';', "'", ','];
  const HIGH_CH = ['@', '8', '%'];
  const DARK_CH = [':', ';', ','];

  const TEAL = [0.3, 0.78, 0.92];
  const LX = -0.45, LY = -0.89;

  // Top-down creatures. Every length is in body lengths (Lb): s runs 0 (head) → 1 (tail), a = distance from the spine.
  const SPECIES = {
    grey: {
      plan: 'shark', tint: [0.86, 0.92, 1.06], width: 0.115, tailA: 0.05, tipDark: true,
      prof: [[0, 0], [0.03, 0.42], [0.1, 0.78], [0.24, 1], [0.42, 0.86], [0.62, 0.5], [0.8, 0.2], [0.9, 0.1], [1, 0.04]],
      fin: [0.18, 0.31, 0.45, 0.31], dorsal: [0.3, 0.4], second: [0.68, 0.72],
      eye: [0.05, 0.085, 0.5, 0.82], gills: [0.13, 0.21],
    },
    sand: {
      plan: 'shark', tint: [1.08, 0.95, 0.76], width: 0.135, tailA: 0.055,
      prof: [[0, 0], [0.03, 0.5], [0.1, 0.86], [0.26, 1], [0.45, 0.92], [0.62, 0.56], [0.8, 0.24], [0.9, 0.12], [1, 0.05]],
      fin: [0.18, 0.3, 0.42, 0.27], dorsal: [0.42, 0.5], second: [0.6, 0.66],
      eye: [0.04, 0.07, 0.5, 0.82], gills: [0.12, 0.2],
    },
    hammer: {
      plan: 'shark', tint: [0.78, 0.86, 0.98], width: 0.1, tailA: 0.05,
      prof: [[0, 0.25], [0.008, 2.0], [0.05, 2.0], [0.065, 0.42], [0.1, 0.6], [0.26, 0.95], [0.42, 0.82], [0.62, 0.46], [0.8, 0.18], [0.9, 0.09], [1, 0.04]],
      fin: [0.2, 0.32, 0.46, 0.29], dorsal: [0.3, 0.38], second: [0.7, 0.74],
      eye: [0.01, 0.05, 0.86, 1.01], gills: [0.14, 0.22],
    },
    manta: {
      plan: 'manta', tint: [0.72, 0.8, 0.96], width: 1,
      prof: [[0.04, 0.06], [0.07, 0.13], [0.12, 0.3], [0.2, 0.58], [0.3, 0.86], [0.4, 1.02], [0.45, 1.04], [0.5, 0.92], [0.56, 0.66], [0.63, 0.4], [0.7, 0.2], [0.76, 0.1], [0.8, 0.05]],
    },
    koi: {
      plan: 'koi', tint: [1.06, 1.04, 1], width: 0.13,
      prof: [[0, 0.32], [0.025, 0.64], [0.07, 0.84], [0.12, 0.9], [0.2, 0.98], [0.3, 1], [0.42, 0.95], [0.54, 0.8], [0.64, 0.6], [0.72, 0.42], [0.78, 0.3], [0.82, 0.12], [0.84, 0]],
    },
    gull: {
      plan: 'bird', tint: [0.95, 0.98, 1.04], wrist: 0.6, beat: 1.5, glide: 0.35, beatAmp: 0.9, dihedral: 0.1,
      prof: [[0, 0], [0.03, 0.045], [0.08, 0.07], [0.15, 0.08], [0.3, 0.11], [0.5, 0.1], [0.65, 0.065], [0.72, 0.055], [0.9, 0.075], [1, 0.07]],
      wing: [[0.2, 0], [0.17, 0.3], [0.17, 0.6], [0.26, 0.82], [0.42, 1.04], [0.58, 1.22], [0.62, 1.16], [0.54, 0.98], [0.48, 0.62], [0.5, 0.3], [0.52, 0]],
    },
    stork: {
      plan: 'bird', tint: [1, 1, 1.02], wrist: 0.7, beat: 1.05, glide: 0.6, beatAmp: 0.75, dihedral: 0.06, legs: true,
      prof: [[0, 0], [0.02, 0.01], [0.1, 0.014], [0.12, 0.024], [0.26, 0.032], [0.33, 0.065], [0.45, 0.085], [0.6, 0.075], [0.72, 0.045], [0.78, 0.025]],
      wing: [[0.32, 0], [0.29, 0.4], [0.29, 0.85], [0.33, 1.05], [0.4, 1.13], [0.47, 1.1], [0.53, 1.02], [0.6, 0.85], [0.62, 0.4], [0.64, 0]],
    },
  };

  const CONTOUR = ".,'`-_/\\|():;";
  const TIP_INK = [0.42, 0.44, 0.5];
  const MANTLE = [0.64, 0.69, 0.78], BILL_YELLOW = [1.3, 1.05, 0.4], BILL_SPOT = [1.36, 0.42, 0.3], BILL_RED = [1.36, 0.46, 0.3];

  const DEFAULTS = {
    scene: 'sharks',     // sharks | mantas | koi | birds | waves | landscape | alpenglow | image | text
    width: 892, height: 1248,
    cols: 56, cellAspect: 1.5,
    seed: 7,
    size: 1,             // sharks: body length · waves: swell · landscape: relief · image/text: zoom
    heading: -90,        // sharks: swim direction (deg) · waves: sign of cos() sets travel direction
    spread: 35,
    count: 4,
    species: ['grey', 'sand', 'hammer', 'grey'],
    speed: 1,
    background: '#050506', // or 'transparent'
    gridColor: '#121215',
    grid: true,
    trails: true,        // sharks wake · wave spray · landscape mist
    contour: true,       // creatures: shape-aware outline glyphs
    contourChars: ".,'`-_/\\|():;",
    ambient: 1,          // creatures in water: caustics + drifting particles
    koiPads: 6,          // koi: lily pads floating on top
    koiRipples: 1,       // koi: rings when a fish kisses the surface
    varieties: null,     // koi: list of varieties to use in turn (kohaku, tancho, sanke, showa, utsuri, asagi, shusui, chagoi, kujaku, butterfly, silver, gold); null = the scene's mix
    pointer: null,       // [x, y] as fractions of the scene, or null: koi startle away from a moving pointer and come up to one that rests; it rings the pond surface
    splash: 0,           // bump this number to drop a splash at the pointer (a click)
    presence: 1,         // 0..1: share of cells drawn, a fixed random per cell, so a scene can dissolve in or out (crossfades)
    cutout: null,        // [x0, x1, fade] as fractions of the width: nothing is drawn between x0 and x1, and cells dissolve over `fade` on each side
    sides: 0,            // creatures: 0 = whole scene; 0.05-0.45 = fraction of the width kept on each side. Koi live in the two bands and now and then cross; swimmers and birds travel both ways
    glow: true,          // teal dot field
    glitch: 0.06,
    flicker: 2.4,
    anim: null,          // image: light motion so a photo feels filmed { breathe, wind: [...], parts: [...] }
    animAmount: 1,       // image: scales every motion amplitude (0 = still)
    // image / text
    source: null,        // HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
    threshold: 0.32,
    color: true,         // keep source colors
    invert: false,
    text: 'ASCII',
    ink: null,           // glyph contrast against its cell, 0..1 (null = scene default)
    ramp: '@8%SX#t;:',   // body characters, dense to light
    edgeChars: ".,'`:;',", // outline characters: first half soft, second half hard
    highChars: '@8%',    // highlight characters
    gap: null,           // px between cells (null = auto)
    brightness: 1,
    saturation: 1,
    // alpenglow
    agDaylight: 0, agCycle: false, agCycleSpeed: 1,
    agPeak1: 0.42, agPeak2: 0.71, agRugged: 1, agSnow: 0.5, agGlow: 0.42, agLight: -1, agHaze: 1, agFar: true,
    agSun: true, agSunX: 0.12, agSunY: 0.13,
    agMist: 1, agMistSpeed: 1, agClouds: 1, agCloudSpeed: 1, agStars: 1, agBirds: 5, agFireflies: 22,
    agTrees: true, agTreeScale: 1, agFlowers: 1, agWind: 1, agGrass: true,
    agPalettes: {
      dusk: {
        skyTop: '#0a0c22', skyMid: '#28254f', skyBottom: '#0e1028',
        snowHi: '#dd7d3d', snowMid: '#d65d40', snowLo: '#ba4a60', snowShadow: '#7663b3',
        rockLit: '#b35a50', rockShadow: '#5a50a3', haze: '#635db3', far: '#ba5a6d',
        foot: '#4a50a6', near: '#405098', mist: '#6d6ab6',
        leaf: '#3d7350', leaf2: '#305d6d', rim: '#8070b0', grass: '#488858',
        cloud: '#c3536d', bird: '#8080a8', star: '#8086b8', sun: '#e0c890', firefly: '#e8c858',
        flower1: '#e06020', flower2: '#d6862a', flower3: '#e03a26', flower4: '#d09d43', flower5: '#ca507d',
      },
      day: {
        skyTop: '#6a9fdd', skyMid: '#d3e5f5', skyBottom: '#b9d4ec',
        snowHi: '#a5a5aa', snowMid: '#a0a3ab', snowLo: '#9ba0ad', snowShadow: '#7686b3',
        rockLit: '#938a80', rockShadow: '#5a6689', haze: '#7d8dab', far: '#9098ab',
        foot: '#507080', near: '#436a60', mist: '#999ca8',
        leaf: '#509643', leaf2: '#3d8058', rim: '#88a958', grass: '#6aad48',
        cloud: '#a0a0a6', bird: '#262b38', star: '#8086b8', sun: '#b3aa8d', firefly: '#e8c858',
        flower1: '#e06020', flower2: '#d6862a', flower3: '#e03a26', flower4: '#d09d43', flower5: '#ca507d',
      },
    },
    textFont: '700 200px Inter, "Helvetica Neue", Arial, sans-serif',
    font: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    accents: ['#ff8a3d', '#b46bff', '#ff4d4d', '#45d483', '#4d7cff'],
    spinePoints: 22,
  };

  function ihash(a, b, c) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return h >>> 0;
  }
  const rnd3 = (a, b, c) => ihash(a, b, c) / 4294967296;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rgb = (r, g, b) => `rgb(${clamp(r | 0, 0, 255)},${clamp(g | 0, 0, 255)},${clamp(b | 0, 0, 255)})`;
  const smooth = (x) => x * x * (3 - 2 * x);
  function noise1(x, seed) {
    const i = Math.floor(x), f = x - i;
    return rnd3(i, seed, 11) + (rnd3(i + 1, seed, 11) - rnd3(i, seed, 11)) * smooth(f);
  }
  function noise2(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi), s = seed * 7;
    const a = rnd3(xi + s, yi, 13), b = rnd3(xi + 1 + s, yi, 13), c = rnd3(xi + s, yi + 1, 13), d = rnd3(xi + 1 + s, yi + 1, 13);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm2(x, y, seed) {
    let v = 0, a = 0.5, f = 1;
    for (let o = 0; o < 4; o++) { v += a * noise2(x * f, y * f, seed + o * 31); f *= 2.03; a *= 0.5; }
    return v / 0.9375;
  }
  function fbm1(x, seed) {
    let v = 0, a = 0.5, f = 1;
    for (let o = 0; o < 4; o++) { v += a * noise1(x * f, seed + o * 17); f *= 2.03; a *= 0.5; }
    return v / 0.9375;
  }
  function profile(p, s) {
    if (s <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      if (s <= p[i][0]) { const a = p[i - 1], b = p[i]; return a[1] + (b[1] - a[1]) * ((s - a[0]) / (b[0] - a[0])); }
    }
    return p[p.length - 1][1];
  }
  function halfWidth(sp, s, W) {
    let hw = profile(sp.prof, s) * W;
    const [a, b, w] = sp.pect;
    if (s > a && s < b) { const k = (s - a) / (b - a); hw += w * W * k * (k < 0.85 ? 1 : (1 - k) / 0.15); }
    if (s > 0.88) hw = Math.max(hw, sp.tail * W * Math.pow((s - 0.88) / 0.12, 1.3));
    return hw;
  }

  // Values that arrive from configs (embeds, URLs) are kept in a range the engine can draw,
  // so a typo never stops the animation or hangs the page
  const num = (v, d, lo, hi) => { const n = +v; return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
  function sane(o) {
    o.width = num(o.width, 300, 1, 16384); o.height = num(o.height, 150, 1, 16384);
    o.cols = num(o.cols, 56, 4, 600); o.cellAspect = num(o.cellAspect, 1.5, 0.5, 4);
    o.count = Math.round(num(o.count, 4, 0, 60)); o.koiPads = num(o.koiPads, 6, 0, 30);
    o.agBirds = num(o.agBirds, 5, 0, 200); o.agFireflies = num(o.agFireflies, 22, 0, 200);
    o.size = num(o.size, 1, 0.05, 6); o.spread = num(o.spread, 35, 0, 360); o.heading = num(o.heading, -90, -720, 720);
    o.sides = num(o.sides, 0, 0, 0.45); o.presence = num(o.presence, 1, 0, 1); o.seed = num(o.seed, 7, -1e9, 1e9);
    if (!Array.isArray(o.accents) || !o.accents.length) o.accents = DEFAULTS.accents;
    if (o.varieties != null && !Array.isArray(o.varieties)) o.varieties = null;
    if (o.anim != null && typeof o.anim !== 'object') o.anim = null;
    if (typeof o.ramp !== 'string' || !o.ramp) o.ramp = DEFAULTS.ramp;
    return o;
  }
  function create(options) {
    const o = sane(Object.assign({}, DEFAULTS, options || {}));
    let cw, ch, cols, rows;
    // Cell buffers written by scenes, read by draw()
    let kind, chrO, shade, dim, TR, TG, TB, glow, GR, GG, GB, dash;
    let scene = null;

    function layout() {
      cols = Math.max(8, Math.round(o.cols));
      cw = o.width / cols; ch = cw * o.cellAspect;
      rows = Math.ceil(o.height / ch);
      const n = cols * rows;
      kind = new Uint8Array(n); chrO = new Uint16Array(n); shade = new Float32Array(n); dim = new Float32Array(n);
      TR = new Float32Array(n); TG = new Float32Array(n); TB = new Float32Array(n);
      glow = new Float32Array(n); GR = new Float32Array(n); GG = new Float32Array(n); GB = new Float32Array(n);
      dash = new Float32Array(n);
    }
    function clear() { kind.fill(0); glow.fill(0); dash.fill(0); }
    function put(idx, k, s, v, t3) { kind[idx] = k; chrO[idx] = 0; shade[idx] = s; dim[idx] = v; TR[idx] = t3[0]; TG[idx] = t3[1]; TB[idx] = t3[2]; }
    function putChar(idx, k, s, v, t3, chr) { put(idx, k, s, v, t3); chrO[idx] = chr.codePointAt(0); }
    function putGlow(idx, I, t3) { if (I > glow[idx]) { glow[idx] = I; GR[idx] = t3[0]; GG[idx] = t3[1]; GB[idx] = t3[2]; } }
    function putDash(idx, a) { if (a > dash[idx]) dash[idx] = a; }

    /* ---------------- Creatures: top-down swimmers and flyers ---------------- */
    // Each plan gives the body (geo: is (s, a) inside, and which part) and its light (shade).
    // Koi colours: milky white, deep vermilion, blue-black sumi, platinum, orange, the slate blue of
    // asagi and shusui, chagoi bronze, the grey net of metallic scales, translucent fins
    // soft colour edges: blend two tints into a scratch array (copied by put)
    const KMIX = [0, 0, 0], KFOG = [0, 0, 0];
    const kmix = (a, b, t) => { KMIX[0] = a[0] + (b[0] - a[0]) * t; KMIX[1] = a[1] + (b[1] - a[1]) * t; KMIX[2] = a[2] + (b[2] - a[2]) * t; return KMIX; };
    const ksmooth = (x, a, b) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
    // A touched koi's dart: eases in over a fraction of a second, then eases out,
// so the speed and the turn swell and settle instead of snapping.
const BOLT_RUN = 1.9, BOLT_TURN = 1.5;
function boltCurve(t, len) {
  const rise = 0.22;
  if (t <= 0 || t >= len) return 0;
  if (t < rise) { const u = t / rise; return u * u * (3 - 2 * u); }
  const u = (t - rise) / (len - rise);
  return 0.5 + 0.5 * Math.cos(Math.PI * u);
}
const KOI_TINTS = {
      white: [1.05, 1.03, 0.98], red: [1.38, 0.4, 0.22], black: [0.3, 0.32, 0.4], gold: [1.28, 0.98, 0.46],
      silver: [0.98, 1.01, 1.08], orange: [1.4, 0.66, 0.26], blue: [0.58, 0.74, 0.98], bronze: [1.12, 0.8, 0.54],
      net: [0.66, 0.7, 0.8], fin: [0.9, 0.97, 1], redFin: [1.2, 0.62, 0.48],
    };
    const DIRC = ['-', '\\', '|', '/'].map((d) => d.codePointAt(0));
    // body glyph picked from the ramp by brightness (no per-frame jitter, so markings stay crisp)
    function rampCh(val) { const R = cps(o.ramp || '@8%SX#t;:'), n = R.length; return R[clamp(Math.floor((1 - clamp(val, 0, 1)) * (n - 0.01)), 0, n - 1)]; }
    const POND = [0.42, 0.76, 0.64], LEAF = [0.46, 0.72, 0.48], OLDLEAF = [0.95, 0.82, 0.42], UNDERSIDE = [0.9, 0.52, 0.5], DROP = [0.9, 1.04, 1.12], LOTUS_IN = [1.4, 1.02, 1.06], LOTUS = [1.45, 0.74, 0.9], POLLEN = [1.32, 1.12, 0.5];
    function tri(ax, ay, bx, by, cx, cy, px, py) {
      const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by), d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy), d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
      return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
    }
    function inPoly(P, x, y) {
      let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    }
    function caustic(x, y, t) {
      const f = 3.2 / Math.min(o.width, o.height);
      const v = Math.abs(noise2(x * f + t * 0.21, y * f - t * 0.13, o.seed + 40) - noise2(x * f * 1.27 - t * 0.17, y * f * 1.27 + t * 0.19, o.seed + 41));
      return v < 0.05 ? 1 - v / 0.05 : 0;
    }
    const PLANS = {
      shark: {
        rigid: false, reach: 0.4, amp: 0.085, yaw: 0.012, freq: 0.9, kw: 0.85, burst: 0.22, burstT: [5, 3], vel: 0.07, len: [0.3, 0.24], meander: [0.12, 0.22], wl: [3, 3],
        geo(c, s, a, side) {
          if (s < 0 || s > 1.01) return 0;
          const sp = c.sp, hw = profile(sp.prof, s) * sp.width;
          if (a < hw) return 1;
          if (s > 0.84) { const k = (s - 0.84) / 0.16; if (a < sp.tailA * Math.pow(k, 1.1) * (1 + 0.25 * Math.abs(c.sweep)) + 0.004) return 3; }
          return 0;
        },
        finAt: 0.26,
        fins(c, s, a, side) {
          const sp = c.sp, F = sp.fin, fl = c.flex * side;
          if (s > F[0] - 0.01 && s < F[2] + 0.04 && a < F[3] * 1.1) {
            // swept-back sickle: leading edge F0 → tip, trailing edge curves back in to F1
            const tipS = F[2] + 0.01 * fl, tipA = F[3] * (1 + 0.04 * fl), k = a / tipA;
            const lead = F[0] + (tipS - F[0]) * Math.pow(k, 1.25), trail = F[1] + (tipS + 0.015 - F[1]) * Math.pow(k, 0.7);
            if (k <= 1 && s >= lead && s <= trail) return 2;
          }
          if (s > 0.58 && s < 0.72 && tri(0.6, 0, 0.7, sp.width * 0.58, 0.665, 0, s, a)) return 2;
          return 0;
        },
        shade(c, q, out) {
          const sp = c.sp, s = q.s, nl = q.nx * LX + q.ny * LY;
          out.tint = sp.tint; out.kd = BODY;
          if (q.reg === 1) {
            const hw = profile(sp.prof, s) * sp.width, e = q.a / (hw || 1);
            let val = 0.6 - e * e * 0.38 + nl * e * 0.3;
            if (s > sp.dorsal[0] && s < sp.dorsal[1] && e < 0.32) { out.kd = HIGH; val = 1; }
            else if (s > sp.second[0] && s < sp.second[1] && e < 0.3) val = Math.max(val, 0.85);
            else if (s > sp.eye[0] && s < sp.eye[1] && e > sp.eye[2] && e < sp.eye[3]) { out.kd = MARK; val = 0; }
            else if (s > sp.gills[0] && s < sp.gills[1] && e > 0.55) {
              if (Math.floor(((s - sp.gills[0]) / (sp.gills[1] - sp.gills[0])) * 5) % 2 === 0) { out.kd = DARK; val *= 0.5; }
            }
            if (s > 0.85) val *= 0.85;
            out.val = val;
          } else if (q.reg === 2) {
            const tip = q.a / sp.fin[3];
            out.val = 0.5 - 0.16 * tip + nl * 0.14;
            if (sp.tipDark && tip > 0.8) { out.kd = DARK; out.val *= 0.6; }
          } else out.val = 0.42 + nl * 0.1;
        },
      },
      koi: {
        rigid: false, wander: true, reach: 0.4, amp: 0.09, yaw: 0.016, freq: 1.1, kw: 0.78, burst: 0.6, burstT: [3.5, 3], vel: 0.045, len: [0.24, 0.16], meander: [0, 0], wl: [1, 1],
        geo(c, s, a, side) {
          const sp = c.sp, bf = c.variety === 'butterfly';
          if (s < 0) return a * a + s * s * 3 < 0.0016 ? 1 : 0;   // rounded snout
          if (s > 1) return 0;
          const hw = profile(sp.prof, s) * sp.width;
          if (a < hw) return 1;
          if (s > 0.76) {
            // caudal fin: a forked fan that trails the body's sweep
            const k = (s - 0.76) / 0.24, fan = 0.035 + (bf ? 0.18 : 0.13) * Math.pow(k, 0.75) * (1 + 0.22 * c.tailLag * side);
            const fork = s > 0.86 && a < 0.075 * (s - 0.86) / 0.14;
            if (a < fan && !fork) return 3;
          }
          return 0;
        },
        finAt: 0.2,
        fins(c, s, a, side) {
          const bf = c.variety === 'butterfly', fl = c.flex * side, spread = c.finSpread * (1 + 0.14 * fl);
          const tipA = (bf ? 0.34 : 0.25) * spread, tipS = (bf ? 0.44 : 0.34) + 0.03 * fl + (1.1 - c.finSpread) * 0.07;
          if (s > 0.12 && s < tipS + 0.06 && a < tipA * 1.05) {
            // pectoral paddles: open while gliding, tucked in on each tail kick
            const k = a / tipA;
            if (k <= 1 && s >= 0.15 + (tipS - 0.15) * k * k && s <= 0.29 + (tipS + 0.04 - 0.29) * Math.sqrt(k)) return 2;
          }
          if (s > 0.5 && s < 0.72 && tri(0.52, 0, 0.67 + 0.02 * fl, bf ? 0.17 : 0.13, 0.62, 0, s, a)) return 5;
          return 0;
        },
        shade(c, q, out) {
          const s = q.s, a = q.a, nl = q.nx * LX + q.ny * LY, V = c.variety;
          // body axis (head → tail) from the normal, for strokes that follow the fish
          const ux = q.ny * q.side, uy = -q.nx * q.side;
          out.kd = BODY;
          let val, tint, hiT = -1;
          if (q.reg === 1) {
            const hw = profile(c.sp.prof, s) * c.sp.width, e = a / (hw || 1), x = (q.side * a) / c.sp.width;
            val = 0.68 - e * e * 0.3 + nl * e * 0.14;
            const big = noise2(s * 2.6 + c.id * 13.7, x * 0.7 + 3, o.seed + c.id), fine = noise2(s * 11 + c.id * 3.1, x * 3 + 7, o.seed + 9 + c.id);
            const patch = big + (fine - 0.5) * 0.1, body = s > 0.13 && s < 0.76, head = s > 0.03 && s < 0.12 && Math.abs(x) < 0.7;
            // scales: diamond lattice catching the light, brighter on the lit flank (doitsu shusui has none)
            const sc = Math.abs(Math.sin(s * 95 + x * 6)) + Math.abs(Math.sin(s * 95 - x * 6)), edge = sc > 1.55, flank = body && Math.abs(x) > 0.66;
            tint = KOI_TINTS.white;
            if (V === 'gold') tint = KOI_TINTS.gold;
            else if (V === 'silver') tint = KOI_TINTS.silver;
            else if (V === 'butterfly') tint = c.id % 2 ? KOI_TINTS.silver : KOI_TINTS.orange;
            else if (V === 'tancho') { const r = 1 - ksmooth(Math.hypot((s - 0.075) / 0.04, x / 0.48), 0.75, 1.15); tint = r > 0.98 ? KOI_TINTS.red : r < 0.02 ? KOI_TINTS.white : kmix(KOI_TINTS.white, KOI_TINTS.red, r); hiT = r; }
            else if (V === 'showa') { const r = (body || head) ? ksmooth(patch, 0.52, 0.6) : 0; tint = r > 0.5 ? kmix(KOI_TINTS.black, KOI_TINTS.red, r) : fine > 0.6 && s > 0.14 ? KOI_TINTS.white : KOI_TINTS.black; hiT = r > 0.5 ? r : -1; }
            else if (V === 'sanke') {
              const r = Math.max(body ? ksmooth(patch, 0.44, 0.54) : 0, head ? ksmooth(big, 0.38, 0.48) : 0);
              const sumi = body && fine > 0.72 && s > 0.2 && Math.abs(x) < 0.8;
              tint = sumi ? KOI_TINTS.black : kmix(KOI_TINTS.white, KOI_TINTS.red, r); hiT = sumi ? -1 : r;
            }
            else if (V === 'utsuri') tint = (patch > 0.48 && (body || head)) || (head && big > 0.5) ? KOI_TINTS.white : KOI_TINTS.black; // shiro utsuri
            else if (V === 'asagi') tint = flank || (s > 0.03 && s < 0.12 && Math.abs(x) > 0.6) ? KOI_TINTS.red : head ? KOI_TINTS.silver : edge ? KOI_TINTS.net : KOI_TINTS.blue;
            else if (V === 'shusui') tint = flank ? KOI_TINTS.red : body && Math.abs(x) < 0.2 && Math.abs(Math.sin(s * 48)) > 0.55 ? KOI_TINTS.black : head ? KOI_TINTS.silver : KOI_TINTS.blue;
            else if (V === 'chagoi') tint = edge ? KOI_TINTS.net : KOI_TINTS.bronze;
            else if (V === 'kujaku') tint = patch > 0.53 && (body || head) ? KOI_TINTS.orange : edge && body ? KOI_TINTS.net : KOI_TINTS.silver;
            else {
              // kohaku: red patches with soft, slightly bleeding edges on milky white
              const r = Math.max(body ? ksmooth(patch, 0.42, 0.52) : 0, head ? ksmooth(big, 0.36, 0.46) : 0);
              tint = kmix(KOI_TINTS.white, KOI_TINTS.red, r); hiT = r;
            }
            if (tint === KOI_TINTS.black) val *= 0.72;
            // white reads clean and milky, red deepens toward the middle of a patch
            if (hiT >= 0) val += 0.12 * (1 - hiT) - 0.05 * hiT * ksmooth(patch, 0.6, 0.75);
            else if (tint === KOI_TINTS.white || tint === KOI_TINTS.silver) val += 0.12; // a clean, milky white, not grey
            // lit along the back, fading toward the tail
            val *= 1.05 - 0.22 * ksmooth(s, 0.42, 0.8);
            if (tint === KOI_TINTS.net) val *= 0.86;
            if (V === 'gold' || V === 'silver' || V === 'butterfly' || V === 'kujaku') val += 0.07;
            if (V !== 'shusui') val += (sc > 1.6 ? 0.07 : -0.02) * (0.6 + 0.4 * e);
            // gill cover: a darker arc behind the head
            if (s > 0.115 && s < 0.135 && e > 0.25) val *= 0.78;
            // eyes on the sides of the head
            if (s > 0.05 && s < 0.085 && e > 0.58 && e < 0.9) { out.kd = MARK; val = 0; }
            // dorsal fin seen from above: a raised line down the back
            else if (Math.abs(x) < 0.13 && s > 0.26 && s < 0.6) {
              val = Math.max(val, 0.88);
              out.ch = DIRC[((Math.round(Math.atan2(uy / ch, ux / cw) / (Math.PI / 4)) % 4) + 4) % 4];
            }
            // nostrils / mouth at the snout
            else if (s < 0.025) val *= 0.85;
            if (!out.ch) out.ch = rampCh(val);
          } else {
            // translucent fins with rays fanning from their root
            let rx, ry, root;
            if (q.reg === 3) { root = 0.76; rx = (s - root); ry = a; }
            else if (q.reg === 2) { root = 0.2; rx = (s - root); ry = a - 0.08; }
            else { root = 0.52; rx = (s - root); ry = a; }
            const ra = Math.atan2(ry, rx), rays = Math.abs(Math.sin(ra * (q.reg === 3 ? 9 : 6)));
            val = 0.5 + nl * 0.04 - Math.hypot(rx, ry) * (q.reg === 3 ? 0.7 : 0.6);
            tint = V === 'gold' ? KOI_TINTS.gold : V === 'butterfly' && c.id % 2 === 0 ? KOI_TINTS.orange : (V === 'showa' || V === 'utsuri') && q.reg === 2 ? KOI_TINTS.black
              : (V === 'asagi' || V === 'shusui') && q.reg === 2 ? KOI_TINTS.redFin : V === 'chagoi' ? KOI_TINTS.bronze : KOI_TINTS.fin;
            if (rays < 0.3) {
              val += 0.14;
              const wx = ux * rx + q.nx * ry, wy = uy * rx + q.ny * ry;
              out.ch = DIRC[((Math.round(Math.atan2(wy / ch, wx / cw) / (Math.PI / 4)) % 4) + 4) % 4];
            } else out.ch = rampCh(val * 0.8);
          }
          out.val = val;
          // deeper fish sink a little into the green water (a blended tint is not cached: it changes cell to cell)
          const f = (1 - c.depth) * 0.3;
          if (tint === KMIX) { KFOG[0] = tint[0] * (1 - f) + POND[0] * f; KFOG[1] = tint[1] * (1 - f) + POND[1] * f; KFOG[2] = tint[2] * (1 - f) + POND[2] * f; out.tint = KFOG; }
          else {
            let m = c.fog.get(tint);
            if (!m) { m = [tint[0] * (1 - f) + POND[0] * f, tint[1] * (1 - f) + POND[1] * f, tint[2] * (1 - f) + POND[2] * f]; c.fog.set(tint, m); }
            out.tint = m;
          }
        },
        strokes(c, emit) {
          // barbels at the corners of the mouth
          const sw = 0.012 * Math.sin(c.flex * 2);
          emit(c, -0.015, 0.035 + sw, KOI_TINTS.fin, 0.45, '`');
          emit(c, -0.015, -0.035 - sw, KOI_TINTS.fin, 0.45, "'");
        },
      },
      manta: {
        rigid: true, reach: 1.15, burst: 0.1, burstT: [6, 3], vel: 0.06, len: [0.17, 0.13], meander: [0.25, 0.3], wl: [4, 4], bankK: 6, beat: 0.24,
        theta(c, s) { return 0.55 * Math.sin(c.phi - s * 2.6); },
        geo(c, s, a, side) {
          if (s > -0.03 && s < 0.075 && a > 0.045 && a < 0.105) return 4;
          if (s < 0.04 || s > 0.8) return 0;
          const hw = profile(c.sp.prof, s), core = 0.13;
          if (a <= core) return a < hw ? 1 : 0;
          const f = Math.cos(this.theta(c, s)) * (1 - 0.12 * c.bank * side);
          return core + (a - core) / f < hw ? 2 : 0;
        },
        shade(c, q, out) {
          const s = q.s, a = q.a, nl = q.nx * LX + q.ny * LY, hw = profile(c.sp.prof, s), core = 0.13;
          out.kd = BODY; out.tint = c.sp.tint;
          if (q.reg === 4) { out.val = 0.5; return; }
          let val = 0.4 + 0.08 * (1 - a / 1.04);
          if (q.reg === 2) {
            const w = clamp((a - core) / Math.max(0.05, hw - core), 0, 1);
            val += 0.26 * Math.sin(this.theta(c, s)) * nl * w * 2;
            if (w > 0.86) val *= 0.78;
          } else val += 0.06 + nl * 0.05;
          if (a > 0.12 && a < 0.55 && Math.abs(s - (0.13 + (a - 0.12) * 0.42)) < 0.05) { val = Math.max(val, 0.82); out.tint = [0.92, 0.98, 1.06]; }
          if (s > 0.06 && s < 0.1 && a > 0.085 && a < 0.115) { out.kd = MARK; val = 0; }
          if (a < 0.02 && s > 0.2 && s < 0.7) val = Math.max(val, 0.62);
          out.val = val;
        },
        strokes(c, emit) {
          for (let s = 0.8; s < 1.45; s += 0.035) {
            const lat = 0.035 * Math.sin(c.phi * 0.8 - s * 7) * (s - 0.8);
            emit(c, s, lat, c.sp.tint, 0.55 - (s - 0.8) * 0.4);
          }
        },
      },
      bird: {
        rigid: true, reach: 1.25, burst: 0.08, burstT: [4, 3], vel: 0.09, len: [0.2, 0.12], meander: [0.7, 0.7], wl: [6, 5], bankK: 11, shadowMul: 2.8,
        span(c, a, side) {
          const bk = 1 - 0.12 * c.bank * side, f = c.f * bk, f2 = (c.f2 || c.f) * bk, sp = c.sp;
          let x = a / f;
          if (x > sp.wrist) x = sp.wrist + (a - sp.wrist * f) / f2 / c.fold;
          return x;
        },
        // body-axis position of a wing point once the sweep is applied (tips move most)
        swept(c, s, x) { return s + (c.sweep || 0) * x * x; },
        geo(c, s, a, side) {
          const sp = c.sp;
          if (s >= 0 && s <= 1 && a < profile(sp.prof, s)) return 1;
          if (s < 0.05 || s > 0.75) return 0;
          const x = this.span(c, a, side);
          return inPoly(sp.wing, this.swept(c, s, x), x) ? 2 : 0;
        },
        shade(c, q, out) {
          // Plumage from above: gull = white head and body, grey mantle, black wingtips with white
          // mirrors, white trailing edge, yellow bill with a red spot; stork = white with black flight
          // feathers, red bill and legs.
          const sp = c.sp, s = q.s, nl = q.nx * LX + q.ny * LY;
          out.kd = BODY; out.tint = sp.tint;
          if (q.reg === 1) {
            const hw = profile(sp.prof, s) || 0.01, e = q.a / hw;
            out.val = 0.86 - e * e * 0.28 + nl * e * 0.18;
            if (sp.legs) {
              if (s < 0.11) { out.tint = BILL_RED; out.val = 0.62; }
            } else if (s < 0.035) { out.tint = s > 0.022 && e < 0.6 ? BILL_SPOT : BILL_YELLOW; out.val = 0.74; }
            else if (s > 0.2 && s < 0.62 && e < 0.55) { out.tint = MANTLE; out.val = 0.7 + 0.1 * nl; } // grey saddle between the wings
            return;
          }
          const x = this.span(c, q.a, q.side), tilt = c.sinT * nl, sw = this.swept(c, s, x);
          const trailing = !inPoly(sp.wing, sw + 0.035, x);
          let val = 0.78 + 0.22 * tilt;
          val *= 0.94 + 0.06 * Math.sin(x * 55); // feather rows
          if (sp.legs) {
            if (sw > 0.42 + x * 0.04 || x > 1.05) { out.tint = TIP_INK; val = 0.28 + 0.06 * Math.sin(x * 40); }
          } else if (x > 1.0) {
            // black primaries, a white mirror near the very tip
            const mirror = x > 1.1 && x < 1.2 && !trailing && sw > 0.3;
            if (mirror) { out.tint = sp.tint; val = 0.82; }
            else { out.tint = TIP_INK; val = 0.3 + 0.08 * tilt; } // charcoal, so tips still read against a dark sea
          } else {
            out.tint = trailing ? sp.tint : MANTLE;
            val = trailing ? 0.86 : val * 0.82;
            if (!trailing && sw < 0.27 + x * 0.12 && x > 0.15) val += 0.06; // leading edge catches the light
          }
          out.val = val;
        },
        strokes(c, emit) {
          if (!c.sp.legs) return;
          for (let s = 0.76; s < 1.02; s += 0.03) emit(c, s, 0, [1.36, 0.46, 0.3], 0.6);
        },
      },
    };
    const CREATURE_SCENES = {
      sharks: { water: true, glowTint: TEAL, species: null },
      mantas: { water: true, glowTint: [0.28, 0.62, 0.98], species: ['manta'], bg: ['#03060c', '#05101c', '#02040a'], grid: '#0b1119' },
      koi: { water: true, pond: true, trails: false, glowTint: [0.3, 0.7, 0.55], species: ['koi'], varieties: ['kohaku', 'showa', 'asagi', 'sanke', 'tancho', 'utsuri', 'kujaku', 'shusui', 'kohaku', 'chagoi', 'butterfly', 'silver'], bg: ['#030705', '#06110d', '#020504'], grid: '#0b130f' },
      // seen from above, over a dark sea: the glitter of the water drifts below, shadows fall far down on it
      birds: { water: true, glowTint: [0.36, 0.66, 0.86], species: ['gull', 'gull', 'stork', 'gull'], trails: false, bg: ['#04101a', '#071a28', '#030b13'], grid: '#0a1822' },
    };

    function Creatures(name) {
      const def = CREATURE_SCENES[name] || CREATURE_SCENES.sharks;
      let list = [], pads = [];
      const wv = [0, 0, 0, 0];
      // live state: the pointer (px, last move time) and the rings it left on the surface
      let curT = 0, lastT = null, ptr = null, lastSplash = 0, pokes = [];
      // Wandering path (pond fish): steered by noise, turned back before the edges; built once, extended lazily
      function wanderTo(c, U) {
        const p = c.path, st = p.step, Lb = c.Lb;
        while (p.len < U + st * 2) {
          const j = p.x.length - 1, n = p.base + j, x = p.x[j], y = p.y[j];
          // head for a wandering target inside the pond, with a little noise on top
          const seg = Math.floor((n * st) / (Lb * 5));
          let tx, ty, lo = 0, hi = o.width;
          if (o.sides > 0) {
            // sides: each fish owns a lane of its side band and swims back and forth along it, using
            // the band's whole width; now and then it makes a short trip across and comes back
            const sw = clamp(o.sides, 0.05, 0.45);
            if (seg !== p.seg) { p.away = p.seg !== undefined && rnd3(seg, p.seed, 33) < 0.07; p.seg = seg; }
            const side = p.away ? -p.side : p.side, end = (seg + (p.k || 0) + (p.side > 0 ? 1 : 0)) % 2 ? 0.72 : 0.3;
            const u = clamp(end + (rnd3(seg, p.seed, 31) - 0.5) * 0.16, 0.22, 0.8);
            tx = o.width * (side < 0 ? sw * u : 1 - sw * (1 - u));
            // the band's inner edge acts like the pond's edge, except on a trip across
            if (!p.away) { if (side < 0) hi = o.width * sw; else lo = o.width * (1 - sw); }
            ty = o.height * clamp(p.hy + (rnd3(seg, p.seed, 32) - 0.5) * p.lane, 0.05, 0.95);
          } else {
            tx = o.width * clamp(p.hx + (rnd3(seg, p.seed, 31) - 0.5) * 0.6, 0.25, 0.75); ty = o.height * clamp(p.hy + (rnd3(seg, p.seed, 32) - 0.5) * 0.6, 0.25, 0.75);
          }
          let dth = Math.atan2(ty - y, tx - x) - p.th;
          dth = ((dth % TAU) + TAU * 1.5) % TAU - Math.PI;
          // in side lanes the fish hold their course more and wander less, so they keep to their lane
          const pull = o.sides > 0 ? 0.9 : 0.6, wobble = o.sides > 0 ? 0.8 : 1.6;
          let k = dth * pull / Lb + (noise1((n * st) / (Lb * 2.2), p.seed) - 0.5) * wobble / Lb;
          // side bands are narrow: look a little further, keep a wider margin and allow tighter turns
          const sb = o.sides > 0, dx = Math.cos(p.th), dy = Math.sin(p.th), look = Lb * (sb ? 1.25 : 1.8), mg = Lb * (sb ? 0.5 : o.count <= 4 ? 1 : 0.3); // a few creatures keep well inside
          // top and bottom of a side band: the fish may graze the screen edge, so the corners fill too
          const my = sb ? Lb * 0.1 : mg, ly = sb ? 0.6 : 1;
          const qx = x + dx * look, qy = y + dy * look * ly, out = Math.max(lo + mg - qx, qx - (hi - mg), my - qy, qy - (o.height - my), 0);
          if (out > 0) {
            // turn back toward the middle, the same way round as the target pull so the two never cancel
            // (in side lanes, back toward its own lane rather than the middle of the screen)
            const cx = (lo + hi) / 2 - x, cy = (o.sides > 0 && !p.away ? p.hy * o.height : o.height / 2) - y;
            let ac = Math.atan2(cy, cx) - p.th;
            ac = ((ac % TAU) + TAU * 1.5) % TAU - Math.PI;
            const turn = Math.abs(ac) > 2.6 && Math.abs(dth) > 0.2 ? Math.sign(dth) : Math.sign(ac) || 1;
            k += turn * (sb ? 1.1 + 2.2 * Math.min(1, out / Lb) : 0.6 + 1.5 * Math.min(1, out / Lb)) / Lb;
          }
          // keep clear of the other fish (their paths run just ahead of them)
          for (const c2 of list) {
            if (c2 === c || !c2.path) continue;
            const p2 = c2.path, j = p2.x.length - 1, ex = p2.x[j] - x, ey = p2.y[j] - y, d = Math.hypot(ex, ey), R = (Lb + c2.Lb) * 0.75;
            if (d < R && d > 1) k += (dx * ey - dy * ex >= 0 ? -1 : 1) * 1.1 * (1 - d / R) / Lb;
          }
          // just touched: turn hard away from where the pointer was, for the length of the dart
          if (c.bolt != null && curT - c.bolt < BOLT_TURN) {
            const ex = c.boltX - x, ey = c.boltY - y, turn = dx * ey - dy * ex >= 0 ? 1 : -1;
            k -= turn * 2.2 * boltCurve(curT - c.bolt, BOLT_TURN) / Lb;
          }
          // the pointer: a moving one startles the fish away, a resting one draws them in
          if (ptr) {
            const age = curT - ptr.t, ex = ptr.x - x, ey = ptr.y - y, d = Math.hypot(ex, ey), turn = dx * ey - dy * ex >= 0 ? 1 : -1;
            if (age < 1.6 && d < Lb * 2.4) k -= turn * 1.6 * (1 - d / (Lb * 2.4)) / Lb;
            else if (age > 1.8 && age < 16 && d < Lb * 5 && d > Lb * 1.4 && !(c.bolt != null && curT - c.bolt < 4)) k += turn * 0.7 * Math.min(1, (age - 1.8) / 1.5) / Lb;
          }
          const km = (sb ? 2 : 1.2) * (1 + 0.25 * (c.bolt != null && curT - c.bolt < BOLT_TURN ? boltCurve(curT - c.bolt, BOLT_TURN) : 0));
          k = clamp(k, -km / Lb, km / Lb);
          // a creature bigger than the frame cannot turn back on its own radius: when it heads out,
          // let it turn on a circle that fits the frame, so it always comes back into view
          const outside = x < 0 || x > o.width || y < 0 || y > o.height;
          if (out > 0 || outside) {
            const rFit = 0.32 * Math.min(o.width, o.height);
            if (outside || rFit < Lb / km) {
              let ac = Math.atan2(o.height / 2 - y, o.width / 2 - x) - p.th;
              ac = ((ac % TAU) + TAU * 1.5) % TAU - Math.PI;
              if (Math.abs(ac) > 0.35) k = (Math.sign(ac) || 1) * Math.max(km / Lb, 1 / rFit);
            }
          }
          p.th += k * st;
          p.x.push(x + Math.cos(p.th) * st); p.y.push(y + Math.sin(p.th) * st);
          p.len += st;
        }
        // drop the path far behind the tail and its wake, so a pond left open for hours keeps a small memory
        if (p.x.length > 4096) {
          const drop = Math.floor((U - Lb * 3 - cw * 60) / st) - p.base;
          if (drop > 0 && drop < p.x.length - 2) { p.x.splice(0, drop); p.y.splice(0, drop); p.base += drop; }
        }
      }
      function wanderAt(c, u, w) {
        const p = c.path, f = Math.max(0, clamp(u, 0, p.len) / p.step - p.base), i = Math.min(Math.floor(f), p.x.length - 2), t = f - i;
        w[0] = p.x[i] + (p.x[i + 1] - p.x[i]) * t; w[1] = p.y[i] + (p.y[i + 1] - p.y[i]) * t;
        const i0 = Math.max(0, i - 2), i1 = Math.min(p.x.length - 1, i + 3), tx = p.x[i1] - p.x[i0], ty = p.y[i1] - p.y[i0], l = Math.hypot(tx, ty) || 1;
        w[2] = tx / l; w[3] = ty / l;
      }
      function Uof(c, T) { const P = c.plan; return c.offset + c.vel * (T + (P.burst / c.bw) * Math.sin(c.bw * T + c.bp)); }
      const q = { s: 0, a: 0, side: 1, nx: 0, ny: 0, reg: 0 };
      const out = { kd: BODY, val: 0, tint: TEAL };
      const vec = new Float32Array(6);

      function laneM(L, u) { return L.mA * Math.sin(u * L.mk + L.mp) + L.mA2 * Math.sin(u * L.mk2 + L.mp2); }
      function laneDM(L, u) { return L.mA * L.mk * Math.cos(u * L.mk + L.mp) + L.mA2 * L.mk2 * Math.cos(u * L.mk2 + L.mp2); }
      function makeLane(c, k, start) {
        const r = mulberry32(ihash(o.seed * 31 + 7, c.id, k + 1000)), P = c.plan;
        // sides: every other creature travels the opposite way, so both edges stay busy
        const th = ((o.heading + (r() * 2 - 1) * o.spread + (o.sides > 0 && c.id % 2 ? 180 : 0)) * Math.PI) / 180;
        const L = { k, start };
        L.dx = Math.cos(th); L.dy = Math.sin(th); L.px = -L.dy; L.py = L.dx;
        const half = 0.5 * (Math.abs(L.px) * o.width + Math.abs(L.py) * o.height) * 0.8;
        const lat = (((c.slot + 0.5 + (r() - 0.5) * 0.7) / o.count) * 2 - 1) * half, along = (r() - 0.5) * 0.3 * Math.min(o.width, o.height);
        L.cx = o.width / 2 + L.px * lat + L.dx * along; L.cy = o.height / 2 + L.py * lat + L.dy * along;
        L.mA = c.Lb * (P.meander[0] + P.meander[1] * r()); L.mk = TAU / (c.Lb * (P.wl[0] + P.wl[1] * r())); L.mp = r() * TAU;
        L.mA2 = L.mA * 0.3 * r(); L.mk2 = L.mk * (2.1 + r()); L.mp2 = r() * TAU;
        let t0 = -Infinity, t1 = Infinity;
        const m = c.margin;
        for (const [cc, d, W] of [[L.cx, L.dx, o.width], [L.cy, L.dy, o.height]]) {
          if (Math.abs(d) < 1e-9) continue;
          let a = (-m - cc) / d, b = (W + m - cc) / d;
          if (a > b) { const tmp = a; a = b; b = tmp; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        }
        L.t0 = t0; L.t1 = t1;
        L.len = t1 - t0 + c.Lb + c.Lb * 1.2 * r();
        c.lanes[k] = L;
        return L;
      }
      function laneAt(c, U) {
        const Ls = c.lanes;
        if (!Ls.length) makeLane(c, 0, 0);
        let k = Math.min(c.k, Ls.length - 1);
        while (k > 0 && U < Ls[k].start) k--;
        while (U >= Ls[k].start + Ls[k].len) { if (k + 1 >= Ls.length) makeLane(c, k + 1, Ls[k].start + Ls[k].len); k++; }
        c.k = k;
        return Ls[k];
      }
      function build() {
        list = [];
        const m = Math.min(o.width, o.height);
        const names = def.species || (o.species && o.species.length ? o.species : DEFAULTS.species);
        for (let i = 0; i < o.count; i++) {
          const r = mulberry32(ihash(o.seed, i, 99));
          // in side bands sizes are shuffled across the lanes, so big and small fish spread evenly
          const di = o.sides > 0 ? ((i * 0.618034) % 1) * o.count : i;
          const depth = o.count === 1 ? 0.8 : clamp(0.15 + 0.85 * ((di + r() * 0.6) / o.count), 0, 1);
          const sp = SPECIES[names[i % names.length]] || SPECIES.grey, P = PLANS[sp.plan];
          const Lb = o.size * (P.len[0] + P.len[1] * depth) * m, n = o.spinePoints;
          const c = {
            // a few swimmers or flyers (or big ones) wander inside the frame instead of crossing it, so the scene is never empty
            wander: !!P.wander || o.count <= 4 || (o.count <= 8 && o.size >= 1.3),
            id: i, slot: (i * 7 + o.seed) % o.count, sp, plan: P, depth, Lb, n, vel: m * P.vel * (0.75 + 0.5 * r()) * (0.7 + 0.3 * depth),
            margin: Lb * (P.reach + 0.6) + cw * 2,
            bw: TAU / (P.burstT[0] + P.burstT[1] * r()), bp: r() * TAU, beatMul: 0.85 + 0.3 * r(),
            variety: (() => { const vs = o.varieties && o.varieties.length ? o.varieties : def.varieties; return vs ? vs[i % vs.length] : null; })(),
            pts: new Float32Array(n * 2), arc: new Float32Array(n), seg: new Float32Array(n),
            ux: new Float32Array(n), uy: new Float32Array(n), total: 1, lanes: [], k: 0, uHead: 0, U: 0,
            hx: 0, hy: 0, dx: 0, dy: -1, flex: 0, sweep: 0, bank: 0, phi: 0, f: 1, fold: 1, sinT: 0,
          };
          c.fog = new Map();
          const first = makeLane(c, 0, 0);
          // start somewhere on screen, staggered so they do not travel as one block
          const ext = Math.abs(first.dx) * o.width + Math.abs(first.dy) * o.height;
          c.offset = clamp(-first.t0 + (((i * 0.618 + r() * 0.3) % 1) - 0.5) * 0.9 * ext, 0, first.t1 - first.t0);
          if (c.wander) {
            const rr = mulberry32(ihash(o.seed, i, 777));
            // each fish keeps to its own part of the pond (golden-angle spread), so they cross without piling up
            let hx = 0.5 + 0.32 * Math.sqrt((i + 0.5) / o.count) * Math.cos(i * 2.39996 + o.seed), hy = 0.5 + 0.32 * Math.sqrt((i + 0.5) / o.count) * Math.sin(i * 2.39996 + o.seed);
            const side = i % 2 ? 1 : -1;
            let lane = 0.7;
            if (o.sides > 0) {
              // sides: half the fish start in each band, spread down its height
              // the same lanes on both sides, from top to bottom, so the corners fill as much as the middle
              const sw = clamp(o.sides, 0.05, 0.45), k = Math.floor(i / 2), per = Math.ceil(o.count / 2);
              hx = side < 0 ? sw * (0.3 + 0.4 * rr()) : 1 - sw * (0.3 + 0.4 * rr());
              hy = per > 1 ? 0.1 + 0.8 * (k / (per - 1)) : 0.5;
              lane = (0.8 / Math.max(1, per - 1)) * 0.5;
            }
            c.path = { hx, hy, side, lane, k: Math.floor(i / 2), x: [o.width * hx], y: [o.height * hy], th: P.wander ? rr() * TAU : ((o.heading + (rr() * 2 - 1) * o.spread) * Math.PI) / 180, step: Math.max(2, Lb / 40), len: 0, base: 0, seed: ihash(o.seed, i, 778) % 9973 };
            c.offset = Lb * 1.4;
          }
          list.push(c);
        }
        list.sort((a, b) => a.depth - b.depth);
        pads = [];
        if (def.pond) {
          // Pads gather in a few clusters toward the edges of the pond, big ones under small ones
          const n = Math.max(0, Math.round(o.koiPads)), nc = Math.max(1, Math.round(n / 2.6));
          for (let i = 0; i < n; i++) {
            const cl = i % nc, rc = mulberry32(ihash(o.seed, cl, 4241)), r = mulberry32(ihash(o.seed, i, 4242));
            const ca = rc() * TAU + cl * (TAU / nc), cr = 0.27 + 0.12 * rc();
            let cx = o.width * (0.5 + Math.cos(ca) * cr), cy = o.height * (0.5 + Math.sin(ca) * cr * (o.width / o.height > 1.2 ? 0.9 : 1));
            if (o.sides > 0) {
              // sides: clusters alternate between the two bands
              const sw = clamp(o.sides, 0.05, 0.45), u = 0.25 + 0.5 * rc();
              cx = o.width * (cl % 2 ? 1 - sw * u : sw * u);
              cy = o.height * (0.12 + 0.76 * ((Math.floor(cl / 2) + 0.2 + 0.6 * rc()) / Math.ceil(nc / 2)));
            }
            const first = i < nc, R = m * o.size * (first ? 0.075 + 0.025 * r() : 0.04 + 0.03 * r());
            const da = r() * TAU, dd = first ? 0 : m * o.size * (0.08 + 0.05 * r());
            const drops = [];
            for (let k = 0, nd = Math.floor(r() * 3); k < nd; k++) drops.push([(r() - 0.5) * 1.1, (r() - 0.5) * 1.1, r() * TAU]);
            pads.push({
              x: cx + Math.cos(da) * dd, y: cy + Math.sin(da) * dd, R, rot: r() * TAU, spin: (r() - 0.5) * 0.025, ph: r() * TAU,
              age: r() < 0.35 ? 0.4 + 0.6 * r() : r() * 0.2, curl: r() * TAU, curlAmt: r() < 0.5 ? 0.6 + 0.4 * r() : 0, drops,
              flower: first && cl % 2 === 0, bud: !first && r() < 0.45 ? r() * TAU : null, stem: r() * TAU,
            });
          }
          pads.sort((a, b) => b.R - a.R);
        }
      }
      function resetLanes() { for (const c of list) { c.lanes = []; c.k = 0; } }

      function pose(c, T) {
        const P = c.plan, bt = c.bw * T + c.bp;
        const U = Uof(c, T), L = c.wander ? null : laneAt(c, U);
        const push = 1 + 0.6 * P.burst * Math.cos(bt);
        c.U = U; c.push = push;
        if (c.wander) wanderTo(c, U);
        const n = c.n, ds = c.Lb / (n - 1), uHead = c.wander ? U : L.t0 + (U - L.start);
        c.uHead = uHead;
        const phase = (U / c.Lb) * TAU * (P.freq || 1), Pt = c.pts;
        c.flex = Math.sin(phase * 0.5 + c.id); c.sweep = Math.sin(phase - TAU * (P.kw || 0.85));
        c.tailLag = Math.sin(phase - TAU * (P.kw || 0.85) - 0.9);
        c.finSpread = clamp(1 - 0.9 * (push - 1), 0.62, 1.22);
        for (let i = 0; i < n; i++) {
          const u = uHead - i * ds;
          let tx, ty, bx, by;
          if (c.wander) { wanderAt(c, u, wv); bx = wv[0]; by = wv[1]; tx = wv[2]; ty = wv[3]; }
          else {
            const m = laneM(L, u), dm = laneDM(L, u);
            tx = L.dx + L.px * dm; ty = L.dy + L.py * dm;
            const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
            bx = L.cx + L.dx * u + L.px * m; by = L.cy + L.dy * u + L.py * m;
          }
          const k = i / (n - 1);
          const w = P.rigid ? 0 : c.Lb * (P.yaw + P.amp * k * k * push) * Math.sin(phase - k * TAU * P.kw);
          Pt[i * 2] = bx - ty * w;
          Pt[i * 2 + 1] = by + tx * w;
        }
        let acc = 0;
        for (let i = 0; i < n; i++) {
          const x = Pt[i * 2], y = Pt[i * 2 + 1];
          c.arc[i] = acc;
          if (i < n - 1) {
            const dx = Pt[i * 2 + 2] - x, dy = Pt[i * 2 + 3] - y, L2 = Math.hypot(dx, dy) || 1e-6;
            c.seg[i] = L2; c.ux[i] = dx / L2; c.uy[i] = dy / L2; acc += L2;
          }
        }
        c.total = acc || 1;
        // Rigid frame (head + axis) for flyers and rays; bank from the path curvature
        c.hx = Pt[0]; c.hy = Pt[1];
        const mi = n >> 1, ax = Pt[0] - Pt[mi * 2], ay = Pt[1] - Pt[mi * 2 + 1], al = Math.hypot(ax, ay) || 1;
        c.dx = ax / al; c.dy = ay / al;
        const cr = c.ux[0] * c.uy[n - 2] - c.uy[0] * c.ux[n - 2], dt = c.ux[0] * c.ux[n - 2] + c.uy[0] * c.uy[n - 2];
        c.bank = clamp(Math.atan2(cr, dt) * (P.bankK || 0), -1, 1);
        if (P === PLANS.manta) c.phi = TAU * P.beat * T * c.beatMul + c.id * 1.7;
        if (P === PLANS.bird) {
          const sp = c.sp, g = smooth(clamp((noise1(T * 0.22 + c.id * 7.3, o.seed + 5) - sp.glide) / 0.3 + 0.5, 0, 1));
          c.phi = TAU * sp.beat * T * c.beatMul + c.id * 1.7;
          const th = g * sp.beatAmp * Math.sin(c.phi) + sp.dihedral;
          c.f = Math.max(0.3, Math.cos(th)); c.sinT = Math.sin(th);
          // the hand trails the arm (whip-like stroke) and folds on the upstroke
          const th2 = g * sp.beatAmp * 1.25 * Math.sin(c.phi - 0.75) + sp.dihedral;
          c.f2 = Math.max(0.22, Math.cos(th2));
          c.fold = 1 - 0.38 * g * Math.max(0, Math.cos(c.phi - 0.4));
          // wings sweep forward on the downstroke, back on the upstroke; swept back a little when gliding
          c.sweep = 0.08 * g * Math.cos(c.phi) + 0.13 * (1 - g) + 0.05; // the hand always angles back at the wrist, gull-like
        }
        // bbox
        const ext = c.Lb * (P.reach + 0.15);
        let minX = Pt[0], maxX = Pt[0], minY = Pt[1], maxY = Pt[1];
        for (let i = 1; i < n; i++) { const x = Pt[i * 2], y = Pt[i * 2 + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        c.minX = minX - ext; c.maxX = maxX + ext; c.minY = minY - ext; c.maxY = maxY + ext;
      }
      // Local coordinates of a point → q, returns the body part (0 = outside)
      function sample(c, x, y) {
        if (c.plan.rigid) {
          const rx = x - c.hx, ry = y - c.hy, along = -(rx * c.dx + ry * c.dy), lat = rx * -c.dy + ry * c.dx;
          q.s = along / c.Lb; q.side = lat > 0 ? 1 : -1; q.a = Math.abs(lat) / c.Lb;
          q.nx = -c.dy * q.side; q.ny = c.dx * q.side;
        } else {
          const P = c.pts, n = c.n;
          let best = 1e18, bi = 0, bh = 0, side = 1;
          for (let i = 0; i < n - 1; i++) {
            const ax = P[i * 2], ay = P[i * 2 + 1], dx = P[i * 2 + 2] - ax, dy = P[i * 2 + 3] - ay;
            const L2 = dx * dx + dy * dy || 1;
            const h0 = ((x - ax) * dx + (y - ay) * dy) / L2, h = h0 < 0 ? 0 : h0 > 1 ? 1 : h0;
            const qx = ax + dx * h - x, qy = ay + dy * h - y, d2 = qx * qx + qy * qy;
            if (d2 < best) { best = d2; bi = i; bh = (i === 0 && h0 < 0) || (i === n - 2 && h0 > 1) ? h0 : h; side = dx * (y - ay) - dy * (x - ax) > 0 ? 1 : -1; }
          }
          // past the head or the tail tip, s runs below 0 / above 1 and a is the lateral distance only
          if (bh < 0 || bh > 1) { const ax = P[bi * 2], ay = P[bi * 2 + 1]; best = Math.pow((x - ax) * -c.uy[bi] + (y - ay) * c.ux[bi], 2); }
          q.s = (c.arc[bi] + bh * c.seg[bi]) / c.total; q.a = Math.sqrt(best) / c.Lb; q.side = side;
          q.nx = -c.uy[bi] * side; q.ny = c.ux[bi] * side;
          q.reg = c.plan.geo(c, q.s, q.a, q.side);
          if (!q.reg && c.plan.fins) {
            // Fins: rigid frame at the fin root, so both sides stay symmetric while the body bends
            const fa = c.plan.finAt, i0 = Math.round(fa * (c.n - 1)), Ox = P[i0 * 2], Oy = P[i0 * 2 + 1], ux = c.ux[i0], uy = c.uy[i0];
            const s2 = fa + ((x - Ox) * ux + (y - Oy) * uy) / c.Lb, lat = (x - Ox) * -uy + (y - Oy) * ux, sd = lat > 0 ? 1 : -1;
            const r2 = c.plan.fins(c, s2, Math.abs(lat) / c.Lb, sd);
            if (r2) { q.s = s2; q.a = Math.abs(lat) / c.Lb; q.side = sd; q.nx = -uy * sd; q.ny = ux * sd; q.reg = r2; }
          }
          return q.reg;
        }
        q.reg = c.plan.geo(c, q.s, q.a, q.side);
        return q.reg;
      }
      function worldOf(c, s, lat, outXY) {
        // rigid creatures only: local (s, lateral) → world
        outXY[0] = c.hx - c.dx * s * c.Lb - c.dy * lat * c.Lb;
        outXY[1] = c.hy - c.dy * s * c.Lb + c.dx * lat * c.Lb;
      }

      // Shape-aware outlines: pick the glyph whose ink best matches the 2×3 coverage of the cell
      let ctKey = '', ctCodes = null, ctVecs = null;
      function contourTable() {
        glyphMask(46);
        const chars = o.contourChars || CONTOUR, key = atlasKey + '|' + chars;
        if (key === ctKey) return;
        ctKey = key; ctCodes = cps(chars);
        const gw = atlas.gw, gh = atlas.gh, mx = new Float32Array(6);
        ctVecs = ctCodes.map((code) => {
          const m = glyphMask(code), v = new Float32Array(6), n = new Float32Array(6);
          for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
            const i = Math.min(2, Math.floor((y / ch) * 3)) * 2 + Math.min(1, Math.floor((x / cw) * 2));
            v[i] += m[y * gw + x] / 255; n[i]++;
          }
          for (let i = 0; i < 6; i++) { v[i] /= n[i] || 1; if (v[i] > mx[i]) mx[i] = v[i]; }
          return v;
        });
        for (const v of ctVecs) for (let i = 0; i < 6; i++) v[i] /= mx[i] || 1;
      }
      function bestGlyph() {
        let best = 1e9, bi = 0;
        for (let g = 0; g < ctVecs.length; g++) {
          const G = ctVecs[g];
          let d = 0;
          for (let i = 0; i < 6; i++) { const e = vec[i] - G[i]; d += e * e; }
          if (d < best) { best = d; bi = g; }
        }
        return ctCodes[bi];
      }
      const DIR = ['-', '\\', '|', '/'], DIRC = DIR.map((d) => d.codePointAt(0));
      const tmpXY = [0, 0];
      function emit(c, s, lat, tint, val, chr) {
        worldOf(c, s, lat, tmpXY);
        const col = Math.floor(tmpXY[0] / cw), row = Math.floor(tmpXY[1] / ch);
        if (col < 0 || row < 0 || col >= cols || row >= rows) return;
        const idx = row * cols + col;
        if (kind[idx] >= BODY) return;
        const ang = Math.atan2(c.dy / ch, c.dx / cw);
        const dch = DIR[((Math.round(ang / (Math.PI / 4)) % 4) + 4) % 4];
        putChar(idx, EDGE, val, 0.55 + 0.45 * c.depth, tint, chr || dch);
      }

      // Generic cell rasterizer for a shape given by inside(x, y); shade(x, y) fills out
      function raster(x0, y0, x1, y1, inside, shade, v, ox, oy, under) {
        const c0 = Math.max(0, Math.floor(x0 / cw)), c1 = Math.min(cols - 1, Math.floor(x1 / cw));
        const r0 = Math.max(0, Math.floor(y0 / ch)), r1 = Math.min(rows - 1, Math.floor(y1 / ch));
        const useContour = o.contour !== false;
        for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) {
          const xc = col * cw + cw / 2, yc = r * ch + ch / 2, inC = inside(xc, yc);
          let cnt = inC ? 1 : 0;
          for (let k = 0; k < 4; k++) if (inside(xc + ox[k], yc + oy[k])) cnt++;
          if (!cnt) continue;
          const idx = r * cols + col;
          let cov = 1, sx0 = xc, sy0 = yc, glyph = 0;
          if (cnt < 5) {
            vec.fill(0);
            let tot = 0, found = inC;
            for (let sy = 0; sy < 6; sy++) for (let sx = 0; sx < 4; sx++) {
              const x = col * cw + (sx + 0.5) * cw / 4, y = r * ch + (sy + 0.5) * ch / 6;
              if (inside(x, y)) { vec[(sy >> 1) * 2 + (sx >> 1)] += 0.25; tot++; if (!found) { sx0 = x; sy0 = y; found = true; } }
            }
            cov = tot / 24;
            if (cov < 0.05) continue;
            if (useContour && cov < 0.5) glyph = bestGlyph();
          }
          out.ch = 0;
          shade(sx0, sy0);
          if (cov >= 0.5) { put(idx, out.kd, clamp(out.val, 0, 1), v, out.tint); if (out.ch) chrO[idx] = out.ch; }
          else if (under || kind[idx] < BODY) {
            if (glyph) putChar(idx, EDGE, clamp(0.35 + cov * 0.9, 0, 1), v, out.tint, String.fromCodePoint(glyph));
            else put(idx, EDGE, cov, v, out.tint);
          }
        }
      }
      // Koi pond: rings on the surface, lily pads floating over the fish
      function ring(x, y, R, a) {
        const N = Math.max(8, Math.ceil((TAU * R) / (Math.min(cw, ch) * 0.7)));
        for (let i = 0; i < N; i++) {
          const th = (i / N) * TAU, col = Math.floor((x + Math.cos(th) * R) / cw), r = Math.floor((y + Math.sin(th) * R) / ch);
          if (col < 0 || r < 0 || col >= cols || r >= rows) continue;
          const idx = r * cols + col;
          if (kind[idx] >= BODY) continue;
          const ang = Math.atan2(Math.cos(th) / ch, -Math.sin(th) / cw);
          putChar(idx, EDGE, 0.1 + 0.5 * a, 0.45 + 0.4 * a, [0.78, 0.98, 0.92], DIR[((Math.round(ang / (Math.PI / 4)) % 4) + 4) % 4]);
        }
      }
      function pond(T, ox, oy) {
        const rip = o.koiRipples == null ? 1 : o.koiRipples;
        if (rip > 0) {
          const LIFE = 3.2;
          // a fish near the surface comes up for a kiss now and then
          for (const c of list) {
            if (c.depth < 0.45) continue;
            const per = 6.5 + (c.id % 3) * 2.3, sh = c.id * 2.9, slot = Math.floor((T + sh) / per), tb = slot * per - sh, age = T - tb;
            if (age < 0 || age > LIFE || rnd3(slot, c.id, o.seed + 5) > 0.6 * rip) continue;
            wanderAt(c, Uof(c, tb), wv);
            const a = 1 - age / LIFE, R = c.Lb * (0.05 + 0.17 * age);
            ring(wv[0], wv[1], R, a);
            if (R > c.Lb * 0.2) ring(wv[0], wv[1], R - c.Lb * 0.13, a * 0.6);
          }
          // rings left by the pointer
          for (const k of pokes) {
            const age = curT - k.t, LIFE2 = 2.6, m = Math.min(o.width, o.height), a = Math.min(1.4, (1 - age / LIFE2) * (0.8 + 0.6 * k.s));
            const R = m * (0.008 + (0.035 + 0.025 * k.s) * age);
            ring(k.x, k.y, R, a);
            if (age > 0.25) ring(k.x, k.y, R * 0.66, a * 0.55);
          }
          // and a few drops or insects elsewhere
          const nd = Math.round(2 * rip);
          for (let i = 0; i < nd; i++) {
            const per = 5 + i * 1.7, slot = Math.floor((T + i * 1.3) / per), age = T + i * 1.3 - slot * per;
            if (age > 3 || rnd3(slot, i, o.seed + 6) > 0.7) continue;
            const x = o.width * (0.1 + 0.8 * rnd3(slot, i, o.seed + 7)), y = o.height * (0.1 + 0.8 * rnd3(slot, i, o.seed + 8));
            const m = Math.min(o.width, o.height);
            ring(x, y, m * (0.008 + 0.03 * age), (1 - age / 3) * 0.7);
          }
        }
        // Lily pads (on top of everything)
        for (const pd of pads) {
          // drift, slow turn, and a nudge when a fish passes underneath
          let R = pd.R, px = pd.x + Math.sin(T * 0.05 + pd.ph) * R * 0.3, py = pd.y + Math.cos(T * 0.04 + pd.ph) * R * 0.2, rot = pd.rot + T * pd.spin, stir = 0;
          for (const c of list) {
            const dx = px - c.pts[0], dy = py - c.pts[1], d = Math.hypot(dx, dy) || 1, reach2 = R + c.Lb * 0.45;
            if (d < reach2) { const f = Math.pow(1 - d / reach2, 2) * (0.5 + 0.5 * c.depth); px += (dx / d) * f * R * 0.14; py += (dy / d) * f * R * 0.14; rot += f * 0.12; stir = Math.max(stir, f); }
          }
          if (stir > 0.15) ring(px, py, R * (1.1 + 0.05 * Math.sin(T * 3 + pd.ph)), Math.min(1, stir) * 0.8);
          let lr = 0, la = 0, ldx = 0, ldy = 0;
          const inside = (x, y) => {
            const dx = x - px, dy = y - py, r = Math.hypot(dx, dy);
            if (r > R * 1.05) return false;
            let ang = Math.atan2(dy, dx) - rot;
            ang = ((ang % TAU) + TAU * 1.5) % TAU - Math.PI;
            if (Math.abs(ang) < 0.22 * Math.min(1, r / (R * 0.25)) && r > R * 0.05) return false;   // the notch
            lr = r / R; la = ang; ldx = dx / R; ldy = dy / R;
            return r < R * (1 + 0.03 * Math.sin(ang * 5 + pd.ph) + 0.015 * Math.sin(ang * 13));
          };
          const leafTint = (k) => [LEAF[0] + (OLDLEAF[0] - LEAF[0]) * k, LEAF[1] + (OLDLEAF[1] - LEAF[1]) * k, LEAF[2] + (OLDLEAF[2] - LEAF[2]) * k];
          const tintNew = leafTint(pd.age * 0.35), tintRim = leafTint(Math.min(1, pd.age * 1.2));
          const fRot = rot * 0.5 + pd.ph;
          const shade = (x, y) => {
            inside(x, y);
            out.kd = BODY; out.tint = lr > 0.7 && pd.age > 0.3 ? tintRim : tintNew;
            let val = 0.28 + 0.1 * (1 - lr) - (ldx * LX + ldy * LY) * 0.12;
            // radial veins from the centre, drawn as strokes pointing out
            out.ch = 0;
            const vein = lr > 0.16 && lr < 0.84 && Math.abs(Math.sin(la * 4.5)) < 0.2;
            if (vein) { val += 0.08 * (1 - lr); const g = Math.atan2(ldy / ch, ldx / cw); out.ch = DIRC[((Math.round(g / (Math.PI / 4)) % 4) + 4) % 4]; }
            else { const RCp = cps(o.ramp || '@8%SX#t;:'), n = RCp.length; out.ch = RCp[clamp(Math.floor((1 - clamp(val * 1.3, 0, 1)) * (n - 0.01)), 0, n - 1)]; }
            // waxy sheen that slides as the leaf turns
            const hx = ldx + 0.32 + 0.08 * Math.sin(T * 0.3 + pd.ph), hy = ldy + 0.4;
            val += 0.2 * Math.exp(-(hx * hx + hy * hy) / 0.05);
            // curled rim: the lit lip, and the red underside showing
            if (pd.curlAmt && lr > 0.8) {
              let dc = la + rot - pd.curl; dc = ((dc % TAU) + TAU * 1.5) % TAU - Math.PI;
              const k = Math.max(0, 1 - Math.abs(dc) / 0.9) * pd.curlAmt;
              if (k > 0.25) { if (lr > 0.92) { out.tint = UNDERSIDE; val = 0.34 + 0.1 * k; } else val += 0.16 * k; }
            } else if (lr > 0.9) val *= 0.75;
            // water drops catching the light
            for (const d of pd.drops) {
              const ddx = ldx - d[0] * Math.cos(rot) + d[1] * Math.sin(rot), ddy = ldy - d[0] * Math.sin(rot) - d[1] * Math.cos(rot);
              if (Math.hypot(ddx * R, ddy * R) < Math.max(R * 0.07, cw * 0.55) && Math.sin(T * 1.3 + d[2]) > -0.3) { out.kd = HIGH; out.tint = DROP; val = 1; out.ch = 0; }
            }
            if (pd.flower) {
              // lotus: outer pink petals, paler inner petals, yellow seed pod
              const fx = ldx + 0.15, fy = ldy - 0.12, fr = Math.hypot(fx, fy), fa = Math.atan2(fy, fx);
              const outer = Math.pow(Math.max(0, Math.cos((fa - fRot) * 4)), 0.6), inner = Math.pow(Math.max(0, Math.cos((fa - fRot) * 3 + 0.5)), 0.6);
              if (fr < 0.11) { out.kd = HIGH; out.tint = POLLEN; val = 1; out.ch = 0; }
              else if (fr < 0.22 + 0.12 * inner) { out.tint = LOTUS_IN; val = 0.82 + 0.12 * inner - fr * 0.5; out.ch = 0; }
              else if (fr < 0.32 + 0.2 * outer) { out.tint = LOTUS; val = 0.5 + 0.25 * outer + 0.3 * (0.5 - fr); out.ch = 0; }
            }
            out.val = val;
          };
          raster(px - R * 1.1, py - R * 1.1, px + R * 1.1, py + R * 1.1, inside, shade, 1, ox, oy, true);
          // a closed bud floating at the edge
          if (pd.bud != null) {
            const ba = pd.bud + rot * 0.3, br = Math.max(R * 0.3, cw * 1.3), bx = px + Math.cos(ba) * (R + br * 0.9), by = py + Math.sin(ba) * (R + br * 0.9);
            raster(bx - br, by - br * 1.6, bx + br, by + br * 1.6, (x, y) => { const dx = (x - bx) / br, dy = (y - by) / br; return dx * dx + dy * dy * 0.45 < 1 - Math.max(0, -dy) * 0.25; },
              (x, y) => { out.kd = BODY; out.ch = 0; out.tint = LOTUS; out.val = 0.55 + 0.25 * ((by - y) / br); }, 1, ox, oy, true);
          }
          // pad shadow on the floor
          if (o.glow) {
            const gx = R * 0.45, gy = R * 0.6;
            const c0 = Math.max(0, Math.floor((px - R + gx) / cw)), c1 = Math.min(cols - 1, Math.floor((px + R + gx) / cw));
            const r0 = Math.max(0, Math.floor((py - R + gy) / ch)), r1 = Math.min(rows - 1, Math.floor((py + R + gy) / ch));
            for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) {
              const idx = r * cols + col;
              if (!kind[idx] && inside(col * cw + cw / 2 - gx, r * ch + ch / 2 - gy)) putGlow(idx, 0.45, def.glowTint);
            }
          }
        }
      }
      // Stems going down into the water, under the fish
      function stems(T) {
        for (const pd of pads) {
          const R = pd.R, x0 = pd.x + Math.sin(T * 0.05 + pd.ph) * R * 0.3, y0 = pd.y + Math.cos(T * 0.04 + pd.ph) * R * 0.2;
          const len = R * 2.2, N = Math.ceil(len / (Math.min(cw, ch) * 0.6));
          for (let i = 0; i < N; i++) {
            const k = i / N, a = pd.stem + 0.5 * Math.sin(k * 3 + T * 0.2 + pd.ph), x = x0 + Math.cos(a) * len * k, y = y0 + Math.sin(a) * len * k * 0.8;
            const col = Math.floor(x / cw), r = Math.floor(y / ch);
            if (col < 0 || r < 0 || col >= cols || r >= rows) continue;
            const idx = r * cols + col;
            if (kind[idx]) continue;
            const ang = Math.atan2(Math.sin(a) * 0.8 / ch, Math.cos(a) / cw);
            putChar(idx, EDGE, 0.2, 0.5 - 0.3 * k, POND, DIR[((Math.round(ang / (Math.PI / 4)) % 4) + 4) % 4]);
          }
        }
      }

      function frame(t) {
        const T = t * o.speed, amb = o.ambient == null ? 1 : o.ambient;
        const dt = lastT == null ? 0 : clamp(T - lastT, 0, 0.1);
        lastT = T; curT = T;
        if (o.pointer && o.pointer.length >= 2) {
          const px = o.pointer[0] * o.width, py = o.pointer[1] * o.height, moved = ptr ? Math.hypot(px - ptr.x, py - ptr.y) : 0;
          if (!ptr || moved > 2) {
            const last = pokes[pokes.length - 1];
            if (def.pond && ptr && moved > 6 && (!last || T - last.t > 0.22)) pokes.push({ x: px, y: py, t: T, s: 0.45 });
            ptr = { x: px, y: py, t: T };
          }
        } else ptr = null;
        if ((o.splash || 0) !== lastSplash) {
          lastSplash = o.splash || 0;
          if (ptr && def.pond) { pokes.push({ x: ptr.x, y: ptr.y, t: T, s: 1 }); ptr.t = T; }
        }
        pokes = pokes.filter((k) => T - k.t < 2.6);
        // a startled fish darts: it covers more ground for a moment
        for (const c of list) {
          if (!c.plan.wander || !c.pts) continue;
          let f = 0;
          if (ptr && T - ptr.t < 1.6) { const d = Math.hypot(c.pts[0] - ptr.x, c.pts[1] - ptr.y); f = Math.max(0, 1 - d / (c.Lb * 2.2)); }
          c.fear = (c.fear || 0) * 0.92 + f * 0.08;
          // the pointer on the fish itself (moving or still): it bolts, fast, off in a new direction
          if (ptr && (c.bolt == null || T - c.bolt > BOLT_RUN)) {
            const P = c.pts, R = c.Lb * 0.24;
            for (let j = 0; j < c.n; j++) {
              if (Math.hypot(P[2 * j] - ptr.x, P[2 * j + 1] - ptr.y) < R) {
                c.bolt = T; c.boltX = ptr.x; c.boltY = ptr.y;
                if (def.pond) pokes.push({ x: P[2 * (c.n - 1)], y: P[2 * (c.n - 1) + 1], t: T, s: 0.35 }); // a flick of the tail
                break;
              }
            }
          }
          const burst = c.bolt == null || T - c.bolt > BOLT_RUN ? 0 : 3.4 * boltCurve(T - c.bolt, BOLT_RUN);
          c.offset += c.vel * dt * (2.2 * c.fear + burst);
        }
        for (const c of list) pose(c, T);
        const useContour = o.contour !== false;
        if (useContour) contourTable();
        const ox = [-0.3 * cw, 0.3 * cw, -0.3 * cw, 0.3 * cw], oy = [-0.3 * ch, -0.3 * ch, 0.3 * ch, 0.3 * ch];
        const reach = Math.max(cw, ch);
        if (def.pond) stems(T);
        for (const c of list) {
          const P = c.plan, v = 0.55 + 0.45 * c.depth;
          const c0 = Math.max(0, Math.floor((c.minX - reach) / cw)), c1 = Math.min(cols - 1, Math.floor((c.maxX + reach) / cw));
          const r0 = Math.max(0, Math.floor((c.minY - reach) / ch)), r1 = Math.min(rows - 1, Math.floor((c.maxY + reach) / ch));
          for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) {
            const xc = col * cw + cw / 2, yc = r * ch + ch / 2;
            const inC = sample(c, xc, yc) ? 1 : 0;
            const cs = q.s, ca = q.a, cside = q.side, cnx = q.nx, cny = q.ny, creg = q.reg;
            let cnt = inC;
            for (let k = 0; k < 4; k++) if (sample(c, xc + ox[k], yc + oy[k])) cnt++;
            if (!cnt) continue;
            const idx = r * cols + col;
            let cov = cnt / 5, glyph = 0, hs = 0, ha = 0, hside = 1, hnx = 0, hny = 0, hreg = 0;
            if (cnt < 5) {
              vec.fill(0);
              let tot = 0;
              for (let sy = 0; sy < 6; sy++) for (let sx = 0; sx < 4; sx++) {
                if (sample(c, col * cw + (sx + 0.5) * cw / 4, r * ch + (sy + 0.5) * ch / 6)) {
                  vec[(sy >> 1) * 2 + (sx >> 1)] += 0.25; tot++;
                  if (!hreg) { hs = q.s; ha = q.a; hside = q.side; hnx = q.nx; hny = q.ny; hreg = q.reg; }
                }
              }
              cov = tot / 24;
              if (cov < 0.05) continue;
              if (useContour && cov < 0.5) glyph = bestGlyph();
            }
            if (inC) { q.s = cs; q.a = ca; q.side = cside; q.nx = cnx; q.ny = cny; q.reg = creg; }
            else if (hreg) { q.s = hs; q.a = ha; q.side = hside; q.nx = hnx; q.ny = hny; q.reg = hreg; }
            else continue;
            out.ch = 0;
            P.shade(c, q, out);
            let val = out.val;
            if (def.water && amb > 0) val += amb * 0.24 * caustic(xc, yc, T) * (0.4 + 0.6 * c.depth);
            if (cnt === 5 || cov >= 0.5) { put(idx, out.kd, clamp(val, 0, 1), v, out.tint); if (out.ch && out.kd !== MARK) chrO[idx] = out.ch; }
            else {
              if (kind[idx] >= BODY) continue;
              if (glyph) putChar(idx, EDGE, clamp(0.35 + cov * 0.9, 0, 1), v, out.tint, String.fromCodePoint(glyph));
              else put(idx, EDGE, cov, v, out.tint);
            }
          }
          if (P.strokes) P.strokes(c, emit);
        }
        if (def.pond) pond(T, ox, oy, reach);
        // Shadows on the floor (glow dots)
        if (o.glow) for (const c of list) {
          const mul = c.plan.shadowMul || 1, gx = cw * (1.2 + 2.2 * c.depth) * mul, gy = ch * (0.8 + 1.4 * c.depth) * mul;
          const c0 = Math.max(0, Math.floor((c.minX + gx) / cw)), c1 = Math.min(cols - 1, Math.floor((c.maxX + gx) / cw));
          const r0 = Math.max(0, Math.floor((c.minY + gy) / ch)), r1 = Math.min(rows - 1, Math.floor((c.maxY + gy) / ch));
          for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) {
            const idx = r * cols + col;
            if (kind[idx] || !sample(c, col * cw + cw / 2 - gx, r * ch + ch / 2 - gy)) continue;
            putGlow(idx, (0.65 + 0.35 * (1 - Math.min(1, q.a * 2))) * (0.45 + 0.5 * c.depth), def.glowTint);
          }
        }
        // Wakes
        if (o.trails && def.trails !== false) {
          const gap = ch * 1.25, K = 26;
          for (const c of list) if (c.path) {
            // soft wake along the wandering path
            const u0 = c.U - c.Lb, j0 = Math.floor(u0 / gap), W = c.Lb * c.sp.width;
            for (let j = 0; j < K; j++) {
              const wi = j0 - j, u = wi * gap, age = (u0 - u) / (K * gap);
              if (age < 0 || u < 0) continue;
              const h = ihash(wi + 70000, c.id * 131, o.seed);
              if (h / 4294967296 < 0.45) continue;
              wanderAt(c, u, wv);
              const lat = (((h >>> 8) % 1000) / 1000 - 0.5) * W * (1.4 + age * 5);
              const col = Math.floor((wv[0] - wv[3] * lat) / cw), r = Math.floor((wv[1] + wv[2] * lat) / ch);
              if (col < 0 || r < 0 || col >= cols || r >= rows) continue;
              putDash(r * cols + col, 0.6 * Math.pow(1 - age, 1.6) * (0.4 + 0.6 * c.depth));
            }
          }
          for (const c of list) for (let back = 0; back < 2; back++) {
            if (c.path) break;
            const L = c.lanes[c.k - back];
            if (!L) continue;
            const W = c.Lb * (c.plan.rigid ? 0.5 : c.sp.width || 0.12);
            const uTail = L.t0 + (c.U - L.start) - c.Lb, j0 = Math.floor(uTail / gap);
            for (let j = 0; j < K; j++) {
              const wi = j0 - j, u = wi * gap, age = (uTail - u) / (K * gap);
              if (age < 0 || u < L.t0) continue;
              for (let k = 0; k < 2; k++) {
                const h = ihash(wi + 50000, c.id * 131 + k, L.k * 7 + o.seed);
                if (h / 4294967296 < (k ? 0.65 : 0.3)) continue;
                const m = laneM(L, u), lat = (((h >>> 8) % 1000) / 1000 - 0.5) * W * (1.6 + age * 5);
                const x = L.cx + L.dx * u + L.px * (m + lat), y = L.cy + L.dy * u + L.py * (m + lat);
                const col = Math.floor(x / cw), r = Math.floor(y / ch);
                if (col < 0 || r < 0 || col >= cols || r >= rows) continue;
                putDash(r * cols + col, 0.85 * Math.pow(1 - age, 1.4) * (0.5 + 0.5 * c.depth));
              }
            }
          }
        }
        // Drifting particles (marine snow) for water scenes
        if (def.water && amb > 0) {
          const N = Math.round(cols * rows * 0.012 * amb);
          for (let i = 0; i < N; i++) {
            const d = rnd3(i, o.seed, 61), sp = 0.15 + 0.6 * d;
            const x = (((rnd3(i, o.seed, 62) * 1.3 + T * 0.004 * sp) % 1.3) - 0.15) * o.width;
            const y = (((rnd3(i, o.seed, 63) * 1.3 - T * 0.009 * sp + 13) % 1.3) - 0.15) * o.height;
            const col = Math.floor(x / cw), r = Math.floor(y / ch);
            if (col < 0 || r < 0 || col >= cols || r >= rows) continue;
            const idx = r * cols + col;
            if (kind[idx] || glow[idx] > 0) continue;
            if (Math.sin(T * 0.7 + i * 1.9) < -0.5) continue;
            putChar(idx, EDGE, 0.15 + 0.35 * d, 0.5 + 0.5 * d, def.glowTint, d > 0.75 ? '*' : '.');
          }
        }
      }
      return { build, frame, resetLanes, bg: def.bg || null, grid: def.grid || null };
    }

    /* ---------------- Ocean (night sea in perspective, moon and its glitter path) ---------------- */
    // Rows below the horizon sample a sum of directional swells in world space (far rows cover more sea,
    // so they shimmer finer); light comes from the slope facing the moon, crests break into foam.
    function Waves() {
      let comps = [], moon, sumA = 1;
      const DEEP = [0.3, 0.5, 0.78], SEA = [0.42, 0.66, 0.92], FOAM = [0.92, 0.98, 1.06], MOON = [1.06, 1.0, 0.84], GLINT = [1.1, 1.0, 0.8], STAR = [0.8, 0.86, 1.05];
      const WAVE_CH = [126, 126, 45, 61]; // ~ ~ - =
      function build() {
        const r = mulberry32(ihash(o.seed, 21, 5));
        comps = []; sumA = 0;
        for (let i = 0; i < 7; i++) {
          const L = (2.6 + 5 * r()) / (1 + i * 0.6);                 // wavelength, world units
          const ang = (r() - 0.5) * (0.9 + i * 0.25);               // spread around the main swell
          const k = TAU / L, A = 0.03 * L * (0.6 + 0.6 * r());
          comps.push({ kx: Math.sin(ang) * k, kz: Math.cos(ang) * k, w: Math.sqrt(9.8 * k) * 0.55, p: r() * TAU, A });
          sumA += A;
        }
        // short chop on top of the swell
        for (let i = 0; i < 5; i++) {
          const L = 0.7 + 0.9 * r(), ang = (r() - 0.5) * 2.2, k = TAU / L, A = 0.045 * L;
          comps.push({ kx: Math.sin(ang) * k, kz: Math.cos(ang) * k, w: Math.sqrt(9.8 * k) * 0.55, p: r() * TAU, A });
          sumA += A;
        }
        moon = { x: 0.28 + 0.44 * r(), y: 0.16 + 0.1 * r(), r: 0.055 };
      }
      function frame(t) {
        const dir = Math.cos((o.heading * Math.PI) / 180) >= -1e-6 ? 1 : -1;
        const W = o.width, H = o.height, hz = H * 0.42, amp = o.size, Wv = Math.max(W, H * 16 / 9); // portrait: same sea, cropped, not squeezed
        const mx = moon.x * W, my = moon.y * H, mr = moon.r * Math.min(W, H) * 1.6;
        for (let r = 0; r < rows; r++) {
          const yc = r * ch + ch / 2;
          if (yc < hz) {
            // sky: moon disc, halo, a few stars
            for (let c = 0; c < cols; c++) {
              const idx = r * cols + c, xc = c * cw + cw / 2;
              const d = Math.hypot((xc - mx) / mr, (yc - my) / mr);
              if (d < 1) {
                const mare = noise2(c * 0.35 + 3, r * 0.35, o.seed + 3);
                put(idx, d > 0.9 ? EDGE : BODY, clamp(0.98 - d * 0.3 - mare * 0.22, 0, 1), 1, MOON);
              } else if (o.glow) {
                if (d < 3.2) putGlow(idx, 0.55 * Math.pow(1 - (d - 1) / 2.2, 2), MOON);
                else if (rnd3(c, r, 41) < 0.012 * (1 - yc / hz)) putGlow(idx, 0.25 + 0.45 * rnd3(c, r, Math.floor(t * 0.7 + rnd3(c, r, 2) * 9)), STAR);
              }
            }
            continue;
          }
          const p = (yc - hz) / (H - hz);                       // 0 at the horizon, 1 at the bottom edge
          const z = 1.2 / (p + 0.035);                           // distance into the sea
          const fade = clamp(p * 5, 0, 1);                       // far rows melt into the horizon
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c, xc = c * cw + cw / 2;
            const wx = ((xc - W / 2) / Wv) * z * 7, wz = z * 2.2;
            let h = 0, sz = 0, sx = 0;
            for (const q of comps) {
              const ph = q.kx * wx + q.kz * wz + dir * q.w * t * (q.kx >= 0 ? 1 : 1) + q.p;
              const sn = Math.sin(ph), cs = Math.cos(ph);
              h += q.A * sn; sx += q.A * q.kx * cs; sz += q.A * q.kz * cs;
            }
            h *= amp; sx *= amp; sz *= amp;
            const hn = h / (sumA * amp + 1e-6);                  // -1..1
            // faces tilted towards the viewer and the moon catch light
            let lit = clamp(0.5 + sz * 1.6 + hn * 0.35, 0, 1);
            // moon glitter: a column under the moon, wider near the viewer, made of sparkles on tilted faces
            const gw = Wv * (0.025 + 0.11 * p), gd = (xc - mx) / gw;
            const glit = Math.exp(-gd * gd) * clamp(0.35 + sz * 2.4 + hn * 0.4, 0, 1) * (0.55 + 0.45 * rnd3(c, r, Math.floor(t * 7 + rnd3(c, r, 5) * 4)));
            const foam = hn > 0.84 - 0.08 * amp && lit > 0.75 && p > 0.12;
            if (foam && o.trails) { put(idx, HIGH, 1, 0.75 + 0.25 * fade, FOAM); continue; }
            if (glit > 0.42) { put(idx, glit > 0.75 ? HIGH : BODY, clamp(0.55 + glit * 0.45, 0, 1), 1, GLINT); continue; }
            if (lit < 0.5) {
              if (lit > 0.38 && rnd3(c, r, 7) < 0.35) putChar(idx, EDGE, 0.2, 0.5 * fade + 0.2, DEEP, '-');
              continue;
            }
            if (lit < 0.72) { putChar(idx, EDGE, lit, 0.5 + 0.5 * fade, SEA, String.fromCharCode(WAVE_CH[ihash(c, r, 3) % 4])); continue; }
            put(idx, BODY, clamp((lit - 0.45) * (0.6 + 0.4 * fade), 0, 1), 0.9, SEA);
          }
        }
        // a thin haze line along the horizon
        if (o.glow) { const r = Math.floor(hz / ch); for (let c = 0; c < cols; c++) putGlow(r * cols + c, 0.25 + 0.2 * noise1(c * 0.3 + t * 0.2, o.seed), MOON); }
      }
      return { build, frame, bg: ['#03050c', '#0a1630', '#02040a'], grid: '#0b1220' };
    }

    /* ---------------- Landscape (layered ridges) ---------------- */
    function Landscape() {
      let layers = [], ridge, sun;
      const N = 4;
      function build() {
        const r = mulberry32(ihash(o.seed, 31, 9));
        layers = [];
        for (let j = 0; j < N; j++) {
          const k = j / (N - 1);
          layers.push({
            base: o.height * (0.42 + 0.12 * j), amp: o.height * (0.26 - 0.06 * j) * o.size,
            scale: o.width * (0.16 + 0.1 * j), v: o.width * 0.006 * Math.pow(j + 1, 1.6),
            seed: (r() * 1e6) | 0, dimv: 0.55 + 0.15 * j,
            tint: [0.74 + 0.34 * k, 0.82 + 0.13 * k, 1.04 - 0.28 * k],
          });
        }
        sun = { x: o.width * (0.25 + 0.5 * r()), y: o.height * (0.16 + 0.1 * r()), R: Math.min(o.width, o.height) * 0.085 * o.size };
        ridge = new Float32Array(N * cols * 3);
      }
      const SUN = [1.12, 1.0, 0.82], STAR = [0.85, 0.9, 1.0];
      function relief(L, x, t) { return Math.min(1.25, Math.pow(fbm1((x + t * L.v) / L.scale, L.seed), 1.8) * 1.8); }
      function ridgeY(L, x, t) { return L.base - L.amp * relief(L, x, t); }
      function layerAt(c, xi, y) { // nearest layer containing (column sample xi, y), -1 = sky
        for (let j = N - 1; j >= 0; j--) if (y > ridge[(j * cols + c) * 3 + xi]) return j;
        return -1;
      }
      function frame(t) {
        for (let j = 0; j < N; j++) for (let c = 0; c < cols; c++) {
          const b = (j * cols + c) * 3, x = c * cw;
          ridge[b] = ridgeY(layers[j], x + cw * 0.2, t); ridge[b + 1] = ridgeY(layers[j], x + cw * 0.5, t); ridge[b + 2] = ridgeY(layers[j], x + cw * 0.8, t);
        }
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
          const idx = r * cols + c, xc = c * cw + cw / 2, yc = r * ch + ch / 2, yt = yc - 0.3 * ch, yb = yc + 0.3 * ch;
          const Lc = layerAt(c, 1, yc);
          const subs = [layerAt(c, 0, yt), layerAt(c, 0, yb), layerAt(c, 2, yt), layerAt(c, 2, yb)];
          if (Lc < 0) {
            const hit = subs.filter((j) => j >= 0);
            if (hit.length) { const j = Math.max(...hit); put(idx, EDGE, hit.length / 5, layers[j].dimv, layers[j].tint); continue; }
            // Sky: sun, stars, mist
            const dS = Math.hypot(xc - sun.x, (yc - sun.y));
            if (dS < sun.R + cw * 0.6) {
              if (dS < sun.R - cw * 0.3) put(idx, dS < sun.R * 0.55 ? HIGH : BODY, 1 - (dS / sun.R) * 0.35, 1, SUN);
              else put(idx, EDGE, 0.7, 1, SUN);
              continue;
            }
            if (o.glow && rnd3(c, r, o.seed) < 0.035) putGlow(idx, 0.25 + 0.5 * rnd3(c, r, Math.floor(t * 1.3 + rnd3(r, c, 2) * 9)), STAR);
            if (o.trails) {
              const n = fbm1((xc + t * o.width * 0.025) / (o.width * 0.22), r * 7 + o.seed);
              if (n > 0.66) putDash(idx, (n - 0.66) * 2.2);
            }
            continue;
          }
          const cnt = 1 + subs.filter((j) => j >= Lc).length;
          const L = layers[Lc];
          if (cnt < 3) { put(idx, EDGE, cnt / 5, L.dimv, L.tint); continue; }
          const b = (Lc * cols + c) * 3, d = yc - ridge[b + 1];
          const sl = (ridge[b + 2] - ridge[b]) / (cw * 0.6);
          const h = (L.base - ridge[b + 1]) / (L.amp || 1); // 0..1 height of the ridge here
          const fade = L.amp * 0.55 + ch * 3;
          if (d > fade) {
            if (o.glow) {
              const I = clamp(1 - (d - fade) / (fade * 1.2), 0, 1) * (0.3 + 0.7 * rnd3(c, r, Math.floor(t * 0.8 + rnd3(c, r, 1) * 5)));
              if (I > 0.08) putGlow(idx, I * 0.7, L.tint);
            }
            continue;
          }
          const pd = (d - 0.5 * fade) / (0.5 * fade);
          if (pd > 0 && rnd3(c, r, 9 + Lc) < pd) { put(idx, EDGE, 0.3 + 0.4 * (1 - pd), L.dimv, L.tint); continue; }
          let val = 0.78 - clamp(d / fade, 0, 1) * 0.5 + clamp(sl, -1.5, 1.5) * 0.16;
          if (Lc <= 1 && h > 0.62 && d < ch * (1 + h * 1.5)) { put(idx, HIGH, 1, L.dimv + 0.2, [0.95, 0.98, 1.04]); continue; }
          put(idx, BODY, clamp(val, 0, 1), L.dimv, L.tint);
        }
      }
      return { build, frame };
    }

    /* ---------------- Image / video / text ---------------- */
    function Bitmap(isText) {
      let off = null, octx = null, sw = 0, sh = 0, textCanvas = null, lastSrc = null;
      const NEUTRAL = [0.9, 0.93, 1.0];
      function makeText() {
        textCanvas = textCanvas || document.createElement('canvas');
        const W = 1600, H = Math.round(1600 * o.height / o.width);
        textCanvas.width = W; textCanvas.height = H;
        const g = textCanvas.getContext('2d');
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        const lines = String(isText ? o.text : 'Drop an image').split('\n');
        g.font = o.textFont; g.textAlign = 'center'; g.textBaseline = 'middle';
        const widest = Math.max(...lines.map((l) => g.measureText(l).width), 1);
        const size = Math.min((W * 0.86) / widest, (H * 0.8) / (lines.length * 1.05)) * 200;
        g.font = o.textFont.replace(/\d+px/, Math.round(size) + 'px');
        g.fillStyle = '#fff';
        lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.05));
      }
      function build() {
        if (typeof document === 'undefined') return;
        sw = cols * 2; sh = rows * 2;
        off = off || document.createElement('canvas');
        off.width = sw; off.height = sh;
        octx = off.getContext('2d', { willReadFrequently: true });
        if (isText || !o.source) makeText();
        lastSrc = null;
      }
      /* Light motion on a still photo, all in image space (coordinates 0..1 of the picture), deterministic in t.
       * wind:  [{ x0, x1, y0, y1, amp, up }]  rows sway sideways, more towards the bottom (or the top with up: true)
       * parts: [{ x, y, rx, ry, kind, amp, f }] a soft-edged ellipse moved on top of the picture
       *   kind: bob (nod), jaw (opens downwards), flick (occasional twitch), sway (lean) */
      let fxc = null, fxg = null, pc = null, pg = null;
      const wave = (t, f, ph) => Math.sin(t * f + ph) * 0.7 + Math.sin(t * f * 1.83 + ph * 2.1) * 0.3;
      function animate(src, iw, ih, t) {
        const W = Math.min(iw, 720), H = Math.max(1, Math.round(ih * W / iw)), a = o.anim, k = o.animAmount;
        if (!fxc) { fxc = document.createElement('canvas'); pc = document.createElement('canvas'); }
        if (!fxg || fxc.width !== W || fxc.height !== H) { fxc.width = W; fxc.height = H; fxg = fxc.getContext('2d'); }
        fxg.setTransform(1, 0, 0, 1, 0, 0);
        fxg.drawImage(src, 0, 0, W, H);
        const STRIP = 2, sy = ih / H;
        (Array.isArray(a.wind) ? a.wind : []).forEach((w, wi) => {
          const x = Math.round(w.x0 * W), ww = Math.round((w.x1 - w.x0) * W), y0 = Math.round(w.y0 * H), y1 = Math.round(w.y1 * H);
          for (let y = y0; y < y1; y += STRIP) {
            let d = w.flat ? 1 : (y - y0) / Math.max(1, y1 - y0); if (w.up && !w.flat) d = 1 - d;
            const dx = w.amp * k * W * d * d * wave(t, w.f || 1.6, y * 0.045 + wi * 3);
            fxg.drawImage(src, x * iw / W, y * sy, ww * iw / W, STRIP * sy, x + dx, y, ww, STRIP);
          }
        });
        (Array.isArray(a.parts) ? a.parts : []).forEach((p, i) => {
          const cx = p.x * W, cy = p.y * H, rx = p.rx * W, ry = p.ry * H, A = p.amp * k, f = p.f || 1;
          let dx = 0, dy = 0, rot = 0, sy2 = 1, ox = cx, oy = cy;
          if (p.kind === 'bob') { dy = A * H * wave(t, f, i); rot = A * 1.2 * wave(t, f * 0.71, i + 1); oy = cy + ry * 0.6; }
          else if (p.kind === 'jaw') { sy2 = 1 + A * Math.pow(Math.max(0, Math.sin(t * f + i)), 2); oy = cy - ry * 0.7; }
          else if (p.kind === 'flick') { rot = A * Math.pow(Math.max(0, Math.sin(t * f + i * 2.3)), 12) * Math.sin(t * 22); }
          else if (p.kind === 'sway') { rot = A * wave(t, f, i * 1.7); oy = cy + ry * 0.9; }
          const bw = Math.ceil(rx * 2.4), bh = Math.ceil(ry * 2.4), bx = cx - bw / 2, by = cy - bh / 2;
          if (bw < 1 || bh < 1 || rx <= 0 || ry <= 0) return;
          if (!pg || pc.width !== bw || pc.height !== bh) { pc.width = bw; pc.height = bh; pg = pc.getContext('2d'); }
          else pg.clearRect(0, 0, bw, bh);
          pg.globalCompositeOperation = 'source-over';
          pg.setTransform(1, 0, 0, 1, -bx, -by);
          pg.translate(ox + dx, oy + dy); pg.rotate(rot); pg.scale(1, sy2); pg.translate(-ox, -oy);
          pg.drawImage(fxc, 0, 0);
          // Feathered ellipse so the moved piece melts into the picture
          pg.setTransform(1, 0, 0, ry / rx, bw / 2, bh / 2);
          const gr = pg.createRadialGradient(0, 0, rx * 0.55, 0, 0, rx);
          gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          pg.globalCompositeOperation = 'destination-in';
          pg.fillStyle = gr; pg.fillRect(-bw, -bw, bw * 2, bw * 2);
          fxg.drawImage(pc, bx, by);
        });
        return fxc;
      }
      function frame(t) {
        if (!octx) return;
        const src = isText || !o.source ? textCanvas : o.source;
        const iw = src.videoWidth || src.naturalWidth || src.width, ih = src.videoHeight || src.naturalHeight || src.height;
        const isVideo = !!src.videoWidth;
        if (!iw || !ih) return;
        // Light motion: photos, and text too (it ripples like a flag)
        const live = (isText || !!o.source) && !!o.anim && o.animAmount > 0;
        // A canvas source may be drawn on every frame (procedural animation): sample it each time
        const isCanvas = !isText && !!o.source && typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement;
        if (src !== lastSrc || isVideo || live || isCanvas) {
          octx.fillStyle = '#000'; octx.fillRect(0, 0, sw, sh);
          if (live) {
            const fx = animate(src, iw, ih, t), k = o.animAmount, b = o.anim.breathe || 0;
            // Slow camera breathing: tiny zoom and drift
            const z = 1 + b * k * (0.5 + 0.5 * Math.sin(t * 0.31)), px0 = b * k * 0.4 * Math.sin(t * 0.19), py0 = b * k * 0.3 * Math.cos(t * 0.23);
            const sc = Math.max(o.width / fx.width, o.height / fx.height) * o.size * z;
            const dw = fx.width * sc * sw / o.width, dh = fx.height * sc * sh / o.height;
            octx.drawImage(fx, (sw - dw) / 2 + px0 * sw, (sh - dh) / 2 + py0 * sh, dw, dh);
            lastSrc = null;
          } else
          if (isText) {
            const sc = Math.max(sw / iw, sh / ih);
            octx.drawImage(src, (sw - iw * sc) / 2, (sh - ih * sc) / 2, iw * sc, ih * sc);
          } else {
            // Cover in display pixels, then map to the cell buffer: cells are not square, so this keeps the picture's proportions
            const sc = Math.max(o.width / iw, o.height / ih) * o.size, dw = iw * sc * sw / o.width, dh = ih * sc * sh / o.height;
            octx.drawImage(src, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
          }
          if (!live) lastSrc = src;
        }
        const px = octx.getImageData(0, 0, sw, sh).data, thr = o.threshold;
        const useColor = o.color && !isText && !!o.source;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          let cnt = 0, sum = 0, mx = 0, R = 0, G = 0, B = 0, Ls = 0;
          for (let q = 0; q < 4; q++) {
            const x = c * 2 + (q & 1), y = r * 2 + (q >> 1);
            if (y >= sh) continue;
            const i = (y * sw + x) * 4;
            let l = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
            if (o.invert) l = 1 - l;
            l *= px[i + 3] / 255;
            if (l > mx) mx = l;
            if (l > thr) { cnt++; sum += l; R += px[i]; G += px[i + 1]; B += px[i + 2]; Ls += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; }
          }
          const idx = r * cols + c;
          let tint = NEUTRAL;
          if (useColor && cnt) { const k = 1 / Math.max(Ls / cnt, 8); tint = [clamp((R / cnt) * k, 0, 2.6), clamp((G / cnt) * k, 0, 2.6), clamp((B / cnt) * k, 0, 2.6)]; }
          if (cnt >= 3) {
            const avg = sum / cnt, val = (avg - thr) / (1 - thr || 1);
            put(idx, avg > 0.93 ? HIGH : BODY, clamp(val, 0, 1), 1, tint);
          } else if (cnt > 0) put(idx, EDGE, 0.3 + cnt * 0.2, 1, tint);
          else if (o.glow && mx > thr * 0.45) {
            const I = (mx - thr * 0.45) / (thr * 0.55);
            if (rnd3(c, r, Math.floor(t * 2 + rnd3(c, r, 4) * 7)) < 0.85) putGlow(idx, I * 0.75, TEAL);
          }
        }
      }
      return { build, frame };
    }

    /* ---------------- Alpenglow (parametric: daylight 0 = dusk … 1 = day) ---------------- */
    function Alpenglow() {
      // Per-mode lighting constants (palette colours themselves live in o.agPalettes)
      const K = {
        dusk: { hazeS: 0.14, footS: [0.06, 0.15], nearS: [0.04, 0.1], mistS: 0.22, leafS: [0.03, 0.17], leafV: 0.74, rimS: 0.2, cloudS: [0.16, 0.4], ink: 0.5 },
        day: { hazeS: 0.74, footS: [0.42, 0.56], nearS: [0.26, 0.4], mistS: 0.86, leafS: [0.12, 0.42], leafV: 0.88, rimS: 0.62, cloudS: [0.62, 1.0], ink: 0.38 },
      };
      let trees = [], mH, rid, far, fot, hil, gnd, tip, sA = 1;
      const self = { build, frame, bg: ['#0a0c22', '#28254f', '#0e1028'], grid: null, lightBg: false, ink: 0.5, daylight: 0 };
      const gs = (u, m, s) => Math.exp(-((u - m) / s) * ((u - m) / s));
      const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      const hexCache = new Map();
      const hex3 = (h) => { let v = hexCache.get(h); if (!v) { const n = parseInt(String(h).replace('#', ''), 16) || 0; v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; hexCache.set(h, v); } return v; };
      const toHex = (c) => '#' + c.map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
      function ridged(x, y, seed) {
        let v = 0, a = 0.5, f = 1;
        for (let k = 0; k < 3; k++) { v += a * (1 - Math.abs(2 * noise2(x * f, y * f, seed + k * 19) - 1)); f *= 2.1; a *= 0.5; }
        return v / 0.875;
      }

      function build() {
        const r = mulberry32(ihash(o.seed, 41, 3));
        sA = (r() * 1e6) | 0;
        const j = () => (r() - 0.5) * 0.04;
        trees = [
          { cx: 0.19 + j(), top: 0.27 + j(), base: 0.92, w: 0.12, fl: 0.34, sw: 0.014 },
          { cx: 0.34 + j(), top: 0.4 + j(), base: 0.92, w: 0.085, fl: 0.3, sw: 0.012 },
          { cx: 0.06 + j(), top: 0.47 + j(), base: 0.92, w: 0.07, fl: 0.26, sw: 0.01 },
          { cx: 0.8 + j(), top: 0.31 + j(), base: 0.97, w: 0.17, fl: 0.02, sw: 0.01 },
          { cx: 0.6 + j(), top: 0.62 + j(), base: 0.97, w: 0.07, fl: 0.05, sw: 0.008 },
          { cx: 0.47 + j(), top: 0.58 + j(), base: 0.97, w: 0.06, fl: 0.12, sw: 0.008 },
        ];
        mH = new Float32Array(cols); rid = new Float32Array(cols); far = new Float32Array(cols);
        fot = new Float32Array(cols); hil = new Float32Array(cols); gnd = new Float32Array(cols); tip = new Uint8Array(cols);
      }
      function massifH(u) {
        const p1 = o.agPeak1, p2 = o.agPeak2, p3 = p1 - 0.22;
        const env = Math.max(gs(u, p1, 0.13) + 0.22 * Math.max(0, 1 - Math.abs(u - p1) / 0.045), 0.82 * gs(u, p2, 0.11), 0.55 * gs(u, p3, 0.09));
        const det = 0.6 * fbm1(u * 11, sA) + 0.4 * fbm1(u * 31, sA + 7);
        const rg = o.agRugged;
        return env * (1 - 0.32 * rg + 0.5 * rg * (1 - Math.abs(det * 2 - 1)));
      }
      const farH = (u) => Math.max(gs(u, 0.94, 0.11), 0.75 * gs(u, 0.03, 0.09)) * (0.5 + 0.65 * (1 - Math.abs(2 * fbm1(u * 16, sA + 5) - 1)));

      let vegLocal = 0;
      function veg(u, v, y, c, t) {
        if (y > gnd[c]) { vegLocal = u + 0.003 * o.agWind * Math.sin(t * 1.3 + u * 20); return 99; }
        if (!o.agTrees) return 0;
        const sc = o.agTreeScale;
        for (let i = 0; i < trees.length; i++) {
          const T = trees[i], top = T.base - (T.base - T.top) * sc, w = T.w * (0.6 + 0.4 * sc);
          if (v < top - 0.02 || v > T.base || Math.abs(u - T.cx) > w * 1.5) continue;
          const k = clamp((v - top) / (T.base - top), 0, 1);
          const dx = o.agWind * (T.sw * (1 - k) * (1 - k) * Math.sin(t * 1.1 + i * 1.7) + 0.002 * (1 - k) * Math.sin(t * 4.3 + v * 60 + i));
          const lu = u - dx;
          const n = fbm2(lu * 55, v * 45, sA + 30 + i);
          if (Math.abs(lu - T.cx) < w * Math.pow(k, 0.7) * (0.5 + 0.85 * n)) { vegLocal = lu; return i + 1; }
        }
        return 0;
      }

      function frame(t) {
        const kd = o.agCycle ? 0.5 - 0.5 * Math.cos(t * 0.05 * o.agCycleSpeed) : clamp(o.agDaylight, 0, 1);
        self.daylight = kd;
        const day = kd >= 0.5, L = (a, b) => a + (b - a) * kd;
        const PD = o.agPalettes.dusk, PY = o.agPalettes.day;
        const P = {};
        for (const key in PD) { const a = hex3(PD[key]), b = hex3(PY[key] || PD[key]); P[key] = [(a[0] + (b[0] - a[0]) * kd) / 161, (a[1] + (b[1] - a[1]) * kd) / 161, (a[2] + (b[2] - a[2]) * kd) / 161]; }
        const FL = ['flower1', 'flower2', 'flower3', 'flower4', 'flower5'].map((k) => P[k]);
        const sky = (k) => toHex(mix(hex3(PD[k]), hex3(PY[k] || PD[k]), kd));
        self.bg = [sky('skyTop'), sky('skyMid'), sky('skyBottom')];
        self.grid = day ? 'rgba(20,50,100,0.07)' : 'rgba(130,130,210,0.06)';
        self.lightBg = day;
        self.ink = L(K.dusk.ink, K.day.ink);
        const hazeS = L(K.dusk.hazeS, K.day.hazeS), footS = [L(K.dusk.footS[0], K.day.footS[0]), L(K.dusk.footS[1], K.day.footS[1])];
        const nearS = [L(K.dusk.nearS[0], K.day.nearS[0]), L(K.dusk.nearS[1], K.day.nearS[1])], mistS = L(K.dusk.mistS, K.day.mistS);
        const leafS = [L(K.dusk.leafS[0], K.day.leafS[0]), L(K.dusk.leafS[1], K.day.leafS[1])], leafV = L(K.dusk.leafV, K.day.leafV);
        const rimS = L(K.dusk.rimS, K.day.rimS), cloudS = [L(K.dusk.cloudS[0], K.day.cloudS[0]), L(K.dusk.cloudS[1], K.day.cloudS[1])];

        // Narrower than 16:9 (portrait, square): show the middle of the landscape at its own proportions
        // instead of squeezing the whole width in. u runs over [u0, 1 - u0].
        const H = o.height, Wd = o.width, S = o.size, uS = Math.min(1, Wd / H / (16 / 9)), u0 = 0.5 * (1 - uS), Wv = Wd / uS;
        const du = (cw / Wd) * uS, dv = ch / H, side = -(o.agLight || -1);
        for (let c = 0; c < cols; c++) {
          const u = u0 + (c + 0.5) * du;
          mH[c] = massifH(u);
          rid[c] = H * (0.47 - 0.3 * S * mH[c]);
          far[c] = o.agFar ? H * (0.49 - 0.17 * S * farH(u)) : H * 2;
          fot[c] = H * (0.55 - 0.075 * fbm1(u * 4.5, sA + 12) - 0.03 * fbm1(u * 14, sA + 13));
          hil[c] = H * (0.625 - 0.06 * fbm1(u * 3.2, sA + 9) - 0.05 * gs(u, 0.56, 0.15));
          const uu = u + 0.003 * o.agWind * Math.sin(t * 1.3 + u * 20);
          gnd[c] = H * (0.77 - 0.06 * fbm1(uu * 9, sA + 20) - 0.035 * fbm1(uu * 35, sA + 21));
          tip[c] = rnd3(c, sA, 77) < 0.45 ? 1 : 0;
        }
        const glowCut = (o.agGlow + 0.06 * Math.sin(t * 0.12)) * (1 - kd) - kd;
        const faint = (idx, I, tint) => { if (o.glow && I > 0.05) putGlow(idx, I, tint); };
        const hzK = o.agHaze;

        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const y = (r + 0.5) * ch, u = u0 + (c + 0.5) * du, v = y / H;

          // 1. Foreground
          const vc = veg(u, v, y, c, t);
          if (vc) {
            const lu = vegLocal, qx = Math.floor(lu / du), T = vc === 99 ? null : trees[vc - 1];
            const fl = (T ? T.fl : u < 0.55 ? 0.24 : 0.14) * o.agFlowers;
            const ff = fbm2(lu * 8, v * 7, sA + 50), fp = clamp((ff - 0.38) / 0.3, 0, 1);
            if (rnd3(qx, r, sA) < fl * (0.2 + 1.7 * fp * fp)) {
              const col = FL[ihash(qx, r, 3) % 5];
              const tw = 0.88 + 0.12 * Math.sin(t * 2 + qx * 1.3 + r);
              if (rnd3(qx, r, 8) < 0.45) put(idx, HIGH, 1, L(0.92, 1) * tw, col);
              else put(idx, BODY, 0.78 * tw, L(0.92, 1), col);
              continue;
            }
            const clump = fbm2(lu * 80, v * 60, sA + 40);
            const sd = T ? clamp((T.cx - lu) / T.w, -1, 1) * -side : 0;
            const top = !veg(u, v - dv, y - ch, c, t);
            let s = leafS[0] + (leafS[1] - leafS[0]) * clump + kd * sd * 0.12;
            let tint = clump > 0.5 ? P.leaf : P.leaf2;
            if (top) { tint = mix(tint, P.rim, 0.5); s += rimS * 0.5; }
            if (o.agGrass && vc === 99 && v > 0.86 && rnd3(qx, r, 12) < 0.35) {
              const w = Math.sin(t * 1.6 * Math.max(0.2, o.agWind) + lu * 30 + r * 0.5) * Math.min(1.5, o.agWind);
              putChar(idx, BODY, clamp(s + 0.06, 0, 1), leafV, P.grass, w > 0.35 ? '/' : w < -0.35 ? '\\' : '|');
            } else put(idx, BODY, clamp(s, 0, 1), leafV, tint);
            continue;
          }

          // 2. Mist
          const mz = o.agMist * fbm2(u * 2.2 + t * 0.018 * o.agMistSpeed, v * 5, sA + 90) * (gs(v, 0.6, 0.06) + 0.6 * gs(v, 0.53, 0.035));
          if (!day && mz > 0.58) { put(idx, BODY, mistS * (0.75 + (mz - 0.58)), 0.8, P.mist); continue; }
          if (mz > 0.47 && rnd3(c, r, Math.floor(t * 0.8 + rnd3(r, c, 9) * 6)) < (mz - 0.47) * 8) { put(idx, EDGE, day ? 0.9 : 0.3, day ? 1.2 : 0.8, P.mist); continue; }

          // 3-4. Forested ridges
          let done = false;
          for (const [Y, tint, sr, near] of [[hil[c], P.near, nearS, 1], [fot[c], P.foot, footS, 0]]) {
            if (y <= Y - (tip[c] ? ch : 0)) continue;
            const dN = (y - Y) / H, tex = fbm2(u * 40, v * 30, sA + 140 + near);
            let s = sr[0] + (sr[1] - sr[0]) * tex;
            if (!near) { const rel = (H * 0.55 - Y) / (H * 0.1); if (dN < dv * 1.5 && rel > 0.5) s += L(0.12, 0.2); }
            const fade = clamp((dN * hzK - 0.035) / 0.05, 0, 1);
            if (fade >= 1) {
              if (day) put(idx, BODY, hazeS * (near ? 0.62 : 0.8), 0.95, mix(tint, P.haze, 0.6));
              else if (rnd3(c, r, Math.floor(t * 0.6 + rnd3(c, r, 2) * 5)) < 0.45) faint(idx, 0.24, tint);
            } else if (rnd3(c, r, 21 + near) < fade) { if (day) put(idx, BODY, s + (hazeS - s) * 0.6, 0.95, mix(tint, P.haze, 0.5)); else put(idx, EDGE, 0.3, 0.8, tint); }
            else if (y < Y) putChar(idx, BODY, s, 0.9, tint, rnd3(c, 5, sA) < 0.5 ? '^' : 'A');
            else put(idx, BODY, s + (hazeS - s) * fade * 0.5, 0.9, tint);
            done = true; break;
          }
          if (done) continue;

          // 5. Massif
          if (y > rid[c]) {
            const dN = (y - rid[c]) / H, m = mH[c];
            const cL = Math.max(0, c - 1), cR = Math.min(cols - 1, c + 1);
            const gxM = (mH[cR] - mH[cL]) / ((cR - cL) * du || 1);
            const A1 = 0.07 * o.agRugged, A2 = 0.03 * o.agRugged;
            const d0 = A1 * ridged(u * 14, v * 10, sA + 100) + A2 * ridged(u * 38, v * 27, sA + 120);
            const dx = A1 * ridged((u + du) * 14, v * 10, sA + 100) + A2 * ridged((u + du) * 38, v * 27, sA + 120);
            const dy = A1 * ridged(u * 14, (v + dv) * 10, sA + 100) + A2 * ridged(u * 38, (v + dv) * 27, sA + 120);
            const gx = (dx - d0) / du, gy = (dy - d0) / dv;
            const lam = clamp(0.5 + side * (0.035 * gxM + 0.32 * gx) - 0.16 * gy, 0, 1);
            const alt = 1 - dN / (0.08 + 0.32 * m);
            const snowT = 0.6 - 0.45 * o.agSnow;
            const snowAmt = alt + 0.75 * (fbm2(u * 22, v * 16, sA + 130) - 0.5) - 0.07 * Math.abs(gx) - 0.05 * Math.abs(gy);
            const snow = m > 0.15 && snowAmt > snowT;
            const sunlit = alt > glowCut && lam > L(0.36, 0.4);
            let tint, s, k = BODY;
            if (snow) {
              if (sunlit) {
                tint = alt > 0.82 ? P.snowHi : mix(P.snowLo, P.snowMid, clamp((alt - Math.max(glowCut, 0)) / (0.82 - Math.max(glowCut, 0)), 0, 1));
                s = L(0.32, 0.76) + L(0.64, 0.24) * lam;
                if (alt > 0.965 && lam > 0.5) k = HIGH;
              } else { tint = P.snowShadow; s = L(0.24, 0.56) + 0.14 * lam; }
            } else if (sunlit) { tint = P.rockLit; s = L(0.12, 0.3) + L(0.22, 0.3) * lam; }
            else { tint = P.rockShadow; s = L(0.06, 0.24) + L(0.08, 0.12) * lam; }
            if (kd > 0.3 && fbm2(u * 3 - t * 0.02 * o.agCloudSpeed, v * 4, sA + 70) > 0.6) s *= 1 - 0.22 * kd * o.agClouds;
            const hz = clamp((dN * hzK - (0.08 + 0.2 * m)) / 0.1, 0, 1);
            if (hz >= 1 && day) { put(idx, BODY, hazeS, 0.97, P.haze); continue; }
            if (hz >= 1) { if (rnd3(c, r, Math.floor(t * 0.7 + rnd3(c, r, 3) * 5)) < 0.4 * (1.6 - dN * 6)) faint(idx, 0.3, P.haze); continue; }
            put(idx, hz > 0.6 ? BODY : k, s + (hazeS - s) * hz, 1, mix(tint, P.haze, hz));
            continue;
          }

          // 6. Far ranges
          if (y > far[c] && far[c] < H * 0.465) {
            const dN = (y - far[c]) / H, alt = 1 - (dN * hzK) / 0.07, tex = fbm2(u * 30, v * 24, sA + 150);
            if (alt > 0) {
              const top = L(0.34, 0.86), kk = clamp(alt * 1.3 - 0.2 + (tex - 0.5) * 0.5, 0, 1);
              put(idx, BODY, hazeS + (top - hazeS) * kk, 0.95, mix(P.haze, P.far, kk));
            } else if (day) put(idx, BODY, hazeS, 0.97, P.haze);
            else if (alt > -0.8 && rnd3(c, r, Math.floor(t * 0.6 + rnd3(c, r, 6) * 5)) < 0.4) faint(idx, 0.25, P.haze);
            continue;
          }

          // 7. Sky
          if (o.agSun && kd > 0.3) {
            const R = Math.min(Wv, H) * 0.045, ds = Math.hypot((u - o.agSunX) * Wv, y - H * o.agSunY);
            if (ds < R) { put(idx, HIGH, 1, 1.05, P.sun); continue; }
            if (ds < R * 2.2 && rnd3(c, r, 51) < 0.5 * (1 - (ds - R) / (R * 1.2))) { put(idx, EDGE, 0.9, 1.35, P.sun); continue; }
          }
          if (o.agClouds > 0) {
            const band = gs(v, 0.18, 0.13), ts = t * 0.01 * o.agCloudSpeed;
            const warp = 0.35 * fbm2(u * 4, v * 4, sA + 85);
            const cd = fbm2(u * 2.6 - ts + warp, v * 6 + warp, sA + 80) * band * L(0.95, 1.05) * (0.7 + 0.3 * o.agClouds);
            const thr = 0.55 + (1 - Math.min(1, o.agClouds)) * 0.12;
            if (cd > thr - 0.05) {
              const above = fbm2(u * 2.6 - ts + warp, (v - dv * 2) * 6 + warp, sA + 80) * band;
              const litK = day ? clamp((cd - above) * 8 + 0.6, 0, 1) : clamp((above - cd) * 8 + 0.5, 0, 1);
              const s = cloudS[0] + (cloudS[1] - cloudS[0]) * litK;
              if (day && cd > thr) put(idx, s > 0.95 ? HIGH : BODY, s, 1.02, P.cloud);
              else if (!day && cd > thr + 0.05 && rnd3(c, r, Math.floor(t * 0.8 + rnd3(r, c, 7) * 6)) < 0.55) put(idx, EDGE, 0.75, 1, P.cloud);
              else if (!day) faint(idx, (cd - thr + 0.13) * 2.4, P.cloud);
              else put(idx, EDGE, 0.9, 1.3, P.cloud);
              continue;
            }
            if (!day && cd > thr - 0.13) { faint(idx, (cd - thr + 0.15) * 2, P.cloud); continue; }
          }
          if (v < 0.42 && rnd3(c, r, sA) < 0.02 * o.agStars * (1 - kd) * 1.4) faint(idx, (0.18 + 0.35 * rnd3(c, r, Math.floor(t * 1.2 + rnd3(r, c, 2) * 9))) * (1 - kd), P.star);
        }

        // Birds
        for (let i = 0; i < o.agBirds; i++) {
          const bx = ((t * 0.022 * (1 + (i % 5) * 0.25) + i * 0.29 + (sA % 100) / 100) % 1.4) - 0.2;
          const by = 0.12 + (i % 6) * 0.035 + 0.012 * Math.sin(t * 0.8 + i * 2);
          const flap = Math.floor(t * 4 + i * 1.3) % 2 ? 'v' : '-';
          for (let k = 0; k < (i % 2 ? 2 : 1); k++) {
            const c = Math.floor((bx - k * 0.01 - u0) / du), r = Math.floor((by + k * 0.01) / dv);
            if (c < 0 || r < 0 || c >= cols || r >= rows || kind[r * cols + c]) continue;
            putChar(r * cols + c, EDGE, 0.9, 1, P.bird, k ? (flap === 'v' ? '-' : 'v') : flap);
          }
        }
        // Fireflies (fade out with daylight)
        const nF = Math.round(o.agFireflies * clamp(1 - kd * 2, 0, 1));
        for (let i = 0; i < nF; i++) {
          const fx = 0.5 + 0.48 * Math.sin(t * 0.11 * (1 + (i % 3) * 0.3) + i * 2.1);
          const fy = 0.68 + 0.18 * Math.sin(t * 0.17 * (1 + (i % 4) * 0.2) + i * 1.3);
          if (Math.sin(t * 1.8 + i * 1.7) < -0.2) continue;
          const c = Math.floor((fx - u0) / du), r = Math.floor(fy / dv);
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          putChar(r * cols + c, EDGE, 1, 1.5, P.firefly, '*');
        }
      }
      return self;
    }

    const FACTORY = { alpenglow: Alpenglow, sharks: () => Creatures('sharks'), mantas: () => Creatures('mantas'), koi: () => Creatures('koi'), birds: () => Creatures('birds'), waves: Waves, landscape: Landscape, image: () => Bitmap(false), text: () => Bitmap(true) };
    function useScene() { scene = (FACTORY[o.scene] || FACTORY.sharks)(); scene.build(); }

    /* ---------------- Draw (pixel-buffer renderer: fast enough for small cells) ---------------- */
    let img = null, px32 = null, bufW = 0, bufH = 0, atlas = new Map(), atlasKey = '', gcv = null, gctx = null;
    const colorCache = new Map();
    function parseColor(str) {
      if (colorCache.has(str)) return colorCache.get(str);
      let out = [0, 0, 0, 1];
      const m = /^#([0-9a-f]{6})$/i.exec(str);
      if (m) { const n = parseInt(m[1], 16); out = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
      else {
        // any other CSS colour (#fff, names, hsl…): let a 1×1 canvas resolve it once
        let q = String(str);
        if (typeof document !== 'undefined' && !/^rgba?\(/.test(q)) {
          try { const g = (parseColor.g = parseColor.g || document.createElement('canvas').getContext('2d')); g.fillStyle = '#000'; g.fillStyle = q; q = g.fillStyle; } catch (e) { /* keep black */ }
          const h = /^#([0-9a-f]{6})$/i.exec(q);
          if (h) { const n = parseInt(h[1], 16); q = `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`; }
        }
        const k = /rgba?\(([^)]+)\)/.exec(q);
        if (k) { const p = k[1].split(',').map(parseFloat); out = [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
      }
      colorCache.set(str, out);
      return out;
    }
    function glyphMask(code) {
      const key = `${Math.round(cw * 100)}|${Math.round(ch * 100)}|${o.font}`;
      if (key !== atlasKey) {
        atlasKey = key; atlas = new Map();
        const gw = Math.ceil(cw) + 1, gh = Math.ceil(ch) + 1;
        gcv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(gw, gh) : Object.assign(document.createElement('canvas'), { width: gw, height: gh });
        gctx = gcv.getContext('2d', { willReadFrequently: true });
        atlas.gw = gw; atlas.gh = gh;
      }
      let m = atlas.get(code);
      if (m) return m;
      const gw = atlas.gw, gh = atlas.gh;
      gctx.clearRect(0, 0, gw, gh);
      gctx.font = `${Math.max(4, Math.round(ch * 0.74))}px ${o.font}`;
      gctx.textAlign = 'center'; gctx.textBaseline = 'middle'; gctx.fillStyle = '#fff';
      gctx.fillText(String.fromCodePoint(code), cw / 2, ch / 2 + ch * 0.04);
      const d = gctx.getImageData(0, 0, gw, gh).data;
      m = new Uint8Array(gw * gh);
      for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
      atlas.set(code, m);
      return m;
    }
    const pack = (r, g, b) => ((255 << 24) | (clamp(b | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255)) >>> 0;
    function blendPx(i, r, g, b, a) {
      const p = px32[i], ia = 1 - a;
      px32[i] = ((255 << 24) | ((((p >>> 16) & 255) * ia + b * a) << 16) | ((((p >>> 8) & 255) * ia + g * a) << 8) | ((p & 255) * ia + r * a)) >>> 0;
    }
    function fillRect(x0, y0, x1, y1, col) {
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(bufW, x1); y1 = Math.min(bufH, y1);
      for (let y = y0; y < y1; y++) px32.fill(col, y * bufW + x0, y * bufW + x1);
    }
    function blendRect(x0, y0, x1, y1, r, g, b, a) {
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(bufW, x1); y1 = Math.min(bufH, y1);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) blendPx(y * bufW + x, r, g, b, a);
    }
    function drawGlyph(code, x0, y0, x1, y1, r, g, b) {
      const m = glyphMask(code), gw = atlas.gw;
      r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
      for (let y = y0; y < y1 && y < bufH; y++) {
        const row = (y - y0) * gw;
        for (let x = x0; x < x1 && x < bufW; x++) {
          const a = m[row + x - x0];
          if (a) blendPx(y * bufW + x, r, g, b, a / 255);
        }
      }
    }

    function render(ctx, t) {
      clear();
      scene.frame(t);
      const W = Math.round(o.width), H = Math.round(o.height);
      if (!img || bufW !== W || bufH !== H) { img = ctx.createImageData(W, H); px32 = new Uint32Array(img.data.buffer); bufW = W; bufH = H; }

      // Background
      if (o.background === 'transparent') px32.fill(0);
      else if (scene.bg && o.background === DEFAULTS.background) {
        const s = scene.bg.map(parseColor), s2 = s[2] || s[0];
        for (let y = 0; y < H; y++) {
          const k = y / H;
          const [a, b, f] = k < 0.55 ? [s[0], s[1], k / 0.55] : [s[1], s2, (k - 0.55) / 0.45];
          px32.fill(pack(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f), y * W, (y + 1) * W);
        }
      } else { const b = parseColor(o.background); px32.fill(pack(b[0], b[1], b[2])); }

      // Grid
      if (o.grid) {
        const gc = parseColor(scene.grid && o.gridColor === DEFAULTS.gridColor ? scene.grid : o.gridColor);
        if (gc[3] >= 1) {
          const col = pack(gc[0], gc[1], gc[2]);
          for (let c = 1; c < cols; c++) { const x = Math.round(c * cw); for (let y = 0; y < H; y++) px32[y * W + x] = col; }
          for (let r = 1; r < rows; r++) { const y = Math.round(r * ch); if (y < H) px32.fill(col, y * W, (y + 1) * W); }
        } else {
          for (let c = 1; c < cols; c++) { const x = Math.round(c * cw); for (let y = 0; y < H; y++) blendPx(y * W + x, gc[0], gc[1], gc[2], gc[3]); }
          for (let r = 1; r < rows; r++) { const y = Math.round(r * ch); if (y < H) for (let x = 0; x < W; x++) blendPx(y * W + x, gc[0], gc[1], gc[2], gc[3]); }
        }
      }

      // Glow dots and dashes in empty cells
      const g = o.gap != null ? Math.max(0, Math.round(o.gap)) : Math.max(1, Math.round(cw * 0.07)), nAcc = o.accents.length;
      const RC = cps(o.ramp || RAMP.join('')), EC = cps(o.edgeChars || ".,'`:;',"), HC = cps(o.highChars || '@8%');
      const half = Math.max(1, EC.length >> 1), ES = EC.slice(0, half), EH = EC.slice(half).length ? EC.slice(half) : ES;
      const BR = o.brightness, SAT = o.saturation, adj = BR !== 1 || SAT !== 1;
      const A = (r, g2, b) => { if (!adj) return [r, g2, b]; const l = 0.299 * r + 0.587 * g2 + 0.114 * b; return [(l + (r - l) * SAT) * BR, (l + (g2 - l) * SAT) * BR, (l + (b - l) * SAT) * BR]; };
      const lh = Math.max(1, Math.round(ch * 0.07));
      // Cutout: a band where nothing is drawn; cells dissolve as they reach it (tile, then glyph, then dots)
      const cut = o.cutout && o.cutout.length >= 2 ? o.cutout : null;
      const presence = o.presence == null ? 1 : clamp(o.presence, 0, 1);
      const cx0 = cut ? cut[0] * W : 0, cx1 = cut ? cut[1] * W : 0, cfd = cut ? Math.max(1, (cut[2] || 0) * W) : 1;
      const fadeAt = (c) => { const x = (c + 0.5) * cw, d = x < cx0 ? cx0 - x : x > cx1 ? x - cx1 : -1; return d < 0 ? 0 : Math.min(1, d / cfd); };
      for (let idx = 0; idx < kind.length; idx++) {
        if (kind[idx]) continue;
        const I = glow[idx], a = dash[idx];
        if (!(I > 0) && !(a > 0.02)) continue;
        const c = idx % cols, r = (idx / cols) | 0;
        if (presence < 1 && rnd3(c, r, 92) >= presence) continue;
        if (cut) { const f = fadeAt(c); if (f < 1 && rnd3(c, r, 91) >= f) continue; }
        const cx = (c + 0.5) * cw, cy = (r + 0.5) * ch;
        if (I > 0) {
          const slot = Math.floor(t * o.flicker * 0.5 + (ihash(c, r, 3) % 97) / 31);
          if (rnd3(c * 7 + 1, r * 13 + 2, slot) >= 0.12) {
            const sz = Math.max(1, Math.round(cw * (0.2 + 0.3 * I))), q = 190 * I * I;
            let col;
            let q3;
            if (scene.lightBg) { const m = 110 + 110 * I; q3 = A(m * GR[idx], m * GG[idx], m * GB[idx]); }
            else q3 = A(10 + q * GR[idx], 14 + q * GG[idx], 18 + q * GB[idx]);
            col = pack(q3[0], q3[1], q3[2]);
            const x0 = Math.round(cx - sz / 2), y0 = Math.round(cy - sz / 2);
            fillRect(x0, y0, x0 + sz, y0 + sz, col);
          }
        }
        if (a > 0.02) blendRect(Math.round(c * cw + cw * 0.22), Math.round(cy - lh / 2), Math.round(c * cw + cw * 0.78), Math.round(cy - lh / 2) + lh, 150, 152, 160, Math.min(1, a));
      }

      // Cells
      const acc = o.accents.map(parseColor);
      const ink = o.ink != null ? o.ink : scene.ink != null ? scene.ink : 1;
      for (let idx = 0; idx < kind.length; idx++) {
        const kd = kind[idx];
        if (!kd) continue;
        const c = idx % cols, r = (idx / cols) | 0;
        // cutout dissolve: f = 1 clear of the band, 0 at its edge; n = a fixed random per cell
        let f = 1, n = 0;
        if (presence < 1 && rnd3(c, r, 92) >= presence) continue;
        if (cut) { f = fadeAt(c); if (f <= 0) continue; if (f < 1) { n = rnd3(c, r, 91); if (n >= f * 1.3) continue; } }
        const x0 = Math.round(c * cw), x1 = Math.round((c + 1) * cw), y0 = Math.round(r * ch), y1 = Math.round((r + 1) * ch);
        const tr = TR[idx], tg = TG[idx], tb = TB[idx], v = dim[idx], s = shade[idx];
        const key = ihash(c, r, 17), slot = Math.floor(t * o.flicker + (key % 997) / 97);
        const isAcc = rnd3(key, slot, 7) < o.glitch, pick = ihash(key, slot, 2);
        let code = chrO[idx];
        if (f < 1 && kd !== EDGE && n >= (f - 0.45) / 0.55) {
          // past the tile stage: the cell is only its glyph, in the tile colour; near the edge just a dot
          const C = (kd === HIGH ? 226 : kd === DARK ? 24 + s * 40 : kd === MARK ? 150 : 46 + s * 165) * v, q = A(C * tr, C * tg, C * tb + 4);
          if (f < 0.4) code = DOTS[pick % DOTS.length];
          else if (!code) { const rn = RC.length; code = RC[clamp(Math.floor((1 - s) * (rn - 0.01)), 0, rn - 1)]; }
          drawGlyph(code, x0, y0, x1, y1, q[0], q[1], q[2]);
          continue;
        }
        if (kd === EDGE) {
          if (!code) { const set = s > 0.5 ? EH : ES; code = set[pick % set.length]; }
          const L = (70 + s * 90) * v;
          if (isAcc) { const a = acc[key % nAcc]; drawGlyph(code, x0, y0, x1, y1, a[0], a[1], a[2]); }
          else { const q = A(L * tr, L * tg, L * tb + 6); drawGlyph(code, x0, y0, x1, y1, q[0], q[1], q[2]); }
          continue;
        }
        let C, tc = null;
        if (kd === HIGH) { C = 226; if (!code) code = HC[pick % HC.length]; }
        else if (kd === MARK) { C = 12; if (!code) code = 111; tc = [154, 160, 173]; }
        else if (kd === DARK) { C = 24 + s * 40; if (!code) code = DARK_CH[pick % 3].charCodeAt(0); tc = [70 * tr, 70 * tg, 70 * tb]; }
        else { C = 46 + s * 165; if (!code) { const n = RC.length; code = RC[clamp(Math.floor((1 - s) * (n - 0.01)) + ((pick % 3) - 1), 0, n - 1)]; } }
        C *= v;
        const f3 = A(C * tr, C * tg, C * tb + 4);
        fillRect(x0 + g, y0 + g, x1, y1, pack(f3[0], f3[1], f3[2]));
        if (isAcc) tc = acc[key % nAcc];
        else if (!tc) { const k = C > 120 ? C * (1 - 0.58 * ink) : C + (C * 0.6 + 38) * ink; tc = A(k * tr, k * tg, k * tb); }
        drawGlyph(code, x0, y0, x1, y1, tc[0], tc[1], tc[2]);
      }
      ctx.putImageData(img, 0, 0);
    }
    const DOTS = [46, 46, 58, 39];
    const cpsCache = new Map();
    function cps(str) { let a = cpsCache.get(str); if (!a) { a = Array.from(String(str)).map((ch2) => ch2.codePointAt(0)); if (!a.length) a = [64]; cpsCache.set(str, a); } return a; }
    function refresh() { atlasKey = ''; }


    const REBUILD = ['scene', 'seed', 'count', 'species', 'size', 'speed', 'width', 'height', 'cols', 'cellAspect', 'spinePoints', 'source', 'text', 'textFont', 'koiPads', 'sides', 'varieties'];
    function set(p) {
      sane(Object.assign(o, p));
      if ('width' in p || 'height' in p || 'cols' in p || 'cellAspect' in p) layout();
      if ('scene' in p) useScene();
      else if (REBUILD.some((k) => k in p)) scene.build();
      else if (('heading' in p || 'spread' in p) && scene.resetLanes) scene.resetLanes();
    }

    layout();
    useScene();
    return { render, set, refresh, options: o, get grid() { return { cols, rows, cw, ch }; } };
  }

  return { create, SPECIES, DEFAULTS, SCENES: ['sharks', 'mantas', 'koi', 'birds', 'waves', 'landscape', 'alpenglow', 'image', 'text'] };
});

/* =====================================================================
 * Maille — config helpers + <maille-scene> web component
 * ===================================================================== */
(function () {
  'use strict';
  const root = typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : {};
  const AF = root.AsciiField;
  if (!AF) return;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // Relative image URLs (src) resolve against this file, so embeds on other sites find them
  const BASE = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || (typeof location !== 'undefined' ? location.href : '');
  const SPECIES = { mix: ['grey', 'sand', 'hammer', 'grey'], grey: ['grey'], sand: ['sand'], hammer: ['hammer'] };
  const ENGINE_KEYS = Object.keys(AF.DEFAULTS).filter((k) => !['width', 'height', 'source', 'species', 'speed'].includes(k));

  // A "config" is the shareable description of a scene (what the studio edits and the embed reads).
  function configDefaults() {
    const s = {};
    for (const k of ENGINE_KEYS) s[k] = clone(AF.DEFAULTS[k]);
    return Object.assign(s, {
      scene: 'alpenglow', format: '16:9', speed: 1, speciesSet: 'mix', cols: 200, rampPreset: '@8%SX#t;:',
      gapAuto: true, gap: 1, inkAuto: true, ink: 0.5, bgAuto: true, background: '#050506', gridColor: '#121215',
      src: '', // image scene: URL of the picture (embeddable, unlike a local file)
    });
  }
  // Fill a partial config with defaults (palettes merged colour by colour).
  function resolve(partial) {
    const d = configDefaults(), p = partial ? clone(partial) : {};
    const pal = p.agPalettes; delete p.agPalettes; delete p.app; delete p.v;
    Object.assign(d, p);
    if (pal) for (const mode of ['dusk', 'day']) if (pal[mode]) Object.assign(d.agPalettes[mode], pal[mode]);
    return d;
  }
  // Only what differs from the defaults: keeps embed snippets short.
  function compact(cfg) {
    const d = configDefaults(), out = {};
    for (const k in cfg) {
      if (k === 'agPalettes') {
        const pd = {};
        for (const mode of ['dusk', 'day']) for (const key in cfg.agPalettes[mode]) {
          if (cfg.agPalettes[mode][key] !== d.agPalettes[mode][key]) (pd[mode] = pd[mode] || {})[key] = cfg.agPalettes[mode][key];
        }
        if (Object.keys(pd).length) out.agPalettes = pd;
      } else if (JSON.stringify(cfg[k]) !== JSON.stringify(d[k])) out[k] = cfg[k];
    }
    return out;
  }
  function toEngine(cfg, source) {
    const o = {};
    for (const k of ENGINE_KEYS) if (k in cfg) o[k] = cfg[k];
    o.species = SPECIES[cfg.speciesSet] || SPECIES.mix;
    o.gap = cfg.gapAuto ? null : cfg.gap;
    o.ink = cfg.inkAuto ? null : cfg.ink;
    o.background = cfg.bgAuto ? AF.DEFAULTS.background : cfg.background === AF.DEFAULTS.background ? '#050507' : cfg.background;
    o.source = source || null;
    return o;
  }
  // Generic light motion for any picture or text, so it feels filmed without a video
  const MOTION = {
    photo: { breathe: 0.03, wind: [{ x0: 0, x1: 1, y0: 0.55, y1: 1, amp: 0.007, f: 1.3 }] },
    text: { breathe: 0.02, wind: [{ x0: 0, x1: 1, y0: 0, y1: 1, amp: 0.014, f: 1.6, flat: true }] },
  };
  const PRESETS = {
    'alpenglow': { name: 'Alpenglow', config: {} },
    'golden-hour': { name: 'Golden hour', config: { agDaylight: 0.38, agGlow: 0.2, agFireflies: 8, agClouds: 0.8 } },
    'alpine-day': { name: 'Alpine day', config: { agDaylight: 1, agBirds: 7 } },
    'day-cycle': { name: 'Day cycle', config: { agCycle: true, agCycleSpeed: 1.5 } },
    'fine-grain': { name: 'Fine grain', config: { cols: 300, cellAspect: 1.4, inkAuto: false, ink: 0.3 } },
    'sharks': { name: 'Sharks', config: { scene: 'sharks', format: '3:4', cols: 56 } },
    'mantas': { name: 'Mantas', config: { scene: 'mantas', format: '3:4', cols: 64, count: 3, heading: -70 } },
    'koi': { name: 'Koi pond', config: { scene: 'koi', format: '1:1', cols: 72, count: 7, glitch: 0.015 } },
    'gulls': { name: 'Gulls', config: { scene: 'birds', format: '16:9', cols: 170, count: 10, size: 0.7, heading: -15, spread: 25, seed: 6 } },
    'night-ocean': { name: 'Night ocean', config: { scene: 'waves', cols: 110, size: 1.2 } },
    'binary-sea': { name: 'Binary sea', config: { scene: 'waves', cols: 130, size: 1, ramp: '10', rampPreset: '10', seed: 4 } },
    'hammerheads': { name: 'Hammerheads', config: { scene: 'sharks', format: '3:4', cols: 60, speciesSet: 'hammer', count: 5, heading: -60, seed: 12 } },
    'gold-koi': { name: 'Gold koi', config: { scene: 'koi', format: '1:1', cols: 72, count: 6, koiPads: 3, varieties: ['gold', 'butterfly', 'silver', 'gold', 'kujaku'], glitch: 0.015, seed: 5 } },
    'koi-lanes': { name: 'Koi lanes', config: { scene: 'koi', format: '16:9', cols: 110, count: 9, sides: 0.26, koiPads: 4, glitch: 0.015, seed: 9 } },
    'starlings': { name: 'Starlings', config: { scene: 'birds', format: '16:9', cols: 150, count: 12, size: 0.6, heading: -30, spread: 40, seed: 3 } },
    'block-alps': { name: 'Block alps', config: { cols: 120, ramp: '█▓▒░', rampPreset: '█▓▒░', agDaylight: 0.55, agClouds: 1.2 } },
    'type': { name: 'Type', config: { scene: 'text', text: 'MAILLE', cols: 120, anim: MOTION.text } },
    'alpine-cow': { name: 'Alpine cow', config: { scene: 'image', src: 'img/alpine-cow.jpg', cols: 160, threshold: 0.08, anim: {
      breathe: 0.02,
      wind: [{ x0: 0.8, x1: 1, y0: 0.48, y1: 1, amp: 0.008, f: 1.2, up: true }, { x0: 0.42, x1: 0.8, y0: 0.88, y1: 1, amp: 0.006, f: 1.5 }],
      parts: [
        { kind: 'bob', x: 0.24, y: 0.76, rx: 0.22, ry: 0.32, amp: 0.012, f: 0.8 },
        { kind: 'flick', x: 0.14, y: 0.62, rx: 0.08, ry: 0.07, amp: 0.15, f: 0.6 },
        { kind: 'flick', x: 0.38, y: 0.6, rx: 0.08, ry: 0.07, amp: 0.15, f: 0.47 },
      ] } } },
    'meadow': { name: 'Meadow', config: { scene: 'image', src: 'img/meadow.jpg', cols: 180, threshold: 0.06, anim: {
      breathe: 0.025,
      wind: [{ x0: 0, x1: 1, y0: 0.5, y1: 1, amp: 0.01, f: 1.3 }],
      parts: [
        { kind: 'sway', x: 0.1, y: 0.3, rx: 0.12, ry: 0.28, amp: 0.012, f: 0.7 },
        { kind: 'sway', x: 0.88, y: 0.4, rx: 0.1, ry: 0.2, amp: 0.012, f: 0.6 },
      ] } } },
  };
  // Image sources by URL, loaded once and shared by every scene on the page
  const srcCache = new Map();
  function srcUrl(src) { try { return new URL(src, BASE).href; } catch (e) { return src; } }
  function loadSrc(src) {
    const url = srcUrl(src);
    if (!srcCache.has(url)) {
      const entry = { img: null };
      entry.p = new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => { entry.img = img; res(img); };
        img.onerror = () => { srcCache.delete(url); rej(new Error('Maille: could not load ' + url)); };
        img.src = url;
      });
      srcCache.set(url, entry);
    }
    return srcCache.get(url);
  }
  const FONT_FAMILIES = {
    'JetBrains Mono': 'JetBrains+Mono:wght@400', 'IBM Plex Mono': 'IBM+Plex+Mono', 'Space Mono': 'Space+Mono',
    'Fira Code': 'Fira+Code', 'DM Mono': 'DM+Mono', 'Courier Prime': 'Courier+Prime',
  };
  const requested = new Set();
  function ensureFont(font) {
    if (typeof document === 'undefined') return Promise.resolve();
    const fam = String(font || '').split(',')[0].trim().replace(/"/g, '');
    // The default font ships next to maille.js, so an embed makes no request to a third party
    if (fam === 'JetBrains Mono' && !requested.has(fam) && typeof FontFace !== 'undefined') {
      requested.add(fam);
      try {
        const ff = new FontFace('JetBrains Mono', `url(${new URL('fonts/jetbrains-mono-400.woff2', BASE).href}) format("woff2")`, { weight: '400', display: 'swap' });
        document.fonts.add(ff);
        return ff.load().catch(() => {});
      } catch (e) { /* fall back to the system monospace */ }
    }
    const q = fam === 'JetBrains Mono' ? null : FONT_FAMILIES[fam];
    if (q && !requested.has(q)) {
      requested.add(q);
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${q}&display=swap`;
      document.head.appendChild(l);
    }
    return document.fonts && fam ? document.fonts.load(`16px "${fam}"`).catch(() => {}) : Promise.resolve();
  }
  const b64 = {
    encode: (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    decode: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
  };

  const Maille = Object.assign({}, AF, { configDefaults, resolve, compact, toEngine, PRESETS, MOTION, ensureFont, b64, loadSrc: (src) => loadSrc(src).p, version: '1.0.0' });
  root.Maille = Maille;

  if (typeof window === 'undefined' || !window.customElements || customElements.get('maille-scene')) return;

  class MailleScene extends HTMLElement {
    static get observedAttributes() { return ['config', 'preset', 'speed', 'paused', 'motion', 'dpr']; }
    constructor() {
      super();
      const sh = this.attachShadow({ mode: 'open' });
      sh.innerHTML = '<style>:host{display:block;position:relative;overflow:hidden;background:#050506}:host([hidden]){display:none}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style><canvas part="canvas" role="img" aria-label="Animated ASCII scene"></canvas>';
      this._cv = sh.querySelector('canvas');
      this._ctx = this._cv.getContext('2d');
      this._t = 0; this._last = 0; this._raf = 0; this._visible = true; this._cfg = null; this._engine = null;
      this._tick = this._tick.bind(this);
    }
    connectedCallback() {
      if (!this.style.aspectRatio && !this.style.height && this.getBoundingClientRect().height < 2) this.style.aspectRatio = '16 / 9';
      this._apply();
      this._ro = new ResizeObserver(() => this._fit());
      this._ro.observe(this);
      this._io = new IntersectionObserver((es) => { this._visible = es.some((e) => e.isIntersecting); this._loop(); });
      this._io.observe(this);
      this._onVis = () => this._loop();
      document.addEventListener('visibilitychange', this._onVis);
      this._reduced = matchMedia('(prefers-reduced-motion: reduce)');
      this._reduced.addEventListener('change', this._onVis);
      this._fit();
      this._loop();
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf); this._raf = 0;
      this._ro && this._ro.disconnect(); this._io && this._io.disconnect();
      document.removeEventListener('visibilitychange', this._onVis);
      this._reduced && this._reduced.removeEventListener('change', this._onVis);
    }
    attributeChangedCallback(name) {
      if (!this.isConnected) return;
      // playback attributes only touch the loop; a new config or preset attribute wins over earlier JS changes
      if (name === 'paused' || name === 'motion') { this._loop(); return; }
      if (name === 'speed') { this._speed(); this._loop(); return; }
      if (name === 'dpr') { this._fit(); return; }
      this._override = null; this._apply(); this._loop();
    }
    _speed() { const v = parseFloat(this.getAttribute('speed')); if (this._cfg) this._cfg.speed = Number.isFinite(v) ? v : (Number.isFinite(+this._cfg.speed) ? this._cfg.speed : 1); }

    // --- public API ---
    get config() { return clone(this._cfg); }
    set config(v) { this._override = v; this._apply(); }
    set(partial) { this._override = Object.assign({}, this._override || this._attrConfig(), partial); this._apply(); }
    seek(t) { this._t = +t || 0; this._draw(); }
    play() { this.removeAttribute('paused'); }
    pause() { this.setAttribute('paused', ''); }
    get engine() { return this._engine; }
    // Share of cells drawn (0..1), for dissolving the scene in or out without a rebuild
    get presence() { return this._presence == null ? 1 : this._presence; }
    set presence(v) { this._presence = v; if (this._engine) { this._engine.set({ presence: v }); this._draw(); } }
    // An image, video or canvas element to draw (image scene), in place of config.src
    get source() { return this._source || null; }
    set source(v) { this._source = v || null; if (this._engine) { this._apply(); this._loop(); } }

    _attrConfig() {
      let c = {};
      const preset = this.getAttribute('preset');
      if (preset && PRESETS[preset]) c = clone(PRESETS[preset].config);
      const raw = this.getAttribute('config');
      if (raw) { try { Object.assign(c, JSON.parse(raw)); } catch (e) { console.warn('maille-scene: invalid config JSON', e); } }
      return c;
    }
    _apply() {
      this._cfg = resolve(this._override || this._attrConfig());
      if (!Number.isFinite(+this._cfg.speed)) this._cfg.speed = 1;
      if (this.getAttribute('speed') != null && this.getAttribute('speed') !== '') this._speed();
      const opts = toEngine(this._cfg);
      opts.cols = this._effCols();
      if (this._source) opts.source = this._source;
      if (this._presence != null) opts.presence = this._presence;
      const want = this._cfg.scene === 'image' && this._cfg.src && !this._source ? this._cfg.src : '';
      this._pending = '';
      if (want) {
        const entry = loadSrc(want);
        if (entry.img) opts.source = entry.img;
        else {
          this._pending = want;
          entry.p.then((img) => {
            if (this._pending !== want) return;
            this._pending = '';
            this._engine.set({ source: img }); this._draw();
          }, (e) => { console.warn(e.message); if (this._pending === want) { this._pending = ''; this._draw(); } });
        }
      }
      // Send only what changed: a live set() must not rebuild the whole scene
      const sig = (v) => (v && typeof v === 'object' ? (v instanceof Element ? v : JSON.stringify(v)) : v);
      if (!this._engine) {
        this._engine = AF.create(Object.assign({ width: Math.max(2, this._cv.width), height: Math.max(2, this._cv.height) }, opts));
        this._sent = {}; for (const k in opts) this._sent[k] = sig(opts[k]);
      } else {
        const diff = {};
        for (const k in opts) { const v = sig(opts[k]); if (this._sent[k] !== v) { diff[k] = opts[k]; this._sent[k] = v; } }
        if (Object.keys(diff).length) this._engine.set(diff);
      }
      if (this._font !== this._cfg.font) { this._font = this._cfg.font; ensureFont(this._cfg.font).then(() => { this._engine.refresh(); this._draw(); }); }
      this._draw();
    }
    _fit() {
      // dpr="1" caps the resolution: for full-page backgrounds, where sharpness matters less than cost
      const cap = parseFloat(this.getAttribute('dpr')), r = this.getBoundingClientRect(), dpr = Math.min(Number.isFinite(cap) && cap > 0 ? cap : 2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (this._cv.width !== w || this._cv.height !== h) {
        this._cv.width = w; this._cv.height = h;
        if (this._engine) this._engine.set({ width: w, height: h, cols: this._effCols() });
        this._draw();
      }
    }
    // Keep cells at least 3 CSS px wide so small embeds stay legible (the same on every screen density)
    _effCols() { const c = this._cfg ? this._cfg.cols : 200, w = this.getBoundingClientRect().width || this._cv.width; return Math.max(16, Math.min(c, Math.floor(Math.max(w, 48) / 3))); }
    _animating() {
      const reduced = this._reduced && this._reduced.matches && this.getAttribute('motion') !== 'always';
      return this.isConnected && this._visible && !document.hidden && !this.hasAttribute('paused') && !reduced;
    }
    _loop() { if (this._animating() && !this._raf) { this._last = performance.now(); this._raf = requestAnimationFrame(this._tick); } }
    _tick(now) {
      this._raf = 0;
      if (!this._animating()) return;
      this._raf = requestAnimationFrame(this._tick); // armed first: one bad frame never stops the scene
      this._t += Math.min(0.05, (now - this._last) / 1000) * (this._cfg ? this._cfg.speed : 1);
      this._last = now;
      try { this._draw(); } catch (e) { if (!this._err) console.error('maille-scene:', this._err = e); }
    }
    _draw() {
      if (this._pending) { this._ctx.clearRect(0, 0, this._cv.width, this._cv.height); return; }
      if (this._engine && this._cv.width > 2) this._engine.render(this._ctx, this._t);
    }
  }
  customElements.define('maille-scene', MailleScene);
})();
