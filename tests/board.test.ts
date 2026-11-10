/**
 * Stage 1 board checks: the chip runs only when wired like a real one, and the circuit behaves electrically.
 * Firmware is self-written (tests/firmware); the layout is tests/fixtures.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadFirmware } from '../src/chip/firmware';
import type { Part } from '../src/circuit/parts';
import { BoardSim } from '../src/sim/board-sim';
import { basicSetup, jtagCircuit, lcdCircuit, without } from './fixtures';
import { fwPath } from './helpers';

const fw = (name: string) => loadFirmware(new Uint8Array(readFileSync(fwPath(`${name}.elf`)))).flash;
const MS = 20_000;
const mA = (a: number) => a * 1000;
/** These tests check electrical behaviour; contact bounce has its own tests (tests/transient.test.ts). */
const mk = (parts: Part[], flash?: Uint8Array) => {
  // Start-up delay and bounce have their own tests.
  return new BoardSim(parts, flash, { bounce: false, startupCycles: 0 });
};

describe('basic setup', () => {
  it('runs the program and lights the LED on PD0 with about 8 mA', () => {
    const b = mk(basicSetup(), fw('led_pd0'));
    b.run(MS);
    expect(b.status.running).toBe(true);
    // (5 V − 2.1 V) / (330 Ω + 40 Ω driver + 15 Ω LED) ≈ 7.5 mA
    expect(mA(b.ledCurrent('led1'))).toBeGreaterThan(6.5);
    expect(mA(b.ledCurrent('led1'))).toBeLessThan(8.5);
    expect([...b.warnings.keys()]).toEqual([]);
  });

  it('LED inserted the wrong way round stays dark', () => {
    const parts = basicSetup().map((p): Part =>
      p.kind === 'led' ? { ...p, anode: p.cathode, cathode: p.anode } : p,
    );
    const b = mk(parts, fw('led_pd0'));
    b.run(MS);
    expect(b.status.running).toBe(true);
    expect(b.ledCurrent('led1')).toBe(0);
  });

  it('LED without series resistor: pin overloaded and LED destroyed', () => {
    const parts: Part[] = [...without(basicSetup(), 'r1'), { kind: 'wire', id: 'nores', a: '1J29', b: '2A29' }];
    const b = mk(parts, fw('led_pd0'));
    b.run(MS);
    expect(b.warnings.has('burnt:led1')).toBe(true);
    expect(b.ledCurrent('led1')).toBe(0); // destroyed LEDs stay dark
  });

  it('does not run without a crystal', () => {
    const b = mk(without(basicSetup(), 'q1'), fw('led_pd0'));
    b.run(MS);
    expect(b.status.powered).toBe(true);
    expect(b.status.running).toBe(false);
    expect(b.warnings.has('no-crystal')).toBe(true);
    expect(b.ledCurrent('led1')).toBe(0);
  });

  it('does not run without VCC or without GND', () => {
    for (const id of ['vcc', 'gnd11']) {
      const parts = id === 'gnd11' ? without(basicSetup(), 'gnd11', 'gnd31') : without(basicSetup(), id);
      const b = mk(parts, fw('led_pd0'));
      b.run(MS);
      expect(b.status.running).toBe(false);
    }
  });

  it('warns when AVCC is not connected', () => {
    const b = mk(without(basicSetup(), 'avcc'), fw('led_pd0'));
    b.run(MS);
    expect(b.warnings.has('no-avcc')).toBe(true);
  });

  it('switch S off stops the chip; switching on restarts the program', () => {
    const b = mk(basicSetup(), fw('led_pd0'));
    b.run(MS);
    b.setSwitch(false);
    expect(b.status.running).toBe(false);
    expect(b.ledCurrent('led1')).toBe(0);
    b.setSwitch(true);
    b.run(MS);
    expect(b.status.running).toBe(true);
    expect(b.ledCurrent('led1')).toBeGreaterThan(0.005);
  });

  it('a wire from + to − blows the fuse', () => {
    const b = mk([...basicSetup(), { kind: 'wire', id: 'short', a: 'R1+40', b: 'R1-40' }], fw('led_pd0'));
    b.run(MS);
    expect(b.status.fuseBlown).toBe(true);
    expect(b.status.running).toBe(false);
    expect(b.warnings.has('fuse')).toBe(true);
  });

  it('a wrong hole name is reported', () => {
    const b = mk([...basicSetup(), { kind: 'wire', id: 'bad', a: '1K99', b: 'R1-40' }]);
    expect([...b.warnings.keys()].some((k) => k.startsWith('layout:'))).toBe(true);
  });
});

