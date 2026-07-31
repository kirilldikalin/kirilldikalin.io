const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const atlasRoot = path.join(__dirname, "..");
const graph = JSON.parse(
  fs.readFileSync(path.join(atlasRoot, "data/atlas-graph.json"), "utf8")
);
const registry = JSON.parse(
  fs.readFileSync(path.join(atlasRoot, "data/math-notations.json"), "utf8")
);

function publishedChapterFiles() {
  return graph.nodes
    .filter((node) => node.publication === "published")
    .map((node) => ({
      node,
      file: path.join(atlasRoot, node.route.replace(/^\.\//, "")),
    }));
}

function visibleSource(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[A-Za-z][\w:-]*(?:\s[^<>]*?)?\/?>/g, " ");
}

function mathDelimiterErrors(source) {
  const errors = [];
  const delimiters = /\\\(|\\\)|\\\[|\\\]|\$\$|(?<!\\)\$/g;
  const rawCommand = /\\[A-Za-z]+/g;
  let mode = null;
  let previousEnd = 0;
  let match;

  function findRawCommands(fragment, offset) {
    let command;
    rawCommand.lastIndex = 0;
    while ((command = rawCommand.exec(fragment)) !== null) {
      errors.push(
        "TeX command outside math at character " +
        (offset + command.index) + ": " + command[0]
      );
    }
  }

  while ((match = delimiters.exec(source)) !== null) {
    if (mode === null) {
      findRawCommands(source.slice(previousEnd, match.index), previousEnd);
      if (match[0] === "\\(") {
        mode = { name: "inline", expected: "\\)" };
      } else if (match[0] === "\\[") {
        mode = { name: "display", expected: "\\]" };
      } else if (match[0] === "$") {
        mode = { name: "inline", expected: "$" };
      } else if (match[0] === "$$") {
        mode = { name: "display", expected: "$$" };
      } else {
        errors.push("closing delimiter without opener at character " + match.index);
      }
    } else {
      const expected = mode.expected;
      if (match[0] !== expected) {
        errors.push(
          "expected " + expected + " before " + match[0] +
          " at character " + match.index
        );
      } else {
        mode = null;
        previousEnd = delimiters.lastIndex;
      }
    }
  }

  if (mode !== null) {
    errors.push("unclosed " + mode.name + " math delimiter");
  } else {
    findRawCommands(source.slice(previousEnd), previousEnd);
  }
  return errors;
}

test("all visible chapter TeX has balanced delimiters and no raw commands", () => {
  publishedChapterFiles().forEach(({ node, file }) => {
    const source = visibleSource(fs.readFileSync(file, "utf8"));
    assert.deepEqual(
      mathDelimiterErrors(source),
      [],
      node.id + " contains malformed visible TeX"
    );
  });

  const firstChapter = fs.readFileSync(
    path.join(atlasRoot, "chapters/before-computers.html"),
    "utf8"
  );
  assert.match(firstChapter, /\\\(\\lfloor a\/2\\rfloor&lt;a\\\)/);
});

test("the notation registry has stable unique entries and valid definitions", () => {
  assert.equal(registry.schemaVersion, 1);
  assert.ok(Array.isArray(registry.entries));
  const ids = new Set();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  registry.entries.forEach((entry) => {
    assert.match(entry.id, /^[a-z0-9-]+$/);
    assert.equal(ids.has(entry.id), false, "duplicate notation " + entry.id);
    ids.add(entry.id);
    assert.ok(entry.displayNotation);
    assert.ok(entry.shortName);
    assert.ok(entry.explanation);
    assert.ok(entry.scope === "global" || entry.scope === "local");
    if (entry.scope === "local") {
      assert.ok(nodeById.has(entry.chapterId));
    } else {
      assert.equal(entry.chapterId, null);
    }

    const definitionNode = nodeById.get(entry.firstDefinition.chapterId);
    assert.ok(definitionNode, "unknown definition chapter for " + entry.id);
    assert.equal(definitionNode.publication, "published");
    const definitionFile = path.join(
      atlasRoot,
      definitionNode.route.replace(/^\.\//, "")
    );
    const definitionHtml = fs.readFileSync(definitionFile, "utf8");
    assert.match(
      definitionHtml,
      new RegExp(
        'id=["\\\']' +
        entry.firstDefinition.anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        '["\\\']'
      ),
      "missing definition anchor for " + entry.id
    );
  });

  [
    "state-space-s",
    "state-s-t",
    "transition-f",
    "input-set-x",
    "output-set-y",
    "partial-function-f",
    "partial-arrow",
    "gcd",
    "modulo",
    "quotient-q",
    "remainder-r",
    "tm-state-set-q",
    "input-alphabet-sigma",
    "tape-alphabet-gamma",
    "transition-delta",
    "input-length",
    "running-time-on-input",
    "accept-state",
    "reject-state",
    "tm-halting-states",
    "cost-function-fn",
    "comparison-function-gn",
    "asymptotic-constant-c",
    "theta-lower-constant-c1",
    "theta-upper-constant-c2",
    "asymptotic-threshold-n0",
    "big-o-class",
    "big-omega-class",
    "big-theta-class",
    "little-o-class",
    "little-omega-class",
    "exists-quantifier",
    "forall-positive-constant",
    "forall-tail-quantifier",
    "growth-ratio",
    "recurrence-function",
    "relation-r",
    "induction-proposition",
    "hoare-triple",
    "loop-invariant",
    "loop-variant",
    "binomial-coefficient",
    "sample-space",
    "conditional-probability",
    "random-variable",
    "expectation",
    "variance",
    "model-cost",
    "operation-cost",
    "unit-cost",
    "word-size-w",
    "worst-case",
    "average-case",
    "amortized-bound",
    "potential-function",
    "amortized-cost",
    "polynomial-time",
  ].forEach((id) => assert.ok(ids.has(id), "missing required notation " + id));
});

test("every explicit notation trigger exists and respects local scope", () => {
  const entries = new Map(registry.entries.map((entry) => [entry.id, entry]));
  const used = new Set();

  publishedChapterFiles().forEach(({ node, file }) => {
    const html = fs.readFileSync(file, "utf8");
    const pattern =
      /\\class\{atlas-notation-token notation-id-([a-z0-9-]+)\}/g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const entry = entries.get(match[1]);
      assert.ok(entry, "unknown notation trigger " + match[1]);
      if (entry.scope === "local") {
        assert.equal(
          entry.chapterId,
          node.id,
          "local notation used outside its chapter: " + entry.id
        );
      }
      used.add(entry.id);
    }
  });

  assert.ok(used.size >= 15, "too few key notations are explicitly annotated");
});

test("chapter controls keep labels and accessible regions structurally valid", () => {
  publishedChapterFiles().forEach(({ node, file }) => {
    const html = fs.readFileSync(file, "utf8");
    const labels = html.match(/<label\b[^>]*>[\s\S]*?<\/label>/gi) || [];
    labels.forEach((label) => {
      assert.doesNotMatch(
        label,
        /<output\b/i,
        node.id + " nests an output inside a label"
      );
    });

    assert.doesNotMatch(
      html,
      /<(?:div|pre)\b(?=[^>]*\baria-(?:label|labelledby)=)(?![^>]*\brole=)[^>]*>/i,
      node.id + " gives a generic element an accessible name without a role"
    );
  });
});

test("notation references are MathJax tokens with keyboard popover controls", () => {
  publishedChapterFiles().forEach(({ node, file }) => {
    const html = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      html,
      /class="atlas-notation-ref"/,
      node.id + " still renders a separate notation button"
    );
    assert.match(html, /load: \['\[tex\]\/html'\]/);
    assert.match(html, /packages: \{'\[\+\]': \['html'\]\}/);
  });

  const firstChapter = fs.readFileSync(
    path.join(atlasRoot, "chapters/before-computers.html"),
    "utf8"
  );
  assert.match(
    firstChapter,
    /\\class\{atlas-notation-token notation-id-partial-function-f\}\{f\}[\s\S]*?\\class\{atlas-notation-token notation-id-input-set-x\}\{X\}[\s\S]*?\\class\{atlas-notation-token notation-id-partial-arrow\}\{\\rightharpoonup\}[\s\S]*?\\class\{atlas-notation-token notation-id-output-set-y\}\{Y\}/
  );

  const asymptotics = fs.readFileSync(
    path.join(atlasRoot, "chapters/asymptotic-estimates.html"),
    "utf8"
  );
  assert.match(
    asymptotics,
    /notation-id-big-o-class[\s\S]*?notation-id-asymptotic-constant-c[\s\S]*?notation-id-asymptotic-threshold-n0[\s\S]*?notation-id-forall-tail-quantifier/
  );
  assert.doesNotMatch(asymptotics, /class="atlas-notation-ref"/);

  const chapterScript = fs.readFileSync(path.join(atlasRoot, "chapter.js"), "utf8");
  assert.match(chapterScript, /setAttribute\("aria-controls", popover\.root\.id\)/);
  assert.match(chapterScript, /setAttribute\("role", "button"\)/);
  assert.match(chapterScript, /tabIndex = 0/);
  assert.match(chapterScript, /event\.key === "Enter"/);
  assert.match(
    chapterScript,
    /trigger\.closest\("mjx-assistive-mml"\)/,
    "assistive MathML copies must not become duplicate keyboard controls"
  );
});

