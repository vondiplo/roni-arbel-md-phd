// Sound model ported from the Android app: SoundSpeed.java, Sound.java and
// SoundManager.loadSoundFiles().

import { GLYPHS } from './glyphs.js';

export const NORMAL_SPEED = 8;
export const SPEED_COUNT = 17;

// Silence durations in seconds at normal speed (SoundManager).
const SILENCE = {
  ' ': 0.5,
  ',': 0.75,
  '.': 1.0,
};

// Final forms share the sound of the letter they close, as in loadSoundFiles().
// The original had no mapping for tsade sofit; it is included here.
const FINAL_FORMS = {
  'ך': 'kaf',
  'ם': 'mem',
  'ן': 'nun',
  'ף': 'peh',
  'ץ': 'tsade',
};

// Character -> sound name, for both scripts the alphabet is written in: the
// Hebrew letters and the Latin transcription homologues printed alongside them.
const LETTERS = { ...FINAL_FORMS };
for (const [name, glyph] of Object.entries(GLYPHS)) {
  LETTERS[glyph.hebrew] = name;
  LETTERS[glyph.latin] = name;
  LETTERS[glyph.latin.toLowerCase()] = name;
}

// The transcription covers 22 of the 26 Latin letters.
const UNTRANSCRIBED = ['F', 'V', 'X', 'Y'];

export function latinGap(char) {
  return UNTRANSCRIBED.includes(char.toUpperCase());
}

// Rate of a speed variant relative to the normal recording. Above 1 means the
// letter is spoken faster, so it takes less time.
function rateFor(speed) {
  if (speed === NORMAL_SPEED) return 1;
  const perType = (SPEED_COUNT - 1) / 2; // 8
  if (speed > NORMAL_SPEED) {
    const rel = speed - NORMAL_SPEED;
    return 1 + 1 / (perType + 1 - rel);
  }
  const rel = NORMAL_SPEED - speed;
  return 1 - 0.5 / (perType + 1 - rel);
}

function suffixFor(speed) {
  if (speed === NORMAL_SPEED) return '';
  if (speed > NORMAL_SPEED) return `_fast_x${speed - NORMAL_SPEED}`;
  return `_slow_x${NORMAL_SPEED - speed}`;
}

function labelFor(speed) {
  if (speed === NORMAL_SPEED) return 'Normal';
  if (speed > NORMAL_SPEED) return `Fast \u00d7${speed - NORMAL_SPEED}`;
  return `Slow \u00d7${NORMAL_SPEED - speed}`;
}

export const SPEEDS = Array.from({ length: SPEED_COUNT }, (_, i) => ({
  index: i,
  suffix: suffixFor(i),
  rate: rateFor(i),
  label: labelFor(i),
}));

export function speedLabel(speed) {
  return SPEEDS[speed].label;
}

export function soundFile(name, speed) {
  return `audio/${name}${SPEEDS[speed].suffix}.wav`;
}

export function isSupported(char) {
  return char in LETTERS || char in SILENCE;
}

export function letterNames() {
  return Object.keys(GLYPHS);
}

/**
 * Turn typed text into the sequence the player will render and speak.
 * Unsupported characters become `skipped` items so the UI can explain them
 * instead of silently dropping them.
 */
export function parseText(text) {
  const items = [];
  for (const char of text) {
    if (char in LETTERS) {
      items.push({ kind: 'letter', char, name: LETTERS[char] });
    } else if (char in SILENCE) {
      items.push({ kind: 'silence', char, base: SILENCE[char] });
    } else if (char === '\n' || char === '\r') {
      // Newlines were appended to the message but never sounded.
      continue;
    } else {
      items.push({ kind: 'skipped', char });
    }
  }
  return items;
}

/** Seconds of silence for a pause character at the given speed. */
export function silenceDuration(item, speed) {
  return item.base / SPEEDS[speed].rate;
}
