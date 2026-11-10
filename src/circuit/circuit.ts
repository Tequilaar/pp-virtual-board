/**
 * DC model of the breadboard circuit.
 *
 * Nets come from the breadboard strips plus wires. Each solve is a nodal analysis with the
 * power-board ground rail as reference. Sources are Norton equivalents (voltage + series resistance),
 * LEDs are piecewise-linear diodes solved by iterating their on/off state. Capacitors and the crystal
 * are open circuits in DC; the crystal only matters for whether the oscillator can run.
 *
 * Electrical values are typical datasheet figures (ATmega1284P DC characteristics), not measurements.
 */
import { DIP40_PINS, LCD_PINS, LED_VF, type Part, partLegs } from './parts';
import { dipHole, railHole, stripOf } from './breadboard';

export const VCC = 5;
/** Output driver resistance (datasheet: VOH ≈ 4.2 V at 20 mA → ~40 Ω). */
export const R_PIN_DRIVE = 40;
/** I/O pull-up (datasheet: 20–50 kΩ). */
export const R_PULLUP = 35_000;
/** Power board output resistance (USB + fuse). */
const R_SUPPLY = 0.2;
const R_BUTTON = 0.05;
const R_LED_ON = 15;
/** Power board fuse; trips above this current. */
export const FUSE_LIMIT_A = 0.5;
/** Absolute maximum DC current per I/O pin (datasheet: 40 mA). */
export const PIN_LIMIT_A = 0.04;
/** Above this an indicator LED is destroyed (typical absolute maximum 30 mA). */
export const LED_LIMIT_A = 0.03;
/** Input thresholds at VCC = 5 V: VIL max 0.3·VCC, VIH min 0.6·VCC. */
export const V_IL = 0.3 * VCC;
export const V_IH = 0.6 * VCC;

export type PinMode = 'high' | 'low' | 'input' | 'pullup';

export interface Solution {
  /** Voltage per net (index), relative to the power board ground. */
  v: Float64Array<ArrayBufferLike>;
  /** True for nets with no conductive path to any source: their voltage is undefined. */
  floating: boolean[];
  ledCurrent: Map<string, number>;
  /** Current out of each driven MCU pin (A, positive = sourcing). */
  pinCurrent: Map<string, number>;
  supplyCurrent: number;
  /** Voltage across each capacitor (a minus b) in this solution. */
  capAcross: Map<string, number>;
}

