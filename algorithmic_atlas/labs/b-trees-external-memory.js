(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.BTreesExternalMemoryCore;

  runtime.boot("b-trees-external-memory", function (root) {
    const shell = runtime.createShell(root, {
      title: "Страницы B+‑дерева",
      description: "Каждый кадр считает чтение или запись страницы и показывает split, merge либо последовательный range scan",
    });
    shell.controls.innerHTML =
      '<label>Сценарий<select data-field="mode"><option value="insert">Вставка и split</option><option value="delete">Удаление и merge</option><option value="range">Диапазон по листьям</option></select></label>' +
      '<label class="atlas-lab__field is-wide">Ключи<input data-field="keys" type="text" value="5,10,15,20,25,30"></label>' +
      '<label><span data-first-label>Новый ключ</span><input data-field="first" type="number" value="18"></label>' +
      '<label data-second-wrap hidden>Правая граница<input data-field="second" type="number" value="26"></label>';
    const mode = shell.controls.querySelector('[data-field="mode"]');
    const keys = shell.controls.querySelector('[data-field="keys"]');
    const first = shell.controls.querySelector('[data-field="first"]');
    const second = shell.controls.querySelector('[data-field="second"]');
    const firstLabel = shell.controls.querySelector("[data-first-label]");
    const secondWrap = shell.controls.querySelector("[data-second-wrap]");
    const figure = runtime.createFigure(shell.workspace, { id: "b-tree-pages-visual", title: "Страницы индекса", viewBox: "0 0 900 440" });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Текущий кадр</h4><p data-message></p><dl class="atlas-lab__metrics"><div><dt>Операция</dt><dd data-action></dd></div><div><dt>I/O страниц</dt><dd data-io></dd></div><div><dt>Кадр</dt><dd data-frame></dd></div></dl><p data-result></p>';
    shell.workspace.appendChild(panel);

    function page(svg, x, y, width, height, pageModel, active, preview) {
      drawing.append(svg, "rect", { x: x, y: y, width: width, height: height, rx: 8, class: "structure-cell" + (active ? " is-active" : "") });
      const shown = preview || pageModel.keys;
      const cellWidth = width / Math.max(1, shown.length);
      shown.forEach(function (key, index) {
        if (index) drawing.append(svg, "line", { x1: x + index * cellWidth, y1: y, x2: x + index * cellWidth, y2: y + height, class: "tree-edge" });
        drawing.text(svg, x + (index + 0.5) * cellWidth, y + height / 2 + 6, key, "is-strong", "middle");
      });
      drawing.text(svg, x + width / 2, y - 10, pageModel.id, "is-muted", "middle");
    }

    function render(state) {
      const model = core.visualModel(state);
      const frame = model.frame;
      const tree = frame.tree;
      const svg = figure.svg;
      drawing.clear(svg, "B+‑дерево по страницам", "Корневая страница, связанные листья, текущая операция и число обращений к внешней памяти");
      const rootWidth = Math.max(130, tree.root.keys.length * 58);
      page(svg, 450 - rootWidth / 2, 70, rootWidth, 64, tree.root, frame.highlight === "R");
      const leafWidth = 150;
      const gap = 24;
      const total = tree.leaves.length * leafWidth + (tree.leaves.length - 1) * gap;
      const start = (900 - total) / 2;
      tree.leaves.forEach(function (leaf, index) {
        const x = start + index * (leafWidth + gap);
        const rootX = 450;
        drawing.append(svg, "line", { x1: rootX, y1: 134, x2: x + leafWidth / 2, y2: 235, class: "tree-edge" });
        if (index + 1 < tree.leaves.length) {
          drawing.append(svg, "line", { x1: x + leafWidth, y1: 268, x2: x + leafWidth + gap, y2: 268, class: "structure-pointer" });
          drawing.text(svg, x + leafWidth + gap / 2, 258, "→", "is-muted", "middle");
        }
        const preview = frame.action === "insert" && frame.highlight === leaf.id ? frame.details.previewKeys : null;
        page(svg, x, 235, leafWidth, 66, leaf, frame.highlight === leaf.id || frame.highlight === "merge" || frame.highlight === "borrow", preview);
      });
      if (frame.action === "split") drawing.text(svg, 450, 360, "split → новый лист, разделитель " + frame.details.promoted, "is-a", "middle");
      if (frame.action === "merge") drawing.text(svg, 450, 360, "merge → одна страница и удаление разделителя", "is-a", "middle");
      if (frame.action === "borrow") drawing.text(svg, 450, 360, "borrow → крайний ключ соседа и новый разделитель", "is-a", "middle");
      if (frame.details.result) drawing.text(svg, 450, 392, "Результат: " + frame.details.result.join(", "), "is-b", "middle");
      shell.workspace.querySelector("[data-message]").textContent = frame.message;
      shell.workspace.querySelector("[data-action]").textContent = frame.action;
      shell.workspace.querySelector("[data-io]").textContent = String(frame.io);
      shell.workspace.querySelector("[data-frame]").textContent = (model.frameIndex + 1) + " / " + model.frameCount;
      shell.workspace.querySelector("[data-result]").textContent = frame.details.result ? "Выданные ключи: " + frame.details.result.join(", ") : "Геометрия страниц построена из текущего состояния ядра";
      figure.caption.textContent = "Одна рамка — одна страница. Счётчик I/O растёт только при моделируемом чтении или записи страницы";
    }

    function syncScenario() {
      if (mode.value === "insert") {
        firstLabel.textContent = "Новый ключ";
        secondWrap.hidden = true;
        if (keys.value.trim() === "5,10,15,20") keys.value = "5,10,15,20,25,30";
        first.value = "18";
      } else if (mode.value === "delete") {
        firstLabel.textContent = "Удалить ключ";
        secondWrap.hidden = true;
        keys.value = "5,10,15,20";
        first.value = "5";
      } else {
        firstLabel.textContent = "Левая граница";
        secondWrap.hidden = false;
        keys.value = "2,5,8,11,14,17,20,23,26,29";
        first.value = "9";
        second.value = "23";
      }
    }

    runtime.mount(root, {
      createState: function () { return core.createState(mode.value, keys.value, first.value, second.value); },
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 40,
      bind: function (api) {
        mode.addEventListener("change", function () { syncScenario(); api.reset(); });
        shell.controls.addEventListener("change", function (event) { if (event.target !== mode) api.reset(); });
        shell.controls.addEventListener("submit", function (event) { event.preventDefault(); api.reset(); });
      },
    });
  });
})();
