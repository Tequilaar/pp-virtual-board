/**
 * Cross-browser check of the UI, driven only through real mouse, keyboard and file inputs.
 * window.__pp is read for assertions only, never to drive the page.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
import { type Page, expect, test } from '@playwright/test';
import { encoderCircuit, basicSetup, lcdCircuit } from '../tests/fixtures';

const FW = join(HERE, '..', 'build', 'firmware');

const sim = (page: Page, expr: string) => page.evaluate(`(() => { const pp = window.__pp; return ${expr}; })()`);

async function holeCenter(page: Page, hole: string) {
  const box = await page.locator(`[data-hole="${hole}"]`).boundingBox();
  if (!box) throw new Error(`hole ${hole} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function clickHole(page: Page, hole: string) {
  await page.locator(`[data-hole="${hole}"]`).scrollIntoViewIfNeeded();
  const c = await holeCenter(page, hole);
  await page.mouse.click(c.x, c.y);
}

test('build, run, press, edit, export', async ({ page, browserName }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.locator('header .brand b')).toHaveText('PP Virtuelles Board');

  // Import the basic setup (+ 10 kΩ pull-up on PD3) through the file input, then load the program.
  const parts = [...basicSetup(), { kind: 'resistor', id: 'rpu', a: '1H32', b: 'R1+32', ohms: 10_000 }];
  const wiring = JSON.stringify({ format: 'pp-virtual-board/wiring', version: 1, savedAt: '', parts });
  await page.setInputFiles('#wiring-file', { name: 'aufbau.json', mimeType: 'application/json', buffer: Buffer.from(wiring) });
  await page.setInputFiles('#program-file', join(FW, 'button_follow.elf'));
  await expect(page.locator('#status')).toContainText('button_follow.elf');
  await expect.poll(() => sim(page, 'pp.sim.status.running')).toBe(true);
  expect(await sim(page, '[...pp.sim.warnings.keys()]')).toEqual([]);

  // Place a push button with two real clicks.
  await page.click('[data-tool="button"]');
  await clickHole(page, '1I32');
  await clickHole(page, 'R1-34');
  expect(await sim(page, 'pp.parts.find(p => p.kind === "button")')).toMatchObject({ a: '1I32', b: 'R1-34' });

  // Press and hold with the mouse: the program polls PD3 and lights the LED on PD0.
  await page.click('[data-tool="select"]');
  const btn = await page.locator('.part-button .btn-cap').boundingBox();
  await page.mouse.move(btn!.x + btn!.width / 2, btn!.y + btn!.height / 2);
  await page.mouse.down();
  await expect.poll(() => sim(page, 'pp.sim.ledCurrent("led1")')).toBeGreaterThan(0.005);
  await expect.poll(async () => Number(await page.locator('.part-led .led-glow').getAttribute('opacity'))).toBeGreaterThan(0.5);
  await page.mouse.up();
  await expect.poll(() => sim(page, 'pp.sim.ledCurrent("led1")')).toBe(0);

  // Hover readout names the chip pin and its voltage.
  const pd0 = await holeCenter(page, '1F29');
  await page.mouse.move(pd0.x, pd0.y);
  await expect(page.locator('#hover')).toContainText('PD0 (Pin 14)');
  await expect(page.locator('#hover')).toContainText('V');

  // Real-time factor over 3 s of wall time.
  const c0 = (await sim(page, 'pp.sim.cycles')) as number;
  const t0 = Date.now();
  await page.waitForTimeout(3000);
  const factor = (((await sim(page, 'pp.sim.cycles')) as number) - c0) / ((Date.now() - t0) / 1000) / 20e6;
  info.annotations.push({ type: 'realtime', description: `${info.project.name}: ${(factor * 100).toFixed(0)} %` });
  console.log(`[${info.project.name} on ${process.platform}] real-time factor ${(factor * 100).toFixed(0)} %`);
  // CI runners are small shared VMs; on a student laptop we expect (and measured) 100 %.
  expect(factor).toBeGreaterThan(process.env.CI ? 0.2 : 0.8);

  // Select the button and delete it with the keyboard.
  await page.mouse.click(btn!.x + btn!.width / 2, btn!.y + btn!.height / 2);
  await page.keyboard.press('Delete');
  expect(await sim(page, 'pp.parts.some(p => p.kind === "button")')).toBe(false);

  // Export downloads a file with the parts and the program.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(exported.parts).toHaveLength(parts.length);
  expect(exported.program.name).toBe('button_follow.elf');

  // Zoom with the buttons and Ctrl + wheel.
  const w0 = (await page.locator('svg.board').boundingBox())!.width;
  await page.click('#zoom-in');
  const w1 = (await page.locator('svg.board').boundingBox())!.width;
  expect(w1).toBeGreaterThan(w0);
  await page.mouse.move(700, 450);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 200);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await page.locator('svg.board').boundingBox())!.width).toBeLessThan(w1);

  // Language switch.
  await page.selectOption('#lang', 'en');
  await expect(page.locator('header .brand b')).toHaveText('PP Virtual Board');
  await expect(page.locator('#status')).toContainText('Supply');
  await expect(page.locator('#wire-color option').first()).toHaveText('blue');
  await expect(page.locator('#warnings')).not.toContainText('keine');
  await page.selectOption('#lang', 'zh');
  await expect(page.locator('header .brand b')).toHaveText('PP 虚拟实验板');
  await expect(page.locator('#status')).toContainText('供电');
  await expect(page.locator('#wire-color option').first()).toHaveText('蓝');
  await page.selectOption('#lang', 'de');
  await expect(page.locator('header .brand b')).toHaveText('PP Virtuelles Board');

  await page.screenshot({ path: `test-results/ui-${info.project.name}-${process.platform}.png` });
  expect(errors).toEqual([]);
});

test('drag and drop of a program file', async ({ page }) => {
  await page.goto('/');
  const bytes = [...readFileSync(join(FW, 'led_pd0.elf'))];
  await page.evaluate((data) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(data)], 'p.elf'));
    document.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, bytes);
  await expect(page.locator('#status')).toContainText('p.elf');
});

test('encoder placed by click, turned with arrows and wheel; servo arm follows the pulse', async ({ page }, info) => {
  await page.goto('/');
  // Encoder circuit without the encoder itself; the encoder is placed by click.
  const parts = encoderCircuit().filter((p) => p.kind !== 'encoder');
  const wiring = JSON.stringify({ format: 'pp-virtual-board/wiring', version: 1, savedAt: '', parts });
  await page.setInputFiles('#wiring-file', { name: 'enc.json', mimeType: 'application/json', buffer: Buffer.from(wiring) });
  await page.setInputFiles('#program-file', join(FW, 'enc_count.elf'));
  await page.click('[data-tool="encoder"]');
  await clickHole(page, '3C50');
  expect(await sim(page, 'pp.parts.find(p => p.kind === "encoder")')).toMatchObject({ a: '3C50', c: '3C51', b: '3C52' });
  await page.click('[data-tool="select"]');
  await expect.poll(() => sim(page, 'pp.sim.status.running'), { timeout: 10_000 }).toBe(true);

  const cw = page.locator('.part-encoder [data-turn="1"] circle');
  for (let i = 0; i < 3; i++) await cw.click();
  await expect.poll(() => sim(page, 'pp.sim.mcu.cpu.data[0x22]'), { timeout: 10_000 }).toBe(3);
  const knob = await page.locator('.part-encoder .enc-knob-face').boundingBox();
  await page.mouse.move(knob!.x + knob!.width / 2, knob!.y + knob!.height / 2);
  await page.mouse.wheel(0, -100); // one notch counter-clockwise
  await expect.poll(() => sim(page, 'pp.sim.mcu.cpu.data[0x22]'), { timeout: 10_000 }).toBe(2);
  await expect(page.locator('.part-encoder .enc-mark')).toHaveAttribute('transform', /rotate\(30 /);

  // Servo on PD5 (OC1A, 1.5 ms) and PD4 (OC1B, 0.5 ms).
  const servoParts = [
    ...basicSetup(),
    { kind: 'servo', id: 'SA', gnd: 'R1-56', vcc: 'R1+56', signal: '1H34' },
    { kind: 'servo', id: 'SB', gnd: 'R1-58', vcc: 'R1+58', signal: '1H33' },
  ];
  const w2 = JSON.stringify({ format: 'pp-virtual-board/wiring', version: 1, savedAt: '', parts: servoParts });
  await page.setInputFiles('#wiring-file', { name: 'servo.json', mimeType: 'application/json', buffer: Buffer.from(w2) });
  await page.setInputFiles('#program-file', join(FW, 'servo_pwm.elf'));
  await expect(page.locator('[data-part="SB"] [data-angle]')).toHaveText('180°', { timeout: 10_000 });
  await expect(page.locator('[data-part="SA"] [data-angle]')).toHaveText('90°');
  await expect(page.locator('#servo-status')).toContainText('0.500 ms');
  await page.locator('[data-part="SA"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/servo-${info.project.name}-${process.platform}.png` });
});

test('LCD placed by click shows the text written by the program', async ({ page }, info) => {
  await page.goto('/');
  const parts = lcdCircuit().filter((p) => p.kind !== 'lcd');
  const wiring = JSON.stringify({ format: 'pp-virtual-board/wiring', version: 1, savedAt: '', parts });
  await page.setInputFiles('#wiring-file', { name: 'lcd.json', mimeType: 'application/json', buffer: Buffer.from(wiring) });
  await page.click('[data-tool="lcd"]');
  await clickHole(page, '2J16');
  expect(await sim(page, 'pp.parts.find(p => p.kind === "lcd")')).toMatchObject({ block: 2, row: 'J', col: 16 });
  await page.click('[data-tool="select"]');
  await page.setInputFiles('#program-file', join(FW, 'lcd_hello.elf'));
  const lcd = page.locator('.part-lcd');
  await expect(lcd).toHaveAttribute('data-text', /^Hello world!/, { timeout: 15_000 });
  await expect(lcd).toHaveAttribute('data-text', /0123456789ABCDEF$/);
  await expect(page.locator('#warnings')).not.toContainText('LCD');
  await lcd.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/lcd-${info.project.name}-${process.platform}.png` });
});

test('3D view shows the running board and can be rotated', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  const wiring = JSON.stringify({ format: 'pp-virtual-board/wiring', version: 1, savedAt: '', parts: lcdCircuit() });
  await page.setInputFiles('#wiring-file', { name: 'lcd.json', mimeType: 'application/json', buffer: Buffer.from(wiring) });
  await page.setInputFiles('#program-file', join(FW, 'lcd_hello.elf'));
  await expect(page.locator('.part-lcd')).toHaveAttribute('data-text', /^Hello world!/, { timeout: 15_000 });
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  await page.click('#toggle-3d');
  if (!webgl) {
    // Machines without WebGL (e.g. headless Firefox on CI): a clear message, and the 2D view stays.
    await expect(page.locator('#hint')).toContainText('WebGL');
    await expect(page.locator('#board-wrap')).toBeVisible();
    info.annotations.push({ type: 'webgl', description: 'not available — fallback checked' });
    expect(errors).toEqual([]);
    return;
  }
  const canvas = page.locator('#view3d canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  expect((await canvas.boundingBox())!.width).toBeGreaterThan(400);
  await expect(page.locator('#board-wrap')).toBeHidden();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/3d-${info.project.name}-${process.platform}.png` });
  // Rotate by dragging; the picture must change.
  const before = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 - 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(Buffer.compare(before, await canvas.screenshot())).not.toBe(0);
  await page.screenshot({ path: `test-results/3d-rotated-${info.project.name}-${process.platform}.png` });
  await page.click('#toggle-3d');
  await expect(page.locator('#board-wrap')).toBeVisible();
  expect(errors).toEqual([]);
});

test('multimeter and JTAG-only programming', async ({ page }) => {
  await page.goto('/');
  const wiring = JSON.stringify({ format: 'pp-virtual-board/wiring', version: 1, savedAt: '', parts: basicSetup() });
  await page.setInputFiles('#wiring-file', { name: 'g.json', mimeType: 'application/json', buffer: Buffer.from(wiring) });
  // JTAG required but no header: loading is refused like a failed avrdude run.
  await page.check('#jtag-required');
  await page.setInputFiles('#program-file', join(FW, 'led_pd0.elf'));
  await expect(page.locator('#hint')).toContainText('keine JTAG-Stiftleiste');
  expect(await sim(page, 'pp.sim.status.programLoaded')).toBe(false);
  await page.uncheck('#jtag-required');
  await page.setInputFiles('#program-file', join(FW, 'led_pd0.elf'));
  await expect.poll(() => sim(page, 'pp.sim.status.running'), { timeout: 10_000 }).toBe(true);
  // Multimeter: VCC strip (1J25) against GND rail.
  await page.click('[data-tool="meter"]');
  await clickHole(page, '1J25');
  await clickHole(page, 'R1-10');
  await expect(page.locator("#meter-status")).toContainText(/(4\.9\d|5\.00) V/);
});

test('wrong chip refused, servo not on a rail, restart hint, Esc clears probes, bad file explained', async ({ page }) => {
  await page.goto('/');
  // a program for the ATmega328P is refused, in German
  await page.setInputFiles('#program-file', join(FW, 'wrong_mcu.elf'));
  await expect(page.locator('#hint')).toContainText('Programmieren abgelehnt');
  expect(await sim(page, 'pp.sim.status.programLoaded')).toBe(false);
  // restart without a program
  await page.click('#restart');
  await expect(page.locator('#hint')).toContainText('Kein Programm geladen');
  // a servo on one rail would short its pins
  await page.click('[data-tool="servo"]');
  await clickHole(page, 'R2-10');
  await expect(page.locator('#hint')).toContainText('kurzgeschlossen');
  expect(await sim(page, 'pp.parts.length')).toBe(0);
  // Esc removes multimeter probes
  await page.click('[data-tool="meter"]');
  await clickHole(page, '1A1');
  await expect(page.locator('.meter circle')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.meter circle')).toHaveCount(0);
  // invalid values in a wiring file are explained, nothing is loaded
  const bad = JSON.stringify({ format: 'pp-virtual-board/wiring', version: 1, savedAt: '', parts: [...basicSetup(), { kind: 'resistor', id: 'Rx', a: '4A1', b: '4A3', ohms: 0 }] });
  await page.setInputFiles('#wiring-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(bad) });
  await expect(page.locator('#hint')).toContainText('ungültiger Wert für „ohms“');
  expect(await sim(page, 'pp.parts.length')).toBe(0);
});

test('drag to move, drag a leg end, R rotates the chip, undo/redo by keys and buttons', async ({ page }) => {
  await page.goto('/');
  const wiring = JSON.stringify({ format: 'pp-virtual-board/wiring', version: 1, savedAt: '', parts: basicSetup() });
  await page.setInputFiles('#wiring-file', { name: 'g.json', mimeType: 'application/json', buffer: Buffer.from(wiring) });
  await page.setInputFiles('#program-file', join(FW, 'led_pd0.elf'));
  const ledOn = () => sim(page, 'pp.sim.ledCurrent("led1") > 0.004');
  await expect.poll(ledOn, { timeout: 10_000 }).toBe(true);
  const part = (id: string) => sim(page, `pp.parts.find(p => p.id === "${id}")`);
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
  };

  // Move the 330 Ω resistor two columns to the right: the LED loses its connection.
  await page.locator('[data-part="r1"]').scrollIntoViewIfNeeded();
  const body = (await page.locator('[data-part="r1"] .res-body').boundingBox())!;
  const c29 = await holeCenter(page, '1J29');
  const c31 = await holeCenter(page, '1J31');
  const from = { x: body.x + body.width / 2, y: body.y + body.height / 2 };
  await drag(from, { x: from.x + (c31.x - c29.x), y: from.y });
  expect(await part('r1')).toMatchObject({ a: '1J31', b: '2A31' });
  await expect.poll(ledOn).toBe(false);

  // Undo / redo with the keyboard, then undo with the button.
  await page.keyboard.press('ControlOrMeta+z');
  expect(await part('r1')).toMatchObject({ a: '1J29', b: '2A29' });
  await expect.poll(ledOn).toBe(true);
  await page.keyboard.press('ControlOrMeta+y');
  expect(await part('r1')).toMatchObject({ a: '1J31' });
  await page.click('#undo');
  expect(await part('r1')).toMatchObject({ a: '1J29' });
  await expect(page.locator('#redo')).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.keyboard.press('ControlOrMeta+z');

  // Re-plug only the ground end of the LED's ground wire: still ground, LED stays on.
  const end = await holeCenter(page, 'R1-31');
  await drag(end, await holeCenter(page, 'R1-36'));
  expect(await part('ledgnd')).toMatchObject({ a: '2A31', b: 'R1-36' });
  await expect.poll(ledOn).toBe(true);

  // Impossible move: the chip dragged up out of its place across the centre gap — refused, nothing changes.
  const chipBox = (await page.locator('[data-part="u1"] .chip-body').boundingBox())!;
  const rowF = await holeCenter(page, '1F20');
  const rowB = await holeCenter(page, '1B20');
  const cx = chipBox.x + chipBox.width / 2;
  const cy = chipBox.y + chipBox.height / 2;
  await drag({ x: cx, y: cy }, { x: cx, y: cy + (rowB.y - rowF.y) });
  await expect(page.locator('#hint')).toContainText('Verschieben nicht möglich');
  expect(await part('u1')).toMatchObject({ block: 1, col: 16 });

  // Released outside the window: the drag still ends (pointer capture) instead of hanging.
  const r = (await page.locator('[data-part="r1"] .res-body').boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 30, r.y + r.height / 2, { steps: 3 });
  await page.mouse.move(5000, r.y, { steps: 3 });
  await page.mouse.up();
  await page.mouse.move(r.x, r.y - 200, { steps: 3 });
  expect(await sim(page, 'document.querySelector(\'[data-part="r1"]\').getAttribute("transform")')).toBeNull();
  if (JSON.stringify(await part('r1')) !== JSON.stringify({ kind: 'resistor', id: 'r1', a: '1J29', b: '2A29', ohms: 330 })) {
    await page.keyboard.press('ControlOrMeta+z');
  }
  expect(await part('r1')).toMatchObject({ a: '1J29', b: '2A29' });

  // R turns the selected chip by 180°: its supply pins move, so it stops — like on a real board. Undo restores it.
  const chip = (await page.locator('[data-part="u1"] .chip-body').boundingBox())!;
  await page.mouse.click(chip.x + chip.width / 2, chip.y + chip.height / 2);
  await page.keyboard.press('r');
  expect(await part('u1')).toMatchObject({ rotated: true });
  await expect.poll(() => sim(page, 'pp.sim.status.running')).toBe(false);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await part('u1')).rotated).toBeFalsy();
  await expect.poll(ledOn, { timeout: 10_000 }).toBe(true);

  // R while placing a chip: it is placed turned.
  await page.click('[data-part="u1"] .chip-body');
  await page.keyboard.press('Delete');
  await page.click('[data-tool="mcu"]');
  await page.keyboard.press('r');
  await expect(page.locator('#hint')).toContainText('Kerbe rechts');
  await clickHole(page, '1F16');
  expect(await part('U1')).toMatchObject({ rotated: true, col: 16 });
});

test('rigid parts move as a whole: chip and LCD', async ({ page }) => {
  await page.goto('/');
  const wiring = JSON.stringify({ format: 'pp-virtual-board/wiring', version: 1, savedAt: '', parts: lcdCircuit() });
  await page.setInputFiles('#wiring-file', { name: 'l.json', mimeType: 'application/json', buffer: Buffer.from(wiring) });
  const part = (id: string) => sim(page, `pp.parts.find(p => p.id === "${id}")`);
  const dragBy = async (sel: string, dCols: number) => {
    await page.locator(sel).scrollIntoViewIfNeeded();
    const b = (await page.locator(sel).boundingBox())!;
    const a = await holeCenter(page, '4A10');
    const c = await holeCenter(page, `4A${10 + dCols}`);
    const x = b.x + Math.min(40, b.width / 2);
    const y = b.y + Math.min(20, b.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (c.x - a.x) / 2, y, { steps: 3 });
    await page.mouse.move(x + (c.x - a.x), y, { steps: 3 });
    await page.mouse.up();
  };
  await dragBy('[data-part="LCD"] .lcd-pcb', 5);
  expect(await part('LCD')).toMatchObject({ block: 2, row: 'J', col: 21 });
  await page.keyboard.press('ControlOrMeta+z');
  expect(await part('LCD')).toMatchObject({ col: 16 });
  await dragBy('[data-part="u1"] .chip-body', 3);
  expect(await part('u1')).toMatchObject({ block: 1, col: 19 });
});

test('leaving with unexported wiring asks first; after export it does not', async ({ page }) => {
  await page.goto('/');
  // The page objects to unloading iff it cancels the beforeunload event (the browser then asks the user).
  const objects = () => page.evaluate(() => {
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(await objects()).toBe(false); // empty board
  await page.click('[data-tool="wire"]');
  await clickHole(page, '2A5');
  await clickHole(page, '2A9');
  expect(await objects()).toBe(true); // unexported change
  await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  expect(await objects()).toBe(false); // exported
  await clickHole(page, '2A12');
  await clickHole(page, '2A15');
  expect(await objects()).toBe(true); // changed again
});
