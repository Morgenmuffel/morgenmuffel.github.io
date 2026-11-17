/*
 * The valley: a small 3D landscape drawn like a flat illustration with ink outlines.
 *
 *   <canvas class="valley" data-valley="day|night"></canvas>
 *   <canvas class="valley" data-valley="day" data-pinned data-text="#some-heading"></canvas>
 *
 * How the look is made:
 *  - Every surface carries two colours. The ground and the mountains blend between them; everything smaller
 *    (trees, rocks, the buildings) is painted in flat tones: a light one where it faces the light, a middle
 *    one, and one shade.
 *  - Shade is a flat shape, not a gradient, and cast shadows land as the same flat tone with no outline.
 *    Only the ground keeps a soft falloff.
 *  - Rocks are built from flat panels, so they take light, shade and outline plane by plane.
 *  - By day the sun sits on the horizon: a ball painted in the sky (no outline) with short brush arcs close
 *    around it. Gold is kept for the sun, a narrow path of glints on the sea straight under it, and a touch
 *    on the side of whatever faces it; the land, the sky and the clouds stay blue and white.
 *  - The headline stands on the grass as a sign. Its shadow is worked out on its own, from a light standing high
 *    behind it, so it falls just in front of the words instead of far across the meadow.
 *  - At the water's edge the sea runs up over the land now and then, so the coastline comes and goes.
 *  - Distance fades everything towards the horizon colour.
 *  - A second, invisible drawing of the scene records object ids, surface direction and distance; a
 *    final pass draws a thin line wherever those jump (silhouettes, creases, the snow line).
 *  - data-text names a heading on the page. Its words are set up as a sign standing in the meadow, so
 *    trees in front of it cover parts of it and slide across it as the camera moves.
 * The sea moves (wave lines, foam at the shore, glints); the camera drifts a few degrees with the mouse.
 */
import * as THREE from "./vendor/three.module.min.js";

THREE.ColorManagement.enabled = false; // colours are written exactly as the hex values below

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const C = {
  paper: "#EEF0F4", white: "#FFFFFF", ink: "#050505",
  mist: "#DCE4FD", pale: "#B9C6F5", sky: "#8AA4FF", blue: "#5F86FF", deep: "#2A56EB", navy: "#16276B", night: "#0A1233",
  gold: "#C49A09", sun: "#E6C046", glow: "#F5D75E", cream: "#FBEFC6", red: "#D4573B", rust: "#A9402A",
};
/* Pairs are [top or far colour, bottom or near colour]. */
const THEMES = {
  day: { // sunset: a glowing horizon over land that is already in blue dusk
    zenith: "#AFC0FA", mid: C.mist, horizon: "#EEF0F6", fog: "#E6EAF7", line: C.night, shade: C.navy,
    sunset: 1, sunCol: C.glow, sunDeep: C.gold, glint: C.glow, glintK: 1.25, blotch: 0, fogK: 0.0018, light: [-0.7, 0.32, -0.62],
    meadow: ["#4D74F3", "#2448DC"], sand: C.sky, flowers: C.sun, path: C.mist,
    rock: [C.sky, C.blue], snow: [C.white, C.mist], hill: [C.deep, C.navy],
    sea: C.navy, wave: C.pale, foam: C.white, glitter: C.glow, glitterK: 1,
    wall: [C.sky, C.blue], roof: [C.red, C.rust], trim: [C.white, C.mist], pane: [C.navy, C.navy], paneLit: 1,
    stone: [C.white, C.pale], wood: ["#A9B1CE", "#737DA3"],
    crowns: [[C.sky, C.blue], ["#B4C3FA", C.sky], [C.pale, C.sky], [C.blue, C.deep]], spruce: [C.sky, C.deep],
    cloud: [C.white, C.mist], stars: null, text: C.glow,
    view: { pos: [-4, 10, 66], tgt: [8, 13, -30], fov: 34 },
  },
  night: { // a flat black sky: the stars and the snow are the only light things in it (the moon is on the page)
    zenith: C.ink, mid: C.ink, horizon: C.ink, fog: C.navy, line: C.ink, shade: "#02040C",
    sunset: 0, sunCol: C.pale, sunDeep: C.pale, glint: C.pale, glintK: 0, blotch: 0, fogK: 0.0007, light: [-0.75, 0.55, 0.2],
    meadow: [C.navy, C.night], sand: C.deep, flowers: C.sun, path: "#2F4FC9",
    rock: [C.blue, C.deep], snow: [C.white, C.mist], hill: [C.navy, C.night],
    sea: C.deep, wave: C.sky, foam: C.pale, glitter: C.pale, glitterK: 0,
    wall: [C.blue, C.deep], roof: [C.red, C.rust], trim: [C.white, C.pale], pane: [C.sun, C.sun], paneLit: 0,
    stone: [C.white, C.pale], wood: ["#4F5A86", "#2C355C"],
    crowns: [[C.deep, C.navy], [C.blue, C.deep], [C.deep, C.navy], [C.deep, C.navy]], spruce: [C.deep, C.navy],
    cloud: null, stars: [C.paper, C.paper], text: null, milky: C.pale,
    // shiftFrom: on screens wider than this the picture slides right, keeping the range a fixed distance from the right edge
    view: { pos: [-44, 7, 38], tgt: [54, 18, -47], fov: 44, shiftFrom: 1280 },
  },
};
const PAIRS = ["meadow", "rock", "hill", "wall", "roof", "trim", "pane", "stone", "wood", "spruce", "snow", "cloud", "stars"];

/* ---------- small maths ---------- */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const rngFrom = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lineDist = (line, x, z) => {
  let best = 1e9;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
};
/* A smooth curve through a few points, returned as n points. */
const curve = (P, n) => Array.from({ length: n }, (_, k) => {
  const t = k / (n - 1) * (P.length - 1), i = Math.min(P.length - 2, Math.floor(t)), f = t - i;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
  return [0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * f + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * f * f + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * f * f * f));
});

/* ---------- the land ---------- */
const RIVER = [[-6, 82], [4, 44], [-8, 16], [6, -8], [-4, -28], [-16, -48]];
const riverDist = (x, z) => lineDist(RIVER, x, z);
const HOUSE = [32, -34];
/* The footpath: from the house door, winding down through the meadow to where the viewer stands. */
const PATH_N = 20;
const PATH = curve([[27.5, -27.5], [23, -20], [29, -10], [25, 0], [17, 8], [21, 18], [18, 28], [13, 40], [14, 56]], PATH_N);
function height(x, z) {
  let h = 2.2 + (noise(x * 0.03 + 3, z * 0.03 + 7) - 0.5) * 4.5 + (noise(x * 0.07, z * 0.07) - 0.5) * 1.0;
  h += ss(30, 70, z) * ss(14, 60, Math.abs(x + 2)) * 5;                          // shoulders framing the foreground
  h += 4.5 * Math.exp(-((x - HOUSE[0]) ** 2 + (z - HOUSE[1]) ** 2) / 260);       // knoll under the house
  h += ss(1, 7, x) * ss(16, 26, z) * ss(52, 42, z) * 0.6;                         // the right bank of the stream stands higher
  h += 1.15 * Math.exp(-((x - 11) ** 2 / 40 + (z - 31) ** 2 / 22));                // and a low hill on it, under the end of the headline
  h += ss(45, 130, x) * ss(-40, -150, z) * 16;                                   // foothills on the right
  const shore = -z - (40 + 0.5 * x + 7 * Math.sin(x * 0.06));                    // the coast runs diagonally
  const sea = Math.max(ss(-3, 9, shore) * (1 - ss(22, 58, x)), ss(-228, -256, z));
  h = h * (1 - sea) - 2.5 * sea;
  const r = ss(7, 2.5, riverDist(x, z));                                          // the river is carved below sea level
  return h > -1 ? h * (1 - r) - 1 * r : h;
}
/* The land is drawn as a mesh of square cells, flat between their corners, so on a steep bank the drawn ground
   can sit well away from height(). Small things that must touch the ground ask for the drawn one. */
const LAND = { x0: -204, x1: 224, z0: -264, z1: 84, step: 3.5 };
function ground(x, z) {
  const { x0, z0, step } = LAND, i = Math.floor((x - x0) / step), j = Math.floor((z - z0) / step), u = (x - x0) / step - i, v = (z - z0) / step - j;
  const H = (a, b) => height(x0 + (i + a) * step, z0 + (j + b) * step);
  return u + v <= 1 ? H(0, 0) + (H(1, 0) - H(0, 0)) * u + (H(0, 1) - H(0, 0)) * v : H(1, 1) + (H(0, 1) - H(1, 1)) * (1 - u) + (H(1, 0) - H(1, 1)) * (1 - v);
}
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/* A bed for something that lies on sloping ground: a point of the drawn ground (o), the ground's normal there (n),
   a heading along the ground (a) and the direction across it that faces the viewer (s). at(along, up, front)
   turns a position in the bed into a place in the world. */
