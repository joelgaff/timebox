.pragma library

// Talking to the Timebox server on the Beelink (server/ in this repo). The server holds
// the only real copy of every day; this machine keeps a local copy of what it last saw
// (~/.local/share/omarchy-timebox) for the menu bar, reminders and offline reading.
//
// Turned on by ~/.config/timebox/config.json: {"server": "https://beelink...:4590"}.
// Saving needs the key in ~/.config/timebox/token. No config: plain local files.

function unquote(etag) {
  return String(etag || "").trim().replace(/^W\//, "").replace(/"/g, "")
}

function parseConfig(text) {
  var server = ""
  try {
    var data = JSON.parse(text || "{}")
    if (data && typeof data.server === "string") server = data.server.trim().replace(/\/+$/, "")
  } catch (e) {}
  return { server: server }
}

function dayUrl(server, key) {
  return server + "/api/days/" + key
}

// Our save lost a race (Grok Bot imported in between): keep the server's day, and keep
// what we were saving as a version of it so nothing is lost. Returns the JSON to save.
function conflictMerge(serverText, ourText, at) {
  var day = {}
  try { day = JSON.parse(serverText || "{}") || {} } catch (e) { day = {} }
  var ours = {}
  try { ours = JSON.parse(ourText || "{}") || {} } catch (e) { ours = {} }
  var same = JSON.stringify(ours.slots || {}) === JSON.stringify(day.slots || {})
    && (ours.brainDump || "") === (day.brainDump || "")
    && (ours.brainDump2 || "") === (day.brainDump2 || "")
  if (!same) {
    var entry = { at: at, source: "conflict", slots: ours.slots || {} }
    if (ours.splits && ours.splits.length) entry.splits = ours.splits
    if (ours.slotColors && Object.keys(ours.slotColors).length) entry.slotColors = ours.slotColors
    entry.notes = ours.brainDump || ""
    entry.notes2 = ours.brainDump2 || ""
    day.versions = (Array.isArray(day.versions) ? day.versions : []).concat([entry])
  }
  if (!day.date && ours.date) day.date = ours.date
  return JSON.stringify(day, null, 2) + "\n"
}

// One HTTP request. done(status, body, etag, exists); status 0 = couldn't reach it.
function request(method, url, opts, done) {
  var xhr = new XMLHttpRequest()
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== XMLHttpRequest.DONE) return
    done(xhr.status, xhr.responseText, unquote(xhr.getResponseHeader("ETag")),
      xhr.getResponseHeader("X-Timebox-Exists") !== "false")
  }
  xhr.open(method, url)
  xhr.timeout = opts.timeout || 8000
  if (opts.token) xhr.setRequestHeader("Authorization", "Bearer " + opts.token)
  if (opts.ifMatch) xhr.setRequestHeader("If-Match", '"' + opts.ifMatch + '"')
  if (opts.ifNoneMatch) xhr.setRequestHeader("If-None-Match", '"' + opts.ifNoneMatch + '"')
  if (opts.contentType) xhr.setRequestHeader("Content-Type", opts.contentType)
  xhr.send(opts.body === undefined ? null : opts.body)
}
