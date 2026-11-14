/**
 * Couples the ATmega1284P model with the breadboard circuit on one timeline (CPU cycles at 20 MHz).
 *
 * The chip only runs when the circuit lets a real one run: VCC and GND supplied, a crystal on
 * XTAL1/XTAL2 (the reference board's fuses select an external 20 MHz crystal), RESET not pulled low,
 * and a program loaded. Losing any of these stops the chip; restoring them restarts the program.
 *
 * Time-dependent parts:
 * - Capacitors: while any capacitor voltage is still changing the circuit is stepped every 10 µs with a
 *   backward-Euler companion model; once settled it falls back to cached DC solutions.
 * - Mechanical contacts (push buttons, encoder A/B and push switch) bounce when they change, if enabled.
 * - The encoder turns one detent per request, producing its quadrature contact sequence over time.
 * - Servos measure the pulse width on their signal line and move towards the commanded angle.
 */
import { PinState } from 'avr8js';
import { Circuit, type ExternalDrive, type PinMode, type Solution, V_IH, V_IL } from '../circuit/circuit';
import { Hd44780, type LcdViolation } from '../lcd/hd44780';
import { LCD_PINS, type Part, partLegs } from '../circuit/parts';
import { Mcu1284P, type PortName } from '../chip/mcu';

export const FREQ = 20_000_000;
const PORTS: PortName[] = ['A', 'B', 'C', 'D'];
const MCUCR = 0x55;
const JTD = 0x80;
const JTAG_PINS = new Set(['PC2', 'PC3', 'PC4', 'PC5']);
const CHUNK = 1_000;
/** Most DC solutions kept (one per combination of pin states). */
const CACHE_SIZE = 4096; // ~2 kB per solution → at most ~8 MB
/** Warnings are re-evaluated at most every 1 ms of simulated time during pin activity. */
const WARN_INTERVAL = 20_000;
/** Transient step while capacitors charge: 10 µs. */
const STEP = 200;
const us = (x: number) => Math.round(x * 20); // µs → cycles
const ms = (x: number) => Math.round(x * 20_000); // ms → cycles

/**
 * Input switching thresholds with hysteresis (Schmitt trigger). Typical values at VCC = 5 V; the datasheet
 * only guarantees VIL ≤ 1.5 V reads low and VIH ≥ 3.0 V reads high.
 */
export const VT_RISE = 2.6;
export const VT_FALL = 2.2;

/** Longest contact bounce we generate: push buttons, encoder A/B (datasheet: ≤ 3 ms), encoder switch (< 10 ms). */
export const BOUNCE = { button: ms(3), encoder: ms(1.5), encoderSwitch: ms(4) };
/** Longest single bounce spike (typical, not from a datasheet): push buttons 100 µs, encoder contacts 5 µs. */
export const SPIKE = { button: us(100), encoder: us(5) };
/** Duration of one encoder detent when turned by hand. */
export const DETENT_CYCLES = ms(30);

/** Reference servo: 2.5 ms = 0° (full left), 0.5 ms = 180° (full right), 20 ms period. */
export const SERVO = { minUs: 500, maxUs: 2500, degPerSecond: 600, holdMs: 100 };

/**
 * Start-up delay from power-on (or RESET release) to the first instruction with an external crystal:
 * 16K CK + 14 CK + 65 ms (datasheet, CKSEL crystal, SUT=11). The board's fuse values are an assumption;
 * 65 ms is the slow setting, 4.1 ms the other common one.
 */
export const STARTUP_CYCLES = 16_384 + 14 + ms(65);

export interface ServoState {
  angle: number;
  target: number;
  lastPulseUs: number | null;
  lastPulseAt: number;
  highSince: number | null;
  powered: boolean;
}

export interface BoardStatus {
  powered: boolean;
  oscillator: boolean;
  inReset: boolean;
  programLoaded: boolean;
  /** Conditions to run are met but the start-up delay has not elapsed yet. */
  starting: boolean;
  running: boolean;
  fuseBlown: boolean;
}

