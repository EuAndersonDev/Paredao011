"""Generate optimized site images from assets-src/ (requires Pillow with WebP/AVIF).

Usage: python3 scripts/optimize-images.py
Gallery: drop photos in assets-src/gallery/ and they are exported to public/gallery/
as 4:5 portrait crops (480 and 720 px wide) in AVIF, WebP and JPEG.
Per-photo crop focus, top trim and blur areas (e.g. licence plates) go in GALLERY_OPTIONS.
"""
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src"
PUBLIC = ROOT / "public"
OUT = PUBLIC / "img"


def save_all(im, base, q_avif=45, q_webp=60, q_jpg=62):
    im = im.convert("RGB")
    im.save(f"{base}.avif", quality=q_avif, speed=4)
    im.save(f"{base}.webp", quality=q_webp, method=6)
    im.save(f"{base}.jpg", quality=q_jpg, optimize=True, progressive=True)


def resize_w(im, width):
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def backgrounds():
    # The page darkens this image with a 64-78% overlay, so heavy compression is invisible.
    bg = Image.open(SRC / "background.jpg")
    for w in (800, 1600):
        save_all(resize_w(bg, w), OUT / f"bg-{w}", q_avif=35, q_webp=45, q_jpg=50)


def logo():
    src = Image.open(SRC / "logo.jpg").convert("RGB")
    src.resize((72, 72), Image.LANCZOS).save(OUT / "logo-72.webp", quality=82, method=6)
    src.resize((72, 72), Image.LANCZOS).save(OUT / "logo-72.jpg", quality=85, optimize=True)
    # Favicons. Source is 150 px; larger sizes are upscaled until a bigger logo exists.
    src.resize((32, 32), Image.LANCZOS).save(PUBLIC / "favicon-32x32.png", optimize=True)
    src.resize((180, 180), Image.LANCZOS).save(PUBLIC / "apple-touch-icon.png", optimize=True)
    src.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png", optimize=True)
    src.resize((512, 512), Image.LANCZOS).save(OUT / "icon-512.png", optimize=True)
    src.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


# Coordinates are in the original photo's pixels.
GALLERY_OPTIONS = {
    "paredao-evento-area-verde": {"trim_top": 330, "centering": (0.5, 0.45), "blur": [(270, 735, 360, 785)]},
    "paredao-painel-led": {"centering": (0.5, 0.42)},
    "paredao-gramado-ceu-azul": {"centering": (0.5, 0.55)},
}
GALLERY_SIZE = (720, 900)  # 4:5


def gallery():
    folder = SRC / "gallery"
    if not folder.exists():
        return
    dest = PUBLIC / "gallery"
    dest.mkdir(exist_ok=True)
    for path in sorted(folder.iterdir()):
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        opts = GALLERY_OPTIONS.get(path.stem, {})
        im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        for box in opts.get("blur", []):
            region = im.crop(box).filter(ImageFilter.GaussianBlur(8))
            im.paste(region, box[:2])
        if opts.get("trim_top"):
            im = im.crop((0, opts["trim_top"], im.width, im.height))
        im = ImageOps.fit(im, GALLERY_SIZE, Image.LANCZOS, centering=opts.get("centering", (0.5, 0.5)))
        im = ImageEnhance.Contrast(im).enhance(1.06)
        im = ImageEnhance.Color(im).enhance(1.05)
        im = ImageEnhance.Sharpness(im).enhance(1.15)
        for w in (480, 720):
            save_all(resize_w(im, w), dest / f"{path.stem}-{w}", q_avif=50, q_webp=72, q_jpg=78)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    backgrounds()
    logo()
    gallery()
    print("ok")
