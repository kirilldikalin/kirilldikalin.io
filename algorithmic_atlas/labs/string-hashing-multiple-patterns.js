(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const sequence = window.AtlasSequenceLabRuntime;
  const core = window.StringHashingMultiplePatternsCore;

  runtime.boot("string-hashing-multiple-patterns", function (root) {
    root.classList.add("atlas-specialized-lab");
    const shell = runtime.createShell(root, {
      title: "Скользящий хеш и автомат множества образцов",
      description: "Первый режим показывает пересчёт окна и обязательную проверку коллизии, второй — переходы trie и failure links Ахо — Корасик",
    });
    shell.controls.innerHTML =
      '<label>Режим<select data-field="mode"><option value="rolling">Rolling hash</option><option value="aho">Aho — Corasick</option></select></label>' +
      '<label class="is-wide">Текст<input data-field="text" value="абракадабра" maxlength="160" spellcheck="false"></label>' +
      '<label data-rolling>Образец<input data-field="pattern" value="абра" maxlength="48" spellcheck="false"></label>' +
      '<label data-rolling>Основание<input data-field="base" type="number" min="2" max="1000000" value="257"></label>' +
      '<label data-rolling>Модуль<input data-field="modulus" type="number" min="3" max="2147483647" value="1000003"></label>' +
      '<label class="is-wide" data-aho>Образцы через запятую<input data-field="patterns" value="абра, када, бра" maxlength="180" spellcheck="false"></label>';
    const fields = {};
    ["mode", "text", "pattern", "base", "modulus", "patterns"].forEach(function (name) {
      fields[name] = shell.controls.querySelector('[data-field="' + name + '"]');
    });
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML = '<div><dt>Кадр</dt><dd data-metric="frame">0</dd></div>' +
      '<div><dt>Состояние / окно</dt><dd data-metric="state">0</dd></div>' +
      '<div><dt>Совпадения</dt><dd data-metric="matches">0</dd></div>' +
      '<div><dt>Коллизии</dt><dd data-metric="collisions">0</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "string-hashing-multiple-patterns-visual",
      title: "Окно хеша или автомат образцов",
      viewBox: "0 0 920 500",
    });
    const explanation = document.createElement("section");
    explanation.className = "atlas-lab__panel";
    explanation.innerHTML = '<h4>Проверяемое утверждение</h4><p data-explanation></p>';
    shell.workspace.appendChild(explanation);

    function patterns() {
      return fields.patterns.value.split(",").map(function (value) { return value.trim(); }).filter(Boolean);
    }

    function syncMode() {
      shell.controls.querySelectorAll("[data-rolling]").forEach(function (element) {
        element.hidden = fields.mode.value !== "rolling";
      });
      shell.controls.querySelectorAll("[data-aho]").forEach(function (element) {
        element.hidden = fields.mode.value !== "aho";
      });
    }

    function createState() {
      syncMode();
      return core.createState({ mode: fields.mode.value, text: fields.text.value,
        pattern: fields.pattern.value, base: fields.base.value, modulus: fields.modulus.value,
        patterns: patterns() });
    }

    function renderRolling(state) {
      const frame = state.frame;
      const text = Array.from(fields.text.value);
      sequence.drawStrip(figure.svg, text, { x: 48, y: 88, width: 824, height: 54,
        label: "Текст", window: [frame.start, frame.end],
        matched: frame.matches.flatMap(function (start) {
          return Array.from({ length: Array.from(fields.pattern.value).length }, function (_, index) { return start + index; });
        }) });
      drawing.text(figure.svg, 48, 230, "h(окно) = " + frame.hash.toString(), "is-a is-strong");
      drawing.text(figure.svg, 48, 270, "h(образец) = " + frame.targetHash.toString(), "is-b is-strong");
      drawing.append(figure.svg, "line", { x1: 48, y1: 305, x2: 872, y2: 305,
        class: "atlas-lab__axis" });
      drawing.text(figure.svg, 48, 352,
        frame.sameHash ? (frame.verified ? "Хеш равен и символы проверены" : "Коллизия: хеш равен, строка — нет") :
          "Хеши различны: дорогая посимвольная проверка не нужна",
        frame.collision ? "is-bad is-strong" : "is-strong");
      explanation.querySelector("[data-explanation]").textContent =
        "Равенство хешей создаёт только кандидата. Точный поиск засчитывает позицию лишь после сравнения исходных символов";
      metrics.querySelector('[data-metric="state"]').textContent = frame.start + "…" + frame.end;
      metrics.querySelector('[data-metric="matches"]').textContent = String(frame.matches.length);
      metrics.querySelector('[data-metric="collisions"]').textContent = String(frame.collisions.length);
    }

    function renderAho(state) {
      const result = core.ahoCorasickFrames(fields.text.value, patterns());
      const automaton = result.automaton;
      const frame = state.frame;
      const levels = Object.create(null);
      automaton.nodes.forEach(function (node) {
        const level = node.id === 0 ? 0 : Math.max(1, Math.ceil(Math.log2(node.id + 1)));
        if (!levels[level]) levels[level] = [];
        levels[level].push(node);
      });
      const positions = Object.create(null);
      Object.keys(levels).forEach(function (key) {
        const level = Number(key);
        levels[key].forEach(function (node, index) {
          positions[node.id] = { x: 90 + level * 190,
            y: 80 + (index + 1) * 340 / (levels[key].length + 1) };
        });
      });
      automaton.nodes.forEach(function (node) {
        Object.keys(node.next).forEach(function (symbol) {
          const target = node.next[symbol];
          drawing.append(figure.svg, "line", { x1: positions[node.id].x, y1: positions[node.id].y,
            x2: positions[target].x, y2: positions[target].y,
            class: target === frame.state ? "is-a" : "atlas-lab__grid-line" });
          drawing.text(figure.svg, (positions[node.id].x + positions[target].x) / 2,
            (positions[node.id].y + positions[target].y) / 2 - 5, symbol, "is-muted", "middle");
        });
        if (node.id !== 0) {
          const target = node.failure;
          drawing.append(figure.svg, "line", { x1: positions[node.id].x, y1: positions[node.id].y + 8,
            x2: positions[target].x, y2: positions[target].y + 8,
            class: "atlas-sequence-failure" });
        }
      });
      automaton.nodes.forEach(function (node) {
        drawing.append(figure.svg, "circle", { cx: positions[node.id].x, cy: positions[node.id].y,
          r: 25, class: node.id === frame.state ? "is-a" : (node.outputs.length ? "is-good" : "atlas-lab__grid-line") });
        drawing.text(figure.svg, positions[node.id].x, positions[node.id].y + 5,
          String(node.id), "is-strong", "middle");
      });
      drawing.text(figure.svg, 48, 475, "Обработан символ: " + (frame.symbol || "—") +
        "; состояние: " + frame.state, "is-strong");
      explanation.querySelector("[data-explanation]").textContent =
        "Сплошное ребро читает символ, пунктирная failure-ссылка выбирает самый длинный суффикс, который остаётся префиксом хотя бы одного образца";
      metrics.querySelector('[data-metric="state"]').textContent = String(frame.state);
      metrics.querySelector('[data-metric="matches"]').textContent = String(frame.matches.length);
      metrics.querySelector('[data-metric="collisions"]').textContent = "не применимо";
    }

    function render(state) {
      drawing.clear(figure.svg, "Строковая индексация",
        fields.mode.value === "rolling" ? "Скользящее окно и сравнение хешей" : "Trie и failure-ссылки автомата");
      if (state.mode === "rolling") renderRolling(state); else renderAho(state);
      metrics.querySelector('[data-metric="frame"]').textContent =
        String(state.index + 1) + " / " + state.frames.length;
      figure.caption.textContent = state.mode === "rolling"
        ? "Малый модуль удобно выбрать специально, чтобы увидеть коллизию"
        : "Failure-ссылки показаны отдельным типом линии и не потребляют новый символ";
    }

    const mounted = runtime.mount(root, { createState: createState, step: core.step,
      render: render, isFinished: function (state) { return state.frame.finished; },
      maxAutomaticSteps: 400 });
    shell.controls.addEventListener("change", mounted.reset);
    shell.controls.addEventListener("input", function (event) {
      if (event.target.tagName === "INPUT" && event.target.type !== "number") mounted.reset();
    });
  });
})();
