const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const atlasRoot = path.join(__dirname, "..");
const graph = JSON.parse(
  fs.readFileSync(path.join(atlasRoot, "data/atlas-graph.json"), "utf8")
);
const auditedContinents = new Set([
  "origins-efficiency",
  "mathematical-tools",
  "data-structures",
  "algorithm-design",
  "graphs-networks-optimization",
]);

function renderedText(html) {
  return html
    .replace(/<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) =>
      String.fromCodePoint(Number.parseInt(value, 16))
    )
    .replace(/&#(\d+);/g, (_, value) =>
      String.fromCodePoint(Number.parseInt(value, 10))
    )
    .replace(/&grave;/gi, "`");
}

function markdownDelimiterMatches(text) {
  const checks = [
    ["backtick", /`[^`\n]+`|`+/g],
    ["tilde fence", /(?:^|\n)\s*~~~+/g],
    ["bold emphasis", /\*\*(?=\S)(?:(?!\*\*)[^\n])*\S\*\*/g],
    ["underscore emphasis", /__(?=\S)(?:(?!__)[^\n])*\S__/g],
    ["strikethrough", /~~(?=\S)(?:(?!~~)[^\n])*\S~~/g],
    ["Markdown link", /!?\[[^\]\n]+\]\([^\)\n]+\)/g],
    ["ATX heading", /(?:^|\n)\s{0,3}#{1,6}\s+\S/g],
  ];

  return checks.flatMap(([name, pattern]) =>
    Array.from(text.matchAll(pattern), (match) => ({
      name,
      value: match[0].trim(),
      offset: match.index,
    }))
  );
}

test("all published atlas chapters contain no rendered Markdown delimiters", () => {
  const chapters = graph.nodes.filter(
    (node) =>
      node.publication === "published" &&
      auditedContinents.has(node.continentId)
  );

  assert.equal(chapters.length, 57, "expected all 57 published chapters of continents 01-05");

  for (const node of chapters) {
    const file = path.join(atlasRoot, node.route.replace(/^\.\//, ""));
    const text = renderedText(fs.readFileSync(file, "utf8"));
    assert.deepEqual(
      markdownDelimiterMatches(text),
      [],
      node.id + " exposes Markdown delimiters in rendered prose"
    );
  }
});

test("the audit ignores source examples and detects visible delimiters", () => {
  const excluded = renderedText(
    "<script>`template`</script><style>```</style><pre>```text</pre><code>`id`</code>"
  );
  assert.deepEqual(markdownDelimiterMatches(excluded), []);

  const visible = renderedText(
    "<p>`id`</p><p>**bold**</p><p>[label](https://example.com)</p>"
  );
  assert.deepEqual(
    markdownDelimiterMatches(visible).map((match) => match.name),
    ["backtick", "bold emphasis", "Markdown link"]
  );
});
