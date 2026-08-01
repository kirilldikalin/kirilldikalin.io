(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.DynamicProgrammingCore;

  runtime.boot("dynamic-programming", function (root) {
    const shell = runtime.createShell(root, {
      title: "Состояние DP как вершина графа зависимостей",
      description: "Сравните корректный ключ состояния с потерей номера префикса, вычислите таблицу в топологическом порядке и восстановите предметы",
    });
    shell.controls.innerHTML =
      '<label>Набор предметов<select data-field="preset"><option value="classic">A:6/30 · B:3/14 · C:4/16 · D:2/9</option><option value="collision">Малый контрпример</option><option value="dense">Плотная таблица</option></select></label>' +
      '<label>Ключ состояния<select data-field="state"><option value="prefix-capacity">Префикс i и ёмкость c</option><option value="capacity-only">Только ёмкость c</option></select></label>' +
      '<label>Порядок<select data-field="method"><option value="tabulation">Tabulation: по строкам</option><option value="memoization">Memoization: от цели</option></select></label>' +
      '<label>Вместимость: <output data-output="capacity"></output><input data-field="capacity" type="range" min="1" max="14" value="10"></label>';

    const fields = {
      preset: shell.controls.querySelector('[data-field="preset"]'),
      state: shell.controls.querySelector('[data-field="state"]'),
      method: shell.controls.querySelector('[data-field="method"]'),
      capacity: shell.controls.querySelector('[data-field="capacity"]'),
      capacityOutput: shell.controls.querySelector('[data-output="capacity"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Вычислено</dt><dd data-metric="resolved">0</dd></div>' +
      '<div><dt>Memo hits</dt><dd data-metric="hits">0</dd></div>' +
      '<div><dt>Оптимум</dt><dd data-metric="optimum">—</dd></div>' +
      '<div><dt>Выбрано</dt><dd data-metric="selected">—</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "dynamic-programming-dependency-graph",
      title: "DAG состояний 0/1-рюкзака",
      viewBox: "0 0 1200 620",
      className: "dynamic-programming-figure",
    });
    const tablePanel = document.createElement("section");
    tablePanel.className = "atlas-lab__panel dynamic-programming-table-panel";
    tablePanel.innerHTML = '<h4>Таблица значений</h4><div data-dp-table class="dynamic-programming-table-wrap"></div>';
    shell.workspace.appendChild(tablePanel);
    const explanation = document.createElement("section");
    explanation.className = "atlas-lab__panel dynamic-programming-explanation";
    explanation.innerHTML = '<h4>Текущий переход</h4><p data-current></p><h4>Восстановление</h4><p data-reconstruction></p>';
    shell.workspace.appendChild(explanation);

    function options() {
      const preset = core.PRESETS[fields.preset.value];
      return {
        items: preset.items,
        capacity: Number(fields.capacity.value),
        stateModel: fields.state.value,
        method: fields.method.value,
      };
    }

    function syncPreset(resetCapacity) {
      const preset = core.PRESETS[fields.preset.value];
      if (resetCapacity) fields.capacity.value = String(preset.capacity);
      fields.capacityOutput.textContent = fields.capacity.value;
    }

    function statePosition(i, capacity, options, width, height) {
      return {
        x: 78 + capacity * ((width - 120) / Math.max(1, options.capacity)),
        y: 62 + i * ((height - 110) / Math.max(1, options.items.length)),
      };
    }

    function renderInvalid(model) {
      const svg = figure.svg;
      const width = 1200;
      drawing.clear(svg, "Некорректный ключ состояния", "Разные префиксы склеены одним ключом ёмкости и требуют разных ответов");
      const collision = model.collision;
      drawing.text(svg, 600, 95, "ключ c = " + collision.capacity, "dp-collision-key", "middle");
      drawing.append(svg, "line", { x1: 600, y1: 125, x2: 360, y2: 275, class: "dp-dependency-edge is-current" });
      drawing.append(svg, "line", { x1: 600, y1: 125, x2: 840, y2: 275, class: "dp-dependency-edge is-current" });
      [collision.first, collision.second].forEach(function (entry, index) {
        const x = index === 0 ? 360 : 840;
        drawing.append(svg, "rect", { x: x - 135, y: 275, width: 270, height: 125, rx: 8, class: "dp-collision-card" });
        drawing.text(svg, x, 320, "после i = " + entry.i + " предметов", "dp-node-label", "middle");
        drawing.text(svg, x, 365, "D = " + entry.value, "dp-collision-value", "middle");
      });
      drawing.text(svg, width / 2, 485, "Один ключ требует двух разных значений: функция состояния не определена", "dp-warning-text", "middle");
      figure.caption.textContent = "Чтобы продолжение было однозначным, ключ обязан хранить и номер обработанного префикса i";
    }

    function renderGraph(model) {
      if (!model.validState) {
        renderInvalid(model);
        return;
      }
      const options = model.options;
      const width = Math.max(1200, (options.capacity + 1) * 78);
      const height = Math.max(620, (options.items.length + 1) * 96);
      const svg = figure.svg;
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      svg.style.minWidth = width + "px";
      drawing.clear(svg, "Граф зависимостей динамического программирования", "Вершины (i,c), рёбра к меньшему префиксу и текущий топологический шаг");

      for (let i = 1; i <= options.items.length; i += 1) {
        for (let capacity = 0; capacity <= options.capacity; capacity += 1) {
          const from = statePosition(i, capacity, options, width, height);
          core.dependencies(options, i, capacity).forEach(function (dep) {
            const to = statePosition(dep.i, dep.capacity, options, width, height);
            const current = model.current && model.current.type === "compute" &&
              model.current.i === i && model.current.capacity === capacity;
            drawing.append(svg, "line", {
              x1: from.x,
              y1: from.y - 10,
              x2: to.x,
              y2: to.y + 10,
              class: "dp-dependency-edge " + (dep.kind === "take" ? "is-take " : "is-skip ") + (current ? "is-current" : ""),
            });
          });
        }
      }

      for (let i = 0; i <= options.items.length; i += 1) {
        for (let capacity = 0; capacity <= options.capacity; capacity += 1) {
          const position = statePosition(i, capacity, options, width, height);
          const stateKey = i + ":" + capacity;
          const isCurrent = model.current && model.current.i === i && model.current.capacity === capacity;
          const isResolved = model.resolved.has(stateKey);
          drawing.append(svg, "circle", {
            cx: position.x,
            cy: position.y,
            r: 13,
            class: "dp-state-node " + (isCurrent ? "is-current" : isResolved ? "is-resolved" : "is-pending"),
          });
          drawing.text(svg, position.x, position.y + 3, i + "," + capacity, "dp-node-label", "middle");
        }
      }
      figure.caption.textContent = "Рёбра всегда ведут к строке i−1; вычисление вершины допустимо только после всех её зависимостей";
    }

    function renderTable(model) {
      const options = model.options;
      let html = '<table class="dynamic-programming-table"><thead><tr><th scope="col">i / c</th>';
      for (let capacity = 0; capacity <= options.capacity; capacity += 1) html += "<th scope=\"col\">" + capacity + "</th>";
      html += "</tr></thead><tbody>";
      for (let i = 0; i <= options.items.length; i += 1) {
        html += "<tr><th scope=\"row\">" + i + "</th>";
        for (let capacity = 0; capacity <= options.capacity; capacity += 1) {
          const resolved = model.resolved.has(i + ":" + capacity);
          const current = model.current && model.current.i === i && model.current.capacity === capacity;
          html += '<td class="' + (current ? "is-current" : resolved ? "is-resolved" : "") + '">' +
            (resolved ? model.table.dp[i][capacity] : "·") + "</td>";
        }
        html += "</tr>";
      }
      html += "</tbody></table>";
      tablePanel.querySelector("[data-dp-table]").innerHTML = html;
    }

    function render(state) {
      const model = core.visualModel(state);
      renderGraph(model);
      renderTable(model);
      const currentText = explanation.querySelector("[data-current]");
      const reconstruction = explanation.querySelector("[data-reconstruction]");
      if (!model.validState) {
        currentText.textContent = "Ключ c забывает, какие предметы уже разрешено использовать. Возникает коллизия, поэтому таблица не является функцией состояния и топологический расчёт остановлен";
        reconstruction.textContent = "Восстанавливать нечего: сначала нужно исправить модель состояния";
      } else if (!model.current) {
        currentText.textContent = "Базовая строка i = 0 уже известна: без предметов ценность равна нулю при любой ёмкости";
        reconstruction.textContent = "После вычисления целевой клетки указатели выбора проведут обратный путь к строке 0";
      } else if (model.current.type === "compute") {
        const event = model.current;
        currentText.textContent = "Вычисляем D[" + event.i + "," + event.capacity + "] = " + event.value +
          ". Сначала разрешены все зависимости из строки " + (event.i - 1) +
          (event.chose ? "; лучший переход берёт предмет" : "; лучший переход пропускает предмет");
        reconstruction.textContent = "Выбор ещё не восстанавливается: сначала должна быть вычислена целевая клетка";
      } else if (model.current.type === "memo-hit") {
        currentText.textContent = "Повторный запрос к уже вычисленному состоянию возвращает значение " + model.current.value + " из memo-таблицы";
        reconstruction.textContent = "Совпадающий корректный ключ означает совпадающую будущую подзадачу";
      } else {
        const labels = model.selected.map(function (index) { return model.options.items[index].label; });
        currentText.textContent = model.current.take
          ? "Указатель в клетке ведёт к меньшей ёмкости: предмет добавлен"
          : "Указатель ведёт вверх без изменения ёмкости: предмет пропущен";
        reconstruction.textContent = labels.length ? "Уже восстановлены предметы: " + labels.join(", ") : "Пока выбранных предметов нет";
      }
      metrics.querySelector('[data-metric="resolved"]').textContent = String(model.resolved.size);
      metrics.querySelector('[data-metric="hits"]').textContent = String(model.memoHits);
      metrics.querySelector('[data-metric="optimum"]').textContent = model.optimum === null ? "—" : String(model.optimum);
      metrics.querySelector('[data-metric="selected"]').textContent = model.selected.length ? String(model.selected.length) : "0";
    }

    const api = runtime.mount(root, {
      createState: function () { syncPreset(false); return core.createState(options()); },
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 240,
      bind: function (mounted) {
        fields.preset.addEventListener("change", function () { syncPreset(true); mounted.reset(); });
        [fields.state, fields.method].forEach(function (field) { field.addEventListener("change", mounted.reset); });
        fields.capacity.addEventListener("input", function () {
          fields.capacityOutput.textContent = fields.capacity.value;
          mounted.reset();
        });
      },
    });
    syncPreset(true);
    api.reset();
  });
})();
