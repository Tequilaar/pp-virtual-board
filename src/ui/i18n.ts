/** UI strings. German is the default; English as an alternative. */
const de = {
  title: 'PP Virtuelles Board',
  unofficial: 'Inoffizielles Lernwerkzeug',
  loadProgram: 'Programm laden (.elf/.hex)',
  noProgram: 'Kein Programm geladen',
  run: 'Start',
  pause: 'Pause',
  restart: 'Neustart',
  export: 'Verdrahtung exportieren',
  import: 'Verdrahtung importieren',
  includeProgram: 'Programm mitspeichern',
  clear: 'Alles entfernen',
  confirmClear: 'Alle Bauteile vom Board entfernen?',
  tools: 'Werkzeuge',
  select: 'Auswählen',
  wire: 'Draht',
  resistor: 'Widerstand',
  led: 'LED',
  button: 'Taster',
  capacitor: 'Kondensator',
  crystal: 'Quarz',
  mcu: 'ATmega1284P',
  power: 'Spannungsversorgung',
  status: 'Status',
  powered: 'Versorgung',
  clock: 'Takt (Quarz)',
  resetPin: 'RESET',
  program: 'Programm',
  runningState: 'Läuft',
  yes: 'ja',
  no: 'nein',
  low: 'low (Reset aktiv)',
  high: 'high',
  realtime: 'Echtzeit',
  simTime: 'Simulierte Zeit',
  warnings: 'Hinweise',
  none: 'keine',
  replaceFuse: 'Sicherung tauschen',
  hintSelect: 'Anklicken zum Auswählen, ziehen zum Verschieben (Beinende ziehen: nur dieses Bein umstecken). Entf löscht, R dreht den Prozessor, ⌘/Strg+Z macht rückgängig.',
  hintTwoLeg: 'Erstes Loch anklicken, dann zweites Loch. Esc bricht ab.',
  hintLed: 'Erst Anode (+, langes Bein), dann Kathode anklicken.',
  hintMcu: 'Loch in Reihe E oder F anklicken: dort liegt das linke Ende des Prozessors. R dreht ihn (Kerbe links/rechts).',
  hintPower: 'Klick auf das Board steckt die Versorgungsplatine oben links auf.',
  occupied: 'Loch ist schon belegt.',
  sameHole: 'Beide Beine im selben Loch.',
  mcuPlace: 'Prozessor: Loch in Reihe E oder F, Spalte 1–41, alle 40 Löcher frei.',
  onlyOne: 'Davon gibt es nur eines.',
  switchS: 'Schalter S',
  pin: 'Pin',
  blue: 'blau', red: 'rot', green: 'grün', yellow: 'gelb', black: 'schwarz', orange: 'orange',
  floatingNet: 'offen (undefiniert)',
  encoder: 'Drehgeber',
  servo: 'Servo',
  hintEncoder: 'Loch für Anschluss A anklicken: A, C, B liegen nebeneinander, die Taster-Anschlüsse 3 Reihen darüber. Drehen: Pfeile oder Mausrad über dem Knopf; Knopf drücken = Taster.',
  hintServo: 'Loch für das braune Kabel (GND) anklicken: rot (+5 V) und orange (Signal) folgen rechts daneben.',
  encoderPlace: 'Drehgeber: alle 5 Anschlüsse müssen auf freien Löchern im Steckfeld liegen.',
  servoPlace: 'Servo: drei freie Löcher nebeneinander nötig.',
  bounce: 'Kontaktprellen simulieren',
  starting: 'startet (Anlaufzeit)',
  servos: 'Servos',
  pulse: 'Puls',
  lcd: 'LCD 2×16',
  hintLcd: 'Loch für Pin 1 (VSS) anklicken: die 16 Pins des Displays stecken nebeneinander in dieser Reihe.',
  lcdPlace: 'LCD: 16 freie Löcher nebeneinander in einer Reihe des Steckfelds nötig.',
  jtag: 'JTAG-Stiftleiste',
  hintJtag: 'Loch in Reihe E anklicken: Pins 1/2 der Stiftleiste (1 GND, 2 TDI … 9 GND, 10 TCK) sitzen in dieser Spalte, über die Mittelrille.',
  jtagPlace: 'JTAG-Stiftleiste: Pin 1 in Reihe E, 10 freie Löcher (Reihen E/F) nötig.',
  jtagRequired: 'Programmieren nur über JTAG-Adapter (wie im Labor)',
  jtagNoHeader: 'Programmieren fehlgeschlagen: keine JTAG-Stiftleiste auf dem Board.',
  jtagFailed: 'Programmieren fehlgeschlagen (Atmel-ICE erreicht den Prozessor nicht): ',
  jtagOk: 'Programmiert über JTAG.',
  meter: 'Multimeter',
  hintMeter: 'Erst Loch für die rote Messspitze, dann für die schwarze anklicken. Erneuter Klick setzt neu.',
  meterOpen: 'offen',
  no3d: '3D-Ansicht nicht verfügbar: Der Browser stellt kein WebGL 2 bereit (Grafiktreiber oder Hardwarebeschleunigung prüfen). Die 2D-Ansicht funktioniert weiter.',
  meterCleared: 'Messspitzen entfernt.',
  undo: '↶ Rückgängig',
  redo: '↷ Wiederholen',
  rotatedLeft: 'Ausrichtung: Kerbe links (Pin 1 unten links).',
  rotatedRight: 'Ausrichtung: Kerbe rechts (Pin 1 oben rechts).',
  rotateHint: 'R dreht den Prozessor: erst mit „Auswählen“ anklicken, oder beim Platzieren drücken.',
  moveFailed: 'Verschieben nicht möglich: ',
  moveOffBoard: 'das Bauteil würde über den Rand des Boards hinausragen oder nicht mehr über die Mittelrille passen.',
  powerFixed: 'die Versorgungsplatine steckt fest auf der oberen Stromschiene.',
  view3d: '3D-Ansicht',
  view2d: '2D-Ansicht (verdrahten)',
  hint3d: '3D-Ansicht: ziehen zum Drehen, Mausrad zum Zoomen, rechte Maustaste zum Verschieben. Verdrahten in der 2D-Ansicht.',
} as const;

