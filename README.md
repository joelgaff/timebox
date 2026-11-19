# Timebox

A daily timebox planner for the [Omarchy](https://omarchy.org) shell, modeled on the paper
"Daily Timebox Planner": top priorities, a brain dump, and a single-column schedule from 6 AM to 8 PM.
It follows your current Omarchy theme, and everything you write appears in a handwriting font, like pen on the paper original.

This is a fork of [HawzhinOmer/timebox](https://github.com/HawzhinOmer/timebox). It changes the
schedule to one column with optional 15-minute rows, adds Cal Newport-style versions of the day
and a "now" line, adds `timebox-import` so an assistant (or a script) can fill in a day, and
adds an optional server (for an always-on machine on your Tailscale network) that holds your
days, takes plans from Grok Bot, and serves a read-only phone view.

![Timebox Planner](preview.png)

- **Top Priorities**: three items; click the circle to mark one done.
- **Brain Dump**: free-form notes on a dotted pad, in two columns: **Today** (left) and
  **Tomorrow** (right). Notes are dashed lists: an empty box starts with `- ` when you click in,
  Return after a dashed line starts the next one, and Return on an empty dash ends the list
  (the same on the phone). Tests: `QT_QPA_PLATFORM=offscreen /usr/lib/qt6/bin/qmltestrunner -input tests/qml`.
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

An open planner reloads when its file changes, so imports show up right away. With the
server set up, `timebox-import` sends the plan to the server instead (`--dry-run` still works
locally), and `--show` reads from it.

### Grok Bot

`grokbot/SKILL.md` is a skill for Grok Bot: send it a voice memo or note about your day and it
shows you the plan, then sends it to the server with `curl` from its own machine (which is on
the Tailscale network), so it works while the laptop sleeps. Paste it in as a new skill with
`<GROKBOT_KEY>` replaced by the server's `grokbot` key; `~/.config/timebox/grokbot-skill.md` on
the laptop is a ready-filled copy (keep it private).

## Server and phone view (Beelink)

`server/` is a small Ruby + Sinatra app that holds the only real copy of every day. It runs on
an always-on machine (the Beelink) and is reachable only on the Tailscale network:

```
Grok Bot ──plan──►  Beelink: server/ + day files + backups  ◄── phone (read-only page)
                         ▲  load / save (polls every 5 s)
                         └── laptop: this plugin, with a local copy for offline reading
```

- **API**: `GET/PUT /api/days/YYYY-MM-DD` (saves need the current `ETag` in `If-Match`, so a
  stale save can't overwrite a newer day), `POST /api/plans` (same plan format as
  `timebox-import`), `GET/PUT /api/view` (the desktop's look), `/health`, and `/` (phone page).
- **Keys**: reading is open to the tailnet; writing needs a key from
  `~/.config/timebox-server/tokens.json` on the server: `laptop` (days, look, fonts, plans) and
  `grokbot` (plans only).
- **Pinned**: Ruby in `server/mise.toml` (run through `server/bin/ruby`, so system updates can't
  change it) and gems in `Gemfile.lock`. Update on purpose: bump, `bundle install`, run the
  tests, deploy.
- **Tests**: `cd server && bin/ruby -S bundle exec rake` (server), `node --test tests/`
  (planner and phone JS) and `QT_QPA_PLATFORM=offscreen /usr/lib/qt6/bin/qmltestrunner -input
  tests/qml` (notes typing in Qt). Tests come first.
- **Deploy**: `server/bin/deploy` copies the code to `~/apps/timebox-server` on the Beelink,
  installs Ruby and gems, runs the tests there, installs the `timebox-server` systemd user
  service and restarts it. Data lives in `~/.local/share/timebox-server/` (day files as below,
  plus `backups/`, at most one per day file every 10 minutes and always before an import).
- **Tailscale**: `tailscale serve --bg --https=4590 http://127.0.0.1:4590` publishes it at
  `https://beelink.tailaa12cd.ts.net:4590`, tailnet-only (never Funnel).

**Laptop**: `~/.config/timebox/config.json` (`{"server": "https://beelink.tailaa12cd.ts.net:4590"}`)
and the `laptop` key in `~/.config/timebox/token` switch the plugin to the server. The planner
loads and saves days there; if a save finds the day changed (an import landed), the planner shows
the new version and keeps your edit as a `conflict` version. Without the server it shows the last
copy read-only, marked offline, and retries a save it couldn't make. The reminder service keeps
today's copy in `~/.local/share/omarchy-timebox/` fresh every minute for the bar and reminders,
and sends the desktop's look to the server. Delete `config.json` to go back to local files.

**Phone**: open `https://timebox.joelgaff.com` in Safari (or `https://beelink.tailaa12cd.ts.net:4590`
with Tailscale on), then Share → Add to Home Screen. It shows the latest plan: the date with ‹ › (tap the date for today), a jump
bar (Schedule · Priorities · Notes), the schedule opened at the current time, then the top
priorities and the brain dump. It refreshes every 15 seconds while on screen.

Editing (at `timebox.joelgaff.com`, signed in): tap a block or an empty row to name, move,
resize or clear it (start and end in 15-minute steps); tap a priority to edit it or its circle
to mark it done; tap a notes box to edit it (colors are kept). Each save loads the latest copy,
applies the edit and saves it only on top of that copy, retrying once if the day changed.
Like the desktop, a time change keeps the old plan as a version (`source: phone`, one per
45-minute round) and wiping most of a note keeps it as a `notes` version. The editing logic is
in `server/public/phone-edit.js` (tested in `tests/phone-edit.test.js`).

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

### Public door: timebox.joelgaff.com

The phone view is also published at `https://timebox.joelgaff.com`, read-only and behind
Cloudflare Access, so the phone doesn't need Tailscale. The data stays on the Beelink; the
laptop and Grok Bot keep using the tailnet address.

```
phone ─► timebox.joelgaff.com ─► Cloudflare Access (sign in: one-time code to Joel's email)
        ─► Cloudflare Tunnel "timebox" ─► Beelink :4592 (timebox-public: read-only instance)
```

- **Access app** "Timebox" (team `small-base-a70f`): only Joel's email may sign in, by a
  one-time PIN; sessions last 30 days.
- **The server checks too**: `timebox-public` (port 4592, `TIMEBOX_ACCESS_TEAM` and
  `TIMEBOX_ACCESS_AUD` in `~/.config/timebox-server/public.env`) answers only requests with a
  valid Access JWT for this app (signature against the team's keys, issuer, audience, expiry),
  static files included, only for the emails in `TIMEBOX_ACCESS_EMAILS`. It allows only
  GET/HEAD, plus PUT of a day from the phone page (which sends `X-Timebox-Client: phone`, a
  header other sites' forms and scripts can't send, so a signed-in browser can't be tricked
  into saving); plans, the view profile and fonts can't be changed through it. Without that, it's a bare 403, even if Access were
  switched off by mistake. Tests: `server/test/access_test.rb`.
- **Tunnel**: `timebox-tunnel` (systemd user service) runs `cloudflare/cloudflared` (pinned tag)
  with the tunnel token from `~/.config/timebox-server/tunnel.env`. DNS: `timebox` is a proxied
  CNAME to the tunnel.
- **Checked signed out** (`curl https://timebox.joelgaff.com/<path>`): every path, including
  `/api/days/...`, the page's scripts, and a PUT, redirects to the Access sign-in with no data;
  a forged `Cf-Access-Jwt-Assertion` header gets the same.
- **Turn it off**: `systemctl --user disable --now timebox-tunnel timebox-public` on the Beelink
  (and delete the DNS record if it's for good).

## Desktop and phone views

The planner has two views of the same days: this plugin on the Omarchy desktop, and the
read-only phone page (`server/public/`). They must look the same, with the phone using one
column: a date bar and jump bar, the schedule (opened at the current time), then the top
priorities, then the brain dump. The phone shows only the latest plan, no versions.

**Any visual change updates both views, in the same commit.** That covers colors, fonts, sizes,
spacing, lines, boxes, the now line and anything new on screen that both views show.

- Sizes, spacing and other look values belong in `TimeboxLook.js`, which the plugin imports and
  the phone gets through the view profile, not hard-coded in one view. Schedule layout math for
  the phone is in `server/public/phone-view.js` (tested in `tests/phone-view.test.js`).
- Colors and fonts always come from the current Omarchy theme. The reminder service sends them
  (and the Omarchy sizes) to the server as the view profile; `bin/timebox-publish-fonts` uploads
  the font files.
- When a change can only be made in one view (a desktop-only key, say), note why in the commit.

## Data

Each day is saved automatically as JSON in `~/.local/share/omarchy-timebox/YYYY-MM-DD.json`
(with the server, that's the laptop's copy; the real one is the same file on the server);
the reminder setting lives in `settings.json` in the same folder.

- `slots`: `"HH:MM": "text"`. A half hour is one key (`"09:00"`) covering both of its quarters
  unless it's split, in which case its `:15` / `:45` key holds the second quarter.
- `splits`: the half hours shown as two 15-minute rows (`["12:30"]`).
- `versions`: earlier versions of the day, each with `at` (when it was kept), its `slots`,
  `splits` and colors, the two notes boxes (`notes`, `notes2`), and a `source` (`auto`,
  `import`, `restore`, `phone`, `notes` when a save would have wiped most of a note, or
  `conflict` for an edit that lost a race with an import; none when you pressed Snapshot).

Days saved before this format load unchanged; entries outside 6 AM to 8 PM are kept but not shown.
If a day's file can't be read or isn't valid JSON, the planner opens it read-only with a warning
rather than overwriting it.

## License

MIT. The bundled handwriting font, [Caveat](https://github.com/googlefonts/caveat), is licensed
under the SIL Open Font License 1.1 (see `fonts/OFL.txt`).

---

Created by [HawzhinOmer](https://github.com/HawzhinOmer). Fork changes by [joelgaff](https://github.com/joelgaff).
