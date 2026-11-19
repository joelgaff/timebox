// Editing a day on the phone, kept apart from the DOM so it can be tested in Node.
// Works on the planner's own day shape (TimeboxModel.js parseDay / serializeDay, passed
// in as M) and follows the desktop's rules: quarter-hour slots, a half hour split only
// when its two quarters differ, and versions kept before time changes (Newport-style,
// one per 45-minute round) and before notes are wiped.
;(function(root) {
  var ROUND_MS = 45 * 60 * 1000
  // An empty notes box starts as a bulleted list (the desktop does the same).
  var STARTER_LIST = "<ul><li><br></li></ul>"

  function copy(day) { return JSON.parse(JSON.stringify(day)) }

  // Set quarters [start, end) to text ("" clears them).
  function setBlock(M, day, start, end, text) {
    var d = copy(day)
    text = String(text || "").trim()
    for (var i = Math.max(0, start); i < Math.min(end, M.SLOTS); i++) {
      d.slots[i] = text
      // Cleared rows lose their colors; a rename keeps the block's.
      if (!text) delete d.slotColors[M.slotKey(i)]
    }
    // A half hour shows as two 15-minute rows only when its quarters differ.
    for (var h = Math.floor(start / 2); h <= Math.floor((end - 1) / 2) && h * 2 < M.SLOTS; h++) {
      var k0 = M.slotKey(2 * h)
      if (d.slots[2 * h] !== d.slots[2 * h + 1]) d.splits[k0] = true
      else delete d.splits[k0]
    }
    return d
  }

  // The block (run of equal quarters) holding quarter q, or null if it's empty.
  function blockAt(M, day, q) {
    var text = day.slots[q]
    if (!text) return null
    var start = q, end = q + 1
    while (start > 0 && day.slots[start - 1] === text) start--
    while (end < M.SLOTS && day.slots[end] === text) end++
    return { start: start, end: end, text: text }
  }

  function setPriority(M, day, i, patch) {
    var d = copy(day)
    d.priorities[i] = Object.assign({}, d.priorities[i], patch)
    return d
  }

  // HTML from the notes editor -> the stored form: rich text with theme colors as names
  // ("tb-red"), or "" when nothing's written.
  function setNotes(M, day, which, html, tonePairs) {
    var d = copy(day)
    var text = String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()
    var stored = ""
    if (text) {
      // Browsers write colors as rgb(); the stored form uses #rrggbb (then theme names).
      html = String(html).replace(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g, function(_, r, g, b) {
        return "#" + [r, g, b].map(function(n) { return ("0" + (+n).toString(16)).slice(-2) }).join("")
      })
      stored = M.isRichText(html) ? html : "<html><body>" + html + "</body></html>"
      stored = M.colorsToTones(stored, tonePairs)
    }
    if (which === 2) d.brainDump2 = stored
    else d.brainDump = stored
    return d
  }

  function stamp(ms) {
    var t = new Date(ms)
    function p(n) { return (n < 10 ? "0" : "") + n }
    return t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate()) + "T" +
      p(t.getHours()) + ":" + p(t.getMinutes()) + ":" + p(t.getSeconds())
  }

  function versionMs(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(v && v.at))
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0
  }

  // Keep `before` as a version of `after` when the edit changed times (not within 45
  // minutes of the last version) or wiped most of a note.
  function keepVersion(M, before, after, nowMs) {
    var versions = Array.isArray(after.extra && after.extra.versions) ? after.extra.versions : []
    var last = versions[versions.length - 1]
    var source = null
    if (M.notesShrank(before.brainDump, after.brainDump) || M.notesShrank(before.brainDump2, after.brainDump2))
      source = "notes"
    else if (M.shapeOf(before.slots) !== M.shapeOf(after.slots) && before.slots.some(function(s) { return s })
             && nowMs - versionMs(last) >= ROUND_MS)
      source = "phone"
    if (!source) return after
    var d = copy(after)
    var entry = { at: stamp(nowMs), source: source, slots: M.slotsToMap(before.slots, before.otherSlots, before.splits) }
    var splits = M.splitList(before.splits)
    if (splits.length) entry.splits = splits
    if (Object.keys(before.slotColors || {}).length) entry.slotColors = before.slotColors
    entry.notes = before.brainDump || ""
    entry.notes2 = before.brainDump2 || ""
    d.extra = Object.assign({}, d.extra, { versions: versions.concat([entry]) })
    return d
  }

  var api = { STARTER_LIST: STARTER_LIST, setBlock: setBlock, blockAt: blockAt, setPriority: setPriority, setNotes: setNotes, keepVersion: keepVersion }
  if (typeof module !== "undefined" && module.exports) module.exports = api
  else root.PhoneEdit = api
})(this)
