/* Set aside from assets/site/valley.js: the hand-built scallop, conch and heap, replaced by the two scanned shells.
   Not loaded by the site. They need bed(), ground(), norm3() and the Builder from valley.js. */

/* A scallop shell lying back on the ground: a fan of ribs in two alternating flat tones, with a wavy rim.
   `F` is the bed it lies in; `lean` is how far it is tipped back from upright. */
function scallop(B, T, F, r, lean) {
  const tones = [0, 1].map((g) => [B.style(T.stone, { lit: 0, glint: 0.3 }), () => g]);
  const ribs = 9, cl = Math.cos(lean), sl = Math.sin(lean);
  // u runs across the fan, v up it, d out of its face (towards the viewer)
  const P = (u, v, d) => F.at(r * u, r * (v * cl + d * sl), r * (d * cl - v * sl));
  const ray = (a, q) => { const R = q * (1.5 - 0.22 * a * a); return P(Math.sin(a) * R, Math.cos(a) * R, 0.34 * Math.sin(Math.PI * Math.min(1, q * 0.92))); };
  const inside = P(0, 0.6, -4), span = 1.12, steps = [0, 0.45, 0.8, 1];
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
  const cols = 20, R = len * 0.6, rest = 0.42 * R, light = [-0.36, 0.78, 0.5];   // the widest whorl sits a little into the ground
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
      const knob = i === 7 ? 1 + 0.14 * Math.max(0, Math.cos(5 * f + 0.6)) : 1;         // the knobs around the shoulder
      P.push(c.map((q, k) => q + rad[k] * pr * R * knob)); N.push(n);
      G.push(clamp(0.5 + (n[0] * light[0] + n[1] * light[1] + n[2] * light[2] - 0.08) * 5, 0, 1));
    }
  });
  B.grid(body, prof.length, cols, P, N, G);
  // the opening: a dark sheet lying just clear of the body, from the shoulder to the tip of the canal
  const t0 = 0.37, t1 = 0.97, f0 = 0.9, rows = 9, across = 4;
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

/* Two shells in a heap on the bank of the stream: the conch with its opening up and the scallop tipped back over
   its narrow end, with a few pebbles around. The bank slopes, so the heap is laid in the plane of the drawn ground
   and every pebble is set into it. */
function shells(B, T, x, z, rnd) {
  const F = bed(x, z, Math.PI);
  conch(B, T, F, 2.1);
  const [sx, , sz] = F.at(1.2, 0, 0.8);
  scallop(B, T, bed(sx, sz, 2.95), 0.72, 0.95);
  const stone = B.style(T.rock, { glint: 0.3 });
  // [along the heap, towards the viewer, size]
  for (const [u, w, r] of [[-1.5, 0.9, 0.22], [-0.5, 1.6, 0.15], [2.3, 0.2, 0.2], [0.5, 1.9, 0.12], [-2.1, 0.3, 0.14], [1.9, 1.5, 0.13]]) {
    const [px, , pz] = F.at(u, 0, w);
    B.add(stone, new THREE.IcosahedronGeometry(r, 1), M(px, ground(px, pz) - r * 0.1, pz, 1, 0.7, 1, rnd() * 6));
  }
}

