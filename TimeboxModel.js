.pragma library

// Schedule covers 6 AM through the 7 PM row (ends 8 PM). Data lives on a
// 15-minute grid (SLOTS quarters); the planner shows each half hour as one row
// unless that half hour is split into two 15-minute rows.
var START_HOUR = 6
var END_HOUR = 19
var ROWS = END_HOUR - START_HOUR + 1
var HALVES = ROWS * 2
var SLOTS = ROWS * 4
var PRIORITIES = 3

function pad(n) {
  return n < 10 ? "0" + n : "" + n
}

// Quarter index -> "HH:MM"
function slotKey(i) {
  var m = START_HOUR * 60 + i * 15
  return pad(Math.floor(m / 60)) + ":" + pad(m % 60)
}

function hourLabel(row) {
  var h = (START_HOUR + row) % 12
  return "" + (h === 0 ? 12 : h)
}

function emptyDay() {
  var slots = []
  for (var i = 0; i < SLOTS; i++) slots.push("")
  var priorities = []
  for (var p = 0; p < PRIORITIES; p++) priorities.push({ text: "", done: false })
  return {
    slots: slots, priorities: priorities,
    brainDump: "", brainDump2: "",
    slotColors: {}, otherSlots: {}, splits: {}, extra: {}
  }
}

var KNOWN_FIELDS = ["date", "priorities", "brainDump", "brainDump2", "slots", "slotColors", "splits"]

// Returns null when the file has content that isn't a valid day, so callers
// can refuse to overwrite it instead of treating it as an empty day.
function parseDay(raw) {
  var day = emptyDay()
  if (!raw || !String(raw).trim()) return day
  var data = null
  try { data = JSON.parse(raw) } catch (e) { return null }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null

  if (data.slots && typeof data.slots === "object" && !Array.isArray(data.slots)) {
    var grid = mapToSlots(data.slots, data.splits)
    day.slots = grid.slots
    day.splits = grid.splits
    // Entries outside the visible hours (e.g. saved when the day started
    // earlier) are kept as-is so saving never drops them.
    var shown = {}
    for (var k = 0; k < SLOTS; k++) shown[slotKey(k)] = true
    for (var key in data.slots) {
      if (!shown[key]) day.otherSlots[key] = data.slots[key]
    }
  }
  if (Array.isArray(data.priorities)) {
    for (var p = 0; p < PRIORITIES && p < data.priorities.length; p++) {
      var item = data.priorities[p] || {}
      day.priorities[p] = { text: String(item.text || ""), done: !!item.done }
      if (typeof item.color === "string" && item.color) day.priorities[p].color = item.color
    }
  }
  if (typeof data.brainDump === "string") day.brainDump = data.brainDump
  if (typeof data.brainDump2 === "string") day.brainDump2 = data.brainDump2
  if (data.slotColors && typeof data.slotColors === "object" && !Array.isArray(data.slotColors)) {
    for (var c in data.slotColors) {
      if (typeof data.slotColors[c] === "string") day.slotColors[c] = data.slotColors[c]
    }
  }
  // Fields written by a newer version are carried through untouched.
  for (var f in data) {
    if (KNOWN_FIELDS.indexOf(f) === -1) day.extra[f] = data[f]
  }
  return day
}

function serializeDay(dateKey, day) {
  var slots = slotsToMap(day.slots, day.otherSlots, day.splits)
  var out = {}
  var extra = day.extra || {}
  for (var f in extra) out[f] = extra[f]
  out.date = dateKey
  out.priorities = day.priorities
  out.brainDump = day.brainDump
  if (day.brainDump2) out.brainDump2 = day.brainDump2
  out.slots = slots
  var splitKeys = splitList(day.splits)
  if (splitKeys.length) out.splits = splitKeys
  var colors = day.slotColors || {}
  if (Object.keys(colors).length) out.slotColors = colors
  return JSON.stringify(out, null, 2) + "\n"
}

// Brain dump notes are stored as rich text (so words can be colored). Older
// files hold plain text; turn that into equivalent HTML on load.
function isRichText(text) {
  return /^\s*<(!DOCTYPE|html|p[\s>]|body)/i.test(text || "")
}

function plainToHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
}

