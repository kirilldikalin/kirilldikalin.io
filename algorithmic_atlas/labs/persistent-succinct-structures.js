(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.PersistentSuccinctStructuresCore;

  function parseValues(raw) {
    return raw.split(/[\s,;]+/).filter(Boolean).map(Number);
  }

  function parseUpdates(raw) {
    return raw.split(/\s*;\s*/).filter(Boolean).map(function (part) {
      const match = part.match(/^v?(\d+)\s*:\s*(\d+)\s*=\s*(-?\d+)$/i);
      if (!match) throw new RangeError("Обновление записывается как v0:3=9");
      return { base: Number(match[1]), index: Number(match[2]), value: Number(match[3]) };
    });
  }

  runtime.boot("persistent-succinct-structures", function (root) {
    const shell = runtime.createShell(root, {
      title: "Версии делят узлы, биты делят индекс",
      description: "Проследите path copying в графе версий либо вычислите rank/select через двухуровневый служебный индекс",
    });
    shell.controls.innerHTML =
      '<label>Режим<select data-field="mode"><option value="persistent">персистентные версии</option><option value="bitvector">succinct bitvector</option></select></label>' +
      '<label data-group="persistent" class="atlas-lab__field is-wide">Исходные значения, длина — степень двойки<input data-field="values" value="2, 1, 3, 0, 4, 2, 1, 5" inputmode="numeric"></label>' +
      '<label data-group="persistent" class="atlas-lab__field is-wide">Обновления: базовая версия : позиция = значение<input data-field="updates" value="v0:3=9; v1:6=7; v0:1=8" inputmode="text"></label>' +
      '<label data-group="bitvector">Операция<select data-field="operation"><option value="rank">rank₁(i)</option><option value="select">select₁(k)</option></select></label>' +
      '<label data-group="bitvector" class="atlas-lab__field is-wide">Битовый вектор<input data-field="bits" value="1011010010110101" inputmode="numeric"></label>' +
      '<label data-group="bitvector">Позиция i или ранг k<input data-field="target" value="11" inputmode="numeric"></label>';

    const mode = shell.controls.querySelector('[data-field="mode"]');
    const values = shell.controls.querySelector('[data-field="values"]');
    const updates = shell.controls.querySelector('[data-field="updates"]');
    const operation = shell.controls.querySelector('[data-field="operation"]');
    const bits = shell.controls.querySelector('[data-field="bits"]');
    const target = shell.controls.querySelector('[data-field="target"]');
    const figure = runtime.createFigure(shell.workspace, {
      id: "persistent-succinct-structures-visual",
      title: "Физическое представление структуры",
      viewBox: "0 0 900 650",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Текущий шаг</h4><p data-event></p><dl class="atlas-lab__metrics" data-metrics></dl><p class="atlas-lab__note" data-note></p>';
    shell.workspace.appendChild(panel);
    const eventText = panel.querySelector("[data-event]");
    const metrics = panel.querySelector("[data-metrics]");
    const note = panel.querySelector("[data-note]");

    function configureMode(resetTarget) {
      shell.controls.querySelectorAll("[data-group]").forEach(function (element) {
        element.hidden = element.dataset.group !== mode.value;
      });
      if (mode.value === "bitvector" && resetTarget) {
        target.value = operation.value === "rank" ? "11" : "5";
      }
    }

    function createState() {
      if (mode.value === "persistent") {
        return core.createState("persistent", {
          values: parseValues(values.value),
          updates: parseUpdates(updates.value),
        });
      }
      return core.createState("bitvector", {
        bitString: bits.value,
        operation: operation.value,
        target: Number(target.value),
      });
    }

    function metricRows(rows) {
      return rows.map(function (item) {
        return "<div><dt>" + item[0] + "</dt><dd>" + item[1] + "</dd></div>";
      }).join("");
    }

    function renderPersistent(model, state) {
      const svg = figure.svg;
      drawing.clear(svg, "Граф версий и активное персистентное дерево", "Версии соединены с базовыми версиями, а узлы активного дерева отмечают копирование и совместное владение");
      drawing.text(svg, 45, 28, "граф версий", "is-strong");
      const versionPositions = {};
      model.versions.forEach(function (version) {
        versionPositions[version.id] = {
          x: 80 + version.xShare * 740,
          y: 58 + Math.min(version.level, 2) * 48,
        };
      });
      model.versionEdges.forEach(function (edge) {
        const from = versionPositions[edge.from];
        const to = versionPositions[edge.to];
        drawing.append(svg, "line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: "persistent-version-edge" });
      });
      model.versions.forEach(function (version) {
        const position = versionPositions[version.id];
        const classes = ["persistent-version"];
        if (version.active) classes.push("is-active");
        if (version.base) classes.push("is-base");
        drawing.append(svg, "circle", { cx: position.x, cy: position.y, r: 23, class: classes.join(" ") });
        drawing.text(svg, position.x, position.y + 5, version.id, "is-strong", "middle");
        drawing.text(svg, position.x, position.y + 38, version.label, "is-muted", "middle");
      });
      drawing.append(svg, "line", { x1: 35, y1: 180, x2: 865, y2: 180, class: "persistent-divider" });
      drawing.text(svg, 45, 205, "активная версия: " + model.versions.find(function (version) { return version.active; }).id, "is-strong");
      const positions = {};
      model.nodes.forEach(function (node) {
        positions[node.id] = { x: 65 + node.xShare * 770, y: 242 + node.depth * 88 };
      });
      model.edges.forEach(function (edge) {
        drawing.append(svg, "line", {
          x1: positions[edge.from].x, y1: positions[edge.from].y,
          x2: positions[edge.to].x, y2: positions[edge.to].y,
          class: "persistent-tree-edge",
        });
      });
      model.nodes.forEach(function (node) {
        const position = positions[node.id];
        const classes = ["persistent-tree-node"];
        if (node.shared) classes.push("is-shared");
        if (node.copied) classes.push("is-copied");
        if (node.onPath) classes.push("is-path");
        if (node.active) classes.push("is-active");
        drawing.append(svg, "rect", { x: position.x - 25, y: position.y - 22, width: 50, height: 44, rx: 6, class: classes.join(" ") });
        drawing.text(svg, position.x, position.y - 2, node.value === null ? "Σ=" + node.sum : "a=" + node.value, "is-strong", "middle");
        drawing.text(svg, position.x, position.y + 14, "[" + node.lo + "," + node.hi + ")", "is-muted", "middle");
      });
      eventText.textContent = model.event;
      metrics.innerHTML = metricRows([
        ["версий", model.versions.length],
        ["физических узлов", model.physicalNodes],
        ["узлов при полном копировании", model.logicalNodes],
        ["скопировано на пути", model.copiedCount],
        ["разделяемых узлов", model.sharedCount],
        ["кадр", (state.frameIndex + 1) + " / " + state.trace.frames.length],
      ]);
      note.textContent = "Заливка «общий» означает один физический узел, достижимый из нескольких корней; старые версии не переписываются";
      figure.caption.textContent = "Граф сверху допускает ветвление от старой версии; снизу показан только активный корень, чтобы связи оставались читаемыми";
    }

    function renderBitvector(model, state) {
      const svg = figure.svg;
      drawing.clear(svg, "Битовый вектор и индекс rank/select", "Биты разбиты на superblocks по восемь и blocks по четыре, подсветка показывает выбранную область и остаточный просмотр");
      const cellsPerRow = 16;
      const cellStep = 46;
      const rowStep = 138;
      const left = 72;
      model.bits.forEach(function (entry) {
        const column = entry.position % cellsPerRow;
        const row = Math.floor(entry.position / cellsPerRow);
        const x = left + column * cellStep;
        const y = 62 + row * rowStep;
        if (entry.position % model.superblockSize === 0) {
          const remaining = Math.min(model.superblockSize, model.bits.length - entry.position);
          drawing.append(svg, "rect", {
            x: x - 7, y: y - 34, width: remaining * cellStep - 4, height: 94, rx: 8,
            class: "bit-superblock" + (entry.activeSuper ? " is-active" : ""),
          });
          drawing.text(svg, x, y - 15, "S" + entry.superIndex + ": " + model.superRanks[entry.superIndex], "is-muted");
        }
        if (entry.position % model.blockSize === 0) {
          const remaining = Math.min(model.blockSize, model.bits.length - entry.position);
          drawing.append(svg, "line", {
            x1: x - 2, y1: y + 49, x2: x + remaining * cellStep - 12, y2: y + 49,
            class: "bit-block-line" + (entry.activeBlock ? " is-active" : ""),
          });
          drawing.text(svg, x, y + 73, "B" + entry.blockIndex + ": " + model.blockRanks[entry.blockIndex], "is-muted");
        }
        const classes = ["bitvector-cell"];
        if (entry.scanned) classes.push("is-scanned");
        if (entry.active) classes.push("is-active");
        drawing.append(svg, "rect", { x: x, y: y, width: 36, height: 36, rx: 4, class: classes.join(" ") });
        drawing.text(svg, x + 18, y + 24, entry.bit, "is-strong", "middle");
        drawing.text(svg, x + 18, y + 46, entry.position, "is-muted", "middle");
      });
      eventText.textContent = model.event;
      metrics.innerHTML = metricRows([
        ["операция", model.operation === "rank" ? "rank₁(i)" : "select₁(k)"],
        ["аргумент", model.target],
        ["единиц всего", model.ones],
        ["текущий счёт", model.count],
        ["результат", model.result === null ? "—" : model.result],
        ["кадр", (state.frameIndex + 1) + " / " + state.trace.frames.length],
      ]);
      note.textContent = model.operation === "rank"
        ? "rank₁(i) считает единицы на полуинтервале [0, i); сама позиция i не включается"
        : "select₁(k) возвращает нулевую позицию k-й единицы, а k нумеруется от единицы";
      figure.caption.textContent = "S хранит абсолютный счёт до superblock, B — счёт от его начала; после двух обращений сканируется не более четырёх битов";
    }

    function render(state) {
      const model = core.visualModel(state);
      if (model.mode === "persistent") renderPersistent(model, state);
      else renderBitvector(model, state);
    }

    configureMode(false);
    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 220,
      bind: function (api) {
        mode.addEventListener("change", function () { configureMode(true); api.reset(); });
        operation.addEventListener("change", function () { target.value = operation.value === "rank" ? "11" : "5"; api.reset(); });
        shell.controls.addEventListener("change", function (event) {
          if (event.target !== mode && event.target !== operation) api.reset();
        });
      },
    });
  });
})();
