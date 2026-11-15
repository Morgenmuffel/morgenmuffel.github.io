/*
 * The valley: a small static 3D landscape drawn like an ink-and-wash illustration.
 *
 *   <canvas class="valley" data-valley="day|night"></canvas>
 *
 * How the look is made:
 *  - Every surface carries two colours and blends between them (usually bottom to top), so shapes are
 *    filled with soft gradients instead of realistic lighting.
 *  - Light is ambient: a gentle darkening on the side facing away from the light, plus cast shadows
 *    that land as flat darker shapes with no outline.
 *  - Distance fades everything towards the horizon colour, which keeps the picture near-monochrome.
 *  - A second, invisible drawing of the scene records object ids, surface direction and distance; a
 *    final pass draws a thin line wherever those jump (silhouettes, creases, the snow line).
 * Only the sea moves; the camera drifts a few degrees with the mouse.
 */
import * as THREE from "./vendor/three.module.min.js";

THREE.ColorManagement.enabled = false; // colours are written exactly as the hex values below

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const C = {
  paper: "#EEF0F4", white: "#FFFFFF", ink: "#050505",
  mist: "#DCE4FD", pale: "#B9C6F5", blue: "#5F86FF", deep: "#2A56EB", navy: "#16276B", night: "#0A1233",
  gold: "#C49A09", sun: "#E6C046", red: "#D4573B", rust: "#A9402A",
};
/* Pairs are [top or far colour, bottom or near colour]. */
const THEMES = {
  day: {
    zenith: "#C9D5FB", horizon: "#F5F7FC", fog: "#F5F7FC", glow: C.white, line: C.night, shade: C.navy,
    glowK: [0.75, 26], blotch: 1, fogK: 0.0018, light: [-0.6, 0.55, -0.25],
    meadow: ["#C6D2FC", "#8AA4FF"], sand: C.mist, flowers: C.sun,
    rock: [C.blue, "#AFC0FA"], snow: [C.white, C.mist], hill: [C.deep, C.blue],
    sea: C.deep, dashA: C.white, dashB: C.blue,
    wall: [C.blue, C.deep], roof: [C.red, C.rust], trim: [C.white, C.mist], pane: [C.navy, C.navy], paneLit: 1,
    stone: [C.white, C.pale], wood: [C.ink, C.ink],
    crowns: [[C.deep, C.navy], [C.navy, C.night], [C.sun, C.gold]], spruce: [C.navy, C.night],
    disc: [C.sun, C.sun], cloud: [C.white, C.mist], stars: null,
    view: { pos: [-4, 10, 66], tgt: [8, 13, -30], fov: 34 },
  },
  night: {
    // a flat black sky: the moon, the stars and the snow are the only light things in it
    zenith: C.ink, horizon: C.ink, fog: C.navy, glow: C.pale, line: C.ink, shade: "#02040C",
    glowK: [0, 90], blotch: 0, fogK: 0.0007, light: [-0.75, 0.55, 0.2], // lit from the viewer's side, so snow and walls face the light
    meadow: [C.navy, C.night], sand: C.deep, flowers: C.sun,
    rock: [C.blue, C.deep], snow: [C.white, C.mist], hill: [C.navy, C.night],
    sea: C.deep, dashA: C.blue, dashB: C.navy,
    wall: [C.blue, C.deep], roof: [C.red, C.rust], trim: [C.white, C.pale], pane: [C.sun, C.sun], paneLit: 0,
    stone: [C.white, C.pale], wood: [C.ink, C.ink],
    crowns: [[C.deep, C.navy], [C.navy, C.night], [C.blue, C.deep]], spruce: [C.navy, C.night],
    disc: [C.paper, C.paper], cloud: null, stars: [C.paper, C.paper],
    view: { pos: [-44, 7, 38], tgt: [54, 25, -47], fov: 36 },
  },
};
const PAIRS = ["meadow", "rock", "hill", "wall", "roof", "trim", "pane", "stone", "wood", "spruce", "disc", "cloud", "stars"];

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

