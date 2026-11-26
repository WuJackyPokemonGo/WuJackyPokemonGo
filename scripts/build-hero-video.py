"""Render the home page hero video: an original looping "warp" through a night sky with the shop's own
product photos flying past. Output: assets/hero/warp.mp4 (16:9), warp-portrait.mp4 (9:16 for phones) and matching posters (all generated, no
third-party footage). The loop is seamless because every element moves on a period of exactly LOOP seconds.

Usage: python3 scripts/build-hero-video.py   (needs Pillow, numpy and ffmpeg)
"""
import math, random, subprocess, io
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/hero'
import sys
PORTRAIT = '--portrait' in sys.argv
W, H = (720, 1280) if PORTRAIT else (1280, 720)
FPS, LOOP = 30, 8
NAME = 'warp-portrait' if PORTRAIT else 'warp'
FRAMES = FPS * LOOP
CARDS = [  # shop photos (product shots taken by the owner), cropped to the Pokémon + background area
    '0a4245dc-df1a-4225-a416-2156ffe2e3b0-6e406d2c-3e2a-423f-a492-314470a7d806',  # Dark Skies Charmander
    '2c3f2865-51d4-4595-95a8-e8d8491460c3-143c834a-0d9c-446a-b926-555bde6cd964',  # Night Out LA Gengar
    '00287ad9-85f5-4647-832b-2ddaecfff3c5-837a4b15-8242-4776-9583-c7a356888650',  # Horizons Charmander
    '3d720cf9-f2a5-47e3-85f4-a233d528d572-bbdf2019-4fe4-4cf9-87ec-8b16c9d58df0',  # Dark Skies Espurr
    '4b099bcd-cfbc-4892-995e-2431aa9228e9-557f2be0-d124-4072-9c4c-5e97f0cd7d8f',  # Paris Charmander
    '29157011-fdeb-4717-90d4-af001c970835-7aef5520-3d69-47b9-b83d-9361287890e3',  # Cherry blossom Deerling
    '2a8a262f-c19d-4631-ba21-e6a5b5ecafde-a4b0d52b-f802-4670-ad8c-b08ef3adec21',  # Day of the Dead Gengar
    '371df289-9bc3-4b5d-8855-6308b60e3c6a-ea5ddd45-1928-440e-a3e1-38899b03176b',  # Dark Skies Wailmer
    '500e3e31-5d82-4a96-8b1b-343729e98661-365aa506-2257-41cf-ba9b-38fdbf1f89f9',  # Worlds Pikachu
    '30582688-475e-4ae4-baec-d2e3a34475c7-580305a6-f005-47a0-a2cb-b7b220bf5e5f',  # Horizons Meowscarada
]

def card(name, size=300):
    im = Image.open(ROOT / f'assets/products/opt/{name}.webp').convert('RGB')
    w, h = im.size
    half = im.crop((0, int(h * .02), w // 2 if w > h * .8 else w, int(h * .42)))  # one phone screen, top part
    half.thumbnail((size, size))
    framed = Image.new('RGBA', (half.width + 12, half.height + 12), (255, 223, 112, 255))
    framed.paste(half, (6, 6))
    mask = Image.new('L', framed.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, framed.width - 1, framed.height - 1), 18, fill=255)
    framed.putalpha(mask)
    return framed

def background():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.hypot((x - W / 2) / W, (y - H / 2) / H)
    top = np.array([42, 28, 86], np.float32); edge = np.array([6, 8, 28], np.float32)
    k = np.clip(d * 1.7, 0, 1)[..., None]
    img = top * (1 - k) + edge * k
    rng = np.random.default_rng(7)
    neb = Image.fromarray((rng.random((H // 16, W // 16)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(40))
    n = np.asarray(neb, np.float32)[..., None] / 255
    img += n * np.array([60, 25, 90], np.float32) * (1 - k) * .9
    return np.clip(img, 0, 255)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = random.Random(11)
    base = background()
    stars = [(rng.random() * math.tau, rng.random(), rng.choice([1, 1, 1, 2])) for _ in range(420)]
    cards = [card(n) for n in CARDS]
    lanes = [(i / len(cards) * math.tau + rng.uniform(-.25, .25), i / len(cards)) for i in range(len(cards))]
    cx, cy = W / 2, H / 2
    global SX, SY
    SX, SY = (.62, 1) if PORTRAIT else (1, .62)
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '33', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', str(OUT / f'{NAME}.mp4')], stdin=subprocess.PIPE)
    frames = []
    for f in range(FRAMES):
        t = f / FRAMES
        frame = Image.fromarray(base.astype(np.uint8)).convert('RGBA')
        glow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
        pulse = .5 + .5 * math.sin(t * math.tau)
        r = 150 + 18 * pulse  # Poké Ball ring breathing in the centre
        g.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 223, 112, int(70 + 50 * pulse)), width=10)
        g.line((cx - r, cy, cx - 34, cy), fill=(255, 223, 112, int(60 + 40 * pulse)), width=10)
        g.line((cx + 34, cy, cx + r, cy), fill=(255, 223, 112, int(60 + 40 * pulse)), width=10)
        g.ellipse((cx - 30, cy - 30, cx + 30, cy + 30), outline=(255, 223, 112, int(80 + 60 * pulse)), width=8)
        frame = Image.alpha_composite(frame, glow.filter(ImageFilter.GaussianBlur(3)))
        d = ImageDraw.Draw(frame)
        for ang, phase, wdt in stars:  # warp streaks: distance grows exponentially, period LOOP
            p = (t * 2 + phase) % 1
            dist = 8 * math.exp(p * 4.6)
            tail = dist * (1 - .18 - .2 * p)
            a = int(255 * min(1, p * 1.6))
            col = (255, 240, 190, a) if wdt == 2 else (230, 236, 255, a)
            d.line((cx + math.cos(ang) * tail * SX, cy + math.sin(ang) * tail * SY, cx + math.cos(ang) * dist * SX, cy + math.sin(ang) * dist * SY), fill=col, width=wdt)
        for (ang, phase), im in sorted(zip(lanes, cards), key=lambda x: (t + x[0][1]) % 1):
            p = (t + phase) % 1
            s = .12 + 1.15 * p ** 2.2
            dist = 40 + 560 * p ** 1.6
            x = cx + math.cos(ang) * dist * (.75 if PORTRAIT else 1.25); y = cy + math.sin(ang) * dist * (1.25 if PORTRAIT else .75)
            im2 = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))))
            alpha = min(1, p * 4) * min(1, (1 - p) * 5)
            if alpha <= 0: continue
            a = im2.getchannel('A').point(lambda v: int(v * alpha))
            im2.putalpha(a)
            frame.alpha_composite(im2, (int(x - im2.width / 2), int(y - im2.height / 2)))
        rgb = frame.convert('RGB')
        ff.stdin.write(rgb.tobytes())
        if f == int(FRAMES * .35): rgb.save(OUT / f'{NAME}.jpg', quality=80, optimize=True)
    ff.stdin.close(); ff.wait()
    for n in (f'{NAME}.mp4', f'{NAME}.jpg'):
        print(n, round((OUT / n).stat().st_size / 1024), 'KB')

if __name__ == '__main__':
    main()
