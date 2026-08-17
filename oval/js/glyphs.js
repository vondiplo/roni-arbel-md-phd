// The OVAL alphabet, extracted from Fig 1 of Arbel, Heimler & Amedi (2020),
// "The sound of reading", PLOS ONE 15(11): e0242619.
//
// Each character is a combination of dots and vertical lines laid out on a grid.
// EyeMusic sonifies that grid: x is time (scanned left to right), y is pitch on a
// pentatonic scale (higher is higher), and colour is timbre - white is choir,
// blue is trumpet, red is piano.
//
// A glyph is a list of columns, each holding the elements sounded at that moment
// as [row, span]; row 0 is the top of the grid and span counts grid cells, so
// [4, 1] is a dot and [4, 4] is a vertical line four cells tall.

export const GRID_ROWS = 14;

/** Seconds of silence before the first column, at normal speed. */
export const LEAD_IN = 0.2;
/** Seconds each column is sounded, at normal speed. */
export const COLUMN_TIME = 0.1;

export const GLYPHS = {
  alef: { latin: 'A', hebrew: 'א', colour: 'red', columns: [[[6, 1]], [[7, 4]]] },
  bet: { latin: 'B', hebrew: 'ב', colour: 'blue', columns: [[[8, 4]], [[12, 1]], [[4, 1], [13, 1]]] },
  gimel: { latin: 'G', hebrew: 'ג', colour: 'blue', columns: [[[5, 4]], [[9, 4]], [[13, 1]]] },
  dalet: { latin: 'D', hebrew: 'ד', colour: 'white', columns: [[[7, 4]], [[11, 1]], [[12, 1]]] },
  he: { latin: 'O', hebrew: 'ה', colour: 'white', columns: [[[1, 4]], [[5, 4]], [[9, 4]]] },
  waw: { latin: 'E', hebrew: 'ו', colour: 'blue', columns: [[[7, 1]]] },
  zain: { latin: 'Z', hebrew: 'ז', colour: 'red', columns: [[[4, 4]], [[8, 4]], [[1, 1], [12, 1]]] },
  heth: { latin: 'H', hebrew: 'ח', colour: 'white', columns: [[[5, 1]], [[6, 1]], [[3, 1], [7, 1]]] },
  teth: { latin: 'U', hebrew: 'ט', colour: 'red', columns: [[[4, 1]], [[5, 1]], [[6, 4]]] },
  yudh: { latin: 'I', hebrew: 'י', colour: 'white', columns: [[[6, 1]], [[7, 1]]] },
  kaf: { latin: 'K', hebrew: 'כ', colour: 'white', columns: [[[1, 4]], [[5, 1]], [[6, 4]]] },
  lamedh: { latin: 'L', hebrew: 'ל', colour: 'red', columns: [[[4, 1]], [[5, 4]], [[2, 1], [9, 1]]] },
  mem: { latin: 'M', hebrew: 'מ', colour: 'white', columns: [[[4, 4]], [[8, 4]]] },
  nun: { latin: 'N', hebrew: 'נ', colour: 'blue', columns: [[[5, 4]], [[9, 1]]] },
  samech: { latin: 'C', hebrew: 'ס', colour: 'blue', columns: [[[4, 4]], [[8, 1]], [[2, 1], [9, 4]]] },
  ain: { latin: 'J', hebrew: 'ע', colour: 'blue', columns: [[[1, 1]], [[2, 4]], [[6, 8]]] },
  peh: { latin: 'P', hebrew: 'פ', colour: 'white', columns: [[[3, 1]], [[4, 4]], [[1, 1], [8, 4]]] },
  tsade: { latin: 'W', hebrew: 'צ', colour: 'blue', columns: [[[2, 1]], [[3, 4]], [[7, 4]]] },
  qoph: { latin: 'Q', hebrew: 'ק', colour: 'red', columns: [[[4, 4]], [[8, 4]], [[0, 4], [12, 1]]] },
  reish: { latin: 'R', hebrew: 'ר', colour: 'red', columns: [[[5, 1]], [[6, 4]], [[10, 1]]] },
  shin: { latin: 'S', hebrew: 'ש', colour: 'blue', columns: [[[8, 1]], [[9, 1]], [[10, 1]]] },
  tav: { latin: 'T', hebrew: 'ת', colour: 'red', columns: [[[9, 4]]] },
};

// The paper prints the three colours as pure primaries. Blue and red are lifted
// a little here so they hold up against a dark screen rather than pure black.
export const COLOURS = {
  white: { ink: '#ffffff', fill: '#ffffff', instrument: 'choir' },
  blue: { ink: '#0000ff', fill: '#4664ff', instrument: 'trumpet' },
  red: { ink: '#ff0000', fill: '#ff3b30', instrument: 'piano' },
};