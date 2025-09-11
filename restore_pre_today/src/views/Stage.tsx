// client/src/views/Stage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { socket, Asset } from '../socket'

// ---------- Common hematology/chemistry normals (fallbacks) ----------
const NORMALS: Record<string, {range:string}> = {
  WBC: { range:'4.0–11.0 x10^3/µL' },
  Hgb: { range:'13.5–17.5 g/dL' },    // adult male; customize per case if needed
  Hct: { range:'41–53 %' },
  Plt: { range:'150–450 x10^3/µL' },
  MCV: { range:'80–100 fL' },
  RDW: { range:'11.5–14.5 %' },
  Na:  { range:'135–145 mmol/L' },
  K:   { range:'3.5–5.0 mmol/L' },
  Cl:  { range:'98–107 mmol/L' },
  'CO₂':{range:'22–29 mmol/L'},
  BUN: { range:'7–20 mg/dL' },
  Cr:  { range:'0.6–1.3 mg/dL' },
  Glucose:{range:'70–99 mg/dL'},
  Ca:  { range:'8.6–10.2 mg/dL' },
  AST: { range:'10–40 U/L' },
  ALT: { range:'7–56 U/L' },
  Tbili:{range:'0.1–1.2 mg/dL' },
  Albumin:{range:'3.5–5.0 g/dL' },
  PT:  { range:'11–13.5 sec' },
  'INR':{range:'0.8–1.2' },
  aPTT:{ range:'25–35 sec' },
  pH:  { range:'7.35–7.45' },
  pCO2:{ range:'35–45 mmHg' },
  pO2: { range:'80–100 mmHg' },
  'HCO₃⁻':{range:'22–26 mmol/L'},
  SaO2: { range:'95–100 %' },
}

// ---------- Parse helpers for lab content ----------
type LabRow = { test: string; value: string; range?: string }

function parseLabRowsFromText(text?: string): LabRow[] {
  if (!text) return []
  const lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean)
  const out: LabRow[] = []
  for (const line of lines) {
    // TSV: "Test<TAB>Value<TAB>(Normal)"
    if (line.includes('\t')) {
      const [t, v, n] = line.split('\t')
      out.push({ test:(t||'').trim(), value:(v||'').trim(), range:(n||'').replace(/^\(|\)$/g,'').trim() })
      continue
    }
    // "Test: Value (Normal)"
    let m = line.match(/^(.+?):\s*(.+?)(?:\s*\((.+?)\))?$/)
    if (m) { out.push({ test:m[1].trim(), value:m[2].trim(), range:m[3]?.trim() }); continue }
    // "Test  Value (Normal)" (two+ spaces)
    m = line.match(/^(.+?)\s{2,}(.+?)(?:\s*\((.+?)\))?$/)
    if (m) { out.push({ test:m[1].trim(), value:m[2].trim(), range:m[3]?.trim() }); continue }
    // heuristic "Test Value (Normal)"
    m = line.match(/^(.+?)\s+(.+?)(?:\s*\((.+?)\))?$/)
    if (m && m[1] && m[2]) { out.push({ test:m[1].trim(), value:m[2].trim(), range:m[3]?.trim() }); continue }
  }
  return out.filter(r => r.test && r.value)
}

function rowsFromAsset(a: Asset): LabRow[] {
  // Prefer a.lab.values (structured), fallback to text parsing
  if ((a as any).lab && (a as any).lab.values) {
    const lab = (a as any).lab as { values: Record<string,string>, units?: Record<string,string>, ranges?: Record<string,string> }
    return Object.entries(lab.values).map(([name, val]) => {
      const unit = lab.units?.[name] ? ` ${lab.units[name]}` : ''
      const r    = lab.ranges?.[name] || NORMALS[name]?.range || ''
      return { test: name, value: val, range: r || unit.trim() }
    })
  }
  // parse from content text
  const parsed = parseLabRowsFromText(a.content)
  // enrich with known ranges where missing
  return parsed.map(r => ({ ...r, range: r.range || NORMALS[r.test]?.range }))
}

