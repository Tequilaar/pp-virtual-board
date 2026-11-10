/* Servo signals: OC1A (PD5) 1.5 ms, OC1B (PD4) 0.5 ms, 20 ms period (Timer1 mode 14, prescaler 8).
 * With -DWIDE: OC1A 3.0 ms (outside the servo range). */
#include <avr/io.h>
int main(void) {
  DDRD = (1 << PD5) | (1 << PD4);
  ICR1 = 49999;
#ifdef WIDE
  OCR1A = 7499;
#else
  OCR1A = 3749;
#endif
  OCR1B = 1249;
  TCCR1A = (1 << COM1A1) | (1 << COM1B1) | (1 << WGM11);
  TCCR1B = (1 << WGM13) | (1 << WGM12) | (1 << CS11);
  for (;;) {}
}
