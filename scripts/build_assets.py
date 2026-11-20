"""Build the plugin's distributable images from its transparent masters."""
import io
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
NAMES = {
    "A1": "Orca", "B1": "Dolphin", "D1": "Beluga", "E1": "Sea Otter",
    "F1": "Manta Ray", "G1": "Octopus", "H1": "Humpback", "H2": "Seal",
    "I1": "Sea Turtle", "J1": "Crab", "K2": "Pufferfish", "L2": "Seahorse",
    "M1": "Jellyfish", "N1": "Shark", "O1": "Clownfish", "P3": "Walrus",
    "Q1": "Hammerhead", "R3": "Narwhal", "S2": "Penguin", "T1": "Sea Bunny",
}


def write_changed(path, data):
    if path.exists() and path.read_bytes() == data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def circle_fit(master):
    """Return how to place a mascot so a circular crop keeps its face.

    The art fills the square and its body runs off one or two edges. Shrinking
    it toward those edges pulls the head inside the inscribed circle without
    exposing the cut body. Returns the scale and the anchor on each axis
    (0 = left/top, 0.5 = centre, 1 = right/bottom).
    """
    side = 256
    alpha = master.getchannel("A").resize((side, side), Image.Resampling.LANCZOS)
    solid = alpha.point(lambda value: 255 if value > 128 else 0)
    last = side - 1
    left = solid.crop((0, 0, 1, side)).getbbox() is not None
    right = solid.crop((last, 0, side, side)).getbbox() is not None
    top = solid.crop((0, 0, side, 1)).getbbox() is not None
    bottom = solid.crop((0, last, side, side)).getbbox() is not None
    if (left and right) or (top and bottom):
        return 1.0, 0.5, 0.5  # Anchored on opposite edges: any shrink shows a cut.
    ax = 0.0 if left else 1.0 if right else 0.5
    ay = 0.0 if top else 1.0 if bottom else 0.5

    # Where the face lives: the upper part, away from the side the body leaves by.
    # A fin on the body's side may stay clipped; chasing it would shrink the face.
    guard = Image.new("L", (side, side), 0)
    draw = ImageDraw.Draw(guard)
    reach = int(side * 0.7)
    if left:
        draw.rectangle((int(side * 0.35), 0, side, reach), fill=255)
    elif right:
        draw.rectangle((0, 0, int(side * 0.65), reach), fill=255)
    else:
        draw.rectangle((0, 0, side, int(side * 0.45)), fill=255)
    inset = side * 0.03
    draw.ellipse((inset, inset, last - inset, last - inset), fill=0)

    scale = 1.0
    while scale > 0.8:
        size = round(side * scale)
        placed = Image.new("L", (side, side), 0)
        placed.paste(solid.resize((size, size), Image.Resampling.NEAREST),
                     (round(ax * (side - size)), round(ay * (side - size))))
        spill = ImageChops.multiply(placed, guard).histogram()[255]
        if spill <= side * side * 0.0002:
            break
        scale = round(scale - 0.01, 2)
    return scale, ax, ay


def build():
    masters = ROOT / "art" / "mascots"
    missing = [key for key in NAMES if not (masters / f"{key}.png").is_file()]
    if missing:
        raise SystemExit("Missing master PNGs: " + ", ".join(missing))

    catalog = []
    for key, name in NAMES.items():
        with Image.open(masters / f"{key}.png") as master:
            if master.size != (1024, 1024) or master.mode != "RGBA":
                raise SystemExit(f"{key}: expected a 1024 x 1024 RGBA master")
            if master.getchannel("A").getextrema() != (0, 255):
                raise SystemExit(f"{key}: expected transparent and opaque pixels")
            data = io.BytesIO()
            master.save(data, "WEBP", quality=95, method=6, alpha_quality=100)
            asset = f"assets/mascots/{key}.webp"
            write_changed(ROOT / asset, data.getvalue())
            scale, ax, ay = circle_fit(master)
            catalog.append({"id": key, "name": name, "asset": asset,
                            "fit": {"scale": scale, "x": ax, "y": ay}})
            if key == "D1":
                tile = Image.new("RGBA", master.size, "#B3DBF4")
                tile.alpha_composite(master)
                icon = tile.resize((256, 256), Image.Resampling.LANCZOS).convert("RGB")
                png = io.BytesIO()
                icon.save(png, "PNG", optimize=True)
                if len(png.getvalue()) > 256_000:
                    raise SystemExit("Listing icon exceeds the manifest limit")
                write_changed(ROOT / "assets/icon.png", png.getvalue())
    write_changed(ROOT / "panel/catalog.json", (json.dumps(catalog, indent=2) + "\n").encode())
    print(f"Built {len(catalog)} foregrounds, listing icon and catalog.")


if __name__ == "__main__":
    build()
