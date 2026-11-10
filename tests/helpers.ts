import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
import { loadFirmware } from '../src/chip/firmware';
import { Mcu1284P, type PortName } from '../src/chip/mcu';

export const fwPath = (name: string) => join(HERE, '..', 'build', 'firmware', name);

export function boot(name: string): Mcu1284P {
  const fw = loadFirmware(new Uint8Array(readFileSync(fwPath(`${name}.elf`))));
  if (fw.warnings.length) throw new Error(fw.warnings.join('\n'));
  return new Mcu1284P(fw.flash);
}

/** Records the CPU cycle of every change of one output pin. */
export function recordEdges(mcu: Mcu1284P, port: PortName, pin: number) {
  const edges: { cycle: number; high: boolean }[] = [];
  mcu.ports[port].addListener((value, old) => {
    const bit = 1 << pin;
    if ((value ^ old) & bit) edges.push({ cycle: mcu.cpu.cycles, high: (value & bit) !== 0 });
  });
  return edges;
}

/** Differences between consecutive edges (cycles). */
export const intervals = (edges: { cycle: number }[]) => edges.slice(1).map((e, i) => e.cycle - edges[i].cycle);
