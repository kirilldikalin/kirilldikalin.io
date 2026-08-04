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
    const powers = document.createElement("section");
    powers.className = "atlas-lab__panel atlas-string-powers";
    powers.setAttribute("data-powers", "");
    powers.innerHTML = '<h4>Степенные вклады текущего окна</h4><div data-power-terms></div>';
    shell.workspace.insertBefore(powers, explanation);

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
      const contributions = frame.windowContributions || [];
      const cellWidth = Math.min(92, 760 / Math.max(1, contributions.length));
      const startX = 460 - cellWidth * contributions.length / 2;
      contributions.forEach(function (term, index) {
        const x = startX + index * cellWidth;
        drawing.append(figure.svg, "rect", { x: x, y: 168, width: cellWidth - 5, height: 72,
          rx: 4, class: index === 0 ? "is-b" : "atlas-lab__grid-line" });
        drawing.text(figure.svg, x + (cellWidth - 5) / 2, 192, term.symbol, "is-strong", "middle");
        drawing.text(figure.svg, x + (cellWidth - 5) / 2, 218,
          "b^" + term.exponent, "is-muted", "middle");
      });
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
      powers.hidden = false;
      powers.querySelector("[data-power-terms]").textContent = contributions.length
        ? contributions.map(function (term) {
          return "v(" + term.symbol + ")·" + frame.base + "^" + term.exponent +
            " ≡ " + term.residue.toString();
        }).join(" + ") + " (mod " + frame.modulus + ")"
        : "Окно короче образца: степенных вкладов нет";
    }

    function renderAho(state) {
      const result = core.ahoCorasickFrames(fields.text.value, patterns());
      const automaton = result.automaton;
      const frame = state.frame;
      const levels = Object.create(null);
      const depths = [0];
      const queue = [0];
      for (let head = 0; head < queue.length; head += 1) {
        const node = automaton.nodes[queue[head]];
        Object.keys(node.next).forEach(function (symbol) {
          const target = node.next[symbol];
          depths[target] = depths[node.id] + 1;
          queue.push(target);
        });
      }
      automaton.nodes.forEach(function (node) {
        const level = depths[node.id];
        if (!levels[level]) levels[level] = [];
        levels[level].push(node);
      });
      const maximumDepth = Math.max.apply(null, depths);
      const widestLevel = Math.max.apply(null, Object.keys(levels).map(function (key) {
        return levels[key].length;
      }));
      const horizontalStep = maximumDepth ? 770 / maximumDepth : 60;
      const verticalStep = 360 / (widestLevel + 1);
      const radius = Math.max(3, Math.min(22, horizontalStep * 0.24, verticalStep * 0.38));
      const positions = Object.create(null);
      Object.keys(levels).forEach(function (key) {
        const level = Number(key);
        levels[key].forEach(function (node, index) {
          positions[node.id] = { x: maximumDepth ? 75 + level * horizontalStep : 460,
            y: 55 + (index + 1) * 360 / (levels[key].length + 1) };
        });
      });
      automaton.nodes.forEach(function (node) {
        Object.keys(node.next).forEach(function (symbol) {
          const target = node.next[symbol];
          drawing.append(figure.svg, "line", { x1: positions[node.id].x, y1: positions[node.id].y,
            x2: positions[target].x, y2: positions[target].y,
            class: target === frame.state ? "is-a" : "atlas-lab__grid-line" });
          if (radius >= 8) {
            drawing.text(figure.svg, (positions[node.id].x + positions[target].x) / 2,
              (positions[node.id].y + positions[target].y) / 2 - 5, symbol, "is-muted", "middle");
          }
        });
        if (node.id !== 0) {
          const target = node.failure;
          drawing.append(figure.svg, "line", { x1: positions[node.id].x, y1: positions[node.id].y + radius * 0.35,
            x2: positions[target].x, y2: positions[target].y + radius * 0.35,
            class: "atlas-sequence-failure" });
        }
      });
      automaton.nodes.forEach(function (node) {
        drawing.append(figure.svg, "circle", { cx: positions[node.id].x, cy: positions[node.id].y,
          r: radius, class: node.id === frame.state ? "is-a" : (node.outputs.length ? "is-good" : "atlas-lab__grid-line") });
        if (radius >= 8) {
          drawing.text(figure.svg, positions[node.id].x, positions[node.id].y + 5,
            String(node.id), "is-strong", "middle");
        }
      });
      drawing.text(figure.svg, 48, 475, "Обработан символ: " + (frame.symbol || "—") +
        "; состояние: " + frame.state, "is-strong");
      explanation.querySelector("[data-explanation]").textContent =
        "Сплошное ребро читает символ, пунктирная failure-ссылка выбирает самый длинный суффикс, который остаётся префиксом хотя бы одного образца";
      metrics.querySelector('[data-metric="state"]').textContent = String(frame.state);
      metrics.querySelector('[data-metric="matches"]').textContent = String(frame.matches.length);
      metrics.querySelector('[data-metric="collisions"]').textContent = "не применимо";
      powers.hidden = true;
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
