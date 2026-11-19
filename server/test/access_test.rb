require_relative "test_helper"
require "rack/test"
require "openssl"
require "base64"

# The public door (timebox.joelgaff.com through a Cloudflare Tunnel): a separate,
# read-only instance that only answers requests carrying Cloudflare Access's signed
# proof of sign-in for this app.
class AccessTest < Minitest::Test
  # Stands in for Access::KeyCache (which fetches the team's keys from Cloudflare).
  KeysStub = Struct.new(:jwks) do
    def call(_kid = nil) = jwks
  end

  include Rack::Test::Methods

  TEAM = "https://joel.cloudflareaccess.com"
  AUD = "aud-tag-123"
  KEY = OpenSSL::PKey::RSA.new(2048)
  OTHER_KEY = OpenSSL::PKey::RSA.new(2048)

  def b64(data) = Base64.urlsafe_encode64(data, padding: false)

  def jwt(claims, key: KEY, kid: "k1")
    header = b64(JSON.generate(alg: "RS256", kid: kid, typ: "JWT"))
    body = b64(JSON.generate(claims))
    sig = key.sign(OpenSSL::Digest.new("SHA256"), "#{header}.#{body}")
    "#{header}.#{body}.#{b64(sig)}"
  end

  def good_claims = { "aud" => [AUD], "iss" => TEAM, "exp" => Time.now.to_i + 600, "email" => "me@example.com" }

  def jwks
    n = KEY.n.to_s(2)
    e = KEY.e.to_s(2)
    { "keys" => [{ "kid" => "k1", "kty" => "RSA", "alg" => "RS256", "n" => b64(n), "e" => b64(e) }] }
  end

  def app
    Timebox::App
  end

  def setup
    @dir = Dir.mktmpdir
    Timebox::App.set :data_dir, File.join(@dir, "data")
    Timebox::App.set :tokens_file, File.join(@dir, "tokens.json")
    Timebox::App.set :public_access, { team: TEAM, aud: AUD, emails: ["me@example.com"] }
    Timebox::App.set :access_keys, KeysStub.new(jwks)
    Timebox::App.reset!
    Timebox::App.store.write_day("2030-01-01", '{"date":"2030-01-01","brainDump":"secret notes"}', if_match: "none")
  end

  def teardown
    Timebox::App.set :public_access, nil
    FileUtils.rm_rf(@dir)
  end

  def signed_in(token = jwt(good_claims)) = header("Cf-Access-Jwt-Assertion", token)

  def test_signed_out_gets_nothing
    %w[/ /api/days/2030-01-01 /api/view /health /phone.js /fonts/x.woff2 /shared/TimeboxModel.js].each do |path|
      get path
      assert_equal 403, last_response.status, path
      refute_includes last_response.body, "secret notes"
    end
  end

  def test_signed_in_can_read
    signed_in
    get "/api/days/2030-01-01"
    assert_equal 200, last_response.status
    assert_includes last_response.body, "secret notes"
    get "/"
    assert_equal 200, last_response.status
  end

  def test_the_access_cookie_works_too
    set_cookie "CF_Authorization=#{jwt(good_claims)}"
    get "/api/days/2030-01-01"
    assert_equal 200, last_response.status
  end

  # The phone saves days through the public door: signed in through Access, with the
  # phone's header (a cross-site form or script can't send it, so no CSRF).
  def test_signed_in_phone_can_save_a_day
    signed_in
    header "X-Timebox-Client", "phone"
    header "Content-Type", "application/json"
    get "/api/days/2030-01-01"
    tag = last_response.headers["ETag"]
    header "If-Match", tag
    put "/api/days/2030-01-01", '{"date":"2030-01-01","slots":{"09:00":"From phone"}}'
    assert_equal 200, last_response.status, last_response.body
    get "/api/days/2030-01-01"
    assert_includes last_response.body, "From phone"
  end

  def test_phone_save_needs_the_phone_header_and_sign_in
    signed_in
    header "If-Match", '"none"'
    header "Content-Type", "application/json"
    put "/api/days/2030-01-03", "{}"
    assert_equal 403, last_response.status
    signed_in("nope")
    header "X-Timebox-Client", "phone"
    put "/api/days/2030-01-03", "{}"
    assert_equal 403, last_response.status
  end

  def test_no_writes_through_the_public_door
    File.write(File.join(@dir, "tokens.json"), JSON.generate("laptop" => "L" * 32, "grokbot" => "G" * 32))
    signed_in
    header "Authorization", "Bearer #{'L' * 32}"
    header "If-Match", '"none"'
    header "X-Timebox-Client", "phone"
    post "/api/plans", '{"blocks":[]}'
    assert_equal 405, last_response.status
    put "/api/view", "{}"
    assert_equal 405, last_response.status
    put "/api/fonts/x.woff2", "x"
    assert_equal 405, last_response.status
    delete "/api/days/2030-01-01"
    assert_equal 405, last_response.status
  end

  def test_rejects_forged_expired_or_foreign_tokens
    [
      jwt(good_claims, key: OTHER_KEY),                          # not signed by Cloudflare
      jwt(good_claims.merge("exp" => Time.now.to_i - 5)),        # expired
      jwt(good_claims.merge("aud" => ["another-app"])),          # another Access app
      jwt(good_claims.merge("iss" => "https://evil.cloudflareaccess.com")),
      jwt(good_claims, kid: "unknown"),
      "not.a.jwt",
      jwt(good_claims).sub(/\.[^.]+\z/, ".")                      # no signature
    ].each_with_index do |token, i|
      signed_in(token)
      get "/api/days/2030-01-01"
      assert_equal 403, last_response.status, "token #{i}"
    end
  end

  # Even a genuine Access sign-in is refused unless it's an allowed email, so a mistake in
  # the Access policy can't let anyone else in.
  def test_only_allowed_emails
    signed_in(jwt(good_claims.merge("email" => "someone@else.com")))
    get "/api/days/2030-01-01"
    assert_equal 403, last_response.status
    signed_in(jwt(good_claims.reject { |k, _| k == "email" }))
    get "/api/days/2030-01-01"
    assert_equal 403, last_response.status
    signed_in(jwt(good_claims.merge("email" => "Me@Example.com")))
    get "/api/days/2030-01-01"
    assert_equal 200, last_response.status
  end

  def test_alg_none_is_refused
    header = b64(JSON.generate(alg: "none", kid: "k1"))
    body = b64(JSON.generate(good_claims))
    signed_in("#{header}.#{body}.")
    get "/api/days/2030-01-01"
    assert_equal 403, last_response.status
  end
end
