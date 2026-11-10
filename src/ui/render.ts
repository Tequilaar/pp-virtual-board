/** SVG drawing of the board and its parts. Pure DOM construction, no simulation logic. */
import { BLOCKS, COLUMNS, RAIL_PAIRS, ROWS, dipHole } from '../circuit/breadboard';
import { DIP40_PINS, type Part } from '../circuit/parts';
import { HEIGHT, LEFT, P, WIDTH, allHoles, blockBounds, colX, holePos, railBounds, railY, rowY } from './layout';

const NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  children: (SVGElement | string)[] = [],
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const c of children) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

export function createBoard(): { root: SVGSVGElement; parts: SVGGElement; overlay: SVGGElement } {
  const root = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'board' });
  const defs = svg('defs', {}, [
    svg('filter', { id: 'glow', x: '-150%', y: '-150%', width: '400%', height: '400%' }, [
      svg('feGaussianBlur', { stdDeviation: 4 }),
    ]),
  ]);
  root.append(defs, svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, class: 'bb-base', rx: 10 }));

  const holes = svg('g', { class: 'holes' });
  for (let pair = 0; pair < RAIL_PAIRS; pair++) {
    const b = railBounds(pair);
    holes.append(
      svg('rect', { x: LEFT - P, y: b.top, width: COLUMNS * P + P, height: b.bottom - b.top, class: 'bb-rail', rx: 3 }),
      svg('line', { x1: LEFT - P / 2, x2: colX(COLUMNS) + P / 2, y1: railY(pair, '-') - P / 2, y2: railY(pair, '-') - P / 2, class: 'rail-minus' }),
      svg('line', { x1: LEFT - P / 2, x2: colX(COLUMNS) + P / 2, y1: railY(pair, '+') + P / 2, y2: railY(pair, '+') + P / 2, class: 'rail-plus' }),
      svg('text', { x: LEFT - P * 1.6, y: railY(pair, '-') + 4, class: 'rail-label minus' }, ['−']),
      svg('text', { x: LEFT - P * 1.6, y: railY(pair, '+') + 4, class: 'rail-label plus' }, ['+']),
      svg('text', { x: colX(COLUMNS) + P * 1.2, y: railY(pair, '-') + 4, class: 'rail-label minus' }, ['−']),
      svg('text', { x: colX(COLUMNS) + P * 1.2, y: railY(pair, '+') + 4, class: 'rail-label plus' }, ['+']),
    );
  }
  for (let b = 1; b <= BLOCKS; b++) {
    const bb = blockBounds(b);
    holes.append(svg('rect', { x: LEFT - P, y: bb.top, width: COLUMNS * P + P, height: bb.bottom - bb.top, class: 'bb-block', rx: 3 }));
    for (const row of ROWS) {
      holes.append(svg('text', { x: LEFT - P * 1.6, y: rowY(b, row) + 3.5, class: 'row-label' }, [row]));
      holes.append(svg('text', { x: colX(COLUMNS) + P * 1.2, y: rowY(b, row) + 3.5, class: 'row-label' }, [row]));
    }
    for (let c = 1; c <= COLUMNS; c++) {
      if (c === 1 || c % 5 === 0) {
        holes.append(svg('text', { x: colX(c), y: rowY(b, 'A') - P * 0.75, class: 'col-label' }, [String(c)]));
        holes.append(svg('text', { x: colX(c), y: rowY(b, 'J') + P * 1.05, class: 'col-label' }, [String(c)]));
      }
    }
  }
  for (const id of allHoles()) {
    const p = holePos(id)!;
    holes.append(svg('rect', { x: p.x - 3.2, y: p.y - 3.2, width: 6.4, height: 6.4, rx: 1.2, class: 'hole', 'data-hole': id }));
  }
  root.append(holes);
  const parts = svg('g', { class: 'parts' });
  const overlay = svg('g', { class: 'overlay' });
  root.append(parts, overlay);
  return { root, parts, overlay };
}

