// The alphabet chart, laid out as it is printed in the paper: each character in
// its OVAL form above its Hebrew name and its Latin transcription homologue.

import { glyphPill } from './glyph.js';
import { GLYPHS } from './glyphs.js';

const HEBREW_NAMES = {
  alef: 'Alef', bet: 'Bet', gimel: 'Gimel', dalet: 'Dalet', he: 'He', waw: 'Waw',
  zain: 'Zain', heth: 'Het', teth: 'Teth', yudh: 'Yodh', kaf: 'Kaph', lamedh: 'Lamedh',
  mem: 'Mem', nun: 'Nun', samech: 'Samech', ain: 'Ain', peh: 'Peh', tsade: 'Tsade',
  qoph: 'Qoph', reish: 'Reish', shin: 'Shin', tav: 'Tav',
};

// The eleven characters participants were trained on in the study.
const TRAINED = new Set(['alef', 'dalet', 'waw', 'heth', 'teth', 'yudh', 'lamedh', 'peh', 'tsade', 'qoph', 'shin']);

export function buildAlphabet(root, { onPreview }) {
  root.textContent = '';

  for (const [name, glyph] of Object.entries(GLYPHS)) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'letter' + (TRAINED.has(name) ? ' is-trained' : '');
    cell.dataset.name = name;
    cell.setAttribute('aria-label', `${HEBREW_NAMES[name]}, ${glyph.latin}, hear it`);

    const pill = document.createElement('span');
    pill.className = 'letter-pill';
    pill.append(glyphPill(name, { rowH: 7 }));

    const label = document.createElement('span');
    label.className = 'letter-name';
    label.textContent = HEBREW_NAMES[name];

    const chars = document.createElement('span');
    chars.className = 'letter-chars';
    const hebrew = document.createElement('b');
    hebrew.lang = 'he';
    hebrew.textContent = glyph.hebrew;
    const latin = document.createElement('i');
    latin.textContent = glyph.latin;
    chars.append(hebrew, latin);

    cell.append(pill, label, chars);
    cell.addEventListener('click', () => onPreview(name));
    root.append(cell);
  }
}
