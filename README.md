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

## Using Vision Studio

1. Open the dashboard and choose **Sign up**. Enter a workspace name, email and a
   password of at least 15 characters. You land on **Projects**.
2. Select **New project**. Name it, optionally pick a template (Safety gear,
   Manufacturing, Bottling, ...) and list the classes to find. Each class gets a
   color and a number key for labeling.
3. Every project walks through five steps shown in the top bar:
   - **Upload**: drop photos (up to 200). Duplicates are skipped and blurry photos flagged.
   - **Label**: choose a class (keys 1-9), drag a box around each object, press Enter
     for the next photo, or E for "Nothing here". Changes save automatically.
     After a first model exists, **Auto-label** suggests boxes.
   - **Train**: pick Fast, Balanced (recommended) or Most accurate and press
     **Start training**. **Advanced settings** exposes dataset split, model size,
     hyperparameters, loss weights, augmentation, thresholds and checkpoints.
     The progress screen shows percent done, plain-language stages and a
     Low / OK / Good / Great quality bar. Training continues if the page is closed.
   - **Test**: upload a photo or use a live camera. Choose **Find and count** or
     **Pass / fail check** against a good training photo, and adjust confidence.
   - **Use**: download best.pt / last.pt, copy a Python snippet, or open **Inspect**.
4. **Inspect** (top menu) checks parts with any trained model from a photo or camera.
   **Workspace** lists team members and lets you switch workspaces or sign out.

Camera access requires HTTPS or localhost.

## Code map for developers

| Area | Where to change it |
| --- | --- |
| Sign in / sign up | `src/auth/AuthScreen.tsx`, session in `src/context/SessionContext.tsx` |
| Top bar, routing, account menu | `src/App.tsx`, routes in `src/ui/common.tsx` (`/`, `/inspect`, `/team`, `/projects/<org>/<project>/<step>`) |
| Projects dashboard | `src/pages/Dashboard.tsx` |
| Project state, autosave, stepper | `src/pages/ProjectStudio.tsx` |
| Steps | `src/pages/steps/{Upload,Label,Train,Test,Use}Step.tsx` |
| Model testing and camera | `src/pages/ModelTester.tsx`, `src/pages/Inspect.tsx` |
| Workspace and team | `src/pages/Team.tsx`, current workspace in `src/context/WorkspaceContext.tsx` |
| Design system (light orange, white, black text) | `src/theme.css`, icons in `src/ui/Icon.tsx` |


## Browser smoke test

Check out `viweb-frontend`, `viweb-ai`, and `viweb-db` side by side. With Node 22 and
Docker Compose available, run these from `viweb-frontend`.

```bash
npm ci
npm exec -- playwright install chromium
npm run test:e2e
```

The test builds the business API and applies the database migrations from the sibling
checkouts. It starts a temporary PostgreSQL instance, uses deterministic HTTP inference,
and verifies sign-in, operator inspection, saved review, and workspace isolation.
The test project and its volumes are removed on exit. It uses loopback ports 3100
(web) and 8100 (API), which can be changed with `VIWEB_SMOKE_WEB_PORT` and
`VIWEB_SMOKE_API_PORT`. A local Chromium executable can be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

The frontend CI browser job tests the default `main` refs of the API and database.
Use **Run workflow** with `api_ref` and `db_ref` to test coordinated changes before
they merge. For private sibling repositories, set the frontend repository's
`VIWEB_CI_READ_TOKEN` secret to a token with read-only Contents access to those two
repositories. The job runs for branches in this repository. Fork pull requests run
the regular frontend build.
