/* Timer1 overflow without prescaler: PA0 toggles every 65536 cycles. */
#include <avr/io.h>
#include <avr/interrupt.h>
ISR(TIMER1_OVF_vect) { PORTA ^= 1 << PA0; }
int main(void) {
  DDRA = 1 << PA0;
  TCCR1B = 1 << CS10; TIMSK1 = 1 << TOIE1;
  sei();
  for (;;) {}
}