/** Small seeded PRNG so bounce patterns are reproducible in tests. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BoardSim {
  circuit: Circuit;
  mcu: Mcu1284P | null = null;
  private flash: Uint8Array | null = null;
  private idleCycles = 0;
  private cpuOffset = 0;
  /** Simulate contact bounce of buttons and the encoder. */
  bounce = true;
  /** Delay from power-on/RESET release to the first instruction (see STARTUP_CYCLES). */
  startupCycles = STARTUP_CYCLES;
  private pendingStart: number | null = null;
  private rng = mulberry32(1);
  private events: { at: number; fn: () => void }[] = [];
  private transient = false;
  private lastSolveAt = 0;
  readonly servos = new Map<string, ServoState>();
  /** Detents turned so far per encoder (positive = clockwise), for drawing the knob. */
  readonly encoderDetents = new Map<string, number>();
  private encoderBusyUntil = new Map<string, number>();
  /** Current warnings by code, e.g. "floating:PD3" → English message. */
  readonly warnings = new Map<string, string>();
  /** Values behind each warning (pin, current, …) so the UI can word it in any language. */
  readonly warningParams = new Map<string, Record<string, string>>();
  status: BoardStatus = { powered: false, oscillator: false, inReset: false, programLoaded: false, starting: false, running: false, fuseBlown: false };
  private solution: Solution;
  private readonly cache = new Map<string, Solution>();
  private readonly levels = new Map<string, boolean>();
  private ledCharge = new Map<string, number>();
  private chargeStart = 0;
  private lastAccumulate = 0;
  private sigHigh = new Map<string, boolean>();
  /** HD44780 controllers of the LCD modules on the board, by part id. */
  readonly lcds = new Map<string, Hd44780>();
  private lcdLevels = new Map<string, boolean>();
  /** Drivers outside the MCU (LCD data outputs) for the next solve. */
  private extras: ExternalDrive[] = [];

  constructor(parts: Part[], flash?: Uint8Array, options: { bounce?: boolean; startupCycles?: number } = {}) {
    if (options.bounce !== undefined) this.bounce = options.bounce;
    if (options.startupCycles !== undefined) this.startupCycles = options.startupCycles;
    this.circuit = new Circuit(parts);
    for (const e of this.circuit.errors) this.warnings.set(`layout:${e}`, e);
    if (flash) this.flash = flash;
    this.solution = this.circuit.solve(new Map());
    this.update();
  }

  /** Simulated time in CPU cycles since the board was created. */
  get cycles(): number {
    return this.mcu ? this.mcu.cpu.cycles + this.cpuOffset : this.idleCycles;
  }

  // ---------------------------------------------------------------- user actions

  /**
   * Change the wiring while the board keeps running, as on a real breadboard: the chip keeps its
   * state if it still has power, clock and RESET high afterwards.
   */
  replaceParts(parts: Part[]) {
    this.accumulate();
    const old = this.circuit;
    const next = new Circuit(parts);
    const ids = new Set(parts.map((p) => p.id));
    const owner = (key: string) => key.split(':')[0];
    for (const k of old.closed) if (ids.has(owner(k))) next.closed.add(k);
    for (const id of old.burntLeds) if (ids.has(id)) next.burntLeds.add(id);
    for (const [id, v] of old.capV) if (ids.has(id)) next.capV.set(id, v);
    for (const id of [...this.servos.keys()]) if (!ids.has(id)) this.servos.delete(id);
    next.switchOn = old.switchOn;
    next.fuseBlown = old.fuseBlown;
    this.circuit = next;
    for (const k of [...this.warnings.keys()]) if (k.startsWith('layout:') || k.startsWith('burnt:')) this.warnings.delete(k);
    for (const e of next.errors) this.warnings.set(`layout:${e}`, e);
    this.cache.clear();
    this.levels.clear();
    this.update();
  }

  replaceFuse() {
    this.circuit.fuseBlown = false;
    this.cache.clear();
    this.update();
  }

  loadProgram(flash: Uint8Array) {
    this.flash = flash;
    for (const lcd of this.lcds.values()) lcd.violations.clear();
    for (const k of [...this.warnings.keys()]) if (k.startsWith('lcd-')) this.warnings.delete(k);
    this.stopChip(); // like reflashing: the chip restarts
    this.pendingStart = null;
    this.update();
  }

  setSwitch(on: boolean) {
    this.circuit.switchOn = on;
    this.cache.clear();
    this.update();
  }

  /** Press or release a push button (with contact bounce if enabled). */
  setButton(id: string, pressed: boolean) {
    this.setContact(id, pressed, BOUNCE.button, SPIKE.button);
  }

  /** Press or release the encoder's push switch. */
  setEncoderSwitch(id: string, pressed: boolean) {
    this.setContact(`${id}:SW`, pressed, BOUNCE.encoderSwitch, SPIKE.button);
  }

  /**
   * Turn the encoder by one detent (+1 clockwise, −1 counter-clockwise). A is open at every detent and
   * there is one full A pulse per detent, B shifted by a quarter period (datasheet fig. 1):
   *   clockwise:          A closes, B closes, A opens, B opens  → B closed (low) when A opens
   *   counter-clockwise:  B closes, A closes, B opens, A opens  → B open (high) when A opens
   * Usual decoding: on a rising edge of A, B high = turned left.
   * Requests queue up, so several quick turns play one after another.
   */
  turnEncoder(id: string, dir: 1 | -1, detentCycles = DETENT_CYCLES) {
    const start = Math.max(this.cycles, this.encoderBusyUntil.get(id) ?? 0);
    const [first, second] = dir > 0 ? ['A', 'B'] : ['B', 'A'];
    const q = detentCycles / 4;
    this.scheduleAt(start + 0.1 * q * 4, () => this.setContact(`${id}:${first}`, true, BOUNCE.encoder, SPIKE.encoder));
    this.scheduleAt(start + 1 * q, () => this.setContact(`${id}:${second}`, true, BOUNCE.encoder, SPIKE.encoder));
    this.scheduleAt(start + 2 * q, () => this.setContact(`${id}:${first}`, false, BOUNCE.encoder, SPIKE.encoder));
    this.scheduleAt(start + 3 * q, () => this.setContact(`${id}:${second}`, false, BOUNCE.encoder, SPIKE.encoder));
    this.scheduleAt(start + detentCycles, () => this.encoderDetents.set(id, (this.encoderDetents.get(id) ?? 0) + dir));
    this.encoderBusyUntil.set(id, start + detentCycles);
  }

  // ---------------------------------------------------------------- time

  /** Advance simulated time by `cycles`, executing the program if the chip can run. */
  run(cycles: number) {
    const end = this.cycles + cycles;
    while (this.cycles < end) {
      let target = Math.min(end, this.cycles + CHUNK);
      if (this.events.length) target = Math.min(target, Math.max(this.events[0].at, this.cycles + 1));
      if (this.transient) target = Math.min(target, this.lastSolveAt + STEP);
      this.advance(Math.max(1, target - this.cycles));
      while (this.events.length && this.events[0].at <= this.cycles) this.events.shift()!.fn();
      if (this.transient && this.cycles - this.lastSolveAt >= STEP) this.update();
      if (this.servos.size) this.moveServos();
    }
    this.moveServos();
    this.accumulate();
    if (this.lastWarnAt < this.cycles) {
      this.lastWarnAt = this.cycles;
      this.checkWarnings(this.solution, this.status.powered, this.status.oscillator);
    }
  }

  private advance(n: number) {
    const mcu = this.mcu;
    if (mcu) mcu.run(n);
    else this.idleCycles += n;
  }

  private scheduleAt(at: number, fn: () => void) {
    const ev = { at: Math.round(at), fn };
    const i = this.events.findIndex((e) => e.at > ev.at);
    if (i < 0) this.events.push(ev);
    else this.events.splice(i, 0, ev);
  }

  /**
   * Set a contact. With bounce enabled the contact takes the new state at once and then, during the bounce
   * window, briefly flips back a few times (spikes of `spike` cycles at most), ending in the requested state.
   */
  private setContact(key: string, closed: boolean, bounceMax: number, spike = bounceMax / 10) {
    this.applyContact(key, closed);
    if (!this.bounce || bounceMax === 0) return;
    const now = this.cycles;
    const n = 2 + Math.floor(this.rng() * 5); // 2–6 spikes
    for (let i = 0; i < n; i++) {
      const at = now + 1 + this.rng() * (bounceMax - spike);
      const len = Math.max(1, (0.2 + 0.8 * this.rng()) * spike);
      this.scheduleAt(at, () => this.applyContact(key, !closed));
      this.scheduleAt(at + len, () => this.applyContact(key, closed));
    }
  }

  private applyContact(key: string, closed: boolean) {
    if (closed === this.circuit.closed.has(key)) return;
    if (closed) this.circuit.closed.add(key);
    else this.circuit.closed.delete(key);
    this.cache.clear();
    this.update();
  }

  // ---------------------------------------------------------------- outputs

  ledCurrent(id: string): number {
    return this.solution.ledCurrent.get(id) ?? 0;
  }

  /** Average LED current (A) since the previous call: what the eye sees for a blinking/PWM LED. */
  takeLedAverage(): Map<string, number> {
    this.accumulate();
    const now = this.cycles;
    const span = now - this.chargeStart;
    const out = new Map<string, number>();
    for (const [id, q] of this.ledCharge) out.set(id, span > 0 ? q / span : this.ledCurrent(id));
    this.ledCharge = new Map();
    this.chargeStart = now;
    return out;
  }

  netVoltage(hole: string): number | undefined {
    const n = this.circuit.net(hole);
    if (n === undefined || this.solution.floating[n]) return undefined;
    return this.solution.v[n];
  }

  /** True while capacitors are still charging or discharging. */
  get settling(): boolean {
    return this.transient;
  }

  private accumulate() {
    const now = this.cycles;
    const dt = now - this.lastAccumulate;
    if (dt > 0) for (const [id, i] of this.solution.ledCurrent) this.ledCharge.set(id, (this.ledCharge.get(id) ?? 0) + i * dt);
    this.lastAccumulate = now;
  }

  // ---------------------------------------------------------------- circuit evaluation

  private pinDrives(): Map<string, PinMode> {
    const drives = new Map<string, PinMode>();
    const mcu = this.mcu;
    if (!mcu) return drives;
    const jtag = (mcu.cpu.data[MCUCR] & JTD) === 0;
    for (const L of PORTS) {
      for (let bit = 0; bit < 8; bit++) {
        const name = `P${L}${bit}`;
        if (jtag && JTAG_PINS.has(name)) continue; // owned by the JTAG interface
        const s = mcu.ports[L].pinState(bit);
        drives.set(name, s === PinState.High ? 'high' : s === PinState.Low ? 'low' : s === PinState.InputPullUp ? 'pullup' : 'input');
      }
    }
    return drives;
  }

  /** Cache key for the current electrical state: pin drive codes + external drivers. */
  private driveKey(): string {
    const mcu = this.mcu;
    let key = '';
    if (mcu) {
      const jtag = (mcu.cpu.data[MCUCR] & JTD) === 0;
      for (const L of PORTS) {
        const port = mcu.ports[L];
        for (let bit = 0; bit < 8; bit++) {
          if (jtag && L === 'C' && bit >= 2 && bit <= 5) key += 'j';
          else key += port.pinState(bit);
        }
      }
    }
    for (const x of this.extras) key += `|${x.hole}${x.high ? 1 : 0}`;
    return key;
  }

  /** DC solution for the current drives, from a small LRU cache (at most CACHE_SIZE entries). */
  private solveCached(drives: Map<string, PinMode>, key = this.driveKey()): Solution {
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key); // most recently used goes to the end
      this.cache.set(key, cached);
      return cached;
    }
    // Damage (blown fuse, burnt LED) changes the circuit: solve again until nothing else breaks.
    for (;;) {
      const fuseBefore = this.circuit.fuseBlown;
      const burntBefore = this.circuit.burntLeds.size;
      const sol = this.circuit.solve(drives, undefined, this.extras);
      if (this.circuit.fuseBlown === fuseBefore && this.circuit.burntLeds.size === burntBefore) {
        this.cache.set(key, sol);
        if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
        return sol;
      }
      this.cache.clear();
    }
  }

  /** One backward-Euler step from the last solve to now; commits the capacitor voltages. */
  private solveTransient(drives: Map<string, PinMode>, now: number): Solution {
    const dt = Math.max(1, now - this.lastSolveAt) / FREQ;
    let sol = this.circuit.solve(drives, dt, this.extras);
    if (this.circuit.fuseBlown || this.circuit.burntLeds.size) sol = this.circuit.solve(drives, dt, this.extras);
    let maxChange = 0;
    for (const [id, v] of sol.capAcross) {
      maxChange = Math.max(maxChange, Math.abs(v - (this.circuit.capV.get(id) ?? 0)));
      this.circuit.capV.set(id, v);
    }
    this.lastSolveAt = now;
    if (maxChange < 1e-3 && !this.capsDisagree(this.solveCached(drives))) this.transient = false;
    return sol;
  }

  private capsDisagree(dc: Solution): boolean {
    for (const [id, v] of dc.capAcross) if (Math.abs(v - (this.circuit.capV.get(id) ?? 0)) > 0.002) return true;
    return false;
  }

  private netV(sol: Solution, net: number | undefined): number | undefined {
    if (net === undefined || sol.floating[net]) return undefined;
    return sol.v[net];
  }

  private startChip() {
    this.mcu = new Mcu1284P(this.flash!);
    this.cpuOffset = this.idleCycles;
    this.levels.clear();
    for (const L of PORTS) this.mcu.ports[L].addListener(() => this.update(true));
  }

  private stopChip() {
    if (!this.mcu) return;
    this.idleCycles = this.cycles;
    this.mcu = null;
  }

  /** Re-evaluate the circuit after anything changed (pin writes, contacts, power) or a transient step. */
  private lastKey = '';
  private lastWarnAt = -Infinity;

  /**
   * @param pinChange true when called because the program wrote a port: a write that does not change the
   *   electrical state returns at once, and warnings are re-checked at most every WARN_INTERVAL.
   */
  private update(pinChange = false) {
    this.accumulate();
    const now = this.cycles;
    const c = this.circuit;
    const key = this.transient ? '' : this.driveKey();
    if (pinChange && !this.transient && key === this.lastKey) return;
    let drives = this.pinDrives();
    let sol: Solution;
    if (!this.transient) {
      sol = this.solveCached(drives, key);
      if (this.capsDisagree(sol)) {
        this.transient = true;
        this.lastSolveAt = now;
      }
    }
    if (this.transient) sol = this.solveTransient(drives, now);

    const vcc = this.netV(sol!, c.mcuPin.get('VCC'));
    const gndOk = c.gndNets.some((n) => n === c.ground);
    const powered = vcc !== undefined && vcc > 4.5 && gndOk;
    const oscillator = c.hasCrystal();
    const reset = this.netV(sol!, c.mcuPin.get('RESET'));
    const inReset = reset !== undefined && reset < V_IL; // floating RESET: internal pull-up keeps it high
    const canRun = powered && oscillator && !inReset && this.flash !== null;
    if (canRun && !this.mcu) {
      if (this.startupCycles <= 0) this.startChip();
      else if (this.pendingStart === null) {
        const at = now + this.startupCycles;
        this.pendingStart = at;
        this.scheduleAt(at, () => {
          if (this.pendingStart !== at) return;
          this.pendingStart = null;
          this.startChip();
          this.update();
        });
      }
    } else if (!canRun) {
      this.pendingStart = null;
      if (this.mcu) this.stopChip();
    }
    const running = this.mcu !== null;
    this.status = {
      powered,
      oscillator,
      inReset,
      programLoaded: this.flash !== null,
      starting: canRun && !running,
      running,
      fuseBlown: c.fuseBlown,
    };
    const newDrives = this.pinDrives();
    if (!sameDrives(drives, newDrives)) {
      drives = newDrives;
      sol = this.transient ? this.circuit.solve(drives, Math.max(1, now - this.lastSolveAt) / FREQ, this.extras) : this.solveCached(drives);
    }
    // LCD controllers react to the new levels; when they start/stop driving their data lines, solve again.
    for (let i = 0; i < 3 && this.syncLcds(sol!, now); i++) {
      sol = this.transient ? this.circuit.solve(drives, Math.max(1, now - this.lastSolveAt) / FREQ, this.extras) : this.solveCached(drives);
    }
    this.solution = sol!;
    this.lastKey = this.transient ? '' : this.driveKey();
    this.trackServos(sol!, now);
    if (!pinChange || now - this.lastWarnAt >= WARN_INTERVAL) {
      this.lastWarnAt = now;
      this.checkWarnings(sol!, powered, oscillator);
    }
    if (this.mcu) this.feedInputs(sol!);
  }

  // ---------------------------------------------------------------- LCD

  /**
   * Feed each LCD controller its supply and input levels; update the data-line drivers.
   * Returns true when the drivers changed (the circuit must be solved again).
   */
  private syncLcds(sol: Solution, now: number): boolean {
    const lcdParts = this.partsOf('lcd');
    if (!lcdParts.length && !this.lcds.size && !this.extras.length) return false;
    let changed = false;
    const seen = new Set<string>();
    for (const p of lcdParts) {
      seen.add(p.id);
      let lcd = this.lcds.get(p.id);
      if (!lcd) {
        lcd = new Hd44780();
        this.lcds.set(p.id, lcd);
      }
      const hole = (name: (typeof LCD_PINS)[number]) => `${p.block}${p.row}${p.col + LCD_PINS.indexOf(name)}`;
      const v = (name: (typeof LCD_PINS)[number]) => this.netV(sol, this.circuit.net(hole(name)));
      const supply = (v('VDD') ?? 0) - (v('VSS') ?? 0);
      changed = lcd.setSupply(supply, now) || changed;
      // HD44780 inputs: VIH ≥ 2.2 V, VIL ≤ 0.6 V; keep the previous level in between.
      const level = (name: (typeof LCD_PINS)[number]) => {
        const key = `${p.id}:${name}`;
        const x = v(name);
        let l = this.lcdLevels.get(key) ?? false;
        if (x !== undefined && x >= 2.2) l = true;
        else if (x !== undefined && x <= 0.6) l = false;
        this.lcdLevels.set(key, l);
        return l;
      };
      let data = 0;
      for (let b = 0; b < 8; b++) if (level(`D${b}` as (typeof LCD_PINS)[number])) data |= 1 << b;
      const before = lcd.outputFrom;
      changed = lcd.setInputs({ rs: level('RS'), rw: level('RW'), e: level('E'), data }, now) || changed;
      if (lcd.outputFrom !== null && lcd.outputFrom !== before && lcd.outputFrom > now) {
        // Must land exactly between instructions: use the CPU's own clock events while the chip runs.
        if (this.mcu) this.mcu.cpu.addClockEvent(() => this.update(), lcd.outputFrom - now);
        else this.scheduleAt(lcd.outputFrom, () => this.update());
      }
    }
    for (const id of [...this.lcds.keys()]) if (!seen.has(id)) this.lcds.delete(id);
    const next = this.lcdDrives(now);
    const same = next.length === this.extras.length && next.every((x, i) => x.hole === this.extras[i].hole && x.high === this.extras[i].high);
    if (!same) this.extras = next;
    return !same || changed;
  }

  /**
   * Would the Atmel-ICE reach the chip through the programming header? Like avrdude, it needs target
   * power (VTref) and TCK/TMS/TDO/TDI/RST wired to PC2/PC3/PC4/PC5/RESET. Returns the problems found
   * (empty = programming works) or null if no header is on the board.
   */
  jtagCheck(): string[] | null {
    const header = this.circuit.parts.find((p) => p.kind === 'jtag');
    if (!header) return null;
    const legs = partLegs(header);
    const net = (pin: number) => (legs[`p${pin}`] ? this.circuit.net(legs[`p${pin}`]) : undefined);
    const problems: string[] = [];
    if (!this.status.powered) problems.push('power');
    const wanted: [string, number, string][] = [
      ['TCK', 10, 'PC2'],
      ['TMS', 6, 'PC3'],
      ['TDO', 8, 'PC4'],
      ['TDI', 2, 'PC5'],
      ['RST', 5, 'RESET'],
      ['VCC', 7, 'VCC'],
    ];
    for (const [sig, pin, mcuPin] of wanted) {
      const target = this.circuit.mcuPin.get(mcuPin);
      if (target === undefined || net(pin) !== target) problems.push(`${sig}-${mcuPin}`);
    }
    // The 8-pin plug has a single GND contact (pin 1); the header has two.
    for (const pin of [1, 9]) if (legs[`p${pin}`] && net(pin) !== this.circuit.ground) problems.push(`GND${pin}`);

    return problems;
  }

  /**
   * What an LCD shows. Contrast follows VDD − VEE (EA: VEE 0…0.5 V gives full contrast; the drive voltage must
   * be roughly ≥ 4 V for readable characters — approximate, panel-dependent). Text is the HD44780's view;
   * nothing is visible without supply, with the display off, or without contrast.
   */
  lcdView(id: string) {
    const p = this.circuit.parts.find((x) => x.id === id && x.kind === 'lcd') as Extract<Part, { kind: 'lcd' }> | undefined;
    const lcd = this.lcds.get(id);
    if (!p || !lcd) return null;
    const v = (name: (typeof LCD_PINS)[number]) => this.netVoltage(`${p.block}${p.row}${p.col + LCD_PINS.indexOf(name)}`);
    const vdd = (v('VDD') ?? 0) - (v('VSS') ?? 0);
    const vee = v('VEE');
    const drive = vee === undefined ? 0 : vdd - (vee - (v('VSS') ?? 0));
    const contrast = lcd.powered ? Math.max(0, Math.min(1, (drive - 3.0) / 1.0)) : 0;
    return {
      powered: lcd.powered,
      displayOn: lcd.powered && lcd.displayOn,
      contrast,
      lines: lcd.visible(),
      text: lcd.visible().map((line) => line.map((c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : c < 0 ? ' ' : '·')).join('')),
      cursor: lcd.cursorOn ? lcd.cursorCell() : null,
      blink: lcd.blinkOn ? lcd.cursorCell() : null,
      backlight: this.ledCurrent(`${id}:backlight`),
      controller: lcd,
    };
  }

  private lcdDrives(now: number): ExternalDrive[] {
    const out: ExternalDrive[] = [];
    for (const p of this.circuit.parts) {
      if (p.kind !== 'lcd') continue;
      const d = this.lcds.get(p.id)?.drive(now);
      if (!d) continue;
      for (let b = 0; b < 8; b++) {
        if (!(d.mask & (1 << b))) continue;
        // HD44780 outputs are weak (VOH 2.4 V at −0.205 mA): about 1 kΩ.
        out.push({ hole: `${p.block}${p.row}${p.col + 6 + b}`, high: (d.value & (1 << b)) !== 0, ohms: 1_000 });
      }
    }
    return out;
  }

  /** Drive the chip's input pins from the circuit voltages, with Schmitt-trigger hysteresis. */
  private feedInputs(sol: Solution) {
    const mcu = this.mcu!;
    const avccOk = (this.netV(sol, this.circuit.mcuPin.get('AVCC')) ?? 0) > 4.5;
    for (const L of PORTS) {
      for (let bit = 0; bit < 8; bit++) {
        const s = mcu.ports[L].pinState(bit);
        if (s === PinState.High || s === PinState.Low) continue;
        const name = `P${L}${bit}`;
        const v = this.netV(sol, this.circuit.mcuPin.get(name));
        const pullup = s === PinState.InputPullUp;
        let level = this.levels.get(name) ?? pullup;
        if (L === 'A' && !avccOk) {
          // Port A is supplied from AVCC; without it the input buffers are unpowered.
        } else if (v === undefined) {
          level = pullup ? true : level; // floating: an enabled pull-up wins, otherwise the level is undefined
        } else if (v >= VT_RISE) level = true;
        else if (v <= VT_FALL) level = false;
        this.levels.set(name, level);
        mcu.ports[L].setPin(bit, level);
      }
    }
  }

  // ---------------------------------------------------------------- servos

  private partsOf<K extends Part['kind']>(kind: K): Extract<Part, { kind: K }>[] {
    const c = this.circuit as Circuit & { _byKind?: Map<string, Part[]> };
    if (!c._byKind) {
      c._byKind = new Map();
      for (const p of c.parts) c._byKind.set(p.kind, [...(c._byKind.get(p.kind) ?? []), p]);
    }
    return (c._byKind.get(kind) ?? []) as Extract<Part, { kind: K }>[];
  }

  private trackServos(sol: Solution, now: number) {
    for (const p of this.partsOf('servo')) {
      let s = this.servos.get(p.id);
      if (!s) {
        s = { angle: 90, target: 90, lastPulseUs: null, lastPulseAt: -Infinity, highSince: null, powered: false };
        this.servos.set(p.id, s);
      }
      const v = (hole: string) => this.netV(sol, this.circuit.net(hole)) ?? 0;
      s.powered = v(p.vcc) - v(p.gnd) > 4;
      const high = s.powered && v(p.signal) - v(p.gnd) > 2.5;
      const was = this.sigHigh.get(p.id) ?? false;
      if (high && !was) s.highSince = now;
      if (!high && was && s.highSince !== null) {
        const width = (now - s.highSince) / 20; // µs
        s.lastPulseUs = width;
        s.lastPulseAt = now;
        s.highSince = null;
        const angle = ((SERVO.maxUs - width) / (SERVO.maxUs - SERVO.minUs)) * 180;
        s.target = Math.max(0, Math.min(180, angle));
      }
      this.sigHigh.set(p.id, high);
    }
  }

  private lastServoMove = 0;
  private moveServos() {
    const now = this.cycles;
    const dt = (now - this.lastServoMove) / FREQ;
    this.lastServoMove = now;
    for (const s of this.servos.values()) {
      // A servo only holds or moves while it gets power and recent pulses.
      if (!s.powered || now - s.lastPulseAt > ms(SERVO.holdMs)) continue;
      const step = SERVO.degPerSecond * dt;
      s.angle += Math.max(-step, Math.min(step, s.target - s.angle));
    }
  }

  // ---------------------------------------------------------------- warnings

  private checkWarnings(sol: Solution, powered: boolean, oscillator: boolean) {
    const w = this.warnings;
    const set = (code: string, on: boolean, msg: string, params: Record<string, string> = {}) => {
      if (on) {
        w.set(code, msg);
        this.warningParams.set(code, params);
      } else {
        w.delete(code);
        this.warningParams.delete(code);
      }
    };
    const c = this.circuit;
    set('fuse', c.fuseBlown, `Fuse on the power board blown (more than 0.5 A drawn): look for a short circuit.`);
    set('power-off', !c.switchOn, 'Power board switch S is off.');
    const vcc = this.netV(sol, c.mcuPin.get('VCC'));
    set('no-vcc', !!c.parts.find((p) => p.kind === 'mcu') && !(vcc !== undefined && vcc > 4.5), 'Microcontroller has no supply on VCC (pin 10).');
    set('no-gnd', c.gndNets.length > 0 && !c.gndNets.includes(c.ground), 'Microcontroller GND (pins 11/31) not connected to ground.');
    set('one-gnd', c.gndNets.length === 2 && c.gndNets.includes(c.ground) && !c.gndNets.every((n) => n === c.ground), 'Only one of the two GND pins (11, 31) is connected.');
    set('no-crystal', powered && !oscillator, 'No crystal between XTAL1 and XTAL2: the chip has no clock and does not run.');
    const avcc = this.netV(sol, c.mcuPin.get('AVCC'));
    set('no-avcc', powered && !(avcc !== undefined && avcc > 4.5), 'AVCC (pin 30) not connected to 5 V: port A does not work.');
    for (const id of c.burntLeds) set(`burnt:${id}`, true, `LED ${id} destroyed by overcurrent (series resistor missing?).`, { id });
    for (const [pin, i] of sol.pinCurrent) {
      const mA = (Math.abs(i) * 1000).toFixed(0);
      set(`overload:${pin}`, Math.abs(i) > 0.04, `${pin} drives ${mA} mA, above the 40 mA absolute maximum.`, { pin, mA });
    }
    for (const [id, s] of this.servos) {
      const out = s.lastPulseUs !== null && (s.lastPulseUs < SERVO.minUs - 100 || s.lastPulseUs > SERVO.maxUs + 100);
      const pulse = s.lastPulseUs?.toFixed(0) ?? '';
      set(`servo-range:${id}`, out, `Servo ${id}: pulse ${pulse} µs is outside 500–2500 µs; the servo sits at its end stop.`, { id, us: pulse });
      set(`servo-power:${id}`, !s.powered, `Servo ${id} has no 5 V supply between its red and brown wire.`, { id });
    }
    for (const [id, lcd] of this.lcds) {
      for (const kind of lcd.violations.keys()) {
        set(`lcd-${kind}:${id}`, true, LCD_MESSAGES[kind].replace('{id}', id), { id });
      }
    }
    if (this.mcu && !this.transient) {
      for (const L of PORTS) {
        for (let bit = 0; bit < 8; bit++) {
          const name = `P${L}${bit}`;
          const s = this.mcu.ports[L].pinState(bit);
          const v = this.netV(sol, c.mcuPin.get(name));
          set(`floating:${name}`, s === PinState.Input && v === undefined && this.reachesContact(name), `${name} is an input without pull-up and nothing drives it: its level is undefined.`, { pin: name });
          set(`undefined:${name}`, (s === PinState.Input || s === PinState.InputPullUp) && v !== undefined && v > V_IL && v < V_IH, `${name} sits at ${v?.toFixed(2)} V, between the input thresholds (${V_IL} V / ${V_IH} V).`, { pin: name, v: v?.toFixed(2) ?? '' });
        }
      }
    }
  }

  /**
   * True if the pin leads (directly or through resistors/capacitors) to a switch contact: a button, the encoder's
   * A/B/C or push-switch pins. A floating input matters there (missing pull-up); a pin that only goes to an LED,
   * a servo or an LCD line and is simply not used by the program is harmless, as on the real board.
   */
  private reachesContact(pin: string): boolean {
    const c = this.circuit;
    const start = c.mcuPin.get(pin);
    if (start === undefined) return false;
    const contactNets = new Set<number>();
    const links = new Map<number, number[]>();
    const link = (a?: number, b?: number) => {
      if (a === undefined || b === undefined) return;
      links.set(a, [...(links.get(a) ?? []), b]);
      links.set(b, [...(links.get(b) ?? []), a]);
    };
    for (const p of c.parts) {
      if (p.kind === 'button') [p.a, p.b].forEach((h) => contactNets.add(c.net(h)!));
      if (p.kind === 'encoder') [p.a, p.b, p.c, p.sw1, p.sw2].forEach((h) => contactNets.add(c.net(h)!));
      if ((p.kind === 'resistor' || p.kind === 'capacitor') && !p.id.includes(':')) link(c.net(p.a), c.net(p.b));
    }
    const seen = new Set([start]);
    const todo = [start];
    while (todo.length) {
      const n = todo.pop()!;
      if (contactNets.has(n)) return true;
      for (const m of links.get(n) ?? []) if (!seen.has(m)) seen.add(m), todo.push(m);
    }
    return false;
  }
}

const LCD_MESSAGES: Record<LcdViolation, string> = {
  'enable-high': 'LCD {id}: E was high for less than 450 ns (datasheet PWEH).',
  'enable-cycle': 'LCD {id}: less than 1000 ns between two rising edges of E (datasheet tcycE).',
  'address-setup': 'LCD {id}: RS/RW changed less than 140 ns before E rose (datasheet tAS).',
  'data-setup': 'LCD {id}: data changed less than 195 ns before E fell (datasheet tDSW).',
  'write-while-busy': 'LCD {id}: a command or data byte was sent while the busy flag was set; the display ignored it.',
  'short-power-off': 'LCD {id}: supply was off for less than 1 ms; the power-on reset is not guaranteed.',
};

function sameDrives(a: Map<string, PinMode>, b: Map<string, PinMode>) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export const cyclesFromUs = us;
export const cyclesFromMs = ms;
