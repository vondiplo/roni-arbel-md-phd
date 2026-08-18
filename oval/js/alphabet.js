// The alphabet chart: each character in its OVAL form, above the letter it is
// written and typed with.

import { glyphPill } from './glyph.js';
import { COLOURS, GLYPHS } from './glyphs.js';

// The eleven characters participants were trained on in the study.
const TRAINED = new Set(['alef', 'dalet', 'waw', 'heth', 'teth', 'yudh', 'lamedh', 'peh', 'tsade', 'qoph', 'shin']);

export function buildAlphabet(root, { onPreview }) {
  root.textContent = '';

  for (const [name, glyph] of Object.entries(GLYPHS)) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'letter' + (TRAINED.has(name) ? ' is-trained' : '');
    cell.dataset.name = name;
    cell.setAttribute('aria-label', `${glyph.latin}, ${COLOURS[glyph.colour].instrument}, hear it`);

    const pill = document.createElement('span');
    pill.className = 'letter-pill';
    pill.append(glyphPill(name, { rowH: 7 }));

    const label = document.createElement('span');
    label.className = 'letter-char';
    label.textContent = glyph.latin;

    cell.append(pill, label);
    cell.addEventListener('click', () => onPreview(name));
    root.append(cell);
  }
}
