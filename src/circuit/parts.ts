/**
 * Parts that can be placed on the board. A part is plain data (so a wiring file can store it);
 * its behaviour lives in the simulator.
 */

export type Part =
  | { kind: 'wire'; id: string; a: string; b: string; color?: string }
  | { kind: 'resistor'; id: string; a: string; b: string; ohms: number }
  | { kind: 'led'; id: string; anode: string; cathode: string; color: 'red' | 'green' | 'yellow' | 'white' }
  | { kind: 'button'; id: string; a: string; b: string }
  | { kind: 'capacitor'; id: string; a: string; b: string; farads: number }
  | { kind: 'crystal'; id: string; a: string; b: string; hz: number }
  /**
   * Alps EC12E24244 (STEC12E08) rotary encoder: contacts A–C and B–C (24 pulses per turn, one per
   * detent), plus a push switch between sw1 and sw2.
   */
  | { kind: 'encoder'; id: string; a: string; c: string; b: string; sw1: string; sw2: string }
  /** Hobby servo on its 3-pin cable: GND (brown), +5 V (red), signal (orange). */
  | { kind: 'servo'; id: string; gnd: string; vcc: string; signal: string }
  /**
   * EA W162B-N3LW 2×16 character LCD (HD44780) with its 16-pin header in one row of a terminal block,
   * pin 1 at `col`: 1 VSS, 2 VDD, 3 VEE, 4 RS, 5 R/W, 6 E, 7–14 D0–D7, 15 LED+, 16 LED−.
   */
  | { kind: 'lcd'; id: string; block: number; row: string; col: number }
  /**
   * 10-pin JTAG programming header of the reference board, straddling the gap of `block` like a DIP:
   * odd pins in row E, even pins in row F, pins 1/2 at column `col`.
   * 1 GND, 2 TDI, 3 n.c., 4 n.c., 5 RST, 6 TMS, 7 VCC, 8 TDO, 9 GND, 10 TCK.
   */
  /**
   * With `row`: the programming adapter's flat cable ends instead in an 8-pin single-row plug in that row of `block`,
   * positions `col` … `col + 7`: GND, VCC, –, –, TDI, TDO, TMS, TCK (the two middle positions have no contact),
   * plus a single RST lead plugged into hole `rst`.
   */
  | { kind: 'jtag'; id: string; block: number; col: number; row?: string; rst?: string }
  /**
   * USB power board: plugs onto the top rail pair (R0) with switch S and fuse F.
   * `large`: the lab board, which also reaches down onto rail pair 1 (feeding both pairs) and covers columns 1–11 of block 1.
   */
  | { kind: 'power'; id: string; railPair: number; large?: boolean }
  /** ATmega1284P in DIP-40, straddling the gap of `block` with pin 1 at column `col`. */
  /** `bridge`: the chip spans the rail pair below `block` (rows J of `block` / A of `block + 1`) instead of the centre gap. */
  | { kind: 'mcu'; id: string; block: number; col: number; rotated?: boolean; bridge?: boolean };

/** Pin names of the ATmega1284P in the 40-pin PDIP package (datasheet pin table). */
export const DIP40_PINS: readonly string[] = [
  'PB0', 'PB1', 'PB2', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'RESET', 'VCC',
  'GND', 'XTAL2', 'XTAL1', 'PD0', 'PD1', 'PD2', 'PD3', 'PD4', 'PD5', 'PD6',
  'PD7', 'PC0', 'PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7', 'AVCC',
  'GND', 'AREF', 'PA7', 'PA6', 'PA5', 'PA4', 'PA3', 'PA2', 'PA1', 'PA0',
];

/** Forward voltage at nominal current, by LED colour (typical 5 mm indicator LEDs). */
export const LED_VF: Record<'red' | 'green' | 'yellow' | 'white', number> = { red: 1.9, green: 2.1, yellow: 2.0, white: 3.2 };

/** Holes a part's legs occupy. */
export function partLegs(p: Part): Record<string, string> {
  switch (p.kind) {
    case 'led':
      return { anode: p.anode, cathode: p.cathode };
    case 'encoder':
      return { a: p.a, c: p.c, b: p.b, sw1: p.sw1, sw2: p.sw2 };
    case 'servo':
      return { gnd: p.gnd, vcc: p.vcc, signal: p.signal };
    case 'lcd':
      return Object.fromEntries(LCD_PINS.map((name, i) => [name, `${p.block}${p.row}${p.col + i}`]));
    case 'jtag':
      if (p.row) {
        const at = (i: number) => `${p.block}${p.row}${p.col + i}`;
        return { p1: at(0), p7: at(1), p2: at(4), p8: at(5), p6: at(6), p10: at(7), p5: p.rst ?? '' };
      }
      return Object.fromEntries(JTAG_PINS.map((name, i) => [`p${i + 1}`, `${p.block}${i % 2 === 0 ? 'E' : 'F'}${p.col + Math.floor(i / 2)}`]));
    case 'power':
    case 'mcu':
      return {};
    default:
      return { a: p.a, b: p.b };
  }
}

/** LCD header pin names in order (pin 1 … 16). */
export const LCD_PINS = ['VSS', 'VDD', 'VEE', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'LED+', 'LED-'] as const;

/** Columns the plug body covers without a contact (positions 3 and 4). */
export const JTAG_PLUG_GAPS = [2, 3] as const;
/** Plug contact names by position (0-based offset from `col`); null = no contact. */
export const JTAG_PLUG_PINS = ['GND', 'VCC', null, null, 'TDI', 'TDO', 'TMS', 'TCK'] as const;
/** Columns 1 … this of block 1 lie under the large power board. */
export const LARGE_POWER_COLS = 11;

/** Programming header, pin 1 … 10. */
export const JTAG_PINS = ['GND', 'TDI', 'NC', 'NC', 'RST', 'TMS', 'VCC', 'TDO', 'GND', 'TCK'] as const;
