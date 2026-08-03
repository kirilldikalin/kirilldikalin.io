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
const auditedNodes = graph.nodes.filter(
  (node) => node.publication === "published" && auditedContinents.has(node.continentId)
);
const layoutCss = fs.readFileSync(
  path.join(atlasRoot, "labs/lab-layout.css"),
  "utf8"
);
const runtimeSource = fs.readFileSync(
  path.join(atlasRoot, "labs/lab-runtime.js"),
  "utf8"
);

function localStylesheets(html, pagePath) {
  return Array.from(html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g), (match) =>
    path.resolve(path.dirname(pagePath), match[1])
  );
}

test("the 57 published laboratories of continents 01-05 load the shared layout", () => {
  assert.equal(auditedNodes.length, 57);
  for (const node of auditedNodes) {
    const pagePath = path.join(atlasRoot, node.route.replace(/^algorithmic_atlas\//, ""));
    const html = fs.readFileSync(pagePath, "utf8");
    assert.match(html, /data-atlas-block="lab"/, `${node.curriculumId} has no laboratory block`);

    const stylesheets = localStylesheets(html, pagePath);
    const importsLayout = stylesheets.some((stylesheet) => {
      if (!fs.existsSync(stylesheet)) return false;
      return /@import\s+url\(["']lab-layout\.css["']\)/.test(
        fs.readFileSync(stylesheet, "utf8")
      );
    });
    assert.equal(importsLayout, true, `${node.curriculumId} does not load lab-layout.css`);
  }
});

test("the shared contract gives the workspace a full independent grid row", () => {
  assert.match(
    layoutCss,
    /\.atlas-lab\s*>\s*\.atlas-lab__workspace\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*width:\s*100%/s
  );
  assert.match(layoutCss, /\.euclid-lab\s+\.euclid-visual-grid,[\s\S]*\.turing-lab\s+\.turing-workbench,[\s\S]*\.asymptotics-lab\s+\.asymptotics-detail-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(layoutCss, /overflow-x:\s*auto/);
  assert.match(layoutCss, /width:\s*max\(100%,\s*var\(--atlas-lab-readable-visual-width\)\)/);
  assert.doesNotMatch(layoutCss, /transform:\s*scale\b/);
});

test("controls precede the full-width visual area on desktop and mobile", () => {
  assert.match(
    runtimeSource,
    /rootElement\.append\(intro,\s*controls,\s*transport,\s*error,\s*status,\s*workspace\)/
  );

  const manualOrder = [
    ["before-computers.html", "egyptian-lab__form", "egyptian-geometry-panel"],
    ["euclidean-algorithm.html", "euclid-lab__form", "euclid-visual-grid"],
    ["turing-machine-transition.html", "turing-lab__form", "turing-workbench"],
    ["input-size-and-cost.html", "input-size-form", "input-size-encoding-panel"],
    ["asymptotic-estimates.html", "asymptotics-controls", "asymptotics-plot-wrap"],
  ];
  for (const [file, controlsClass, visualClass] of manualOrder) {
    const html = fs.readFileSync(path.join(atlasRoot, "chapters", file), "utf8");
    assert.ok(html.indexOf(controlsClass) >= 0, `${file} has no controls`);
    assert.ok(html.indexOf(visualClass) > html.indexOf(controlsClass), `${file} draws before controls`);
  }
});

test("the shared SVG contract uses layout width rather than CSS scaling", () => {
  const visualClasses = [
    "atlas-lab__visual",
    "egyptian-geometry",
    "euclid-geometry",
    "turing-state-graph",
    "input-size-encoding-geometry",
    "asymptotics-plot",
    "asymptotics-ratio",
  ];
  for (const className of visualClasses) {
    assert.match(layoutCss, new RegExp("\\." + className.replace(/-/g, "\\-") + "(?:,|\\s*\\{)"));
  }

  const labCss = fs.readdirSync(path.join(atlasRoot, "labs"))
    .filter((file) => file.endsWith(".css"))
    .map((file) => fs.readFileSync(path.join(atlasRoot, "labs", file), "utf8"))
    .join("\n");
  assert.doesNotMatch(labCss, /transform\s*:\s*scale(?:X|Y|3d)?\s*\(/i);
});
