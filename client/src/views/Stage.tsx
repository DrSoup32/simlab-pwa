import React, { useEffect, useMemo, useRef, useState } from 'react'
import { socket, Asset } from '../socket'
import { StageViewer } from './StageViewer'

type StageItem = { asset: Asset; at?: number; orderAt?: number }

export default function Stage() {
  const [items, setItems] = useState<StageItem[]>([])
  const [latestOnly, setLatestOnly] = useState(true)
  const [sel, setSel] = useState<number>(-1)
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const [fitMode, setFitMode] = useState<'contain'|'cover'>('contain')
  const [scale, setScale] = useState<number>(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [announcements, setAnnouncements] = useState<Array<{ text:string; at:number }>>([])

  const [caseId] = useState<string>(() => new URLSearchParams(location.search).get('case') || 'case-anemia')
  useEffect(() => {
    fetch(`/api/session/${caseId}`).then(r=>r.json()).then(s => {
      setItems(s.stage || [])
    }).catch(()=>{})
  }, [caseId])

  useEffect(() => {
    const onShow = (payload: any) => {
      if (payload && payload.asset) setItems(prev => [...prev, { asset: payload.asset, at: payload.at, orderAt: payload.orderAt }])
      else setItems(prev => [...prev, { asset: payload as Asset }])
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

  // 🔗 Control → Stage “Jump to item”
  useEffect(() => {
    const onSelect = (p: { caseId?: string; assetId?: string; at?: number; index?: number }) => {
      if (p.caseId && p.caseId !== caseId) return
      let i = -1
      if (typeof p.index === 'number') i = Math.max(0, Math.min(items.length - 1, p.index))
      else if (p.assetId && typeof p.at !== 'undefined') i = items.findIndex(x => x.asset.id === p.assetId && x.at === p.at)
      else if (p.assetId) i = items.findIndex(x => x.asset.id === p.assetId)
      if (i >= 0) { setSel(i); setLatestOnly(true); viewerRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }) }
    }
    socket.on('control:stage:select', onSelect)
    return () => { socket.off('control:stage:select', onSelect) }
  }, [items, caseId])

  useEffect(() => { if (!items.length) setSel(-1); else if (latestOnly) setSel(items.length - 1) }, [items, latestOnly])
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

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

  const categorized = useMemo(() => {
    const out: Record<string, StageItem[]> = { History: [], Labs: [], Imaging: [], EchoUS: [], Messages: [], Polls: [], Pearls: [], Debrief: [] }
    for (const it of items) {
      const a = it.asset
      if (a.type === 'lab') out.Labs.push(it)
      else if (a.type === 'image' || a.type === 'pdf') out.Imaging.push(it)
      else if (a.type === 'video') out.EchoUS.push(it)
      else out.History.push(it)
    }
    return out
  }, [items])

  return (
    <div style={{ fontFamily: 'system-ui', padding: 20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <h2 style={{ margin:0 }}>Stage</h2>
        <div className="toolbar">
          <label style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:14 }}>
            <input type="checkbox" checked={latestOnly} onChange={e=>setLatestOnly(e.target.checked)} /> Latest only
          </label>
          <button className="toolbtn" onClick={()=>nav(-1)} disabled={items.length === 0 || sel <= 0} title="Previous">◀</button>
          <div style={{ minWidth: 90, textAlign:'center', fontSize:12, opacity:.7 }}>
            {items.length ? `${(sel < 0 ? 0 : sel+1)} / ${items.length}` : '0 / 0'}
          </div>
          <button className="toolbtn" onClick={()=>nav(1)} disabled={items.length === 0 || sel >= items.length-1} title="Next">▶</button>

          <button className="toolbtn" onClick={()=>setFitMode(fitMode==='contain'?'cover':'contain')} disabled={!current} title={`Fit: ${fitMode}`}>{fitMode==='contain'?'Fit':'Fill'}</button>
          <button className="toolbtn" onClick={()=>setScale(s=>Math.max(0.5, +(s-0.1).toFixed(2)))} disabled={!current} title="Zoom out">–</button>
          <div style={{ fontSize:12, opacity:.75, minWidth:40, textAlign:'center' }}>{Math.round(scale*100)}%</div>
          <button className="toolbtn" onClick={()=>setScale(s=>Math.min(3, +(s+0.1).toFixed(2)))} disabled={!current} title="Zoom in">+</button>
          <button className="toolbtn" onClick={()=>setScale(1)} disabled={!current} title="Reset zoom">1:1</button>

          <button className="toolbtn" onClick={toggleFullscreen} disabled={!current} title={isFullscreen?'Exit Fullscreen':'Fullscreen'}>⤢</button>
          {current?.asset?.contentUrl && (
            <>
              <a className="toolbtn" href={current.asset.contentUrl} target="_blank" rel="noreferrer">Open</a>
              <a className="toolbtn" href={current.asset.contentUrl} download>Download</a>
            </>
          )}
        </div>
      </div>

      {items.length === 0 && <p style={{ color: '#666', marginTop:12 }}>No assets revealed yet.</p>}

      <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:16, marginTop:12, alignItems:'start' }}>
        {/* Left compartments */}
        <div className="left-rail">
          {[
            ['History','History'], ['Labs','Labs'], ['Imaging','Imaging'], ['EchoUS','Echo/US'],
            ['Messages','Messages'], ['Polls','Polls'], ['Pearls','Pearls'], ['Debrief','Team Debrief'],
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
                  const dotClass = a.type === 'lab' ? 'tag-lab' : (a.type === 'image' || a.type === 'pdf') ? 'tag-img' : a.type === 'video' ? 'tag-vid' : 'tag-note'
                  return (
                    <button key={`${a.id}-${i}`} onClick={() => { setSel(idx); setLatestOnly(true) }}
                      style={{ textAlign:'left', padding:8, border:'1px solid #ddd', borderRadius:8, background:'#fff', display:'grid', gap:2 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, overflow:'hidden' }}>
                          <span className={`tag-dot ${dotClass}`}></span>
                          <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</div>
                        </div>
                        <div style={{ fontSize:11, opacity:.7 }}>{t}</div>
                      </div>
                      {isNew && <div style={{ fontSize:10, color:'var(--brand)' }}>NEW</div>}
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
              <button className="toolbtn" onClick={() => {
                const el = document.getElementById('stage-msg') as HTMLInputElement | null;
                const text = (el?.value||'').trim(); if (!text) return;
                socket.emit('stage:message', { text, at: Date.now(), caseId });
                if (el) el.value='';
              }}>Send</button>
            </div>
            <div style={{ marginTop:8, display:'grid', gap:6 }}>
              {announcements.slice(0,5).map((m,i)=>(
                <div key={i} style={{ fontSize:12, opacity:.75 }}>{new Date(m.at).toLocaleTimeString()} • {m.text}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Right viewer */}
        <div ref={viewerRef}>
          {latestOnly && current && (
            <StageViewer item={current} fitMode={fitMode} scale={scale} />
          )}
          {!latestOnly && (
            <div style={{ display: 'grid', gap: 12 }}>
              {items.map((it, idx) => (
                <div key={idx}><StageViewer item={it} fitMode={fitMode} scale={1} /></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Thumbnails strip */}
      {latestOnly && items.length > 1 && (
        <div style={{ marginTop:12, display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
          {items.map((it, i) => (
            <button key={`${it.asset.id}-${i}`} onClick={()=>setSel(i)} className={`thumb ${i===sel?'active':''}`}>
              <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.asset.title}</div>
              <div style={{ fontSize:11, opacity:.7 }}>{it.at ? new Date(it.at).toLocaleTimeString() : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