test("asymptotic formulas and verdicts preserve their quantifiers", () => {
  const html = fs.readFileSync(
    path.join(atlasRoot, "chapters/asymptotic-estimates.html"),
    "utf8"
  );
  const labScript = fs.readFileSync(
    path.join(atlasRoot, "labs/asymptotics.js"),
    "utf8"
  );

  assert.match(
    html,
    /notation-id-cost-function-fn\}\{f\},\s*\\class\{atlas-notation-token notation-id-comparison-function-gn\}\{g\}\s*\\colon/
  );
  assert.doesNotMatch(html, /notation-id-cost-function-fn\}\{f\(n\)\}\s*\\in/);
  assert.match(
    html,
    /notation-id-big-o-class\}\{O\}\s*\\bigl\(\\class\{atlas-notation-token notation-id-comparison-function-gn\}\{g\}\\bigr\)/
  );
  assert.match(html, /notation-id-forall-positive-constant/);
  assert.doesNotMatch(
    labScript,
    /Одного нарушения достаточно, чтобы универсальное утверждение было ложным/
  );
  assert.match(
    labScript,
    /result\.relationHolds && result\.witnessValid/
  );
  assert.match(labScript, /result\.selectedConstantBenign/);
});

test("short chapter and map descriptions have no terminal punctuation", () => {
  publishedChapterFiles().forEach(({ node, file }) => {
    const html = fs.readFileSync(file, "utf8");
    const intro = html.match(
      /<p class="atlas-chapter-intro">([\s\S]*?)<\/p>/
    );
    assert.ok(intro, node.id + " has no chapter intro");
    const text = intro[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    assert.doesNotMatch(text, /[.!?…]$/, node.id + " intro ends with punctuation");
  });

  graph.continents.concat(graph.nodes).forEach((item) => {
    assert.doesNotMatch(
      item.description,
      /[.!?…]$/,
      item.id + " map description ends with punctuation"
    );
  });
});

test("chapter TOC has a guarded contiguous desktop panel and wide-only pinning", () => {
  const chapterScript = fs.readFileSync(path.join(atlasRoot, "chapter.js"), "utf8");
  const chapterStyles = fs.readFileSync(path.join(atlasRoot, "chapter.css"), "utf8");
  const closeDelay = chapterScript.match(/const TOC_CLOSE_DELAY_MS = (\d+);/);

  assert.ok(closeDelay, "TOC close guard is not declared");
  assert.ok(Number(closeDelay[1]) >= 400 && Number(closeDelay[1]) <= 600);
  assert.match(chapterScript, /const TOC_PIN_MEDIA = "\(min-width: 90rem\)";/);
  assert.match(
    chapterScript,
    /toc\.addEventListener\("mouseleave", function \(\) \{\s*scheduleCloseGuard\(\);/
  );
  assert.match(
    chapterStyles,
    /\.atlas-toc-panel\s*\{[\s\S]*?inset-inline-start:\s*100%;/
  );
  assert.match(
    chapterStyles,
    /@media \(min-width: 90rem\) \{[\s\S]*?inset-inline-end:\s*100%;[\s\S]*?\.atlas-toc-pin:not\(\[hidden\]\)/
  );
  assert.match(
    chapterScript,
    /closeAfterSelection:[\s\S]*?matchMedia\("\(max-width: 50rem\)"\)\.matches/
  );
});

test("wide chapter titles stay inside the content column beside the TOC", () => {
  const chapterStyles = fs.readFileSync(path.join(atlasRoot, "chapter.css"), "utf8");

  assert.match(
    chapterStyles,
    /\.atlas-chapter-header h1\s*\{[\s\S]*?max-width:\s*52rem;[\s\S]*?margin:\s*0\.2em auto 0\.35em;[\s\S]*?text-wrap:\s*balance;/
  );
  assert.match(
    chapterStyles,
    /@media \(min-width: 50\.0625rem\) \{\s*\.atlas-chapter-header h1\s*\{\s*width:\s*min\(48rem, calc\(100% - 8rem\)\);/
  );
  assert.match(
    chapterStyles,
    /@media \(min-width: 50\.0625rem\) and \(max-width: 60rem\) \{\s*\.atlas-chapter-content\s*\{\s*width:\s*min\(52rem, calc\(100% - 7rem\)\);/
  );
});

test("page boundaries and adjacent sections have distinct keyboard buttons", () => {
  const chapterScript = fs.readFileSync(path.join(atlasRoot, "chapter.js"), "utf8");

  assert.match(chapterScript, /pageStart\.textContent = "⇈";/);
  assert.match(chapterScript, /pageStart\.title = "В начало страницы";/);
  assert.match(
    chapterScript,
    /pageStart\.setAttribute\("aria-label", "В начало страницы"\);/
  );
  assert.match(chapterScript, /pageEnd\.textContent = "⇊";/);
  assert.match(chapterScript, /pageEnd\.title = "В конец страницы";/);
  assert.match(
    chapterScript,
    /pageEnd\.setAttribute\("aria-label", "В конец страницы"\);/
  );
  assert.match(chapterScript, /root\.append\(pageStart, previous, next, pageEnd\);/);
  assert.match(chapterScript, /sectionNavigation\.previous\.disabled = true;/);
  assert.match(chapterScript, /sectionNavigation\.next\.disabled = true;/);
});
