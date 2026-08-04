(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.SuffixIndexesCore;

  runtime.boot("suffix-indexes", function (root) {
    root.classList.add("atlas-specialized-lab");
    const shell = runtime.createShell(root, {
      title: "Одна строка, три суффиксных представления",
      description: "Стройте суффиксный массив с LCP, явный trie или минимальный автомат подстрок и ищите образец в их общей структуре",
    });
    shell.controls.innerHTML =
      '<label>Представление<select data-field="mode"><option value="array">SA + LCP</option><option value="trie">Суффиксный trie</option><option value="automaton">Суффиксный автомат</option></select></label>' +
      '<label>Строка<input data-field="text" value="банан" maxlength="40" spellcheck="false"></label>' +
      '<label>Образец<input data-field="pattern" value="ана" maxlength="24" spellcheck="false"></label>';
    const fields = {
      mode: shell.controls.querySelector('[data-field="mode"]'),
      text: shell.controls.querySelector('[data-field="text"]'),
      pattern: shell.controls.querySelector('[data-field="pattern"]'),
    };
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML = '<div><dt>Кадр</dt><dd data-metric="frame">0</dd></div>' +
      '<div><dt>Видимые элементы</dt><dd data-metric="visible">0</dd></div>' +
      '<div><dt>Вхождения</dt><dd data-metric="matches">∅</dd></div>' +
      '<div><dt>Размер структуры</dt><dd data-metric="size">0</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "suffix-indexes-visual", title: "Суффиксная структура", viewBox: "0 0 920 560",
    });
    const tableWrap = document.createElement("section");
    tableWrap.className = "atlas-lab__panel";
    tableWrap.innerHTML = '<h4>Упорядоченные суффиксы</h4><div class="atlas-lab__table-wrap" tabindex="0" data-table></div>';
    shell.workspace.appendChild(tableWrap);

    function createState() {
      return core.createState({ mode: fields.mode.value, text: fields.text.value });
    }

    function renderArray(state) {
      const sa = core.suffixArray(state.text);
      const lcp = core.lcpArray(state.text, sa);
      const table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>ранг</th><th>SA</th><th>LCP</th><th>суффикс</th></tr></thead>";
      const body = document.createElement("tbody");
      sa.slice(0, state.frame.visible).forEach(function (start, index) {
        const row = document.createElement("tr");
        if (index === state.frame.index) row.className = "is-current";
        [index, start, lcp[index], Array.from(state.text).slice(start).join("")].forEach(function (value) {
          const cell = document.createElement("td"); cell.textContent = String(value); row.appendChild(cell);
        });
        body.appendChild(row);
      });
      table.appendChild(body);
      tableWrap.querySelector("[data-table]").replaceChildren(table);
      const barWidth = 720 / Math.max(1, sa.length);
      sa.forEach(function (start, index) {
        const height = 30 + Array.from(state.text).length - start;
        drawing.append(figure.svg, "rect", { x: 100 + index * barWidth, y: 430 - height * 22,
          width: Math.max(3, barWidth - 4), height: height * 22,
          class: index < state.frame.visible ? "is-a" : "atlas-lab__grid-line" });
        drawing.text(figure.svg, 100 + index * barWidth + barWidth / 2, 455,
          String(start), "is-muted", "middle");
      });
      drawing.text(figure.svg, 100, 42, "Высота столбца кодирует длину суффикса; порядок — лексикографический", "is-strong");
      metrics.querySelector('[data-metric="size"]').textContent = sa.length + " позиций";
    }

    function renderGraph(state) {
      const structure = state.frame.structure;
      const visible = Math.min(state.frame.visible, structure.length);
      const columns = Math.max(1, Math.ceil(Math.sqrt(visible)));
      const positions = Object.create(null);
      structure.slice(0, visible).forEach(function (node, index) {
        positions[node.id] = { x: 90 + (index % columns) * (740 / Math.max(1, columns - 1)),
          y: 80 + Math.floor(index / columns) * 105 };
      });
      structure.slice(0, visible).forEach(function (node) {
        Object.keys(node.next || {}).forEach(function (symbol) {
          const target = node.next[symbol];
          if (!positions[target]) return;
          drawing.append(figure.svg, "line", { x1: positions[node.id].x, y1: positions[node.id].y,
            x2: positions[target].x, y2: positions[target].y, class: "atlas-lab__grid-line" });
          drawing.text(figure.svg, (positions[node.id].x + positions[target].x) / 2,
            (positions[node.id].y + positions[target].y) / 2, symbol, "is-muted", "middle");
        });
        if (fields.mode.value === "automaton" && node.link >= 0 && positions[node.link]) {
          drawing.append(figure.svg, "line", { x1: positions[node.id].x, y1: positions[node.id].y + 7,
            x2: positions[node.link].x, y2: positions[node.link].y + 7, class: "atlas-sequence-failure" });
        }
      });
      structure.slice(0, visible).forEach(function (node) {
        drawing.append(figure.svg, "circle", { cx: positions[node.id].x, cy: positions[node.id].y,
          r: 25, class: node.terminal ? "is-good" : (node.clone ? "is-c" : "atlas-lab__grid-line") });
        drawing.text(figure.svg, positions[node.id].x, positions[node.id].y + 5,
          String(node.id), "is-strong", "middle");
      });
      tableWrap.querySelector("[data-table]").textContent = fields.mode.value === "trie"
        ? "Каждый путь из корня читает префикс некоторого суффикса"
        : "Сплошные рёбра читают символы, дополнительные линии показывают suffix links";
      metrics.querySelector('[data-metric="size"]').textContent = structure.length + " состояний";
    }

    function render(state) {
      drawing.clear(figure.svg, "Суффиксный индекс", "Построенная часть выбранного представления");
      if (state.mode === "array") renderArray(state); else renderGraph(state);
      let matches = [];
      try { matches = core.search(state.text, fields.pattern.value).positions; } catch (error) { matches = []; }
      metrics.querySelector('[data-metric="frame"]').textContent = String(state.index + 1) + " / " + state.frames.length;
      metrics.querySelector('[data-metric="visible"]').textContent = String(state.frame.visible);
      metrics.querySelector('[data-metric="matches"]').textContent = matches.length ? matches.join(", ") : "∅";
      figure.caption.textContent = "Массив хранит порядок суффиксов, trie делит общие префиксы, автомат объединяет эквивалентные правые контексты";
    }

    const mounted = runtime.mount(root, { createState: createState, step: core.step,
      render: render, isFinished: function (state) { return state.frame.finished; },
      maxAutomaticSteps: 500 });
    shell.controls.addEventListener("change", mounted.reset);
    fields.text.addEventListener("input", mounted.reset);
    fields.pattern.addEventListener("input", mounted.render);
  });
})();
