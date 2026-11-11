# HaruMusic public API service

This is a standalone HTTPS-hostable gateway for the same Netease-compatible API used by the desktop app. It keeps the upstream API bound to loopback and exposes only a CORS-restricted, rate-limited gateway.

## VPS with Docker Compose and Caddy

1. Point a DNS `A` record such as `music-api.example.com` at the VPS public IPv4 address.
2. Open inbound TCP ports 80 and 443 in the VPS firewall. The API container itself is not published directly.
3. Copy this folder to the VPS, copy `env.example` to `.env`, then set `API_DOMAIN` to the DNS name.
4. Run `docker compose up -d --build` in this folder.
5. Verify `https://<API_DOMAIN>/healthz` returns `{"ok":true}`.
6. Set the HaruMusic GitHub Actions variable `VITE_API` to `https://<API_DOMAIN>` before building Android.

Caddy obtains and renews HTTPS certificates automatically. The API container remains on the private Docker network behind Caddy.

## Railway setup

For a managed service, create a Railway project and deploy this repository with the service root directory `/deployment/music-api`. Set `ALLOWED_ORIGIN=https://localhost` and `TRUST_PROXY_HOPS=1`; use a plan that does not sleep between requests. After deployment, set the HaruMusic GitHub Actions variable `VITE_API` to the service's HTTPS root URL.

The service rate-limits requests to 1,200 per IP per 15-minute window by default. Adjust with `RATE_LIMIT_MAX` if normal app usage reaches the limit. The trusted proxy hop count defaults to one; change it only to match the selected host's documented proxy chain.

Do not enable request URL or request body logging at the host. The upstream API can receive account cookies; this gateway suppresses its per-request URL/body logs and restricts browser CORS to the Android Capacitor origin. CORS is not authentication, so the rate limit remains enabled for non-browser clients too.

## Local smoke run

```powershell
npm ci
$env:HOST = '127.0.0.1'
$env:ALLOWED_ORIGIN = 'https://localhost'
npm start
```

The public listener binds to `0.0.0.0:$PORT`; the upstream Netease API stays private on `127.0.0.1:$API_PORT`.
