(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.ComputationModelsCore;
  runtime.boot("computation-models", function (root) {
    const shell = runtime.createShell(root, {
      title: "Одна программа — три стоимости",
      description: "Пошагово выполните скалярное произведение и сравните unit-cost RAM, word-RAM и битовую модель",
    });
    shell.controls.innerHTML =
      '<label>Битов в операнде<input data-lab-field="operand" type="range" min="1" max="4096" value="128"><output data-output="operand"></output></label>' +
      '<label>Размер слова w<input data-lab-field="word" type="range" min="8" max="256" step="8" value="64"><output data-output="word"></output></label>' +
      '<label>Длина вектора<input data-lab-field="length" type="range" min="1" max="40" value="6"><output data-output="length"></output></label>';
    const fields = {};
    ["operand","word","length"].forEach(function (name) { fields[name] = shell.controls.querySelector('[data-lab-field="' + name + '"]'); });
    const outputs = {};
    ["operand","word","length"].forEach(function (name) { outputs[name] = shell.controls.querySelector('[data-output="' + name + '"]'); });
    const figure = runtime.createFigure(shell.workspace, { id: "computation-models-visual", title: "Слова, биты и накопленная стоимость", viewBox: "0 0 820 470" });
    const panel = document.createElement("section"); panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Текущая инструкция</h4><p data-instruction></p><h4>Накопленная стоимость</h4><ul data-costs></ul><h4>Память</h4><p data-memory></p>';
    shell.workspace.appendChild(panel);
    const instruction = panel.querySelector("[data-instruction]"); const costs = panel.querySelector("[data-costs]"); const memory = panel.querySelector("[data-memory]");
    function createState() {
      Object.keys(outputs).forEach(function (name) { outputs[name].textContent = fields[name].value; });
      return core.createState({ operandBits: Number(fields.operand.value), wordBits: Number(fields.word.value), vectorLength: Number(fields.length.value) });
    }
    function render(state) {
      const model = core.visualModel(state); const svg = figure.svg;
      drawing.clear(svg, "Три модели стоимости", "Машинные слова, агрегированные биты, текущая инструкция и полосы накопленной стоимости");
      const wordWidth = Math.min(58, 650 / Math.max(1, model.visibleWords));
      const wordStart = (820 - wordWidth * model.visibleWords) / 2;
      for (let index = 0; index < model.visibleWords; index += 1) {
        drawing.append(svg, "rect", { x: wordStart + index * wordWidth, y: 70, width: wordWidth - 3, height: 52, class: "word-cell" + (model.currentInstruction ? " is-current" : "") });
        drawing.text(svg, wordStart + (index + 0.5) * wordWidth, 101, "w" + index, "is-muted", "middle");
      }
      if (model.omittedWords) drawing.text(svg, 760, 102, "… +" + model.omittedWords, "is-muted", "end");
      const bitWidth = Math.min(9, 650 / model.bitCells);
      for (let index = 0; index < model.bitCells; index += 1) drawing.append(svg, "rect", { x: 85 + index * bitWidth, y: 150, width: Math.max(1, bitWidth - 1), height: 18, class: "word-bit" });
      if (model.omittedBits) drawing.text(svg, 750, 165, "сжато ещё битов: " + model.omittedBits, "is-muted", "end");
      drawing.append(svg, "path", { d: "M100 210H720", class: "word-bus" });
      model.costs.forEach(function (cost, index) {
        const y = 270 + index * 55;
        drawing.text(svg, 190, y + 18, cost.label, "is-strong", "end");
        drawing.append(svg, "rect", { x: 210, y: y, width: Math.max(2, 500 * cost.share), height: 28, class: "cost-model-bar" + (model.currentInstruction ? " is-current" : "") });
        drawing.text(svg, 720, y + 19, cost.value.toString(), "is-muted", "end");
      });
      instruction.textContent = model.currentInstruction
        ? model.currentInstruction.label + "; " +
          (model.currentInstruction.operationBits
            ? "операнды по " + model.currentInstruction.operationBits + " бит, результат до " + model.currentInstruction.bits + " бит"
            : "разрядность " + model.currentInstruction.bits + " бит")
        : "Инструкции ещё не выполнялись";
      costs.replaceChildren(); model.costs.forEach(function (cost) { const item = document.createElement("li"); item.textContent = cost.label + ": " + cost.value.toString(); costs.appendChild(item); });
      memory.textContent = "Обращений к машинным словам: " + model.memoryAccesses + (model.schematic ? ". Геометрия агрегирована" : ". Все слова показаны");
      figure.caption.textContent = "Одинаковая инструкция получает разную цену; это модельный счёт, а не время на часах";
    }
    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 220,
      bind: function (api) { shell.controls.addEventListener("input", function () { api.reset(); }); },
    });
  });
})();
