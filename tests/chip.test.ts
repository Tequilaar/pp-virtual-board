/**
 * Stage 1 chip checks with self-written minimal firmware (tests/firmware/*.c).
 * Expected values come from the ATmega1284P datasheet arithmetic, written next to each test.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PinState } from 'avr8js';
import { loadFirmware } from '../src/chip/firmware';
import { Mcu1284P } from '../src/chip/mcu';
import { boot, fwPath, intervals, recordEdges } from './helpers';

const MS = 20_000; // cycles per millisecond at 20 MHz

describe('firmware loading', () => {
  it('reads the device name from an avr-gcc ELF', () => {
    const fw = loadFirmware(new Uint8Array(readFileSync(fwPath('gpio_delay.elf'))));
    expect(fw.device).toBe('atmega1284p');
    expect(fw.warnings).toEqual([]);
  });

  it('warns when the program was built for another MCU', () => {
    const fw = loadFirmware(new Uint8Array(readFileSync(fwPath('wrong_mcu.elf'))));
    expect(fw.device).toBe('atmega328p');
    expect(fw.warnings[0]).toMatch(/atmega328p/);
  });

  it('loads identical flash from .elf and .hex', () => {
    for (const name of ['gpio_delay', 'timer_vectors', 'memory']) {
      const elf = loadFirmware(new Uint8Array(readFileSync(fwPath(`${name}.elf`))));
      const hex = loadFirmware(new Uint8Array(readFileSync(fwPath(`${name}.hex`))));
      expect(hex.flash).toEqual(elf.flash);
    }
  });

  it('rejects files that are neither ELF nor HEX', () => {
    expect(() => loadFirmware(new TextEncoder().encode('int main(){}'))).toThrow(/Unrecognised/);
  });
});

describe('GPIO and timing', () => {
  it('_delay_ms(1) toggles PB0 every 1 ms of simulated time', () => {
    const mcu = boot('gpio_delay');
    const edges = recordEdges(mcu, 'B', 0);
    mcu.run(12 * MS);
    const iv = intervals(edges);
    expect(iv.length).toBeGreaterThanOrEqual(10);
    // _delay_ms(1) burns exactly 20000 cycles; the loop adds a few cycles of overhead.
    for (const d of iv) expect(d).toBeGreaterThanOrEqual(MS);
    for (const d of iv) expect(d).toBeLessThan(MS + 20);
    expect(mcu.ports.B.pinState(0)).not.toBe(PinState.Input);
  });
});

describe('timer interrupt vectors (ATmega1284P numbering)', () => {
  const mcu = boot('timer_vectors');
  const pa = [0, 1, 2, 3].map((p) => recordEdges(mcu, 'A', p));
  mcu.run(100 * MS);
  /**
   * An ISR toggles the pin, so each edge carries interrupt latency: the CPU finishes the current
   * instruction first, and the four ISRs here delay each other. Real hardware behaves the same way.
   * So we check (1) no drift: the average period is exact, and (2) bounded jitter per interval.
   */
  const expectPeriod = (p: number, period: number, maxJitter: number) => {
    const e = pa[p].slice(2);
    const n = e.length - 1;
    expect(n).toBeGreaterThan(50);
    expect(Math.abs(e[n].cycle - e[0].cycle - n * period)).toBeLessThanOrEqual(maxJitter);
    for (const d of intervals(e)) expect(Math.abs(d - period)).toBeLessThanOrEqual(maxJitter);
  };

  it('Timer1 CTC compare A (vector 13): every 20000 cycles', () => {
    expectPeriod(0, 20_000, 100);
  });
  it('Timer0 overflow (vector 18): every 2048 cycles', () => {
    expectPeriod(1, 2_048, 100);
  });
  it('Timer2 CTC compare A (vector 9), prescaler 32: every 3200 cycles', () => {
    expectPeriod(2, 3_200, 100);
  });
  it('Timer3 CTC compare A (vector 32), 1284P-only timer: every 1000 cycles', () => {
    expectPeriod(3, 1_000, 100);
  });
});

describe('Timer1 overflow and the global interrupt flag', () => {
  it('overflow (vector 15) fires every 65536 cycles', () => {
    const mcu = boot('timer1_ovf');
    const edges = recordEdges(mcu, 'A', 0);
    mcu.run(20 * 65_536);
    const e = edges.slice(1);
    const n = e.length - 1;
    // Only the 1-cycle entry latency of the 2-cycle idle loop (rjmp) remains: 65535 or 65537.
    expect(Math.abs(e[n].cycle - e[0].cycle - n * 65_536)).toBeLessThanOrEqual(1);
    for (const d of intervals(e)) expect(Math.abs(d - 65_536)).toBeLessThanOrEqual(1);
  });
  it('without sei() the ISR never runs', () => {
    const mcu = boot('no_sei');
    const edges = recordEdges(mcu, 'A', 0);
    mcu.run(6 * 65_536);
    expect(edges).toEqual([]);
  });
});

