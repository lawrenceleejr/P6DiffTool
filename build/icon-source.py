"""Generate the 1024x1024 source icon for the app.

Run once to produce build/app-icon.png; the Tauri CLI then derives all
per-platform icons from it.
"""
from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 1024
OUT = os.path.join(os.path.dirname(__file__), "app-icon.png")

BG_TOP = (30, 41, 59)       # slate-800
BG_BOT = (15, 23, 42)       # slate-900
ADDED = (16, 185, 129)      # emerald-500
REMOVED = (239, 68, 68)     # red-500
TEXT = (248, 250, 252)      # slate-50

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Rounded-corner background with vertical gradient
radius = 180
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
bg_draw = ImageDraw.Draw(bg)
bg_draw.rounded_rectangle((0, 0, SIZE, SIZE), radius=radius, fill=BG_BOT)
# overlay top half gradient by drawing many lines from BG_TOP -> BG_BOT
grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
grad_draw = ImageDraw.Draw(grad)
for y in range(SIZE):
    t = y / SIZE
    r = int(BG_TOP[0] * (1 - t) + BG_BOT[0] * t)
    g = int(BG_TOP[1] * (1 - t) + BG_BOT[1] * t)
    b = int(BG_TOP[2] * (1 - t) + BG_BOT[2] * t)
    grad_draw.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, SIZE, SIZE), radius=radius, fill=255)
bg.paste(grad, (0, 0), mask)
img.alpha_composite(bg)

# Two diagonal stripes (red removed, green added) suggesting a diff
stripe_w = 110
center = SIZE // 2
# Red stripe (left/top -> bottom/right offset left)
removed_box = [(center - 260, 200), (center - 150, SIZE - 200)]
added_box = [(center + 150, 200), (center + 260, SIZE - 200)]
draw.rounded_rectangle(removed_box, radius=55, fill=REMOVED + (235,))
draw.rounded_rectangle(added_box, radius=55, fill=ADDED + (235,))

# Big "Δ" delta symbol between stripes
try:
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    font = None
    for p in font_paths:
        if os.path.exists(p):
            font = ImageFont.truetype(p, 460)
            break
    if font is None:
        font = ImageFont.load_default()
except Exception:
    font = ImageFont.load_default()

text = "Δ"  # capital delta
bbox = draw.textbbox((0, 0), text, font=font)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
draw.text(((SIZE - tw) / 2 - bbox[0], (SIZE - th) / 2 - bbox[1] - 10), text, fill=TEXT, font=font)

# Small "P6" label at bottom
try:
    sub_font = ImageFont.truetype(font.path, 130) if hasattr(font, "path") else ImageFont.load_default()
except Exception:
    sub_font = ImageFont.load_default()
sub = "P6"
sbbox = draw.textbbox((0, 0), sub, font=sub_font)
sw = sbbox[2] - sbbox[0]
draw.text(((SIZE - sw) / 2 - sbbox[0], SIZE - 230), sub, fill=TEXT, font=sub_font)

img.save(OUT, "PNG")
print("Wrote", OUT, img.size)
