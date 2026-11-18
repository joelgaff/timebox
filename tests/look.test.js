const test = require("node:test")
const assert = require("node:assert")
const L = require("./load")("TimeboxLook.js", ["LOOK", "px"])

test("every look value is a number", () => {
  const keys = Object.keys(L.LOOK)
  assert.ok(keys.length >= 20)
  for (const k of keys) assert.strictEqual(typeof L.LOOK[k], "number", k)
})

test("px turns Omarchy space units into pixels with the desktop's scale", () => {
  assert.strictEqual(L.px({ space: 1.25 }, 8), 10)
  assert.strictEqual(L.px({ space: 1 }, 3), 3)
})
