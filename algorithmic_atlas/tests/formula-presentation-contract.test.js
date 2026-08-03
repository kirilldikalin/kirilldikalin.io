"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const atlasRoot = path.join(__dirname, "..");
const graph = readJson(path.join(atlasRoot, "data/atlas-graph.json"));
const registry = readJson(path.join(atlasRoot, "data/math-notations.json"));
const policy = readJson(
  path.join(__dirname, "formula-presentation-policy.json")
);

const TOKEN_MARKER = "\\class{atlas-notation-token notation-id-";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Keep this normalization in sync with the reviewed atlas-formula-v1 policy.
function stripNotationTokenWrappers(source) {
  const marker = TOKEN_MARKER;
  let text = String(source);
  let searchFrom = 0;
  while (true) {
    const start = text.indexOf(marker, searchFrom);
    if (start === -1) return text;
    const idEnd = text.indexOf("}", start + marker.length);
    if (idEnd === -1) return text;
    let contentOpen = idEnd + 1;
    while (/\s/.test(text[contentOpen] || "")) contentOpen += 1;
    if (text[contentOpen] !== "{") return text;
    const contentStart = contentOpen + 1;
    let depth = 1;
    let cursor = contentStart;
    while (cursor < text.length && depth > 0) {
      const escaped = cursor > 0 && text[cursor - 1] === "\\";
      if (!escaped && text[cursor] === "{") depth += 1;
      if (!escaped && text[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) return text;
    const content = text.slice(contentStart, cursor - 1);
    text = text.slice(0, start) + content + text.slice(cursor);
    searchFrom = start + content.length;
  }
}

function decodeFormulaEntities(source) {
  return String(source)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16))
    )
    .replace(/&#([0-9]+);/g, (_, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 10))
    );
}

function canonicalizeFormula(rawTeX) {
  return decodeFormulaEntities(stripNotationTokenWrappers(rawTeX))
    .replace(/\s+/g, "")
    .replace(/\\[,;]/g, "");
}

function formulaFingerprint(rawTeX) {
  return "sha256:" + crypto
    .createHash("sha256")
    .update(canonicalizeFormula(rawTeX), "utf8")
    .digest("hex");
}

function maskIgnoredHtml(source) {
  return String(source).replace(
    /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,
    (fragment) => " ".repeat(fragment.length)
  );
}

function parseAttributes(openTag) {
  const attributes = {};
  const body = openTag
    .replace(/^<[^\s>]+/, "")
    .replace(/\/?>\s*$/, "");
  const pattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    attributes[match[1].toLowerCase()] = decodeFormulaEntities(
      match[2] ?? match[3] ?? match[4] ?? ""
    );
  }
  return attributes;
}

function closingDiv(source, afterOpen) {
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = afterOpen;
  let depth = 1;
  let match;
  while ((match = tags.exec(source)) !== null) {
    depth += /^<\/div/i.test(match[0]) ? -1 : 1;
    if (depth === 0) {
      return { start: match.index, end: tags.lastIndex };
    }
  }
  throw new Error("atlas-math wrapper has no closing </div>");
}

function displayFragments(source) {
  const fragments = [];
  const delimiters = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g;
  let match;
  while ((match = delimiters.exec(source)) !== null) {
    fragments.push({
      rawTeX: match[1] ?? match[2],
      offset: match.index,
    });
  }
  return fragments;
}

function extractDisplayFormulaWrappers(html) {
  const source = maskIgnoredHtml(html);
  const wrappers = [];
  const openDiv = /<div\b[^>]*>/gi;
  let match;
  while ((match = openDiv.exec(source)) !== null) {
    const attributes = parseAttributes(match[0]);
    const classNames = (attributes.class || "").split(/\s+/).filter(Boolean);
    if (!classNames.includes("atlas-math")) continue;
    const close = closingDiv(source, openDiv.lastIndex);
    const body = source.slice(openDiv.lastIndex, close.start);
    wrappers.push({
      attributes,
      body,
      offset: match.index,
      fragments: displayFragments(body),
    });
    openDiv.lastIndex = close.end;
  }
  return wrappers;
}