// How much is written in a note (stored or display form): characters other
// than whitespace, ignoring markup.
function notesLength(text) {
  var t = String(text || "")
  if (isRichText(t)) {
    t = t.replace(/<head[\s\S]*?<\/head>/i, "").replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&[a-z#0-9]+;/gi, "x")
  }
  return t.replace(/\s+/g, "").length
}

// A save that wipes most of a note: at least 20 characters lost and less
// than half left.
function notesShrank(before, after) {
  var a = notesLength(before), b = notesLength(after)
  return a >= 20 && a - b >= 20 && b < a / 2
}

// Notes lists are dashed lines ("- item"), on the desktop and the phone alike. An empty
// notes box starts with a dash; Return after a dashed line starts the next one; Return on
// an empty dash ends the list.
var DASH = "- "

function dashReturn(line) {
  var m = /^(\s*)-( |$)(.*)$/.exec(String(line || ""))
  if (!m) return null
  return m[3].trim() ? "continue" : "end"
}

// Plain text of a note that holds nothing but dashes (an untouched starter).
function onlyDashes(text) {
  return /^[\s-]*$/.test(String(text || "")) && /-/.test(String(text || ""))
}

// Keep only colors from Qt's generated HTML, so the stored note follows the
// planner's current font and size instead of freezing the ones in use today.
function cleanRichText(html) {
  return String(html || "")
    .replace(/font-family:[^;"]*;?/g, "")
    .replace(/font-size:[^;"]*;?/g, "")
    .replace(/font-weight:[^;"]*;?/g, "")
    .replace(/font-style:[^;"]*;?/g, "")
}

// Consecutive slots holding the same text form one run; each run is drawn
// as a boxed timebox.
function computeRuns(slots) {
  var runOf = []
  var runs = []
  for (var i = 0; i < slots.length; i++) {
    var text = slots[i]
    if (!text) { runOf.push(-1); continue }
    if (i > 0 && runOf[i - 1] >= 0 && slots[i - 1] === text) {
      runs[runOf[i - 1]].len++
      runOf.push(runOf[i - 1])
    } else {
      runs.push({ start: i, len: 1, text: text })
      runOf.push(runs.length - 1)
    }
  }
  return { runOf: runOf, runs: runs }
}

// The plan's shape: where blocks start and end, ignoring their names. Two
// plans with the same shape differ only by renames.
function shapeOf(slots) {
  var out = []
  var prev = ""
  for (var i = 0; i < slots.length; i++) {
    var filled = !!slots[i]
    var boundary = filled && (i === 0 || slots[i] !== slots[i - 1])
    if (boundary || (filled !== !!prev && i > 0)) out.push(i + (filled ? "+" : "-"))
    prev = slots[i]
  }
  if (prev) out.push(slots.length + "-")
  return out.join(",")
}

function slotMinutes(i) {
  return START_HOUR * 60 + i * 15
}

// "9:30 AM" style, matching the bar clock.
function slotTime(i) {
  var m = slotMinutes(i)
  var h = Math.floor(m / 60) % 24
  return (h % 12 === 0 ? 12 : h % 12) + ":" + pad(m % 60) + (h < 12 ? " AM" : " PM")
}

// The block (run) that starts exactly at the given minute of the day, if any.
function runStartingAt(slots, minuteOfDay) {
  var runs = computeRuns(slots).runs
  for (var r = 0; r < runs.length; r++) {
    if (slotMinutes(runs[r].start) === minuteOfDay) return runs[r]
  }
  return null
}

// Reminder modes, cycled from the planner and stored in settings.json.
// Each mode lists how many minutes before a block's start to notify.
var REMINDER_MODES = ["start", "before", "both", "off"]
var REMINDER_BEFORE = 5

function reminderMode(settings) {
  var mode = settings && settings.reminders
  return REMINDER_MODES.indexOf(mode) !== -1 ? mode : "start"
}

function reminderLeads(mode) {
  if (mode === "before") return [REMINDER_BEFORE]
  if (mode === "both") return [REMINDER_BEFORE, 0]
  if (mode === "off") return []
  return [0]
}

function reminderLabel(mode) {
  if (mode === "before") return REMINDER_BEFORE + " min before"
  if (mode === "both") return REMINDER_BEFORE + " min before + start"
  if (mode === "off") return "Reminders off"
  return "At start"
}

function nextReminderMode(mode) {
  return REMINDER_MODES[(REMINDER_MODES.indexOf(mode) + 1) % REMINDER_MODES.length]
}

function parseSettings(raw) {
  try {
    var data = JSON.parse(raw || "{}")
    return data && typeof data === "object" && !Array.isArray(data) ? data : {}
  } catch (e) {
    return {}
  }
}

// ---- Theme colors ----
// Colors are stored by name ("red", "accent", ...) and looked up in the
// current Omarchy theme, so everything recolors when the theme changes.
var THEME_TONES = ["accent", "red", "yellow", "orange", "green", "cyan", "blue", "magenta"]

function parseThemeColors(toml) {
  var out = {}
  var re = /^\s*([a-z_]+)\s*=\s*"(#[0-9a-fA-F]{6,8})"/gm
  var m
  while ((m = re.exec(String(toml || ""))) !== null) out[m[1]] = m[2].toLowerCase()
  return out
}

// Theme tones for the accent palette, skipping ones that repeat a color.
function paletteTones(theme) {
  var seen = {}, out = []
  for (var i = 0; i < THEME_TONES.length; i++) {
    var t = THEME_TONES[i]
    var c = t === "accent" ? (theme.accent || "") : theme[t]
    if (t !== "accent" && !c) continue
    if (c && seen[c]) continue
    if (c) seen[c] = true
    out.push(t)
  }
  return out
}

// Rich-text notes keep colors as "tb-<name>" in the file; swap them for the
// theme's actual colors on load, and back again on save.
function tonesToColors(html, resolve) {
  return String(html || "").replace(/color:\s*tb-([a-z_]+)/g, function(_, name) { return "color:" + resolve(name) })
}

function colorsToTones(html, pairs) {
  var out = String(html || "")
  for (var i = 0; i < pairs.length; i++) {
    var hex = String(pairs[i].color).toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(hex)) continue
    out = out.replace(new RegExp("color:\\s*" + hex + "(?![0-9a-f])", "gi"), "color:tb-" + pairs[i].name)
  }
  return out
}

// ---- versions (snapshots of the schedule) ----

// { "HH:MM": text } (+ split half keys) -> quarter slots and the split set.
// A half hour not split stores one "HH:00"/"HH:30" key for both quarters; a
// split one may also store its ":15"/":45" key, which marks it split too.
function mapToSlots(map, splitKeys) {
  var splits = splitsFromList(splitKeys)
  var slots = []
  for (var h = 0; h < HALVES; h++) {
    var k0 = slotKey(2 * h), k1 = slotKey(2 * h + 1)
    var a = map && typeof map[k0] === "string" ? map[k0] : ""
    var hasB = map && typeof map[k1] === "string"
    var split = !!splits[k0] || hasB
    if (split) splits[k0] = true
    slots.push(a, split ? (hasB ? map[k1] : "") : a)
  }
  return { slots: slots, splits: splits }
}

// Quarter slots -> { "HH:MM": text } as stored on disk, keeping hidden slots.
function slotsToMap(slots, otherSlots, splits) {
  var map = {}
  var other = otherSlots || {}
  for (var key in other) map[key] = other[key]
  for (var h = 0; h < HALVES; h++) {
    var k0 = slotKey(2 * h), a = slots[2 * h], b = slots[2 * h + 1]
    if (splits && splits[k0]) {
      if (a) map[k0] = a
      if (b) map[slotKey(2 * h + 1)] = b
    } else if (a) {
      map[k0] = a
    }
  }
  return map
}

function slotsFromMap(map, splitKeys) {
  return mapToSlots(map, splitKeys).slots
}

function splitsFromList(list) {
  var out = {}
  if (Array.isArray(list)) for (var i = 0; i < list.length; i++) out[String(list[i])] = true
  return out
}

function splitList(splits) {
  var out = []
  for (var k in (splits || {})) if (splits[k]) out.push(k)
  return out.sort()
}

// Display rows: one per half hour, or two 15-minute rows where split.
// y and h are in half-hour units, so a split half takes the same height.
function buildRows(splits) {
  var rows = []
  var y = 0
  for (var h = 0; h < HALVES; h++) {
    var k0 = slotKey(2 * h)
    var min = START_HOUR * 60 + h * 30
    if (splits && splits[k0]) {
      rows.push({ q: 2 * h, n: 1, half: h, min: min, key: k0, quarter: true, y: y, h: 0.5 })
      rows.push({ q: 2 * h + 1, n: 1, half: h, min: min + 15, key: slotKey(2 * h + 1), quarter: true, y: y + 0.5, h: 0.5 })
    } else {
      rows.push({ q: 2 * h, n: 2, half: h, min: min, key: k0, quarter: false, y: y, h: 1 })
    }
    y += 1
  }
  return rows
}

// "7" on the hour, ":15" / ":30" / ":45" otherwise.
function rowLabel(row) {
  var m = row.min % 60
  if (m === 0) return hourLabel(Math.floor(row.min / 60) - START_HOUR)
  return ":" + pad(m)
}

// "2026-11-17T09:05:00" -> "9:05 AM"
function shortTime(stamp) {
  var m = /T(\d{2}):(\d{2})/.exec(String(stamp || ""))
  if (!m) return "?"
  var h = parseInt(m[1], 10)
  return (h % 12 === 0 ? 12 : h % 12) + ":" + m[2] + (h < 12 ? " AM" : " PM")
}
