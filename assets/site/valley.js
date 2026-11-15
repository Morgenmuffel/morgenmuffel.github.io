/*
 * The valley: a small static 3D landscape drawn like a flat ink-and-colour illustration.
 *
 *   <canvas class="valley" data-valley="day|night"></canvas>
 *
 * How the flat look works: every triangle gets one of two flat tones (lit or shaded, decided once at
 * build time), so nothing is smoothly shaded. The scene is drawn twice per frame: once in colour and
 * once into a data buffer holding surface direction, an object id and distance. A final pass draws an
 * ink line wherever that data jumps (a new object, a sharp crease, or something in front of something
 * else). Only the sea moves; the camera orbits a few degrees with the mouse.
 */
import * as THREE from "./vendor/three.module.min.js";

THREE.ColorManagement.enabled = false; // colours are written exactly as the hex values below

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const C = {
  paper: "#EEF0F4", white: "#FFFFFF", ink: "#050505",
  blue: "#5F86FF", deep: "#2A56EB", navy: "#16276B", night: "#0A1233", pale: "#B9C6F5",
  gold: "#C49A09", sun: "#E6C046", magenta: "#D9278F", plum: "#9C1565",
};
const THEMES = {
  day: {
    sky: C.paper, line: C.ink,
    meadow: [C.sun, C.gold], blotch: [C.gold, C.gold], sand: [C.white, C.pale],
    rock: [C.blue, C.deep], snow: [C.white, C.pale], hill: [C.deep, C.navy],
    sea: C.deep, dashA: C.white, dashB: C.blue,
    house: [C.blue, C.deep], roof: [C.magenta, C.plum], window: [C.white, C.white], trim: [C.white, C.pale],
    trunk: [C.ink, C.ink], crowns: [[C.magenta, C.plum], [C.deep, C.navy], [C.ink, C.ink]],
    disc: [C.sun, C.sun], cloud: [C.white, C.pale], stars: null,
    view: { pos: [-4, 10, 66], tgt: [8, 13, -30], fov: 34 },
  },
  night: {
    sky: C.ink, line: C.ink,
    meadow: [C.navy, C.night], blotch: [C.night, C.night], sand: [C.blue, C.deep],
    rock: [C.deep, C.navy], snow: [C.white, C.pale], hill: [C.navy, C.night],
    sea: C.deep, dashA: C.blue, dashB: C.navy,
    house: [C.blue, C.deep], roof: [C.magenta, C.plum], window: [C.sun, C.sun], trim: [C.white, C.pale],
    trunk: [C.ink, C.ink], crowns: [[C.magenta, C.plum], [C.deep, C.night], [C.night, C.night]],
    disc: [C.paper, C.paper], cloud: null, stars: [C.paper, C.paper],
    view: { pos: [-44, 7, 38], tgt: [54, 15, -47], fov: 36 },
  },
};

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
const HOUSE = [32, -34];
function height(x, z) {
  let h = 2.2 + (noise(x * 0.035 + 3, z * 0.035 + 7) - 0.5) * 4.5 + (noise(x * 0.09, z * 0.09) - 0.5) * 1.4;
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
const LIGHT = new THREE.Vector3(-0.55, 0.6, 0.58).normalize();
class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; this.next = 2; }
  id() { return this.next++; }
  tri(a, b, c, paint, id, na, nb, nc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
    const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const pair = typeof paint === "function" ? paint(cen, [fx, fy, fz]) : paint;
    const col = fx * LIGHT.x + fy * LIGHT.y + fz * LIGHT.z > 0.3 ? pair[0] : pair[1];
    const f = [fx, fy, fz];
    this.p.push(...a, ...b, ...c);
    this.n.push(...(na || f), ...(nb || f), ...(nc || f));
    this.c.push(...col, ...col, ...col);
    this.i.push(id, id, id);
  }
  /* smooth = keep the shape's own rounded normals, so curved surfaces get no facet lines */
  add(geo, m, paint, id = this.id(), smooth = false) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    g.applyMatrix4(m);
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    for (let k = 0; k < P.length; k += 9) {
      const v = (o) => [P[k + o], P[k + o + 1], P[k + o + 2]], w = (o) => [N[k + o], N[k + o + 1], N[k + o + 2]];
      this.tri(v(0), v(3), v(6), paint, id, smooth ? w(0) : null, smooth ? w(3) : null, smooth ? w(6) : null);
    }
    g.dispose();
    return id;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute("aId", new THREE.Float32BufferAttribute(this.i, 1));
    return g;
  }
}
const M = (x, y, z, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), new THREE.Vector3(sx, sy, sz));

