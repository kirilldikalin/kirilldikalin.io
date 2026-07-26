(function () {
  "use strict";

  const core = window.Euler439Core;
  const svgNamespace = "http://www.w3.org/2000/svg";
  let weighted = true;

  function svgElement(name, attributes = {}, value = "") {
    const element = document.createElementNS(svgNamespace, name);
    Object.entries(attributes).forEach(([key, attribute]) => {
      element.setAttribute(key, attribute);
    });
    if (value) element.textContent = value;
    return element;
  }

  function clear(element) {
    element.replaceChildren();
  }

  function formatInteger(value) {
    return BigInt(value).toLocaleString("ru-RU");
  }

  function drawIdentityGrid() {
    const limit = Number(document.querySelector("#e439-grid-limit").value);
    const comparison = core.compareIdentityGrid(limit, weighted);
    const scene = document.querySelector("[data-e439-grid-scene]");
    clear(scene);

    const compact = window.innerWidth <= 736;
    const cellSize = compact
      ? Math.min(110, 340 / limit)
      : Math.min(58, 390 / limit);
    const gridSize = cellSize * limit;
    const viewWidth = compact ? gridSize + 100 : 900;
    const viewHeight = compact ? gridSize + 135 : Math.max(500, gridSize + 135);
    const startX = (viewWidth - gridSize) / 2;
    const startY = 90;
    scene.closest("svg").setAttribute("viewBox", `0 0 ${viewWidth} ${viewHeight}`);

    comparison.cells.forEach((cell) => {
      const column = cell.right - 1;
      const row = cell.left - 1;
      const x = startX + column * cellSize;
      const y = startY + row * cellSize;
      scene.append(svgElement("rect", {
        x,
        y,
        width: cellSize,
        height: cellSize,
        rx: Math.min(7, cellSize / 7),
        class: cell.matches ? "e439-grid-cell" : "e439-grid-cell is-mismatch",
      }));
      scene.append(svgElement("text", {
        x: x + cellSize / 2,
        y: y + cellSize / 2 + (cell.matches ? 5 : -1),
        "text-anchor": "middle",
        class: "e439-grid-value",
      }, formatInteger(cell.direct)));
      if (!cell.matches) {
        scene.append(svgElement("text", {
          x: x + cellSize / 2,
          y: y + cellSize / 2 + 16,
          "text-anchor": "middle",
          class: "e439-grid-comparison",
        }, `≠${formatInteger(cell.transformed)}`));
      }
    });

    for (let index = 1; index <= limit; index += 1) {
      const coordinate = startX + (index - 0.5) * cellSize;
      scene.append(svgElement("text", {
        x: coordinate,
        y: startY - 18,
        "text-anchor": "middle",
        class: "e439-axis-label",
      }, String(index)));
      scene.append(svgElement("text", {
        x: startX - 22,
        y: startY + (index - 0.5) * cellSize + 5,
        "text-anchor": "middle",
        class: "e439-axis-label",
      }, String(index)));
    }
    scene.append(svgElement("text", {
      x: viewWidth / 2,
      y: 37,
      "text-anchor": "middle",
      class: "e439-axis-label",
    }, weighted ? "σ(xy) и взвешенное тождество" : "σ(xy) и формула без множителя d"));

    document.querySelector("[data-e439-grid-limit-value]").textContent = limit;
    document.querySelector("[data-e439-direct-total]").textContent =
      formatInteger(comparison.directTotal);
    document.querySelector("[data-e439-identity-total]").textContent =
      formatInteger(comparison.identityTotal);
    document.querySelector("[data-e439-mismatches]").textContent =
      comparison.mismatchCount;
    document.querySelector("[data-e439-grid-detail]").textContent = weighted
      ? `Для всех ${limit ** 2} ячеек значения совпали: множитель d сохраняет вес общего делителя.`
      : comparison.mismatchCount === 0
        ? "На этом размере ошибка ещё не проявилась."
        : `Красным выделено несовпадений: ${comparison.mismatchCount}. Уже их сумма меняет S(${limit}) с ${formatInteger(comparison.directTotal)} на ${formatInteger(comparison.identityTotal)}.`;
  }

  function drawBlocks() {
    const limit = Number(document.querySelector("#e439-block-limit").value);
    const blocks = core.quotientBlocks(limit);
    const scene = document.querySelector("[data-e439-block-scene]");
    clear(scene);

    const left = 65;
    const right = 845;
    const top = 55;
    const bottom = 350;
    const width = right - left;
    const height = bottom - top;
    scene.append(svgElement("line", {
      x1: left, y1: bottom, x2: right, y2: bottom, class: "e439-block-axis",
    }));
    scene.append(svgElement("line", {
      x1: left, y1: top, x2: left, y2: bottom, class: "e439-block-axis",
    }));

    blocks.forEach((block) => {
      const x = left + (block.left - 1) / limit * width;
      const blockWidth = block.length / limit * width;
      const blockHeight = block.quotient / limit * height;
      scene.append(svgElement("rect", {
        x,
        y: bottom - blockHeight,
        width: blockWidth,
        height: blockHeight,
        class: "e439-block-step",
      }));
      if (blockWidth >= 37) {
        scene.append(svgElement("text", {
          x: x + blockWidth / 2,
          y: Math.max(top + 16, bottom - blockHeight - 8),
          "text-anchor": "middle",
          class: "e439-block-label",
        }, `q=${block.quotient}`));
      }
    });

    [0.25, 0.5, 0.75].forEach((fraction) => {
      const y = bottom - height * fraction;
      scene.append(svgElement("line", {
        x1: left,
        y1: y,
        x2: right,
        y2: y,
        class: "e439-block-guide",
      }));
    });
    scene.append(svgElement("text", {
      x: 450,
      y: 405,
      "text-anchor": "middle",
      class: "e439-axis-label",
    }, "индекс d"));
    scene.append(svgElement("text", {
      x: 450,
      y: 30,
      "text-anchor": "middle",
      class: "e439-axis-label",
    }, `q(d) = ⌊${limit}/d⌋`));

    document.querySelector("[data-e439-block-limit-value]").textContent = limit;
    document.querySelector("[data-e439-index-count]").textContent = limit;
    document.querySelector("[data-e439-block-count]").textContent = blocks.length;
    document.querySelector("[data-e439-saved-count]").textContent = limit - blocks.length;
    const longest = blocks.reduce((best, block) =>
      block.length > best.length ? block : best
    );
    document.querySelector("[data-e439-block-detail]").textContent =
      `Вместо ${limit} отдельных индексов достаточно ${blocks.length} блоков. Самое длинное плато: d=${longest.left}…${longest.right}, q=${longest.quotient}.`;
  }

  function selectTab(name) {
    document.querySelectorAll("[data-e439-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.e439Tab === name));
    });
    document.querySelectorAll("[data-e439-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.e439Panel !== name;
    });
  }

  document.querySelectorAll("[data-e439-tab]").forEach((button) => {
    button.addEventListener("click", () => selectTab(button.dataset.e439Tab));
  });
  document.querySelector("#e439-grid-limit").addEventListener("input", drawIdentityGrid);
  document.querySelector("#e439-block-limit").addEventListener("input", drawBlocks);
  document.querySelectorAll("[data-e439-weight]").forEach((button) => {
    button.addEventListener("click", () => {
      weighted = button.dataset.e439Weight === "correct";
      document.querySelectorAll("[data-e439-weight]").forEach((candidate) => {
        candidate.classList.toggle("is-active", candidate === button);
      });
      drawIdentityGrid();
    });
  });

  drawIdentityGrid();
  drawBlocks();
  window.addEventListener("resize", drawIdentityGrid);
})();
