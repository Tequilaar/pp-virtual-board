import type { Part } from '../src/circuit/parts';

/**
 * Basic setup of the reference board: power board on the top rails, jumpers to the
 * next rail pair, ATmega1284P in block 1 with pin 1 at column 16, 20 MHz crystal with 2 x 33 pF,
 * LED with 330 Ω on PD0. Hole positions are our own choice.
 *
 * Unrotated DIP at column 16: pin n (1–20) sits in 1F(15+n), pin n (21–40) in 1E(56−n).
 *   RESET 9 → 1F24, VCC 10 → 1F25, GND 11 → 1F26, XTAL2 12 → 1F27, XTAL1 13 → 1F28,
 *   PD0 14 → 1F29, PD3 17 → 1F32, PC3 25 → 1E31, GND 31 → 1E25, AVCC 30 → 1E26.
 */
export function basicSetup(): Part[] {
  return [
    { kind: 'power', id: 'power', railPair: 0 },
    { kind: 'wire', id: 'w+', a: 'R0+3', b: 'R1+3' },
    { kind: 'wire', id: 'w-', a: 'R0-4', b: 'R1-4' },
    { kind: 'mcu', id: 'u1', block: 1, col: 16 },
    { kind: 'wire', id: 'vcc', a: '1J25', b: 'R1+25' },
    { kind: 'wire', id: 'gnd11', a: '1J26', b: 'R1-26' },
    { kind: 'wire', id: 'avcc', a: '1A26', b: 'R0+26' },
    { kind: 'wire', id: 'gnd31', a: '1A25', b: 'R0-25' },
    { kind: 'crystal', id: 'q1', a: '1G27', b: '1G28', hz: 20_000_000 },
    { kind: 'capacitor', id: 'c1', a: '1H27', b: 'R1-27', farads: 33e-12 },
    { kind: 'capacitor', id: 'c2', a: '1H28', b: 'R1-28', farads: 33e-12 },
    { kind: 'resistor', id: 'r1', a: '1J29', b: '2A29', ohms: 330 },
    { kind: 'led', id: 'led1', anode: '2C29', cathode: '2C31', color: 'green' },
    { kind: 'wire', id: 'ledgnd', a: '2A31', b: 'R1-31' },
  ];
}


/** Push button on PD3: button between point a and GND, R1 10k a→Vcc; optionally R2 10k a→PD3 and 100 nF PD3→GND. */
export function buttonCircuit(debounce: boolean): Part[] {
  const parts: Part[] = [
    ...basicSetup(),
    { kind: 'resistor', id: 'R_pu', a: '3B32', b: 'R1+40', ohms: 10_000 },
    { kind: 'button', id: 'S1', a: '3C32', b: 'R1-41' },
  ];
  if (debounce) {
    parts.push(
      { kind: 'resistor', id: 'R_ser', a: '3A32', b: '1J32', ohms: 10_000 },
      { kind: 'capacitor', id: 'C_db', a: '1I32', b: 'R1-42', farads: 100e-9 },
    );
  } else {
    parts.push({ kind: 'wire', id: 'w_direct', a: '3A32', b: '1J32' });
  }
  return parts;
}

/** Encoder circuit: A/B pulled up by 10k, 10k series + 10 nF to PD2 (A) and PD1 (B), C to GND. */
export function encoderCircuit(caps = true): Part[] {
  const parts: Part[] = [
    ...basicSetup(),
    { kind: 'encoder', id: 'ENC', a: '3C50', c: '3C51', b: '3C52', sw1: '3H50', sw2: '3H52' },
    { kind: 'wire', id: 'w_c', a: '3D51', b: 'R1-54' },
    { kind: 'resistor', id: 'R1', a: '3B50', b: 'R1+50', ohms: 10_000 },
    { kind: 'resistor', id: 'R2', a: '3B52', b: 'R1+52', ohms: 10_000 },
    { kind: 'resistor', id: 'R3', a: '3A50', b: '1J31', ohms: 10_000 },
    { kind: 'resistor', id: 'R4', a: '3A52', b: '1J30', ohms: 10_000 },
  ];
  if (caps) {
    parts.push(
      { kind: 'capacitor', id: 'C_a', a: '1I31', b: 'R1-51', farads: 10e-9 },
      { kind: 'capacitor', id: 'C_b', a: '1I30', b: 'R1-53', farads: 10e-9 },
    );
  }
  return parts;
}

/**
 * LCD wiring: EA W162B-N3LW header in block 2 row J, pin 1 at column 16.
 * PB0 RS, PB1 RW, PB2 E, PB3 → VDD (the display is powered from PB3), PB4..PB7 → D4..D7, D0..D3 open,
 * VEE from a 100k/10k divider (≈ 0.45 V), backlight through 330 Ω.
 * MCU pins (chip at 1F16): PB0..PB7 → columns 16..23 of block 1.
 */
export function lcdCircuit(): Part[] {
  return [
    ...basicSetup(),
    { kind: 'lcd', id: 'LCD', block: 2, row: 'J', col: 16 },
    { kind: 'wire', id: 'l_vss', a: '2F16', b: 'R1-16' },
    { kind: 'wire', id: 'l_vdd', a: '1J19', b: '2F17' },
    { kind: 'resistor', id: 'R_vee_hi', a: '2G18', b: 'R1+18', ohms: 100_000 },
    { kind: 'resistor', id: 'R_vee_lo', a: '2H18', b: 'R1-19', ohms: 10_000 },
    { kind: 'wire', id: 'l_rs', a: '1J16', b: '2F19' },
    { kind: 'wire', id: 'l_rw', a: '1J17', b: '2F20' },
    { kind: 'wire', id: 'l_e', a: '1J18', b: '2F21' },
    { kind: 'wire', id: 'l_d4', a: '1J20', b: '2F26' },
    { kind: 'wire', id: 'l_d5', a: '1J21', b: '2F27' },
    { kind: 'wire', id: 'l_d6', a: '1J22', b: '2F28' },
    { kind: 'wire', id: 'l_d7', a: '1J23', b: '2F29' },
    { kind: 'resistor', id: 'R_bl', a: '2G30', b: 'R1+30', ohms: 330 },
    { kind: 'wire', id: 'l_bl', a: '2G31', b: 'R1-33' },
  ];
}

/**
 * Programming header on block 3, pins 1/2 at column 40 (odd pins row E, even row F),
 * wired to the chip at 1F16: PC2 → 1E32, PC3 → 1E31, PC4 → 1E30, PC5 → 1E29, RESET → 1F24.
 */
export function jtagCircuit(): Part[] {
  return [
    ...basicSetup(),
    { kind: 'jtag', id: 'JTAG', block: 3, col: 40 },
    { kind: 'wire', id: 'j_gnd1', a: '3A40', b: 'R1-40' },
    { kind: 'wire', id: 'j_tdi', a: '3J40', b: '1A29' },
    { kind: 'wire', id: 'j_rst', a: '3A42', b: '1J24' },
    { kind: 'wire', id: 'j_tms', a: '3J42', b: '1A31' },
    { kind: 'wire', id: 'j_vcc', a: '3A43', b: 'R1+43' },
    { kind: 'wire', id: 'j_tdo', a: '3J43', b: '1A30' },
    { kind: 'wire', id: 'j_gnd9', a: '3A44', b: 'R1-44' },
    { kind: 'wire', id: 'j_tck', a: '3J44', b: '1A32' },
  ];
}

export const without = (parts: Part[], ...ids: string[]) => parts.filter((p) => !ids.includes(p.id));