function terrain(B, T) {
  const x0 = -204, x1 = 224, z0 = -264, z1 = 84, step = 4, id = B.id();
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step), V = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * step + (hash2(i, j) - 0.5) * 2.2, z = z0 + j * step + (hash2(j + 40, i) - 0.5) * 2.2;
    V.push([x, height(x, z), z]);
  }
  const paint = (c) => {
    if (c[1] < 0.2) return T.sand;
    if (c[1] > 12.5 + noise(c[0] * 0.07, c[2] * 0.07) * 4) return T.rock;
    return noise(c[0] * 0.06 + 11, c[2] * 0.06 + 5) > 0.62 ? T.blotch : T.meadow;
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = V[j * (nx + 1) + i], b = V[j * (nx + 1) + i + 1], c = V[(j + 1) * (nx + 1) + i], d = V[(j + 1) * (nx + 1) + i + 1];
    if (Math.max(a[1], b[1], c[1], d[1]) < -0.4) continue; // under water
    if ((i + j) % 2) { B.tri(a, c, b, paint, id); B.tri(b, c, d, paint, id); } else { B.tri(a, c, d, paint, id); B.tri(a, d, b, paint, id); }
  }
}

function mountain(B, cx, cz, r, h, baseY, seed, rock, snow, snowLine = 0.6) {
  const rnd = rngFrom(seed), segs = 9, rings = 5, id = B.id(), R = [];
  for (let i = 0; i < rings; i++) {
    const t = i / rings, ring = [];
    for (let j = 0; j < segs; j++) {
      const ang = (j + (rnd() - 0.5) * 0.5) / segs * Math.PI * 2, rad = r * Math.pow(1 - t, 1.1) * (0.74 + rnd() * 0.5);
      ring.push([cx + Math.cos(ang) * rad, baseY + (i ? h * t * (0.82 + rnd() * 0.36) : 0), cz + Math.sin(ang) * rad]);
    }
    R.push(ring);
  }
  const apex = [cx + (rnd() - 0.5) * r * 0.12, baseY + h, cz + (rnd() - 0.5) * r * 0.12];
  const paint = (c) => (snow && (c[1] - baseY) / h > snowLine + (hash2(c[0], c[2]) - 0.5) * 0.14 ? snow : rock);
  const out = (a, b, c) => { // keep faces pointing away from the mountain's axis
    const mx = (a[0] + b[0] + c[0]) / 3 - cx, mz = (a[2] + b[2] + c[2]) / 3 - cz;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const fx = uy * vz - uz * vy, fz = ux * vy - uy * vx;
    if (fx * mx + fz * mz < 0) B.tri(a, c, b, paint, id); else B.tri(a, b, c, paint, id);
  };
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const k = (j + 1) % segs, a = R[i][j], b = R[i][k];
    if (i === rings - 1) out(a, b, apex);
    else { out(a, b, R[i + 1][j]); out(b, R[i + 1][k], R[i + 1][j]); }
  }
  return apex;
}

