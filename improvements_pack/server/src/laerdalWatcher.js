import path from "node:path";
import fs from "node:fs";
import chokidar from "chokidar";
import FormData from "form-data";

const env = (name, def) => (process.env[name] ?? def);
const DEFAULT_DIR = path.resolve(process.cwd(), "simexports");

function parseList(val, def = "") {
  const raw = env(val, def);
  return String(raw).split(/[;,]/).map(s => s.trim()).filter(Boolean);
}

const ALLOWED_EXTS = new Set(parseList("SIM_EXPORTS_EXTS", ".png,.jpg,.jpeg,.gif,.pdf,.mp4,.mov,.avi,.webm").map(s => s.toLowerCase()));
const TEMP_PATTERNS = [/\.tmp$/i, /\.crdownload$/i, /\.partial$/i, /^~\$/i];

async function postFile(localUrl, filePath) {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
  const res = await fetch(localUrl, { method: "POST", body: form, headers: form.getHeaders ? form.getHeaders() : undefined });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  return res.json();
}

function classify(mime) {
  if (!mime) return "note";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  return "note";
}

function parseTokens(base) {
  const out = { caseId: undefined, title: undefined, autoStage: undefined };
  const tokenRe = /^\[(.+?)\]/g;
  let m;
  let rest = base;
  while ((m = tokenRe.exec(base))) {
    const raw = m[1];
    const [k, v] = raw.split("=");
    const key = (k || "").toLowerCase();
    const val = (v || "").trim();
    if (key === "case") out.caseId = val;
    else if (key === "title") out.title = val;
    else if (key === "stage") out.autoStage = true;
    else if (key === "queue") out.autoStage = false;
  }
  rest = base.replace(/^(\[[^\]]+\])+/g, "").trim();
  return { ...out, rest };
}

function shouldIgnoreFile(file) {
  const base = path.basename(file);
  if (base.startsWith(".")) return true;
  for (const re of TEMP_PATTERNS) if (re.test(base)) return true;
  const ext = path.extname(base).toLowerCase();
  if (ALLOWED_EXTS.size && !ALLOWED_EXTS.has(ext)) return true;
  return false;
}

export function startLaerdalWatcher(io, opts = {}) {
  const watchList = parseList("SIM_EXPORTS", "").map(p => path.resolve(p));
  const optDir = opts.watchDir ? [].concat(opts.watchDir) : [];
  const watchDirs = [...watchList, ...optDir].filter(Boolean);
  if (watchDirs.length === 0) watchDirs.push(DEFAULT_DIR);

  const uploadUrl = opts.uploadUrl || env("UPLOAD_URL", "http://localhost:4000/api/upload");
  const defaultCaseId = opts.caseId || env("DEFAULT_CASE_ID", "case-anemia");
  const autoStageDefault = (opts.autoStage ?? (env("AUTO_STAGE", "true") !== "false"));
  const archiveRoot = env("SIM_EXPORTS_ARCHIVE", "");

  const stabilityMs = Number(env("SIM_EXPORTS_STABILITY_MS", "1200"));
  const usePolling = env("SIM_EXPORTS_POLLING", "false") === "true";
  const pollInterval = Number(env("SIM_EXPORTS_POLL_INTERVAL", "500"));

  console.log(`[LaerdalWatcher] Watching ${watchDirs.length} path(s):`);
  for (const d of watchDirs) console.log(`  • ${d}`);
  console.log(`[LaerdalWatcher] Upload → ${uploadUrl}`);
  console.log(`[LaerdalWatcher] Default case: ${defaultCaseId} | autoStage=${autoStageDefault}`);
  if (archiveRoot) console.log(`[LaerdalWatcher] Archive to: ${archiveRoot}`);

  const seen = new Set();
  function markSeen(file) {
    try { const s = fs.statSync(file); seen.add(`${file}:${s.size}:${s.mtimeMs}`); } catch {}
  }
  function alreadySeen(file) {
    try { const s = fs.statSync(file); return seen.has(`${file}:${s.size}:${s.mtimeMs}`); } catch { return False; }
  }
  function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

  async function handleFile(file) {
    try {
      if (alreadySeen(file)) return;
      if (shouldIgnoreFile(file)) return;

      const base = path.basename(file);
      const { caseId, title, autoStage, rest } = parseTokens(base);

      const info = await postFile(uploadUrl, file);
      const type = classify(info.mime);
      const asset = {
        id: `laerdal-${Date.now()}-${base}`,
        title: title || rest || info.originalName || base,
        type,
        contentUrl: info.url,
      };

      const stagePayload = { asset, at: Date.now() };
      const targetCase = caseId || defaultCaseId;
      const shouldStage = (typeof autoStage === "boolean") ? autoStage : autoStageDefault;

      if (shouldStage) {
        if (targetCase) io.to(targetCase).emit("stage:show", stagePayload);
        else io.emit("stage:show", stagePayload);
        console.log(`[LaerdalWatcher] STAGE  • ${asset.title} (${type})`);
      } else {
        console.log(`[LaerdalWatcher] QUEUE  • ${asset.title} (${type})`);
      }

      markSeen(file);
    } catch (e) {
      console.error(`[LaerdalWatcher] Failed to ingest ${file}`, e);
    }
  }

  for (const dir of watchDirs) {
    ensureDir(dir);
    const watcher = chokidar.watch(dir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: stabilityMs, pollInterval },
      usePolling,
      depth: 10,
      ignored: (p) => path.basename(p).startsWith("."),
    });

    watcher.on("add", handleFile);
    console.log(`[LaerdalWatcher] Ready: ${dir}`);
  }
}