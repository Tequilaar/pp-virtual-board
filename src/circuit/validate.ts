/**
 * Checks that a list of parts describes something that could exist on the real board. Used when importing a
 * wiring file and when placing parts in the UI. Returns problems as codes + values so the UI can word them.
 */
import { dipHole, isHole, stripOf } from './breadboard';
import { type Part, partLegs } from './parts';

export interface Problem {
  code:
    | 'unknown-kind'
    | 'bad-id'
    | 'duplicate-id'
    | 'bad-number'
    | 'bad-color'
    | 'bad-hole'
    | 'hole-used-twice'
    | 'pins-share-strip'
    | 'only-one';
  part: string;
  detail?: string;
}

const KINDS = new Set(['wire', 'resistor', 'led', 'button', 'capacitor', 'crystal', 'encoder', 'servo', 'lcd', 'jtag', 'power', 'mcu']);
const COLORS = new Set(['red', 'green', 'yellow', 'white']);
/** Parts whose pins must sit in different strips, or they would be shorted inside the breadboard. */
const DISTINCT_STRIPS = new Set(['encoder', 'servo', 'lcd', 'jtag', 'mcu']);

/** Every hole a part's pins occupy (including the chip's 40 pins and the power board's two). */
export function occupiedHoles(p: Part): string[] {
  switch (p.kind) {
    case 'mcu':
      return Array.from({ length: 40 }, (_, i) => dipHole(p.block, p.col, 40, i + 1, p.rotated));
    case 'power':
      return [`R${p.railPair}+1`, `R${p.railPair}-1`];
    default:
      return Object.values(partLegs(p));
  }
}

const positive = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const int = (x: unknown) => typeof x === 'number' && Number.isInteger(x);

export function validateParts(parts: unknown[]): Problem[] {
  const problems: Problem[] = [];
  const ids = new Set<string>();
  const holes = new Map<string, string>();
  const singletons = new Map<string, string>();
  for (const raw of parts) {
    const p = raw as Part;
    const id = typeof p?.id === 'string' ? p.id : '?';
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) {
      problems.push({ code: 'bad-id', part: id });
      continue;
    }
    if (!KINDS.has(p.kind)) {
      problems.push({ code: 'unknown-kind', part: id, detail: String(p.kind) });
      continue;
    }
    if (ids.has(id)) problems.push({ code: 'duplicate-id', part: id });
    ids.add(id);

    // Values
    const num = (field: string, ok: (x: unknown) => boolean) => {
      if (!ok((p as unknown as Record<string, unknown>)[field])) problems.push({ code: 'bad-number', part: id, detail: field });
    };
    if (p.kind === 'resistor') num('ohms', positive);
    if (p.kind === 'capacitor') num('farads', positive);
    if (p.kind === 'crystal') num('hz', positive);
    if (p.kind === 'led' && !COLORS.has(p.color)) problems.push({ code: 'bad-color', part: id, detail: String(p.color) });
    if (p.kind === 'mcu' || p.kind === 'jtag' || p.kind === 'lcd') {
      num('block', int);
      num('col', int);
    }
    if (p.kind === 'power') num('railPair', (x) => int(x) && (x as number) === 0);
    if (p.kind === 'mcu' || p.kind === 'power' || p.kind === 'jtag') {
      const other = singletons.get(p.kind);
      if (other) problems.push({ code: 'only-one', part: id, detail: p.kind });
      else singletons.set(p.kind, id);
    }

    // Holes
    let legs: string[];
    try {
      legs = occupiedHoles(p);
    } catch {
      legs = [];
    }
    const bad = legs.filter((h) => typeof h !== 'string' || !isHole(h));
    if (bad.length || !legs.length) {
      problems.push({ code: 'bad-hole', part: id, detail: bad.length ? String(bad[0]) : '' });
      continue;
    }
    for (const h of legs) {
      const owner = holes.get(h);
      if (owner) problems.push({ code: 'hole-used-twice', part: id, detail: `${h} (${owner})` });
      else holes.set(h, id);
    }
    if (DISTINCT_STRIPS.has(p.kind)) {
      const strips = legs.map((h) => stripOf(h));
      if (new Set(strips).size !== strips.length) problems.push({ code: 'pins-share-strip', part: id });
    }
  }
  return problems;
}
