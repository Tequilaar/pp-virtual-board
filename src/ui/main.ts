import './style.css';
import { ROWS, dipHole, isHole, stripOf } from '../circuit/breadboard';
import { DIP40_PINS, type Part, partLegs } from '../circuit/parts';
import { FirmwareError, loadFirmware } from '../chip/firmware';
import { BoardSim } from '../sim/board-sim';
import { P, WIDTH, allHoles, holePos } from './layout';
import { createBoard, drawPart, setEncoderDetents, setLcdView, setLedLevel, setServoAngle, svg } from './render';
import { fontA00 } from '../lcd/font-a00';
import { type Key, fileErrorText, firmwareErrorText, getLang, jtagProblem, problemText, setLang, t, warningText } from './i18n';
import { WiringFileError, exportWiring, importWiring } from './wiring-file';
import { validateParts, coveredHoles } from '../circuit/validate';

type Tool = 'select' | 'wire' | 'resistor' | 'led' | 'button' | 'capacitor' | 'crystal' | 'mcu' | 'power' | 'encoder' | 'servo' | 'lcd' | 'jtag' | 'meter';
const TWO_LEG: Tool[] = ['wire', 'resistor', 'led', 'button', 'capacitor', 'crystal'];
const FREQ = 20_000_000;

// ------------------------------------------------------------------ state
let parts: Part[] = [];
let tool: Tool = 'select';
let firstHole: string | null = null;
let selected: string | null = null;
let program: { name: string; flash: Uint8Array } | null = null;
let running = true;
let sim = new BoardSim(parts);
let nextId = 1;
let message = '';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const board = createBoard();
$('board-wrap').append(board.root);

const holeEls = new Map<string, SVGElement>();
for (const el of board.root.querySelectorAll<SVGElement>('[data-hole]')) holeEls.set(el.dataset.hole!, el);
const stripHoles = new Map<string, string[]>();
for (const h of allHoles()) {
  const s = stripOf(h)!;
  if (!stripHoles.has(s)) stripHoles.set(s, []);
  stripHoles.get(s)!.push(h);
}

// ------------------------------------------------------------------ helpers
function partHoles(p: Part): string[] {
  switch (p.kind) {
    case 'mcu':
      return Array.from({ length: 40 }, (_, i) => dipHole(p.block, p.col, 40, i + 1, p.rotated, p.bridge));
    case 'power':
      return [`R${p.railPair}+1`, `R${p.railPair}-1`];
    default:
      return Object.values(partLegs(p));
  }
}

function occupied(): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of parts) for (const h of [...partHoles(p), ...coveredHoles(p)]) m.set(h, p.id);
  return m;
}

function mcuPinAt(hole: string): string | null {
  const mcu = parts.find((p) => p.kind === 'mcu');
  if (!mcu) return null;
  for (let n = 1; n <= 40; n++) if (dipHole(mcu.block, mcu.col, 40, n, mcu.rotated, mcu.bridge) === hole) return `${DIP40_PINS[n - 1]} (${t('pin')} ${n})`;
  return null;
}

function say(msg: string) {
  message = msg;
  renderHint();
}

function setParts(next: Part[]) {
  parts = next;
  sim.replaceParts(parts);
  drawParts();
  view3d?.setParts(parts);
}

// ------------------------------------------------------------------ undo / redo
const past: Part[][] = [];
const future: Part[][] = [];
const HISTORY = 200;
const clone = (ps: Part[]) => JSON.parse(JSON.stringify(ps)) as Part[];

/** True when the wiring changed since the last export or import (reload would lose it). */
let unsaved = false;
window.addEventListener('beforeunload', (e) => {
  if (!unsaved || !parts.length) return;
  e.preventDefault(); // the browser asks before leaving or reloading
  e.returnValue = '';
});

/** Change the wiring as one undoable step. */
function commit(next: Part[]) {
  unsaved = true;
  past.push(clone(parts));
  if (past.length > HISTORY) past.shift();
  future.length = 0;
  setParts(next);
  updateHistoryButtons();
}

function undo() {
  const prev = past.pop();
  if (!prev) return;
  unsaved = true;
  future.push(clone(parts));
  selected = null;
  setParts(prev);
  updateHistoryButtons();
}

function redo() {
  const next = future.pop();
  if (!next) return;
  unsaved = true;
  past.push(clone(parts));
  selected = null;
  setParts(next);
  updateHistoryButtons();
}

function updateHistoryButtons() {
  ($('undo') as HTMLButtonElement).disabled = past.length === 0;
  ($('redo') as HTMLButtonElement).disabled = future.length === 0;
}

/** Add a part if it could exist on the real board; otherwise explain why not. */
function addPart(p: Part): boolean {
  const problems = validateParts([...parts, p]).filter((x) => x.part === p.id);
  if (problems.length) {
    say(problems.map(problemText).join('; '));
    return false;
  }
  say('');
  commit([...parts, p]);
  return true;
}

