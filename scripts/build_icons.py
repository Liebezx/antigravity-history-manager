"""
Antigravity History Manager — Icon Generation Suite
Uses PyMuPDF to rasterize SVG vectors and Pillow to produce:
1. 1024x1024 master app-icon.png
2. Optimized crisp bitmaps for sizes 16, 20, 24, 32, 40, 48, 64, 128, 256
3. Multi-resolution Windows icon.ico
4. Dark and Light background preview image for verification
"""

import os
import pymupdf
from PIL import Image, ImageDraw, ImageFont

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_SVG = os.path.join(APP_DIR, "src", "assets", "icon.svg")
SRC_SMALL_SVG = os.path.join(APP_DIR, "src", "assets", "icon-small.svg")
ICONS_DIR = os.path.join(APP_DIR, "src-tauri", "icons")
TMP_DIR = os.path.join(APP_DIR, "tmp", "icon_gen")
VERIFY_DIR = os.path.abspath(os.path.join(APP_DIR, "..", "verify", "release"))

os.makedirs(TMP_DIR, exist_ok=True)
os.makedirs(VERIFY_DIR, exist_ok=True)
os.makedirs(ICONS_DIR, exist_ok=True)

def render_svg_to_png(svg_path: str, size: int) -> Image.Image:
    doc = pymupdf.open(svg_path)
    page = doc[0]
    rect = page.rect
    scale = size / max(rect.width, rect.height)
    matrix = pymupdf.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=matrix, alpha=True)
    img = Image.frombytes("RGBA", [pix.width, pix.height], pix.samples)
    if img.size != (size, size):
        img = img.resize((size, size), Image.Resampling.LANCZOS)
    return img

print("[1/5] Rasterizing SVGs...")
doc_full = SRC_SVG
doc_small = SRC_SMALL_SVG

# Render 1024x1024 master
img_1024 = render_svg_to_png(doc_full, 1024)
master_png = os.path.join(APP_DIR, "app-icon.png")
img_1024.save(master_png, format="PNG")
print(f"  Saved master {master_png} (1024x1024)")

# Sizes required for Windows ICO
ico_sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
ico_images = {}

for s in ico_sizes:
    # Use high-contrast small SVG for 16, 20, 24, 32
    if s <= 32:
        img = render_svg_to_png(doc_small, s)
    else:
        img = render_svg_to_png(doc_full, s)
    ico_images[s] = img
    out_path = os.path.join(TMP_DIR, f"icon_{s}.png")
    img.save(out_path, format="PNG")
    print(f"  Rendered {s}x{s} ({'high-contrast' if s <= 32 else 'full'})")

# Save Windows icon.ico with all sizes
print("[2/5] Creating Windows icon.ico...")
ico_path = os.path.join(ICONS_DIR, "icon.ico")
other_images = [ico_images[s] for s in ico_sizes if s != 256]
ico_images[256].save(
    ico_path,
    format="ICO",
    sizes=[(s, s) for s in ico_sizes],
    append_images=other_images
)
print(f"  Saved {ico_path} with sizes: {ico_sizes}")

# Also copy to dist and assets
dist_dir = os.path.abspath(os.path.join(APP_DIR, "..", "dist"))
os.makedirs(dist_dir, exist_ok=True)
import shutil
shutil.copy2(ico_path, os.path.join(dist_dir, "icon.ico"))
shutil.copy2(os.path.join(TMP_DIR, "icon_256.png"), os.path.join(APP_DIR, "src", "assets", "icon.png"))
shutil.copy2(os.path.join(TMP_DIR, "icon_32.png"), os.path.join(APP_DIR, "src", "assets", "icon-32.png"))

print("[3/5] Generating standard PNG icon sizes for Tauri...")
standard_pngs = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 512,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50
}

for fname, sz in standard_pngs.items():
    svg_source = doc_small if sz <= 32 else doc_full
    p = render_svg_to_png(svg_source, sz)
    p.save(os.path.join(ICONS_DIR, fname), format="PNG")
print("  Tauri icon files updated.")

print("[4/5] Rendering dark and light background verification preview...")
# Create a comparison preview: 16, 32, 48, 256 px on dark (#0E1017) and light (#F4F6F8)
canvas_w = 1100
canvas_h = 440
preview = Image.new("RGBA", (canvas_w, canvas_h), (5, 6, 10, 255))
draw = ImageDraw.Draw(preview)

# Left box: Dark
dark_box = Image.new("RGBA", (510, 380), (14, 16, 24, 255))
d_draw = ImageDraw.Draw(dark_box)
d_draw.rectangle([0, 0, 509, 379], outline=(36, 40, 58), width=1)
d_draw.text((24, 20), "Dark Background (#0E1018)", fill=(230, 235, 245))

# Right box: Light
light_box = Image.new("RGBA", (510, 380), (242, 244, 248, 255))
l_draw = ImageDraw.Draw(light_box)
l_draw.rectangle([0, 0, 509, 379], outline=(200, 205, 215), width=1)
l_draw.text((24, 20), "Light Background (#F2F4F8)", fill=(20, 24, 30))

# Place 16, 32, 48, 256 px inside each box
coords = [
    (16, 24, 70),
    (32, 60, 70),
    (48, 115, 70),
    (256, 190, 70)
]

for sz, x, y in coords:
    img = ico_images[sz]
    dark_box.paste(img, (x, y), img)
    light_box.paste(img, (x, y), img)
    d_draw.text((x, y + sz + 8), f"{sz} px", fill=(140, 150, 170))
    l_draw.text((x, y + sz + 8), f"{sz} px", fill=(90, 100, 120))

preview.paste(dark_box, (25, 30))
preview.paste(light_box, (565, 30))

preview_path = os.path.join(VERIFY_DIR, "icon_preview_dark_and_light.png")
preview.save(preview_path, format="PNG")
print(f"  Saved verification preview to {preview_path}")

print("[5/5] Done! All icons generated cleanly.")