function tree(B, x, z, s, crown, T, rnd) {
  const y = height(x, z) - 0.2;
  if (!crown) { // bare ink tree
    const id = B.id(), th = 5.2 * s;
    B.add(new THREE.CylinderGeometry(0.1 * s, 0.34 * s, th, 5), M(x, y + th / 2, z), T.trunk, id, true);
    for (let k = 0; k < 4; k++) {
      const len = (1.6 + rnd() * 1.6) * s, ry = rnd() * 6.28, rz = 0.6 + rnd() * 0.5, by = y + th * (0.45 + k * 0.14);
      const dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(0, ry, rz, "YXZ")).multiplyScalar(len / 2);
      B.add(new THREE.CylinderGeometry(0.04 * s, 0.13 * s, len, 4), M(x + dir.x, by + dir.y, z + dir.z, 1, 1, 1, ry, 0, rz), T.trunk, id, true);
    }
    return;
  }
  const th = 2.6 * s, r = (1.7 + rnd() * 0.9) * s;
  B.add(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, th, 5), M(x, y + th / 2, z), T.trunk, B.id(), true);
  B.add(new THREE.IcosahedronGeometry(r, 1), M(x, y + th + r * 0.82, z, 1, 1.18, 1, rnd() * 6), crown, B.id(), true);
}

function house(B, T) {
  const [x, z] = HOUSE, s = 0.86, y = height(x, z) - 0.4;
  const at = (lx, ly, lz, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) => M(x + lx * s, y + ly * s, z + lz * s, sx * s, sy * s, sz * s, ry, rx, rz);
  const radius = (ly) => 3.4 - 0.4 * ly / 13;
  B.add(new THREE.CylinderGeometry(3.7, 3.9, 0.7, 20), at(0, 0.35, 0), T.trim, B.id(), true);               // plinth
  B.add(new THREE.CylinderGeometry(3, 3.4, 13, 22, 1, true), at(0, 7, 0), T.house, B.id(), true);            // tower
  const roof = B.id();
  B.add(new THREE.ConeGeometry(4.4, 6.6, 22, 1, true), at(0, 16.8, 0), T.roof, roof, true);
  B.add(new THREE.RingGeometry(2.9, 4.4, 22), at(0, 13.5, 0, 1, 1, 1, 0, Math.PI / 2), [T.roof[1], T.roof[1]], roof); // under the eaves
  const rows = [[4.3, [-1.5, -0.2]], [7.6, [-0.85, 0.45]], [10.8, [-1.5, -0.2]]];
  for (const [ly, angs] of rows) for (const a of angs) {
    const R = radius(ly - 0.5) + 0.02;
    B.add(new THREE.BoxGeometry(1.0, 1.5, 0.3), at(Math.sin(a) * R, ly, Math.cos(a) * R, 1, 1, 1, a), T.window);
  }
  const da = -0.85, R = radius(1) + 0.05, dx = Math.sin(da), dz = Math.cos(da);                              // door + porch
  B.add(new THREE.BoxGeometry(1.3, 2.4, 0.3), at(dx * R, 1.9, dz * R, 1, 1, 1, da), T.roof);
  B.add(new THREE.BoxGeometry(3.2, 0.35, 2.4), at(dx * (R + 1.1), 0.5, dz * (R + 1.1), 1, 1, 1, da), T.trim);
  B.add(new THREE.BoxGeometry(3.4, 0.3, 2.6), at(dx * (R + 1.1), 3.6, dz * (R + 1.1), 1, 1, 1, da, 0.16), T.roof);
  for (const side of [-1.4, 1.4]) {
    const px = dx * (R + 2.1) + Math.cos(da) * side, pz = dz * (R + 2.1) - Math.sin(da) * side;
    B.add(new THREE.CylinderGeometry(0.1, 0.1, 3, 5), at(px, 2.1, pz), T.trim, B.id(), true);
  }
  B.add(new THREE.BoxGeometry(0.7, 2.2, 0.7), at(1.5, 16.2, -1.2), T.trim);                                  // chimney
  const pole = B.id();
  B.add(new THREE.CylinderGeometry(0.06, 0.06, 3, 4), at(0, 21.4, 0), T.trunk, pole, true);                  // flag
  B.add(new THREE.BoxGeometry(1.7, 0.8, 0.06), at(0.9, 22.3, 0), T.window);
}

