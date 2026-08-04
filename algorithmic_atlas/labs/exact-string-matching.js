(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const sequence = window.AtlasSequenceLabRuntime;
  const core = window.ExactStringMatchingCore;

  runtime.boot("exact-string-matching", function (root) {
    root.classList.add("atlas-specialized-lab");
    const shell = runtime.createShell(root, {
      title: "Три способа найти один образец",
      description: "Сравните полный перебор, КМП и Z-функцию на одной строке: вы увидите сравнение символов, откат границы и найденные вхождения",
    });
    shell.controls.innerHTML =
      '<label class="is-wide">Текст<input data-field="text" value="абракадабра абра" maxlength="160" spellcheck="false"></label>' +
      '<label>Образец<input data-field="pattern" value="абра" maxlength="48" spellcheck="false"></label>' +
      '<label>Алгоритм<select data-field="algorithm"><option value="naive">Наивный сдвиг</option><option value="kmp" selected>КМП</option><option value="z">Z-функция</option></select></label>';
    const fields = {
      text: shell.controls.querySelector('[data-field="text"]'),
      pattern: shell.controls.querySelector('[data-field="pattern"]'),
      algorithm: shell.controls.querySelector('[data-field="algorithm"]'),
    };
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML = '<div><dt>Кадр</dt><dd data-metric="frame">0</dd></div>' +
      '<div><dt>Сравнения</dt><dd data-metric="comparisons">0</dd></div>' +
      '<div><dt>Совпавший префикс</dt><dd data-metric="matched">0</dd></div>' +
      '<div><dt>Вхождения</dt><dd data-metric="matches">∅</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "exact-string-matching-visual",
      title: "Сдвиг образца и сохранённая граница",
      viewBox: "0 0 920 400",
    });
    const detail = document.createElement("section");
    detail.className = "atlas-lab__panel";
    detail.innerHTML = '<h4>Текущее правило</h4><p data-rule></p>' +
      '<div class="atlas-lab__formula-strip"><span>π:</span><code data-prefix>—</code></div>';
    shell.workspace.appendChild(detail);

    function createState() {
      return core.createState({ algorithm: fields.algorithm.value,
        text: fields.text.value, pattern: fields.pattern.value });
    }

    function render(state) {
      const frame = state.frame;
      const text = Array.from(state.text);
      const pattern = Array.from(state.pattern);
      drawing.clear(figure.svg, "Пошаговый точный поиск",
        "Текст, образец и сравниваемые символы в текущем кадре");
      const activeText = frame.textIndex >= 0 && frame.textIndex < text.length ? [frame.textIndex] : [];
      const activePattern = frame.patternIndex >= 0 && frame.patternIndex < pattern.length
        ? [frame.patternIndex] : [];
      const matchedText = [];
      frame.matches.forEach(function (start) {
        for (let index = start; index < start + pattern.length; index += 1) matchedText.push(index);
      });
      sequence.drawStrip(figure.svg, text, { x: 54, y: 84, width: 810, height: 52,
        label: "Текст", active: activeText, matched: matchedText });
      const alignment = state.algorithm === "naive"
        ? frame.alignment || 0
        : Math.max(0, (frame.textIndex || 0) - (frame.patternIndex || 0));
      const textGeometry = sequence.stripGeometry(Math.max(text.length, 1), {
        x: 54, width: 810, gap: 4, height: 52,
      });
      const cellStep = textGeometry.length > 1
        ? textGeometry[1].x - textGeometry[0].x
        : textGeometry[0].width;
      const alignmentOffset = Math.min(810, alignment * cellStep);
      sequence.drawStrip(figure.svg, pattern, {
        x: 54 + alignmentOffset, y: 218,
        width: Math.max(0, Math.min(810 - alignmentOffset, pattern.length * cellStep)),
        height: 52, label: "Образец", active: activePattern,
      });
      drawing.text(figure.svg, 54, 360,
        "Действие: " + ({ equal: "символы равны", mismatch: "несовпадение",
          fallback: "откат по π", advance: "префикс удлинён", match: "вхождение найдено",
          inspect: "значение Z зафиксировано", "z-copy": "начальное значение скопировано из Z-блока",
          "z-extend": "Z-блок расширен реальным сравнением",
          "z-mismatch": "расширение Z-блока остановлено несовпадением",
          done: "поиск завершён", "too-long": "образец длиннее текста" }[frame.action] || frame.action),
        "is-strong");
      figure.caption.textContent = "Масштаб строки не меняется между шагами; чёрно-зелёные клетки входят в уже подтверждённые вхождения";
      metrics.querySelector('[data-metric="frame"]').textContent =
        String(state.index + 1) + " / " + state.frames.length;
      metrics.querySelector('[data-metric="comparisons"]').textContent =
        frame.comparisons === null || frame.comparisons === undefined ? "не считаются" : String(frame.comparisons);
      metrics.querySelector('[data-metric="matched"]').textContent = String(frame.matched || frame.zValue || 0);
      metrics.querySelector('[data-metric="matches"]').textContent =
        frame.matches.length ? frame.matches.join(", ") : "∅";
      detail.querySelector("[data-rule]").textContent = frame.action === "fallback"
        ? "Несовпавший символ текста не перечитывается: длина границы меняется с " +
          frame.matched + " на " + frame.fallback
        : frame.action === "z-copy"
          ? "Позиция лежит внутри уже известного Z-блока: сначала используем доказанное значение, затем при необходимости сравниваем за его границей"
          : frame.action === "z-extend" || frame.action === "z-mismatch"
            ? "Кадр соответствует одному фактическому сравнению символа префикса с символом объединённой строки"
        : "Кадр фиксирует одно логическое решение алгоритма, а не декоративный такт анимации";
      detail.querySelector("[data-prefix]").textContent = frame.pi ? frame.pi.join(" · ") : "используется только КМП";
    }

    const mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      render: render,
      isFinished: function (state) { return state.frame.finished; },
      maxAutomaticSteps: 1000,
    });
    shell.controls.addEventListener("change", mounted.reset);
    fields.text.addEventListener("input", mounted.reset);
    fields.pattern.addEventListener("input", mounted.reset);
  });
})();
