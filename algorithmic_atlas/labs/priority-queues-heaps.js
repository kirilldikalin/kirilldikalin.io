(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.PriorityQueuesHeapsCore;

  runtime.boot("priority-queues-heaps", function (root) {
    const shell = runtime.createShell(root, {
      title: "Куча как массив, дерево и запас работы",
      description: "Проследите обмены в двоичной куче или амортизированную оплату операций фибоначчиевой кучи",
    });
    shell.controls.innerHTML =
      '<label>Представление<select data-lab-field="mode"><option value="binary">Двоичная min-heap</option><option value="fibonacci">Фибоначчиева куча</option></select></label>' +
      '<label>Операция<select data-lab-field="operation"></select></label>' +
      '<label data-binary-field>Ключи через запятую<input data-lab-field="values" type="text" value="2, 5, 4, 11, 9, 8, 7, 18, 14" inputmode="numeric" spellcheck="false"></label>' +
      '<label data-insert-field>Новый ключ<input data-lab-field="value" type="number" min="-999" max="999" value="1"></label>' +
      '<label data-fibonacci-field hidden>Длина каскада: <output data-output="cuts">4</output><input data-lab-field="cuts" type="range" min="1" max="8" value="4"></label>';

    const mode = shell.controls.querySelector('[data-lab-field="mode"]');
    const operation = shell.controls.querySelector('[data-lab-field="operation"]');
    const values = shell.controls.querySelector('[data-lab-field="values"]');
    const value = shell.controls.querySelector('[data-lab-field="value"]');
    const cuts = shell.controls.querySelector('[data-lab-field="cuts"]');
    const cutsOutput = shell.controls.querySelector('[data-output="cuts"]');
    const binaryFields = shell.controls.querySelectorAll("[data-binary-field]");
    const insertField = shell.controls.querySelector("[data-insert-field]");
    const fibonacciField = shell.controls.querySelector("[data-fibonacci-field]");

    const figure = runtime.createFigure(shell.workspace, {
      id: "priority-queues-heaps-visual",
      title: "Синхронные представления кучи",
      viewBox: "0 0 900 610",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML =
      '<h4>Текущий шаг</h4><p data-summary></p>' +
      '<h4>Проверяемый инвариант</h4><p data-invariant></p>' +
      '<p class="atlas-lab__metric" data-cost></p>';
    shell.workspace.appendChild(panel);
    const summary = panel.querySelector("[data-summary]");
    const invariant = panel.querySelector("[data-invariant]");
    const cost = panel.querySelector("[data-cost]");

    function parseValues() {
      const parts = values.value.split(",").map(function (item) { return item.trim(); }).filter(Boolean);
      if (!parts.length) throw new RangeError("Введите хотя бы один ключ");
      return parts.map(function (item) {
        if (!/^-?\d+$/.test(item)) throw new TypeError("Ключи должны быть целыми числами через запятую");
        return Number(item);
      });
    }

    function updateOperationChoices() {
      const previous = operation.value;
      const choices = mode.value === "binary"
        ? [["insert", "Вставить ключ"], ["extract", "Извлечь минимум"], ["build", "Построить снизу"]]
        : [["decrease", "Уменьшить ключ"], ["insert", "Вставить корень"], ["extract", "Извлечь минимум"]];
      operation.replaceChildren();
      choices.forEach(function (choice) {
        const option = document.createElement("option");
        option.value = choice[0];
        option.textContent = choice[1];
        operation.appendChild(option);
      });
      if (choices.some(function (choice) { return choice[0] === previous; })) operation.value = previous;
      binaryFields.forEach(function (field) { field.hidden = mode.value !== "binary"; });
      fibonacciField.hidden = mode.value !== "fibonacci";
      insertField.hidden = !(mode.value === "binary" && operation.value === "insert");
    }

    function createState() {
      cutsOutput.textContent = cuts.value;
      if (mode.value === "fibonacci") {
        return core.createState("fibonacci", operation.value, { cuts: Number(cuts.value) });
      }
      return core.createState("binary", operation.value, {
        values: parseValues(), value: Number(value.value),
      });
    }

    function levelOf(index) {
      return Math.floor(Math.log2(index + 1));
    }

    function nodePosition(index) {
      const level = levelOf(index);
      const first = Math.pow(2, level) - 1;
      const position = index - first;
      const slots = Math.pow(2, level);
      return {
        x: 50 + (position + 0.5) * 800 / slots,
        y: 225 + level * 76,
      };
    }

    function renderBinary(svg, model) {
      const frame = model.current;
      const heap = frame.heap;
      const active = new Set(frame.activeIndices);
      const path = new Set(frame.path);
      const cellWidth = Math.min(46, 800 / Math.max(1, heap.length));
      const startX = (900 - cellWidth * heap.length) / 2;

      drawing.text(svg, 50, 42, "Массив: индексы задают родителя и детей", "is-strong", "start");
      heap.forEach(function (key, index) {
        const className = "structure-cell heap-array-cell" +
          (active.has(index) ? " is-active" : "") +
          (frame.swapped && frame.swapped.includes(index) ? " is-moved" : "");
        drawing.append(svg, "rect", {
          x: startX + index * cellWidth, y: 62,
          width: Math.max(18, cellWidth - 2), height: 52, class: className,
        });
        drawing.text(svg, startX + index * cellWidth + (cellWidth - 2) / 2, 85, key, "is-strong", "middle");
        drawing.text(svg, startX + index * cellWidth + (cellWidth - 2) / 2, 106, index, "is-muted", "middle");
      });

      drawing.text(svg, 50, 166, "То же состояние как полное бинарное дерево", "is-strong", "start");
      for (let index = 1; index < heap.length; index += 1) {
        const parent = core.parentIndex(index);
        const from = nodePosition(parent);
        const to = nodePosition(index);
        const edgeOnPath = path.has(parent) && path.has(index);
        drawing.append(svg, "line", {
          x1: from.x, y1: from.y, x2: to.x, y2: to.y,
          class: edgeOnPath ? "structure-pointer" : "tree-edge",
        });
      }
      heap.forEach(function (key, index) {
        const position = nodePosition(index);
        const className = "structure-node heap-tree-node" +
          (active.has(index) ? " is-active" : "") +
          (frame.swapped && frame.swapped.includes(index) ? " is-traversed" : "");
        drawing.append(svg, "circle", { cx: position.x, cy: position.y, r: 23, class: className });
        drawing.text(svg, position.x, position.y + 6, key, "is-strong", "middle");
      });

      summary.textContent = frame.message;
      invariant.textContent = frame.finished || model.heapValid
        ? "Для каждого ребёнка A[parent(i)] ≤ A[i]"
        : "Во время локального ремонта нарушение допускается только на подсвеченном пути";
      cost.textContent = "Кадр " + (model.cursor + 1) + " / " + model.frameCount +
        " · сравнений: " + frame.comparisons + " · обменов: " + frame.swaps +
        (frame.extracted === null ? "" : " · извлечённый минимум: " + frame.extracted);
      figure.caption.textContent = "Одинаковые ключи и подсветка синхронно показаны в массиве и дереве";
    }

    function bar(svg, label, value, baseline, y, className) {
      const maximum = 18;
      const width = Math.min(270, Math.abs(value) * 270 / maximum);
      drawing.text(svg, 125, y + 18, label, "is-strong", "end");
      drawing.append(svg, "line", { x1: baseline, y1: y - 4, x2: baseline, y2: y + 32, class: "tree-edge" });
      drawing.append(svg, "rect", {
        x: value >= 0 ? baseline : baseline - width, y: y,
        width: width, height: 26, class: "structure-cost-bar " + className,
      });
      drawing.text(svg, 765, y + 18, value, "is-muted", "end");
    }

    function renderFibonacci(svg, model) {
      const frame = model.current;
      drawing.text(svg, 50, 42, "Лес корней и отмеченные вершины", "is-strong", "start");
      const visibleRoots = Math.min(12, frame.roots);
      for (let index = 0; index < visibleRoots; index += 1) {
        const x = 80 + index * 66;
        drawing.append(svg, "circle", { cx: x, cy: 105, r: 22, class: "structure-node fib-root" + (index === visibleRoots - 1 ? " is-active" : "") });
        drawing.text(svg, x, 111, "r" + (index + 1), "is-strong", "middle");
        if (index < frame.marked) {
          drawing.append(svg, "line", { x1: x, y1: 128, x2: x, y2: 164, class: "tree-edge" });
          drawing.append(svg, "rect", { x: x - 15, y: 164, width: 30, height: 30, class: "structure-node fib-marked is-traversed" });
          drawing.text(svg, x, 184, "m", "is-strong", "middle");
        }
      }
      if (frame.roots > visibleRoots) drawing.text(svg, 848, 111, "+" + (frame.roots - visibleRoots), "is-muted", "end");

      drawing.text(svg, 50, 250, "Амортизированная цена = фактическая цена + изменение потенциала", "is-strong", "start");
      bar(svg, "c", frame.actual, 430, 286, "is-actual");
      bar(svg, "ΔΦ", frame.deltaPotential, 430, 342, "");
      bar(svg, "ĉ", frame.amortized, 430, 398, "is-budget");
      drawing.text(svg, 450, 486, "Φ = t + 2m = " + frame.roots + " + 2·" + frame.marked + " = " + frame.potential, "is-strong", "middle");

      summary.textContent = frame.message;
      invariant.textContent = model.identityHolds
        ? "Тождество ĉ = c + ΔΦ выполняется точно в текущем кадре"
        : "Ошибка модели потенциала";
      cost.textContent = "Кадр " + (model.cursor + 1) + " / " + model.frameCount +
        " · корней t: " + frame.roots + " · отмеченных m: " + frame.marked;
      figure.caption.textContent = "Рост числа корней повышает потенциал, каскадные разрезы расходуют накопленные метки";
    }

    function render(state) {
      const model = core.visualModel(state);
      drawing.clear(figure.svg, "Лаборатория очередей с приоритетом", "Массив, дерево, путь обменов и потенциал операций кучи");
      if (model.mode === "fibonacci") renderFibonacci(figure.svg, model);
      else renderBinary(figure.svg, model);
    }

    const api = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 120,
      bind: function (mounted) {
        mode.addEventListener("change", function () {
          updateOperationChoices();
          mounted.reset();
        });
        operation.addEventListener("change", function () {
          updateOperationChoices();
          mounted.reset();
        });
        shell.controls.addEventListener("change", function (event) {
          if (event.target !== mode && event.target !== operation) mounted.reset();
        });
        shell.controls.addEventListener("input", function (event) {
          if (event.target === cuts) {
            cutsOutput.textContent = cuts.value;
            mounted.reset();
          }
        });
      },
    });
    updateOperationChoices();
    api.reset();
  });
})();
