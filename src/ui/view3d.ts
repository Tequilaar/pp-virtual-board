/**
 * 3D view of the board for looking at it from any angle (wiring stays in the 2D top view).
 * Built from the same parts list and hole coordinates as the 2D board; live state (LEDs, LCD, servo, encoder,
 * power board) is pushed in every frame by `update`.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BLOCKS, COLUMNS, RAIL_PAIRS, dipHole } from '../circuit/breadboard';
import type { Part } from '../circuit/parts';
import { HEIGHT, P, WIDTH, allHoles, blockBounds, colX, holePos, railBounds, railY, rowY } from './layout';
import { type LcdViewData, lcdKey, paintLcdCanvas } from './render';

const S = 0.1; // SVG units → world units
const toX = (x: number) => (x - WIDTH / 2) * S;
const toZ = (y: number) => (y - HEIGHT / 2) * S;
const hole3 = (id: string, h = 0) => {
  const p = holePos(id)!;
  return new THREE.Vector3(toX(p.x), h, toZ(p.y));
};

/**
 * Lambert shading: far cheaper than physically based materials on CPU renderers (no GPU, Firefox in VMs),
 * and indistinguishable at this scale. `roughness`/`metalness` are accepted and ignored.
 */
type MatOptions = Partial<THREE.MeshLambertMaterialParameters> & { roughness?: number; metalness?: number };
const mat = (color: number, extra: MatOptions = {}) => {
  const { roughness: _r, metalness: _m, ...rest } = extra;
  return new THREE.MeshLambertMaterial({ color, ...rest });
};
const METAL = mat(0xc4c8ce);

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** A leg from a hole straight up to height `h`. */
function leg(id: string, h: number) {
  const p = hole3(id);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), METAL);
  m.position.set(p.x, h / 2, p.z);
  return m;
}

/** A body between two holes, with legs, lying at height `h`. */
function lyingBody(a: string, b: string, h: number, body: THREE.Mesh) {
  const g = new THREE.Group();
  const pa = hole3(a, h);
  const pb = hole3(b, h);
  g.add(leg(a, h), leg(b, h));
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, pa.distanceTo(pb), 6), METAL);
  wire.position.copy(pa).lerp(pb, 0.5);
  wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize());
  g.add(wire);
  body.position.copy(pa).lerp(pb, 0.5);
  body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize());
  g.add(body);
  return g;
}

interface Live {
  leds: Map<string, THREE.MeshLambertMaterial>;
  servoArms: Map<string, THREE.Object3D>;
  knobs: Map<string, THREE.Object3D>;
  buttons: Map<string, THREE.Object3D>;
  lcds: Map<string, { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; key: string }>;
  power: { led2: THREE.MeshLambertMaterial; knob: THREE.Object3D } | null;
}

