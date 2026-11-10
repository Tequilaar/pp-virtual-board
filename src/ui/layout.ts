/** Screen geometry of the breadboard (SVG user units). Mirrors the hole ids in circuit/breadboard.ts. */
import { BLOCKS, COLUMNS, RAIL_PAIRS, ROWS, type Row, railHole, terminalHole } from '../circuit/breadboard';

export const P = 16; // hole pitch
export const LEFT = 48;
export const TOP = 96; // room for the power board above the first rail pair
const RAIL_GAP = 14;
const CENTER_GAP = 1.6 * P;

export const colX = (col: number) => LEFT + (col - 1) * P;

const railTop: number[] = [];
const blockTop: number[] = [];
let y = TOP;
for (let pair = 0; pair < RAIL_PAIRS; pair++) {
  railTop.push(y);
  y += 2 * P + RAIL_GAP;
  if (pair < BLOCKS) {
    blockTop.push(y);
    y += 9 * P + CENTER_GAP + RAIL_GAP;
  }
}
export const HEIGHT = y + 24;
export const WIDTH = colX(COLUMNS) + 40;

/** '-' (blue) is the upper row of each rail pair, '+' (red) the lower one. */
export const railY = (pair: number, sign: '+' | '-') => railTop[pair] + (sign === '-' ? 0 : P);
export const rowY = (block: number, row: Row) => {
  const r = ROWS.indexOf(row);
  return blockTop[block - 1] + r * P + (r >= 5 ? CENTER_GAP - P : 0);
};
export const blockBounds = (block: number) => ({ top: blockTop[block - 1] - P * 0.7, bottom: rowY(block, 'J') + P * 0.7 });
export const railBounds = (pair: number) => ({ top: railTop[pair] - P * 0.6, bottom: railTop[pair] + P * 1.6 });

const TERMINAL_RE = /^([1-4])([A-J])(\d+)$/;
const RAIL_RE = /^R([0-4])([+-])(\d+)$/;

export function holePos(hole: string): { x: number; y: number } | null {
  const t = TERMINAL_RE.exec(hole);
  if (t) return { x: colX(Number(t[3])), y: rowY(Number(t[1]), t[2] as Row) };
  const r = RAIL_RE.exec(hole);
  if (r) return { x: colX(Number(r[3])), y: railY(Number(r[1]), r[2] as '+' | '-') };
  return null;
}

/** Every hole on the board, in drawing order. */
export function allHoles(): string[] {
  const out: string[] = [];
  for (let pair = 0; pair < RAIL_PAIRS; pair++) {
    for (const sign of ['-', '+'] as const) for (let c = 1; c <= COLUMNS; c++) out.push(railHole(pair, sign, c));
  }
  for (let b = 1; b <= BLOCKS; b++) for (const row of ROWS) for (let c = 1; c <= COLUMNS; c++) out.push(terminalHole(b, row, c));
  return out;
}
