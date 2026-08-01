(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.LinearConvexOptimizationCore;

  runtime.boot("linear-convex-optimization", function (root) {
    const shell = runtime.createShell(root, {
      title: "Одна матрица — две синхронные задачи",
      description: "Меняйте цены и запасы: допустимая область, линии уровня, двойственные ограничения и сертификат оптимальности пересчитываются вместе",
    });
    shell.controls.innerHTML =
      '<label>Матрица ресурсов<select data-field="preset"><option value="balanced">Сбалансированная</option><option value="scarceFirst">Первый ресурс дефицитен</option><option value="crossed">Перекрёстная</option></select></label>' +
      '<label>Цена x, c₁: <output data-output="c1">4</output><input data-field="c1" type="range" min="1" max="9" step="1" value="4"></label>' +
      '<label>Цена y, c₂: <output data-output="c2">3</output><input data-field="c2" type="range" min="1" max="9" step="1" value="3"></label>' +
      '<label>Запас 1, b₁: <output data-output="b1">10</output><input data-field="b1" type="range" min="3" max="18" step="1" value="10"></label>' +
      '<label>Запас 2, b₂: <output data-output="b2">8</output><input data-field="b2" type="range" min="3" max="18" step="1" value="8"></label>';

    const fields = {};
    ["preset", "c1", "c2", "b1", "b2"].forEach(function (name) {
      fields[name] = shell.controls.querySelector('[data-field="' + name + '"]');
      fields[name + "Output"] = shell.controls.querySelector('[data-output="' + name + '"]');
    });

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics optimization-metrics";
    metrics.innerHTML =
      '<div><dt>Прямая вершина</dt><dd data-primal-point>—</dd></div>' +
      '<div><dt>Прямая стоимость</dt><dd data-primal-value>—</dd></div>' +
      '<div><dt>Двойственная вершина</dt><dd data-dual-point>—</dd></div>' +
      '<div><dt>Двойственная стоимость</dt><dd data-dual-value>—</dd></div>' +
      '<div><dt>Разрыв двойственности</dt><dd data-gap>—</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "linear-convex-optimization-visual",
      title: "Прямая и двойственная линейные программы",
      viewBox: "0 0 1180 680",
      className: "optimization-figure",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel optimization-panel";
    panel.innerHTML =
      '<h4>Текущий слой рассуждения</h4><p data-message></p>' +
      '<h4>Сертификат</h4><p data-certificate></p>';
    shell.workspace.appendChild(panel);

    function pointText(point) {
      return "(" + core.formatFraction(point.x) + "; " + core.formatFraction(point.y) + ")";
    }

    function syncOutputs() {
      ["c1", "c2", "b1", "b2"].forEach(function (name) {
        fields[name + "Output"].textContent = fields[name].value;
      });
    }

    function applyPreset() {
      const preset = core.PRESETS[fields.preset.value];
      fields.c1.value = String(preset.objective[0]);
      fields.c2.value = String(preset.objective[1]);
      fields.b1.value = String(preset.bounds[0]);
      fields.b2.value = String(preset.bounds[1]);
      syncOutputs();
    }

    function createState() {
      syncOutputs();
      return core.createState({
        preset: fields.preset.value,
        c1: fields.c1.value,
        c2: fields.c2.value,
        b1: fields.b1.value,
        b2: fields.b2.value,
      });
    }

    function transform(panelSpec, limit, point) {
      return {
        x: panelSpec.x + 50 + point.x / limit * panelSpec.size,
        y: panelSpec.y + panelSpec.size - point.y / limit * panelSpec.size,
      };
    }

    function lineSegment(item, limit) {
      const candidates = [];
      function addPoint(x, y) {
        if (Number.isFinite(x) && Number.isFinite(y) &&
            x >= -1e-8 && y >= -1e-8 && x <= limit + 1e-8 && y <= limit + 1e-8) {
          if (!candidates.some(function (point) {
            return Math.abs(point.x - x) < 1e-7 && Math.abs(point.y - y) < 1e-7;
          })) candidates.push({ x: Math.max(0, x), y: Math.max(0, y) });
        }
      }
      if (item.q !== 0) {
        addPoint(0, item.r / item.q);
        addPoint(limit, (item.r - item.p * limit) / item.q);
      }
      if (item.p !== 0) {
        addPoint(item.r / item.p, 0);
        addPoint((item.r - item.q * limit) / item.p, limit);
      }
      return candidates.slice(0, 2);
    }

    function polygonPath(panelSpec, limit, polygon) {
      return polygon.map(function (point, index) {
        const projected = transform(panelSpec, limit, point);
        return (index ? "L" : "M") + projected.x.toFixed(2) + " " + projected.y.toFixed(2);
      }).join(" ") + " Z";
    }

    function drawPlane(svg, panelSpec, data, options) {
      const origin = transform(panelSpec, data.limit, { x: 0, y: 0 });
      const upper = transform(panelSpec, data.limit, { x: 0, y: data.limit });
      const right = transform(panelSpec, data.limit, { x: data.limit, y: 0 });
      drawing.append(svg, "rect", {
        x: panelSpec.x, y: panelSpec.y, width: panelSpec.width, height: panelSpec.height,
        rx: 8, class: "optimization-plane",
      });
      drawing.text(svg, panelSpec.x + 24, panelSpec.y + 34, options.title, "optimization-heading");
      drawing.text(svg, panelSpec.x + 24, panelSpec.y + 60, options.subtitle, "is-muted");
      for (let tick = 0; tick <= 4; tick += 1) {
        const value = data.limit * tick / 4;
        const vertical = transform(panelSpec, data.limit, { x: value, y: 0 });
        const horizontal = transform(panelSpec, data.limit, { x: 0, y: value });
        drawing.append(svg, "line", { x1: vertical.x, y1: upper.y, x2: vertical.x, y2: origin.y, class: "optimization-grid" });
        drawing.append(svg, "line", { x1: origin.x, y1: horizontal.y, x2: right.x, y2: horizontal.y, class: "optimization-grid" });
      }
      drawing.append(svg, "line", { x1: origin.x, y1: origin.y, x2: right.x + 12, y2: right.y, class: "optimization-axis" });
      drawing.append(svg, "line", { x1: origin.x, y1: origin.y, x2: upper.x, y2: upper.y - 12, class: "optimization-axis" });
      drawing.text(svg, right.x + 12, right.y + 5, options.xLabel, "optimization-axis-label");
      drawing.text(svg, upper.x - 4, upper.y - 16, options.yLabel, "optimization-axis-label", "middle");

      if (options.showRegion && data.polygon.length) {
        drawing.append(svg, "path", { d: polygonPath(panelSpec, data.limit, data.polygon), class: "optimization-region " + options.regionClass });
      }
      data.numericConstraints.slice(0, 2).forEach(function (item, index) {
        const segment = lineSegment(item, data.limit);
        if (segment.length === 2) {
          const from = transform(panelSpec, data.limit, segment[0]);
          const to = transform(panelSpec, data.limit, segment[1]);
          drawing.append(svg, "line", {
            x1: from.x, y1: from.y, x2: to.x, y2: to.y,
            class: "optimization-constraint is-constraint-" + (index + 1) + (options.dimConstraints ? " is-dim" : ""),
          });
        }
      });

      if (options.showLevels) {
        [0.38, 0.68, 1].forEach(function (factor, index) {
          const target = core.toNumber(data.value) * factor;
          const coefficients = options.objective;
          const segment = lineSegment({ p: coefficients[0], q: coefficients[1], r: target }, data.limit);
          if (segment.length === 2) {
            const from = transform(panelSpec, data.limit, segment[0]);
            const to = transform(panelSpec, data.limit, segment[1]);
            drawing.append(svg, "line", {
              x1: from.x, y1: from.y, x2: to.x, y2: to.y,
              class: "optimization-level is-level-" + index,
            });
          }
        });
      }
      if (options.showOptimum) {
        const optimum = transform(panelSpec, data.limit, {
          x: core.toNumber(data.optimum.x), y: core.toNumber(data.optimum.y),
        });
        drawing.append(svg, "circle", { cx: optimum.x, cy: optimum.y, r: 10, class: "optimization-optimum " + options.optimumClass });
        drawing.text(svg, optimum.x + 14, optimum.y - 12, pointText(data.optimum), "optimization-point-label");
      }
    }

    function render(state) {
      const model = core.visualModel(state);
      const phaseIndex = model.frame.index;
      const A = model.options.matrix;
      const svg = figure.svg;
      drawing.clear(svg, "Прямая и двойственная линейные программы", "Два координатных вида меняются из одной матрицы, запасов и цен");
      drawPlane(svg, { x: 20, y: 18, width: 555, height: 610, size: 430 }, model.primal, {
        title: "Прямая задача · производство",
        subtitle: A[0][0] + "x + " + A[0][1] + "y ≤ " + model.options.b[0] + " · " + A[1][0] + "x + " + A[1][1] + "y ≤ " + model.options.b[1],
        xLabel: "x", yLabel: "y",
        objective: model.options.c,
        showRegion: phaseIndex >= 1,
        showLevels: phaseIndex >= 2,
        showOptimum: phaseIndex >= 3,
        regionClass: "is-primal",
        optimumClass: "is-primal",
        dimConstraints: false,
      });
      drawPlane(svg, { x: 605, y: 18, width: 555, height: 610, size: 430 }, model.dual, {
        title: "Двойственная задача · цены ресурсов",
        subtitle: A[0][0] + "u + " + A[1][0] + "v ≥ " + model.options.c[0] + " · " + A[0][1] + "u + " + A[1][1] + "v ≥ " + model.options.c[1],
        xLabel: "u", yLabel: "v",
        objective: model.options.b,
        showRegion: phaseIndex >= 4,
        showLevels: phaseIndex >= 5,
        showOptimum: phaseIndex >= 5,
        regionClass: "is-dual",
        optimumClass: "is-dual",
        dimConstraints: phaseIndex < 4,
      });
      drawing.text(svg, 590, 658, "max cᵀx  =  min bᵀy", phaseIndex >= 6 ? "optimization-equality is-active" : "optimization-equality", "middle");

      metrics.querySelector("[data-primal-point]").textContent = pointText(model.primal.optimum);
      metrics.querySelector("[data-primal-value]").textContent = core.formatFraction(model.primal.value);
      metrics.querySelector("[data-dual-point]").textContent = pointText(model.dual.optimum);
      metrics.querySelector("[data-dual-value]").textContent = core.formatFraction(model.dual.value);
      metrics.querySelector("[data-gap]").textContent = "0";
      panel.querySelector("[data-message]").textContent = model.frame.message;
      panel.querySelector("[data-certificate]").textContent = phaseIndex >= 6
        ? "Стоимость совпала точно; четыре произведения «переменная × запас» равны " + model.complementaryProducts.map(core.formatFraction).join(", ")
        : "Сначала найдите обе оптимальные вершины; затем лаборатория сопоставит значения и активные ограничения";
      figure.caption.textContent = "Ограничения прямой задачи становятся столбцовыми требованиями двойственной; b и c меняются ролями, поэтому каждый регулятор влияет на обе панели";
    }

    const mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 12,
      bind: function (api) {
        fields.preset.addEventListener("change", function () {
          applyPreset();
          api.reset();
        });
        ["c1", "c2", "b1", "b2"].forEach(function (name) {
          fields[name].addEventListener("input", function () {
            syncOutputs();
            api.reset();
          });
        });
      },
    });
    mounted.reset();
  });
})();
