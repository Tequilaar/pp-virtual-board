/**
 * Loading firmware: ELF (what `avrdude -U flash:w:p.elf:e` flashes) and Intel HEX.
 */
import { ATMEGA1284P } from './atmega1284p';

/** Loader failure with a code the UI can word in any language. */
export class FirmwareError extends Error {
  constructor(
    readonly code: 'unrecognised' | 'elf-format' | 'not-avr' | 'too-large' | 'no-code' | 'hex' | 'wrong-device',
    message: string,
    readonly detail = '',
  ) {
    super(message);
  }
}

export interface Firmware {
  /** Flash image, starting at address 0. */
  flash: Uint8Array;
  /** Device name recorded by avr-gcc in the ELF (e.g. "atmega1284p"), if present. */
  device?: string;
  /** Problems a student should see, such as a program built for another MCU. */
  warnings: string[];
}

const EM_AVR = 83;
const PT_LOAD = 1;
/** avr-gcc places data-space sections at this virtual offset; their load address (LMA) is in flash. */
const AVR_DATA_OFFSET = 0x800000;

export function loadFirmware(bytes: Uint8Array): Firmware {
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return parseElf(bytes);
  const text = new TextDecoder().decode(bytes);
  if (text.trimStart().startsWith(':')) return parseHex(text);
  throw new FirmwareError('unrecognised', 'Unrecognised file: expected an AVR .elf or Intel .hex file.');
}

export function parseElf(bytes: Uint8Array): Firmware {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[4] !== 1 || bytes[5] !== 1) throw new FirmwareError('elf-format', 'Not a 32-bit little-endian ELF file.');
  const machine = dv.getUint16(18, true);
  if (machine !== EM_AVR) throw new FirmwareError('not-avr', `ELF is for machine ${machine}, not AVR. Was it compiled with avr-gcc?`);

  const phoff = dv.getUint32(28, true);
  const phentsize = dv.getUint16(42, true);
  const phnum = dv.getUint16(44, true);

  const flash = new Uint8Array(ATMEGA1284P.flashBytes);
  let end = 0;
  for (let i = 0; i < phnum; i++) {
    const ph = phoff + i * phentsize;
    if (dv.getUint32(ph, true) !== PT_LOAD) continue;
    const offset = dv.getUint32(ph + 4, true);
    const paddr = dv.getUint32(ph + 12, true);
    const filesz = dv.getUint32(ph + 16, true);
    if (filesz === 0 || paddr >= AVR_DATA_OFFSET) continue; // EEPROM, fuses, etc. are not flash
    if (paddr + filesz > flash.length) {
      throw new FirmwareError('too-large', `Program does not fit in ${flash.length} bytes of flash.`);
    }
    flash.set(bytes.subarray(offset, offset + filesz), paddr);
    end = Math.max(end, paddr + filesz);
  }
  if (end === 0) throw new FirmwareError('no-code', 'ELF contains no program code.');

  const device = readDeviceName(bytes, dv);
  const warnings: string[] = [];
  if (device && device.toLowerCase() !== 'atmega1284p') {
    warnings.push(`Program was compiled for ${device}, not ATmega1284P (check -mmcu=atmega1284p).`);
  }
  return { flash: flash.slice(0, end), device, warnings };
}

/** Reads the device name from avr-gcc's `.note.gnu.avr.deviceinfo` section. */
function readDeviceName(bytes: Uint8Array, dv: DataView): string | undefined {
  const shoff = dv.getUint32(32, true);
  const shentsize = dv.getUint16(46, true);
  const shnum = dv.getUint16(48, true);
  const shstrndx = dv.getUint16(50, true);
  if (!shoff || shstrndx >= shnum) return undefined;
  const sh = (i: number) => shoff + i * shentsize;
  const strOff = dv.getUint32(sh(shstrndx) + 16, true);
  const cstr = (at: number) => {
    let e = at;
    while (e < bytes.length && bytes[e] !== 0) e++;
    return new TextDecoder().decode(bytes.subarray(at, e));
  };
  for (let i = 0; i < shnum; i++) {
    if (cstr(strOff + dv.getUint32(sh(i), true)) !== '.note.gnu.avr.deviceinfo') continue;
    const off = dv.getUint32(sh(i) + 16, true);
    const namesz = dv.getUint32(off, true);
    const descsz = dv.getUint32(off + 4, true);
    const desc = off + 12 + ((namesz + 3) & ~3);
    // desc: 6 uint32 (flash/sram/eeprom start+size), then the offset table — its first uint32 is the
    // table's byte length (including itself), the next is the device name's offset — then a string table.
    // Verified against avr-objdump output of avr-gcc 9.5.0.
    const tableLen = dv.getUint32(desc + 24, true);
    if (tableLen < 8) return undefined;
    const strtab = desc + 24 + tableLen;
    const nameOffset = dv.getUint32(desc + 28, true);
    if (strtab + nameOffset >= desc + descsz) return undefined;
    return cstr(strtab + nameOffset) || undefined;
  }
  return undefined;
}

export function parseHex(text: string): Firmware {
  const flash = new Uint8Array(ATMEGA1284P.flashBytes);
  let base = 0;
  let end = 0;
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim();
    if (!line) continue;
    if (!line.startsWith(':')) throw new FirmwareError('hex', `HEX line ${n + 1}: missing ':'`, String(n + 1));
    const raw = line.slice(1).match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
    if (raw.some(Number.isNaN) || raw.length < 5) throw new FirmwareError('hex', `HEX line ${n + 1}: malformed`, String(n + 1));
    const sum = raw.reduce((a, b) => a + b, 0) & 0xff;
    if (sum !== 0) throw new FirmwareError('hex', `HEX line ${n + 1}: checksum error`, String(n + 1));
    const [len, hi, lo, type] = raw;
    const data = raw.slice(4, 4 + len);
    if (type === 0x00) {
      const addr = base + ((hi << 8) | lo);
      if (addr + len > flash.length) throw new FirmwareError('hex', `HEX line ${n + 1}: address beyond flash`, String(n + 1));
      flash.set(data, addr);
      end = Math.max(end, addr + len);
    } else if (type === 0x01) {
      break;
    } else if (type === 0x02) {
      base = ((data[0] << 8) | data[1]) << 4;
    } else if (type === 0x04) {
      base = ((data[0] << 8) | data[1]) << 16;
    }
  }
  if (end === 0) throw new FirmwareError('no-code', 'HEX file contains no data.');
  return { flash: flash.slice(0, end), warnings: [] };
}