function scanNotationTokens(source) {
  const tokens = [];
  let searchFrom = 0;
  while (true) {
    const start = source.indexOf(TOKEN_MARKER, searchFrom);
    if (start === -1) return tokens;
    const idEnd = source.indexOf("}", start + TOKEN_MARKER.length);
    if (idEnd === -1) throw new Error("notation token has no closing class brace");
    const id = source.slice(start + TOKEN_MARKER.length, idEnd);
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new Error("invalid notation token id: " + id);
    }
    let contentOpen = idEnd + 1;
    while (/\s/.test(source[contentOpen] || "")) contentOpen += 1;
    if (source[contentOpen] !== "{") {
      throw new Error("notation token " + id + " has no content group");
    }
    let depth = 1;
    let cursor = contentOpen + 1;
    while (cursor < source.length && depth > 0) {
      const escaped = cursor > 0 && source[cursor - 1] === "\\";
      if (!escaped && source[cursor] === "{") depth += 1;
      if (!escaped && source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) throw new Error("notation token " + id + " is unclosed");
    tokens.push({
      id,
      content: source.slice(contentOpen + 1, cursor - 1),
    });
    searchFrom = cursor;
  }
}

function parseRequiredIds(raw) {
  if (raw === undefined || raw === "") return [];
  const ids = raw.split(",").map((id) => id.trim());
  if (ids.some((id) => !/^[a-z0-9-]+$/.test(id))) {
    throw new Error("invalid data-required-notations list: " + raw);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("duplicate data-required-notations entry: " + raw);
  }
  return ids;
}

function sameSet(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && Array.from(a).every((value) => b.has(value));
}

function formulaKey(chapterId, fingerprint) {
  return chapterId + "|" + fingerprint;
}

function publishedNodes(continentIds = policy.snapshot.publishedContinents) {
  const allowed = new Set(continentIds);
  return graph.nodes.filter(
    (node) => node.publication === "published" && allowed.has(node.continentId)
  );
}

