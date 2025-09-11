Improvements Pack (Stage polish + ControlLite + Monitor Pane + Laerdal watcher)

1) Files copied by this pack:
   - src/ui/theme.css
   - src/views/StageViewer.tsx
   - src/views/Stage.tsx          (polished; imports theme locally)
   - src/views/ControlLite.tsx    (imports theme locally)
   - src/views/MonitorPane.tsx
   - server/src/laerdalWatcher.js
   - server/src/monitorRoutes.js

2) Minimal integration steps (server):
   In server/src/index.js (ESM):
     import { startLaerdalWatcher } from "./laerdalWatcher.js";
     import { registerMonitorRoutes } from "./monitorRoutes.js";

   After you create `app` and `io`:
     registerMonitorRoutes(app, io);
     // optional: start watcher
     startLaerdalWatcher(io);

   Inside io.on("connection", (socket) => { ... }):
     socket.on("control:stage:select", (payload) => {
       if (payload?.caseId) socket.to(payload.caseId).emit("control:stage:select", payload);
       else socket.broadcast.emit("control:stage:select", payload);
     });
     socket.on("control:stage:broadcast", (payload) => {
       if (payload?.caseId) socket.to(payload.caseId).emit("stage:show", payload);
       else socket.broadcast.emit("stage:show", payload);
     });

   Install deps (server):
     npm i chokidar form-data

3) Optional integration (client router):
   - Add a route to "#/control-lite":
       import ControlLite from "./views/ControlLite";
       // in router: { path: "/control-lite", element: <ControlLite /> }

   - Monitor Pane usage:
       import MonitorPane from "./views/MonitorPane";
       // Render inside Control near learners: <MonitorPane caseId={caseId} />

4) FFmpeg snapshot examples (run on OBS/HDMI machine):
   ffmpeg -list_devices true -f dshow -i dummy
   ffmpeg -f dshow -i video="USB Video" -vf fps=1 -q:v 3 -update 1 C:\monitor-feed\monitor.jpg
   ffmpeg -f dshow -i video="OBS Virtual Camera" -vf fps=1 -q:v 3 -update 1 C:\monitor-feed\monitor.jpg

   Server env to point to snapshot file:
     PowerShell: $env:MONITOR_PATH="C:\monitor-feed\monitor.jpg"

5) Safety:
   - Files are additive or replace Stage only; your LKG_Control.tsx remains untouched.
   - theme.css is imported by Stage.tsx and ControlLite.tsx directly to avoid main.tsx edits.