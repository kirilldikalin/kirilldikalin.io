(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.MultiplicativeWeightsCore;

  runtime.boot("multiplicative-weights", function (root) {
    const shell = runtime.createShell(root, {
      title: "Как проигрыш перераспределяет доверие",
      description: "Каждый раунд сначала смешивает советы по текущим вероятностям, затем экспоненциально уменьшает веса ошибившихся экспертов",
    });
    shell.controls.innerHTML =
      '<label>Сценарий<select data-field="scenario"><option value="leader">Один устойчивый лидер</option><option value="switch">Смена режима</option><option value="rotating">Победитель меняется</option><option value="shocks">Редкие шоки</option></select></label>' +
      '<label>Скорость реакции η: <output data-output="eta">0,45</output><input data-field="eta" type="range" min="0.05" max="1.5" step="0.05" value="0.45"></label>' +
      '<label>Раундов: <output data-output="rounds">20</output><input data-field="rounds" type="range" min="6" max="40" step="1" value="20"></label>';

    const fields = {
      scenario: shell.controls.querySelector('[data-field="scenario"]'),
      eta: shell.controls.querySelector('[data-field="eta"]'),
      rounds: shell.controls.querySelector('[data-field="rounds"]'),
      etaOutput: shell.controls.querySelector('[data-output="eta"]'),
      roundsOutput: shell.controls.querySelector('[data-output="rounds"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics multiplicative-weights-metrics";
    metrics.innerHTML =
      '<div><dt>Раунд</dt><dd data-metric="round">0 / 20</dd></div>' +
      '<div><dt>Ожидаемый проигрыш</dt><dd data-metric="round-loss">0,000</dd></div>' +
      '<div><dt>Накопленный проигрыш</dt><dd data-metric="algorithm-loss">0,000</dd></div>' +
      '<div><dt>Regret / граница</dt><dd data-metric="regret">0,000 / 0,000</dd></div>' +
      '<div><dt>Потенциал Φ</dt><dd data-metric="potential">4,000</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "multiplicative-weights-visual",
      title: "Веса экспертов, распределение выбора и накопленный regret",
      viewBox: "0 0 1200 840",
      className: "multiplicative-weights-figure",
    });

    const tablePanel = document.createElement("section");
    tablePanel.className = "atlas-lab__panel multiplicative-weights-table-panel";
    tablePanel.innerHTML = '<h4>Точный переход текущего раунда</h4><div data-expert-table class="multiplicative-weights-table-wrap"></div>';
    shell.workspace.appendChild(tablePanel);

    const explanation = document.createElement("section");
    explanation.className = "atlas-lab__panel multiplicative-weights-explanation";
    explanation.innerHTML =
      '<h4>Что произошло</h4><p data-current></p>' +
      '<h4>Что гарантирует потенциал</h4><p data-proof></p>';
    shell.workspace.appendChild(explanation);

    function format(value, digits) {
      return Number(value).toFixed(digits === undefined ? 3 : digits).replace(".", ",");
    }

    function syncOutputs() {
      fields.etaOutput.textContent = format(Number(fields.eta.value), 2);
      fields.roundsOutput.textContent = fields.rounds.value;
    }

    function options() {
      return {
        scenario: fields.scenario.value,
        eta: Number(fields.eta.value),
        rounds: Number(fields.rounds.value),
      };
    }

    function drawExperts(svg, model) {
      const frame = model.frame;
      const maximumWeight = Math.max.apply(null, frame.weights.concat([1e-12]));
      drawing.text(svg, 34, 42, "Доверие после обновления", "mw-section-title");
      model.experts.forEach(function (expert, index) {
        const x = 58 + index * 284;
        const normalizedHeight = frame.weights[index] / maximumWeight;
        const probability = frame.nextProbabilities[index];
        const loss = frame.losses ? frame.losses[index] : 0;
        drawing.append(svg, "rect", { x: x, y: 78, width: 242, height: 244, rx: 8, class: "mw-expert-card" });
        drawing.append(svg, "rect", {
          x: x + 24,
          y: 280 - 152 * normalizedHeight,
          width: 62,
          height: 152 * normalizedHeight,
          rx: 3,
          class: "mw-weight-bar mw-expert-" + index,
        });
        drawing.append(svg, "circle", {
          cx: x + 158,
          cy: 205,
          r: 22 + 54 * Math.sqrt(probability),
          class: "mw-probability mw-expert-" + index,
        });
        drawing.text(svg, x + 121, 108, expert.label, "mw-expert-label", "middle");
        drawing.text(svg, x + 55, 302, "w=" + format(frame.weights[index], 3), "mw-value", "middle");
        drawing.text(svg, x + 158, 210, format(probability * 100, 1) + "%", "mw-probability-label", "middle");
        drawing.text(svg, x + 121, 338, "ℓ=" + (frame.losses ? format(loss, 2) : "—") + " · L=" + format(frame.cumulativeExpertLosses[index], 2), "mw-loss-label", "middle");
      });
      drawing.text(svg, 38, 368, "Высота столбца — абсолютный вес, площадь круга — вероятность выбора в следующем раунде", "is-muted");
    }

    function scaledPoints(history, key, left, right, top, bottom, maxY, horizon) {
      return history.map(function (entry) {
        return {
          x: left + entry.round / Math.max(1, horizon) * (right - left),
          y: bottom - entry[key] / Math.max(1e-9, maxY) * (bottom - top),
        };
      });
    }

    function drawHistory(svg, model) {
      const left = 76;
      const right = 1140;
      const top = 435;
      const bottom = 680;
      const history = model.history;
      const maxY = Math.max(1, ...history.map(function (entry) { return Math.max(entry.algorithmLoss, entry.bestLoss, entry.regret); }));
      drawing.text(svg, 34, 410, "Накопленный проигрыш и regret", "mw-section-title");
      drawing.append(svg, "line", { x1: left, y1: bottom, x2: right, y2: bottom, class: "atlas-lab__axis" });
      drawing.append(svg, "line", { x1: left, y1: top, x2: left, y2: bottom, class: "atlas-lab__axis" });
      const algorithm = scaledPoints(history, "algorithmLoss", left, right, top, bottom, maxY, model.options.rounds);
      const best = scaledPoints(history, "bestLoss", left, right, top, bottom, maxY, model.options.rounds);
      const regret = scaledPoints(history, "regret", left, right, top, bottom, maxY, model.options.rounds);
      if (algorithm.length > 1) drawing.append(svg, "path", { d: drawing.pathFromPoints(algorithm, function (p) { return p.x; }, function (p) { return p.y; }), class: "mw-history-line is-algorithm" });
      if (best.length > 1) drawing.append(svg, "path", { d: drawing.pathFromPoints(best, function (p) { return p.x; }, function (p) { return p.y; }), class: "mw-history-line is-best" });
      if (regret.length > 1) drawing.append(svg, "path", { d: drawing.pathFromPoints(regret, function (p) { return p.x; }, function (p) { return p.y; }), class: "mw-history-line is-regret" });
      drawing.text(svg, right - 365, top + 24, "алгоритм", "mw-legend is-algorithm");
      drawing.text(svg, right - 230, top + 24, "лучший эксперт", "mw-legend is-best");
      drawing.text(svg, right - 72, top + 24, "regret", "mw-legend is-regret");
      drawing.text(svg, left - 14, top + 4, format(maxY, 1), "is-muted", "end");
      drawing.text(svg, left - 14, bottom + 4, "0", "is-muted", "end");
      const cursorX = left + model.frame.round / Math.max(1, model.options.rounds) * (right - left);
      drawing.append(svg, "line", { x1: cursorX, y1: top, x2: cursorX, y2: bottom, class: "mw-round-cursor" });
    }

    function drawPotential(svg, model) {
      const frame = model.frame;
      const left = 76;
      const width = 1064;
      const ratio = Math.max(0, Math.min(1, frame.potential / model.experts.length));
      drawing.text(svg, 34, 734, "Потенциал Φ = Σwᵢ", "mw-section-title");
      drawing.append(svg, "rect", { x: left, y: 755, width: width, height: 34, rx: 6, class: "mw-potential-track" });
      drawing.append(svg, "rect", { x: left, y: 755, width: Math.max(2, width * ratio), height: 34, rx: 6, class: "mw-potential-value" });
      drawing.text(svg, left + 12, 778, format(frame.potential, 4), "mw-potential-label");
      if (frame.losses) {
        drawing.text(svg, 1140, 778, "ln(Φₜ₊₁/Φₜ)=" + format(frame.logPotentialChange, 4) + " ≤ " + format(frame.hoeffdingUpperChange, 4), "mw-potential-bound", "end");
      }
    }

    function renderTable(model) {
      const frame = model.frame;
      let html = '<table class="multiplicative-weights-table"><thead><tr><th scope="col">Эксперт</th><th scope="col">p до</th><th scope="col">ℓ</th><th scope="col">exp(−ηℓ)</th><th scope="col">w до → после</th><th scope="col">L</th><th scope="col">p после</th></tr></thead><tbody>';
      model.experts.forEach(function (expert, index) {
        html += '<tr><th scope="row">' + expert.label + '</th>' +
          '<td>' + format(frame.probabilities[index], 4) + '</td>' +
          '<td>' + (frame.losses ? format(frame.losses[index], 2) : "—") + '</td>' +
          '<td>' + format(frame.updateFactors[index], 4) + '</td>' +
          '<td>' + format(frame.weightsBefore[index], 4) + ' → ' + format(frame.weights[index], 4) + '</td>' +
          '<td>' + format(frame.cumulativeExpertLosses[index], 3) + '</td>' +
          '<td>' + format(frame.nextProbabilities[index], 4) + '</td></tr>';
      });
      html += "</tbody></table>";
      tablePanel.querySelector("[data-expert-table]").innerHTML = html;
    }

    function render(state) {
      const model = core.visualModel(state);
      const frame = model.frame;
      const svg = figure.svg;
      drawing.clear(svg, "Метод мультипликативных весов", "Четыре эксперта, экспоненциальное обновление, нормировка вероятностей, накопленный regret и потенциал");
      drawExperts(svg, model);
      drawHistory(svg, model);
      drawPotential(svg, model);
      renderTable(model);

      metrics.querySelector('[data-metric="round"]').textContent = frame.round + " / " + model.options.rounds;
      metrics.querySelector('[data-metric="round-loss"]').textContent = format(frame.expectedLoss, 3);
      metrics.querySelector('[data-metric="algorithm-loss"]').textContent = format(frame.cumulativeAlgorithmLoss, 3);
      metrics.querySelector('[data-metric="regret"]').textContent = format(frame.regret, 3) + " / " + format(frame.bound, 3);
      metrics.querySelector('[data-metric="potential"]').textContent = format(frame.potential, 4);

      explanation.querySelector("[data-current]").textContent = frame.losses === null
        ? "Все эксперты начинают с одинакового веса. Первый прогноз является равномерной смесью; проигрыши ещё не раскрыты"
        : "В раунде " + frame.round + " смесь понесла ожидаемый проигрыш " + format(frame.expectedLoss, 3) +
          ". Эксперт «" + model.experts[frame.bestExpertIndex].label + "» пока лучший с накопленным проигрышем " + format(frame.bestExpertLoss, 3) +
          "; параметр η=" + format(model.options.eta, 2) + " определяет резкость перераспределения";
      explanation.querySelector("[data-proof]").textContent = frame.losses === null
        ? "Потенциал равен числу экспертов. На каждом шаге его верхняя оценка связывается с ожидаемым проигрышем смеси, а нижняя — с весом лучшего эксперта"
        : "Наблюдаемый regret равен " + format(frame.regret, 3) + ". Теоретическая граница ln(4)/η + ηt/8 равна " + format(frame.bound, 3) +
          "; она гарантирована для любого префикса проигрышей из [0,1], а не выводится из формы нарисованных кривых";
      figure.caption.textContent = core.SCENARIOS[model.options.scenario].description + ". Ползунок η меняет реакцию весов, но не сами проигрыши экспертов";
    }

    const mounted = runtime.mount(root, {
      createState: function () {
        syncOutputs();
        return core.createState(options());
      },
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 45,
      bind: function (api) {
        fields.scenario.addEventListener("change", api.reset);
        [fields.eta, fields.rounds].forEach(function (field) {
          field.addEventListener("input", function () {
            syncOutputs();
            api.reset();
          });
        });
      },
    });
    syncOutputs();
    mounted.reset();
  });
})();