function newId(kind: string) {
  while (parts.some((p) => p.id === `${kind}${nextId}`)) nextId++;
  return `${kind}${nextId++}`;
}

// ------------------------------------------------------------------ drawing
function drawParts() {
  board.parts.replaceChildren();
  // Wires on top of components so their ends stay clickable; the chip at the bottom.
  // The LCD module sits above the wiring (as on the real board); its board is slightly see-through.
  const order = (p: Part) => (p.kind === 'mcu' ? 0 : p.kind === 'power' ? 1 : p.kind === 'wire' ? 3 : p.kind === 'lcd' ? 4 : 2);
  for (const p of [...parts].sort((a, b) => order(a) - order(b))) {
    const g = drawPart(p);
    if (p.id === selected) g.classList.add('selected');
    board.parts.append(g);
  }
  updateDynamic(new Map());
}

function updateDynamic(avg: Map<string, number>) {
  for (const g of board.parts.querySelectorAll<SVGGElement>('.part-led')) {
    const id = g.dataset.part!;
    setLedLevel(g, avg.get(id) ?? sim.ledCurrent(id), sim.circuit.burntLeds.has(id));
  }
  for (const g of board.parts.querySelectorAll<SVGGElement>('.part-button')) {
    g.classList.toggle('pressed', sim.circuit.closed.has(g.dataset.part!));
  }
  const pwr = board.parts.querySelector<SVGGElement>('.part-power');
  if (pwr) {
    pwr.classList.toggle('switch-on', sim.circuit.switchOn);
    pwr.classList.toggle('out-on', sim.circuit.switchOn && !sim.circuit.fuseBlown);
    pwr.classList.toggle('fuse-blown', sim.circuit.fuseBlown);
  }
  for (const g of board.parts.querySelectorAll<SVGGElement>('.part-servo')) {
    const st = sim.servos.get(g.dataset.part!);
    if (st) setServoAngle(g, st.angle);
  }
  for (const g of board.parts.querySelectorAll<SVGGElement>('.part-encoder')) {
    const id = g.dataset.part!;
    setEncoderDetents(g, sim.encoderDetents.get(id) ?? 0, sim.circuit.closed.has(`${id}:SW`));
  }
  const blinkPhase = Math.floor(sim.cycles / 8_192_000) % 2 === 0; // HD44780 blink ≈ 409.6 ms per phase
  for (const g of board.parts.querySelectorAll<SVGGElement>('.part-lcd')) {
    const v = sim.lcdView(g.dataset.part!);
    setLcdView(g, v && { ...v, glyph: (code: number) => v.controller.glyph(code, fontA00) }, blinkPhase);
  }
  const chip = board.parts.querySelector<SVGGElement>('.part-mcu');
  chip?.classList.toggle('chip-running', sim.status.running);
}

// ------------------------------------------------------------------ multimeter (ideal voltmeter, not saved)
let meter: { red?: string; black?: string } = {};
const meterLayer = svg('g', { class: 'meter' });
board.root.append(meterLayer);
function drawMeter() {
  meterLayer.replaceChildren();
  const r = meter.red && holePos(meter.red);
  const b = meter.black && holePos(meter.black);
  if (r && b) meterLayer.append(svg('line', { x1: r.x, y1: r.y, x2: b.x, y2: b.y, class: 'probe-line' }));
  if (r) meterLayer.append(svg('circle', { cx: r.x, cy: r.y, r: 5, class: 'probe-red' }));
  if (b) meterLayer.append(svg('circle', { cx: b.x, cy: b.y, r: 5, class: 'probe-black' }));
}
function meterText(): string {
  if (!meter.red) return '';
  const vr = sim.netVoltage(meter.red);
  const vb = meter.black ? sim.netVoltage(meter.black) : 0;
  const value = vr === undefined || vb === undefined ? t('meterOpen') : `${(vr - vb).toFixed(2)} V`;
  return `<h2>${t('meter')}</h2><div>${meter.red} → ${meter.black ?? 'GND'}: <b>${value}</b></div>`;
}

// ------------------------------------------------------------------ 3D view (loaded on first use)
type View3DType = import('./view3d').View3D;
let view3d: View3DType | null = null;
let show3d = false;
/** three.js (r163+) needs WebGL 2. */
function webglAvailable() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function toggle3d() {
  if (!show3d && !view3d) {
    try {
      if (!webglAvailable()) throw new Error('no WebGL');
      const { View3D } = await import('./view3d');
      view3d = new View3D($('view3d'));
      view3d.setParts(parts);
    } catch {
      message = t('no3d');
      $('hint').textContent = message;
      return;
    }
  }
  show3d = !show3d;
  document.querySelector('main')!.classList.toggle('mode-3d', show3d);
  $('view3d').hidden = !show3d;
  $('toggle-3d').textContent = t(show3d ? 'view2d' : 'view3d');
  renderHint();
}
$('toggle-3d').addEventListener('click', () => void toggle3d());

