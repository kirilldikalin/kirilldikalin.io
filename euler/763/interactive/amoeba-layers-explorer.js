(function () {
  "use strict";

  const core = window.Euler763Core;
  const svgNamespace = "http://www.w3.org/2000/svg";
  const splitSequence = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
  const palette = ["#ffffff", "#d8d9dc", "#b9bbc0", "#96999f", "#72767d", "#50545a"];

  function svgElement(name, attributes = {}, text = "") {
    const element = document.createElementNS(svgNamespace, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text) element.textContent = text;
    return element;
  }

  function clear(element) {
    element.replaceChildren();
  }

  function project3d([x, y, z]) {
    return [165 + (x - y) * 78, 300 - z * 68 - (x + y) * 27];
  }

  function projectTriangular([q, r], originX = 310, originY = 250, scale = 58) {
    return [originX + q * scale + r * scale * 0.5, originY - r * scale * 0.86];
  }

  function drawSplitScene(step) {
    const scene = document.querySelector("[data-e763-split-scene]");
    clear(scene);
    const splits = splitSequence.slice(0, step);
    const cells = core.applySplits(splits);

    for (let layer = 0; layer <= Math.max(step, 1); layer += 1) {
      const y = 330 - layer * 68;
      scene.append(svgElement("line", {
        x1: 65,
        y1: y,
        x2: 795,
        y2: y,
        class: "e763-grid-line",
      }));
      scene.append(svgElement("text", {
        x: 805,
        y: y + 5,
        class: "e763-layer-label",
      }, `L${layer}`));
    }

    cells.forEach(({ cell, count }) => {
      const [cx, cy] = project3d(cell);
      const layer = core.layerIndex(cell);
      scene.append(svgElement("circle", {
        cx,
        cy,
        r: 23,
        fill: palette[Math.min(layer, palette.length - 1)],
        class: "e763-cell",
      }));
      scene.append(svgElement("text", {
        x: cx,
        y: cy + 5,
        "text-anchor": "middle",
        class: "e763-node-label",
      }, count > 1 ? String(count) : cell.join(",")));
    });

    const newest = step === 0 ? [0, 0, 0] : splitSequence[step - 1];
    const children = step === 0 ? [] : core.splitCell(newest);
    if (children.length) {
      const [x1, y1] = project3d(newest);
      children.forEach((child) => {
        const [x2, y2] = project3d(child);
        scene.insertBefore(svgElement("line", {
          x1,
          y1,
          x2,
          y2,
          class: "e763-connector",
        }), scene.firstChild);
      });
    }

    const count = cells.reduce((sum, item) => sum + item.count, 0);
    const lastLayer = cells.reduce((max, item) => Math.max(max, core.layerIndex(item.cell)), 0);
    document.querySelector("[data-e763-split-value]").textContent = step;
    document.querySelector("[data-e763-amoeba-count]").textContent = count;
    document.querySelector("[data-e763-layer]").textContent = `L${lastLayer}`;
    document.querySelector("[data-e763-balance]").textContent = `2N+1 = ${2 * step + 1}`;
    document.querySelector("[data-e763-split-detail]").textContent = step === 0
      ? "В начале занята только клетка (0,0,0)."
      : `Деление в (${newest.join(", ")}) удаляет родителя и добавляет три клетки слоя L${core.layerIndex(newest) + 1}.`;
  }

  function drawTriangularGrid(scene) {
    for (let q = -4; q <= 5; q += 1) {
      for (let r = -3; r <= 4; r += 1) {
        const [x, y] = projectTriangular([q, r]);
        [[q + 1, r], [q, r + 1], [q + 1, r - 1]].forEach((next) => {
          const [nx, ny] = projectTriangular(next);
          scene.append(svgElement("line", {
            x1: x,
            y1: y,
            x2: nx,
            y2: ny,
            class: "e763-grid-line",
          }));
        });
      }
    }
  }

  function drawPattern(name) {
    const pattern = core.forbiddenPattern(name);
    const scene = document.querySelector("[data-e763-pattern-scene]");
    clear(scene);
    drawTriangularGrid(scene);

    pattern.cells.forEach((cell) => {
      const [cx, cy] = projectTriangular(cell);
      scene.append(svgElement("circle", {
        cx,
        cy,
        r: 25,
        fill: "#f2f2f3",
        class: "e763-cell",
      }));
      scene.append(svgElement("text", {
        x: cx,
        y: cy + 7,
        "text-anchor": "middle",
        class: "e763-node-label",
      }, "2"));
    });

    const [collisionX, collisionY] = projectTriangular(pattern.collision);
    pattern.cells.slice(-3).forEach((cell) => {
      const [x, y] = projectTriangular(cell);
      scene.insertBefore(svgElement("line", {
        x1: x,
        y1: y,
        x2: collisionX,
        y2: collisionY,
        class: "e763-connector",
      }), scene.firstChild);
    });
    scene.append(svgElement("circle", {
      cx: collisionX,
      cy: collisionY,
      r: 29,
      class: "e763-collision",
    }));
    scene.append(svgElement("text", {
      x: collisionX,
      y: collisionY + 7,
      "text-anchor": "middle",
      fill: "#fff",
      class: "e763-node-label",
    }, "3"));

    document.querySelector("[data-e763-pattern-size]").textContent = pattern.cells.length;
    document.querySelector("[data-e763-pattern-steps]").textContent =
      `${pattern.forcedSteps} ${pattern.forcedSteps === 1 ? "слой" : "слоя"}`;
    document.querySelector("[data-e763-pattern-detail]").textContent =
      `${pattern.label}: если продолжать освобождать двойные клетки, три потока неизбежно сходятся в красной клетке.`;
  }

  function drawSnake() {
    const a = Number(document.querySelector("#e763-a").value);
    const b = Number(document.querySelector("#e763-b").value);
    const n = Number(document.querySelector("#e763-n").value);
    const scene = document.querySelector("[data-e763-snake-scene]");
    clear(scene);

    const cells = core.snakeCells(a, b);
    const points = cells.map((cell) => projectTriangular(cell, 115, 250, 45));
    if (points.length > 1) {
      scene.append(svgElement("polyline", {
        points: points.map((point) => point.join(",")).join(" "),
        class: "e763-snake-line",
      }));
    }
    points.forEach(([cx, cy], index) => {
      scene.append(svgElement("circle", {
        cx,
        cy,
        r: 13,
        class: "e763-snake-point",
      }));
      scene.append(svgElement("text", {
        x: cx,
        y: cy + 5,
        "text-anchor": "middle",
        class: "e763-node-label",
      }, String(index + 1)));
    });

    scene.append(svgElement("text", {
      x: 95,
      y: 305,
      class: "e763-transition-label",
    }, `состояние (${a},${b})`));

    const terms = core.transitionTerms(a, b);
    terms.forEach((term, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 500 + column * 115;
      const y = 95 + row * 105;
      scene.append(svgElement("rect", {
        x: x - 44,
        y: y - 27,
        width: 88,
        height: 54,
        rx: 8,
        fill: "#fff",
        stroke: "#555",
      }));
      scene.append(svgElement("text", {
        x,
        y: y + 5,
        "text-anchor": "middle",
        class: "e763-transition-label",
      }, `${term.multiplicity > 1 ? `${term.multiplicity}× ` : ""}(${term.a},${term.b})`));
    });
    scene.append(svgElement("path", {
      d: "M365 175 C410 175 415 150 445 150",
      class: "e763-connector",
    }));

    const values = core.countConfigurations(n, 1_000_000_000);
    const cost = core.triangularCost(a, b);
    document.querySelector("[data-e763-a-value]").textContent = a;
    document.querySelector("[data-e763-b-value]").textContent = b;
    document.querySelector("[data-e763-n-value]").textContent = n;
    document.querySelector("[data-e763-snake-length]").textContent = cells.length;
    document.querySelector("[data-e763-snake-cost]").textContent = cost;
    document.querySelector("[data-e763-d-value]").textContent = `D(${n}) = ${values[n]}`;
    document.querySelector("[data-e763-snake-detail]").textContent =
      `Из (${a},${b}) получается ${terms.length} канонических направлений. Коэффициенты учитывают совпавшие после симметрии продолжения.`;
  }

  function selectTab(tabName) {
    document.querySelectorAll("[data-e763-tab]").forEach((tab) => {
      const active = tab.dataset.e763Tab === tabName;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-e763-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.e763Panel !== tabName;
    });
  }

  document.querySelectorAll("[data-e763-tab]").forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.e763Tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const tabs = [...document.querySelectorAll("[data-e763-tab]")];
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
      selectTab(next.dataset.e763Tab);
      next.focus();
    });
  });

  document.querySelector("#e763-split-step").addEventListener("input", (event) => {
    drawSplitScene(Number(event.target.value));
  });

  document.querySelectorAll("[data-e763-pattern]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-e763-pattern]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      drawPattern(button.dataset.e763Pattern);
    });
  });

  ["#e763-a", "#e763-b", "#e763-n"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", drawSnake);
  });

  drawSplitScene(1);
  drawPattern("triangle");
  drawSnake();
}());
