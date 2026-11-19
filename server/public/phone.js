// Phone view of the Timebox planner: read-only, always the latest plan. Draws with
// the desktop's look (the view profile it sends to the server), and keeps checking
// for changes while it's on screen.
;(function() {
  var M = window          // TimeboxModel.js functions are globals here
  var PV = window.PhoneView
  var PE = window.PhoneEdit
  var POLL_MS = 15000

  var state = {
    day: todayKey(),
    profile: null,
    profileText: "",
    dayText: null,
    scrolledFor: "",      // the day we've already scrolled to "now" for
    failures: 0
  }

  function $(id) { return document.getElementById(id) }

  function todayKey(d) {
    d = d || new Date()
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
  }
  function pad(n) { return (n < 10 ? "0" : "") + n }
  function keyToDate(key) {
    var p = key.split("-").map(Number)
    return new Date(p[0], p[1] - 1, p[2])
  }
  function shiftKey(key, delta) {
    var d = keyToDate(key)
    d.setDate(d.getDate() + delta)
    return todayKey(d)
  }

  // ---- Profile: colors, fonts, sizes from the desktop ----

  function defaultProfile() {
    return {
      colors: { background: "#1c120d", foreground: "#c6b395", accent: "#d28a41", urgent: "#d65a4f", tones: {} },
      fonts: {},
      style: { title: 17, heading: 20, body: 15, bodySmall: 13, caption: 11, display: 22, displayLarge: 26, space: 1.25, cornerRadius: 0 },
      look: window.LOOK
    }
  }

  function tone(name) {
    var c = state.profile.colors
    if (!name) return PV.css(c.foreground)
    if (name.charAt(0) === "#") return PV.css(name)
    if (name === "accent") return PV.css(c.tones.accent || c.accent)
    return PV.css(c.tones[name] || c.tones.accent || c.accent)
  }

  function applyProfile(p) {
    var look = Object.assign({}, window.LOOK, p.look || {})
    p.look = look
    state.profile = p
    var c = p.colors, s = p.style, fg = c.foreground
    var root = document.documentElement.style
    var vars = {
      "--bg": PV.css(c.background), "--fg": PV.css(fg), "--accent": PV.css(c.accent),
      "--urgent": PV.css(c.urgent || "#d65a4f"),
      "--line": PV.alpha(fg, look.lineAlpha), "--muted": PV.alpha(fg, look.mutedAlpha),
      "--band": PV.alpha(fg, look.labelBandAlpha), "--dumpFill": PV.alpha(fg, look.dumpFillAlpha),
      "--dumpDot": PV.alpha(fg, look.dumpDotAlpha), "--hover": PV.alpha(fg, 0.1),
      "--title": s.title + "px", "--heading": s.heading + "px", "--body": s.body + "px",
      "--bodySmall": s.bodySmall + "px", "--caption": s.caption + "px",
      "--displayLarge": s.displayLarge + "px", "--s": s.space + "px",
      "--radius": (s.cornerRadius || 0) + "px",
      "--handScale": look.handScale, "--dumpTitleScale": look.dumpTitleScale,
      "--priorityRow": look.priorityRowSpace, "--check": look.checkSpace,
      "--checkInset": look.checkInsetSpace, "--checkGap": look.checkGapSpace,
      "--labelGap": look.labelGapSpace, "--sectionGap": look.sectionGapSpace,
      "--dumpDotStep": look.dumpDotStepSpace, "--dumpPad": look.dumpPadSpace,
      "--doneOpacity": look.doneOpacity, "--placeholderOpacity": look.placeholderOpacity
    }
    for (var k in vars) root.setProperty(k, vars[k])
    document.querySelector('meta[name="theme-color"]').setAttribute("content", PV.css(c.background))

    // The desktop's dotted brain-dump paper: a 2px dot every step, offset half a step.
    var step = Math.round(look.dumpDotStepSpace * s.space)
    var dot = PV.alpha(fg, look.dumpDotAlpha)
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='" + step + "' height='" + step + "'>"
      + "<rect x='" + Math.round(step / 2) + "' y='" + Math.round(step / 2) + "' width='2' height='2' fill='" + dot + "'/></svg>"
    document.querySelectorAll(".dumpBox").forEach(function(el) {
      el.style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'
    })

    // The desktop's own fonts, served by the Beelink.
    var f = p.fonts || {}
    var css = ""
    if (f.ui && f.ui.regular) {
      css += "@font-face{font-family:TimeboxUI;src:url(/fonts/" + f.ui.regular + ");font-weight:normal;font-display:swap}"
      css += "@font-face{font-family:TimeboxUI;src:url(/fonts/" + (f.ui.bold || f.ui.regular) + ");font-weight:bold;font-display:swap}"
      root.setProperty("--ui", "TimeboxUI, ui-monospace, monospace")
    }
    if (f.hand && f.hand.regular) {
      css += "@font-face{font-family:TimeboxHand;src:url(/fonts/" + f.hand.regular + ");font-display:swap}"
      root.setProperty("--hand", "TimeboxHand, cursive")
    }
    $("profile-fonts").textContent = css
  }

  // ---- Drawing ----

  function el(tag, cls, styles, text) {
    var e = document.createElement(tag)
    if (cls) e.className = cls
    for (var k in styles || {}) e.style[k] = styles[k]
    if (text !== undefined) e.textContent = text
    return e
  }

  function px(units) { return Math.round(units * state.profile.style.space) }

  function nowMinute() {
    if (state.day !== todayKey()) return null
    var n = new Date()
    return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60
  }

  function drawGrid(day) {
    var p = state.profile, look = p.look, s = p.style
    var v = PV.layout(M, day, p, nowMinute())
    var grid = $("grid")
    var width = grid.clientWidth
    var labelW = px(look.labelWidthSpace)
    var cellW = width - labelW
    var bw = Math.max(look.boxWidthMin, px(look.boxWidthSpace))
    grid.textContent = ""
    grid.style.height = v.height + "px"

    grid.appendChild(el("div", "band", { width: labelW + "px" }))

    // Time labels; the current one in the accent color.
    var current = -1
    if (v.nowY !== null) v.rows.forEach(function(r, i) { if (r.y <= v.nowY) current = i })
    v.rows.forEach(function(r, i) {
      var size = Math.min(r.minor ? s.title * look.timeMinorScale : s.title, r.h * look.timeFit)
      var t = el("div", "time" + (r.minor ? " minor" : "") + (i === current ? " current" : ""), {
        top: r.y + "px", width: labelW + "px", height: r.h + "px", fontSize: size + "px",
        opacity: r.minor ? look.timeMinorOpacity : 1
      }, r.label)
      grid.appendChild(t)
    })

    // Grid lines: hours across the labels too; :30 and :15 fainter, cells only.
    v.rows.forEach(function(r) {
      grid.appendChild(el("div", "hline", { top: r.y + "px", left: (r.hourLine ? 0 : labelW) + "px", opacity: r.lineOpacity }))
    })
    grid.appendChild(el("div", "hline", { top: (v.height - 1) + "px", left: "0px" }))
    ;[0, labelW, width - 1].forEach(function(x) { grid.appendChild(el("div", "vline", { left: x + "px" })) })

    // One box per timebox, its border centered on the grid lines like the desktop.
    v.boxes.forEach(function(b) {
      grid.appendChild(el("div", "box", {
        left: (labelW - bw / 2) + "px", top: (b.y - bw / 2) + "px",
        width: (cellW + bw) + "px", height: (b.h + bw) + "px", borderWidth: bw + "px"
      }))
      var inset = px(look.blockInsetSpace)
      var t = el("div", "blockText", {
        left: (labelW + inset) + "px", top: b.y + "px", width: (cellW - inset * 2) + "px",
        height: b.textH + "px", fontSize: b.fontSize + "px", color: tone(b.color)
      })
      t.appendChild(el("span", "", {}, b.text))
      grid.appendChild(t)
    })

    // Now line.
    if (v.nowY !== null) {
      var dot = px(look.nowDotSpace)
      var line = el("div", "now", { left: (labelW - px(5)) + "px", top: (v.nowY - dot / 2) + "px",
        width: (width - labelW + px(5)) + "px", height: dot + "px" })
      line.appendChild(el("div", "dot", { width: dot + "px", height: dot + "px" }))
      line.appendChild(el("div", "bar", { height: Math.max(look.nowLineMin, px(look.nowLineSpace)) + "px" }))
      line.id = "nowLine"
      grid.appendChild(line)
    }
    return v
  }

  function drawPriorities(day) {
    var box = $("prioritiesBox")
    box.textContent = ""
    day.priorities.forEach(function(p, i) {
      var row = el("div", "priority" + (p.done ? " done" : ""))
      var check = el("div", "check")
      check.onclick = function(e) { e.stopPropagation(); toggleDone(i) }
      row.onclick = function() { editPriority(i) }
      row.appendChild(check)
      var text = el("div", "ptext" + (p.text ? "" : " placeholder"), p.text ? { color: tone(p.color) } : {},
        p.text || "Priority " + (i + 1))
      row.appendChild(text)
      box.appendChild(row)
    })
  }

  // Notes are Qt rich text: keep the text and its colors, nothing that could run.
  function safeNotes(html) {
    var doc = new DOMParser().parseFromString(html, "text/html")
    doc.querySelectorAll("script,style,iframe,object,embed,link,meta,img").forEach(function(n) { n.remove() })
    doc.querySelectorAll("*").forEach(function(n) {
      for (var i = n.attributes.length - 1; i >= 0; i--) {
        var a = n.attributes[i].name
        if (a !== "style") n.removeAttribute(a)
      }
      var color = n.style.color
      n.removeAttribute("style")
      if (color) n.style.color = color
    })
    return doc.body.innerHTML
  }

  function drawNote(id, stored, placeholder) {
    var node = $(id)
    if (!stored || !String(stored).replace(/<[^>]*>/g, "").trim()) {
      node.innerHTML = ""
      if (placeholder) node.appendChild(el("span", "placeholder", {}, placeholder))
      return
    }
    var html = M.isRichText(stored) ? stored : M.plainToHtml(stored)
    node.innerHTML = safeNotes(M.tonesToColors(html, tone))
  }

  function drawHeader() {
    var d = keyToDate(state.day)
    var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    $("dayNum").textContent = d.getDate()
    $("dayMon").textContent = months[d.getMonth()]
    $("dateText").textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    document.documentElement.style.setProperty("--headerH", $("top").offsetHeight + "px")
  }

  function render() {
    if (!state.profile || state.dayText === null) return
    var day = M.parseDay(state.dayText) || M.emptyDay()
    drawHeader()
    var v = drawGrid(day)
    drawPriorities(day)
    drawNote("note1", day.brainDump, "Everything on your mind…")
    drawNote("note2", day.brainDump2, "…and more")
    state.parsed = day
    state.layout = v
    if (state.scrolledFor !== state.day) {
      state.scrolledFor = state.day
      scrollToNow(v)
    }
  }

  // Open with the now line in view, a third of the way down below the header.
  function scrollToNow(v) {
    var grid = $("grid")
    var headerH = $("top").offsetHeight
    var target = v.nowY !== null ? v.nowY : 0
    var top = grid.getBoundingClientRect().top + window.scrollY + target - headerH - (window.innerHeight - headerH) / 3
    window.scrollTo(0, Math.max(0, v.nowY !== null ? top : 0))
  }

  // ---- Editing: a sheet for one thing at a time, saved straight to the Beelink ----

  function quarterLabel(q) {
    var m = M.START_HOUR * 60 + q * 15
    var h = Math.floor(m / 60), mm = m % 60
    return (h % 12 === 0 ? 12 : h % 12) + ":" + pad(mm) + (h < 12 ? " AM" : " PM")
  }

  function tonePairs() {
    var c = state.profile.colors, out = []
    for (var name in c.tones) out.push({ name: name, color: PV.css(c.tones[name]).toLowerCase() })
    return out
  }

  var sheet = { onSave: null, onClear: null }

  function openSheet(title, body, onSave, onClear) {
    $("sheetTitle").textContent = title
    var holder = $("sheetBody")
    holder.textContent = ""
    holder.appendChild(body)
    $("sheetError").hidden = true
    $("sheetClear").hidden = !onClear
    sheet.onSave = onSave
    sheet.onClear = onClear
    $("sheet").showModal()
  }

  function field(label, input) {
    var wrap = el("div")
    var l = el("label", "", {}, label)
    wrap.appendChild(l)
    wrap.appendChild(input)
    return wrap
  }

  function timeSelect(value, from, to) {
    var sel = el("select")
    for (var q = from; q <= to; q++) {
      var o = el("option", "", {}, quarterLabel(q))
      o.value = q
      if (q === value) o.selected = true
      sel.appendChild(o)
    }
    return sel
  }

  // Load the latest copy, apply the edit, keep a version if the rules say so, and save it
  // only on top of that copy (If-Match); if it changed meanwhile, try once more.
  function save(edit, tries) {
    var key = state.day
    var url = "/api/days/" + key
    return fetch(url, { cache: "no-cache" }).then(function(r) {
      if (!r.ok) throw new Error("load " + r.status)
      var tag = r.headers.get("ETag")
      return r.text().then(function(raw) {
        var before = M.parseDay(raw === "{}" ? "" : raw)
        if (!before) throw new Error("This day's file isn't valid; edit it on the laptop.")
        var after = PE.keepVersion(M, before, edit(before), Date.now())
        var body = M.serializeDay(key, after)
        return fetch(url, {
          method: "PUT", body: body,
          headers: { "Content-Type": "application/json", "If-Match": tag, "X-Timebox-Client": "phone" }
        }).then(function(res) {
          if (res.status === 412 && (tries || 0) < 1) return save(edit, 1)
          if (res.status === 401 || res.status === 403 || res.status === 405)
            throw new Error("Editing works at timebox.joelgaff.com (signed in).")
          if (!res.ok) throw new Error("save " + res.status)
          if (key === state.day) { state.dayText = body; render() }
        })
      })
    })
  }

  function submit(edit) {
    $("sheetSave").disabled = true
    return save(edit).then(function() { $("sheet").close() }).catch(function(e) {
      $("sheetError").textContent = "Couldn't save: " + (e && e.message ? e.message : e)
      $("sheetError").hidden = false
    }).then(function() { $("sheetSave").disabled = false })
  }

  function editBlock(q, n) {
    var day = state.parsed
    var block = PE.blockAt(M, day, q) || { start: q, end: q + n, text: "" }
    var input = el("input")
    input.type = "text"
    input.value = block.text
    input.placeholder = "What's this block?"
    input.setAttribute("enterkeyhint", "done")
    var start = timeSelect(block.start, 0, M.SLOTS - 1)
    var end = timeSelect(block.end, 1, M.SLOTS)
    var times = el("div", "times")
    times.appendChild(field("Start", start))
    times.appendChild(field("End", end))
    var body = el("div")
    body.appendChild(field("Block", input))
    body.appendChild(times)
    var existing = !!block.text
    openSheet(existing ? "Edit block" : "New block", body, function() {
      var s = +start.value, e = +end.value, text = input.value.trim()
      if (e <= s) { $("sheetError").textContent = "End must be after start."; $("sheetError").hidden = false; return }
      submit(function(d) {
        // Moving or resizing: clear where the block was, then write where it is now.
        if (existing) d = PE.setBlock(M, d, block.start, block.end, "")
        return PE.setBlock(M, d, s, e, text)
      })
    }, existing ? function() {
      submit(function(d) { return PE.setBlock(M, d, block.start, block.end, "") })
    } : null)
    if (!existing) setTimeout(function() { input.focus() }, 50)
  }

  function editPriority(i) {
    var p = state.parsed.priorities[i]
    var input = el("input")
    input.type = "text"
    input.value = p.text
    input.placeholder = "Priority " + (i + 1)
    var done = el("input")
    done.type = "checkbox"
    done.checked = !!p.done
    var check = el("label", "check")
    check.appendChild(done)
    check.appendChild(document.createTextNode("Done"))
    var body = el("div")
    body.appendChild(field("Priority " + (i + 1), input))
    body.appendChild(check)
    openSheet("Top priority", body, function() {
      submit(function(d) { return PE.setPriority(M, d, i, { text: input.value.trim(), done: done.checked }) })
    })
  }

  function toggleDone(i) {
    var p = state.parsed.priorities[i]
    if (!p.text) return editPriority(i)
    save(function(d) { return PE.setPriority(M, d, i, { done: !d.priorities[i].done }) })
      .catch(function(e) { setStatus("Couldn't save: " + e.message) })
  }

  function editNote(which) {
    var stored = which === 2 ? state.parsed.brainDump2 : state.parsed.brainDump
    var box = el("div", "editNote")
    box.contentEditable = "true"
    var html = stored ? (M.isRichText(stored) ? stored : M.plainToHtml(stored)) : ""
    box.innerHTML = html ? safeNotes(M.tonesToColors(html, tone)) : ""
    openSheet("Brain dump", box, function() {
      submit(function(d) { return PE.setNotes(M, d, which, box.innerHTML, tonePairs()) })
    })
    setTimeout(function() { box.focus() }, 50)
  }

  $("grid").addEventListener("click", function(e) {
    if (!state.layout || !state.parsed) return
    var y = e.clientY - $("grid").getBoundingClientRect().top
    var rows = M.buildRows(state.parsed.splits)
    for (var i = 0; i < state.layout.rows.length; i++) {
      var r = state.layout.rows[i]
      if (y >= r.y && y < r.y + r.h) return editBlock(rows[i].q, rows[i].n)
    }
  })
  $("note1").onclick = function() { editNote(1) }
  $("note2").onclick = function() { editNote(2) }
  // Save is the form's only submit button, so Return in a field saves.
  $("sheetForm").addEventListener("submit", function(e) {
    e.preventDefault()
    if (sheet.onSave) sheet.onSave()
  })
  $("sheetCancel").onclick = function() { $("sheet").close() }
  $("sheetClear").onclick = function() { if (sheet.onClear) sheet.onClear() }

  // ---- Loading ----

  function setStatus(text) {
    $("status").hidden = !text
    $("status").textContent = text || ""
  }

  function fetchText(url) {
    return fetch(url, { cache: "no-cache" }).then(function(r) {
      if (!r.ok) throw new Error(r.status)
      return r.text()
    })
  }

  function refresh() {
    var key = state.day
    return Promise.all([fetchText("/api/view"), fetchText("/api/days/" + key)]).then(function(res) {
      state.failures = 0
      setStatus("")
      if (res[0] !== state.profileText) {
        state.profileText = res[0]
        var p = {}
        try { p = JSON.parse(res[0]) } catch (e) {}
        applyProfile(p.colors && p.style ? p : defaultProfile())
        state.dayText = null // redraw with the new look
      }
      if (key !== state.day) return
      if (res[1] !== state.dayText) {
        state.dayText = res[1]
        render()
      }
    }).catch(function() {
      state.failures++
      if (state.failures > 1 || state.dayText === null)
        setStatus("Can't reach Timebox. Showing what was loaded last. If this keeps up, reload to sign in again.")
    })
  }

  function goTo(key) {
    state.day = key
    state.dayText = null
    drawHeader()
    refresh()
  }

  $("prev").onclick = function() { goTo(shiftKey(state.day, -1)) }
  $("next").onclick = function() { goTo(shiftKey(state.day, 1)) }
  $("dateText").onclick = function() { state.scrolledFor = ""; goTo(todayKey()) }
  document.querySelectorAll(".jump button").forEach(function(b) {
    b.onclick = function() { $(b.dataset.to).scrollIntoView({ behavior: "smooth", block: "start" }) }
  })

  // Keep the now line moving and the plan fresh while on screen.
  setInterval(function() {
    if (document.visibilityState !== "visible") return
    refresh()
    if (state.dayText !== null && state.day === todayKey()) render()
  }, POLL_MS)
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState !== "visible") return
    // Back after a while: if the date rolled over, jump to the new today.
    if (state.scrolledFor && state.scrolledFor !== todayKey() && state.day === state.scrolledFor) {
      state.scrolledFor = ""
      goTo(todayKey())
    } else refresh()
  })
  window.addEventListener("resize", function() { if (state.dayText !== null) render() })

  applyProfile(defaultProfile())
  drawHeader()
  refresh()
})()
