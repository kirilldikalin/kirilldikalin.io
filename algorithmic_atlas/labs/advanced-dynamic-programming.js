(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.AdvancedDynamicProgrammingCore;

  runtime.boot("advanced-dynamic-programming", function (root) {
    const shell = runtime.createShell(root, {
      title: "Когда минимум можно искать не по всей строке",
      description: "Матрица переходов показывает точный optimum, окно Кнута и цену необоснованного исключения кандидатов",
    });
    shell.controls.innerHTML =
      '<label>Цена интервала<select data-field="scenario"><option value="monge">Аддитивная: условия выполнены</option><option value="irregular">Нерегулярная: контрпример</option></select></label>' +
      '<label>Перебор split<select data-field="method"><option value="full">Полный эталон</option><option value="knuth">Окно opt[i,j−1]…opt[i+1,j]</option></select></label>' +
      '<label>Размер: <output data-output="size"></output><input data-field="size" type="range" min="4" max="7" value="6"></label>';
    const fields = {
      scenario: shell.controls.querySelector('[data-field="scenario"]'),
      method: shell.controls.querySelector('[data-field="method"]'),
      size: shell.controls.querySelector('[data-field="size"]'),
      sizeOutput: shell.controls.querySelector('[data-output="size"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Quadrangle inequality</dt><dd data-metric="quadrangle">—</dd></div>' +
      '<div><dt>Монотонность интервалов</dt><dd data-metric="interval">—</dd></div>' +
      '<div><dt>Нарушений opt</dt><dd data-metric="violations">0</dd></div>' +
      '<div><dt>Эталон / выбранный</dt><dd data-metric="answers">—</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "advanced-dp-transition-matrix",
      title: "Матрица переходов interval DP",
      viewBox: "0 0 1200 700",
      className: "advanced-dp-figure",
    });
    const optPanel = document.createElement("section");
    optPanel.className = "atlas-lab__panel advanced-dp-opt-panel";
    optPanel.innerHTML = '<h4>Матрица индексов opt</h4><div data-opt-table class="advanced-dp-table-wrap"></div>';
    shell.workspace.appendChild(optPanel);
    const explanation = document.createElement("section");
    explanation.className = "atlas-lab__panel advanced-dp-explanation";
    explanation.innerHTML = '<h4>Текущая строка переходов</h4><p data-current></p><h4>Что разрешено заключить</h4><p data-verdict></p>';
    shell.workspace.appendChild(explanation);

    function options() {
      return { scenario: fields.scenario.value, method: fields.method.value, size: Number(fields.size.value) };
    }

    function recordForDisplay(model) {
      if (model.current) return model.current;
      const records = model.options.method === "knuth" ? model.knuth.records : model.full.records;
      const source = records[0];
      const reference = model.full.records[0];
      return Object.assign({}, source, {
        exactValue: reference.value,
        exactSplit: reference.split,
        missedOptimum: source.value !== reference.value,
      });
    }

    function renderMatrix(model) {
      const record = recordForDisplay(model);
      const n = model.options.size;
      const allRecords = model.options.method === "knuth" ? model.knuth.records : model.full.records;
      const width = Math.max(1100, 250 + n * 112);
      const rowHeight = 28;
      const height = Math.max(620, 120 + allRecords.length * rowHeight);
      const svg = figure.svg;
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      svg.style.minWidth = width + "px";
      drawing.clear(svg, "Матрица стоимостей переходов", "Строки являются интервалами, столбцы индексами split; серые клетки исключены окном оптимизации");
      const left = 125;
      const top = 64;
      const cellWidth = (width - left - 40) / n;
      for (let split = 0; split < n; split += 1) {
        drawing.text(svg, left + (split + 0.5) * cellWidth, 40, "k=" + split, "advanced-dp-header", "middle");
      }
      const pathPoints = [];
      allRecords.forEach(function (row, rowIndex) {
        const y = top + rowIndex * rowHeight;
        const isCurrent = row.i === record.i && row.j === record.j;
        drawing.text(svg, left - 16, y + 18, "[" + row.i + "," + row.j + "]", isCurrent ? "advanced-dp-row-label is-current" : "advanced-dp-row-label", "end");
        row.candidates.forEach(function (entry) {
          const x = left + entry.split * cellWidth;
          let className = "advanced-dp-cell";
          if (!entry.allowed) className += " is-excluded";
          if (entry.split === row.split) className += " is-selected";
          if (isCurrent && entry.split === record.exactSplit && record.missedOptimum) className += " is-missed";
          drawing.append(svg, "rect", { x: x + 2, y: y, width: cellWidth - 4, height: rowHeight - 3, rx: 3, class: className });
          drawing.text(svg, x + cellWidth / 2, y + 18, entry.value, "advanced-dp-cell-text", "middle");
        });
        pathPoints.push({ x: left + (row.split + 0.5) * cellWidth, y: y + rowHeight / 2 });
      });
      if (pathPoints.length > 1) {
        drawing.append(svg, "path", {
          d: drawing.pathFromPoints(pathPoints, function (point) { return point.x; }, function (point) { return point.y; }),
          class: "advanced-dp-opt-path",
        });
      }
      figure.caption.textContent = "Заливка показывает реально просмотренное окно; красная клетка появляется, когда необоснованное окно исключило точный минимум";
    }

    function renderOptTable(model) {
      const source = model.options.method === "knuth" ? model.knuth : model.full;
      let html = '<table class="advanced-dp-table"><thead><tr><th>i / j</th>';
      for (let j = 0; j < model.options.size; j += 1) html += "<th>" + j + "</th>";
      html += "</tr></thead><tbody>";
      for (let i = 0; i < model.options.size; i += 1) {
        html += "<tr><th>" + i + "</th>";
        for (let j = 0; j < model.options.size; j += 1) {
          const value = j < i ? "—" : source.opt[i][j];
          const violation = model.optViolations.some(function (entry) { return entry.i === i && entry.j === j; });
          html += '<td class="' + (violation ? "is-violation" : "") + '">' + value + "</td>";
        }
        html += "</tr>";
      }
      html += "</tbody></table>";
      optPanel.querySelector("[data-opt-table]").innerHTML = html;
    }

    function render(state) {
      const model = core.visualModel(state);
      const record = recordForDisplay(model);
      renderMatrix(model);
      renderOptTable(model);
      metrics.querySelector('[data-metric="quadrangle"]').textContent = model.conditions.quadrangle ? "да" : "нет";
      metrics.querySelector('[data-metric="interval"]').textContent = model.conditions.intervalMonotone ? "да" : "нет";
      metrics.querySelector('[data-metric="violations"]').textContent = String(model.optViolations.length);
      metrics.querySelector('[data-metric="answers"]').textContent = model.exactAnswer + " / " + model.chosenAnswer;
      explanation.querySelector("[data-current]").textContent =
        "Для D[" + record.i + "," + record.j + "] просмотрены k от " + record.lower + " до " + record.upper +
        ". Выбран k=" + record.split + " со стоимостью " + record.value +
        "; полный эталон выбирает k=" + record.exactSplit + " и стоимость " + record.exactValue;
      let verdict;
      if (model.options.method === "full") {
        verdict = "Полный перебор строки является эталоном. Он показывает opt, но сам по себе не доказывает монотонность индексов";
      } else if (!model.conditions.quadrangle || !model.conditions.intervalMonotone) {
        verdict = record.missedOptimum
          ? "Окно уже исключило лучший split: ускоренный расчёт дал неверное значение. Это контрпример, а не численная погрешность"
          : "Предпосылки теоремы нарушены. Совпадение на текущей строке случайно и не разрешает считать окно безопасным";
      } else {
        verdict = "Обе структурные предпосылки выполнены; теорема гарантирует монотонность opt и безопасность исключённых клеток для всех интервалов этого семейства";
      }
      explanation.querySelector("[data-verdict]").textContent = verdict;
    }

    const api = runtime.mount(root, {
      createState: function () { fields.sizeOutput.textContent = fields.size.value; return core.createState(options()); },
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 32,
      bind: function (mounted) {
        [fields.scenario, fields.method].forEach(function (field) { field.addEventListener("change", mounted.reset); });
        fields.size.addEventListener("input", function () { fields.sizeOutput.textContent = fields.size.value; mounted.reset(); });
      },
    });
    fields.sizeOutput.textContent = fields.size.value;
    api.reset();
  });
})();
