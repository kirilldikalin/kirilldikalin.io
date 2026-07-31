(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.LinearDataStructuresCore;

  function parseValues(raw) {
    return raw.split(/[\s,;]+/).filter(Boolean).map(Number);
  }

  runtime.boot("linear-data-structures", function (root) {
    const shell = runtime.createShell(root, {
      title: "Память как часть стоимости",
      description: "Сравните расширение динамического массива, сдвиг непрерывного блока и перенастройку ссылок",
    });
    shell.controls.innerHTML =
      '<label>Сценарий<select data-field="mode"><option value="dynamic">push в динамический массив</option><option value="array-insert">вставка в массив</option><option value="list-insert">вставка в список</option></select></label>' +
      '<label class="atlas-lab__field is-wide">Исходные значения<input data-field="values" value="7, 12, 4, 19, 8, 3, 15" inputmode="numeric"></label>' +
      '<label>Позиция вставки<input data-field="index" type="number" min="0" max="18" value="3"></label>' +
      '<label>Новое значение<input data-field="value" type="number" min="-999" max="999" value="42"></label>' +
      '<label>Начальная ёмкость<select data-field="capacity"><option>1</option><option selected>2</option><option>4</option><option>8</option></select></label>';
    const fields = {};
    ["mode", "values", "index", "value", "capacity"].forEach(function (name) {
      fields[name] = shell.controls.querySelector('[data-field="' + name + '"]');
    });
    const figure = runtime.createFigure(shell.workspace, {
      id: "linear-data-structures-visual",
      title: "Размещение и перемещение данных",
      viewBox: "0 0 820 500",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Текущий микрошаг</h4><p data-event></p><dl class="atlas-lab__metrics" data-metrics></dl><p class="atlas-lab__note" data-scale></p>';
    shell.workspace.appendChild(panel);
    const eventText = panel.querySelector("[data-event]");
    const metrics = panel.querySelector("[data-metrics]");
    const scale = panel.querySelector("[data-scale]");

    function createState() {
      const values = parseValues(fields.values.value);
      const options = {
        values: values,
        index: Number(fields.index.value),
        value: Number(fields.value.value),
        initialCapacity: Number(fields.capacity.value),
      };
      fields.index.max = String(values.length);
      return core.createState(fields.mode.value, options);
    }

    function drawMemory(svg, model) {
      const rows = model.oldMemory ? [model.oldMemory, model.memory] : [model.memory];
      rows.forEach(function (row, rowIndex) {
        const width = Math.min(48, 680 / Math.max(1, row.length));
        const start = (820 - width * row.length) / 2;
        const y = model.oldMemory ? 95 + rowIndex * 145 : 170;
        drawing.text(svg, 55, y + 33, model.oldMemory && rowIndex === 0 ? "старый" : "текущий", "is-muted", "start");
        row.forEach(function (value, index) {
          const classes = ["structure-cell"];
          if (model.activeIndex === index) classes.push("is-active");
          if (model.movedIndices.includes(index)) classes.push("is-moved");
          if (value === null) classes.push("is-empty");
          drawing.append(svg, "rect", { x: start + index * width, y: y, width: width - 2, height: 62, class: classes.join(" ") });
          drawing.text(svg, start + (index + 0.5) * width, y + 28, value === null ? "·" : value, value === null ? "is-muted" : "is-strong", "middle");
          drawing.text(svg, start + (index + 0.5) * width, y + 52, index, "is-muted", "middle");
          if (model.oldMemory && rowIndex === 1 && model.movedIndices.includes(index)) {
            drawing.append(svg, "path", { d: "M" + (start + (index + 0.5) * width) + " " + (y - 78) + "V" + (y - 10), class: "structure-copy-arrow" });
          }
        });
      });
      const barMaximum = Math.max(1, model.actualCost, model.amortizedBudget || 0);
      [["фактическая стоимость", model.actualCost, "is-actual"], ["накопленный бюджет 3n", model.amortizedBudget || 0, "is-budget"]].forEach(function (item, index) {
        const y = 395 + index * 42;
        drawing.text(svg, 220, y + 18, item[0], "is-muted", "end");
        drawing.append(svg, "rect", { x: 240, y: y, width: 430 * item[1] / barMaximum, height: 25, class: "structure-cost-bar " + item[2] });
        drawing.text(svg, 690, y + 18, item[1], "is-strong", "start");
      });
    }

    function drawList(svg, model) {
      const positions = {};
      model.nodes.forEach(function (node, index) {
        const column = index % 5;
        const row = Math.floor(index / 5);
        positions[node.id] = { x: 105 + column * 155, y: 105 + row * 135 };
      });
      model.nodes.forEach(function (node) {
        if (node.next && positions[node.next]) {
          const from = positions[node.id];
          const to = positions[node.next];
          drawing.append(svg, "path", { d: "M" + (from.x + 54) + " " + (from.y + 30) + " C" + (from.x + 90) + " " + (from.y + 30) + "," + (to.x - 36) + " " + (to.y + 30) + "," + (to.x - 28) + " " + (to.y + 30), class: "structure-pointer" });
        }
      });
      model.nodes.forEach(function (node) {
        const position = positions[node.id];
        const classes = ["structure-node"];
        if (node.id === model.activeNodeId) classes.push("is-active");
        if (model.traversedIds.includes(node.id)) classes.push("is-traversed");
        if (node.id === model.insertedNodeId) classes.push("is-new");
        drawing.append(svg, "rect", { x: position.x - 28, y: position.y, width: 108, height: 64, rx: 4, class: classes.join(" ") });
        drawing.text(svg, position.x, position.y + 26, node.value, "is-strong", "middle");
        drawing.text(svg, position.x + 50, position.y + 26, "next", "is-muted", "middle");
        drawing.text(svg, position.x + 25, position.y + 52, "@" + node.address, "is-muted", "middle");
      });
      drawing.text(svg, 410, 465, "Порядок адресов не совпадает с логическим порядком", "is-muted", "middle");
    }

    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Линейные структуры в памяти", "Ячейки массива, копирование, сдвиги или узлы связного списка с указателями");
      if (model.mode === "list-insert") drawList(svg, model);
      else drawMemory(svg, model);
      eventText.textContent = model.message;
      const metricItems = model.mode === "list-insert"
        ? [["прочтения и записи", model.actualCost], ["записи указателей", model.pointerWrites], ["показано узлов", model.nodes.length], ["микрошаг", state.frameIndex + 1 + " / " + state.trace.frames.length]]
        : [["размер", model.size], ["ёмкость", model.capacity], ["фактическая цена", model.actualCost], ["микрошаг", state.frameIndex + 1 + " / " + state.trace.frames.length]];
      metrics.innerHTML = metricItems.map(function (item) { return "<div><dt>" + item[0] + "</dt><dd>" + item[1] + "</dd></div>"; }).join("");
      scale.textContent = model.schematic ? "Геометрия агрегирована: часть ячеек или узлов скрыта" : "Все участвующие ячейки и узлы показаны";
      figure.caption.textContent = model.mode === "dynamic"
        ? "Редкое копирование всего блока видно как серия отдельных микрошагов"
        : model.mode === "array-insert"
          ? "Цена вставки определяется длиной сдвигаемого суффикса"
          : "После нахождения позиции сама перенастройка списка требует постоянного числа записей указателей";
    }

    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 180,
      bind: function (api) {
        shell.controls.addEventListener("change", function () { api.reset(); });
      },
    });
  });
})();
