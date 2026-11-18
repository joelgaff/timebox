require "json"
require "time"
require "date"

module Timebox
  # Applies a day plan (from Grok Bot or anything else) to a day, the way the
  # planner stores it. Ported from bin/timebox-import.
  #
  # Plan: {"date": "YYYY-MM-DD", "priorities": [...], "blocks": [{"start", "end", "text"}],
  #        "notes": "...", "mode": "replace" | "merge"}. Only "blocks" is required.
  #
  # Times snap to 15 minutes (start rounds down, end rounds up). A half hour holding two
  # different quarters is split. If the schedule or notes change, the old ones are kept
  # as a version of the day.
  module Import
    PRIORITIES = 3

    class Error < StandardError; end

    module_function

    def parse_time(value, round_up:)
      m = /\A\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*\z/i.match(value.to_s)
      raise Error, "can't read time #{value.inspect} (use 24-hour HH:MM)" unless m
      h = m[1].to_i
      mins = (m[2] || 0).to_i
      h = h % 12 + (m[3].downcase.start_with?("p") ? 12 : 0) if m[3]
      total = h * 60 + mins
      raise Error, "time out of range: #{value.inspect}" unless total.between?(0, 24 * 60)
      round_up ? (total + 14) / 15 * 15 : total / 15 * 15
    end

    def slot_key(minutes)
      format("%02d:%02d", minutes / 60, minutes % 60)
    end

    # Stored map -> {quarter key => text}. An unsplit half hour's text covers both quarters.
    def expand(slot_map, split_keys)
      splits = Array(split_keys)
      quarters = {}
      48.times do |half|
        k0 = slot_key(half * 30)
        k1 = slot_key(half * 30 + 15)
        a = slot_map[k0].to_s
        split = splits.include?(k0) || slot_map.key?(k1)
        b = split ? slot_map[k1].to_s : a
        quarters[k0] = a unless a.empty?
        quarters[k1] = b unless b.empty?
      end
      quarters
    end

    # {quarter key => text} -> [stored map, split half keys]. Halves whose quarters differ are split.
    def compress(quarters, keep_splits = [])
      out = {}
      splits = []
      48.times do |half|
        k0 = slot_key(half * 30)
        k1 = slot_key(half * 30 + 15)
        a = quarters.fetch(k0, "")
        b = quarters.fetch(k1, "")
        if a == b && !keep_splits.include?(k0)
          out[k0] = a unless a.empty?
          next
        end
        splits << k0
        out[k0] = a unless a.empty?
        out[k1] = b unless b.empty?
      end
      [out, splits]
    end

    def valid_date(key)
      Date.strptime(key, "%Y-%m-%d")
      key
    rescue ArgumentError, TypeError
      raise Error, "bad date #{key.inspect} (use YYYY-MM-DD)"
    end

    # Returns [date key, new day hash]. `day` is the current day hash ({} when none).
    def apply(day, plan, now: Time.now)
      raise Error, "plan must be a JSON object" unless plan.is_a?(Hash)
      key = valid_date((plan["date"] || now.strftime("%Y-%m-%d")).to_s)
      mode = plan.fetch("mode", "replace")
      raise Error, "mode must be 'replace' or 'merge'" unless %w[replace merge].include?(mode)
      blocks = plan["blocks"]
      raise Error, "plan needs a 'blocks' list" unless blocks.is_a?(Array)

      day = JSON.parse(JSON.generate(day || {})) # deep copy
      old_map = day["slots"].is_a?(Hash) ? day["slots"] : {}
      old_splits = day["splits"].is_a?(Array) ? day["splits"] : []
      quarters = mode == "replace" ? {} : expand(old_map, old_splits)
      blocks.each do |b|
        next unless b.is_a?(Hash)
        text = b["text"].to_s.strip
        next if text.empty?
        start = parse_time(b["start"], round_up: false)
        finish = parse_time(b.fetch("end", b["start"]), round_up: true)
        finish = start + 15 if finish <= start
        (start...[finish, 24 * 60].min).step(15) { |m| quarters[slot_key(m)] = text }
      end
      # Keep anything the planner stores outside the 15-minute keys.
      extra = mode == "merge" ? old_map.reject { |k, _| k.match?(/\A\d\d:(00|15|30|45)\z/) } : {}
      slots, splits = compress(quarters, mode == "merge" ? old_splits : [])
      slots.merge!(extra)

      # Newport-style: keep the plan (and notes) being replaced as a version of the day.
      old_slots = old_map.reject { |_, v| v.to_s.empty? }
      old_notes = day["brainDump"].to_s
      old_notes2 = day["brainDump2"].to_s
      notes_replaced = plan.key?("notes") && !old_notes.empty? && plan["notes"].to_s != old_notes
      if (!old_slots.empty? && old_slots != slots) || notes_replaced
        versions = day["versions"].is_a?(Array) ? day["versions"] : []
        last = versions.last
        if !last || last["slots"] != old_slots || last["notes"].to_s != old_notes
          entry = { "at" => now.strftime("%Y-%m-%dT%H:%M:%S"), "slots" => old_slots, "source" => "import",
                    "notes" => old_notes, "notes2" => old_notes2 }
          entry["slotColors"] = day["slotColors"] if day["slotColors"].is_a?(Hash) && !day["slotColors"].empty?
          entry["splits"] = old_splits unless old_splits.empty?
          versions << entry
          day["versions"] = versions
        end
      end

      day["date"] = key
      day["slots"] = slots
      splits.empty? ? day.delete("splits") : day["splits"] = splits
      day.delete("slotColors") if mode == "replace" # colors belong to the old slots

      if plan.key?("priorities")
        items = Array(plan["priorities"]).first(PRIORITIES).map do |p|
          p.is_a?(Hash) ? { "text" => p["text"].to_s, "done" => !!p["done"] } : { "text" => p.to_s, "done" => false }
        end
        items << { "text" => "", "done" => false } while items.length < PRIORITIES
        day["priorities"] = items
      end
      day["priorities"] ||= Array.new(PRIORITIES) { { "text" => "", "done" => false } }
      day["brainDump"] = plan["notes"].to_s if plan.key?("notes")
      day["brainDump"] ||= ""
      [key, day]
    end

    # A short text listing of a day's schedule, as timebox-import --show prints it.
    def summary(key, day)
      lines = ["Timebox #{key}"]
      Array(day["priorities"]).each_with_index do |p, i|
        next unless p.is_a?(Hash) && !p["text"].to_s.empty?
        lines << "  P#{i + 1} #{p['done'] ? '[x]' : '[ ]'} #{p['text']}"
      end
      prev = nil
      (day["slots"] || {}).sort.each do |k, v|
        lines << "  #{k}  #{v}" if !v.to_s.empty? && v != prev
        prev = v
      end
      lines.join("\n")
    end
  end
end