export type Key = keyof typeof de;

const en: Record<Key, string> = {
  title: 'PP Virtual Board',
  unofficial: 'Unofficial learning tool',
  loadProgram: 'Load program (.elf/.hex)',
  noProgram: 'No program loaded',
  run: 'Run',
  pause: 'Pause',
  restart: 'Restart',
  export: 'Export wiring',
  import: 'Import wiring',
  includeProgram: 'Include program',
  clear: 'Remove all',
  confirmClear: 'Remove all parts from the board?',
  tools: 'Tools',
  select: 'Select',
  wire: 'Wire',
  resistor: 'Resistor',
  led: 'LED',
  button: 'Push button',
  capacitor: 'Capacitor',
  crystal: 'Crystal',
  mcu: 'ATmega1284P',
  power: 'Power supply',
  status: 'Status',
  powered: 'Supply',
  clock: 'Clock (crystal)',
  resetPin: 'RESET',
  program: 'Program',
  runningState: 'Running',
  yes: 'yes',
  no: 'no',
  low: 'low (in reset)',
  high: 'high',
  realtime: 'Real time',
  simTime: 'Simulated time',
  warnings: 'Notes',
  none: 'none',
  replaceFuse: 'Replace fuse',
  hintSelect: 'Click to select, drag to move (drag a leg end to re-plug just that leg). Delete removes, R turns the chip, ⌘/Ctrl+Z undoes.',
  hintTwoLeg: 'Click the first hole, then the second. Esc cancels.',
  hintLed: 'Click the anode (+, long leg) first, then the cathode.',
  hintMcu: 'Click a hole in row E or F: the chip\'s left end goes there. R turns it (notch left/right).',
  hintPower: 'Click the board to plug the power board onto the top rails.',
  occupied: 'Hole is already in use.',
  sameHole: 'Both legs in the same hole.',
  mcuPlace: 'Chip: hole in row E or F, column 1–41, with all 40 holes free.',
  onlyOne: 'There is only one of these.',
  switchS: 'Switch S',
  pin: 'Pin',
  blue: 'blue', red: 'red', green: 'green', yellow: 'yellow', black: 'black', orange: 'orange',
  floatingNet: 'floating (undefined)',
  encoder: 'Rotary encoder',
  servo: 'Servo',
  hintEncoder: 'Click the hole for pin A: A, C, B sit side by side, the switch pins 3 rows above. Turn: arrows or mouse wheel over the knob; press the knob = push switch.',
  hintServo: 'Click the hole for the brown wire (GND): red (+5 V) and orange (signal) follow to the right.',
  encoderPlace: 'Encoder: all 5 pins must sit on free terminal holes.',
  servoPlace: 'Servo: needs three free holes side by side.',
  bounce: 'Simulate contact bounce',
  starting: 'starting (start-up delay)',
  servos: 'Servos',
  pulse: 'pulse',
  lcd: 'LCD 2×16',
  hintLcd: 'Click the hole for pin 1 (VSS): the display\'s 16 pins go side by side into this row.',
  lcdPlace: 'LCD: needs 16 free holes side by side in one terminal row.',
  jtag: 'JTAG header',
  hintJtag: 'Click a hole in row E: header pins 1/2 (1 GND, 2 TDI … 9 GND, 10 TCK) sit in that column, across the gap.',
  jtagPlace: 'JTAG header: pin 1 in row E, needs 10 free holes (rows E/F).',
  jtagRequired: 'Program only through the JTAG adapter (as in the lab)',
  jtagNoHeader: 'Programming failed: no JTAG header on the board.',
  jtagFailed: 'Programming failed (the Atmel-ICE cannot reach the chip): ',
  jtagOk: 'Programmed via JTAG.',
  meter: 'Multimeter',
  hintMeter: 'Click a hole for the red probe, then one for the black probe. Click again to start over.',
  meterOpen: 'open',
  no3d: '3D view not available: the browser provides no WebGL 2 (check the graphics driver or hardware acceleration). The 2D view keeps working.',
  meterCleared: 'Probes removed.',
  undo: '↶ Undo',
  redo: '↷ Redo',
  rotatedLeft: 'Orientation: notch left (pin 1 bottom left).',
  rotatedRight: 'Orientation: notch right (pin 1 top right).',
  rotateHint: 'R turns the chip: select it first, or press R while placing it.',
  moveFailed: 'Cannot move there: ',
  moveOffBoard: 'the part would stick out of the board or no longer straddle the centre gap.',
  powerFixed: 'the power board is plugged onto the top rails.',
  view3d: '3D view',
  view2d: '2D view (wiring)',
  hint3d: '3D view: drag to rotate, mouse wheel to zoom, right button to pan. Wiring happens in the 2D view.',
};