/* ---------- the land ---------- */
const RIVER = [[-6, 82], [4, 44], [-8, 16], [6, -8], [-4, -28], [-16, -48]];
function riverDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
const HOUSE = [32, -34], MOON = [860, 300, -300];
function height(x, z) {
  let h = 2.2 + (noise(x * 0.03 + 3, z * 0.03 + 7) - 0.5) * 4.5 + (noise(x * 0.07, z * 0.07) - 0.5) * 1.0;
  h += ss(30, 70, z) * ss(14, 60, Math.abs(x + 2)) * 5;                          // shoulders framing the foreground
  h += 4.5 * Math.exp(-((x - HOUSE[0]) ** 2 + (z - HOUSE[1]) ** 2) / 260);       // knoll under the house
  h += ss(45, 130, x) * ss(-40, -150, z) * 16;                                   // foothills on the right
  const shore = -z - (40 + 0.5 * x + 7 * Math.sin(x * 0.06));                    // the coast runs diagonally
  const sea = Math.max(ss(-3, 9, shore) * (1 - ss(22, 58, x)), ss(-228, -256, z));
  h = h * (1 - sea) - 2.5 * sea;
  const r = ss(7, 2.5, riverDist(x, z));                                          // the river is carved below sea level
  return h > -1 ? h * (1 - r) - 1 * r : h;
}

/* ---------- geometry builder: everything static ends up in one mesh ---------- */
class Builder {
  constructor() { this.p = []; this.n = []; this.a = []; this.b = []; this.g = []; this.i = []; this.m = []; this.s = []; this.next = 2; }
  id() { return this.next++; }
  /* A style is how a surface is painted: its two colours, its outline group (id),
     whether it is shaded at all (lit), how much distance haze it gets, and an optional snow line height. */
  style(pair, o = {}) {
    return { A: pair[0], B: pair[1], id: o.id ?? this.id(), lit: o.lit ?? 1, fog: o.fog ?? 1, snow: o.snow ?? 0, range: o.range };
  }
  vert(st, p, n, g) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.a.push(st.A[0], st.A[1], st.A[2]); this.b.push(st.B[0], st.B[1], st.B[2]);
    this.g.push(g); this.i.push(st.id); this.m.push(st.lit, st.fog); this.s.push(st.snow);
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
  /* A tapered tube along a path, for trunks and branches. */
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
        P.push([p.x, p.y, p.z]); N.push([d.x, d.y, d.z]); G.push(0.5);
      }
    }
    const end = pts[pts.length - 1], tip = end.clone().sub(pts[pts.length - 2]).normalize();
    for (let j = 0; j < segs; j++) { P.push([end.x, end.y, end.z]); N.push([tip.x, tip.y, tip.z]); G.push(0.5); }
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
  build() {
    const g = new THREE.BufferGeometry(), f = (arr, n) => new THREE.Float32BufferAttribute(arr, n);
    g.setAttribute("position", f(this.p, 3)); g.setAttribute("normal", f(this.n, 3));
    g.setAttribute("aA", f(this.a, 3)); g.setAttribute("aB", f(this.b, 3)); g.setAttribute("aG", f(this.g, 1));
    g.setAttribute("aId", f(this.i, 1)); g.setAttribute("aM", f(this.m, 2)); g.setAttribute("aS", f(this.s, 1));
    return g;
  }
}
const M = (x, y, z, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), V3(sx, sy, sz));

