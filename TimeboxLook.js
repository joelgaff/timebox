.pragma library

// The planner's look, shared by the desktop plugin (Timebox.qml) and the phone page
// (server/public, which gets these values through the view profile). Change a value
// here and both views follow. Sizes are in Omarchy units: "space" values go through
// Style.space() (px() below for the phone); "Title"/"Heading" values multiply that
// Omarchy font size.
var LOOK = {
  // Schedule column
  rowHeightTitles: 3.2,         // a half-hour row is at least this many title-font heights
  labelWidthSpace: 50,          // the time-label column
  labelBandAlpha: 0.05,         // tint behind the time labels
  timeFit: 0.7,                 // time label never taller than this share of its row
  timeMinorScale: 0.75,         // :30 / :15 labels, relative to the hour labels
  timeMinorOpacity: 0.55,
  blockHeadingScale: 1.25,      // block text: heading font x hand scale x this...
  blockFit: 0.82,               // ...but never taller than this share of its row
  blockInsetSpace: 12,          // text inset inside a box
  boxWidthSpace: 3,             // timebox border
  boxWidthMin: 2,
  lineAlpha: 0.28,              // grid line color (foreground at this alpha)
  halfHourLineOpacity: 0.45,
  quarterLineOpacity: 0.25,
  nowDotSpace: 10,
  nowLineSpace: 2,
  nowLineMin: 2,

  // Handwriting (Caveat) is drawn larger than the UI font at the same nominal size
  handScale: 1.4,

  // Text colors
  mutedAlpha: 0.55,
  placeholderOpacity: 0.6,

  // Priorities and brain dump
  labelGapSpace: 10,
  sectionGapSpace: 26,
  priorityRowSpace: 52,
  checkSpace: 16,
  checkInsetSpace: 16,
  checkGapSpace: 14,
  doneOpacity: 0.5,
  dumpFillAlpha: 0.03,
  dumpDotAlpha: 0.22,
  dumpDotStepSpace: 22,
  dumpPadSpace: 16,
  dumpTitleScale: 1.25          // notes: title font x hand scale x this
}

// Omarchy space units -> pixels, for the phone (style.space = pixels per unit).
function px(style, units) {
  return Math.round(units * (style && style.space ? style.space : 1))
}
