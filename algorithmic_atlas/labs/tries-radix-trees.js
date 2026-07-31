(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.TriesRadixTreesCore;

  runtime.boot("tries-radix-trees", function (root) {
    const shell = runtime.createShell(root, {
      title: "Общие префиксы и path compression",
      description: "Ключи вставляются посимвольно в trie, после чего unary-цепочки сжимаются в подписи рёбер radix tree",
    });
    shell.controls.innerHTML = '<label class="atlas-lab__field is-wide">Ключи через запятую<input data-field="words" type="text" value="дом,дома,домен,кот,код"></label>';
    const words = shell.controls.querySelector('[data-field="words"]');
    const figure = runtime.createFigure(shell.workspace, { id: "tries-radix-visual", title: "Префиксное дерево", viewBox: "0 0 940 570" });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Операция</h4><p data-label></p><dl class="atlas-lab__metrics"><div><dt>Режим</dt><dd data-kind></dd></div><div><dt>Вершины</dt><dd data-nodes></dd></div><div><dt>Рёбра</dt><dd data-edges></dd></div><div><dt>Символы в labels</dt><dd data-chars></dd></div></dl><p data-words></p><p data-scale></p>';
    shell.workspace.appendChild(panel);

    function positions(model) {
      const outgoing = new Map();
      model.edges.forEach(function (edge) {
        if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
        outgoing.get(edge.source).push(edge);
      });
      outgoing.forEach(function (edges) { edges.sort(function (a, b) { return a.label.localeCompare(b.label, "ru"); }); });
      const depth = new Map([[model.rootId, 0]]);
      const queue = [model.rootId];
      const bfs = [];
      while (queue.length) {
        const id = queue.shift();
        bfs.push(id);
        (outgoing.get(id) || []).forEach(function (edge) {
          depth.set(edge.target, depth.get(id) + 1);
          queue.push(edge.target);
        });
      }
      const visible = new Set(bfs.slice(0, 42));
      const rawX = new Map();
      let leafIndex = 0;
      function assignX(id) {
        const children = (outgoing.get(id) || []).map(function (edge) { return edge.target; }).filter(function (child) { return visible.has(child); });
        if (!children.length) {
          rawX.set(id, leafIndex);
          leafIndex += 1;
          return rawX.get(id);
        }
        const childPositions = children.map(assignX);
        const x = childPositions.reduce(function (sum, value) { return sum + value; }, 0) / childPositions.length;
        rawX.set(id, x);
        return x;
      }
      assignX(model.rootId);
      const result = new Map();
      const maxDepth = Math.max.apply(null, Array.from(visible).map(function (id) { return depth.get(id) || 0; }));
      const denominator = Math.max(1, leafIndex - 1);
      visible.forEach(function (id) {
        result.set(id, {
          x: 70 + (rawX.get(id) || 0) * (800 / denominator),
          y: 55 + (depth.get(id) || 0) * (420 / Math.max(1, maxDepth)),
        });
      });
      return { points: result, visible: visible, hidden: model.nodes.length - visible.size };
    }

    function render(state) {
      const model = core.currentFrame(state);
      const svg = figure.svg;
      drawing.clear(svg, "Trie и radix tree", "Посимвольные рёбра общего префикса и сжатые подписи unary-путей");
      const layout = positions(model);
      model.edges.forEach(function (edge) {
        if (!layout.visible.has(edge.source) || !layout.visible.has(edge.target)) return;
        const from = layout.points.get(edge.source);
        const to = layout.points.get(edge.target);
        drawing.append(svg, "line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: model.activeIds.includes(edge.target) ? "structure-pointer" : "tree-edge" });
        drawing.append(svg, "rect", { x: (from.x + to.x) / 2 - Math.max(15, edge.label.length * 7), y: (from.y + to.y) / 2 - 14, width: Math.max(30, edge.label.length * 14), height: 24, rx: 5, class: "structure-cell" });
        drawing.text(svg, (from.x + to.x) / 2, (from.y + to.y) / 2 + 4, edge.label, model.kind === "radix" && edge.label.length > 1 ? "is-a" : "is-strong", "middle");
      });
      model.nodes.forEach(function (node) {
        if (!layout.visible.has(node.id)) return;
        const point = layout.points.get(node.id);
        const active = model.activeIds.includes(node.id);
        drawing.append(svg, node.terminal ? "rect" : "circle", node.terminal
          ? { x: point.x - 19, y: point.y - 19, width: 38, height: 38, rx: 7, class: "structure-node is-new" + (active ? " is-active" : "") }
          : { cx: point.x, cy: point.y, r: 18, class: "structure-node" + (active ? " is-active" : "") });
        drawing.text(svg, point.x, point.y + 5, node.id === model.rootId ? "∅" : node.id, "is-muted", "middle");
      });
      if (layout.hidden > 0) drawing.text(svg, 470, 520, "Схема агрегирована: скрыто " + layout.hidden + " мелких вершин", "is-a", "middle");
      shell.workspace.querySelector("[data-label]").textContent = model.label;
      shell.workspace.querySelector("[data-kind]").textContent = model.kind === "trie" ? "trie: один символ на ребро" : "radix: path compression";
      shell.workspace.querySelector("[data-nodes]").textContent = String(model.nodes.length);
      shell.workspace.querySelector("[data-edges]").textContent = String(model.storedEdges);
      shell.workspace.querySelector("[data-chars]").textContent = String(model.logicalCharacters);
      shell.workspace.querySelector("[data-words]").textContent = "Завершённые ключи: " + (model.insertedWords.join(", ") || "пока нет");
      shell.workspace.querySelector("[data-scale]").textContent = model.schematic ? "Большая схема показана агрегированно; математическое состояние не обрезано" : "Все вершины текущего состояния показаны";
      figure.caption.textContent = model.kind === "trie"
        ? "Квадратная вершина отмечает конец ключа; слово может заканчиваться раньше потомков"
        : "Сжатие удаляет только нетерминальные вершины с одним ребёнком и не меняет множество ключей";
    }

    runtime.mount(root, {
      createState: function () { return core.createState({ words: words.value }); },
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 180,
      bind: function (api) {
        shell.controls.addEventListener("change", function () { api.reset(); });
        shell.controls.addEventListener("submit", function (event) { event.preventDefault(); api.reset(); });
      },
    });
  });
})();
