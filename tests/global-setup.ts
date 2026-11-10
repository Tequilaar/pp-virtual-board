import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const FW = join(HERE, 'firmware');
const OUT = join(HERE, '..', 'build', 'firmware');

function compile(src: string, out: string, mcu: string, extra: string[] = []) {
  execFileSync('avr-gcc', [`-mmcu=${mcu}`, ...extra, '-DF_CPU=20000000UL', '-Os', '-std=gnu11', '-Wall', '-o', out, src], {
    stdio: 'inherit',
  });
}

/** Builds every tests/firmware/*.c with the usual avr-gcc flags, once per test run. */
export default function setup() {
  // CI machines without avr-gcc (Windows) use firmware built by an earlier job.
  if (process.env.PP_PREBUILT_FIRMWARE) return;
  mkdirSync(OUT, { recursive: true });
  for (const file of readdirSync(FW).filter((f) => f.endsWith('.c'))) {
    const base = join(OUT, file.replace(/\.c$/, ''));
    compile(join(FW, file), `${base}.elf`, 'atmega1284p');
    execFileSync('avr-objcopy', ['-O', 'ihex', '-R', '.eeprom', `${base}.elf`, `${base}.hex`]);
  }
  // A program built for the wrong MCU, to check the loader's warning.
  compile(join(FW, 'gpio_delay.c'), join(OUT, 'wrong_mcu.elf'), 'atmega328p');
  compile(join(FW, 'pc3_led.c'), join(OUT, 'pc3_led_nojtag.elf'), 'atmega1284p', ['-DDISABLE_JTAG']);
  compile(join(FW, 'servo_pwm.c'), join(OUT, 'servo_wide.elf'), 'atmega1284p', ['-DWIDE']);
  compile(join(FW, 'lcd_hello.c'), join(OUT, 'lcd_nobusy.elf'), 'atmega1284p', ['-DNO_BUSY_CHECK']);
  compile(join(FW, '..', '..', 'tools', 'lcd-nibble-probe', 'probe.c'), join(OUT, 'lcd_probe.elf'), 'atmega1284p');
  compile(join(FW, 'lcd_hello.c'), join(OUT, 'lcd_short_e.elf'), 'atmega1284p', ['-DSHORT_E']);
}