function bed(x, z, turn, e = 0.9) {
  const dx = (ground(x + e, z) - ground(x - e, z)) / (2 * e), dz = (ground(x, z + e) - ground(x, z - e)) / (2 * e);
  const n = norm3([-dx, 1, -dz]), h = [Math.cos(turn), 0, Math.sin(turn)], d = h[0] * n[0] + h[2] * n[2];
  const a = norm3([h[0] - n[0] * d, -n[1] * d, h[2] - n[2] * d]);
  let s = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
  if (s[2] < 0) s = s.map((q) => -q);
  const o = [x, ground(x, z), z];
  return { o, n, a, s, at: (u, v, w) => o.map((q, k) => q + a[k] * u + n[k] * v + s[k] * w) };
}
/* ---------- geometry builder: everything static ends up in one mesh ---------- */
class Builder {
  constructor() { this.p = []; this.n = []; this.a = []; this.b = []; this.g = []; this.i = []; this.m = []; this.s = []; this.next = 2; }
  id() { return this.next++; }
  /* A style is how a surface is painted: its two colours, its outline group (id), whether it is shaded (lit),
     how much distance haze it gets, how much gold it catches from the sun, and an optional snow line height. */
  style(pair, o = {}) {
    return { A: pair[0], B: pair[1], id: o.id ?? this.id(), lit: o.lit ?? 1, fog: o.fog ?? 1, glint: o.glint ?? 0, snow: o.snow ?? 0, range: o.range };
  }
  vert(st, p, n, g) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.a.push(st.A[0], st.A[1], st.A[2]); this.b.push(st.B[0], st.B[1], st.B[2]);
    this.g.push(g); this.i.push(st.id); this.m.push(st.lit, st.fog, st.glint); this.s.push(st.snow);
  }
  tri(st, P, N, G, i0, i1, i2) {
    const a = P[i0], b = P[i1], c = P[i2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * fx + fy * fy + fz * fz < 1e-12) return;
    const s = fx * (N[i0][0] + N[i1][0] + N[i2][0]) + fy * (N[i0][1] + N[i1][1] + N[i2][1]) + fz * (N[i0][2] + N[i1][2] + N[i2][2]);
    const order = s < 0 ? [i0, i2, i1] : [i0, i1, i2]; // wind the triangle to agree with its normals
    for (const k of order) this.vert(Array.isArray(st) ? st[k] : st, P[k], N[k], G[k]);
  }
  /* One flat panel (three or four corners) facing away from `inside`. */
  panel(st, pts, inside, g) {
    const [a, b, c, d] = pts;
    const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = d ? [d[0] - b[0], d[1] - b[1], d[2] - b[2]] : [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n);
    if (l < 1e-9) return;
    n = n.map((q) => q / l);
    const out = [0, 1, 2].map((q) => (a[q] + b[q] + c[q]) / 3 - inside[q]);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = n.map((q) => -q);
    const N = pts.map(() => n), G = pts.map(g);
    this.tri(st, pts, N, G, 0, 1, 2); if (d) this.tri(st, pts, N, G, 0, 2, 3);
  }
  /* A rows x cols sheet of points, closed around its columns. */
  grid(st, rows, cols, P, N, G) {
    const at = (i, j) => i * cols + (j % cols);
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols; j++) {
      this.tri(st, P, N, G, at(i, j), at(i, j + 1), at(i + 1, j));
      this.tri(st, P, N, G, at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
    }
  }
  /* A closed sheet from a function; normals come from the neighbouring points, so it is always smooth. */
  surface(st, rows, cols, fn) {
    const P = [], N = [], G = [];
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) P.push(fn(i, j));
    let y0 = 1e9, y1 = -1e9;
    for (const p of P) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    if (st.range) [y0, y1] = st.range;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = P[Math.min(rows - 1, i + 1) * cols + j], b = P[Math.max(0, i - 1) * cols + j];
      const c = P[i * cols + (j + 1) % cols], d = P[i * cols + (j + cols - 1) % cols];
      const ix = a[0] - b[0], iy = a[1] - b[1], iz = a[2] - b[2], jx = c[0] - d[0], jy = c[1] - d[1], jz = c[2] - d[2];
      let nx = iy * jz - iz * jy, ny = iz * jx - ix * jz, nz = ix * jy - iy * jx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) { nx = 0; ny = 1; nz = 0; } else { nx /= l; ny /= l; nz /= l; }
      N.push([nx, ny, nz]); G.push(clamp((P[i * cols + j][1] - y0) / (y1 - y0 || 1), 0, 1));
    }
    this.grid(st, rows, cols, P, N, G);
  }
  /* Spin a profile of [radius, height] points (listed bottom to top) around a vertical axis. */
  revolve(st, profile, segs, x, y, z, s = 1, turn = 0) {
    this.surface(st, profile.length, segs, (i, j) => {
      const a = turn + j / segs * Math.PI * 2, r = Math.max(profile[i][0], 1e-4) * s;
      return [x + Math.cos(a) * r, y + profile[i][1] * s, z + Math.sin(a) * r];
    });
  }
  /* A tapered tube along a path, for trunks. */
  tube(st, pts, radii, segs = 8) {
    const P = [], N = [], G = [];
    let ref = V3(0.3, 0, 1);
    for (let i = 0; i < pts.length; i++) {
      const t = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
      const u = ref.clone().sub(t.clone().multiplyScalar(ref.dot(t))).normalize(), v = t.clone().cross(u);
      ref = u;
      for (let j = 0; j < segs; j++) {
        const a = j / segs * Math.PI * 2, d = u.clone().multiplyScalar(Math.cos(a)).add(v.clone().multiplyScalar(Math.sin(a)));
        const p = pts[i].clone().add(d.clone().multiplyScalar(radii[i]));
        P.push([p.x, p.y, p.z]); N.push([d.x, d.y, d.z]); G.push(i / (pts.length - 1));
      }
    }
    const end = pts[pts.length - 1], tip = end.clone().sub(pts[pts.length - 2]).normalize();
    for (let j = 0; j < segs; j++) { P.push([end.x, end.y, end.z]); N.push([tip.x, tip.y, tip.z]); G.push(1); }
    this.grid(st, pts.length + 1, segs, P, N, G);
  }
  /* A ready-made three.js shape, placed with a matrix. The gradient runs bottom to top of the shape. */
  add(st, geo, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose(); g.applyMatrix4(m);
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    let y0 = 1e9, y1 = -1e9;
    for (let k = 1; k < P.length; k += 3) { y0 = Math.min(y0, P[k]); y1 = Math.max(y1, P[k]); }
    if (st.range) [y0, y1] = st.range;
    for (let k = 0; k < P.length; k += 3) this.vert(st, [P[k], P[k + 1], P[k + 2]], [N[k], N[k + 1], N[k + 2]], clamp((P[k + 1] - y0) / (y1 - y0 || 1), 0, 1));
    g.dispose();
  }
  get count() { return this.p.length / 3; }
  /* Press what was built since vertex `from` into the drawn ground: lower it until its lowest point, measured from
     the ground under each point, sits `depth` below the surface. */
  sink(from, depth) {
    let off = Infinity;
    for (let k = from * 3; k < this.p.length; k += 3) off = Math.min(off, this.p[k + 1] - ground(this.p[k], this.p[k + 2]));
    for (let k = from * 3 + 1; k < this.p.length; k += 3) this.p[k] -= off + depth;
  }
  build() {
    const g = new THREE.BufferGeometry(), f = (arr, n) => new THREE.Float32BufferAttribute(arr, n);
    g.setAttribute("position", f(this.p, 3)); g.setAttribute("normal", f(this.n, 3));
    g.setAttribute("aA", f(this.a, 3)); g.setAttribute("aB", f(this.b, 3)); g.setAttribute("aG", f(this.g, 1));
    g.setAttribute("aId", f(this.i, 1)); g.setAttribute("aM", f(this.m, 3)); g.setAttribute("aS", f(this.s, 1));
    return g;
  }
}
const M = (x, y, z, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), V3(sx, sy, sz));

function terrain(B, T) {
  const { x0, x1, z0, z1, step } = LAND;
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step), cols = nx + 1;
  const id = B.id(), meadow = B.style(T.meadow, { id, snow: -1 }), rock = B.style(T.rock, { id, snow: -1 });
  const P = [], N = [], G = [], S = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * step, z = z0 + j * step, y = height(x, z), e = 0.8;
    const dx = (height(x + e, z) - height(x - e, z)) / (2 * e), dz = (height(x, z + e) - height(x, z - e)) / (2 * e), l = Math.hypot(dx, 1, dz);
    P.push([x, y, z]); N.push([-dx / l, 1 / l, -dz / l]);
    const high = y > 12 + noise(x * 0.05, z * 0.05) * 5;
    G.push(high ? 0.25 : ss(70, -90, z)); S.push(high ? rock : meadow);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    if (Math.max(P[a][1], P[b][1], P[c][1], P[d][1]) < -0.5) continue; // under water
    B.tri(S, P, N, G, a, c, b); B.tri(S, P, N, G, b, c, d);
  }
}

/* Rock: ribs rising in steps around a centre, with a flat panel between every two ribs. The steps make
   cliffs and ledges; the top is a blunt slab rather than a point. Returns the middle of the top and the
   outline of the foot (used to break waves around rocks that stand in the sea). */
function crag(B, st, cx, cz, R, h, baseY, seed, o = {}) {
  const rnd = rngFrom(seed), n = o.ribs ?? 11, topR = o.top ?? R * 0.1;
  const steps = [0, 0.13, 0.36, 0.43, 0.63, 0.7, 0.88, 1], width = [1, 0.9, 0.76, 0.6, 0.5, 0.36, 0.24, 0], last = steps.length - 1;
  const lx = (rnd() - 0.5) * R * 0.3, lz = (rnd() - 0.5) * R * 0.3;
  const ribs = Array.from({ length: n }, (_, k) => ({ a: (k + (rnd() - 0.5) * 0.6) / n * Math.PI * 2, r: 0.74 + rnd() * 0.5, q: rnd(), up: o.flat ? 1 : 0.8 + rnd() * 0.2 }));
  const rings = steps.map((s, i) => ribs.map((rib) => {
    const t = i === last ? rib.up : (s + (i ? (rnd() - 0.5) * 0.05 : 0)) * rib.up;
    const f = width[i] * (i && i < last ? 1 + (rnd() - 0.5) * 0.18 : 1);
    const r = topR * (0.85 + 0.3 * rib.q) + Math.max(0, R * rib.r - topR) * f;
    return [cx + lx * t + Math.cos(rib.a) * r, baseY + h * t, cz + lz * t + Math.sin(rib.a) * r];
  }));
  const g = (p) => clamp((p[1] - baseY) / h, 0, 1);
  for (let i = 0; i < last; i++) for (let k = 0; k < n; k++) {
    const a = rings[i][k], b = rings[i][(k + 1) % n], c = rings[i + 1][(k + 1) % n], d = rings[i + 1][k], y = (a[1] + c[1]) / 2, t = (y - baseY) / h;
    B.panel(st, [a, b, c, d], [cx + lx * t, y, cz + lz * t], g);
  }
  const up = ribs.reduce((s, r) => s + r.up, 0) / n, top = [cx + lx * up, baseY + h * up, cz + lz * up];
  for (let k = 0; k < n; k++) B.panel(st, [rings[last][k], rings[last][(k + 1) % n], top], [top[0], top[1] - 9, top[2]], g);
  return { top, foot: rings[0].map((p) => [p[0], p[2]]) };
}

/* ---------- trees ---------- */
/* Leafy trees in four habits: round, tall (poplar), wide (umbrella pine) and bush. */
function leafTree(B, T, x, z, s, pair, rnd, kind = "round") {
  const y = height(x, z) - 0.2, lx = (rnd() - 0.5) * 1.2 * s, lz = (rnd() - 0.5) * 1.2 * s;
  const H = { round: 4.4, tall: 2.4, wide: 5.6, bush: 0 }[kind];
  if (H) B.tube(B.style(T.wood), [V3(x, y, z), V3(x + lx * 0.15, y + H * 0.3 * s, z + lz * 0.15), V3(x + lx * 0.6, y + H * 0.7 * s, z + lz * 0.6), V3(x + lx, y + H * s, z + lz)],
    [0.46 * s, 0.27 * s, 0.21 * s, 0.15 * s], 8);
  const cx = H ? x + lx : x, cz = H ? z + lz : z, cy = y + H * s;
  const span = { round: [-1.2, 4], tall: [-0.5, 7.4], wide: [-0.4, 2.6], bush: [0, 2.7] }[kind];
  const crown = B.style(pair, { range: [cy + span[0] * s, cy + span[1] * s], glint: 0.5 });
  const blob = (ox, oy, oz, r, sy = 0.92, detail = 2) => B.add(crown, new THREE.IcosahedronGeometry(r * s, detail), M(cx + ox * s, cy + oy * s, cz + oz * s, 1, sy, 1, rnd() * 6));
  const lobes = (n, reach, oy, r, sy) => {
    const turn = rnd() * 6.28;
    for (let k = 0; k < n; k++) { const a = turn + k / n * Math.PI * 2 + (rnd() - 0.5) * 0.5; blob(Math.cos(a) * reach, oy + rnd() * 0.5, Math.sin(a) * reach, r + rnd() * 0.3, sy); }
  };
  if (kind === "tall") { blob(0, 2.5, 0, 1.6, 1.9, 3); lobes(3, 0.8, 1.1, 1.0, 1.35); blob(0.15, 5.0, -0.1, 1.15, 1.6); }
  else if (kind === "wide") { blob(0, 0.9, 0, 3.0, 0.4, 3); lobes(5, 2.1, 0.5, 1.45, 0.48); blob(0.2, 1.6, 0, 1.6, 0.45); }
  else if (kind === "bush") { blob(0, 0.95, 0, 1.55, 0.85, 3); lobes(4, 1.15, 0.5, 0.95, 0.82); }
  else { blob(0, 1, 0, 2.15, 0.92, 3); lobes(5, 1.5, 0.45, 1.2, 0.92); blob((rnd() - 0.5) * 0.8, 2.45, (rnd() - 0.5) * 0.8, 1.35); }
}

