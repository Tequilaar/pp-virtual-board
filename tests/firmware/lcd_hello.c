/* Own HD44780 driver (from the datasheet) on the reference wiring:
 * PB0 RS, PB1 RW, PB2 E, PB3 VDC (display supply), PB4..PB7 D4..D7, 4-bit mode, busy-flag polling.
 * Shows "Hello world!" + a custom character in line 1 and "0123456789ABCDEF" in line 2.
 * Variants: -DNO_BUSY_CHECK (fixed short delays instead of polling), -DSHORT_E (no wait while E is high).
 * PORTA = 0xA5 when done; PORTC = number of busy polls (saturating). */
#include <avr/io.h>
#include <util/delay.h>
#include <stdint.h>

#define RS (1 << PB0)
#define RW (1 << PB1)
#define E  (1 << PB2)
#define VDC (1 << PB3)

static uint8_t polls;

static inline void e_wait(void) {
#ifndef SHORT_E
  __builtin_avr_delay_cycles(12); /* 600 ns */
#endif
}

static uint8_t nibble_io(uint8_t rs, uint8_t rw, uint8_t nib) {
  uint8_t in = 0;
  PORTB = VDC | (rs ? RS : 0) | (rw ? RW : 0) | (rw ? 0 : (uint8_t)(nib << 4));
  DDRB = rw ? 0x0F : 0xFF;
  __builtin_avr_delay_cycles(4); /* address setup >= 140 ns */
  PORTB |= E;
  e_wait();
  if (rw) in = PINB >> 4;
  PORTB &= ~E;
  __builtin_avr_delay_cycles(12);
  return in;
}

static uint8_t lcd_io(uint8_t rs, uint8_t rw, uint8_t byte) {
  uint8_t hi = nibble_io(rs, rw, byte >> 4);
  uint8_t lo = nibble_io(rs, rw, byte & 0x0F);
  return (uint8_t)(hi << 4) | lo;
}

static void wait_ready(void) {
#ifdef NO_BUSY_CHECK
  _delay_us(5);
#else
  while (lcd_io(0, 1, 0) & 0x80) if (polls < 255) polls++;
#endif
}

static void cmd(uint8_t c) { wait_ready(); lcd_io(0, 0, c); }
static void put(char c) { wait_ready(); lcd_io(1, 0, (uint8_t)c); }
static void puts_lcd(const char *s) { while (*s) put(*s++); }

int main(void) {
  DDRA = 0xFF;
  DDRC = 0xFF;
  DDRB = 0xFF;
  /* Power cycle the display through PB3 : on 20 ms, off 20 ms, on, wait 20 ms. */
  PORTB = VDC; _delay_ms(20);
  PORTB = 0;   _delay_ms(20);
  PORTB = VDC; _delay_ms(20);

  /* After power-on reset the controller is in 8-bit mode: one nibble switches it to 4-bit. */
  _delay_ms(15);
  nibble_io(0, 0, 0x2);
  _delay_us(50);
  cmd(0x28);          /* 4-bit, 2 lines, 5x8 */
  cmd(0x0C);          /* display on, cursor off */
  cmd(0x01);          /* clear */
  cmd(0x06);          /* increment */

  /* Custom character 0: a small arrow. CGRAM data: bit 4 = leftmost pixel. */
  static const uint8_t arrow[8] = {0x04, 0x0E, 0x15, 0x04, 0x04, 0x04, 0x04, 0x00};
  cmd(0x40);
  for (uint8_t i = 0; i < 8; i++) { wait_ready(); lcd_io(1, 0, arrow[i]); }

  cmd(0x80);
  puts_lcd("Hello world!");
  cmd(0x80 | 15);
  put(0);
  cmd(0x80 | 0x40);
  puts_lcd("0123456789ABCDEF");
  PORTC = polls;
  PORTA = 0xA5;
  for (;;) {}
}
