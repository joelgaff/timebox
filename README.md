# Timebox

A daily timebox planner for the [Omarchy](https://omarchy.org) shell, modeled on the paper
"Daily Timebox Planner": top priorities, a brain dump, and a single-column schedule from 6 AM to 8 PM.
It follows your current Omarchy theme, and everything you write appears in a handwriting font, like pen on the paper original.

This is a fork of [HawzhinOmer/timebox](https://github.com/HawzhinOmer/timebox). It changes the
schedule to one column with optional 15-minute rows, adds Cal Newport-style versions of the day
and a "now" line, and adds `timebox-import` so an assistant (or a script) can fill in a day.

![Timebox Planner](preview.png)

- **Top Priorities**: three items; click the circle to mark one done.
- **Brain Dump**: free-form notes on a dotted pad, in two columns.
- **Schedule**: one column of half-hour rows, 6 AM to 8 PM, that scrolls when the window is short.
  Consecutive rows with the same text are drawn as one boxed timebox; every block gets a box.
- **15-minute rows**: click a time label (`9` or `:30`) to split that half hour into two
  15-minute rows (`:15` / `:45`), drawn half height; click again to merge them. A split half hour
  goes back to one row when a deletion empties either half.
- **Now line**: on today's page a line marks the current time, to the minute, and moves through
  the day; the current row's time label is highlighted too.
- **Snapshots** (Newport-style revisions): once the day has begun (your first block's start
  time has passed), the planner keeps the plan as it was before a change to its times: a block
  added, removed, moved or resized. Renames, typo fixes and colors don't count, nor does anything
  before the day begins or on a future day. Time changes within 45 minutes of each other count
  as one revision. Press **Snapshot** (or Ctrl+S) to keep a version yourself anytime.
  Versions live in the day's JSON under `versions`; the strip above the schedule
  (`v1 · 9:05 AM`, `v2 · 11:40 AM`, `Now`) shows any of them read-only, ‹ › or ←/→ step through
  them, and **Restore this version** brings one back (keeping the current plan first).
  `timebox-import` keeps the old plan as a version before replacing it.
- **Text color**: the **A** button colors what you've selected with your theme's colors (Default, Red, or Accent): highlighted
  words in the Brain Dump, the priority you're in, or the selected schedule slots.
- **Colors**: every color comes from your Omarchy theme and changes with it. The round button picks
  which theme color the blocks and highlights use (T = the theme's accent).
- **Reminders**: a desktop notification when each block starts (e.g. `Deep work · 9:00 AM – 10:30 AM`).
  Click it to open the planner. The bell button next to the date switches between *At start*,
  *5 min before*, *5 min before + start*, and *Off*. Check the next one with `omarchy-shell hawzhin.timebox.reminders next`.
- **Bar widget**: shows the block you're in and how long is left (`Deep work · 56m`),
  or the next block when nothing is scheduled right now. Hover for details; click to open the planner.

## Fill a day from a plan: `timebox-import`

`bin/timebox-import` writes a day from a JSON plan, so an assistant or a script can fill in the
planner. Link it onto your PATH once:

```bash
ln -s ~/.config/omarchy/plugins/hawzhin.timebox/bin/timebox-import ~/.local/bin/timebox-import
```

```bash
timebox-import <<'JSON'
{
  "date": "2026-11-17",
  "priorities": ["Ship the draft", "Submit one application", "Run"],
  "blocks": [
    {"start": "08:30", "end": "11:00", "text": "Deep work"},
    {"start": "12:00", "end": "12:45", "text": "Lunch"}
  ],
  "notes": "Anything that doesn't fit a time slot",
  "mode": "replace"
}
JSON
```

- `date` defaults to today; `priorities` and `notes` are kept as they are when left out.
- `mode`: `replace` (default) clears the day's schedule first; `merge` only overwrites the times
  the blocks cover.
- Times snap to 15 minutes; a half hour holding two different blocks becomes two 15-minute rows.
- The plan being replaced is kept as a version, and the old file is copied to
  `~/.local/share/omarchy-timebox/backups/`.
- `timebox-import --show [YYYY-MM-DD]` prints a day; `--dry-run` prints the result without saving.

An open planner reloads when its file changes, so imports show up right away.

### Grok Bot

`grokbot/SKILL.md` is a skill for Grok Bot (or any assistant that can run commands on this
machine): send it a voice memo or note about your day and it shows you the plan, then runs
`timebox-import` to put it in the planner. Paste it in as a new skill.

## Web and Android

The original Timebox is also available as a web and Android app (without this fork's changes):
https://timebox.timebox-app.workers.dev

## Install

```bash
omarchy plugin add https://github.com/joelgaff/timebox.git --enable
```

`--enable` puts the bar widget in the center section. Move it with, for example:

```bash
omarchy bar move hawzhin.timebox --after omarchy.clock
```

Bind the planner to a key in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + D", "Timebox planner", "omarchy-shell shell toggle hawzhin.timebox")
```

For the handwriting to survive shell plugin reloads, install the bundled font once:

```bash
mkdir -p ~/.local/share/fonts && cp ~/.config/omarchy/plugins/hawzhin.timebox/fonts/Caveat.ttf ~/.local/share/fonts/ && fc-cache -f
omarchy restart shell
```

The planner uses the installed Caveat when it's there and falls back to the bundled file otherwise.

The planner opens as a normal window (close it with Esc or SUPER + Q). To have it fill the screen
(keeping the bar), add this to `~/.config/hypr/hyprland.lua`:

```lua
o.window({ class = "^org.quickshell$", title = "^Timebox Planner$" },
  { maximize = true, tag = "-default-opacity", opacity = "1 1" })
```

## Remove

```bash
omarchy plugin remove hawzhin.timebox
```

Then delete the keybinding line from `~/.config/hypr/bindings.lua` (and the window rule from
`~/.config/hypr/hyprland.lua` if you added it). Your saved days stay in
`~/.local/share/omarchy-timebox/`; delete that folder too if you don't want them.

## Requirements

Omarchy with the Quickshell-based shell (Omarchy 4 / Quattro). No other dependencies.

## Keys

| Key | Action |
| --- | --- |
| Click / drag, Shift+click | Select rows |
| Type or Enter | Fill the selected rows (Esc cancels) |
| Enter while typing | Save and move down one row, like a spreadsheet |
| Del / Backspace | Clear the selected rows |
| ↑ / ↓, Shift+↑ / ↓ | Move / extend the selection |
| ← / → | Older / newer snapshot of the day |
| Ctrl+S | Take a snapshot |
| Click a time label | Split that half hour into 15-minute rows (click again to merge) |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / cut / paste rows (several lines paste into rows in order) |
| Tab / Shift+Tab | Next / previous row (saves what you're typing first) |
| PgUp / PgDn | Previous / next day |
| Home | Jump to today |
| Esc | Close (or back to Now while viewing a version) |

To change a block's times, select rows and type its name to extend it, Del to shorten it, or
Ctrl+X / Ctrl+V to move it.

## Bar widget settings

Set these on the widget's entry in `~/.config/omarchy/shell.json`, e.g.
`omarchy bar set hawzhin.timebox maxLength 20`:

| Key | Default | Meaning |
| --- | --- | --- |
| `maxLength` | `28` | Longest block name before it's shortened with `…` |
| `showNext` | `true` | Show the next block when nothing is scheduled right now |

## Data

Each day is saved automatically as JSON in `~/.local/share/omarchy-timebox/YYYY-MM-DD.json`;
the reminder setting lives in `settings.json` in the same folder.

- `slots`: `"HH:MM": "text"`. A half hour is one key (`"09:00"`) covering both of its quarters
  unless it's split, in which case its `:15` / `:45` key holds the second quarter.
- `splits`: the half hours shown as two 15-minute rows (`["12:30"]`).
- `versions`: earlier versions of the day, each with `at` (when it was kept), its `slots`,
  `splits` and colors, and a `source` (`auto`, `import` or `restore`; none when you pressed
  Snapshot).

Days saved before this format load unchanged; entries outside 6 AM to 8 PM are kept but not shown.
If a day's file can't be read or isn't valid JSON, the planner opens it read-only with a warning
rather than overwriting it.

## License

MIT. The bundled handwriting font, [Caveat](https://github.com/googlefonts/caveat), is licensed
under the SIL Open Font License 1.1 (see `fonts/OFL.txt`).

---

Created by [HawzhinOmer](https://github.com/HawzhinOmer). Fork changes by [joelgaff](https://github.com/joelgaff).
