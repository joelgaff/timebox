require "json"
require "sinatra/base"
require_relative "store"
require_relative "import"

module Timebox
  # The Timebox server: the Beelink's copy of every day is the only copy. The desktop
  # planner reads and saves days here, the phone page reads them, Grok Bot sends plans.
  #
  # Reading is open to anyone who can reach it (it listens on localhost; Tailscale serve
  # makes it tailnet-only). Writing needs a key from the tokens file:
  #   {"laptop": "<key>", "grokbot": "<key>"}
  # "laptop" may save days, the view profile and fonts, and send plans; "grokbot" may
  # only send plans.
  class App < Sinatra::Base
    SCOPES = { "laptop" => %i[days view plans], "grokbot" => %i[plans] }.freeze

    # Rack 3 servers may hand over a body that can't be re-read; make it re-readable
    # so the raw JSON is still there after Sinatra looks at it as a form.
    use Rack::RewindableInput::Middleware

    # Every /api/ body is JSON or a file, never a form. curl -d / --data-binary label
    # bodies as forms by default; don't let Rack try to parse them as one.
    class RawBodies
      def initialize(app) = @app = app

      def call(env)
        if env["PATH_INFO"].start_with?("/api/") &&
           env["CONTENT_TYPE"].to_s.start_with?("application/x-www-form-urlencoded", "multipart/form-data")
          env["CONTENT_TYPE"] = "application/octet-stream"
        end
        @app.call(env)
      end
    end
    use RawBodies
    set :dump_errors, true

    set :server, "webrick"
    set :bind, ENV.fetch("TIMEBOX_BIND", "127.0.0.1")
    set :port, Integer(ENV.fetch("TIMEBOX_PORT", "4590"))
    set :public_folder, File.expand_path("../../public", __dir__)
    set :static_cache_control, [:no_cache]
    set :show_exceptions, false
    set :raise_errors, false
    set :host_authorization, { permitted_hosts: [] } # Tailscale decides who gets here
    set :data_dir, ENV.fetch("TIMEBOX_DATA", File.expand_path("~/.local/share/timebox-server"))
    # The planner's own JS (rows, runs, colors, look values), shared with the phone page:
    # shared/ in a deployed copy, the repo root in a checkout.
    set :shared_dir, ENV.fetch("TIMEBOX_SHARED") {
      deployed = File.expand_path("../../shared", __dir__)
      File.directory?(deployed) ? deployed : File.expand_path("../../..", __dir__)
    }
    SHARED = %w[TimeboxModel.js TimeboxLook.js].freeze
    set :tokens_file, ENV.fetch("TIMEBOX_TOKENS", File.expand_path("~/.config/timebox-server/tokens.json"))

    def self.store
      @store ||= Store.new(settings.data_dir)
    end

    def self.reset!
      @store = nil
    end

    helpers do
      def store = self.class.store

      def json_body(obj, code = 200)
        status code
        content_type :json
        JSON.generate(obj)
      end

      def fail_with(code, message)
        halt json_body({ error: message }, code)
      end

      def tokens
        JSON.parse(File.read(settings.tokens_file))
      rescue Errno::ENOENT, JSON::ParserError
        {}
      end

      # Halts unless the request carries a key allowed to do `scope`.
      def require_key(scope)
        given = request.env["HTTP_AUTHORIZATION"].to_s[/\ABearer (.+)\z/, 1].to_s
        ok = !given.empty? && tokens.any? do |name, key|
          SCOPES.fetch(name, []).include?(scope) && key.is_a?(String) && !key.empty? &&
            Rack::Utils.secure_compare(key, given)
        end
        fail_with(401, "needs a key allowed to change #{scope}") unless ok
      end

      # The raw request body, even when Sinatra already parsed it as a form
      # (curl -d sends form encoding by default).
      def raw_body
        request.body.rewind
        request.body.read
      end

      def quoted(tag) = %("#{tag}")

      def unquote(value) = value.to_s.strip.delete_prefix("W/").delete('"')

      # 304 when the client already has this version.
      def not_modified?(tag)
        given = request.env["HTTP_IF_NONE_MATCH"]
        given && given.split(",").map { |v| unquote(v) }.include?(tag)
      end
    end

    error Store::Invalid, Import::Error do
      json_body({ error: env["sinatra.error"].message }, 400)
    end

    get "/health" do
      json_body({ ok: true })
    end

    get "/" do
      send_file File.join(settings.public_folder, "index.html")
    end

    # A day as the planner stores it. Missing days come back as {} with
    # X-Timebox-Exists: false and the ETag "none".
    get %r{/api/days/(\d{4}-\d{2}-\d{2})} do |key|
      content, tag = store.read_day(key)
      headers "ETag" => quoted(tag), "Cache-Control" => "no-cache",
              "X-Timebox-Exists" => content ? "true" : "false"
      halt 304 if not_modified?(tag)
      content_type :json
      content || "{}"
    end

    # Save a day. If-Match must be the ETag you loaded (or "none" for a new day);
    # otherwise 412 with the current ETag, so you can reload first.
    put %r{/api/days/(\d{4}-\d{2}-\d{2})} do |key|
      require_key(:days)
      if_match = request.env["HTTP_IF_MATCH"]
      fail_with(428, "send If-Match with the ETag you loaded") unless if_match
      begin
        tag = store.write_day(key, raw_body, if_match: unquote(if_match))
      rescue Store::Stale => e
        headers "ETag" => quoted(e.message)
        fail_with(412, "the day changed since you loaded it")
      end
      headers "ETag" => quoted(tag)
      json_body({ ok: true, etag: tag })
    end

    # A plan from Grok Bot (or anyone with a key): same format as timebox-import.
    post "/api/plans" do
      require_key(:plans)
      begin
        plan = JSON.parse(raw_body)
      rescue JSON::ParserError => e
        fail_with(400, "plan isn't valid JSON: #{e.message[0, 120]}")
      end
      fail_with(400, "plan must be a JSON object") unless plan.is_a?(Hash)
      key = Import.valid_date((plan["date"] || Time.now.strftime("%Y-%m-%d")).to_s)
      day, tag = store.update_day(key) { |current| Import.apply(current, plan.merge("date" => key))[1] }
      headers "ETag" => quoted(tag)
      json_body({ ok: true, date: key, etag: tag, summary: Import.summary(key, day) })
    end

    # The desktop's look, for the phone page.
    # QML ".pragma library" files, minus the pragma, for the browser.
    get %r{/shared/([\w.]+)} do |name|
      fail_with(404, "not shared") unless SHARED.include?(name)
      path = File.join(settings.shared_dir, name)
      fail_with(404, "missing") unless File.file?(path)
      content_type "text/javascript"
      cache_control :no_cache
      File.read(path).sub(/^\.pragma library\s*$/, "")
    end

    get "/api/view" do
      content, tag = store.read_view
      headers "ETag" => quoted(tag), "Cache-Control" => "no-cache"
      halt 304 if not_modified?(tag)
      content_type :json
      content || "{}"
    end

    put "/api/view" do
      require_key(:view)
      tag = store.write_view(raw_body)
      headers "ETag" => quoted(tag)
      json_body({ ok: true, etag: tag })
    end

    put %r{/api/fonts/([\w.-]+)} do |name|
      require_key(:view)
      store.write_font(name, raw_body)
      json_body({ ok: true })
    end

    get %r{/fonts/([\w.-]+)} do |name|
      path = File.join(store.fonts_dir, name)
      fail_with(404, "no such font") unless File.file?(path)
      cache_control :public, max_age: 86_400
      send_file path
    end
  end
end
