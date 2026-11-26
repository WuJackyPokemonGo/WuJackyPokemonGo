// Nine-region artwork: a light thumbnail entry, expanded on demand into the full original images.
// Phones get a carousel (autoplay, pause, prev/next, dots, swipe); wide screens show all nine side by side.
const gallery = document.querySelector('.region-showcase');
if (gallery) {
  const viewer = gallery.querySelector('.region-viewer');
  const slides = [...gallery.querySelectorAll('.region-slide')];
  const dots = [...gallery.querySelectorAll('.region-dot')];
  const thumbs = [...gallery.querySelectorAll('.region-thumb')];
  const stage = gallery.querySelector('.region-stage');
  const toggle = gallery.querySelector('.region-toggle');
  const expand = gallery.querySelector('.region-expand');
  const announcement = gallery.querySelector('.region-announcement');
  const compact = matchMedia('(max-width: 900px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const store = {
    get(key) { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } },
    set(key, value) { try { globalThis.localStorage?.setItem(key, value); } catch {} },
  };
  const INTERVAL = 3000;
  const HOLD_AFTER_INPUT = 8000;
  let current = 0;
  // A stored choice wins; otherwise honour the reduced-motion preference.
  const savedPause = store.get('wj_region_paused');
  let paused = savedPause === null ? reducedMotion.matches : savedPause === '1';
  let expanded = store.get('wj_region_open') === '1';
  let hovering = false;
  let focused = false;
  let touching = false;
  let timer;
  let start;
  const count = slides.length;
  function load(slide) { const img = slide?.querySelector?.('img[data-src]'); if (img?.dataset?.src && !img.src) img.src = img.dataset.src; }
  function loadAll() { slides.forEach(load); }
  function stop() { clearTimeout(timer); timer = undefined; }
  function schedule(delay = INTERVAL) {
    stop();
    if (expanded && compact.matches && !paused && !hovering && !focused && !touching && !document.hidden) {
      timer = setTimeout(() => { show(current + 1); schedule(); }, delay);
    }
  }
  function show(index, manual = false) {
    current = (index + count) % count;
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === current);
      slide.setAttribute('aria-hidden', String(compact.matches && i !== current));
      if (expanded && (i === current || i === (current + 1) % count)) load(slide);
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === current);
      dot.setAttribute('aria-pressed', String(i === current));
    });
    thumbs.forEach((thumb, i) => thumb.setAttribute('aria-current', i === current ? 'true' : 'false'));
    viewer?.setAttribute('aria-roledescription', compact.matches ? 'carousel' : 'gallery');
    if (manual) {
      if (announcement) announcement.textContent = slides[current].getAttribute('aria-label');
      // Give the visitor time to look before autoplay continues.
      schedule(HOLD_AFTER_INPUT);
    }
  }
  function updateToggle() {
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? '播放輪播 / Play slideshow' : '暫停輪播 / Pause slideshow');
    toggle.textContent = paused ? '▶' : 'Ⅱ';
  }
  function setExpanded(open, {remember = true} = {}) {
    expanded = open;
    if (viewer) viewer.hidden = !open;
    gallery.classList.toggle('is-expanded', open);
    if (expand) {
      expand.setAttribute('aria-expanded', String(open));
      const zh = (document.documentElement?.lang ?? 'zh-Hant') === 'zh-Hant';
      expand.textContent = open ? (zh ? '收起原圖 ▴' : 'Hide artwork ▴') : (zh ? '完整瀏覽 ▾' : 'View full artwork ▾');
    }
    if (remember) store.set('wj_region_open', open ? '1' : '0');
    if (open && !compact.matches) loadAll();
    show(current);
    schedule();
  }
  gallery.querySelector('.region-prev').addEventListener('click', () => show(current - 1, true));
  gallery.querySelector('.region-next').addEventListener('click', () => show(current + 1, true));
  dots.forEach((dot, i) => dot.addEventListener('click', () => show(i, true)));
  thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => {
    if (!expanded) setExpanded(true);
    show(i, true);
    if (!compact.matches) slides[i]?.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
    viewer?.scrollIntoView?.({block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth'});
  }));
  expand?.addEventListener('click', () => setExpanded(!expanded));
  toggle.addEventListener('click', () => {
    paused = !paused;
    store.set('wj_region_paused', paused ? '1' : '0');
    updateToggle();
    schedule();
  });
  (viewer ?? gallery).addEventListener('keydown', event => {
    if (!compact.matches) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(current + (event.key === 'ArrowLeft' ? -1 : 1), true);
    }
  });
  gallery.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovering = true; stop(); } });
  gallery.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') { hovering = false; schedule(); } });
  gallery.addEventListener('pointerdown', () => { focused = false; });
  gallery.addEventListener('focusin', event => {
    focused = Boolean(event.target?.matches?.(':focus-visible'));
    schedule();
  });
  gallery.addEventListener('focusout', event => { focused = gallery.contains(event.relatedTarget) && Boolean(event.relatedTarget?.matches?.(':focus-visible')); schedule(); });
  stage.addEventListener('pointerdown', event => {
    if (!compact.matches || !event.isPrimary) return;
    start = {x: event.clientX, y: event.clientY, id: event.pointerId};
    touching = true;
    stop();
    stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointerup', event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    touching = false;
    start = undefined;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) show(current + (dx < 0 ? 1 : -1), true);
    else schedule(HOLD_AFTER_INPUT);
  });
  stage.addEventListener('pointercancel', () => { start = undefined; touching = false; schedule(HOLD_AFTER_INPUT); });
  // Hidden tab: stop. Visible again: resume only if the visitor has not paused.
  document.addEventListener('visibilitychange', () => schedule());
  compact.addEventListener('change', () => { if (!compact.matches && expanded) loadAll(); show(current); schedule(); });
  reducedMotion.addEventListener?.('change', () => {
    if (store.get('wj_region_paused') !== null) return;
    paused = reducedMotion.matches;
    updateToggle();
    schedule();
  });
  globalThis.addEventListener?.('wj-language-change', () => setExpanded(expanded, {remember: false}));
  updateToggle();
  setExpanded(expanded, {remember: false});
}
