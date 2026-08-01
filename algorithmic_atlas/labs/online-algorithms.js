(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.OnlineAlgorithmsCore;

  runtime.boot("online-algorithms", function (root) {
    const shell = runtime.createShell(root, {
      title: "Запрос открыт только сейчас",
      description: "Противник выдаёт страницы по одной; online-кэш действует по видимому префиксу, а offline-эталон Белади знает скрытый хвост",
    });
    shell.controls.innerHTML =
      '<label>Последовательность<select data-field="scenario"><option value="adversary">Противник против кэша</option><option value="locality">Локальность</option><option value="scan">Последовательный проход</option></select></label>' +
      '<label>Online-политика<select data-field="policy"><option value="lru">LRU</option><option value="fifo">FIFO</option></select></label>' +
      '<label>Ёмкость: <output data-output="capacity">3</output><input data-field="capacity" type="range" min="2" max="4" step="1" value="3"></label>' +
      '<label>Запросов: <output data-output="horizon">16</output><input data-field="horizon" type="range" min="6" max="24" step="1" value="16"></label>';
    const fields = {
      scenario: shell.controls.querySelector('[data-field="scenario"]'),
      policy: shell.controls.querySelector('[data-field="policy"]'),
      capacity: shell.controls.querySelector('[data-field="capacity"]'),
      horizon: shell.controls.querySelector('[data-field="horizon"]'),
      capacityOutput: shell.controls.querySelector('[data-output="capacity"]'),
      horizonOutput: shell.controls.querySelector('[data-output="horizon"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics online-algorithms-metrics";
    metrics.innerHTML =
      '<div><dt>Раскрыто</dt><dd data-metric="revealed">0 / 0</dd></div>' +
      '<div><dt>Online-промахи</dt><dd data-metric="online">0</dd></div>' +
      '<div><dt>Offline OPT</dt><dd data-metric="offline">0</dd></div>' +
      '<div><dt>Отношение сейчас</dt><dd data-metric="ratio">1,00</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "online-algorithms-visual",
      title: "Префикс запросов, состояния двух кэшей и накопленная стоимость",
      viewBox: "0 0 1200 760",
      className: "online-algorithms-figure",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel online-algorithms-step";
    panel.innerHTML =
      '<h4>Что увидел online-алгоритм</h4><p data-current></p>' +
      '<h4>Почему сравнение честное</h4><p data-competitive></p>';
    shell.workspace.appendChild(panel);

    function createState() {
      fields.capacityOutput.textContent = fields.capacity.value;
      fields.horizonOutput.textContent = fields.horizon.value;
      return core.createState({
        scenario: fields.scenario.value,
        policy: fields.policy.value,
        capacity: Number(fields.capacity.value),
        horizon: Number(fields.horizon.value),
      });
    }

    function drawRequests(svg, model) {
      drawing.text(svg, 28, 52, "Запросы противника", "is-strong");
      const gap = 5;
      const width = (1140 - gap * (model.sequence.length - 1)) / model.sequence.length;
      model.sequence.forEach(function (request, index) {
        const revealed = index < model.frame.revealed.length;
        const current = index === model.frame.revealed.length - 1;
        const x = 30 + index * (width + gap);
        drawing.append(svg, "rect", {
          x: x, y: 72, width: width, height: 48, rx: 4,
          class: "online-request" + (revealed ? " is-revealed" : " is-hidden") + (current ? " is-current" : ""),
        });
        drawing.text(svg, x + width / 2, 102, revealed ? request : "?", "online-request-label", "middle");
      });
      drawing.text(svg, 30, 142, "Будущий хвост скрыт от online-политики; OPT использует его только как сравнительный эталон", "is-muted");
    }

    function drawCache(svg, title, y, frame, capacity, className) {
      drawing.text(svg, 30, y - 20, title, "is-strong");
      for (let slot = 0; slot < capacity; slot += 1) {
        const x = 245 + slot * 150;
        const page = frame.cache[slot];
        drawing.append(svg, "rect", { x: x, y: y - 52, width: 118, height: 62, rx: 6, class: "online-cache-slot " + className });
        drawing.text(svg, x + 59, y - 14, page === undefined ? "—" : page, "online-cache-label", "middle");
      }
      const verdict = frame.hit === null ? "ожидание" : frame.hit ? "попадание" : "промах";
      drawing.text(svg, 880, y - 20, verdict + (frame.evicted === null ? "" : " · вытеснена " + frame.evicted), frame.hit ? "is-good" : frame.hit === false ? "is-bad" : "is-muted");
    }

    function drawCostChart(svg, model) {
      const left = 70; const right = 1140; const top = 470; const bottom = 700;
      drawing.text(svg, 30, 440, "Накопленные промахи на раскрытом префиксе", "is-strong");
      drawing.append(svg, "line", { x1: left, y1: bottom, x2: right, y2: bottom, class: "atlas-lab__axis" });
      drawing.append(svg, "line", { x1: left, y1: top, x2: left, y2: bottom, class: "atlas-lab__axis" });
      const maximum = Math.max(1, model.frame.online.misses, model.frame.offline.misses);
      const count = Math.max(1, model.sequence.length - 1);
      function points(history) {
        return history.map(function (value, index) {
          return { x: left + index / count * (right - left), y: bottom - value / maximum * (bottom - top) };
        });
      }
      const onlinePoints = points(model.onlineHistory);
      const offlinePoints = points(model.offlineHistory);
      if (onlinePoints.length) drawing.append(svg, "path", { d: drawing.pathFromPoints(onlinePoints, function (point) { return point.x; }, function (point) { return point.y; }), class: "online-cost-line is-online" });
      if (offlinePoints.length) drawing.append(svg, "path", { d: drawing.pathFromPoints(offlinePoints, function (point) { return point.x; }, function (point) { return point.y; }), class: "online-cost-line is-offline" });
      drawing.text(svg, right - 230, top + 24, "online", "online-legend is-online");
      drawing.text(svg, right - 115, top + 24, "offline", "online-legend is-offline");
      drawing.text(svg, left - 12, top + 4, maximum, "is-muted", "end");
      drawing.text(svg, left - 12, bottom + 4, 0, "is-muted", "end");
    }

    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Online и offline обработка запросов", "Последовательность раскрывается слева направо, два кэша меняются синхронно, график показывает накопленные промахи");
      drawRequests(svg, model);
      drawCache(svg, "Online · " + model.options.policy.toUpperCase(), 250, model.frame.online, model.options.capacity, "is-online");
      drawCache(svg, "Offline · Belady", 370, model.frame.offline, model.options.capacity, "is-offline");
      drawCostChart(svg, model);

      metrics.querySelector('[data-metric="revealed"]').textContent = model.frame.revealed.length + " / " + model.sequence.length;
      metrics.querySelector('[data-metric="online"]').textContent = String(model.frame.online.misses);
      metrics.querySelector('[data-metric="offline"]').textContent = String(model.frame.offline.misses);
      metrics.querySelector('[data-metric="ratio"]').textContent = model.ratio.toFixed(2).replace(".", ",");
      panel.querySelector("[data-current]").textContent = model.frame.request === null
        ? "Первый запрос неизвестен. Нажмите «Один шаг» и примите, что политика не может заглянуть вправо."
        : "Раскрыта страница " + model.frame.request + ". " + model.frame.message +
          (model.frame.online.evicted === null ? "." : "; вытеснена страница " + model.frame.online.evicted + ".");
      panel.querySelector("[data-competitive]").textContent =
        "На этом префиксе online заплатил " + model.frame.online.misses +
        ", а оптимальный offline — " + model.frame.offline.misses +
        ". Отношение на одном префиксе иллюстрирует цену незнания, но competitive ratio доказывается для всех последовательностей с допустимой добавочной константой.";
      figure.caption.textContent = model.options.scenario === "adversary"
        ? "Учебный противник выбирает страницу вне текущего online-кэша; offline затем переигрывает уже построенную последовательность целиком"
        : "Одинаковая последовательность подаётся обеим политикам, но только offline-эталон знает будущие запросы";
    }

    const mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 30,
      bind: function (api) {
        [fields.scenario, fields.policy].forEach(function (field) { field.addEventListener("change", api.reset); });
        [fields.capacity, fields.horizon].forEach(function (field) {
          field.addEventListener("input", function () {
            fields.capacityOutput.textContent = fields.capacity.value;
            fields.horizonOutput.textContent = fields.horizon.value;
            api.reset();
          });
        });
      },
    });
    mounted.reset();
  });
})();
