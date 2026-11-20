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

## Sign up and connect a camera

1. Open the HTTPS dashboard and choose **Create an account**. Enter your workspace
   name, email, password, and the signup code from your administrator. Then sign
   in with the same email and password to open **Inspection**.
2. For a camera exposed as a webcam or an HDMI capture device, connect it to the
   operator PC, select it under **Camera**, and click **Start camera**. Allow
   browser access. If device names are hidden before permission is granted, start
   the default camera, stop it, then pick a device from the refreshed list.
3. For a GigE, RTSP, or USB3 Vision camera that the browser cannot list, open the
   manufacturer's viewer on the operator PC. Start acquisition and set focus
   and exposure in the viewer. In VI WebSync, choose **Share camera viewer**
   and select the corresponding window or tab. Viewer overlays can appear in
   the captured frame. You can also use **Upload image** with a saved camera JPEG.
4. Select **YOLO object count** and enter the trained class name and expected
   count, or select **Qwen vision rule** and enter a written acceptance rule.
   Use **Capture & detect** to inspect a live frame in one click. For a previously
   captured or uploaded frame, use **Detect now**.
5. Review the frozen detection frame, green boxes, part crops, and the decision.
   Use **Full screen** to expand the monitor. The live preview remains separate
   from the captured frame on which the decision is based.

Camera access requires HTTPS or localhost. Direct hardware triggering and
vendor SDK acquisition require the camera model and robot or PLC interface.
