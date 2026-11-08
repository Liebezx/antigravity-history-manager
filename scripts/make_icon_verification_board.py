from PIL import Image, ImageDraw, ImageFont
import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
verify_dir = os.path.join(base_dir, "verify", "release")
tmp_dir = os.path.join(base_dir, "tmp")

exe_icon = Image.open(os.path.join(tmp_dir, "extracted_exe.png")).convert("RGBA")
setup_icon = Image.open(os.path.join(tmp_dir, "extracted_setup.png")).convert("RGBA")
shortcut_icon = Image.open(os.path.join(tmp_dir, "extracted_desktop_shortcut.png")).convert("RGBA")
ico_256 = Image.open(os.path.join(tmp_dir, "icon_gen", "icon_256.png")).convert("RGBA") if os.path.exists(os.path.join(tmp_dir, "icon_gen", "icon_256.png")) else exe_icon.resize((256, 256))

# Create board 1000x420
board = Image.new("RGBA", (1000, 420), (10, 11, 16, 255))
draw = ImageDraw.Draw(board)

draw.rectangle([0, 0, 999, 419], outline=(40, 45, 65), width=1)
draw.text((32, 24), "Antigravity History Manager — PE & Shell Icon Verification", fill=(200, 255, 62))

items = [
    ("Portable EXE (dist)", exe_icon, 40, 90),
    ("NSIS Setup.exe (dist)", setup_icon, 250, 90),
    ("Desktop Shortcut (.lnk)", shortcut_icon, 470, 90),
    ("Master Icon (256px)", ico_256.resize((128, 128)), 700, 90)
]

for title, img, x, y in items:
    # background box
    box_w, box_h = 190, 260
    draw.rounded_rectangle([x, y, x + box_w, y + box_h], radius=14, fill=(18, 20, 30), outline=(35, 40, 58), width=1)
    
    # center image
    iw, ih = img.size
    scale = 1
    if iw < 64:
        display_img = img.resize((iw * 2, ih * 2), Image.Resampling.NEAREST)
    else:
        display_img = img
    
    dw, dh = display_img.size
    px = x + (box_w - dw) // 2
    py = y + 40 + (128 - dh) // 2
    board.paste(display_img, (px, py), display_img)
    
    draw.text((x + 16, y + 200), title, fill=(220, 225, 235))
    draw.text((x + 16, y + 225), f"{iw}x{ih} px (Verified)", fill=(120, 130, 150))

out_path = os.path.join(verify_dir, "icons_verification_board.png")
board.save(out_path)
print(f"Saved {out_path}")
