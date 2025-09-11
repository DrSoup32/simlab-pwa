import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import path from "node:path";
import fs from 'fs'
import url from 'url'
import multer from 'multer'
import crypto from 'crypto'
import { startLaerdalWatcher } from "./laerdalWatcher.js";
import { registerMonitorRoutes } from "./MonitorRoutes.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const app = express()

// ---------- Middleware ----------
app.use(cors())
app.use(express.json({ limit: '2mb' }))

// ---------- Static ----------
app.use('/assets', express.static(path.resolve(__dirname, '../public/assets')))
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')))

// ---------- Uploads (multer) ----------
const uploadsDir = path.resolve(__dirname, '../uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

  const caseUploadStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const caseId = (req.params.id || 'uncased').replace(/[^a-zA-Z0-9._-]/g, '_')
    const dir = path.resolve(__dirname, `../public/assets/cases/${caseId}`)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    const uniq = crypto.randomBytes(3).toString('hex')
    // avoid collisions but keep original name visible
    cb(null, `${Date.now()}_${uniq}_${safe}`)
  }
})

const caseUpload = multer({
  storage: caseUploadStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') ||
               file.mimetype.startsWith('video/') ||
               file.mimetype === 'application/pdf'
    cb(ok ? null : new Error('Unsupported file type'), ok)
  }
})

// POST /api/case/:id/upload  (multipart/form-data; field "file")
app.post('/api/case/:id/upload', caseUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' })
  const caseId = (req.params.id || 'uncased').replace(/[^a-zA-Z0-9._-]/g, '_')
  // emit a web path (not C:\…)
  const webPath = `/assets/cases/${caseId}/${req.file.filename}`
  res.json({
    caseId,
    url: webPath,
    originalName: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size
  })
})

  const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}_${safe}`)
  }
})
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') ||
               file.mimetype.startsWith('video/') ||
               file.mimetype === 'application/pdf'
    cb(ok ? null : new Error('Unsupported file type'), ok)
  }
})

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' })
  const urlPath = `/uploads/${req.file.filename}`
  res.json({ url: urlPath, originalName: req.file.originalname, mime: req.file.mimetype, size: req.file.size })
})

// ---------- Case CRUD ----------
const contentDir = path.resolve(__dirname, '../content')
if (!fs.existsSync(contentDir)) fs.mkdirSync(contentDir, { recursive: true })

app.get('/api/cases', (_req, res) => {
  const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.json'))
  const list = files.map(f => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf-8'))
      return { id: j.id || f.replace(/\.json$/, ''), title: j.title || j.id || f }
    } catch {
      return { id: f.replace(/\.json$/, ''), title: f }
    }
  })
  res.json(list)
})

app.get('/api/case/:id', (req, res) => {
  try {
    const file = path.join(contentDir, `${req.params.id}.json`)
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'case not found' })
    const json = JSON.parse(fs.readFileSync(file, 'utf-8'))
    res.json(json)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'failed to load case' })
  }
})

app.post('/api/case', (req, res) => {
  try {
    const body = req.body
    if (!body?.id) return res.status(400).json({ error: 'id required' })
    const file = path.join(contentDir, `${body.id}.json`)
    if (fs.existsSync(file)) return res.status(409).json({ error: 'case already exists' })
    fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf-8')
    res.status(201).json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'failed to create case' })
  }
})

app.put('/api/case/:id', (req, res) => {
  try {
    const id = req.params.id
    const file = path.join(contentDir, `${id}.json`)
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' })
    const next = { ...req.body, id }
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8')
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'failed to update case' })
  }
})

app.delete('/api/case/:id', (req, res) => {
  try {
    const id = req.params.id
    const file = path.join(contentDir, `${id}.json`)
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' })
    fs.unlinkSync(file)
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'failed to delete case' })
  }
})

// ---------- Assets library (aggregate across cases) ----------
app.get('/api/assets', (req, res) => {
  try {
    const qCase = (req.query.caseId || req.query.case || '').toString().trim()
    const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.json'))
    const out = []
    for (const f of files) {
      try {
        const id = f.replace(/\.json$/, '')
        if (qCase && id !== qCase) continue
        const j = JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf-8'))
        const list = Array.isArray(j.assets) ? j.assets : []
        for (const a of list) {
          out.push({ caseId: id, id: a.id, title: a.title, type: a.type, contentUrl: a.contentUrl, content: a.content })
        }
      } catch {}
    }
    res.json(out)
  } catch (e) {
    console.error('assets list failed', e)
    res.status(500).json({ error: 'failed to list assets' })
  }
})

// ---------- Lab Panel Library (global across cases) ----------
const panelsFile = path.join(contentDir, 'panels.json')
function loadPanels() {
  try {
    if (!fs.existsSync(panelsFile)) return []
    const raw = fs.readFileSync(panelsFile, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error('failed to load panels:', e)
    return []
  }
}
function savePanels(list) {
  try {
    fs.writeFileSync(panelsFile, JSON.stringify(list, null, 2), 'utf-8')
  } catch (e) {
    console.error('failed to save panels:', e)
  }
}

// GET all panels
app.get('/api/panels', (_req, res) => {
  res.json(loadPanels())
})

// POST create panel { title, rows: [{name, value, normal}] }
app.post('/api/panels', (req, res) => {
  const { title, rows } = req.body || {}
  if (!title || !Array.isArray(rows)) return res.status(400).json({ error: 'title and rows required' })
  const list = loadPanels()
  const id = `P-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
  const panel = { id, title: String(title), rows: rows.map(r => ({ name: String(r.name||''), value: String(r.value||''), normal: String(r.normal||'') })) }
  list.push(panel)
  savePanels(list)
  res.status(201).json(panel)
})

