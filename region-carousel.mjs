const gallery = document.querySelector('.region-showcase');
if (gallery) {
  const slides = [...gallery.querySelectorAll('.region-slide')];
  const dots = [...gallery.querySelectorAll('.region-dot')];
  const stage = gallery.querySelector('.region-stage');
  const toggle = gallery.querySelector('.region-toggle');
  const announcement = gallery.querySelector('.region-announcement');
  const compact = matchMedia('(max-width: 900px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let paused = reducedMotion.matches;
  let hovering = false;
  let focused = false;
  let touching = false;
  let timer;
  let start;
  const count = slides.length;
  function stop() { clearTimeout(timer); }
  function schedule() {
    stop();
    if (compact.matches && !paused && !hovering && !focused && !touching && !document.hidden) {
      timer = setTimeout(() => { show(current + 1); schedule(); }, 3000);
    }
  }
  function show(index, manual = false) {
    current = (index + count) % count;
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === current);
      slide.setAttribute('aria-hidden', String(compact.matches && i !== current));
      if (i === current || i === (current + 1) % count) slide.querySelector('img').loading = 'eager';
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === current);
      dot.setAttribute('aria-pressed', String(i === current));
    });
    gallery.setAttribute('aria-roledescription', compact.matches ? 'carousel' : 'gallery');
    if (manual) {
      announcement.textContent = slides[current].getAttribute('aria-label');
      schedule();
    }
  }
  function updateToggle() {
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? '播放輪播 / Play slideshow' : '暫停輪播 / Pause slideshow');
    toggle.textContent = paused ? '▶' : 'Ⅱ';
  }
  gallery.querySelector('.region-prev').addEventListener('click', () => show(current - 1, true));
  gallery.querySelector('.region-next').addEventListener('click', () => show(current + 1, true));
  dots.forEach((dot, i) => dot.addEventListener('click', () => show(i, true)));
  toggle.addEventListener('click', () => { paused = !paused; updateToggle(); schedule(); });
  gallery.addEventListener('keydown', event => {
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
    schedule();
  });
  stage.addEventListener('pointercancel', () => { start = undefined; touching = false; schedule(); });
  document.addEventListener('visibilitychange', schedule);
  compact.addEventListener('change', () => { show(current); schedule(); });
  reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; updateToggle(); schedule(); });
  show(0);
  updateToggle();
  schedule();
}
