"""Cut the official KIKKO logo out of its white background (keeps the white ring/bolt)."""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi

def process(src, icon_right, ring, out_full, out_icon=None, rev=None):
    im = np.array(Image.open(src).convert('RGB')).astype(float)
    H, W, _ = im.shape
    mn = im.min(axis=2)
    # colour-to-alpha against white
    a1 = np.clip((255 - mn - 8) / 247.0, 0, 1)
    # boost so solid colours are fully opaque
    a1 = np.clip(a1 / 0.55, 0, 1)
    col1 = np.where(a1[..., None] > 0.001, (im - (1 - a1[..., None]) * 255) / np.maximum(a1[..., None], 1e-3), im)
    col1 = np.clip(col1, 0, 255)
    colored = mn < 225
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    orange = (r > 200) & (g > 40) & (g < 160) & (b < 90)
    orange = ndi.binary_fill_holes(ndi.binary_opening(orange, iterations=2))
    lab, n = ndi.label(orange)
    if n:
        sizes = ndi.sum(orange, lab, range(1, n + 1))
        face = lab == (1 + int(np.argmax(sizes)))
    else:
        face = orange
    yy, xx = np.ogrid[:H, :W]
    dist = ndi.distance_transform_edt(~face)
    ringmask = dist <= ring
    sil = colored | ringmask
    sil[:, icon_right:] = colored[:, icon_right:]
    iconpart = np.zeros_like(sil); iconpart[:, :icon_right] = True
    sil_icon = ndi.binary_fill_holes(ndi.binary_closing(sil & iconpart, iterations=3))
    sil = np.where(iconpart, sil_icon, sil)
    m = ndi.gaussian_filter(ndi.binary_erosion(sil, iterations=1).astype(float), 1.0)
    alpha = np.maximum(a1, m)
    use_orig = m > a1
    color = np.where(use_orig[..., None], im, col1)
    rgba = np.dstack([color, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    bbox = img.getbbox()
    img = img.crop(bbox)
    img.save(out_full, optimize=True)
    if rev:
        # reversed wordmark: deep-blue letters -> cream (icon untouched)
        arr = np.array(img).astype(float)
        ir = icon_right - bbox[0]
        word = arr[:, ir:, :]
        blue = (word[..., 2] > word[..., 0] + 60)
        word[blue, 0:3] = [255, 248, 233]
        arr[:, ir:, :] = word
        Image.fromarray(arr.astype(np.uint8), 'RGBA').save(rev, optimize=True)
    if out_icon:
        icon = img.crop((0, 0, icon_right - bbox[0], img.height))
        icon = icon.crop(icon.getbbox())
        icon.save(out_icon, optimize=True)

process('brand-src/kikko-icon.png', 1254, 40, 'brand-src/out-icon.png')
process('brand-src/kikko-logo.png', 700, 24, 'brand-src/out-logo.png', None, 'brand-src/out-logo-reversed.png')
print('ok')
