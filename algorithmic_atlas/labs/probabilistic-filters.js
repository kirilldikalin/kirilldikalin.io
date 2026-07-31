(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.ProbabilisticFiltersCore;

  runtime.boot("probabilistic-filters", function (root) {
    const shell = runtime.createShell(root, {
      title: "От хешей к вероятностному ответу",
      description: "Проследите происхождение false positive, безопасное удаление по счётчикам и ограниченное вытеснение отпечатков",
    });
    shell.controls.innerHTML =
      '<label>Структура<select data-field="mode"><option value="bloom">Bloom filter</option><option value="counting">Counting Bloom</option><option value="cuckoo">Cuckoo filter</option></select></label>' +
      '<label>Seed сценария (1–64)<input data-field="seed" type="number" min="1" max="64" step="1" value="44"></label>' +
      '<label data-array-field>Позиций m: <output data-output="m">24</output><input data-field="m" type="range" min="20" max="40" step="4" value="24"></label>' +
      '<label data-array-field>Хешей k: <output data-output="k">3</output><input data-field="k" type="range" min="2" max="5" step="1" value="3"></label>';

    const mode = shell.controls.querySelector('[data-field="mode"]');
    const seed = shell.controls.querySelector('[data-field="seed"]');
    const bits = shell.controls.querySelector('[data-field="m"]');
    const hashes = shell.controls.querySelector('[data-field="k"]');
    const bitsOutput = shell.controls.querySelector('[data-output="m"]');
    const hashesOutput = shell.controls.querySelector('[data-output="k"]');
    const arrayFields = shell.controls.querySelectorAll("[data-array-field]");

    const figure = runtime.createFigure(shell.workspace, {
      id: "probabilistic-filters-visual",
      title: "Точное состояние вероятностного фильтра",
      viewBox: "0 0 900 520",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML =
      '<h4>Текущий шаг</h4><p data-message></p>' +
      '<dl class="atlas-lab__metrics">' +
      '<div><dt>Кадр</dt><dd data-frame></dd></div>' +
      '<div><dt>Заполнено</dt><dd data-occupied></dd></div>' +
      '<div><dt>Ответ</dt><dd data-result></dd></div>' +
      '</dl><p data-detail></p>';
    shell.workspace.appendChild(panel);
    const message = panel.querySelector("[data-message]");
    const frameMetric = panel.querySelector("[data-frame]");
    const occupiedMetric = panel.querySelector("[data-occupied]");
    const resultMetric = panel.querySelector("[data-result]");
    const detail = panel.querySelector("[data-detail]");

    function syncControls() {
      const arrayMode = mode.value !== "cuckoo";
      arrayFields.forEach(function (field) { field.hidden = !arrayMode; });
      bitsOutput.textContent = bits.value;
      hashesOutput.textContent = hashes.value;
    }

    function createState() {
      const effectiveSeed = core.normalizeScenarioSeed(Number(seed.value));
      seed.value = String(effectiveSeed);
      return core.createState(mode.value, {
        seed: effectiveSeed,
        m: Number(bits.value),
        k: Number(hashes.value),
      });
    }

    function arrayCellPosition(index, length) {
      const columns = Math.min(20, length);
      const row = Math.floor(index / columns);
      const column = index % columns;
      const cellWidth = Math.min(38, 760 / columns);
      const rowLength = Math.min(columns, length - row * columns);
      const totalWidth = rowLength * cellWidth;
      return {
        x: (900 - totalWidth) / 2 + column * cellWidth,
        y: 178 + row * 102,
        width: cellWidth - 3,
      };
    }

    function drawHashArrows(svg, positions, length) {
      Array.from(new Set(positions)).forEach(function (position) {
        const cell = arrayCellPosition(position, length);
        drawing.append(svg, "line", {
          x1: 450,
          y1: 104,
          x2: cell.x + cell.width / 2,
          y2: cell.y,
          class: "structure-pointer",
        });
      });
    }

    function drawArray(svg, model) {
      const frame = model.frame;
      const positions = new Set(frame.positions);
      const checked = new Set(frame.checkedPositions);
      drawing.text(svg, 450, 52, frame.key === null ? "Хешируемый ключ пока не выбран" : "ключ " + frame.key, "is-strong", "middle");
      if (frame.positions.length) {
        drawing.text(svg, 450, 82, "позиции: " + frame.positions.join(", "), "is-muted", "middle");
        drawHashArrows(svg, frame.positions, frame.values.length);
      }
      frame.values.forEach(function (value, index) {
        const cell = arrayCellPosition(index, frame.values.length);
        let className = "structure-cell";
        if (value === 0) className += " is-empty";
        if (positions.has(index)) className += " is-active";
        if (checked.has(index) || frame.activePosition === index) className += " is-moved";
        drawing.append(svg, "rect", {
          x: cell.x,
          y: cell.y,
          width: cell.width,
          height: 54,
          class: className,
        });
        if (frame.mode === "counting" && value > 0) {
          drawing.append(svg, "rect", {
            x: cell.x + 4,
            y: cell.y + 50 - 36 * value / frame.maxCounter,
            width: Math.max(1, cell.width - 8),
            height: 36 * value / frame.maxCounter,
            class: "structure-cost-bar is-actual",
          });
        }
        drawing.text(svg, cell.x + cell.width / 2, cell.y + 31, value, "is-strong", "middle");
        drawing.text(svg, cell.x + cell.width / 2, cell.y + 72, index, "is-muted", "middle");
      });

      const probability = (model.probability * 100).toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      drawing.text(svg, 450, 408,
        "модельная вероятность false positive ≈ " + probability + "%",
        "is-strong", "middle");
      drawing.text(svg, 450, 442,
        model.optimalK === null
          ? "оптимальное k появится после первой вставки"
          : "непрерывный оптимум k* = (m/n) ln 2 ≈ " + model.optimalK.toFixed(2),
        "is-muted", "middle");
      drawing.text(svg, 450, 482,
        frame.mode === "counting"
          ? "Удаление корректно только для ключа с известной прежней вставкой"
          : "Ответ «возможно есть» возникает, когда все k битов уже равны единице",
        "is-muted", "middle");

      figure.caption.textContent = frame.mode === "counting"
        ? "Высота заливки показывает значение малого счётчика; один хеш может встретиться повторно"
        : "Стрелки соединяют ключ с точными позициями текущего хеширования";
      detail.textContent = frame.falsePositive
        ? "Это воспроизводимый false positive: журнал вставок не содержит ключ, но все проверяемые позиции заняты"
        : (frame.mode === "counting"
          ? "Счётчики различают несколько вкладов в одну позицию, но сам фильтр не подтверждает право на удаление"
          : "Bloom filter не хранит исходные ключи в битовом массиве; журнал показан только для проверки лаборатории");
    }

    function bucketX(index) {
      return 48 + index * 102;
    }

    function drawCuckoo(svg, model) {
      const frame = model.frame;
      const candidates = new Set(frame.candidates);
      drawing.text(svg, 450, 48,
        frame.fingerprint === null
          ? "Корзины пусты"
          : (frame.key === null
            ? "fingerprint " + frame.fingerprint + " переносится между корзинами"
            : "ключ " + frame.key + " → fingerprint " + frame.fingerprint),
        "is-strong", "middle");
      if (frame.candidates.length) {
        drawing.text(svg, 450, 78, "две кандидатные корзины: " + frame.candidates.join(" и "), "is-muted", "middle");
        frame.candidates.forEach(function (index) {
          drawing.append(svg, "line", {
            x1: 450,
            y1: 96,
            x2: bucketX(index) + 38,
            y2: 148,
            class: "structure-pointer",
          });
        });
      }

      frame.buckets.forEach(function (bucket, bucketIndex) {
        const x = bucketX(bucketIndex);
        drawing.text(svg, x + 38, 138, "B" + bucketIndex, "is-muted", "middle");
        for (let slot = 0; slot < frame.bucketSize; slot += 1) {
          const fingerprint = bucket[slot];
          let className = "structure-cell";
          if (fingerprint === undefined) className += " is-empty";
          if (candidates.has(bucketIndex)) className += " is-active";
          if (frame.activeBucket === bucketIndex && frame.activeSlot === slot) className += " is-moved";
          drawing.append(svg, "rect", {
            x: x,
            y: 154 + slot * 70,
            width: 76,
            height: 54,
            class: className,
          });
          drawing.text(svg, x + 38, 187 + slot * 70,
            fingerprint === undefined ? "—" : fingerprint,
            "is-strong", "middle");
        }
      });

      drawing.text(svg, 450, 345,
        frame.displacedFingerprint === null
          ? "В корзинах хранятся короткие отпечатки, а не исходные ключи"
          : "вытеснен fingerprint " + frame.displacedFingerprint + " → проверяем его альтернативную корзину",
        frame.displacedFingerprint === null ? "is-muted" : "is-strong", "middle");
      drawing.text(svg, 450, 390,
        "заполнение: " + model.occupied + " / " + model.capacity + " слотов",
        "is-strong", "middle");
      drawing.text(svg, 450, 430,
        "вытеснений в текущей вставке: " + frame.relocations + " · глобальный предел ядра: " + core.MAX_RELOCATIONS,
        "is-muted", "middle");
      drawing.text(svg, 450, 474,
        frame.rolledBack
          ? "Предел достигнут: фильтр возвращён к исходному состоянию"
          : "Альтернативный индекс вычисляется из текущей корзины и fingerprint",
        "is-muted", "middle");

      figure.caption.textContent = "Каждый отпечаток имеет ровно две взаимно восстанавливаемые кандидатные корзины";
      detail.textContent = "Во время relocation вытеснённый fingerprint временно находится «в руке» операции; состояние публикуется только после успешного размещения";
    }

    function render(state) {
      const model = core.visualModel(state);
      drawing.clear(
        figure.svg,
        "Вероятностный фильтр",
        model.mode === "cuckoo"
          ? "Корзины, отпечатки, две кандидатные позиции и ограниченное вытеснение"
          : "Битовый массив или счётчики и позиции детерминированных хеш-функций"
      );
      if (model.mode === "cuckoo") drawCuckoo(figure.svg, model);
      else drawArray(figure.svg, model);

      const frame = model.frame;
      message.textContent = frame.message;
      frameMetric.textContent = (model.frameIndex + 1) + " / " + model.frameCount;
      occupiedMetric.textContent = model.occupied + " / " + model.capacity;
      resultMetric.textContent = frame.queryResult === null
        ? "—"
        : (frame.queryResult ? "возможно есть" : "точно нет");
    }

    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 120,
      bind: function (api) {
        mode.addEventListener("change", function () {
          syncControls();
          api.reset();
        });
        shell.controls.addEventListener("change", function (event) {
          if (event.target !== mode) api.reset();
        });
        bits.addEventListener("input", function () {
          bitsOutput.textContent = bits.value;
          api.reset();
        });
        hashes.addEventListener("input", function () {
          hashesOutput.textContent = hashes.value;
          api.reset();
        });
        shell.controls.addEventListener("submit", function (event) {
          event.preventDefault();
          api.reset();
        });
      },
    });
    syncControls();
  });
})();
