# Deploying VU Study to a VPS

Three containers: `web` (Next.js), `parser` (Docling) and `caddy` (HTTPS). Only Caddy is
reachable from the internet; the app and Docling talk to each other on the private compose network.

## 1. Once, on the VPS (Ubuntu/Debian)

```bash
# Docker Engine + Compose plugin (official convenience script; or follow docs.docker.com/engine/install)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER        # log out and back in afterwards

# Firewall: SSH + web only
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable
```

DNS: create an **A record** for your domain (e.g. `study.example.com`) pointing at the VPS IP.
Caddy can only get the HTTPS certificate once this resolves.

## 2. Supabase settings

Authentication → URL Configuration:
- **Site URL**: `https://study.example.com`
- **Redirect URLs**: add `https://study.example.com/auth/callback` (keep the localhost one for development)

Authentication → Sign In / Providers: turn off **Allow new users to sign up** once your own account
exists. The app's `ALLOWED_EMAILS` check is the main guard; this is a second lock.

## 3. First deploy (from your laptop)

```bash
scripts/deploy.sh user@your-vps          # copies the code; stops and asks for .env the first time
ssh user@your-vps
cd ~/vu-study && cp .env.production.example .env && chmod 600 .env && nano .env   # fill in every value
exit
scripts/deploy.sh user@your-vps          # builds and starts all three containers
```

The first build takes several minutes (the parser image installs PyTorch and Docling). The first
Docling upload then downloads its models (~1 GB) into the `models` volume; later starts reuse them.

## 3b. If the server already has a reverse proxy on 80/443

Another project's Caddy (or similar) may already own ports 80/443. Then don't start the bundled
Caddy; join the existing proxy's network instead.

1. Find that proxy's network: `docker network ls` (e.g. `otherproject_default`).
2. Add to `.env`:
   ```
   COMPOSE_FILE=docker-compose.yml:docker-compose.proxy.yml
   PROXY_NETWORK=otherproject_default
   ```
3. Append `Caddyfile.site` to the existing Caddy's Caddyfile and reload it (see below).
4. `docker compose up -d --build` — only `web` and `parser` start; the app is reachable on that
   network as `vu-study-web:3000`, and Docling stays private.

Caveat: if the other project is taken down with `docker compose down`, its network is deleted and
this app loses its route; run `docker compose up -d` here again after it is back.

## 4. Updating

If the code is already on the server (e.g. `git pull`), run `scripts/deploy.sh` there with no arguments.

Run `scripts/deploy.sh user@your-vps` again. It syncs the code and rebuilds; the server's `.env`,
the models and the HTTPS certificates are kept.

## Useful commands (on the VPS, in ~/vu-study)

```bash
docker compose ps                 # status
docker compose logs -f web        # app logs (parser / caddy likewise)
docker compose restart web
docker compose down               # stop everything (data lives in Supabase, nothing is lost)
```
