// Draws OVAL characters as SVG.
//
// A glyph lives on a grid of GRID_ROWS rows and one column per sounded moment.
// Rows are always drawn at the same height so two characters can be compared by
// pitch, and elements are kept square-ish so a dot reads as a dot.

import { COLUMN_TIME, COLOURS, GLYPHS, GRID_ROWS, LEAD_IN } from './glyphs.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} name
 * @param {object} box
 * @param {number} box.width   overall width in the same units as the viewBox
 * @param {number} box.height
 * @param {number} box.lead    empty run before the first column
 * @param {number} box.cellW   width of one column
 */
export function glyphSvg(name, { width, height, lead, cellW }) {
  const glyph = GLYPHS[name];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'glyph');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  if (!glyph) return svg;

  const rowH = height / GRID_ROWS;
  // Elements are as wide as a row is tall, so a single cell comes out square
  // even when the columns are stretched to sit on the audio's time axis.
  const markW = Math.min(cellW, rowH);
  const radius = Math.min(2, markW * 0.16);
  const fill = COLOURS[glyph.colour].fill;
  // Lets the lit column glow in its own colour via currentColor.
  svg.style.color = fill;

  glyph.columns.forEach((column, index) => {
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('class', 'glyph-col');
    const x = lead + index * cellW + (cellW - markW) / 2;
    for (const [row, span] of column) {
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', round(x));
      rect.setAttribute('y', round(row * rowH));
      rect.setAttribute('width', round(markW));
      rect.setAttribute('height', round(span * rowH));
      rect.setAttribute('rx', round(radius));
      rect.setAttribute('fill', fill);
      group.append(rect);
    }
    svg.append(group);
  });

  return svg;
}

/**
 * A glyph on its own, in the tall proportions the alphabet is printed in.
 * Cells are square here because there is no timeline to line up with.
 */
export function glyphPill(name, { rowH = 8 } = {}) {
  const glyph = GLYPHS[name];
  const columns = glyph ? glyph.columns.length : 1;
  return glyphSvg(name, {
    width: rowH * (columns + 1),
    height: rowH * GRID_ROWS,
    lead: rowH * 0.5,
    cellW: rowH,
  });
}

/** Fractions of a letter's recording taken by its lead-in and by one column. */
export function glyphTiming(name, rate, duration) {
  const glyph = GLYPHS[name];
  const columns = glyph ? glyph.columns.length : 1;
  return {
    columns,
    leadFraction: LEAD_IN / rate / duration,
    columnFraction: COLUMN_TIME / rate / duration,
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
