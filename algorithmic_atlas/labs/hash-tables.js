(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.HashTablesCore;

  function parseKeys(raw) {
    return raw.split(/[\s,;]+/).filter(Boolean).map(Number);
  }

  runtime.boot("hash-tables", function (root) {
    const shell = runtime.createShell(root, {
      title: "Один поток ключей — четыре стратегии",
      description: "Наблюдайте цепочки, пробирование, displacement Robin Hood и полную перестройку при росте таблицы",
    });
    shell.controls.innerHTML =
      '<label class="atlas-lab__field is-wide">Ключи<input data-field="keys" value="18, 25, 39, 11, 32, 4, 53, 67, 74" inputmode="numeric"></label>' +
      '<label>Начальная ёмкость<input data-field="capacity" type="number" min="5" max="31" value="7"></label>' +
      '<label>Seed семейства<input data-field="seed" type="number" value="2027"></label>';
    const keys = shell.controls.querySelector('[data-field="keys"]');
    const capacity = shell.controls.querySelector('[data-field="capacity"]');
    const seed = shell.controls.querySelector('[data-field="seed"]');
    const figure = runtime.createFigure(shell.workspace, {
      id: "hash-tables-visual", title: "Размещение ключей", viewBox: "0 0 900 570",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Текущая вставка</h4><p data-event></p><ul data-probes></ul><dl class="atlas-lab__metrics" data-metrics></dl>';
    shell.workspace.appendChild(panel);
    const eventText = panel.querySelector("[data-event]");
    const probes = panel.querySelector("[data-probes]");
    const metrics = panel.querySelector("[data-metrics]");
    const labels = { chaining: "цепочки", linear: "линейное", double: "двойное", "robin-hood": "Robin Hood" };

    function createState() {
      return core.createState({ keys: parseKeys(keys.value), capacity: Number(capacity.value), seed: Number(seed.value) });
    }

    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Сравнение хеш-таблиц", "Четыре строки показывают размещение одного набора ключей разными стратегиями");
      const visibleCapacity = Math.min(23, model.capacity);
      const cellWidth = Math.min(31, 720 / visibleCapacity);
      const start = 150;
      core.STRATEGIES.forEach(function (strategy, rowIndex) {
        const y = 70 + rowIndex * 112;
        drawing.text(svg, 132, y + 28, labels[strategy], "is-strong", "end");
        const path = model.details ? model.details[strategy].probes : [];
        const swaps = model.details ? model.details[strategy].swaps.map(function (item) { return item.position; }) : [];
        for (let index = 0; index < visibleCapacity; index += 1) {
          const classes = ["hash-slot"];
          if (path.includes(index)) classes.push("is-probed");
          if (swaps.includes(index)) classes.push("is-swapped");
          drawing.append(svg, "rect", { x: start + index * cellWidth, y: y, width: cellWidth - 2, height: 55, class: classes.join(" ") });
          const slot = model.tables[strategy][index];
          let label = "·";
          if (strategy === "chaining") label = slot.length ? slot.join("|") : "·";
          else if (slot) label = slot.key + (strategy === "robin-hood" ? "·" + slot.displacement : "");
          drawing.text(svg, start + (index + 0.5) * cellWidth, y + 24, label, label === "·" ? "is-muted" : "is-strong", "middle");
          drawing.text(svg, start + (index + 0.5) * cellWidth, y + 47, index, "is-muted", "middle");
        }
        drawing.text(svg, 865, y + 28, model.omittedSlots ? "+" + model.omittedSlots : "", "is-muted", "end");
      });
      drawing.text(svg, 150, 530, "α", "is-strong", "start");
      drawing.append(svg, "rect", { x: 180, y: 510, width: 600, height: 25, class: "hash-load-track" });
      drawing.append(svg, "rect", { x: 180, y: 510, width: 600 * Math.min(1, model.loadFactor), height: 25, class: "hash-load-fill" });
      drawing.text(svg, 795, 530, model.loadFactor.toFixed(3), "is-strong", "start");
      eventText.textContent = model.message;
      probes.replaceChildren();
      if (model.details) {
        core.STRATEGIES.forEach(function (strategy) {
          const detail = model.details[strategy];
          const item = document.createElement("li");
          item.textContent = labels[strategy] + ": позиции " + detail.probes.join(" → ") +
            "; коллизий " + detail.collisions + (detail.swaps.length ? "; вытеснений " + detail.swaps.length : "");
          probes.appendChild(item);
        });
      }
      metrics.innerHTML = [
        ["ключей", model.insertedCount], ["ёмкость", model.capacity], ["load factor", model.loadFactor.toFixed(3)], ["перестроек", model.rebuilds],
      ].map(function (item) { return "<div><dt>" + item[0] + "</dt><dd>" + item[1] + "</dd></div>"; }).join("");
      figure.caption.textContent = model.schematic
        ? "После роста показаны первые 23 слота; все вычисления выполняются для полной таблицы"
        : "Подсвеченные ячейки образуют путь текущего ключа; число после точки у Robin Hood — displacement";
    }

    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 100,
      bind: function (api) { shell.controls.addEventListener("change", function () { api.reset(); }); },
    });
  });
})();
