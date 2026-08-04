(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const visual = window.AtlasNumericLabRuntime;
  const core = window.IntegerArithmeticNumberTheoryCore;
  runtime.boot("integer-arithmetic-number-theory", function (root) {
    const shell = runtime.createShell(root, {
      title: "Целое число как трасса точных операций",
      description: "Сопоставьте разрядную запись, деления Евклида, двоичную степень и рекурсивное разбиение Карацубы с точным BigInt-состоянием",
    });
    root.classList.add("atlas-numeric-lab");
    shell.controls.innerHTML = '<label>Режим<select data-field="mode"><option value="representation">Разряды и биты</option><option value="euclid">Евклид и Безу</option><option value="power">Двоичная степень</option><option value="karatsuba">Карацуба</option></select></label><label>Первое число<input data-field="a" value="1234567" inputmode="numeric"></label><label>Второе число<input data-field="b" value="462" inputmode="numeric"></label><label>Модуль для степени<input data-field="modulus" value="1009" inputmode="numeric"></label>';
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
      visual.text(figure.svg, 40, 42, frame.mode === "representation" ? "a = sign · Σ bitᵢ·2ⁱ = sign · Σ limbᵢ·1000ⁱ" : frame.mode === "euclid" ? "a = qb + r" : frame.mode === "power" ? "result · factor^remaining" : "z₂B² + z₁B + z₀", "is-strong");
      let values = [];
      let exact = 0n;
      if (frame.mode === "representation") {
        values = ["sign=" + (frame.sign < 0 ? "−" : "+"), "decimal=" + visual.formatInteger(frame.value), "limbs=" + frame.limbs.slice().reverse().join(" | "), "prefix=" + visual.formatInteger(frame.reconstructed)];
        exact = frame.value;
      } else if (frame.mode === "euclid") { values = ["a=" + frame.a, "b=" + frame.b, "q=" + (frame.q === null ? "—" : frame.q), "r=" + (frame.remainder === null ? "—" : frame.remainder)]; exact = frame.gcd === null ? frame.a : frame.gcd; }
      else if (frame.mode === "power") { values = ["result=" + visual.formatInteger(frame.result), "factor=" + visual.formatInteger(frame.factor), "exp=" + frame.remaining, "bit=" + (frame.bit === null ? "—" : frame.bit)]; exact = frame.result; }
      else { values = ["depth=" + frame.depth, "a=" + visual.formatInteger(frame.a), "b=" + visual.formatInteger(frame.b), "result=" + (frame.result === null ? "—" : visual.formatInteger(frame.result))]; exact = frame.result === null ? frame.a : frame.result; }
      visual.drawCells(figure.svg, values, { x: 35, y: 105, width: 200, height: 64, gap: 18, active: [Math.min(3, values.length - 1)] });
      visual.text(figure.svg, 40, 235, frame.message, "is-muted");
      if (frame.mode === "representation") {
        const visibleCount = 28;
        const active = frame.activeBit === null ? 0 : frame.activeBit;
        const start = Math.max(0, Math.min(frame.binary.length - visibleCount, active - Math.floor(visibleCount / 2)));
        const visible = Array.from(frame.binary.slice(start, start + visibleCount));
        visual.drawCells(figure.svg, visible, {
          x: 40,
          y: 285,
          width: 23,
          height: 42,
          gap: 5,
          active: frame.activeBit === null ? [] : [frame.activeBit - start],
        });
        visual.text(figure.svg, 40, 355, "Биты " + (start + 1) + "–" + (start + visible.length) + " из " + frame.binary.length + (frame.binary.length > visibleCount ? " · окно следует за текущим битом" : ""), "is-muted");
      }
      if (frame.mode === "euclid") visual.text(figure.svg, 40, 290, "Коэффициенты текущего остатка: x=" + frame.x + ", y=" + frame.y, "is-strong");
      if (frame.mode === "karatsuba" && frame.split) visual.text(figure.svg, 40, 290, Object.entries(frame.split).map(function (entry) { return entry[0] + "=" + visual.formatInteger(entry[1]); }).join(" · "), "is-muted");
      metrics.querySelector('[data-metric="frame"]').textContent = (state.cursor + 1) + " / " + state.frames.length;
      metrics.querySelector('[data-metric="mode"]').textContent = frame.mode;
      metrics.querySelector('[data-metric="value"]').textContent = visual.formatInteger(exact);
      metrics.querySelector('[data-metric="bits"]').textContent = String((exact < 0n ? -exact : exact).toString(2).length);
      trace.querySelector("[data-message]").textContent = frame.message;
      trace.querySelector("[data-detail]").textContent = frame.mode === "representation" ? "Текущий двоичный префикс удовлетворяет правилу prefix ← 2·prefix + bit; limbs хранят то же значение в основании 1000." : frame.mode === "euclid" ? "НОД не меняется при замене (a,b) на (b,a mod b)." : frame.mode === "power" ? "Обработанный бит переносит соответствующую степень двойки в аккумулятор." : "Каждый узел рекурсии заменяет четыре школьных произведения тремя.";
      figure.caption.textContent = frame.message;
    }
    let mounted;
    function bind(api) {
      fields.mode.addEventListener("change", function () {
        if (fields.mode.value === "representation") { fields.a.value = "1234567"; }
        else if (fields.mode.value === "power") { fields.a.value = "7"; fields.b.value = "181"; }
        else if (fields.mode.value === "karatsuba") { fields.a.value = "12345678"; fields.b.value = "87654321"; }
        else { fields.a.value = "1071"; fields.b.value = "462"; }
        api.reset();
      });
      [fields.a, fields.b, fields.modulus].forEach(function (field) { field.addEventListener("change", api.reset); });
    }
    mounted = runtime.mount(root, { createState: createState, step: core.step, isFinished: core.isFinished, render: render, maxAutomaticSteps: core.MAX_FRAMES, bind: bind });
  });
})();
