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
    const stage = Number(document.querySelector("#e780-glue").value);
    const scene = document.querySelector("[data-e780-torus-scene]");
    clear(scene);

    const stageClass = (index) => [
      "e780-glue-stage",
      index === stage ? "is-active" : "",
      index < stage ? "is-done" : "",
    ].filter(Boolean).join(" ");

    const rectangle = svgElement("g", { class: stageClass(0) });
    drawTriangulatedRectangle(rectangle, 40, 105, 220, 180, 4, 3);
    line(rectangle, 40, 105, 260, 105, "e780-edge-a");
    line(rectangle, 40, 285, 260, 285, "e780-edge-a");
    line(rectangle, 40, 105, 40, 285, "e780-edge-b");
    line(rectangle, 260, 105, 260, 285, "e780-edge-b");
    text(rectangle, 150, 88, "A", "e780-edge-label", "middle");
    text(rectangle, 150, 310, "A", "e780-edge-label", "middle");
    text(rectangle, 25, 200, "B", "e780-edge-label", "middle");
    text(rectangle, 275, 200, "B", "e780-edge-label", "middle");
    text(rectangle, 150, 45, "1. развёртка", "e780-label", "middle");
    scene.append(rectangle);

    const cylinder = svgElement("g", { class: stageClass(1) });
    cylinder.append(svgElement("ellipse", {
      cx: 450, cy: 115, rx: 92, ry: 24, class: "e780-edge-a",
    }));
    cylinder.append(svgElement("ellipse", {
      cx: 450, cy: 275, rx: 92, ry: 24, class: "e780-edge-a",
    }));
    line(cylinder, 358, 115, 358, 275, "e780-surface-edge");
    line(cylinder, 542, 115, 542, 275, "e780-surface-edge");
    cylinder.append(svgElement("path", {
      d: "M450 91 C425 135 425 255 450 299",
      class: "e780-edge-b",
    }));
    [155, 195, 235].forEach((y) => {
      cylinder.append(svgElement("ellipse", {
        cx: 450, cy: y, rx: 92, ry: 20, class: "e780-grid",
      }));
    });
    text(cylinder, 450, 45, "2. склеены B → цилиндр", "e780-label", "middle");
    text(cylinder, 450, 330, "две границы A ещё открыты", "e780-note", "middle");
    scene.append(cylinder);

    const torus = svgElement("g", { class: stageClass(2) });
    const bandX = 735;
    const outerRx = 120;
    const outerRy = 84;
    const innerRx = 51;
    const innerRy = 33;
    const torusPath = [
      `M ${bandX - outerRx} 195`,
      `A ${outerRx} ${outerRy} 0 1 0 ${bandX + outerRx} 195`,
      `A ${outerRx} ${outerRy} 0 1 0 ${bandX - outerRx} 195`,
      `M ${bandX - innerRx} 195`,
      `A ${innerRx} ${innerRy} 0 1 1 ${bandX + innerRx} 195`,
      `A ${innerRx} ${innerRy} 0 1 1 ${bandX - innerRx} 195`,
    ].join(" ");
    torus.append(svgElement("path", {
      d: torusPath,
      class: "e780-torus-outline",
    }));

    for (let angle = 0; angle < 360; angle += 45) {
      const radians = angle * Math.PI / 180;
      const x1 = bandX + innerRx * Math.cos(radians);
      const y1 = 195 + innerRy * Math.sin(radians);
      const x2 = bandX + outerRx * Math.cos(radians);
      const y2 = 195 + outerRy * Math.sin(radians);
      line(torus, x1, y1, x2, y2, "e780-grid");
    }
    torus.append(svgElement("ellipse", {
      cx: bandX, cy: 195, rx: outerRx, ry: outerRy, class: "e780-edge-a",
    }));
    torus.append(svgElement("path", {
      d: `M ${bandX} ${195 - innerRy} C ${bandX + 28} 135, ${bandX + 28} 255, ${bandX} ${195 + innerRy}`,
      class: "e780-edge-b",
    }));
    text(torus, bandX, 45, "3. склеены A → тор", "e780-label", "middle");
    text(torus, bandX, 330, "границы больше нет", "e780-note", "middle");
    scene.append(torus);

    text(scene, 310, 205, "→", "e780-glue-arrow", "middle");
    text(scene, 590, 205, "→", "e780-glue-arrow", "middle");

    const labels = ["развёртка", "цилиндр", "тор"];
    const seams = ["ничего", "пара B", "пары B и A"];
    const boundaries = ["4 ребра", "2 окружности", "нет"];
    const details = [
      "Одинаковые буквы стоят на рёбрах, которые надо отождествить: сначала два пунктирных ребра B.",
      "После склейки B получился цилиндр. Его верхняя и нижняя окружности — это оставшаяся пара A.",
      "После склейки A граница исчезла. Замкнутый путь на торе в развёртке продолжается через копии прямоугольника.",
    ];
    document.querySelector("[data-e780-glue-value]").textContent = labels[stage];
    document.querySelector("[data-e780-seams]").textContent = seams[stage];
    document.querySelector("[data-e780-boundary]").textContent = boundaries[stage];
    document.querySelector("[data-e780-torus-detail]").textContent = details[stage];
  }

  function drawStripCover(scene) {
    const left = 95;
    const bottom = 335;
    const cellWidth = 125;
    const cellHeight = 52;
    for (let column = 0; column <= 5; column += 1) {
      line(scene, left + column * cellWidth, 75, left + column * cellWidth, bottom, "e780-grid");
    }
    for (let row = 0; row <= 5; row += 1) {
      line(scene, left, bottom - row * cellHeight, 720, bottom - row * cellHeight, "e780-grid");
    }
    for (let column = 0; column < 5; column += 1) {
      for (let row = 0; row < 5; row += 1) {
        const x = left + column * cellWidth;
        const y = bottom - row * cellHeight;
        line(scene, x, y, x + cellWidth, y - cellHeight, "e780-grid");
      }
    }
  }

  function drawStrips() {
    const a = Number(document.querySelector("#e780-a").value);
    const b = Number(document.querySelector("#e780-b").value);
    const k = Number(document.querySelector("#e780-k").value);
    const m = Number(document.querySelector("#e780-m").value);
    const params = core.stripParameters(a, b, k, m);
    const diagram = core.stripDiagramModel(a, b, k, m);
    const scene = document.querySelector("[data-e780-strips-scene]");
    clear(scene);
    drawStripCover(scene);

    const startX = 95;
    const startY = 335;
    const endX = startX + 125 * diagram.end[0];
    const endY = startY - 52 * diagram.end[1];
    const dx = endX - startX;
    const dy = endY - startY;
    const normalLength = Math.hypot(dx, dy) || 1;
    const nx = -dy / normalLength;
    const ny = dx / normalLength;
    const stripClass = params.valid ? "e780-strip" : "e780-strip e780-strip-invalid";

    const defs = svgElement("defs");
    const clipPath = svgElement("clipPath", { id: "e780-strip-clip" });
    clipPath.append(svgElement("rect", { x: 95, y: 75, width: 625, height: 260 }));
    defs.append(clipPath);
    scene.append(defs);
    const stripGroup = svgElement("g", { "clip-path": "url(#e780-strip-clip)" });

    const referenceStrip = Math.floor((diagram.offsets.length - 1) / 2);
    diagram.offsets.forEach((stripOffset, stripIndex) => {
      const offset = stripOffset * 18;
      line(
        stripGroup,
        startX + nx * offset,
        startY + ny * offset,
        endX + nx * offset,
        endY + ny * offset,
        `${stripClass}${stripIndex === referenceStrip ? " is-reference" : ""}`
      );
      if (stripIndex !== referenceStrip) return;
      diagram.pairFractions.forEach((fraction) => {
        const cx = startX + dx * fraction + nx * offset;
        const cy = startY + dy * fraction + ny * offset;
        [-4, 4].forEach((pairOffset) => {
          stripGroup.append(svgElement("circle", {
            cx: cx + nx * pairOffset,
            cy: cy + ny * pairOffset,
            r: 2.8,
            class: params.valid ? "e780-pair-dot" : "e780-pair-dot is-invalid",
          }));
        });
      });
    });
    scene.append(stripGroup);
    line(scene, startX, startY, endX, startY, "e780-turn-guide");
    line(scene, endX, startY, endX, endY, "e780-turn-guide");
    scene.append(svgElement("circle", { cx: startX, cy: startY, r: 7, fill: "#303033" }));
    scene.append(svgElement("circle", { cx: endX, cy: endY, r: 7, fill: "#303033" }));
    text(scene, startX + 8, startY + 28, "(0,0)", "e780-note");
    text(scene, endX - 8, endY - 14, `(${a}u, ${b}v)`, "e780-note", "end");
    text(scene, (startX + endX) / 2, startY + 22, `${a} оборотов`, "e780-note", "middle");
    text(scene, endX + 12, (startY + endY) / 2, `${b} оборотов`, "e780-note");

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
        `На выделенной полосе отмечено ${m} пар; всего таких полос ${k}. Проверка выполнена целыми числами: получается ${params.n} треугольников, а длина обхода ${params.pathLength.toFixed(3)} совпадает с m = ${m}.`;
    }
  }

  function drawTriangularDirections(scene, model) {
    const centerX = 450;
    const centerY = 155;
    const spacing = Math.max(32, 48 - model.latticeRadius * 2);
    const rowHeight = spacing * Math.sqrt(3) / 2;
    const radius = model.latticeRadius;
    const latticeGroup = svgElement("g", { class: "e780-count-lattice" });
    for (let row = -radius; row <= radius; row += 1) {
      for (let column = -radius; column <= radius; column += 1) {
        const x = centerX + column * spacing + row * spacing / 2;
        const y = centerY + row * rowHeight;
        line(latticeGroup, x, y, x + spacing, y, "e780-grid");
        line(latticeGroup, x, y, x + spacing / 2, y - rowHeight, "e780-grid");
        line(latticeGroup, x, y, x + spacing / 2, y + rowHeight, "e780-grid");
      }
    }
    scene.append(latticeGroup);

    const defs = svgElement("defs");
    const clip = svgElement("clipPath", { id: "e780-count-clip" });
    clip.append(svgElement("rect", { x: 70, y: 48, width: 760, height: 214, rx: 8 }));
    defs.append(clip);
    scene.append(defs);
    const directions = svgElement("g", { "clip-path": "url(#e780-count-clip)" });
    model.directionAngles.forEach((angle, directionIndex) => {
      const radians = angle * Math.PI / 180;
      const dx = Math.cos(radians);
      const dy = Math.sin(radians);
      const nx = -dy;
      const ny = dx;
      for (let index = 0; index < model.bandCount; index += 1) {
        const offset = (index - (model.bandCount - 1) / 2) * 24;
        line(
          directions,
          centerX - dx * 520 + nx * offset,
          centerY - dy * 520 + ny * offset,
          centerX + dx * 520 + nx * offset,
          centerY + dy * 520 + ny * offset,
          `e780-count-strip${directionIndex === 0 ? "" : " is-extra"}`,
        );
      }
    });
    scene.append(directions);
    scene.append(svgElement("circle", {
      cx: centerX,
      cy: centerY,
      r: 7,
      class: "e780-count-origin",
    }));
  }

  function drawCountBar(scene, model) {
    const { axial, inclined, raw, correction, total } = model.counts;
    const left = 135;
    const top = 302;
    const width = 630;
    const height = 22;
    const denominator = Math.max(1, raw);
    const axialWidth = width * axial / denominator;
    const correctionWidth = width * correction / denominator;

    scene.append(svgElement("rect", {
      x: left,
      y: top,
      width: axialWidth,
      height,
      class: "e780-count-bar e780-count-bar-axial",
    }));
    scene.append(svgElement("rect", {
      x: left + axialWidth,
      y: top,
      width: width - axialWidth,
      height,
      class: "e780-count-bar e780-count-bar-inclined",
    }));
    if (model.regular && correctionWidth > 0) {
      scene.append(svgElement("rect", {
        x: left + width - correctionWidth,
        y: top - 5,
        width: correctionWidth,
        height: height + 10,
        class: "e780-count-correction",
      }));
    }
    text(scene, left, top - 10, `осевые ${axial}`, "e780-note");
    text(scene, left + width, top - 10, `наклонные ${inclined}`, "e780-note", "end");
    text(
      scene,
      450,
      356,
      model.regular
        ? `сырой счёт ${raw} − лишние копии ${correction} = ${total}`
        : `сырой счёт ${raw}: одна полоса задаёт одно направление`,
      "e780-label",
      "middle",
    );
  }

  function drawCount() {
    const limit = Number(document.querySelector("#e780-limit").value);
    const regular = gridType === "regular";
    const model = core.countDiagramModel(limit, regular);
    const counts = model.counts;
    const scene = document.querySelector("[data-e780-count-scene]");
    clear(scene);
    drawTriangularDirections(scene, model);
    drawCountBar(scene, model);

    text(scene, 450, 30, regular
      ? `${model.bandCount} полос в каждом из трёх направлений`
      : `${model.bandCount} полос одного направления`, "e780-label", "middle");

    document.querySelector("[data-e780-limit-value]").textContent = limit;
    document.querySelector("[data-e780-directions]").textContent =
      core.stripDirectionCount(regular);
    document.querySelector("[data-e780-raw]").textContent = counts.raw;
    document.querySelector("[data-e780-total]").textContent = counts.total;
    document.querySelector("[data-e780-count-detail]").textContent =
      regular
        ? `При N = ${limit} регулярная решётка видна сразу в трёх направлениях. Красная рамка на полосе подсчёта показывает ${counts.correction} лишних копий, которые надо вычесть.`
        : `При N = ${limit} показано одно семейство полос. Плотность сетки и число видимых полос растут вместе с N; осевая часть даёт ${counts.axial}, наклонная — ${counts.inclined}.`;
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
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
      drawCount();
    });
  });

  drawTorus();
  drawStrips();
  drawCount();
})();