class UnionFind {
  private p = new Map<string, string>();
  find(x: string): string {
    let r = this.p.get(x) ?? x;
    if (r !== x) {
      r = this.find(r);
      this.p.set(x, r);
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}

/** A driver outside the MCU, e.g. the LCD controller putting data on its D lines. */
export interface ExternalDrive {
  hole: string;
  high: boolean;
  ohms: number;
}

/** HD44780 module internals (typical values): ~1.5 mA supply current, ~50 kΩ pull-ups on RS, R/W, D0–D7. */
function lcdInternals(p: Extract<Part, { kind: 'lcd' }>): Part[] {
  const hole = (name: (typeof LCD_PINS)[number]) => `${p.block}${p.row}${p.col + LCD_PINS.indexOf(name)}`;
  const out: Part[] = [{ kind: 'resistor', id: `${p.id}:supply`, a: hole('VDD'), b: hole('VSS'), ohms: 3_300 }];
  for (const name of ['RS', 'RW', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'] as const) {
    out.push({ kind: 'resistor', id: `${p.id}:pu-${name}`, a: hole(name), b: hole('VDD'), ohms: 50_000 });
  }
  out.push({ kind: 'led', id: `${p.id}:backlight`, anode: hole('LED+'), cathode: hole('LED-'), color: 'white' });
  return out;
}

interface Element {
  a: number;
  b: number; // -1 = ground reference
  g: number; // conductance
  v: number; // source voltage of a→b Norton equivalent (0 for a plain resistor)
}

export class Circuit {
  readonly parts: Part[];
  /** Net index per hole (only holes that something is plugged into). */
  readonly netOfHole = new Map<string, number>();
  readonly netCount: number;
  private readonly netOfStrip = new Map<string, number>();
  /** Net of each MCU pin name ("GND" maps to the first GND pin; see gndNets). */
  readonly mcuPin = new Map<string, number>();
  readonly gndNets: number[] = [];
  readonly ground: number;
  readonly errors: string[] = [];

  /** Closed contacts: a button's id, or "<encoder id>:A" / ":B" / ":SW". */
  closed = new Set<string>();
  /** Voltage across each capacitor (a minus b), the state of the transient simulation. */
  capV = new Map<string, number>();
  switchOn = true;
  fuseBlown = false;
  readonly burntLeds = new Set<string>();

  constructor(parts: Part[]) {
    // An LCD module brings its own electrical parts: supply current, input pull-ups and the backlight LED.
    this.parts = parts.flatMap((p) => (p.kind === 'lcd' ? [p, ...lcdInternals(p)] : [p]));
    parts = this.parts;
    const uf = new UnionFind();
    const holesUsed: string[] = [];
    const use = (hole: string, owner: string) => {
      const strip = stripOf(hole);
      if (!strip) {
        this.errors.push(`${owner}: hole "${hole}" does not exist on the board.`);
        return;
      }
      holesUsed.push(hole);
      uf.union(hole, strip);
    };
    for (const p of parts) {
      switch (p.kind) {
        case 'wire':
          use(p.a, p.id);
          use(p.b, p.id);
          uf.union(p.a, p.b);
          break;
        case 'power':
          use(railHole(p.railPair, '+', 1), p.id);
          use(railHole(p.railPair, '-', 1), p.id);
          break;
        case 'mcu':
          for (let n = 1; n <= 40; n++) use(dipHole(p.block, p.col, 40, n, p.rotated), p.id);
          break;
        default:
          for (const hole of Object.values(partLegs(p))) use(hole, p.id);
      }
    }
    const index = new Map<string, number>();
    for (const h of holesUsed) {
      const root = uf.find(h);
      if (!index.has(root)) index.set(root, index.size);
      this.netOfHole.set(h, index.get(root)!);
    }
    this.netCount = index.size;
    for (const [h, n] of this.netOfHole) this.netOfStrip.set(stripOf(h)!, n);

    const power = parts.find((p) => p.kind === 'power');
    this.ground = power ? this.netOfHole.get(railHole(power.railPair, '-', 1))! : -1;

    const mcu = parts.find((p) => p.kind === 'mcu');
    if (mcu) {
      DIP40_PINS.forEach((name, i) => {
        const net = this.netOfHole.get(dipHole(mcu.block, mcu.col, 40, i + 1, mcu.rotated));
        if (net === undefined) return;
        if (name === 'GND') this.gndNets.push(net);
        if (!this.mcuPin.has(name)) this.mcuPin.set(name, net);
      });
    }
  }

  /** Net of a hole; an empty hole belongs to the net of its strip if anything else is plugged into that strip. */
  net(hole: string): number | undefined {
    const direct = this.netOfHole.get(hole);
    if (direct !== undefined) return direct;
    const strip = stripOf(hole);
    return strip ? this.netOfStrip.get(strip) : undefined;
  }

  /** True if a crystal connects the XTAL1 and XTAL2 nets. */
  hasCrystal(): boolean {
    const x1 = this.mcuPin.get('XTAL1');
    const x2 = this.mcuPin.get('XTAL2');
    return this.parts.some(
      (p) =>
        p.kind === 'crystal' &&
        ((this.net(p.a) === x1 && this.net(p.b) === x2) || (this.net(p.a) === x2 && this.net(p.b) === x1)),
    );
  }

  /**
   * Solve the circuit. `pins` gives the drive of each MCU pin by name (e.g. "PD0" → 'high');
   * pins not listed are high-impedance. Updates fuse/LED damage state as a side effect.
   *
   * Without `dt` this is the DC (steady-state) solution: capacitors are open. With `dt` (seconds since the
   * capacitor voltages in `capV` were valid) each capacitor is its backward-Euler companion model, a
   * conductance C/dt in series with its present voltage; the caller commits the new voltages.
   */
  solve(pins: Map<string, PinMode>, dt?: number, external: ExternalDrive[] = []): Solution {
    const els: Element[] = [];
    const ref = (net: number | undefined) => (net === undefined ? undefined : net === this.ground ? -1 : net);
    const add = (a: number | undefined, b: number | undefined, g: number, v = 0) => {
      const ra = ref(a);
      const rb = ref(b);
      if (ra === undefined || rb === undefined || ra === rb) return null;
      const el = { a: ra, b: rb, g, v };
      els.push(el);
      return el;
    };

    const power = this.parts.find((p) => p.kind === 'power');
    let supply: Element | null = null;
    if (power && this.switchOn && !this.fuseBlown && this.net(railHole(power.railPair, '+', 1)) === this.ground) {
      this.fuseBlown = true; // + and − joined by a wire: a dead short
    }
    if (power && this.switchOn && !this.fuseBlown) {
      supply = add(this.net(railHole(power.railPair, '+', 1)), this.ground, 1 / R_SUPPLY, VCC);
    }
    const leds: { part: Extract<Part, { kind: 'led' }>; on: boolean; el: Element | null }[] = [];
    for (const p of this.parts) {
      if (p.kind === 'resistor') add(this.net(p.a), this.net(p.b), 1 / p.ohms);
      else if (p.kind === 'button' && this.closed.has(p.id)) add(this.net(p.a), this.net(p.b), 1 / R_BUTTON);
      else if (p.kind === 'encoder') {
        if (this.closed.has(`${p.id}:A`)) add(this.net(p.a), this.net(p.c), 1 / R_BUTTON);
        if (this.closed.has(`${p.id}:B`)) add(this.net(p.b), this.net(p.c), 1 / R_BUTTON);
        if (this.closed.has(`${p.id}:SW`)) add(this.net(p.sw1), this.net(p.sw2), 1 / R_BUTTON);
      } else if (p.kind === 'capacitor' && dt !== undefined) {
        add(this.net(p.a), this.net(p.b), p.farads / dt, this.capV.get(p.id) ?? 0);
      }
      else if (p.kind === 'led' && !this.burntLeds.has(p.id)) leds.push({ part: p, on: false, el: null });
    }
    for (const x of external) add(this.net(x.hole), this.ground, 1 / x.ohms, x.high ? VCC : 0);
    const pinEls = new Map<string, Element>();
    for (const [name, mode] of pins) {
      const net = this.mcuPin.get(name);
      const el =
        mode === 'high'
          ? add(net, this.ground, 1 / R_PIN_DRIVE, VCC)
          : mode === 'low'
            ? add(net, this.ground, 1 / R_PIN_DRIVE, 0)
            : mode === 'pullup'
              ? add(net, this.ground, 1 / R_PULLUP, VCC)
              : null;
      if (el) pinEls.set(name, el);
    }

    // Iterate LED states until consistent (a handful of rounds suffices for small circuits).
    let v: Float64Array<ArrayBufferLike> = new Float64Array(this.netCount);
    let floating: boolean[] = [];
    for (let round = 0; round < 12; round++) {
      const active = [...els, ...leds.filter((l) => l.on && l.el).map((l) => l.el!)];
      ({ v, floating } = this.nodal(active));
      let changed = false;
      for (const l of leds) {
        const a = this.net(l.part.anode)!;
        const c = this.net(l.part.cathode)!;
        const va = a === this.ground ? 0 : v[a];
        const vc = c === this.ground ? 0 : v[c];
        const vf = LED_VF[l.part.color];
        const fl = (a !== this.ground && floating[a]) || (c !== this.ground && floating[c]);
        if (!l.el) l.el = { a: ref(a)!, b: ref(c)!, g: 1 / R_LED_ON, v: vf };
        if (l.el.a === l.el.b) continue;
        const shouldBeOn = l.on ? (va - vc - vf) / R_LED_ON > 0 : !fl && va - vc > vf;
        if (shouldBeOn !== l.on) {
          l.on = shouldBeOn;
          changed = true;
        }
      }
      if (!changed) break;
    }

    const volt = (n: number) => (n === -1 ? 0 : v[n]);
    const current = (el: Element) => (volt(el.a) - volt(el.b) - el.v) * el.g * -1; // current a→b through source
    const ledCurrent = new Map<string, number>();
    for (const l of leds) {
      const i = l.on && l.el ? (volt(l.el.a) - volt(l.el.b) - l.el.v) * l.el.g : 0;
      ledCurrent.set(l.part.id, i);
      if (i > LED_LIMIT_A) this.burntLeds.add(l.part.id);
    }
    const pinCurrent = new Map<string, number>();
    for (const [name, el] of pinEls) pinCurrent.set(name, current(el));
    const supplyCurrent = supply ? current(supply) : 0;
    if (supplyCurrent > FUSE_LIMIT_A) this.fuseBlown = true;
    const capAcross = new Map<string, number>();
    for (const p of this.parts) {
      if (p.kind !== 'capacitor') continue;
      const a = this.net(p.a);
      const b = this.net(p.b);
      if (a === undefined || b === undefined) continue;
      capAcross.set(p.id, volt(ref(a)!) - volt(ref(b)!));
    }
    return { v, floating, ledCurrent, pinCurrent, supplyCurrent, capAcross };
  }

  /** Nodal analysis: G·v = I, Gaussian elimination with partial pivoting. */
  private nodal(els: Element[]): { v: Float64Array<ArrayBufferLike>; floating: boolean[] } {
    const n = this.netCount;
    // Which nets have a conductive path to a source or to ground?
    const adj: number[][] = Array.from({ length: n }, () => []);
    const driven = new Array<boolean>(n).fill(false);
    for (const e of els) {
      if (e.a >= 0 && e.b >= 0) {
        adj[e.a].push(e.b);
        adj[e.b].push(e.a);
      } else {
        if (e.a >= 0) driven[e.a] = true;
        if (e.b >= 0) driven[e.b] = true;
      }
    }
    const stack = driven.flatMap((d, i) => (d ? [i] : []));
    while (stack.length) for (const m of adj[stack.pop()!]) if (!driven[m]) stack.push(m), (driven[m] = true);
    const floating = driven.map((d, i) => !d && i !== this.ground);

    const G = Array.from({ length: n }, () => new Float64Array(n));
    const I = new Float64Array(n);
    for (const e of els) {
      // Norton: current e.v*e.g injected into a, drawn from b.
      if (e.a >= 0) {
        G[e.a][e.a] += e.g;
        I[e.a] += e.v * e.g;
      }
      if (e.b >= 0) {
        G[e.b][e.b] += e.g;
        I[e.b] -= e.v * e.g;
      }
      if (e.a >= 0 && e.b >= 0) {
        G[e.a][e.b] -= e.g;
        G[e.b][e.a] -= e.g;
      }
    }
    for (let i = 0; i < n; i++) if (floating[i] || i === this.ground) G[i][i] += 1; // pin unused rows to 0 V
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(G[r][col]) > Math.abs(G[piv][col])) piv = r;
      [G[col], G[piv]] = [G[piv], G[col]];
      [I[col], I[piv]] = [I[piv], I[col]];
      const d = G[col][col];
      if (Math.abs(d) < 1e-15) continue;
      for (let r = col + 1; r < n; r++) {
        const f = G[r][col] / d;
        if (!f) continue;
        for (let c = col; c < n; c++) G[r][c] -= f * G[col][c];
        I[r] -= f * I[col];
      }
    }
    const v = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = I[r];
      for (let c = r + 1; c < n; c++) s -= G[r][c] * v[c];
      v[r] = Math.abs(G[r][r]) < 1e-15 ? 0 : s / G[r][r];
    }
    if (this.ground >= 0) v[this.ground] = 0;
    return { v, floating };
  }
}
