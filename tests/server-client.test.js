const test = require("node:test")
const assert = require("node:assert")
const S = require("./load")("TimeboxServer.js", ["unquote", "conflictMerge", "parseConfig", "dayUrl"])

const server = { date: "2026-11-18", slots: { "09:00": "From Grok" }, brainDump: "server notes", versions: [{ at: "x", slots: {} }] }
const ours = { date: "2026-11-18", slots: { "10:00": "Mine" }, splits: ["10:00"], brainDump: "my notes", brainDump2: "more" }

test("unquote strips ETag quotes and weak prefix", () => {
  assert.strictEqual(S.unquote('"abc"'), "abc")
  assert.strictEqual(S.unquote('W/"abc"'), "abc")
  assert.strictEqual(S.unquote(null), "")
})

test("a conflict keeps the server's day and our edit as a version", () => {
  const out = JSON.parse(S.conflictMerge(JSON.stringify(server), JSON.stringify(ours), "2026-11-18T09:30:00"))
  assert.deepStrictEqual(out.slots, server.slots)
  assert.strictEqual(out.brainDump, "server notes")
  assert.strictEqual(out.versions.length, 2)
  const v = out.versions[1]
  assert.deepStrictEqual(v, { at: "2026-11-18T09:30:00", source: "conflict", slots: { "10:00": "Mine" },
    splits: ["10:00"], notes: "my notes", notes2: "more" })
})

test("no version when our edit already matches the server", () => {
  const same = Object.assign({}, server)
  const out = JSON.parse(S.conflictMerge(JSON.stringify(server), JSON.stringify(same), "t"))
  assert.strictEqual(out.versions.length, 1)
})

test("a conflict on a day the server doesn't have yet", () => {
  const out = JSON.parse(S.conflictMerge("{}", JSON.stringify(ours), "t"))
  assert.strictEqual(out.versions.length, 1)
  assert.strictEqual(out.versions[0].source, "conflict")
})

test("config: server mode only with a URL", () => {
  assert.deepStrictEqual(S.parseConfig('{"server": "https://b.ts.net:4590/"}'), { server: "https://b.ts.net:4590" })
  assert.deepStrictEqual(S.parseConfig(""), { server: "" })
  assert.deepStrictEqual(S.parseConfig("nope"), { server: "" })
  assert.deepStrictEqual(S.parseConfig('{"server": ""}'), { server: "" })
})

test("day URL", () => {
  assert.strictEqual(S.dayUrl("https://b:4590", "2026-11-18"), "https://b:4590/api/days/2026-11-18")
})
