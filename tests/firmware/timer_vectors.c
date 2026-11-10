/* One interrupt per timer, each toggling its own PORTA pin:
 *   PA0  Timer1 CTC,  prescaler 8,  OCR1A = 2499 -> every 20000 cycles
 *   PA1  Timer0 OVF,  prescaler 8                 -> every 2048 cycles
 *   PA2  Timer2 CTC,  prescaler 32, OCR2A = 99    -> every 3200 cycles
 *   PA3  Timer3 CTC,  prescaler 1,  OCR3A = 999   -> every 1000 cycles
 *   PA4  Timer1 OVF in a second run is covered by timer1_ovf.c */
#include <avr/io.h>
#include <avr/interrupt.h>
ISR(TIMER1_COMPA_vect) { PINA = 1 << PA0; }
ISR(TIMER0_OVF_vect)   { PINA = 1 << PA1; }
ISR(TIMER2_COMPA_vect) { PINA = 1 << PA2; }
ISR(TIMER3_COMPA_vect) { PINA = 1 << PA3; }
int main(void) {
  DDRA = 0x0F;
  OCR1A = 2499; TCCR1B = (1 << WGM12) | (1 << CS11); TIMSK1 = 1 << OCIE1A;
  TCCR0B = 1 << CS01; TIMSK0 = 1 << TOIE0;
  OCR2A = 99; TCCR2A = 1 << WGM21; TCCR2B = (1 << CS21) | (1 << CS20); TIMSK2 = 1 << OCIE2A;
  OCR3A = 999; TCCR3B = (1 << WGM32) | (1 << CS30); TIMSK3 = 1 << OCIE3A;
  sei();
  for (;;) {}
}
