"""Build the plugin's distributable images from its transparent masters."""
import io
import json
from pathlib import Path

from PIL import Image

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
            catalog.append({"id": key, "name": name, "asset": asset})
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