function terrain(B, T) {
  const x0 = -204, x1 = 224, z0 = -264, z1 = 84, step = 3.5;
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

/* Mountains are spun shapes with three sharp ridges and a broad lobe: pointed (peak) or domed (hill). */
function mountain(B, st, cx, cz, R, h, baseY, seed, shape = "peak") {
  const rnd = rngFrom(seed), rows = 30, cols = 56;
  const p1 = rnd() * 6.28, p2 = rnd() * 6.28, lx = (rnd() - 0.5) * R * 0.3, lz = (rnd() - 0.5) * R * 0.3;
  const [a, b] = shape === "peak" ? [1, 1.55] : [2.1, 0.62];
  B.surface(st, rows, cols, (i, j) => {
    const t = i / (rows - 1), th = j / cols * Math.PI * 2;
    const ridge = 1 - 2 * Math.abs(Math.sin(1.5 * th + p1));
    const r = R * Math.pow(1 - Math.pow(t, a), b) * (1 + (shape === "peak" ? 0.2 : 0.08) * ridge * (1 - 0.45 * t) + 0.13 * Math.cos(2 * th + p2) * (1 - t));
    return [cx + lx * t + Math.cos(th) * r, baseY + h * t, cz + lz * t + Math.sin(th) * r];
  });
  return [cx + lx, baseY + h, cz + lz];
}

/* ---------- trees ---------- */
function roundTree(B, T, x, z, s, pair, rnd) {
  const y = height(x, z) - 0.2, lx = (rnd() - 0.5) * 1.2 * s, lz = (rnd() - 0.5) * 1.2 * s;
  const wood = B.style(T.wood, { lit: 0 });
  B.tube(wood, [V3(x, y, z), V3(x + lx * 0.15, y + 1.3 * s, z + lz * 0.15), V3(x + lx * 0.6, y + 3 * s, z + lz * 0.6), V3(x + lx, y + 4.6 * s, z + lz)],
    [0.5 * s, 0.27 * s, 0.21 * s, 0.15 * s], 8);
  const cx = x + lx, cy = y + 5.6 * s, cz = z + lz;
  const crown = B.style(pair, { range: [cy - 2.2 * s, cy + 3 * s] });
  const blob = (ox, oy, oz, r, detail) => B.add(crown, new THREE.IcosahedronGeometry(r * s, detail), M(cx + ox * s, cy + oy * s, cz + oz * s, 1, 0.92, 1, rnd() * 6));
  blob(0, 0, 0, 2.15, 3);
  const n = 5, turn = rnd() * 6.28;
  for (let k = 0; k < n; k++) {
    const a = turn + k / n * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    blob(Math.cos(a) * 1.5, -0.55 + rnd() * 0.9, Math.sin(a) * 1.5, 1.2 + rnd() * 0.35, 2);
  }
  blob((rnd() - 0.5) * 0.8, 1.45, (rnd() - 0.5) * 0.8, 1.35, 2);
}

function spruce(B, T, x, z, s) {
  const y = height(x, z) - 0.2;
  B.tube(B.style(T.wood, { lit: 0 }), [V3(x, y, z), V3(x, y + 1.6 * s, z)], [0.3 * s, 0.22 * s], 7);
  const tiers = 5, top = y + (1.1 + tiers * 1.5 + 1.2) * s, st = B.style(T.spruce, { range: [y + s, top] });
  for (let k = 0; k < tiers; k++) {
    const yb = (1.1 + k * 1.5) * s, r = (2.5 - k * 0.42) * s, hgt = 2.7 * s;
    B.revolve(st, [[0.12 * s, yb + 0.5 * s], [r * 0.86, yb], [r, yb + 0.14 * s], [r * 0.62, yb + hgt * 0.34], [r * 0.3, yb + hgt * 0.7], [0.02, yb + hgt]], 18, x, y, z, 1, k * 0.7);
  }
}

function bareTree(B, T, x, z, s, rnd) {
  const st = B.style(T.wood, { lit: 0 });
  const limb = (from, dir, len, r, depth) => {
    const pts = [from.clone()], radii = [r], d = dir.clone(), cur = from.clone(), steps = 3;
    for (let k = 1; k <= steps; k++) {
      d.add(V3((rnd() - 0.5) * 0.35, 0.16, (rnd() - 0.5) * 0.35)).normalize();
      cur.add(d.clone().multiplyScalar(len / steps)); pts.push(cur.clone());
      radii.push(r * (1 - 0.2 * k) * (depth ? 1 : 1 - 0.28 * k));
    }
    B.tube(st, pts, radii, depth === 2 ? 9 : 6);
    if (!depth) return;
    const forks = depth === 2 ? 3 : 2, turn = rnd() * 6.28;
    for (let k = 0; k < forks; k++) {
      const a = turn + k / forks * Math.PI * 2, spread = 0.55 + rnd() * 0.3;
      const nd = d.clone().multiplyScalar(Math.cos(spread)).add(V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(Math.sin(spread))).normalize();
      limb(cur, nd, len * (0.62 + rnd() * 0.15), radii[steps] * 0.82, depth - 1);
    }
  };
  const y = height(x, z) - 0.3;
  B.revolve(st, [[0.95 * s, 0], [0.62 * s, 0.35 * s], [0.5 * s, 0.9 * s]], 9, x, y, z); // flared foot
  limb(V3(x, y + 0.5 * s, z), V3((rnd() - 0.5) * 0.2, 1, (rnd() - 0.5) * 0.2).normalize(), 4.4 * s, 0.5 * s, 2);
}

/* ---------- buildings ---------- */
function house(B, T) {
  const [x, z] = HOUSE, s = 0.9, y = height(x, z) - 0.5;
  const at = (lx, ly, lz, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) => M(x + lx * s, y + ly * s, z + lz * s, sx * s, sy * s, sz * s, ry, rx, rz);
  const box = (st, w, h, d, ...m) => B.add(st, new THREE.BoxGeometry(w, h, d), at(...m));
  const wallR = (ly) => 3.4 - 0.5 * (ly - 0.8) / 14;
  const out = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];
  const trim = () => B.style(T.trim), red = () => B.style(T.roof), stone = () => B.style(T.stone);

  B.revolve(stone(), [[4.1, 0], [3.9, 0.8], [0.1, 0.8]], 36, x, y, z, s);                                           // stone foot
  B.revolve(B.style(T.wall), [[3.4, 0.8], [2.9, 14.8]], 44, x, y, z, s);                            // the round tower
  for (const ly of [5.6, 10.2]) B.revolve(trim(), [[wallR(ly) + 0.02, ly - 0.12], [wallR(ly) + 0.14, ly - 0.06], [wallR(ly) + 0.14, ly + 0.06], [wallR(ly) + 0.02, ly + 0.12]], 44, x, y, z, s);
  // pointed roof with flared eaves, a spire and a pennant
  B.revolve(red(), [[2.8, 14.9], [4.7, 14.6], [4.75, 14.85], [3.6, 15.9], [2.5, 17.7], [1.5, 19.9], [0.7, 21.9], [0.16, 23.4], [0.02, 23.7]], 44, x, y, z, s);
  B.add(B.style(T.wood, { lit: 0 }), new THREE.CylinderGeometry(0.05, 0.07, 2.6, 6), at(0, 24.6, 0));
  B.add(B.style(T.disc, { lit: 0 }), new THREE.SphereGeometry(0.22, 12, 8), at(0, 25.9, 0));
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

function observatory(B, T, p) {
  const s = 1.3, [x, y, z] = p;
  const white = (o) => B.style(T.trim, { ...o });
  B.revolve(B.style(T.stone), [[4.2, -1.2], [3.6, 0.5], [0.1, 0.5]], 30, x, y, z, s);           // rock plinth
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
  const B = new Builder(), rnd = rngFrom(7);
  terrain(B, T);

  // far range on the right; the tallest peak carries the observatory
  const peak = mountain(B, B.style(T.rock, { snow: 5 + 56 * 0.6 }), 132, -184, 54, 56, 5, 11);
  mountain(B, B.style(T.rock, { snow: 5 + 40 * 0.68 }), 82, -172, 46, 40, 5, 12);
  mountain(B, B.style(T.rock, { snow: 3 + 46 * 0.66 }), 56, -212, 44, 46, 3, 13);
  mountain(B, B.style(T.rock, { snow: 5 + 50 * 0.64 }), 190, -200, 50, 50, 5, 14);
  mountain(B, B.style(T.rock, { snow: 3 + 52 * 0.62 }), 118, -236, 56, 52, 3, 15);
  observatory(B, T, [peak[0], peak[1] - 4.5, peak[2]]);

  // rounded hills and islands on the left, standing in the sea
  for (const [x, z, r, h, seed] of [[-64, -72, 24, 22, 21], [-92, -52, 20, 15, 22], [-40, -100, 22, 17, 23], [-118, -104, 30, 27, 24], [-150, -70, 22, 14, 25], [-14, -150, 13, 7, 26], [6, -118, 8, 4.5, 27]])
    mountain(B, B.style(T.hill), x, z, r, h, -1.5, seed, "hill");

  house(B, T);

  // trees: a few placed by hand where they frame the view, the rest scattered on the meadow
  const plant = (x, z, s, kind) => {
    if (height(x, z) < 1.2) return;
    if (kind === 0) bareTree(B, T, x, z, s, rnd);
    else if (kind === 1) spruce(B, T, x, z, s);
    else roundTree(B, T, x, z, s, T.crowns[kind - 2], rnd);
  };
  const spots = [[19, -30, 1.05, 2], [44, -40, 0.8, 1], [48, -36, 1.0, 1], [41, -28, 0.7, 4], [-26, -6, 1.1, 0], [24, 8, 1.15, 0], [-34, -10, 0.9, 2], [-42, -4, 0.75, 3], [52, -8, 1.0, 2], [58, -14, 0.8, 1], [14, -22, 0.7, 1]];
  for (const [x, z, s, kind] of spots) plant(x, z, s, kind);
  let placed = 0, tries = 0;
  while (placed < 12 && tries++ < 900) {
    const x = -62 + rnd() * 136, z = -56 + rnd() * 70;
    if (height(x, z) < 1.4 || riverDist(x, z) < 10 || Math.hypot(x - HOUSE[0], z - HOUSE[1]) < 16) continue;
    if (z > 4 && Math.abs(x + 2) < 30) continue;          // keep the view open in front of the hero camera
    if (Math.hypot(x + 44, z - 38) < 48) continue;        // and in front of the footer camera
    if (spots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 9)) continue;
    spots.push([x, z]);
    const k = rnd();
    plant(x, z, 0.6 + rnd() * 0.45, k < 0.25 ? 0 : k < 0.55 ? 1 : k < 0.8 ? 2 : k < 0.93 ? 3 : 4);
    placed++;
  }

  // sky
  const flat = { lit: 0, fog: 0 };
  if (T.stars) {
    B.add(B.style(T.disc, flat), new THREE.CircleGeometry(26, 56), M(...MOON, 1, 1, 1, -1.21));
    const st = B.style(T.stars, { ...flat, id: 1 }); // same id as the sky, so stars get no outline
    for (let k = 0; k < 120; k++) {
      const s = 1.2 + rnd() * 2.6;
      B.add(st, new THREE.PlaneGeometry(1, 1), M(-900 + rnd() * 1900, 70 + rnd() * 640, -1200, s, s, s, 0, 0, Math.PI / 4));
    }
  } else {
    B.add(B.style(T.disc, flat), new THREE.CircleGeometry(46, 72), M(-110, 20, -700));
    for (const [x, y, z, w] of [[-330, 150, -820, 64], [80, 210, -900, 84], [340, 125, -800, 56]]) {
      const st = B.style(T.cloud, { fog: 0, lit: 0.35, range: [y - w * 0.14, y + w * 0.2] });
      for (const [ox, oy, sc] of [[0, 0, 1], [-0.6, -0.03, 0.62], [0.58, -0.02, 0.7], [0.15, 0.07, 0.6]])
        B.add(st, new THREE.IcosahedronGeometry(1, 3), M(x + ox * w, y + oy * w, z, w * sc * 0.62, w * sc * 0.15, w * sc * 0.3));
    }
  }

  const S = new Builder(), E = 4000, sea = S.style([[0, 0, 0], [0, 0, 0]], { id: 1 });
  const P = [[-E, 0, -E], [-E, 0, E], [E, 0, E], [E, 0, -E]], N = P.map(() => [0, 1, 0]), G = [0, 0, 0, 0];
  S.tri(sea, P, N, G, 0, 1, 2); S.tri(sea, P, N, G, 0, 2, 3);
  return { land: B.build(), sea: S.build() };
}