function renderHint() {
  if (show3d) {
    $('hint').textContent = t('hint3d');
    return;
  }
  const hints: Partial<Record<Tool, Key>> = { select: 'hintSelect', led: 'hintLed', mcu: 'hintMcu', power: 'hintPower', encoder: 'hintEncoder', servo: 'hintServo', lcd: 'hintLcd', jtag: 'hintJtag', meter: 'hintMeter' };
  const hint = t(hints[tool] ?? 'hintTwoLeg');
  $('hint').textContent = message ? `${message} — ${hint}` : hint;
}

let lastStatus = 0;
function renderStatus(realtime: number) {
  const s = sim.status;
  const yn = (b: boolean) => `<span class="${b ? 'ok' : 'bad'}">${t(b ? 'yes' : 'no')}</span>`;
  $('status').innerHTML = `
    <div>${t('powered')}: ${yn(s.powered)}</div>
    <div>${t('clock')}: ${yn(s.oscillator)}</div>
    <div>${t('resetPin')}: <span class="${s.inReset ? 'bad' : 'ok'}">${t(s.inReset ? 'low' : 'high')}</span></div>
    <div>${t('program')}: ${program ? `<b>${escapeHtml(program.name)}</b>` : `<span class="bad">${t('noProgram')}</span>`}</div>
    <div>${t('runningState')}: ${s.starting ? `<span class="bad">${t('starting')}</span>` : yn(s.running && running)}</div>
    <div>${t('simTime')}: ${(sim.cycles / FREQ).toFixed(3)} s</div>
    <div>${t('realtime')}: ${running ? `${Math.round(realtime * 100)} %` : '—'}</div>`;
  const servoLines = [...sim.servos].map(
    ([id, st]) => `<div>${escapeHtml(id)}: ${Math.round(st.angle)}° · ${t('pulse')} ${st.lastPulseUs === null ? '—' : `${(st.lastPulseUs / 1000).toFixed(3)} ms`}</div>`,
  );
  $('servo-status').innerHTML = servoLines.length ? `<h2>${t('servos')}</h2>${servoLines.join('')}` : '';
  $('meter-status').innerHTML = meterText();
  const w = [...sim.warnings].map(([code, text]) => warningText(code, text, sim.warningParams.get(code)));
  $('warnings').innerHTML = w.length ? w.map((x) => `<li>${escapeHtml(x)}</li>`).join('') : `<li class="none">${t('none')}</li>`;
  $('replace-fuse').hidden = !s.fuseBlown;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ------------------------------------------------------------------ interaction
function setTool(next: Tool) {
  tool = next;
  firstHole = null;
  board.overlay.replaceChildren();
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) b.classList.toggle('active', b.dataset.tool === tool);
  message = '';
  renderHint();
}

function holeFromEvent(e: Event): string | null {
  const el = (e.target as Element).closest('[data-hole]') as SVGElement | null;
  return el?.dataset.hole ?? null;
}

function svgPoint(e: MouseEvent) {
  const pt = board.root.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  return pt.matrixTransform(board.root.getScreenCTM()!.inverse());
}

/** Nearest hole to a board point within `radius`. */
function nearestHoleAt(x: number, y: number, radius = 9): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const h of holeEls.keys()) {
    const q = holePos(h)!;
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < bestD) (bestD = d), (best = h);
  }
  return best;
}

/** Nearest hole within half a pitch, so clicks next to a hole (or on a part's leg) still hit it. */
function nearestHole(e: MouseEvent): string | null {
  const direct = holeFromEvent(e);
  if (direct) return direct;
  const p = svgPoint(e);
  return nearestHoleAt(p.x, p.y);
}

function placeTwoLeg(a: string, b: string) {
  const occ = occupied();
  if (a === b) return say(t('sameHole'));
  if (occ.has(a) || occ.has(b)) return say(t('occupied'));
  const v = (id: string) => ($(id) as HTMLSelectElement).value;
  let p: Part;
  switch (tool) {
    case 'wire':
      p = { kind: 'wire', id: newId('w'), a, b, color: v('wire-color') };
      break;
    case 'resistor':
      p = { kind: 'resistor', id: newId('R'), a, b, ohms: Number(v('res-value')) };
      break;
    case 'led':
      p = { kind: 'led', id: newId('LED'), anode: a, cathode: b, color: v('led-color') as 'red' | 'green' | 'yellow' };
      break;
    case 'button':
      p = { kind: 'button', id: newId('S'), a, b };
      break;
    case 'capacitor':
      p = { kind: 'capacitor', id: newId('C'), a, b, farads: Number(v('cap-value')) };
      break;
    default:
      p = { kind: 'crystal', id: newId('Q'), a, b, hz: FREQ };
  }
  addPart(p);
}

