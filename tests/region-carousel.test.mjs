import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../region-carousel.mjs', import.meta.url), 'utf8');
function setup({compact = true, reduced = false, stored = {}, open = true} = {}) {
  function element(label = '') {
    const handlers = {}, attributes = {'aria-label': label}, classes = new Set();
    return {attributes, classes, handlers, classList: {toggle(name, active) { active ? classes.add(name) : classes.delete(name); }},
      setAttribute(name, value) { attributes[name] = value; }, getAttribute(name) { return attributes[name]; },
      addEventListener(name, handler) { handlers[name] = handler; },
      fire(name, event = {}) { handlers[name]?.(event); }};
  }
  const slides = Array.from({length: 9}, (_, i) => {
    const slide = element(`region ${i}`), image = {dataset: {src: `img${i}.webp`}};
    slide.image = image;
    slide.querySelector = () => image;
    return slide;
  });
  const dots = Array.from({length: 9}, () => element());
  const thumbs = Array.from({length: 9}, () => element());
  const stage = element(), toggle = element(), announcement = element(), prev = element(), next = element(), viewer = element(), expand = element();
  viewer.hidden = true;
  const elements = {'.region-stage': stage, '.region-toggle': toggle, '.region-announcement': announcement, '.region-prev': prev, '.region-next': next, '.region-viewer': viewer, '.region-expand': expand};
  const gallery = element();
  gallery.querySelector = selector => elements[selector];
  gallery.querySelectorAll = selector => selector === '.region-slide' ? slides : selector === '.region-thumb' ? thumbs : dots;
  gallery.contains = target => Object.values(elements).includes(target) || dots.includes(target);
  const document = element(); document.hidden = false; document.querySelector = () => gallery;
  const media = element(); media.matches = compact;
  const motion = element(); motion.matches = reduced;
  const saved = {wj_region_open: open ? '1' : '0', ...stored};
  const localStorage = {getItem: key => saved[key] ?? null, setItem: (key, value) => { saved[key] = String(value); }};
  let timer, delay;
  runInNewContext(source, {document, localStorage, matchMedia: query => query.includes('900px') ? media : motion,
    setTimeout(fn, ms) { timer = fn; delay = ms; return 1; }, clearTimeout() { timer = undefined; }});
  return {slides, dots, thumbs, stage, toggle, announcement, prev, next, gallery, document, media, motion, viewer, expand, saved,
    active: () => slides.findIndex(slide => slide.classes.has('is-active')),
    ticking: () => Boolean(timer), delay: () => delay, tick() { const run = timer; timer = undefined; run?.(); }};
}

