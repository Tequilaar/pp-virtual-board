/* LED on PD0 permanently on. */
#include <avr/io.h>
int main(void) { DDRD = 1 << PD0; PORTD = 1 << PD0; for (;;) {} }
