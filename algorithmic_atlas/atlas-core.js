(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AlgorithmicAtlasCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GRAPH_SCHEMA_VERSION = 2;
  const STORAGE_KEY = "algorithmic-atlas-progress";
  const STORAGE_SCHEMA_VERSION = 2;
  const NODE_TYPES = new Set([
    "theory",
    "algorithm",
    "math",
    "interactive",
    "historical",
    "exercise",
  ]);
  const PUBLICATION_STATES = new Set(["published", "planned"]);
  const ACCESS_STATES = new Set([
    "published-unlocked",
    "published-gated",
    "planned",
  ]);
  const ROUTE_SCOPES = new Set(["continents", "nodes"]);
  const ROUTE_KINDS = new Set(["main", "branch"]);
  const FEATURE_DEFINITIONS = [
    { id: "proof", label: "доказательство" },
    { id: "interactive", label: "интерактив" },
    { id: "exercises", label: "упражнения" },
  ];

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function assertString(value, message) {
    assert(typeof value === "string" && value.trim(), message);
  }

  function assertReferenceList(values, knownIds, ownerLabel, field) {
    assert(Array.isArray(values), field + " must be an array: " + ownerLabel);
    const seen = new Set();
    values.forEach(function (id) {
      assertString(id, field + " id is required: " + ownerLabel);
      assert(knownIds.has(id), "unknown " + field + " " + id + " for " + ownerLabel);
      assert(id !== ownerLabel, ownerLabel + " cannot reference itself in " + field);
      assert(!seen.has(id), "duplicate " + field + " " + id + " for " + ownerLabel);
      seen.add(id);
    });
  }

  function assertAcyclic(items, label) {
    const byId = new Map(items.map(function (item) {
      return [item.id, item];
    }));
    const visiting = new Set();
    const visited = new Set();

    function visit(item) {
      if (visited.has(item.id)) {
        return;
      }
      assert(!visiting.has(item.id), label + " cycle at: " + item.id);
      visiting.add(item.id);
      item.prerequisites.forEach(function (id) {
        visit(byId.get(id));
      });
      visiting.delete(item.id);
      visited.add(item.id);
    }

    items.forEach(visit);
  }

  function validateGraph(graph) {
    assert(graph && typeof graph === "object", "atlas graph must be an object");
    assert(graph.schemaVersion === GRAPH_SCHEMA_VERSION,
      "unsupported atlas graph schemaVersion: " + graph.schemaVersion);
    assertString(graph.datasetVersion, "datasetVersion is required");
    assertString(graph.title, "atlas title is required");
    assert(Array.isArray(graph.continents) && graph.continents.length,
      "continents must not be empty");
    assert(Array.isArray(graph.nodes) && graph.nodes.length, "nodes must not be empty");
    assert(Array.isArray(graph.routes) && graph.routes.length, "routes must not be empty");

    const continentIds = new Set();
    const regionOwner = new Map();

    graph.continents.forEach(function (continent) {
      assertString(continent.id, "continent id is required");
      assert(!continentIds.has(continent.id), "duplicate continent id: " + continent.id);
      continentIds.add(continent.id);
    });

    graph.continents.forEach(function (continent) {
      assertString(continent.name, "continent name is required: " + continent.id);
      assertString(continent.description, "continent description is required: " + continent.id);
      assert(PUBLICATION_STATES.has(continent.publication),
        "unknown continent publication: " + continent.id);
      assert(typeof continent.allowFreeExplore === "boolean",
        "allowFreeExplore must be boolean: " + continent.id);
      assertReferenceList(
        continent.prerequisites,
        continentIds,
        continent.id,
        "prerequisite"
      );
      assertReferenceList(continent.related, continentIds, continent.id, "related continent");
      assert(
        continent.worldPosition &&
          Number.isFinite(continent.worldPosition.x) &&
          Number.isFinite(continent.worldPosition.y),
        "continent needs a world position: " + continent.id
      );
      assert(
        continent.worldSize &&
          Number.isFinite(continent.worldSize.width) &&
          continent.worldSize.width > 0 &&
          Number.isFinite(continent.worldSize.height) &&
          continent.worldSize.height > 0,
        "continent needs a positive world size: " + continent.id
      );
      assert(Number.isInteger(continent.shapeVariant) &&
        continent.shapeVariant >= 0 && continent.shapeVariant <= 3,
      "unknown continent shape variant: " + continent.id);
      assert(Array.isArray(continent.regions), "continent regions must be an array");

      continent.regions.forEach(function (region) {
        assertString(region.id, "region id is required: " + continent.id);
        assert(!regionOwner.has(region.id), "duplicate region id: " + region.id);
        assertString(region.name, "region name is required: " + region.id);
        regionOwner.set(region.id, continent.id);
      });

      if (continent.publication === "published") {
        assert(continent.localMap && typeof continent.localMap === "object",
          "published continent needs a local map: " + continent.id);
        assertString(continent.localMap.viewBox,
          "published continent needs a local viewBox: " + continent.id);
        assertString(continent.localMap.landPath,
          "published continent needs a local land path: " + continent.id);
      } else {
        assert(continent.localMap === null,
          "planned continent must not claim a local map: " + continent.id);
      }
    });
    assertAcyclic(graph.continents, "continent prerequisite");

    const nodeIds = new Set();
    graph.nodes.forEach(function (node) {
      assertString(node.id, "node id is required");
      assert(!nodeIds.has(node.id), "duplicate node id: " + node.id);
      nodeIds.add(node.id);
    });

    const pageRoutes = new Set();
    graph.nodes.forEach(function (node) {
      assertString(node.title, "node title is required: " + node.id);
      assertString(node.description, "node description is required: " + node.id);
      assert(continentIds.has(node.continentId), "unknown continent for node: " + node.id);
      assert(regionOwner.has(node.regionId), "unknown region for node: " + node.id);
      assert(regionOwner.get(node.regionId) === node.continentId,
        "region does not belong to node continent: " + node.id);
      assert(NODE_TYPES.has(node.type), "unknown node type for: " + node.id);
      assert(PUBLICATION_STATES.has(node.publication),
        "unknown node publication: " + node.id);
      assert(typeof node.allowFreeExplore === "boolean",
        "allowFreeExplore must be boolean: " + node.id);
      assertReferenceList(node.prerequisites, nodeIds, node.id, "prerequisite");
      assertReferenceList(node.related, nodeIds, node.id, "related node");
      assert(Number.isInteger(node.minutes) && node.minutes > 0,
        "minutes must be positive: " + node.id);
      assert(node.features && typeof node.features === "object",
        "features are required: " + node.id);
      FEATURE_DEFINITIONS.forEach(function (feature) {
        assert(typeof node.features[feature.id] === "boolean",
          "feature " + feature.id + " must be boolean: " + node.id);
      });
      assert(
        node.position &&
          Number.isFinite(node.position.x) &&
          Number.isFinite(node.position.y),
        "node needs a local map position: " + node.id
      );

      const continent = graph.continents.find(function (item) {
        return item.id === node.continentId;
      });
      assert(!(continent.publication === "planned" && node.publication === "published"),
        "planned continent cannot contain a published node: " + node.id);

      if (node.publication === "published") {
        assertString(node.route, "published node route is required: " + node.id);
        assert(!pageRoutes.has(node.route), "duplicate published node route: " + node.route);
        pageRoutes.add(node.route);
      } else {
        assert(node.route === null, "planned node route must be null: " + node.id);
        assert(contentFeatures(node).length === 0,
          "planned node must not claim content features: " + node.id);
      }

      Object.defineProperty(node, "status", {
        configurable: true,
        enumerable: false,
        value: node.publication === "published" ? "available" : "preparing",
      });
    });

    graph.nodes.forEach(function (node) {
      if (node.publication !== "published") {
        return;
      }
      node.prerequisites.forEach(function (prerequisiteId) {
        const prerequisite = graph.nodes.find(function (item) {
          return item.id === prerequisiteId;
        });
        assert(prerequisite.publication === "published",
          "published node depends on planned node: " + node.id);
      });
    });
    assertAcyclic(graph.nodes, "prerequisite");

    validateRoutes(graph, continentIds, nodeIds);
    return graph;
  }

  function validateRoutes(graph, continentIds, nodeIds) {
    const routeIds = new Set();
    const continentMemberships = new Map();
    const nodeMemberships = new Map();

    graph.routes.forEach(function (route) {
      assertString(route.id, "route id is required");
      assert(!routeIds.has(route.id), "duplicate route id: " + route.id);
      routeIds.add(route.id);
      assertString(route.title, "route title is required: " + route.id);
      assert(ROUTE_SCOPES.has(route.scope), "unknown route scope: " + route.id);
      assert(ROUTE_KINDS.has(route.kind), "unknown route kind: " + route.id);
      assert(Array.isArray(route.entries) && route.entries.length,
        "route entries must not be empty: " + route.id);

      if (route.scope === "nodes") {
        assert(continentIds.has(route.continentId),
          "node route needs an existing continent: " + route.id);
      } else {
        assert(route.continentId === undefined,
          "continent route must not declare continentId: " + route.id);
      }

      const positions = new Set();
      const references = new Set();
      route.entries.forEach(function (entry) {
        assert(Number.isInteger(entry.position) && entry.position > 0,
          "route position must be a positive integer: " + route.id);
        assert(!positions.has(entry.position),
          "duplicate route position " + entry.position + " in " + route.id);
        positions.add(entry.position);

        const referenceId = route.scope === "nodes" ? entry.nodeId : entry.continentId;
        const knownIds = route.scope === "nodes" ? nodeIds : continentIds;
        assertString(referenceId, "route entry id is required: " + route.id);
        assert(knownIds.has(referenceId),
          "unknown route entry " + referenceId + " in " + route.id);
        assert(!references.has(referenceId),
          "duplicate route entry " + referenceId + " in " + route.id);
        references.add(referenceId);

        const memberships = route.scope === "nodes" ? nodeMemberships : continentMemberships;
        assert(!memberships.has(referenceId),
          "subject belongs to multiple routes: " + referenceId);
        memberships.set(referenceId, route.id);

        if (route.scope === "nodes") {
          const node = graph.nodes.find(function (item) {
            return item.id === referenceId;
          });
          assert(node.continentId === route.continentId,
            "node route crosses continent boundary: " + referenceId);
        }
      });

      const ordered = route.entries.slice().sort(function (left, right) {
        return left.position - right.position;
      });
      for (let index = 1; index < ordered.length; index += 1) {
        const previousId = route.scope === "nodes"
          ? ordered[index - 1].nodeId
          : ordered[index - 1].continentId;
        const currentId = route.scope === "nodes"
          ? ordered[index].nodeId
          : ordered[index].continentId;
        const subjects = route.scope === "nodes" ? graph.nodes : graph.continents;
        const current = subjects.find(function (subject) {
          return subject.id === currentId;
        });
        assert(current.prerequisites.includes(previousId),
          "route order lacks prerequisite " + previousId + " -> " + currentId);
      }
    });

    graph.continents.forEach(function (continent) {
      assert(continentMemberships.has(continent.id),
        "continent is missing from routes: " + continent.id);
    });
    graph.nodes.forEach(function (node) {
      assert(nodeMemberships.has(node.id), "node is missing from routes: " + node.id);
    });

    const worldMainRoutes = graph.routes.filter(function (route) {
      return route.scope === "continents" && route.kind === "main";
    });
    assert(worldMainRoutes.length === 1,
      "atlas needs exactly one main continent route");

    graph.continents.forEach(function (continent) {
      const hasNodes = graph.nodes.some(function (node) {
        return node.continentId === continent.id;
      });
      if (!hasNodes) {
        return;
      }
      const mainNodeRoutes = graph.routes.filter(function (route) {
        return route.scope === "nodes" &&
          route.kind === "main" &&
          route.continentId === continent.id;
      });
      assert(mainNodeRoutes.length === 1,
        "continent with nodes needs exactly one main route: " + continent.id);
    });
  }

  function continentMap(graph) {
    return new Map(graph.continents.map(function (continent) {
      return [continent.id, continent];
    }));
  }

  function nodeMap(graph) {
    return new Map(graph.nodes.map(function (node) {
      return [node.id, node];
    }));
  }

  function routeMap(graph) {
    return new Map(graph.routes.map(function (route) {
      return [route.id, route];
    }));
  }

  function routeOrder(graph, routeId) {
    const route = routeMap(graph).get(routeId);
    if (!route) {
      return [];
    }
    const subjects = route.scope === "nodes" ? nodeMap(graph) : continentMap(graph);
    return route.entries
      .slice()
      .sort(function (left, right) {
        return left.position - right.position;
      })
      .map(function (entry) {
        return subjects.get(route.scope === "nodes" ? entry.nodeId : entry.continentId);
      });
  }

  function routeForNode(graph, nodeId) {
    return graph.routes.find(function (route) {
      return route.scope === "nodes" && route.entries.some(function (entry) {
        return entry.nodeId === nodeId;
      });
    }) || null;
  }

  function routeForContinent(graph, continentId) {
    return graph.routes.find(function (route) {
      return route.scope === "continents" && route.entries.some(function (entry) {
        return entry.continentId === continentId;
      });
    }) || null;
  }

  function mainRoute(graph, scope, continentId) {
    return graph.routes.find(function (route) {
      if (route.scope !== scope || route.kind !== "main") {
        return false;
      }
      return scope !== "nodes" || route.continentId === continentId;
    }) || null;
  }

  function routeRank(graph, nodeId) {
    const route = routeForNode(graph, nodeId);
    if (!route) {
      return "~~~~/" + nodeId;
    }
    const entry = route.entries.find(function (item) {
      return item.nodeId === nodeId;
    });
    return route.id + "/" + String(entry.position).padStart(12, "0") + "/" + nodeId;
  }

  function topologicalOrder(graph) {
    const byId = nodeMap(graph);
    const indegree = new Map();
    const dependents = new Map();

    graph.nodes.forEach(function (node) {
      indegree.set(node.id, node.prerequisites.length);
      dependents.set(node.id, []);
    });
    graph.nodes.forEach(function (node) {
      node.prerequisites.forEach(function (id) {
        dependents.get(id).push(node.id);
      });
    });

    const ready = graph.nodes.filter(function (node) {
      return indegree.get(node.id) === 0;
    });
    const ordered = [];
    function sortReady() {
      ready.sort(function (left, right) {
        return routeRank(graph, left.id).localeCompare(routeRank(graph, right.id));
      });
    }
    sortReady();

    while (ready.length) {
      const node = ready.shift();
      ordered.push(node);
      dependents.get(node.id).forEach(function (dependentId) {
        const nextDegree = indegree.get(dependentId) - 1;
        indegree.set(dependentId, nextDegree);
        if (nextDegree === 0) {
          ready.push(byId.get(dependentId));
        }
      });
      sortReady();
    }

    assert(ordered.length === graph.nodes.length, "prerequisite cycle in node graph");
    return ordered;
  }

  function routeNeighbors(graph, nodeId) {
    const route = routeForNode(graph, nodeId);
    if (!route) {
      return {
        previous: null,
        next: null,
        previousAll: [],
        nextAll: [],
        route: null,
      };
    }
    const ordered = routeOrder(graph, route.id);
    const index = ordered.findIndex(function (node) {
      return node.id === nodeId;
    });
    const byId = nodeMap(graph);
    const node = byId.get(nodeId);

    const routePrevious = index > 0 ? ordered[index - 1] : null;
    const routeNext = index < ordered.length - 1 ? ordered[index + 1] : null;

    const previousAll = node.prerequisites.map(function (id) {
      return byId.get(id);
    }).sort(function (left, right) {
      if (left === routePrevious) {
        return -1;
      }
      if (right === routePrevious) {
        return 1;
      }
      return routeRank(graph, left.id).localeCompare(routeRank(graph, right.id));
    });

    const nextAll = graph.nodes.filter(function (candidate) {
      return candidate.prerequisites.includes(nodeId);
    }).sort(function (left, right) {
      if (left === routeNext) {
        return -1;
      }
      if (right === routeNext) {
        return 1;
      }
      return routeRank(graph, left.id).localeCompare(routeRank(graph, right.id));
    });

    return {
      previous: routePrevious || previousAll[0] || null,
      next: routeNext || nextAll[0] || null,
      previousAll: previousAll,
      nextAll: nextAll,
      route: route,
    };
  }

  function visibleNodes(graph, continentId) {
    return graph.nodes.filter(function (node) {
      return !continentId || node.continentId === continentId;
    });
  }

  function graphEdges(graph, continentId) {
    const prerequisiteEdges = [];
    const relatedEdges = [];
    const relatedKeys = new Set();
    const visibleIds = new Set(visibleNodes(graph, continentId).map(function (node) {
      return node.id;
    }));

    visibleNodes(graph, continentId).forEach(function (node) {
      node.prerequisites.forEach(function (sourceId) {
        if (visibleIds.has(sourceId)) {
          prerequisiteEdges.push({
            sourceId: sourceId,
            targetId: node.id,
            kind: "route",
          });
        }
      });
      node.related.forEach(function (targetId) {
        if (!visibleIds.has(targetId)) {
          return;
        }
        const key = [node.id, targetId].sort().join("::");
        if (!relatedKeys.has(key)) {
          relatedKeys.add(key);
          relatedEdges.push({
            sourceId: node.id,
            targetId: targetId,
            kind: "related",
          });
        }
      });
    });
    return prerequisiteEdges.concat(relatedEdges);
  }

  function continentEdges(graph) {
    const prerequisiteEdges = [];
    const relatedEdges = [];
    const relatedKeys = new Set();
    graph.continents.forEach(function (continent) {
      continent.prerequisites.forEach(function (sourceId) {
        prerequisiteEdges.push({
          sourceId: sourceId,
          targetId: continent.id,
          kind: "route",
        });
      });
      continent.related.forEach(function (targetId) {
        const key = [continent.id, targetId].sort().join("::");
        if (!relatedKeys.has(key)) {
          relatedKeys.add(key);
          relatedEdges.push({
            sourceId: continent.id,
            targetId: targetId,
            kind: "related",
          });
        }
      });
    });
    return prerequisiteEdges.concat(relatedEdges);
  }

  function contentFeatures(node) {
    if (!node || !node.features) {
      return [];
    }
    return FEATURE_DEFINITIONS.filter(function (feature) {
      return node.features[feature.id] === true;
    });
  }

  function continentCompleted(graph, continentId, completedNodeIds) {
    const publishedIds = graph.nodes.filter(function (node) {
      return node.continentId === continentId && node.publication === "published";
    }).map(function (node) {
      return node.id;
    });
    return publishedIds.length > 0 && publishedIds.every(function (id) {
      return completedNodeIds.has(id);
    });
  }

  function continentAccessState(graph, continent, completedNodeIds, freeExplore) {
    if (continent.publication === "planned") {
      return "planned";
    }
    if (continentCompleted(graph, continent.id, completedNodeIds)) {
      return "published-unlocked";
    }
    const prerequisitesComplete = continent.prerequisites.every(function (id) {
      return continentCompleted(graph, id, completedNodeIds);
    });
    if (prerequisitesComplete) {
      return "published-unlocked";
    }
    if (freeExplore && continent.allowFreeExplore) {
      return "published-unlocked";
    }
    return "published-gated";
  }

  function nodeAccessState(graph, node, completedNodeIds, freeExplore) {
    if (node.publication === "planned") {
      return "planned";
    }
    if (completedNodeIds.has(node.id)) {
      return "published-unlocked";
    }
    const continent = continentMap(graph).get(node.continentId);
    const continentState = continentAccessState(
      graph,
      continent,
      completedNodeIds,
      freeExplore
    );
    if (continentState === "planned") {
      return "planned";
    }
    if (freeExplore && continent.allowFreeExplore && node.allowFreeExplore) {
      return "published-unlocked";
    }
    if (continentState === "published-gated") {
      return "published-gated";
    }
    const prerequisitesComplete = node.prerequisites.every(function (id) {
      return completedNodeIds.has(id);
    });
    return prerequisitesComplete ? "published-unlocked" : "published-gated";
  }

  function emptyProgress(graph) {
    return {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      datasetVersion: graph.datasetVersion,
      completedNodeIds: new Set(),
      freeExplore: false,
      migrated: false,
      persistent: false,
      unsupported: false,
    };
  }

  function publishedNodeIds(graph) {
    return new Set(graph.nodes.filter(function (node) {
      return node.publication === "published";
    }).map(function (node) {
      return node.id;
    }));
  }

  function serializableProgress(graph, completedNodeIds, freeExplore) {
    const validIds = publishedNodeIds(graph);
    return {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      datasetVersion: graph.datasetVersion,
      completedNodeIds: Array.from(completedNodeIds).filter(function (id) {
        return validIds.has(id);
      }).sort(),
      freeExplore: freeExplore === true,
    };
  }

  function writeProgress(storage, graph, completedNodeIds, freeExplore) {
    try {
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify(serializableProgress(
          graph,
          completedNodeIds,
          freeExplore
        ))
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  function loadProgress(storage, graph) {
    const result = emptyProgress(graph);
    if (!storage || typeof storage.getItem !== "function") {
      return result;
    }
    result.persistent = true;

    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (error) {
      result.persistent = false;
      return result;
    }
    if (!raw) {
      return result;
    }

    try {
      const parsed = JSON.parse(raw);
      if (![1, STORAGE_SCHEMA_VERSION].includes(parsed.schemaVersion)) {
        result.unsupported = true;
        return result;
      }
      if (!Array.isArray(parsed.completedNodeIds)) {
        return result;
      }

      const validIds = publishedNodeIds(graph);
      result.completedNodeIds = new Set(parsed.completedNodeIds.filter(function (id) {
        return validIds.has(id);
      }));
      result.freeExplore = parsed.schemaVersion === STORAGE_SCHEMA_VERSION &&
        parsed.freeExplore === true;
      result.migrated = parsed.schemaVersion !== STORAGE_SCHEMA_VERSION ||
        parsed.datasetVersion !== graph.datasetVersion ||
        result.completedNodeIds.size !== parsed.completedNodeIds.length ||
        (parsed.schemaVersion === STORAGE_SCHEMA_VERSION &&
          typeof parsed.freeExplore !== "boolean");

      if (result.migrated) {
        const saved = writeProgress(
          storage,
          graph,
          result.completedNodeIds,
          result.freeExplore
        );
        if (!saved) {
          result.persistent = false;
        }
      }
      return result;
    } catch (error) {
      return result;
    }
  }

  function storedFreeExplore(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) {
        return false;
      }
      const parsed = JSON.parse(raw);
      return parsed.schemaVersion === STORAGE_SCHEMA_VERSION &&
        parsed.freeExplore === true;
    } catch (error) {
      return false;
    }
  }

  function hasUnsupportedStoredSchema(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) {
        return false;
      }
      const parsed = JSON.parse(raw);
      return Number.isInteger(parsed.schemaVersion) &&
        parsed.schemaVersion > STORAGE_SCHEMA_VERSION;
    } catch (error) {
      return false;
    }
  }

  function saveProgress(storage, graph, completedNodeIds, freeExplore) {
    if (!storage || typeof storage.setItem !== "function") {
      return false;
    }
    if (hasUnsupportedStoredSchema(storage)) {
      return false;
    }
    const nextFreeExplore = typeof freeExplore === "boolean"
      ? freeExplore
      : storedFreeExplore(storage);
    return writeProgress(storage, graph, completedNodeIds, nextFreeExplore);
  }

  function progressSummary(graph, completedNodeIds) {
    const published = graph.nodes.filter(function (node) {
      return node.publication === "published";
    });
    const publishedIds = new Set(published.map(function (node) {
      return node.id;
    }));
    const completed = Array.from(completedNodeIds).filter(function (id) {
      return publishedIds.has(id);
    }).length;
    return {
      completed: completed,
      total: published.length,
      percent: published.length ? Math.round(completed * 100 / published.length) : 0,
    };
  }

  return {
    GRAPH_SCHEMA_VERSION: GRAPH_SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    STORAGE_SCHEMA_VERSION: STORAGE_SCHEMA_VERSION,
    NODE_TYPES: NODE_TYPES,
    PUBLICATION_STATES: PUBLICATION_STATES,
    ACCESS_STATES: ACCESS_STATES,
    ROUTE_SCOPES: ROUTE_SCOPES,
    ROUTE_KINDS: ROUTE_KINDS,
    FEATURE_DEFINITIONS: FEATURE_DEFINITIONS,
    validateGraph: validateGraph,
    continentMap: continentMap,
    nodeMap: nodeMap,
    routeMap: routeMap,
    routeOrder: routeOrder,
    routeForNode: routeForNode,
    routeForContinent: routeForContinent,
    mainRoute: mainRoute,
    visibleNodes: visibleNodes,
    graphEdges: graphEdges,
    continentEdges: continentEdges,
    topologicalOrder: topologicalOrder,
    routeNeighbors: routeNeighbors,
    contentFeatures: contentFeatures,
    continentCompleted: continentCompleted,
    continentAccessState: continentAccessState,
    nodeAccessState: nodeAccessState,
    loadProgress: loadProgress,
    saveProgress: saveProgress,
    progressSummary: progressSummary,
  };
});
