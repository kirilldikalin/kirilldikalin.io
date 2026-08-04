(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const visual = window.AtlasNumericLabRuntime;
  const core = window.IntegerArithmeticNumberTheoryCore;
  runtime.boot("integer-arithmetic-number-theory", function (root) {
    const shell = runtime.createShell(root, {
      title: "Целое число как трасса точных операций",
      description: "Сопоставьте деления Евклида, двоичную степень и рекурсивное разбиение Карацубы с точным BigInt-состоянием",
    });
    root.classList.add("atlas-numeric-lab");
    shell.controls.innerHTML = '<label>Режим<select data-field="mode"><option value="euclid">Евклид и Безу</option><option value="power">Двоичная степень</option><option value="karatsuba">Карацуба</option></select></label><label>Первое число<input data-field="a" value="1071" inputmode="numeric"></label><label>Второе число<input data-field="b" value="462" inputmode="numeric"></label><label>Модуль для степени<input data-field="modulus" value="1009" inputmode="numeric"></label>';
    const fields = Object.fromEntries(Array.from(shell.controls.querySelectorAll("[data-field]")).map(function (node) { return [node.dataset.field, node]; }));
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML = '<div><dt>Кадр</dt><dd data-metric="frame">0</dd></div><div><dt>Режим</dt><dd data-metric="mode">—</dd></div><div><dt>Точное значение</dt><dd data-metric="value">—</dd></div><div><dt>Битовая длина</dt><dd data-metric="bits">—</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, { id: "integer-arithmetic-visual", title: "Разряды и текущая операция", viewBox: "0 0 920 420", className: "atlas-numeric-lab__figure" });
    const trace = document.createElement("section");
    trace.className = "atlas-lab__panel atlas-numeric-lab__trace";
    trace.innerHTML = '<h4>Текущий инвариант</h4><p data-message></p><p data-detail></p>';
    shell.workspace.appendChild(trace);
    function createState() { return core.createState({ mode: fields.mode.value, a: fields.a.value, b: fields.b.value, modulus: fields.mode.value === "power" ? fields.modulus.value : null }); }
    function render(state) {
      const frame = state.current;
      visual.clear(figure.svg, "Трасса целочисленного алгоритма", frame.message);
      visual.text(figure.svg, 40, 42, frame.mode === "euclid" ? "a = qb + r" : frame.mode === "power" ? "result · factor^remaining" : "z₂B² + z₁B + z₀", "is-strong");
      let values = [];
      let exact = 0n;
      if (frame.mode === "euclid") { values = ["a=" + frame.a, "b=" + frame.b, "q=" + (frame.q === null ? "—" : frame.q), "r=" + (frame.remainder === null ? "—" : frame.remainder)]; exact = frame.gcd === null ? frame.a : frame.gcd; }
      else if (frame.mode === "power") { values = ["result=" + visual.formatInteger(frame.result), "factor=" + visual.formatInteger(frame.factor), "exp=" + frame.remaining, "bit=" + (frame.bit === null ? "—" : frame.bit)]; exact = frame.result; }
      else { values = ["depth=" + frame.depth, "a=" + visual.formatInteger(frame.a), "b=" + visual.formatInteger(frame.b), "result=" + (frame.result === null ? "—" : visual.formatInteger(frame.result))]; exact = frame.result === null ? frame.a : frame.result; }
      visual.drawCells(figure.svg, values, { x: 35, y: 105, width: 200, height: 64, gap: 18, active: [Math.min(3, values.length - 1)] });
      visual.text(figure.svg, 40, 235, frame.message, "is-muted");
      if (frame.mode === "euclid") visual.text(figure.svg, 40, 290, "Коэффициенты текущего остатка: x=" + frame.x + ", y=" + frame.y, "is-strong");
      if (frame.mode === "karatsuba" && frame.split) visual.text(figure.svg, 40, 290, Object.entries(frame.split).map(function (entry) { return entry[0] + "=" + visual.formatInteger(entry[1]); }).join(" · "), "is-muted");
      metrics.querySelector('[data-metric="frame"]').textContent = (state.cursor + 1) + " / " + state.frames.length;
      metrics.querySelector('[data-metric="mode"]').textContent = frame.mode;
      metrics.querySelector('[data-metric="value"]').textContent = visual.formatInteger(exact);
      metrics.querySelector('[data-metric="bits"]').textContent = String((exact < 0n ? -exact : exact).toString(2).length);
      trace.querySelector("[data-message]").textContent = frame.message;
      trace.querySelector("[data-detail]").textContent = frame.mode === "euclid" ? "НОД не меняется при замене (a,b) на (b,a mod b)." : frame.mode === "power" ? "Обработанный бит переносит соответствующую степень двойки в аккумулятор." : "Каждый узел рекурсии заменяет четыре школьных произведения тремя.";
      figure.caption.textContent = frame.message;
    }
    let mounted;
    function bind(api) {
      fields.mode.addEventListener("change", function () {
        if (fields.mode.value === "power") { fields.a.value = "7"; fields.b.value = "181"; }
        else if (fields.mode.value === "karatsuba") { fields.a.value = "12345678"; fields.b.value = "87654321"; }
        else { fields.a.value = "1071"; fields.b.value = "462"; }
        api.reset();
      });
      [fields.a, fields.b, fields.modulus].forEach(function (field) { field.addEventListener("change", api.reset); });
    }
    mounted = runtime.mount(root, { createState: createState, step: core.step, isFinished: core.isFinished, render: render, maxAutomaticSteps: core.MAX_FRAMES, bind: bind });
  });
})();