/** Orientation for the next chip placement (R toggles it while the chip tool is active). */
let placeRotated = false;

/** R: with the chip tool, flip the orientation of the next placement; with the chip selected, turn it by 180°. */
function rotateChip() {
  if (tool === 'mcu') {
    placeRotated = !placeRotated;
    say(t(placeRotated ? 'rotatedRight' : 'rotatedLeft'));
    return;
  }
  const chip = parts.find((p) => p.id === selected && p.kind === 'mcu');
  if (!chip || chip.kind !== 'mcu') return say(t('rotateHint'));
  const turned: Part = { ...chip, rotated: !chip.rotated };
  const problems = validateParts(parts.map((p) => (p.id === chip.id ? turned : p))).filter((x) => x.part === chip.id);
  if (problems.length) return say(problems.map(problemText).join('; '));
  commit(parts.map((p) => (p.id === chip.id ? turned : p)));
  say(t(turned.rotated ? 'rotatedRight' : 'rotatedLeft'));
}

function placeMcu(hole: string) {
  if (parts.some((p) => p.kind === 'mcu')) return say(t('onlyOne'));
  // The clicked column is the chip's left end. Rows E/F: across the centre gap; rows J/A: across the rail pair
  // between two blocks (as on the reference board).
  const m = /^([1-4])([EFJA])(\d+)$/.exec(hole);
  const col = m ? Number(m[3]) : 0;
  const bridge = m?.[2] === 'J' || m?.[2] === 'A';
  const block = Number(m?.[1] ?? 1) - (m?.[2] === 'A' ? 1 : 0);
  const occ = occupied();
  const candidate: Part = {
    kind: 'mcu',
    id: 'U1',
    block,
    col,
    ...(placeRotated ? { rotated: true } : {}),
    ...(bridge ? { bridge: true } : {}),
  };
  if (!m || col > 41 || block < 1 || block > 3 && bridge || partHoles(candidate).some((h) => occ.has(h))) return say(t('mcuPlace'));
  addPart(candidate);
}

/** Shift a hole id by columns / rows; null if the result does not exist. */
function offsetHole(hole: string, dCol: number, dRow = 0): string | null {
  const t = /^([1-4])([A-J])(\d+)$/.exec(hole);
  if (t) {
    const row = ROWS[ROWS.indexOf(t[2] as (typeof ROWS)[number]) + dRow];
    const id = row ? `${t[1]}${row}${Number(t[3]) + dCol}` : '';
    return isHole(id) ? id : null;
  }
  const r = /^R([0-4])([+-])(\d+)$/.exec(hole);
  if (r && dRow === 0) {
    const id = `R${r[1]}${r[2]}${Number(r[3]) + dCol}`;
    return isHole(id) ? id : null;
  }
  return null;
}

function placeEncoder(hole: string) {
  const c = offsetHole(hole, 1);
  const b = offsetHole(hole, 2);
  const up = offsetHole(hole, 0, -3) ? -3 : 3;
  const sw1 = offsetHole(hole, 0, up);
  const sw2 = offsetHole(hole, 2, up);
  const legs = [hole, c, b, sw1, sw2];
  const occ = occupied();
  if (hole.startsWith('R') || legs.some((h) => !h || occ.has(h))) return say(t('encoderPlace'));
  addPart({ kind: 'encoder', id: newId('ENC'), a: hole, c: c!, b: b!, sw1: sw1!, sw2: sw2! });
}

function placeServo(hole: string) {
  const vcc = offsetHole(hole, 1);
  const sig = offsetHole(hole, 2);
  const occ = occupied();
  if (!vcc || !sig || [hole, vcc, sig].some((h) => occ.has(h))) return say(t('servoPlace'));
  addPart({ kind: 'servo', id: newId('SERVO'), gnd: hole, vcc, signal: sig });
}

function placeLcd(hole: string) {
  const m = /^([1-4])([A-J])(\d+)$/.exec(hole);
  const occ = occupied();
  const col = m ? Number(m[3]) : 0;
  const legs = m ? Array.from({ length: 16 }, (_, i) => `${m[1]}${m[2]}${col + i}`) : [];
  if (!m || col + 15 > 60 || legs.some((h) => occ.has(h))) return say(t('lcdPlace'));
  addPart({ kind: 'lcd', id: newId('LCD'), block: Number(m[1]), row: m[2], col });
}

