(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.SuffixIndexesCore;

  runtime.boot("suffix-indexes", function (root) {
    root.classList.add("atlas-specialized-lab");
    const shell = runtime.createShell(root, {
      title: "Пять синхронных суффиксных представлений",
      description: "Один шаг одновременно раскрывает список суффиксов, SA, LCP, сжатое суффиксное дерево и суффиксный автомат",
    });
    shell.controls.innerHTML =
      '<label>Строка<input data-field="text" value="банан" maxlength="40" spellcheck="false"></label>' +
      '<label>Образец<input data-field="pattern" value="ана" maxlength="24" spellcheck="false"></label>';
    const fields = {
      text: shell.controls.querySelector('[data-field="text"]'),
      pattern: shell.controls.querySelector('[data-field="pattern"]'),
    };
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML = '<div><dt>Кадр</dt><dd data-metric="frame">0</dd></div>' +
      '<div><dt>Видимые элементы</dt><dd data-metric="visible">0</dd></div>' +
      '<div><dt>Вхождения</dt><dd data-metric="matches">∅</dd></div>' +
      '<div><dt>Дерево / SAM</dt><dd data-metric="size">0</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "suffix-indexes-visual", title: "Сжатое дерево и суффиксный автомат", viewBox: "0 0 1200 640",
    });
    const tableWrap = document.createElement("section");
    tableWrap.className = "atlas-lab__panel";
    tableWrap.innerHTML = '<h4>Список суффиксов, SA и LCP</h4><div class="atlas-lab__table-wrap" tabindex="0" data-table></div>';
    shell.workspace.appendChild(tableWrap);

    function createState() {
      return core.createState({ mode: "synchronized", text: fields.text.value });
    }

    function treePositions(tree, visible) {
      const levels = Object.create(null);
      const depths = { 0: 0 };
      const queue = [0];
      for (let head = 0; head < queue.length; head += 1) {
        const node = tree.nodes[queue[head]];
        if (!node) continue;
        (node.edges || []).forEach(function (edge) {
          depths[edge.target] = depths[node.id] + 1;
          queue.push(edge.target);
        });
      }
      tree.nodes.slice(0, visible).forEach(function (node) {
        const depth = depths[node.id] || 0;
        if (!levels[depth]) levels[depth] = [];
        levels[depth].push(node.id);
      });
      const maximumDepth = Math.max(1, ...Object.keys(levels).map(Number));
      const positions = Object.create(null);
      Object.keys(levels).forEach(function (key) {
        const level = Number(key);
        levels[key].forEach(function (id, index) {
          positions[id] = { x: 55 + level * 480 / maximumDepth,
            y: 88 + (index + 1) * 430 / (levels[key].length + 1) };
        });
      });
      return positions;
    }

    function drawTree(frame) {
      const tree = frame.tree;
      const visible = Math.min(frame.visible, tree.nodes.length);
      const positions = treePositions(tree, visible);
      tree.nodes.slice(0, visible).forEach(function (node) {
        (node.edges || []).forEach(function (edge) {
          if (!positions[edge.target]) return;
          drawing.append(figure.svg, "line", { x1: positions[node.id].x, y1: positions[node.id].y,
            x2: positions[edge.target].x, y2: positions[edge.target].y,
            class: edge.target === visible - 1 ? "is-a" : "atlas-lab__grid-line" });
          drawing.text(figure.svg, (positions[node.id].x + positions[edge.target].x) / 2,
            (positions[node.id].y + positions[edge.target].y) / 2 - 7,
            edge.label + " [" + edge.start + "," + edge.end + ")", "is-muted", "middle");
        });
      });
      tree.nodes.slice(0, visible).forEach(function (node) {
        drawing.append(figure.svg, "circle", { cx: positions[node.id].x, cy: positions[node.id].y,
          r: 14, class: node.terminal ? "is-good" : "atlas-lab__grid-line" });
        drawing.text(figure.svg, positions[node.id].x, positions[node.id].y + 5,
          String(node.id), "is-strong", "middle");
      });
    }

    function drawAutomaton(frame) {
      const states = frame.automaton;
      const visible = Math.min(frame.visible, states.length);
      const columns = Math.max(1, Math.ceil(Math.sqrt(visible)));
      const rows = Math.max(1, Math.ceil(visible / columns));
      const positions = Object.create(null);
      states.slice(0, visible).forEach(function (state, index) {
        positions[state.id] = { x: 670 + (columns > 1 ? (index % columns) * 455 / (columns - 1) : 225),
          y: 92 + (rows > 1 ? Math.floor(index / columns) * 420 / (rows - 1) : 210) };
      });
      states.slice(0, visible).forEach(function (state) {
        Object.keys(state.next).forEach(function (symbol) {
          const target = state.next[symbol];
          if (!positions[target]) return;
          drawing.append(figure.svg, "line", { x1: positions[state.id].x, y1: positions[state.id].y,
            x2: positions[target].x, y2: positions[target].y,
            class: target === visible - 1 ? "is-b" : "atlas-lab__grid-line" });
          drawing.text(figure.svg, (positions[state.id].x + positions[target].x) / 2,
            (positions[state.id].y + positions[target].y) / 2 - 6, symbol, "is-muted", "middle");
        });
        if (state.link >= 0 && positions[state.link]) {
          drawing.append(figure.svg, "line", { x1: positions[state.id].x, y1: positions[state.id].y + 5,
            x2: positions[state.link].x, y2: positions[state.link].y + 5,
            class: "atlas-sequence-failure" });
        }
      });
      states.slice(0, visible).forEach(function (state) {
        drawing.append(figure.svg, "circle", { cx: positions[state.id].x, cy: positions[state.id].y,
          r: 14, class: state.terminal ? "is-good" : (state.clone ? "is-c" : "atlas-lab__grid-line") });
        drawing.text(figure.svg, positions[state.id].x, positions[state.id].y + 5,
          String(state.id), "is-strong", "middle");
      });
    }

    function renderTable(frame) {
      const table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>ранг</th><th>SA</th><th>LCP</th><th>отсортированный суффикс</th></tr></thead>";
      const body = document.createElement("tbody");
      frame.sa.slice(0, Math.min(frame.visible, frame.sa.length)).forEach(function (start, index) {
        const row = document.createElement("tr");
        if (index === Math.min(frame.visible, frame.sa.length) - 1) row.className = "is-current";
        [index, start, frame.lcp[index], Array.from(fields.text.value).slice(start).join("")].forEach(function (value) {
          const cell = document.createElement("td");
          cell.textContent = String(value);
          row.appendChild(cell);
        });
        body.appendChild(row);
      });
      table.appendChild(body);
      tableWrap.querySelector("[data-table]").replaceChildren(table);
    }

    function render(state) {
      drawing.clear(figure.svg, "Синхронный суффиксный индекс",
        "Слева — сжатое дерево, справа — автомат; таблица ниже показывает те же суффиксы");
      drawing.text(figure.svg, 300, 48, "Сжатое суффиксное дерево", "is-strong", "middle");
      drawing.text(figure.svg, 900, 48, "Суффиксный автомат", "is-strong", "middle");
      drawing.append(figure.svg, "line", { x1: 600, y1: 58, x2: 600, y2: 590,
        class: "atlas-lab__axis" });
      drawTree(state.frame);
      drawAutomaton(state.frame);
      renderTable(state.frame);
      const hasPattern = Array.from(fields.pattern.value).length > 0;
      const matches = hasPattern ? core.search(state.text, fields.pattern.value).positions : [];
      metrics.querySelector('[data-metric="frame"]').textContent = String(state.index + 1) + " / " + state.frames.length;
      metrics.querySelector('[data-metric="visible"]').textContent = String(state.frame.visible);
      metrics.querySelector('[data-metric="matches"]').textContent = hasPattern
        ? (matches.length ? matches.join(", ") : "∅") : "—";
      metrics.querySelector('[data-metric="size"]').textContent = state.frame.tree.nodes.length + " / " +
        state.frame.automaton.length;
      figure.caption.textContent = "Метки рёбер дерева заданы интервалами исходной строки; пунктир справа показывает suffix links";
    }

    const mounted = runtime.mount(root, { createState: createState, step: core.step,
      render: render, isFinished: function (state) { return state.frame.finished; },
      maxAutomaticSteps: 500 });
    fields.text.addEventListener("input", mounted.reset);
    fields.pattern.addEventListener("input", function () {
      if (!Array.from(fields.pattern.value).length) {
        mounted.showError("Образец не должен быть пустым.");
        mounted.announce("Введите непустой образец для поиска по суффиксному массиву.");
      } else {
        mounted.clearError();
      }
      mounted.render();
    });
  });
})();
