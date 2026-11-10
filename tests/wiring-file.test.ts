import { describe, expect, it } from 'vitest';
import { WiringFileError, exportWiring, importWiring } from '../src/ui/wiring-file';
import { basicSetup } from './fixtures';
import { validateParts } from '../src/circuit/validate';

describe('wiring file', () => {
  it('round-trips parts and program', () => {
    const flash = new Uint8Array(70_000).map((_, i) => (i * 31) & 0xff);
    const back = importWiring(exportWiring(basicSetup(), { name: 'p.elf', flash }));
    expect(back.parts).toEqual(basicSetup());
    expect(back.program?.name).toBe('p.elf');
    expect(back.program?.flash).toEqual(flash);
  });
  it('works without a program', () => {
    expect(importWiring(exportWiring(basicSetup())).program).toBeUndefined();
  });
  it('rejects other files and broken parts', () => {
    expect(() => importWiring('{"a":1}')).toThrow(/format/);
    expect(() => importWiring('nope')).toThrow(/json/);
    const bad = JSON.parse(exportWiring(basicSetup()));
    bad.parts.push({ kind: 'wire', id: 'x', a: '1Z99', b: 'R0+1' });
    expect(() => importWiring(JSON.stringify(bad))).toThrow(/bad-hole/);
    bad.parts.pop();
    bad.parts.push({ ...bad.parts[0] });
    expect(() => importWiring(JSON.stringify(bad))).toThrow(/duplicate-id/);
    bad.parts.pop();
    bad.version = 99;
    expect(() => importWiring(JSON.stringify(bad))).toThrow(/version/);
  });
});

describe('wiring file validation', () => {
  const file = (parts: unknown[]) => JSON.stringify({ format: 'pp-virtual-board/wiring', version: 1, savedAt: '', parts: [...basicSetup(), ...parts] });
  const codes = (parts: unknown[]) => {
    try {
      importWiring(file(parts));
      return [];
    } catch (e) {
      return (e as WiringFileError).problems.map((p) => p.code);
    }
  };
  it('rejects invalid values', () => {
    expect(codes([{ kind: 'resistor', id: 'x', a: '1A1', b: '1A3', ohms: 'abc' }])).toEqual(['bad-number']);
    expect(codes([{ kind: 'resistor', id: 'x', a: '1A1', b: '1A3', ohms: 0 }])).toEqual(['bad-number']);
    expect(codes([{ kind: 'capacitor', id: 'x', a: '1A1', b: '1A3', farads: -1 }])).toEqual(['bad-number']);
    expect(codes([{ kind: 'led', id: 'x', anode: '1A1', cathode: '1A3', color: 'purple' }])).toEqual(['bad-color']);
  });
  it('rejects parts outside the board, second chips and unknown types', () => {
    expect(codes([{ kind: 'mcu', id: 'u9', block: 2, col: 50 }])).toContain('bad-hole');
    expect(codes([{ kind: 'mcu', id: 'u9', block: 3, col: 1 }])).toEqual(['only-one']);
    expect(codes([{ kind: 'power', id: 'p9', railPair: 7 }])).toContain('bad-number');
    expect(codes([{ kind: 'toaster', id: 'x' }])).toEqual(['unknown-kind']);
  });
  it('rejects two legs in one hole and pins shorted in one strip', () => {
    expect(codes([{ kind: 'wire', id: 'w9', a: '1J25', b: '4A1' }])).toEqual(['hole-used-twice']);
    expect(codes([{ kind: 'servo', id: 's9', gnd: 'R2-10', vcc: 'R2-11', signal: 'R2-12' }])).toEqual(['pins-share-strip']);
  });
  it('accepts every part type of a full board', () => {
    expect(codes([{ kind: 'encoder', id: 'e', a: '4C50', c: '4C51', b: '4C52', sw1: '4H50', sw2: '4H52' }, { kind: 'lcd', id: 'l', block: 4, row: 'J', col: 1 }, { kind: 'jtag', id: 'j', block: 3, col: 40 }, { kind: 'servo', id: 's', gnd: 'R2-56', vcc: 'R2+56', signal: '4A56' }])).toEqual([]);
  });
});

describe('test circuits are valid boards', () => {
  it('every fixture passes the same validation as an imported file', async () => {
    const f = await import('./fixtures');
    for (const parts of [f.basicSetup(), f.lcdCircuit(), f.encoderCircuit(), f.jtagCircuit(), f.buttonCircuit(true), f.buttonCircuit(false)]) {
      expect(validateParts(parts)).toEqual([]);
    }
  });
});