function placeJtag(hole: string) {
  if (parts.some((p) => p.kind === 'jtag')) return say(t('onlyOne'));
  const m = /^([1-4])E(\d+)$/.exec(hole);
  const col = m ? Number(m[2]) : 0;
  const candidate: Part = { kind: 'jtag', id: 'JTAG', block: Number(m?.[1] ?? 1), col };
  const occ = occupied();
  if (!m || col > 56 || Object.values(partLegs(candidate)).some((h) => occ.has(h))) return say(t('jtagPlace'));
  addPart(candidate);
}

function placePower() {
  if (parts.some((p) => p.kind === 'power')) return say(t('onlyOne'));
  if (occupied().has('R0+1') || occupied().has('R0-1')) return say(t('occupied'));
  addPart({ kind: 'power', id: 'PWR', railPair: 0 });
}

// ------------------------------------------------------------------ moving parts
/** Hole rows in screen order (rails and terminal rows), for moving parts by whole rows and columns. */
const LINES: string[] = [];
for (let pair = 0; pair < 5; pair++) {
  LINES.push(`R${pair}-`, `R${pair}+`);
  if (pair < 4) for (const r of ROWS) LINES.push(`${pair + 1}${r}`);
}
function holeLine(hole: string): { line: number; col: number } | null {
  const m = /^(R[0-4][+-]|[1-4][A-J])(\d+)$/.exec(hole);
  return m ? { line: LINES.indexOf(m[1]), col: Number(m[2]) } : null;
}
function holeAt(line: number, col: number): string | null {
  const id = line >= 0 && line < LINES.length ? `${LINES[line]}${col}` : '';
  return isHole(id) ? id : null;
}
/** Shift a hole by (dLine, dCol) on that grid; null if it would leave the board. */
function shiftHole(hole: string, dLine: number, dCol: number): string | null {
  const h = holeLine(hole);
  return h ? holeAt(h.line + dLine, h.col + dCol) : null;
}

const TWO_LEG_KINDS = new Set(['wire', 'resistor', 'led', 'button', 'capacitor', 'crystal']);
interface Drag {
  id: string;
  x: number;
  y: number;
  leg: string | null; // a two-leg part's leg being re-plugged, or null = move the whole part
  moved: boolean;
}
let drag: Drag | null = null;

/** The part moved so that `ref` lands on `target` (or one leg re-plugged); null if impossible. */
function movedPart(p: Part, ref: string, target: string, leg: string | null): Part | null {
  if (leg) return { ...p, [leg]: target } as Part;
  const a = holeLine(ref);
  const b = holeLine(target);
  if (!a || !b) return null;
  const dLine = b.line - a.line;
  const dCol = b.col - a.col;
  switch (p.kind) {
    case 'power':
      return null;
    case 'mcu': {
      // The handle is the bottom pin row: row F keeps the chip across a centre gap, row A across a rail pair.
      const m = /^([1-4])([A-J])(\d+)$/.exec(target);
      if (!m) return null;
      if (m[2] === 'F') return { ...p, block: Number(m[1]), col: Number(m[3]), bridge: undefined };
      if (m[2] === 'A' && Number(m[1]) > 1) return { ...p, block: Number(m[1]) - 1, col: Number(m[3]), bridge: true };
      return null;
    }
    case 'jtag': {
      // Must keep straddling the gap: the reference row E has to stay row E.
      const m = /^([1-4])([A-J])(\d+)$/.exec(target);
      if (!m || m[2] !== 'E') return null;
      return { ...p, block: Number(m[1]), col: Number(m[3]) };
    }
    case 'lcd': {
      const m = /^([1-4])([A-J])(\d+)$/.exec(target);
      return m ? { ...p, block: Number(m[1]), row: m[2], col: Number(m[3]) } : null;
    }
    default: {
      const legs = partLegs(p);
      const next: Record<string, string> = {};
      for (const [k, h] of Object.entries(legs)) {
        const moved = shiftHole(h, dLine, dCol);
        if (!moved) return null;
        next[k] = moved;
      }
      return { ...p, ...next } as Part;
    }
  }
}

/** Hole used as the handle when a whole part is dragged. */
function referenceHole(p: Part): string {
  if (p.kind === 'mcu') return p.bridge ? `${p.block + 1}A${p.col}` : `${p.block}F${p.col}`;
  if (p.kind === 'jtag') return `${p.block}E${p.col}`;
  if (p.kind === 'lcd') return `${p.block}${p.row}${p.col}`;
  return Object.values(partLegs(p))[0] ?? '';
}

