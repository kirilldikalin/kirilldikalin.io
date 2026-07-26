(function () {
  "use strict";

  const core = window.Euler780Core;
  const svgNamespace = "http://www.w3.org/2000/svg";
  let gridType = "ordinary";

  function svgElement(name, attributes = {}, text = "") {
    const element = document.createElementNS(svgNamespace, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text) element.textContent = text;
    return element;
  }

  function clear(element) {
    element.replaceChildren();
  }

  function line(scene, x1, y1, x2, y2, className) {
    scene.append(svgElement("line", { x1, y1, x2, y2, class: className }));
  }

  function text(scene, x, y, value, className = "e780-label", anchor = "start") {
    scene.append(svgElement("text", {
      x,
      y,
      class: className,
      "text-anchor": anchor,
    }, value));
  }

  function drawTriangulatedRectangle(scene, x, y, width, height, columns, rows, opacity = 1) {
    const group = svgElement("g", { opacity });
    group.append(svgElement("rect", {
      x,
      y,
      width,
      height,
      fill: "#fafafa",
      stroke: "#303033",
      "stroke-width": 2,
    }));

    const dx = width / columns;
    const dy = height / rows;
    for (let column = 1; column < columns; column += 1) {
      line(group, x + column * dx, y, x + column * dx, y + height, "e780-grid");
    }
    for (let row = 1; row < rows; row += 1) {
      line(group, x, y + row * dy, x + width, y + row * dy, "e780-grid");
    }
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const left = x + column * dx;
        const top = y + row * dy;
        if ((column + row) % 2 === 0) {
          line(group, left, top + dy, left + dx, top, "e780-grid");
        } else {
          line(group, left, top, left + dx, top + dy, "e780-grid");
        }
      }
    }
    scene.append(group);
    return group;
  }

  function drawTorus() {
    const value = Number(document.querySelector("#e780-glue").value);
    const t = value / 100;
    const scene = document.querySelector("[data-e780-torus-scene]");
    clear(scene);

    drawTriangulatedRectangle(scene, 50, 85, 360, 220, 6, 4, 1 - 0.55 * t);
    line(scene, 50, 70, 410, 70, "e780-seam");
    line(scene, 50, 320, 410, 320, "e780-seam");
    text(scene, 230, 48, "сначала склеиваются верх и низ", "e780-note", "middle");

    const bandX = 585;
    const outerRx = 140 - 20 * t;
    const outerRy = 105 - 12 * t;
    const innerRx = 58 + 18 * t;
    const innerRy = 37 + 8 * t;
    const torusPath = [
      `M ${bandX - outerRx} 195`,
      `A ${outerRx} ${outerRy} 0 1 0 ${bandX + outerRx} 195`,
      `A ${outerRx} ${outerRy} 0 1 0 ${bandX - outerRx} 195`,
      `M ${bandX - innerRx} 195`,
      `A ${innerRx} ${innerRy} 0 1 1 ${bandX + innerRx} 195`,
      `A ${innerRx} ${innerRy} 0 1 1 ${bandX - innerRx} 195`,
    ].join(" ");
    scene.append(svgElement("path", {
      d: torusPath,
      fill: "none",
      stroke: "#303033",
      "stroke-width": 2.5,
    }));

    for (let angle = 0; angle < 360; angle += 30) {
      const radians = angle * Math.PI / 180;
      const x1 = bandX + innerRx * Math.cos(radians);
      const y1 = 195 + innerRy * Math.sin(radians);
      const x2 = bandX + outerRx * Math.cos(radians);
      const y2 = 195 + outerRy * Math.sin(radians);
      line(scene, x1, y1, x2, y2, "e780-grid");
    }

    const arrowEnd = 440 + 60 * t;
    scene.append(svgElement("path", {
      d: `M 420 195 C ${arrowEnd} 145, ${arrowEnd} 245, 465 195`,
      class: "e780-arrow",
    }));
    text(scene, bandX, 340, "после второй склейки получается тор", "e780-note", "middle");

    document.querySelector("[data-e780-glue-value]").textContent = value;
    document.querySelector("[data-e780-seams]").textContent =
      value < 35 ? "раздельны" : value < 90 ? "сближаются" : "совпали";
    document.querySelector("[data-e780-torus-detail]").textContent =
      value < 100
        ? "Ползунок показывает топологическую склейку: длины и углы треугольников при этом не меняются."
        : "Разрез можно провести в другом месте, поэтому хранить конкретную картинку замощения бессмысленно; сохраняются направления замкнутых полос.";
  }

  function drawStripCopies(scene) {
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        drawTriangulatedRectangle(
          scene,
          70 + column * 250,
          55 + row * 145,
          250,
          145,
          5,
          3,
          0.7
        );
      }
    }
  }

  function drawStrips() {
    const a = Number(document.querySelector("#e780-a").value);
    const b = Number(document.querySelector("#e780-b").value);
    const k = Number(document.querySelector("#e780-k").value);
    const m = Number(document.querySelector("#e780-m").value);
    const params = core.stripParameters(a, b, k, m);
    const scene = document.querySelector("[data-e780-strips-scene]");
    clear(scene);
    drawStripCopies(scene);

    const startX = 95;
    const startY = 325;
    const endX = startX + 250 * a;
    const endY = startY - 145 * b;
    const clippedEndX = Math.min(820, endX);
    const clippedEndY = Math.max(45, endY);
    const dx = clippedEndX - startX;
    const dy = clippedEndY - startY;
    const normalLength = Math.hypot(dx, dy) || 1;
    const nx = -dy / normalLength;
    const ny = dx / normalLength;
    const stripClass = params.valid ? "e780-strip" : "e780-strip e780-strip-invalid";
    const visibleStrips = Math.min(k, 4);

    for (let index = 0; index < visibleStrips; index += 1) {
      const offset = (index - (visibleStrips - 1) / 2) * 23;
      line(
        scene,
        startX + nx * offset,
        startY + ny * offset,
        clippedEndX + nx * offset,
        clippedEndY + ny * offset,
        stripClass
      );
    }
    scene.append(svgElement("circle", { cx: startX, cy: startY, r: 7, fill: "#303033" }));
    scene.append(svgElement("circle", { cx: clippedEndX, cy: clippedEndY, r: 7, fill: "#303033" }));
    text(scene, startX + 8, startY + 28, "(0,0)", "e780-note");
    text(scene, clippedEndX - 8, clippedEndY - 14, `(${a}u, ${b}v)`, "e780-note", "end");

    const product = a * b * k;
    const exactLeft = m * m;
    const exactRight = 3 * product * product;
    document.querySelector("[data-e780-a-value]").textContent = a;
    document.querySelector("[data-e780-b-value]").textContent = b;
    document.querySelector("[data-e780-k-value]").textContent = k;
    document.querySelector("[data-e780-m-value]").textContent = m;
    document.querySelector("[data-e780-primitive]").textContent =
      `gcd(a,b) = ${core.gcd(a, b)}`;
    document.querySelector("[data-e780-inequality]").textContent =
      `${exactLeft} ${params.valid ? ">" : "≤"} ${exactRight}`;
    document.querySelector("[data-e780-n]").textContent = `n = ${params.n}`;

    if (!params.primitive) {
      document.querySelector("[data-e780-strips-detail]").textContent =
        `Пара (${a},${b}) не примитивна: тот же путь замыкается раньше, поэтому такое описание повторяет уже учтённый обход.`;
    } else if (!params.valid) {
      document.querySelector("[data-e780-strips-detail]").textContent =
        `Для этих параметров m² = ${exactLeft}, а 3(abk)² = ${exactRight}. Положительной ширины прямоугольника не получается.`;
    } else {
      document.querySelector("[data-e780-strips-detail]").textContent =
        `Проверка выполнена целыми числами. Получается ${params.n} треугольников; длина обхода ${params.pathLength.toFixed(3)} совпадает с m = ${m}.`;
    }
  }

  function drawTriangularDirections(scene) {
    const centerX = 450;
    const centerY = 200;
    for (let row = -4; row <= 4; row += 1) {
      for (let column = -6; column <= 6; column += 1) {
        const x = centerX + column * 48 + row * 24;
        const y = centerY + row * 41.5;
        line(scene, x, y, x + 48, y, "e780-grid");
        line(scene, x, y, x + 24, y - 41.5, "e780-grid");
        line(scene, x, y, x + 24, y + 41.5, "e780-grid");
      }
    }

    line(scene, 150, centerY, 750, centerY, "e780-direction-one");
    if (gridType === "regular") {
      line(scene, 275, 345, 625, 55, "e780-direction-extra");
      line(scene, 275, 55, 625, 345, "e780-direction-extra");
    }
  }

  function drawCount() {
    const limit = Number(document.querySelector("#e780-limit").value);
    const regular = gridType === "regular";
    const counts = core.countToriangulations(limit);
    const scene = document.querySelector("[data-e780-count-scene]");
    clear(scene);
    drawTriangularDirections(scene);

    text(scene, 450, 33, regular
      ? "одна решётка попала в полосовой подсчёт три раза"
      : "направление полос определяется однозначно", "e780-label", "middle");
    text(scene, 450, 375, regular
      ? "из сырого счёта нужно удалить две лишние копии"
      : "дополнительной поправки для этой конфигурации нет", "e780-note", "middle");

    document.querySelector("[data-e780-limit-value]").textContent = limit;
    document.querySelector("[data-e780-directions]").textContent =
      core.stripDirectionCount(regular);
    document.querySelector("[data-e780-raw]").textContent = counts.raw;
    document.querySelector("[data-e780-total]").textContent = counts.total;
    document.querySelector("[data-e780-count-detail]").textContent =
      `При N = ${limit}: осевые полосы дают ${counts.axial}, наклонные — ${counts.inclined}, а поправка за регулярные решётки равна ${counts.correction}.`;
  }

  function selectTab(name) {
    document.querySelectorAll("[data-e780-tab]").forEach((tab) => {
      const active = tab.dataset.e780Tab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-e780-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.e780Panel !== name;
    });
  }

  document.querySelectorAll("[data-e780-tab]").forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.e780Tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const tabs = [...document.querySelectorAll("[data-e780-tab]")];
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
      selectTab(next.dataset.e780Tab);
      next.focus();
    });
  });

  document.querySelector("#e780-glue").addEventListener("input", drawTorus);
  ["#e780-a", "#e780-b", "#e780-k", "#e780-m"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", drawStrips);
  });
  document.querySelector("#e780-limit").addEventListener("input", drawCount);
  document.querySelectorAll("[data-e780-grid]").forEach((button) => {
    button.addEventListener("click", () => {
      gridType = button.dataset.e780Grid;
      document.querySelectorAll("[data-e780-grid]").forEach((candidate) => {
        candidate.classList.toggle("is-active", candidate === button);
      });
      drawCount();
    });
  });

  drawTorus();
  drawStrips();
  drawCount();
})();
