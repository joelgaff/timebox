require "base64"
require "json"
require "net/http"
require "openssl"

module Timebox
  # Cloudflare Access sign-in proof. The public door (timebox.joelgaff.com through a
  # Cloudflare Tunnel) only answers requests whose Cf-Access-Jwt-Assertion header (or
  # CF_Authorization cookie) is a JWT that Cloudflare signed for this Access app: RS256,
  # signed with one of the team's published keys, the right issuer and audience, and not
  # expired. Anything else gets a bare 403, so even with Access switched off by mistake
  # nothing behind the door is served.
  module Access
    module_function

    def b64decode(part)
      Base64.urlsafe_decode64(part + "=" * (-part.length % 4))
    end

    # RSA public key from a JWK's n and e.
    def rsa_key(jwk)
      n = OpenSSL::BN.new(b64decode(jwk["n"]), 2)
      e = OpenSSL::BN.new(b64decode(jwk["e"]), 2)
      rsa = OpenSSL::ASN1::Sequence([OpenSSL::ASN1::Integer(n), OpenSSL::ASN1::Integer(e)])
      spki = OpenSSL::ASN1::Sequence([
        OpenSSL::ASN1::Sequence([OpenSSL::ASN1::ObjectId("rsaEncryption"), OpenSSL::ASN1::Null(nil)]),
        OpenSSL::ASN1::BitString(rsa.to_der)
      ])
      OpenSSL::PKey::RSA.new(spki.to_der)
    end

    # Claims of a valid token, or nil. `jwks` is the team's {"keys": [...]}.
    def verify(token, team:, aud:, jwks:, now: Time.now.to_i)
      parts = token.to_s.split(".")
      return nil unless parts.length == 3 && parts.none?(&:empty?)
      header = JSON.parse(b64decode(parts[0]))
      claims = JSON.parse(b64decode(parts[1]))
      return nil unless header.is_a?(Hash) && claims.is_a?(Hash) && header["alg"] == "RS256"
      jwk = Array(jwks && jwks["keys"]).find { |k| k.is_a?(Hash) && k["kid"] == header["kid"] && k["kty"] == "RSA" }
      return nil unless jwk
      signed = rsa_key(jwk).verify(OpenSSL::Digest.new("SHA256"), b64decode(parts[2]), "#{parts[0]}.#{parts[1]}")
      return nil unless signed
      return nil unless claims["iss"] == team
      return nil unless Array(claims["aud"]).include?(aud)
      return nil unless claims["exp"].is_a?(Integer) && claims["exp"] > now
      return nil if claims["nbf"].is_a?(Integer) && claims["nbf"] > now + 60
      claims
    rescue ArgumentError, JSON::ParserError, OpenSSL::PKey::PKeyError, OpenSSL::ASN1::ASN1Error, TypeError
      nil
    end

    # The team's signing keys, cached for an hour, refetched (at most once a minute) when a
    # token names a key we haven't seen (Cloudflare rotates them).
    class KeyCache
      def initialize(team)
        @url = URI("#{team}/cdn-cgi/access/certs")
        @lock = Mutex.new
        @keys = nil
        @fetched = Time.at(0)
      end

      def call(kid = nil)
        @lock.synchronize do
          stale = Time.now - @fetched > 3600
          missing = kid && @keys && Array(@keys["keys"]).none? { |k| k["kid"] == kid } && Time.now - @fetched > 60
          fetch if @keys.nil? || stale || missing
          @keys
        end
      end

      private

      def fetch
        res = Net::HTTP.get_response(@url)
        @keys = JSON.parse(res.body) if res.is_a?(Net::HTTPSuccess)
        @fetched = Time.now
      rescue StandardError
        @fetched = Time.now
      end
    end

    # Rack middleware in front of everything (static files included) on the public door.
    class Gate
      def initialize(app, settings)
        @app = app
        @settings = settings
      end

      def call(env)
        access = @settings.public_access
        return @app.call(env) unless access
        return deny(405, "read-only") unless %w[GET HEAD].include?(env["REQUEST_METHOD"])
        token = env["HTTP_CF_ACCESS_JWT_ASSERTION"] || Rack::Request.new(env).cookies["CF_Authorization"]
        kid = begin
          JSON.parse(Access.b64decode(token.to_s.split(".").first.to_s))["kid"]
        rescue StandardError
          nil
        end
        keys = @settings.access_keys&.call(kid)
        claims = Access.verify(token, team: access[:team], aud: access[:aud], jwks: keys)
        return deny(403, "sign in through Cloudflare Access") unless claims
        @app.call(env)
      end

      private

      def deny(code, message)
        [code, { "content-type" => "text/plain", "cache-control" => "no-store" }, [message + "\n"]]
      end
    end
  end
end
