/*
 * ascii-field.js
 * Generic ASCII cell renderer (canvas 2D) with interchangeable scenes:
 *   sharks · waves · landscape · image (image, video or canvas source) · text
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

  const SPECIES = {
    grey: {
      tint: [0.86, 0.92, 1.06], width: 0.115, tail: 0.6,
      prof: [[0, 0], [0.03, 0.42], [0.1, 0.78], [0.24, 1], [0.42, 0.86], [0.62, 0.5], [0.8, 0.2], [0.9, 0.1], [1, 0.04]],
      pect: [0.2, 0.4, 1.25], dorsal: [0.3, 0.4], second: [0.68, 0.72],
      eye: [0.05, 0.085, 0.5, 0.82], gills: [0.13, 0.21],
    },
    sand: {
      tint: [1.08, 0.95, 0.76], width: 0.135, tail: 0.5,
      prof: [[0, 0], [0.03, 0.5], [0.1, 0.86], [0.26, 1], [0.45, 0.92], [0.62, 0.56], [0.8, 0.24], [0.9, 0.12], [1, 0.05]],
      pect: [0.2, 0.38, 1.0], dorsal: [0.42, 0.5], second: [0.6, 0.66],
      eye: [0.04, 0.07, 0.5, 0.82], gills: [0.12, 0.2],
    },
    hammer: {
      tint: [0.78, 0.86, 0.98], width: 0.1, tail: 0.65,
      prof: [[0, 0.25], [0.008, 2.0], [0.05, 2.0], [0.065, 0.42], [0.1, 0.6], [0.26, 0.95], [0.42, 0.82], [0.62, 0.46], [0.8, 0.18], [0.9, 0.09], [1, 0.04]],
      pect: [0.22, 0.4, 1.35], dorsal: [0.3, 0.38], second: [0.7, 0.74],
      eye: [0.01, 0.05, 0.86, 1.01], gills: [0.14, 0.22],
    },
  };

  const DEFAULTS = {
    scene: 'sharks',     // sharks | waves | landscape | alpenglow | image | text
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
    glow: true,          // teal dot field
    glitch: 0.06,
    flicker: 2.4,
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

  function create(options) {
    const o = Object.assign({}, DEFAULTS, options || {});
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

    /* ---------------- Sharks ---------------- */
    function Sharks() {
      let sharks = [];
      const smp = { s: 0, d: 0, hw: 0, e: 0, side: 1, i: 0 };

      function makeLane(sh, k, start) {
        const r = mulberry32(ihash(o.seed * 31 + 7, sh.id, k + 1000));
        const th = ((o.heading + (r() * 2 - 1) * o.spread) * Math.PI) / 180;
        const L = { k, start };
        L.dx = Math.cos(th); L.dy = Math.sin(th); L.px = -L.dy; L.py = L.dx;
        L.cx = o.width * (0.2 + 0.6 * r()); L.cy = o.height * (0.2 + 0.6 * r());
        L.mA = sh.Lb * (0.12 + 0.22 * r()); L.mk = TAU / (sh.Lb * (3 + 3 * r())); L.mp = r() * TAU;
        let t0 = -Infinity, t1 = Infinity;
        const m = sh.margin;
        for (const [c, d, W] of [[L.cx, L.dx, o.width], [L.cy, L.dy, o.height]]) {
          if (Math.abs(d) < 1e-9) continue;
          let a = (-m - c) / d, b = (W + m - c) / d;
          if (a > b) { const tmp = a; a = b; b = tmp; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        }
        L.t0 = t0; L.t1 = t1;
        L.len = t1 - t0 + sh.Lb + sh.Lb * 1.2 * r();
        sh.lanes[k] = L;
        return L;
      }
      function laneAt(sh, U) {
        const Ls = sh.lanes;
        if (!Ls.length) makeLane(sh, 0, 0);
        let k = Math.min(sh.k, Ls.length - 1);
        while (k > 0 && U < Ls[k].start) k--;
        while (U >= Ls[k].start + Ls[k].len) { if (k + 1 >= Ls.length) makeLane(sh, k + 1, Ls[k].start + Ls[k].len); k++; }
        sh.k = k;
        return Ls[k];
      }
      function build() {
        sharks = [];
        const m = Math.min(o.width, o.height);
        const list = o.species && o.species.length ? o.species : DEFAULTS.species;
        for (let i = 0; i < o.count; i++) {
          const r = mulberry32(ihash(o.seed, i, 99));
          const depth = o.count === 1 ? 0.8 : clamp(0.15 + 0.85 * ((i + r() * 0.6) / o.count), 0, 1);
          const sp = SPECIES[list[i % list.length]] || SPECIES.grey;
          const Lb = o.size * (0.3 + 0.24 * depth) * m, W = Lb * sp.width, n = o.spinePoints;
          const sh = {
            id: i, sp, depth, Lb, W, n, vel: o.speed * m * 0.07 * (0.75 + 0.5 * r()),
            margin: W * 2.6 + Lb * 0.5 + cw * 2,
            pts: new Float32Array(n * 2), arc: new Float32Array(n), seg: new Float32Array(n),
            ux: new Float32Array(n), uy: new Float32Array(n), total: 1, lanes: [], k: 0, uHead: 0, U: 0,
          };
          const first = makeLane(sh, 0, 0);
          sh.offset = (first.t1 - first.t0) * (0.3 + 0.4 * r());
          sharks.push(sh);
        }
        sharks.sort((a, b) => a.depth - b.depth);
      }
      function resetLanes() { for (const sh of sharks) { sh.lanes = []; sh.k = 0; } }
      function pose(sh, t) {
        const U = sh.offset + sh.vel * t, L = laneAt(sh, U);
        sh.U = U;
        const n = sh.n, ds = sh.Lb / (n - 1), uHead = L.t0 + (U - L.start);
        sh.uHead = uHead;
        const phase = (U / sh.Lb) * TAU * 0.9, P = sh.pts;
        for (let i = 0; i < n; i++) {
          const u = uHead - i * ds, arg = u * L.mk + L.mp;
          const m = L.mA * Math.sin(arg), dm = L.mA * L.mk * Math.cos(arg);
          let tx = L.dx + L.px * dm, ty = L.dy + L.py * dm;
          const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          const k = i / (n - 1);
          const w = sh.Lb * (0.012 + 0.085 * k * k) * Math.sin(phase - k * TAU * 0.85);
          P[i * 2] = L.cx + L.dx * u + L.px * m - ty * w;
          P[i * 2 + 1] = L.cy + L.dy * u + L.py * m + tx * w;
        }
        let acc = 0;
        sh.minX = sh.maxX = P[0]; sh.minY = sh.maxY = P[1];
        for (let i = 0; i < n; i++) {
          const x = P[i * 2], y = P[i * 2 + 1];
          if (x < sh.minX) sh.minX = x; if (x > sh.maxX) sh.maxX = x;
          if (y < sh.minY) sh.minY = y; if (y > sh.maxY) sh.maxY = y;
          sh.arc[i] = acc;
          if (i < n - 1) {
            const dx = P[i * 2 + 2] - x, dy = P[i * 2 + 3] - y, L2 = Math.hypot(dx, dy) || 1e-6;
            sh.seg[i] = L2; sh.ux[i] = dx / L2; sh.uy[i] = dy / L2; acc += L2;
          }
        }
        sh.total = acc || 1;
      }
      function sample(sh, x, y) {
        const P = sh.pts, n = sh.n;
        let best = 1e18, bi = 0, bh = 0, side = 1;
        for (let i = 0; i < n - 1; i++) {
          const ax = P[i * 2], ay = P[i * 2 + 1], dx = P[i * 2 + 2] - ax, dy = P[i * 2 + 3] - ay;
          const L2 = dx * dx + dy * dy || 1;
          let h = ((x - ax) * dx + (y - ay) * dy) / L2;
          h = h < 0 ? 0 : h > 1 ? 1 : h;
          const qx = ax + dx * h - x, qy = ay + dy * h - y, d2 = qx * qx + qy * qy;
          if (d2 < best) { best = d2; bi = i; bh = h; side = dx * (y - ay) - dy * (x - ax) > 0 ? 1 : -1; }
        }
        const s = (sh.arc[bi] + bh * sh.seg[bi]) / sh.total, d = Math.sqrt(best), hw = halfWidth(sh.sp, s, sh.W);
        smp.s = s; smp.d = d; smp.hw = hw; smp.e = d / (hw || 1); smp.side = side; smp.i = bi;
        return d < hw;
      }
      function pathXY(L, u, out) {
        const m = L.mA * Math.sin(u * L.mk + L.mp);
        out[0] = L.cx + L.dx * u + L.px * m; out[1] = L.cy + L.dy * u + L.py * m;
      }
      function frame(t) {
        for (const sh of sharks) pose(sh, t);
        const ox = [-0.3 * cw, 0.3 * cw, -0.3 * cw, 0.3 * cw], oy = [-0.3 * ch, -0.3 * ch, 0.3 * ch, 0.3 * ch];
        const reach = Math.max(cw, ch);
        for (let k = 0; k < sharks.length; k++) {
          const sh = sharks[k], sp = sh.sp, pad = sh.W * 2.6 + reach, v = 0.6 + 0.4 * sh.depth;
          const c0 = Math.max(0, Math.floor((sh.minX - pad) / cw)), c1 = Math.min(cols - 1, Math.floor((sh.maxX + pad) / cw));
          const r0 = Math.max(0, Math.floor((sh.minY - pad) / ch)), r1 = Math.min(rows - 1, Math.floor((sh.maxY + pad) / ch));
          for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            const xc = c * cw + cw / 2, yc = r * ch + ch / 2;
            const inC = sample(sh, xc, yc);
            if (!inC && smp.d > smp.hw + reach) continue;
            const s = smp.s, e = smp.e, side = smp.side, si = smp.i, d = smp.d;
            let cnt = inC ? 1 : 0;
            for (let q = 0; q < 4; q++) if (sample(sh, xc + ox[q], yc + oy[q])) cnt++;
            if (!cnt) continue;
            const idx = r * cols + c;
            if (cnt >= 3 && inC) {
              const nx = -sh.uy[si] * side, ny = sh.ux[si] * side;
              let val = 0.6 - e * e * 0.38 + (nx * LX + ny * LY) * e * 0.3, kd = BODY;
              if (d > profile(sp.prof, s) * sh.W * 1.02) val *= 0.8;
              if (s > sp.dorsal[0] && s < sp.dorsal[1] && e < 0.32) { kd = HIGH; val = 1; }
              else if (s > sp.second[0] && s < sp.second[1] && e < 0.3) val = Math.max(val, 0.85);
              else if (s > sp.eye[0] && s < sp.eye[1] && e > sp.eye[2] && e < sp.eye[3]) { kd = MARK; val = 0; }
              else if (s > sp.gills[0] && s < sp.gills[1] && e > 0.55) {
                if (Math.floor(((s - sp.gills[0]) / (sp.gills[1] - sp.gills[0])) * 5) % 2 === 0) { kd = DARK; val *= 0.5; }
              }
              if (s > 0.85) val *= 0.85;
              put(idx, kd, clamp(val, 0, 1), v, sp.tint);
            } else {
              if (kind[idx] >= BODY) continue;
              put(idx, EDGE, cnt / 5, v, sp.tint);
            }
          }
        }
        if (o.glow) for (const sh of sharks) {
          const pad = sh.W * 2.6 + reach, gx = cw * (1.2 + 2.2 * sh.depth), gy = ch * (0.8 + 1.4 * sh.depth);
          const c0 = Math.max(0, Math.floor((sh.minX + gx - pad) / cw)), c1 = Math.min(cols - 1, Math.floor((sh.maxX + gx + pad) / cw));
          const r0 = Math.max(0, Math.floor((sh.minY + gy - pad) / ch)), r1 = Math.min(rows - 1, Math.floor((sh.maxY + gy + pad) / ch));
          for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            const idx = r * cols + c;
            if (kind[idx] || !sample(sh, c * cw + cw / 2 - gx, r * ch + ch / 2 - gy)) continue;
            putGlow(idx, ((1 - smp.e) * 0.8 + 0.2) * (0.5 + 0.5 * sh.depth), TEAL);
          }
        }
        if (o.trails) {
          const gap = ch * 1.25, K = 26, tmp = [0, 0];
          for (const sh of sharks) for (let back = 0; back < 2; back++) {
            const L = sh.lanes[sh.k - back];
            if (!L) continue;
            const uTail = L.t0 + (sh.U - L.start) - sh.Lb, j0 = Math.floor(uTail / gap);
            for (let j = 0; j < K; j++) {
              const wi = j0 - j, u = wi * gap, age = (uTail - u) / (K * gap);
              if (age < 0 || u < L.t0) continue;
              for (let q = 0; q < 2; q++) {
                const h = ihash(wi + 50000, sh.id * 131 + q, L.k * 7 + o.seed);
                if (h / 4294967296 < (q ? 0.65 : 0.3)) continue;
                pathXY(L, u, tmp);
                const lat = (((h >>> 8) % 1000) / 1000 - 0.5) * sh.W * (1.6 + age * 5);
                const c = Math.floor((tmp[0] + L.px * lat) / cw), r = Math.floor((tmp[1] + L.py * lat) / ch);
                if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
                putDash(r * cols + c, 0.85 * Math.pow(1 - age, 1.4) * (0.5 + 0.5 * sh.depth));
              }
            }
          }
        }
      }
      return { build, frame, resetLanes };
    }

    /* ---------------- Waves (side view) ---------------- */
    function Waves() {
      let comps = [], sx, sC, crest, slope;
      const WATER = [0.62, 0.86, 1.08], FOAM = [0.95, 0.98, 1.03];
      function build() {
        const r = mulberry32(ihash(o.seed, 21, 5));
        comps = [];
        for (let i = 0; i < 5; i++) {
          const wl = o.width * (0.35 + 0.8 * r()) / (1 + i * 0.55);
          const c = o.width * 0.07 * (0.7 + 0.6 * r()) * (1 + i * 0.15);
          comps.push({ k: TAU / wl, w: (TAU / wl) * c, p: r() * TAU, A: o.height * 0.06 * o.size / (1 + i * 0.65) * (0.7 + 0.6 * r()), sharp: 1.6 + 2 * r() });
        }
        sx = new Float32Array((cols + 1) * 3); sC = new Float32Array(cols); crest = new Float32Array(cols); slope = new Float32Array(cols);
      }
      function surf(x, t, dir) {
        let y = 0, pk = 0, A = 0;
        for (const q of comps) {
          const p = Math.pow(0.5 + 0.5 * Math.sin(q.k * x - dir * q.w * t + q.p), q.sharp);
          y += q.A * (p * 2 - 0.6); pk += q.A * p; A += q.A;
        }
        surf.pk = pk / A;
        return o.height * 0.42 - y;
      }
      function frame(t) {
        const dir = Math.cos((o.heading * Math.PI) / 180) >= -1e-6 ? 1 : -1;
        const bandH = o.height * 0.3 * (0.6 + 0.4 * o.size);
        for (let c = 0; c < cols; c++) {
          const x = c * cw;
          sx[c * 3] = surf(x + cw * 0.2, t, dir);
          sx[c * 3 + 2] = surf(x + cw * 0.8, t, dir);
          sC[c] = surf(x + cw * 0.5, t, dir); crest[c] = surf.pk;
          slope[c] = (sx[c * 3 + 2] - sx[c * 3]) / (cw * 0.6);
        }
        for (let c = 0; c < cols; c++) {
          const yL = sx[c * 3], yR = sx[c * 3 + 2], yS = sC[c], pk = crest[c];
          for (let r = 0; r < rows; r++) {
            const idx = r * cols + c, yc = r * ch + ch / 2, yt = yc - 0.3 * ch, yb = yc + 0.3 * ch;
            const inC = yc > yS;
            const cnt = (inC ? 1 : 0) + (yt > yL) + (yb > yL) + (yt > yR) + (yb > yR);
            const d = yc - yS;
            if (cnt === 0) {
              if (o.trails && -d < ch * 3.5 && pk > 0.66) {
                const f = rnd3(c, r, Math.floor(t * 5 + c * 0.37));
                if (f < (pk - 0.66) * 2.2) putDash(idx, 0.4 + 0.5 * (1 + d / (ch * 3.5)));
              }
              continue;
            }
            if (cnt >= 3 && inC) {
              if (d > bandH) {
                if (o.glow) {
                  const I = clamp(1 - (d - bandH) / (bandH * 1.4), 0, 1) * (0.35 + 0.65 * rnd3(c, r, Math.floor(t * 0.8 + rnd3(c, r, 1) * 5)));
                  if (I > 0.08) putGlow(idx, I * 0.9, TEAL);
                }
                continue;
              }
              const p = (d - 0.55 * bandH) / (0.45 * bandH);
              if (p > 0 && rnd3(c, r, 9) < p) { put(idx, EDGE, 0.35 + 0.4 * (1 - p), 0.85, WATER); continue; }
              let val = 0.8 - (d / bandH) * 0.6 + clamp(-slope[c], -1, 1) * 0.18;
              if (d < ch * 1.2 && pk > 0.6) { put(idx, HIGH, 1, 1, FOAM); continue; }
              if (d < ch * 2.4 && pk > 0.72) val = Math.max(val, 0.88);
              put(idx, BODY, clamp(val, 0, 1), 0.95, WATER);
            } else put(idx, EDGE, cnt / 5, 1, pk > 0.6 ? FOAM : WATER);
          }
        }
      }
      return { build, frame };
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
        const lines = String(isText ? o.text : 'Drop an image\nor a video').split('\n');
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
      function frame(t) {
        if (!octx) return;
        const src = isText || !o.source ? textCanvas : o.source;
        const iw = src.videoWidth || src.naturalWidth || src.width, ih = src.videoHeight || src.naturalHeight || src.height;
        const isVideo = !!src.videoWidth;
        if (!iw || !ih) return;
        if (src !== lastSrc || isVideo) {
          octx.fillStyle = '#000'; octx.fillRect(0, 0, sw, sh);
          if (isText) {
            const sc = Math.max(sw / iw, sh / ih);
            octx.drawImage(src, (sw - iw * sc) / 2, (sh - ih * sc) / 2, iw * sc, ih * sc);
          } else {
            // Cover in display pixels, then map to the cell buffer: cells are not square, so this keeps the picture's proportions
            const sc = Math.max(o.width / iw, o.height / ih) * o.size, dw = iw * sc * sw / o.width, dh = ih * sc * sh / o.height;
            octx.drawImage(src, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
          }
          lastSrc = src;
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

        const H = o.height, Wd = o.width, S = o.size, du = cw / Wd, dv = ch / H, side = -(o.agLight || -1);
        for (let c = 0; c < cols; c++) {
          const u = (c + 0.5) * du;
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
          const y = (r + 0.5) * ch, u = (c + 0.5) * du, v = y / H;

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
            const R = Math.min(Wd, H) * 0.045, ds = Math.hypot(u * Wd - Wd * o.agSunX, y - H * o.agSunY);
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
            const c = Math.floor((bx - k * 0.01) / du), r = Math.floor((by + k * 0.01) / dv);
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
          const c = Math.floor(fx / du), r = Math.floor(fy / dv);
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          putChar(r * cols + c, EDGE, 1, 1.5, P.firefly, '*');
        }
      }
      return self;
    }

    const FACTORY = { alpenglow: Alpenglow, sharks: Sharks, waves: Waves, landscape: Landscape, image: () => Bitmap(false), text: () => Bitmap(true) };
    function useScene() { scene = (FACTORY[o.scene] || Sharks)(); scene.build(); }

    /* ---------------- Draw (pixel-buffer renderer: fast enough for small cells) ---------------- */
    let img = null, px32 = null, bufW = 0, bufH = 0, atlas = new Map(), atlasKey = '', gcv = null, gctx = null;
    const colorCache = new Map();
    function parseColor(str) {
      if (colorCache.has(str)) return colorCache.get(str);
      let out = [0, 0, 0, 1];
      const m = /^#([0-9a-f]{6})$/i.exec(str);
      if (m) { const n = parseInt(m[1], 16); out = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
      else {
        const k = /rgba?\(([^)]+)\)/.exec(str);
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
      for (let idx = 0; idx < kind.length; idx++) {
        if (kind[idx]) continue;
        const I = glow[idx], a = dash[idx];
        if (!(I > 0) && !(a > 0.02)) continue;
        const c = idx % cols, r = (idx / cols) | 0;
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
        const x0 = Math.round(c * cw), x1 = Math.round((c + 1) * cw), y0 = Math.round(r * ch), y1 = Math.round((r + 1) * ch);
        const tr = TR[idx], tg = TG[idx], tb = TB[idx], v = dim[idx], s = shade[idx];
        const key = ihash(c, r, 17), slot = Math.floor(t * o.flicker + (key % 997) / 97);
        const isAcc = rnd3(key, slot, 7) < o.glitch, pick = ihash(key, slot, 2);
        let code = chrO[idx];
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
    const cpsCache = new Map();
    function cps(str) { let a = cpsCache.get(str); if (!a) { a = Array.from(String(str)).map((ch2) => ch2.codePointAt(0)); if (!a.length) a = [64]; cpsCache.set(str, a); } return a; }
    function refresh() { atlasKey = ''; }


    const REBUILD = ['scene', 'seed', 'count', 'species', 'size', 'speed', 'width', 'height', 'cols', 'cellAspect', 'spinePoints', 'source', 'text', 'textFont'];
    function set(p) {
      Object.assign(o, p);
      if ('width' in p || 'height' in p || 'cols' in p || 'cellAspect' in p) layout();
      if ('scene' in p) useScene();
      else if (REBUILD.some((k) => k in p)) scene.build();
      else if (('heading' in p || 'spread' in p) && scene.resetLanes) scene.resetLanes();
    }

    layout();
    useScene();
    return { render, set, refresh, options: o, get grid() { return { cols, rows, cw, ch }; } };
  }

  return { create, SPECIES, DEFAULTS, SCENES: ['sharks', 'waves', 'landscape', 'alpenglow', 'image', 'text'] };
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
  const PRESETS = {
    'alpenglow': { name: 'Alpenglow', config: {} },
    'golden-hour': { name: 'Golden hour', config: { agDaylight: 0.38, agGlow: 0.2, agFireflies: 8, agClouds: 0.8 } },
    'alpine-day': { name: 'Alpine day', config: { agDaylight: 1, agBirds: 7 } },
    'day-cycle': { name: 'Day cycle', config: { agCycle: true, agCycleSpeed: 1.5 } },
    'fine-grain': { name: 'Fine grain', config: { cols: 300, cellAspect: 1.4, inkAuto: false, ink: 0.3 } },
    'sharks': { name: 'Sharks', config: { scene: 'sharks', format: '3:4', cols: 56 } },
    'night-ocean': { name: 'Night ocean', config: { scene: 'waves', cols: 96, size: 1.3 } },
    'type': { name: 'Type', config: { scene: 'text', text: 'MAILLE', cols: 120 } },
    'moo': { name: 'Moo', config: { scene: 'image', src: 'img/cow.jpg', cols: 160, threshold: 0.08 } },
    'alpine-cow': { name: 'Alpine cow', config: { scene: 'image', src: 'img/alpine-cow.jpg', cols: 160, threshold: 0.08 } },
    'meadow': { name: 'Meadow', config: { scene: 'image', src: 'img/meadow.jpg', cols: 180, threshold: 0.06 } },
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
    const q = FONT_FAMILIES[fam];
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

  const Maille = Object.assign({}, AF, { configDefaults, resolve, compact, toEngine, PRESETS, ensureFont, b64, loadSrc: (src) => loadSrc(src).p, version: '1.0.0' });
  root.Maille = Maille;

  if (typeof window === 'undefined' || !window.customElements || customElements.get('maille-scene')) return;

  class MailleScene extends HTMLElement {
    static get observedAttributes() { return ['config', 'preset', 'speed', 'paused', 'motion']; }
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
      this._fit();
      this._loop();
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf); this._raf = 0;
      this._ro && this._ro.disconnect(); this._io && this._io.disconnect();
      document.removeEventListener('visibilitychange', this._onVis);
    }
    attributeChangedCallback() { if (this.isConnected) { this._apply(); this._loop(); } }

    // --- public API ---
    get config() { return clone(this._cfg); }
    set config(v) { this._override = v; this._apply(); }
    set(partial) { this._override = Object.assign({}, this._override || this._attrConfig(), partial); this._apply(); }
    seek(t) { this._t = +t || 0; this._draw(); }
    play() { this.removeAttribute('paused'); }
    pause() { this.setAttribute('paused', ''); }
    get engine() { return this._engine; }

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
      const sp = this.getAttribute('speed');
      if (sp != null && sp !== '') this._cfg.speed = parseFloat(sp);
      const opts = toEngine(this._cfg);
      opts.cols = this._effCols();
      const want = this._cfg.scene === 'image' && this._cfg.src ? this._cfg.src : '';
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
      if (!this._engine) this._engine = AF.create(Object.assign({ width: Math.max(2, this._cv.width), height: Math.max(2, this._cv.height) }, opts));
      else this._engine.set(opts);
      ensureFont(this._cfg.font).then(() => { this._engine.refresh(); this._draw(); });
      this._draw();
    }
    _fit() {
      const r = this.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (this._cv.width !== w || this._cv.height !== h) {
        this._cv.width = w; this._cv.height = h;
        if (this._engine) this._engine.set({ width: w, height: h, cols: this._effCols() });
        this._draw();
      }
    }
    // Keep cells at least ~6 device px wide so small embeds stay legible
    _effCols() { const c = this._cfg ? this._cfg.cols : 200; return Math.max(16, Math.min(c, Math.floor(Math.max(this._cv.width, 96) / 6))); }
    _animating() {
      const reduced = this._reduced && this._reduced.matches && this.getAttribute('motion') !== 'always';
      return this.isConnected && this._visible && !document.hidden && !this.hasAttribute('paused') && !reduced;
    }
    _loop() { if (this._animating() && !this._raf) { this._last = performance.now(); this._raf = requestAnimationFrame(this._tick); } }
    _tick(now) {
      this._raf = 0;
      if (!this._animating()) return;
      this._t += Math.min(0.05, (now - this._last) / 1000) * (this._cfg ? this._cfg.speed : 1);
      this._last = now;
      this._draw();
      this._raf = requestAnimationFrame(this._tick);
    }
    _draw() {
      if (this._pending) { this._ctx.clearRect(0, 0, this._cv.width, this._cv.height); return; }
      if (this._engine && this._cv.width > 2) this._engine.render(this._ctx, this._t);
    }
  }
  customElements.define('maille-scene', MailleScene);
})();