test('collapsed entry downloads no full artwork and does not autoplay', () => {
  const ui = setup({open: false});
  assert.equal(ui.viewer.hidden, true);
  assert.equal(ui.expand.attributes['aria-expanded'], 'false');
  assert.equal(ui.ticking(), false);
  assert.ok(ui.slides.every(slide => !slide.image.src), 'full images wait until the viewer opens');
  ui.thumbs[4].fire('click');
  assert.equal(ui.viewer.hidden, false);
  assert.equal(ui.expand.attributes['aria-expanded'], 'true');
  assert.equal(ui.active(), 4);
  assert.equal(ui.slides[4].image.src, 'img4.webp');
  assert.equal(ui.slides[5].image.src, 'img5.webp');
  assert.equal(ui.slides[7].image.src, undefined, 'only the current and next images load on phones');
  assert.equal(ui.saved.wj_region_open, '1');
  assert.equal(ui.thumbs[4].attributes['aria-current'], 'true');
});
test('mobile advances every three seconds and loops through all nine images', () => {
  const ui = setup();
  assert.equal(ui.delay(), 3000);
  for (let i = 0; i < 18; i++) { assert.equal(ui.active(), i % 9); ui.tick(); }
  assert.equal(ui.announcement.textContent, undefined);
  assert.equal(ui.slides.filter(s => s.attributes['aria-hidden'] === 'false').length, 1);
});
test('manual buttons, dots, keyboard and swipe select the expected image and hold autoplay', () => {
  const ui = setup();
  ui.prev.fire('click'); assert.equal(ui.active(), 8);
  assert.equal(ui.delay(), 8000, 'no sudden change right after a manual choice');
  ui.next.fire('click'); assert.equal(ui.active(), 0);
  ui.dots[4].fire('click'); assert.equal(ui.active(), 4);
  ui.viewer.fire('keydown', {key: 'ArrowRight', preventDefault() {}}); assert.equal(ui.active(), 5);
  ui.stage.fire('pointerdown', {isPrimary: true, pointerId: 1, clientX: 200, clientY: 100});
  assert.equal(ui.ticking(), false);
  ui.stage.fire('pointerup', {pointerId: 1, clientX: 90, clientY: 104}); assert.equal(ui.active(), 6);
  assert.equal(ui.announcement.textContent, 'region 6');
  assert.equal(ui.dots[6].attributes['aria-pressed'], 'true');
});
test('pause, hidden tab and keyboard focus stop automatic playback', () => {
  const ui = setup();
  ui.toggle.fire('click'); assert.equal(ui.ticking(), false);
  assert.equal(ui.saved.wj_region_paused, '1');
  ui.toggle.fire('click'); assert.equal(ui.ticking(), true);
  ui.document.hidden = true; ui.document.fire('visibilitychange'); assert.equal(ui.ticking(), false);
  ui.document.hidden = false; ui.document.fire('visibilitychange'); assert.equal(ui.ticking(), true);
  ui.gallery.fire('focusin', {target: {matches: () => true}}); assert.equal(ui.ticking(), false);
  ui.gallery.fire('focusout', {relatedTarget: null}); assert.equal(ui.ticking(), true);
});
test('a stored pause survives a new visit and returning to the tab', () => {
  const ui = setup({stored: {wj_region_paused: '1'}});
  assert.equal(ui.ticking(), false);
  assert.equal(ui.toggle.attributes['aria-pressed'], 'true');
  ui.document.hidden = true; ui.document.fire('visibilitychange');
  ui.document.hidden = false; ui.document.fire('visibilitychange');
  assert.equal(ui.ticking(), false, 'returning to the tab does not override the pause');
});
test('reduced motion starts paused until the visitor presses play, which is remembered', () => {
  const ui = setup({reduced: true});
  assert.equal(ui.ticking(), false);
  assert.equal(ui.toggle.attributes['aria-pressed'], 'true');
  assert.equal(ui.toggle.attributes['aria-label'], '播放輪播 / Play slideshow');
  ui.toggle.fire('click');
  assert.equal(ui.ticking(), true);
  assert.equal(ui.saved.wj_region_paused, '0');
  ui.motion.matches = false; ui.motion.fire('change');
  assert.equal(ui.ticking(), true, 'explicit choice wins over later preference changes');
  const again = setup({reduced: true, stored: {wj_region_paused: '0'}});
  assert.equal(again.ticking(), true);
});
test('reduced-motion preference changes apply only when the visitor has not chosen', () => {
  const ui = setup();
  assert.equal(ui.ticking(), true);
  ui.motion.matches = true; ui.motion.fire('change');
  assert.equal(ui.ticking(), false);
  assert.equal(ui.toggle.attributes['aria-pressed'], 'true');
});
test('desktop exposes all nine panels and does not auto-advance', () => {
  const ui = setup({compact: false});
  assert.equal(ui.ticking(), false);
  assert.ok(ui.slides.every(slide => slide.attributes['aria-hidden'] === 'false'));
  assert.ok(ui.slides.every(slide => slide.image.src), 'opening on desktop loads all nine originals');
  ui.media.matches = true; ui.media.fire('change'); assert.equal(ui.ticking(), true);
  ui.media.matches = false; ui.media.fire('change'); assert.equal(ui.ticking(), false);
  assert.ok(ui.slides.every(slide => slide.attributes['aria-hidden'] === 'false'));
});
test('collapsing stops playback and is remembered', () => {
  const ui = setup();
  assert.equal(ui.ticking(), true);
  ui.expand.fire('click');
  assert.equal(ui.viewer.hidden, true);
  assert.equal(ui.ticking(), false);
  assert.equal(ui.saved.wj_region_open, '0');
});
test('touching a carousel dot does not leave autoplay paused after focus', () => {
  const ui = setup();
  ui.gallery.fire('focusin', {target: {matches: () => true}});
  assert.equal(ui.ticking(), false);
  ui.gallery.fire('pointerdown', {pointerType: 'touch'});
  ui.gallery.fire('focusin', {target: {matches: () => false}});
  ui.dots[2].fire('click');
  assert.equal(ui.active(), 2);
  assert.equal(ui.ticking(), true);
  ui.tick();
  assert.equal(ui.active(), 3);
});
test('home markup keeps full originals lazy and offers a thumbnail entry for each region', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/class="region-thumb"/g) || []).length, 9);
  assert.equal((html.match(/class="region-slide/g) || []).length, 9);
  assert.ok(!/region-slide[^>]*>\s*<div class="region-art"><img src=/.test(html), 'no full original is fetched before opening');
  assert.match(html, /id="regionViewer" class="region-viewer" hidden/);
  assert.match(html, /aria-controls="regionViewer"/);
});
