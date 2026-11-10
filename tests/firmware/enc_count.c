/* Usual encoder decoding: on each rising edge of A (PD2/INT0) read B (PD1):
 * B high -> turned left (-1), B low -> turned right (+1). The signed count is shown on PORTA. */
#include <avr/io.h>
#include <avr/interrupt.h>
volatile int8_t cnt;
ISR(INT0_vect) { if (PIND & (1 << PD1)) cnt--; else cnt++; PORTA = (uint8_t)cnt; }
int main(void) {
  DDRA = 0xFF;
  EICRA = (1 << ISC01) | (1 << ISC00);
  EIFR = 1 << INTF0;
  EIMSK = 1 << INT0;
  sei();
  for (;;) {}
}
