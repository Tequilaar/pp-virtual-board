/**
 * Stage 3: HD44780 LCD on the reference wiring, driven by a self-written datasheet driver (tests/firmware/lcd_hello.c).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadFirmware } from '../src/chip/firmware';
import type { Part } from '../src/circuit/parts';
import { BoardSim } from '../src/sim/board-sim';
import { lcdCircuit } from './fixtures';
import { fwPath } from './helpers';

const fw = (name: string) => loadFirmware(new Uint8Array(readFileSync(fwPath(`${name}.elf`)))).flash;
const MS = 20_000;
const done = (b: BoardSim) => b.mcu?.cpu.data[0x22] === 0xa5;

function runHello(parts: Part[] = lcdCircuit(), prog = 'lcd_hello') {
  const b = new BoardSim(parts, fw(prog));
  b.run(400 * MS);
  return b;
}

describe('HD44780 on the reference wiring', () => {
  it('shows "Hello world!" with a custom character and the second line, polling the busy flag', () => {
    const b = runHello();
    expect(done(b)).toBe(true);
    const v = b.lcdView('LCD')!;
    expect(v.powered).toBe(true);
    expect(v.displayOn).toBe(true);
    expect(v.text[0]).toBe('Hello world!   ·');
    expect(v.text[1]).toBe('0123456789ABCDEF');
    expect(v.lines[0][15]).toBe(0); // CGRAM character 0
    expect(v.controller.glyph(0, new Uint8Array(0))).toEqual([0x04, 0x0e, 0x15, 0x04, 0x04, 0x04, 0x04, 0x00]);
    expect(b.mcu!.cpu.data[0x28]).toBeGreaterThan(10); // the busy flag was seen set many times
    expect([...b.warnings.keys()].filter((k) => k.startsWith('lcd-'))).toEqual([]);
  });

  it('full contrast with VEE ≈ 0.45 V; no contrast without VEE', () => {
    expect(runHello().lcdView('LCD')!.contrast).toBe(1);
    const noVee = runHello(lcdCircuit().filter((p) => !p.id.startsWith('R_vee')));
    expect(noVee.lcdView('LCD')!.contrast).toBe(0);
    expect(noVee.lcdView('LCD')!.text[0]).toBe('Hello world!   ·'); // controller works, nothing visible
  });

  it('backlight: (5 V − 3.2 V) / 330 Ω ≈ 5.5 mA', () => {
    const bl = runHello().lcdView('LCD')!.backlight;
    expect(bl * 1000).toBeGreaterThan(4.5);
    expect(bl * 1000).toBeLessThan(6);
  });

  it('without busy-flag checks characters get lost and the display reports it', () => {
    const b = runHello(lcdCircuit(), 'lcd_nobusy');
    expect(done(b)).toBe(true);
    expect(b.lcdView('LCD')!.text[1]).not.toBe('0123456789ABCDEF');
    expect(b.warnings.has('lcd-write-while-busy:LCD')).toBe(true);
  });

  it('too short E pulses still work (typical part) but are reported against the datasheet', () => {
    const b = runHello(lcdCircuit(), 'lcd_short_e');
    expect(b.warnings.has('lcd-enable-high:LCD')).toBe(true);
  });

  it('without the PB3 supply wire the display stays dark', () => {
    const b = runHello(lcdCircuit().filter((p) => p.id !== 'l_vdd'));
    expect(b.lcdView('LCD')!.powered).toBe(false);
    expect(b.lcdView('LCD')!.contrast).toBe(0);
  });

  it('D7 not connected: the floating line is pulled up inside the display, BF reads 1, the program hangs', () => {
    const b = runHello(lcdCircuit().filter((p) => p.id !== 'l_d7'));
    expect(done(b)).toBe(false);
  });
});

describe('4-bit nibble sequencing (unverified detail, see NibbleMode in src/lcd/hd44780.ts)', () => {
  // Under 'hold-while-busy' even this correct driver slips (BF clearing between the two pulses of a read).
  // Correct drivers work on real displays, so real controllers are almost certainly not 'hold-while-busy'.
  it('a datasheet-correct driver works under both remaining candidate behaviours', () => {
    for (const mode of ['rw-change-resets', 'always-toggle'] as const) {
      const b = new BoardSim(lcdCircuit(), fw('lcd_hello'));
      b.run(MS);
      b.lcds.get('LCD')!.nibbleMode = mode;
      b.run(400 * MS);
      expect(b.lcdView('LCD')!.text[1], mode).toBe('0123456789ABCDEF');
    }
  });

  it('tools/lcd-nibble-probe reports which behaviour the controller has', () => {
    const expected = { 'rw-change-resets': 'RW-RESET', 'hold-while-busy': 'HOLD-BUSY', 'always-toggle': 'TOGGLE' };
    for (const [mode, verdict] of Object.entries(expected)) {
      const b = new BoardSim(lcdCircuit(), fw('lcd_probe'));
      b.run(MS);
      // The probe's LCD is created when the display is powered; set the mode on every new controller.
      const set = () => b.lcds.forEach((l) => (l.nibbleMode = mode as keyof typeof expected));
      for (let t = 0; t < 600; t++) {
        set();
        b.run(MS);
      }
      expect(b.lcdView('LCD')!.text[0], mode).toMatch(new RegExp(`^MODE ${verdict}\\b`));
    }
  });
});
