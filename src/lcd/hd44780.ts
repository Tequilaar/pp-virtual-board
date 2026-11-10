/**
 * HD44780 display controller, as on the EA W162B-N3LW (2 × 16 characters).
 * Written from the HD44780 instruction set and the EA datasheet (timing, execution times); time in CPU
 * cycles at 20 MHz so it shares the board's timeline.
 *
 * Interface behaviour that matters for student code:
 * - Writes are latched on the falling edge of E; reads drive D7..D0 (or D7..D4) while E is high, after the
 *   data delay time.
 * - In 4-bit mode one nibble counter toggles on every E pulse, read or write. A write completes on the second
 *   pulse with the nibble seen on the first pulse (the controller's own output if that pulse was a read).
 *   UNVERIFIED DETAIL (see NibbleMode): what restarts that counter. Drivers that send lone nibbles in 4-bit
 *   mode (or read only one nibble while busy) only work if a change of R/W restarts the sequence.
 * - While busy (BF = 1) instructions and data writes are ignored; reads return BF = 1.
 * - Power-on reset: 8-bit mode, 1 line, display off, increment, DDRAM cleared; busy for 10 ms.
 * - Timing rules from the datasheet are checked and reported, not enforced (typical parts are faster).
 */

const CYCLES_PER_NS = 0.02; // 20 MHz
const ns = (x: number) => Math.ceil(x * CYCLES_PER_NS);
const us = (x: number) => Math.round(x * 20);

/** Datasheet timing (EA W162B / HD44780 at 5 V) in CPU cycles. */
export const LCD_TIMING = {
  enableCycle: ns(1000), // tcycE min
  enableHigh: ns(450), // PWEH min
  addressSetup: ns(140), // tAS min (RS, R/W before E rises)
  dataSetup: ns(195), // tDSW min (data before E falls)
  /** Data delay after E rises (tDDR max 320 ns). We answer after a typical 200 ns; violations are reported. */
  dataDelay: ns(200),
  clearHome: us(1640), // Clear Display / Return Home: 1.64 ms
  other: us(40), // all other instructions and data: 40 µs
  powerOnBusy: us(10_000), // busy for 10 ms after VDD reaches 4.5 V
  minOffTime: us(1000), // power off ≥ 1 ms for a reliable power-on reset
};

export type LcdViolation =
  | 'enable-high'
  | 'enable-cycle'
  | 'address-setup'
  | 'data-setup'
  | 'write-while-busy'
  | 'short-power-off';

export interface LcdInputs {
  rs: boolean;
  rw: boolean;
  e: boolean;
  /** Logic levels on D7..D0 as seen by the controller (bit n = Dn). */
  data: number;
}

/**
 * What restarts the 4-bit nibble sequence:
 * - 'rw-change-resets' (default, ASSUMPTION): a pulse with a different R/W than the previous pulse starts a new
 *   byte. Of the behaviours considered, this is the only one under which drivers that read a single nibble while
 *   busy and then send a lone nibble in 4-bit mode work every time — such drivers are known to work on real boards.
 * - 'always-toggle': every pulse advances the counter, whatever R/W is — the literal datasheet reading. With it
 *   such drivers get out of step and hang.
 * - 'hold-while-busy': pulses while BF = 1 do not advance the counter. Unlikely on real parts: with it even a
 *   datasheet-correct driver slips when BF clears between the two pulses of a read (tests/lcd.test.ts).
 * To be settled on a real board with tools/lcd-nibble-probe (it tells the three apart).
 */
export type NibbleMode = 'rw-change-resets' | 'always-toggle' | 'hold-while-busy';

export class Hd44780 {
  nibbleMode: NibbleMode = 'rw-change-resets';
  private lastPulseRw: boolean | null = null;
  // --- configuration (set by instructions)
  eightBit = true;
  twoLines = false;
  font5x10 = false;
  displayOn = false;
  cursorOn = false;
  blinkOn = false;
  increment = true;
  shiftOnWrite = false;

  // --- memories and pointers
  readonly ddram = new Uint8Array(0x80).fill(0x20);
  readonly cgram = new Uint8Array(64);
  ac = 0;
  /** true: AC addresses CGRAM, false: DDRAM. */
  cgMode = false;
  /** Display shift in characters (positive = content moved left). */
  shift = 0;

  powered = false;
  busyUntil = 0;
  private offSince = -Infinity;
  private everPowered = false;

  // --- bus state
  private last: LcdInputs = { rs: false, rw: false, e: false, data: 0 };
  private rsRwChangedAt = 0;
  private dataChangedAt = 0;
  private eRoseAt = -Infinity;
  private secondNibble = false;
  private firstNibble = 0;
  /** Byte being read in the current read cycle (fixed at the first E pulse). */
  private readByte = 0;
  /** When the controller's output on the data lines becomes valid during a read; null = not driving. */
  outputFrom: number | null = null;

  /** Datasheet violations seen since the last check, with the time they happened. */
  readonly violations = new Map<LcdViolation, number>();

  // ---------------------------------------------------------------- power

