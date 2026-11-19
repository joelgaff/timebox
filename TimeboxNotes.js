.pragma library
.import "TimeboxModel.js" as Model

// Typing in a brain-dump box (Timebox.qml): notes are dashed lists. An empty box starts
// with "- " when you click in (and empties again if you leave it untouched); Return after
// a dashed line starts the next "- "; Return on an empty dash ends the list. The phone
// page does the same (server/public/phone.js). Tested in tests/qml/tst_notes_list.qml.

var LINE_BREAKS = [String.fromCharCode(0x2029), String.fromCharCode(0x2028), "\n"]

function plain(edit) {
  return edit.getText(0, edit.length)
}

// Where the line holding position p starts.
function lineStart(text, p) {
  var start = 0
  for (var i = 0; i < LINE_BREAKS.length; i++)
    start = Math.max(start, text.lastIndexOf(LINE_BREAKS[i], p - 1) + 1)
  return start
}

// Notes that are only an untouched starter dash count as empty.
function isEmpty(edit) {
  var t = plain(edit)
  return edit.length === 0 || Model.onlyDashes(t.split(LINE_BREAKS[0]).join("\n").split(LINE_BREAKS[1]).join("\n"))
}

// Call from onActiveFocusChanged. Returns true when it changed the text (the caller
// should treat that as not an edit).
function focusChanged(edit, focused) {
  if (edit.readOnly) return false
  if (focused && edit.length === 0) {
    edit.insert(0, Model.DASH)
    edit.cursorPosition = edit.length
    return true
  }
  if (!focused && edit.length > 0 && isEmpty(edit)) {
    edit.text = ""
    return true
  }
  return false
}

// Call from Keys.onReturnPressed / onEnterPressed.
function returnPressed(edit, event) {
  if (edit.readOnly) { event.accepted = false; return }
  var p = edit.cursorPosition
  var text = plain(edit)
  var start = lineStart(text, p)
  var action = Model.dashReturn(text.slice(start, p))
  if (action === "continue") {
    edit.insert(p, "<br>" + Model.DASH)
    event.accepted = true
  } else if (action === "end") {
    edit.remove(start, p)
    event.accepted = true
  } else {
    event.accepted = false
  }
}