function observatory(B, T, p) {
  const s = 1.25, at = (ly, sx = 1, sy = sx, sz = sx) => M(p[0], p[1] + ly * s, p[2], sx * s, sy * s, sz * s);
  B.add(new THREE.CylinderGeometry(2.6, 3.1, 9, 20, 1, true), at(3.5), T.trim, B.id(), true);
  B.add(new THREE.CylinderGeometry(3.3, 3.3, 0.6, 20), at(8.1), T.trim, B.id(), true);
  B.add(new THREE.SphereGeometry(2.9, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), at(8.4), T.trim, B.id(), true);
  B.add(new THREE.BoxGeometry(0.7, 2.4, 3.2), M(p[0] - 0.9 * s, p[1] + 10.1 * s, p[2] + 1.6 * s, s, s, s, 0.5, -0.5), T.trunk); // the slit
  B.add(new THREE.BoxGeometry(0.9, 1.6, 0.3), M(p[0] - 1.6 * s, p[1] + 1.2 * s, p[2] + 2.5 * s, s, s, s, -0.55), T.roof);       // door
}

function buildWorld(T) {
  const B = new Builder(), rnd = rngFrom(7);
  terrain(B, T);

  // far range on the right, the tallest carries the observatory
  const peak = mountain(B, 132, -184, 50, 55, 5, 11, T.rock, T.snow, 0.58);
  mountain(B, 84, -172, 42, 38, 5, 12, T.rock, T.snow, 0.66);
  mountain(B, 58, -208, 40, 44, 3, 13, T.rock, T.snow, 0.64);
  mountain(B, 186, -200, 46, 50, 5, 14, T.rock, T.snow, 0.62);
  mountain(B, 122, -232, 52, 52, 3, 15, T.rock, T.snow, 0.6);
  observatory(B, T, [peak[0], peak[1] - 2.5, peak[2]]);

  // smaller hills and islands on the left, standing in the sea
  mountain(B, -64, -72, 22, 25, -2, 21, T.hill, null);
  mountain(B, -92, -52, 18, 17, -2, 22, T.hill, null);
  mountain(B, -40, -100, 20, 19, -2, 23, T.hill, null);
  mountain(B, -118, -104, 27, 30, -2, 24, T.hill, null);
  mountain(B, -150, -70, 20, 16, -2, 25, T.hill, null);
  mountain(B, -14, -150, 12, 8, -2, 26, T.hill, null);
  mountain(B, 6, -118, 7, 5, -2, 27, T.hill, null);

  house(B, T);

  // trees on the meadow, away from the water and the house
  let placed = 0, tries = 0;
  while (placed < 34 && tries++ < 600) {
    const x = -62 + rnd() * 136, z = -56 + rnd() * 84;
    if (height(x, z) < 1.3 || riverDist(x, z) < 9 || Math.hypot(x - HOUSE[0], z - HOUSE[1]) < 9) continue;
    if (z > 8 && Math.abs(x + 2) < 30) continue; // keep the view open in front of the hero camera
    if (Math.hypot(x + 44, z - 38) < 46) continue;  // and in front of the footer camera
    const k = rnd();
    tree(B, x, z, 0.55 + rnd() * 0.5, k < 0.24 ? null : T.crowns[k < 0.58 ? 0 : k < 0.84 ? 1 : 2], T, rnd);
    placed++;
  }

  // sky
  if (T.stars) {
    B.add(new THREE.CircleGeometry(26, 40), M(330, 215, -760, 1, 1, 1, -0.5), T.disc);
    const id = B.id();
    for (let k = 0; k < 110; k++) {
      const s = 1.2 + rnd() * 2.6;
      B.add(new THREE.PlaneGeometry(1, 1), M(-900 + rnd() * 1900, 60 + rnd() * 620, -1200, s, s, s, 0, 0, Math.PI / 4), T.stars, id);
    }
  } else {
    B.add(new THREE.CircleGeometry(46, 48), M(-110, 20, -700), T.disc);
    for (const [x, y, z, w] of [[-330, 150, -820, 70], [70, 205, -900, 90], [330, 120, -800, 60], [-120, 245, -900, 50]])
      B.add(new THREE.IcosahedronGeometry(1, 1), M(x, y, z, w, w * 0.16, w * 0.3), T.cloud, B.id(), true);
  }

  const S = new Builder(), E = 4000;
  S.tri([-E, 0, -E], [-E, 0, E], [E, 0, E], [[0, 0, 0], [0, 0, 0]], 1);
  S.tri([-E, 0, -E], [E, 0, E], [E, 0, -E], [[0, 0, 0], [0, 0, 0]], 1);
  return { land: B.build(), sea: S.build() };
}

