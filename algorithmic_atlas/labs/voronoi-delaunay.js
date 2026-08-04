(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const geometry = window.AtlasGeometryLabRuntime;
  const core = window.VoronoiDelaunayCore;

  runtime.boot("voronoi-delaunay", function (root) {
    root.classList.add("atlas-geometry-lab");
    const shell = runtime.createShell(root, {
      title: "Вороной и Делоне как две стороны одной геометрии",
      description: "Перемещайте сайты и наблюдайте одновременно области ближайшего соседа, двойственные рёбра и полости инкрементальной триангуляции",
    });
    shell.controls.innerHTML =
      '<label>Набор сайтов<select data-field="preset"><option value="villages">Шесть поселений</option><option value="square">Квадрат и центр</option><option value="cocircular">Четыре точки на окружности</option><option value="collinear">Почти коллинеарный набор</option></select></label>' +
      '<label>Слои<select data-field="layers"><option value="both">Вороной + Делоне</option><option value="voronoi">Только Вороной</option><option value="delaunay">Только Делоне</option></select></label>' +
      '<label>Двойственная пара<select data-field="dual"><option value="">Выберите ребро</option></select></label>' +
      '<label>Кадр вставки<input data-field="cursor" type="range" min="0" max="1" value="0"><output data-cursor-output>1 / 1</output></label>';
    const fields = {
      preset: shell.controls.querySelector('[data-field="preset"]'),
      layers: shell.controls.querySelector('[data-field="layers"]'),
      dual: shell.controls.querySelector('[data-field="dual"]'),
      cursor: shell.controls.querySelector('[data-field="cursor"]'),
      cursorOutput: shell.controls.querySelector("[data-cursor-output]"),
    };
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Сайтов</dt><dd data-metric="sites">—</dd></div>' +
      '<div><dt>Ячеек</dt><dd data-metric="cells">—</dd></div>' +
      '<div><dt>Треугольников</dt><dd data-metric="triangles">—</dd></div>' +
      '<div><dt>Полость / строго внутри</dt><dd data-metric="violations">—</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "voronoi-delaunay-scene",
      title: "Двойственная геометрическая сцена",
      viewBox: "0 0 920 560",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Текущая вставка</h4><p data-message></p><p class="atlas-lab__note" data-invariant></p>';
    shell.workspace.appendChild(panel);

    let sites = core.preset("villages");
    let layers = "both";
    let selectedDualKey = "";
    let mounted = null;
    let fitNeeded = true;
    let supportVisibility = null;
    const scene = geometry.mount(figure.svg, {
      bounds: core.boundsForSites(sites),
      onViewChange: function () { if (mounted) mounted.render(); },
      onPointMove: function (id, x, y) { moveSite(id, x, y); },
      onPointNudge: function (id, dx, dy) {
        const site = sites.find(function (candidate) { return candidate.id === id; });
        if (site) moveSite(id, site.x + dx, site.y + dy);
      },
    });

    function moveSite(id, x, y) {
      if (!mounted) return;
      try {
        sites = core.moveSite(sites, id, x, y);
        fitNeeded = false;
        mounted.setState(core.createState(sites), "Положение сайта изменено; диаграмма и триангуляция пересчитаны");
        mounted.clearError();
      } catch (error) {
        mounted.showError(error.message);
      }
    }

    function drawCells(viewport, transform, model) {
      model.cells.forEach(function (cell, index) {
        if (cell.polygon.length >= 3) {
          geometry.drawPolygon(viewport, transform, cell.polygon, {
            className: "is-cell-" + (index % 6),
            focusable: true,
            ariaLabel: "Ячейка Вороного сайта " + cell.siteId,
          });
        }
      });
    }

    function drawTriangulation(viewport, transform, model) {
      const byId = new Map(model.sites.concat(model.supportSites || []).map(function (site) {
        return [site.id, site];
      }));
      const bad = new Set(model.frame.badTriangleIds || []);
      const drawnEdges = new Set();
      (model.frame.triangles || []).forEach(function (triangle) {
        const points = triangle.ids.map(function (id) { return byId.get(id); });
        if (points.some(function (point) { return !point; })) return;
        geometry.drawPolygon(viewport, transform, points, {
          className: bad.has(triangle.id) ? "is-bad" : "",
          ariaLabel: "Треугольник " + triangle.ids.join("–"),
        });
        [[0, 1], [1, 2], [2, 0]].forEach(function (pair) {
          const edgeIds = [points[pair[0]].id, points[pair[1]].id].sort();
          const key = edgeIds.join("|");
          if (drawnEdges.has(key)) return;
          drawnEdges.add(key);
          geometry.drawSegment(viewport, transform, points[pair[0]], points[pair[1]], { className: bad.has(triangle.id) ? "is-bad" : "is-active" });
        });
      });
      (model.frame.boundaryEdges || []).forEach(function (edge) {
        const left = byId.get(edge[0]); const right = byId.get(edge[1]);
        if (left && right) geometry.drawSegment(viewport, transform, left, right, { className: "is-candidate" });
      });
      if (model.finished) {
        (model.triangulation.edges || []).forEach(function (edge) {
          const left = byId.get(edge.aId); const right = byId.get(edge.bId);
          const key = [edge.aId, edge.bId].sort().join("|");
          if (left && right && !drawnEdges.has(key)) {
            drawnEdges.add(key);
            geometry.drawSegment(viewport, transform, left, right, { className: "is-active" });
          }
        });
      }
      (model.frame.activeCircles || []).forEach(function (circle) {
        geometry.drawCircle(viewport, transform, circle, {
          className: "is-bad",
          ariaLabel: "Описанная окружность треугольника " + circle.triangleId,
        });
      });
      if (model.finished && selectedDualKey) {
        const ids = selectedDualKey.split("|");
        const left = byId.get(ids[0]); const right = byId.get(ids[1]);
        if (left && right) geometry.drawSegment(viewport, transform, left, right, { className: "is-good" });
      }
    }

    function updateDualOptions(model) {
      const previous = selectedDualKey;
      const options = model.dualEdges.map(function (edge) {
        const key = [edge.siteAId, edge.siteBId].sort().join("|");
        return { key: key, label: edge.siteAId + "–" + edge.siteBId };
      });
      fields.dual.innerHTML = '<option value="">Выберите ребро</option>' + options.map(function (option) {
        return '<option value="' + option.key + '">' + option.label + '</option>';
      }).join("");
      selectedDualKey = options.some(function (option) { return option.key === previous; })
        ? previous : options.length ? options[0].key : "";
      fields.dual.value = selectedDualKey;
    }

    function drawSelectedVoronoiEdge(viewport, transform, model) {
      if (!model.finished || !selectedDualKey || layers === "delaunay") return;
      const edge = model.dualEdges.find(function (candidate) {
        return [candidate.siteAId, candidate.siteBId].sort().join("|") === selectedDualKey;
      });
      if (edge) geometry.drawSegment(viewport, transform, edge.a, edge.b, { className: "is-dual" });
    }

    function render(state) {
      const model = core.visualModel(state);
      if (fields.dual.options.length !== model.dualEdges.length + 1 ||
          !Array.from(fields.dual.options).some(function (option) { return option.value === selectedDualKey; })) {
        updateDualOptions(model);
      }
      const frameIds = (model.frame.triangles || []).flatMap(function (candidate) { return candidate.ids; });
      const showsSupport = frameIds.some(function (id) { return String(id).startsWith("__super-"); });
      if (fitNeeded || showsSupport !== supportVisibility) {
        const visiblePoints = showsSupport ? model.sites.concat(model.supportSites || []) : model.sites;
        scene.setBounds(geometry.boundsForPoints(visiblePoints, 2));
        fitNeeded = false;
        supportVisibility = showsSupport;
        scene.resetView();
      }
      const transform = scene.transform();
      const viewport = geometry.clear(figure.svg, "Диаграмма Вороного и триангуляция Делоне", "Ячейки, двойственные рёбра и окружность текущей полости");
      geometry.drawGrid(viewport, transform, 1);
      if (layers === "voronoi" || (layers !== "delaunay" && model.finished)) {
        drawCells(viewport, transform, model);
      }
      if (layers !== "voronoi") drawTriangulation(viewport, transform, model);
      drawSelectedVoronoiEdge(viewport, transform, model);
      const activeId = model.frame.activeSiteId;
      model.sites.forEach(function (site) {
        geometry.drawPoint(viewport, transform, site, { className: site.id === activeId ? "is-active" : "" });
      });
      if (showsSupport && layers !== "voronoi") {
        (model.supportSites || []).forEach(function (site) {
          geometry.drawPoint(viewport, transform, site, {
            className: "is-candidate", focusable: false,
            ariaLabel: "Искусственная вершина супертреугольника " + site.label,
          });
        });
      }
      fields.cursor.max = String(model.frameCount - 1);
      fields.cursor.value = String(model.cursor);
      fields.cursorOutput.value = (model.cursor + 1) + " / " + model.frameCount;
      fields.cursorOutput.textContent = fields.cursorOutput.value;
      metrics.querySelector('[data-metric="sites"]').textContent = String(model.sites.length);
      metrics.querySelector('[data-metric="cells"]').textContent = String(model.cells.filter(function (cell) { return cell.polygon.length >= 3; }).length);
      metrics.querySelector('[data-metric="triangles"]').textContent = String(model.triangulation.triangles.length);
      metrics.querySelector('[data-metric="violations"]').textContent = String(model.cavity.length) + " / " + String(model.violations.length);
      panel.querySelector("[data-message]").textContent = model.frame.message;
      panel.querySelector("[data-invariant]").textContent = layers === "voronoi" && !model.finished
        ? "Ячейки показывают полную опорную диаграмму всех сайтов, а не промежуточный кадр вставки"
        : model.frame.phase === "cavity"
        ? "Граница полости состоит из рёбер, встретившихся ровно один раз среди удаляемых треугольников"
        : model.finished
          ? "В открытой окружности каждого итогового треугольника нет другого сайта; выбранные рёбра Делоне и Вороного перпендикулярны"
          : "Каждая вставка сохраняет триангуляцию уже обработанных сайтов";
      figure.caption.textContent = "Перетаскивайте сайты; клавиатурный фокус и стрелки дают точные целочисленные сдвиги. Колесо и +/− меняют масштаб";
    }

    function createState() { return core.createState(sites); }
    function bind(api) {
      fields.preset.addEventListener("change", function () { sites = core.preset(fields.preset.value); fitNeeded = true; supportVisibility = null; api.reset(); });
      fields.layers.addEventListener("change", function () { layers = fields.layers.value; api.render(); api.announce("Набор геометрических слоёв изменён"); });
      fields.dual.addEventListener("change", function () { selectedDualKey = fields.dual.value; api.render(); api.announce("Выбрана двойственная пара рёбер"); });
      fields.cursor.addEventListener("input", function () { api.setState(core.seek(api.getState(), Number(fields.cursor.value)), "Выбран кадр инкрементального построения"); });
      shell.controls.addEventListener("submit", function (event) { event.preventDefault(); });
    }
    mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.playback.finished; },
      render: render,
      bind: bind,
      maxAutomaticSteps: 128,
    });
  });
})();
