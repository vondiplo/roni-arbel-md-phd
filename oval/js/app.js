import { buildAlphabet } from './alphabet.js';
import { OvalEngine } from './engine.js';
import { glyphPill, glyphSvg, glyphTiming } from './glyph.js';
import { GLYPHS } from './glyphs.js';
import { buildKeyboard } from './keyboard.js';
import { latinGap, letterNames, parseText, SPEEDS, speedLabel } from './letters.js';

const SCROLL_MARGIN = 90;
// Matches the horizontal padding of .strip-track, which is the origin that
// absolutely positioned tiles and the playhead are placed from.
const GUTTER = 18;
// Room under each glyph for its two names, and above it for the drag handle.
const CAPTION_H = 26;
const RAIL_H = 20;

// Tighter timeline on phones so several letters stay on screen at once.
function scaleForViewport() {
  return window.innerWidth < 700 ? 130 : 210;
}

const el = {
  text: document.getElementById('text'),
  unsupported: document.getElementById('unsupported'),
  keyboard: document.getElementById('keyboard'),
  kbToggle: document.getElementById('kbToggle'),
  speed: document.getElementById('speed'),
  speedValue: document.getElementById('speedValue'),
  viewport: document.getElementById('stripViewport'),
  track: document.getElementById('stripTrack'),
  playhead: document.getElementById('playhead'),
  grip: document.getElementById('playheadGrip'),
  play: document.getElementById('play'),
  playLabel: document.getElementById('playLabel'),
  restart: document.getElementById('restart'),
  scrub: document.getElementById('scrub'),
  scrubFill: document.getElementById('scrubFill'),
  scrubThumb: document.getElementById('scrubThumb'),
  scrubTicks: document.getElementById('scrubTicks'),
  elapsed: document.getElementById('elapsed'),
  total: document.getElementById('total'),
  status: document.getElementById('status'),
  live: document.getElementById('live'),
  nowGlyph: document.getElementById('nowGlyph'),
  nowChar: document.getElementById('nowChar'),
  nowName: document.getElementById('nowName'),
  alphabet: document.getElementById('alphabet'),
  scriptToggle: document.getElementById('scriptToggle'),
};

const engine = new OvalEngine();

const state = {
  speed: Number(el.speed.value),
  script: 'hebrew',
  pps: scaleForViewport(),
  tiles: [],
  activeIndex: -1,
  lit: null,
  building: false,
  buildToken: 0,
  drag: null,
  frame: 0,
};

/* ---------- building ---------- */

let rebuildTimer = 0;
function scheduleRebuild(delay = 260) {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuild, delay);
}

async function rebuild({ keepPosition = false } = {}) {
  const token = (state.buildToken += 1);
  const items = parseText(el.text.value);
  const playable = items.filter((item) => item.kind !== 'skipped');

  reportUnsupported(items);

  const ratio = keepPosition && engine.duration > 0 ? engine.position() / engine.duration : 0;
  const wasPlaying = engine.playing;
  engine.pause();

  if (playable.length === 0) {
    engine.timeline = null;
    state.tiles = [];
    renderStrip();
    setStatus('Nothing to read yet.');
    el.play.disabled = true;
    el.restart.disabled = true;
    render();
    return;
  }

  state.building = true;
  el.play.disabled = true;
  setStatus('Loading sounds\u2026');

  try {
    await engine.buildTimeline(playable, state.speed, (done, count) => {
      if (token !== state.buildToken) return;
      setStatus(count > 1 ? `Loading sounds \u2014 ${done} of ${count}` : 'Loading sounds\u2026');
    });
  } catch (error) {
    console.error(error);
    if (token !== state.buildToken) return; // a newer build owns the UI now
    state.building = false;
    setStatus('Could not load the recordings. Check the connection and try again.');
    return;
  }

  if (token !== state.buildToken) return;

  state.building = false;
  el.play.disabled = false;
  el.restart.disabled = false;
  setStatus('');
  renderStrip();

  const target = ratio * engine.duration;
  if (keepPosition && target > 0) {
    engine.seek(target);
    if (wasPlaying) engine.play(target);
  } else if (wasPlaying) {
    engine.play(0);
  }

  syncTransport();
  render();
  engine.prefetch(letterNames(), state.speed);
}

