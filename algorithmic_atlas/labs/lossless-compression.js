(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const sequence = window.AtlasSequenceLabRuntime;
  const core = window.LosslessCompressionCore;

  runtime.boot("lossless-compression", function (root) {
    root.classList.add("atlas-specialized-lab");
    const shell = runtime.createShell(root, {
      title: "Три идеи сжатия без потерь",
      description: "Объединяйте частоты в дерево Хаффмана, сужайте точный арифметический интервал или копируйте повтор из окна LZ77",
    });
    shell.controls.innerHTML =
      '<label>Метод<select data-field="mode"><option value="huffman">Хаффман</option><option value="arithmetic">Арифметическое кодирование</option><option value="lz77">LZ77</option></select></label>' +
      '<label class="is-wide">Сообщение<input data-field="text" value="абракадабра" maxlength="24" spellcheck="false"></label>' +
      '<label data-lz>Окно<input data-field="window" type="number" min="2" max="24" value="12"></label>' +
      '<label data-lz>Буфер вперёд<input data-field="lookahead" type="number" min="2" max="16" value="8"></label>';
    const fields = {};
    ["mode", "text", "window", "lookahead"].forEach(function (name) {
      fields[name] = shell.controls.querySelector('[data-field="' + name + '"]');
    });
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML = '<div><dt>Кадр</dt><dd data-metric="frame">0</dd></div>' +
      '<div><dt>Энтропия H₀</dt><dd data-metric="entropy">0</dd></div>' +
      '<div><dt>Выход</dt><dd data-metric="output">0</dd></div>' +
      '<div><dt>Текущее правило</dt><dd data-metric="rule">—</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "lossless-compression-visual", title: "Состояние кодировщика", viewBox: "0 0 920 560",
    });
    const detail = document.createElement("section");
    detail.className = "atlas-lab__panel";
    detail.innerHTML = '<h4>Почему декодирование однозначно</h4><p data-detail></p>';
    shell.workspace.appendChild(detail);

    function syncMode() {
      shell.controls.querySelectorAll("[data-lz]").forEach(function (element) {
        element.hidden = fields.mode.value !== "lz77";
      });
    }

    function createState() {
      syncMode();
      return core.createState({ mode: fields.mode.value, text: fields.text.value,
        window: fields.window.value, lookahead: fields.lookahead.value });
    }

    function drawHuffman(state) {
      const data = core.huffman(state.text);
      const leaves = Object.keys(data.codes);
      leaves.forEach(function (symbol, index) {
        const x = 90 + index * 740 / Math.max(1, leaves.length - 1);
        drawing.append(figure.svg, "circle", { cx: x, cy: 420, r: 28, class: "is-a" });
        drawing.text(figure.svg, x, 418, symbol, "is-strong", "middle");
        drawing.text(figure.svg, x, 455, data.codes[symbol], "", "middle");
        drawing.append(figure.svg, "line", { x1: 460, y1: 90, x2: x, y2: 392,
          class: "atlas-lab__grid-line", opacity: index < state.frame.queue.length ? 1 : 0.35 });
      });
      drawing.append(figure.svg, "circle", { cx: 460, cy: 90, r: 34, class: "is-good" });
      drawing.text(figure.svg, 460, 95, String(data.root.weight), "is-strong", "middle");
      metrics.querySelector('[data-metric="output"]').textContent = data.encoded.length + " бит";
      metrics.querySelector('[data-metric="rule"]').textContent = state.frame.finished ? "коды готовы" : "слить два минимума";
      detail.querySelector("[data-detail]").textContent = "Ни одно кодовое слово не является префиксом другого: движение от корня по битам заканчивается ровно в одном листе";
    }

    function ratio(fraction) {
      return Number(fraction.numerator) / Number(fraction.denominator);
    }

    function drawArithmetic(state) {
      const frame = state.frame;
      const low = ratio(frame.low);
      const high = ratio(frame.high);
      drawing.append(figure.svg, "rect", { x: 90, y: 190, width: 740, height: 90,
        class: "atlas-lab__grid-line" });
      drawing.append(figure.svg, "rect", { x: 90 + 740 * low, y: 190,
        width: Math.max(2, 740 * (high - low)), height: 90, class: "is-a" });
      drawing.text(figure.svg, 90, 165, "0", "", "middle");
      drawing.text(figure.svg, 830, 165, "1", "", "middle");
      drawing.text(figure.svg, 460, 350,
        "[" + frame.low.numerator + "/" + frame.low.denominator + ", " +
          frame.high.numerator + "/" + frame.high.denominator + ")", "is-strong", "middle");
      metrics.querySelector('[data-metric="output"]').textContent = "ширина ≈ " +
        Math.max(0, high - low).toExponential(3);
      metrics.querySelector('[data-metric="rule"]').textContent = frame.finished ? "интервал готов" : "сузить по «" + frame.symbol + "»";
      detail.querySelector("[data-detail]").textContent = "Любое число из финального полуинтервала вместе с моделью частот восстанавливает ту же последовательность вложенных интервалов";
    }

    function drawLz(state) {
      const frame = state.frame;
      const text = Array.from(state.text);
      const matched = [];
      for (let index = frame.matchStart; index < frame.matchStart + frame.matchLength; index += 1) matched.push(index);
      sequence.drawStrip(figure.svg, text, { x: 50, y: 150, width: 820, height: 58,
        label: "Скользящее окно и буфер", window: [frame.windowStart, frame.position],
        matched: matched, active: frame.position < text.length ? [frame.position] : [] });
      drawing.text(figure.svg, 50, 300,
        frame.token ? (frame.token.literal ? "Литерал «" + frame.token.literal + "»" :
          "Ссылка (distance=" + frame.token.distance + ", length=" + frame.token.length + ")") :
          "Разбор завершён", "is-strong");
      drawing.text(figure.svg, 50, 350,
        "Токены: " + frame.tokens.map(function (token) {
          return token.literal || "(" + token.distance + "," + token.length + ")";
        }).join(" · "), "is-muted");
      metrics.querySelector('[data-metric="output"]').textContent = frame.tokens.length + " токенов";
      metrics.querySelector('[data-metric="rule"]').textContent = frame.token && !frame.token.literal ? "копировать совпадение" : "записать литерал";
      detail.querySelector("[data-detail]").textContent = "Декодер читает токены слева направо: ссылка всегда указывает только в уже восстановленный префикс, включая перекрывающееся копирование";
    }

    function render(state) {
      drawing.clear(figure.svg, "Сжатие без потерь", "Текущее точное состояние выбранного кодировщика");
      if (state.mode === "huffman") drawHuffman(state);
      else if (state.mode === "arithmetic") drawArithmetic(state);
      else drawLz(state);
      metrics.querySelector('[data-metric="frame"]').textContent = String(state.index + 1) + " / " + state.frames.length;
      metrics.querySelector('[data-metric="entropy"]').textContent = core.entropy(state.text).toFixed(3) + " бит/символ";
      figure.caption.textContent = "Все три режима сохраняют исходное сообщение точно, но используют разные виды повторяемости";
    }

    const mounted = runtime.mount(root, { createState: createState, step: core.step,
      render: render, isFinished: function (state) { return state.frame.finished; },
      maxAutomaticSteps: 300 });
    shell.controls.addEventListener("change", mounted.reset);
    fields.text.addEventListener("input", mounted.reset);
  });
})();