let lang: 'de' | 'en' = 'de';
export const setLang = (l: 'de' | 'en') => (lang = l);
export const getLang = () => lang;
export const t = (k: Key): string => (lang === 'de' ? de[k] : en[k]);

/** German wording of simulator warnings, by code prefix; {name} is filled from the warning's params. */
const WARN_DE: Record<string, string> = {
  fuse: 'Sicherung der Versorgungsplatine durchgebrannt (mehr als 0,5 A): Kurzschluss suchen.',
  'power-off': 'Schalter S der Versorgungsplatine ist aus.',
  'no-vcc': 'Mikrocontroller hat keine Versorgung an VCC (Pin 10).',
  'no-gnd': 'GND des Mikrocontrollers (Pin 11/31) ist nicht mit Masse verbunden.',
  'one-gnd': 'Nur einer der beiden GND-Pins (11, 31) ist angeschlossen.',
  'no-crystal': 'Kein Quarz zwischen XTAL1 und XTAL2: Der Prozessor hat keinen Takt und läuft nicht.',
  'no-avcc': 'AVCC (Pin 30) liegt nicht an 5 V: Port A funktioniert nicht.',
  burnt: 'LED {id} durch Überstrom zerstört (Vorwiderstand vergessen?).',
  overload: '{pin} liefert {mA} mA, mehr als die maximal zulässigen 40 mA.',
  floating: '{pin} ist Eingang ohne Pull-Up und wird von nichts getrieben: Pegel undefiniert.',
  undefined: '{pin} liegt bei {v} V, zwischen den Eingangsschwellen (1,5 V / 3 V).',
  'servo-range': 'Servo {id}: Puls {us} µs liegt außerhalb 500–2500 µs; das Servo steht am Anschlag.',
  'servo-power': 'Servo {id} hat keine 5-V-Versorgung zwischen rotem und braunem Kabel.',
  'lcd-enable-high': 'LCD {id}: E war kürzer als 450 ns auf High (Datenblatt PWEH).',
  'lcd-enable-cycle': 'LCD {id}: weniger als 1000 ns zwischen zwei steigenden Flanken von E (Datenblatt tcycE).',
  'lcd-address-setup': 'LCD {id}: RS/RW weniger als 140 ns vor der steigenden Flanke von E geändert (Datenblatt tAS).',
  'lcd-data-setup': 'LCD {id}: Daten weniger als 195 ns vor der fallenden Flanke von E geändert (Datenblatt tDSW).',
  'lcd-write-while-busy': 'LCD {id}: Befehl oder Zeichen gesendet, während das Busy-Flag gesetzt war – vom Display ignoriert.',
  'lcd-short-power-off': 'LCD {id}: Versorgung kürzer als 1 ms aus – Power-On-Reset nicht garantiert.',
};

export function warningText(code: string, english: string, params: Record<string, string> = {}): string {
  if (lang !== 'de') return english;
  const tpl = WARN_DE[code.split(':')[0]];
  return tpl ? tpl.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '') : english;
}

/** Wording of a JTAG problem code from BoardSim.jtagCheck(). */
export function jtagProblem(code: string): string {
  if (code === 'power') return lang === 'de' ? 'keine Zielspannung (VTref)' : 'no target voltage (VTref)';
  if (code.startsWith('GND')) return lang === 'de' ? `Pin ${code.slice(3)} (GND) nicht an Masse` : `pin ${code.slice(3)} (GND) not grounded`;
  const [sig, pin] = code.split('-');
  return lang === 'de' ? `${sig} nicht mit ${pin} verbunden` : `${sig} not connected to ${pin}`;
}

