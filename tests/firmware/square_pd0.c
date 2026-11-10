/* PD0 square wave, 50 % duty, 1 kHz (Timer1 CTC toggling every 0.5 ms). */
#include <avr/io.h>
#include <avr/interrupt.h>
ISR(TIMER1_COMPA_vect) { PIND = 1 << PD0; }
int main(void) {
  DDRD = 1 << PD0;
  OCR1A = 1249; TCCR1B = (1 << WGM12) | (1 << CS11); TIMSK1 = 1 << OCIE1A;
  sei();
  for (;;) {}
}
