/* Counts on PORTA and PORTC (outside the JTAG pins) as fast as possible: many different output combinations. */
#include <avr/io.h>
#include <util/delay.h>
int main(void) {
  DDRA = 0xFF; DDRC = 0xC3;
  uint16_t n = 0;
  for (;;) { n++; PORTA = n & 0xFF; PORTC = ((n >> 8) & 0x03) | ((n >> 4) & 0xC0); _delay_us(20); }
}
