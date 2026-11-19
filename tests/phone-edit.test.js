const test = require("node:test")
const assert = require("node:assert")
const M = require("./load")("TimeboxModel.js", ["parseDay", "serializeDay", "shapeOf", "slotsToMap", "splitList",
  "notesShrank", "colorsToTones", "isRichText", "slotKey", "START_HOUR", "SLOTS"])
const E = require("../server/public/phone-edit.js")

const q = (h, m) => ((h - M.START_HOUR) * 60 + m) / 15   // quarter index
const day = () => M.parseDay(JSON.stringify({
  date: "2030-01-01", slots: { "09:00": "Deep work", "09:30": "Deep work" }, slotColors: { "09:00": "green" },
  brainDump: "<html><body><p>long enough notes to matter here</p></body></html>",
  versions: [{ at: "2030-01-01T06:00:00", slots: {} }]
}))
const out = d => JSON.parse(M.serializeDay("2030-01-01", d))

test("set a block: whole half hours stay unsplit", () => {
  const d = E.setBlock(M, day(), q(12, 0), q(13, 0), "Lunch")
  assert.deepStrictEqual(out(d).slots, { "09:00": "Deep work", "09:30": "Deep work", "12:00": "Lunch", "12:30": "Lunch" })
  assert.strictEqual(out(d).splits, undefined)
})

test("a block ending at :15 splits that half hour", () => {
  const d = E.setBlock(M, day(), q(12, 0), q(12, 45), "Lunch")
  assert.deepStrictEqual(out(d).slots["12:30"], "Lunch")
  assert.deepStrictEqual(out(d).slots["12:45"], undefined)
  assert.deepStrictEqual(out(d).splits, ["12:30"])
})

test("clearing a block empties it, merges its half hours and drops its colors", () => {
  const d = E.setBlock(M, day(), q(9, 0), q(10, 0), "")
  assert.deepStrictEqual(out(d).slots, {})
  assert.strictEqual(out(d).slotColors, undefined)
})

test("renaming keeps the block's color", () => {
  const d = E.setBlock(M, day(), q(9, 0), q(10, 0), "Writing")
  assert.deepStrictEqual(out(d).slotColors, { "09:00": "green" })
})

test("the block a quarter belongs to", () => {
  assert.deepStrictEqual(E.blockAt(M, day(), q(9, 30)), { start: q(9, 0), end: q(10, 0), text: "Deep work" })
  assert.strictEqual(E.blockAt(M, day(), q(11, 0)), null)
})

test("a time change keeps the old plan as a version; a rename doesn't", () => {
  const now = Date.parse("2030-01-01T12:00:00")
  const moved = E.keepVersion(M, day(), E.setBlock(M, day(), q(10, 0), q(11, 0), "Deep work"), now)
  const v = out(moved).versions
  assert.strictEqual(v.length, 2)
  assert.strictEqual(v[1].source, "phone")
  assert.deepStrictEqual(v[1].slots, { "09:00": "Deep work", "09:30": "Deep work" })
  const renamed = E.keepVersion(M, day(), E.setBlock(M, day(), q(9, 0), q(10, 0), "Writing"), now)
  assert.strictEqual(out(renamed).versions.length, 1)
})

test("time changes within 45 minutes of the last version count as one", () => {
  const soon = Date.parse("2030-01-01T06:30:00")
  const moved = E.keepVersion(M, day(), E.setBlock(M, day(), q(10, 0), q(11, 0), "Deep work"), soon)
  assert.strictEqual(out(moved).versions.length, 1)
})

test("wiping most of the notes keeps them as a version", () => {
  const now = Date.parse("2030-01-01T06:10:00")
  const wiped = E.setNotes(M, day(), 1, "", [])
  const kept = E.keepVersion(M, day(), wiped, now)
  const v = out(kept).versions
  assert.strictEqual(v[v.length - 1].source, "notes")
  assert.match(v[v.length - 1].notes, /long enough notes/)
})

test("notes from the editor: rich text with theme colors back as names", () => {
  const d = E.setNotes(M, day(), 2, '<div>Hi <span style="color: #d65a4f">there</span></div>', [{ name: "red", color: "#d65a4f" }])
  const stored = out(d).brainDump2
  assert.ok(M.isRichText(stored))
  assert.match(stored, /color:tb-red/)
  assert.strictEqual(out(E.setNotes(M, day(), 1, "<div><br></div>", [])).brainDump, "")
})

test("browser rgb() colors map back to theme names", () => {
  const d = E.setNotes(M, day(), 2, '<p>a <span style="color: rgb(214, 90, 79);">b</span></p>', [{ name: "red", color: "#d65a4f" }])
  assert.match(out(d).brainDump2, /color:tb-red/)
})

test("priorities", () => {
  const d = E.setPriority(M, day(), 1, { text: "Ship it", done: true })
  assert.deepStrictEqual(out(d).priorities[1], { text: "Ship it", done: true })
  assert.strictEqual(out(d).priorities.length, 3)
})
