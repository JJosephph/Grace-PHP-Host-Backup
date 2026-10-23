from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def rounded_rectangle(draw: ImageDraw.ImageDraw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def build_logo(size: int = 1024) -> Image.Image:
    scale = size / 512
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    rounded_rectangle(
        draw,
        (24 * scale, 24 * scale, 488 * scale, 488 * scale),
        112 * scale,
        "#050B17",
    )
    rounded_rectangle(
        draw,
        (42 * scale, 42 * scale, 470 * scale, 470 * scale),
        94 * scale,
        "#0B1220",
    )

    # Backup arrow, drawn as thick round strokes.
    draw.arc(
        (
            100 * scale,
            100 * scale,
            412 * scale,
            412 * scale,
        ),
        start=300,
        end=205,
        fill="#38BDF8",
        width=int(42 * scale),
    )
    draw.line(
        (
            342 * scale,
            108 * scale,
            408 * scale,
            178 * scale,
            318 * scale,
            196 * scale,
        ),
        fill="#2DD4BF",
        width=int(42 * scale),
        joint="curve",
    )

    # Server stack.
    colors = ["#F8FAFC", "#E2E8F0", "#CBD5E1"]
    dot_colors = ["#0F766E", "#0369A1", "#334155"]
    for index in range(3):
        top = (174 + index * 58) * scale
        rounded_rectangle(
            draw,
            (166 * scale, top, 346 * scale, (top + 48 * scale)),
            16 * scale,
            colors[index],
        )
        cx = 201 * scale
        cy = (top + 24 * scale)
        radius = 8 * scale
        draw.ellipse(
            (cx - radius, cy - radius, cx + radius, cy + radius),
            fill=dot_colors[index],
        )

    # Grace spark.
    draw.ellipse(
        (315 * scale, 320 * scale, 361 * scale, 366 * scale),
        fill="#F59E0B",
    )
    return image


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    logo = build_logo(1024)
    logo.save(ASSETS / "logo.png")
    logo.resize((512, 512), Image.Resampling.LANCZOS).save(ASSETS / "logo-512.png")
    logo.resize((256, 256), Image.Resampling.LANCZOS).save(ASSETS / "logo-256.png")
    icon_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    logo.save(ASSETS / "app.ico", sizes=icon_sizes)


if __name__ == "__main__":
    main()
