// Layout math for the phone page, kept apart from the DOM so it can be tested in Node.
// Mirrors the schedule grid in Timebox.qml, using the shared TimeboxModel.js (M) and
// the look values from the desktop's view profile. Any visual change to the desktop
// grid belongs here too (see README, "Desktop and phone views").
;(function(root) {
  // day: M.parseDay() result. profile: the desktop's view profile. nowMinute: minutes
  // since midnight when showing today, else null.
  function layout(M, day, profile, nowMinute) {
    var style = profile.style
    var look = profile.look
    var rowH = style.title * look.rowHeightTitles
    var rows = M.buildRows(day.splits)
    var rowSlots = rows.map(function(r) { return day.slots[r.q] || "" })
    var runs = M.computeRuns(rowSlots).runs
    var colors = day.slotColors || {}

    var outRows = rows.map(function(r) {
      var m = r.min % 60
      return {
        y: r.y * rowH, h: r.h * rowH, min: r.min, label: M.rowLabel(r), minor: m !== 0,
        hourLine: m === 0,
        lineOpacity: m === 0 ? 1 : m === 30 ? look.halfHourLineOpacity : look.quarterLineOpacity
      }
    })

    var maxText = style.heading * look.handScale * look.blockHeadingScale
    var boxes = runs.map(function(run) {
      var first = outRows[run.start]
      var last = outRows[run.start + run.len - 1]
      return {
        y: first.y, h: last.y + last.h - first.y, text: run.text,
        textH: first.h, fontSize: Math.min(maxText, first.h * look.blockFit),
        color: colors[rows[run.start].key] || ""
      }
    })

    var nowY = null
    if (nowMinute !== null && nowMinute !== undefined
        && nowMinute >= M.START_HOUR * 60 && nowMinute < (M.END_HOUR + 1) * 60) {
      var idx = 0
      for (var i = 0; i < rows.length; i++) if (rows[i].min <= nowMinute) idx = i
      var frac = Math.max(0, Math.min(1, (nowMinute - rows[idx].min) / (rows[idx].h * 30)))
      nowY = outRows[idx].y + frac * outRows[idx].h
    }

    return { rowH: rowH, height: M.HALVES * rowH, rows: outRows, boxes: boxes, nowY: nowY }
  }

  // "#rrggbb" or Qt's "#aarrggbb" at an alpha, as CSS.
  function alpha(hex, a) {
    var h = String(hex || "#000000").replace("#", "")
    if (h.length === 8) h = h.slice(2)
    var n = parseInt(h, 16)
    return "rgba(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + a + ")"
  }

  // Qt "#aarrggbb" -> "#rrggbb" (opaque colors only come through as 6 digits anyway).
  function css(hex) {
    var h = String(hex || "")
    return /^#[0-9a-f]{8}$/i.test(h) ? "#" + h.slice(3) : h
  }

  var api = { layout: layout, alpha: alpha, css: css }
  if (typeof module !== "undefined" && module.exports) module.exports = api
  else root.PhoneView = api
})(this)
