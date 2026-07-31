(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ProofMethodsInductionCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const SCENARIO_DEFINITIONS = [
    {
      id: "odd-sum-induction",
      label: "Индукция: сумма нечётных чисел",
      steps: [
        { id: "claim", text: "Формулируем P(n): 1+3+…+(2n−1)=n²", requires: [], x: 90, y: 70 },
        { id: "base", text: "Проверяем P(1): 1=1²", requires: ["claim"], x: 90, y: 170 },
        { id: "hypothesis", text: "Предполагаем P(k)", requires: ["claim"], x: 360, y: 170 },
        { id: "append", text: "Добавляем следующий член 2k+1", requires: ["hypothesis"], x: 360, y: 270 },
        { id: "algebra", text: "k²+2k+1=(k+1)²", requires: ["append"], x: 360, y: 370 },
        { id: "conclusion", text: "Из базы и перехода следует P(n) для всех n≥1", requires: ["base", "algebra"], x: 650, y: 270 },
      ],
    },
    {
      id: "contrapositive",
      label: "Контрапозиция",
      steps: [
        { id: "claim", text: "Если n² чётно, то n чётно", requires: [], x: 100, y: 90 },
        { id: "contra", text: "Доказываем: если n нечётно, то n² нечётно", requires: ["claim"], x: 350, y: 180 },
        { id: "form", text: "Пишем n=2k+1", requires: ["contra"], x: 350, y: 280 },
        { id: "square", text: "n²=2(2k²+2k)+1 нечётно", requires: ["form"], x: 350, y: 380 },
        { id: "conclusion", text: "Контрапозиция завершает исходное доказательство", requires: ["square"], x: 650, y: 280 },
      ],
    },
    {
      id: "minimal-counterexample",
      label: "Минимальный контрпример",
      steps: [
        { id: "assume", text: "Предполагаем существование контрпримеров", requires: [], x: 100, y: 90 },
        { id: "minimum", text: "Берём наименьший контрпример m", requires: ["assume"], x: 330, y: 180 },
        { id: "reduce", text: "Строим меньший объект m′", requires: ["minimum"], x: 330, y: 290 },
        { id: "preserve", text: "Показываем, что m′ тоже контрпример", requires: ["reduce"], x: 330, y: 400 },
        { id: "conclusion", text: "Получено противоречие минимальности m", requires: ["preserve"], x: 650, y: 290 },
      ],
    },
  ];
  const BY_ID = new Map(SCENARIO_DEFINITIONS.map(function (scenario) { return [scenario.id, scenario]; }));
  const SCENARIOS = Object.freeze(SCENARIO_DEFINITIONS.map(function (scenario) {
    return Object.freeze({ id: scenario.id, label: scenario.label });
  }));

  function scenario(id) {
    const result = BY_ID.get(String(id));
    if (!result) throw new RangeError("unknown proof scenario: " + id);
    return result;
  }

  function validateScenario(rawScenario) {
    const ids = new Set(rawScenario.steps.map(function (step) { return step.id; }));
    if (ids.size !== rawScenario.steps.length) throw new Error("proof step ids must be unique");
    rawScenario.steps.forEach(function (step) {
      step.requires.forEach(function (required) {
        if (!ids.has(required)) throw new Error("unknown proof prerequisite: " + required);
      });
    });
    const visiting = new Set();
    const visited = new Set();
    const byId = new Map(rawScenario.steps.map(function (step) { return [step.id, step]; }));
    function visit(id) {
      if (visiting.has(id)) throw new Error("proof dependency cycle at " + id);
      if (visited.has(id)) return;
      visiting.add(id);
      byId.get(id).requires.forEach(visit);
      visiting.delete(id);
      visited.add(id);
    }
    rawScenario.steps.forEach(function (step) { visit(step.id); });
    return true;
  }
  SCENARIO_DEFINITIONS.forEach(validateScenario);

  function createState(scenarioId) {
    const selected = scenario(scenarioId || SCENARIOS[0].id);
    return Object.freeze({ scenarioId: selected.id, completed: Object.freeze([]), lastError: null, lastStepId: null });
  }

  function availableSteps(state) {
    const selected = scenario(state.scenarioId);
    const done = new Set(state.completed);
    return selected.steps.filter(function (step) {
      return !done.has(step.id) && step.requires.every(function (required) { return done.has(required); });
    }).map(function (step) { return step.id; });
  }

  function attemptStep(state, stepId) {
    const selected = scenario(state.scenarioId);
    const step = selected.steps.find(function (candidate) { return candidate.id === stepId; });
    if (!step) throw new RangeError("unknown proof step: " + stepId);
    if (state.completed.includes(step.id)) {
      return Object.freeze({ ok: false, state: state, message: "Этот шаг уже включён в доказательство; повтор не добавляет нового основания." });
    }
    const missing = step.requires.filter(function (required) { return !state.completed.includes(required); });
    if (missing.length) {
      const labels = missing.map(function (id) {
        return selected.steps.find(function (candidate) { return candidate.id === id; }).text;
      });
      const next = Object.freeze({ scenarioId: state.scenarioId, completed: state.completed, lastError: step.id, lastStepId: state.lastStepId });
      return Object.freeze({
        ok: false,
        state: next,
        missing: Object.freeze(missing),
        message: "Шаг пока не обоснован. Сначала нужны утверждения: " + labels.join("; ") + ".",
      });
    }
    const nextState = Object.freeze({
      scenarioId: state.scenarioId,
      completed: Object.freeze(state.completed.concat(step.id)),
      lastError: null,
      lastStepId: step.id,
    });
    return Object.freeze({ ok: true, state: nextState, message: "Шаг логически опирается на уже построенную часть доказательства." });
  }

  function step(state) {
    const nextId = availableSteps(state)[0];
    return nextId ? attemptStep(state, nextId).state : state;
  }

  function isFinished(state) {
    return state.completed.length === scenario(state.scenarioId).steps.length;
  }

  function graphModel(state) {
    const selected = scenario(state.scenarioId);
    const done = new Set(state.completed);
    const available = new Set(availableSteps(state));
    return shared.deepFreeze({
      width: 760,
      height: 470,
      nodes: selected.steps.map(function (item) {
        return {
          id: item.id, text: item.text, x: item.x, y: item.y,
          complete: done.has(item.id), available: available.has(item.id), blocked: state.lastError === item.id,
        };
      }),
      edges: selected.steps.flatMap(function (item) {
        return item.requires.map(function (required) {
          return { from: required, to: item.id, complete: done.has(required) && done.has(item.id), missing: state.lastError === item.id && !done.has(required) };
        });
      }),
    });
  }

  return {
    SCENARIOS: SCENARIOS,
    validateScenario: validateScenario,
    createState: createState,
    availableSteps: availableSteps,
    attemptStep: attemptStep,
    step: step,
    isFinished: isFinished,
    graphModel: graphModel,
  };
});