function spruce(B, T, x, z, s, slim) {
  const y = height(x, z) - 0.2;
  B.tube(B.style(T.wood), [V3(x, y, z), V3(x, y + 1.6 * s, z)], [0.3 * s, 0.22 * s], 7);
  const tiers = slim ? 7 : 5, rise = slim ? 1.35 : 1.5, wide = slim ? 1.75 : 2.5, taper = slim ? 0.2 : 0.42;
  const top = y + (1.1 + tiers * rise + 1.2) * s, st = B.style(T.spruce, { range: [y + s, top], glint: 0.4 });
  for (let k = 0; k < tiers; k++) {
    const yb = (1.1 + k * rise) * s, r = (wide - k * taper) * s, hgt = 2.7 * s;
    B.revolve(st, [[0.12 * s, yb + 0.5 * s], [r * 0.86, yb], [r, yb + 0.14 * s], [r * 0.62, yb + hgt * 0.34], [r * 0.3, yb + hgt * 0.7], [0.02, yb + hgt]], 18, x, y, z, 1, k * 0.7);
  }
}

/* A young tree for the foreground: a leaning stem, a few bare branches and a small flat crown at the end of each. */
function sapling(B, T, x, z, s, rnd) {
  const y = height(x, z) - 0.2, wood = B.style(T.wood);
  const P = (a, b, c) => V3(x + a * s, y + b * s, z + c * s);
  B.tube(wood, [P(0, 0, 0), P(0.28, 1.4, 0.05), P(0.12, 2.9, -0.05), P(-0.32, 4.3, 0), P(-0.5, 5.4, 0.05)], [0.3 * s, 0.24 * s, 0.19 * s, 0.13 * s, 0.08 * s], 8);
  const crown = B.style(T.crowns[1], { range: [y + 2.6 * s, y + 6.8 * s], glint: 0.5 });
  // a branch leaves the stem at [x, y] and ends at [x, y, z]; the last number is the size of its crown
  for (const [ax, ay, bx, by, bz, r] of [[0.2, 2.0, 2.0, 3.3, 0.3, 0.95], [0.12, 2.8, -1.8, 4.0, -0.2, 0.85], [-0.2, 3.7, 1.3, 5.0, -0.3, 0.8], [-0.5, 5.3, -0.75, 5.9, 0.1, 1.05]]) {
    B.tube(wood, [P(ax, ay, 0), P((ax + bx) / 2, (ay + by) / 2 - 0.18, bz / 2), P(bx, by, bz)], [0.12 * s, 0.09 * s, 0.05 * s], 6);
    const side = bx > ax ? 1 : -1;
    B.add(crown, new THREE.IcosahedronGeometry(r * s, 2), M(x + bx * s, y + (by + r * 0.3) * s, z + bz * s, 1, 0.6, 1, rnd() * 6));
    B.add(crown, new THREE.IcosahedronGeometry(r * 0.62 * s, 2), M(x + (bx + side * 0.75 * r) * s, y + (by + r * 0.12) * s, z + (bz + 0.3) * s, 1, 0.58, 1, rnd() * 6));
  }
}

/* A scallop shell lying back on the ground: a fan of ribs in two alternating flat tones, with a wavy rim.
   `F` is the bed it lies in; `lean` is how far it is tipped back from upright. */
function scallop(B, T, F, r, lean) {
  const tones = [0, 1].map((g) => [B.style(T.stone, { lit: 0, glint: 0.3 }), () => g]);
  const ribs = 9, cl = Math.cos(lean), sl = Math.sin(lean);
  // u runs across the fan, v up it, d out of its face (towards the viewer)
  const P = (u, v, d) => F.at(r * u, r * (v * cl + d * sl), r * (d * cl - v * sl));
  const ray = (a, q) => { const R = q * (1.5 - 0.22 * a * a); return P(Math.sin(a) * R, Math.cos(a) * R, 0.34 * Math.sin(Math.PI * Math.min(1, q * 0.92))); };
  const inside = P(0, 0.6, -4), span = 1.12, steps = [0, 0.3, 0.55, 0.78, 1];
  for (let k = 0; k < ribs; k++) {
    const a0 = -span + 2 * span * k / ribs, a1 = -span + 2 * span * (k + 1) / ribs, [st, g] = tones[k % 2];
    for (let i = 0; i < steps.length - 1; i++)
      B.panel(st, i ? [ray(a0, steps[i]), ray(a1, steps[i]), ray(a1, steps[i + 1]), ray(a0, steps[i + 1])] : [ray(a0, 0), ray(a1, steps[1]), ray(a0, steps[1])], inside, g);
    B.panel(st, [ray(a0, 1), ray(a1, 1), ray((a0 + a1) / 2, 1.07)], inside, g);       // the scallop at the end of the rib
  }
  // the hinge: a small bar across the foot of the fan
  B.panel(tones[1][0], [P(-0.42, 0, 0.02), P(0.42, 0, 0.02), P(0.3, 0.3, 0.1), P(-0.3, 0.3, 0.1)], inside, tones[1][1]);
}

/* A conch lying on its back with its opening up: a stepped spire, a knobbed shoulder and a body narrowing into a
   long canal; the opening is a long dark almond on the side turned up and towards the viewer, and beyond it stands
   the flared lip, its rim cut into points. It is painted in flat tones from a light of its own (above, left, in
   front), so its form reads whatever the valley's light is doing. `F` is the bed it lies in: the canal points
   along the bed's heading and the spire back along it. */
function conch(B, T, F, len) {
  const shell = () => B.style(T.stone, { lit: 0, glint: 0.3 });
  const body = shell(), lip = shell(), mouth = B.style([T.stone[1], T.rock[0]], { lit: 0 });
  const cols = 32, R = len * 0.6, rest = 0.42 * R, light = [-0.36, 0.78, 0.5];   // the widest whorl sits a little into the ground
  // [how far along the shell, radius]
  const prof = [[0, 0.015], [0.06, 0.1], [0.085, 0.085], [0.15, 0.2], [0.175, 0.18], [0.25, 0.33], [0.275, 0.3], [0.36, 0.5], [0.43, 0.5], [0.55, 0.39], [0.7, 0.23], [0.85, 0.11], [1, 0.03]];
  const rAt = (t) => { for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) { const q = (t - prof[i - 1][0]) / (prof[i][0] - prof[i - 1][0]); return (prof[i - 1][1] + (prof[i][1] - prof[i - 1][1]) * q) * R; } return 0; };
  const mid = (t) => F.at((t - 0.42) * len, rest, 0);
  const out = (f) => F.n.map((q, k) => q * Math.cos(f) + F.s[k] * Math.sin(f));     // f = 0 points up out of the ground; a quarter turn on, it faces the viewer
  const P = [], N = [], G = [];
  prof.forEach(([t, pr], i) => {
    const lo = prof[Math.max(0, i - 1)], hi = prof[Math.min(prof.length - 1, i + 1)], slope = (hi[1] - lo[1]) * R / ((hi[0] - lo[0]) * len), c = mid(t);
    for (let j = 0; j < cols; j++) {
      const f = j / cols * Math.PI * 2, rad = out(f), n = norm3(rad.map((q, k) => q - F.a[k] * slope));
      const knob = i === 7 ? 1 + 0.1 * Math.pow(Math.max(0, Math.cos(5 * f + 0.6)), 2) : 1;         // the knobs around the shoulder
      P.push(c.map((q, k) => q + rad[k] * pr * R * knob)); N.push(n);
      G.push(clamp(0.5 + (n[0] * light[0] + n[1] * light[1] + n[2] * light[2] - 0.08) * 5, 0, 1));
    }
  });
  B.grid(body, prof.length, cols, P, N, G);
  // the opening: a dark sheet lying just clear of the body, from the shoulder to the tip of the canal
  const t0 = 0.37, t1 = 0.97, f0 = 0.45, rows = 12, across = 5;
  const half = (q) => 0.52 * Math.pow(Math.sin(Math.PI * Math.pow(q, 0.8)), 0.6);
  const skin = (t, f, lift) => { const c = mid(t), d = out(f), r = rAt(t) * lift + 0.015; return c.map((q, k) => q + d[k] * r); };
  const MP = [], MN = [], MG = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= across; j++) {
    const q = i / rows, f = f0 + half(q) * (j / across * 2 - 1);
    MP.push(skin(t0 + (t1 - t0) * q, f, 1.05)); MN.push(out(f)); MG.push(0);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < across; j++) {
    const k = i * (across + 1) + j;
    B.tri(mouth, MP, MN, MG, k, k + 1, k + across + 1); B.tri(mouth, MP, MN, MG, k + 1, k + across + 2, k + across + 1);
  }
  // the lip: a wing rising from the far edge of the opening, leaning away and back towards the spire, its rim cut into points
  const jag = [0, 0.26, 0.04, 0.34, 0.08, 0.36, 0.1, 0.3, 0.06, 0.18, 0], n = jag.length - 1;
  const edge = (k, far) => {
    const q = k / n, f = f0 - half(q), base = skin(t0 + (t1 - t0) * q, f, 1), w = out(f - 0.5);
    const reach = far ? R * (0.3 + jag[k]) * Math.pow(Math.sin(Math.PI * Math.pow(q, 0.7)), 0.5) : 0;
    return base.map((v, c) => v + (w[c] - F.a[c] * 0.5) * reach);
  };
  for (let k = 0; k < n; k++) B.panel(lip, [edge(k, 0), edge(k + 1, 0), edge(k + 1, 1), edge(k, 1)], mid(0.6), () => 1);
}

/* Two shells in a heap on the top of the hill: the conch on the right with its opening up, the scallop tipped back
   in front of its narrow end, and a few pebbles around. Each is laid in the plane of the drawn ground and then
   pressed a little into it. */
function shells(B, T, x, z, rnd) {
  const F = bed(x, z, Math.PI);
  let from = B.count;
  conch(B, T, F, 2.1);
  B.sink(from, 0.14);
  const [sx, , sz] = F.at(1.2, 0, 0.8);
  from = B.count;
  scallop(B, T, bed(sx, sz, 2.95), 0.72, 0.95);
  B.sink(from, 0.05);
  const stone = B.style(T.rock, { glint: 0.3 });
  // [along the heap, towards the viewer, size]
  for (const [u, w, r] of [[-1.5, 0.9, 0.2], [-0.5, 1.6, 0.14], [2.3, 0.2, 0.18], [0.5, 1.9, 0.12], [2.0, 1.3, 0.13]]) {
    const [px, , pz] = F.at(u, 0, w);
    pebble(B, stone, px, pz, r, rnd);
  }
}

/* Settle a solid into the ground: shift it down so its lowest point, measured from the drawn ground under each
   point, sits `sink` below the surface. On a slope that buries the uphill side a little, as it would. */
function settle(P, sink) {
  let off = Infinity;
  for (const q of P) off = Math.min(off, q[1] - ground(q[0], q[2]));
  for (const q of P) q[1] -= off + sink;
  return P;
}
/* A pebble: a squashed stone pressed a little into the ground. */
function pebble(B, st, x, z, r, rnd) {
  const g = new THREE.IcosahedronGeometry(r, 1).toNonIndexed();
  g.applyMatrix4(M(x, 0, z, 1, 0.65, 1.15, rnd() * 6));
  const a = g.attributes.position.array, P = [];
  for (let k = 0; k < a.length; k += 3) P.push([a[k], a[k + 1], a[k + 2]]);
  settle(P, r * 0.3);
  P.forEach((q, i) => { a[i * 3 + 1] = q[1]; });
  g.computeVertexNormals();
  B.add(st, g, new THREE.Matrix4());
}