export class View3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private partsGroup = new THREE.Group();
  private live: Live = { leds: new Map(), servoArms: new Map(), knobs: new Map(), buttons: new Map(), lcds: new Map(), power: null };
  private resizeObserver: ResizeObserver;

  /** Only draw when the camera moved or something visible changed. */
  private dirty = true;
  private lastSignature = '';
  /** True when WebGL runs in software (no GPU): lower resolution, no anti-aliasing. */
  readonly software: boolean;
  /** Frame-time statistics; also drive the adaptive quality below. */
  readonly stats = { renderer: '', renders: 0, totalMs: 0, maxMs: 0, avgMs: 0, lowQuality: false, throttleMs: 0 };
  private lastRenderAt = 0;

  constructor(private container: HTMLElement) {
    this.software = isSoftwareWebGL();
    this.stats.renderer = rendererName();
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.software, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(this.software ? 1 : Math.min(2, window.devicePixelRatio));
    container.append(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
    this.camera.position.set(0, 95, 85);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.software;
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.maxPolarAngle = Math.PI * 0.95;
    this.scene.background = new THREE.Color(0xe9e6df);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(40, 90, 50);
    this.scene.add(sun);
    this.scene.add(this.buildBoard(), this.partsGroup);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  private resize() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  /** Breadboard: base plate, terminal blocks, rails with red/blue lines, all holes as one instanced mesh. */
  private buildBoard() {
    const g = new THREE.Group();
    g.add(box(WIDTH * S, 1, HEIGHT * S, mat(0xd9d4c8), 0, -0.5, 0));
    const plate = mat(0xf7f5ef);
    for (let b = 1; b <= BLOCKS; b++) {
      const bb = blockBounds(b);
      g.add(box((COLUMNS + 1) * P * S, 0.2, (bb.bottom - bb.top) * S, plate, toX(colX(COLUMNS / 2 + 0.5)), 0.1, toZ((bb.top + bb.bottom) / 2)));
    }
    for (let r = 0; r < RAIL_PAIRS; r++) {
      const rb = railBounds(r);
      g.add(box((COLUMNS + 1) * P * S, 0.2, (rb.bottom - rb.top) * S, plate, toX(colX(COLUMNS / 2 + 0.5)), 0.1, toZ((rb.top + rb.bottom) / 2)));
      g.add(box(COLUMNS * P * S, 0.05, 0.12, mat(0x2f6fdb), toX(colX(COLUMNS / 2 + 0.5)), 0.22, toZ(railY(r, '-') - P / 2)));
      g.add(box(COLUMNS * P * S, 0.05, 0.12, mat(0xe5484d), toX(colX(COLUMNS / 2 + 0.5)), 0.22, toZ(railY(r, '+') + P / 2)));
    }
    const holes = allHoles();
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.05, 0.62), mat(0x2b2a27), holes.length);
    const m4 = new THREE.Matrix4();
    holes.forEach((id, i) => {
      const p = hole3(id, 0.21);
      inst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z));
    });
    g.add(inst);
    return g;
  }

  private framed = false;

  /** Rebuild all parts (after any wiring change). The first time, aim the camera at what is on the board. */
  setParts(parts: Part[]) {
    this.partsGroup.clear();
    this.live = { leds: new Map(), servoArms: new Map(), knobs: new Map(), buttons: new Map(), lcds: new Map(), power: null };
    for (const p of parts) this.partsGroup.add(this.buildPart(p));
    this.dirty = true;
    this.lastSignature = '';
    if (!this.framed && parts.length) {
      this.framed = true;
      const bb = new THREE.Box3().setFromObject(this.partsGroup);
      const center = bb.getCenter(new THREE.Vector3()).setY(0);
      const size = Math.max(30, bb.getSize(new THREE.Vector3()).length());
      this.controls.target.copy(center);
      this.camera.position.copy(center).add(new THREE.Vector3(0, size * 0.75, size * 0.62));
      this.controls.update();
    }
  }

  private buildPart(p: Part): THREE.Object3D {
    const g = new THREE.Group();
    switch (p.kind) {
      case 'wire': {
        const a = hole3(p.a, 0.2);
        const b = hole3(p.b, 0.2);
        const lift = Math.min(4, 0.6 + a.distanceTo(b) * 0.12);
        const curve = new THREE.CatmullRomCurve3([
          a,
          a.clone().setY(lift * 0.8),
          a.clone().lerp(b, 0.5).setY(lift),
          b.clone().setY(lift * 0.8),
          b,
        ]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.13, 6), mat(new THREE.Color(p.color ?? '#2f7de1').getHex())));
        break;
      }
      case 'resistor': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.8, 12), mat(0xe3c79a));
        g.add(lyingBody(p.a, p.b, 0.9, body));
        break;
      }
      case 'capacitor': {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mat(0xc98b3a));
        g.add(lyingBody(p.a, p.b, 1.2, body));
        break;
      }
      case 'crystal': {
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.4, 4, 10), METAL);
        g.add(lyingBody(p.a, p.b, 0.9, body));
        break;
      }
      case 'led': {
        const a = hole3(p.anode);
        const c = hole3(p.cathode);
        const mid = a.clone().lerp(c, 0.5);
        g.add(leg(p.anode, 2.4), leg(p.cathode, 2.1));
        const colors = { red: 0xff3b30, green: 0x34d058, yellow: 0xffd60a, white: 0xf2f6ff };
        const m = mat(colors[p.color], { transparent: true, opacity: 0.85, emissive: colors[p.color], emissiveIntensity: 0 });
        const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 1.6, 16), m);
        dome.position.set(mid.x, 3.0, mid.z);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
        cap.position.set(mid.x, 3.8, mid.z);
        g.add(dome, cap);
        this.live.leds.set(p.id, m);
        break;
      }
      case 'button': {
        const a = hole3(p.a);
        const b = hole3(p.b);
        const mid = a.clone().lerp(b, 0.5);
        g.add(leg(p.a, 0.8), leg(p.b, 0.8), box(1.2, 0.7, 1.2, mat(0x2b2b2b), mid.x, 1.1, mid.z));
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.5, 14), mat(0x6d6d6d));
        cap.position.set(mid.x, 1.65, mid.z);
        g.add(cap);
        this.live.buttons.set(p.id, cap);
        break;
      }
      case 'mcu': {
        const first = holePos(dipHole(p.block, p.col, 40, 1, p.rotated))!;
        const x0 = colX(p.col);
        const x1 = colX(p.col + 19);
        const zE = rowY(p.block, 'E');
        const zF = rowY(p.block, 'F');
        g.add(box((x1 - x0 + P * 1.1) * S, 1.0, (zF - zE + P * 0.3) * S, mat(0x2a2a2c, { roughness: 0.5 }), toX((x0 + x1) / 2), 1.0, toZ((zE + zF) / 2)));
        for (let n = 1; n <= 40; n++) g.add(leg(dipHole(p.block, p.col, 40, n, p.rotated), 0.8));
        const notch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), mat(0x4a4a4d));
        notch.position.set(toX(p.rotated ? x1 + P * 0.4 : x0 - P * 0.4), 1.52, toZ((zE + zF) / 2));
        g.add(notch);
        void first;
        break;
      }
      case 'encoder': {
        const a = hole3(p.a);
        const b = hole3(p.b);
        const s1 = hole3(p.sw1);
        const cx = (a.x + b.x) / 2;
        const cz = (a.z + s1.z) / 2;
        for (const h of [p.a, p.c, p.b, p.sw1, p.sw2]) g.add(leg(h, 0.8));
        g.add(box(1.25, 0.9, Math.abs(s1.z - a.z) + 0.6, mat(0x2d2f33), cx, 1.2, cz));
        const knob = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.4, 20), mat(0xa9afb7, { metalness: 0.5 }));
        shaft.position.y = 1.2;
        const mark = box(0.12, 0.06, 0.4, mat(0x222222), 0, 2.42, -0.2);
        knob.add(shaft, mark);
        knob.position.set(cx, 1.6, cz);
        g.add(knob);
        this.live.knobs.set(p.id, knob);
        break;
      }
      case 'servo': {
        const gnd = hole3(p.gnd);
        const body = box(4.0, 3.6, 2.0, mat(0x1f5fbf), gnd.x + 3.8, 1.8, gnd.z - 4);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16), mat(0xe8e8e8));
        hub.position.set(gnd.x + 4.9, 3.8, gnd.z - 4);
        const arm = new THREE.Group();
        arm.add(box(2.6, 0.18, 0.45, mat(0xf4f4f4), -1.2, 0, 0));
        arm.position.set(gnd.x + 4.9, 4.05, gnd.z - 4);
        g.add(body, hub, arm);
        for (const [h, color] of [[p.gnd, 0x6b3d1f], [p.vcc, 0xd62c2c], [p.signal, 0xf08a17]] as const) {
          const s = hole3(h, 0.2);
          const curve = new THREE.CatmullRomCurve3([s, s.clone().setY(1.5), new THREE.Vector3(gnd.x + 2, 1.2, gnd.z - 3.2)]);
          g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.1, 5), mat(color)));
        }
        this.live.servoArms.set(p.id, arm);
        break;
      }
      case 'lcd': {
        const p1 = hole3(`${p.block}${p.row}${p.col}`);
        const p16 = hole3(`${p.block}${p.row}${p.col + 15}`);
        for (let i = 0; i < 16; i++) g.add(leg(`${p.block}${p.row}${p.col + i}`, 3));
        const w = (p16.x - p1.x) + 8 * P * S;
        const cx = p1.x - 1.2 * P * S + w / 2;
        const cz = p1.z - 3.6;
        g.add(box(w, 0.25, 7.6, mat(0x1d6b37), cx, 3.1, cz));
        g.add(box(w - 1.6, 0.6, 5.0, mat(0x111111), cx, 3.5, cz - 0.6));
        const canvas = document.createElement('canvas');
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 2.6, 3.6), new THREE.MeshBasicMaterial({ map: texture }));
        screen.rotation.x = -Math.PI / 2;
        screen.position.set(cx, 3.82, cz - 0.6);
        g.add(screen);
        this.live.lcds.set(p.id, { canvas, texture, key: '' });
        break;
      }
      case 'jtag': {
        const e = hole3(`${p.block}E${p.col}`);
        const f = hole3(`${p.block}F${p.col + 4}`);
        g.add(box(f.x - e.x + 2.2, 0.9, f.z - e.z + 1.6, mat(0x1b1b1d), (e.x + f.x) / 2, 0.9, (e.z + f.z) / 2));
        for (let i = 0; i < 10; i++) {
          const h = hole3(`${p.block}${i % 2 === 0 ? 'E' : 'F'}${p.col + Math.floor(i / 2)}`);
          g.add(box(0.25, 2.4, 0.25, METAL, h.x, 1.4, h.z));
        }
        break;
      }
      case 'power': {
        const x0 = toX(colX(1) - P * 0.8);
        const x1 = toX(colX(7) + P * 0.4);
        const zb = toZ(railY(p.railPair, '+') + P * 0.4);
        const zt = zb - 5.3 * P * S;
        const cx = (x0 + x1) / 2;
        const cz = (zb + zt) / 2;
        g.add(box(x1 - x0, 0.3, zb - zt, mat(0x1f7a3f), cx, 2.2, cz), box(2.4, 1.2, 1.8, METAL, x0 + 1.6, 3.0, zt + 1.5));
        const led1 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(0x2ee66b, { emissive: 0x2ee66b, emissiveIntensity: 1.5 }));
        led1.position.set(x0 + 4.2, 2.5, zt + 1.2);
        const led2m = mat(0xff4040, { emissive: 0xff4040, emissiveIntensity: 0 });
        const led2 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), led2m);
        led2.position.set(x0 + 6.2, 2.5, zt + 1.2);
        const knob = box(0.8, 0.6, 0.9, mat(0x333333), x0 + 8.5, 2.7, zt + 1.6);
        g.add(led1, led2, knob, leg(`R${p.railPair}+1`, 2.2), leg(`R${p.railPair}-1`, 2.2));
        this.live.power = { led2: led2m, knob };
        break;
      }
    }
    return g;
  }

  /** Push live state into the scene and draw a frame. */
  update(state: {
    led: (id: string) => number;
    servoAngle: (id: string) => number | undefined;
    encoderDetents: (id: string) => number;
    pressed: (id: string) => boolean;
    lcd: (id: string) => LcdViewData | null;
    blinkPhase: boolean;
    powerOut: boolean;
    switchOn: boolean;
  }) {
    // Signature of everything visible; skip the frame when it and the camera are unchanged.
    let sig = '';
    for (const id of this.live.leds.keys()) sig += Math.round(Math.min(1, state.led(id) / 0.01) * 50) + ',';
    for (const id of this.live.servoArms.keys()) sig += Math.round(state.servoAngle(id) ?? -1) + ',';
    for (const id of this.live.knobs.keys()) sig += state.encoderDetents(id) + (state.pressed(`${id}:SW`) ? 'p' : '') + ',';
    for (const id of this.live.buttons.keys()) sig += state.pressed(id) ? 'P' : 'r';
    for (const id of this.live.lcds.keys()) sig += lcdKey(state.lcd(id), state.blinkPhase);
    sig += state.powerOut;
    if (sig !== this.lastSignature) {
      this.lastSignature = sig;
      this.dirty = true;
    }
    if (this.controls.enableDamping) this.controls.update();
    if (!this.dirty) return;
    // Adaptive: a slow renderer (no GPU, old laptop) must not freeze the page. Keep 3D below ~20 % of the time.
    const now = performance.now();
    if (now - this.lastRenderAt < this.stats.throttleMs) return;
    this.dirty = false;
    for (const [id, m] of this.live.leds) m.emissiveIntensity = Math.min(1, state.led(id) / 0.01) * 2.5;
    for (const [id, arm] of this.live.servoArms) {
      const a = state.servoAngle(id);
      if (a !== undefined) arm.rotation.y = -(a * Math.PI) / 180; // 0° left, 90° away from the plug, 180° right
    }
    for (const [id, knob] of this.live.knobs) {
      knob.rotation.y = -(state.encoderDetents(id) * Math.PI) / 12;
      knob.position.y = state.pressed(`${id}:SW`) ? 1.35 : 1.6;
    }
    for (const [id, cap] of this.live.buttons) cap.position.y = state.pressed(id) ? 1.45 : 1.65;
    for (const [id, l] of this.live.lcds) {
      const view = state.lcd(id);
      const key = lcdKey(view, state.blinkPhase);
      if (key !== l.key) {
        l.key = key;
        paintLcdCanvas(view, state.blinkPhase, l.canvas);
        l.texture.needsUpdate = true;
      }
    }
    if (this.live.power) {
      this.live.power.led2.emissiveIntensity = state.powerOut ? 1.5 : 0;
      this.live.power.knob.position.z += 0; // switch position shown via LED2 only
    }
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    const ms = performance.now() - t0;
    this.lastRenderAt = performance.now();
    const st = this.stats;
    st.renders++;
    st.totalMs += ms;
    st.maxMs = Math.max(st.maxMs, ms);
    // The first frames include one-off work (shader compilation, uploads): leave them out of the average.
    if (st.renders <= 2) return;
    st.avgMs = st.avgMs === 0 ? ms : 0.7 * st.avgMs + 0.3 * ms;
    if (!st.lowQuality && st.avgMs > 25) {
      st.lowQuality = true;
      this.renderer.setPixelRatio(1);
      this.resize();
    }
    // Keep 3D below ~20 % of the time, but never pause redraws longer than 0.4 s.
    st.throttleMs = st.avgMs > 12 ? Math.min(400, 4 * st.avgMs) : 0;
  }

  get canvas() {
    return this.renderer.domElement;
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function rendererName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'none';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    return 'error';
  }
}

/** WebGL backed by a CPU rasteriser (SwiftShader, llvmpipe, Microsoft Basic Render Driver, …). */
function isSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(name);
  } catch {
    return true;
  }
}
