(() => {
  "use strict";

  const root = document.getElementById("euler792-explorer");
  if (!root) return;

  const slider = root.querySelector("#e792-root");
  const rootValue = root.querySelector("[data-e792-root-value]");
  const nValue = root.querySelector("[data-e792-n]");
  const uValue = root.querySelector("[data-e792-u]");
  const minimaValue = root.querySelector("[data-e792-minima]");
  const chart = root.querySelector("[data-e792-chart]");
  const detail = root.querySelector("[data-e792-detail]");
  const svgNS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function absBig(value) {
    return value < 0n ? -value : value;
  }

  function gcd(a, b) {
    a = absBig(a);
    b = absBig(b);
    while (b !== 0n) {
      const next = a % b;
      a = b;
      b = next;
    }
    return a;
  }

  function fraction(numerator, denominator = 1n) {
    if (denominator === 0n) throw new Error("Нулевой знаменатель");
    if (denominator < 0n) {
      numerator = -numerator;
      denominator = -denominator;
    }
    const divisor = gcd(numerator, denominator);
    return { n: numerator / divisor, d: denominator / divisor };
  }

  function multiply(a, b) {
    const g1 = gcd(a.n, b.d);
    const g2 = gcd(b.n, a.d);
    return fraction((a.n / g1) * (b.n / g2), (a.d / g2) * (b.d / g1));
  }

  function add(a, b) {
    const common = gcd(a.d, b.d);
    const left = b.d / common;
    const right = a.d / common;
    return fraction(a.n * left + b.n * right, a.d * left);
  }

  function v2Integer(value) {
    value = absBig(value);
    if (value === 0n) throw new Error("ν₂(0) не определена");
    let count = 0;
    while ((value & 1n) === 0n) {
      value >>= 1n;
      count += 1;
    }
    return count;
  }

  function v2Fraction(value) {
    return v2Integer(value.n) - v2Integer(value.d);
  }

  function bitCount(value) {
    let count = 0;
    while (value > 0n) {
      count += Number(value & 1n);
      value >>= 1n;
    }
    return count;
  }

  function exactU(n) {
    const first = n + 1n;
    const firstWeight = bitCount(first);
    const base = first + BigInt(firstWeight);
    let term = fraction(1n);
    let partial = fraction(1n);

    for (let j = 0; j < 256; j += 1) {
      if (j > 0) {
        const previous = first + BigInt(j - 1);
        const ratio = fraction(-4n * (2n * previous + 1n), previous + 1n);
        term = multiply(term, ratio);
        partial = add(partial, term);
      }

      const correction = v2Fraction(partial);
      const remainderBound = j + 2 - firstWeight;
      if (correction < remainderBound) {
        return {
          value: base + BigInt(correction),
          correction,
          lastIndex: j,
        };
      }
    }
    throw new Error("Хвост не стабилизировался");
  }

  function svgElement(name, attributes = {}, text = "") {
    const node = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    if (text) node.textContent = text;
    return node;
  }

  function renderChart(n) {
    const firstWeight = bitCount(n + 1n);
    const count = Math.min(36, Math.max(18, firstWeight + 8));
    const points = [];

    for (let j = 1; j <= count; j += 1) {
      const k = n + BigInt(j);
      points.push({ j, value: j + bitCount(k) });
    }

    const minValue = Math.min(...points.slice(0, firstWeight).map((point) => point.value));
    const minima = points.slice(0, firstWeight).filter((point) => point.value === minValue);
    const yMin = Math.min(...points.map((point) => point.value)) - 1;
    const yMax = Math.max(...points.map((point) => point.value)) + 1;
    const left = 64;
    const right = 724;
    const top = 36;
    const bottom = 356;
    const xFor = (j) => left + ((j - 1) * (right - left)) / (count - 1);
    const yFor = (value) => bottom - ((value - yMin) * (bottom - top)) / (yMax - yMin);

    chart.replaceChildren();

    const tickStep = Math.max(1, Math.ceil((yMax - yMin) / 7));
    for (let tick = yMin; tick <= yMax; tick += tickStep) {
      const y = yFor(tick);
      chart.append(svgElement("line", { x1: left, y1: y, x2: right, y2: y, class: "grid" }));
      chart.append(svgElement("text", { x: left - 12, y: y + 7, "text-anchor": "end" }, tick));
    }

    chart.append(svgElement("line", { x1: left, y1: bottom, x2: right, y2: bottom, class: "axis" }));

    const path = points
      .map((point, index) => (index === 0 ? "M" : "L") + xFor(point.j).toFixed(1) + "," + yFor(point.value).toFixed(1))
      .join(" ");
    const series = svgElement("path", { d: path, class: "series" });
    chart.append(series);

    for (const point of points) {
      const isMinimum = point.j <= firstWeight && point.value === minValue;
      chart.append(svgElement("circle", {
        cx: xFor(point.j),
        cy: yFor(point.value),
        r: isMinimum ? 8 : 4,
        class: isMinimum ? "minimum" : "point",
      }));
      if (isMinimum) {
        chart.append(svgElement("text", {
          x: xFor(point.j) + (point.j === 1 ? 12 : 0),
          y: yFor(point.value) - 14,
          "text-anchor": point.j === 1 ? "start" : "middle",
          class: "important",
        }, "j=" + point.j));
      }
    }

    for (const j of [1, Math.ceil(count / 2), count]) {
      chart.append(svgElement("text", { x: xFor(j), y: bottom + 34, "text-anchor": "middle" }, j));
    }
    chart.append(svgElement("text", { x: (left + right) / 2, y: 420, "text-anchor": "middle" }, "смещение j = k − n"));
    chart.append(svgElement("text", { x: left, y: 24, class: "important" }, "ν₂(tₖ) − n"));

    if (!reduceMotion.matches) {
      series.animate(
        [{ transform: "translateY(5px)" }, { transform: "translateY(0)" }],
        { duration: 180, easing: "ease-out" },
      );
    }

    return { minimaCount: minima.length };
  }

  function update() {
    const m = BigInt(slider.value);
    const n = m * m * m;
    const result = exactU(n);
    const chartResult = renderChart(n);
    const correctionSign = result.correction > 0 ? "+" : "";

    rootValue.textContent = slider.value;
    nValue.textContent = n.toLocaleString("ru-RU");
    uValue.textContent = result.value.toLocaleString("ru-RU");
    minimaValue.textContent = String(chartResult.minimaCount);
    slider.setAttribute("aria-label", "Корень куба m: " + slider.value);

    const minimumText = chartResult.minimaCount === 1
      ? "Минимум уникален"
      : "Равных минимумов: " + chartResult.minimaCount;
    detail.textContent = minimumText + "; коррекция " + correctionSign + result.correction
      + ", хвост стабилизировался на шаге " + result.lastIndex + ".";
  }

  slider.addEventListener("input", update);
  update();
})();
