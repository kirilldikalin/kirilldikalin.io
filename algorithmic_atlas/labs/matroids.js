(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.MatroidsCore;

  runtime.boot("matroids", function (root) {
    const shell = runtime.createShell(root, {
      title: "Конструктор систем независимости",
      description: "Соберите множества A и B, проверьте наследственность и обмен, а затем сравните жадный результат с точным",
    });
    shell.controls.innerHTML =
      '<label>Система<select data-field="system"><option value="uniform">Равномерный U₂,₄</option><option value="partition">Разбиение</option><option value="graphic">Леса графа</option><option value="matching">Паросочетания пути</option></select></label>' +
      '<div class="atlas-lab__field is-wide matroid-set-builder" data-set-builder></div>';
    const fields = {
      system: shell.controls.querySelector('[data-field="system"]'),
      builder: shell.controls.querySelector("[data-set-builder]"),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics matroids-metrics";
    metrics.innerHTML =
      '<div><dt>A независимо</dt><dd data-metric="a">—</dd></div>' +
      '<div><dt>B независимо</dt><dd data-metric="b">—</dd></div>' +
      '<div><dt>Обмены B → A</dt><dd data-metric="exchange">—</dd></div>' +
      '<div><dt>Аксиомы</dt><dd data-metric="axioms">—</dd></div>' +
      '<div><dt>Жадный / точный вес</dt><dd data-metric="weight">—</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "matroids-visual",
      title: "Независимые множества, обмен и жадный выбор",
      viewBox: "0 0 1100 600",
      className: "matroids-figure",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel matroids-step";
    panel.innerHTML =
      '<h4>Текущая проверка</h4><p data-current></p>' +
      '<h4>Вердикт</h4><p data-verdict></p>';
    shell.workspace.appendChild(panel);

    function selectedSet(name) {
      return Array.from(fields.builder.querySelectorAll('[data-set="' + name + '"]:checked'))
        .map(function (input) { return input.value; });
    }

    function rebuildBuilder() {
      const data = core.SYSTEMS[fields.system.value];
      fields.builder.replaceChildren();
      const heading = document.createElement("span");
      heading.className = "matroid-set-builder__title";
      heading.textContent = "Включите элемент в A, B или оба множества";
      fields.builder.appendChild(heading);
      const grid = document.createElement("div");
      grid.className = "matroid-set-builder__grid";
      data.elements.forEach(function (element) {
        const row = document.createElement("div");
        row.className = "matroid-set-builder__row";
        const label = document.createElement("strong");
        label.textContent = element.label + " · w=" + element.weight;
        row.appendChild(label);
        ["A", "B"].forEach(function (setName) {
          const wrapper = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = element.id;
          input.dataset.set = setName;
          input.checked = data[setName === "A" ? "initialA" : "initialB"].includes(element.id);
          wrapper.append(input, document.createTextNode(" " + setName));
          row.appendChild(wrapper);
        });
        grid.appendChild(row);
      });
      fields.builder.appendChild(grid);
    }

    function createState() {
      return core.createState({
        system: fields.system.value,
        A: selectedSet("A"),
        B: selectedSet("B"),
      });
    }

    function drawAbstract(svg, model) {
      const data = model.data;
      const groupNames = data.kind === "partition" ? Object.keys(data.groups) : ["ground"];
      groupNames.forEach(function (group, groupIndex) {
        const groupElements = data.elements.filter(function (element) {
          return data.kind !== "partition" || element.group === group;
        });
        const boxX = 80 + groupIndex * 500;
        drawing.append(svg, "rect", { x: boxX, y: 100, width: 440, height: 340, rx: 18, class: "matroid-group" });
        drawing.text(svg, boxX + 22, 138,
          data.kind === "partition" ? group + " · квота " + data.groups[group] : "E · не более " + data.rank,
          "is-strong");
        groupElements.forEach(function (element, index) {
          const visual = model.elements.find(function (candidate) { return candidate.id === element.id; });
          const cx = boxX + 82 + (index % 3) * 120;
          const cy = 220 + Math.floor(index / 3) * 120;
          drawElement(svg, visual, cx, cy);
        });
      });
    }

    function elementClass(element) {
      let value = "matroid-element";
      if (element.inA) value += " is-in-a";
      if (element.inB) value += " is-in-b";
      if (element.inA && element.inB) value += " is-in-both";
      if (element.candidate) value += " is-candidate";
      if (element.current) value += " is-current";
      if (element.greedySelected) value += " is-greedy";
      return value;
    }

    function drawElement(svg, element, cx, cy) {
      drawing.append(svg, "circle", { cx: cx, cy: cy, r: 39, class: elementClass(element) });
      drawing.text(svg, cx, cy + 5, element.label, "matroid-element-label", "middle");
      drawing.text(svg, cx, cy + 63, "w=" + element.weight, "is-muted", "middle");
    }

    function drawGraph(svg, model) {
      const vertices = model.data.vertices;
      const positions = {};
      if (vertices.length === 4) {
        positions[vertices[0]] = { x: 170, y: 320 };
        positions[vertices[1]] = { x: 420, y: 150 };
        positions[vertices[2]] = { x: 690, y: 150 };
        positions[vertices[3]] = { x: 930, y: 320 };
      }
      model.elements.forEach(function (edge) {
        const from = positions[edge.u]; const to = positions[edge.v];
        drawing.append(svg, "line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: elementClass(edge).replace(/matroid-element/g, "matroid-edge") });
        drawing.text(svg, (from.x + to.x) / 2, (from.y + to.y) / 2 - 12, edge.label + " · " + edge.weight, "matroid-edge-label", "middle");
      });
      vertices.forEach(function (vertex) {
        const point = positions[vertex];
        drawing.append(svg, "circle", { cx: point.x, cy: point.y, r: 28, class: "matroid-vertex" });
        drawing.text(svg, point.x, point.y + 5, vertex, "matroid-vertex-label", "middle");
      });
    }

    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Проверка аксиом независимости", "Множества A и B, возможные обмены и шаги весового жадного алгоритма");
      drawing.text(svg, 30, 48, model.data.title, "matroid-title");
      drawing.text(svg, 30, 78, "A — бордовый · B — синий · допустимый обмен — пунктирное кольцо", "is-muted");
      if (model.data.kind === "graphic" || model.data.kind === "matching") drawGraph(svg, model);
      else drawAbstract(svg, model);
      drawing.text(svg, 30, 560, model.frame.message, "matroid-frame-message");

      const independentA = core.isIndependent(model.data, model.options.A);
      const independentB = core.isIndependent(model.data, model.options.B);
      metrics.querySelector('[data-metric="a"]').textContent = independentA ? "да" : "нет";
      metrics.querySelector('[data-metric="b"]').textContent = independentB ? "да" : "нет";
      metrics.querySelector('[data-metric="exchange"]').textContent = model.candidates.length ? model.candidates.join(", ") : "нет";
      metrics.querySelector('[data-metric="axioms"]').textContent = model.axioms.isMatroid ? "матроид" : "обмен нарушен";
      metrics.querySelector('[data-metric="weight"]').textContent = model.greedy.weight + " / " + model.optimum.weight;
      panel.querySelector("[data-current]").textContent = model.frame.message;
      panel.querySelector("[data-verdict]").textContent = !independentA || !independentB
        ? "Сначала нужны два независимых множества. При нарушении предпосылки аксиома обмена к этой паре не применяется."
        : model.options.A.length >= model.options.B.length
          ? "Для направленного обмена требуется |A| < |B|. Измените состав множеств и запустите проверку снова."
          : model.candidates.length
            ? "Свидетель обмена найден: " + model.candidates.join(", ") + ". Добавление любого отмеченного элемента сохраняет независимость A."
            : "A и B независимы, |A| < |B|, но ни один элемент B \\ A не расширяет A. Это явный отказ аксиомы обмена.";
      figure.caption.textContent = model.axioms.isMatroid
        ? "Для этой конечной системы полный перебор подтверждает пустое множество, наследственность и обмен"
        : "Наследственность ещё не делает систему матроидом: паросочетания пути проваливают обмен";
    }

    const mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 40,
      bind: function (api) {
        fields.system.addEventListener("change", function () {
          rebuildBuilder();
          api.reset();
        });
        fields.builder.addEventListener("change", api.reset);
      },
    });
    rebuildBuilder();
    mounted.reset();
  });
})();