const legs = (a: { x: number; y: number }, b: { x: number; y: number }, cls = 'leg') =>
  svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls });

const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const angle = (a: { x: number; y: number }, b: { x: number; y: number }) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

export function formatOhms(ohms: number) {
  return ohms >= 1000 ? `${ohms / 1000}k`.replace('.', ',') + 'Ω' : `${ohms}Ω`;
}
export function formatFarads(f: number) {
  if (f < 1e-9) return `${Math.round(f * 1e12)}p`;
  if (f < 1e-6) return `${Math.round(f * 1e9)}n`;
  return `${Math.round(f * 1e6)}µ`;
}

/** Draw one part. Returns its group, tagged with data-part for hit testing. */
export function drawPart(p: Part): SVGGElement {
  const g = svg('g', { 'data-part': p.id, class: `part part-${p.kind}` });
  switch (p.kind) {
    case 'wire': {
      const a = holePos(p.a)!;
      const b = holePos(p.b)!;
      g.append(
        svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'wire-body', stroke: p.color ?? '#2f7de1' }),
        svg('circle', { cx: a.x, cy: a.y, r: 3, class: 'wire-end' }),
        svg('circle', { cx: b.x, cy: b.y, r: 3, class: 'wire-end' }),
      );
      break;
    }
    case 'resistor': {
      const a = holePos(p.a)!;
      const b = holePos(p.b)!;
      const m = mid(a, b);
      g.append(
        legs(a, b),
        svg('g', { transform: `translate(${m.x} ${m.y}) rotate(${angle(a, b)})` }, [
          svg('rect', { x: -11, y: -4.5, width: 22, height: 9, rx: 3.5, class: 'res-body' }),
          svg('text', { x: 0, y: -7, class: 'part-label', transform: Math.abs(angle(a, b)) > 90 ? 'rotate(180)' : '' }, [formatOhms(p.ohms)]),
        ]),
      );
      break;
    }
    case 'led': {
      const a = holePos(p.anode)!;
      const c = holePos(p.cathode)!;
      const m = mid(a, c);
      g.append(
        legs(a, c),
        svg('circle', { cx: m.x, cy: m.y, r: 13, class: 'led-glow', fill: ledColor(p.color), filter: 'url(#glow)', opacity: 0 }),
        svg('circle', { cx: m.x, cy: m.y, r: 7.5, class: 'led-body', fill: ledColor(p.color) }),
        svg('circle', { cx: m.x, cy: m.y, r: 7.5, class: 'led-shade' }),
        svg('text', { x: a.x, y: a.y - 6, class: 'pol-label' }, ['+']),
        svg('path', { d: `M${m.x - 7} ${m.y - 9} L${m.x + 7} ${m.y - 9}`, class: 'led-burnt', opacity: 0 }),
      );
      break;
    }
    case 'button': {
      const a = holePos(p.a)!;
      const b = holePos(p.b)!;
      const m = mid(a, b);
      g.append(
        legs(a, b),
        svg('rect', { x: m.x - 9, y: m.y - 9, width: 18, height: 18, rx: 2, class: 'btn-body' }),
        svg('circle', { cx: m.x, cy: m.y, r: 5.5, class: 'btn-cap' }),
      );
      break;
    }
    case 'capacitor': {
      const a = holePos(p.a)!;
      const b = holePos(p.b)!;
      const m = mid(a, b);
      g.append(
        legs(a, b),
        svg('ellipse', { cx: m.x, cy: m.y, rx: 7, ry: 5, class: 'cap-body' }),
        svg('text', { x: m.x, y: m.y + 2.5, class: 'tiny-label' }, [formatFarads(p.farads)]),
      );
      break;
    }
    case 'crystal': {
      const a = holePos(p.a)!;
      const b = holePos(p.b)!;
      const m = mid(a, b);
      g.append(
        legs(a, b),
        svg('g', { transform: `translate(${m.x} ${m.y}) rotate(${angle(a, b)})` }, [
          svg('rect', { x: -12, y: -6, width: 24, height: 12, rx: 6, class: 'xtal-body' }),
          svg('text', { x: 0, y: 2.5, class: 'tiny-label dark' }, [`${p.hz / 1e6}M`]),
        ]),
      );
      break;
    }
    case 'mcu': {
      const first = holePos(dipHole(p.block, p.col, 40, 1, p.rotated))!;
      const x0 = colX(p.col) - P * 0.55;
      const x1 = colX(p.col + 19) + P * 0.55;
      const yTop = rowY(p.block, 'E') - P * 0.15;
      const yBot = rowY(p.block, 'F') + P * 0.15;
      g.append(svg('rect', { x: x0, y: yTop, width: x1 - x0, height: yBot - yTop, rx: 2, class: 'chip-body' }));
      const notchX = p.rotated ? x1 : x0;
      g.append(svg('path', { d: `M${notchX} ${(yTop + yBot) / 2 - 5} a5 5 0 0 ${p.rotated ? 0 : 1} 0 10`, class: 'chip-notch' }));
      DIP40_PINS.forEach((name, i) => {
        const h = holePos(dipHole(p.block, p.col, 40, i + 1, p.rotated))!;
        const inner = h.y < (yTop + yBot) / 2 ? h.y + 9 : h.y - 5;
        g.append(
          svg('rect', { x: h.x - 3, y: h.y - 3, width: 6, height: 6, class: 'chip-pin' }),
          svg('text', { x: h.x, y: inner, class: 'pin-label', 'data-pin': name }, [name]),
        );
      });
      g.append(svg('circle', { cx: first.x, cy: first.y + (p.rotated ? 9 : -9), r: 1.6, class: 'pin1-dot' }));
      g.append(svg('text', { x: (x0 + x1) / 2, y: (yTop + yBot) / 2 + 3, class: 'chip-name' }, ['ATMEGA1284P-PU']));
      break;
    }
    case 'encoder': {
      const a = holePos(p.a)!;
      const b = holePos(p.b)!;
      const s1 = holePos(p.sw1)!;
      const s2 = holePos(p.sw2)!;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + s1.y) / 2;
      const half = Math.max(Math.abs(b.x - a.x), Math.abs(s1.y - a.y)) / 2 + 9;
      for (const leg of [p.a, p.c, p.b, p.sw1, p.sw2]) {
        const h = holePos(leg)!;
        g.append(svg('line', { x1: h.x, y1: h.y, x2: h.x, y2: cy + Math.sign(h.y - cy) * (half - 6), class: 'leg' }));
      }
      g.append(
        svg('rect', { x: cx - half, y: cy - half + 6, width: 2 * half, height: 2 * half - 12, rx: 3, class: 'enc-body' }),
        svg('g', { class: 'enc-knob', 'data-knob': '1' }, [
          svg('circle', { cx, cy, r: half - 9, class: 'enc-knob-face' }),
          svg('line', { x1: cx, y1: cy, x2: cx, y2: cy - (half - 11), class: 'enc-mark' }),
        ]),
        svg('g', { class: 'enc-arrow', 'data-turn': '-1' }, [
          svg('circle', { cx: cx - half - 10, cy, r: 8 }),
          svg('text', { x: cx - half - 10, y: cy + 4 }, ['⟲']),
        ]),
        svg('g', { class: 'enc-arrow', 'data-turn': '1' }, [
          svg('circle', { cx: cx + half + 10, cy, r: 8 }),
          svg('text', { x: cx + half + 10, y: cy + 4 }, ['⟳']),
        ]),
        svg('text', { x: a.x, y: a.y + 12, class: 'pin-tag' }, ['A']),
        svg('text', { x: (a.x + b.x) / 2, y: a.y + 12, class: 'pin-tag' }, ['C']),
        svg('text', { x: b.x, y: b.y + 12, class: 'pin-tag' }, ['B']),
        svg('text', { x: (s1.x + s2.x) / 2, y: s1.y - 6, class: 'pin-tag' }, ['SW']),
      );
      break;
    }
    case 'servo': {
      const gnd = holePos(p.gnd)!;
      const vcc = holePos(p.vcc)!;
      const sig = holePos(p.signal)!;
      // Body sits just above and right of the plug (anchored at the GND hole).
      const bx = gnd.x + 14;
      const by = gnd.y - 70;
      const cable = (h: { x: number; y: number }, color: string, i: number) =>
        svg('path', { d: `M${h.x} ${h.y} C${h.x} ${h.y - 30}, ${bx - 10} ${by + 30 + i * 4}, ${bx} ${by + 26 + i * 4}`, class: 'servo-cable', stroke: color });
      g.append(
        cable(gnd, '#6b3d1f', 0),
        cable(vcc, '#d62c2c', 1),
        cable(sig, '#f08a17', 2),
        svg('rect', { x: bx, y: by, width: 66, height: 46, rx: 4, class: 'servo-body' }),
        svg('circle', { cx: bx + 44, cy: by + 23, r: 9, class: 'servo-hub' }),
        svg('g', { class: 'servo-arm', 'data-hub': `${bx + 44},${by + 23}` }, [
          svg('path', { d: `M${bx + 44} ${by + 19} L${bx + 44 - 34} ${by + 21.5} L${bx + 44 - 34} ${by + 24.5} L${bx + 44} ${by + 27} Z`, class: 'servo-arm-shape' }),
          svg('circle', { cx: bx + 44, cy: by + 23, r: 4, class: 'servo-screw' }),
        ]),
        svg('text', { x: bx + 14, y: by + 40, class: 'tiny-label', 'data-angle': '1' }, ['90°']),
        svg('text', { x: bx + 14, y: by + 12, class: 'tiny-label' }, [p.id]),
      );
      break;
    }
    case 'lcd': {
      const pins = Array.from({ length: 16 }, (_, i) => holePos(`${p.block}${p.row}${p.col + i}`)!);
      const x0 = pins[0].x - P * 1.2;
      const x1 = pins[15].x + P * 1.2 + 6 * P;
      const yb = pins[0].y - P * 0.6;
      const yt = yb - 7.5 * P;
      g.append(
        svg('rect', { x: x0, y: yt, width: x1 - x0, height: yb - yt, rx: 3, class: 'lcd-pcb' }),
        svg('rect', { x: x0 + 10, y: yt + 10, width: x1 - x0 - 20, height: yb - yt - 34, rx: 2, class: 'lcd-bezel' }),
        svg('image', { x: x0 + 18, y: yt + 16, width: x1 - x0 - 36, height: yb - yt - 46, class: 'lcd-screen', preserveAspectRatio: 'none' }),
        svg('text', { x: x0 + 14, y: yb - 6, class: 'tiny-label' }, ['EA W162B-N3LW']),
      );
      pins.forEach((h, i) => {
        g.append(svg('rect', { x: h.x - 2.5, y: yb - 2, width: 5, height: h.y - yb + 4, class: 'chip-pin' }));
        if (i === 0 || i === 15 || i % 5 === 4) g.append(svg('text', { x: h.x, y: yb - 14, class: 'tiny-label' }, [String(i + 1)]));
      });
      break;
    }
    case 'jtag': {
      const e = holePos(`${p.block}E${p.col}`)!;
      const f = holePos(`${p.block}F${p.col + 4}`)!;
      g.append(svg('rect', { x: e.x - P * 0.5, y: e.y - P * 0.45, width: f.x - e.x + P, height: f.y - e.y + P * 0.9, rx: 2, class: 'jtag-body' }));
      const names = ['GND', 'TDI', '', '', 'RST', 'TMS', 'VCC', 'TDO', 'GND', 'TCK'];
      for (let i = 0; i < 10; i++) {
        const h = holePos(`${p.block}${i % 2 === 0 ? 'E' : 'F'}${p.col + Math.floor(i / 2)}`)!;
        g.append(svg('rect', { x: h.x - 2.5, y: h.y - 2.5, width: 5, height: 5, class: 'chip-pin' }));
        if (names[i]) g.append(svg('text', { x: h.x, y: i % 2 === 0 ? h.y + 9 : h.y - 5, class: 'pin-label' }, [names[i]]));
      }
      g.append(svg('text', { x: e.x - P * 0.9, y: e.y + 3, class: 'pol-label' }, ['1']));
      break;
    }
    case 'power': {
      const x0 = colX(1) - P * 0.8;
      const x1 = colX(7) + P * 0.4;
      const y1 = railY(p.railPair, '+') + P * 0.4;
      const y0 = y1 - 5.3 * P;
      g.append(
        svg('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 3, class: 'pwr-body' }),
        svg('rect', { x: x0 + 4, y: y0 + 6, width: 26, height: 18, rx: 2, class: 'pwr-usb' }),
        svg('text', { x: x0 + 17, y: y0 + 18, class: 'tiny-label' }, ['USB']),
        svg('circle', { cx: x0 + 42, cy: y0 + 12, r: 4, class: 'pwr-led1' }),
        svg('text', { x: x0 + 42, y: y0 + 25, class: 'tiny-label' }, ['LED1']),
        svg('circle', { cx: x0 + 62, cy: y0 + 12, r: 4, class: 'pwr-led2' }),
        svg('text', { x: x0 + 62, y: y0 + 25, class: 'tiny-label' }, ['LED2']),
        svg('rect', { x: x0 + 76, y: y0 + 6, width: 18, height: 28, rx: 3, class: 'pwr-switch', 'data-switch': '1' }),
        svg('rect', { x: x0 + 79, y: y0 + 9, width: 12, height: 11, rx: 2, class: 'pwr-switch-knob' }),
        svg('text', { x: x0 + 85, y: y0 + 44, class: 'tiny-label' }, ['S']),
        svg('rect', { x: x0 + 10, y: y0 + 32, width: 40, height: 9, rx: 2, class: 'pwr-fuse' }),
        svg('text', { x: x0 + 30, y: y0 + 39, class: 'tiny-label dark' }, ['F']),
        svg('line', { x1: colX(1), y1: y1 - P * 0.4, x2: colX(1), y2: railY(p.railPair, '+'), class: 'pwr-pin' }),
      );
      break;
    }
  }
  return g;
}