  /** Feed the supply voltage (VDD − VSS). Returns true when the power state changed. */
  setSupply(volts: number, now: number): boolean {
    if (this.powered && volts < 2.0) {
      this.powered = false;
      this.offSince = now;
      this.outputFrom = null;
      return true;
    }
    if (!this.powered && volts >= 4.5) {
      this.powered = true;
      if (this.everPowered && now - this.offSince < LCD_TIMING.minOffTime) {
        // Too short a dip: the internal reset is not guaranteed. Keep the old state, as a real part may.
        this.violations.set('short-power-off', now);
      } else {
        this.reset(now);
      }
      this.everPowered = true;
      return true;
    }
    return false;
  }

  private reset(now: number) {
    this.eightBit = true;
    this.twoLines = false;
    this.font5x10 = false;
    this.displayOn = false;
    this.cursorOn = false;
    this.blinkOn = false;
    this.increment = true;
    this.shiftOnWrite = false;
    this.ddram.fill(0x20);
    this.cgram.fill(0);
    this.ac = 0;
    this.cgMode = false;
    this.shift = 0;
    this.secondNibble = false;
    this.lastPulseRw = null;
    this.outputFrom = null;
    this.busyUntil = now + LCD_TIMING.powerOnBusy;
  }

  busy(now: number) {
    return now < this.busyUntil;
  }

  // ---------------------------------------------------------------- bus

  /**
   * Feed the logic levels of RS, R/W, E and D7..D0 at time `now`. Call on every change.
   * Returns true when the controller starts or stops driving the data lines.
   */
  setInputs(inp: LcdInputs, now: number): boolean {
    if (!this.powered) {
      this.last = { ...inp };
      return false;
    }
    const prev = this.last;
    if (inp.rs !== prev.rs || inp.rw !== prev.rw) this.rsRwChangedAt = now;
    if (inp.data !== prev.data) this.dataChangedAt = now;
    let driveChanged = false;

    if (inp.e && !prev.e) {
      // Rising edge of E.
      if (now - this.eRoseAt < LCD_TIMING.enableCycle) this.violations.set('enable-cycle', now);
      if (now - this.rsRwChangedAt < LCD_TIMING.addressSetup) this.violations.set('address-setup', now);
      this.eRoseAt = now;
      if (!this.eightBit && this.nibbleMode === 'rw-change-resets' && this.lastPulseRw !== null && this.lastPulseRw !== inp.rw) {
        this.secondNibble = false; // a new byte starts when the direction changes
      }
      this.lastPulseRw = inp.rw;
      if (inp.rw) {
        if (this.eightBit || !this.secondNibble) this.readByte = this.readValue(inp.rs, now);
        this.outputFrom = now + LCD_TIMING.dataDelay;
        driveChanged = true;
      }
    } else if (!inp.e && prev.e) {
      // Falling edge of E.
      if (now - this.eRoseAt < LCD_TIMING.enableHigh) this.violations.set('enable-high', now);
      const wasDriving = this.outputFrom !== null;
      this.outputFrom = null;
      driveChanged = wasDriving;
      if (!prev.rw && now - this.dataChangedAt < LCD_TIMING.dataSetup) this.violations.set('data-setup', now);
      this.completePulse(prev, now);
    }
    this.last = { ...inp };
    return driveChanged;
  }

  /** Levels the controller drives on D7..D0 at `now`, or null when it does not drive. */
  drive(now: number): { mask: number; value: number } | null {
    if (!this.powered || this.outputFrom === null || now < this.outputFrom) return null;
    if (this.eightBit) return { mask: 0xff, value: this.readByte };
    const nibble = this.secondNibble ? this.readByte & 0x0f : this.readByte >> 4;
    return { mask: 0xf0, value: nibble << 4 };
  }

  /** BF + AC (RS = 0) or the RAM byte at AC (RS = 1). */
  private readValue(rs: boolean, now: number): number {
    if (!rs) return (this.busy(now) ? 0x80 : 0) | (this.ac & 0x7f);
    return this.cgMode ? this.cgram[this.ac & 0x3f] : this.ddram[this.ac & 0x7f];
  }

  /** End of an E pulse with the bus state `p` that was present while E was high. */
  private completePulse(p: LcdInputs, now: number) {
    if (this.eightBit) {
      if (p.rw) this.finishRead(p.rs, now);
      else this.write(p.rs, p.data & 0xff, now);
      return;
    }
    // 4-bit mode: D7..D4 carry the nibble; one counter for reads and writes.
    if (this.nibbleMode === 'hold-while-busy' && this.busy(now)) {
      if (!p.rw) this.violations.set('write-while-busy', now);
      return;
    }
    const busNibble = (p.data >> 4) & 0x0f;
    if (!this.secondNibble) {
      // During a read pulse the lines carry the controller's own output.
      this.firstNibble = p.rw ? this.readByte >> 4 : busNibble;
      this.secondNibble = true;
      return;
    }
    this.secondNibble = false;
    if (p.rw) this.finishRead(p.rs, now);
    else this.write(p.rs, (this.firstNibble << 4) | busNibble, now);
  }

