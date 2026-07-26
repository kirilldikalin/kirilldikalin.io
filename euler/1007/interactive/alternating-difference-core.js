(function (root) {
  "use strict";

  function leaf(index) {
    return {
      type: "leaf",
      index,
      start: index,
      end: index,
      leafCount: 1,
    };
  }

  function branch(left, right) {
    return {
      type: "branch",
      left,
      right,
      start: left.start,
      end: right.end,
      leafCount: left.leafCount + right.leafCount,
    };
  }

  function generateTrees(start, count) {
    if (!Number.isInteger(start) || !Number.isInteger(count) || count < 1) {
      throw new Error("Некорректный диапазон листьев");
    }
    if (count === 1) return [leaf(start)];

    const result = [];
    for (let leftCount = 1; leftCount < count; leftCount += 1) {
      const leftTrees = generateTrees(start, leftCount);
      const rightTrees = generateTrees(start + leftCount, count - leftCount);

      for (const leftTree of leftTrees) {
        for (const rightTree of rightTrees) {
          result.push(branch(leftTree, rightTree));
        }
      }
    }
    return result;
  }

  function fibonacciNumbers(count) {
    if (!Number.isInteger(count) || count < 1) {
      throw new Error("Некорректное число Фибоначчи");
    }

    const values = [0, 1];
    while (values.length < count) {
      values.push(values[values.length - 1] + values[values.length - 2]);
    }
    return values.slice(0, count);
  }

  function evaluateTree(node, fibonacci) {
    if (node.type === "leaf") return fibonacci[node.index];
    return evaluateTree(node.left, fibonacci) - evaluateTree(node.right, fibonacci);
  }

  function collectSigns(node, sign, signs) {
    if (node.type === "leaf") {
      signs[node.index] = sign;
      return;
    }
    collectSigns(node.left, sign, signs);
    collectSigns(node.right, -sign, signs);
  }

  function aggregateCoefficients(trees, leafCount) {
    const coefficients = Array(leafCount).fill(0);
    for (const tree of trees) {
      const signs = [];
      collectSigns(tree, 1, signs);
      signs.forEach((sign, index) => {
        coefficients[index] += sign;
      });
    }
    return coefficients;
  }

  root.Euler1007Core = Object.freeze({
    generateTrees,
    fibonacciNumbers,
    evaluateTree,
    collectSigns,
    aggregateCoefficients,
  });
}(typeof window === "undefined" ? globalThis : window));