/* ---------- buildings ---------- */
function house(B, T) {
  const [x, z] = HOUSE, s = 0.9, y = height(x, z) - 0.5;
  const at = (lx, ly, lz, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) => M(x + lx * s, y + ly * s, z + lz * s, sx * s, sy * s, sz * s, ry, rx, rz);
  const box = (st, w, h, d, ...m) => B.add(st, new THREE.BoxGeometry(w, h, d), at(...m));
  const wallR = (ly) => 3.4 - 0.5 * (ly - 0.8) / 14;
  const out = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];
  const trim = () => B.style(T.trim), red = () => B.style(T.roof, { glint: 0.7 }), stone = () => B.style(T.stone);

  B.revolve(stone(), [[4.1, 0], [3.9, 0.8], [0.1, 0.8]], 36, x, y, z, s);                                           // stone foot
  B.revolve(B.style(T.wall, { glint: 0.6 }), [[3.4, 0.8], [2.9, 14.8]], 44, x, y, z, s);                            // the round tower
  for (const ly of [5.6, 10.2]) B.revolve(trim(), [[wallR(ly) + 0.02, ly - 0.12], [wallR(ly) + 0.14, ly - 0.06], [wallR(ly) + 0.14, ly + 0.06], [wallR(ly) + 0.02, ly + 0.12]], 44, x, y, z, s);
  // pointed roof with flared eaves, a spire and a pennant
  B.revolve(red(), [[2.8, 14.9], [4.7, 14.6], [4.75, 14.85], [3.6, 15.9], [2.5, 17.7], [1.5, 19.9], [0.7, 21.9], [0.16, 23.4], [0.02, 23.7]], 44, x, y, z, s);
  B.add(B.style(T.wood, { lit: 0 }), new THREE.CylinderGeometry(0.05, 0.07, 2.6, 6), at(0, 24.6, 0));
  B.add(B.style(T.roof, { lit: 0 }), new THREE.SphereGeometry(0.22, 12, 8), at(0, 25.9, 0));
  box(red(), 1.5, 0.7, 0.05, 0.8, 25.2, 0);

  // windows: frame, dark pane, glazing bars, sill
  const win = (a, ly, w = 1.05, h = 1.6) => {
    const [fx, fz] = out(a, wallR(ly) - 0.05), [px, pz] = out(a, wallR(ly) + 0.03), [bx, bz] = out(a, wallR(ly) + 0.1);
    box(trim(), w + 0.34, h + 0.34, 0.3, fx, ly, fz, 1, 1, 1, a);
    box(B.style(T.pane, { lit: T.paneLit }), w, h, 0.26, px, ly, pz, 1, 1, 1, a);
    const bars = trim();
    box(bars, 0.09, h, 0.16, bx, ly, bz, 1, 1, 1, a); box(bars, w, 0.09, 0.16, bx, ly + 0.1, bz, 1, 1, 1, a);
    box(trim(), w + 0.6, 0.14, 0.5, fx, ly - h / 2 - 0.22, fz, 1, 1, 1, a);
  };
  for (const a of [-2.15, -1.25, 0.25, 1.15]) win(a, 3.5);
  for (const a of [-1.7, -0.75, 0.7]) win(a, 7.9);
  for (const a of [-2.15, -1.25, -0.3, 0.25, 1.15]) win(a, 12.3, 0.9, 1.4);

  // front door, steps and a small veranda
  const da = -0.6, [dx, dz] = out(da, 1), side = [Math.cos(da), -Math.sin(da)];
  box(trim(), 1.9, 3.1, 0.3, dx * (wallR(2) - 0.02), 2.35, dz * (wallR(2) - 0.02), 1, 1, 1, da);
  box(red(), 1.45, 2.7, 0.3, dx * (wallR(2) + 0.06), 2.2, dz * (wallR(2) + 0.06), 1, 1, 1, da);
  box(stone(), 4.4, 0.36, 3, dx * 4.7, 0.62, dz * 4.7, 1, 1, 1, da);
  for (let k = 0; k < 3; k++) box(stone(), 2.2, 0.26, 0.7, dx * (6.5 + k * 0.6), 0.5 - k * 0.24, dz * (6.5 + k * 0.6), 1, 1, 1, da);
  for (const e of [-1.95, 1.95]) {
    B.add(trim(), new THREE.CylinderGeometry(0.11, 0.13, 3.3, 8), at(dx * 5.9 + side[0] * e, 2.45, dz * 5.9 + side[1] * e));
    box(trim(), 0.1, 0.1, 2.4, dx * 4.7 + side[0] * e, 1.75, dz * 4.7 + side[1] * e, 1, 1, 1, da);
  }
  box(red(), 4.9, 0.22, 3.5, dx * 4.6, 4.35, dz * 4.6, 1, 1, 1, da, 0.2);
  box(trim(), 4.5, 0.16, 0.16, dx * 5.95, 3.95, dz * 5.95, 1, 1, 1, da);

  // balcony on the upper floor
  const ba = 0.7, [bx, bz] = out(ba, 1), bs = [Math.cos(ba), -Math.sin(ba)], br = wallR(7);
  box(trim(), 2.6, 0.18, 1.3, bx * (br + 0.55), 6.75, bz * (br + 0.55), 1, 1, 1, ba);
  box(trim(), 2.6, 0.1, 0.1, bx * (br + 1.15), 7.75, bz * (br + 1.15), 1, 1, 1, ba);
  for (const e of [-1.25, -0.62, 0, 0.62, 1.25]) box(trim(), 0.08, 1, 0.08, bx * (br + 1.15) + bs[0] * e, 7.25, bz * (br + 1.15) + bs[1] * e);

  // stovepipe
  B.add(stone(), new THREE.CylinderGeometry(0.3, 0.34, 2.9, 12), at(-1.9, 18.3, 0.9));
  B.add(stone(), new THREE.ConeGeometry(0.6, 0.5, 12), at(-1.9, 20, 0.9));
}

/* Stands on the flat top of its rock: a low stone base, the tower, a railed gallery and the dome. */
function observatory(B, T, p) {
  const s = 1.3, [x, y, z] = p;
  const white = (o) => B.style(T.trim, { glint: 0.6, ...o });
  B.revolve(B.style(T.stone), [[3.9, -0.6], [3.7, 0.5], [0.1, 0.5]], 30, x, y, z, s);                            // stone base
  B.revolve(white(), [[2.9, 0.5], [2.35, 11]], 36, x, y, z, s);                                                  // tapered tower
  B.revolve(white(), [[2.3, 10.7], [3.35, 10.9], [3.35, 11.25], [0.1, 11.25]], 36, x, y, z, s);                  // gallery deck
  const rail = white();
  B.revolve(rail, [[3.22, 12.25], [3.3, 12.25], [3.3, 12.4], [3.22, 12.4]], 36, x, y, z, s);
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2;
    B.add(rail, new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5), M(x + Math.cos(a) * 3.26 * s, y + 11.8 * s, z + Math.sin(a) * 3.26 * s, s));
  }
  const dome = [];
  for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI / 2; dome.push([Math.cos(a) * 2.65, 11.25 + Math.sin(a) * 2.75]); }
  B.revolve(white(), dome, 36, x, y, z, s);
  const dark = () => B.style(T.pane, { lit: T.paneLit });
  B.add(dark(), new THREE.BoxGeometry(0.75, 2.5, 3), M(x - 0.9 * s, y + 13.2 * s, z + 1.5 * s, s, s, s, -0.55, -0.62));  // the slit in the dome
  B.add(white(), new THREE.SphereGeometry(0.3, 10, 8), M(x, y + 14.2 * s, z, s));
  for (const [a, ly] of [[-0.55, 4.6], [-0.2, 7.6], [-0.9, 8.6]]) {
    const r = (2.9 - 0.55 * (ly - 0.5) / 10.5) * s;
    B.add(dark(), new THREE.BoxGeometry(0.6, 1.1, 0.3), M(x + Math.sin(a) * r, y + ly * s, z + Math.cos(a) * r, s, s, s, a));
  }
  const r = 2.86 * s, a = -0.55;
  B.add(B.style(T.roof), new THREE.BoxGeometry(1.1, 2, 0.3), M(x + Math.sin(a) * r, y + 1.6 * s, z + Math.cos(a) * r, s, s, s, a)); // door
}

