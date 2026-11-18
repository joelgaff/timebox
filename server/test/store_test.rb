require_relative "test_helper"

class StoreTest < Minitest::Test
  def setup
    @dir = Dir.mktmpdir
    @store = Timebox::Store.new(@dir)
  end

  def teardown = FileUtils.rm_rf(@dir)

  def test_missing_day
    assert_equal [nil, "none"], @store.read_day("2030-01-01")
  end

  def test_write_needs_current_etag
    tag = @store.write_day("2030-01-01", '{"date":"2030-01-01"}', if_match: "none")
    assert_raises(Timebox::Store::Stale) { @store.write_day("2030-01-01", "{}", if_match: "none") }
    tag2 = @store.write_day("2030-01-01", '{"slots":{}}', if_match: tag)
    assert_equal ['{"slots":{}}', tag2], @store.read_day("2030-01-01")
  end

  def test_rejects_bad_content_and_dates
    assert_raises(Timebox::Store::Invalid) { @store.write_day("2030-01-01", "[1]", if_match: "none") }
    assert_raises(Timebox::Store::Invalid) { @store.write_day("2030-01-01", "nope", if_match: "none") }
    assert_raises(Timebox::Store::Invalid) { @store.write_day("2030-01-01", '{"date":"2030-01-02"}', if_match: "none") }
    assert_raises(Timebox::Store::Invalid) { @store.read_day("../etc/passwd") }
  end

  def test_backs_up_before_overwriting_at_most_every_ten_minutes
    t = @store.write_day("2030-01-01", '{"a":1}', if_match: "none")
    t = @store.write_day("2030-01-01", '{"a":2}', if_match: t)
    @store.write_day("2030-01-01", '{"a":3}', if_match: t)
    backups = Dir.glob(File.join(@dir, "backups", "2030-01-01.*.json"))
    assert_equal 1, backups.length
    assert_equal '{"a":1}', File.read(backups.first)
  end

  def test_update_day_always_backs_up
    @store.write_day("2030-01-01", '{"a":1}', if_match: "none")
    day, = @store.update_day("2030-01-01") { |d| d.merge("b" => 2) }
    assert_equal({ "a" => 1, "b" => 2 }, day)
    assert_equal 1, Dir.glob(File.join(@dir, "backups", "*")).length
  end
end
