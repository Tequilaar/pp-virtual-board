/* LED on PD0 is on while the button on PD3 (active low) is pressed. PD3 has no internal pull-up. */
#include <avr/io.h>
int main(void) {
  DDRD = 1 << PD0;
  for (;;) { if (PIND & (1 << PD3)) PORTD &= ~(1 << PD0); else PORTD |= 1 << PD0; }
}
