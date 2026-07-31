(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.RangeQueryStructuresCore;

  runtime.boot("range-query-structures", function (root) {
    const shell = runtime.createShell(root, {
      title: "Разложение диапазона",
      description: "Один запрос раскладывается на двоичные блоки Fenwick tree или непересекающиеся вершины segment tree; lazy-метки откладывают спуск",
    });
    shell.controls.innerHTML =
      '<label>Режим<select data-field="mode"><option value="fenwick">Fenwick: сумма</option><option value="segment">Segment tree: сумма</option><option value="lazy">Segment tree: range update</option></select></label>' +
      '<label class="atlas-lab__field is-wide">Массив<input data-field="values" type="text" value="3,1,4,1,5,9,2,6"></label>' +
      '<label>Левая граница<input data-field="left" type="number" value="3"></label>' +
      '<label>Правая граница<input data-field="right" type="number" value="7"></label>' +
      '<label data-delta-wrap hidden>Прибавка<input data-field="delta" type="number" value="10"></label>';
    const mode = shell.controls.querySelector('[data-field="mode"]');
    const values = shell.controls.querySelector('[data-field="values"]');
    const left = shell.controls.querySelector('[data-field="left"]');
    const right = shell.controls.querySelector('[data-field="right"]');
    const delta = shell.controls.querySelector('[data-field="delta"]');
    const deltaWrap = shell.controls.querySelector("[data-delta-wrap]");
    const figure = runtime.createFigure(shell.workspace, { id: "range-query-visual", title: "Покрытие диапазона", viewBox: "0 0 920 520" });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Текущий шаг</h4><p data-message></p><dl class="atlas-lab__metrics"><div><dt>Операция</dt><dd data-action></dd></div><div><dt>Накоплено</dt><dd data-total></dd></div></dl><p data-indexing></p>';
    shell.workspace.appendChild(panel);

    function drawArray(svg, array, startY, oneBased) {
      const width = Math.min(78, 760 / array.length);
      const startX = (920 - width * array.length) / 2;
      array.forEach(function (value, index) {
        const x = startX + index * width;
        drawing.append(svg, "rect", { x: x, y: startY, width: width, height: 55, class: "structure-cell" });
        drawing.text(svg, x + width / 2, startY + 31, value, "is-strong", "middle");
        drawing.text(svg, x + width / 2, startY + 76, oneBased ? index + 1 : index, "is-muted", "middle");
      });
    }

    function drawFenwick(svg, scenario, frame) {
      drawArray(svg, scenario.values, 70, true);
      const width = Math.min(78, 760 / scenario.values.length);
      const startX = (920 - width * scenario.values.length) / 2;
      scenario.bit.slice(1).forEach(function (value, zeroIndex) {
        const index = zeroIndex + 1;
        const blockStart = index - core.lowbit(index) + 1;
        const x1 = startX + (blockStart - 1) * width;
        const x2 = startX + index * width;
        const y = 205 + Math.log2(core.lowbit(index)) * 52;
        const active = frame.selected && frame.selected.some(function (item) { return item.index === index; });
        drawing.append(svg, "path", { d: "M" + x1 + " " + y + "v-14H" + x2 + "v14", class: active ? "structure-copy-arrow" : "tree-edge" });
        drawing.text(svg, (x1 + x2) / 2, y + 22, "BIT[" + index + "]=" + value, active ? "is-a" : "is-muted", "middle");
      });
      drawing.text(svg, 460, 465, "i -= lowbit(i): каждый шаг удаляет младший установленный бит", "is-muted", "middle");
    }

    function drawSegment(svg, scenario, frame) {
      const nodes = frame.nodes || scenario.nodes;
      const active = frame.node;
      nodes.forEach(function (node) {
        if (!node || node.index === 1) return;
        const parent = nodes[Math.floor(node.index / 2)];
        const x = 65 + ((node.left + node.right) / 2) * (790 / scenario.values.length);
        const y = 55 + node.depth * 82;
        const px = 65 + ((parent.left + parent.right) / 2) * (790 / scenario.values.length);
        const py = 55 + parent.depth * 82;
        drawing.append(svg, "line", { x1: px, y1: py, x2: x, y2: y, class: "tree-edge" });
      });
      nodes.forEach(function (node) {
        if (!node) return;
        const x = 65 + ((node.left + node.right) / 2) * (790 / scenario.values.length);
        const y = 55 + node.depth * 82;
        drawing.append(svg, "rect", { x: x - 44, y: y - 23, width: 88, height: 46, rx: 8, class: "structure-node" + (active === node.index ? " is-active" : "") });
        drawing.text(svg, x, y - 2, "[" + node.left + "," + node.right + ")", "is-strong", "middle");
        drawing.text(svg, x, y + 15, "Σ=" + node.sum + (node.lazy ? " · lazy=" + node.lazy : ""), node.lazy ? "is-a" : "is-muted", "middle");
      });
    }

    function render(state) {
      const model = core.visualModel(state);
      const scenario = model.scenario;
      const frame = model.frame;
      const svg = figure.svg;
      drawing.clear(svg, "Диапазонная структура", "Двоичное покрытие запроса и отложенные обновления");
      if (model.mode === "fenwick") drawFenwick(svg, scenario, frame); else drawSegment(svg, scenario, frame);
      shell.workspace.querySelector("[data-message]").textContent = frame.message;
      shell.workspace.querySelector("[data-action]").textContent = frame.action;
      shell.workspace.querySelector("[data-total]").textContent = frame.total === undefined ? "—" : String(frame.total);
      shell.workspace.querySelector("[data-indexing]").textContent = model.mode === "fenwick"
        ? "Fenwick использует индексы 1…n и включительный запрос [l,r]"
        : "Segment tree использует индексы 0…n−1 и полуинтервал [l,r)";
      figure.caption.textContent = model.mode === "lazy"
        ? "Метка на вершине означает одинаковое обновление всего сегмента; к детям она перейдёт только перед нужным спуском"
        : "Выделенные блоки попарно не пересекаются и в точности покрывают запрос";
    }

    function syncMode() {
      if (mode.value === "fenwick") {
        left.min = "1";
        left.value = "3";
        right.value = "7";
        deltaWrap.hidden = true;
      } else {
        left.min = "0";
        left.value = "2";
        right.value = "7";
        deltaWrap.hidden = mode.value !== "lazy";
      }
    }

    runtime.mount(root, {
      createState: function () { return core.createState(mode.value, values.value, left.value, right.value, delta.value); },
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 100,
      bind: function (api) {
        mode.addEventListener("change", function () { syncMode(); api.reset(); });
        shell.controls.addEventListener("change", function (event) { if (event.target !== mode) api.reset(); });
        shell.controls.addEventListener("submit", function (event) { event.preventDefault(); api.reset(); });
      },
    });
  });
})();
