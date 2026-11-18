import QtQuick
import Quickshell
import Quickshell.Io
import "TimeboxModel.js" as Model
import "TimeboxServer.js" as Server

// Background service: sends a desktop notification when a timebox starts.
// Runs once per shell (not per bar), so reminders keep working without the
// bar widget and never arrive twice on multi-monitor setups.
// With the Beelink server configured, it also keeps this laptop's copy of today
// fresh (every minute), which the menu bar and these reminders read.
Item {
  id: root

  property string omarchyPath: Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy"
  property var shell: null
  property var manifest: null

  property string dataDir: Quickshell.env("HOME") + "/.local/share/omarchy-timebox"
  property date now: clock.date
  readonly property string dateKey: Qt.formatDate(now, "yyyy-MM-dd")
  property var slots: Model.emptyDay().slots
  property string mode: "start"
  // Recent "<date>@<slot>-<lead>" keys, so a reload in the same minute
  // can't send a reminder twice.
  property var sent: []

  readonly property string serverUrl: Server.parseConfig(root.configText).server
  property string configText: ""
  property string etag: ""
  property string etagKey: ""
  property bool fetching: false

  // Copy today from the server into the local file when it changed.
  function syncToday() {
    if (root.serverUrl === "" || root.fetching) return
    var key = root.dateKey
    root.fetching = true
    Server.request("GET", Server.dayUrl(root.serverUrl, key),
      { ifNoneMatch: root.etagKey === key ? root.etag : "" },
      function(status, body, tag, exists) {
        root.fetching = false
        if (status !== 200 || key !== root.dateKey) return
        root.etag = tag
        root.etagKey = key
        if (exists && body !== root.cacheText) cacheFile.setText(body)
      })
  }

  property string cacheText: ""

  function minuteOfDay() {
    return root.now.getHours() * 60 + root.now.getMinutes()
  }

  function check() {
    var leads = Model.reminderLeads(root.mode)
    for (var i = 0; i < leads.length; i++) {
      var run = Model.runStartingAt(root.slots, root.minuteOfDay() + leads[i])
      if (!run) continue
      var key = root.dateKey + "@" + run.start + "-" + leads[i]
      if (root.sent.indexOf(key) !== -1) continue
      root.sent = root.sent.concat([key]).slice(-8)
      root.notify(run, leads[i])
    }
  }

  function notify(run, lead) {
    Quickshell.execDetached([
      root.omarchyPath + "/bin/omarchy-notification-send",
      "--app-name", "Timebox Planner",
      "-g", "󰃰",
      "-u", "normal",
      "-t", "10000",
      lead > 0 ? "In " + lead + " min: " + run.text : run.text,
      Model.slotTime(run.start) + " – " + Model.slotTime(run.start + run.len),
      "--exec", "omarchy-shell", "shell", "summon", "hawzhin.timebox", "{}"
    ])
  }

  function nextReminder() {
    var runs = Model.computeRuns(root.slots).runs
    var leads = Model.reminderLeads(root.mode)
    if (!leads.length) return "reminders are off"
    var minute = root.minuteOfDay()
    for (var r = 0; r < runs.length; r++) {
      var at = Model.slotMinutes(runs[r].start) - leads[0]
      if (at > minute) {
        var t = new Date(2000, 0, 1, Math.floor(at / 60), at % 60)
        return Qt.formatTime(t, "h:mm AP") + " " + runs[r].text + " (" + Model.reminderLabel(root.mode) + ")"
      }
    }
    return "none left today"
  }

  onSlotsChanged: check()

  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: {
      root.now = date
      dayFile.reload()
      root.check()
      root.syncToday()
    }
  }

  FileView {
    id: dayFile
    path: root.dataDir + "/" + root.dateKey + ".json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      root.cacheText = text()
      var day = Model.parseDay(text())
      root.slots = day ? day.slots : Model.emptyDay().slots
    }
    onLoadFailed: root.slots = Model.emptyDay().slots
    onFileChanged: reload()
  }

  FileView {
    id: cacheFile
    path: root.dataDir + "/" + root.dateKey + ".json"
    atomicWrites: true
    printErrors: false
  }

  FileView {
    path: Quickshell.env("HOME") + "/.config/timebox/config.json"
    watchChanges: true
    printErrors: false
    onLoaded: { root.configText = text(); root.syncToday() }
    onLoadFailed: root.configText = ""
    onFileChanged: reload()
  }

  FileView {
    id: settingsFile
    path: root.dataDir + "/settings.json"
    watchChanges: true
    printErrors: false
    onLoaded: root.mode = Model.reminderMode(Model.parseSettings(text()))
    onLoadFailed: root.mode = "start"
    onFileChanged: reload()
  }

  IpcHandler {
    target: "hawzhin.timebox.reminders"
    function next(): string { return root.nextReminder() }
  }
}
