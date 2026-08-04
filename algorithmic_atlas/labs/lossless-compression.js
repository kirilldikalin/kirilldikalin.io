(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const sequence = window.AtlasSequenceLabRuntime;
  const core = window.LosslessCompressionCore;

  runtime.boot("lossless-compression", function (root) {
    root.classList.add("atlas-specialized-lab");
    const shell = runtime.createShell(root, {
      title: "Четыре идеи сжатия без потерь",
      description: "Объединяйте частоты, сужайте точный интервал, копируйте повтор LZ77 или наращивайте словарь фраз LZ78",
    });
    shell.controls.innerHTML =
      '<label>Метод<select data-field="mode"><option value="huffman">Хаффман</option><option value="arithmetic">Арифметическое кодирование</option><option value="lz77">LZ77</option><option value="lz78">LZ78</option></select></label>' +
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
      if (!data.root) {
        drawing.text(figure.svg, 460, 250,
          "Пустое сообщение кодируется пустой битовой строкой", "is-strong", "middle");
        metrics.querySelector('[data-metric="output"]').textContent = "0 бит";
        metrics.querySelector('[data-metric="rule"]').textContent = "ничего не объединять";
        detail.querySelector("[data-detail]").textContent =
          "Граница пустого сообщения задаётся внешним контрактом формата; символов и кодовых слов в дереве нет";
        return;
      }
      const nodes = Object.create(null);
      function collect(node) {
        nodes[node.id] = node;
        if (node.left) collect(node.left);
        if (node.right) collect(node.right);
      }
      collect(data.root);
      const roots = state.frame.queue.map(function (id) { return nodes[id]; }).filter(Boolean);
      function leafCount(node) {
        return node.symbol !== null ? 1 : leafCount(node.left) + leafCount(node.right);
      }
      function depth(node) {
        return node.symbol !== null ? 0 : 1 + Math.max(depth(node.left), depth(node.right));
      }
      const totalLeaves = roots.reduce(function (sum, node) { return sum + leafCount(node); }, 0);
      const maximumDepth = roots.reduce(function (maximum, node) {
        return Math.max(maximum, depth(node));
      }, 0);
      const positions = Object.create(null);
      const leafSpacing = 780 / Math.max(1, totalLeaves);
      const verticalStep = maximumDepth ? 330 / maximumDepth : 60;
      const radius = Math.max(5, Math.min(23, leafSpacing * 0.3, verticalStep * 0.3));
      function place(node, level, firstLeaf) {
        if (node.symbol !== null) {
          positions[node.id] = { x: 70 + (firstLeaf + 0.5) * leafSpacing,
            y: 90 + level * verticalStep };
          return firstLeaf + 1;
        }
        const afterLeft = place(node.left, level + 1, firstLeaf);
        const afterRight = place(node.right, level + 1, afterLeft);
        positions[node.id] = { x: (positions[node.left.id].x + positions[node.right.id].x) / 2,
          y: 90 + level * verticalStep };
        return afterRight;
      }
      let nextLeaf = 0;
      roots.forEach(function (node) { nextLeaf = place(node, 0, nextLeaf); });
      function drawEdges(node) {
        [node.left, node.right].filter(Boolean).forEach(function (child) {
          drawing.append(figure.svg, "line", { x1: positions[node.id].x, y1: positions[node.id].y,
            x2: positions[child.id].x, y2: positions[child.id].y,
            class: node.id === state.frame.parent ? "is-a" : "atlas-lab__grid-line" });
          drawEdges(child);
        });
      }
      roots.forEach(drawEdges);
      Object.keys(positions).forEach(function (id) {
        const node = nodes[id];
        const point = positions[id];
        const nodeClass = node.id === state.frame.parent ? "is-good" :
          (node.id === state.frame.left || node.id === state.frame.right ? "is-a" : "atlas-lab__grid-line");
        drawing.append(figure.svg, "circle", { cx: point.x, cy: point.y, r: radius, class: nodeClass });
        if (radius >= 8) {
          drawing.text(figure.svg, point.x, point.y + 5,
            node.symbol === null ? String(node.weight) : node.symbol + ":" + node.weight,
            "is-strong", "middle");
        }
        if (state.frame.finished && node.symbol !== null) {
          drawing.text(figure.svg, point.x, point.y + radius + 18,
            data.codes[node.symbol], "is-muted", "middle");
        }
      });
      metrics.querySelector('[data-metric="output"]').textContent = state.frame.finished
        ? data.encoded.length + " бит"
        : "после построения";
      const left = nodes[state.frame.left];
      const right = nodes[state.frame.right];
      metrics.querySelector('[data-metric="rule"]').textContent = state.frame.finished
        ? "коды готовы"
        : "слить веса " + left.weight + " и " + right.weight;
      detail.querySelector("[data-detail]").textContent = "Ни одно кодовое слово не является префиксом другого: движение от корня по битам заканчивается ровно в одном листе";
    }

    function drawArithmetic(state) {
      const frame = state.frame;
      const projection = core.intervalProjection(frame.low, frame.high, 740);
      drawing.append(figure.svg, "rect", { x: 90, y: 190, width: 740, height: 90,
        class: "atlas-lab__grid-line" });
      drawing.append(figure.svg, "rect", { x: 90 + projection.start, y: 190,
        width: projection.pixelWidth, height: 90, class: "is-a" });
      drawing.text(figure.svg, 90, 165, "0", "", "middle");
      drawing.text(figure.svg, 830, 165, "1", "", "middle");
      drawing.text(figure.svg, 460, 350,
        "[" + frame.low.numerator + "/" + frame.low.denominator + ", " +
          frame.high.numerator + "/" + frame.high.denominator + ")", "is-strong", "middle");
      metrics.querySelector('[data-metric="output"]').textContent = "точно " +
        projection.width.numerator + "/" + projection.width.denominator +
        (projection.underResolution ? " · маркер увеличен до пикселя" : "");
      metrics.querySelector('[data-metric="rule"]').textContent = frame.finished ? "интервал готов" : "сузить по «" + frame.symbol + "»";
      detail.querySelector("[data-detail]").textContent = "Любое число из финального полуинтервала вместе с моделью частот и известной длиной сообщения либо специальным символом конца восстанавливает ту же последовательность вложенных интервалов";
    }

    function drawLz(state) {
      const frame = state.frame;
      const text = Array.from(state.text);
      const source = [];
      const target = [];
      for (let index = frame.sourceStart; index < frame.sourceStart + frame.sourceLength; index += 1) source.push(index);
      for (let index = frame.targetStart; index < frame.targetStart + frame.targetLength; index += 1) target.push(index);
      sequence.drawStrip(figure.svg, text, { x: 50, y: 105, width: 820, height: 54,
        label: "Уже восстановленный источник", window: [frame.windowStart, frame.position],
        matched: source });
      sequence.drawStrip(figure.svg, text, { x: 50, y: 225, width: 820, height: 54,
        label: "Цель копирования", matched: target,
        active: frame.position + frame.matchLength < text.length
          ? [frame.position + frame.matchLength] : [] });
      drawing.text(figure.svg, 50, 350, frame.overlap
        ? "Перекрытие: короткий исходный период повторяется уже в целевой области"
        : "Источник целиком лежит в ранее восстановленном окне", "is-muted");
      drawing.text(figure.svg, 50, 405,
        frame.token ? "Тройка (offset=" + frame.token.offset + ", length=" + frame.token.length +
          ", next=«" + (frame.token.nextSymbol || "EOF") + "»)" :
          "Разбор завершён", "is-strong");
      drawing.text(figure.svg, 50, 455,
        "Токены: " + frame.tokens.map(function (token) {
          return "(" + token.offset + "," + token.length + "," + (token.nextSymbol || "EOF") + ")";
        }).join(" · "), "is-muted");
      metrics.querySelector('[data-metric="output"]').textContent = frame.tokens.length + " токенов";
      metrics.querySelector('[data-metric="rule"]').textContent = frame.token && frame.token.length
        ? "скопировать и дописать символ" : "дописать следующий символ";
      detail.querySelector("[data-detail]").textContent = "Декодер читает тройку (offset, length, nextSymbol): сначала копирует уже восстановленный фрагмент, включая перекрытие, затем добавляет следующий символ";
    }

    function drawLz78(state) {
      const frame = state.frame;
      const text = Array.from(state.text);
      const consumed = Array.from({ length: Math.min(frame.position, text.length) }, function (_, index) {
        return index;
      });
      sequence.drawStrip(figure.svg, text, { x: 50, y: 85, width: 820, height: 54,
        label: "Прочитанный префикс и следующая фраза", matched: consumed,
        active: frame.position < text.length ? [frame.position] : [] });
      const entries = frame.dictionary.slice(1);
      const layout = core.lz78Layout(entries.length);
      figure.svg.setAttribute("viewBox", "0 0 920 " + layout.height);
      const columns = 5;
      entries.forEach(function (phrase, index) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = 55 + column * 165;
        const y = 195 + row * 72;
        drawing.append(figure.svg, "rect", { x: x, y: y, width: 145, height: 52,
          rx: 4, class: index === entries.length - 1 && !frame.finished ? "is-good" : "atlas-lab__grid-line" });
        drawing.text(figure.svg, x + 10, y + 21, String(index + 1), "is-muted");
        drawing.text(figure.svg, x + 72, y + 37, phrase, "is-strong", "middle");
      });
      drawing.text(figure.svg, 50, layout.tokenY, frame.token
        ? "Токен (" + frame.token.index + ", «" + (frame.token.nextSymbol || "EOF") +
          "»): словарь[" + frame.token.index + "] + следующий символ"
        : "Разбор завершён", "is-strong");
      metrics.querySelector('[data-metric="output"]').textContent = frame.tokens.length + " токенов";
      metrics.querySelector('[data-metric="rule"]').textContent = frame.token
        ? "вывести ссылку и добавить новую фразу" : "словарь готов";
      detail.querySelector("[data-detail]").textContent =
        "Ссылка указывает только на уже созданную фразу с меньшим индексом; декодер дописывает символ и создаёт ту же следующую запись";
    }

    function render(state) {
      figure.svg.setAttribute("viewBox", "0 0 920 560");
      drawing.clear(figure.svg, "Сжатие без потерь", "Текущее точное состояние выбранного кодировщика");
      if (state.mode === "huffman") drawHuffman(state);
      else if (state.mode === "arithmetic") drawArithmetic(state);
      else if (state.mode === "lz77") drawLz(state);
      else drawLz78(state);
      metrics.querySelector('[data-metric="frame"]').textContent = String(state.index + 1) + " / " + state.frames.length;
      metrics.querySelector('[data-metric="entropy"]').textContent = core.entropy(state.text).toFixed(3) + " бит/символ";
      figure.caption.textContent = "Все четыре режима сохраняют исходное сообщение точно, но используют разные виды повторяемости";
    }

    const mounted = runtime.mount(root, { createState: createState, step: core.step,
      render: render, isFinished: function (state) { return state.frame.finished; },
      maxAutomaticSteps: 300 });
    shell.controls.addEventListener("change", mounted.reset);
    fields.text.addEventListener("input", mounted.reset);
  });
})();
