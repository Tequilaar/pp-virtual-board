/*
 * LCD nibble probe — run on a REAL board (ATmega1284P, 20 MHz, EA W162B-N3LW wired like the reference board:
 * PB0 RS, PB1 RW, PB2 E, PB3 VDC, PB4..PB7 D4..D7).
 *
 * Question: in 4-bit mode, what restarts the controller's two-pulse (high/low nibble) sequence?
 *   RW-RESET  a change of R/W starts a new byte            (the virtual board's current assumption)
 *   HOLD-BUSY E pulses while busy do not count
 *   TOGGLE    every E pulse counts (literal datasheet reading)
 *
 * Method (all accesses are timed with delays, no busy-flag polling):
 *   Test A: display idle. One lone read pulse, then a full write of 'A' at address 0x40.
 *   Test B: right after Return Home (display busy for ~1.6 ms). One lone read pulse, wait, write 'B' at 0x41.
 *   After each test the interface is resynchronised (0x3,0x3,0x3,0x2 nibbles) and the two cells are read back.
 *     A ok, B ok  -> RW-RESET     A bad, B ok -> HOLD-BUSY     A bad, B bad -> TOGGLE
 * The verdict is printed in line 1; line 2 shows the two test cells. LED on PD0 lights when done.
 *
 * Build:  avr-gcc -mmcu=atmega1284p -DF_CPU=20000000UL -Os -o probe.elf probe.c
 * Flash:  avrdude -p atmega1284p -c atmelice_jtag -P usb -U flash:w:probe.elf:e
 */
#include <avr/io.h>
#include <util/delay.h>
#include <stdint.h>

#define RS (1 << PB0)
#define RW (1 << PB1)
#define E  (1 << PB2)
#define VDC (1 << PB3)

static uint8_t pulse(uint8_t rs, uint8_t rw, uint8_t nib) {
  uint8_t in;
  DDRB = rw ? 0x0F : 0xFF;
  PORTB = VDC | (rs ? RS : 0) | (rw ? RW : 0) | (rw ? 0 : (uint8_t)(nib << 4));
  _delay_us(1);
  PORTB |= E;
  _delay_us(1);
  in = PINB >> 4;
  PORTB &= ~E;
  _delay_us(1);
  return in;
}

static void write_byte(uint8_t rs, uint8_t b) {
  pulse(rs, 0, b >> 4);
  pulse(rs, 0, b & 0x0F);
  _delay_ms(3);
}

static uint8_t read_byte(uint8_t rs) {
  uint8_t hi = pulse(rs, 1, 0);
  uint8_t lo = pulse(rs, 1, 0);
  _delay_ms(1);
  return (uint8_t)(hi << 4) | lo;
}

/* Back to a known state from any nibble phase: 8-bit mode three times, then 4-bit. */
static void resync(void) {
  for (uint8_t i = 0; i < 3; i++) { pulse(0, 0, 0x3); _delay_ms(5); }
  pulse(0, 0, 0x2);
  _delay_ms(1);
  write_byte(0, 0x28);
}

static void text(uint8_t addr, const char *s) {
  write_byte(0, 0x80 | addr);
  while (*s) write_byte(1, (uint8_t)*s++);
}

int main(void) {
  DDRD = 1;
  DDRB = 0xFF;
  PORTB = 0; _delay_ms(50);
  PORTB = VDC; _delay_ms(50);
  resync();
  write_byte(0, 0x0C);
  write_byte(0, 0x01);
  write_byte(0, 0x06);
  text(0x40, "..");

  /* Test A: display idle. Set the address, one lone read pulse, then write 'A'. */
  write_byte(0, 0x80 | 0x40);
  pulse(0, 1, 0);
  write_byte(1, 'A');
  resync();

  /* Test B: Return Home makes the display busy for ~1.6 ms; one lone read pulse during that time. */
  pulse(0, 0, 0x0);
  pulse(0, 0, 0x2);
  pulse(0, 1, 0);
  _delay_ms(5);
  write_byte(0, 0x80 | 0x41);
  write_byte(1, 'B');
  resync();

  write_byte(0, 0x80 | 0x40);
  uint8_t a = read_byte(1);
  uint8_t b = read_byte(1);
  const char *verdict = (a == 'A' && b == 'B') ? "RW-RESET" : (a != 'A' && b == 'B') ? "HOLD-BUSY" : (a != 'A' && b != 'B') ? "TOGGLE" : "UNEXPECTED";
  text(0x00, "MODE ");
  write_byte(0, 0x80 | 0x05);
  while (*verdict) write_byte(1, (uint8_t)*verdict++);
  PORTD = 1;
  for (;;) {}
}