/** Wording of a wiring-file or placement problem (see circuit/validate.ts). */
export function problemText(p: { code: string; part: string; detail?: string }): string {
  const d = p.detail ?? '';
  const de: Record<string, string> = {
    'unknown-kind': `Bauteil ${p.part}: unbekannter Typ „${d}“`,
    'bad-id': 'Bauteil ohne gültige Kennung',
    'duplicate-id': `Kennung ${p.part} kommt mehrfach vor`,
    'bad-number': `Bauteil ${p.part}: ungültiger Wert für „${d}“`,
    'bad-color': `LED ${p.part}: unbekannte Farbe „${d}“`,
    'bad-hole': `Bauteil ${p.part}: Loch ${d || '?'} gibt es auf dem Board nicht`,
    'hole-used-twice': `Bauteil ${p.part}: Loch ${d} ist schon belegt`,
    'pins-share-strip': `Bauteil ${p.part}: mehrere Pins im selben Kontaktstreifen (wären kurzgeschlossen)`,
    'only-one': `Bauteil ${p.part}: davon gibt es auf dem Board nur eines`,
  };
  const en: Record<string, string> = {
    'unknown-kind': `Part ${p.part}: unknown type "${d}"`,
    'bad-id': 'Part without a valid id',
    'duplicate-id': `Id ${p.part} occurs more than once`,
    'bad-number': `Part ${p.part}: invalid value for "${d}"`,
    'bad-color': `LED ${p.part}: unknown colour "${d}"`,
    'bad-hole': `Part ${p.part}: hole ${d || '?'} does not exist on the board`,
    'hole-used-twice': `Part ${p.part}: hole ${d} is already in use`,
    'pins-share-strip': `Part ${p.part}: several pins in the same contact strip (they would be shorted)`,
    'only-one': `Part ${p.part}: there is only one of these on the board`,
  };
  return (lang === 'de' ? de : en)[p.code] ?? `${p.part}: ${p.code}`;
}

/** Wording of a file-level import failure. */
export function fileErrorText(reason: string): string {
  const de: Record<string, string> = {
    json: 'Keine Verdrahtungsdatei (kein gültiges JSON).',
    format: 'Keine Verdrahtungsdatei dieses Programms.',
    version: 'Die Verdrahtungsdatei stammt aus einer neueren Version dieses Programms.',
    'no-parts': 'Die Verdrahtungsdatei enthält keine Bauteile.',
    parts: 'Verdrahtungsdatei nicht geladen:',
  };
  const en: Record<string, string> = {
    json: 'Not a wiring file (invalid JSON).',
    format: 'Not a wiring file of this program.',
    version: 'The wiring file comes from a newer version of this program.',
    'no-parts': 'The wiring file contains no parts.',
    parts: 'Wiring file not loaded:',
  };
  return (lang === 'de' ? de : en)[reason] ?? reason;
}

/** Wording of a program-loading failure (FirmwareError code). */
export function firmwareErrorText(code: string, detail = ''): string {
  const de: Record<string, string> = {
    unrecognised: 'Unbekanntes Dateiformat: erwartet wird eine .elf- oder .hex-Datei von avr-gcc.',
    'elf-format': 'Keine gültige ELF-Datei (32 Bit, Little Endian erwartet).',
    'not-avr': 'Diese ELF-Datei ist nicht für AVR übersetzt. Mit avr-gcc kompilieren.',
    'too-large': 'Das Programm passt nicht in den 128-KB-Flash des ATmega1284P.',
    'no-code': 'Die Datei enthält keinen Programmcode.',
    hex: `Fehler in der HEX-Datei (Zeile ${detail}).`,
    'wrong-device': `Programmieren abgelehnt: das Programm ist für ${detail} übersetzt, nicht für den ATmega1284P (Option -mmcu=atmega1284p prüfen).`,
  };
  const en: Record<string, string> = {
    unrecognised: 'Unknown file format: expected an .elf or .hex file from avr-gcc.',
    'elf-format': 'Not a valid ELF file (32-bit little-endian expected).',
    'not-avr': 'This ELF file is not compiled for AVR. Compile with avr-gcc.',
    'too-large': 'The program does not fit into the 128 KB flash of the ATmega1284P.',
    'no-code': 'The file contains no program code.',
    hex: `Error in the HEX file (line ${detail}).`,
    'wrong-device': `Programming refused: the program is built for ${detail}, not for the ATmega1284P (check -mmcu=atmega1284p).`,
  };
  return (lang === 'de' ? de : en)[code] ?? code;
}