function finishDrag(d: Drag, e: PointerEvent) {
  const p = parts.find((x) => x.id === d.id);
  if (!p) return;
  const pt = svgPoint(e);
  let next: Part | null;
  if (d.leg) {
    const target = nearestHoleAt(pt.x, pt.y);
    next = target ? movedPart(p, '', target, d.leg) : null;
  } else {
    const ref = referenceHole(p);
    const rp = holePos(ref);
    const target = rp ? nearestHoleAt(rp.x + pt.x - d.x, rp.y + pt.y - d.y, P) : null;
    next = target ? movedPart(p, ref, target, null) : null;
  }
  if (!next) {
    say(t('moveFailed') + t(p.kind === 'power' ? 'powerFixed' : 'moveOffBoard'));
    drawParts();
    return;
  }
  const candidate = parts.map((x) => (x.id === p.id ? next! : x));
  const problems = validateParts(candidate).filter((x) => x.part === p.id);
  if (problems.length) {
    say(t('moveFailed') + problems.map(problemText).join('; '));
    drawParts();
    return;
  }
  say('');
  commit(candidate);
}

board.root.addEventListener('pointerdown', (e) => {
  const target = e.target as Element;
  if (target.closest('[data-switch]')) {
    sim.setSwitch(!sim.circuit.switchOn);
    updateDynamic(new Map());
    return;
  }
  const turn = target.closest('[data-turn]') as SVGGElement | null;
  const encEl = target.closest('.part-encoder') as SVGGElement | null;
  if (turn && encEl) {
    sim.turnEncoder(encEl.dataset.part!, Number(turn.dataset.turn) as 1 | -1);
    return;
  }
  if (target.closest('[data-knob]') && encEl) {
    pressedKnob = encEl.dataset.part!;
    sim.setEncoderSwitch(pressedKnob, true);
    return;
  }
  const partEl = target.closest('[data-part]') as SVGGElement | null;
  if (partEl && tool === 'select') {
    const id = partEl.dataset.part!;
    selected = id;
    const p = parts.find((x) => x.id === id);
    const pt = svgPoint(e);
    let leg: string | null = null;
    if (p && TWO_LEG_KINDS.has(p.kind)) {
      for (const [k, h] of Object.entries(partLegs(p))) {
        const q = holePos(h)!;
        if (Math.hypot(q.x - pt.x, q.y - pt.y) < 7) leg = k;
      }
    }
    drag = { id, x: pt.x, y: pt.y, leg, moved: false };
    // Keep receiving the pointer even outside the board/window, so the release is never lost.
    try {
      board.root.setPointerCapture(e.pointerId);
    } catch {
      /* not supported: window listeners still work inside the page */
    }
    if (p?.kind === 'button') sim.setButton(id, true);
    drawParts();
    return;
  }
  const hole = nearestHole(e);
  if (tool === 'select') {
    selected = null;
    drawParts();
    return;
  }
  if (!hole) return;
  if (tool === 'mcu') return placeMcu(hole);
  if (tool === 'power') return placePower();
  if (tool === 'encoder') return placeEncoder(hole);
  if (tool === 'servo') return placeServo(hole);
  if (tool === 'lcd') return placeLcd(hole);
  if (tool === 'jtag') return placeJtag(hole);
  if (tool === 'meter') {
    if (!meter.red || meter.black) meter = { red: hole };
    else meter.black = hole;
    drawMeter();
    return;
  }
  if (!firstHole) {
    if (occupied().has(hole)) return say(t('occupied'));
    firstHole = hole;
    holeEls.get(hole)?.classList.add('picked');
    return;
  }
  const a = firstHole;
  holeEls.get(a)?.classList.remove('picked');
  firstHole = null;
  board.overlay.replaceChildren();
  placeTwoLeg(a, hole);
});