describe('inputs', () => {
  const withButton = (pullup: boolean): Part[] => [
    ...basicSetup(),
    { kind: 'button', id: 's1', a: '1I32', b: 'R1-33' },
    ...(pullup ? [{ kind: 'resistor', id: 'rpu', a: '1H32', b: 'R1+32', ohms: 10_000 } as Part] : []),
  ];

  it('button with external 10 kΩ pull-up on PD3 is read correctly', () => {
    const b = mk(withButton(true), fw('button_follow'));
    b.run(MS);
    expect(b.ledCurrent('led1')).toBe(0);
    b.setButton('s1', true);
    b.run(MS);
    expect(b.ledCurrent('led1')).toBeGreaterThan(0.005);
    b.setButton('s1', false);
    b.run(MS);
    expect(b.ledCurrent('led1')).toBe(0);
  });

  it('without any pull-up the open button leaves PD3 floating, with a warning', () => {
    const b = mk(withButton(false), fw('button_follow'));
    b.run(MS);
    expect(b.warnings.has('floating:PD3')).toBe(true);
    b.setButton('s1', true);
    b.run(MS);
    expect(b.warnings.has('floating:PD3')).toBe(false);
  });
});

describe('JTAG pins PC2–PC5 (the board is programmed over JTAG)', () => {
  const pc3Led = (): Part[] => [
    ...basicSetup(),
    { kind: 'resistor', id: 'r3', a: '1A31', b: '2A40', ohms: 330 },
    { kind: 'led', id: 'led3', anode: '2C40', cathode: '2C42', color: 'red' },
    { kind: 'wire', id: 'led3gnd', a: '2A42', b: 'R1-42' },
  ];

  it('PC3 does not drive an LED while JTAG is enabled', () => {
    const b = mk(pc3Led(), fw('pc3_led'));
    b.run(MS);
    expect(b.ledCurrent('led3')).toBe(0);
  });

  it('PC3 works after the program disables JTAG (MCUCR.JTD)', () => {
    const b = mk(pc3Led(), fw('pc3_led_nojtag'));
    b.run(MS);
    expect(b.ledCurrent('led3')).toBeGreaterThan(0.005);
  });
});

describe('perceived LED brightness', () => {
  it('a 1 kHz 50 % square wave averages to half the steady LED current', () => {
    const steady = mk(basicSetup(), fw('led_pd0'));
    steady.run(MS);
    const full = steady.ledCurrent('led1');
    const b = mk(basicSetup(), fw('square_pd0'));
    b.run(5 * MS);
    b.takeLedAverage();
    b.run(100 * MS);
    const avg = b.takeLedAverage().get('led1')!;
    expect(avg / full).toBeGreaterThan(0.48);
    expect(avg / full).toBeLessThan(0.52);
  });
});

describe('start-up delay', () => {
  it('the program starts 16K CK + 14 CK + 65 ms after power-on (crystal, SUT = 11)', () => {
    const b = new BoardSim(basicSetup(), fw('led_pd0'));
    b.bounce = false;
    b.run(60 * MS);
    expect(b.status.starting).toBe(true);
    expect(b.ledCurrent('led1')).toBe(0);
    b.run(10 * MS);
    expect(b.status.running).toBe(true);
    expect(b.ledCurrent('led1')).toBeGreaterThan(0.005);
  });
});

describe('JTAG programming header', () => {
  it('correct wiring and power: the programmer reaches the chip', () => {
    const b = mk(jtagCircuit(), fw('led_pd0'));
    b.run(MS);
    expect(b.jtagCheck()).toEqual([]);
    expect(b.status.running).toBe(true); // the header does not disturb the running chip
  });
  it('a missing TCK wire and a swapped TMS/TDO are found', () => {
    const parts = without(jtagCircuit(), 'j_tck').map((p): Part =>
      p.id === 'j_tms' ? { ...p, b: '1A30' } as Part : p.id === 'j_tdo' ? { ...p, b: '1A31' } as Part : p,
    );
    const b = mk(parts, fw('led_pd0'));
    b.run(MS);
    expect(b.jtagCheck()).toEqual(['TCK-PC2', 'TMS-PC3', 'TDO-PC4']);
  });
  it('without target power programming fails', () => {
    const b = mk(jtagCircuit(), fw('led_pd0'));
    b.setSwitch(false);
    expect(b.jtagCheck()).toContain('power');
  });
  it('no header: null', () => {
    expect(mk(basicSetup()).jtagCheck()).toBeNull();
  });
});

describe('floating-input notes', () => {
  it('pins that only lead to an LED, the LCD or a servo give no note when the program leaves them as inputs', () => {
    const parts: Part[] = [...lcdCircuit(), { kind: 'servo', id: 'SV', gnd: 'R1-56', vcc: 'R1+56', signal: '1H34' }];
    const b = mk(parts, fw('pc3_led')); // drives only PC3; PB*, PD0, PD5 stay inputs
    b.run(50 * MS);
    expect([...b.warnings.keys()].filter((k) => k.startsWith('floating:'))).toEqual([]);
  });
});