function ledColor(c: 'red' | 'green' | 'yellow' | 'white') {
  return c === 'red' ? '#ff3b30' : c === 'green' ? '#34d058' : c === 'white' ? '#f2f6ff' : '#ffd60a';
}

/** Update an LED's look for a perceived current (A). Nominal full brightness at 10 mA. */
export function setLedLevel(g: SVGGElement, amps: number, burnt: boolean) {
  const level = Math.max(0, Math.min(1, amps / 0.01));
  const visible = level > 0 ? 0.25 + 0.75 * Math.sqrt(level) : 0;
  g.querySelector('.led-glow')!.setAttribute('opacity', String(visible * 0.9));
  g.querySelector('.led-shade')!.setAttribute('opacity', String(burnt ? 0.85 : 0.62 * (1 - visible)));
  g.querySelector('.led-burnt')!.setAttribute('opacity', burnt ? '1' : '0');
}

/** Point the servo arm: 0° = full left, 90° = up, 180° = full right (convention of the reference servo). */
export function setServoAngle(g: SVGGElement, angle: number) {
  const arm = g.querySelector<SVGGElement>('.servo-arm')!;
  const [hx, hy] = arm.dataset.hub!.split(',').map(Number);
  // The arm shape points left (0°); turning clockwise on screen goes up (90°) and right (180°).
  arm.setAttribute('transform', `rotate(${angle} ${hx} ${hy})`);
  g.querySelector('[data-angle]')!.textContent = `${Math.round(angle)}°`;
}

