// The Hebrew layout is ported from res/xml/qwerty.xml. The original mislabelled
// its comma and full stop key codes; the labels here are what the keys insert.
//
// The Latin layout offers the transcription homologues on a QWERTY bed. F, V, X
// and Y are absent because the transcription has no character for them.
const LAYOUTS = {
  hebrew: [
    [',', '.', 'ק', 'ר', 'א', 'ט', 'ו', 'ן', 'ם', 'פ'],
    ['ש', 'ד', 'ג', 'כ', 'ע', 'י', 'ח', 'ל', 'ך', 'ף'],
    ['ז', 'ס', 'ב', 'ה', 'נ', 'מ', 'צ', 'ת', 'ץ'],
  ],
  latin: [
    ['Q', 'W', 'E', 'R', 'T', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'C', 'B', 'N', 'M', ',', '.'],
  ],
};

/**
 * Renders the on-screen keyboard for one script.
 *
 * As in the Android app, touching a key sounds its letter immediately and
 * inserts it on release.
 */
export function buildKeyboard(root, script, { onInsert, onBackspace, onPreview }) {
  root.textContent = '';
  root.dataset.script = script;

  for (const row of LAYOUTS[script]) {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    for (const char of row) {
      rowEl.append(key(char, { onInsert, onPreview }));
    }
    root.append(rowEl);
  }

  const bottom = document.createElement('div');
  bottom.className = 'kb-row';

  const space = key(' ', { onInsert, onPreview, label: 'space', wide: true });
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'kb-key kb-key-util';
  back.textContent = 'delete';
  back.setAttribute('aria-label', 'Backspace');
  back.addEventListener('click', () => onBackspace());

  bottom.append(space, back);
  root.append(bottom);
}

function key(char, { onInsert, onPreview, label, wide }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'kb-key' + (wide ? ' kb-key-wide' : '');
  button.textContent = label || char;
  button.dataset.char = char;
  if (label) {
    button.setAttribute('aria-label', label);
    button.classList.add('kb-key-util');
  }

  button.addEventListener('pointerdown', () => onPreview(char));
  button.addEventListener('click', () => onInsert(char));
  return button;
}
