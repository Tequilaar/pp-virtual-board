# PP Virtual Board

### ▶ [https://tequilaar.github.io/pp-virtual-board/](https://tequilaar.github.io/pp-virtual-board/)

**中文** · [English](#english) · [Deutsch](#deutsch)

一个在浏览器里运行的 ATmega1284P 虚拟实验板（非官方）：在面包板上插线，载入你自己用 avr-gcc 编译的程序（`.elf` / `.hex`），像在真实的板子上一样运行和调试。无需安装，点开上面的网址即可使用。

## 使用教程

### 1. 打开
用电脑上的 Chrome、Edge、Firefox 或 Safari 打开 **https://tequilaar.github.io/pp-virtual-board/** 。界面默认德语，右上角可切换英语。

### 2. 搭电路
左侧选工具，然后在面包板上点孔：
- **两脚元件**（导线、电阻、LED、按钮、电容、晶振）：先点第一个孔，再点第二个孔。LED 先点正极（长脚）。
- **芯片**：在 E 或 F 行点一下，芯片跨在中间槽上；放置前或选中后按 **R** 旋转。
- 鼠标悬停在孔上，底栏会显示孔位、芯片引脚和电压；同一导通条的孔会高亮。
- **移动**：用“Auswählen”拖动元件；拖元件的脚端只换这一只脚。**撤销 / 重做**：⌘/Ctrl+Z、⌘/Ctrl+Y，或顶栏按钮。
- 芯片要运行，至少需要：电源板、VCC 和两个 GND、AVCC、XTAL1/XTAL2 之间的 20 MHz 晶振（各接 33 pF 电容到地）。右侧“Status”会显示缺什么，“Hinweise”会提示接线问题。

### 3. 载入程序
1. 在自己电脑上编译：`avr-gcc -mmcu=atmega1284p -DF_CPU=20000000UL -Os -o p.elf p.c`
2. 点“Programm laden”选择 `p.elf`，或直接把文件拖进页面。改了代码重新编译后，再载入一次即可，接线不用重搭。

### 4. 保存到本地（重要）
网页**不会**自动保存你的接线：刷新或关闭页面后，未导出的接线会丢失（有未导出的改动时，浏览器会先提醒你）。
- **保存**：点“Verdrahtung exportieren”，浏览器会下载 `verdrahtung.ppboard.json`（通常在“下载”文件夹）。勾选“Programm mitspeichern”会把当前程序一起存进去。
- 建议把这个文件挪到你的代码文件夹里，放在 `p.c` 旁边，并改个好认的名字，例如 `led-blinken.ppboard.json`。
- **继续**：点“Verdrahtung importieren”选择文件，或直接把文件拖进页面。
- 经常导出：做完一步就存一次，比依赖浏览器可靠。

### 5. 更新与浏览器缓存
- 网页更新后，浏览器可能还在用旧版本。强制刷新即可拿到最新版：Windows / Linux 按 **Ctrl+F5**（或 Ctrl+Shift+R），Mac 按 **⌘+Shift+R**。
- 强制刷新同样会清空当前接线，**刷新前先导出**。旧的接线文件在新版本里可以继续导入。

### 6. 常见问题
- **芯片不运行**：看右侧“Status”：Versorgung（供电）、Takt（晶振）、RESET、Programm 是否都正常；上电后芯片约 66 ms 才开始运行。
- **程序被拒绝**：编译时要用 `-mmcu=atmega1284p`。
- **3D 视图打不开**：需要浏览器支持 WebGL 2（检查显卡驱动或开启硬件加速），2D 视图不受影响。
- 所有内容只在你的浏览器里运行，不会上传任何数据。

## 开发

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # 单元测试（需要 avr-gcc）
npm run test:e2e   # 浏览器端到端测试（Playwright）
```

非官方项目，与任何学校或课程无关。部分模型参数（如引脚内阻、触点抖动、LCD 4 位模式的细节）为典型值或假设，见源码注释。

---

<a id="english"></a>
## English

An unofficial ATmega1284P lab board that runs in the browser: wire a breadboard, load the program you compiled with avr-gcc (`.elf` / `.hex`), and run it as on the real board. Nothing to install — open **https://tequilaar.github.io/pp-virtual-board/** .

### Tutorial

**1. Open** https://tequilaar.github.io/pp-virtual-board/ in desktop Chrome, Edge, Firefox or Safari. The UI is German by default; switch to English at the top right.

**2. Build the circuit.** Pick a tool on the left, then click holes:
- Two-leg parts (wire, resistor, LED, push button, capacitor, crystal): first hole, then second hole. For an LED, click the anode (long leg) first.
- Chip: click a hole in row E or F; it straddles the centre gap. Press **R** before placing it, or with it selected, to turn it.
- Hovering a hole shows hole, chip pin and voltage; all holes of the same strip light up.
- Move parts by dragging them with “Auswählen”; dragging a leg end re-plugs just that leg. Undo/redo: ⌘/Ctrl+Z, ⌘/Ctrl+Y, or the buttons at the top.
- For the chip to run you need at least: the power board, VCC and both GND pins, AVCC, a 20 MHz crystal between XTAL1/XTAL2 (each with 33 pF to ground). “Status” shows what is missing, “Hinweise” points out wiring problems.

**3. Load your program.** Compile on your computer: `avr-gcc -mmcu=atmega1284p -DF_CPU=20000000UL -Os -o p.elf p.c`, then click “Programm laden” or drop `p.elf` onto the page. After changing the code, just load the new `p.elf` again — the wiring stays.

**4. Save to your computer (important).** The page does **not** store your wiring: reloading or closing the tab loses anything not exported (the browser asks first if there are unexported changes).
- Save: “Verdrahtung exportieren” downloads `verdrahtung.ppboard.json` (usually to Downloads). With “Programm mitspeichern” the current program is included.
- Move the file into your code folder next to `p.c` and give it a clear name, e.g. `led-blink.ppboard.json`.
- Continue later: “Verdrahtung importieren”, or drop the file onto the page.
- Export after every step — it is more reliable than relying on the browser.

**5. Updates and browser cache.** After the site is updated your browser may still show the old version. A hard refresh fetches the newest one: **Ctrl+F5** (or Ctrl+Shift+R) on Windows/Linux, **⌘+Shift+R** on Mac. A hard refresh also clears the board — **export first**. Older wiring files keep working.

**6. Troubleshooting.** Chip not running: check Versorgung (supply), Takt (crystal), RESET and Programm in “Status”; the chip starts about 66 ms after power-on. Program refused: compile with `-mmcu=atmega1284p`. 3D view unavailable: the browser needs WebGL 2; the 2D view is unaffected. Everything runs locally in your browser; no data is sent anywhere.

### Development

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # unit tests (needs avr-gcc)
npm run test:e2e   # end-to-end browser tests (Playwright)
```

Unofficial project, not affiliated with any university or course. Some model parameters (pin driver resistance, contact bounce, details of the LCD's 4-bit mode) are typical values or assumptions, documented in the source.

---

<a id="deutsch"></a>
## Deutsch

Ein inoffizielles ATmega1284P-Laborboard im Browser: Steckbrett verdrahten, das selbst mit avr-gcc übersetzte Programm (`.elf` / `.hex`) laden und wie auf dem echten Board laufen lassen. Keine Installation nötig — einfach **https://tequilaar.github.io/pp-virtual-board/** öffnen.

### Anleitung

**1. Öffnen:** https://tequilaar.github.io/pp-virtual-board/ in Chrome, Edge, Firefox oder Safari am Computer. Die Oberfläche ist auf Deutsch, oben rechts lässt sich Englisch wählen.

**2. Schaltung aufbauen.** Links ein Werkzeug wählen, dann Löcher anklicken:
- Zweibeinige Bauteile (Draht, Widerstand, LED, Taster, Kondensator, Quarz): erstes Loch, dann zweites Loch. Bei der LED zuerst die Anode (langes Bein).
- Prozessor: Loch in Reihe E oder F anklicken, er sitzt über der Mittelrille. **R** dreht ihn (vor dem Platzieren oder wenn er ausgewählt ist).
- Beim Überfahren eines Lochs zeigt die Fußzeile Loch, Prozessor-Pin und Spannung; alle Löcher desselben Kontaktstreifens leuchten auf.
- Verschieben: mit „Auswählen“ ziehen; ein Beinende ziehen steckt nur dieses Bein um. Rückgängig/Wiederholen: ⌘/Strg+Z, ⌘/Strg+Y oder die Knöpfe oben.
- Damit der Prozessor läuft, braucht es mindestens: Versorgungsplatine, VCC und beide GND, AVCC, einen 20-MHz-Quarz zwischen XTAL1/XTAL2 (je 33 pF nach Masse). „Status“ zeigt, was fehlt, „Hinweise“ meldet Verdrahtungsprobleme.

**3. Programm laden.** Am eigenen Rechner übersetzen: `avr-gcc -mmcu=atmega1284p -DF_CPU=20000000UL -Os -o p.elf p.c`, dann „Programm laden“ anklicken oder `p.elf` auf die Seite ziehen. Nach einer Code-Änderung einfach die neue `p.elf` erneut laden — die Verdrahtung bleibt.

**4. Lokal speichern (wichtig).** Die Seite speichert die Verdrahtung **nicht** selbst: Neu laden oder Schließen verwirft alles, was nicht exportiert wurde (bei nicht exportierten Änderungen fragt der Browser vorher nach).
- Speichern: „Verdrahtung exportieren“ lädt `verdrahtung.ppboard.json` herunter (meist in „Downloads“). Mit „Programm mitspeichern“ wird das aktuelle Programm mitgesichert.
- Die Datei in den Code-Ordner neben `p.c` verschieben und sinnvoll benennen, z. B. `led-blinken.ppboard.json`.
- Weitermachen: „Verdrahtung importieren“ oder die Datei auf die Seite ziehen.
- Nach jedem Schritt exportieren — zuverlässiger, als sich auf den Browser zu verlassen.

**5. Updates und Browser-Cache.** Nach einer Aktualisierung zeigt der Browser eventuell noch die alte Version. Hart neu laden holt die neueste: **Strg+F5** (oder Strg+Umschalt+R) unter Windows/Linux, **⌘+Umschalt+R** am Mac. Das leert auch das Board — **vorher exportieren**. Ältere Verdrahtungsdateien funktionieren weiter.

**6. Häufige Probleme.** Prozessor läuft nicht: unter „Status“ Versorgung, Takt (Quarz), RESET und Programm prüfen; er startet etwa 66 ms nach dem Einschalten. Programm abgelehnt: mit `-mmcu=atmega1284p` übersetzen. 3D-Ansicht nicht verfügbar: der Browser braucht WebGL 2; die 2D-Ansicht funktioniert weiter. Alles läuft lokal im Browser; es werden keine Daten übertragen.

### Entwicklung

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # Unit-Tests (benötigt avr-gcc)
npm run test:e2e   # End-to-End-Tests im Browser (Playwright)
```

Inoffizielles Projekt, ohne Verbindung zu einer Hochschule oder Lehrveranstaltung. Einige Modellparameter (Treiberwiderstand der Pins, Kontaktprellen, Details des 4-Bit-Modus des Displays) sind typische Werte oder Annahmen und im Quelltext dokumentiert.

---

## License / 许可 / Lizenz

MIT © 2026 Yuzhe Yan. Third-party: [avr8js](https://github.com/wokwi/avr8js) (MIT), [three.js](https://threejs.org) (MIT), HD44780 A00 font table from [wokwi-elements](https://github.com/wokwi/wokwi-elements) (MIT, © Uri Shaked). Datasheets are linked, not included: [ATmega1284P](https://www.microchip.com/en-us/product/ATmega1284P).
