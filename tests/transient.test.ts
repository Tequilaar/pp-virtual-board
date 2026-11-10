/**
 * Stage 2: capacitors, contact bounce, rotary encoder and servo — on the basic setup (tests/fixtures.ts).
 * Circuit values: debounce 10k/10k/100 nF, encoder 10k pull-ups with 10k/10 nF filters, servo 0.5–2.5 ms.
 * Pins with the chip at 1F16: PD1 → col 30, PD2 → 31, PD3 → 32, PD4 → 33, PD5 → 34 (rows F–J of block 1).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadFirmware } from '../src/chip/firmware';
import type { Part } from '../src/circuit/parts';
import { BoardSim, VT_RISE } from '../src/sim/board-sim';
import { buttonCircuit, encoderCircuit, basicSetup } from './fixtures';
import { fwPath } from './helpers';

const fw = (name: string) => loadFirmware(new Uint8Array(readFileSync(fwPath(`${name}.elf`)))).flash;
const MS = 20_000;
const porta = (b: BoardSim) => b.mcu!.cpu.data[0x22];

describe('RC debounce circuit', () => {
  it('after release PD3 rises with tau = (10k + 10k)·100 nF = 2 ms and crosses the input threshold at ~1.47 ms', () => {
    const b = new BoardSim(buttonCircuit(true), fw('edge_count'));
    b.bounce = false;
    b.run(20 * MS);
    b.setButton('S1', true);
    b.run(20 * MS); // discharged
    expect(b.netVoltage('1F32')!).toBeLessThan(0.05);
    b.setButton('S1', false);
    const t0 = b.cycles;
    let crossed = 0;
    while (b.cycles - t0 < 10 * MS) {
      b.run(20); // 1 µs
      if (!crossed && b.netVoltage('1F32')! >= VT_RISE) crossed = b.cycles - t0;
    }
    const expected = -2e-3 * Math.log(1 - VT_RISE / 5); // 1.47 ms
    expect(crossed / 20e6).toBeGreaterThan(expected * 0.95);
    expect(crossed / 20e6).toBeLessThan(expected * 1.05);
    // Within 2 mV of 5 V after 2 ms · ln(5 V / 2 mV) ≈ 15.6 ms; then the simulation stops stepping.
    b.run(10 * MS);
    expect(b.settling).toBe(false);
  });

  it('without debounce a bouncing button triggers INT1 several times per press', () => {
    let extra = 0;
    const b = new BoardSim(buttonCircuit(false), fw('edge_count'));
    b.run(100 * MS);
    for (let i = 0; i < 10; i++) {
      b.setButton('S1', true);
      b.run(20 * MS);
      b.setButton('S1', false);
      b.run(20 * MS);
    }
    extra = porta(b) - 10;
    expect(extra).toBeGreaterThan(5);
  });

  it('with the RC debounce each press triggers INT1 exactly once', () => {
    const b = new BoardSim(buttonCircuit(true), fw('edge_count'));
    b.run(100 * MS);
    for (let i = 0; i < 10; i++) {
      b.setButton('S1', true);
      b.run(30 * MS);
      b.setButton('S1', false);
      b.run(30 * MS);
    }
    expect(porta(b)).toBe(10);
  });
});

describe('rotary encoder (datasheet: 24 pulses/turn, A open at detents)', () => {
  it('clockwise detents count up, counter-clockwise count down (decoding on rising A)', () => {
    const b = new BoardSim(encoderCircuit(), fw('enc_count'));
    b.bounce = false;
    b.run(100 * MS);
    for (let i = 0; i < 5; i++) b.turnEncoder('ENC', 1);
    b.run(200 * MS);
    expect(porta(b)).toBe(5);
    for (let i = 0; i < 3; i++) b.turnEncoder('ENC', -1);
    b.run(150 * MS);
    expect(porta(b)).toBe(2);
    expect(b.encoderDetents.get('ENC')).toBe(2);
  });

  it('with bounce enabled the 10k/10 nF filters keep the count exact over 24 detents (one turn)', () => {
    const b = new BoardSim(encoderCircuit(), fw('enc_count'));
    b.run(100 * MS);
    for (let i = 0; i < 24; i++) b.turnEncoder('ENC', 1);
    b.run(800 * MS);
    expect(porta(b)).toBe(24);
  });

  it('A is open at every detent', () => {
    const b = new BoardSim(encoderCircuit(), fw('enc_count'));
    b.bounce = false;
    b.turnEncoder('ENC', 1);
    b.run(40 * MS);
    expect(b.circuit.closed.has('ENC:A')).toBe(false);
  });

  it('the push switch closes sw1–sw2', () => {
    const b = new BoardSim(encoderCircuit(), fw('enc_count'));
    b.bounce = false;
    b.setEncoderSwitch('ENC', true);
    expect(b.circuit.closed.has('ENC:SW')).toBe(true);
  });
});

describe('servo (2.5 ms = 0°, 1.5 ms = 90°, 0.5 ms = 180°, 20 ms period)', () => {
  const servos = (): Part[] => [
    ...basicSetup(),
    { kind: 'servo', id: 'SA', gnd: 'R1-56', vcc: 'R1+56', signal: '1H34' }, // PD5 / OC1A
    { kind: 'servo', id: 'SB', gnd: 'R1-58', vcc: 'R1+58', signal: '1H33' }, // PD4 / OC1B
  ];

  it('measures 1.5 ms and 0.5 ms pulses and turns to 90° and 180°', () => {
    const b = new BoardSim(servos(), fw('servo_pwm'));
    b.run(500 * MS);
    const a = b.servos.get('SA')!;
    const s = b.servos.get('SB')!;
    expect(a.lastPulseUs).toBeCloseTo(1500, 0);
    expect(s.lastPulseUs).toBeCloseTo(500, 0);
    expect(a.angle).toBeCloseTo(90, 0);
    expect(s.angle).toBeCloseTo(180, 0);
  });

  it('moves at a finite speed (600°/s): 90° → 180° takes about 150 ms', () => {
    const b = new BoardSim(servos(), fw('servo_pwm'));
    b.run(120 * MS); // 66 ms start-up + 54 ms of pulses
    expect(b.servos.get('SB')!.angle).toBeLessThan(140);
  });

  it('warns about pulses outside 500–2500 µs and stops at the end stop', () => {
    const b = new BoardSim(servos(), fw('servo_wide'));
    b.run(500 * MS);
    expect(b.servos.get('SA')!.lastPulseUs).toBeCloseTo(3000, 0);
    expect(b.servos.get('SA')!.angle).toBeCloseTo(0, 0);
    expect(b.warnings.has('servo-range:SA')).toBe(true);
  });

  it('a servo without supply does not move and is reported', () => {
    const parts = servos().map((p): Part => (p.kind === 'servo' && p.id === 'SB' ? { ...p, vcc: '3J58' } : p));
    const b = new BoardSim(parts, fw('servo_pwm'));
    b.run(500 * MS);
    expect(b.servos.get('SB')!.angle).toBe(90);
    expect(b.warnings.has('servo-power:SB')).toBe(true);
  });
});
