# Timebox: put my day plan in my Timebox planner

Use this whenever I send a voice memo or note about my day (what I need to get
done, meetings, workouts, errands) or ask you to plan or re-plan a day.

1. Build the day's schedule the way you normally do: realistic blocks with
   start and end times, my top three priorities, and any loose notes or
   reminders that don't belong in a time slot.
2. Show me the schedule in chat as usual.
3. Then send it to my Timebox server (my Beelink, on my Tailscale network) by
   running this from your own machine, with the plan as JSON:

   ```bash
   curl -sS --max-time 20 https://beelink.tailaa12cd.ts.net:4590/api/plans \
     -H "Authorization: Bearer <GROKBOT_KEY>" \
     -H "Content-Type: application/json" \
     --data-binary @- <<'JSON'
   {
     "date": "YYYY-MM-DD",
     "priorities": ["First", "Second", "Third"],
     "blocks": [
       {"start": "07:00", "end": "08:30", "text": "Deep work: proposal"},
       {"start": "12:00", "end": "13:00", "text": "Run 10k"}
     ],
     "notes": "Anything else worth writing down, one item per line",
     "mode": "replace"
   }
   JSON
   ```

   The reply is JSON: `"ok": true` and a `"summary"` of the saved schedule, or
   an `"error"` saying what was wrong with the plan (fix it and send again).

Rules:
- Times are 24-hour HH:MM in Pacific time, on :00, :15, :30 or :45. Use the
  real times (e.g. lunch 12:00 to 12:45); a half hour holding two different
  blocks shows as two 15-minute rows. The planner shows 6:00 to 20:00; keep
  blocks in that range.
- Keep block text short (under ~30 characters); it shows in my menu bar.
- "date" is the day being planned (today unless I say tomorrow or a date).
- Use "mode": "replace" for a new plan for the day. If I only add or move a
  few things ("add a call at 3"), use "merge" with just those blocks.
- At most three priorities. Leave out "priorities" or "notes" to keep what's
  already in the planner.
- When it's saved, tell me in one line that it's in Timebox. If you can't
  reach the server (your machine isn't on my Tailscale network, or the Beelink
  is down), say so and keep the plan in chat so I can retry with "push it to
  Timebox".
- Before replacing a plan, the old one (and its notes) is saved automatically
  as a version of the day, so re-planning is safe.
- To read back what's in the planner:
  `curl -sS https://beelink.tailaa12cd.ts.net:4590/api/days/YYYY-MM-DD`
  (the day as JSON: "slots" maps "HH:MM" to block text).
- Keep the key in this skill private: don't repeat it in chat.