function buildWorld(T) {
  const B = new Builder(), rnd = rngFrom(7), islands = [];

  terrain(B, T);

  // the far range on the right: broad stepped rock, snow on the upper ledges; the observatory stands on the widest top
  const rock = (h, baseY) => B.style(T.rock, { snow: baseY + h * 0.6, glint: 0.5 });
  const seat = crag(B, rock(44, 5), 132, -184, 58, 44, 5, 11, { flat: true, top: 9.5 });
  crag(B, rock(40, 5), 82, -172, 48, 40, 5, 12);
  crag(B, rock(48, 3), 56, -212, 46, 48, 3, 13, { top: 7 });
  crag(B, rock(52, 5), 190, -200, 54, 52, 5, 14);
  crag(B, rock(56, 3), 118, -236, 60, 56, 3, 15, { top: 8 });
  observatory(B, T, seat.top);

  // a few dark rocks standing in the sea on the left; the middle of the bay stays open for the sun
  for (const [x, z, r, h, seed, top] of [[-66, -74, 22, 15, 21, 6], [-40, -60, 12, 7.5, 22, 4], [-120, -106, 30, 20, 24, 8], [-152, -72, 22, 12, 25, 6]])
    islands.push(crag(B, B.style(T.hill, { glint: 0.7 }), x, z, r, h, -1.5, seed, { top, ribs: 10 }).foot);

  house(B, T);

  // trees: some placed by hand where they frame the view, the rest scattered on the meadow.
  // kinds: 0 round, 1 spruce, 2 round (light), 3 tall, 4 wide, 5 round (pale), 6 slim spruce, 7 bush, 8 tall (light)
  const unseen = new Builder();   // a tree taken out of the picture is still built, into nothing, so the scatter below keeps its places
  const rnd2 = rngFrom(77);        // its own dice for the foreground pebbles, so they do not shift the trees
  const lowest = (x, z, R) => { let y = height(x, z); for (let k = 0; k < 8; k++) y = Math.min(y, height(x + Math.cos(k * 0.785) * R, z + Math.sin(k * 0.785) * R)); return y; };
  const plant = (x, z, s, kind, anywhere, into = B) => {
    if (!anywhere && height(x, z) < 1.2) return;
    if (kind === 1 || kind === 6) return spruce(into, T, x, z, s, kind === 6);
    const pair = T.crowns[[0, 0, 1, 3, 0, 2, 0, 1, 1][kind]];
    leafTree(into, T, x, z, s, pair, rnd, [, , , "tall", "wide", , , "bush", "tall"][kind] || "round");
  };
  const spots = [[19, -31, 1.05, 0], [44, -40, 0.8, 1], [48, -36, 1.0, 6], [41, -27, 0.7, 5], [-34, -10, 0.9, 2], [-42, -4, 0.8, 3], [52, -8, 1.0, 4], [58, -14, 0.8, 1], [12, -23, 0.75, 6], [37, -19, 0.7, 7], [-31, -19, 0.8, 8]];
  for (const [x, z, s, kind] of spots) plant(x, z, s, kind);
  // a young tree in the crook of the path's last bend, beyond the path
  sapling(B, T, 22.6, 8.6, 0.8, rnd);
  // low in the picture: a rock at the far left, and two shells in a heap on the top of the hill, under the end of the headline
  crag(B, B.style(T.rock, { glint: 0.5 }), -13.6, 36.9, 2.2, 2.3, lowest(-13.6, 36.9, 2.7) - 0.35, 31, { ribs: 8, top: 0.8 });
  shells(B, T, 10.4, 34.1, rnd2);
  for (const [px, pz, r] of [[-10.3, 37.1, 0.2], [-9.9, 37.7, 0.13]]) pebble(B, B.style(T.rock, { glint: 0.3 }), px, pz, r, rnd2);
  let placed = 0, tries = 0;
  while (placed < 13 && tries++ < 900) {
    const x = -62 + rnd() * 136, z = -56 + rnd() * 70;
    if (height(x, z) < 1.4 || riverDist(x, z) < 10 || lineDist(PATH, x, z) < 5 || Math.hypot(x - HOUSE[0], z - HOUSE[1]) < 16) continue;
    if (z > 4 && Math.abs(x + 2) < 30) continue;          // keep the view open in front of the hero camera
    if (Math.hypot(x + 44, z - 38) < 48) continue;        // and in front of the footer camera
    if (spots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 9)) continue;
    spots.push([x, z]);
    const k = rnd();
    const hide = Math.hypot(x + 20.8, z + 7.6) < 1;       // the one on the left shore: only its crown showed, over the sea rock
    plant(x, z, 0.6 + rnd() * 0.45, k < 0.2 ? 1 : k < 0.36 ? 6 : k < 0.52 ? 0 : k < 0.64 ? 2 : k < 0.76 ? 3 : k < 0.86 ? 4 : k < 0.93 ? 7 : 5, false, hide ? unseen : B);
    placed++;
  }

  // sky: stars by night, a few clouds by day (the sun itself is painted in the sky, so it has no outline)
  if (T.stars) {
    // scattered over a dome around the camera, not on one wall ahead of it: the night camera looks off to the right,
    // and on a wide screen the sky reaches far past where a wall would end. Each star is a small diamond facing the camera.
    const st = B.style(T.stars, { lit: 0, fog: 0, id: 1 }); // same id as the sky, so stars get no outline
    const eye = V3(...T.view.pos), az0 = Math.atan2(T.view.tgt[0] - eye.x, -(T.view.tgt[2] - eye.z)), up = V3(0, 1, 0);
    const turn = new THREE.Matrix4().makeRotationZ(Math.PI / 4), R = 1300;
    for (let k = 0; k < 300; k++) {
      const az = az0 + (rnd() * 2 - 1) * 1.45, el = Math.asin(0.04 + rnd() * 0.62), s = 1.2 + rnd() * 2.6;
      const at = V3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(R).add(eye);
      const m = new THREE.Matrix4().lookAt(eye, at, up).multiply(turn).scale(V3(s, s, s)).setPosition(at);
      B.add(st, new THREE.PlaneGeometry(1, 1), m);
    }
  } else {
    for (const [x, y, z, w] of [[-330, 150, -820, 64], [300, 178, -900, 76], [470, 135, -800, 56]]) {   // kept right of the intro text at every width
      const st = B.style(T.cloud, { fog: 0, lit: 0, glint: 0.2, range: [y - w * 0.14, y + w * 0.2] });
      for (const [ox, oy, sc] of [[0, 0, 1], [-0.6, -0.03, 0.62], [0.58, -0.02, 0.7], [0.15, 0.07, 0.6]])
        B.add(st, new THREE.IcosahedronGeometry(1, 3), M(x + ox * w, y + oy * w, z, w * sc * 0.62, w * sc * 0.15, w * sc * 0.3));
    }
  }

  const S = new Builder(), E = 4000, sea = S.style([[0, 0, 0], [0, 0, 0]], { id: 1 });
  const P = [[-E, 0, -E], [-E, 0, E], [E, 0, E], [E, 0, -E]], N = P.map(() => [0, 1, 0]), G = [0, 0, 0, 0];
  S.tri(sea, P, N, G, 0, 1, 2); S.tri(sea, P, N, G, 0, 2, 3);
  return { land: B.build(), sea: S.build(), islands };
}

/* How far every bit of water is from the nearest land, as a small top-down picture. The sea reads it to
   run its waves in towards the coast and to lay foam along the edge. */