function inferPanelTitle(rows: LabRow[], original: string): string {
  const tests = rows.map(r => r.test)
  const has = (n: string) => tests.some(t => t.toLowerCase().includes(n.toLowerCase()))
  const isFilename = /[\\/]/.test(original) || /\.[a-z0-9]{2,4}$/i.test(original)

  if (has('Hgb') || has('Hct') || has('WBC') || has('Plt')) return 'CBC'
  if (has('PT') || has('INR') || has('aPTT')) return 'Coags'
  if (has('pCO2') || has('HCO') || has('SaO2') || has('pO2') || has('pH')) return 'ABG'
  if (has('Na') || has('K') || has('Cl') || has('BUN') || has('Cr')) {
    // If LFT markers present, call it CMP, else BMP
    if (has('AST') || has('ALT') || has('Tbili') || has('Albumin')) return 'CMP'
    return 'BMP'
  }
  if (has('Specific Gravity') || has('Leukocyte') || has('Nitrite')) return 'Urinalysis'

  // fallback: clean basename if it's a filename, else original
  if (isFilename) {
    const base = original.split(/[\\/]/).pop() || original
    return base.replace(/\.[a-z0-9]{2,4}$/i,'')
  }
  return original
}

// Pull the first numeric value from a string ("6.0 g/dL" -> 6.0)
function extractNumber(s?: string): number | null {
  if (!s) return null
  const m = String(s).replace(',', '.').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

// Parse a range like "4.0–11.0 x10^3/µL" or "80-100 fL" -> { low, high }
function parseRange(range?: string): { low: number, high: number } | null {
  if (!range) return null
  const clean = range.replace(/\s/g, '').replace('–', '-') // normalize en-dash
  const m = clean.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const low = Number(m[1]), high = Number(m[2])
  if (Number.isNaN(low) || Number.isNaN(high)) return null
  return { low, high }
}

// Decide if a value is outside the range (strict <low or >high)
function isAbnormal(valueStr?: string, rangeStr?: string): boolean {
  const v = extractNumber(valueStr)
  const r = parseRange(rangeStr)
  if (v == null || !r) return false
  return v < r.low || v > r.high
}


function LabTable({ rows }: { rows: LabRow[] }) {
  return (
    <div style={{ overflowX:'auto', marginTop:8 }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'system-ui', fontSize:14 }}>
        <thead>
          <tr style={{ background:'#fafafa' }}>
            <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #eee' }}>Test</th>
            <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #eee' }}>Value</th>
            <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #eee' }}>Range</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const abnormal = isAbnormal(r.value, r.range)
            const valStyle: React.CSSProperties = abnormal
              ? { padding:'8px 10px', whiteSpace:'nowrap', fontWeight:700, color:'#c62828' }   // red & bold
              : { padding:'8px 10px', whiteSpace:'nowrap', fontWeight:600 }                   // normal
            return (
              <tr key={i} style={{ borderBottom:'1px solid #f2f2f2' }}>
                <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>{r.test}</td>
                <td style={valStyle}>{r.value}</td>
                <td style={{ padding:'8px 10px', whiteSpace:'nowrap', opacity:.75 }}>{r.range || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}


// Support both older payloads (Asset) and newer ({asset, at, orderAt})
type StageItem = { asset: Asset; at?: number; orderAt?: number }

export default function Stage() {
  const [items, setItems] = useState<StageItem[]>([])
  const [latestOnly, setLatestOnly] = useState(true)
  const [sel, setSel] = useState<number>(-1)
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const [fitMode, setFitMode] = useState<'contain'|'cover'>('contain')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [announcements, setAnnouncements] = useState<Array<{ text:string; at:number }>>([])

  // persist across refresh using session API
  const [caseId] = useState<string>(() => new URLSearchParams(location.search).get('case') || 'case-anemia')
  useEffect(() => {
    fetch(`/api/session/${caseId}`).then(r=>r.json()).then(s => {
      setItems(s.stage || [])
      // optional: restore minimized into list thumbnails too if needed
    }).catch(()=>{})
  }, [caseId])

  useEffect(() => {
    const onShow = (payload: any) => {
      if (payload && payload.asset) {
        setItems(prev => [...prev, { asset: payload.asset, at: payload.at, orderAt: payload.orderAt }])
      } else {
        setItems(prev => [...prev, { asset: payload as Asset }])
      }
    }
    const onClear = () => setItems([])
    const onReset = () => setItems([])
    const onAnn = (m: { text:string; at:number }) => setAnnouncements(prev => [{ text:m.text, at:m.at }, ...prev].slice(0,50))

    socket.on('stage:show', onShow)
    socket.on('stage:clear', onClear)
    socket.on('stage:reset', onReset)
    socket.on('stage:announce', onAnn)
    return () => {
      socket.off('stage:show', onShow)
      socket.off('stage:clear', onClear)
      socket.off('stage:reset', onReset)
      socket.off('stage:announce', onAnn)
    }
  }, [])

  // Keep selection synced with latest drop
  useEffect(() => {
    if (!items.length) { setSel(-1); return }
    if (latestOnly) setSel(items.length - 1)
  }, [items, latestOnly])

  // Track fullscreen changes
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const fmt = (t?: number) => t ? new Date(t).toLocaleString() : ''
  const current = useMemo(() => (sel >= 0 && sel < items.length) ? items[sel] : null, [sel, items])

  function toggleFullscreen() {
    const el = viewerRef.current
    if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen().catch(()=>{})
    else document.exitFullscreen().catch(()=>{})
  }

  function nav(delta: number) {
    if (!items.length) return
    setSel(s => Math.max(0, Math.min(items.length - 1, (s < 0 ? items.length - 1 : s) + delta)))
  }

  // categorize items for left panel
  const categorized = useMemo(() => {
    const out: Record<string, StageItem[]> = {
      History: [], Labs: [], Imaging: [], EchoUS: [], Messages: [], Polls: [], Pearls: [], Debrief: []
    }
    for (const it of items) {
      const a = it.asset
      if (a.type === 'lab') out.Labs.push(it)
      else if (a.type === 'image' || a.type === 'pdf') out.Imaging.push(it)
      else if (a.type === 'video') out.EchoUS.push(it)
      else out.History.push(it) // default bucket
    }
    return out
  }, [items])

  return (
    <div style={{ fontFamily: 'system-ui', padding: 20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <h2 style={{ margin:0 }}>Stage</h2>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <label style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:14 }}>
            <input type="checkbox" checked={latestOnly} onChange={e=>setLatestOnly(e.target.checked)} /> Latest only
          </label>
          <button onClick={()=>nav(-1)} disabled={items.length === 0 || sel <= 0} title="Previous" style={{ padding:'6px 10px' }}>◀</button>
          <div style={{ minWidth: 90, textAlign:'center', fontSize:12, opacity:.7 }}>
            {items.length ? `${(sel < 0 ? 0 : sel+1)} / ${items.length}` : '0 / 0'}
          </div>
          <button onClick={()=>nav(1)} disabled={items.length === 0 || sel >= items.length-1} title="Next" style={{ padding:'6px 10px' }}>▶</button>
          <button onClick={()=>setFitMode(fitMode==='contain'?'cover':'contain')} disabled={!current} title={`Fit: ${fitMode}`} style={{ padding:'6px 10px' }}>{fitMode==='contain'?'Fit':'Fill'}</button>
          <button onClick={toggleFullscreen} disabled={!current} title={isFullscreen?'Exit Fullscreen':'Fullscreen'} style={{ padding:'6px 10px' }}>{isFullscreen?'⤢':'⤢'}</button>
          {current?.asset?.contentUrl && (
            <>
              <a href={current.asset.contentUrl} target="_blank" rel="noreferrer" style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8, textDecoration:'none' }}>Open</a>
              <a href={current.asset.contentUrl} download style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8, textDecoration:'none' }}>Download</a>
            </>
          )}
        </div>
      </div>

      {items.length === 0 && <p style={{ color: '#666', marginTop:12 }}>No assets revealed yet.</p>}

      <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:16, marginTop:12, alignItems:'start' }}>
        {/* Left compartments */}
        <div style={{ border:'1px solid #ddd', borderRadius:10, padding:10, position:'sticky', top:10, height:'calc(100vh - 60px)', overflow:'auto', background:'#fff' }}>
          {[
            ['History','History'],
            ['Labs','Labs'],
            ['Imaging','Imaging'],
            ['EchoUS','Echo/US'],
            ['Messages','Messages'],
            ['Polls','Polls'],
            ['Pearls','Pearls'],
            ['Debrief','Team Debrief'],
          ].map(([key,label]) => (
            <div key={key} style={{ marginBottom:14 }}>
              <div style={{ fontWeight:700, borderBottom:'1px solid #eee', paddingBottom:6, marginBottom:6 }}>{label}</div>
              <div style={{ display:'grid', gap:6 }}>
                {(categorized as any)[key]?.map((it: StageItem, i: number) => {
                  const a = it.asset
                  const title = a.title
                  const t = it.at ? new Date(it.at).toLocaleTimeString() : ''
                  const idx = items.findIndex(x => x.asset.id === a.id && x.at === it.at)
                  const isNew = sel !== idx && idx === items.length - 1
                  return (
                    <button key={`${a.id}-${i}`} onClick={() => { setSel(idx); setLatestOnly(true) }}
                      style={{ textAlign:'left', padding:8, border:'1px solid #ddd', borderRadius:8, background:'#fff', display:'grid', gap:2 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                        <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</div>
                        <div style={{ fontSize:11, opacity:.7 }}>{t}</div>
                      </div>
                      {isNew && <div style={{ fontSize:10, color:'#0a7' }}>NEW</div>}
                    </button>
                  )
                })}
                {(categorized as any)[key]?.length === 0 && <div style={{ opacity:.5, fontSize:12 }}>None</div>}
              </div>
            </div>
          ))}

          {/* Stage message box to Control */}
          <div style={{ marginTop:10 }}>
            <div style={{ fontWeight:700, borderBottom:'1px solid #eee', paddingBottom:6, marginBottom:6 }}>Message Control</div>
            <div style={{ display:'flex', gap:6 }}>
              <input id="stage-msg" placeholder="Send note to Control…" style={{ flex:1, padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }} />
              <button onClick={() => { const el = document.getElementById('stage-msg') as HTMLInputElement | null; const text = (el?.value||'').trim(); if (!text) return; socket.emit('stage:message', { text, at: Date.now(), caseId }); if (el) el.value=''; }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Send</button>
            </div>
            <div style={{ marginTop:8, display:'grid', gap:6 }}>
              {announcements.slice(0,5).map((m,i)=>(
                <div key={i} style={{ fontSize:12, opacity:.75 }}>{new Date(m.at).toLocaleTimeString()} • {m.text}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Right viewer area (framed) */}
        <div>
          {latestOnly && current && (
            <div ref={viewerRef} style={{ border:'3px solid #222', borderRadius:12, padding:12, background:'#00000008' }}>
              {(() => {
                const a = current.asset
                const rows = a.type === 'lab' ? rowsFromAsset(a) : []
                const title = a.type === 'lab' && rows.length ? inferPanelTitle(rows, a.title) : a.title
                return (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12 }}>
                      <div style={{ fontWeight: 'bold' }}>{title}</div>
                      <div style={{ fontSize:12, opacity:.7 }}>
                        {current.orderAt && <>Ordered: {fmt(current.orderAt)} • </>}
                        {current.at && <>Revealed: {fmt(current.at)}</>}
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      {a.type === 'image' && a.contentUrl && (
                        <img src={a.contentUrl} alt={title} style={{ display:'block', width:'100%', height:'auto', maxHeight:'75vh', objectFit: fitMode }} />
                      )}
                      {a.type === 'video' && a.contentUrl && (
                        <video src={a.contentUrl} controls autoPlay muted playsInline style={{ width:'100%', maxHeight:'75vh', borderRadius: 8, objectFit: fitMode as any }} />
                      )}
                      {a.type === 'pdf' && a.contentUrl && (
                        <div style={{ width:'100%', height:'75vh' }}>
                          <embed src={a.contentUrl} type="application/pdf" style={{ display:'block', width:'100%', height:'100%', border:'none' }} />
                        </div>
                      )}
                      {a.type === 'lab' && rows.length > 0 ? (
                        <LabTable rows={rows} />
                      ) : (a.type === 'lab' || a.type === 'note') && a.content ? (
                        <pre style={{ whiteSpace:'pre-wrap' }}>{a.content}</pre>
                      ) : null}
                    </div>
                  </>
                )
              })()}
            </div>
          )}
          {!latestOnly && (
            <div style={{ display:'grid', gap:12 }}>
              {/* falls back to list view below if toggled */}
            </div>
          )}
        </div>
      </div>

      {/* Latest-only focused view */}
      {latestOnly && current && (
        <div ref={viewerRef} style={{ marginTop: 12, border:'1px solid #ddd', borderRadius:8, padding:12 }}>
          {(() => {
            const a = current.asset
            const rows = a.type === 'lab' ? rowsFromAsset(a) : []
            const title = a.type === 'lab' && rows.length ? inferPanelTitle(rows, a.title) : a.title
            return (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12 }}>
                  <div style={{ fontWeight: 'bold' }}>{title}</div>
                  <div style={{ fontSize:12, opacity:.7 }}>
                    {current.orderAt && <>Ordered: {fmt(current.orderAt)} • </>}
                    {current.at && <>Revealed: {fmt(current.at)}</>}
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  {a.type === 'image' && a.contentUrl && (
                    <img src={a.contentUrl} alt={title} style={{ display:'block', width:'100%', height:'auto', maxHeight:'75vh', objectFit: fitMode }} />
                  )}
                  {a.type === 'video' && a.contentUrl && (
                    <video src={a.contentUrl} controls autoPlay muted playsInline style={{ width:'100%', maxHeight:'75vh', borderRadius: 8, objectFit: fitMode as any }} />
                  )}
                  {a.type === 'pdf' && a.contentUrl && (
                    <div style={{ width:'100%', height:'75vh' }}>
                      <embed src={a.contentUrl} type="application/pdf" style={{ display:'block', width:'100%', height:'100%', border:'none' }} />
                    </div>
                  )}
                  {a.type === 'lab' && rows.length > 0 ? (
                    <LabTable rows={rows} />
                  ) : (a.type === 'lab' || a.type === 'note') && a.content ? (
                    <pre style={{ whiteSpace:'pre-wrap' }}>{a.content}</pre>
                  ) : null}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* Thumbnails strip when latestOnly and multiple items */}
      {latestOnly && items.length > 1 && (
        <div style={{ marginTop:12, display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
          {items.map((it, i) => {
            const a = it.asset
            const rows = a.type === 'lab' ? rowsFromAsset(a) : []
            const title = a.type === 'lab' && rows.length ? inferPanelTitle(rows, a.title) : a.title
            return (
              <button key={`${a.id}-${i}`} onClick={()=>setSel(i)} style={{ minWidth:160, maxWidth:220, textAlign:'left', padding:8, border:'1px solid '+(i===sel?'#0a7':'#ddd'), borderRadius:8, background:i===sel?'rgba(0,170,119,.08)':'#fff' }}>
                <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{title}</div>
                <div style={{ fontSize:11, opacity:.7 }}>{it.at ? new Date(it.at).toLocaleTimeString() : ''}</div>
              </button>
            )
          })}
        </div>
      )}

      {/* All-items list view */}
      {!latestOnly && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {items.map(({asset: a, at, orderAt}, idx) => {
            const rows = a.type === 'lab' ? rowsFromAsset(a) : []
            const title = a.type === 'lab' && rows.length ? inferPanelTitle(rows, a.title) : a.title
            return (
              <div key={`${a.id}-${idx}`} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12 }}>
                  <div style={{ fontWeight: 'bold' }}>{title}</div>
                  <div style={{ fontSize:12, opacity:.7 }}>
                    {orderAt && <>Ordered: {fmt(orderAt)} • </>}
                    {at && <>Revealed: {fmt(at)}</>}
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  {a.type === 'image' && a.contentUrl && (
                    <img src={a.contentUrl} alt={title} style={{ display:'block', width:'100%', height:'auto' }} />
                  )}
                  {a.type === 'pdf' && a.contentUrl && (
                    <embed src={a.contentUrl} type="application/pdf" style={{ display:'block', width:'100%', height:'70vh', border:'none' }} />
                  )}
                  {a.type === 'video' && a.contentUrl && (
                    <video src={a.contentUrl} controls autoPlay muted playsInline style={{ width:'100%', maxHeight:'70vh', borderRadius: 8 }} />
                  )}
                  {a.type === 'lab' && rows.length > 0 ? (
                    <LabTable rows={rows} />
                  ) : (a.type === 'lab' || a.type === 'note') && a.content ? (
                    <pre style={{ whiteSpace:'pre-wrap' }}>{a.content}</pre>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
