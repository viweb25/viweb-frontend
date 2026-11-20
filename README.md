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
   name, email, and password. After account creation, **Overview** opens automatically. Select **Start a part check**.
2. For a camera exposed as a webcam or an HDMI capture device, connect it to the
   operator PC, select it under **Camera**, and click **Start camera**. Allow
   browser access. If device names are hidden before permission is granted, start
   the default camera, stop it, then pick a device from the refreshed list.
3. For a GigE, RTSP, or USB3 Vision camera that the browser cannot list, open the
   manufacturer's viewer on the operator PC. Start acquisition and set focus
   and exposure in the viewer. In VI WebSync, choose **Share camera window**
   and select the corresponding window or tab. Viewer overlays can appear in
   the captured frame. You can also use **Upload image** with a saved camera JPEG.
4. Select **Count parts** and choose the part and expected
   count, or select **Check a written rule** and enter a written acceptance rule.
   Use **Capture & check** to inspect a live frame in one click. For a previously
   captured or uploaded frame, use **Check this photo**.
5. Review the frozen detection frame, green boxes, part crops, and the decision.
   Use **Full screen** to expand the monitor. The live preview remains separate
   from the captured frame on which the decision is based.

Camera access requires HTTPS or localhost. Direct hardware triggering and
vendor SDK acquisition require the camera model and robot or PLC interface.

The **Model setup** dashboard page walks through private JTheta dataset
preparation, local YOLO training, model review, and checkpoint activation.
**Example photos** collects frame-level labels. Create object-level bounding
boxes in JTheta for detector training. The inspection screen reads supported
classes from the loaded model and lets the operator adjust the confidence threshold.


## Dashboard menu for developers

The sidebar groups operator tasks under **Daily work** and configuration under
**Workspace setup**. Existing hash URLs remain available.

| Menu | What the customer finds | Where to change it |
| --- | --- | --- |
| Overview | Start a check, see counting model readiness, follow a sample check, and review results from this browser session. | `src/App.tsx`, route `#overview` |
| Check parts | Live camera or photo upload, part and count selection, check result, and crops of detected parts. | `src/InspectionDemo.tsx` in inspection mode, route `#inspection` |
| Example photos | Save and review photos marked pass or fail as reference. | `src/InspectionDemo.tsx` in example mode, route `#training` |
| Model setup | Directions to label a dataset, train a detector, and load the checkpoint. | `src/ModelWorkflow.tsx`, route `#models` |
| Inspection types | Browse the API's inspection templates and see their availability. | `src/App.tsx` and `src/services/api/catalogue.ts`, route `#catalogue` |
| Settings | See the signed-in account, sign out, and change browser workspace preferences. | `src/App.tsx` and `src/context/WorkspacePreferences.tsx`, route `#preferences` |

Navigation and the session landing destination live in `src/App.tsx` and
`src/context/SessionContext.tsx`. The shared colors and responsive layout live
in `src/style.css`.


For a first camera test with the starter detector, choose **Count parts** and
click **Use person demo**. This sets the part to person and the expected count to
one. Put one person in view and click **Capture & check**. To show a count
mismatch with the same photo, set the expected count to two and click
**Check this photo**. The results show both the expected and found counts.
The preset appears only when the loaded model supports the person class.
