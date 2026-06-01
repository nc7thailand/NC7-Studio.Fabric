# NC7 Studio.Fabric — Ops (Mac Mini)

Quick reference after AG Mini infra sync (2026-06-01).

## Dev URLs (Tailscale)

| App | URL |
|-----|-----|
| **Fabric** | http://100.64.95.27:3010 |
| **Legacy Studio** | http://100.64.95.27:3009 |

Always include the port. Bare `100.64.95.27` → connection refused.

## Start dev servers (after reboot)

```bash
cd ~/Documents/GitHub/NC7-Studio.Fabric && npm run dev
cd ~/Documents/GitHub/AG-NC7-FoamArt-Studio && npm run dev -- --hostname 0.0.0.0 --port 3009
```

If `npm` not found in a bare shell, use the Mini Node path (Antigravity env) or open a terminal from Cursor/AGM session.

## Git

```bash
cd ~/Documents/GitHub/NC7-Studio.Fabric
git pull origin main
git push origin main   # after local commits; SSH auth on Mini
```

Remote: `git@github.com:nc7thailand/NC7-Studio.Fabric.git`

## Nginx split-view (optional)

Port **8088** — AG Mini routes to Studio on 3009 (see infrastructure on legacy repo).
