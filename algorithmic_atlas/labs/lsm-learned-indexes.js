(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.LsmLearnedIndexesCore;

  runtime.boot("lsm-learned-indexes", function (root) {
    const shell = runtime.createShell(root, {
      title: "От серии записей к окну поиска",
      description: "Один режим считает flush и compaction LSM-tree, второй показывает модель rank, её ошибку и обязательный last-mile search",
    });
    shell.controls.innerHTML =
      '<label>Режим<select data-field="mode"><option value="lsm">LSM-tree</option><option value="learned">Learned index</option></select></label>' +
      '<label class="atlas-lab__field is-wide" data-lsm>Операции<input data-field="operations" type="text" value="10=A,20=B,30=C,10=A2,40=D,20=DEL,50=E,60=F"></label>' +
      '<label data-lsm>Compaction<select data-field="policy"><option value="leveled">leveled</option><option value="tiered">tiered</option></select></label>' +
      '<label data-lsm>Memtable<input data-field="memtable" type="number" min="2" max="6" value="3"></label>' +
      '<label data-lsm>Runs/level<input data-field="run-limit" type="number" min="2" max="4" value="2"></label>' +
      '<label data-lsm>Ключ чтения<input data-field="lookup" type="number" value="20"></label>' +
      '<label class="atlas-lab__field is-wide" data-learned hidden>Отсортированные ключи<input data-field="keys" type="text" value="2,5,9,14,20,27,35,44,54,65"></label>' +
      '<label data-learned hidden>Ключ запроса<input data-field="query" type="number" value="44"></label>';

    const mode = shell.controls.querySelector('[data-field="mode"]');
    const operations = shell.controls.querySelector('[data-field="operations"]');
    const policy = shell.controls.querySelector('[data-field="policy"]');
    const memtable = shell.controls.querySelector('[data-field="memtable"]');
    const runLimit = shell.controls.querySelector('[data-field="run-limit"]');
    const lookup = shell.controls.querySelector('[data-field="lookup"]');
    const keys = shell.controls.querySelector('[data-field="keys"]');
    const query = shell.controls.querySelector('[data-field="query"]');
    const figure = runtime.createFigure(shell.workspace, {
      id: "lsm-learned-indexes-visual",
      title: "LSM-tree и learned index",
      viewBox: "0 0 920 520",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Точное состояние</h4><p data-message></p><dl class="atlas-lab__metrics" data-metrics></dl><p data-detail></p>';
    shell.workspace.appendChild(panel);

    function cell(svg, x, y, width, height, text, active) {
      drawing.append(svg, "rect", {
        x: x,
        y: y,
        width: width,
        height: height,
        rx: 5,
        class: "structure-cell" + (active ? " is-active" : ""),
      });
      drawing.text(svg, x + width / 2, y + height / 2 + 5, text, active ? "is-strong" : "", "middle");
    }

    function recordLabel(record) {
      return record.key + "=" + (record.deleted ? "×" : record.value);
    }

    function renderRun(svg, run, x, y, active) {
      const width = Math.max(116, Math.min(240, run.records.length * 56));
      drawing.append(svg, "rect", {
        x: x,
        y: y,
        width: width,
        height: 58,
        rx: 8,
        class: "structure-cell" + (active ? " is-active" : ""),
      });
      drawing.text(svg, x + 8, y + 18, run.id, "is-muted");
      const shown = run.records.slice(0, 4);
      drawing.text(svg, x + 8, y + 42, shown.map(recordLabel).join(" · ") +
        (run.records.length > shown.length ? " · …" : ""), "is-strong");
      return width;
    }

    function metricsHtml(items) {
      return items.map(function (item) {
        return "<div><dt>" + item[0] + "</dt><dd>" + item[1] + "</dd></div>";
      }).join("");
    }

    function finite(value, digits) {
      return Number.isFinite(value) ? value.toFixed(digits || 2) : "∞";
    }

    function renderLsm(frame) {
      const svg = figure.svg;
      drawing.clear(svg, "Состояние LSM-tree", "WAL, memtable, отсортированные серии уровней и текущая операция");
      drawing.text(svg, 34, 42, "WAL", "is-strong");
      frame.wal.slice(-10).forEach(function (record, index) {
        cell(svg, 104 + index * 75, 20, 68, 34, recordLabel(record), frame.activeIds.includes("wal"));
      });
      drawing.text(svg, 34, 117, "memtable", "is-strong");
      if (!frame.memtable.length) drawing.text(svg, 124, 117, "пусто", "is-muted");
      frame.memtable.forEach(function (record, index) {
        cell(svg, 128 + index * 92, 92, 84, 38, recordLabel(record), frame.activeIds.includes("memtable"));
      });
      drawing.append(svg, "line", { x1: 34, y1: 160, x2: 886, y2: 160, class: "tree-edge" });

      [0, 1].forEach(function (level) {
        const y = level === 0 ? 205 : 330;
        drawing.text(svg, 34, y + 34, "L" + level, "is-strong");
        let x = 104;
        if (!frame.levels[level].length) drawing.text(svg, x, y + 34, "нет серий", "is-muted");
        frame.levels[level].forEach(function (run) {
          const width = renderRun(svg, run, x, y, frame.activeIds.includes(run.id));
          x += width + 18;
        });
      });
      const currentLookup = core.lookup(frame, lookup.value);
      drawing.text(svg, 34, 455, "Чтение ключа " + currentLookup.key + ": " +
        (currentLookup.deleted ? "остановлено tombstone" : currentLookup.found
          ? currentLookup.value + " из " + currentLookup.sourceId
          : "нет среди видимых версий"), "is-strong");
      drawing.text(svg, 34, 486, "Проверено источников: " + currentLookup.runsChecked +
        ". Bloom-фильтры могли бы пропускать серии, но не меняют порядок версий", "is-muted");

      panel.querySelector("[data-message]").textContent = frame.message;
      panel.querySelector("[data-metrics]").innerHTML = metricsHtml([
        ["Логические записи", frame.metrics.logicalWrites],
        ["Физические записи", frame.metrics.physicalWrites],
        ["Write amplification", finite(frame.metrics.writeAmplification)],
        ["Space amplification", finite(frame.metrics.spaceAmplification)],
        ["Серии L0 / L1", frame.metrics.l0Runs + " / " + frame.metrics.l1Runs],
        ["Долг compaction", frame.metrics.compactionDebt],
      ]);
      panel.querySelector("[data-detail]").textContent =
        "Числа — модель количества записей, а не измерение байтов или времени конкретной СУБД";
      figure.caption.textContent = "Новая версия ищется от memtable и свежих L0-серий к старшим уровням; compaction удаляет затенённые версии только после слияния";
    }

    function renderLearned(frame) {
      const svg = figure.svg;
      const model = frame.model;
      const result = frame.result;
      const minKey = model.keys[0];
      const maxKey = model.keys[model.keys.length - 1];
      const xFor = function (key) {
        return 75 + (key - minKey) / (maxKey - minKey) * 770;
      };
      const yFor = function (rank) {
        return 430 - rank / Math.max(1, model.keys.length - 1) * 350;
      };
      drawing.clear(svg, "Learned index как модель ранга", "Точки ключей, линейная аппроксимация, ошибка и окно точного поиска");
      drawing.append(svg, "line", { x1: 75, y1: 430, x2: 855, y2: 430, class: "tree-edge" });
      drawing.append(svg, "line", { x1: 75, y1: 430, x2: 75, y2: 65, class: "tree-edge" });
      drawing.text(svg, 855, 462, "ключ", "is-muted", "end");
      drawing.text(svg, 52, 70, "rank", "is-muted", "end");

      if (frame.action !== "points") {
        drawing.append(svg, "line", {
          x1: xFor(minKey),
          y1: yFor(model.slope * minKey + model.intercept),
          x2: xFor(maxKey),
          y2: yFor(model.slope * maxKey + model.intercept),
          class: "structure-copy-arrow",
        });
      }
      model.points.forEach(function (point) {
        drawing.append(svg, "circle", {
          cx: xFor(point.key),
          cy: yFor(point.index),
          r: 7,
          class: "structure-node",
        });
      });

      if (result) {
        const queryX = xFor(Math.max(minKey, Math.min(maxKey, result.key)));
        const top = yFor(result.end);
        const bottom = yFor(result.start);
        drawing.append(svg, "rect", {
          x: 75,
          y: Math.min(top, bottom),
          width: 780,
          height: Math.max(8, Math.abs(bottom - top)),
          class: "structure-cost-bar is-budget",
          opacity: 0.24,
        });
        drawing.append(svg, "line", { x1: queryX, y1: 65, x2: queryX, y2: 430, class: "structure-copy-arrow" });
        drawing.append(svg, "circle", {
          cx: queryX,
          cy: yFor(result.prediction),
          r: 10,
          class: "structure-node is-active",
        });
        drawing.text(svg, queryX + 12, yFor(result.prediction) - 10,
          "p̂=" + finite(result.prediction), "is-strong");
      }
      drawing.text(svg, 75, 500,
        "ε=" + model.epsilon + " · max |rank − p̂|=" + finite(model.maxError) +
        " · модель хранит приближение, массив ключей остаётся источником истины", "is-strong");

      panel.querySelector("[data-message]").textContent = frame.message;
      panel.querySelector("[data-metrics]").innerHTML = metricsHtml([
        ["Ключей", model.keys.length],
        ["Наклон", finite(model.slope, 4)],
        ["Максимальная ошибка", finite(model.maxError)],
        ["Граница ε", model.epsilon],
        ["Окно", result ? "[" + result.start + ", " + result.end + "]" : "ещё не построено"],
        ["Сравнения last mile", result ? result.comparisons : 0],
      ]);
      panel.querySelector("[data-detail]").textContent = result
        ? (result.found ? "Ключ подтверждён точным сравнением в позиции " + result.index : "Модель предложила позицию, но точный поиск отверг ключ")
        : "Линия сама по себе не отвечает на membership-запрос";
      figure.caption.textContent = "Полоса показывает не доверительный интервал, а детерминированную границу ошибки на построенном наборе ключей";
    }

    function render(state) {
      const frame = core.currentFrame(state);
      if (state.mode === "lsm") renderLsm(frame);
      else renderLearned(frame);
    }

    function syncMode() {
      shell.controls.querySelectorAll("[data-lsm]").forEach(function (element) {
        element.hidden = mode.value !== "lsm";
      });
      shell.controls.querySelectorAll("[data-learned]").forEach(function (element) {
        element.hidden = mode.value !== "learned";
      });
    }

    runtime.mount(root, {
      createState: function () {
        return mode.value === "lsm"
          ? core.createState({
            mode: "lsm",
            operations: operations.value,
            policy: policy.value,
            memtableLimit: memtable.value,
            runLimit: runLimit.value,
          })
          : core.createState({ mode: "learned", keys: keys.value, query: query.value });
      },
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 90,
      bind: function (api) {
        mode.addEventListener("change", function () {
          syncMode();
          api.reset();
        });
        shell.controls.addEventListener("change", function (event) {
          if (event.target !== mode) api.reset();
        });
        lookup.addEventListener("input", function () {
          if (mode.value === "lsm") api.reset();
        });
      },
    });
    syncMode();
  });
})();
