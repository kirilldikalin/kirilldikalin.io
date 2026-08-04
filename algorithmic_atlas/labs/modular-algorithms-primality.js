(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime, visual = window.AtlasNumericLabRuntime, core = window.ModularAlgorithmsPrimalityCore;
  runtime.boot("modular-algorithms-primality", function (root) {
    const shell = runtime.createShell(root, { title: "Остатки, CRT и свидетель Миллера — Рабина", description: "Следите за точной цепочкой квадратов либо за пересечением арифметических прогрессий" });
    root.classList.add("atlas-numeric-lab");
    shell.controls.innerHTML = '<label>Режим<select data-field="mode"><option value="miller-rabin">Miller–Rabin</option><option value="crt">Китайская теорема</option></select></label><label>Проверяемое n<input data-field="n" value="561" inputmode="numeric"></label><label>Основание witness<input data-field="base" value="2" inputmode="numeric"></label><label class="atlas-lab__field is-wide">Сравнения: остаток/модуль<textarea data-field="crt" rows="3">2/3; 3/5; 2/7</textarea></label>';
    const field = function (name) { return shell.controls.querySelector('[data-field="' + name + '"]'); };
    const figure = runtime.createFigure(shell.workspace, { id: "modular-primality-visual", title: "Цепочка остатков", viewBox: "0 0 920 430", className: "atlas-numeric-lab__figure" });
    const panel = document.createElement("section"); panel.className = "atlas-lab__panel"; panel.innerHTML = '<h4>Логическое состояние</h4><p data-message></p><dl class="atlas-lab__metrics"><div><dt>Разложение</dt><dd data-decomposition>—</dd></div><div><dt>Текущий остаток</dt><dd data-value>—</dd></div><div><dt>Вывод</dt><dd data-result>—</dd></div></dl>'; shell.workspace.appendChild(panel);
    function congruences() { return field("crt").value.split(/[;\n]+/).filter(Boolean).map(function (item) { const parts = item.trim().split("/"); if (parts.length !== 2) throw new RangeError("Сравнение записывается как остаток/модуль."); return { residue: parts[0].trim(), modulus: parts[1].trim() }; }); }
    function createState() { return core.createState(field("mode").value === "crt" ? { mode: "crt", congruences: congruences() } : { mode: "miller-rabin", n: field("n").value, base: field("base").value }); }
    function render(state) {
      const frame = state.current; visual.clear(figure.svg, "Модульная трасса", frame.message);
      if (frame.mode === "miller-rabin") {
        const chain = state.frames.filter(function (item) { return item.value !== undefined; }).map(function (item) { return String(item.value); });
        visual.drawCells(figure.svg, chain, { x: 45, y: 125, width: Math.max(72, Math.min(150, 760 / chain.length)), height: 62, gap: 12, active: [Math.min(state.cursor, chain.length - 1)] });
        visual.text(figure.svg, 45, 55, "n−1 = 2^" + frame.s + " · " + frame.d, "is-strong");
        visual.text(figure.svg, 45, 245, "Ищем 1 в начале либо −1 на цепочке последовательных квадратов", "is-muted");
        panel.querySelector("[data-decomposition]").textContent = "2^" + frame.s + " · " + frame.d;
        panel.querySelector("[data-value]").textContent = visual.formatInteger(frame.value);
        panel.querySelector("[data-result]").textContent = frame.composite ? "составное" : frame.passed ? "witness пройден" : "проверка продолжается";
      } else {
        const all = state.frames.filter(function (item, index) { return index === 0 || item.phase === "combine"; }).map(function (item) { return visual.formatInteger(item.current.residue) + " mod " + visual.formatInteger(item.current.modulus); });
        const cellWidth = Math.max(60, Math.min(190, (820 - 12 * (all.length - 1)) / all.length));
        visual.drawCells(figure.svg, all, { x: 45, y: 125, width: cellWidth, height: 62, gap: 12, active: [Math.min(state.cursor, all.length - 1)] });
        visual.text(figure.svg, 45, 55, "Каждый шаг пересекает две бесконечные арифметические прогрессии", "is-strong");
        panel.querySelector("[data-decomposition]").textContent = "CRT";
        panel.querySelector("[data-value]").textContent = visual.formatInteger(frame.current.residue) + " mod " + visual.formatInteger(frame.current.modulus);
        panel.querySelector("[data-result]").textContent = frame.phase === "done" ? "система объединена" : "объединение продолжается";
      }
      panel.querySelector("[data-message]").textContent = frame.message; figure.caption.textContent = frame.message;
    }
    function bind(api) { shell.controls.querySelectorAll("input,textarea,select").forEach(function (node) { node.addEventListener("change", api.reset); }); }
    runtime.mount(root, { createState: createState, step: core.step, isFinished: core.isFinished, render: render, maxAutomaticSteps: 80, bind: bind });
  });
})();
