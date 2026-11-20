"""Build the cover and screenshots shown on the plugin's page in Orca.

Run after build_assets.py. docs/listing/panel.png is a capture of the panel
taken with `orca plugin shot <plugin> --panel gallery --width 420`.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "listing"
SIZE = (1600, 1000)
SOLIDS = ["#B3DBF4", "#B6DEC9", "#F1DDB3", "#F1B5A6", "#D1C1EA", "#344E62"]
GRADIENTS = [("#BCEBCE", "#75BCE5"), ("#EAC2D5", "#A5ABDA"), ("#FFE3AA", "#F1A99B")]
SCALE = 2  # Draw at double size, then shrink, for smooth edges.


def rgb(value):
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


def gradient(size, start, end):
    """Diagonal blend from the top-left colour to the bottom-right one."""
    ramp = Image.linear_gradient("L").resize((size * 2, size * 2)).rotate(45, resample=Image.BICUBIC)
    ramp = ramp.crop((size // 2, size // 2, size // 2 + size, size // 2 + size))
    return Image.composite(Image.new("RGB", (size, size), rgb(end)),
                           Image.new("RGB", (size, size), rgb(start)), ramp).convert("RGBA")


def backdrop(size, index):
    choices = SOLIDS + GRADIENTS
    choice = choices[index % len(choices)]
    if isinstance(choice, tuple):
        return gradient(size, *choice)
    return Image.new("RGBA", (size, size), rgb(choice) + (255,))


def avatar(row, size, index, radius):
    """One composed avatar: backdrop, fitted mascot, rounded or circular mask."""
    big = size * SCALE
    tile = backdrop(big, index)
    with Image.open(ROOT / "art" / "mascots" / f"{row['id']}.png") as master:
        fit = row["fit"]
        side = round(big * fit["scale"])
        art = master.resize((side, side), Image.Resampling.LANCZOS)
        tile.alpha_composite(art, (round(fit["x"] * (big - side)), round(fit["y"] * (big - side))))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * radius), fill=255)
    tile.putalpha(mask)
    return tile.resize((size, size), Image.Resampling.LANCZOS)


def canvas():
    """Deep-sea backdrop with a soft glow, shared by every listing image."""
    base = gradient(max(SIZE), "#12233A", "#0B1524").crop((0, 0, *SIZE)).convert("RGB")
    glow = Image.new("L", SIZE, 0)
    ImageDraw.Draw(glow).ellipse((300, -350, 1300, 500), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(180))
    return Image.composite(Image.new("RGB", SIZE, (52, 98, 140)), base, glow).convert("RGBA")


def place(target, tile, position):
    """Paste a tile with a soft drop shadow."""
    pad = 40
    shadow = Image.new("RGBA", (tile.width + pad * 2, tile.height + pad * 2), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 110), (pad, pad + 10), tile.getchannel("A"))
    target.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(16)), (position[0] - pad, position[1] - pad))
    target.alpha_composite(tile, position)


def save(image, name, limit):
    path = OUT / name
    image.convert("RGB").save(path, "WEBP", quality=90, method=6)
    if path.stat().st_size > limit:
        raise SystemExit(f"{name} exceeds {limit} bytes")


def build():
    catalog = json.loads((ROOT / "panel" / "catalog.json").read_text())
    by_id = {row["id"]: row for row in catalog}

    # Cover: all twenty as round avatars in a honeycomb.
    cover = canvas()
    size, gap = 196, 26
    rows = [catalog[0:7], catalog[7:13], catalog[13:20]]
    top = (SIZE[1] - (3 * size + 2 * (gap - 30))) // 2
    for line, group in enumerate(rows):
        left = (SIZE[0] - (len(group) * size + (len(group) - 1) * gap)) // 2
        for column, row in enumerate(group):
            index = line * 7 + column
            place(cover, avatar(row, size, index * 4 + line, 0.5),
                  (left + column * (size + gap), top + line * (size + gap - 30)))
    save(cover, "cover.webp", 1024 * 1024)

    # Screenshot 1: the real panel beside what it saves.
    shot = canvas()
    with Image.open(OUT / "panel.png") as panel:
        panel = panel.convert("RGBA")
        frame = Image.new("L", panel.size, 0)
        ImageDraw.Draw(frame).rounded_rectangle((0, 0, panel.width - 1, panel.height - 1), radius=18, fill=255)
        panel.putalpha(frame)
        scale = 900 / panel.height
        panel = panel.resize((round(panel.width * scale), 900), Image.Resampling.LANCZOS)
        place(shot, panel, (110, 50))
    place(shot, avatar(by_id["D1"], 420, 0, 0.2), (640, 110))
    place(shot, avatar(by_id["H1"], 420, 5, 0.5), (1090, 110))
    for column, (key, index) in enumerate([("S2", 6), ("G1", 2), ("R3", 7), ("O1", 1)]):
        place(shot, avatar(by_id[key], 195, index, 0.2 if column % 2 else 0.5), (640 + column * 225, 640))
    save(shot, "panel.webp", 1536 * 1024)

    # Screenshot 2: every mascot as a square bot picture.
    grid = canvas()
    size, gap = 250, 40
    left = (SIZE[0] - (5 * size + 4 * gap)) // 2
    top = (SIZE[1] - (3 * size + 2 * gap)) // 2
    picks = ["A1", "E1", "K2", "I1", "M1", "P3", "D1", "J1", "N1", "T1", "L2", "Q1", "S2", "F1", "B1"]
    for index, key in enumerate(picks):
        place(grid, avatar(by_id[key], size, index + 3, 0.2),
              (left + (index % 5) * (size + gap), top + (index // 5) * (size + gap)))
    save(grid, "mascots.webp", 1536 * 1024)
    print("Built cover and two screenshots.")


if __name__ == "__main__":
    build()