  private finishRead(rs: boolean, now: number) {
    if (rs && !this.busy(now)) {
      this.stepAddress();
      this.busyUntil = now + LCD_TIMING.other;
    }
  }

  // ---------------------------------------------------------------- instructions

  private write(rs: boolean, byte: number, now: number) {
    if (this.busy(now)) {
      this.violations.set('write-while-busy', now);
      return;
    }
    if (rs) {
      if (this.cgMode) this.cgram[this.ac & 0x3f] = byte & 0x1f;
      else this.ddram[this.ac & 0x7f] = byte;
      this.stepAddress();
      if (!this.cgMode && this.shiftOnWrite) this.shift += this.increment ? 1 : -1;
      this.busyUntil = now + LCD_TIMING.other;
      return;
    }
    let time = LCD_TIMING.other;
    if (byte & 0x80) {
      this.ac = byte & 0x7f;
      this.cgMode = false;
    } else if (byte & 0x40) {
      this.ac = byte & 0x3f;
      this.cgMode = true;
    } else if (byte & 0x20) {
      // In 4-bit mode the first function set (one nibble, sent while still in 8-bit mode) switches DL.
      this.eightBit = (byte & 0x10) !== 0;
      this.twoLines = (byte & 0x08) !== 0;
      this.font5x10 = (byte & 0x04) !== 0;
      this.secondNibble = false;
    } else if (byte & 0x10) {
      const right = (byte & 0x04) !== 0;
      if (byte & 0x08) this.shift += right ? -1 : 1;
      else this.moveCursor(right);
    } else if (byte & 0x08) {
      this.displayOn = (byte & 0x04) !== 0;
      this.cursorOn = (byte & 0x02) !== 0;
      this.blinkOn = (byte & 0x01) !== 0;
    } else if (byte & 0x04) {
      this.increment = (byte & 0x02) !== 0;
      this.shiftOnWrite = (byte & 0x01) !== 0;
    } else if (byte & 0x02) {
      this.ac = 0;
      this.cgMode = false;
      this.shift = 0;
      time = LCD_TIMING.clearHome;
    } else if (byte & 0x01) {
      this.ddram.fill(0x20);
      this.ac = 0;
      this.cgMode = false;
      this.shift = 0;
      this.increment = true;
      time = LCD_TIMING.clearHome;
    }
    this.busyUntil = now + time;
  }

  private moveCursor(right: boolean) {
    const inc = this.increment;
    this.increment = right;
    this.stepAddress();
    this.increment = inc;
  }

  /** Advance AC by one in the current direction, wrapping like the HD44780's DDRAM address space. */
  private stepAddress() {
    if (this.cgMode) {
      this.ac = (this.ac + (this.increment ? 1 : 63)) & 0x3f;
      return;
    }
    let a = this.ac;
    if (this.twoLines) {
      if (this.increment) a = a === 0x27 ? 0x40 : a === 0x67 ? 0x00 : a + 1;
      else a = a === 0x40 ? 0x27 : a === 0x00 ? 0x67 : a - 1;
    } else {
      a = this.increment ? (a + 1) % 0x50 : (a + 0x4f) % 0x50;
    }
    this.ac = a;
  }

  // ---------------------------------------------------------------- what the display shows

  /** Character codes visible in each line (16 columns), taking the display shift into account. */
  visible(rows = 2, cols = 16): number[][] {
    const lines: number[][] = [];
    const lineLen = this.twoLines ? 40 : 80;
    for (let r = 0; r < rows; r++) {
      const line: number[] = [];
      for (let c = 0; c < cols; c++) {
        if (!this.twoLines && r > 0) {
          line.push(-1); // second line not driven in 1-line mode
          continue;
        }
        const pos = (((c + this.shift) % lineLen) + lineLen) % lineLen;
        line.push(this.ddram[(r === 1 ? 0x40 : 0) + pos]);
      }
      lines.push(line);
    }
    return lines;
  }

  /** Cursor cell (row, column on screen) or null if it is off screen or in CGRAM mode. */
  cursorCell(rows = 2, cols = 16): { row: number; col: number } | null {
    if (this.cgMode) return null;
    const row = this.twoLines && this.ac >= 0x40 ? 1 : 0;
    const lineLen = this.twoLines ? 40 : 80;
    const pos = this.ac - (row ? 0x40 : 0);
    const col = (((pos - this.shift) % lineLen) + lineLen) % lineLen;
    return row < rows && col < cols ? { row, col } : null;
  }

  /** 5×8 pixel rows of a character code (bit 4 = leftmost pixel). CGRAM for codes 0–15. */
  glyph(code: number, romA00: Uint8Array): number[] {
    if (code < 16) {
      const base = (code & 7) * 8;
      return Array.from(this.cgram.subarray(base, base + 8));
    }
    // ROM table stores bit 0 as the leftmost pixel: mirror to the CGRAM convention.
    return Array.from(romA00.subarray(code * 8, code * 8 + 8), (row) => {
      let m = 0;
      for (let b = 0; b < 5; b++) if (row & (1 << b)) m |= 1 << (4 - b);
      return m;
    });
  }
}
