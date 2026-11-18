require_relative "test_helper"
require "rack/test"

class AppTest < Minitest::Test
  include Rack::Test::Methods

  def app = Timebox::App

  def setup
    @dir = Dir.mktmpdir
    File.write(File.join(@dir, "tokens.json"), JSON.generate("laptop" => "L" * 32, "grokbot" => "G" * 32))
    Timebox::App.set :data_dir, File.join(@dir, "data")
    Timebox::App.set :tokens_file, File.join(@dir, "tokens.json")
    Timebox::App.reset!
  end

  def teardown = FileUtils.rm_rf(@dir)

  def auth(name) = header("Authorization", "Bearer #{name * 32}")

  def test_health
    get "/health"
    assert last_response.ok?
  end

  def test_missing_day_reads_as_empty
    get "/api/days/2030-01-01"
    assert_equal "{}", last_response.body
    assert_equal '"none"', last_response.headers["ETag"]
    assert_equal "false", last_response.headers["X-Timebox-Exists"]
  end

  def test_save_and_reload_with_etags
    auth "L"
    header "If-Match", '"none"'
    put "/api/days/2030-01-01", '{"date":"2030-01-01","slots":{"09:00":"A"}}'
    assert_equal 200, last_response.status
    tag = last_response.headers["ETag"]

    header "If-None-Match", tag
    get "/api/days/2030-01-01"
    assert_equal 304, last_response.status

    header "If-Match", '"none"'
    put "/api/days/2030-01-01", "{}"
    assert_equal 412, last_response.status
    assert_equal tag, last_response.headers["ETag"]
  end

  def test_saving_needs_the_laptop_key_and_if_match
    put "/api/days/2030-01-01", "{}"
    assert_equal 401, last_response.status
    auth "G"
    header "If-Match", '"none"'
    put "/api/days/2030-01-01", "{}"
    assert_equal 401, last_response.status
    auth "L"
    header "If-Match", nil
    put "/api/days/2030-01-01", "{}"
    assert_equal 428, last_response.status
  end

  def test_grokbot_plan
    auth "G"
    post "/api/plans", JSON.generate("date" => "2030-01-01", "blocks" => [{ "start" => "9:00", "end" => "10:00", "text" => "Deep work" }])
    assert_equal 200, last_response.status, last_response.body
    assert_includes JSON.parse(last_response.body)["summary"], "09:00  Deep work"
    get "/api/days/2030-01-01"
    assert_equal "Deep work", JSON.parse(last_response.body)["slots"]["09:30"]
  end

  # Real servers (WEBrick under Rack 3) hand over a body that can't be rewound, and
  # curl -d sends it form-encoded, so Sinatra reads it first.
  class OneShotInput
    def initialize(text) = @io = StringIO.new(text)
    def read(*args) = @io.read(*args)
    def gets = @io.gets
    def each(&) = @io.each(&)
    def close = nil
  end

  def test_plan_from_curl_on_a_real_server
    env = Rack::MockRequest.env_for("/api/plans", method: "POST",
      "CONTENT_TYPE" => "application/x-www-form-urlencoded", "HTTP_AUTHORIZATION" => "Bearer #{'G' * 32}")
    env["rack.input"] = OneShotInput.new(JSON.generate("date" => "2030-01-01",
      "blocks" => [{ "start" => "9:00", "end" => "10:00", "text" => "Deep work" }]))
    status, _, body = Timebox::App.call(env)
    text = +""; body.each { |chunk| text << chunk }
    assert_equal 200, status, text
  end

  def test_bad_plan
    auth "G"
    post "/api/plans", '{"date":"2030-01-01","blocks":[{"start":"lunch","text":"x"}]}'
    assert_equal 400, last_response.status
    assert_match(/can't read time/, JSON.parse(last_response.body)["error"])
  end

  def test_view_profile
    auth "G"
    put "/api/view", '{"colors":{}}'
    assert_equal 401, last_response.status
    auth "L"
    put "/api/view", '{"colors":{"accent":"#fff"}}'
    get "/api/view"
    assert_equal "#fff", JSON.parse(last_response.body)["colors"]["accent"]
  end

  def test_fonts
    auth "L"
    put "/api/fonts/Caveat.ttf", "FONTDATA"
    get "/fonts/Caveat.ttf"
    assert_equal "FONTDATA", last_response.body
    put "/api/fonts/..evil", "x" # not a font name
    assert_equal 400, last_response.status
  end

  def test_phone_page
    get "/"
    assert last_response.ok?
  end
end