/* ---------- shaders ---------- */
const FAR = 3000;
const colMat = () => new THREE.ShaderMaterial({
  vertexShader: "attribute vec3 aCol; varying vec3 vC; void main(){ vC=aCol; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader: "varying vec3 vC; void main(){ gl_FragColor=vec4(vC,1.); }",
});
const dataMat = () => new THREE.ShaderMaterial({
  uniforms: { uFar: { value: FAR } },
  vertexShader: "attribute float aId; varying vec3 vN; varying float vId; varying float vZ; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalMatrix*normal; vId=aId; vZ=-mv.z; gl_Position=projectionMatrix*mv; }",
  fragmentShader: "uniform float uFar; varying vec3 vN; varying float vId; varying float vZ; void main(){ gl_FragColor=vec4(normalize(vN).xy, vId, clamp(vZ/uFar,0.,1.)); }",
  blending: THREE.NoBlending,
});
const seaMat = (T) => new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uBase: { value: new THREE.Vector3(...rgb(T.sea)) }, uA: { value: new THREE.Vector3(...rgb(T.dashA)) }, uB: { value: new THREE.Vector3(...rgb(T.dashB)) } },
  vertexShader: "varying vec3 vW; void main(){ vW=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader: `
    uniform float uT; uniform vec3 uBase, uA, uB; varying vec3 vW;
    float h(float n){ return fract(sin(n*127.1)*43758.5453); }
    void main(){
      // short ink dashes in rows, each row drifting at its own pace and bobbing a little
      vec2 p = mat2(0.94,-0.34,0.34,0.94)*vW.xz;
      float sp = 2.6, row = floor(p.y/sp);
      float fy = fract(p.y/sp) - 0.5 + sin(p.x*0.3 + uT*0.9 + row*1.7)*0.16;
      float u = p.x/7. + h(row)*31. + uT*(0.03 + 0.07*h(row+7.))*(h(row+3.)>0.5?1.:-1.);
      float cell = floor(u), f = fract(u), len = 0.22 + 0.5*h(cell*1.3 + row*13.);
      float on = step(0.42, h(cell*2.1 + row*5.3));
      float wy = fwidth(fy), wx = fwidth(f);
      float a = (1. - smoothstep(0.1 - wy, 0.1 + wy, abs(fy))) * smoothstep(0., wx, f) * (1. - smoothstep(len - wx, len + wx, f)) * on;
      a *= 1. - smoothstep(110., 300., length(vW.xz - cameraPosition.xz));
      gl_FragColor = vec4(mix(uBase, h(cell + row*3.) > 0.4 ? uA : uB, a), 1.);
    }`,
});
const inkMat = (T) => new THREE.ShaderMaterial({
  uniforms: { tC: { value: null }, tG: { value: null }, uPx: { value: new THREE.Vector2() }, uLine: { value: new THREE.Vector3(...rgb(T.line)) } },
  vertexShader: "varying vec2 vUv; void main(){ vUv=position.xy*0.5+0.5; gl_Position=vec4(position.xy,0.,1.); }",
  fragmentShader: `
    uniform sampler2D tC, tG; uniform vec2 uPx; uniform vec3 uLine; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tG, vUv);
      vec4 l = texture2D(tG, vUv - vec2(uPx.x, 0.)), r = texture2D(tG, vUv + vec2(uPx.x, 0.));
      vec4 d = texture2D(tG, vUv - vec2(0., uPx.y)), u = texture2D(tG, vUv + vec2(0., uPx.y));
      float idE = step(0.5, max(max(abs(l.b - c.b), abs(r.b - c.b)), max(abs(d.b - c.b), abs(u.b - c.b))));
      float nE = step(0.5, max(max(distance(l.rg, c.rg), distance(r.rg, c.rg)), max(distance(d.rg, c.rg), distance(u.rg, c.rg))));
      float w = 1. / c.a; // 1/distance is flat across a plane, so only real steps in depth stand out
      float dE = step(0.035, max(abs(1. / l.a + 1. / r.a - 2. * w), abs(1. / d.a + 1. / u.a - 2. * w)) / w);
      gl_FragColor = vec4(mix(texture2D(tC, vUv).rgb, uLine, max(idE, max(nE, dE))), 1.);
    }`,
  depthTest: false, depthWrite: false,
});

/* ---------- one canvas ---------- */
function mount(canvas) {
  const T0 = THEMES[canvas.dataset.valley] || THEMES.day;
  const T = {};
  for (const [k, v] of Object.entries(T0)) T[k] = k === "crowns" ? v.map((p) => p.map(rgb)) : Array.isArray(v) ? v.map(rgb) : v;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" }); } catch { return; }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);

  const geo = buildWorld(T);
  const mats = { col: colMat(), data: dataMat(), sea: seaMat(T), ink: inkMat(T) };
  const land = new THREE.Mesh(geo.land, mats.col), sea = new THREE.Mesh(geo.sea, mats.sea);
  land.frustumCulled = sea.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(land, sea);
  const camera = new THREE.PerspectiveCamera(T.view.fov, 1, 1, FAR);
  const post = new THREE.Scene(), postCam = new THREE.Camera();
  const tri = new THREE.BufferGeometry(); tri.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(tri, mats.ink); quad.frustumCulled = false; post.add(quad);

  const floatOK = renderer.extensions.has("EXT_color_buffer_float");
  const rtC = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const rtG = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: floatOK ? THREE.FloatType : THREE.HalfFloatType });
  mats.ink.uniforms.tC.value = rtC.texture; mats.ink.uniforms.tG.value = rtG.texture;
  const sky = new THREE.Color(T.sky), black = new THREE.Color(0, 0, 0);

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pos = new THREE.Vector3(...T.view.pos), tgt = new THREE.Vector3(...T.view.tgt), arm = new THREE.Vector3();
  let mx = 0, my = 0, yaw = 0, pitch = 0, visible = false, raf = 0, shown = false;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const scale = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)); // drawn larger than shown, which smooths the lines
    const W = Math.round(w * scale), H = Math.round(h * scale);
    renderer.setSize(W, H, false); rtC.setSize(W, H); rtG.setSize(W, H);
    mats.ink.uniforms.uPx.value.set(0.62 * scale / W, 0.62 * scale / H);
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
    yaw += (mx * -0.1 - yaw) * 0.06; pitch += (my * 0.035 - pitch) * 0.06;
    arm.copy(pos).sub(tgt).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    arm.y += arm.length() * pitch;
    camera.position.copy(tgt).add(arm); camera.lookAt(tgt);
    mats.sea.uniforms.uT.value = still ? 0 : t / 1000;
    land.material = mats.col; sea.material = mats.sea;
    renderer.setRenderTarget(rtC); renderer.setClearColor(sky, 1); renderer.render(scene, camera);
    land.material = sea.material = mats.data;
    renderer.setRenderTarget(rtG); renderer.setClearColor(black, 1); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(post, postCam);
    if (!shown) { shown = true; canvas.classList.add("on"); }
  }
  function loop(t) { raf = 0; if (!visible || document.hidden) return; draw(t); if (!still) raf = requestAnimationFrame(loop); }
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
