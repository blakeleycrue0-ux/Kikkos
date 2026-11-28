// Herramientas de imagen en el navegador (mando y pruebas).

/**
 * Recorta el espacio transparente que rodea a una imagen PNG (recortes sin fondo)
 * y la reduce a `max` píxeles. Así la jugadora ocupa todo el hueco en pantalla.
 */
export async function trimAlpha(blob, { max = 1400, pad = 4 } = {}) {
  const bmp = await createImageBitmap(blob);
  const k0 = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k0);
  const h = Math.round(bmp.height * k0);
  const c0 = document.createElement('canvas');
  c0.width = w;
  c0.height = h;
  const x0 = c0.getContext('2d', { willReadFrequently: true });
  x0.drawImage(bmp, 0, 0, w, h);
  const { data } = x0.getImageData(0, 0, w, h);
  let minX = w; let minY = h; let maxX = -1; let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return blob; // totalmente transparente: se deja tal cual
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const k = Math.min(1, max / Math.max(cw, ch));
  const c1 = document.createElement('canvas');
  c1.width = Math.max(1, Math.round(cw * k));
  c1.height = Math.max(1, Math.round(ch * k));
  c1.getContext('2d').drawImage(c0, minX, minY, cw, ch, 0, 0, c1.width, c1.height);
  return new Promise((res) => c1.toBlob(res, 'image/png'));
}
