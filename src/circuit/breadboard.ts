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

/** Hole of DIP pin `n` (1-based) for a chip straddling the centre gap of `block`, pin 1 at `col`. */
export function dipHole(block: number, col: number, pins: number, n: number, rotated = false): string {
  const half = pins / 2;
  // Unrotated: notch left, pins 1..half along row F left→right, pins half+1..pins along row E right→left.
  if (!rotated) {
    return n <= half ? terminalHole(block, 'F', col + n - 1) : terminalHole(block, 'E', col + pins - n);
  }
  // Rotated 180°: pin 1 top-right, pins 1..half along row E right→left.
  return n <= half ? terminalHole(block, 'E', col + half - n) : terminalHole(block, 'F', col + n - half - 1);
}
