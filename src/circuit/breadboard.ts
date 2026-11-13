/**
 * Breadboard geometry and its built-in connections.
 *
 * Layout: two breadboards stacked = 4 terminal blocks, 60 columns each, rows A–E and F–J,
 * with a pair of power rails (+/−) above, between and below the blocks (5 rail pairs).
 * Hole ids:  terminal  "<block><row><col>"  e.g. "1E16"  (block 1–4, row A–J, col 1–60)
 *            rail      "R<pair><sign><col>" e.g. "R0+12" (pair 0–4 from the top, sign + or −)
 */

export const COLUMNS = 60;
export const BLOCKS = 4;
export const RAIL_PAIRS = BLOCKS + 1;
export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export type Row = (typeof ROWS)[number];

export const terminalHole = (block: number, row: Row, col: number) => `${block}${row}${col}`;
export const railHole = (pair: number, sign: '+' | '-', col: number) => `R${pair}${sign}${col}`;

const TERMINAL_RE = /^([1-4])([A-J])([1-9]\d?)$/;
const RAIL_RE = /^R([0-4])([+-])([1-9]\d?)$/;

/** The id of the metal strip a hole belongs to, or null if the hole does not exist. */
export function stripOf(hole: string): string | null {
  const t = TERMINAL_RE.exec(hole);
  if (t) {
    const col = Number(t[3]);
    if (col > COLUMNS) return null;
    const half = 'ABCDE'.includes(t[2]) ? 'top' : 'bottom';
    return `strip:${t[1]}:${col}:${half}`;
  }
  const r = RAIL_RE.exec(hole);
  if (r) {
    if (Number(r[3]) > COLUMNS) return null;
    // Rails run the full length.
    return `rail:${r[1]}:${r[2]}`;
  }
  return null;
}

export const isHole = (hole: string) => stripOf(hole) !== null;

/**
 * Hole of DIP pin `n` (1-based), pin 1 at `col`.
 * Normally the chip straddles the centre gap of `block` (rows E/F). With `bridge` it spans the rail pair
 * between `block` and `block + 1` instead (rows J/A), as on the reference board.
 */
export function dipHole(block: number, col: number, pins: number, n: number, rotated = false, bridge = false): string {
  const half = pins / 2;
  const top = (c: number) => (bridge ? terminalHole(block, 'J', c) : terminalHole(block, 'E', c));
  const bottom = (c: number) => (bridge ? terminalHole(block + 1, 'A', c) : terminalHole(block, 'F', c));
  // Unrotated: notch left, pins 1..half along the bottom row left→right, pins half+1..pins along the top row right→left.
  if (!rotated) return n <= half ? bottom(col + n - 1) : top(col + pins - n);
  // Rotated 180°: pin 1 top-right, pins 1..half along the top row right→left.
  return n <= half ? top(col + half - n) : bottom(col + n - half - 1);
}

/** The two rows a chip's pins sit in: [top, bottom] as (block, row). */
export const dipRows = (block: number, bridge = false): [[number, Row], [number, Row]] =>
  bridge ? [[block, 'J'], [block + 1, 'A']] : [[block, 'E'], [block, 'F']];
