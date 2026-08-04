const test = require("node:test");
const assert = require("node:assert/strict");

const runtime = require("../labs/sequence-lab-runtime.js");

test("sequence runtime splits Unicode by code points and enforces a limit", () => {
  assert.deepEqual(runtime.symbols("а🙂б", 3), ["а", "🙂", "б"]);
  assert.throws(() => runtime.symbols("abcd", 3), /не больше 3/);
});

test("strip geometry is deterministic and remains inside its width", () => {
  const cells = runtime.stripGeometry(8, { x: 10, width: 300, gap: 2 });
  assert.equal(cells.length, 8);
  assert.equal(cells[0].x, 10);
  assert.ok(cells.at(-1).x + cells.at(-1).width <= 310.001);
  assert.deepEqual(cells, runtime.stripGeometry(8, { x: 10, width: 300, gap: 2 }));
});

test("matrix geometry preserves row and column coordinates", () => {
  const matrix = runtime.matrixGeometry(3, 4, { x: 5, y: 7, cell: 20 });
  assert.deepEqual(matrix[2][3], {
    row: 2,
    column: 3,
    x: 65,
    y: 47,
    width: 20,
    height: 20,
    centerX: 75,
    centerY: 57,
  });
});
