(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime, visual = window.AtlasNumericLabRuntime, core = window.PolynomialsFftNttCore;
  runtime.boot("polynomials-fft-ntt", function (root) {
    const shell = runtime.createShell(root, { title: "Один butterfly в комплексном и конечном поле", description: "Пошагово меняйте представление коэффициентов и сравнивайте приближённую FFT с точной NTT" });
    root.classList.add("atlas-numeric-lab");
    shell.controls.innerHTML = '<label>Поле<select data-field="mode"><option value="fft">Комплексная FFT</option><option value="ntt">NTT modulo 998244353</option></select></label><label class="atlas-lab__field is-wide">Коэффициенты<input data-field="coefficients" value="1, 2, 3, 4"></label>';
    const mode = shell.controls.querySelector('[data-field="mode"]'), coefficients = shell.controls.querySelector('[data-field="coefficients"]');
    const figure = runtime.createFigure(shell.workspace, { id: "fft-ntt-visual", title: "Butterfly network и корни единицы", viewBox: "0 0 960 520", className: "atlas-numeric-lab__figure" });
    const panel = document.createElement("section"); panel.className = "atlas-lab__panel"; panel.innerHTML = '<h4>Текущая стадия</h4><p data-message></p><dl class="atlas-lab__metrics"><div><dt>Стадия</dt><dd data-stage>0</dd></div><div><dt>Размер блока</dt><dd data-size>1</dd></div><div><dt>Активные позиции</dt><dd data-active>—</dd></div><div><dt>Корень</dt><dd data-root>—</dd></div></dl>'; shell.workspace.appendChild(panel);
    function createState() { return core.createState({ mode: mode.value, coefficients: coefficients.value }); }
    function label(value) { return typeof value === "bigint" ? String(value) : Math.abs(value.im) < 1e-9 ? visual.formatNumber(value.re) : visual.formatNumber(value.re) + (value.im < 0 ? "−" : "+") + visual.formatNumber(Math.abs(value.im)) + "i"; }
    function render(state) {
      const frame = state.current; visual.clear(figure.svg, "Сеть butterfly", frame.message);
      const count = frame.values.length, gap = 820 / Math.max(1, count - 1);
      frame.values.forEach(function (value, index) { const x = 70 + index * gap; visual.append(figure.svg, "circle", { cx: x, cy: 260, r: frame.active.includes(index) ? 27 : 20, class: frame.active.includes(index) ? "numeric-matrix-cell is-active" : "numeric-matrix-cell" }); visual.text(figure.svg, x, 265, label(value), "numeric-cell-label", "middle"); visual.text(figure.svg, x, 310, String(index), "is-muted", "middle"); });
      if (frame.active.length === 2) { const x1 = 70 + frame.active[0] * gap, x2 = 70 + frame.active[1] * gap; visual.append(figure.svg, "path", { d: "M" + x1 + " 225 C" + x1 + " 125 " + x2 + " 125 " + x2 + " 225", class: "numeric-butterfly" }); visual.append(figure.svg, "path", { d: "M" + x1 + " 295 C" + x1 + " 395 " + x2 + " 395 " + x2 + " 295", class: "numeric-butterfly" }); }
      visual.text(figure.svg, 45, 55, frame.mode === "fft" ? "ω = exp(−2πi / block)" : "ω = g^((p−1)/block) mod p", "is-strong");
      panel.querySelector("[data-message]").textContent = frame.message; panel.querySelector("[data-stage]").textContent = String(frame.stage); panel.querySelector("[data-size]").textContent = String(frame.size); panel.querySelector("[data-active]").textContent = frame.active.length ? frame.active.join(" ↔ ") : "—"; panel.querySelector("[data-root]").textContent = frame.omega === undefined ? "—" : label(frame.omega); figure.caption.textContent = frame.message;
    }
    function bind(api) { [mode, coefficients].forEach(function (node) { node.addEventListener("change", api.reset); }); }
    runtime.mount(root, { createState: createState, step: core.step, isFinished: core.isFinished, render: render, maxAutomaticSteps: 130, bind: bind });
  });
})();