/* ---------- shaders ---------- */
const FAR = 3200;
const u3 = (hex) => ({ value: new THREE.Vector3(...rgb(hex)) });
const NOISE = `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float h11(float n){ return fract(sin(n * 127.1) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h21(i), h21(i+vec2(1.,0.)), f.x), mix(h21(i+vec2(0.,1.)), h21(i+vec2(1.,1.)), f.x), f.y); }`;
const SNOWLINE = "float snowLine(vec3 w, float s){ return s + 3.2*sin(w.x*0.2 + w.z*0.16) + 1.7*sin(w.x*0.6 - w.z*0.47); }";

const colMat = (T, L) => new THREE.ShaderMaterial({
  uniforms: {
    tS: { value: null }, uSM: { value: new THREE.Matrix4() }, uSTex: { value: 1 / 2048 }, uL: { value: L },
    uShade: u3(T.shade), uFog: u3(T.fog), uSnowA: u3(T.snow[0]), uSnowB: u3(T.snow[1]),
    uSand: u3(T.sand), uFlowers: u3(T.flowers), uFogK: { value: T.fogK }, uBlotch: { value: T.blotch },
  },
  vertexShader: `
    attribute vec3 aA, aB; attribute vec2 aM; attribute float aG, aS; uniform mat4 uSM;
    varying vec3 vA, vB, vN, vW; varying vec2 vM; varying float vG, vS; varying vec4 vSh;
    void main(){ vA=aA; vB=aB; vM=aM; vG=aG; vS=aS; vN=normal; vW=position;
      vSh = uSM * vec4(position + normal*0.3, 1.); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tS; uniform vec3 uL, uShade, uFog, uSnowA, uSnowB, uSand, uFlowers; uniform float uFogK, uSTex, uBlotch;
    varying vec3 vA, vB, vN, vW; varying vec2 vM; varying float vG, vS; varying vec4 vSh;
    ${NOISE} ${SNOWLINE}
    float occluded(vec2 uv, float z){ return step(texture2D(tS, uv).r + 0.0006, z); }
    void main(){
      vec3 N = normalize(vN);
      vec3 base = mix(vB, vA, smoothstep(0., 1., vG));
      float patch_ = vn(vW.xz*0.06 + vec2(11., 5.)), pw = fwidth(patch_);
      if (vS > 0.5) {                                   // mountains: snow above a wavy line
        float line = snowLine(vW, vS);
        if (vW.y > line) base = mix(uSnowB, uSnowA, clamp((vW.y - line) / 12., 0., 1.));
      } else if (vS < -0.5) {                           // the ground: pale sand at the water, loose patches of flowers
        base = mix(base, uFlowers, smoothstep(0.7 - pw, 0.7 + pw, patch_) * uBlotch * step(1.2, vW.y));
        base = mix(uSand, base, smoothstep(0.1, 0.32, vW.y));
      }
      // ambient light: a soft falloff on the far side, and cast shadows as flat shapes
      float form = 1. - smoothstep(0.22, 0.72, dot(N, uL)*0.5 + 0.5);
      vec3 sp = vSh.xyz*0.5 + 0.5; float shadow = 0.;
      if (sp.x > 0. && sp.x < 1. && sp.y > 0. && sp.y < 1. && sp.z < 1.) {
        float o = uSTex*0.75;
        shadow = 0.25*(occluded(sp.xy + vec2(o, o), sp.z) + occluded(sp.xy + vec2(-o, o), sp.z) + occluded(sp.xy + vec2(o, -o), sp.z) + occluded(sp.xy + vec2(-o, -o), sp.z));
      }
      float dark = max(form*0.85, shadow) * vM.x;
      vec3 col = mix(base, uShade, 0.55*dark);
      col = mix(col, uFog, (1. - exp(-length(vW - cameraPosition)*uFogK)) * vM.y);
      gl_FragColor = vec4(col, 1.);
    }`,
});
const dataMat = () => new THREE.ShaderMaterial({
  uniforms: { uFar: { value: FAR } },
  vertexShader: "attribute float aId, aS; varying vec3 vN, vW; varying float vId, vZ, vS; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalMatrix*normal; vId=aId; vS=aS; vW=position; vZ=-mv.z; gl_Position=projectionMatrix*mv; }",
  fragmentShader: `uniform float uFar; varying vec3 vN, vW; varying float vId, vZ, vS; ${SNOWLINE}
    void main(){ float id = vId + ((vS > 0.5 && vW.y > snowLine(vW, vS)) ? 500. : 0.); gl_FragColor = vec4(normalize(vN).xy, id, clamp(vZ/uFar, 0., 1.)); }`,
  blending: THREE.NoBlending,
});
const depthMat = () => new THREE.ShaderMaterial({
  vertexShader: "void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader: "void main(){ gl_FragColor=vec4(gl_FragCoord.z, 0., 0., 1.); }",
  side: THREE.DoubleSide, blending: THREE.NoBlending,
});
const seaMat = (T) => new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uBase: u3(T.sea), uA: u3(T.dashA), uB: u3(T.dashB), uFog: u3(T.fog), uFogK: { value: T.fogK } },
  vertexShader: "varying vec3 vW; void main(){ vW=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader: `
    uniform float uT, uFogK; uniform vec3 uBase, uA, uB, uFog; varying vec3 vW; ${NOISE}
    void main(){
      // wave marks: short dashes in rows, each row drifting at its own pace and bobbing a little
      vec2 p = mat2(0.94, -0.34, 0.34, 0.94)*vW.xz;
      float dist = length(vW - cameraPosition);
      float sp = 2.4, row = floor(p.y/sp);
      float fy = fract(p.y/sp) - 0.5 + sin(p.x*0.3 + uT*0.9 + row*1.7)*0.16;
      float u = p.x/7. + h11(row)*31. + uT*(0.03 + 0.07*h11(row + 7.))*(h11(row + 3.) > 0.5 ? 1. : -1.);
      float cell = floor(u), f = fract(u), len = 0.22 + 0.5*h11(cell*1.3 + row*13.);
      float on = step(0.42, h11(cell*2.1 + row*5.3));
      float wy = fwidth(fy), wx = fwidth(f);
      float a = (1. - smoothstep(0.07 - wy, 0.07 + wy, abs(fy))) * smoothstep(0., wx, f) * (1. - smoothstep(len - wx, len + wx, f)) * on;
      a *= 1. - smoothstep(90., 260., dist);
      vec3 col = mix(uBase, h11(cell + row*3.) > 0.4 ? uA : uB, a*0.9);
      gl_FragColor = vec4(mix(col, uFog, 1. - exp(-dist*uFogK*1.25)), 1.);
    }`,
});
const skyMat = (T, sunDir) => new THREE.ShaderMaterial({
  uniforms: { uZen: u3(T.zenith), uHor: u3(T.horizon), uGlow: u3(T.glow), uSun: { value: sunDir }, uGlowK: { value: new THREE.Vector2(...T.glowK) } },
  vertexShader: "varying vec3 vW; void main(){ vW=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader: `
    uniform vec3 uZen, uHor, uGlow, uSun; uniform vec2 uGlowK; varying vec3 vW;
    void main(){
      vec3 d = normalize(vW - cameraPosition);
      vec3 col = mix(uHor, uZen, pow(clamp(d.y*2.4, 0., 1.), 0.75));        // glow at the horizon, deeper overhead
      col = mix(col, uGlow, uGlowK.x*pow(max(dot(d, uSun), 0.), uGlowK.y));
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

/* ---------- one canvas ---------- */
function mount(canvas) {
  const T0 = THEMES[canvas.dataset.valley] || THEMES.day, T = {};
  for (const [k, v] of Object.entries(T0)) T[k] = k === "crowns" ? v.map((p) => p.map(rgb)) : PAIRS.includes(k) && v ? v.map(rgb) : v;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" }); } catch { return; }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);

  const L = V3(...T.light).normalize();
  const pos = V3(...T.view.pos), tgt = V3(...T.view.tgt), arm = V3();
  const discAt = T.stars ? V3(...MOON) : V3(-110, 30, -700);
  const geo = buildWorld(T);
  const mats = { col: colMat(T, L), data: dataMat(), depth: depthMat(), sea: seaMat(T), sky: skyMat(T, discAt.clone().sub(pos).normalize()), ink: inkMat(T) };
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

  // cast shadows: one picture of the middle of the valley as seen from the light, taken once
  const SM = 2048, rtS = new THREE.WebGLRenderTarget(SM, SM, near);
  const ext = 105, centre = V3(4, 0, -8), lightCam = new THREE.OrthographicCamera(-ext, ext, ext, -ext, 1, 800);
  lightCam.position.copy(centre).add(L.clone().multiplyScalar(400)); lightCam.lookAt(centre); lightCam.updateMatrixWorld();
  sky.visible = sea.visible = false; land.material = mats.depth;
  renderer.setRenderTarget(rtS); renderer.setClearColor(new THREE.Color(1, 1, 1), 1); renderer.render(scene, lightCam);
  sky.visible = sea.visible = true;
  mats.col.uniforms.tS.value = rtS.texture; mats.col.uniforms.uSTex.value = 1 / SM;
  mats.col.uniforms.uSM.value.multiplyMatrices(lightCam.projectionMatrix, lightCam.matrixWorldInverse);

  const blank = new THREE.Color(0, 0, 0), bg = new THREE.Color(0, 0, 1); // the background shares the sea's id, so the horizon gets no line
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pinned = canvas.hasAttribute("data-pinned"), look = V3(), fwd = V3(); // a pinned scene stays put while the page slides over it
  let mx = 0, my = 0, visible = false, raf = 0, shown = false, last = 0;
  const ease = { y1: 0, y2: 0, p1: 0, p2: 0 };

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
    draw(performance.now());
  }
  function draw(t) {
    // the mouse sets where the camera wants to be; two slow followers in a row give it a soft start and a soft stop
    const dt = Math.min(0.1, last ? (t - last) / 1000 : 0.016), k = 1 - Math.exp(-dt / 0.55); last = t;
    ease.y1 += (mx * -0.07 - ease.y1) * k; ease.y2 += (ease.y1 - ease.y2) * k;
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
    mats.sea.uniforms.uT.value = still ? 0 : t / 1000;
    sky.visible = true; land.material = mats.col; sea.material = mats.sea;
    renderer.setRenderTarget(rtC); renderer.setClearColor(blank, 1); renderer.render(scene, camera);
    sky.visible = false; land.material = sea.material = mats.data;
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
