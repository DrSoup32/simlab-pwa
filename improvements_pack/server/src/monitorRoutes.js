import path from "node:path";
import fs from "node:fs";
import FormData from "form-data";

const env = (k, d) => (process.env[k] ?? d);
const DEFAULT_SNAPSHOT = path.resolve(process.cwd(), "monitor-feed", "monitor.jpg");
const DEFAULT_UPLOAD_BASE = env("MONITOR_UPLOAD_BASE", "http://localhost:4000");

function classify(mime) {
  if (!mime) return "note";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  return "note";
}

export function registerMonitorRoutes(app, io, opts = {}) {
  const SNAP = env("MONITOR_PATH", opts.snapshotPath || DEFAULT_SNAPSHOT);
  const BASE = env("MONITOR_UPLOAD_BASE", opts.uploadBase || DEFAULT_UPLOAD_BASE);

  app.get("/monitor.jpg", (req, res) => {
    res.set("Cache-Control", "no-store, must-revalidate");
    fs.access(SNAP, fs.constants.R_OK, (err) => {
      if (err) return res.status(404).end();
      res.sendFile(SNAP);
    });
  });

  app.post("/api/monitor/send", async (req, res) => {
    try {
      const caseId = req.query.caseId || req.body?.caseId || env("DEFAULT_CASE_ID", "case-anemia");
      await fs.promises.access(SNAP, fs.constants.R_OK);

      const form = new FormData();
      form.append("file", fs.createReadStream(SNAP));
      const r = await fetch(`${BASE}/api/upload`, {
        method: "POST",
        body: form,
        headers: form.getHeaders ? form.getHeaders() : undefined,
      });
      if (!r.ok) throw new Error(`upload failed: ${r.status} ${r.statusText}`);
      const info = await r.json();

      const type = info.mime?.startsWith("image/")
        ? "image"
        : info.mime === "application/pdf"
        ? "pdf"
        : info.mime?.startsWith("video/")
        ? "video"
        : "note";

      const asset = {
        id: `monitor-${Date.now()}`,
        title: `Monitor ${new Date().toLocaleTimeString()}`,
        type,
        contentUrl: info.url,
      };

      const payload = { asset, at: Date.now() };
      if (caseId) io.to(caseId).emit("stage:show", payload);
      else io.emit("stage:show", payload);

      res.json({ ok: true, asset });
    } catch (e) {
      console.error("[/api/monitor/send] error", e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  console.log(`[MonitorRoutes] /monitor.jpg serving from: ${SNAP}`);
  console.log(`[MonitorRoutes] /api/monitor/send → uploads via: ${BASE}/api/upload`);
}