// PUT update panel
app.put('/api/panels/:id', (req, res) => {
  const id = req.params.id
  const { title, rows } = req.body || {}
  const list = loadPanels()
  const i = list.findIndex(p => p.id === id)
  if (i < 0) return res.status(404).json({ error: 'not found' })
  list[i] = { ...list[i], title: title ?? list[i].title, rows: Array.isArray(rows) ? rows.map(r => ({ name: String(r.name||''), value: String(r.value||''), normal: String(r.normal||'') })) : list[i].rows }
  savePanels(list)
  res.json(list[i])
})

// (optional) DELETE panel
app.delete('/api/panels/:id', (req, res) => {
  const id = req.params.id
  const list = loadPanels()
  const next = list.filter(p => p.id !== id)
  if (next.length === list.length) return res.status(404).json({ error: 'not found' })
  savePanels(next)
  res.json({ ok: true })
})

// ---------- Session persistence (in-memory) ----------
const sessions = new Map()
// { caseId, queue: Asset[], history: {when,kind,title?}[], stage: {asset,at}[], minimized: {asset,at}[],
//   assess: [], pearls: [], learners: [], reflections: [], polls: [] }

function getSession(caseId) {
  if (!sessions.has(caseId)) {
    sessions.set(caseId, {
      caseId, queue: [], history: [], stage: [], minimized: [],
      assess: [], pearls: [], learners: [], reflections: [], polls: [],
      orderCount: {},   // e.g. { 'CBC': 0, 'CXR': 1 }
      lastOrderAt: {},
      startedAt: null,
      pausedAt: null,
      pausedGates: []  // array of { gateKey: string, remainingMs: number }
    })
  }
  return sessions.get(caseId)
}

// -------- Polling --------
function getPoll(s, id) {
  return (s.polls || []).find(p => p.id === id)
}

// Cancel all pending time-based gates for a given case
function cancelCaseGates(caseId) {
  const keys = Array.from(timers.keys()).filter(k => k.startsWith(`GATE:${caseId}:`))
  keys.forEach(k => {
    const val = timers.get(k)
    if (!val) return
    if (val?.t) clearTimeout(val.t); else clearTimeout(val)
    timers.delete(k)
  })
  if (keys.length) {
    console.log(`[gate] cancelled ${keys.length} pending gate(s) for ${caseId}`)
  }
}

function caseHasOrder(caseId, code) {
  const c = loadCaseFromDisk(caseId)
  if (!c || !Array.isArray(c.ordersCatalog)) return false
  const upper = String(code || '').toUpperCase()
  return c.ordersCatalog.some(o => String(o.code || '').toUpperCase() === upper)
}

app.get('/api/session/:caseId', (req, res) => {
  res.json(getSession(req.params.caseId))
})

app.put('/api/session/:caseId', (req, res) => {
  const s = getSession(req.params.caseId)
  const next = req.body || {}
  sessions.set(req.params.caseId, { ...s, ...next, caseId: req.params.caseId })
  res.json({ ok: true })
})

