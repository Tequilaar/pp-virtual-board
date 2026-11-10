/* INT0 (PD2) falling edge -> toggle PA0
 * INT1 (PD3) rising edge  -> toggle PA1
 * INT2 (PB2) falling edge -> toggle PA2
 * PCINT30 (PD6) any change -> toggle PA3
 * All inputs use the internal pull-ups. */
#include <avr/io.h>
#include <avr/interrupt.h>
ISR(INT0_vect)   { PINA = 1 << PA0; }
ISR(INT1_vect)   { PINA = 1 << PA1; }
ISR(INT2_vect)   { PINA = 1 << PA2; }
ISR(PCINT3_vect) { PINA = 1 << PA3; }
int main(void) {
  DDRA = 0x0F;
  PORTD = (1 << PD2) | (1 << PD3) | (1 << PD6);
  PORTB = 1 << PB2;
  EICRA = (1 << ISC01) | (1 << ISC11) | (1 << ISC10) | (1 << ISC21);
  EIFR = 0x07;
  EIMSK = (1 << INT0) | (1 << INT1) | (1 << INT2);
  PCMSK3 = 1 << PCINT30;
  PCICR = 1 << PCIE3;
  sei();
  for (;;) {}
}
