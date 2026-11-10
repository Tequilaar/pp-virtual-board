import { AVRClock, AVRIOPort, AVRTimer, AVRUSART, CPU, avrInstruction, clockConfig } from 'avr8js';
import { ATMEGA1284P, portA, portB, portC, portD, timer0, timer1, timer2, timer3, usart0 } from './atmega1284p';

export type PortName = 'A' | 'B' | 'C' | 'D';

/**
 * One ATmega1284P: CPU, ports A–D, timers 0–3, USART0 and the clock prescaler.
 * Simulated time advances only with executed CPU cycles, never with wall-clock time.
 */
export class Mcu1284P {
  readonly cpu: CPU;
  readonly ports: Record<PortName, AVRIOPort>;
  readonly timers: AVRTimer[];
  readonly usart0: AVRUSART;
  readonly clock: AVRClock;
  readonly frequency: number;

  constructor(flash: Uint8Array, frequency: number = ATMEGA1284P.defaultFrequency) {
    if (flash.length > ATMEGA1284P.flashBytes) {
      throw new Error(`Program is ${flash.length} bytes, larger than the ${ATMEGA1284P.flashBytes}-byte flash.`);
    }
    const progMem = new Uint16Array(ATMEGA1284P.flashBytes / 2);
    new Uint8Array(progMem.buffer).set(flash);
    this.frequency = frequency;
    this.cpu = new CPU(progMem, ATMEGA1284P.sramBytes);
    this.ports = {
      A: new AVRIOPort(this.cpu, portA),
      B: new AVRIOPort(this.cpu, portB),
      C: new AVRIOPort(this.cpu, portC),
      D: new AVRIOPort(this.cpu, portD),
    };
    this.timers = [timer0, timer1, timer2, timer3].map((cfg) => fixFastPwmCompare(new AVRTimer(this.cpu, cfg)));
    this.usart0 = new AVRUSART(this.cpu, usart0, frequency);
    this.clock = new AVRClock(this.cpu, frequency, clockConfig);
  }

  /** Simulated time in seconds since reset. */
  get seconds(): number {
    return this.cpu.cycles / this.frequency;
  }

  /** Execute instructions until at least `cycles` more CPU cycles have elapsed. */
  run(cycles: number): void {
    const end = this.cpu.cycles + cycles;
    const cpu = this.cpu;
    while (cpu.cycles < end) {
      avrInstruction(cpu);
      cpu.tick();
    }
  }

  /** Run until `predicate` is true or `maxCycles` elapse. Returns true if the predicate was met. */
  runUntil(predicate: () => boolean, maxCycles: number): boolean {
    const end = this.cpu.cycles + maxCycles;
    const cpu = this.cpu;
    while (cpu.cycles < end) {
      if (predicate()) return true;
      avrInstruction(cpu);
      cpu.tick();
    }
    return predicate();
  }
}

const FAST_PWM = 3; // avr8js TimerMode.FastPWM

/**
 * avr8js 0.21.1 clears a fast-PWM output on the timer tick where TCNT reaches OCR, so the high time is
 * OCR ticks. The datasheet gives OCR+1 ticks (OCR = BOTTOM still yields a one-tick spike; OCR = TOP gives a
 * constant high), i.e. the compare match takes effect one timer clock later. We shift the compare value by
 * one tick in fast PWM mode only; other modes are unchanged. Checked by tests/chip.test.ts (PWM).
 */
function fixFastPwmCompare(timer: AVRTimer): AVRTimer {
  const t = timer as unknown as {
    timerMode: number;
    TOP: number;
    ocrA: number;
    ocrB: number;
    ocrC: number;
    timerUpdated: (value: number, prev: number) => void;
  };
  const original = t.timerUpdated.bind(timer);
  t.timerUpdated = (value: number, prev: number) => {
    if (t.timerMode !== FAST_PWM) return original(value, prev);
    const { ocrA, ocrB, ocrC, TOP } = t;
    // OCR >= TOP: the output is never cleared (constant high). NaN makes every comparison false.
    const shift = (ocr: number) => (ocr >= TOP ? NaN : ocr + 1);
    t.ocrA = shift(ocrA);
    t.ocrB = shift(ocrB);
    t.ocrC = shift(ocrC);
    try {
      original(value, prev);
    } finally {
      t.ocrA = ocrA;
      t.ocrB = ocrB;
      t.ocrC = ocrC;
    }
  };
  return timer;
}
