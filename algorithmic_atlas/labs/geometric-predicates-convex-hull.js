(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const geometry = window.AtlasGeometryLabRuntime;
  const core = window.GeometricPredicatesConvexHullCore;

  runtime.boot("geometric-predicates-convex-hull", function (root) {
    root.classList.add("atlas-geometry-lab");
    const shell = runtime.createShell(root, {
      title: "Точные предикаты и построение выпуклой оболочки",
      description: "Перемещайте точки мышью, касанием или стрелками. Один и тот же целочисленный determinant управляет ориентацией, пересечением и решениями алгоритма оболочки",
    });
    shell.controls.innerHTML =
      '<label>Набор точек<select data-field="preset"><option value="cloud">Облако с внутренними точками</option><option value="collinear">Коллинеарная граница</option><option value="intersections">Пересекающиеся отрезки</option><option value="duplicates">Совпадающие координаты</option></select></label>' +
      '<label>Алгоритм<select data-field="algorithm"><option value="andrew">Монотонная цепь Эндрю</option><option value="graham">Скан Грэхема</option><option value="jarvis">Марш Джарвиса</option></select></label>' +
      '<label>Кадр<input data-field="cursor" type="range" min="0" max="1" value="0"><output data-cursor-output>1 / 1</output></label>';

    const fields = {
      preset: shell.controls.querySelector('[data-field="preset"]'),
      algorithm: shell.controls.querySelector('[data-field="algorithm"]'),
      cursor: shell.controls.querySelector('[data-field="cursor"]'),
      cursorOutput: shell.controls.querySelector("[data-cursor-output]"),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>det(A, B, C)</dt><dd data-metric="det">—</dd></div>' +
      '<div><dt>Ориентация</dt><dd data-metric="orientation">—</dd></div>' +
      '<div><dt>AB ∩ CD</dt><dd data-metric="intersection">—</dd></div>' +
      '<div><dt>Вершин оболочки</dt><dd data-metric="hull">—</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "geometric-predicates-convex-hull-scene",
      title: "Единая геометрическая сцена",
      viewBox: "0 0 920 560",
    });
    const explanation = document.createElement("section");
    explanation.className = "atlas-lab__panel";
    explanation.innerHTML = '<h4>Текущий вывод</h4><p data-message></p><p class="atlas-lab__note" data-detail></p>';
    shell.workspace.appendChild(explanation);

    let points = core.preset("cloud");
    let algorithm = "andrew";
    let mounted = null;
    let fitNeeded = true;
    const scene = geometry.mount(figure.svg, {
      bounds: geometry.boundsForPoints(points, 2),
      onViewChange: function () { if (mounted) mounted.render(); },
      onPointMove: function (id, x, y) { replacePoint(id, x, y); },
      onPointNudge: function (id, dx, dy) {
        const point = points.find(function (candidate) { return candidate.id === id; });
        if (point) replacePoint(id, point.x + dx, point.y + dy);
      },
    });

    function replacePoint(id, x, y) {
      if (!mounted) return;
      try {
        points = core.movePoint(points, id, x, y);
        fitNeeded = false;
        mounted.setState(core.createState(points, { algorithm: algorithm }), "Точка " + id + " перемещена; трасса пересчитана точно");
        mounted.clearError();
      } catch (error) {
        mounted.showError(error.message);
      }
    }

    function orientationText(value) {
      return value === null ? "—" : value > 0 ? "левый поворот" : value < 0 ? "правый поворот" : "коллинеарны";
    }

    function intersectionText(value) {
      if (!value) return "—";
      return ({ proper: "пересечение", touch: "касание", overlap: "перекрытие", none: "нет" })[value.type];
    }

    function draw(model) {
      if (fitNeeded) {
        scene.fit(model.points, 2);
        fitNeeded = false;
      }
      const transform = scene.transform();
      const viewport = geometry.clear(
        figure.svg,
        "Предикаты и оболочка",
        "Точки можно перемещать; цвет показывает текущий алгоритмический статус"
      );
      geometry.drawGrid(viewport, transform, 1);

      if (model.predicates.triple.length === 3) {
        geometry.drawPolygon(viewport, transform, model.predicates.triple, {
          className: model.predicates.orientation === 0 ? "is-bad" : "is-candidate",
          ariaLabel: "Ориентированный треугольник первых трёх точек",
        });
      }
      if (model.predicates.segments.length === 2) {
        geometry.drawSegment(viewport, transform, model.predicates.segments[0][0], model.predicates.segments[0][1], { className: "is-good" });
        geometry.drawSegment(viewport, transform, model.predicates.segments[1][0], model.predicates.segments[1][1], { className: "is-bad" });
        const intersection = model.predicates.intersection;
        if (intersection && intersection.point) {
          geometry.drawPoint(viewport, transform, { id: "intersection", label: "×", x: intersection.point.x, y: intersection.point.y }, { className: "is-active", focusable: false, radius: 7 });
        }
      }
      if (model.hull.length >= 2) {
        for (let index = 0; index < model.hull.length; index += 1) {
          geometry.drawSegment(viewport, transform, model.hull[index], model.hull[(index + 1) % model.hull.length], { className: "is-active" });
        }
      }

      const active = new Set(model.frame.activeIds);
      const candidates = new Set(model.frame.candidateIds);
      const rejected = new Set(model.frame.rejectedIds);
      model.points.forEach(function (point) {
        geometry.drawPoint(viewport, transform, point, {
          className: active.has(point.id) ? "is-active" : candidates.has(point.id) ? "is-candidate" : rejected.has(point.id) ? "is-rejected" : "",
        });
      });
      figure.caption.textContent = "Колесо или +/− меняют масштаб, перетаскивание фона панорамирует; фокус на точке и стрелки перемещают её по целой решётке";
    }

    function render(state) {
      const model = core.visualModel(state);
      draw(model);
      fields.cursor.max = String(model.frameCount - 1);
      fields.cursor.value = String(model.cursor);
      fields.cursorOutput.value = (model.cursor + 1) + " / " + model.frameCount;
      fields.cursorOutput.textContent = fields.cursorOutput.value;
      metrics.querySelector('[data-metric="det"]').textContent = model.predicates.determinant === null ? "—" : String(model.predicates.determinant);
      metrics.querySelector('[data-metric="orientation"]').textContent = orientationText(model.predicates.orientation);
      metrics.querySelector('[data-metric="intersection"]').textContent = intersectionText(model.predicates.intersection);
      metrics.querySelector('[data-metric="hull"]').textContent = String(model.hull.length);
      explanation.querySelector("[data-message]").textContent = model.frame.message;
      explanation.querySelector("[data-detail]").textContent = model.frame.determinant === null
        ? "Решения алгоритма показываются по одному: сортировка, проверка поворота, удаление и принятие вершины"
        : "Точный determinant текущей тройки равен " + String(model.frame.determinant) + "; знак, а не округлённый угол, определяет действие";
    }

    function createState() { return core.createState(points, { algorithm: algorithm }); }

    function bind(api) {
      fields.preset.addEventListener("change", function () {
        points = core.preset(fields.preset.value); fitNeeded = true; api.reset();
      });
      fields.algorithm.addEventListener("change", function () {
        algorithm = fields.algorithm.value; api.reset();
      });
      fields.cursor.addEventListener("input", function () {
        api.setState(core.seek(api.getState(), Number(fields.cursor.value)), "Выбран кадр трассы");
      });
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