/** Rotate the encoder's knob mark by its detent count (24 detents per turn → 15° each). */
export function setEncoderDetents(g: SVGGElement, detents: number, pressed: boolean) {
  const face = g.querySelector<SVGCircleElement>('.enc-knob-face')!;
  const cx = face.cx.baseVal.value;
  const cy = face.cy.baseVal.value;
  g.querySelector('.enc-mark')!.setAttribute('transform', `rotate(${detents * 15} ${cx} ${cy})`);
  g.classList.toggle('pressed', pressed);
}

export interface LcdViewData {
  lines: number[][];
  contrast: number;
  backlight: number;
  displayOn: boolean;
  cursor: { row: number; col: number } | null;
  blink: { row: number; col: number } | null;
  glyph: (code: number) => number[];
}

/** Key of everything visible on an LCD; equal keys mean an identical picture. */
export function lcdKey(view: LcdViewData | null, blinkPhase: boolean) {
  if (!view) return 'none';
  const bl = Math.min(1, view.backlight / 0.005);
  return `${view.lines.flat().join(',')}|${view.contrast.toFixed(2)}|${bl.toFixed(2)}|${view.displayOn}|${JSON.stringify(view.cursor)}|${JSON.stringify(view.blink)}|${blinkPhase}`;
}

/**
 * Paint a 2×16 HD44780 screen: blue background, white dots, brightness from backlight current, dot contrast
 * from VEE. Used by the 2D board (as an <image>) and the 3D view (as a texture).
 */
