/* Fast PWM edge cases on Timer1 mode 14, prescaler 8, ICR1 = 49999:
 * OC1A (PD5): OCR1A = 0     -> one-timer-clock spike per period (8 cycles)
 * OC1B (PD4): OCR1B = ICR1  -> constantly high */
#include <avr/io.h>
int main(void) {
  DDRD = (1 << PD5) | (1 << PD4);
  ICR1 = 49999; OCR1A = 0; OCR1B = 49999;
  TCCR1A = (1 << COM1A1) | (1 << COM1B1) | (1 << WGM11);
  TCCR1B = (1 << WGM13) | (1 << WGM12) | (1 << CS11);
  for (;;) {}
}
