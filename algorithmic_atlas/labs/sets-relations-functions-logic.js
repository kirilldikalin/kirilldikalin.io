(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.SetsRelationsFunctionsLogicCore;
  runtime.boot("sets-relations-functions-logic", function (root) {
    const shell = runtime.createShell(root, {
      title: "Конструктор отображений и отношений",
      description: "Переключайте пары и наблюдайте свойства, классы эквивалентности и рёбра диаграммы Хассе",
    });
    shell.controls.innerHTML = '<label class="atlas-lab__field is-wide">Сценарий<select data-lab-field="preset">' + core.PRESETS.map(function (preset, index) { return '<option value="' + index + '">' + preset.label + "</option>"; }).join("") + "</select></label>";
    const presetSelect = shell.controls.querySelector('[data-lab-field="preset"]');
    const figure = runtime.createFigure(shell.workspace, { id: "relations-visual", title: "Структура отношения", viewBox: "0 0 760 430" });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Пары отношения</h4><div class="relation-pair-grid" data-pair-grid></div><h4>Свойства</h4><ul data-properties></ul>';
    shell.workspace.appendChild(panel);
    const pairGrid = panel.querySelector("[data-pair-grid]");
    const propertiesList = panel.querySelector("[data-properties]");
    const overrides = new Map();
    let app;

    function activePairs(preset) { return overrides.get(preset.id) || preset.pairs; }
    function createState() { return core.createState(Number(presetSelect.value)); }
    function render(state) {
      presetSelect.value = String(state.presetIndex);
      const preset = core.PRESETS[state.presetIndex];
      const pairs = activePairs(preset);
      const svg = figure.svg;
      drawing.clear(svg, preset.label, "Элементы и стрелки выбранного отношения");
      let properties;
      if (preset.mode === "mapping") {
        properties = core.mappingProperties(preset.domain, preset.codomain, pairs);
        preset.domain.forEach(function (value, index) {
          drawing.append(svg, "circle", { cx: 130, cy: 80 + index * 110, r: 28, class: "relation-node" });
          drawing.text(svg, 130, 85 + index * 110, value, "is-strong", "middle");
        });
        preset.codomain.forEach(function (value, index) {
          drawing.append(svg, "circle", { cx: 620, cy: 80 + index * 110, r: 28, class: "relation-node" });
          drawing.text(svg, 620, 85 + index * 110, value, "is-strong", "middle");
        });
        pairs.forEach(function (pair) {
          const leftIndex = preset.domain.indexOf(pair[0]);
          const rightIndex = preset.codomain.indexOf(pair[1]);
          drawing.append(svg, "line", { x1: 160, y1: 80 + leftIndex * 110, x2: 590, y2: 80 + rightIndex * 110, class: "relation-edge" });
        });
      } else {
        properties = core.relationProperties(preset.elements, pairs);
        const positions = new Map();
        if (preset.mode === "poset" && properties.partialOrder) {
          const edges = core.hasseEdges(preset.elements, pairs);
          const coordinates = { "1": [380, 350], "2": [250, 220], "3": [510, 220], "6": [380, 80] };
          preset.elements.forEach(function (value, index) { positions.set(value, coordinates[value] || [120 + index * 160, 210]); });
          edges.forEach(function (pair) {
            const from = positions.get(pair[0]); const to = positions.get(pair[1]);
            drawing.append(svg, "line", { x1: from[0], y1: from[1], x2: to[0], y2: to[1], class: "relation-edge" });
          });
        } else {
          preset.elements.forEach(function (value, index) {
            const angle = 2 * Math.PI * index / preset.elements.length - Math.PI / 2;
            positions.set(value, [380 + 230 * Math.cos(angle), 220 + 150 * Math.sin(angle)]);
          });
          pairs.filter(function (pair) { return pair[0] !== pair[1]; }).forEach(function (pair) {
            const from = positions.get(pair[0]); const to = positions.get(pair[1]);
            const violation = properties.witnesses.transitivityTriple && pair[0] === properties.witnesses.transitivityTriple[0] && pair[1] === properties.witnesses.transitivityTriple[1];
            drawing.append(svg, "line", { x1: from[0], y1: from[1], x2: to[0], y2: to[1], class: "relation-edge" + (violation ? " is-violation" : "") });
          });
        }
        preset.elements.forEach(function (value) {
          const position = positions.get(value);
          drawing.append(svg, "circle", { cx: position[0], cy: position[1], r: 29, class: "relation-node" });
          drawing.text(svg, position[0], position[1] + 5, value, "is-strong", "middle");
        });
      }
      renderPairGrid(preset, pairs);
      propertiesList.replaceChildren();
      Object.entries(properties).filter(function (entry) { return typeof entry[1] === "boolean"; }).forEach(function (entry) {
        const item = document.createElement("li"); item.textContent = entry[0] + ": " + (entry[1] ? "да" : "нет"); propertiesList.appendChild(item);
      });
      figure.caption.textContent = preset.mode === "poset" ? "У транзитивных рёбер нет отдельной линии: диаграмма Хассе показывает только покрытия" : "Красный пунктир отмечает пару, участвующую в найденном нарушении";
    }

    function renderPairGrid(preset, pairs) {
      pairGrid.replaceChildren();
      const left = preset.mode === "mapping" ? preset.domain : preset.elements;
      const right = preset.mode === "mapping" ? preset.codomain : preset.elements;
      const active = new Set(pairs.map(function (pair) { return pair.join("\u0000"); }));
      left.forEach(function (a) { right.forEach(function (b) {
        const label = document.createElement("label");
        const input = document.createElement("input"); input.type = "checkbox"; input.checked = active.has(a + "\u0000" + b);
        input.addEventListener("change", function () {
          const next = new Set(active); const key = a + "\u0000" + b;
          if (input.checked) next.add(key); else next.delete(key);
          overrides.set(preset.id, Array.from(next).map(function (value) { return value.split("\u0000"); }));
          app.render();
        });
        label.append(input, document.createTextNode(a + "→" + b)); pairGrid.appendChild(label);
      }); });
    }
    app = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 4,
      bind: function (api) { shell.controls.addEventListener("change", function () { api.reset(); }); },
    });
  });
})();
