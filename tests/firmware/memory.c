/* Uses ~15 KB of the 16 KB SRAM plus recursion on the stack, then reports:
 * PORTA = low byte of checksum, PORTC = high byte, PORTB = 0xA5 when finished. */
#include <avr/io.h>
#include <stdint.h>
static volatile uint8_t buf[15000];
static uint16_t depth(uint8_t n) { volatile uint8_t pad[8]; pad[0] = n; return n ? pad[0] + depth(n - 1) : 0; }
int main(void) {
  DDRA = DDRB = DDRC = 0xFF;
  uint16_t sum = 0;
  for (uint16_t i = 0; i < sizeof buf; i++) buf[i] = (uint8_t)(i * 7u);
  for (uint16_t i = 0; i < sizeof buf; i++) sum += buf[i];
  sum += depth(100);
  PORTA = sum & 0xFF;
  PORTC = sum >> 8;
  PORTB = 0xA5;
  for (;;) {}
}
