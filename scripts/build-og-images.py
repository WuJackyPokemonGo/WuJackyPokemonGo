#!/usr/bin/env python3
"""產生分享預覽專用的橫式圖片（1200×630），讓 Messenger／LINE／Threads 不會把主體切掉。

- 商品（assets/og/p/<id>.jpg）：商品圖多半是正方形截圖，寶可夢在上半部，所以從上方裁切。
- 背景（assets/og/bg/<BG-xxxx>.jpg）：背景圖完整放在中間，兩側用同一張圖模糊後填滿。

圖片存在網站本身，不依賴外部網站是否允許外連。只重做來源有變的圖（記錄在 data/og-images.json）。
需要 Pillow 與 curl。用法：python3 scripts/build-og-images.py [--only products|backgrounds]
"""
import io, json, os, subprocess, sys, hashlib
from PIL import Image, ImageFilter, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://wujackypokemongo.github.io/WuJackyPokemonGo/'
W, H = 1200, 630
LAYOUT = 'v3'  # 版型有改時換版本號，所有圖會重做
MANIFEST = os.path.join(ROOT, 'data', 'og-images.json')


def fetch(url):
    if url.startswith('assets/') or url.startswith(SITE + 'assets/'):
        path = os.path.join(ROOT, url.replace(SITE, ''))
        path = path.split('?')[0]
        with open(path, 'rb') as f:
            return f.read()
    out = subprocess.run(['curl', '-sfL', '-m', '40', '-A', 'Mozilla/5.0 (WuJackyPokemonGo preview builder)', url], capture_output=True)
    if out.returncode != 0 or not out.stdout:
        raise RuntimeError('download failed')
    return out.stdout


def cover_top(img):
    """商品圖：正方形或橫式拼圖從上方裁切填滿；直式截圖取上方 4:5 區域完整放中間（不切到寶可夢）。"""
    img = img.convert('RGB')
    if img.height / img.width > 1.4:
        return contain_on_blur(img.crop((0, 0, img.width, round(img.width * 1.25))))
    scale = max(W / img.width, H / img.height)
    r = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (r.width - W) // 2
    top = 0 if r.height > H * 1.15 else (r.height - H) // 2
    return r.crop((left, top, left + W, top + H))


def contain_on_blur(img):
    """整張圖完整放中間，兩側用同一張圖模糊、壓暗後填滿。"""
    img = img.convert('RGB')
    bg = img.resize((W, round(img.height * W / img.width)), Image.LANCZOS)
    top = max(0, (bg.height - H) // 2)
    bg = bg.crop((0, top, W, top + H)).filter(ImageFilter.GaussianBlur(28))
    bg = ImageEnhance.Brightness(bg).enhance(0.55)
    scale = min(W / img.width, H / img.height)
    fg = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    bg.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
    return bg


def save(img, rel):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'JPEG', quality=78, optimize=True, progressive=True)


def jobs(only):
    if only in (None, 'products'):
        for row in json.load(open(os.path.join(ROOT, 'data', 'product-shares.json'), encoding='utf-8')):
            if row.get('image'):
                yield 'p/' + row['id'], row['image'], cover_top
    if only in (None, 'backgrounds'):
        data = json.load(open(os.path.join(ROOT, 'data', 'backgrounds.json'), encoding='utf-8'))
        for r in data['records']:
            if r['background_id'].startswith('BG-') and r.get('image_source'):
                yield 'bg/' + r['background_id'], r['image_source'], contain_on_blur


def main():
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    manifest = json.load(open(MANIFEST, encoding='utf-8')) if os.path.exists(MANIFEST) else {}
    made = kept = failed = 0
    wanted = set()
    for key, src, layout in jobs(only):
        wanted.add(key)
        rel = 'assets/og/' + key + '.jpg'
        sig = hashlib.sha1((LAYOUT + '|' + layout.__name__ + '|' + src).encode()).hexdigest()[:16]
        if manifest.get(key, {}).get('sig') == sig and os.path.exists(os.path.join(ROOT, rel)):
            kept += 1
            continue
        try:
            img = Image.open(io.BytesIO(fetch(src)))
            img.load()
            if min(img.size) < 120:
                raise RuntimeError('image too small')
            save(layout(img), rel)
            manifest[key] = {'sig': sig, 'source': src, 'file': rel}
            made += 1
        except Exception as e:  # 下載或解碼失敗：保留原本的外部圖片作為預覽
            failed += 1
            manifest.pop(key, None)
            print('skip', key, src[:80], e, file=sys.stderr)
    # 移除已不存在的商品／背景的預覽圖
    for key in [k for k in manifest if k not in wanted and (only is None or k.startswith('p/' if only == 'products' else 'bg/'))]:
        try:
            os.remove(os.path.join(ROOT, manifest[key]['file']))
        except FileNotFoundError:
            pass
        manifest.pop(key)
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(manifest.items())), f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'og images: made {made}, unchanged {kept}, failed {failed}')


if __name__ == '__main__':
    main()
