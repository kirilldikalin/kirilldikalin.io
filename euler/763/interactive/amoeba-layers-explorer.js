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
    return [430 + (x - y) * 68, 48 + (x + y) * 18 + z * 80];
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
      const x = 65 + layer * 105;
      scene.append(svgElement("circle", {
        cx: x,
        cy: 30,
        r: 9,
        fill: palette[Math.min(layer, palette.length - 1)],
        class: "e763-cell",
      }));
      scene.append(svgElement("text", {
        x: x + 17,
        y: 35,
        class: "e763-layer-label",
      }, `L${layer}`));
    }

    cells
      .map((item) => ({ ...item, point: project3d(item.cell) }))
      .sort((left, right) => left.point[1] - right.point[1])
      .forEach(({ cell, count, point }) => {
      const [cx, cy] = point;
      const layer = core.layerIndex(cell);
      scene.append(svgElement("circle", {
        cx,
        cy,
        r: 20,
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
    const stepInput = document.querySelector("#e763-pattern-step");
    const turnInput = document.querySelector("#e763-pattern-turn");
    const basePattern = core.forbiddenPattern(name);
    stepInput.max = basePattern.forcedSteps;
    if (Number(stepInput.value) > basePattern.forcedSteps) {
      stepInput.value = basePattern.forcedSteps;
    }
    const pattern = core.forbiddenPatternStage(
      name,
      Number(stepInput.value),
      Number(turnInput.value),
    );
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
    pattern.feeders.forEach((cell) => {
      const [x, y] = projectTriangular(cell);
      const currentX = x + (collisionX - x) * pattern.progress;
      const currentY = y + (collisionY - y) * pattern.progress;
      scene.insertBefore(svgElement("line", {
        x1: x,
        y1: y,
        x2: currentX,
        y2: currentY,
        class: "e763-connector",
      }), scene.firstChild);
      if (!pattern.collided && pattern.step > 0) {
        scene.append(svgElement("circle", {
          cx: currentX,
          cy: currentY,
          r: 10,
          class: "e763-flow-point",
        }));
      }
    });
    if (pattern.collided) {
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
    } else {
      scene.append(svgElement("circle", {
        cx: collisionX,
        cy: collisionY,
        r: 13,
        class: "e763-collision-target",
      }));
    }

    document.querySelector("[data-e763-pattern-size]").textContent = pattern.cells.length;
    document.querySelector("[data-e763-pattern-step-value]").textContent =
      `${pattern.step} / ${pattern.forcedSteps}`;
    document.querySelector("[data-e763-pattern-turn-value]").textContent =
      `${Number(turnInput.value) * 60}°`;
    document.querySelector("[data-e763-pattern-steps]").textContent =
      String(pattern.forcedSteps - pattern.step);
    document.querySelector("[data-e763-pattern-result]").textContent =
      pattern.collided ? "кратность 3" : "потоки разделены";
    document.querySelector("[data-e763-pattern-detail]").textContent = pattern.collided
      ? `${pattern.label}: после ${pattern.forcedSteps} вынужденных шагов три потока сошлись в одной клетке.`
      : `${pattern.label}: передвиньте шаг продолжения — три потока пока идут отдельно к отмеченной клетке.`;
  }

  function fitPoints(points, bounds) {
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const sourceWidth = Math.max(1, maxX - minX);
    const sourceHeight = Math.max(1, maxY - minY);
    const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
    const offsetX = bounds.x + (bounds.width - sourceWidth * scale) / 2;
    const offsetY = bounds.y + (bounds.height - sourceHeight * scale) / 2;
    return points.map(([x, y]) => [
      offsetX + (x - minX) * scale,
      offsetY + (y - minY) * scale,
    ]);
  }

  function drawSnake() {
    const a = Number(document.querySelector("#e763-a").value);
    const b = Number(document.querySelector("#e763-b").value);
    const n = Number(document.querySelector("#e763-n").value);
    const scene = document.querySelector("[data-e763-snake-scene]");
    clear(scene);

    const cells = core.snakeCells(a, b);
    const rawPoints = cells.map((cell) => projectTriangular(cell, 0, 0, 1));
    const points = fitPoints(rawPoints, { x: 65, y: 55, width: 300, height: 205 });
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

    const currentReachable = n >= core.triangularCost(a, b);
    const terms = core.transitionBudget(a, b, n).map((term) => ({
      ...term,
      viable: currentReachable && term.viable,
    }));
    terms.forEach((term, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 500 + column * 115;
      const y = 95 + row * 105;
      scene.append(svgElement("rect", {
        x: x - 44,
        y: y - 31,
        width: 88,
        height: 62,
        rx: 8,
        class: `e763-transition-card${term.viable ? "" : " is-unavailable"}`,
      }));
      scene.append(svgElement("text", {
        x,
        y: y,
        "text-anchor": "middle",
        class: "e763-transition-label",
      }, `${term.multiplicity > 1 ? `${term.multiplicity}× ` : ""}(${term.a},${term.b})`));
      scene.append(svgElement("text", {
        x,
        y: y + 19,
        "text-anchor": "middle",
        class: "e763-budget-label",
      }, `m′=${term.remaining}`));
    });
    scene.append(svgElement("path", {
      d: "M365 175 C410 175 415 150 445 150",
      class: "e763-connector",
    }));

    const values = core.countConfigurations(n);
    const cost = core.triangularCost(a, b);
    document.querySelector("[data-e763-a-value]").textContent = a;
    document.querySelector("[data-e763-b-value]").textContent = b;
    document.querySelector("[data-e763-n-value]").textContent = n;
    document.querySelector("[data-e763-snake-length]").textContent = cells.length;
    document.querySelector("[data-e763-snake-cost]").textContent = cost;
    const viableCount = terms.filter((term) => term.viable).length;
    const transitionWord = viableCount % 10 === 1 && viableCount % 100 !== 11
      ? "переход"
      : viableCount % 10 >= 2 && viableCount % 10 <= 4
        && (viableCount % 100 < 12 || viableCount % 100 > 14)
        ? "перехода"
        : "переходов";
    document.querySelector("[data-e763-viable-value]").textContent =
      `${viableCount} / ${terms.length}`;
    document.querySelector("[data-e763-snake-detail]").textContent =
      currentReachable
        ? `При N=${n} доступно ${viableCount} ${transitionWord}. После каждого чёрного перехода хватает бюджета на следующую змейку. Независимая проверка: D(${n})=${values[n]}.`
        : `Состояние (${a},${b}) требует как минимум ${cost}, поэтому при N=${n} оно ещё недостижимо. Независимая проверка: D(${n})=${values[n]}.`;
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
      document.querySelector("#e763-pattern-step").value = 0;
      drawPattern(button.dataset.e763Pattern);
    });
  });

  ["#e763-pattern-step", "#e763-pattern-turn"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", () => {
      drawPattern(document.querySelector("[data-e763-pattern].is-active").dataset.e763Pattern);
    });
  });

  ["#e763-a", "#e763-b", "#e763-n"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", drawSnake);
  });

  drawSplitScene(1);
  drawPattern("triangle");
  drawSnake();
}());
