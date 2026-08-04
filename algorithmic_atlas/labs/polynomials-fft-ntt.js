(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime, visual = window.AtlasNumericLabRuntime, core = window.PolynomialsFftNttCore;
  runtime.boot("polynomials-fft-ntt", function (root) {
    const shell = runtime.createShell(root, { title: "Один butterfly в комплексном и конечном поле", description: "Пошагово меняйте представление коэффициентов и сравнивайте приближённую FFT с точной NTT" });
    root.classList.add("atlas-numeric-lab");
    shell.controls.innerHTML = '<label>Поле<select data-field="mode"><option value="fft">Комплексная FFT</option><option value="ntt">NTT modulo 998244353</option></select></label><label class="atlas-lab__field is-wide">Коэффициенты<input data-field="coefficients" value="1, 2, 3, 4"></label>';
    const mode = shell.controls.querySelector('[data-field="mode"]'), coefficients = shell.controls.querySelector('[data-field="coefficients"]');
    const figure = runtime.createFigure(shell.workspace, { id: "fft-ntt-visual", title: "Стадии, butterfly и корни преобразования", viewBox: "0 0 960 620", className: "atlas-numeric-lab__figure" });
    const panel = document.createElement("section"); panel.className = "atlas-lab__panel"; panel.innerHTML = '<h4>Текущая стадия</h4><p data-message></p><dl class="atlas-lab__metrics"><div><dt>Стадия</dt><dd data-stage>0</dd></div><div><dt>Размер блока</dt><dd data-size>1</dd></div><div><dt>Активные позиции</dt><dd data-active>—</dd></div><div><dt>Степень корня</dt><dd data-exponent>—</dd></div><div><dt>Корень</dt><dd data-root>—</dd></div><div><dt>Смысл результата</dt><dd data-semantics>—</dd></div></dl>'; shell.workspace.appendChild(panel);
    function createState() { return core.createState({ mode: mode.value, coefficients: coefficients.value }); }
    function label(value) { return typeof value === "bigint" ? String(value) : Math.abs(value.im) < 1e-9 ? visual.formatNumber(value.re) : visual.formatNumber(value.re) + (value.im < 0 ? "−" : "+") + visual.formatNumber(Math.abs(value.im)) + "i"; }
    function shortLabel(value) {
      const text = label(value);
      return text.length > 15 ? text.slice(0, 6) + "…" + text.slice(-5) : text;
    }
    function valuePosition(index, count) {
      const columns = Math.min(8, count);
      return { x: 60 + (index % columns) * 72, y: 190 + Math.floor(index / columns) * 68 };
    }
    function drawStages(svg, frame, count) {
      const stages = Math.log2(count);
      visual.text(svg, 55, 72, "Структура вычисления", "is-strong");
      for (let stage = 0; stage <= stages; stage += 1) {
        const width = 470 / (stages + 1), x = 55 + stage * width;
        visual.append(svg, "rect", { x: x, y: 88, width: width - 8, height: 38, rx: 3, class: stage === frame.stage ? "numeric-cell is-active" : "numeric-cell", "data-visual-part": "stage", "data-stage": stage });
        visual.text(svg, x + (width - 8) / 2, 112, stage === 0 ? "перестановка" : "блок " + (2 ** stage), "numeric-cell-label", "middle");
      }
    }
    function drawRootCycle(svg, frame) {
      const cx = 785, cy = 235, radius = 82, order = Math.max(1, frame.size);
      visual.text(svg, cx, 72, frame.mode === "fft" ? "Корни на единичной окружности" : "Степени корня в конечном поле", "is-strong", "middle");
      visual.append(svg, "circle", { cx: cx, cy: cy, r: radius, class: "numeric-guide", fill: "none", "data-visual-part": "root-cycle" });
      visual.append(svg, "line", { x1: cx - radius - 16, y1: cy, x2: cx + radius + 16, y2: cy, class: "numeric-guide" });
      visual.append(svg, "line", { x1: cx, y1: cy - radius - 16, x2: cx, y2: cy + radius + 16, class: "numeric-guide" });
      const shown = Math.min(order, 32);
      for (let index = 0; index < shown; index += 1) {
        const exponent = Math.round(index * order / shown) % order;
        const angle = -2 * Math.PI * exponent / order;
        const x = cx + radius * Math.cos(angle), y = cy + radius * Math.sin(angle);
        const active = frame.phase === "butterfly" && exponent === frame.omegaExponent;
        visual.append(svg, "circle", { cx: x, cy: y, r: active ? 8 : 4, class: active ? "numeric-matrix-cell is-active" : "numeric-matrix-cell", "data-visual-part": active ? "active-root" : "root" });
      }
      visual.text(svg, cx, 344, frame.mode === "fft" ? "ω^j поворачивает значение" : "точки — показатели; значения живут modulo p", "is-muted", "middle");
      if (frame.phase === "butterfly") visual.text(svg, cx, 368, "j = " + frame.omegaExponent + ",  ω^j = " + shortLabel(frame.omega), "numeric-cell-label", "middle");
    }
    function drawValues(svg, frame) {
      visual.text(svg, 55, 158, "Текущие значения", "is-strong");
      frame.values.forEach(function (value, index) {
        const point = valuePosition(index, frame.values.length), active = frame.active.includes(index);
        visual.append(svg, "rect", { x: point.x, y: point.y, width: 62, height: 44, rx: 3, class: active ? "numeric-matrix-cell is-active" : "numeric-matrix-cell", "data-visual-part": "value", "data-index": index });
        visual.text(svg, point.x + 31, point.y + 27, shortLabel(value), "numeric-cell-label", "middle");
        visual.text(svg, point.x + 31, point.y + 60, String(index), "is-muted", "middle");
      });
      if (frame.active.length === 2) {
        const left = valuePosition(frame.active[0], frame.values.length), right = valuePosition(frame.active[1], frame.values.length);
        visual.append(svg, "path", { d: "M" + (left.x + 31) + " " + (left.y - 5) + " C" + (left.x + 31) + " " + (left.y - 36) + " " + (right.x + 31) + " " + (right.y - 36) + " " + (right.x + 31) + " " + (right.y - 5), class: "numeric-butterfly", "data-visual-part": "butterfly" });
      }
    }
    function drawButterflyEquation(svg, state) {
      const frame = state.current;
      if (frame.phase !== "butterfly") {
        visual.text(svg, 55, 548, frame.phase === "bit-reversal" ? "Сначала индексы переставляются по развёрнутым битам" : "Сеть завершила все уровни", "is-strong");
        return;
      }
      const previous = state.frames[state.cursor - 1];
      const left = frame.active[0], right = frame.active[1];
      visual.text(svg, 55, 520, "Активный butterfly", "is-strong");
      visual.text(svg, 55, 550, "u = " + shortLabel(previous.values[left]) + ",  v = " + shortLabel(previous.values[right]) + ",  ω = " + shortLabel(frame.omega), "numeric-cell-label");
      visual.text(svg, 55, 580, "a[" + left + "] ← u + ωv = " + shortLabel(frame.values[left]) + "      a[" + right + "] ← u − ωv = " + shortLabel(frame.values[right]), "numeric-cell-label", "start");
    }
    function render(state) {
      const frame = state.current; visual.clear(figure.svg, "Сеть butterfly", frame.message);
      drawStages(figure.svg, frame, frame.values.length);
      drawValues(figure.svg, frame);
      drawRootCycle(figure.svg, frame);
      drawButterflyEquation(figure.svg, state);
      panel.querySelector("[data-message]").textContent = frame.message;
      panel.querySelector("[data-stage]").textContent = String(frame.stage) + " / " + Math.log2(frame.values.length);
      panel.querySelector("[data-size]").textContent = String(frame.size);
      panel.querySelector("[data-active]").textContent = frame.active.length ? frame.active.join(" ↔ ") : "—";
      panel.querySelector("[data-exponent]").textContent = frame.omegaExponent === undefined ? "—" : String(frame.omegaExponent);
      panel.querySelector("[data-root]").textContent = frame.omega === undefined ? "—" : label(frame.omega);
      panel.querySelector("[data-semantics]").textContent = frame.mode === "fft" ? "комплексное приближение" : "точный класс modulo " + frame.modulus;
      figure.caption.textContent = frame.message + (frame.mode === "fft" ? " Значения приближённые." : " Значения точны по указанному модулю.");
    }
    function bind(api) { [mode, coefficients].forEach(function (node) { node.addEventListener("change", api.reset); }); }
    runtime.mount(root, { createState: createState, step: core.step, isFinished: core.isFinished, render: render, maxAutomaticSteps: 130, bind: bind });
  });
})();
