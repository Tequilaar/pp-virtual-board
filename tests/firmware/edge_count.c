/* Counts falling edges on INT1 (PD3) and shows the count on PORTA. No internal pull-up. */
#include <avr/io.h>
#include <avr/interrupt.h>
volatile uint8_t n;
ISR(INT1_vect) { n++; PORTA = n; }
int main(void) {
  DDRA = 0xFF;
  EICRA = 1 << ISC11;
  EIFR = 1 << INTF1;
  EIMSK = 1 << INT1;
  sei();
  for (;;) {}
}
