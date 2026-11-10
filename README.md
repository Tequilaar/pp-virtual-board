# PP Virtual Board

**中文** · [English](#english) · [Deutsch](#deutsch)

一个在浏览器里运行的 ATmega1284P 虚拟实验板（非官方）：在面包板上插线，载入你自己用 avr-gcc 编译的程序（`.elf` / `.hex`），像在真实的板子上一样运行和调试。

- **芯片**：ATmega1284P，20 MHz，端口 A–D、外部/引脚变化中断、Timer0–3、PWM（基于 [avr8js](https://github.com/wokwi/avr8js) 与自写的 1284P 配置）。
- **面包板与电路**：两块面包板（4 个插接区 × 60 列，5 组电源轨），USB 电源板（开关 S、保险丝），导线、电阻、LED、按钮、电容、晶振、旋转编码器、舵机、HD44780 字符液晶屏（2×16）、JTAG 排针、万用表。
- **电气行为**：供电/晶振/复位决定芯片能否运行；LED 极性与限流、短路熔断、悬空输入、RC 消抖、触点抖动、上电启动延时等都按数据手册建模。
- **操作**：点两个孔插元件；拖动移动元件（拖脚端只换一只脚）；R 键旋转芯片；撤销/重做（⌘/Ctrl+Z、⌘/Ctrl+Y）；3D 视图查看（需要 WebGL 2）；接线可导出/导入为文件。
- **界面语言**：德语（默认）、英语。

### 使用

1. 用 avr-gcc 编译：`avr-gcc -mmcu=atmega1284p -DF_CPU=20000000UL -Os -o p.elf p.c`
2. 在网页里搭好电路，点 “Programm laden” 或把 `p.elf` 拖进页面。

支持桌面版 Chrome、Edge、Firefox、Safari（Windows / macOS / Linux）。所有内容都在浏览器本地运行，不上传任何数据。

### 开发

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # 单元测试（需要 avr-gcc）
npm run test:e2e   # 浏览器端到端测试（Playwright）
```

### 说明

非官方项目，与任何学校或课程无关。部分模型参数（如引脚内阻、触点抖动、LCD 4 位模式的细节）为典型值或假设，见源码注释。

---

<a id="english"></a>
## English

An unofficial ATmega1284P lab board that runs in the browser: wire a breadboard, load the program you compiled with avr-gcc (`.elf` / `.hex`), and run it as on the real board.

- **Chip**: ATmega1284P at 20 MHz, ports A–D, external and pin-change interrupts, Timer0–3, PWM (built on [avr8js](https://github.com/wokwi/avr8js) with an own 1284P configuration).
- **Breadboard and circuit**: two breadboards (4 terminal blocks × 60 columns, 5 rail pairs), USB power board (switch S, fuse), wires, resistors, LEDs, push buttons, capacitors, crystal, rotary encoder, servo, HD44780 character LCD (2×16), JTAG header, multimeter.
- **Electrical behaviour**: supply, crystal and RESET decide whether the chip runs; LED polarity and current, blown fuse on shorts, floating inputs, RC debounce, contact bounce and start-up delay are modelled from the datasheets.
- **Editing**: two clicks place a part; drag to move (drag a leg end to re-plug one leg); R turns the chip; undo/redo (⌘/Ctrl+Z, ⌘/Ctrl+Y); 3D view (needs WebGL 2); export/import the wiring as a file.
- **Languages**: German (default), English.

### Usage

1. Compile with avr-gcc: `avr-gcc -mmcu=atmega1284p -DF_CPU=20000000UL -Os -o p.elf p.c`
2. Build the circuit in the page, then click “Programm laden” or drop `p.elf` onto the page.

Desktop Chrome, Edge, Firefox and Safari on Windows, macOS and Linux. Everything runs locally in the browser; no data is sent anywhere.

### Development

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # unit tests (needs avr-gcc)
npm run test:e2e   # end-to-end browser tests (Playwright)
```

### Notes

Unofficial project, not affiliated with any university or course. Some model parameters (pin driver resistance, contact bounce, details of the LCD's 4-bit mode) are typical values or assumptions, documented in the source.

---

<a id="deutsch"></a>
## Deutsch

Ein inoffizielles ATmega1284P-Laborboard im Browser: Steckbrett verdrahten, das selbst mit avr-gcc übersetzte Programm (`.elf` / `.hex`) laden und wie auf dem echten Board laufen lassen.

- **Prozessor**: ATmega1284P mit 20 MHz, Ports A–D, externe und Pin-Change-Interrupts, Timer0–3, PWM (auf Basis von [avr8js](https://github.com/wokwi/avr8js) mit eigener 1284P-Konfiguration).
- **Steckbrett und Schaltung**: zwei Steckbretter (4 Steckfelder × 60 Spalten, 5 Versorgungsschienen-Paare), USB-Versorgungsplatine (Schalter S, Sicherung), Drähte, Widerstände, LEDs, Taster, Kondensatoren, Quarz, Drehgeber, Servo, HD44780-Textdisplay (2×16), JTAG-Stiftleiste, Multimeter.
- **Elektrisches Verhalten**: Versorgung, Quarz und RESET entscheiden, ob der Prozessor läuft; LED-Polung und -Strom, Sicherung bei Kurzschluss, offene Eingänge, RC-Entprellung, Kontaktprellen und Anlaufzeit sind nach den Datenblättern modelliert.
- **Bedienung**: zwei Klicks setzen ein Bauteil; Ziehen verschiebt (Beinende ziehen: nur dieses Bein umstecken); R dreht den Prozessor; Rückgängig/Wiederholen (⌘/Strg+Z, ⌘/Strg+Y); 3D-Ansicht (benötigt WebGL 2); Verdrahtung als Datei exportieren/importieren.
- **Sprachen**: Deutsch (Standard), Englisch.

### Verwendung

1. Mit avr-gcc übersetzen: `avr-gcc -mmcu=atmega1284p -DF_CPU=20000000UL -Os -o p.elf p.c`
2. Schaltung im Browser aufbauen, dann „Programm laden“ anklicken oder `p.elf` auf die Seite ziehen.

Desktop-Browser Chrome, Edge, Firefox und Safari unter Windows, macOS und Linux. Alles läuft lokal im Browser; es werden keine Daten übertragen.

### Entwicklung

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # Unit-Tests (benötigt avr-gcc)
npm run test:e2e   # End-to-End-Tests im Browser (Playwright)
```

### Hinweise

Inoffizielles Projekt, ohne Verbindung zu einer Hochschule oder Lehrveranstaltung. Einige Modellparameter (Treiberwiderstand der Pins, Kontaktprellen, Details des 4-Bit-Modus des Displays) sind typische Werte oder Annahmen und im Quelltext dokumentiert.

---

## License / 许可 / Lizenz

MIT © 2026 Yuzhe Yan. Third-party: [avr8js](https://github.com/wokwi/avr8js) (MIT), [three.js](https://threejs.org) (MIT), HD44780 A00 font table from [wokwi-elements](https://github.com/wokwi/wokwi-elements) (MIT, © Uri Shaked). Datasheets are linked, not included: [ATmega1284P](https://www.microchip.com/en-us/product/ATmega1284P).
