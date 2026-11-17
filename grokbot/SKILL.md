# Timebox: put my day plan on my Framework

Use this whenever I send a voice memo or note about my day (what I need to get
done, meetings, workouts, errands) or ask you to plan or re-plan a day.

1. Build the day's schedule the way you normally do: realistic blocks with
   start and end times, my top three priorities, and any loose notes or
   reminders that don't belong in a time slot.
2. Show me the schedule in chat as usual.
3. Then put it in my Timebox planner by running this on my Framework 13
   (local command), with the plan as JSON:

   ```bash
   ~/.local/bin/timebox-import <<'JSON'
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
- The command prints the saved schedule. Tell me in one line that it's in
  Timebox. If it fails (laptop asleep or offline), say so and keep the plan in
  chat so I can retry with "push it to Timebox".
- Before replacing a plan, the old one is saved automatically as a snapshot
  (a "version" of the day), so re-planning is safe.
- To read back what's in the planner: `~/.local/bin/timebox-import --show YYYY-MM-DD`.
