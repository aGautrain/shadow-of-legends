// Separable Gaussian blur of a w*h scalar field, sigma in cells.
export function blur(field, w, h, sigma) {
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * field[z * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[z * w + x] = v;
    }
  }
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * tmp[Math.min(h - 1, Math.max(0, z + i)) * w + x];
      field[z * w + x] = v;
    }
  }
}
