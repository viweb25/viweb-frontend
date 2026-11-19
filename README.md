# Frontend deployment on a separate host

This stack builds the React source in `src/` with Node 22 and serves the
compiled files through Caddy. Deploy it on the frontend host after starting the
standalone backend on the AI server. Deploy frontend and backend revisions built for the same API contract.

From the repository root of this frontend repository on its host:

```bash
cp .env.example .env
chmod 600 .env
```

Edit `.env`. Set `FRONTEND_SITE` to the dashboard hostname, `BACKEND_UPSTREAM`
to the backend's HTTPS URL, and `VI_GATEWAY_KEY` to the same random value as the
backend. The gateway key is used inside Caddy and kept out of the frontend bundle.

```bash
docker compose up -d --build
docker compose logs --tail=50 frontend
```

Open the dashboard HTTPS URL. Sign in with the staging owner, check the catalogue,
allow camera access, and sign out. Browser API calls use the dashboard's origin.
Caddy sends the allowed requests over HTTPS to the AI server, so the existing
same-origin login and host-only cookie work across the two deployments.

This deployment targets a static frontend with a server-side reverse proxy. A
static-only host must support an equivalent server-side rewrite that can keep the
gateway key private. Use the backend's exact proxy policy for allowed routes.
