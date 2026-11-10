/**
 * Wiring file: the board layout, optionally with the loaded program, as JSON.
 * Students export it to save their work and import it to continue.
 */
import type { Part } from '../circuit/parts';
import { type Problem, validateParts } from '../circuit/validate';

/** Import failure: either a file-level reason or the list of part problems. */
export class WiringFileError extends Error {
  constructor(
    readonly reason: 'json' | 'format' | 'version' | 'no-parts' | 'parts',
    readonly problems: Problem[] = [],
  ) {
    super(reason === 'parts' ? problems.map((p) => `${p.part}: ${p.code}${p.detail ? ` (${p.detail})` : ''}`).join('; ') : reason);
  }
}

export const FORMAT = 'pp-virtual-board/wiring';
export const VERSION = 1;

export interface WiringFile {
  format: typeof FORMAT;
  version: number;
  savedAt: string;
  parts: Part[];
  program?: { name: string; base64: string };
}

export function exportWiring(parts: Part[], program?: { name: string; flash: Uint8Array }): string {
  const file: WiringFile = { format: FORMAT, version: VERSION, savedAt: new Date().toISOString(), parts };
  if (program) file.program = { name: program.name, base64: toBase64(program.flash) };
  return JSON.stringify(file, null, 1);
}

export function importWiring(text: string): { parts: Part[]; program?: { name: string; flash: Uint8Array } } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new WiringFileError('json');
  }
  const f = data as Partial<WiringFile>;
  if (!f || f.format !== FORMAT) throw new WiringFileError('format');
  if (typeof f.version !== 'number' || f.version > VERSION) throw new WiringFileError('version');
  if (!Array.isArray(f.parts)) throw new WiringFileError('no-parts');
  const problems = validateParts(f.parts);
  if (problems.length) throw new WiringFileError('parts', problems);
  return {
    parts: f.parts,
    program: f.program ? { name: String(f.program.name), flash: fromBase64(f.program.base64) } : undefined,
  };
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
