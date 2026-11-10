/* Drives PC3 high. With -DDISABLE_JTAG the JTAG interface is switched off first
 * (MCUCR.JTD written twice within four cycles, as the datasheet requires). */
#include <avr/io.h>
int main(void) {
#ifdef DISABLE_JTAG
  MCUCR = 1 << JTD;
  MCUCR = 1 << JTD;
#endif
  DDRC = 1 << PC3;
  PORTC = 1 << PC3;
  for (;;) {}
}
