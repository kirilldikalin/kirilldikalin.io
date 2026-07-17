(() => {
  "use strict";

  const root = document.getElementById("euler786-explainer");
  if (!root) return;

  const ns = "http://www.w3.org/2000/svg";
  const svg = root.querySelector("#euler786-svg");
  const canvas = root.querySelector("#euler786-canvas");
  const description = root.querySelector("#euler786-svg-desc");
  const caption = root.querySelector("#euler786-stage-caption");
  const stageButtons = [...root.querySelectorAll("[data-euler786-stage]")];
  const latticeControls = root.querySelector("#euler786-lattice-controls");
  const nInput = root.querySelector("#euler786-n");
  const nValue = root.querySelector("#euler786-n-value");
  const pairValue = root.querySelector("#euler786-pairs");
  const traceValue = root.querySelector("#euler786-traces");
  let currentStage = 0;

  const captions = [
    "Два упругих отражения дают замкнутую ломаную A → P → Q → A.",
    "Отражаем стол в месте каждого удара — и та же ломаная распрямляется в отрезок A → A′.",
    "Конец развёрнутого луча кодируется видимой целой точкой: gcd(x,y)=1, 3 не делит y."
  ];

  const descriptions = [
    "Замкнутая траектория с двумя отражениями внутри специального четырёхугольника.",
    "Три зеркальные копии четырёхугольника и прямой отрезок между образами вершины A.",
    "Целые точки внутри треугольника 18x плюс 10y не больше 3N плюс 6. Закрашены взаимно простые пары с y не кратным трём."
  ];

  const create = (name, attrs = {}) => {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value));
    }
    return node;
  };

  const add = (parent, name, attrs = {}) => {
    const node = create(name, attrs);
    parent.append(node);
    return node;
  };

  const addText = (parent, value, x, y, attrs = {}) => {
    const node = add(parent, "text", { x, y, ...attrs });
    node.textContent = value;
    return node;
  };

  const pointString = points => points.map(([x, y]) => `${x},${y}`).join(" ");

  const gcd = (a, b) => {
    while (b !== 0) [a, b] = [b, a % b];
    return a;
  };

  const drawBilliard = () => {
    const group = add(canvas, "g");
    const originX = 260;
    const originY = 440;
    const scale = 190;
    const map = ([x, y]) => [originX + scale * x, originY - scale * y];

    const A = map([0, 0]);
    const B = map([1, 0]);
    const C = map([1, Math.sqrt(3)]);
    const D = map([-0.5, Math.sqrt(3) / 2]);
    const P = map([1, 1 / Math.sqrt(3)]);
    const Q = map([0, 2 / Math.sqrt(3)]);

    add(group, "polygon", {
      points: pointString([A, B, C, D]),
      class: "e786-table"
    });
    add(group, "polyline", {
      points: pointString([A, P, Q, A]),
      class: "e786-route"
    });

    for (const [point, label, dx, dy] of [
      [A, "A", -25, 26],
      [B, "B", 12, 24],
      [C, "C", 12, -8],
      [D, "D", -30, 0],
      [P, "P", 12, 5],
      [Q, "Q", -28, -10]
    ]) {
      add(group, "circle", {
        cx: point[0],
        cy: point[1],
        r: label === "P" || label === "Q" ? 7 : 6,
        class: label === "P" || label === "Q" ? "e786-hit" : "e786-a-point"
      });
      addText(group, label, point[0] + dx, point[1] + dy, { class: "e786-math" });
    }

    addText(group, "угол падения", 600, 205, { class: "e786-annotation" });
    addText(group, "равен углу отражения", 600, 230, { class: "e786-annotation" });
    add(group, "path", {
      d: `M 580 242 C 520 250, 500 290, ${P[0] + 5} ${P[1] - 10}`,
      class: "e786-helper"
    });
    addText(group, "2 удара", 660, 350, { class: "e786-math" });
    addText(group, "→ 2 зеркальных копии", 660, 377, { class: "e786-annotation" });
  };

  const drawUnfolding = () => {
    const group = add(canvas, "g");
    const originX = 170;
    const originY = 440;
    const scale = 140;
    const map = ([x, y]) => [originX + scale * x, originY - scale * y];

    const A = [0, 0];
    const B = [1, 0];
    const C = [1, Math.sqrt(3)];
    const D = [-0.5, Math.sqrt(3) / 2];
    const A1 = [2, 0];
    const D1 = [2.5, Math.sqrt(3) / 2];
    const A2 = [3, Math.sqrt(3)];
    const B2 = [2.5, 3 * Math.sqrt(3) / 2];
    const P = [1, 1 / Math.sqrt(3)];
    const Q = [2, 2 / Math.sqrt(3)];

    for (const coordinates of [
      [A, B, C, D],
      [A1, B, C, D1],
      [A2, B2, C, D1]
    ]) {
      add(group, "polygon", {
        points: pointString(coordinates.map(map)),
        class: "e786-copy"
      });
    }

    const start = map(A);
    const end = map(A2);
    add(group, "line", {
      x1: start[0],
      y1: start[1],
      x2: end[0],
      y2: end[1],
      class: "e786-route"
    });

    for (const [coordinates, label, dx, dy] of [
      [A, "A", -22, 25],
      [P, "удар 1", -18, 30],
      [Q, "удар 2", -18, 30],
      [A2, "A′", 12, -8]
    ]) {
      const point = map(coordinates);
      add(group, "circle", {
        cx: point[0],
        cy: point[1],
        r: label.startsWith("удар") ? 7 : 8,
        class: label.startsWith("удар") ? "e786-hit" : "e786-a-point"
      });
      addText(group, label, point[0] + dx, point[1] + dy, {
        class: label.startsWith("удар") ? "e786-annotation" : "e786-math"
      });
    }

    addText(group, "ломаная исчезла", 660, 170, { class: "e786-annotation" });
    addText(group, "осталась одна прямая", 660, 198, { class: "e786-annotation" });
    addText(group, "каждая пересечённая граница", 620, 310, { class: "e786-annotation" });
    addText(group, "= один удар", 695, 338, { class: "e786-annotation" });
    add(group, "path", {
      d: "M 645 285 C 590 270, 570 260, 515 245",
      class: "e786-helper"
    });
  };

  const niceStep = max => {
    const raw = max / 5;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const scaled = raw / magnitude;
    return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * magnitude;
  };

  const drawLattice = () => {
    const group = add(canvas, "g");
    const n = Number(nInput.value);
    const limit = 3 * n + 6;
    const left = 62;
    const right = 855;
    const top = 20;
    const bottom = 438;
    const xMax = limit / 18;
    const yMax = limit / 10;
    const sx = (right - left) / xMax;
    const sy = (bottom - top) / yMax;
    const xPos = x => left + x * sx;
    const yPos = y => bottom - y * sy;

    nValue.textContent = String(n);

    const xStep = niceStep(xMax);
    const yStep = niceStep(yMax);
    for (let x = 0; x <= xMax + 1e-9; x += xStep) {
      add(group, "line", {
        x1: xPos(x),
        y1: top,
        x2: xPos(x),
        y2: bottom,
        class: "e786-grid"
      });
      addText(group, String(Math.round(x)), xPos(x), bottom + 20, { "text-anchor": "middle" });
    }
    for (let y = 0; y <= yMax + 1e-9; y += yStep) {
      add(group, "line", {
        x1: left,
        y1: yPos(y),
        x2: right,
        y2: yPos(y),
        class: "e786-grid"
      });
      addText(group, String(Math.round(y)), left - 10, yPos(y) + 5, { "text-anchor": "end" });
    }

    add(group, "polygon", {
      points: pointString([[left, bottom], [right, bottom], [left, top]]),
      class: "e786-region"
    });
    add(group, "line", {
      x1: right,
      y1: bottom,
      x2: left,
      y2: top,
      class: "e786-boundary"
    });
    add(group, "line", { x1: left, y1: bottom, x2: right, y2: bottom, class: "e786-axis" });
    add(group, "line", { x1: left, y1: top, x2: left, y2: bottom, class: "e786-axis" });
    addText(group, "x = β", right, bottom + 20, { "text-anchor": "end", class: "e786-math" });
    addText(group, "y = α", left + 8, top + 15, { class: "e786-math" });
    addText(group, "18x + 10y = 3N + 6", 540, 65, { class: "e786-math" });

    let validCount = 0;
    const radius = n <= 40 ? 4.5 : n <= 100 ? 3.5 : 2.7;
    for (let x = 1; 18 * x + 10 <= limit; x += 1) {
      for (let y = 1; 18 * x + 10 * y <= limit; y += 1) {
        const cx = xPos(x);
        const cy = yPos(y);
        if (y % 3 === 0) {
          add(group, "path", {
            d: `M ${cx - radius} ${cy - radius} L ${cx + radius} ${cy + radius} M ${cx - radius} ${cy + radius} L ${cx + radius} ${cy - radius}`,
            class: "e786-excluded"
          });
        } else if (gcd(x, y) === 1) {
          validCount += 1;
          add(group, "circle", { cx, cy, r: radius, class: "e786-valid" });
        } else {
          add(group, "circle", { cx, cy, r: radius, class: "e786-hidden" });
        }
      }
    }

    pairValue.textContent = validCount.toLocaleString("ru-RU");
    traceValue.textContent = (4 * validCount + 2).toLocaleString("ru-RU");

    add(group, "circle", { cx: 115, cy: 490, r: 5, class: "e786-valid" });
    addText(group, "видимая", 129, 495);
    add(group, "circle", { cx: 255, cy: 490, r: 5, class: "e786-hidden" });
    addText(group, "gcd > 1", 269, 495);
    add(group, "path", { d: "M 390 485 L 400 495 M 390 495 L 400 485", class: "e786-excluded" });
    addText(group, "3 делит y", 409, 495);
  };

  const render = () => {
    canvas.replaceChildren();
    description.textContent = descriptions[currentStage];
    caption.textContent = captions[currentStage];
    latticeControls.hidden = currentStage !== 2;

    if (currentStage === 0) drawBilliard();
    if (currentStage === 1) drawUnfolding();
    if (currentStage === 2) drawLattice();
  };

  const setStage = stage => {
    currentStage = stage;
    for (const button of stageButtons) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.euler786Stage) === stage));
    }
    render();
  };

  for (const button of stageButtons) {
    button.addEventListener("click", () => setStage(Number(button.dataset.euler786Stage)));
  }
  nInput.addEventListener("input", () => {
    if (currentStage === 2) render();
  });

  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  setStage(0);
})();
