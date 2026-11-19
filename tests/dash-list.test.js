const test = require("node:test")
const assert = require("node:assert")
const M = require("./load")("TimeboxModel.js", ["dashReturn", "DASH", "onlyDashes"])

// What Return does at the end of a line of notes.
test("a dashed line with text continues the list", () => {
  assert.strictEqual(M.dashReturn("- call mom"), "continue")
  assert.strictEqual(M.dashReturn("  - indented"), "continue")
})
test("Return on an empty dash ends the list", () => {
  assert.strictEqual(M.dashReturn("- "), "end")
  assert.strictEqual(M.dashReturn("-"), "end")
})
test("other lines are left to the editor", () => {
  assert.strictEqual(M.dashReturn("FOR TOMORROW:"), null)
  assert.strictEqual(M.dashReturn(""), null)
  assert.strictEqual(M.dashReturn("-not a dash item"), null)
})
test("the dash", () => assert.strictEqual(M.DASH, "- "))
test("notes holding only dashes count as empty", () => {
  assert.strictEqual(M.onlyDashes("- "), true)
  assert.strictEqual(M.onlyDashes("- \n- "), true)
  assert.strictEqual(M.onlyDashes("- a"), false)
})
