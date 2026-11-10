/**
 * ATmega1284P peripheral configuration for avr8js.
 *
 * Every address and vector number here was taken from avr-libc's
 * <avr/iom1284p.h> and cross-checked against the ATmega1284P datasheet
 * (pin table). avr8js expects data-space addresses (I/O address + 0x20)
 * and interrupt vectors as word addresses (vector number * 2, because each
 * ATmega1284P vector entry is a 4-byte JMP).
 */
import {
  type AVRExternalInterrupt,
  type AVRPinChangeInterrupt,
  type AVRPortConfig,
  type AVRTimerConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js';

export const ATMEGA1284P = {
  name: 'ATmega1284P',
  /** Flash size in bytes (FLASHEND 0x1FFFF). */
  flashBytes: 0x20000,
  /** Internal SRAM in bytes (0x0100..0x40FF). */
  sramBytes: 0x4000,
  /** EEPROM in bytes (E2END 0xFFF). */
  eepromBytes: 0x1000,
  /** The reference board runs at 20 MHz. */
  defaultFrequency: 20_000_000,
} as const;

/** Vector number (as in avr-libc's *_vect_num) to avr8js word address. */
const vec = (vectorNumber: number) => vectorNumber * 2;

// ---------------------------------------------------------------- interrupts

const EICRA = 0x69;
const EIMSK = 0x3d;
const EIFR = 0x3c;

export const INT0: AVRExternalInterrupt = { EICR: EICRA, EIMSK, EIFR, index: 0, iscOffset: 0, interrupt: vec(1) };
export const INT1: AVRExternalInterrupt = { EICR: EICRA, EIMSK, EIFR, index: 1, iscOffset: 2, interrupt: vec(2) };
export const INT2: AVRExternalInterrupt = { EICR: EICRA, EIMSK, EIFR, index: 2, iscOffset: 4, interrupt: vec(3) };

const PCICR = 0x68;
const PCIFR = 0x3b;

const pcint = (n: 0 | 1 | 2 | 3, PCMSK: number): AVRPinChangeInterrupt => ({
  PCIE: n,
  PCICR,
  PCIFR,
  PCMSK,
  pinChangeInterrupt: vec(4 + n),
  mask: 0xff,
  offset: 0,
});

export const PCINT0 = pcint(0, 0x6b); // port A
export const PCINT1 = pcint(1, 0x6c); // port B
export const PCINT2 = pcint(2, 0x6d); // port C
export const PCINT3 = pcint(3, 0x73); // port D

// --------------------------------------------------------------------- ports

export const portA: AVRPortConfig = { PIN: 0x20, DDR: 0x21, PORT: 0x22, pinChange: PCINT0, externalInterrupts: [] };
// INT2 is on PB2.
export const portB: AVRPortConfig = {
  PIN: 0x23,
  DDR: 0x24,
  PORT: 0x25,
  pinChange: PCINT1,
  externalInterrupts: [null, null, INT2],
};
export const portC: AVRPortConfig = { PIN: 0x26, DDR: 0x27, PORT: 0x28, pinChange: PCINT2, externalInterrupts: [] };
// INT0 is on PD2, INT1 on PD3.
export const portD: AVRPortConfig = {
  PIN: 0x29,
  DDR: 0x2a,
  PORT: 0x2b,
  pinChange: PCINT3,
  externalInterrupts: [null, null, INT0, INT1],
};

// -------------------------------------------------------------------- timers

/** Timer/Counter0: OC0A=PB3, OC0B=PB4, T0=PB0. Registers match the ATmega328P. */
export const timer0: AVRTimerConfig = {
  ...timer0Config,
  compAInterrupt: vec(16),
  compBInterrupt: vec(17),
  ovfInterrupt: vec(18),
  compPortA: portB.PORT,
  compPinA: 3,
  compPortB: portB.PORT,
  compPinB: 4,
  externalClockPort: portB.PORT,
  externalClockPin: 0,
};

/** Timer/Counter1: OC1A=PD5, OC1B=PD4, T1=PB1. Registers match the ATmega328P. */
export const timer1: AVRTimerConfig = {
  ...timer1Config,
  captureInterrupt: vec(12),
  compAInterrupt: vec(13),
  compBInterrupt: vec(14),
  ovfInterrupt: vec(15),
  compPortA: portD.PORT,
  compPinA: 5,
  compPortB: portD.PORT,
  compPinB: 4,
  externalClockPort: portB.PORT,
  externalClockPin: 1,
};

/** Timer/Counter2 (async-capable, own prescaler set): OC2A=PD7, OC2B=PD6. */
export const timer2: AVRTimerConfig = {
  ...timer2Config,
  compAInterrupt: vec(9),
  compBInterrupt: vec(10),
  ovfInterrupt: vec(11),
  compPortA: portD.PORT,
  compPinA: 7,
  compPortB: portD.PORT,
  compPinB: 6,
};

/** Timer/Counter3 (16-bit, not present on the ATmega328P): OC3A=PB6, OC3B=PB7, T3=PD0. */
export const timer3: AVRTimerConfig = {
  ...timer1Config,
  TIFR: 0x38,
  TIMSK: 0x71,
  TCCRA: 0x90,
  TCCRB: 0x91,
  TCCRC: 0x92,
  TCNT: 0x94,
  ICR: 0x96,
  OCRA: 0x98,
  OCRB: 0x9a,
  captureInterrupt: vec(31),
  compAInterrupt: vec(32),
  compBInterrupt: vec(33),
  ovfInterrupt: vec(34),
  compPortA: portB.PORT,
  compPinA: 6,
  compPortB: portB.PORT,
  compPinB: 7,
  externalClockPort: portD.PORT,
  externalClockPin: 0,
};

/** USART0 (RXD0=PD0, TXD0=PD1). Registers match the ATmega328P; vectors differ. */
export const usart0 = {
  ...usart0Config,
  rxCompleteInterrupt: vec(20),
  dataRegisterEmptyInterrupt: vec(21),
  txCompleteInterrupt: vec(22),
};
