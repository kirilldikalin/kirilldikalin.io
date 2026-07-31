(function (root, factory) {
  "use strict";

  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LsmLearnedIndexesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_OPERATIONS = 18;
  const MAX_KEYS = 28;
  const TOMBSTONE = "__atlas_tombstone__";

  function parseOperations(rawValue) {
    const source = Array.isArray(rawValue)
      ? rawValue
      : String(rawValue === undefined
        ? "10=A,20=B,30=C,10=A2,40=D,20=DEL,50=E,60=F"
        : rawValue).split(/[\n,;]+/u);
    const tokens = source.map(function (item) {
      return typeof item === "object" && item !== null ? item : String(item).trim();
    }).filter(function (item) { return typeof item === "object" || item.length > 0; });
    if (!tokens.length || tokens.length > MAX_OPERATIONS) {
      throw new RangeError("нужно от 1 до " + MAX_OPERATIONS + " операций");
    }
    return Object.freeze(tokens.map(function (token, index) {
      if (typeof token === "object") {
        const key = shared.boundedInteger(token.key, "Ключ", -9999, 9999);
        const deleted = token.deleted === true || token.value === null;
        const value = deleted ? TOMBSTONE : String(token.value || "").trim();
        if (!deleted && !/^[\p{L}\p{N}_.-]{1,16}$/u.test(value)) {
          throw new Error("значение операции " + (index + 1) + " имеет недопустимый формат");
        }
        return Object.freeze({ key: key, value: value, deleted: deleted, sequence: index + 1 });
      }
      const match = /^(-?\d+)\s*[:=]\s*([\p{L}\p{N}_.-]+|×)$/u.exec(token);
      if (!match) {
        throw new Error("операция " + (index + 1) + " записывается как ключ=значение или ключ=DEL");
      }
      const key = shared.boundedInteger(match[1], "Ключ", -9999, 9999);
      const marker = match[2];
      const deleted = /^(?:DEL|DELETE|TOMBSTONE|×)$/iu.test(marker);
      if (!deleted && Array.from(marker).length > 16) {
        throw new RangeError("значение операции " + (index + 1) + " длиннее 16 символов");
      }
      return Object.freeze({
        key: key,
        value: deleted ? TOMBSTONE : marker,
        deleted: deleted,
        sequence: index + 1,
      });
    }));
  }

  function cloneRecord(record) {
    return {
      key: record.key,
      value: record.value,
      deleted: record.deleted,
      sequence: record.sequence,
    };
  }

  function cloneRun(run) {
    return {
      id: run.id,
      level: run.level,
      records: run.records.map(cloneRecord),
    };
  }

  function sortRecords(records) {
    return records.slice().sort(function (left, right) {
      return left.key - right.key || right.sequence - left.sequence;
    });
  }

  function newestRecords(records) {
    const byKey = new Map();
    records.forEach(function (record) {
      const current = byKey.get(record.key);
      if (!current || record.sequence > current.sequence) {
        byKey.set(record.key, cloneRecord(record));
      }
    });
    return sortRecords(Array.from(byKey.values()));
  }

  function mergeRuns(runs, level, id) {
    const records = newestRecords(runs.flatMap(function (run) { return run.records; }));
    return { id: id, level: level, records: records };
  }

  function currentRecords(machine) {
    return machine.memtable.concat(
      machine.levels[0].flatMap(function (run) { return run.records; }),
      machine.levels[1].flatMap(function (run) { return run.records; })
    );
  }

  function liveRecords(machine) {
    return newestRecords(currentRecords(machine)).filter(function (record) {
      return !record.deleted;
    });
  }

  function physicalEntryCount(machine) {
    return currentRecords(machine).length;
  }

  function metrics(machine) {
    const logical = machine.logicalWrites;
    const live = liveRecords(machine).length;
    const physical = physicalEntryCount(machine);
    return {
      logicalWrites: logical,
      physicalWrites: machine.physicalWrites,
      writeAmplification: logical ? machine.physicalWrites / logical : 0,
      liveEntries: live,
      physicalEntries: physical,
      spaceAmplification: live ? physical / live : physical ? Infinity : 1,
      l0Runs: machine.levels[0].length,
      l1Runs: machine.levels[1].length,
      compactionDebt: Math.max(0, machine.levels[0].length - machine.runLimit + 1),
    };
  }

  function snapshot(machine, action, message, activeIds) {
    return shared.deepFreeze({
      action: action,
      message: message,
      processed: machine.processed,
      totalOperations: machine.operations.length,
      wal: machine.wal.map(cloneRecord),
      memtable: sortRecords(machine.memtable.map(cloneRecord)),
      levels: [
        machine.levels[0].map(cloneRun),
        machine.levels[1].map(cloneRun),
      ],
      metrics: metrics(machine),
      activeIds: (activeIds || []).slice(),
      policy: machine.policy,
    });
  }

  function compact(machine, sourceLevel) {
    const source = machine.levels[sourceLevel];
    if (source.length < machine.runLimit) return null;
    const nextLevel = sourceLevel + 1;
    if (nextLevel >= machine.levels.length) return null;
    const participants = source.splice(0, source.length);
    if (machine.policy === "leveled") {
      participants.push.apply(participants, machine.levels[nextLevel].splice(
        0,
        machine.levels[nextLevel].length
      ));
    }
    const run = mergeRuns(participants, nextLevel, "L" + nextLevel + "-" + machine.nextRunId);
    machine.nextRunId += 1;
    machine.levels[nextLevel].push(run);
    machine.physicalWrites += run.records.length;
    return {
      run: run,
      inputIds: participants.map(function (item) { return item.id; }),
      written: run.records.length,
    };
  }

  function buildLsmFrames(options) {
    const settings = options || {};
    const operations = parseOperations(settings.operations);
    const memtableLimit = shared.boundedInteger(
      settings.memtableLimit === undefined ? 3 : settings.memtableLimit,
      "Размер memtable",
      2,
      6
    );
    const runLimit = shared.boundedInteger(
      settings.runLimit === undefined ? 2 : settings.runLimit,
      "Порог compaction",
      2,
      4
    );
    const policy = settings.policy === undefined ? "leveled" : String(settings.policy);
    if (policy !== "leveled" && policy !== "tiered") {
      throw new Error("неизвестная политика compaction");
    }
    const machine = {
      operations: operations,
      memtable: [],
      wal: [],
      levels: [[], []],
      memtableLimit: memtableLimit,
      runLimit: runLimit,
      policy: policy,
      processed: 0,
      logicalWrites: 0,
      physicalWrites: 0,
      nextRunId: 1,
    };
    const frames = [snapshot(
      machine,
      "start",
      "WAL и memtable пусты; на диске нет отсортированных серий"
    )];

    operations.forEach(function (operation) {
      machine.processed += 1;
      machine.logicalWrites += 1;
      machine.physicalWrites += 1;
      machine.wal.push(operation);
      const previousIndex = machine.memtable.findIndex(function (record) {
        return record.key === operation.key;
      });
      if (previousIndex >= 0) machine.memtable.splice(previousIndex, 1);
      machine.memtable.push(operation);
      frames.push(snapshot(
        machine,
        operation.deleted ? "tombstone" : "write",
        operation.deleted
          ? "Tombstone ключа " + operation.key + " записан в WAL и memtable"
          : "Запись " + operation.key + "=" + operation.value + " сначала попала в WAL и memtable",
        ["wal", "memtable"]
      ));

      if (machine.memtable.length >= memtableLimit) {
        const run = {
          id: "L0-" + machine.nextRunId,
          level: 0,
          records: sortRecords(machine.memtable.map(cloneRecord)),
        };
        machine.nextRunId += 1;
        machine.levels[0].push(run);
        machine.physicalWrites += run.records.length;
        machine.memtable = [];
        frames.push(snapshot(
          machine,
          "flush",
          "Immutable memtable отсортирована и записана как серия " + run.id,
          [run.id]
        ));

        const compaction = compact(machine, 0);
        if (compaction) {
          frames.push(snapshot(
            machine,
            "compaction",
            (policy === "leveled" ? "Leveled" : "Tiered") +
              " compaction слила " + compaction.inputIds.join(", ") +
              " в " + compaction.run.id + "; переписано записей: " + compaction.written,
            [compaction.run.id]
          ));
        }
      }
    });
    frames.push(snapshot(
      machine,
      "done",
      "Все операции применены; старые версии остаются в сериях до compaction",
      []
    ));
    return Object.freeze(frames);
  }

  function lookup(frame, rawKey) {
    const key = shared.boundedInteger(rawKey, "Ключ запроса", -9999, 9999);
    const runs = [];
    if (frame.memtable.length) {
      runs.push({ id: "memtable", records: frame.memtable });
    }
    frame.levels[0].slice().reverse().forEach(function (run) { runs.push(run); });
    frame.levels[1].slice().reverse().forEach(function (run) { runs.push(run); });
    for (let index = 0; index < runs.length; index += 1) {
      const record = runs[index].records.find(function (item) { return item.key === key; });
      if (record) {
        return shared.deepFreeze({
          key: key,
          found: !record.deleted,
          deleted: record.deleted,
          value: record.deleted ? null : record.value,
          sourceId: runs[index].id,
          runsChecked: index + 1,
        });
      }
    }
    return shared.deepFreeze({
      key: key,
      found: false,
      deleted: false,
      value: null,
      sourceId: null,
      runsChecked: runs.length,
    });
  }

  function parseKeys(rawValue) {
    const parts = Array.isArray(rawValue)
      ? rawValue
      : String(rawValue === undefined
        ? "2,5,9,14,20,27,35,44,54,65"
        : rawValue).trim().split(/[\s,;]+/u).filter(Boolean);
    if (parts.length < 4 || parts.length > MAX_KEYS) {
      throw new RangeError("нужно от 4 до " + MAX_KEYS + " ключей");
    }
    const values = parts.map(function (part) {
      return shared.boundedInteger(part, "Ключ", -1000000, 1000000);
    }).sort(function (left, right) { return left - right; });
    if (new Set(values).size !== values.length) {
      throw new Error("ключи learned index должны быть уникальны");
    }
    return Object.freeze(values);
  }

  function learnedModel(rawKeys) {
    const keys = parseKeys(rawKeys);
    const minimum = keys[0];
    const maximum = keys[keys.length - 1];
    const slope = (keys.length - 1) / (maximum - minimum);
    const intercept = -minimum * slope;
    const points = keys.map(function (key, index) {
      const prediction = slope * key + intercept;
      return {
        key: key,
        index: index,
        prediction: prediction,
        error: Math.abs(index - prediction),
      };
    });
    const maxError = points.reduce(function (maximumError, point) {
      return Math.max(maximumError, point.error);
    }, 0);
    return shared.deepFreeze({
      keys: keys,
      slope: slope,
      intercept: intercept,
      epsilon: Math.ceil(maxError - 1e-12),
      maxError: maxError,
      points: points,
    });
  }

  function predictedPosition(model, key) {
    return shared.clamp(
      model.slope * key + model.intercept,
      0,
      model.keys.length - 1
    );
  }

  function learnedLookup(model, rawKey) {
    const key = shared.boundedInteger(rawKey, "Ключ запроса", -1000000, 1000000);
    const prediction = predictedPosition(model, key);
    const start = Math.max(0, Math.floor(prediction - model.epsilon));
    const end = Math.min(model.keys.length - 1, Math.ceil(prediction + model.epsilon));
    let left = start;
    let right = end;
    let comparisons = 0;
    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      comparisons += 1;
      if (model.keys[middle] === key) {
        return shared.deepFreeze({
          key: key,
          found: true,
          index: middle,
          prediction: prediction,
          start: start,
          end: end,
          comparisons: comparisons,
        });
      }
      if (model.keys[middle] < key) left = middle + 1;
      else right = middle - 1;
    }
    return shared.deepFreeze({
      key: key,
      found: false,
      index: left,
      prediction: prediction,
      start: start,
      end: end,
      comparisons: comparisons,
    });
  }

  function learnedFrames(rawKeys, rawQuery) {
    const model = learnedModel(rawKeys);
    const result = learnedLookup(model, rawQuery);
    return Object.freeze([
      shared.deepFreeze({ action: "points", message: "Ключи превращены в точки (ключ, rank)", model: model, result: null }),
      shared.deepFreeze({ action: "fit", message: "Линейная модель аппроксимирует эмпирическую CDF", model: model, result: null }),
      shared.deepFreeze({ action: "window", message: "Граница ошибки ε задаёт гарантированное окно последующего поиска", model: model, result: result }),
      shared.deepFreeze({ action: "search", message: result.found
        ? "Точный поиск внутри окна нашёл ключ в позиции " + result.index
        : "Окно проверено: ключ отсутствует, позиция вставки " + result.index,
      model: model, result: result }),
    ]);
  }

  function createState(options) {
    const settings = options || {};
    const mode = settings.mode === undefined ? "lsm" : String(settings.mode);
    let frames;
    if (mode === "lsm") frames = buildLsmFrames(settings);
    else if (mode === "learned") frames = learnedFrames(settings.keys, settings.query);
    else throw new Error("неизвестный режим лаборатории");
    return shared.deepFreeze({ mode: mode, frames: frames, frameIndex: 0 });
  }

  function step(state) {
    return shared.deepFreeze({
      mode: state.mode,
      frames: state.frames,
      frameIndex: Math.min(state.frames.length - 1, state.frameIndex + 1),
    });
  }

  function isFinished(state) {
    return state.frameIndex >= state.frames.length - 1;
  }

  function currentFrame(state) {
    return state.frames[state.frameIndex];
  }

  return {
    MAX_OPERATIONS: MAX_OPERATIONS,
    MAX_KEYS: MAX_KEYS,
    TOMBSTONE: TOMBSTONE,
    parseOperations: parseOperations,
    newestRecords: newestRecords,
    mergeRuns: mergeRuns,
    buildLsmFrames: buildLsmFrames,
    lookup: lookup,
    parseKeys: parseKeys,
    learnedModel: learnedModel,
    predictedPosition: predictedPosition,
    learnedLookup: learnedLookup,
    learnedFrames: learnedFrames,
    createState: createState,
    step: step,
    isFinished: isFinished,
    currentFrame: currentFrame,
  };
});