export function paintLcdCanvas(view: LcdViewData | null, blinkPhase: boolean, c = document.createElement('canvas')) {
  const bl = view ? Math.min(1, view.backlight / 0.005) : 0;
  const W = 16 * 6 + 3;
  const H = 2 * 9 + 3;
  const scale = 6;
  c.width = W * scale;
  c.height = H * scale;
  const ctx = c.getContext('2d')!;
  const lit = 0.35 + 0.65 * bl;
  ctx.fillStyle = `rgb(${Math.round(20 + 30 * lit)}, ${Math.round(40 + 70 * lit)}, ${Math.round(140 + 110 * lit)})`;
  ctx.fillRect(0, 0, c.width, c.height);
  if (view && view.displayOn && view.contrast > 0) {
    const on = `rgba(240, 246, 255, ${0.25 + 0.75 * view.contrast})`;
    const off = `rgba(255, 255, 255, ${0.05 * lit})`;
    for (let r = 0; r < 2; r++) {
      for (let col = 0; col < 16; col++) {
        const code = view.lines[r][col];
        const rows = code < 0 ? [0, 0, 0, 0, 0, 0, 0, 0] : view.glyph(code);
        const cur = view.cursor && view.cursor.row === r && view.cursor.col === col;
        const blk = view.blink && view.blink.row === r && view.blink.col === col && blinkPhase;
        for (let py = 0; py < 8; py++) {
          let bits = rows[py];
          if (cur && py === 7) bits = 0x1f;
          if (blk) bits = 0x1f;
          for (let px = 0; px < 5; px++) {
            ctx.fillStyle = bits & (1 << (4 - px)) ? on : off;
            ctx.fillRect((2 + col * 6 + px) * scale, (2 + r * 9 + py) * scale, scale - 1, scale - 1);
          }
        }
      }
    }
  }
  return c;
}

const lcdCache = new WeakMap<SVGGElement, string>();
export function setLcdView(g: SVGGElement, view: LcdViewData | null, blinkPhase: boolean) {
  const key = lcdKey(view, blinkPhase);
  if (lcdCache.get(g) === key) return;
  lcdCache.set(g, key);
  g.querySelector('.lcd-screen')!.setAttribute('href', paintLcdCanvas(view, blinkPhase).toDataURL());
  g.dataset.text = view ? view.lines.map((l) => l.map((x) => (x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : ' ')).join('')).join('\n') : '';
}
