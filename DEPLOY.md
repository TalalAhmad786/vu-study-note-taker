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

## 4. Updating

Run `scripts/deploy.sh user@your-vps` again. It syncs the code and rebuilds; the server's `.env`,
the models and the HTTPS certificates are kept.

## Useful commands (on the VPS, in ~/vu-study)

```bash
docker compose ps                 # status
docker compose logs -f web        # app logs (parser / caddy likewise)
docker compose restart web
docker compose down               # stop everything (data lives in Supabase, nothing is lost)
```