function reportUnsupported(items) {
  const chars = [...new Set(items.filter((i) => i.kind === 'skipped').map((i) => i.char))];
  if (chars.length === 0) {
    el.unsupported.hidden = true;
    el.unsupported.textContent = '';
    return;
  }
  const list = chars.map((c) => `<b>${escapeHtml(c)}</b>`).join(', ');
  const gaps = chars.filter(latinGap);
  const note = gaps.length
    ? ' The Latin transcription covers 22 letters, without F, V, X or Y.'
    : '';
  el.unsupported.hidden = false;
  el.unsupported.innerHTML =
    `OVAL has no character for ${list}, so ${chars.length === 1 ? 'it is' : 'they are'} skipped.${note}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------- strip ---------- */

function renderStrip() {
  el.track.querySelectorAll('.tile, .strip-empty').forEach((node) => node.remove());
  state.tiles = [];
  state.lit = null;
  // The tiles these pointed at are gone, so the next frame has to redraw the
  // highlight and the readout from scratch.
  state.activeIndex = -1;

  const segments = engine.segments;
  if (segments.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'strip-empty';
    empty.textContent = 'Type above to see the words drawn as sound.';
    el.track.append(empty);
    el.track.style.width = '';
    el.playhead.hidden = true;
    return;
  }

  el.track.style.width = `${Math.max(1, engine.duration * state.pps) + GUTTER * 2}px`;
  el.playhead.hidden = false;

  const rate = SPEEDS[state.speed].rate;
  const sheetH = Math.max(40, (el.track.clientHeight || 170) - CAPTION_H - RAIL_H);

  for (const segment of segments) {
    const width = Math.max(4, segment.duration * state.pps - 3);

    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile' + (segment.kind === 'silence' ? ' tile-silence' : '');
    tile.style.left = `${segment.start * state.pps + GUTTER + 1.5}px`;
    tile.style.width = `${width}px`;

    const sheet = document.createElement('span');
    sheet.className = 'tile-sheet';
    sheet.style.height = `${sheetH}px`;

    let columns = [];
    if (segment.kind === 'letter') {
      const timing = glyphTiming(segment.name, rate, segment.duration);
      // Columns are placed on the same time axis as the playhead, so the mark
      // being lit is the one directly under it.
      const svg = glyphSvg(segment.name, {
        width,
        height: sheetH,
        lead: timing.leadFraction * width,
        cellW: timing.columnFraction * width,
      });
      sheet.append(svg);
      columns = [...svg.querySelectorAll('.glyph-col')];
      segment.timing = timing;
    }

    tile.append(sheet, caption(segment));
    tile.setAttribute('aria-label', `${describe(segment)}, jump here`);
    tile.addEventListener('click', () => jumpTo(segment.start));

    el.track.append(tile);
    state.tiles.push({ node: tile, columns, lit: -1 });
  }

  renderTicks();
}

function caption(segment) {
  const cap = document.createElement('span');
  cap.className = 'tile-cap';
  cap.style.height = `${CAPTION_H}px`;
  if (segment.kind !== 'letter') {
    cap.classList.add('tile-cap-pause');
    cap.textContent = segment.char === ' ' ? 'space' : segment.char === ',' ? 'comma' : 'stop';
    return cap;
  }
  const glyph = GLYPHS[segment.name];
  const hebrew = document.createElement('b');
  hebrew.lang = 'he';
  hebrew.textContent = glyph.hebrew;
  const latin = document.createElement('i');
  latin.textContent = glyph.latin;
  cap.append(hebrew, latin);
  return cap;
}

function describe(segment) {
  if (segment.kind === 'letter') {
    const glyph = GLYPHS[segment.name];
    return `${glyph.hebrew} ${glyph.latin}, ${segment.name}`;
  }
  if (segment.char === ' ') return 'space';
  if (segment.char === ',') return 'comma pause';
  return 'full stop pause';
}

function renderTicks() {
  el.scrubTicks.textContent = '';
  const duration = engine.duration;
  if (duration <= 0) return;
  for (const segment of engine.segments.slice(1)) {
    const tick = document.createElement('span');
    tick.className = 'scrub-tick';
    tick.style.left = `${(segment.start / duration) * 100}%`;
    el.scrubTicks.append(tick);
  }
}

/* ---------- rendering the playhead ---------- */

function render() {
  const duration = engine.duration;
  const position = state.drag ? state.drag.time : engine.position();

  el.playhead.style.left = `${position * state.pps + GUTTER}px`;
  const pct = duration > 0 ? (position / duration) * 100 : 0;
  el.scrubFill.style.width = `${pct}%`;
  el.scrubThumb.style.left = `${pct}%`;
  el.elapsed.textContent = position.toFixed(1);
  el.total.textContent = duration.toFixed(1);

  el.scrub.setAttribute('aria-valuemax', duration.toFixed(1));
  el.scrub.setAttribute('aria-valuenow', position.toFixed(1));

  const index = indexAt(position);
  if (index !== state.activeIndex) {
    setActive(index);
    state.activeIndex = index;
  }
  lightColumn(index, position);
  // Auto-scrolling during a grip drag would move the strip under the pointer
  // and fight the gesture, so it only follows playback and bar scrubbing.
  if (engine.playing || (state.drag && state.drag.source === el.scrub)) {
    keepPlayheadVisible(position);
  }
}

function setActive(index) {
  state.tiles.forEach((tile, i) => {
    tile.node.classList.toggle('is-active', i === index);
    tile.node.classList.toggle('is-done', i < index);
  });

  const segment = engine.segments[index];
  if (!segment || segment.kind !== 'letter') {
    el.nowGlyph.textContent = '';
    el.nowChar.textContent = '\u00b7';
    el.nowName.textContent = segment ? describe(segment) : engine.duration > 0 ? 'ready' : '';
  } else {
    const glyph = GLYPHS[segment.name];
    el.nowGlyph.textContent = '';
    el.nowGlyph.append(glyphPill(segment.name, { rowH: 5 }));
    el.nowChar.textContent = `${glyph.hebrew} ${glyph.latin}`;
    el.nowName.textContent = `${segment.name} \u00b7 ${glyph.colour}`;
  }

  if (!segment) {
    el.scrub.setAttribute('aria-valuetext', 'start');
    return;
  }
  el.scrub.setAttribute('aria-valuetext', `${describe(segment)}, letter ${index + 1} of ${engine.segments.length}`);
  el.live.textContent = describe(segment);
}

/** Highlights the single mark the sweep line is crossing. */
function lightColumn(index, position) {
  const entry = state.tiles[index];
  const segment = engine.segments[index];
  let column = -1;
  if (entry && segment && segment.timing && segment.duration > 0) {
    const fraction = (position - segment.start) / segment.duration;
    const at = Math.floor((fraction - segment.timing.leadFraction) / segment.timing.columnFraction);
    if (at >= 0 && at < entry.columns.length) column = at;
  }

  const previous = state.lit;
  if (previous && (previous.index !== index || previous.column !== column)) {
    const node = state.tiles[previous.index];
    if (node && node.columns[previous.column]) {
      node.columns[previous.column].classList.remove('is-lit');
    }
    state.lit = null;
  }
  if (column >= 0 && !state.lit) {
    entry.columns[column].classList.add('is-lit');
    state.lit = { index, column };
  }
}

function indexAt(time) {
  const segments = engine.segments;
  for (let i = 0; i < segments.length; i += 1) {
    if (time < segments[i].end - 1e-6) return i;
  }
  return segments.length - 1;
}

function keepPlayheadVisible(position) {
  const x = position * state.pps + GUTTER;
  const view = el.viewport;
  const left = view.scrollLeft;
  const right = left + view.clientWidth;
  if (x < left + SCROLL_MARGIN || x > right - SCROLL_MARGIN) {
    view.scrollLeft = Math.max(0, x - view.clientWidth / 2);
  }
}

function tick() {
  render();
  state.frame = requestAnimationFrame(tick);
}

function startLoop() {
  if (!state.frame) state.frame = requestAnimationFrame(tick);
}

function stopLoop() {
  if (state.frame) cancelAnimationFrame(state.frame);
  state.frame = 0;
  render();
}

/* ---------- transport ---------- */

function syncTransport() {
  const playing = engine.playing;
  el.play.classList.toggle('is-playing', playing);
  el.playLabel.textContent = playing ? 'Pause' : 'Play';
  el.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  if (playing) startLoop();
  else stopLoop();
}

async function togglePlay() {
  if (state.building || !engine.timeline) return;
  if (engine.playing) {
    engine.pause();
  } else {
    await engine.resume();
    engine.play();
  }
  syncTransport();
}

function jumpTo(time) {
  if (!engine.timeline) return;
  engine.seek(time);
  render();
  syncTransport();
}

function setStatus(message) {
  el.status.textContent = message;
}

/* ---------- scrubbing ---------- */

function timeFromScrub(clientX) {
  const rect = el.scrub.getBoundingClientRect();
  const ratio = (clientX - rect.left) / (rect.width || 1);
  return Math.min(1, Math.max(0, ratio)) * engine.duration;
}

function timeFromStrip(clientX) {
  const rect = el.viewport.getBoundingClientRect();
  const x = clientX - rect.left + el.viewport.scrollLeft - GUTTER;
  return Math.min(engine.duration, Math.max(0, x / state.pps));
}

function beginDrag(source, time) {
  if (!engine.timeline) return;
  const wasPlaying = engine.playing;
  engine.pause();
  state.drag = { source, time, wasPlaying };
  el.playhead.classList.add('is-dragging');
  startLoop();
  render();
}

function moveDrag(time) {
  if (!state.drag) return;
  state.drag.time = Math.min(engine.duration, Math.max(0, time));
  render();
}

function endDrag() {
  if (!state.drag) return;
  const { time, wasPlaying } = state.drag;
  state.drag = null;
  el.playhead.classList.remove('is-dragging');
  engine.seek(time);
  if (wasPlaying && time < engine.duration - 0.002) engine.play(time);
  syncTransport();
  render();
}

function attachDrag(node, toTime) {
  node.addEventListener('pointerdown', (event) => {
    if (!engine.timeline) return;
    event.preventDefault();
    node.focus({ preventScroll: true }); // preventDefault suppresses the implicit focus
    node.setPointerCapture(event.pointerId);
    beginDrag(node, toTime(event.clientX));
  });
  node.addEventListener('pointermove', (event) => {
    if (state.drag && state.drag.source === node) moveDrag(toTime(event.clientX));
  });
  node.addEventListener('pointerup', () => endDrag());
  node.addEventListener('pointercancel', () => endDrag());
}

attachDrag(el.scrub, timeFromScrub);
attachDrag(el.grip, timeFromStrip);

/* ---------- keyboard ---------- */

function step(delta) {
  if (!engine.timeline) return;
  const segments = engine.segments;
  const current = indexAt(engine.position());
  const atStart = Math.abs(engine.position() - segments[current].start) < 0.06;
  let target = delta < 0 ? (atStart ? current - 1 : current) : current + 1;
  target = Math.min(segments.length - 1, Math.max(0, target));
  jumpTo(segments[target].start);
}

el.scrub.addEventListener('keydown', (event) => {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'Spacebar'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'ArrowLeft') step(-1);
  else if (event.key === 'ArrowRight') step(1);
  else if (event.key === 'Home') jumpTo(0);
  else if (event.key === 'End') jumpTo(engine.duration);
  else togglePlay();
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  // Text fields keep their own keys, and the scrubber has its own handler.
  const isField = target instanceof HTMLElement &&
    (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable);
  if (isField || target === el.scrub) return;

  if (event.key === ' ' || event.key === 'Spacebar') {
    // A focused button already turns Space into a click of its own.
    if (target instanceof HTMLElement && target.tagName === 'BUTTON') return;
    event.preventDefault();
    togglePlay();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    step(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    step(1);
  } else if (event.key === 'Home') {
    event.preventDefault();
    jumpTo(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    jumpTo(engine.duration);
  }
});

/* ---------- controls ---------- */

el.play.addEventListener('click', togglePlay);

el.restart.addEventListener('click', async () => {
  if (!engine.timeline) return;
  await engine.resume();
  engine.play(0);
  syncTransport();
  render();
});

engine.onEnded = () => {
  syncTransport();
  render();
};

el.text.addEventListener('input', () => scheduleRebuild());

el.speed.addEventListener('input', () => {
  state.speed = Number(el.speed.value);
  el.speedValue.value = speedLabel(state.speed);
});
el.speed.addEventListener('change', () => {
  state.speed = Number(el.speed.value);
  el.speedValue.value = speedLabel(state.speed);
  rebuild({ keepPosition: true });
});

document.querySelectorAll('[data-sample]').forEach((button) => {
  button.addEventListener('click', () => {
    el.text.value = button.dataset.sample;
    rebuild();
  });
});

el.kbToggle.addEventListener('click', () => {
  const open = el.keyboard.hidden;
  el.keyboard.hidden = !open;
  el.kbToggle.setAttribute('aria-expanded', String(open));
});

const keyboardHooks = {
  onInsert(char) {
    insertAtCursor(char);
    scheduleRebuild(120);
  },
  onBackspace() {
    const { selectionStart, selectionEnd } = el.text;
    if (selectionStart !== selectionEnd) {
      el.text.setRangeText('', selectionStart, selectionEnd, 'end');
    } else if (selectionStart > 0) {
      el.text.setRangeText('', selectionStart - 1, selectionStart, 'end');
    }
    el.text.focus();
    scheduleRebuild(120);
  },
  onPreview(char) {
    const item = parseText(char)[0];
    if (item && item.kind === 'letter') previewLetter(item.name);
  },
};

function previewLetter(name) {
  engine.preview(name, state.speed).catch(() => {});
}

buildKeyboard(el.keyboard, state.script, keyboardHooks);
buildAlphabet(el.alphabet, { onPreview: previewLetter });

el.scriptToggle.querySelectorAll('button').forEach((button) => {
  button.addEventListener('click', () => {
    state.script = button.dataset.script;
    el.scriptToggle.querySelectorAll('button').forEach((other) => {
      other.setAttribute('aria-pressed', String(other === button));
    });
    buildKeyboard(el.keyboard, state.script, keyboardHooks);
    el.text.placeholder = state.script === 'hebrew' ? 'הקלד מילה או משפט' : 'type a word or a sentence';
  });
});

function insertAtCursor(char) {
  const start = el.text.selectionStart ?? el.text.value.length;
  const end = el.text.selectionEnd ?? el.text.value.length;
  el.text.setRangeText(char, start, end, 'end');
  el.text.focus();
}

/* ---------- page chrome ---------- */

const header = document.getElementById('siteHeader');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.12 }
);
document.querySelectorAll('.reveal').forEach((node, i) => {
  node.style.transitionDelay = `${Math.min(i % 6, 5) * 0.05}s`;
  io.observe(node);
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const pps = scaleForViewport();
    if (pps !== state.pps) {
      state.pps = pps;
      renderStrip();
      state.activeIndex = -1; // force the highlight back onto the new tiles
    }
    render();
  }, 120);
});

el.speedValue.value = speedLabel(state.speed);
rebuild();
