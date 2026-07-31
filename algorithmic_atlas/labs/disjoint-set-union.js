(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.DisjointSetUnionCore;

  runtime.boot("disjoint-set-union", function (root) {
    const shell = runtime.createShell(root, {
      title: "Лес до и после FIND",
      description: "Сравните полное сжатие, splitting, halving и присоединение корней по рангу или размеру",
    });
    shell.controls.innerHTML =
      '<label>Операция<select data-lab-field="operation"><option value="find">FIND</option><option value="union">UNION</option></select></label>' +
      '<label data-find-field>Вариант FIND<select data-lab-field="method"><option value="compression">Полное сжатие</option><option value="splitting">Path splitting</option><option value="halving">Path halving</option></select></label>' +
      '<label data-find-field>Исходный лес<select data-lab-field="shape"><option value="chain">Длинная цепочка</option><option value="balanced">Ранговое дерево</option></select></label>' +
      '<label data-union-field hidden>Политика UNION<select data-lab-field="policy"><option value="rank">По рангу</option><option value="size">По размеру</option></select></label>' +
      '<label>Число элементов: <output data-output="size">12</output><input data-lab-field="size" type="range" min="4" max="24" value="12"></label>';

    const operation = shell.controls.querySelector('[data-lab-field="operation"]');
    const method = shell.controls.querySelector('[data-lab-field="method"]');
    const shape = shell.controls.querySelector('[data-lab-field="shape"]');
    const policy = shell.controls.querySelector('[data-lab-field="policy"]');
    const size = shell.controls.querySelector('[data-lab-field="size"]');
    const sizeOutput = shell.controls.querySelector('[data-output="size"]');
    const findFields = shell.controls.querySelectorAll("[data-find-field]");
    const unionFields = shell.controls.querySelectorAll("[data-union-field]");

    const figure = runtime.createFigure(shell.workspace, {
      id: "disjoint-set-union-visual",
      title: "Кадры изменения леса представителей",
      viewBox: "0 0 900 590",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML =
      '<h4>Текущий шаг</h4><p data-summary></p>' +
      '<h4>Сохраняемый смысл</h4><p data-invariant></p>' +
      '<p class="atlas-lab__metric" data-accesses></p>';
    shell.workspace.appendChild(panel);
    const summary = panel.querySelector("[data-summary]");
    const invariant = panel.querySelector("[data-invariant]");
    const accesses = panel.querySelector("[data-accesses]");

    function updateFields() {
      const find = operation.value === "find";
      findFields.forEach(function (field) { field.hidden = !find; });
      unionFields.forEach(function (field) { field.hidden = find; });
    }

    function createState() {
      sizeOutput.textContent = size.value;
      if (operation.value === "union") {
        return core.createState("union", { policy: policy.value, size: Number(size.value) });
      }
      return core.createState("find", {
        method: method.value, shape: shape.value, size: Number(size.value), node: Number(size.value) - 1,
      });
    }

    function nodePositions(parent) {
      const maximumDepth = Math.max.apply(null, parent.map(function (_, node) { return core.depthOf(parent, node); }));
      const span = parent.length === 1 ? 0 : 790 / (parent.length - 1);
      return parent.map(function (_, node) {
        const depth = core.depthOf(parent, node);
        return {
          x: 55 + node * span,
          y: 92 + (maximumDepth === 0 ? 0 : depth * 330 / maximumDepth),
        };
      });
    }

    function render(state) {
      const model = core.visualModel(state);
      const frame = model.current;
      const svg = figure.svg;
      drawing.clear(svg, "Система непересекающихся множеств", "Лес родителей и один кадр эвристики FIND или UNION");
      const positions = nodePositions(frame.parent);
      const path = new Set(frame.path);

      drawing.text(svg, 50, 42, state.operation === "find" ? "Указатели к представителю" : "Два дерева перед объединением корней", "is-strong", "start");
      for (let node = 0; node < frame.parent.length; node += 1) {
        const parent = frame.parent[node];
        if (parent === node) continue;
        const childPosition = positions[node];
        const parentPosition = positions[parent];
        const pathEdge = path.has(node) && path.has(parent);
        drawing.append(svg, "line", {
          x1: childPosition.x, y1: childPosition.y,
          x2: parentPosition.x, y2: parentPosition.y,
          class: pathEdge || (frame.rewritten && frame.rewritten[0] === node)
            ? "structure-pointer" : "tree-edge",
        });
      }
      if (frame.rewritten && frame.rewritten[1] !== frame.rewritten[2]) {
        const nodePosition = positions[frame.rewritten[0]];
        const oldParentPosition = positions[frame.rewritten[1]];
        drawing.append(svg, "line", {
          x1: nodePosition.x, y1: nodePosition.y,
          x2: oldParentPosition.x, y2: oldParentPosition.y,
          class: "structure-copy-arrow",
        });
      }

      frame.parent.forEach(function (parent, node) {
        const position = positions[node];
        const isRoot = parent === node;
        const className = "structure-node dsu-node" +
          (isRoot ? " is-new" : "") +
          (frame.focus === node ? " is-active" : "") +
          (frame.rewritten && frame.rewritten[0] === node ? " is-traversed" : "");
        drawing.append(svg, "circle", { cx: position.x, cy: position.y, r: 22, class: className });
        drawing.text(svg, position.x, position.y + 6, node, "is-strong", "middle");
        if (isRoot) {
          drawing.text(svg, position.x, position.y - 31, "r=" + frame.rank[node] + " · s=" + frame.size[node], "is-muted", "middle");
        }
      });

      drawing.text(svg, 50, 486, "Глубина выбранной вершины", "is-strong", "start");
      const target = frame.parent.length - 1;
      const beforeDepth = model.beforeDepths[target];
      const nowDepth = model.currentDepths[target];
      const scale = 470 / Math.max(1, beforeDepth);
      drawing.text(svg, 145, 523, "до", "is-muted", "end");
      drawing.append(svg, "rect", { x: 165, y: 503, width: beforeDepth * scale, height: 25, class: "structure-cost-bar" });
      drawing.text(svg, 660, 522, beforeDepth, "is-muted", "start");
      drawing.text(svg, 145, 563, "сейчас", "is-muted", "end");
      drawing.append(svg, "rect", { x: 165, y: 543, width: nowDepth * scale, height: 25, class: "structure-cost-bar is-budget" });
      drawing.text(svg, 660, 562, nowDepth, "is-muted", "start");

      summary.textContent = frame.message;
      invariant.textContent = model.semanticsValid
        ? (state.operation === "union"
          ? (frame.finished
            ? "Два исходных множества стали одним, остальные элементы не затронуты"
            : "До связи корней сохраняются два исходных множества")
          : "Каждый элемент сохранил принадлежность своему множеству; меняется только форма дерева")
        : "Ошибка: кадр нарушил семантику операции";
      accesses.textContent = "Кадр " + (model.cursor + 1) + " / " + model.frameCount +
        " · чтений parent: " + frame.reads + " · записей parent: " + frame.writes +
        " · максимальная глубина: " + model.maxDepthBefore + " → " + model.maxDepthNow;
      figure.caption.textContent = frame.rewritten
        ? "Пунктир показывает старый указатель, акцентная стрелка — новый"
        : "Ранг и размер имеют смысл у корней; фактическая глубина показана геометрически";
    }

    const api = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 100,
      bind: function (mounted) {
        shell.controls.addEventListener("change", function () {
          updateFields();
          mounted.reset();
        });
        size.addEventListener("input", function () {
          sizeOutput.textContent = size.value;
          mounted.reset();
        });
      },
    });
    updateFields();
    api.reset();
  });
})();