let pressedKnob: string | null = null;
board.root.addEventListener(
  'wheel',
  (e) => {
    const enc = (e.target as Element).closest('.part-encoder') as SVGGElement | null;
    if (!enc || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    sim.turnEncoder(enc.dataset.part!, e.deltaY > 0 ? 1 : -1);
  },
  { passive: false },
);

function cancelDrag() {
  if (!drag) return;
  drag = null;
  board.overlay.replaceChildren();
  drawParts();
}
board.root.addEventListener('pointercancel', cancelDrag);
window.addEventListener('blur', cancelDrag);

window.addEventListener('pointerup', (e) => {
  const d = drag;
  drag = null;
  if (d?.moved) finishDrag(d, e);
  if (pressedKnob) sim.setEncoderSwitch(pressedKnob, false);
  pressedKnob = null;
  for (const id of [...sim.circuit.closed]) if (!id.includes(":")) sim.setButton(id, false);
});

let hoverStrip: string[] = [];
board.root.addEventListener('pointermove', (e) => {
  // The release can get lost (outside the window, focus change): no button held any more means the drag is over.
  if (drag && e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
    const d = drag;
    drag = null;
    if (d.moved) finishDrag(d, e);
  }
  if (drag) {
    const pt = svgPoint(e);
    const dx = pt.x - drag.x;
    const dy = pt.y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      for (const id of [...sim.circuit.closed]) if (id === drag.id) sim.setButton(id, false); // a drag is not a press
    }
    if (drag.moved) {
      const g = board.parts.querySelector<SVGGElement>(`[data-part="${CSS.escape(drag.id)}"]`);
      const p = parts.find((x) => x.id === drag!.id);
      board.overlay.replaceChildren();
      if (drag.leg && p) {
        const other = Object.entries(partLegs(p)).find(([k]) => k !== drag!.leg)![1];
        const a = holePos(other)!;
        const target = nearestHoleAt(pt.x, pt.y);
        const b = target ? holePos(target)! : pt;
        board.overlay.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'preview' }));
      } else g?.setAttribute('transform', `translate(${dx} ${dy})`);
      return;
    }
  }
  const hole = nearestHole(e);
  for (const h of hoverStrip) holeEls.get(h)?.classList.remove('strip');
  hoverStrip = hole ? stripHoles.get(stripOf(hole)!)! : [];
  for (const h of hoverStrip) holeEls.get(h)?.classList.add('strip');
  if (hole) {
    const v = sim.netVoltage(hole);
    const pin = mcuPinAt(hole);
    $('hover').textContent = `${hole}${pin ? ` · ${pin}` : ''}${sim.circuit.net(hole) !== undefined ? ` · ${v === undefined ? t('floatingNet') : `${v.toFixed(2)} V`}` : ''}`;
  } else $('hover').textContent = '';
  board.overlay.replaceChildren();
  if (firstHole && TWO_LEG.includes(tool)) {
    const a = holePos(firstHole)!;
    const b = hole ? holePos(hole)! : svgPoint(e);
    board.overlay.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'preview' }));
  }
});

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
  if (($('intro') as HTMLDialogElement).open) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }
  if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
    return;
  }
  if (!mod && key === 'r') {
    rotateChip();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
    const id = selected;
    selected = null;
    commit(parts.filter((p) => p.id !== id));
  } else if (e.key === 'Escape') {
    const hadProbes = !!meter.red;
    meter = {};
    drawMeter();
    setTool(tool);
    if (hadProbes) say(t('meterCleared'));
  }
});

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
  b.addEventListener('click', () => setTool(b.dataset.tool as Tool));
}

// ------------------------------------------------------------------ files
async function openProgram(file: File) {
  try {
    const fw = loadFirmware(new Uint8Array(await file.arrayBuffer()));
    // Like avrdude's device signature check: a program for another chip is not flashed.
    if (fw.device && fw.device.toLowerCase() !== 'atmega1284p') return say(firmwareErrorText('wrong-device', fw.device));
    // Optional lab realism: programming goes through the JTAG header and the Atmel-ICE.
    if (($('jtag-required') as HTMLInputElement).checked) {
      const problems = sim.jtagCheck();
      if (problems === null) return say(t('jtagNoHeader'));
      if (problems.length) return say(t('jtagFailed') + problems.map(jtagProblem).join(', '));
    }
    program = { name: file.name, flash: fw.flash };
    sim.loadProgram(fw.flash);
    say(($('jtag-required') as HTMLInputElement).checked ? t('jtagOk') : '');
  } catch (err) {
    if (err instanceof FirmwareError) say(firmwareErrorText(err.code, err.detail));
    else say((err as Error).message);
  }
}

async function openWiring(file: File) {
  try {
    let w;
    try {
      w = importWiring(await file.text());
    } catch (err) {
      if (err instanceof WiringFileError) {
        return say(`${fileErrorText(err.reason)} ${err.problems.slice(0, 4).map(problemText).join('; ')}${err.problems.length > 4 ? ' …' : ''}`);
      }
      throw err;
    }
    selected = null;
    // A wiring file without a program keeps the program that is already loaded.
    if (w.program) program = { name: w.program.name, flash: w.program.flash };
    past.push(clone(parts));
    future.length = 0;
    sim = new BoardSim(w.parts, program?.flash, { bounce: ($('bounce') as HTMLInputElement).checked });
    parts = w.parts;
    updateHistoryButtons();
    view3d?.setParts(parts);
    drawParts();
    say('');
  } catch (err) {
    say((err as Error).message);
  }
}

$('program-file').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) openProgram(f);
  (e.target as HTMLInputElement).value = '';
});
$('wiring-file').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) openWiring(f);
  (e.target as HTMLInputElement).value = '';
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files[0];
  if (!f) return;
  if (/\.json$/i.test(f.name)) openWiring(f);
  else openProgram(f);
});

