import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../region-carousel.mjs', import.meta.url), 'utf8');
function setup({compact = true, reduced = false} = {}) {
  function element(label = '') {
    const handlers = {}, attributes = {'aria-label': label}, classes = new Set();
    return {attributes, classes, handlers, classList: {toggle(name, active) { active ? classes.add(name) : classes.delete(name); }},
      setAttribute(name, value) { attributes[name] = value; }, getAttribute(name) { return attributes[name]; },
      addEventListener(name, handler) { handlers[name] = handler; },
      fire(name, event = {}) { handlers[name]?.(event); }};
  }
  const slides = Array.from({length: 9}, (_, i) => {
    const slide = element(`region ${i}`), image = {};
    slide.querySelector = () => image;
    return slide;
  });
  const dots = Array.from({length: 9}, () => element());
  const stage = element(), toggle = element(), announcement = element(), prev = element(), next = element();
  const elements = {'.region-stage': stage, '.region-toggle': toggle, '.region-announcement': announcement, '.region-prev': prev, '.region-next': next};
  const gallery = element();
  gallery.querySelector = selector => elements[selector];
  gallery.querySelectorAll = selector => selector === '.region-slide' ? slides : dots;
  gallery.contains = target => Object.values(elements).includes(target) || dots.includes(target);
  const document = element(); document.hidden = false; document.querySelector = () => gallery;
  const media = element(); media.matches = compact;
  const motion = element(); motion.matches = reduced;
  let timer, delay;
  runInNewContext(source, {document, matchMedia: query => query.includes('900px') ? media : motion,
    setTimeout(fn, ms) { timer = fn; delay = ms; return 1; }, clearTimeout() { timer = undefined; }});
  return {slides, dots, stage, toggle, announcement, prev, next, gallery, document, media, motion,
    active: () => slides.findIndex(slide => slide.classes.has('is-active')),
    ticking: () => Boolean(timer), delay: () => delay, tick() { const run = timer; timer = undefined; run?.(); }};
}

test('mobile advances every three seconds and loops through all nine images', () => {
  const ui = setup();
  assert.equal(ui.delay(), 3000);
  for (let i = 0; i < 18; i++) { assert.equal(ui.active(), i % 9); ui.tick(); }
  assert.equal(ui.announcement.textContent, undefined);
  assert.equal(ui.slides.filter(s => s.attributes['aria-hidden'] === 'false').length, 1);
});
test('manual buttons, dots, keyboard and swipe select the expected image', () => {
  const ui = setup();
  ui.prev.fire('click'); assert.equal(ui.active(), 8);
  ui.next.fire('click'); assert.equal(ui.active(), 0);
  ui.dots[4].fire('click'); assert.equal(ui.active(), 4);
  ui.gallery.fire('keydown', {key: 'ArrowRight', preventDefault() {}}); assert.equal(ui.active(), 5);
  ui.stage.fire('pointerdown', {isPrimary: true, pointerId: 1, clientX: 200, clientY: 100});
  assert.equal(ui.ticking(), false);
  ui.stage.fire('pointerup', {pointerId: 1, clientX: 90, clientY: 104}); assert.equal(ui.active(), 6);
  assert.equal(ui.announcement.textContent, 'region 6');
  assert.equal(ui.dots[6].attributes['aria-pressed'], 'true');
});
test('pause, hidden tab, focus and reduced-motion stop automatic playback', () => {
  const ui = setup();
  ui.toggle.fire('click'); assert.equal(ui.ticking(), false);
  ui.toggle.fire('click'); assert.equal(ui.ticking(), true);
  ui.document.hidden = true; ui.document.fire('visibilitychange'); assert.equal(ui.ticking(), false);
  ui.document.hidden = false; ui.document.fire('visibilitychange'); assert.equal(ui.ticking(), true);
  ui.gallery.fire('focusin', {target: {matches: () => true}}); assert.equal(ui.ticking(), false);
  ui.gallery.fire('focusout', {relatedTarget: null}); assert.equal(ui.ticking(), true);
  const reduced = setup({reduced: true}); assert.equal(reduced.ticking(), false);
  reduced.next.fire('click'); assert.equal(reduced.active(), 1);
});
test('desktop exposes all nine panels and does not auto-advance', () => {
  const ui = setup({compact: false});
  assert.equal(ui.ticking(), false);
  assert.ok(ui.slides.every(slide => slide.attributes['aria-hidden'] === 'false'));
  ui.media.matches = true; ui.media.fire('change'); assert.equal(ui.ticking(), true);
  ui.media.matches = false; ui.media.fire('change'); assert.equal(ui.ticking(), false);
  assert.ok(ui.slides.every(slide => slide.attributes['aria-hidden'] === 'false'));
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
