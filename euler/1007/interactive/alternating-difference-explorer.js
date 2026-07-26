(() => {
  "use strict";

  const root = document.getElementById("euler1007-explorer");
  const core = window.Euler1007Core;
  if (!root || !core) return;

  const slider = root.querySelector("#e1007-n");
  const nValue = root.querySelector("#e1007-n-value");
  const previousButton = root.querySelector("#e1007-previous");
  const nextButton = root.querySelector("#e1007-next");
  const treeIndexValue = root.querySelector("#e1007-tree-index");
  const treeTotalValue = root.querySelector("#e1007-tree-total");
  const expressionValue = root.querySelector("#e1007-expression");
  const catalanValue = root.querySelector("#e1007-catalan");
  const currentTreeValue = root.querySelector("#e1007-tree-value");
  const totalValue = root.querySelector("#e1007-total-value");
  const polynomialValue = root.querySelector("#e1007-polynomial");
  const coefficientList = root.querySelector("#e1007-coefficients");
  const canvas = root.querySelector("#e1007-tree-canvas");
  const svgDescription = root.querySelector("#e1007-tree-description");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const svgNamespace = "http://www.w3.org/2000/svg";
  const subscriptDigits = "₀₁₂₃₄₅₆₇₈₉";
  const superscriptDigits = "⁰¹²³⁴⁵⁶⁷⁸⁹";

  let trees = [];
  let treeIndex = 0;

  function indexedNumber(value, digits) {
    return String(value)
      .split("")
      .map((digit) => digits[Number(digit)])
      .join("");
  }

  function expressionFor(node) {
    if (node.type === "leaf") {
      return "F" + indexedNumber(node.index, subscriptDigits);
    }
    return "(" + expressionFor(node.left) + " − " + expressionFor(node.right) + ")";
  }

  function formatSigned(value) {
    if (value === 0) return "0";
    return value < 0 ? "−" + Math.abs(value) : String(value);
  }

  function formatPolynomial(coefficients) {
    const terms = [];

    coefficients.forEach((coefficient, power) => {
      if (coefficient === 0) return;

      const absolute = Math.abs(coefficient);
      let body = "";
      if (power === 0 || absolute !== 1) body += absolute;
      if (power >= 1) body += "y";
      if (power >= 2) body += indexedNumber(power, superscriptDigits);

      if (terms.length === 0) {
        terms.push((coefficient < 0 ? "−" : "") + body);
      } else {
        terms.push((coefficient < 0 ? " − " : " + ") + body);
      }
    });

    return terms.length ? terms.join("") : "0";
  }

  function svgElement(name, attributes, text) {
    const node = document.createElementNS(svgNamespace, name);
    Object.entries(attributes || {}).forEach(([key, value]) => {
      node.setAttribute(key, String(value));
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function positionFor(node, totalLeaves) {
    const left = 72;
    const right = 828;
    const top = 48;
    const bottom = 330;
    const centerIndex = (node.start + node.end) / 2;
    const x = totalLeaves === 1
      ? (left + right) / 2
      : left + centerIndex * (right - left) / (totalLeaves - 1);
    const y = node.type === "leaf"
      ? bottom
      : top + (totalLeaves - node.leafCount) *
        (bottom - top) / Math.max(totalLeaves - 1, 1);
    return { x, y };
  }

  function renderTree(node, signs, totalLeaves) {
    canvas.replaceChildren();

    function draw(current) {
      const currentPosition = positionFor(current, totalLeaves);

      if (current.type === "branch") {
        [
          { child: current.left, right: false },
          { child: current.right, right: true },
        ].forEach(({ child, right }) => {
          const childPosition = positionFor(child, totalLeaves);
          canvas.append(svgElement("line", {
            x1: currentPosition.x,
            y1: currentPosition.y,
            x2: childPosition.x,
            y2: childPosition.y,
            class: right
              ? "e1007-edge e1007-edge-right"
              : "e1007-edge",
          }));
          draw(child);
        });

        canvas.append(svgElement("circle", {
          cx: currentPosition.x,
          cy: currentPosition.y,
          r: 9,
          class: "e1007-node",
        }));
        canvas.append(svgElement("text", {
          x: currentPosition.x,
          y: currentPosition.y - 17,
        }, "−"));
        return;
      }

      const positive = signs[current.index] > 0;
      canvas.append(svgElement("circle", {
        cx: currentPosition.x,
        cy: currentPosition.y,
        r: 30,
        class: positive
          ? "e1007-leaf-positive"
          : "e1007-leaf-negative",
      }));
      canvas.append(svgElement("text", {
        x: currentPosition.x,
        y: currentPosition.y + 7,
        class: positive ? "e1007-leaf-positive-label" : "",
      }, (positive ? "+" : "−") + "F" + indexedNumber(current.index, subscriptDigits)));
    }

    draw(node);

    if (!reduceMotion.matches) {
      canvas.animate(
        [
          { transform: "translateY(4px)", opacity: 0.65 },
          { transform: "translateY(0)", opacity: 1 },
        ],
        { duration: 160, easing: "ease-out" },
      );
    }
  }

  function renderCoefficients(coefficients) {
    coefficientList.replaceChildren();
    coefficients.forEach((coefficient, index) => {
      const item = document.createElement("span");
      item.className = "e1007-coefficient";

      const leafName = document.createElement("span");
      leafName.textContent = "F" + indexedNumber(index, subscriptDigits);
      const coefficientValue = document.createElement("strong");
      coefficientValue.textContent = formatSigned(coefficient);

      item.append(leafName, coefficientValue);
      coefficientList.append(item);
    });
  }

  function render() {
    const n = Number(slider.value);
    const currentTree = trees[treeIndex];
    const fibonacci = core.fibonacciNumbers(n + 1);
    const signs = [];
    core.collectSigns(currentTree, 1, signs);
    const coefficients = core.aggregateCoefficients(trees, n + 1);
    const total = coefficients.reduce(
      (sum, coefficient, index) => sum + coefficient * fibonacci[index],
      0,
    );

    nValue.textContent = String(n);
    treeIndexValue.textContent = String(treeIndex + 1);
    treeTotalValue.textContent = String(trees.length);
    expressionValue.textContent = expressionFor(currentTree);
    catalanValue.textContent = trees.length.toLocaleString("ru-RU");
    currentTreeValue.textContent = formatSigned(core.evaluateTree(currentTree, fibonacci));
    totalValue.textContent = formatSigned(total);
    polynomialValue.textContent =
      "P" + indexedNumber(n, subscriptDigits) + "(y) = " +
      formatPolynomial(coefficients);
    slider.setAttribute("aria-label", "Число знаков минус n: " + n);
    svgDescription.textContent =
      "Выбранная расстановка для " + (n + 1) +
      " листьев. Сплошные рёбра ведут влево, штриховые ведут вправо и меняют знак.";

    renderTree(currentTree, signs, n + 1);
    renderCoefficients(coefficients);
  }

  function rebuildTrees() {
    const n = Number(slider.value);
    trees = core.generateTrees(0, n + 1);
    treeIndex = Math.floor(trees.length / 2);
    render();
  }

  slider.addEventListener("input", rebuildTrees);
  previousButton.addEventListener("click", () => {
    treeIndex = (treeIndex - 1 + trees.length) % trees.length;
    render();
  });
  nextButton.addEventListener("click", () => {
    treeIndex = (treeIndex + 1) % trees.length;
    render();
  });

  rebuildTrees();
})();