describe('external and pin-change interrupts', () => {
  const setup = () => {
    const mcu = boot('extint');
    // Inputs idle high, as with the pull-ups on a real board.
    mcu.ports.D.setPin(2, true);
    mcu.ports.D.setPin(3, true);
    mcu.ports.D.setPin(6, true);
    mcu.ports.B.setPin(2, true);
    mcu.run(MS);
    const toggles = [0, 1, 2, 3].map((p) => recordEdges(mcu, 'A', p));
    const pulse = (port: 'B' | 'D', pin: number) => {
      mcu.ports[port].setPin(pin, false);
      mcu.run(200);
      mcu.ports[port].setPin(pin, true);
      mcu.run(200);
    };
    return { mcu, toggles, pulse };
  };

  it('INT0 on PD2 fires once per falling edge', () => {
    const { toggles, pulse } = setup();
    for (let i = 0; i < 3; i++) pulse('D', 2);
    expect(toggles[0].length).toBe(3);
    expect(toggles[1].length + toggles[2].length).toBe(0);
  });
  it('INT1 on PD3 fires once per rising edge', () => {
    const { toggles, pulse } = setup();
    for (let i = 0; i < 2; i++) pulse('D', 3);
    expect(toggles[1].length).toBe(2);
    expect(toggles[0].length + toggles[2].length).toBe(0);
  });
  it('INT2 on PB2 (1284P vector 3) fires once per falling edge', () => {
    const { toggles, pulse } = setup();
    for (let i = 0; i < 4; i++) pulse('B', 2);
    expect(toggles[2].length).toBe(4);
    expect(toggles[0].length + toggles[1].length).toBe(0);
  });
  it('PCINT3 (PD6) fires on both edges', () => {
    const { toggles, pulse } = setup();
    pulse('D', 6);
    expect(toggles[3].length).toBe(2);
  });
});

describe('PWM output pins (OC1A = PD5, OC1B = PD4)', () => {
  const mcu = boot('pwm');
  const a = recordEdges(mcu, 'D', 5);
  const b = recordEdges(mcu, 'D', 4);
  mcu.run(5 * 400_000);
  const measure = (edges: { cycle: number; high: boolean }[]) => {
    const rises = edges.filter((e) => e.high).map((e) => e.cycle);
    const highs = edges
      .map((e, i) => (e.high && edges[i + 1] ? edges[i + 1].cycle - e.cycle : null))
      .filter((x): x is number => x !== null);
    return { periods: intervals(rises.map((cycle) => ({ cycle }))), highs };
  };

  it('PD5 (OC1A) and PD4 (OC1B) carry the PWM: period 400000 cycles = 20 ms', () => {
    expect(new Set(measure(a).periods)).toEqual(new Set([400_000]));
    expect(new Set(measure(b).periods)).toEqual(new Set([400_000]));
    // Nothing on the old, wrong SimulIDE mapping (OC1A on PD4 would show 30000 here).
    expect(measure(b).highs.every((h) => h < 20_000)).toBe(true);
  });

  // Datasheet: fast PWM high time = (OCR + 1) timer clocks. avr8js alone gives OCR clocks; corrected in mcu.ts.
  it('PD5 (OC1A): high (OCR1A+1)*8 = 30000 cycles = 1.5 ms', () => {
    expect(new Set(measure(a).highs)).toEqual(new Set([30_000]));
  });
  it('PD4 (OC1B): high (OCR1B+1)*8 = 10000 cycles = 0.5 ms', () => {
    const m = measure(b);
    expect(new Set(m.highs)).toEqual(new Set([10_000]));
  });
});

describe('memory', () => {
  it('runs a program using 15 KB of SRAM and 100 levels of recursion', () => {
    const mcu = boot('memory');
    const done = mcu.runUntil(() => mcu.cpu.data[0x25] === 0xa5, 5_000_000);
    expect(done).toBe(true);
    let sum = 0;
    for (let i = 0; i < 15_000; i++) sum += (i * 7) & 0xff;
    sum = (sum + 5050) & 0xffff;
    expect(mcu.cpu.data[0x22]).toBe(sum & 0xff); // PORTA
    expect(mcu.cpu.data[0x28]).toBe(sum >> 8); // PORTC
  });

  it('starts the stack at RAMEND 0x40FF', () => {
    const mcu = new Mcu1284P(new Uint8Array([0xff, 0xcf])); // rjmp .-2
    expect(mcu.cpu.SP).toBe(0x40ff);
  });
});

describe('fast PWM extremes (datasheet: OCR = BOTTOM gives a spike, OCR = TOP constant high)', () => {
  it('OCR1A = 0: one timer clock (8 cycles) high per 20 ms period', () => {
    const mcu = boot('pwm_edges');
    const a = recordEdges(mcu, 'D', 5);
    mcu.run(4 * 400_000);
    const highs = a.map((e, i) => (e.high && a[i + 1] ? a[i + 1].cycle - e.cycle : null)).filter((x) => x !== null);
    expect(highs.length).toBeGreaterThanOrEqual(3);
    expect(new Set(highs)).toEqual(new Set([8]));
  });
  it('OCR1B = TOP: PD4 stays high', () => {
    const mcu = boot('pwm_edges');
    // OC1B starts low and is first set at the first BOTTOM (end of period 1), then never cleared.
    mcu.run(500_000);
    const b = recordEdges(mcu, 'D', 4);
    mcu.run(4 * 400_000);
    expect(b).toEqual([]);
    expect(mcu.cpu.data[0x29] & (1 << 4)).toBeTruthy(); // PIND4 high
  });
});
