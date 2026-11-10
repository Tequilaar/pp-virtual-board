/* Timer1 fast PWM, mode 14 (TOP = ICR1), prescaler 8 at 20 MHz:
 * period (49999+1)*8 = 400000 cycles = 20 ms
 * OC1A (PD5): OCR1A = 3749 -> high (3749+1)*8 = 30000 cycles = 1.5 ms
 * OC1B (PD4): OCR1B = 1249 -> high (1249+1)*8 = 10000 cycles = 0.5 ms */
#include <avr/io.h>
int main(void) {
  DDRD = (1 << PD5) | (1 << PD4);
  ICR1 = 49999;
  OCR1A = 3749;
  OCR1B = 1249;
  TCCR1A = (1 << COM1A1) | (1 << COM1B1) | (1 << WGM11);
  TCCR1B = (1 << WGM13) | (1 << WGM12) | (1 << CS11);
  for (;;) {}
}
