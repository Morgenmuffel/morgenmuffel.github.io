/* Set aside from assets/site/valley.js: the fallen leaf that lay in the hero's foreground, right of the headline.
   It is not loaded by the site. To bring it back, paste the function next to scallop() in valley.js and add the
   call to buildWorld(), after shells(...):

     leaf(B, T, 9.2, 37.0, 2.4, 0.2);   // x, z, length, turn

   It needs only what valley.js already has: the Builder (B.style, B.panel, B.tube), the theme (T.roof), height()
   and V3. */

/* A fallen leaf, resting on its near edge so its face turns to the viewer. Two halves folded along the midrib and
   painted in two flat tones, so the rib draws itself as a line; both tips curl up. */
function leaf(B, T, x, z, len, turn) {
  const tones = [0, 1].map((g) => [B.style(T.roof, { lit: 0, glint: 0.4 }), () => g]);
  const n = 10, w = len * 0.3, y = height(x, z) + 0.05, ca = Math.cos(turn), sa = Math.sin(turn);
  const at = (t, side) => {                              // side: 1 = the edge on the grass, 0 = the rib, -1 = the raised edge
    const wide = w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.7) * (1 - 0.4 * t);
    const along = (t - 0.5) * len, rib = wide * Math.sin(0.42), tilt = side > 0 ? 0.42 : 0.9;
    const across = side * wide * Math.cos(tilt), up = rib - side * wide * Math.sin(tilt) + 0.5 * (2 * t - 1) ** 2;
    return [x + ca * along - sa * across, y + up, z + sa * along + ca * across];
  };
  const inside = [x, y - 5, z - 5];
  for (let k = 0; k < n; k++) for (const side of [-1, 1]) {
    const [st, g] = tones[side < 0 ? 1 : 0];
    B.panel(st, [at(k / n, 0), at(k / n, side), at((k + 1) / n, side), at((k + 1) / n, 0)], inside, g);
  }
  const a = at(0, 0);
  B.tube(B.style(T.roof, { lit: 0 }), [V3(...a), V3(a[0] - ca * 0.45, a[1] + 0.12, a[2] - sa * 0.45), V3(a[0] - ca * 0.8, a[1] + 0.36, a[2] - sa * 0.8)], [0.07, 0.06, 0.05], 5);   // its stalk
}
