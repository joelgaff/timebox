require "digest"
require "fileutils"
require "json"

module Timebox
  # The day files on disk: one JSON file per day (YYYY-MM-DD.json, the planner's own
  # format), plus backups/ and the desktop's view profile. Every write goes through here,
  # one at a time, and is checked against the version the writer last saw (its ETag).
  class Store
    DATE = /\A\d{4}-\d{2}-\d{2}\z/
    MISSING = "none"
    BACKUP_EVERY = 10 * 60 # seconds: at most one routine backup per day file per 10 minutes

    class Stale < StandardError; end
    class Invalid < StandardError; end

    attr_reader :dir

    def initialize(dir)
      @dir = dir
      @lock = Mutex.new
      FileUtils.mkdir_p([dir, backup_dir])
    end

    def self.etag(content)
      content.nil? ? MISSING : Digest::SHA256.hexdigest(content)[0, 20]
    end

    def backup_dir = File.join(dir, "backups")

    def day_path(key)
      raise Invalid, "bad date #{key.inspect}" unless key.match?(DATE)
      File.join(dir, "#{key}.json")
    end

    # [content or nil, etag]
    def read_day(key)
      content = read_file(day_path(key))
      [content, self.class.etag(content)]
    end

    # Replace a day with `content` (the planner's JSON) if it's still at `if_match`.
    # Returns the new etag.
    def write_day(key, content, if_match:)
      data = parse_object(content)
      raise Invalid, "date in file doesn't match #{key}" if data["date"] && data["date"] != key
      @lock.synchronize do
        path = day_path(key)
        current = read_file(path)
        raise Stale, self.class.etag(current) unless if_match == self.class.etag(current)
        backup(key, current) if current && backup_due?(key)
        atomic_write(path, content)
        self.class.etag(content)
      end
    end

    # Read-modify-write a day as a Hash (for plan imports). The block gets the current day
    # ({} when none) and returns the new one. Always backs up first. Returns [day, etag].
    def update_day(key)
      @lock.synchronize do
        path = day_path(key)
        current = read_file(path)
        day = current ? parse_object(current) : {}
        backup(key, current) if current
        updated = yield day
        content = JSON.pretty_generate(updated) + "\n"
        atomic_write(path, content)
        [updated, self.class.etag(content)]
      end
    end

    # The desktop's look (theme colors, fonts, sizes) for the phone page.
    def view_path = File.join(dir, "view.json")

    def read_view
      content = read_file(view_path)
      [content, self.class.etag(content)]
    end

    def write_view(content)
      parse_object(content)
      @lock.synchronize { atomic_write(view_path, content) }
      self.class.etag(content)
    end

    def fonts_dir = File.join(dir, "fonts")

    def write_font(name, bytes)
      raise Invalid, "bad font name" unless name.match?(/\A[\w.-]+\.(ttf|otf|woff2?)\z/i)
      FileUtils.mkdir_p(fonts_dir)
      @lock.synchronize { atomic_write(File.join(fonts_dir, name), bytes) }
    end

    private

    def read_file(path)
      File.binread(path).force_encoding("UTF-8")
    rescue Errno::ENOENT
      nil
    end

    def parse_object(content)
      data = JSON.parse(content.to_s)
      raise Invalid, "must be a JSON object" unless data.is_a?(Hash)
      data
    rescue JSON::ParserError => e
      raise Invalid, "not valid JSON: #{e.message[0, 120]}"
    end

    def backup_due?(key)
      last = Dir.glob(File.join(backup_dir, "#{key}.*.json")).map { |f| File.mtime(f) }.max
      last.nil? || Time.now - last >= BACKUP_EVERY
    end

    def backup(key, content)
      stamp = Time.now.strftime("%Y%m%d-%H%M%S")
      atomic_write(File.join(backup_dir, "#{key}.#{stamp}.json"), content)
    end

    def atomic_write(path, content)
      tmp = "#{path}.#{Process.pid}.#{Thread.current.object_id}.tmp"
      File.open(tmp, "wb", 0o600) do |f|
        f.write(content)
        f.flush
        f.fsync
      end
      File.rename(tmp, path)
    end
  end
end
