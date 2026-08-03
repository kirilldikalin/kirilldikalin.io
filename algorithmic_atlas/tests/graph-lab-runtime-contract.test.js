const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = require("../labs/graph-lab-runtime.js");

const labsRoot = path.join(__dirname, "../labs");
const runtimeSource = fs.readFileSync(path.join(labsRoot, "graph-lab-runtime.js"), "utf8");
const styles = fs.readFileSync(path.join(labsRoot, "graph-labs.css"), "utf8");

const graph = {
  directed: true,
  nodes: [
    { id: "s", layer: 0, partition: "left" },
    { id: "a", layer: 1, partition: "right" },
    { id: "b", layer: 1, partition: "right" },
    { id: "t", layer: 2, partition: "left" },
  ],
  edges: [
    { source: "s", target: "a" },
    { source: "s", target: "b" },
    { source: "a", target: "t" },
    { source: "b", target: "t" },
  ],
};

test("circle layout is deterministic, bounded and keeps every node", () => {
  const first = runtime.computeLayout(graph, { type: "circle", width: 800, height: 500 });
  const second = runtime.computeLayout(graph, { type: "circle", width: 800, height: 500 });
  assert.deepEqual(first, second);
  assert.equal(Object.keys(first.positions).length, graph.nodes.length);
  for (const position of Object.values(first.positions)) {
    assert.ok(position.x >= 0 && position.x <= first.width);
    assert.ok(position.y >= 0 && position.y <= first.height);
  }
  assert.equal(Object.isFrozen(first.positions.s), true);
});

test("layer layout honors explicit layers in both orientations", () => {
  const horizontal = runtime.computeLayout(graph, { type: "layers", width: 900, height: 500 });
  assert.ok(horizontal.positions.s.x < horizontal.positions.a.x);
  assert.equal(horizontal.positions.a.x, horizontal.positions.b.x);
  assert.ok(horizontal.positions.a.x < horizontal.positions.t.x);

  const vertical = runtime.computeLayout(graph, {
    type: "layers", orientation: "vertical", width: 900, height: 500,
  });
  assert.ok(vertical.positions.s.y < vertical.positions.a.y);
  assert.equal(vertical.positions.a.y, vertical.positions.b.y);
  assert.ok(vertical.positions.a.y < vertical.positions.t.y);
});

test("layer layout deterministically infers a DAG rank", () => {
  const withoutLayers = {
    directed: true,
    nodes: ["s", "a", "b", "t"],
    edges: graph.edges,
  };
  const layout = runtime.computeLayout(withoutLayers, { type: "layers" });
  assert.ok(layout.positions.s.x < layout.positions.a.x);
  assert.equal(layout.positions.a.x, layout.positions.b.x);
  assert.ok(layout.positions.a.x < layout.positions.t.x);
});

test("bipartite layout creates two columns and validates assignments", () => {
  const layout = runtime.computeLayout(graph, { type: "bipartite", width: 800, height: 500 });
  assert.equal(layout.positions.s.x, layout.positions.t.x);
  assert.equal(layout.positions.a.x, layout.positions.b.x);
  assert.notEqual(layout.positions.s.x, layout.positions.a.x);
  assert.throws(
    () => runtime.computeLayout(graph, {
      type: "bipartite", left: ["s", "a"], right: ["a", "b", "t"],
    }),
    /обе доли/
  );
  assert.throws(() => runtime.computeLayout(graph, { type: "spiral" }), /Неизвестный/);
});

test("every layout and the DOM mount accept an empty graph", () => {
  const empty = { directed: false, nodes: [], edges: [] };
  for (const type of ["circle", "layers", "bipartite"]) {
    const layout = runtime.computeLayout(empty, { type: type });
    assert.deepEqual(Object.keys(layout.positions), []);
  }

  const previousRuntime = globalThis.AtlasLabRuntime;
  const previousDrawing = globalThis.AtlasLabSvg;
  const documentRef = fakeDocument();
  const figure = documentRef.createElement("figure");
  const svg = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
  figure.appendChild(svg);
  globalThis.AtlasLabRuntime = Object.freeze({});
  globalThis.AtlasLabSvg = fakeDrawing(documentRef);
  try {
    const controller = runtime.mount(svg, empty, { title: "Пустой граф" });
    assert.equal(controller.getGraph().nodes.length, 0);
    assert.deepEqual(Object.keys(controller.getLayout().positions), []);
    assert.equal(svg.getAttribute("role"), "group");
    controller.destroy();
  } finally {
    if (previousRuntime === undefined) delete globalThis.AtlasLabRuntime;
    else globalThis.AtlasLabRuntime = previousRuntime;
    if (previousDrawing === undefined) delete globalThis.AtlasLabSvg;
    else globalThis.AtlasLabSvg = previousDrawing;
  }
});

