(function (root) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  function create(name, attributes, text) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(function (entry) {
      if (entry[1] !== null && entry[1] !== undefined) {
        element.setAttribute(entry[0], String(entry[1]));
      }
    });
    if (text !== undefined) {
      element.textContent = String(text);
    }
    return element;
  }

  function append(parent, name, attributes, text) {
    const element = create(name, attributes, text);
    parent.appendChild(element);
    return element;
  }

  function clear(svg, titleText, descriptionText) {
    svg.replaceChildren();
    const titleId = (svg.id || "atlas-lab-visual") + "-title";
    const descriptionId = (svg.id || "atlas-lab-visual") + "-description";
    append(svg, "title", { id: titleId }, titleText);
    append(svg, "desc", { id: descriptionId }, descriptionText);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-labelledby", titleId + " " + descriptionId);
  }

  function text(parent, x, y, value, className, anchor) {
    return append(parent, "text", {
      x: x,
      y: y,
      class: className || "",
      "text-anchor": anchor || "start",
    }, value);
  }

  function pathFromPoints(points, xAccessor, yAccessor) {
    return points.map(function (point, index) {
      return (index === 0 ? "M" : "L") +
        Number(xAccessor(point)).toFixed(2) + " " +
        Number(yAccessor(point)).toFixed(2);
    }).join(" ");
  }

  root.AtlasLabSvg = Object.freeze({
    SVG_NS: SVG_NS,
    create: create,
    append: append,
    clear: clear,
    text: text,
    pathFromPoints: pathFromPoints,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