let SHORE = null;
function shoreField(islands) {
  if (SHORE) return SHORE;
  const x0 = -230, z0 = -300, step = 1.5, w = 320, h = 264, reach = 40;
  const d = new Float32Array(w * h);
  const inside = (poly, x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + i * step, z = z0 + j * step;
    d[j * w + i] = height(x, z) > 0 || islands.some((p) => inside(p, x, z)) ? 0 : 1e4;
  }
  const a = step, b = step * Math.SQRT2; // two sweeps spread the distance outwards from the land
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + a);
    if (j > 0) { v = Math.min(v, d[k - w] + a); if (i > 0) v = Math.min(v, d[k - w - 1] + b); if (i < w - 1) v = Math.min(v, d[k - w + 1] + b); }
    d[k] = v;
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const k = j * w + i; let v = d[k];
    if (i < w - 1) v = Math.min(v, d[k + 1] + a);
    if (j < h - 1) { v = Math.min(v, d[k + w] + a); if (i < w - 1) v = Math.min(v, d[k + w + 1] + b); if (i > 0) v = Math.min(v, d[k + w - 1] + b); }
    d[k] = v;
  }
  const px = new Uint8Array(w * h);
  for (let k = 0; k < px.length; k++) px[k] = Math.round(Math.min(1, d[k] / reach) * 255);
  SHORE = { px, w, h, reach, step, box: new THREE.Vector4(x0 - step / 2, z0 - step / 2, 1 / (w * step), 1 / (h * step)) };
  return SHORE;
}
const shoreTexture = (f) => {
  const tex = new THREE.DataTexture(f.px, f.w, f.h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
};

/* ---------- shaders ---------- */
const FAR = 3200;
const u3 = (hex) => ({ value: new THREE.Vector3(...rgb(hex)) });
const NOISE = `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float h11(float n){ return fract(sin(n * 127.1) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h21(i), h21(i+vec2(1.,0.)), f.x), mix(h21(i+vec2(0.,1.)), h21(i+vec2(1.,1.)), f.x), f.y); }
  float fbm(vec2 p){ return (0.5*vn(p) + 0.25*vn(p*2.03 + 1.7) + 0.125*vn(p*4.01 + 3.1) + 0.0625*vn(p*8.05 + 5.3)) / 0.9375; }`;
/* How high the water has run up the land at a spot, and the beat it runs to (shared by the land, the outlines and the sea). */
const TIDE = `
  float tideBeat(vec3 w, float t){ return sin(t*0.6 + 6.283*vn(w.xz*0.05)); }
  float tideLine(vec3 w, float t){ return 0.24*smoothstep(-0.1, 1., tideBeat(w, t)); }`;
/* The shadow of the headline: follow the sign's own light from a point back to the sign and see if a letter is in the way. */
const SIGN_SHADE = `
  uniform sampler2D tSign; uniform vec3 uSgC, uSgR, uSgN, uSgL; uniform vec2 uSgS; uniform float uSgOn;
  float signShade(vec3 p){
    float t = dot(uSgC - p, uSgN)/dot(uSgL, uSgN);
    vec3 h = p + uSgL*t - uSgC;
    vec2 uv = vec2(dot(h, uSgR)/uSgS.x, h.y/uSgS.y) + 0.5;
    float hit = step(0., t)*step(0., uv.x)*step(uv.x, 1.)*step(0., uv.y)*step(uv.y, 1.);
    return uSgOn*hit*step(0.5, texture2D(tSign, clamp(uv, 0., 1.)).a);
  }`;
const signUniforms = () => ({ tSign: { value: null }, uSgC: { value: new THREE.Vector3() }, uSgR: { value: new THREE.Vector3(1, 0, 0) }, uSgN: { value: new THREE.Vector3(0, 0, 1) },
  uSgL: { value: new THREE.Vector3(0, 1, 0.5) }, uSgS: { value: new THREE.Vector2(1, 1) }, uSgOn: { value: 0 } });
const SNOWLINE = "float snowLine(vec3 w, float s){ return s + 3.2*sin(w.x*0.2 + w.z*0.16) + 1.7*sin(w.x*0.6 - w.z*0.47); }";

const colMat = (T, L, glintDir) => new THREE.ShaderMaterial({
  uniforms: {
    tS: { value: null }, uSM: { value: new THREE.Matrix4() }, uSTex: { value: 1 / 2048 }, uL: { value: L }, uGL: { value: glintDir },
    uShade: u3(T.shade), uFog: u3(T.fog), uSnowA: u3(T.snow0), uSnowB: u3(T.snow1), uGlint: u3(T.glint), uGlintK: { value: T.glintK },
    uSand: u3(T.sand), uFlowers: u3(T.flowers), uPathCol: u3(T.path), uFogK: { value: T.fogK }, uBlotch: { value: T.blotch },
    uPath: { value: PATH.map((p) => new THREE.Vector2(p[0], p[1])) },
    uT: { value: 0 }, uSea: u3(T.sea), uFoam: u3(T.foam), ...signUniforms(),
  },
  vertexShader: `
    attribute vec3 aA, aB, aM; attribute float aG, aS; uniform mat4 uSM;
    varying vec3 vA, vB, vM, vN, vW; varying float vG, vS; varying vec4 vSh;
    void main(){ vA=aA; vB=aB; vM=aM; vG=aG; vS=aS; vN=normal; vW=position;
      vSh = uSM * vec4(position + normal*0.3, 1.); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tS; uniform vec3 uL, uGL, uShade, uFog, uSnowA, uSnowB, uSand, uFlowers, uGlint, uPathCol;
    uniform float uFogK, uSTex, uBlotch, uGlintK, uT; uniform vec2 uPath[${PATH_N}]; uniform vec3 uSea, uFoam;
    varying vec3 vA, vB, vM, vN, vW; varying float vG, vS; varying vec4 vSh;
    ${NOISE} ${SNOWLINE} ${TIDE} ${SIGN_SHADE}
    float occluded(vec2 uv, float z){ return step(texture2D(tS, uv).r + 0.0006, z); }
    float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0., 1.)); }
    void main(){
      vec3 N = normalize(vN);
      vec3 base = mix(vB, vA, smoothstep(0., 1., vG));
      float dist = length(vW - cameraPosition), px = dist*0.0011;   // roughly one screen pixel, in world units
      bool ground = vS < -0.5;
      if (vS > 0.5) {                                   // mountains: snow above a wavy line
        float line = snowLine(vW, vS);
        if (vW.y > line) base = mix(uSnowB, uSnowA, clamp((vW.y - line) / 12., 0., 1.));
      } else if (ground) {                              // the ground: flowers, the footpath, pale sand at the water
        float bloom = vn(vW.xz*0.06 + vec2(11., 5.));
        base = mix(base, uFlowers, smoothstep(0.7 - px*0.06, 0.7 + px*0.06, bloom) * uBlotch * step(1.2, vW.y) * step(vW.z, -14.));
        float pd = 1e9;
        for (int i = 0; i < ${PATH_N - 1}; i++) pd = min(pd, seg(vW.xz, uPath[i], uPath[i + 1]));
        float wide = 0.85 + 0.35*vn(vW.xz*0.3);
        base = mix(base, uPathCol, 1. - smoothstep(wide - px, wide + px, pd));
        base = mix(uSand, base, smoothstep(0.1, 0.32, vW.y));
      }
      // light: the ground rolls off softly; everything else is either lit or in one flat shade
      float ndl = dot(N, uL);
      float form = ground ? 0.85*(1. - smoothstep(0.22, 0.72, ndl*0.5 + 0.5)) : 1. - smoothstep(-0.03, 0.05, ndl);
      vec3 sp = vSh.xyz*0.5 + 0.5; float shadow = 0.;
      if (sp.x > 0. && sp.x < 1. && sp.y > 0. && sp.y < 1. && sp.z < 1.) {
        float o = uSTex*0.75;
        shadow = 0.25*(occluded(sp.xy + vec2(o, o), sp.z) + occluded(sp.xy + vec2(-o, o), sp.z) + occluded(sp.xy + vec2(o, -o), sp.z) + occluded(sp.xy + vec2(-o, -o), sp.z));
      }
      shadow = max(shadow, signShade(vW));              // the headline's own shadow, just in front of it
      vec3 col = mix(base, uShade, 0.5*max(form, shadow)*vM.x);
      if (!ground && vS < 0.5) {                        // trees, rocks, buildings: flat tones, no blend
        vec3 tone = mix(mix(vA, vB, 0.5), vA, smoothstep(0.4, 0.46, ndl));      // a light tone where the surface faces the light, a middle one elsewhere
        if (vM.x < 0.5) tone = mix(vB, vA, step(0.5, vG));                      // unlit things (clouds, window panes): two flat bands by height
        col = mix(tone, mix(vB, uShade, 0.45), max(form, shadow)*vM.x);         // and one shade
      }
      // a flat touch of gold where a surface turns towards the sun
      col = mix(col, uGlint, smoothstep(0.8, 0.84, dot(N, uGL)) * (1. - shadow) * vM.z * uGlintK);
      if (ground) {                                     // the water runs up over the edge of the land, with a thin line of foam at its lip
        float tide = tideLine(vW, uT);
        if (vW.y < tide) col = mix(uSea, uFoam, smoothstep(tide - 0.04, tide - 0.015, vW.y));
      }
      col = mix(col, uFog, (1. - exp(-dist*uFogK)) * vM.y);
      gl_FragColor = vec4(col, 1.);
    }`,
});
const dataMat = () => new THREE.ShaderMaterial({
  uniforms: { uFar: { value: FAR }, uT: { value: 0 } },
  vertexShader: "attribute float aId, aS; varying vec3 vN, vW; varying float vId, vZ, vS; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalMatrix*normal; vId=aId; vS=aS; vW=position; vZ=-mv.z; gl_Position=projectionMatrix*mv; }",
  fragmentShader: `uniform float uFar, uT; varying vec3 vN, vW; varying float vId, vZ, vS; ${NOISE} ${SNOWLINE} ${TIDE}
    void main(){
      float id = vId + ((vS > 0.5 && vW.y > snowLine(vW, vS)) ? 500. : 0.); vec2 n = normalize(vN).xy;
      if (vS < -0.5 && vW.y < tideLine(vW, uT)) { id = 1.; n = normalize((viewMatrix*vec4(0., 1., 0., 0.)).xyz).xy; }   // under water: same as the sea
      gl_FragColor = vec4(n, id, clamp(vZ/uFar, 0., 1.));
    }`,
  blending: THREE.NoBlending,
});
const depthMat = () => new THREE.ShaderMaterial({
  vertexShader: "void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader: "void main(){ gl_FragColor=vec4(gl_FragCoord.z, 0., 0., 1.); }",
  side: THREE.DoubleSide, blending: THREE.NoBlending,
});
const seaMat = (T, shore, sunDir) => new THREE.ShaderMaterial({
  uniforms: {
    uT: { value: 0 }, uBase: u3(T.sea), uWave: u3(T.wave), uFoam: u3(T.foam), uGlit: u3(T.glitter), uGlitK: { value: T.glitterK },
    uFog: u3(T.fog), uFogK: { value: T.fogK }, tSh: { value: shoreTexture(shore) }, uBox: { value: shore.box }, uReach: { value: shore.reach },
    uSunXZ: { value: new THREE.Vector2(sunDir.x, sunDir.z).normalize() },
    uRiver: { value: RIVER.map((p) => new THREE.Vector2(p[0], p[1])) }, ...signUniforms(),
  },
  vertexShader: "varying vec3 vW; void main(){ vW=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader: `
    uniform float uT, uFogK, uGlitK, uReach; uniform vec3 uBase, uWave, uFoam, uGlit, uFog; uniform vec4 uBox; uniform vec2 uSunXZ;
    uniform sampler2D tSh; varying vec3 vW; uniform vec2 uRiver[${RIVER.length}]; ${NOISE} ${TIDE} ${SIGN_SHADE}
    float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0., 1.)); }
    float shoreDist(vec2 p){                                 // distance to the nearest land, in world units
      vec2 uv = (p - uBox.xy)*uBox.zw;
      float on = step(0., uv.x)*step(uv.x, 1.)*step(0., uv.y)*step(uv.y, 1.);
      return mix(uReach, max(texture2D(tSh, uv).r*uReach - 0.75, 0.), on);
    }
    void main(){
      float dist = length(vW - cameraPosition), d = shoreDist(vW.xz);
      // the stream: its banks are measured from its own middle line, which is smoother up close than the shore picture
      float rd = 1e9;
      for (int i = 0; i < ${RIVER.length - 1}; i++) rd = min(rd, seg(vW.xz, uRiver[i], uRiver[i + 1]));
      float stream = (1. - smoothstep(6., 8., rd)) * smoothstep(-36., -22., vW.z);
      d = mix(d, max(4.1 - rd, 0.), stream);

      // open water: long thin crests, nearly parallel, gently bent, rolling slowly
      vec2 p = mat2(0.94, -0.34, 0.34, 0.94)*vW.xz;          // p.x runs along a crest, p.y across the crests
      float bend = 1.5*sin(p.x*0.045 + 1.3) + 0.7*sin(p.x*0.11 + p.y*0.05) + 2.6*(vn(p*0.028 + vec2(0., uT*0.015)) - 0.5);
      float v = (p.y + bend)/5.2 - uT*0.1, vp = fwidth(v), row = floor(v);
      float u = p.x/52. + h11(row)*17., cell = floor(u), f = fract(u), len = 0.5 + 0.45*h11(cell*1.3 + row*13.);
      float taper = smoothstep(0., 0.2, f) * (1. - smoothstep(len - 0.2, len, f)) * step(0.28, h11(cell*2.1 + row*5.3));
      float hw = vp*(0.25 + 0.75*taper);
      float open = (1. - smoothstep(hw - vp*0.5, hw + vp*0.5, abs(fract(v) - 0.5))) * smoothstep(0., 0.12, taper);
      open *= (1. - smoothstep(0.12, 0.34, vp)) * smoothstep(7., 15., d);

      // near land the waves turn to follow the coast, run in towards it, bunch up and thicken
      float wob = 1.6*(vn(vW.xz*0.07 + vec2(3., uT*0.02)) - 0.5);
      float s = (d + wob)/2.4 + uT*0.14, sp = fwidth(s), srow = floor(s);
      float close = 1. - smoothstep(4., 12., d);
      float gap = smoothstep(0.36, 0.44, vn(vW.xz*0.13 + vec2(srow*5.7, srow*2.3)));
      float sw = sp*(0.5 + 0.9*close)*mix(1., 0.55, stream);                   // in the stream the rings are finer and fainter
      float swash = (1. - smoothstep(sw - sp*0.5, sw + sp*0.5, abs(fract(s) - 0.5))) * gap * close * (1. - smoothstep(0.14, 0.4, sp));
      vec3 col = mix(uBase, uWave, 0.85*max(open, swash*mix(1., 0.6, stream)));

      // the sun's path on the water: short bright dashes that flicker, melting into a sheen far away.
      // It is about as wide as the sun itself, stops at its edges, and keeps to the open sea: it ends where the
      // waves begin to turn towards the shore, and never reaches the stream.
      vec2 rel = vW.xz - cameraPosition.xz;
      float along = dot(rel, uSunXZ), side = rel.x*uSunXZ.y - rel.y*uSunXZ.x, spread = 1.6 + along*0.042;
      float gv = log(max(along, 1.))*13. + 0.3*sin(side*0.3 + uT*0.6), gp = fwidth(gv), grow = floor(gv);   // rows deepen with distance: even steps on screen
      float gu = side/(spread*0.5) + h11(grow)*13., gc = floor(gu);
      float lit = step(0.42, h11(gc*1.7 + grow*3.3 + floor(uT*1.3 + h11(grow + gc)*7.)));
      float dash = (1. - smoothstep(gp*0.9, gp*1.9, abs(fract(gv) - 0.5))) * step(fract(gu), 0.4 + 0.45*h11(gc + grow*9.)) * lit;   // the same thin line near and far
      dash = mix(dash, 0.6, smoothstep(0.25, 0.6, gp)) * exp(-side*side/(spread*spread)) * (1. - smoothstep(1.05, 1.45, abs(side)/spread)) * step(0., along) * uGlitK;
      dash *= smoothstep(16., 30., d) * (1. - stream);

      // foam: a white edge along the coast that slides back as the water runs up the land, and returns as it falls.
      // Close to the viewer it is kept thin, so the stream's edge is a line rather than a band.
      float beat = tideBeat(vW, uT);
      float reachIn = (0.9 + 0.55*beat) * (1. - smoothstep(-0.1, 0.45, beat)) * mix(0.3, 1., smoothstep(30., 110., dist));
      float fd = fwidth(d) + 0.01;
      col = mix(col, uFoam, (1. - smoothstep(reachIn - fd, reachIn + fd, d + 0.5*(vn(vW.xz*0.6) - 0.5)*mix(1., 0.3, stream))) * step(0.02, reachIn));
      col = mix(col, uBase*0.45, 0.8*signShade(vW));    // the headline's shadow crosses the stream too

      col = mix(col, uFog, 1. - exp(-dist*uFogK*1.25));
      gl_FragColor = vec4(mix(col, uGlit, dash), 1.);                      // the glints stay bright through the haze
    }`,
});
const skyMat = (T, sunDir) => new THREE.ShaderMaterial({
  uniforms: { uZen: u3(T.zenith), uMid: u3(T.mid), uHor: u3(T.horizon), uSunCol: u3(T.sunCol), uSunDeep: u3(T.sunDeep), uSun: { value: sunDir }, uSunset: { value: T.sunset },
    uMilky: u3(T.milky || "#000000"), uMilkyOn: { value: T.milky ? 1 : 0 }, uMoon: { value: new THREE.Vector2(0.3, 0.35) } },
  vertexShader: "varying vec3 vW; void main(){ vW=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader: `
    uniform vec3 uZen, uMid, uHor, uSunCol, uSunDeep, uSun, uMilky; uniform float uSunset, uMilkyOn; uniform vec2 uMoon; varying vec3 vW; ${NOISE}
    void main(){
      vec3 d = normalize(vW - cameraPosition);
      float e = max(d.y, 0.);
      vec3 col = mix(uHor, uMid, smoothstep(0., 0.2, e));                    // warm at the horizon, cooler and deeper overhead
      col = mix(col, uZen, smoothstep(0.14, 0.7, e));
      if (uMilkyOn > 0.5) {
        // the Milky Way: a faint band rising from behind the land to the right of the moon (uMoon: where its spine
        // crosses the moon's height, measured from the page), leaning right as it climbs. Cloudy, split by a dark
        // lane, full of fine stars.
        float az = atan(d.x, -d.z) - uMoon.x, el = asin(clamp(d.y, -1., 1.));
        az -= 6.2832*floor((az + 3.1416)/6.2832);
        float u = az - (el - uMoon.y)*0.45;                                   // across the band, 0 on its straight line
        u -= 0.09*(fbm(vec2(el*2.4, 4.)) - 0.45);                             // the spine wanders
        float wd = 0.085*(0.6 + 0.8*fbm(vec2(el*1.7 + 8., 1.))) * (1. + 0.7*(1. - smoothstep(0., 0.35, el)));  // wider low down
        vec2 q = vec2(u*8., el*7.);
        q += 1.3*vec2(fbm(q*0.8 + 2.), fbm(q*0.8 + 7.)) - 0.6;                // swirl the clouds
        float rise = smoothstep(0.0, 0.1, el) * (1. - 0.45*smoothstep(0.35, 0.85, el));
        float body = exp(-pow(u/wd, 2.)) * rise, halo = exp(-pow(u/(wd*2.6), 2.)) * rise;
        float clumps = smoothstep(0.28, 0.78, fbm(q*1.4));                    // bright knots and thin stretches
        float rift = smoothstep(0.5, 0.68, fbm(q*2.2 + 11.)) * exp(-pow(u/(wd*0.55), 2.));   // ragged dark dust
        float glow = body*(0.18 + 1.25*clumps)*(1. - 0.85*rift);
        col = mix(col, uMilky, 0.06*halo);                                         // the faint glow around it
        col = mix(col, mix(uMilky, vec3(0.94, 0.95, 1.), 0.5*clumps*body), clamp(0.34*glow, 0., 1.));
        vec2 g = floor(vec2(az, el)*760.);                                         // a crowd of fine stars, thickest in the clouds
        float star = step(0.994 - 0.045*clamp(glow, 0., 1.) - 0.006*halo, h21(g));
        col += vec3(0.86, 0.9, 1.) * star * (0.3 + 0.7*h21(g + 7.)) * clamp(0.25*halo + glow*1.4, 0., 1.);
      }
      if (uSunset > 0.5) {
        float az = atan(d.x, -d.z) - atan(uSun.x, -uSun.z), el = asin(clamp(d.y, -1., 1.)) - asin(uSun.y);
        float R = 0.055, k = acos(clamp(dot(d, uSun), -1., 1.))/R;            // k = 1 at the rim of the sun
        col = mix(col, uSunCol, 0.26*exp(-az*az*10.)*exp(-e*16.) + 0.2*exp(-k*k*0.2));   // the warmth stays close to the sun

        // long flat clouds with hard edges: white, with only a breath of the sun's colour right beside it
        float band = vn(vec2(az*2.3 + 4., d.y*30.)) + 0.45*vn(vec2(az*6. + 1., d.y*64.));
        float zone = smoothstep(0.025, 0.075, d.y)*(1. - smoothstep(0.2, 0.42, d.y));
        float cut = mix(1.5, 0.9, zone);
        col = mix(col, mix(vec3(1.), uSunCol, 0.16*exp(-az*az*8.)), 0.85*smoothstep(cut - 0.012, cut + 0.012, band));

        // short brush arcs circling the sun: packed close to it, shorter and fewer with every ring, gone by twice its size
        float rr = (k - 1.13)/0.17, ring = floor(rr), thin = clamp(ring/6., 0., 1.);
        float u = atan(el, az)/6.2832*(11. + ring*5.) + h11(ring + 2.)*7., cell = floor(u), f = fract(u);
        float len = mix(0.78, 0.3, thin)*(0.6 + 0.4*h11(cell*1.7 + ring*17.));
        float arc = (1. - smoothstep(0.15, 0.21, abs(fract(rr) - 0.5))) * smoothstep(0., 0.05, f) * (1. - smoothstep(len - 0.05, len, f));
        arc *= step(thin*0.8, h11(cell*3.1 + ring*7.)) * step(0., rr) * step(rr, 7.);
        col = mix(col, mix(uSunDeep, uSunCol, 0.55*step(0.5, h11(cell + ring*5.))), 0.9*arc);

        // the sun itself: a ball in three flat tones, lit from the upper left, with no outline
        vec2 q = vec2(az*sqrt(1. - uSun.y*uSun.y), el)/R;
        float lit = dot(vec3(q, sqrt(max(0., 1. - dot(q, q)))), normalize(vec3(-0.5, 0.58, 0.64)));
        vec3 ball = mix(mix(uSunDeep, uSunCol, 0.45), uSunCol, smoothstep(0.2, 0.24, lit));
        ball = mix(ball, vec3(1., 0.97, 0.82), smoothstep(0.8, 0.84, lit));
        col = mix(col, ball, 1. - smoothstep(0.985, 1.015, k));
      }
      gl_FragColor = vec4(col, 1.);
    }`,
  side: THREE.BackSide, depthWrite: false,
});
const inkMat = (T) => new THREE.ShaderMaterial({
  uniforms: { tC: { value: null }, tG: { value: null }, uPx: { value: new THREE.Vector2() }, uLine: u3(T.line) },
  vertexShader: "varying vec2 vUv; void main(){ vUv=position.xy*0.5+0.5; gl_Position=vec4(position.xy,0.,1.); }",
  fragmentShader: `
    uniform sampler2D tC, tG; uniform vec2 uPx; uniform vec3 uLine; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tG, vUv);
      vec4 l = texture2D(tG, vUv - vec2(uPx.x, 0.)), r = texture2D(tG, vUv + vec2(uPx.x, 0.));
      vec4 d = texture2D(tG, vUv - vec2(0., uPx.y)), u = texture2D(tG, vUv + vec2(0., uPx.y));
      float idE = step(0.5, max(max(abs(l.b - c.b), abs(r.b - c.b)), max(abs(d.b - c.b), abs(u.b - c.b))));
      float nE = step(0.62, max(max(distance(l.rg, c.rg), distance(r.rg, c.rg)), max(distance(d.rg, c.rg), distance(u.rg, c.rg))));
      float w = 1. / c.a; // 1/distance is flat across a plane, so only real steps in depth stand out
      float dE = step(0.035, max(abs(1. / l.a + 1. / r.a - 2. * w), abs(1. / d.a + 1. / u.a - 2. * w)) / w) * step(c.a, 0.3);
      gl_FragColor = vec4(mix(texture2D(tC, vUv).rgb, uLine, max(idE, max(nE, dE))), 1.);
    }`,
  depthTest: false, depthWrite: false,
});

/* ---------- the headline as a sign in the meadow ---------- */
const SIGN_VERT = "varying vec2 vUv; varying float vZ; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vZ=-mv.z; gl_Position=projectionMatrix*mv; }";
const signMat = (tex, body, extra = {}) => new THREE.ShaderMaterial({
  uniforms: { tT: { value: tex }, uFar: { value: FAR }, ...extra },
  vertexShader: SIGN_VERT,
  fragmentShader: `uniform sampler2D tT; uniform float uFar; uniform vec3 uCol; varying vec2 vUv; varying float vZ;
    void main(){ if (texture2D(tT, vUv).a < 0.5) discard; ${body} }`,
  side: THREE.DoubleSide, blending: THREE.NoBlending,
});
/* Draws the heading's words (as the page sets them: same face, weight and case) into a picture, three lines deep. */
async function sign(el, hex, renderer) {
  const cs = getComputedStyle(el), font = (px) => `${cs.fontWeight} ${px}px ${cs.fontFamily}`;
  try { await document.fonts.load(font(100)); } catch { return null; }
  const words = (el.getAttribute("aria-label") || el.textContent).trim().toUpperCase().split(/\s+/), lines = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur && (cur + " " + w).length > 25) lines.push(w); else lines[lines.length - 1] = cur ? cur + " " + w : w;
  }
  const px = 200, lead = px * 0.9, pad = Math.round(px * 0.1), c = document.createElement("canvas"), g = c.getContext("2d");
  const set = () => { g.font = font(px); if ("letterSpacing" in g) g.letterSpacing = `${-0.04 * px}px`; g.fillStyle = "#fff"; g.textBaseline = "alphabetic"; };
  set();
  c.width = Math.min(4096, Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width)) + pad * 2));
  c.height = Math.ceil(lead * (lines.length - 1) + px * 0.74 + pad * 2);
  set();
  lines.forEach((l, i) => g.fillText(l, pad, pad + px * 0.73 + lead * i));
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), null);
  mesh.frustumCulled = false;
  // where each line sits on the label: its left and right ends and its baseline, as fractions of the label (baseline from
  // the bottom); and the height of a capital, so the scene can tell how deep a line stands in the ground
  const lineBox = lines.map((l, i) => ({ x0: pad / c.width, x1: (pad + g.measureText(l).width) / c.width, base: 1 - (pad + px * 0.73 + lead * i) / c.height }));
  return {
    mesh, tex, aspect: c.width / c.height, lines: lineBox, cap: px * 0.72 / c.height,
    col: signMat(tex, "gl_FragColor = vec4(uCol, 1.);", { uCol: u3(hex) }),
    data: signMat(tex, "gl_FragColor = vec4(0., 0., 900., clamp(vZ/uFar, 0., 1.));"),
  };
}

/* The page's moon (an SVG in the heading) drawn into a texture, so the scene can hang the very same moon in its
   sky, where the land can stand in front of it. */
async function moonTexture(svg, px = 1024) {
  try {
    const copy = svg.cloneNode(true);
    copy.removeAttribute("class"); copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", px); copy.setAttribute("height", px);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
    const img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url);
    const c = document.createElement("canvas"); c.width = c.height = px;
    c.getContext("2d").drawImage(img, 0, 0, px, px);
    const tex = new THREE.CanvasTexture(c); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  } catch { return null; }
}
const MOON_Z = 700; // how deep the moon hangs: behind all the land, in front of the stars

/* ---------- one canvas ---------- */
function mount(canvas) {
  const T0 = THEMES[canvas.dataset.valley] || THEMES.day, T = {};
  for (const [k, v] of Object.entries(T0)) T[k] = k === "crowns" ? v.map((p) => p.map(rgb)) : PAIRS.includes(k) && v ? v.map(rgb) : v;
  [T.snow0, T.snow1] = T0.snow;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" }); } catch { return; }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);

  const L = V3(...T.light).normalize(), glintDir = V3(-0.9, 0.3, -0.2).normalize();
  const pos = V3(...T.view.pos), tgt = V3(...T.view.tgt), arm = V3();
  const sunDir = V3(-106, 12, -766).normalize(); // half set over the sea, left of the house
  const geo = buildWorld(T);
  const mats = { col: colMat(T, L, glintDir), data: dataMat(), depth: depthMat(), sea: seaMat(T, shoreField(geo.islands), sunDir), sky: skyMat(T, sunDir), ink: inkMat(T) };
  const land = new THREE.Mesh(geo.land, mats.col), sea = new THREE.Mesh(geo.sea, mats.sea);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2700, 48, 24), mats.sky);
  land.frustumCulled = sea.frustumCulled = sky.frustumCulled = false; sky.renderOrder = -1;
  const scene = new THREE.Scene(); scene.add(sky, land, sea);
  const camera = new THREE.PerspectiveCamera(T.view.fov, 1, 1, FAR);
  const post = new THREE.Scene(), postCam = new THREE.Camera();
  const tri = new THREE.BufferGeometry(); tri.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(tri, mats.ink); quad.frustumCulled = false; post.add(quad);

  const type = renderer.extensions.has("EXT_color_buffer_float") ? THREE.FloatType : THREE.HalfFloatType;
  const near = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type };
  const rtC = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const rtG = new THREE.WebGLRenderTarget(2, 2, near);
  mats.ink.uniforms.tC.value = rtC.texture; mats.ink.uniforms.tG.value = rtG.texture;

  // cast shadows: one picture of the middle of the valley as seen from the light (the headline has a shadow of its own)
  const SM = 2048, rtS = new THREE.WebGLRenderTarget(SM, SM, near), white = new THREE.Color(1, 1, 1);
  const ext = 105, centre = V3(4, 0, -8), lightCam = new THREE.OrthographicCamera(-ext, ext, ext, -ext, 1, 800);
  lightCam.position.copy(centre).add(L.clone().multiplyScalar(400)); lightCam.lookAt(centre); lightCam.updateMatrixWorld();
  mats.col.uniforms.tS.value = rtS.texture; mats.col.uniforms.uSTex.value = 1 / SM;
  mats.col.uniforms.uSM.value.multiplyMatrices(lightCam.projectionMatrix, lightCam.matrixWorldInverse);
  let label = null;
  function bake() {
    sky.visible = sea.visible = false; land.material = mats.depth;
    renderer.setRenderTarget(rtS); renderer.setClearColor(white, 1); renderer.render(scene, lightCam);
    sky.visible = sea.visible = true;
  }
  bake();

  const blank = new THREE.Color(0, 0, 0), bg = new THREE.Color(0, 0, 1); // the background shares the sea's id, so the horizon gets no line
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pinned = canvas.hasAttribute("data-pinned"), look = V3(), fwd = V3(); // a pinned scene stays put while the page slides over it
  let mx = 0, my = 0, visible = false, raf = 0, shown = false, last = 0, swing = 0.02;
  const ease = { y1: 0, y2: 0, p1: 0, p2: 0 };

  /* Stand the headline in the meadow, close in front of the viewer (so it sits low, well below the horizon) and
     filling most of the width. On tall screens there is no room for it, so the page keeps its own heading there. */
  const heading = canvas.dataset.text && T.text ? document.querySelector(canvas.dataset.text) : null;
  const TURN = 0.2;
  function place() {
    if (!label) return;
    const on = camera.aspect >= 1.2;
    label.mesh.visible = on; canvas.parentElement.classList.toggle("text-in-scene", on);
    mats.col.uniforms.uSgOn.value = mats.sea.uniforms.uSgOn.value = on ? 1 : 0;
    if (!on) return;
    const D = 32, edge = 0.455, f = V3(tgt.x - pos.x, 0, tgt.z - pos.z).normalize(), r = V3(-f.z, 0, f.x);
    const span = 2 * D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const W = Math.min(span * 0.84, 46), H = W / label.aspect;
    const left = V3(pos.x, 0, pos.z).addScaledVector(f, D).addScaledVector(r, -span * edge);
    label.mesh.rotation.y = Math.atan2(-f.x, -f.z) + TURN;   // the left end stays put; the right end swings away
    const across = V3(1, 0, 0).applyQuaternion(label.mesh.quaternion), facing = V3(0, 0, 1).applyQuaternion(label.mesh.quaternion);
    // it stands on the ground of its left part, and no line may sink deeper than a fifth of a capital into the drawn
    // ground under it (the right end walks into the hill and dips its feet in, no more)
    const hs = [];
    for (let k = 0; k <= 7; k++) hs.push(height(left.x + across.x * W * k / 12, left.z + across.z * W * k / 12));
    hs.sort((a, b) => a - b);
    let bottom = Math.max(0.4, hs[5]) - 0.15;
    for (const ln of label.lines) for (let k = 0; k <= 16; k++) {
      const t = ln.x0 + (ln.x1 - ln.x0) * k / 16, gx = left.x + across.x * W * t, gz = left.z + across.z * W * t;
      bottom = Math.max(bottom, ground(gx, gz) - 0.2 * label.cap * H - ln.base * H);
    }
    label.mesh.scale.set(W, H, 1);
    label.mesh.position.copy(left).addScaledVector(across, W / 2).setY(bottom + H / 2);
    // its shadow: from a light behind it and a little to the left, so the words lie on the grass just in front
    for (const m of [mats.col, mats.sea]) {
      const u = m.uniforms;
      u.tSign.value = label.tex; u.uSgC.value.copy(label.mesh.position); u.uSgR.value.copy(across); u.uSgN.value.copy(facing); u.uSgS.value.set(W, H);
      u.uSgL.value.copy(f).multiplyScalar(1.15).addScaledVector(r, -0.3).setY(1).normalize();
    }
    // how far the camera may swing before the first letter would leave the picture on the left
    swing = Math.min(0.045, 0.85 * span * (0.5 - edge) / (V3(tgt.x - pos.x, 0, tgt.z - pos.z).length() - D));
  }
  if (heading) sign(heading, T.text, renderer).then((s) => { if (!s) return; label = s; scene.add(s.mesh); place(); draw(performance.now()); });

  const moonEl = T.milky ? canvas.parentElement.querySelector(".moon") : null;
  // the moon in the scene: always under the page's moon on screen (re-aimed every frame, so it holds still while
  // the camera drifts and the land slides in front of it). The page's moon then goes invisible and only measures.
  let moon = null; const moonAt = new THREE.Vector2(); let moonSize = 0;
  if (moonEl) moonTexture(moonEl).then((tex) => {
    if (!tex) return;
    moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02 }));
    moon.frustumCulled = false; scene.add(moon);
    canvas.parentElement.classList.add("moon-in-scene");
    resize();
  });
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const scale = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)); // drawn larger than shown, which smooths the lines
    const W = Math.round(w * scale), H = Math.round(h * scale);
    renderer.setSize(W, H, false); rtC.setSize(W, H); rtG.setSize(W, H);
    mats.ink.uniforms.uPx.value.set(0.5 * scale / W, 0.5 * scale / H);
    const aspect = w / h;
    camera.aspect = aspect;
    // on tall screens widen the lens and turn towards the house so it stays in frame
    const tall = clamp((1.25 - aspect) / 0.75, 0, 1);
    camera.fov = T.view.fov + tall * 22;
    tgt.set(T.view.tgt[0] + tall * 14, T.view.tgt[1] + tall * 4, T.view.tgt[2]);
    camera.updateProjectionMatrix();
    // a lens shift, not a turn: the whole picture slides sideways and nothing in it changes its angle
    const shift = T.view.shiftFrom ? Math.max(0, w - T.view.shiftFrom) / w : 0;
    camera.projectionMatrix.elements[8] = -shift;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    // where the page's moon falls in this sky, so the Milky Way can rise beside it at every width
    if (moonEl) {
      const c = canvas.getBoundingClientRect(), m = moonEl.getBoundingClientRect(), tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      // the band crosses the moon's height well over to the right: three quarters of the way from the moon to the
      // edge (on narrow screens that pushes it out of the picture, which is fine)
      const nx = (m.right + 0.75 * (c.right - m.right) - c.left) / w * 2 - 1 - shift, ny = 1 - (m.top + m.height / 2 - c.top) / h * 2;
      const yaw = Math.atan2(tgt.x - pos.x, -(tgt.z - pos.z)), pitch = Math.atan2(tgt.y - pos.y, Math.hypot(tgt.x - pos.x, tgt.z - pos.z));
      mats.sky.uniforms.uMoon.value.set(yaw + Math.atan(nx * aspect * tv), pitch + Math.atan(ny * tv));
      moonAt.set((m.left + m.width / 2 - c.left) / w * 2 - 1, 1 - (m.top + m.height / 2 - c.top) / h * 2);
      moonSize = m.height / h * 2 * MOON_Z * tv;
    }
    place();
    draw(performance.now());
  }
  function draw(t) {
    // the mouse sets where the camera wants to be; two slow followers in a row give it a soft start and a soft stop
    const dt = Math.min(0.1, last ? (t - last) / 1000 : 0.016), k = 1 - Math.exp(-dt / 0.55); last = t;
    // (swinging right pushes the headline left, so that side is held to what its margin allows)
    ease.y1 += (mx * (mx < 0 ? -swing : -0.045) - ease.y1) * k; ease.y2 += (ease.y1 - ease.y2) * k;
    ease.p1 += (my * 0.022 - ease.p1) * k; ease.p2 += (ease.p1 - ease.p2) * k;
    arm.copy(pos).sub(tgt).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ease.y2);
    arm.y += arm.length() * ease.p2;
    camera.position.copy(tgt).add(arm); look.copy(tgt);
    if (pinned) { // scrolling walks the camera a little way down into the valley
      const sp = ss(0, 1, clamp(window.scrollY / (canvas.clientHeight || 1), 0, 1));
      fwd.copy(arm).setY(0).normalize();
      camera.position.addScaledVector(fwd, -16 * sp); camera.position.y -= 2.5 * sp; look.y -= 9 * sp;
    }
    camera.lookAt(look);
    if (moon) { // facing the screen, at a fixed depth, on the ray through the page's moon
      camera.updateMatrixWorld();
      const ray = V3(moonAt.x, moonAt.y, 0.5).unproject(camera).sub(camera.position), ahead = V3(0, 0, -1).applyQuaternion(camera.quaternion);
      moon.position.copy(camera.position).addScaledVector(ray, MOON_Z / ray.dot(ahead));
      moon.quaternion.copy(camera.quaternion); moon.scale.setScalar(moonSize);
    }
    mats.sea.uniforms.uT.value = mats.col.uniforms.uT.value = mats.data.uniforms.uT.value = still ? 0 : t / 1000;
    sky.visible = true; land.material = mats.col; sea.material = mats.sea; if (label) label.mesh.material = label.col;
    if (moon) moon.visible = true;
    renderer.setRenderTarget(rtC); renderer.setClearColor(blank, 1); renderer.render(scene, camera);
    sky.visible = false; land.material = sea.material = mats.data; if (label) label.mesh.material = label.data;
    if (moon) moon.visible = false; // part of the sky for the outlines: only the land against it gets a line
    renderer.setRenderTarget(rtG); renderer.setClearColor(bg, 1); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(post, postCam);
    if (!shown) { shown = true; canvas.classList.add("on"); }
  }
  function loop(t) {
    raf = 0; if (!visible || document.hidden) { last = 0; return; }
    if (pinned && window.scrollY > canvas.clientHeight * 1.3) { last = 0; raf = requestAnimationFrame(loop); return; } // covered by the page: skip the drawing
    draw(t); if (!still) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && visible) raf = requestAnimationFrame(loop); };

  new ResizeObserver(resize).observe(canvas);
  if (moonEl && document.fonts) document.fonts.ready.then(resize); // the moon is sized in the heading's ems
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(canvas);
  document.addEventListener("visibilitychange", kick);
  if (!still) window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    mx = (e.clientX / window.innerWidth) * 2 - 1; my = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
  resize();
}

/* Build each scene only when its canvas is about to scroll into view. */
const waiting = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { waiting.unobserve(e.target); mount(e.target); }
}, { rootMargin: "60% 0px" });
document.querySelectorAll("canvas[data-valley]").forEach((c) => waiting.observe(c));