test("DOM runtime is layered over the existing laboratory and SVG contracts", () => {
  assert.match(runtimeSource, /AtlasLabRuntime/);
  assert.match(runtimeSource, /AtlasLabSvg/);
  assert.match(runtimeSource, /drawing\.clear/);
  assert.match(runtimeSource, /drawing\.append/);
  assert.match(runtimeSource, /svg\.setAttribute\("role", "group"\)/);
  assert.match(runtimeSource, /marker-end/);
  assert.match(runtimeSource, /atlas-graph__edge-label/);
  assert.doesNotMatch(runtimeSource, /\beval\s*\(/);
  assert.doesNotMatch(runtimeSource, /innerHTML\s*=/);
});

test("graph navigation has mouse, touch and keyboard equivalents", () => {
  for (const eventName of ["wheel", "pointerdown", "pointermove", "pointerup", "pointercancel", "keydown"]) {
    assert.match(runtimeSource, new RegExp('listen\\(svg, "' + eventName + '"'));
  }
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape", "Home"]) {
    assert.match(runtimeSource, new RegExp(key));
  }
  assert.match(runtimeSource, /aria-keyshortcuts/);
  assert.match(runtimeSource, /aria-posinset/);
  assert.match(runtimeSource, /aria-setsize/);
  assert.match(runtimeSource, /aria-label/);
  assert.match(runtimeSource, /resetView/);
  assert.match(runtimeSource, /zoomAt/);
  assert.match(runtimeSource, /panBy/);
});

test("graph styles are full-width, responsive, dark-aware and motion-safe", () => {
  assert.match(styles, /@import url\("lab-layout\.css"\)/);
  assert.match(styles, /\.atlas-graph__svg[\s\S]*width:\s*100%/);
  assert.match(styles, /touch-action:\s*pan-y/);
  assert.match(styles, /@media \(max-width:\s*42rem\)/);
  assert.match(styles, /@media \(prefers-color-scheme:\s*dark\)/);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styles, /transition:\s*none/);
  assert.doesNotMatch(styles, /transform:\s*scale\(/);
});

function fakeDocument() {
  const documentRef = {
    createElement(name) {
      return fakeElement(documentRef, "http://www.w3.org/1999/xhtml", name);
    },
    createElementNS(namespace, name) {
      return fakeElement(documentRef, namespace, name);
    },
  };
  return documentRef;
}

function fakeElement(documentRef, namespace, name) {
  const classes = new Set();
  const listeners = new Map();
  return {
    namespaceURI: namespace,
    nodeName: name,
    ownerDocument: documentRef,
    parentNode: null,
    children: [],
    attributes: Object.create(null),
    dataset: Object.create(null),
    classList: {
      add(...tokens) { tokens.forEach((token) => classes.add(token)); },
      remove(...tokens) { tokens.forEach((token) => classes.delete(token)); },
      contains(token) { return classes.has(token); },
    },
    textContent: "",
    id: "",
    setAttribute(attribute, value) {
      this.attributes[attribute] = String(value);
      if (attribute === "id") this.id = String(value);
    },
    getAttribute(attribute) {
      return this.attributes[attribute] === undefined ? null : this.attributes[attribute];
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore(child, reference) {
      child.parentNode = this;
      const index = this.children.indexOf(reference);
      if (index < 0) this.children.push(child);
      else this.children.splice(index, 0, child);
      return child;
    },
    replaceChildren(...children) {
      this.children.forEach((child) => { child.parentNode = null; });
      this.children = [];
      children.forEach((child) => this.appendChild(child));
    },
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      if (listeners.has(type)) listeners.get(type).delete(listener);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 920, height: 560 };
    },
    focus() {},
  };
}

function fakeDrawing(documentRef) {
  function append(parent, name, attributes, text) {
    const element = documentRef.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes || {}).forEach(([attribute, value]) => {
      if (value !== null && value !== undefined) element.setAttribute(attribute, value);
    });
    if (text !== undefined) element.textContent = String(text);
    parent.appendChild(element);
    return element;
  }
  return Object.freeze({
    append,
    text(parent, x, y, value, className, anchor) {
      return append(parent, "text", {
        x: x, y: y, class: className || "", "text-anchor": anchor || "start",
      }, value);
    },
    clear(svg, title, description) {
      svg.replaceChildren();
      append(svg, "title", { id: svg.id + "-title" }, title);
      append(svg, "desc", { id: svg.id + "-description" }, description);
      svg.setAttribute("role", "img");
    },
  });
}