function collectFormulas(nodes) {
  const formulas = [];
  const wrappers = [];
  for (const node of nodes) {
    const file = path.join(atlasRoot, node.route.replace(/^\.\//, ""));
    const html = fs.readFileSync(file, "utf8");
    const chapterWrappers = extractDisplayFormulaWrappers(html);
    for (const wrapper of chapterWrappers) {
      wrappers.push({ node, file, wrapper });
      for (const fragment of wrapper.fragments) {
        const tokens = scanNotationTokens(fragment.rawTeX);
        formulas.push({
          node,
          file,
          wrapper,
          rawTeX: fragment.rawTeX,
          fingerprint: formulaFingerprint(fragment.rawTeX),
          tokens,
          tokenIds: tokens.map(({ id }) => id),
        });
      }
    }
  }
  return { formulas, wrappers };
}

function validateFormulaMetadata(formulas, options = {}) {
  const errors = [];
  const includedChapters = new Set(formulas.map(({ node }) => node.id));
  const registryMap = new Map(registry.entries.map((entry) => [entry.id, entry]));
  const allowlist = new Map(
    policy.basicAllowlist.map((entry) => [
      formulaKey(entry.chapterId, entry.fingerprint),
      entry,
    ])
  );
  const seenIds = new Map();
  const seenFingerprints = new Map();
  const seenBasic = new Set();
  let basicCount = 0;
  let interactiveCount = 0;

  for (const formula of formulas) {
    const attrs = formula.wrapper.attributes;
    const label = formula.node.id + ":" + formula.fingerprint;
    const id = attrs["data-formula-id"];
    const coverage = attrs["data-notation-coverage"];
    const reason = attrs["data-basic-reason"];
    let required = [];
    try {
      required = parseRequiredIds(attrs["data-required-notations"]);
    } catch (error) {
      errors.push(label + " " + error.message);
    }

    if (!id || !/^[a-z0-9][a-z0-9.-]*$/.test(id)) {
      errors.push(label + " has no stable data-formula-id");
    } else if (seenIds.has(id)) {
      errors.push(id + " duplicates formula id from " + seenIds.get(id));
    } else {
      seenIds.set(id, label);
    }

    const key = formulaKey(formula.node.id, formula.fingerprint);
    if (seenFingerprints.has(key)) {
      errors.push(label + " duplicates a mathematical fingerprint");
    } else {
      seenFingerprints.set(key, formula);
    }

    const allowedBasic = allowlist.get(key);
    if (allowedBasic) {
      seenBasic.add(key);
      basicCount += 1;
      if (coverage !== "basic") {
        errors.push(label + " is reviewed basic but coverage is " + coverage);
      }
      if (!policy.metadata.basicReasonValues.includes(reason)) {
        errors.push(label + " has invalid or missing data-basic-reason");
      }
      if (required.length > 0) {
        errors.push(label + " basic formula declares required notations");
      }
    } else {
      interactiveCount += 1;
      if (coverage !== "interactive") {
        errors.push(label + " must have interactive coverage");
      }
      if (reason !== undefined) {
        errors.push(label + " interactive formula has a basic reason");
      }
      if (required.length === 0) {
        errors.push(label + " has no data-required-notations");
      }
      if (formula.tokens.length === 0) {
        errors.push(label + " has no notation tokens");
      }
    }

    const actualIds = new Set(formula.tokenIds);
    for (const notationId of required) {
      if (!actualIds.has(notationId)) {
        errors.push(label + " requires absent notation " + notationId);
      }
    }
    for (const token of formula.tokens) {
      if (token.content.includes(TOKEN_MARKER)) {
        errors.push(label + " nests notation token " + token.id);
      }
      if (options.skipRegistry) continue;
      const entry = registryMap.get(token.id);
      if (!entry) {
        errors.push(label + " uses unknown notation " + token.id);
      } else if (
        entry.scope === "local" && entry.chapterId !== formula.node.id
      ) {
        errors.push(label + " uses out-of-scope notation " + token.id);
      }
    }
    if (!options.skipRegistry) {
      for (const notationId of required) {
        const entry = registryMap.get(notationId);
        if (!entry) {
          errors.push(label + " requires unknown notation " + notationId);
        } else if (
          entry.scope === "local" && entry.chapterId !== formula.node.id
        ) {
          errors.push(label + " requires out-of-scope notation " + notationId);
        }
      }
    }
  }

  for (const entry of policy.basicAllowlist) {
    if (!includedChapters.has(entry.chapterId)) continue;
    const key = formulaKey(entry.chapterId, entry.fingerprint);
    if (!seenBasic.has(key)) errors.push("stale basic allowlist entry " + key);
  }

  return {
    errors,
    basicCount,
    interactiveCount,
    seenFingerprints,
  };
}

test("formula presentation policy is a closed reviewed snapshot", () => {
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.snapshot.publishedChapterCount, 54);
  assert.equal(policy.snapshot.displayFormulaTotal, 478);
  assert.equal(policy.snapshot.basicFormulaTotal, 35);
  assert.equal(policy.snapshot.interactiveFormulaTotal, 443);
  assert.equal(
    policy.snapshot.basicFormulaTotal + policy.snapshot.interactiveFormulaTotal,
    policy.snapshot.displayFormulaTotal
  );
  assert.equal(policy.basicAllowlist.length, 35);
  assert.equal(policy.complexMinimumTokenOccurrences.length, 45);
  assert.equal(policy.bloomExactRequiredNotations.length, 2);

  const basicKeys = policy.basicAllowlist.map((entry) =>
    formulaKey(entry.chapterId, entry.fingerprint)
  );
  const complexKeys = policy.complexMinimumTokenOccurrences.map((entry) =>
    formulaKey(entry.chapterId, entry.fingerprint)
  );
  assert.equal(new Set(basicKeys).size, basicKeys.length);
  assert.equal(new Set(complexKeys).size, complexKeys.length);
  policy.bloomExactRequiredNotations.forEach((entry) => {
    assert.equal(
      new Set(entry.requiredNotationIds).size,
      entry.requiredNotationIds.length
    );
    assert.ok(entry.requiredNotationIds.length > 0);
  });
});

test("formula fingerprint ignores presentation tokens but preserves mathematics", () => {
  const plain = String.raw`f(n) &lt; c\,g(n) + \frac{1}{n}`;
  const tokenized = String.raw`
    \class{atlas-notation-token notation-id-cost-function-fn}{f(n)}
    &lt;
    \class{atlas-notation-token notation-id-asymptotic-constant-c}{c}\;
    \class{atlas-notation-token notation-id-comparison-function-gn}{g(n)}
    +\frac{1}{n}`;
  assert.equal(canonicalizeFormula(plain), canonicalizeFormula(tokenized));
  assert.equal(formulaFingerprint(plain), formulaFingerprint(tokenized));
  assert.notEqual(formulaFingerprint(plain), formulaFingerprint(plain + "+1"));
});

test("display formula parser ignores non-content blocks and extracts fragments", () => {
  const fixture = String.raw`
    <script>const fake = "\\[x\\]";</script>
    <style>.fake::after { content: "$$y$$"; }</style>
    <!-- \\[z\\] -->
    <div class="atlas-math atlas-notation-formula"
      data-formula-id="fixture-one"
      data-notation-coverage="interactive"
      data-required-notations="input-set-x">
      \\[\class{atlas-notation-token notation-id-input-set-x}{X}\subseteq Y\\]
    </div>
    <div class="atlas-math" data-formula-id="fixture-two"
      data-notation-coverage="basic" data-basic-reason="elementary-identity">
      $$a+b=b+a$$
    </div>`;
  const wrappers = extractDisplayFormulaWrappers(fixture);
  assert.equal(wrappers.length, 2);
  assert.deepEqual(wrappers.map(({ fragments }) => fragments.length), [1, 1]);
  assert.equal(wrappers[0].attributes["data-formula-id"], "fixture-one");
  assert.deepEqual(
    scanNotationTokens(wrappers[0].fragments[0].rawTeX).map(({ id }) => id),
    ["input-set-x"]
  );
  assert.equal(sameSet(["a", "b"], ["b", "a"]), true);
  assert.equal(sameSet(["a"], ["a", "b"]), false);
});

test("notation parser exposes nesting and malformed metadata", () => {
  const nested = String.raw`\class{atlas-notation-token notation-id-outer}{
    x+\class{atlas-notation-token notation-id-inner}{y}}`;
  const tokens = scanNotationTokens(nested);
  assert.equal(tokens.length, 1);
  assert.match(tokens[0].content, /notation-id-inner/);
  assert.throws(() => parseRequiredIds("a,a"), /duplicate/);
  assert.throws(() => parseRequiredIds("a,not_valid"), /invalid/);
});

test("the five published origin chapters expose 44 classified formulas", () => {
  const nodes = publishedNodes(["origins-efficiency"]);
  const { formulas, wrappers } = collectFormulas(nodes);
  assert.equal(nodes.length, 5);
  assert.equal(wrappers.length, 44);
  assert.equal(formulas.length, 44);
  assert.ok(wrappers.every(({ wrapper }) => wrapper.fragments.length === 1));
  const result = validateFormulaMetadata(formulas, { skipRegistry: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.basicCount, 9);
  assert.equal(result.interactiveCount, 35);
});

test("all published continents obey the formula presentation policy", () => {
  const nodes = publishedNodes();
  const { formulas, wrappers } = collectFormulas(nodes);
  const errors = [];

  if (nodes.length !== policy.snapshot.publishedChapterCount) {
    errors.push("published chapter count is " + nodes.length);
  }
  if (formulas.length !== policy.snapshot.displayFormulaTotal) {
    errors.push("display formula count is " + formulas.length);
  }
  for (const { node, wrapper } of wrappers) {
    if (wrapper.fragments.length !== 1) {
      errors.push(
        node.id + " atlas-math wrapper contains " +
        wrapper.fragments.length + " display formulas"
      );
    }
  }

  const result = validateFormulaMetadata(formulas);
  errors.push(...result.errors);
  if (result.basicCount !== policy.snapshot.basicFormulaTotal) {
    errors.push("basic formula count is " + result.basicCount);
  }
  if (result.interactiveCount !== policy.snapshot.interactiveFormulaTotal) {
    errors.push("interactive formula count is " + result.interactiveCount);
  }

  for (const entry of policy.complexMinimumTokenOccurrences) {
    const key = formulaKey(entry.chapterId, entry.fingerprint);
    const formula = result.seenFingerprints.get(key);
    if (!formula) {
      errors.push("stale complex-formula policy entry " + key);
    } else if (formula.tokens.length < entry.minTokenOccurrences) {
      errors.push(
        key + " has " + formula.tokens.length + " notation tokens; expected at least " +
        entry.minTokenOccurrences
      );
    }
  }

  for (const entry of policy.bloomExactRequiredNotations) {
    const key = formulaKey(entry.chapterId, entry.fingerprint);
    const formula = result.seenFingerprints.get(key);
    if (!formula) {
      errors.push("missing Bloom matrix formula " + key);
      continue;
    }
    const actualFormulaId = formula.wrapper.attributes["data-formula-id"];
    if (actualFormulaId !== entry.formulaId) {
      errors.push(key + " has formula id " + actualFormulaId);
    }
    let declared = [];
    try {
      declared = parseRequiredIds(
        formula.wrapper.attributes["data-required-notations"]
      );
    } catch (error) {
      errors.push(key + " " + error.message);
    }
    if (!sameSet(declared, entry.requiredNotationIds)) {
      errors.push(key + " does not declare the exact Bloom notation set");
    }
    if (!sameSet(formula.tokenIds, entry.requiredNotationIds)) {
      errors.push(key + " does not render the exact Bloom notation set");
    }
    if (formula.tokens.length < entry.minTokenOccurrences) {
      errors.push(key + " has too few Bloom notation tokens");
    }
  }

  assert.deepEqual(errors, []);
});