app.get('/api/session/:caseId/assess.csv', (req, res) => {
  const s = getSession(req.params.caseId)
  const rows = [['ts','case','type','role','by','code','kind','detail','title','text','tag','learnerId']]
  ;(s.assess || []).forEach(e => {
    rows.push([
      new Date(e.ts).toISOString(),
      req.params.caseId,
      e.type || '',
      e.role || '',
      e.by || '',
      e.code || '',
      e.kind || '',
      e.detail || '',
      e.title || '',
      e.text || '',
      e.tag || '',
      e.learnerId || ''
    ])
  })
  res.setHeader('Content-Type', 'text/csv')
  res.send(rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n'))
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// ---------- Socket.IO ----------
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

registerMonitorRoutes(app, io);
startLaerdalWatcher(io);

io.on("connection", (socket) => {
  // NEW: forward Control → Stage focus event (Jump)
  socket.on("control:stage:select", (payload) => {
    if (payload?.caseId) socket.to(payload.caseId).emit("control:stage:select", payload);
    else socket.broadcast.emit("control:stage:select", payload);
  });
  socket.on("control:stage:broadcast", (payload) => {
    if (payload?.caseId) socket.to(payload.caseId).emit("stage:show", payload);
    else socket.broadcast.emit("stage:show", payload);
  });
});

// Start the watcher (env overrides supported)
startLaerdalWatcher(io, {
  watchDir: process.env.SIM_EXPORTS || path.resolve(process.cwd(), "SimExports"),
  uploadUrl: process.env.UPLOAD_URL || "http://localhost:4000/api/upload",
  caseId: process.env.DEFAULT_CASE_ID || "case-anemia",
  autoStage: process.env.AUTO_STAGE !== "false",
});

// key -> { t: Timeout, fireAt: number }
const timers = new Map()

const rndColor = (name='X') => {
  const h = [...name].reduce((a,c)=>a+c.charCodeAt(0),0) % 360
  return `hsl(${h},70%,45%)`
}

function logAssess(caseId, entry) {
  const s = getSession(caseId)
  s.assess.push({ ...entry, ts: Date.now() })
}

// ---- Case loader (from content/CASE_ID.json) ----
function loadCaseFromDisk(caseId) {
  try {
    const file = path.join(contentDir, `${caseId}.json`)
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

// ---- Gate scheduler: schedule time-based reveals tied to an order ----
function scheduleTimeGatesForOrder(caseId, orderCode, nth = 1) {
  const c = loadCaseFromDisk(caseId)
  if (!c) return
  const matches = (c.gates || []).filter(g =>
    g?.when?.type === 'time' && ((g.orderCode || '').toUpperCase() === orderCode)
  ).sort((a,b) => (a.when.msFromStart||0) - (b.when.msFromStart||0))  // stable order

  const g = matches[nth - 1]    // pick only the N-th
  if (!g) { console.log(`[gates] no gate #${nth} for ${orderCode}`); return }

  const s = getSession(caseId)
  const caseStart = s.startedAt || Date.now()
  const msFromStart = Number(g.when.msFromStart || 0)
  const key = `GATE:${caseId}:${g.id}`
  const fireAt = caseStart + msFromStart
  const delay = Math.max(0, fireAt - Date.now())

  if (timers.has(key)) { const old = timers.get(key); if (old?.t) clearTimeout(old.t); timers.delete(key) }
  console.log(`[gate] ${caseId} • ${orderCode}#${nth} → scheduling "${g.label || orderCode}" in ${delay} ms`)

  const t = setTimeout(() => {
    g.reveals.forEach(aid => {
      const asset = (c.assets || []).find(a => a.id === aid)
      if (!asset) return
      const at = Date.now()
      s.stage.push({ asset, at })
      s.history.unshift({ when: at, kind:'show', title: asset.title })
      logAssess(caseId, { type:'drop', title: asset.title, role:'faculty', by:'GateEngine' })
      io.emit('stage:show', { asset, at: fireAt, orderAt: s.lastOrderAt[orderCode] })
    })
    timers.delete(key)
  }, delay)
  timers.set(key, { t, fireAt })
}

io.on('connection', (socket) => {
  console.log('client connected')

      // ----- CONTROL INITIAL SYNC -----
  // Control can request current learners list for a case on connect/refresh
  socket.on('control:hello', ({ caseId = 'case-anemia' } = {}) => {
    const s = getSession(caseId)
    // Send only to this control socket to avoid clobbering others
  console.log(`[presence] control:hello case=${caseId} learners=${(s.learners||[]).length}`)
    socket.emit('control:learner:list', { caseId, learners: s.learners })
  })

      // ----- LEARNER PRESENCE -----
  socket.on('learner:hello', ({ id: providedId, name, caseId = 'case-anemia' }) => {
    const newCaseId = caseId || 'case-anemia'
    const currentSession = getSession(newCaseId)

    const oldCaseId = socket.data.caseId
    const oldId = socket.data.learnerId

    const id = providedId || oldId || `L-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
    const resolvedName = name || socket.data.name || 'Learner'
    const color = rndColor(resolvedName)

    // If case changed, remove from old session's learners
    if (oldCaseId && oldCaseId !== newCaseId) {
      const oldSession = getSession(oldCaseId)
      oldSession.learners = (oldSession.learners || []).filter(l => l.id !== oldId)
      io.emit('control:learner:list', { caseId: oldCaseId, learners: oldSession.learners })
      io.emit('control:learner:left', { caseId: oldCaseId, id: oldId })
    }

    // If id changed (e.g., client Reset), remove previous id entry to avoid duplicates
    if (oldId && oldId !== id) {
      currentSession.learners = (currentSession.learners || []).filter(l => l.id !== oldId)
    }

    socket.data.caseId = newCaseId
    socket.data.learnerId = id
    socket.data.name = resolvedName

    const brief = { id, name: resolvedName, color }
    const i = currentSession.learners.findIndex(l => l.id === id)
    if (i >= 0) currentSession.learners[i] = brief; else currentSession.learners.push(brief)

  socket.emit('learner:welcome', { id, color })
  console.log(`[presence] learner:hello id=${id} name=${resolvedName} case=${newCaseId} total=${currentSession.learners.length}`)
  io.emit('control:learner:list', { caseId: newCaseId, learners: currentSession.learners })
  io.emit('control:learner:joined', { caseId: newCaseId, ...brief })
  })

      // ----- CONTROL MESSAGING -----
  socket.on('control:message', ({ text, at = Date.now(), caseId = 'case-anemia', targetId }) => {
    if (targetId) {
      for (const [,client] of io.of('/').sockets) {
        if (client.data?.learnerId === targetId) {
          client.emit('learner:message', { text, at })
          break
        }
      }
    } else {
      for (const [,client] of io.of('/').sockets) {
        if (client.data?.learnerId) client.emit('learner:message', { text, at })
      }
    }
    logAssess(caseId, { type:'message', by:'Faculty', role:'faculty', text })
  })

      // ----- CASE START -----
  socket.on('control:case:start', ({ caseId = 'case-anemia' } = {}) => {
    const s = getSession(caseId)
    s.startedAt = Date.now()
    s.history.unshift({ when: s.startedAt, kind: 'start' })
    io.emit('control:case:started', { caseId, startedAt: s.startedAt })
    console.log(`[case] ${caseId} started at ${s.startedAt}`)
  })

    // ----- CASE PAUSE -----
  socket.on('control:case:pause', ({ caseId = 'case-anemia' } = {}) => {
  const s = getSession(caseId);
  if (s.pausedAt || !s.startedAt) return;   // already paused or not started
  s.pausedAt = Date.now();

  // capture remaining time for each gate timer and cancel it
  s.pausedGates = [];
  for (const [key, val] of timers.entries()) {
    if (!key.startsWith(`GATE:${caseId}:`)) continue;
    const remaining = Math.max(0, (val.fireAt || 0) - Date.now());
    s.pausedGates.push({ gateKey: key, remainingMs: remaining });
    clearTimeout(val.t);
    timers.delete(key);
  }

  s.history.unshift({ when: s.pausedAt, kind: 'pause' });
  io.emit('control:case:paused', { caseId, pausedAt: s.pausedAt });
  console.log(`[case] ${caseId} paused (stored ${s.pausedGates.length} gate(s))`);
  });

  // Clean up learner presence on disconnect
  socket.on('disconnect', () => {
    const learnerId = socket.data?.learnerId
    const caseId = socket.data?.caseId || 'case-anemia'
    if (!learnerId) return
    const s = getSession(caseId)
    const before = s.learners.length
    s.learners = (s.learners || []).filter(l => l.id !== learnerId)
    if (s.learners.length !== before) {
      io.emit('control:learner:left', { caseId, id: learnerId })
      io.emit('control:learner:list', { caseId, learners: s.learners })
    }
  })

    // ----- CASE RESUME -----
  socket.on('control:case:resume', ({ caseId = 'case-anemia' } = {}) => {
  const s = getSession(caseId);
  if (!s.pausedAt || !s.startedAt) return;

  const resumedAt = Date.now();
    // reschedule gates based on remainingMs captured at pause
  (s.pausedGates || []).forEach(({ gateKey, remainingMs }) => {
    const fireAt = resumedAt + Math.max(0, remainingMs);
    const delay  = Math.max(0, fireAt - Date.now());
    const t = setTimeout(() => {
      // fire must look up the latest case assets
      const c = loadCaseFromDisk(caseId);
      const gateId = gateKey.split(':')[2];
      const g = (c?.gates || []).find(x => x.id === gateId);
      if (g && Array.isArray(g.reveals)) {
        g.reveals.forEach(aid => {
          const asset = (c.assets || []).find(a => a.id === aid);
          if (!asset) return;
          const at = Date.now();
          s.stage.push({ asset, at });
          s.history.unshift({ when: at, kind: 'show', title: asset.title });
          logAssess(caseId, { type:'drop', title: asset.title, role:'faculty', by:'GateEngine' });
          io.emit('stage:show', { asset, at });
        });
      }
      timers.delete(gateKey);
    }, delay);
    timers.set(gateKey, { t, fireAt });
  });

  s.pausedGates = [];
  s.history.unshift({ when: resumedAt, kind: 'resume' });
  io.emit('control:case:resumed', { caseId, resumedAt });
  console.log(`[case] ${caseId} resumed`);
  s.pausedAt = null;
  });

  // ----- STAGE SELECT -----  
  socket.on("control:stage:select", (payload) => {
    // If you already join sockets to a case room, prefer this:
    if (payload?.caseId) {
      socket.to(payload.caseId).emit("control:stage:select", payload);
    } else {
      // otherwise broadcast to all
      socket.broadcast.emit("control:stage:select", payload);
    }
  });

    // ----- CASE STOP -----
  socket.on('control:case:stop', ({ caseId = 'case-anemia' } = {}) => {
    const s = getSession(caseId);

  // cancel pending gates and clear pause state
  cancelCaseGates(caseId);
  s.pausedGates = [];
  s.pausedAt = null;

  // mark stop (don’t auto-clear Stage unless you want to)
  const stoppedAt = Date.now();
  s.history.unshift({ when: stoppedAt, kind: 'stop' });
  io.emit('control:case:stopped', { caseId, stoppedAt });
  console.log(`[case] ${caseId} stopped`);
  
  // optional: also clear stage on stop
  // s.stage = []; s.minimized = []; io.emit('stage:clear');
  // logAssess(caseId, { type:'clear', role:'faculty', by:'Faculty' })
  s.startedAt = null;
  });

  // ----- CATALOG PUSH -----
socket.on('control:orders:setCatalog', (msg) => {
  const caseId = msg?.caseId || socket.data.caseId || 'case-anemia';
  const s = getSession(caseId);
  s.catalog      = Array.isArray(msg.catalog) ? msg.catalog : [];
  s.catalogIndex = msg?.index && typeof msg.index === 'object' ? msg.index : {};
  s.policy       = msg?.policy && typeof msg.policy === 'object' ? msg.policy : {};
  s.roles        = msg?.roles  && typeof msg.roles  === 'object' ? msg.roles  : {};  // NEW

  io.emit('learner:orders:catalog', {
    caseId,
    catalog: s.catalog,
    index:   s.catalogIndex,
    policy:  s.policy,
    roles:   s.roles,    // NEW
  });
});


  // ----- LEARNER ACTIONS -----
  socket.on('learner:order', (order) => {
    const caseId    = order.caseId || socket.data.caseId || 'case-anemia'
    const by        = order?.by || socket.data.name || 'Learner'
    const learnerId = order?.learnerId || socket.data.learnerId
    const role      = order?.role || socket.data.role
    const s         = getSession(caseId)
    const color     = s.learners.find(l => l.id === learnerId)?.color
    const code      = String(order?.code || '').toUpperCase()
    const pol       = (s.policy && s.policy[code]) || 'ok'  // NEW

    console.log('[order] case=%s code=%s by=%s id=%s', caseId, code, by, learnerId)

    // If blocked → treat as request (server-side guard)
    if (pol === 'blocked') {
      logAssess(caseId, { type:'request', by, role:'learner', kind: code, detail: 'blocked', learnerId, learnerRole: role })
      io.emit('control:request', { kind: code, detail: 'blocked', by, at: Date.now(), learnerId, color, role })
      return
    }

    // If justify → also treat as request (client asks, but server enforces)
    if (pol === 'justify') {
      const detail = order?.justification || 'justify-required' // allow client to include text
      logAssess(caseId, { type:'request', by, role:'learner', kind: code, detail, learnerId, learnerRole: role })
      io.emit('control:request', { kind: code, detail, by, at: Date.now(), learnerId, color, role })
      return
    }

    // Normal flow (ok policy + in-catalog)
    if (caseHasOrder(caseId, code)) {
      logAssess(caseId, { type:'order', code, by, role:'learner', learnerId, learnerRole: role })
      io.emit('control:order', { code, by, at: Date.now(), learnerId, color, role })
      // keep your N-th scheduling if you enabled it:
      s.orderCount[code] = (s.orderCount[code] || 0) + 1
      s.lastOrderAt[code] = Date.now()
      scheduleTimeGatesForOrder(caseId, code, s.orderCount[code]) // if you added nth
    } else {
      // still off-menu: request
      logAssess(caseId, { type:'request', by, role:'learner', kind: code, detail: 'not-in-catalog', learnerId, learnerRole: role })
      io.emit('control:request', { kind: code, detail: 'not-in-catalog', by, at: Date.now(), learnerId, color, role })
    }
  })

  socket.on('learner:question', (msg) => {
      const caseId    = msg.caseId || socket.data.caseId || 'case-anemia'
      const by        = msg?.by || socket.data.name || 'Learner'
      const learnerId = msg?.learnerId || socket.data.learnerId
      const role      = msg?.role || socket.data.role
      const s = getSession(caseId)
      const color = s.learners.find(l => l.id === learnerId)?.color

    logAssess(caseId, { type:'question', by, role:'learner', text: msg.text, learnerId, learnerRole: role })
    io.emit('control:question', { ...msg, by, at: msg.at || Date.now(), learnerId, color, role })
  })

  // ----- LEARNER REFLECTION -----
  socket.on('learner:reflection', (msg) => {
    const caseId    = msg?.caseId || socket.data.caseId || 'case-anemia';
    const by        = msg?.by || socket.data.name || 'Learner';
    const learnerId = msg?.learnerId || socket.data.learnerId;
    const role      = msg?.role || socket.data.role;
    const at        = msg?.at || Date.now();

    const s = getSession(caseId);

    // persist into session
    const item = {
      by, role, learnerId, caseId, at,
      good: msg.good || '', bad: msg.bad || '', improve: msg.improve || ''
    };
    if (!Array.isArray(s.reflections)) s.reflections = [];
    s.reflections.unshift(item);

    // log into assess (single JSON blob in "text")
    logAssess(caseId, {
      type: 'reflection',
      by,
      role: 'learner',
      learnerId,
      text: JSON.stringify({ good: item.good, bad: item.bad, improve: item.improve })
    });

    // broadcast to Control
    io.emit('control:reflection', item);
  });
  

  // ----- STAGE DROPS / CLEAR -----
  socket.on('control:drop', ({ asset, at, caseId = 'case-anemia' }) => {
    const s = getSession(caseId)
    s.stage.push({ asset, at })
    s.history.unshift({ when: at, kind:'show', title: asset?.title })
    logAssess(caseId, { type:'drop', title: asset?.title, role:'faculty', by:'Faculty' })
    io.emit('stage:show', { asset, at })
    // auto-announce to learners that something new is on Stage
    try { io.emit('learner:message', { text: `New on Stage: ${asset?.title || asset?.id || 'asset'}`, at }) } catch {}
    // optional stage announce (for Stage message compartment)
    try { io.emit('stage:announce', { text: `New on Stage: ${asset?.title || asset?.id || 'asset'}`, at, caseId }) } catch {}
  })

  socket.on('control:stage:clear', ({ caseId = 'case-anemia' } = {}) => {
    cancelCaseGates(caseId)          // <-- cancel any pending gate timers for this case
    const s = getSession(caseId)
    const moved = (s.stage || []).slice()
    s.stage = []
    s.minimized = [...moved, ...(s.minimized || [])]
    s.history.unshift({ when: Date.now(), kind:'clear' })
    logAssess(caseId, { type:'clear', role:'faculty', by:'Faculty' })
    // notify viewers to clear current visible area
    io.emit('stage:clear')
    // notify Control per-item minimized for accurate UI syncing
    moved.forEach(item => io.emit('control:stage:minimized', { item, caseId }))
    })

  // Hard reset: remove all persisted stage items
  socket.on('control:stage:reset', ({ caseId = 'case-anemia' } = {}) => {
    const s = getSession(caseId)
    s.stage = []
    s.minimized = []
    s.history.unshift({ when: Date.now(), kind:'clear' })
    logAssess(caseId, { type:'stage_reset', role:'faculty', by:'Faculty' })
    io.emit('stage:reset', { caseId })
    io.emit('control:stage:reset', { caseId })
  })

  // Stage can send a message to Control (e.g., operator notes)
  socket.on('stage:message', ({ text, at = Date.now(), caseId = 'case-anemia' } = {}) => {
    const msg = { text: String(text || '').trim(), at, caseId }
    if (!msg.text) return
    // route to Control; reuse question channel semantics if desired
    io.emit('control:stage:message', { ...msg, by: 'Stage' })
  })

  // Control broadcast directly to Stage viewer (text or ad-hoc asset URL)
  socket.on('control:stage:broadcast', (payload = {}) => {
    const { caseId = 'case-anemia', text, asset } = payload
    const at = Date.now()
    if (asset && asset.id) {
      const s = getSession(caseId)
      s.stage.push({ asset, at })
      s.history.unshift({ when: at, kind:'show', title: asset?.title })
      logAssess(caseId, { type:'drop', title: asset?.title, role:'faculty', by:'Broadcast' })
      io.emit('stage:show', { asset, at })
      try { io.emit('learner:message', { text: `New on Stage: ${asset?.title || asset?.id || 'asset'}`, at }) } catch {}
      try { io.emit('stage:announce', { text: `New on Stage: ${asset?.title || asset?.id || 'asset'}`, at, caseId }) } catch {}
    } else if (text) {
      io.emit('stage:announce', { text: String(text), at, caseId })
      // optionally tell learners too
      try { io.emit('learner:message', { text: String(text), at }) } catch {}
    }
  })

  // ----- STAGE MIN/RESTORE (with broadcast to Control) -----
  socket.on('stage:minimize', ({ item, caseId = 'case-anemia' }) => {
    const s = getSession(caseId)
    s.stage = s.stage.filter(x => !(x.asset.id === item.asset.id && x.at === item.at))
    s.minimized.unshift(item)
    io.emit('control:stage:minimized', { item, caseId })
  })
  socket.on('stage:restore', ({ item, caseId = 'case-anemia' }) => {
    const s = getSession(caseId)
    s.minimized = s.minimized.filter(x => !(x.asset.id === item.asset.id && x.at === item.at))
    s.stage.push(item)
    io.emit('control:stage:restored', { item, caseId })
  })

  // ----- PEARLS -----
  socket.on('control:pearl', (p) => {
    const caseId = p.caseId || 'case-anemia'
    const s = getSession(caseId)
    let existing = p.id && s.pearls.find(x => x.id === p.id)
    if (existing) {
      existing.text = p.text
      existing.tag = p.tag
      existing.linkedAssetId = p.linkedAssetId
      existing.at = p.at || existing.at
      existing.by = p.by || existing.by
      existing.hidden = !!p.hidden
      logAssess(caseId, { type:'pearl_edit', by: existing.by || 'Faculty', role:'faculty', text: existing.text, tag: existing.tag })
      io.emit('control:pearlUpdated', existing)
    } else {
      const id = p.id || `pearl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
      const newPearl = { id, text: p.text, tag: p.tag, at: p.at || Date.now(), by: p.by || 'Faculty', caseId, linkedAssetId: p.linkedAssetId, hidden: false }
      s.pearls.unshift(newPearl)
      logAssess(caseId, { type:'pearl', by: newPearl.by, role:'faculty', text: newPearl.text, tag: newPearl.tag })
      io.emit('control:pearl', newPearl)
    }
  })

  socket.on('control:pearlHide', ({ id, caseId = 'case-anemia' }) => {
    const s = getSession(caseId)
    const found = s.pearls.find(x => x.id === id)
    if (found) {
      found.hidden = true
      logAssess(caseId, { type:'pearl_hide', by: found.by || 'Faculty', role:'faculty', text: found.text, tag: found.tag })
      io.emit('control:pearlHidden', { id })
    }
  })

  // ----- TIMERS -----
  socket.on('control:scheduleDrop', ({ key, asset, when, caseId = 'case-anemia' }) => {
  const delay = Math.max(0, when - Date.now())
  const prev = timers.get(key)
  if (prev?.t) clearTimeout(prev.t); else if (prev) clearTimeout(prev)
  const t = setTimeout(() => {
    const s = getSession(caseId)
    s.stage.push({ asset, at: when })
    s.history.unshift({ when, kind:'show', title: asset.title })
    logAssess(caseId, { type:'drop', title: asset.title, role:'faculty', by:'Faculty' })
    io.emit('stage:show', { asset, at: when })
    timers.delete(key)
  }, delay)
  timers.set(key, { t, fireAt: when }) // store same shape as gates
  })

  socket.on('control:cancelScheduled', ({ key }) => {
  const val = timers.get(key)
  if (!val) return
  if (val?.t) clearTimeout(val.t); else clearTimeout(val)
  timers.delete(key)
  })

  // ----- POLLING -----
  socket.on('control:poll:create', (p) => {
  const caseId = p.caseId || socket.data.caseId || 'case-anemia'
  const s = getSession(caseId)
  const poll = {
    id: p.id,
    question: String(p.question || '').trim(),
    options: Array.isArray(p.options) ? p.options.map(String) : [],
    multi: !!p.multi,
    anonymous: !!p.anonymous,
    counts: (Array.isArray(p.options) ? p.options : []).map(() => 0),
    votesBy: {},     // learnerId -> number[] (choiceIndexes)
    closed: false,
    closesAt: null
  }
  if (!s.polls) s.polls = []
  s.polls.unshift(poll)

  // optional auto-close
  if (p.durationSec && p.durationSec > 0) {
    const closeIn = Math.max(0, p.durationSec * 1000)
    poll.closesAt = Date.now() + closeIn
    setTimeout(() => {
      if (poll.closed) return
      poll.closed = true
      io.emit('control:poll:closed', { id: poll.id, caseId })
    }, closeIn)
  }

  // broadcast to learners
  io.emit('learner:poll', {
    id: poll.id, caseId, question: poll.question, options: poll.options,
    multi: poll.multi, anonymous: poll.anonymous, closesAt: poll.closesAt || null
    })
  })

  // HTTP endpoint to create a poll programmatically (used by test scripts)
  app.post('/api/poll', (req, res) => {
    try {
      const p = req.body || {}
      const caseId = p.caseId || 'case-anemia'
      const s = getSession(caseId)
      const poll = {
        id: p.id || `poll-${Date.now().toString(36)}`,
        question: String(p.question || '').trim(),
        options: Array.isArray(p.options) ? p.options.map(String) : [],
        multi: !!p.multi,
        anonymous: !!p.anonymous,
        counts: (Array.isArray(p.options) ? p.options : []).map(() => 0),
        votesBy: {},
        closed: false,
        closesAt: null
      }
      if (!s.polls) s.polls = []
      s.polls.unshift(poll)
      if (p.durationSec && p.durationSec > 0) {
        const closeIn = Math.max(0, p.durationSec * 1000)
        poll.closesAt = Date.now() + closeIn
        setTimeout(() => {
          if (poll.closed) return
          poll.closed = true
          io.emit('control:poll:closed', { id: poll.id, caseId })
        }, closeIn)
      }
      io.emit('learner:poll', { id: poll.id, caseId, question: poll.question, options: poll.options, multi: poll.multi, anonymous: poll.anonymous, closesAt: poll.closesAt || null })
      res.json({ ok: true, id: poll.id })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: 'failed to create poll' })
    }
  })

  // ------ POLL VOTE -----
  socket.on('learner:poll:vote', (msg) => {
    const caseId    = msg.caseId || socket.data.caseId || 'case-anemia'
    const s         = getSession(caseId)
    const poll      = getPoll(s, msg.pollId)
    const learnerId = msg.learnerId || socket.data.learnerId
    const by        = msg.by || socket.data.name || 'Learner'
    const role      = msg.role || socket.data.role

  if (!poll || poll.closed) {
    socket.emit('learner:poll:ack', { id: msg.pollId, success: false, reason: 'poll not found or closed', caseId })
    return
  }
  if (!Array.isArray(msg.choiceIndexes)) {
    socket.emit('learner:poll:ack', { id: msg.pollId, success: false, reason: 'invalid choiceIndexes', caseId })
    return
  }
  const valid = msg.choiceIndexes.filter(i => Number.isInteger(i) && i >= 0 && i < poll.options.length)
  if (valid.length === 0) return
  const uniqueChoices = Array.from(new Set(valid))
  if (!poll.multi && uniqueChoices.length > 1) uniqueChoices.splice(1)

  // remove previous votes from same learner
  if (learnerId && poll.votesBy[learnerId]) {
    poll.votesBy[learnerId].forEach(i => { poll.counts[i] = Math.max(0, poll.counts[i] - 1) })
  }

  // store new vote
  if (learnerId) poll.votesBy[learnerId] = uniqueChoices
  uniqueChoices.forEach(i => poll.counts[i] += 1)

  // log assessment (anonymize if requested)
  logAssess(caseId, {
    type: 'poll_vote',
    by: poll.anonymous ? 'Anonymous' : by,
    role: 'learner',
    learnerId: poll.anonymous ? '' : learnerId,
    text: JSON.stringify({ pollId: poll.id, choices: uniqueChoices })
  })

  // broadcast updated tallies to control
  const total = Object.keys(poll.votesBy).length
  io.emit('control:poll:update', {
    id: poll.id, caseId, question: poll.question, options: poll.options,
    counts: poll.counts, total, closed: poll.closed
    })
  io.emit('stage:poll:update', {
    id: poll.id, caseId, question: poll.question, options: poll.options,
    counts: poll.counts, total, closed: poll.closed
  })  
  // send ack to originating client so it can confirm optimistic vote
  try {
    socket.emit('learner:poll:ack', { id: poll.id, caseId, success: true, counts: poll.counts, total })
  } catch (e) {
    // non-fatal
  }
  })

  // Poll Close
  socket.on('control:poll:close', ({ id, caseId = 'case-anemia' }) => {
    const s = getSession(caseId)
    const poll = getPoll(s, id)
    if (!poll || poll.closed) return
    poll.closed = true
    io.emit('control:poll:closed', { id, caseId })
    io.emit('stage:poll:closed', { id, caseId })
  })


  // ----- DISCONNECT -----
  socket.on('disconnect', () => {
    const { learnerId, caseId } = socket.data || {}
    if (!learnerId || !caseId) return
    const s = getSession(caseId)
    const idx = s.learners.findIndex(l => l.id === learnerId)
    if (idx >= 0) s.learners.splice(idx, 1)
    io.emit('control:learner:left', { id: learnerId })
    io.emit('control:learner:list', s.learners)
  })
});

// ---------- Serve built client (prod) ----------
const clientDist = path.resolve(__dirname, '../../client/dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

// ---------- Error handler ----------
app.use((err, _req, res, _next) => {
  console.error('Server error:', err?.message)
  res.status(400).json({ error: String(err?.message || 'request failed') })
})

const PORT = process.env.PORT || 4000
server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`))
