const test = require("node:test")
const assert = require("node:assert")
const load = require("./load")
const M = load("TimeboxModel.js", ["parseDay", "buildRows", "computeRuns", "rowLabel", "START_HOUR", "END_HOUR", "HALVES"])
const { LOOK } = load("TimeboxLook.js", ["LOOK"])
const PV = require("../server/public/phone-view.js")

const profile = { style: { title: 20, heading: 24, space: 1.25 }, look: LOOK }
const day = M.parseDay(JSON.stringify({
  slots: { "09:00": "Deep work", "09:30": "Deep work", "12:30": "Lunch", "12:45": "Walk" },
  splits: ["12:30"], slotColors: { "12:45": "green" }
}))

test("rows: half hours, and 15-minute rows where split", () => {
  const v = PV.layout(M, day, profile, null)
  const rowH = 20 * LOOK.rowHeightTitles
  assert.strictEqual(v.rowH, rowH)
  assert.strictEqual(v.rows.length, M.HALVES + 1)
  assert.strictEqual(v.rows[0].label, "6")
  assert.strictEqual(v.height, M.HALVES * rowH)
  const lunch = v.rows.find(r => r.min === 12 * 60 + 30)
  assert.strictEqual(lunch.h, rowH / 2)
})

test("one box per block, spanning its rows, text sized to the first row", () => {
  const v = PV.layout(M, day, profile, null)
  assert.deepStrictEqual(v.boxes.map(b => b.text), ["Deep work", "Lunch", "Walk"])
  const deep = v.boxes[0]
  assert.strictEqual(deep.y, (9 - 6) * 2 * v.rowH)
  assert.strictEqual(deep.h, 2 * v.rowH)
  assert.strictEqual(deep.fontSize, Math.min(24 * LOOK.handScale * LOOK.blockHeadingScale, v.rowH * LOOK.blockFit))
  assert.strictEqual(v.boxes[2].color, "green")
  assert.strictEqual(v.boxes[2].fontSize, Math.min(24 * LOOK.handScale * LOOK.blockHeadingScale, v.rowH / 2 * LOOK.blockFit))
})

test("now line sits inside the current row, and only within the day's hours", () => {
  const v = PV.layout(M, day, profile, 9 * 60 + 45)
  assert.strictEqual(v.nowY, (3 * 2 + 1) * v.rowH + 0.5 * v.rowH)
  assert.strictEqual(PV.layout(M, day, profile, 5 * 60).nowY, null)
  assert.strictEqual(PV.layout(M, day, profile, 21 * 60).nowY, null)
})

test("line opacity: hours full, half hours and quarters fainter", () => {
  const v = PV.layout(M, day, profile, null)
  assert.strictEqual(v.rows[0].lineOpacity, 1)
  assert.strictEqual(v.rows[1].lineOpacity, LOOK.halfHourLineOpacity)
  const q = v.rows.find(r => r.min === 12 * 60 + 45)
  assert.strictEqual(q.lineOpacity, LOOK.quarterLineOpacity)
})

test("colors with alpha, for CSS", () => {
  assert.strictEqual(PV.alpha("#c6b395", 0.28), "rgba(198, 179, 149, 0.28)")
  assert.strictEqual(PV.alpha("#ffc6b395", 0.5), "rgba(198, 179, 149, 0.5)")
})
