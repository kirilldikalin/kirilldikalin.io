(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const geometry = window.AtlasGeometryLabRuntime;
  const core = window.SweepLineClosestPairRangeSearchCore;

  runtime.boot("sweep-line-closest-pair-range-search", function (root) {
    root.classList.add("atlas-geometry-lab");
    const shell = runtime.createShell(root, {
      title: "Три способа не смотреть на все пары",
      description: "Линия замета ограничивает активные отрезки, divide and conquer оставляет узкую полосу, а kd-дерево отсекает целые прямоугольники",
    });
    shell.controls.innerHTML =
      '<label>Режим<select data-field="mode"><option value="sweep">Пересечения: sweep line</option><option value="closest">Ближайшая пара</option><option value="range">Диапазонный запрос: kd-tree</option></select></label>' +
      '<label>Пример<select data-field="preset"><option value="city">Плотная сцена</option><option value="sparse">Разреженная сцена</option><option value="degenerate">Вырожденные случаи</option></select></label>' +
      '<label>Кадр<input data-field="cursor" type="range" min="0" max="1" value="0"><output data-cursor-output>1 / 1</output></label>';
    const fields = {
      mode: shell.controls.querySelector('[data-field="mode"]'),
      preset: shell.controls.querySelector('[data-field="preset"]'),
      cursor: shell.controls.querySelector('[data-field="cursor"]'),
      cursorOutput: shell.controls.querySelector("[data-cursor-output]"),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Режим</dt><dd data-metric="mode">—</dd></div>' +
      '<div><dt>Активно / посещено</dt><dd data-metric="active">—</dd></div>' +
      '<div><dt>Найдено</dt><dd data-metric="found">—</dd></div>' +
      '<div><dt>Точная метрика</dt><dd data-metric="value">—</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "sweep-closest-range-scene",
      title: "Геометрическое состояние алгоритма",
      viewBox: "0 0 920 560",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Почему следующий шаг безопасен</h4><p data-message></p><p class="atlas-lab__note" data-invariant></p>';
    shell.workspace.appendChild(panel);

    let data = core.preset("city");
    let mode = "sweep";
    let mounted = null;
    let fitNeeded = true;
    const scene = geometry.mount(figure.svg, {
      bounds: geometry.boundsForPoints(data.points.concat(data.segments.flatMap(function (segment) { return [segment.a, segment.b]; })), 2),
      onViewChange: function () { if (mounted) mounted.render(); },
    });

    function allScenePoints(model) {
      return model.mode === "sweep"
        ? model.data.segments.flatMap(function (segment) { return [segment.a, segment.b]; })
        : model.data.points;
    }

    function drawSweep(viewport, transform, model) {
      const active = new Set(model.frame.activeIds || []);
      model.data.segments.forEach(function (segment) {
        geometry.drawSegment(viewport, transform, segment.a, segment.b, {
          id: segment.id,
          className: active.has(segment.id) ? "is-active" : "",
          focusable: true,
          ariaLabel: "Отрезок " + segment.id,
        });
        geometry.drawPoint(viewport, transform, segment.a, { focusable: false, radius: 6 });
        geometry.drawPoint(viewport, transform, segment.b, { focusable: false, radius: 6 });
      });
      const top = transform.toCanvas({ x: model.frame.sweepX || 0, y: transform.bounds.maxY });
      const bottom = transform.toCanvas({ x: model.frame.sweepX || 0, y: transform.bounds.minY });
      geometry.append(viewport, "line", { x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y, class: "atlas-geometry__sweep" });
      (model.frame.intersections || []).forEach(function (entry, index) {
        const value = entry.value;
        if (value.point) {
          geometry.drawPoint(viewport, transform, { id: "x" + index, label: "×", x: value.point.x, y: value.point.y }, { className: "is-active", focusable: false, radius: 7 });
        } else if (value.segment) {
          geometry.drawSegment(viewport, transform, value.segment[0], value.segment[1], { className: "is-bad" });
        }
      });
    }

    function drawClosest(viewport, transform, model) {
      const active = new Set(model.frame.activeIds || []);
      const strip = new Set(model.frame.stripIds || []);
      if (Number.isFinite(model.frame.splitX)) {
        const bestDistance = model.frame.best ? Math.sqrt(Number(model.frame.best.distanceSquared)) : 0;
        const left = transform.toCanvas({ x: model.frame.splitX - bestDistance, y: transform.bounds.maxY });
        const right = transform.toCanvas({ x: model.frame.splitX + bestDistance, y: transform.bounds.minY });
        geometry.append(viewport, "rect", {
          x: Math.min(left.x, right.x), y: Math.min(left.y, right.y),
          width: Math.abs(right.x - left.x), height: Math.abs(right.y - left.y),
          class: "atlas-geometry__query",
        });
      }
      if (model.frame.best) {
        geometry.drawSegment(viewport, transform, model.frame.best.a, model.frame.best.b, { className: "is-good" });
      }
      if (model.frame.candidate) {
        geometry.drawSegment(viewport, transform, model.frame.candidate.a, model.frame.candidate.b, { className: "is-candidate" });
      }
      model.data.points.forEach(function (point) {
        geometry.drawPoint(viewport, transform, point, {
          className: active.has(point.id) ? "is-active" : strip.has(point.id) ? "is-candidate" : "",
        });
      });
    }

    function walkTree(node, callback) {
      if (!node) return;
      callback(node); walkTree(node.left, callback); walkTree(node.right, callback);
    }

    function drawRange(viewport, transform, model) {
      const query = model.data.query;
      const cornerA = transform.toCanvas({ x: query.minX, y: query.maxY });
      const cornerB = transform.toCanvas({ x: query.maxX, y: query.minY });
      geometry.append(viewport, "rect", {
        x: Math.min(cornerA.x, cornerB.x), y: Math.min(cornerA.y, cornerB.y),
        width: Math.abs(cornerB.x - cornerA.x), height: Math.abs(cornerB.y - cornerA.y),
        class: "atlas-geometry__query",
      });
      const visitedNodes = new Set(model.frame.visitedIds || []);
      const prunedRoots = new Set(model.frame.prunedIds || []);
      const prunedNodes = new Set();
      const found = new Set(model.frame.foundIds || []);
      const nodeByPoint = new Map();
      function markPrunedSubtree(node, inheritedPruning) {
        if (!node) return;
        const isPruned = inheritedPruning || prunedRoots.has(node.id);
        if (isPruned) prunedNodes.add(node.id);
        markPrunedSubtree(node.left, isPruned);
        markPrunedSubtree(node.right, isPruned);
      }
      markPrunedSubtree(model.result.tree.root, false);
      walkTree(model.result.tree.root, function (node) {
        nodeByPoint.set(node.point.id, node);
        const region = node.region;
        if (node.axis === "x") {
          geometry.drawSegment(viewport, transform, { x: node.point.x, y: region.minY }, { x: node.point.x, y: region.maxY }, { className: prunedNodes.has(node.id) ? "is-muted" : visitedNodes.has(node.id) ? "is-active" : "is-candidate" });
        } else {
          geometry.drawSegment(viewport, transform, { x: region.minX, y: node.point.y }, { x: region.maxX, y: node.point.y }, { className: prunedNodes.has(node.id) ? "is-muted" : visitedNodes.has(node.id) ? "is-active" : "is-candidate" });
        }
      });
      model.data.points.forEach(function (point) {
        const node = nodeByPoint.get(point.id);
        geometry.drawPoint(viewport, transform, point, {
          className: found.has(point.id) ? "is-active" : node && prunedNodes.has(node.id) ? "is-rejected" : "",
        });
      });
    }

    function render(state) {
      const model = core.visualModel(state);
      if (fitNeeded) { scene.fit(allScenePoints(model), 2); fitNeeded = false; }
      const transform = scene.transform();
      const viewport = geometry.clear(figure.svg, "Sweep line, ближайшая пара и kd-tree", "Геометрия синхронизирована с текущим кадром алгоритма");
      geometry.drawGrid(viewport, transform, 1);
      if (model.mode === "sweep") drawSweep(viewport, transform, model);
      else if (model.mode === "closest") drawClosest(viewport, transform, model);
      else drawRange(viewport, transform, model);

      fields.cursor.max = String(model.frameCount - 1);
      fields.cursor.value = String(model.cursor);
      fields.cursorOutput.value = (model.cursor + 1) + " / " + model.frameCount;
      fields.cursorOutput.textContent = fields.cursorOutput.value;
      metrics.querySelector('[data-metric="mode"]').textContent = ({ sweep: "sweep line", closest: "divide and conquer", range: "kd-tree" })[model.mode];
      if (model.mode === "sweep") {
        metrics.querySelector('[data-metric="active"]').textContent = String((model.frame.activeIds || []).length);
        metrics.querySelector('[data-metric="found"]').textContent = String((model.frame.intersections || []).length);
        metrics.querySelector('[data-metric="value"]').textContent = "x = " + String(model.frame.sweepX || 0);
        panel.querySelector("[data-invariant]").textContent = "В статусе остаются только отрезки, чьи x-проекции пересекают текущую вертикаль";
      } else if (model.mode === "closest") {
        metrics.querySelector('[data-metric="active"]').textContent = String((model.frame.stripIds || []).length);
        metrics.querySelector('[data-metric="found"]').textContent = model.frame.best ? model.frame.best.a.id + "–" + model.frame.best.b.id : "—";
        metrics.querySelector('[data-metric="value"]').textContent = model.frame.best ? "δ² = " + String(model.frame.best.distanceSquared) : "—";
        panel.querySelector("[data-invariant]").textContent = "После решений половин новая лучшая пара может пересекать границу только внутри полосы ширины 2δ";
      } else {
        metrics.querySelector('[data-metric="active"]').textContent = String((model.frame.visitedIds || []).length);
        metrics.querySelector('[data-metric="found"]').textContent = String((model.frame.foundIds || []).length);
        metrics.querySelector('[data-metric="value"]').textContent = "отсечено " + String((model.frame.prunedIds || []).length);
        panel.querySelector("[data-invariant]").textContent = "Поддерево можно отбросить лишь когда его ограничивающий прямоугольник не пересекает запрос";
      }
      panel.querySelector("[data-message]").textContent = model.frame.message;
      figure.caption.textContent = "Сцена поддерживает панорамирование, масштабирование колесом и клавиши +, −, 0 и стрелки";
    }

    function createState() { return core.createState(data, { mode: mode }); }
    function bind(api) {
      fields.mode.addEventListener("change", function () { mode = fields.mode.value; fitNeeded = true; api.reset(); });
      fields.preset.addEventListener("change", function () { data = core.preset(fields.preset.value); fitNeeded = true; api.reset(); });
      fields.cursor.addEventListener("input", function () { api.setState(core.seek(api.getState(), Number(fields.cursor.value)), "Выбран кадр трассы"); });
      shell.controls.addEventListener("submit", function (event) { event.preventDefault(); });
    }
    mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.playback.finished; },
      render: render,
      bind: bind,
      maxAutomaticSteps: 256,
    });
  });
})();