$('export').addEventListener('click', () => {
  const include = ($('include-program') as HTMLInputElement).checked && program;
  const text = exportWiring(parts, include ? program! : undefined);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = 'verdrahtung.ppboard.json';
  unsaved = false;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('clear').addEventListener('click', () => {
  if (parts.length && confirm(t('confirmClear'))) {
    selected = null;
    commit([]);
  }
});
$('run').addEventListener('click', () => {
  running = !running;
  $('run').textContent = t(running ? 'pause' : 'run');
});
$('restart').addEventListener('click', () => (program ? sim.loadProgram(program.flash) : say(t('noProgram'))));
$('replace-fuse').addEventListener('click', () => sim.replaceFuse());
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('bounce').addEventListener('change', (e) => (sim.bounce = (e.target as HTMLInputElement).checked));
$('lang').addEventListener('change', (e) => {
  setLang((e.target as HTMLSelectElement).value as 'de' | 'en' | 'zh');
  applyTexts();
  renderStatus(realtime);
});

// ------------------------------------------------------------------ welcome dialog

const INTRO_KEY = 'pp-board.intro-hidden';
const intro = $('intro') as HTMLDialogElement;
function chooseLang(l: 'de' | 'en' | 'zh') {
  const sel = $('lang') as HTMLSelectElement;
  sel.value = l;
  sel.dispatchEvent(new Event('change'));
}
function markIntroLang() {
  for (const b of intro.querySelectorAll<HTMLButtonElement>('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()));
}
for (const b of intro.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
  b.addEventListener('click', () => {
    chooseLang(b.dataset.lang as 'de' | 'en' | 'zh');
    markIntroLang();
  });
}
function openIntro() {
  let hidden = false;
  try {
    hidden = localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    /* storage blocked: show it every time */
  }
  ($('intro-hide') as HTMLInputElement).checked = hidden;
  markIntroLang();
  if (!intro.open) intro.showModal();
}
// Saved at once (not on close), so a reload right after ticking keeps the choice.
$('intro-hide').addEventListener('change', () => {
  try {
    if (($('intro-hide') as HTMLInputElement).checked) localStorage.setItem(INTRO_KEY, '1');
    else localStorage.removeItem(INTRO_KEY);
  } catch {
    /* storage blocked */
  }
});
$('help').addEventListener('click', openIntro);
{
  let hidden = false;
  try {
    hidden = localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    /* storage blocked */
  }
  if (!hidden) openIntro();
}

function applyTexts() {
  document.documentElement.lang = getLang();
  for (const el of document.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = t(el.dataset.t as Key);
  $('run').textContent = t(running ? 'pause' : 'run');
  $('toggle-3d').textContent = t(show3d ? 'view2d' : 'view3d');
  renderHint();
}

// ------------------------------------------------------------------ zoom
let zoom = 1.3;
function setZoom(z: number) {
  zoom = Math.max(0.6, Math.min(3, Math.round(z * 10) / 10));
  board.root.style.width = `${WIDTH * zoom}px`;
  $('zoom-level').textContent = `${Math.round(zoom * 100)} %`;
}
$('zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
$('zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
$('board-wrap').addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  },
  { passive: false },
);
setZoom(zoom);

// ------------------------------------------------------------------ simulation loop
let last = performance.now();
let ratePerMs = 20_000; // achievable simulated cycles per real ms, measured
let realtime = 1;
function frame(now: number) {
  const dt = Math.min(now - last, 100);
  last = now;
  if (running) {
    const want = dt * (FREQ / 1000);
    const budgetMs = 12;
    const cycles = Math.max(1, Math.min(want, ratePerMs * budgetMs));
    const t0 = performance.now();
    sim.run(cycles);
    const spent = performance.now() - t0;
    if (spent > 0.5) ratePerMs = 0.8 * ratePerMs + 0.2 * (cycles / spent);
    realtime = 0.9 * realtime + 0.1 * (want > 0 ? cycles / want : 1);
  }
  const avg = sim.takeLedAverage();
  updateDynamic(avg);
  if (show3d && view3d) {
    view3d.update({
      led: (id) => avg.get(id) ?? sim.ledCurrent(id),
      servoAngle: (id) => sim.servos.get(id)?.angle,
      encoderDetents: (id) => sim.encoderDetents.get(id) ?? 0,
      pressed: (id) => sim.circuit.closed.has(id),
      lcd: (id) => {
        const v = sim.lcdView(id);
        return v && { ...v, glyph: (code: number) => v.controller.glyph(code, fontA00) };
      },
      blinkPhase: Math.floor(sim.cycles / 8_192_000) % 2 === 0,
      powerOut: sim.circuit.switchOn && !sim.circuit.fuseBlown,
      switchOn: sim.circuit.switchOn,
    });
  }
  if (now - lastStatus > 200) {
    lastStatus = now;
    renderStatus(realtime);
  }
  requestAnimationFrame(frame);
}

applyTexts();
setTool('select');
drawParts();
requestAnimationFrame(frame);

// Exposed for automated UI checks only.
(window as unknown as { __pp: unknown }).__pp = { get parts() { return parts; }, get sim() { return sim; }, get view3d() { return view3d; }, isHole };
