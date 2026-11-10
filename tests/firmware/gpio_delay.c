/* PB0 toggles every 1 ms using _delay_ms (busy-wait loop, F_CPU = 20 MHz). */
#include <avr/io.h>
#include <util/delay.h>
int main(void) {
  DDRB = 1 << PB0;
  for (;;) { PORTB ^= 1 << PB0; _delay_ms(1); }
}
