(function (root, factory) {
  "use strict";

  const core = typeof module === "object" && module.exports
    ? require("./graph-lab-core.js")
    : root.AtlasGraphLabCore;
  const api = factory(root, core);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AtlasGraphLabRuntime = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, core) {
  "use strict";

  if (!core) {
    throw new Error("AtlasGraphLabCore is unavailable");
  }

  const controllers = typeof WeakMap === "function" ? new WeakMap() : null;
  let generatedId = 0;

  function boundedDimension(rawValue, fallback, label, minimum, maximum) {
    return core.boundedNumber(
      rawValue === undefined ? fallback : rawValue,
      label,
      minimum,
      maximum
    );
  }

  function layoutSettings(options) {
    const settings = options || {};
    const width = boundedDimension(settings.width, 920, "Ширина графа", 320, 4000);
    const height = boundedDimension(settings.height, 560, "Высота графа", 240, 3000);
    const maximumPadding = Math.min(width, height) / 3;
    const padding = boundedDimension(settings.padding, 64, "Отступ графа", 16, maximumPadding);
    return { width: width, height: height, padding: padding };
  }

  function point(x, y) {
    return Object.freeze({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
  }

  function circleLayout(graph, settings) {
    const positions = Object.create(null);
    const centerX = settings.width / 2;
    const centerY = settings.height / 2;
    const radius = Math.max(
      0,
      Math.min(settings.width, settings.height) / 2 - settings.padding
    );
    graph.nodes.forEach(function (node, index) {
      const angle = graph.nodes.length === 1
        ? 0
        : -Math.PI / 2 + 2 * Math.PI * index / graph.nodes.length;
      positions[node.id] = graph.nodes.length === 1
        ? point(centerX, centerY)
        : point(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
    });
    return positions;
  }

  function inferredLayers(graph) {
    const ranks = Object.create(null);
    const indegree = Object.create(null);
    const outgoing = Object.create(null);
    graph.nodes.forEach(function (node) {
      ranks[node.id] = 0;
      indegree[node.id] = 0;
      outgoing[node.id] = [];
    });
    graph.edges.forEach(function (edge) {
      if (!edge.directed || edge.source === edge.target) return;
      indegree[edge.target] += 1;
      outgoing[edge.source].push(edge.target);
    });
    const queue = graph.nodes
      .filter(function (node) { return indegree[node.id] === 0; })
      .map(function (node) { return node.id; });
    let cursor = 0;
    while (cursor < queue.length) {
      const id = queue[cursor];
      cursor += 1;
      outgoing[id].forEach(function (target) {
        ranks[target] = Math.max(ranks[target], ranks[id] + 1);
        indegree[target] -= 1;
        if (indegree[target] === 0) queue.push(target);
      });
    }
    return ranks;
  }

  function layerLayout(graph, settings, options) {
    const configured = options.layerById || {};
    const inferred = inferredLayers(graph);
    const groups = new Map();
    graph.nodes.forEach(function (node) {
      const rawLayer = Object.prototype.hasOwnProperty.call(configured, node.id)
        ? configured[node.id]
        : node.layer === null ? inferred[node.id] : node.layer;
      const layer = core.boundedInteger(rawLayer, "Слой вершины " + node.id, -1000, 1000);
      if (!groups.has(layer)) groups.set(layer, []);
      groups.get(layer).push(node);
    });
    const layers = Array.from(groups.keys()).sort(function (left, right) { return left - right; });
    const positions = Object.create(null);
    const horizontal = options.orientation !== "vertical";
    layers.forEach(function (layer, layerIndex) {
      const nodes = groups.get(layer);
      const layerShare = layers.length === 1 ? 0.5 : layerIndex / (layers.length - 1);
      nodes.forEach(function (node, nodeIndex) {
        const nodeShare = nodes.length === 1 ? 0.5 : nodeIndex / (nodes.length - 1);
        const across = settings.padding + layerShare * (settings.width - 2 * settings.padding);
        const within = settings.padding + nodeShare * (settings.height - 2 * settings.padding);
        positions[node.id] = horizontal ? point(across, within) : point(within, across);
      });
    });
    return positions;
  }

  function bipartiteSets(graph, options) {
    const ids = new Set(graph.nodes.map(function (node) { return node.id; }));
    if (Array.isArray(options.left) || Array.isArray(options.right)) {
      const left = (options.left || []).map(function (id) { return core.normalizeId(id, "Левая доля"); });
      const right = (options.right || []).map(function (id) { return core.normalizeId(id, "Правая доля"); });
      const assigned = new Set();
      left.concat(right).forEach(function (id) {
        if (!ids.has(id)) throw new RangeError("Разбиение ссылается на неизвестную вершину " + id + ".");
        if (assigned.has(id)) throw new RangeError("Вершина " + id + " попала в обе доли.");
        assigned.add(id);
      });
      graph.nodes.forEach(function (node) {
        if (!assigned.has(node.id)) {
          (left.length <= right.length ? left : right).push(node.id);
        }
      });
      return [left, right];
    }
    const partitions = new Map();
    graph.nodes.forEach(function (node) {
      if (node.partition === null) return;
      if (!partitions.has(node.partition)) partitions.set(node.partition, []);
      partitions.get(node.partition).push(node.id);
    });
    const keys = Array.from(partitions.keys()).sort();
    const left = keys.length > 0 ? partitions.get(keys[0]).slice() : [];
    const right = keys.length > 1 ? partitions.get(keys[1]).slice() : [];
    const assigned = new Set(left.concat(right));
    graph.nodes.forEach(function (node) {
      if (!assigned.has(node.id)) (left.length <= right.length ? left : right).push(node.id);
    });
    return [left, right];
  }

  function bipartiteLayout(graph, settings, options) {
    const sets = bipartiteSets(graph, options);
    const positions = Object.create(null);
    sets.forEach(function (ids, side) {
      ids.forEach(function (id, index) {
        const share = ids.length === 1 ? 0.5 : index / (ids.length - 1);
        positions[id] = point(
          side === 0 ? settings.padding : settings.width - settings.padding,
          settings.padding + share * (settings.height - 2 * settings.padding)
        );
      });
    });
    return positions;
  }

  function computeLayout(rawGraph, options) {
    const graph = core.normalizeGraph(rawGraph);
    const settings = layoutSettings(options);
    const layoutType = options && options.type ? options.type : "circle";
    let positions;
    if (layoutType === "circle") {
      positions = circleLayout(graph, settings);
    } else if (layoutType === "layers") {
      positions = layerLayout(graph, settings, options || {});
    } else if (layoutType === "bipartite") {
      positions = bipartiteLayout(graph, settings, options || {});
    } else {
      throw new RangeError("Неизвестный вид раскладки: " + layoutType + ".");
    }
    return core.deepFreeze({
      type: layoutType,
      width: settings.width,
      height: settings.height,
      positions: positions,
    });
  }

  function dependency(name) {
    const value = root && root[name];
    if (!value) throw new Error(name + " is unavailable");
    return value;
  }

  function safeClasses(rawValue) {
    if (!rawValue) return "";
    return String(rawValue).split(/\s+/).filter(function (token) {
      return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(token);
    }).join(" ");
  }

  function edgeDescription(edge, graph) {
    const arrow = edge.directed ? " в " : " — ";
    const nodeLabels = Object.create(null);
    graph.nodes.forEach(function (node) { nodeLabels[node.id] = node.label; });
    const detail = edge.label || (edge.weight === null ? "" : String(edge.weight));
    return "Ребро " + nodeLabels[edge.source] + arrow + nodeLabels[edge.target] +
      (detail ? ", метка " + detail : "");
  }

  function edgePath(source, target, radius, offset, selfLoop) {
    if (selfLoop) {
      const x = source.x;
      const y = source.y - radius * 0.75;
      return {
        path: "M " + (x - radius * 0.45) + " " + y +
          " C " + (x - radius * 2.2) + " " + (y - radius * 2.5) +
          ", " + (x + radius * 2.2) + " " + (y - radius * 2.5) +
          ", " + (x + radius * 0.45) + " " + y,
        label: point(x, y - radius * 2.05),
      };
    }
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const unitX = dx / distance;
    const unitY = dy / distance;
    const start = { x: source.x + unitX * radius, y: source.y + unitY * radius };
    const end = { x: target.x - unitX * (radius + 4), y: target.y - unitY * (radius + 4) };
    const normalX = -unitY;
    const normalY = unitX;
    const control = {
      x: (start.x + end.x) / 2 + normalX * offset,
      y: (start.y + end.y) / 2 + normalY * offset,
    };
    return {
      path: Math.abs(offset) < 0.01
        ? "M " + start.x + " " + start.y + " L " + end.x + " " + end.y
        : "M " + start.x + " " + start.y + " Q " + control.x + " " + control.y +
          " " + end.x + " " + end.y,
      label: point(
        0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
        0.25 * start.y + 0.5 * control.y + 0.25 * end.y
      ),
    };
  }

  function toolbarFor(svg, handlers) {
    const documentRef = svg.ownerDocument;
    const toolbar = documentRef.createElement("div");
    toolbar.className = "atlas-graph__toolbar";
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "Масштаб и положение графа");
    function add(action, text, label, handler) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.dataset.graphViewAction = action;
      button.textContent = text;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.addEventListener("click", handler);
      toolbar.appendChild(button);
    }
    add("zoom-out", "−", "Уменьшить масштаб графа", handlers.zoomOut);
    add("zoom-in", "+", "Увеличить масштаб графа", handlers.zoomIn);
    add("reset", "Сбросить вид", "Сбросить масштаб и положение графа", handlers.reset);
    const output = documentRef.createElement("output");
    output.className = "atlas-graph__scale";
    output.setAttribute("aria-label", "Текущий масштаб графа");
    output.setAttribute("aria-live", "polite");
    toolbar.appendChild(output);
    if (svg.parentNode) svg.parentNode.insertBefore(toolbar, svg);
    return { element: toolbar, output: output };
  }

  function mount(svg, rawGraph, rawOptions) {
    if (!svg || String(svg.namespaceURI) !== "http://www.w3.org/2000/svg") {
      throw new TypeError("AtlasGraphLabRuntime.mount requires an SVG element");
    }
    if (controllers && controllers.has(svg)) controllers.get(svg).destroy();
    const drawing = dependency("AtlasLabSvg");
    dependency("AtlasLabRuntime");
    const documentRef = svg.ownerDocument;
    let graph = core.normalizeGraph(rawGraph);
    let options = Object.assign({}, rawOptions || {});
    let layout = null;
    let viewport = null;
    let nodeElements = [];
    let transform = { x: 0, y: 0, scale: 1 };
    let pointer = null;
    let destroyed = false;
    const listeners = [];
    const nodeRadius = core.boundedNumber(
      options.nodeRadius === undefined ? 27 : options.nodeRadius,
      "Радиус вершины", 12, 80
    );

    if (!svg.id) {
      generatedId += 1;
      svg.id = "atlas-graph-" + generatedId;
    }
    svg.classList.add("atlas-graph__svg");
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight + - 0 Home");

    function listen(target, type, handler, listenerOptions) {
      target.addEventListener(type, handler, listenerOptions);
      listeners.push(function () { target.removeEventListener(type, handler, listenerOptions); });
    }

    function updateScaleOutput() {
      if (toolbar.output) toolbar.output.textContent = Math.round(transform.scale * 100) + "%";
    }

    function applyTransform() {
      if (viewport) {
        viewport.setAttribute(
          "transform",
          "translate(" + transform.x.toFixed(2) + " " + transform.y.toFixed(2) + ") " +
          "scale(" + transform.scale.toFixed(3) + ")"
        );
      }
      updateScaleOutput();
    }

    function zoomAt(factor, anchor) {
      const nextScale = Math.max(0.5, Math.min(4, transform.scale * factor));
      const ratio = nextScale / transform.scale;
      const center = anchor || { x: layout.width / 2, y: layout.height / 2 };
      transform = {
        x: center.x - (center.x - transform.x) * ratio,
        y: center.y - (center.y - transform.y) * ratio,
        scale: nextScale,
      };
      applyTransform();
    }

    function resetView() {
      transform = { x: 0, y: 0, scale: 1 };
      applyTransform();
    }

    function panBy(dx, dy) {
      transform = {
        x: transform.x + core.boundedNumber(dx, "Сдвиг x", -10000, 10000),
        y: transform.y + core.boundedNumber(dy, "Сдвиг y", -10000, 10000),
        scale: transform.scale,
      };
      applyTransform();
    }

    const toolbar = toolbarFor(svg, {
      zoomOut: function () { zoomAt(0.8); },
      zoomIn: function () { zoomAt(1.25); },
      reset: resetView,
    });

    function classFor(kind, item) {
      const callback = kind === "node" ? options.nodeClass : options.edgeClass;
      return safeClasses(typeof callback === "function" ? callback(item, graph) : "");
    }

    function renderEdges(parent) {
      const parallel = new Map();
      graph.edges.forEach(function (edge) {
        const key = core.edgeKey(edge.source, edge.target, false);
        if (!parallel.has(key)) parallel.set(key, []);
        parallel.get(key).push(edge);
      });
      graph.edges.forEach(function (edge) {
        const group = drawing.append(parent, "g", {
          class: "atlas-graph__edge " + classFor("edge", edge),
          "data-edge-id": edge.id,
          role: "img",
          "aria-label": typeof options.edgeAriaLabel === "function"
            ? options.edgeAriaLabel(edge, graph)
            : edgeDescription(edge, graph),
        });
        drawing.append(group, "title", {}, edgeDescription(edge, graph));
        const siblings = parallel.get(core.edgeKey(edge.source, edge.target, false));
        const siblingIndex = siblings.indexOf(edge);
        const offset = (siblingIndex - (siblings.length - 1) / 2) * 25;
        const geometry = edgePath(
          layout.positions[edge.source],
          layout.positions[edge.target],
          nodeRadius,
          offset,
          edge.source === edge.target
        );
        drawing.append(group, "path", {
          d: geometry.path,
          class: "atlas-graph__edge-line",
          "marker-end": edge.directed ? "url(#" + svg.id + "-arrow)" : null,
        });
        const label = edge.label || (edge.weight === null ? "" : String(edge.weight));
        if (label) {
          drawing.text(
            group,
            geometry.label.x,
            geometry.label.y - 5,
            label,
            "atlas-graph__edge-label",
            "middle"
          );
        }
      });
    }

    function focusNodeAt(index) {
      if (nodeElements.length === 0) return;
      const normalized = (index + nodeElements.length) % nodeElements.length;
      nodeElements[normalized].focus();
    }

    function renderNodes(parent) {
      nodeElements = [];
      graph.nodes.forEach(function (node, index) {
        const position = layout.positions[node.id];
        const label = typeof options.nodeAriaLabel === "function"
          ? options.nodeAriaLabel(node, graph)
          : "Вершина " + node.label;
        const group = drawing.append(parent, "g", {
          class: "atlas-graph__node " + classFor("node", node),
          "data-node-id": node.id,
          transform: "translate(" + position.x + " " + position.y + ")",
          tabindex: "0",
          role: typeof options.onNodeActivate === "function" ? "button" : "img",
          "aria-label": label,
          "aria-posinset": index + 1,
          "aria-setsize": graph.nodes.length,
        });
        drawing.append(group, "title", {}, label);
        drawing.append(group, "circle", { r: nodeRadius, class: "atlas-graph__node-shape" });
        drawing.text(group, 0, 5, node.label, "atlas-graph__node-label", "middle");
        group.addEventListener("focus", function (event) {
          if (typeof options.onNodeFocus === "function") options.onNodeFocus(node, event);
        });
        group.addEventListener("click", function (event) {
          if (typeof options.onNodeActivate === "function") options.onNodeActivate(node, event);
        });
        group.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (typeof options.onNodeActivate === "function") options.onNodeActivate(node, event);
          } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            focusNodeAt(index + 1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            focusNodeAt(index - 1);
          } else if (event.key === "Escape") {
            svg.focus();
          }
        });
        nodeElements.push(group);
      });
    }

    function render(nextGraph, nextOptions) {
      graph = core.normalizeGraph(nextGraph || graph);
      options = Object.assign({}, options, nextOptions || {});
      layout = computeLayout(graph, options.layout || options);
      svg.setAttribute("viewBox", "0 0 " + layout.width + " " + layout.height);
      drawing.clear(
        svg,
        options.title || graph.label || "Интерактивный граф",
        options.description || "Граф доступен с клавиатуры. Стрелки перемещают вид, плюс и минус меняют масштаб."
      );
      // AtlasLabSvg.clear marks static illustrations as images. A graph has
      // focusable descendants, so keep them exposed to assistive technology.
      svg.setAttribute("role", "group");
      const definitions = drawing.append(svg, "defs", {});
      const marker = drawing.append(definitions, "marker", {
        id: svg.id + "-arrow",
        viewBox: "0 0 10 10",
        refX: "9",
        refY: "5",
        markerWidth: "7",
        markerHeight: "7",
        orient: "auto-start-reverse",
        markerUnits: "strokeWidth",
      });
      drawing.append(marker, "path", { d: "M 0 0 L 10 5 L 0 10 z", class: "atlas-graph__arrow" });
      viewport = drawing.append(svg, "g", { class: "atlas-graph__viewport" });
      renderEdges(drawing.append(viewport, "g", { class: "atlas-graph__edges" }));
      renderNodes(drawing.append(viewport, "g", { class: "atlas-graph__nodes" }));
      if (!nextOptions || nextOptions.preserveView !== true) resetView();
      else applyTransform();
      return controller;
    }

    function svgPoint(clientX, clientY) {
      const rectangle = svg.getBoundingClientRect();
      return {
        x: (clientX - rectangle.left) * layout.width / Math.max(1, rectangle.width),
        y: (clientY - rectangle.top) * layout.height / Math.max(1, rectangle.height),
      };
    }

    function onWheel(event) {
      event.preventDefault();
      zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, svgPoint(event.clientX, event.clientY));
    }

    function onPointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest && event.target.closest(".atlas-graph__node")) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      svg.classList.add("is-panning");
      if (svg.setPointerCapture) svg.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const rectangle = svg.getBoundingClientRect();
      const dx = (event.clientX - pointer.x) * layout.width / Math.max(1, rectangle.width);
      const dy = (event.clientY - pointer.y) * layout.height / Math.max(1, rectangle.height);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      panBy(dx, dy);
    }

    function endPointer(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      pointer = null;
      svg.classList.remove("is-panning");
      if (svg.releasePointerCapture && svg.hasPointerCapture && svg.hasPointerCapture(event.pointerId)) {
        svg.releasePointerCapture(event.pointerId);
      }
    }

    function onKeyDown(event) {
      if (event.target !== svg) return;
      const amount = event.shiftKey ? 72 : 28;
      if (event.key === "ArrowLeft") panBy(amount, 0);
      else if (event.key === "ArrowRight") panBy(-amount, 0);
      else if (event.key === "ArrowUp") panBy(0, amount);
      else if (event.key === "ArrowDown") panBy(0, -amount);
      else if (event.key === "+" || event.key === "=") zoomAt(1.25);
      else if (event.key === "-") zoomAt(0.8);
      else if (event.key === "0" || event.key === "Home") resetView();
      else return;
      event.preventDefault();
    }

    listen(svg, "wheel", onWheel, { passive: false });
    listen(svg, "pointerdown", onPointerDown);
    listen(svg, "pointermove", onPointerMove);
    listen(svg, "pointerup", endPointer);
    listen(svg, "pointercancel", endPointer);
    listen(svg, "keydown", onKeyDown);

    const controller = Object.freeze({
      update: function (nextGraph, nextOptions) { return render(nextGraph, nextOptions); },
      resetView: resetView,
      zoomIn: function () { zoomAt(1.25); },
      zoomOut: function () { zoomAt(0.8); },
      panBy: panBy,
      focusNode: function (rawId) {
        const id = core.normalizeId(rawId, "Вершина");
        const index = graph.nodes.findIndex(function (node) { return node.id === id; });
        if (index < 0) throw new RangeError("Неизвестная вершина: " + id + ".");
        focusNodeAt(index);
      },
      getGraph: function () { return graph; },
      getLayout: function () { return layout; },
      getTransform: function () { return Object.freeze(Object.assign({}, transform)); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        listeners.splice(0).forEach(function (remove) { remove(); });
        toolbar.element.remove();
        if (controllers) controllers.delete(svg);
      },
    });

    render(graph);
    if (controllers) controllers.set(svg, controller);
    return controller;
  }

  return Object.freeze({
    computeLayout: computeLayout,
    mount: mount,
  });
});
