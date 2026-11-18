require_relative "test_helper"
require "open3"

class ImportTest < Minitest::Test
  I = Timebox::Import
  NOW = Time.new(2026, 11, 18, 9, 0, 0)

  def test_times_snap_to_quarters
    assert_equal 9 * 60, I.parse_time("9:07", round_up: false)
    assert_equal 9 * 60 + 15, I.parse_time("9:07", round_up: true)
    assert_equal 13 * 60 + 30, I.parse_time("1:30pm", round_up: false)
    assert_raises(I::Error) { I.parse_time("noon", round_up: false) }
  end

  def test_split_half_hours
    _, day = I.apply({}, { "date" => "2030-01-01", "blocks" => [
      { "start" => "12:00", "end" => "12:45", "text" => "Lunch" },
      { "start" => "12:45", "end" => "13:00", "text" => "Walk" }
    ] }, now: NOW)
    assert_equal({ "12:00" => "Lunch", "12:30" => "Lunch", "12:45" => "Walk" }, day["slots"])
    assert_equal ["12:30"], day["splits"]
  end

  def test_replacing_keeps_old_plan_and_notes_as_version
    old = { "slots" => { "09:00" => "A" }, "brainDump" => "old notes" }
    _, day = I.apply(old, { "date" => "2030-01-01", "blocks" => [{ "start" => "10:00", "end" => "11:00", "text" => "B" }],
                            "notes" => "new" }, now: NOW)
    v = day["versions"].last
    assert_equal({ "09:00" => "A" }, v["slots"])
    assert_equal "old notes", v["notes"]
    assert_equal "import", v["source"]
    assert_equal "new", day["brainDump"]
  end

  def test_merge_keeps_other_blocks
    old = { "slots" => { "09:00" => "A" } }
    _, day = I.apply(old, { "date" => "2030-01-01", "mode" => "merge",
                            "blocks" => [{ "start" => "15:00", "end" => "15:30", "text" => "Call" }] }, now: NOW)
    assert_equal({ "09:00" => "A", "15:00" => "Call" }, day["slots"])
  end

  # The Ruby import must match bin/timebox-import (the Python original) exactly.
  PY = File.expand_path("../../bin/timebox-import", __dir__)

  def python_result(day, plan)
    Dir.mktmpdir do |home|
      data = File.join(home, ".local/share/omarchy-timebox")
      FileUtils.mkdir_p(data)
      File.write(File.join(data, "#{plan['date']}.json"), JSON.generate(day)) unless day.empty?
      out, err, st = Open3.capture3({ "HOME" => home }, "python3", PY, "--dry-run", stdin_data: JSON.generate(plan))
      raise err unless st.success?
      JSON.parse(out)
    end
  end

  def strip_times(day)
    Array(day["versions"]).each { |v| v.delete("at") }
    day
  end

  def test_matches_python
    skip "python3 not available" unless system("python3 -c 1", out: File::NULL)
    existing = { "date" => "2030-01-01", "slots" => { "09:00" => "Old", "12:30" => "X", "12:45" => "Y" },
                 "splits" => ["12:30"], "slotColors" => { "09:00" => "red" }, "brainDump" => "keep me",
                 "priorities" => [{ "text" => "P", "done" => true }] }
    plans = [
      { "date" => "2030-01-01", "blocks" => [{ "start" => "7:00", "end" => "8:10", "text" => "Gym" },
                                            { "start" => "13:15", "end" => "14:00", "text" => "Calls" }],
        "priorities" => ["One", "Two"], "notes" => "fresh" },
      { "date" => "2030-01-01", "mode" => "merge", "blocks" => [{ "start" => "9:15", "end" => "9:45", "text" => "Mid" }] },
      { "date" => "2030-01-01", "blocks" => [{ "start" => "6pm", "end" => "7:30pm", "text" => "Dinner" }] }
    ]
    plans.each do |plan|
      [{}, existing].each do |day|
        expected = strip_times(python_result(day, plan))
        actual = strip_times(I.apply(day, plan, now: NOW)[1])
        assert_equal expected, actual, "plan #{plan.inspect} on #{day.empty? ? 'empty' : 'existing'} day"
      end
    end
  end
end
