// client/src/views/Control.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { socket, Order, Asset, Pearl } from '../socket'

// ---------- File-scope types ----------
type Vital = { t: number; hr?: number; bp?: string; rr?: number; spo2?: number; temp?: number }
type Orderable = { code: string; name: string; kind: 'lab'|'imaging'|'med'|'other' }
type Gate = {
  id: string
  label: string
  when: { type: 'time'; msFromStart: number }
  reveals: string[]    // asset ids to reveal
  orderCode?: string   // which order triggers it
}
type TimelineEvent = {
  when: number
  type:
    | 'case-start' | 'case-pause' | 'case-resume' | 'case-stop'
    | 'stage-show' | 'stage-clear'
    | 'order' | 'request' | 'question' | 'pearl'
  label: string
  by?: string
  color?: string
  role?: string
  code?: string
}

const ROLES = ['Team Lead','Airway','Meds/IV','Compressions','Recorder'] as const;
type Role = typeof ROLES[number];


  // ===== Hierarchical catalog =====
type CatalogItem = { code:string; label:string; kind:'lab'|'imaging'|'med'|'other'; category:string; group:string }

export const CATALOG_TREE: Array<{ category:string; groups: Array<{ name:string; items: CatalogItem[] }> }> = [
  {
    category: 'Labs',
    groups: [
      { name: 'Hematology', items: [
        { code:'CBC',    label:'CBC',                      kind:'lab', category:'Labs', group:'Hematology' },
        { code:'RETIC',  label:'Reticulocyte Count',       kind:'lab', category:'Labs', group:'Hematology' },
        { code:'ESR',    label:'ESR',                      kind:'lab', category:'Labs', group:'Hematology' },
        { code:'CRP',    label:'CRP',                      kind:'lab', category:'Labs', group:'Hematology' },
      ]},
      { name: 'Chemistry', items: [
        { code:'BMP',    label:'Basic Metabolic Panel',    kind:'lab', category:'Labs', group:'Chemistry' },
        { code:'CMP',    label:'Comprehensive Metabolic Panel', kind:'lab', category:'Labs', group:'Chemistry' },
        { code:'LFT',    label:'Liver Panel',              kind:'lab', category:'Labs', group:'Chemistry' },
        { code:'LIPASE', label:'Lipase',                   kind:'lab', category:'Labs', group:'Chemistry' },
      ]},
      { name: 'Coagulation', items: [
        { code:'PT/INR', label:'PT/INR',                   kind:'lab', category:'Labs', group:'Coagulation' },
        { code:'PTT',    label:'aPTT',                     kind:'lab', category:'Labs', group:'Coagulation' },
        { code:'FIB',    label:'Fibrinogen',               kind:'lab', category:'Labs', group:'Coagulation' },
      ]},
      { name: 'Urinalysis', items: [
        { code:'UA',     label:'Urinalysis',               kind:'lab', category:'Labs', group:'Urinalysis' },
        { code:'U-PREG', label:'Urine Pregnancy (hCG)',    kind:'lab', category:'Labs', group:'Urinalysis' },
      ]},
      { name: 'Microbiology', items: [
        { code:'BCX',    label:'Blood Cultures (x2)',      kind:'lab', category:'Labs', group:'Microbiology' },
        { code:'UCX',    label:'Urine Culture',            kind:'lab', category:'Labs', group:'Microbiology' },
        { code:'SPX',    label:'Sputum Culture',           kind:'lab', category:'Labs', group:'Microbiology' },
      ]},
      { name: 'Toxicology', items: [
        { code:'TOX-ASA',  label:'Salicylate Level',       kind:'lab', category:'Labs', group:'Toxicology' },
        { code:'TOX-APAP', label:'Acetaminophen Level',    kind:'lab', category:'Labs', group:'Toxicology' },
        { code:'TOX-ETH',  label:'Ethanol Level',          kind:'lab', category:'Labs', group:'Toxicology' },
      ]},
    ],
  },
  {
    category: 'Imaging',
    groups: [
      { name: 'X-Ray', items: [
        { code:'CXR',    label:'Chest X-Ray (CXR)',        kind:'imaging', category:'Imaging', group:'X-Ray' },
        { code:'XR-ABD', label:'Abdomen Series',           kind:'imaging', category:'Imaging', group:'X-Ray' },
        { code:'XR-EXT', label:'Extremity X-Ray',          kind:'imaging', category:'Imaging', group:'X-Ray' },
      ]},
      { name: 'Ultrasound', items: [
        { code:'US-ABD',  label:'RUQ/Abdominal US',        kind:'imaging', category:'Imaging', group:'Ultrasound' },
        { code:'US-DVT',  label:'LE DVT Study',            kind:'imaging', category:'Imaging', group:'Ultrasound' },
      ]},
      { name: 'POCUS', items: [
        { code:'POCUS-FAST', label:'FAST Exam',            kind:'imaging', category:'Imaging', group:'POCUS' },
        { code:'POCUS-CARD', label:'Cardiac POCUS',        kind:'imaging', category:'Imaging', group:'POCUS' },
      ]},
      { name: 'CT', items: [
        { code:'CT-HEAD',  label:'CT Head (non-contrast)', kind:'imaging', category:'Imaging', group:'CT' },
        { code:'CT-ABDPEL',label:'CT Abd/Pelvis (±contrast)', kind:'imaging', category:'Imaging', group:'CT' },
        { code:'CT-PE',    label:'CT Pulmonary Angiography',  kind:'imaging', category:'Imaging', group:'CT' },
      ]},
      { name: 'MRI', items: [
        { code:'MRI-BRAIN', label:'MRI Brain',             kind:'imaging', category:'Imaging', group:'MRI' },
        { code:'MRI-SPINE', label:'MRI Spine',             kind:'imaging', category:'Imaging', group:'MRI' },
      ]},
    ],
  },
  // stubs for future
  { category:'Meds',  groups:[{ name:'Common', items:[] }] },
  { category:'Other', groups:[{ name:'Misc',   items:[] }] },
];

// quick lookup
export const CATALOG_INDEX: Record<string, Pick<CatalogItem,'kind'|'category'|'group'|'label'>> =
  Object.fromEntries(
    CATALOG_TREE.flatMap(cat =>
      cat.groups.flatMap(g =>
        g.items.map(it => [it.code.toUpperCase(), { kind: it.kind, category:cat.category, group:g.name, label:it.label }])
      )
    )
  );


// ---- Order catalogs (mirrors Learner) ----
const LABS_CATALOG = [
  { label: 'Hematology', items: [
    { code: 'CBC',    label: 'CBC',                      kind: 'lab' as const },
    { code: 'RETIC',  label: 'Reticulocyte Count',       kind: 'lab' as const },
    { code: 'ESR',    label: 'ESR',                      kind: 'lab' as const },
    { code:'CRP',  label:'CRP', kind:'lab' as const },
  ]},
  { label: 'Chemistry', items: [
    { code: 'BMP',    label: 'Basic Metabolic Panel',    kind: 'lab' as const },
    { code: 'CMP',    label: 'Comprehensive Metabolic Panel', kind: 'lab' as const },
    { code: 'LFT',    label: 'Liver Panel',              kind: 'lab' as const },
    { code: 'LIPASE', label: 'Lipase',                   kind: 'lab' as const },
  ]},
  { label: 'Coagulation', items: [
    { code: 'PT/INR', label: 'PT/INR',                   kind: 'lab' as const },
    { code: 'PTT',    label: 'aPTT',                     kind: 'lab' as const },
    { code: 'FIB',    label: 'Fibrinogen',               kind: 'lab' as const },
  ]},
  { label: 'Toxicology', items: [
    { code: 'TOX-ASA',  label: 'Salicylate Level',       kind: 'lab' as const },
    { code: 'TOX-APAP', label: 'Acetaminophen Level',    kind: 'lab' as const },
    { code: 'TOX-ETH',  label: 'Ethanol Level',          kind: 'lab' as const },
  ]},
  { label: 'Microbiology', items: [
    { code: 'BCX',    label: 'Blood Cultures (x2)',      kind: 'lab' as const },
    { code: 'UCX',    label: 'Urine Culture',            kind: 'lab' as const },
    { code: 'SPX',    label: 'Sputum Culture',           kind: 'lab' as const },
  ]},
  { label: 'Urinalysis', items: [
    { code: 'UA',     label: 'Urinalysis',               kind: 'lab' as const },
    { code: 'U-PREG', label: 'Urine Pregnancy (hCG)',    kind: 'lab' as const },
  ]},
  { label: 'Serology', items: [
    { code: 'TROP',   label: 'Troponin',                 kind: 'lab' as const },
    { code: 'BNP',    label: 'BNP/NT-proBNP',            kind: 'lab' as const },
    { code: 'CRP',    label: 'CRP',                      kind: 'lab' as const },
  ]},
];

const IMAGING_CATALOG = [
  { label: 'X-Ray', items: [
    { code: 'CXR',     label: 'Chest X-Ray (CXR)',                        kind: 'imaging' as const },
    { code: 'XR-ABD',  label: 'Abdomen Series',                           kind: 'imaging' as const },
    { code: 'XR-EXT',  label: 'Extremity X-Ray',                          kind: 'imaging' as const },
  ]},
  { label: 'Ultrasound', items: [
    { code: 'US-ABD',  label: 'RUQ/Abdominal US',                         kind: 'imaging' as const },
    { code: 'US-DVT',  label: 'LE DVT Study',                             kind: 'imaging' as const },
  ]},
  { label: 'POCUS', items: [
    { code: 'POCUS-FAST', label: 'FAST Exam',                             kind: 'imaging' as const },
    { code: 'POCUS-CARD', label: 'Cardiac POCUS',                         kind: 'imaging' as const },
  ]},
  { label: 'CT', items: [
    { code: 'CT-HEAD',  label: 'CT Head (non-contrast)',                  kind: 'imaging' as const },
    { code: 'CT-ABDPEL',label: 'CT Abd/Pelvis (±contrast)',               kind: 'imaging' as const },
    { code: 'CT-PE',    label: 'CT Pulmonary Angiography',                kind: 'imaging' as const },
  ]},
  { label: 'MRI', items: [
    { code: 'MRI-BRAIN', label: 'MRI Brain',                              kind: 'imaging' as const },
    { code: 'MRI-SPINE', label: 'MRI Spine',                              kind: 'imaging' as const },
  ]},
];

// ---------- Helpers ----------
function guessType(mime: string): Asset['type'] {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('video/')) return 'video'
  return 'note'
}
async function listCases(): Promise<Array<{ id: string; title: string }>> {
  const r = await fetch('/api/cases'); return r.json()
}
async function fetchCase(id: string) {
  const r = await fetch(`/api/case/${id}`); return r.json()
}
async function createCase(data: any) {
  const r = await fetch('/api/case', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
  if (!r.ok) throw new Error('create failed')
}
async function updateCase(id: string, data: any) {
  const r = await fetch(`/api/case/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
  if (!r.ok) throw new Error('update failed')
}
async function deleteCaseApi(id: string) {
  const r = await fetch(`/api/case/${id}`, { method:'DELETE' })
  if (!r.ok) throw new Error('delete failed')
}
async function uploadToCase(caseId: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`/api/case/${caseId}/upload`, { method:'POST', body: fd })
  if (!r.ok) throw new Error('upload failed')
  return r.json() as Promise<{ url:string; originalName:string; mime:string; size:number }>
}

// List assets across all cases (library)
type LibraryAsset = Asset & { caseId: string }
async function listAllAssets(): Promise<LibraryAsset[]> {
  try {
    const r = await fetch('/api/assets')
    if (!r.ok) return []
    const j = await r.json()
    // Normalize: ensure shape matches Asset + caseId
    return (Array.isArray(j) ? j : []).map((a:any) => ({
      caseId: a.caseId,
      id: a.id,
      title: a.title,
      type: a.type,
      contentUrl: a.contentUrl,
      content: a.content,
    }))
  } catch { return [] }
}

function kindFromMime(mime: string): Asset['type'] {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  return 'note'
}

function newId(prefix = 'asset') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
}

// ---- Lab Panel Library API ----
type PanelRow = { name: string; value: string; normal: string }
type SavedPanel = { id: string; title: string; rows: PanelRow[] }
async function listPanels(): Promise<SavedPanel[]> {
  try { const r = await fetch('/api/panels'); return r.ok ? r.json() : [] } catch { return [] }
}
async function createPanel(data: { title: string; rows: PanelRow[] }): Promise<SavedPanel> {
  const r = await fetch('/api/panels', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
  if (!r.ok) throw new Error('create panel failed'); return r.json()
}
async function updatePanel(id: string, data: Partial<{ title: string; rows: PanelRow[] }>): Promise<SavedPanel> {
  const r = await fetch(`/api/panels/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
  if (!r.ok) throw new Error('update panel failed'); return r.json()
}
async function deletePanel(id: string): Promise<void> {
  const r = await fetch(`/api/panels/${id}`, { method:'DELETE' }); if (!r.ok) throw new Error('delete panel failed')
}
function typeHue(t: Asset['type']) {
  switch (t) {
    case 'lab': return '#2962ff'
    case 'image': return '#2e7d32'
    case 'pdf': return '#6a1b9a'
    case 'video': return '#c62828'
    default: return '#455a64' // note
  }
}
function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ---------- Modal ----------
function Modal(props: { open: boolean; onClose: () => void; children: React.ReactNode; title: string }) {
  if (!props.open) return null
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'grid', placeItems:'center', zIndex:50}}>
      <div style={{background:'#fff', width:'min(900px, 96vw)', maxHeight:'90vh', borderRadius:12, boxShadow:'0 10px 30px rgba(0,0,0,.25)', display:'flex', flexDirection:'column'}}>
        <div style={{padding:'12px 16px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <strong>{props.title}</strong>
          <button onClick={props.onClose} style={{padding:'4px 8px'}}>✕</button>
        </div>
        <div style={{padding:16, overflow:'auto'}}>{props.children}</div>
      </div>
    </div>
  )
}

// ------- Lab Panel Generator Modal (shared library + per-case add) -------
function LabPanelModal({ open, onClose, onAddToCase, notify }:{ open:boolean; onClose:()=>void; onAddToCase:(p: { title:string; rows: PanelRow[]; gate?: { orderCode:string; delayMin:number } })=>void; notify?: (text: string, kind?: 'success'|'info'|'error') => void }) {
  const [panels, setPanels] = useState<SavedPanel[]>([])
  const [sel, setSel] = useState<string>('')
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<PanelRow[]>([])
  const [orderCode, setOrderCode] = useState('')
  const [delayMin, setDelayMin] = useState('10')
  const [apiUp, setApiUp] = useState(true)

  // Offline fallback storage
  const LS_KEY = 'simlab:panels:offline'
  const loadLocal = (): SavedPanel[] => {
    try { const raw = localStorage.getItem(LS_KEY); const j = raw ? JSON.parse(raw) : []; return Array.isArray(j) ? j : [] } catch { return [] }
  }
  const saveLocal = (list: SavedPanel[]) => { try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch {} }

  const refreshPanels = async (): Promise<SavedPanel[]> => {
    if (apiUp) {
      try {
        const list = await listPanels()
        setPanels(list)
        return list
      } catch {
        const list = loadLocal()
        setPanels(list)
        setApiUp(false)
        return list
      }
    } else {
      const list = loadLocal()
      setPanels(list)
      return list
    }
  }

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try { const r = await fetch('/api/health'); setApiUp(!!r.ok) } catch { setApiUp(false) }
      await refreshPanels()
    })()
  }, [open])

  useEffect(() => {
    if (!sel) return
    const p = panels.find(x => x.id === sel); if (!p) return
    setTitle(p.title)
    setRows(p.rows.map(r => ({ ...r })))
  }, [sel])

  const addRow = () => setRows(prev => [...prev, { name:'New', value:'', normal:'' }])
  const removeRow = (i:number) => setRows(prev => prev.filter((_,ix)=>ix!==i))

  if (!open) return null
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'grid', placeItems:'center', zIndex:65}}>
      <div style={{ background:'#fff', width:'min(960px,95vw)', maxHeight:'92vh', borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <strong>Lab Panel Generator</strong>
          <button onClick={onClose} style={{ padding:'4px 8px' }}>✕</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:12, padding:16, overflow:'auto' }}>
          {/* Left: Library list and actions */}
          <div>
            <div style={{ fontWeight:600, marginBottom:6 }}>Saved Panels</div>
            <div style={{ display:'grid', gap:6, marginBottom:8 }}>
              {panels.length === 0 && <div style={{ opacity:.6 }}>No saved panels yet.</div>}
              {panels.map(p => (
                <div key={p.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:6, alignItems:'center', border:'1px solid #f0f0f0', borderRadius:8, padding:'6px 8px', background: sel===p.id ? '#f5f9ff' : '#fff' }}>
                  <button onClick={()=>setSel(p.id)} style={{ textAlign:'left', background:'none', border:'none', cursor:'pointer' }}>
                    <div style={{ fontWeight:600 }}>{p.title}</div>
                    <div style={{ fontSize:12, opacity:.7 }}>{p.rows.length} row(s)</div>
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('Delete this panel from the library?')) return;
                      try {
                        if (apiUp) {
                          await deletePanel(p.id);
                          setPanels(await listPanels());
                        } else {
                          const list = loadLocal().filter(x => x.id !== p.id);
                          saveLocal(list); setPanels(list);
                        }
                        notify?.('Panel deleted','success')
                      } catch {
                        notify?.('Failed to delete panel','error')
                        alert('Failed to delete panel')
                      }
                    }}
                    style={{ border:'1px solid #c33', color:'#c33', borderRadius:6, padding:'4px 6px' }}
                  >✕</button>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button onClick={()=>{ setSel(''); setTitle(''); setRows([]) }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>+ New</button>
              {sel && (
                <button
                  onClick={async ()=>{
                    try {
                      if (apiUp) {
                        await updatePanel(sel, { title, rows });
                        setPanels(await listPanels());
                      } else {
                        const list = loadLocal();
                        const i = list.findIndex(x => x.id === sel);
                        if (i >= 0) { list[i] = { ...list[i], title, rows }; saveLocal(list); setPanels(list) }
                      }
                      notify?.('Panel updated','success')
                    } catch {
                      notify?.('Failed to update panel','error')
                      alert('Failed to update panel')
                    }
                  }}
                  style={{ padding:'6px 10px', border:'1px solid #0a7', color:'#0a7', borderRadius:8 }}
                >Update</button>
              )}
              <button onClick={async ()=>{ await refreshPanels(); notify?.('Library refreshed','info') }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Refresh</button>
            </div>
          </div>

          {/* Right: Editor */}
          <div style={{ display:'grid', gap:10 }}>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <label>Title:</label>
              <input value={title} onChange={e=>setTitle(e.target.value)} style={{ flex:1, padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }} />
            </div>
            <div style={{ border:'1px solid #eee', borderRadius:12, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 40px', fontWeight:600, background:'#fafafa', borderBottom:'1px solid #eee', padding:'8px 10px' }}>
                <div>Test</div><div>Result</div><div>Reference</div><div></div>
              </div>
              <div style={{ display:'grid' }}>
                {rows.map((r, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 40px', gap:8, alignItems:'center', padding:'8px 10px', borderBottom:'1px solid #f2f2f2' }}>
                    <input value={r.name} onChange={e=>setRows(prev => prev.map((x,ix)=> ix===i ? { ...x, name:e.target.value } : x))} style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }} />
                    <input value={r.value} onChange={e=>setRows(prev => prev.map((x,ix)=> ix===i ? { ...x, value:e.target.value } : x))} style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }} />
                    <input value={r.normal} onChange={e=>setRows(prev => prev.map((x,ix)=> ix===i ? { ...x, normal:e.target.value } : x))} style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }} />
                    <button onClick={()=>removeRow(i)} style={{ border:'1px solid #c33', color:'#c33', borderRadius:6 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <button onClick={addRow} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>+ Row</button>
            </div>

            {/* Optional gate */}
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <label>Also gate to order:</label>
              <input value={orderCode} onChange={e=>setOrderCode(e.target.value.toUpperCase())} placeholder="e.g., CBC" style={{ width:120, padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }} />
              <label>Delay (min):</label>
              <input value={delayMin} onChange={e=>setDelayMin(e.target.value)} style={{ width:80, padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }} />
            </div>

            {/* Live Preview */}
            <div style={{ marginTop: 6, borderTop:'1px dashed #eee', paddingTop:10 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Preview</div>
              {rows.length === 0 ? (
                <div style={{ opacity:.6 }}>Add rows to see a preview here.</div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
                    <thead>
                      <tr style={{ background:'#fafafa' }}>
                        <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #eee' }}>Test</th>
                        <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #eee' }}>Value</th>
                        <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #eee' }}>Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r,i) => (
                        <tr key={i} style={{ borderBottom:'1px solid #f2f2f2' }}>
                          <td style={{ padding:'6px 8px', whiteSpace:'nowrap' }}>{r.name}</td>
                          <td style={{ padding:'6px 8px', whiteSpace:'nowrap', fontWeight:600 }}>{r.value}</td>
                          <td style={{ padding:'6px 8px', whiteSpace:'nowrap', opacity:.75 }}>{r.normal || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={async ()=>{ const list = await refreshPanels(); notify?.(`Library: ${list.length} panel(s)`, 'info') }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>View Library</button>
              <button onClick={async ()=>{
                try {
                  if (apiUp) {
                    const p = await createPanel({ title: title.trim() || 'Untitled Panel', rows });
                    setPanels(await listPanels());
                    setSel(p.id);
                  } else {
                    const p: SavedPanel = { id: `L-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, title: title.trim() || 'Untitled Panel', rows: rows.map(r=>({...r})) }
                    const next = [ ...loadLocal(), p ]
                    saveLocal(next); setPanels(next); setSel(p.id)
                  }
                  notify?.('Panel saved to library','success')
                } catch (e) {
                  notify?.('Failed to save panel','error')
                  alert('Failed to save panel to library')
                }
              }} style={{ padding:'6px 10px', border:'1px solid #0a7', color:'#0a7', borderRadius:8 }}>Save to Library</button>
              <button onClick={onClose} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Close</button>
              <button onClick={() => {
                const gate = orderCode.trim() ? { orderCode: orderCode.trim().toUpperCase(), delayMin: Math.max(0, parseInt(delayMin||'0',10)) } : undefined
                onAddToCase({ title: title.trim() || 'Lab Panel', rows, gate })
                onClose()
              }} style={{ padding:'6px 10px', border:'1px solid #0a7', color:'#0a7', borderRadius:8 }}>Add to Case</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
// ---------- Small UI helpers ----------
function Row({ label, children }:{ label:string; children:React.ReactNode }) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'160px 1fr', gap:10, alignItems:'center', marginBottom:10}}>
      <label style={{fontWeight:600}}>{label}</label>
      <div>{children}</div>
    </div>
  )
}
function Chip({ children }:{children:React.ReactNode}) {
  return <span style={{display:'inline-block', padding:'2px 8px', border:'1px solid #ddd', borderRadius:999, marginRight:6}}>{children}</span>
}

// ---------- Collapsible Section ----------
function Section(props: {
  title: string;
  open: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  children?: React.ReactNode;
  indicator?: { count: number; color?: string; };
}) {
  return (
    <section style={{ margin: '12px 0 16px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <button
          onClick={props.onToggle}
          title={props.open ? 'Collapse' : 'Expand'}
          style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}
        >
          <span style={{ display:'inline-block', width:12, transform:`rotate(${props.open ? 90 : 0}deg)`, transition:'transform .15s ease' }}>▸</span>
          <h3 style={{ margin:0, display:'flex', alignItems:'center', gap:8 }}>
            {props.title}
            {props.indicator && props.indicator.count > 0 && (
              <span style={{
                background: props.indicator.color || '#0a7',
                color: 'white', fontSize: 12, padding: '2px 6px',
                borderRadius: 10, minWidth: 20, textAlign: 'center'
              }}>
                {props.indicator.count}
              </span>
            )}
          </h3>
        </button>
        {props.right}
      </div>
      {props.open && <div style={{ marginTop: 10 }}>{props.children}</div>}
    </section>
  )
}
function usePanelState(key: string, defaultOpen = true) {
  const [open, setOpen] = useState<boolean>(() => {
    const v = localStorage.getItem(key)
    if (v === '1') return true
    if (v === '0') return false
    return defaultOpen
  })
  useEffect(() => { localStorage.setItem(key, open ? '1' : '0') }, [key, open])
  return [open, setOpen] as const
}

// ---------- Editors ----------
// ------- Case Wizard -------
function CaseWizard({
  open, onClose, onCreated
}: {
  open: boolean
  onClose: () => void
  onCreated: (caseId: string) => void
}) {
  const [step, setStep] = useState<0|1|2|3>(0)
  const [mode, setMode] = useState<'new'|'edit'>('new')
  const [cases, setCases] = useState<Array<{id:string; title:string}>>([])
  const [selectedExisting, setSelectedExisting] = useState<string>('')
  
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [hpi, setHpi] = useState('')
  const [pmh, setPmh] = useState<string[]>([])
  const [meds, setMeds] = useState<string[]>([])
  const [allergies, setAllergies] = useState<string[]>([])
  const [staged, setStaged] = useState<Array<{file?:File; url?:string; mime?:string; title:string; type:Asset['type']}>>([])
  
  // panels authored inside the wizard (no files)
  type DraftLab = {
    id: string
    title: string
    content: string     // TSV lines: "Test\tValue\t(Normal)"
    // optional one-off time gate instruction
    gate?: { orderCode: string; delayMin: number }
  }

  const [draftLabs, setDraftLabs] = useState<DraftLab[]>([])
  const addDraftLab = (p: DraftLab) => setDraftLabs(prev => [p, ...prev])
  const removeDraftLab = (id: string) => setDraftLabs(prev => prev.filter(x => x.id !== id))
  
  const [busy, setBusy] = useState(false)
  const canNextInfo = id.trim().length > 0 && title.trim().length > 0
  const [labOpen, setLabOpen] = useState(false);

// load list of cases when wizard opens
  useEffect(() => {
    if (!open) return
    ;(async () => {
      try { setCases(await listCases()) } catch {}
    })()
  }, [open])

  // reset wizard each time it opens
  useEffect(() => {
    if (!open) return
    setStep(0)             // go to Step 0
    setMode('new')
    setSelectedExisting && setSelectedExisting('') // if you have this state
    setId && setId('')
    setTitle && setTitle('')
    setSummary && setSummary('')
    setHpi && setHpi('')
    setPmh && setPmh([])
    setMeds && setMeds([])
    setAllergies && setAllergies([])
    setStaged && setStaged([])
  }, [open])

  // utility: prefill fields from existing case
  async function loadExisting(caseId: string) {
    try {
      const data = await fetchCase(caseId)
      setId(data.id || caseId)
      setTitle(data.title || caseId)
      setSummary(data.summary || '')
      setHpi(data.history?.hpi || '')
      setPmh(Array.isArray(data.history?.pmh) ? data.history.pmh : [])
      setMeds(Array.isArray(data.history?.meds) ? data.history.meds : [])
      setAllergies(Array.isArray(data.history?.allergies) ? data.history.allergies : [])
      // show existing assets in Review (Step 3) and allow adding more in Step 2
      const stagedExisting = (Array.isArray(data.assets) ? data.assets : []).map((a:Asset) => ({
        url: a.contentUrl, title: a.title, type: a.type as Asset['type']
      }))
      setStaged(stagedExisting)
    } catch (e) {
      alert('Failed to load existing case')
    }
  }

  const onPickFiles = (files: FileList) => {
    const next = Array.from(files).map(f => ({
      file: f,
      title: f.name.replace(/\.[^.]+$/,''),
      type: kindFromMime(f.type),
      mime: f.type
    }))
    setStaged(prev => [...prev, ...next])
  }

  const uploadAll = async () => {
  setBusy(true)
  // hoist these so they are available after try/finally for gates merge
  let existing: any = null
  let caseJson: any = null
  try {
    // 1) Upload any newly staged files and build new asset entries
    const newAssets: Asset[] = []
    for (const s of staged) {
      if (s.file) {
        const up = await uploadToCase(id, s.file)
        newAssets.push({ id: newId(kindFromMime(up.mime)), title: s.title, type: kindFromMime(up.mime), contentUrl: up.url })
      } else if (s.url) {
        newAssets.push({ id: newId(s.type), title: s.title, type: s.type, contentUrl: s.url })
      }
    }

    // 2) Load existing (if any) to MERGE, not wipe
    let existing: any = null
    try {
      const r = await fetch(`/api/case/${id}`)
      if (r.ok) existing = await r.json()
    } catch {}

    // 3a) Build merged assets (keep existing + add newly staged)
    const mergedAssets: Asset[] = [
      ...Array.isArray(existing?.assets) ? existing.assets : [],
      ...newAssets,
    ]
    // 3b) merge authored lab panels (as Asset objects)
    const labAssets: Asset[] = draftLabs.map(lp => ({
      id: lp.id,              // pre-generated id
      title: lp.title,
      type: 'lab',
      content: lp.content     // TSV rows ("Test\tValue\t(Normal)")
    }));

    const mergedWithLabs = [...mergedAssets, ...labAssets];


  // 4) Keep existing orders/gates unless you add UI to edit them here
  caseJson = {
      id,
      title,
      summary,
      history: { hpi, pmh, meds, allergies },
      vitals: Array.isArray(existing?.vitals) ? existing.vitals : [],
      assets: mergedWithLabs,
      ordersCatalog: Array.isArray(existing?.ordersCatalog) ? existing.ordersCatalog : [],
      gates: Array.isArray(existing?.gates) ? existing.gates : []
    }

    // 5) Save: POST if new, else PUT
    const create = await fetch(`/api/case`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(caseJson)
    })
    if (!create.ok) {
      await fetch(`/api/case/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(caseJson) })
    }

    onCreated(id)
    onClose()
  } catch (e:any) {
    alert('Failed to save case: ' + (e?.message || e))
  } finally {
    setBusy(false)
  }

  // 6) Optionally append time gates for the new lab panels
  if (draftLabs.some(x => x.gate)) {
    const newGates = draftLabs
      .filter(x => x.gate)
      .map(x => ({
        id: `g_${x.gate!.orderCode}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        label: `${x.gate!.orderCode.toUpperCase()} result after ${x.gate!.delayMin}m`,
        orderCode: x.gate!.orderCode.toUpperCase(),
        when: { type:'time', msFromStart: x.gate!.delayMin * 60 * 1000 },
        reveals: [x.id]  // reveal this specific panel
      }))

    // merge and save gates update
    const mergedGates = [...(existing?.gates || []), ...newGates]
    await fetch(`/api/case/${id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...(caseJson || {}), gates: mergedGates })
    })
  }
}
  if (!open) return null
  return (
    <>
    <Modal open={open} onClose={onClose} title="New Case Wizard">
      {/* Step header */}
      <div style={{display:'flex', gap:8, marginBottom:12}}>
        <div style={{fontWeight: step===1?700:500}}>1. Info</div>
        <div style={{opacity:.6}}>›</div>
        <div style={{fontWeight: step===2?700:500}}>2. Files</div>
        <div style={{opacity:.6}}>›</div>
        <div style={{fontWeight: step===3?700:500}}>3. Review & Save</div>
      </div>

      {step === 0 && (
      <div style={{display:'grid', gap:16}}>
        <div style={{display:'flex', gap:16}}>
          {/* Left: Edit existing */}
          <div style={{flex:1, border:'1px solid #eee', borderRadius:12, padding:12}}>
            <div style={{fontWeight:700, marginBottom:8}}>Edit existing case</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center'}}>
              <select
                value={selectedExisting}
                onChange={e => setSelectedExisting(e.target.value)}
                style={{padding:'8px 10px', border:'1px solid #ccc', borderRadius:8}}
              >
                <option value="">Select a case…</option>
                {cases.map(c => <option key={c.id} value={c.id}>{c.title} ({c.id})</option>)}
              </select>
              <button
                onClick={async () => {
                  if (!selectedExisting) return
                  setMode('edit')
                  await loadExisting(selectedExisting)
                  setStep(1) // go to Info step with fields prefilled
                }}
                disabled={!selectedExisting}
                style={{padding:'6px 10px', border:'1px solid #0a7', borderRadius:8, color:'#0a7', opacity:selectedExisting?1:.5}}
              >
                Load
              </button>
            </div>
          </div>

          {/* Right: Create new */}
          <div style={{flex:1, border:'1px solid #eee', borderRadius:12, padding:12}}>
            <div style={{fontWeight:700, marginBottom:8}}>Create new case</div>
            <div style={{display:'grid', gap:8}}>
              <Row label="Case ID">
                <input
                  value={id}
                  onChange={e=>{ setId(e.target.value.replace(/\s+/g,'-')); setMode('new') }}
                  placeholder="case-sepsis"
                  style={{width:'100%', padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}
                />
              </Row>
              <Row label="Title">
                <input
                  value={title}
                  onChange={e=>{ setTitle(e.target.value); setMode('new') }}
                  placeholder="Sepsis"
                  style={{width:'100%', padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}
                />
              </Row>
              <div style={{display:'flex', justifyContent:'flex-end'}}>
                <button
                  onClick={() => setStep(1)}
                  disabled={!(id.trim() && title.trim())}
                  style={{padding:'6px 10px', border:'1px solid #0a7', borderRadius:8, color:'#0a7', opacity:(id.trim()&&title.trim())?1:.5}}
                >
                  Next: Info
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{display:'flex', justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Close</button>
        </div>
      </div>
    )}

      {step === 1 && (
        <div style={{display:'grid', gap:12}}>
          <Row label="Case ID">
            <input value={id} onChange={e=>setId(e.target.value.replace(/\s+/g,'-'))}
                   placeholder="case-sepsis" style={{width:'100%', padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
          </Row>
          <Row label="Title">
            <input value={title} onChange={e=>setTitle(e.target.value)}
                   placeholder="Sepsis" style={{width:'100%', padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
          </Row>
          <Row label="Summary">
            <textarea value={summary} onChange={e=>setSummary(e.target.value)} rows={2}
                      style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:8}}/>
          </Row>
          <Row label="HPI">
            <textarea value={hpi} onChange={e=>setHpi(e.target.value)} rows={3}
                      style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:8}}/>
          </Row>
          <Row label="PMH"><StringListEditor value={pmh} onChange={setPmh} placeholder="HTN, T2DM"/></Row>
          <Row label="Meds"><StringListEditor value={meds} onChange={setMeds} placeholder="Metformin 500 mg bid"/></Row>
          <Row label="Allergies"><StringListEditor value={allergies} onChange={setAllergies}/></Row>
          <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
            <button onClick={onClose} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Cancel</button>
            <button onClick={()=>setStep(2)} disabled={!canNextInfo}
                    style={{ padding:'6px 10px', border:'1px solid #0a7', borderRadius:8, color:'#0a7', opacity:canNextInfo?1:.5 }}>
              Next: Files
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div
            onDragOver={e=>{e.preventDefault(); e.dataTransfer.dropEffect='copy'}}
            onDrop={async e=>{
              e.preventDefault()
              const files = e.dataTransfer.files
              if (!files?.length) return
              onPickFiles(files)
            }}
            style={{ border:'2px dashed #bbb', borderRadius:12, padding:20, textAlign:'center', background:'#fafafa', marginBottom:10 }}
          >
            Drag files here to stage (images / PDFs / videos)
          </div>
          <input type="file" multiple accept="image/*,application/pdf,video/*"
                 onChange={e=>{ if (e.target.files) onPickFiles(e.target.files); e.currentTarget.value='' }}
                 style={{ marginBottom:12 }}
          />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setLabOpen(true)} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>
              + Lab Panel
            </button>
          </div>

          {/* staged files table */}
          <div style={{display:'grid', gap:8}}>
            {staged.length===0 && <div style={{opacity:.6}}>No files staged.</div>}
            {staged.map((s, i) => (
              <div key={i} style={{display:'grid', gridTemplateColumns:'1fr 160px 80px', gap:8, alignItems:'center', border:'1px solid #eee', borderRadius:8, padding:8}}>
                <input value={s.title} onChange={e=> {
                  const v = e.target.value; setStaged(prev => prev.map((x,ix)=> ix===i ? {...x, title:v} : x))
                }} style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
                <select value={s.type} onChange={e=> {
                  const t = e.target.value as Asset['type']; setStaged(prev => prev.map((x,ix)=> ix===i ? {...x, type:t} : x))
                }} style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}>
                  <option value="image">image</option>
                  <option value="pdf">pdf</option>
                  <option value="video">video</option>
                  <option value="note">note</option>
                  <option value="lab">lab</option>
                </select>
                <button onClick={()=> setStaged(prev => prev.filter((_,ix)=> ix!==i))}
                        style={{padding:'6px 10px', border:'1px solid #c33', color:'#c33', borderRadius:8}}>✕</button>
              </div>
            ))}
          </div>
          {draftLabs.length > 0 && (
            <div style={{ marginTop:12 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Lab Panels</div>
              <div style={{ display:'grid', gap:8 }}>
                {draftLabs.map(lp => (
                  <div key={lp.id} style={{ border:'1px solid #eee', borderRadius:8, padding:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontWeight:600 }}>{lp.title}</div>
                      {lp.gate && (
                        <div style={{ fontSize:12, opacity:.7 }}>
                          Gate: {lp.gate.orderCode.toUpperCase()} after {lp.gate.delayMin} min
                        </div>
                      )}
                    </div>
                    <div>
                      <button onClick={() => removeDraftLab(lp.id)} style={{ border:'1px solid #c33', color:'#c33', borderRadius:8, padding:'4px 8px' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{display:'flex', justifyContent:'space-between', marginTop:12}}>
            <button onClick={()=>setStep(1)} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Back</button>
            <button onClick={()=>setStep(3)} disabled={staged.length===0}
                    style={{ padding:'6px 10px', border:'1px solid #0a7', borderRadius:8, color:'#0a7', opacity:staged.length?1:.5 }}>
              Next: Review
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{marginBottom:8, opacity:.8}}>
            Review and Save. Files will be uploaded under <code>/assets/cases/{id}/…</code>.
          </div>
          <ul style={{margin:0, paddingLeft:18}}>
            <li><strong>ID</strong>: {id}</li>
            <li><strong>Title</strong>: {title}</li>
            {summary && <li><strong>Summary</strong>: {summary}</li>}
          </ul>

          <div style={{display:'grid', gap:8, marginTop:10}}>
            {staged.map((s,i)=>(
              <div key={i} style={{border:'1px solid #eee', borderRadius:8, padding:8}}>
                <div><strong>{s.title}</strong> <span style={{opacity:.7}}>({s.type})</span></div>
                <div style={{fontSize:12, opacity:.7}}>{s.file?.name || s.url}</div>
              </div>
            ))}
          </div>

          <div style={{display:'flex', justifyContent:'space-between', marginTop:12}}>
            <button onClick={()=>setStep(2)} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Back</button>
            <button onClick={uploadAll} disabled={busy} style={{ padding:'6px 10px', border:'1px solid #0a7', color:'#0a7', borderRadius:8, opacity:busy?0.6:1 }}>
              {busy ? 'Saving…' : 'Save Case'}
            </button>
          </div>
        </div>
      )}
    </Modal>

    {/* Lab panel modal for the wizard (draft list) */}
  <LabPanelModal
      open={labOpen}
      onClose={() => setLabOpen(false)}
      onAddToCase={({ title, rows, gate }) => {
        const content = rows.map(r => `${r.name}\t${r.value}\t${r.normal}`).join('\n')
        addDraftLab({ id: newId('lab'), title: title || 'Lab Panel', content, gate: gate ? { orderCode: (gate.orderCode || '').toUpperCase(), delayMin: gate.delayMin } : undefined })
        setLabOpen(false)
      }}
    />
    </>
  )
}

function StringListEditor({ value, onChange, placeholder }:{
  value: string[]; onChange:(v:string[])=>void; placeholder?:string
}) {
  const [text, setText] = useState('')
  return (
    <div>
      <div style={{marginBottom:6}}>
        {value.length === 0 && <span style={{opacity:.6}}>None</span>}
        {value.map((s, i) => (
          <Chip key={i}>
            {s}{' '}
            <button onClick={()=>onChange(value.filter((_,idx)=>idx!==i))} style={{border:'none',background:'none',cursor:'pointer'}}>✕</button>
          </Chip>
        ))}
      </div>
      <div style={{display:'flex', gap:6}}>
        <input value={text} onChange={e=>setText(e.target.value)} placeholder={placeholder||'Add item'}
               style={{flex:1, padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
        <button onClick={()=>{ if(text.trim()){ onChange([...value, text.trim()]); setText('') } }}
                style={{padding:'6px 10px', border:'1px solid #ccc', borderRadius:8}}>
          Add
        </button>
      </div>
    </div>
  )
}

function VitalsEditor({ value, onChange }:{ value: Vital[]; onChange: (v: Vital[]) => void }) {
  const [hr, setHr] = useState(''); const [bp, setBp] = useState(''); const [rr, setRr] = useState('');
  const [spo2, setSpo2] = useState(''); const [temp, setTemp] = useState('');
  return (
    <div>
      {value.length===0 && <div style={{opacity:.6, marginBottom:8}}>No vitals yet.</div>}
      <div style={{display:'grid', gap:6, marginBottom:8}}>
        {value.map((v, i)=>(
          <div key={i} style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr) 40px', gap:6, alignItems:'center'}}>
            <input defaultValue={v.hr ?? ''}  onChange={e=>{ const c=[...value]; c[i]={...c[i], hr: e.target.value? Number(e.target.value): undefined}; onChange(c)}}
                   placeholder="HR"  style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
            <input defaultValue={v.bp ?? ''}  onChange={e=>{ const c=[...value]; c[i]={...c[i], bp: e.target.value||undefined}; onChange(c)}}
                   placeholder="BP 120/80" style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
            <input defaultValue={v.rr ?? ''}  onChange={e=>{ const c=[...value]; c[i]={...c[i], rr: e.target.value? Number(e.target.value): undefined}; onChange(c)}}
                   placeholder="RR"  style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
            <input defaultValue={v.spo2 ?? ''} onChange={e=>{ const c=[...value]; c[i]={...c[i], spo2: e.target.value? Number(e.target.value): undefined}; onChange(c)}}
                   placeholder="SpO₂" style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
            <input defaultValue={v.temp ?? ''} onChange={e=>{ const c=[...value]; c[i]={...c[i], temp: e.target.value? Number(e.target.value): undefined}; onChange(c)}}
                   placeholder="Temp °C" style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
            <button onClick={()=>{ const c=[...value]; c.splice(i,1); onChange(c)}}
                    style={{padding:'6px 8px', border:'1px solid #c33', color:'#c33', borderRadius:8}}>✕</button>
          </div>
        ))}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr) 50px', gap:6}}>
        <input value={hr}   onChange={e=>setHr(e.target.value)}   placeholder="HR"  style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
        <input value={bp}   onChange={e=>setBp(e.target.value)}   placeholder="BP" style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
        <input value={rr}   onChange={e=>setRr(e.target.value)}   placeholder="RR"  style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr) 50px', gap:6}}>
        <input value={spo2} onChange={e=>setSpo2(e.target.value)} placeholder="SpO₂" style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
        <input value={temp} onChange={e=>setTemp(e.target.value)} placeholder="Temp °C" style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
        <div/>
        <button onClick={()=>{
          const v: Vital = { t: Date.now() }
          if (hr) v.hr = Number(hr); if (bp) v.bp = bp; if (rr) v.rr = Number(rr)
          if (spo2) v.spo2 = Number(spo2); if (temp) v.temp = Number(temp)
          onChange([...value, v]); setHr(''); setBp(''); setRr(''); setSpo2(''); setTemp('')
        }} style={{padding:'6px 10px', border:'1px solid #0a7', borderRadius:8, color:'#0a7'}}>Add vital</button>
      </div>
    </div>
  )
}

// ---------- Orders & Gates Tab ----------
function OrdersGatesTab({
  assets, ordersCatalog, setOrdersCatalog, gates, setGates, caseId, policy, setPolicy, allowedRoles, setAllowedRoles
}:{
  assets: Asset[];
  ordersCatalog: Orderable[];
  setOrdersCatalog: React.Dispatch<React.SetStateAction<Orderable[]>>;  // ← update
  gates: Gate[];
  setGates: React.Dispatch<React.SetStateAction<Gate[]>>;              // ← optional but nice
  caseId: string;
  policy: Record<string,'ok'|'justify'|'blocked'>
  setPolicy: React.Dispatch<React.SetStateAction<Record<string,'ok'|'justify'|'blocked'>>>
  allowedRoles: Record<string, Role[]>
  setAllowedRoles: React.Dispatch<React.SetStateAction<Record<string, Role[]>>>
  notify: (text: string, kind?: 'success'|'info'|'error') => void;
})
{
  // orders
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Orderable['kind']>('lab')
  const addOrder = () => {
    const c = code.trim().toUpperCase(); const n = name.trim()
    if (!c || !n) return
    if (ordersCatalog.some(o => o.code === c)) return alert('Order code already exists.')
    setOrdersCatalog([...ordersCatalog, { code:c, name:n, kind }])
    setCode(''); setName('')
  }
  const removeOrder = (c:string) => setOrdersCatalog(ordersCatalog.filter(o=>o.code!==c))
  
  // Add from catalog with auto-increment name (CBC → CBC 2 → CBC 3…)
  function addFromCatalog(item: { code:string; label:string; kind: 'lab'|'imaging'|'med'|'other' }) {
    const code = item.code.toUpperCase()
    const existingCount = ordersCatalog.filter(o => o.code === code).length
    const name = existingCount ? `${item.label} ${existingCount + 1}` : item.label
    setOrdersCatalog(prev => [...prev, { code, name, kind: item.kind }])
  }

  function duplicateOrderAt(index: number) {
    const o = ordersCatalog[index];
    if (!o) return;
    const code = o.code.toUpperCase();
    const baseLabel = o.name.replace(/\s+\d+$/, '');
    const existingSame = ordersCatalog.filter(x => x.code === code && x.name.startsWith(baseLabel)).length;
    const nextName = existingSame ? `${baseLabel} ${existingSame + 1}` : `${baseLabel} 2`;
    setOrdersCatalog(prev => {
      const copy = [...prev];
      copy.splice(index + 1, 0, { code, name: nextName, kind: o.kind });
      return copy;
    });
  }

  function applyPresetSepsis() {
  // Minimal, high-yield set
  const preset = [
    { code:'CBC',    name:'CBC',                     kind:'lab' as const },
    { code:'CMP',    name:'Comprehensive Metabolic Panel', kind:'lab' as const },
    { code:'LACT',   name:'Lactate',                 kind:'lab' as const },
    { code:'BCX',    name:'Blood Cultures (x2)',     kind:'lab' as const },
    { code:'UA',     name:'Urinalysis',              kind:'lab' as const },
    { code:'CXR',    name:'Chest X-Ray (CXR)',       kind:'imaging' as const },
  ];
  setOrdersCatalog(prev => {
    const have = new Set(prev.map(o => o.code.toUpperCase()));
    return [
      ...prev,
      ...preset.filter(p => !have.has(p.code.toUpperCase()))
    ];
  });

  // Optional starter policies: OK for core, JUSTIFY for “sometimes”
  setPolicy?.(prev => ({
    ...prev,
    CBC:'ok', CMP:'ok', LACT:'ok', BCX:'ok', UA:'ok', CXR:'ok',
  }));

    // Optional starter gates (faculty can edit):
    // CBC 10m, CMP 12m, LACT 8m, UA 15m, CXR 10m (assets can be linked later)
    setGates(prev => ([
      ...prev,
      { id:`g_CBC_${Date.now()}`,  label:'CBC result after 10m',   orderCode:'CBC',  when:{type:'time', msFromStart: 10*60*1000}, reveals:[] },
      { id:`g_CMP_${Date.now()}`,  label:'CMP result after 12m',   orderCode:'CMP',  when:{type:'time', msFromStart: 12*60*1000}, reveals:[] },
      { id:`g_LACT_${Date.now()}`, label:'Lactate result after 8m',orderCode:'LACT', when:{type:'time', msFromStart:  8*60*1000}, reveals:[] },
      { id:`g_UA_${Date.now()}`,   label:'UA result after 15m',    orderCode:'UA',   when:{type:'time', msFromStart: 15*60*1000}, reveals:[] },
      { id:`g_CXR_${Date.now()}`,  label:'CXR result after 10m',   orderCode:'CXR',  when:{type:'time', msFromStart: 10*60*1000}, reveals:[] },
    ]));
  }


  // gates
  const [selectedOrder, setSelectedOrder] = useState(''); const [delayMin, setDelayMin] = useState('0'); const [revealIds, setRevealIds] = useState<string[]>([])
  const addGate = () => {
    if (!selectedOrder || revealIds.length===0) return
    const id = `g_${selectedOrder}_${Date.now()}`; const msFromStart = Math.round(parseFloat(delayMin||'0')*60*1000)
    const label = `${selectedOrder} result after ${parseFloat(delayMin||'0')}m`
    const g: Gate = { id, label, orderCode: selectedOrder, when:{type:'time', msFromStart}, reveals:[...revealIds] }
    setGates([...gates, g]); setSelectedOrder(''); setDelayMin('0'); setRevealIds([])
  }
  const removeGate = (gid:string) => setGates(gates.filter(g=>g.id!==gid))

  return (
    <div style={{ display:'grid', gap:20 }}>
      <div style={{ border:'1px solid #eee', borderRadius:8, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <h4 style={{ margin: 0 }}>Orders Catalog</h4>
          <button
          onClick={() => {
            const present = new Set(ordersCatalog.map(o => o.code.toUpperCase()));

            const filteredIndex = Object.fromEntries(
              Object.entries(CATALOG_INDEX).filter(([code]) => present.has(code))
            );

            const filteredPolicy: Record<string,'ok'|'justify'|'blocked'> = {};
            for (const key of present) filteredPolicy[key] = policy[key] || 'ok';

            const filteredRoles: Record<string, Role[]> = {};
            for (const key of present) if (allowedRoles[key]?.length) filteredRoles[key] = allowedRoles[key];

            socket.emit('control:orders:setCatalog', {
              caseId,
              catalog: ordersCatalog,
              index:   filteredIndex,
              policy:  filteredPolicy,
              roles:   filteredRoles,      // NEW
            });
          }}
          disabled={!ordersCatalog.length}
          style={{ padding:'6px 10px', border:'1px solid #0a7', borderRadius:8, color:'#0a7', opacity: ordersCatalog.length ? 1 : .5 }}
        >
          Push catalog to learners
        </button>

        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginBottom:10 }}>
          <button onClick={applyPresetSepsis}
                  style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>
            Apply Preset: Sepsis
          </button>
        </div>

        {/* Catalog picker */}
        <div style={{ marginBottom:10 }}>
          
          {/* Catalog picker (hierarchical) */}
          <div style={{ marginBottom:10 }}>
            {CATALOG_TREE.map(cat => (
              <details key={cat.category} open={cat.category==='Labs'}>
                <summary style={{ cursor:'pointer', fontWeight:700, margin:'6px 0' }}>
                  Add from catalog — {cat.category}
                </summary>
                <div style={{ display:'grid', gap:10 }}>
                  {cat.groups.map(group => (
                    <details key={`${cat.category}/${group.name}`}>
                      <summary style={{ cursor:'pointer', fontWeight:600 }}>{group.name}</summary>

                      {/* items */}
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:8 }}>
                        {group.items.map(it => (
                          <button
                            key={it.code}
                            onClick={() => addFromCatalog(it)}
                            title={`${it.code} • ${it.label}`}
                            style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}
                          >
                            {it.label}
                          </button>
                        ))}
                      </div>

                      {/* + Custom in {group} */}
                      <details style={{ marginTop:8 }}>
                        <summary style={{ cursor:'pointer', fontWeight:500 }}>+ Custom in {group.name}</summary>
                        <div style={{ display:'grid', gridTemplateColumns:'150px 1fr', gap:8, marginTop:8, alignItems:'center' }}>
                          <div style={{ opacity:.7 }}>Label (Code)</div>
                          <input placeholder="e.g., RBC" style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }} />
                          <div style={{ opacity:.7 }}>Name</div>
                          <input placeholder="e.g., Red Blood Cell Count" style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }} />
                          <div style={{ gridColumn:'1 / span 2', display:'flex', justifyContent:'flex-end', gap:8 }}>
                            <button
                              onClick={(ev) => {
                                const wrap = (ev.currentTarget as HTMLButtonElement).closest('details') as HTMLDetailsElement | null
                                const inputs = wrap ? wrap.querySelectorAll('input') : null
                                const rawCode = inputs?.[0]?.value?.trim() || ''
                                const rawName = inputs?.[1]?.value?.trim() || ''
                                if (!rawCode || !rawName) return alert('Enter both Label and Name')
                                addFromCatalog({ code: rawCode, label: rawName, kind: group.items[0]?.kind || (cat.category==='Imaging'?'imaging':'lab') })
                                inputs?.forEach(i => (i as HTMLInputElement).value = '')
                                if (wrap) wrap.open = false
                              }}
                              style={{ padding:'6px 10px', border:'1px solid #0a7', borderRadius:8, color:'#0a7' }}
                            >Save</button>
                          </div>
                        </div>
                      </details>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>

          {/* Note: Imaging picker removed here; use the hierarchical picker above which includes Imaging. */}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'120px 1fr 120px 80px', gap:8, marginBottom:8 }}>
          <input value={code} onChange={e=>setCode(e.target.value)} placeholder="Code (e.g., CBC)" style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name" style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
          <select value={kind} onChange={e=>setKind(e.target.value as any)} style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}>
            <option value="lab">lab</option><option value="imaging">imaging</option><option value="med">med</option><option value="other">other</option>
          </select>
          <button onClick={addOrder} style={{padding:'6px 10px', border:'1px solid #0a7', color:'#0a7', borderRadius:8}}>Add</button>
        </div>
        {ordersCatalog.length === 0 && <div style={{opacity:.6}}>No orders yet.</div>}
        {ordersCatalog.map((o, i)=>(
          <div key={`${o.code}-${o.name}-${i}`} style={{ display:'grid', gridTemplateColumns:'100px 1fr 100px 140px auto', gap:8, marginBottom:6 }}>
            <div style={{fontFamily:'ui-monospace'}}>{o.code}</div>
            <div>{o.name}</div>
            <div style={{opacity:.7}}>{o.kind}</div>
            {/* Policy selector */}
            <select
              value={policy[o.code.toUpperCase()] || 'ok'}
              onChange={e => {
                const key = o.code.toUpperCase();
                const val = e.target.value as 'ok'|'justify'|'blocked';
                setPolicy(prev => ({ ...prev, [key]: val }));
              }}
              title="Appropriateness"
              style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }}
            >
              <option value="ok">ok (green)</option>
              <option value="justify">justify (yellow)</option>
              <option value="blocked">blocked (red)</option>
            </select>
            <div style={{display:'flex', gap:6}}>
              <button onClick={()=>duplicateOrderAt(i)} style={{border:'1px solid #ccc', borderRadius:6, padding:'4px 8px'}}>Duplicate</button>
              <button onClick={()=>removeOrder(o.code)} style={{border:'1px solid #c33', color:'#c33', borderRadius:6, padding:'4px 8px'}}>✕</button>
            </div>
            {/* Roles visibility for this order */}
            <div style={{ gridColumn: '1 / -1', display:'flex', gap:6, flexWrap:'wrap' }}>
              {ROLES.map(r => {
                const codeKey = o.code.toUpperCase()
                const on = (allowedRoles[codeKey] || []).includes(r)
                return (
                  <button
                    key={`${o.code}-${r}`}
                    onClick={() => {
                      setAllowedRoles(prev => {
                        const curr = new Set((prev[codeKey] || []))
                        on ? curr.delete(r) : curr.add(r)
                        return { ...prev, [codeKey]: Array.from(curr) }
                      })
                    }}
                    title={`Visible to ${r}`}
                    style={{
                      border: '1px solid #ccc',
                      borderRadius: 999,
                      padding: '2px 8px',
                      fontSize: 12,
                      background: on ? 'rgba(25,118,210,.12)' : '#fff',
                      color: on ? '#1976d2' : 'inherit'
                    }}
                  >
                    {r}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ border:'1px solid #eee', borderRadius:8, padding:12 }}>
        <h4>Time Gates</h4>
        <div style={{ display:'grid', gridTemplateColumns:'160px 100px 1fr 100px', gap:8, marginBottom:10 }}>
          <select value={selectedOrder} onChange={e=>setSelectedOrder(e.target.value)} style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}>
            <option value="">Select order…</option>
            {ordersCatalog.map(o=><option key={o.code} value={o.code}>{o.code} — {o.name}</option>)}
          </select>
          <input value={delayMin} onChange={e=>setDelayMin(e.target.value)} placeholder="Delay (min)" style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}/>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {assets.map(a=>(
              <label key={a.id} style={{border:'1px solid #ddd', borderRadius:999, padding:'2px 8px'}}>
                <input
                  type="checkbox"
                  checked={revealIds.includes(a.id)}
                  onChange={e => {
                    setRevealIds(
                      e.target.checked
                        ? [...revealIds, a.id]
                        : revealIds.filter(x => x !== a.id)
                    );
                  }}
                />
                {a.title}
              </label>
            ))}
          </div>
          <button onClick={addGate} style={{padding:'6px 10px', border:'1px solid #0a7', borderRadius:8, color:'#0a7'}}>Add gate</button>
        </div>
        {gates.length===0 && <div style={{opacity:.6}}>No gates defined.</div>}
        {gates.map(g=>(
          <div key={g.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', border:'1px solid #eee', borderRadius:8, padding:'6px 10px', marginBottom:6}}>
            <div>{g.label} → reveals {g.reveals.length} asset(s)</div>
            <button onClick={()=>removeGate(g.id)} style={{border:'1px solid #c33', color:'#c33', borderRadius:6}}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ------- Poll creation modal -------
function PollModal({
  open, onClose, onCreate
}:{ open:boolean; onClose:()=>void; onCreate:(p:{question:string; options:string[]; multi:boolean; anonymous:boolean; durationSec?:number})=>void }) {
  const [question, setQuestion] = useState('')
  const [optText, setOptText]   = useState('') // comma- or newline-separated
  const [multi, setMulti]       = useState(false)
  const [anon, setAnon]         = useState(false)
  const [dur, setDur]           = useState<string>('') // seconds

  if (!open) return null
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'grid', placeItems:'center', zIndex:60}}>
      <div style={{ background:'#fff', width:'min(700px,95vw)', borderRadius:12, overflow:'hidden', boxShadow:'0 12px 30px rgba(0,0,0,.25)' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between' }}>
          <strong>Create Poll</strong>
          <button onClick={onClose} style={{ padding:'4px 8px' }}>✕</button>
        </div>
        <div style={{ padding:16, display:'grid', gap:12 }}>
          <div>
            <div style={{ fontWeight:600, marginBottom:6 }}>Question</div>
            <input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="e.g., Next best step?"
                   style={{ width:'100%', padding:'8px 10px', border:'1px solid #ccc', borderRadius:8 }}/>
          </div>
          <div>
            <div style={{ fontWeight:600, marginBottom:6 }}>Options</div>
            <textarea
              value={optText}
              onChange={e=>setOptText(e.target.value)}
              placeholder="Comma or newline separated"
              rows={4}
              style={{ width:'100%', padding:8, border:'1px solid #ccc', borderRadius:8 }}
            />
          </div>
          <div style={{ display:'flex', gap:16, alignItems:'center' }}>
            <label><input type="checkbox" checked={multi} onChange={e=>setMulti(e.target.checked)} /> Allow multiple</label>
            <label><input type="checkbox" checked={anon}  onChange={e=>setAnon(e.target.checked)}  /> Anonymous</label>
            <div style={{ marginLeft:'auto' }}>
              <label style={{ fontSize:12, opacity:.7 }}>Auto-close (sec):&nbsp;</label>
              <input value={dur} onChange={e=>setDur(e.target.value)} placeholder="e.g., 60"
                     style={{ width:100, padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }}/>
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <button onClick={onClose} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Cancel</button>
            <button
              onClick={()=>{
                const raw = optText.includes('\n') ? optText.split('\n') : optText.split(',')
                const options = raw.map(s=>s.trim()).filter(Boolean)
                if (!question.trim() || options.length<2) return alert('Enter a question and at least 2 options.')
                const durationSec = dur.trim() ? Math.max(0, parseInt(dur.trim(),10)) : undefined
                onCreate({ question: question.trim(), options, multi, anonymous: anon, durationSec })
                onClose()
              }}
              style={{ padding:'6px 10px', border:'1px solid #0a7', borderRadius:8, color:'#0a7' }}
            >Create</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Main component ----------
export default function Control() {
  // Orders & actions
  const [orders, setOrders] = useState<Array<Order & { learnerId?: string; color?: string; role?: string }>>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const builderFileRef = useRef<HTMLInputElement | null>(null)
  const [allowedRoles, setAllowedRoles] = useState<Record<string, Role[]>>({})
  const [query, setQuery] = useState('')
  const [queue, setQueue] = useState<Asset[]>([])
  const [caseId, setCaseId] = useState<string>(() => localStorage.getItem('caseId') || '')
  const [cases, setCases] = useState<Array<{ id: string; title: string }>>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [pollOpen, setPollOpen] = useState(false)
  const [labOpen, setLabOpen] = useState(false)
  // Assets library (all cases)
  const [allAssets, setAllAssets] = useState<LibraryAsset[]>([])
  const [assetsView, setAssetsView] = useState<'case'|'all'>('case')
  const [assetsTypeFilter, setAssetsTypeFilter] = useState<'ALL' | Asset['type']>('ALL')
  

  // Toasts
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; kind: 'success'|'info'|'error' }>>([])
  const notify = (text: string, kind: 'success'|'info'|'error' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
    setToasts(prev => [...prev, { id, text, kind }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500)
  }


  // History (now includes 'order' lines we add in onOrder)
  type HistoryKind = 'show' | 'clear' | 'pearl' | 'order' | 'start' | 'pause' | 'resume' | 'stop'
  type HistoryItem = { when: number; kind: HistoryKind; title?: string; by?: string; color?: string; role?: string; code?: string }
  const [history, setHistory] = useState<HistoryItem[]>([])

  // Stage state
  type StageItem = { asset: Asset; at: number }
  const [stageShown, setStageShown] = useState<StageItem[]>([])
  const [stageMinimized, setStageMinimized] = useState<StageItem[]>([])
  // Focus the Stage viewer on a specific asset/time
  const jumpToStage = (item: StageItem) => {
    socket.emit('control:stage:select', { caseId, assetId: item.asset.id, at: item.at })
}

  // Learners
  type LearnerBrief = { id: string; name: string; color?: string }
  const [learners, setLearners] = useState<LearnerBrief[]>([])
  const [msgTarget, setMsgTarget] = useState<string>('ALL')
  
  // Learners presence (live updates)
  useEffect(() => {
    type LearnerBrief = { id: string; name: string; color?: string }

    const onList = (payload: { caseId?: string; learners: LearnerBrief[] }) => {
      // Only adopt list for the active case
      const cid = payload?.caseId || 'case-anemia'
  console.debug('[presence] control:learner:list received cid', cid, 'active', (caseId||'case-anemia'), 'len', payload.learners?.length)
      if ((caseId || 'case-anemia') !== cid) return
      setLearners(payload.learners || [])
    }

    const onJoin = (payload: { caseId?: string } & LearnerBrief) => {
      const cid = payload?.caseId || 'case-anemia'
  console.debug('[presence] control:learner:joined received cid', cid, 'active', (caseId||'case-anemia'), 'id', payload.id)
      if ((caseId || 'case-anemia') !== cid) return
      const { id, name, color } = payload
      setLearners(prev => (prev.some(x => x.id === id) ? prev : [{ id, name, color }, ...prev]))
    }

    const onLeft = (payload: { caseId?: string; id: string }) => {
      const cid = payload?.caseId || 'case-anemia'
  console.debug('[presence] control:learner:left received cid', cid, 'active', (caseId||'case-anemia'), 'id', payload.id)
      if ((caseId || 'case-anemia') !== cid) return
      setLearners(prev => prev.filter(x => x.id !== payload.id))
    }

    socket.on('control:learner:list', onList)
    socket.on('control:learner:joined', onJoin)
    socket.on('control:learner:left', onLeft)
    console.debug('[presence] subscribed for case', (caseId||'case-anemia'))

    return () => {
      socket.off('control:learner:list', onList)
      socket.off('control:learner:joined', onJoin)
      socket.off('control:learner:left', onLeft)
      console.debug('[presence] unsubscribed for case', (caseId||'case-anemia'))
    }
  }, [caseId])

  // Pearls
  type PearlRow = { id: string; text: string; tag?: string; at: number; by?: string; linkedAssetId?: string; hidden?: boolean }
  const [pearls, setPearls] = useState<PearlRow[]>([])

  // Case info
  const [summary, setSummary] = useState(''); const [hpi, setHpi] = useState(''); const [pmh, setPmh] = useState<string[]>([]); const [meds, setMeds] = useState<string[]>([]); const [allergies, setAllergies] = useState<string[]>([])
  const [vitals, setVitals] = useState<Vital[]>([])
  const [ordersCatalog, setOrdersCatalog] = useState<Orderable[]>([])
  const [gates, setGates] = useState<Gate[]>([])
  const [builderTab, setBuilderTab] = useState<'info'|'assets'|'orders'>('info')
  const [editOpen, setEditOpen] = useState(false)
  const [policy, setPolicy] = useState<Record<string, 'ok'|'justify'|'blocked'>>({})

  // UI refs & panels
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [openHistory, setOpenHistory] = usePanelState('ui.openHistory'); 
  const [openAssets, setOpenAssets] = usePanelState('ui.openAssets'); 
  const [openStage, setOpenStage] = usePanelState('ui.openStage'); 
  const [openQueue, setOpenQueue] = usePanelState('ui.openQueue')
  const [openLearnerRequests, setOpenLearnerRequests] = usePanelState('ui.openLearnerRequests'); 
  const [openLearnerQuestions, setOpenLearnerQuestions] = usePanelState('ui.openLearnerQuestions'); 
  const [openPendingOrders, setOpenPendingOrders] = usePanelState('ui.openPendingOrders'); 
  const [openPearls, setOpenPearls] = usePanelState('ui.openPearls'); 
  const [openLearners, setOpenLearners] = usePanelState('ui.openLearners'); 
  const [openTimeline, setOpenTimeline] = usePanelState('ui.openTimeline')
  const [openReflections, setOpenReflections] = usePanelState('ui.openReflections')
  const [openPollsMCQs, setOpenPollsMCQs] = usePanelState('ui.openPollsMCQs')
  const [openOrders, setOpenOrders] = useState(true)

  // Case timer
  const [startedAt, setStartedAt] = useState<number|null>(null); const [paused, setPaused] = useState(false); const [elapsed, setElapsed] = useState('0:00')

  // Requests / Questions (not persisted yet)
  const [requests, setRequests] = useState<Array<{kind:string; detail?:string; by:string; at:number; learnerId?:string; color?: string; role?: string}>>([])
  const [questions, setQuestions] = useState<Array<{text:string; by:string; at:number; learnerId?:string; color?: string; role?: string}>>([])
  const [stageMessages, setStageMessages] = useState<Array<{ at:number; text:string; kind:'stage'|'announce' }>>([])


  // Reflections
  const [reflections, setReflections] = useState<Array<{ by: string; role?: string; learnerId?: string; caseId?: string; at: number;
    good?: string; bad?: string; improve?: string }>>([])

  type SaveState = 'idle' | 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState<SaveState>('idle')

  // ----- Polls ------

  type PollTally = { id:string; question:string; options:string[]; counts:number[]; total:number; closed?:boolean }
    const [polls, setPolls] = useState<PollTally[]>([])

  // ---------- Effects ----------
  useEffect(() => { listCases().then(setCases).catch(console.error) }, [])
  useEffect(() => { localStorage.setItem('caseId', caseId) }, [caseId])

  // Load case + session
  useEffect(() => {
  if (!caseId) return
    fetch(`/api/case/${caseId}`).then(r => r.json()).then(data => {
      setAssets(data.assets || [])
      setOrdersCatalog(Array.isArray(data.ordersCatalog) ? data.ordersCatalog : [])
      setGates(Array.isArray(data.gates) ? data.gates : [])
      setSummary(data.summary || '')
      setHpi(data.history?.hpi || '')
      setPmh(Array.isArray(data.history?.pmh) ? data.history.pmh : [])
      setMeds(Array.isArray(data.history?.meds) ? data.history.meds : [])
      setAllergies(Array.isArray(data.history?.allergies) ? data.history.allergies : [])
      setVitals(Array.isArray(data.vitals) ? data.vitals : [])
    }).catch(err => console.error('Failed to load case:', err))

    fetch(`/api/session/${caseId}`).then(r => r.json()).then(s => {
      setHistory(s.history || [])
      setQueue(s.queue || [])
      setStageShown(s.stage || [])
      setStageMinimized(s.minimized || [])
      setLearners(s.learners || [])
      setPearls((s.pearls || []).filter((p: any) => !p.hidden))
      setStartedAt(s.startedAt || null)
      setPaused(!!s.pausedAt)
    }).catch(()=>{})
  }, [caseId])

  // Load assets library on demand when toggled to "all"
  useEffect(() => {
    if (assetsView !== 'all') return
    if (allAssets.length) return
    listAllAssets().then(setAllAssets).catch(()=>{})
  }, [assetsView, allAssets.length])

    // Recall case when none selected and on refresh/blips 
  useEffect(() => {
    if (!caseId) return            // <-- skip network if nothing selected
    fetch(`/api/case/${caseId}`).then(/* ... */)
    fetch(`/api/session/${caseId}`).then(/* ... */)
  }, [caseId])

  // Orders
  useEffect(() => {
    const onOrder = (o: Order & { learnerId?: string; color?: string; role?: string }) => {
      setOrders(prev => [o, ...prev])
      setHistory(prev => [{ when: o.at, kind: 'order', code: o.code, by: o.by, color: o.color, role: o.role }, ...prev])
    }
    socket.on('control:order', onOrder)
    return () => { socket.off('control:order', onOrder) }
  }, [])

  // Stage show/clear
  useEffect(() => {
    const onShow = (payload: { asset: Asset; at: number }) => {
      setHistory(prev => [{ when: payload.at, kind: 'show', title: payload.asset.title }, ...prev])
      setStageShown(prev => [...prev, { asset: payload.asset, at: payload.at }])
    }
    const onClear = () => {
      setHistory(prev => [{ when: Date.now(), kind: 'clear' }, ...prev])
      setStageShown([]); setStageMinimized([])
    }
    socket.on('stage:show', onShow); socket.on('stage:clear', onClear)
    return () => { socket.off('stage:show', onShow); socket.off('stage:clear', onClear) }
  }, [])

  // Min/restore broadcast to Control
  useEffect(() => {
    const onMin = ({ item }: { item: StageItem }) => { setStageShown(prev => prev.filter(x => !(x.asset.id === item.asset.id && x.at === item.at))); setStageMinimized(prev => [item, ...prev]) }
    const onRes = ({ item }: { item: StageItem }) => { setStageMinimized(prev => prev.filter(x => !(x.asset.id === item.asset.id && x.at === item.at))); setStageShown(prev => [...prev, item]) }
    socket.on('control:stage:minimized', onMin); socket.on('control:stage:restored', onRes)
    // Stage -> Control messages (from Stage operator)
    const onStageMsg = (m: any) => {
      setHistory(prev => [{ when: m.at || Date.now(), kind:'show', title:`Stage: ${m.text}` }, ...prev])
  setStageMessages(prev => [{ at: (m.at || Date.now()) as number, text: String(m.text||'').trim(), kind:'stage' as const }, ...prev].slice(0,100))
    }
    const onStageAnn = (m: any) => {
  setStageMessages(prev => [{ at: (m.at || Date.now()) as number, text: String(m.text||'').trim(), kind:'announce' as const }, ...prev].slice(0,100))
    }
    // @ts-ignore
    socket.on('control:stage:message', onStageMsg)
    // @ts-ignore also capture announcements for transcript
    socket.on('stage:announce', onStageAnn)
    return () => {
      socket.off('control:stage:minimized', onMin); socket.off('control:stage:restored', onRes)
      // @ts-ignore
      socket.off('control:stage:message', onStageMsg)
      // @ts-ignore
      socket.off('stage:announce', onStageAnn)
    }
  }, [])

  // Requests & questions
  useEffect(() => {
    const onReq = (r:any) => setRequests(prev => [r, ...prev])
    const onQ   = (q:any) => setQuestions(prev => [q, ...prev])
    socket.on('control:request', onReq); socket.on('control:question', onQ)
    return () => { socket.off('control:request', onReq); socket.off('control:question', onQ) }
  }, [])

  // Pearls
  useEffect(() => {
    const onPearl = (p: Pearl) => { setPearls(prev => prev.some(x => x.id === p.id) ? prev : [p, ...prev]); setHistory(prev => [{ when: p.at, kind: 'pearl', title: p.tag ? `Pearl (${p.tag})` : 'Pearl' }, ...prev]) }
    const onPearlEdit = (p: Pearl) => setPearls(prev => prev.map(x => x.id === p.id ? p : x))
    const onPearlHide = ({ id }: { id: string }) => setPearls(prev => prev.filter(x => x.id !== id))
    socket.on('control:pearl', onPearl); socket.on('control:pearlUpdated', onPearlEdit); socket.on('control:pearlHidden', onPearlHide)
    return () => { socket.off('control:pearl', onPearl); socket.off('control:pearlUpdated', onPearlEdit); socket.off('control:pearlHidden', onPearlHide) }
  }, [])

  // Case timer events
  useEffect(() => {
    const onStarted = ({ startedAt }: { caseId:string; startedAt:number }) => { setStartedAt(startedAt); setPaused(false) }
    const onPaused  = () => setPaused(true)
    const onResumed = () => setPaused(false)
    const onStopped = () => { setStartedAt(null); setPaused(false); setElapsed('0:00') }

    // @ts-ignore
    socket.on('control:case:started', onStarted)
    // @ts-ignore
    socket.on('control:case:paused',  onPaused)
    // @ts-ignore
    socket.on('control:case:resumed', onResumed)
    // @ts-ignore
    socket.on('control:case:stopped', onStopped)

    return () => {
      // @ts-ignore
      socket.off('control:case:started', onStarted)
      // @ts-ignore
      socket.off('control:case:paused',  onPaused)
      // @ts-ignore
      socket.off('control:case:resumed', onResumed)
      // @ts-ignore
      socket.off('control:case:stopped', onStopped)
    }
  }, [])

  useEffect(() => {
    const onReflection = (p: any) => setReflections(prev => [p, ...prev])
    // @ts-ignore
    socket.on('control:reflection', onReflection)
    return () => {
    // @ts-ignore
    socket.off('control:reflection', onReflection)
    }
  }, [])

  // Ask server for current learners list on connect and when case changes
  useEffect(() => {
    const sync = () => {
  socket.emit('control:hello', { caseId: caseId || 'case-anemia' })
    }
    if (socket.connected) sync()
    const onConnect = () => sync()
    socket.on('connect', onConnect)
    return () => { socket.off('connect', onConnect) }
  }, [caseId])

  useEffect(() => {
    if (!startedAt || paused) return
    const id = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt)/1000)
      const m = Math.floor(secs/60), s = secs % 60
      setElapsed(`${m}:${s.toString().padStart(2,'0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [startedAt, paused])

  // Autosave full case (debounced)
  useEffect(() => {
  if (!caseId) { setSaveState('idle'); return }
    setSaveState('saving')
    const id = setTimeout(async () => {
      try {
        const caseJson = { id: caseId, title: (cases.find(c => c.id === caseId)?.title) || caseId, summary, history: { hpi, pmh, meds, allergies }, vitals, assets, ordersCatalog, gates }
        await updateCase(caseId, caseJson)
        setSaveState('saved'); setTimeout(() => setSaveState('idle'), 1200)
      } catch (e) { console.error('Autosave failed:', e); setSaveState('error') }
    }, 600)
    return () => clearTimeout(id)
  }, [summary, hpi, pmh, meds, allergies, vitals, assets, ordersCatalog, gates, caseId, cases])

  // Persist queue to session (debounced)
  useEffect(() => {
  if (!caseId) return
    const id = setTimeout(async () => {
      try {
        await fetch(`/api/session/${caseId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queue }) })
      } catch (e) { console.error('Save queue failed:', e) }
    }, 400)
    return () => clearTimeout(id)
  }, [queue, caseId])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (e as any).isComposing) return
      if (e.key.toLowerCase() === 'h') { e.preventDefault(); setOpenHistory(v => !v) }
      if (e.key.toLowerCase() === 'a') { e.preventDefault(); setOpenAssets(v => !v) }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); setOpenStage(v => !v) }
      if (e.key.toLowerCase() === 't') { e.preventDefault(); setOpenTimeline(v => !v) }
      if (e.key === ' ') { e.preventDefault(); revealNext() }
      if (e.key.toLowerCase() === 'u') { e.preventDefault(); fileInputRef.current?.click() }
  // '/' search shortcut removed with search UI
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onUpdate = (p: PollTally) => {
      setPolls(prev => {
        const i = prev.findIndex(x => x.id === p.id)
        if (i >= 0) { const copy=[...prev]; copy[i] = p; return copy }
        return [p, ...prev]
      })
    }
    const onClosed = ({ id }:{ id:string }) => setPolls(prev => prev.map(x => x.id === id ? { ...x, closed:true } : x))

    // @ts-ignore (add to socket types if desired)
    socket.on('control:poll:update', onUpdate)
    // @ts-ignore
    socket.on('control:poll:closed', onClosed)
    return () => {
      // @ts-ignore
      socket.off('control:poll:update', onUpdate)
      // @ts-ignore
      socket.off('control:poll:closed', onClosed)
    }
  }, [])

  // ---------- Derived ----------
  const filtered = useMemo(() => {
    if (!query.trim()) return assets
    const q = query.toLowerCase()
    return assets.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q) ||
      (a.content || '').toLowerCase().includes(q)
    )
  }, [assets, query])

  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = assetsTypeFilter === 'ALL' ? allAssets : allAssets.filter(a => a.type === assetsTypeFilter)
    if (!q) return pool
    return pool.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q) ||
      (a.content || '').toLowerCase().includes(q)
    )
  }, [allAssets, assetsTypeFilter, query])

  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = []
    for (const h of history) {
      if (h.kind === 'start')  events.push({ when: h.when, type:'case-start',  label:'Case started' })
      else if (h.kind === 'pause')  events.push({ when: h.when, type:'case-pause',  label:'Case paused' })
      else if (h.kind === 'resume') events.push({ when: h.when, type:'case-resume', label:'Case resumed' })
      else if (h.kind === 'stop')   events.push({ when: h.when, type:'case-stop',   label:'Case stopped' })
      else if (h.kind === 'clear')  events.push({ when: h.when, type:'stage-clear', label:'Stage cleared' })
      else if (h.kind === 'pearl')  events.push({ when: h.when, type:'pearl',       label: h.title || 'Pearl' })
      else if (h.kind === 'order')  events.push({ when: h.when, type:'order',       label:`Order: ${h.code}`, by: h.by, color: h.color, role: h.role, code: h.code })
      else if (h.kind === 'show')   events.push({ when: h.when, type:'stage-show',  label:`Shown: ${h.title}` })
    }
    for (const r of requests) events.push({ when: r.at, type:'request',  label:`Request: ${r.kind}${r.detail?` • ${r.detail}`:''}`, by:r.by, color:r.color, role:r.role })
    for (const q of questions) events.push({ when: q.at, type:'question', label:`Question`, by:q.by, color:q.color, role:q.role })
    events.sort((a,b) => b.when - a.when)
    return events
  }, [history, requests, questions])

  const [fltType, setFltType] = useState<'all'|'orders'|'requests'|'questions'|'pearls'|'stage'|'case'>('all')
  const [fltLearner, setFltLearner] = useState<string>('ALL')
  const [fltText, setFltText] = useState<string>('')

  const filteredTimeline = useMemo(() => {
    return timeline.filter(ev => {
      if (fltType !== 'all') {
        if (fltType === 'orders'   && ev.type !== 'order') return false
        if (fltType === 'requests' && ev.type !== 'request') return false
        if (fltType === 'questions'&& ev.type !== 'question') return false
        if (fltType === 'pearls'   && ev.type !== 'pearl') return false
        if (fltType === 'stage'    && !(ev.type === 'stage-show' || ev.type === 'stage-clear')) return false
        if (fltType === 'case'     && !(ev.type.startsWith('case-'))) return false
      }
      if (fltLearner !== 'ALL' && ev.by && ev.by !== fltLearner) return false
      if (fltText.trim()) {
        const q = fltText.toLowerCase()
        const hit = (ev.label || '').toLowerCase().includes(q) || (ev.by || '').toLowerCase().includes(q) || (ev.role || '').toLowerCase().includes(q) || (ev.code || '').toLowerCase().includes(q)
        if (!hit) return false
      }
      return true
    })
  }, [timeline, fltType, fltLearner, fltText])



  // ---------- Actions ----------
  const dropToStage = (a: Asset) => socket.emit('control:drop', { asset: a, at: Date.now(), caseId })
  const clearStage  = () => socket.emit('control:stage:clear', { caseId })
  const scheduleDrop = (a: Asset, minutes: number) => {
    const when = Date.now() + minutes*60*1000
    const key = `sched-${a.id}-${when}`
    socket.emit('control:scheduleDrop', { key, asset: a, when, caseId })
  }
  const revealResult = (o: Order) => {
    const upper = o.code.toUpperCase()
    const match = assets.find(a => upper === 'CBC' && a.title.toUpperCase().includes('CBC'))
              || assets.find(a => upper === 'CXR' && a.title.toUpperCase().includes('CHEST'))
              || assets.find(a => a.title.toUpperCase().includes(upper))
    const asset = match || { id:`note-${Date.now()}`, title:`Order: ${upper}`, type:'note', content:'Result not modeled yet.' }
    dropToStage(asset)
    setOrders(prev => prev.filter(x => x !== o))
  }
  const addToQueue = (a: Asset) => setQueue(prev => [a, ...prev])
  const removeFromQueue = (idx: number) => setQueue(prev => prev.filter((_, i) => i !== idx))
  const revealNext = () => setQueue(prev => { if (!prev.length) return prev; const [head,...rest]=prev; dropToStage(head); return rest })

  const uploadOne = async (file: File): Promise<Asset> => {
    // try server upload first
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      if (r.ok) {
        const j = await r.json()
        const url =
          j.url || j.contentUrl || j.path || j.file?.url || j.files?.[0]?.url || ''
        const type = guessType(file.type)
        const title = file.name
        if (type === 'image' || type === 'pdf' || type === 'video') {
          return { id: newId(type), title, type, contentUrl: url || URL.createObjectURL(file) }
        }
        return { id: newId('note'), title, type: 'note', content: title }
      }
    } catch {
      // fall through to local URL fallback
    }
    // fallback: local object URL (not persisted across refresh)
    const type = guessType(file.type)
    const title = file.name
    if (type === 'image' || type === 'pdf' || type === 'video') {
      return { id: newId(type), title, type, contentUrl: URL.createObjectURL(file) }
    }
    return { id: newId('note'), title, type: 'note', content: title }
  }

  const uploadFiles = async (files: FileList): Promise<Asset[]> => {
    const out: Asset[] = []
    for (const f of Array.from(files)) out.push(await uploadOne(f))
    return out
  }

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files
  if (!files || files.length === 0) return
  const newAssets = await uploadFiles(files)
  // add to assets list
  setAssets(prev => [...newAssets, ...prev])
  // auto-drop each to stage
  newAssets.forEach(a => dropToStage(a))
  // reset file input
  e.target.value = ''
  }

  const onDragOverZone = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDropZone = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return
    const newAssets = await uploadFiles(files)
    setAssets(prev => [...newAssets, ...prev])
    newAssets.forEach(a => dropToStage(a))
  }
  
    // ---------- Render ----------
  return (
    <div style={{ fontFamily: 'system-ui', padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <CaseWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onCreated={async (newId) => {
          // refresh list & select new case
          const all = await listCases()
          setCases(all)
          setCaseId(newId)
          // flow into Direct Edit after wizard completes
          setEditOpen(true)
        }}
      />
      <h2>Control Console</h2>
  {/* Toolbar */}
  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap:'wrap' }}>
        <label>Case:&nbsp;</label>
        <select value={caseId} onChange={e => setCaseId(e.target.value)} style={{ padding: '6px 8px' }}>
          <option value="">Select case…</option>    {/* NEW placeholder */}
          {cases.map(c => <option key={c.id} value={c.id}>{c.title} ({c.id})</option>)}
        </select>
  <button onClick={() => setWizardOpen(true)} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 8 }}>New/Edit Case</button>
  <button onClick={() => setEditOpen(true)} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 8 }}>Direct Edit</button>
        <button onClick={async () => { const title = prompt('Edit title:', (cases.find(c => c.id === caseId)?.title) || caseId); if (!title) return; await updateCase(caseId, { id: caseId, title, assets }); setCases(await listCases()); alert('Saved.') }} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 8 }}>Save</button>
        <button onClick={async () => { if (!confirm(`Delete case ${caseId}?`)) return; await deleteCaseApi(caseId); const all = await listCases(); setCases(all); const next = all[0]?.id || ''; if (next) setCaseId(next); setAssets([]) }} style={{ padding: '6px 10px', border: '1px solid #c33', color:'#c33', borderRadius: 8 }}>Delete</button>
        <button onClick={async () => { const copyId = prompt('Duplicate to id:', `${caseId}-copy`); if (!copyId) return; const data = await fetchCase(caseId); data.id = copyId; await createCase(data); setCases(await listCases()); setCaseId(copyId) }} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 8 }}>Duplicate</button>
        <button onClick={async () => { const data = await fetchCase(caseId); const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${caseId}.json`; a.click(); URL.revokeObjectURL(url) }} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 8 }}>Export JSON</button>
        <button onClick={() => window.open(`/api/session/${caseId}/assess.csv`, '_blank')} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Export Assessment CSV</button>

        <span style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #ddd',
                       background: saveState === 'saving' ? '#fff8e1' : saveState === 'saved' ? '#e8f5e9' : saveState === 'error' ? '#ffebee' : '#f5f5f5', color: '#555' }}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save error' : 'Autosave'}
        </span>
      </div>
      {/* Case controls on their own line */}
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
        <button onClick={() => socket.emit('control:case:start', { caseId })} disabled={!!startedAt} style={{ padding:'6px 10px', border:'1px solid #0a7', borderRadius:8, opacity:startedAt?0.5:1 }}>▶ Start</button>
        <button onClick={() => socket.emit(paused ? 'control:case:resume' : 'control:case:pause', { caseId })} disabled={!startedAt} style={{ padding:'6px 10px', border:'1px solid #ffa000', borderRadius:8, opacity:!startedAt?0.5:1 }}>{paused ? '⏵ Resume' : '⏸ Pause'}</button>
        <button onClick={() => socket.emit('control:case:stop', { caseId })} disabled={!startedAt} style={{ padding:'6px 10px', border:'1px solid #c33', color:'#c33', borderRadius:8, opacity:!startedAt?0.5:1 }}>■ Stop</button>
        {startedAt && <span style={{fontWeight:600}}>⏱ {elapsed}{paused ? ' (paused)' : ''}</span>}
      </div>

  {/* Upload shortcut removed; handled in Assets header */}

      {/* Drop Zone */}
      <div onDragOver={onDragOverZone} onDrop={onDropZone} style={{ border:'2px dashed #bbb', borderRadius: 12, padding: 16, margin: '0 0 20px', textAlign: 'center', background: '#fafafa' }}>
        Drag files here to upload & drop to Stage (images / PDFs / videos)
      </div>

      {/* Learners */}
      <Section 
        title="Learners" 
        open={openLearners} 
        onToggle={() => setOpenLearners(v => !v)} indicator={{ count: learners.length, color: '#2196f3' }}>
        {learners.length === 0 && <div style={{ opacity:.6 }}>No learners connected.</div>}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
          <button onClick={() => setMsgTarget('ALL')} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8, background: msgTarget==='ALL' ? '#eef' : '#fff' }}>All Learners</button>
          {learners.map(l => (
            <button key={l.id} onClick={() => setMsgTarget(l.id)} title={l.id}
              style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8, background: msgTarget===l.id ? 'rgba(0,0,255,.08)' : '#fff', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: l.color || '#888' }} />
              {l.name}
            </button>
          ))}
        </div>
        <div style={{ marginTop:8, display:'flex', gap:8 }}>
          <input id="ctrl-msg" placeholder={msgTarget==='ALL' ? 'Message all learners…' : 'Message selected learner…'} style={{ flex:1, padding:'8px 10px', border:'1px solid #ccc', borderRadius:8 }} />
          <button onClick={() => { const el = document.getElementById('ctrl-msg') as HTMLInputElement | null; const text = (el?.value || '').trim(); if (!text) return; socket.emit('control:message', { text, at: Date.now(), caseId, targetId: msgTarget==='ALL' ? undefined : msgTarget }); if (el) el.value = '' }} style={{ padding:'6px 12px', border:'1px solid #ccc', borderRadius:8 }}>Send</button>
        </div>
      </Section>

  {/* Stage Status */}
      <Section 
        title="Stage Status" 
        open={openStage} 
        onToggle={() => setOpenStage(v => !v)}
        right={<div style={{ display:'flex', gap:8 }}>
          <button onClick={clearStage} style={{ padding: '6px 10px', border: '1px solid #c33', color:'#c33', borderRadius:8 }}>Clear Stage</button>
          <button onClick={() => socket.emit('control:stage:reset', { caseId })} style={{ padding: '6px 10px', border: '1px solid #c33', color:'#c33', borderRadius:8 }}>Reset Stage</button>
        </div>}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Showing <span style={{ opacity: .7 }}>({stageShown.length})</span></div>
          {stageShown.length === 0 && <div style={{ opacity: .6 }}>Nothing on stage.</div>}
          <div style={{ display: 'grid', gap: 6 }}>
            {stageShown.map((item, i) => (
              <div key={`${item.asset.id}-${item.at}-${i}`} style={{ border:'1px solid #eee', borderRadius:8, padding:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.asset.title}</div>
                  <div style={{ fontSize:12, opacity:.7 }}>{new Date(item.at).toLocaleTimeString()} • {item.asset.type}{item.asset.contentUrl ? ' • file' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Minimized <span style={{ opacity: .7 }}>({stageMinimized.length})</span></div>
          {stageMinimized.length === 0 && <div style={{ opacity: .6 }}>None minimized.</div>}
          <div style={{ display: 'grid', gap: 6 }}>
            {stageMinimized.map((item, i) => (
              <div key={`${item.asset.id}-min-${item.at}-${i}`} style={{ border:'1px solid #eee', borderRadius:8, padding:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.asset.title}</div>
                  <div style={{ fontSize:12, opacity:.7 }}>{new Date(item.at).toLocaleTimeString()} • {item.asset.type}{item.asset.contentUrl ? ' • file' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop:10 }}>
          <div style={{ fontWeight:600, marginBottom:6 }}>Messaging</div>
          <div style={{ display:'flex', gap:6, marginBottom:6 }}>
            <select id="ctrl-msg-target" defaultValue="ALL" style={{ padding:'8px 10px', border:'1px solid #ccc', borderRadius:8 }}>
              <option value="ALL">All Learners</option>
              <option value="STAGE">Stage Only</option>
              {learners.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <input id="ctrl-unified-msg" placeholder="Type message…" style={{ flex:1, padding:'8px 10px', border:'1px solid #ccc', borderRadius:8 }} />
            <button
              onClick={() => {
                const targetSel = document.getElementById('ctrl-msg-target') as HTMLSelectElement | null
                const msgEl = document.getElementById('ctrl-unified-msg') as HTMLInputElement | null
                const text = (msgEl?.value||'').trim(); if (!text) return
                const target = targetSel?.value || 'ALL'
                if (target === 'STAGE') {
                  socket.emit('control:stage:broadcast', { caseId, text })
                } else if (target === 'ALL') {
                  socket.emit('control:message', { caseId, text })
                } else {
                  socket.emit('control:message', { caseId, text, targetId: target })
                }
                if (msgEl) msgEl.value=''
              }}
              style={{ padding:'8px 16px', border:'1px solid #ccc', borderRadius:8 }}>Send</button>
          </div>
          <div style={{ fontSize:12, opacity:.7 }}>Targets: All Learners (chat), Stage Only (stage banner), or individual learner.</div>
        </div>
      </Section>

      {/* Queue */}
      <Section 
        title="Queue" 
        open={openQueue} 
        onToggle={() => setOpenQueue(v => !v)} indicator={{ count: queue.length, color: '#70f5ee' }}>
        {queue.length === 0 && <div style={{ opacity: 0.7 }}>Queue is empty.</div>}
        <div style={{ display: 'grid', gap: 8 }}>
          {queue.map((a, i) => {
            const isNext = i === 0; const hue = typeHue(a.type)
            return (
              <div key={`${a.id}-${i}`} style={{ border: `2px solid ${isNext ? hue : '#eee'}`, background: isNext ? 'rgba(0,0,0,0.02)' : '#fff', boxShadow: isNext ? '0 2px 10px rgba(0,0,0,.05)' : 'none', borderRadius: 10, padding: 10, display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 42, textAlign: 'center' }}>
                  <div style={{ display: 'inline-block', minWidth: 32, padding: '2px 8px', borderRadius: 999, border: `1px solid ${isNext ? hue : '#ccc'}`, color: isNext ? '#fff' : '#555', background: isNext ? hue : '#f5f5f5', fontSize: 12, fontWeight: 700 }}>{isNext ? 'NEXT' : i + 1}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div style={{ fontSize: 12, opacity: .7 }}><span style={{ color: hue }}>{a.type}</span>{a.contentUrl ? ' • file' : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {(!isNext) && <button title="Move to top" onClick={() => { setQueue(prev => { const copy = [...prev]; const [item] = copy.splice(i, 1); return [item, ...copy] }) }} style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 8 }}>Top</button>}
                  <button onClick={() => dropToStage(a)} style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: 8 }}>Drop</button>
                  <button onClick={() => scheduleDrop(a, 1)} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 8 }}>+1m</button>
                  <button onClick={() => scheduleDrop(a, 5)} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 8 }}>+5m</button>
                  <button onClick={() => setQueue(prev => prev.filter((_, idx) => idx !== i))} title="Remove from queue" style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 8 }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Assets */}
      <Section 
        title="Assets" 
        open={openAssets} 
        onToggle={() => setOpenAssets(v => !v)}
        right={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input ref={fileInputRef} type="file" multiple onChange={onPickFiles} style={{ display: 'none' }} />
            <button onClick={() => { const el = fileInputRef.current; if (el){ el.accept=''; el.click() } }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8, display:'none' }}>Upload</button>
            <button onClick={() => { const title = prompt('Text asset title (e.g., HPI):'); if (!title) return; const content = prompt('Content:', '') || ''; setAssets(prev => [{ id:newId('note'), title, type:'note', content }, ...prev]) }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Add Text</button>
            <button onClick={() => setLabOpen(true)} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Add Lab Panel</button>
            <button onClick={() => { const el = fileInputRef.current; if (el){ el.accept='image/*'; el.click() } }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Add Image</button>
            <button onClick={() => { const el = fileInputRef.current; if (el){ el.accept='video/*'; el.click() } }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Add Video</button>
            <button onClick={async () => {
              setOpenAssets(true)
              setAssetsView('all')
              const list = await listAllAssets()
              setAllAssets(list)
              notify(`Library: ${list.length} asset(s)`, 'info')
            }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>View Library</button>
          </div>
        }
        >
        {/* View toggle and filters */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <div style={{ border:'1px solid #ddd', borderRadius:999, overflow:'hidden' }}>
            <button onClick={()=>setAssetsView('case')} style={{ padding:'6px 10px', border:'none', background: assetsView==='case' ? '#eef' : '#fff' }}>Case</button>
            <button onClick={()=>{ setAssetsView('all'); listAllAssets().then(ls=>{ setAllAssets(ls); notify(`Library: ${ls.length} asset(s)`, 'info') }).catch(()=>{}) }} style={{ padding:'6px 10px', border:'none', background: assetsView==='all' ? '#eef' : '#fff' }}>All</button>
          </div>
          {assetsView==='all' && (
            <>
              <span style={{ opacity:.7, marginLeft:6 }}>Type:</span>
              <select value={assetsTypeFilter} onChange={e=>setAssetsTypeFilter(e.target.value as any)} style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }}>
                <option value="ALL">All</option>
                <option value="lab">lab</option>
                <option value="image">image</option>
                <option value="pdf">pdf</option>
                <option value="video">video</option>
                <option value="note">note</option>
              </select>
              <button onClick={()=>listAllAssets().then(ls=>{ setAllAssets(ls); notify(`Library refreshed: ${ls.length} asset(s)`, 'info') })} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Refresh</button>
            </>
          )}
        </div>
  {/* search removed per request */}
        {assetsView==='case' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.map(a => (
              <div key={a.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{a.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{a.type}{a.contentUrl ? ' • file' : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems:'center' }}>
                  <button onClick={() => setQueue(prev => [a, ...prev])} style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: 8 }}>Queue</button>
                  <button onClick={() => dropToStage(a)} style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: 8 }}>Drop</button>
                  <button onClick={() => scheduleDrop(a, 5)} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>+5m</button>
                  <button onClick={() => scheduleDrop(a, 10)} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>+10m</button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ opacity: 0.6 }}>No matches.</div>}
          </div>
        ) : (
          <div style={{ display:'grid', gap:8 }}>
            {filteredAll.map(a => (
              <div key={`${a.caseId}-${a.id}`} style={{ border:'1px solid #eee', borderRadius:8, padding:10, display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', background:'#fff' }}>
                <div>
                  <div style={{ display:'flex', gap:8, alignItems:'baseline', flexWrap:'wrap' }}>
                    <div style={{ fontWeight:600 }}>{a.title}</div>
                    <span style={{ fontSize:12, opacity:.7 }}>({a.type}{a.contentUrl ? ' • file' : ''})</span>
                    <span style={{ fontSize:12, opacity:.8, border:'1px solid #ddd', borderRadius:999, padding:'2px 8px' }}>{a.caseId}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                  <button onClick={() => setQueue(prev => [a, ...prev])} style={{ padding:'6px 12px', border:'1px solid #ccc', borderRadius:8 }}>Queue</button>
                  <button onClick={() => dropToStage(a)} style={{ padding:'6px 12px', border:'1px solid #ccc', borderRadius:8 }}>Drop</button>
                  <button onClick={() => scheduleDrop(a, 5)} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>+5m</button>
                </div>
              </div>
            ))}
            {filteredAll.length===0 && <div style={{ opacity:.6 }}>No assets in library.</div>}
          </div>
        )}
      </Section>

      {/* Pending Orders */}
      <Section 
        title="Pending Orders" 
        open={openPendingOrders} 
        onToggle={() => setOpenPendingOrders(v => !v)} indicator={{ count: orders.length, color: '#f44336' }}>
        {orders.length === 0 && <div style={{ opacity: .7 }}>No pending orders.</div>}
        <div style={{ display: 'grid', gap: 8 }}>
          {orders.map((o, i) => (
            <div key={i} style={{ border:'1px solid #ddd', borderRadius:8, padding:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <strong>{o.code}</strong>
                  <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: o.color || '#888' }} />
                  <span>from {o.by}</span>
                  {o.role && <span style={{ fontSize:12, opacity:.8, border:'1px solid #ddd', borderRadius:8, padding:'2px 6px' }}>{o.role}</span>}
                </div>
                <div style={{ fontSize:12, opacity:.7 }}>{new Date(o.at).toLocaleTimeString()}</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => revealResult(o)} style={{ padding:'6px 12px', border:'1px solid #ccc', borderRadius:8 }}>Reveal now</button>
                <button onClick={() => { const upper = o.code.toUpperCase(); const match = assets.find(a => a.title.toUpperCase().includes(upper)) || { id:`note-${Date.now()}`, title:`Order: ${upper}`, type:'note' as const, content:'Result pending…' }; scheduleDrop(match, 5); setOrders(prev => prev.filter(x => x !== o)) }} style={{ padding:'6px 12px', border:'1px solid #ccc', borderRadius:8 }}>Reveal in 5m</button>
                <button onClick={() => setOrders(prev => prev.filter(x => x !== o))} title="Remove from pending" style={{ padding:'6px 12px', border:'1px solid #ccc', borderRadius:8 }}>✕ Remove</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Learner Requests */}
      <Section 
        title="Learner Requests" 
        open={openLearnerRequests} 
        onToggle={() => setOpenLearnerRequests(v => !v)} indicator={{ count: requests.length, color: '#fcf969' }}>
        {requests.length === 0 && <div style={{opacity:.6}}>No requests.</div>}
        <div style={{ display:'grid', gap:8 }}>
          {requests.map((r,i)=>(
            <div key={i} style={{ border:'1px solid #eee', borderRadius:8, padding:8, display:'flex', justifyContent:'space-between' }}>
              <div>
                <div><strong>{r.kind}</strong>{r.detail ? ` • ${r.detail}` : ''}</div>
                <div style={{ fontSize:12, opacity:.7, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: r.color || '#888' }} />
                  {r.by}{r.role && <span style={{ border:'1px solid #ddd', borderRadius:8, padding:'2px 6px' }}>{r.role}</span>} • {new Date(r.at).toLocaleTimeString()}
                </div>
              </div>
              <button onClick={()=>{ const text = prompt('Message back to learner?'); if (text) socket.emit('control:message', { text, at: Date.now(), caseId, targetId: r.learnerId }) }}>Reply</button>
            </div>
          ))}
        </div>
      </Section>

      {/* Learner Questions */}
      <Section 
        title="Learner Questions" 
        open={openLearnerQuestions} 
        onToggle={() => setOpenLearnerQuestions(v => !v)} indicator={{ count: questions.length, color: '#ac4caf' }}>
        {questions.length === 0 && <div style={{opacity:.6}}>No questions.</div>}
        <div style={{ display:'grid', gap:8 }}>
          {questions.map((q,i)=>(
            <div key={i} style={{ border:'1px solid #eee', borderRadius:8, padding:8, display:'flex', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontWeight:600, marginBottom:4 }}>{q.text || '(no text)'}</div>
                <div style={{ fontSize:12, opacity:.7, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: q.color || '#888' }} />
                  {q.by}{q.role && <span style={{ border:'1px solid #ddd', borderRadius:8, padding:'2px 6px' }}>{q.role}</span>} • {new Date(q.at).toLocaleTimeString()}
                </div>
              </div>
              <button onClick={()=>{ const text = prompt('Reply to learner:'); if (text) socket.emit('control:message', { text, at: Date.now(), caseId, targetId: q.learnerId }) }}>Reply</button>
            </div>
          ))}
        </div>
      </Section>

      {/* Stage Messages */}
      <Section
        title="Stage Messages"
        open={true}
        onToggle={()=>{}}
        indicator={{ count: stageMessages.length, color:'#888' }}>
        {stageMessages.length === 0 && <div style={{ opacity:.6 }}>No stage messages.</div>}
        <div style={{ display:'grid', gap:6 }}>
          {stageMessages.map((m,i)=> (
            <div key={i} style={{ border:'1px solid #eee', borderRadius:8, padding:6 }}>
              <div style={{ fontSize:12, opacity:.7 }}>{new Date(m.at).toLocaleTimeString()} • {m.kind === 'announce' ? 'Announcement' : 'Stage'}</div>
              <div style={{ fontSize:13 }}>{m.text}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Pearls */}
      <Section 
        title="Pearls" 
        open={openPearls} 
        onToggle={() => setOpenPearls(v => !v)} indicator={{ count: pearls.length, color: '#4caf50' }}
        right={
          <button onClick={() => { const text = prompt('Add teaching pearl:'); if (!text) return; const tag = prompt('Optional tag (e.g., Dx, Pitfall, Algorithm):') || undefined; const id = `pearl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; socket.emit('control:pearl', { id, text, tag, at: Date.now(), by: 'Faculty', caseId }) }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}
          >Pearl</button>
          }
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontSize:12, opacity:.7 }}>{pearls.length} total</div>
          <button onClick={() => { const text = prompt('Add teaching pearl:'); if (!text) return; const tag = prompt('Optional tag (e.g., Dx, Pitfall, Algorithm):') || undefined; const id = `pearl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; socket.emit('control:pearl', { id, text, tag, at: Date.now(), by: 'Faculty', caseId }) }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>+ Pearl</button>
        </div>
        {pearls.length === 0 && <div style={{ opacity:.6 }}>No pearls yet.</div>}
        <div style={{ display:'grid', gap:8 }}>
          {pearls.map((p) => (
            <div key={p.id} style={{ border:'1px solid #ffe0b2', background:'#fff8e1', borderRadius:8, padding:10, display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
              <div>
                <div style={{ fontSize:12, opacity:.7 }}>{new Date(p.at).toLocaleTimeString()}{p.by ? ` • ${p.by}` : ''}{p.tag ? ` • [${p.tag}]` : ''}</div>
                <div style={{ fontWeight:600, whiteSpace:'pre-wrap' }}>{p.text}</div>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={() => { const msg = `Pearl${p.tag ? ` [${p.tag}]` : ''}: ${p.text}`; socket.emit('control:message', { text: msg, at: Date.now(), caseId }) }} style={{ padding:'4px 8px', border:'1px solid #ccc', borderRadius:6 }}>Send</button>
                <button onClick={() => { const asset = { id:`pearl-${Date.now()}`, title: p.tag ? `Pearl (${p.tag})` : 'Pearl', type:'note' as const, content:p.text }; socket.emit('control:drop', { asset, at: Date.now(), caseId }) }} style={{ padding:'4px 8px', border:'1px solid #ccc', borderRadius:6 }}>Drop</button>
                <button onClick={() => { const newText = prompt('Edit pearl text:', p.text); if (newText == null) return; const newTag  = prompt('Edit tag (optional):', p.tag || '') || undefined; socket.emit('control:pearl', { ...p, text: newText, tag: newTag, at: Date.now(), caseId }) }} style={{ padding:'4px 8px', border:'1px solid #ccc', borderRadius:6 }}>Edit</button>
                <button onClick={() => { if (!confirm('Hide this pearl from the panel? (It remains in the assessment export.)')) return; socket.emit('control:pearlHide', { id: p.id, caseId }) }} style={{ padding:'4px 8px', border:'1px solid #c33', color:'#c33', borderRadius:6 }}>Delete</button>
                <button onClick={() => { const row = [['ts','case','type','role','by','text','tag','pearlId'], [new Date(p.at).toISOString(), caseId, 'pearl', 'faculty', p.by || 'Faculty', p.text, p.tag || '', p.id]]; downloadCsv(`pearl-${caseId}-${p.id}.csv`, row) }} style={{ padding:'4px 8px', border:'1px solid #ccc', borderRadius:6 }}>Export</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Polls / MCQs */}
      <Section
        title="Polls / MCQs"
        open={openPollsMCQs}
        onToggle={() => setOpenPollsMCQs(v => !v)}
        right={
          <button
            onClick={() => setPollOpen(true)}
            style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}
          >New Poll
          </button>
        }
      >
        {polls.length === 0 && <div style={{opacity:.6}}>No polls yet.</div>}
        <div style={{ display:'grid', gap:10 }}>
          {polls.map(p => (
            <div key={p.id} style={{ border:'1px solid #eee', borderRadius:8, padding:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <div style={{ fontWeight:600 }}>{p.question}</div>
                <div style={{ fontSize:12, opacity:.7 }}>{p.total} vote(s)</div>
              </div>
              <div style={{ marginTop:8, display:'grid', gap:6 }}>
                {p.options.map((opt, i) => {
                  const c = p.counts[i] || 0
                  const pct = p.total ? Math.round((c / p.total) * 100) : 0
                  return (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 60px', alignItems:'center', gap:8 }}>
                      <div style={{ position:'relative', border:'1px solid #eee', borderRadius:8, overflow:'hidden' }}>
                        <div style={{ position:'absolute', inset:0, width:`${pct}%`, background:'rgba(41,98,255,.15)' }} />
                        <div style={{ position:'relative', padding:'6px 8px' }}>{opt}</div>
                      </div>
                      <div style={{ textAlign:'right', fontFamily:'ui-monospace' }}>{c} ({pct}%)</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop:8, display:'flex', gap:8 }}>
                <button
                  onClick={() => socket.emit('control:poll:close', { id: p.id, caseId })}
                  disabled={!!p.closed}
                  style={{ padding:'6px 10px', border:'1px solid #c33', color:'#c33', borderRadius:8, opacity: p.closed ? .5 : 1 }}
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const rows = [['option','count']]
                    p.options.forEach((opt, i) => rows.push([opt, String(p.counts[i] || 0)]))
                    downloadCsv(`poll-${p.id}.csv`, rows)
                  }}
                  style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}
                >Export
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Reflections */}
      <Section
        title="Learner Reflections"
        open={openReflections}
        onToggle={() => setOpenReflections(v => !v)}
        indicator={{ count: reflections.length, color: '#4caf50' }}
        right={
          <button
            onClick={() => {
              const rows = [['ts','time','by','role','good','bad','improve']]
              reflections.slice().reverse().forEach(r => {
                rows.push([
                  new Date(r.at).toISOString(),
                  new Date(r.at).toLocaleTimeString(),
                  r.by || '',
                  r.role || '',
                  r.good || '',
                  r.bad || '',
                  r.improve || ''
                ])
              })
              downloadCsv(`reflections-${caseId}.csv`, rows)
            }}
            style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}
          >Export CSV
          </button>}>
        {reflections.length === 0 && <div style={{ opacity:.6 }}>No reflections yet.</div>}
        <div style={{ display:'grid', gap:8 }}>
          {reflections.map((r, i) => (
            <div key={`${r.learnerId}-${r.at}-${i}`} style={{ border:'1px solid #eee', borderRadius:8, padding:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <div style={{ fontWeight:600 }}>{r.by}{r.role ? ` • ${r.role}` : ''}</div>
                <div style={{ fontSize:12, opacity:.7 }}>{new Date(r.at).toLocaleTimeString()}</div>
              </div>
              {!!(r.good||'').trim() && (
                <div style={{ marginTop:6 }}>
                  <div style={{ fontWeight:600 }}>Went well</div>
                  <div style={{ whiteSpace:'pre-wrap' }}>{r.good}</div>
                </div>
              )}
              {!!(r.bad||'').trim() && (
                <div style={{ marginTop:6 }}>
                  <div style={{ fontWeight:600 }}>Didn’t go well</div>
                  <div style={{ whiteSpace:'pre-wrap' }}>{r.bad}</div>
                </div>
              )}
              {!!(r.improve||'').trim() && (
                <div style={{ marginTop:6 }}>
                  <div style={{ fontWeight:600 }}>Work on</div>
                  <div style={{ whiteSpace:'pre-wrap' }}>{r.improve}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* History */}
      <Section title="History" open={openHistory} onToggle={() => setOpenHistory(v => !v)}>
        {history.length === 0 && <div style={{ opacity: 0.6 }}>No activity yet.</div>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {history.slice(0, 20).map((h, i) => (
            <li key={i} style={{ fontSize: 14, opacity: 0.95 }}>
              <span style={{ fontFamily: 'ui-monospace' }}>{new Date(h.when).toLocaleTimeString()}</span>{' '}
              {h.kind === 'clear' ? (
                <em style={{ color: '#999' }}>Stage cleared</em>
              ) : h.kind === 'pearl' ? (
                <span style={{ color: '#b26a00', fontWeight: 600 }}>★ {h.title || 'Pearl'}</span>
              ) : h.kind === 'order' ? (
                <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                  <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: h.color || '#888' }} />
                  Order: <strong>{h.code}</strong> by {h.by}{h.role && <span style={{ marginLeft:6, fontSize:12, opacity:.8, border:'1px solid #ddd', borderRadius:8, padding:'2px 6px' }}>{h.role}</span>}
                </span>
              ) : h.kind === 'start' ? (
                <span style={{ color:'#388e3c', fontWeight:600 }}>Case started</span>
              ) : h.kind === 'pause' ? (
                <span style={{ color:'#ff8f00', fontWeight:600 }}>Case paused</span>
              ) : h.kind === 'resume' ? (
                <span style={{ color:'#1976d2', fontWeight:600 }}>Case resumed</span>
              ) : h.kind === 'stop' ? (
                <span style={{ color:'#c62828', fontWeight:600 }}>Case stopped</span>
              ) : (
                <>Shown: <strong>{h.title}</strong></>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {/* Timeline */}
      <Section
        title="Timeline"
        open={openTimeline}
        onToggle={() => setOpenTimeline(v => !v)}
        right={
          <div style={{ display:'flex', gap:8 }}>
            <select value={fltType} onChange={e => setFltType(e.target.value as any)} style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }}>
              <option value="all">All</option><option value="orders">Orders</option><option value="requests">Requests</option><option value="questions">Questions</option><option value="pearls">Pearls</option><option value="stage">Stage</option><option value="case">Case</option>
            </select>
            <select value={fltLearner} onChange={e => setFltLearner(e.target.value)} style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }}>
              <option value="ALL">All Learners</option>
              {learners.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
            <input value={fltText} onChange={e => setFltText(e.target.value)} placeholder="Search…" style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }} />
            <button onClick={() => {
              const rows = [['ts','time','type','label','by','role']]
              filteredTimeline.slice().reverse().forEach(ev => { const iso = new Date(ev.when).toISOString(); const local = new Date(ev.when).toLocaleTimeString(); rows.push([iso, local, ev.type, ev.label, ev.by || '', ev.role || '']) })
              downloadCsv(`timeline-${caseId}.csv`, rows)
            }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Export CSV</button>
          </div>
        }
      >
        {filteredTimeline.length === 0 && <div style={{ opacity:.6 }}>No events.</div>}
        <div style={{ display:'grid', gap:6 }}>
          {filteredTimeline.map((ev, i) => (
            <div key={`${ev.when}-${ev.type}-${i}`} style={{ border:'1px solid #eee', borderRadius:8, padding:'8px 10px', display:'grid', gridTemplateColumns:'120px 1fr auto', gap:8, alignItems:'center' }}>
              <div style={{ fontFamily:'ui-monospace', opacity:.8 }}>{new Date(ev.when).toLocaleTimeString()}</div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span style={{
                  border:'1px solid #ddd', borderRadius:999, padding:'2px 8px', fontSize:12,
                  background: ev.type.startsWith('case-') ? '#f3f6ff' :
                             ev.type === 'stage-show' || ev.type === 'stage-clear' ? '#f8f9fa' :
                             ev.type === 'order' ? 'rgba(41,98,255,.08)' :
                             ev.type === 'request' ? 'rgba(252,249,105,.25)' :
                             ev.type === 'question' ? 'rgba(172,76,175,.15)' :
                             ev.type === 'pearl' ? '#fff8e1' : '#fff'
                }}>{ev.type}</span>
                {ev.by && (<>
                  <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: ev.color || '#888' }} />
                  <strong>{ev.by}</strong>
                  {ev.role && <span style={{ fontSize:12, opacity:.8, border:'1px solid #ddd', borderRadius:8, padding:'2px 6px' }}>{ev.role}</span>}
                </>)}
                <span>{ev.label}</span>
              </div>
              <div style={{ textAlign:'right' }}>{ev.code && <span style={{ fontFamily:'ui-monospace', border:'1px solid #ddd', borderRadius:8, padding:'2px 6px' }}>{ev.code}</span>}</div>
            </div>
          ))}
        </div>
      </Section>

      <PollModal
          open={pollOpen}
          onClose={()=>setPollOpen(false)}
          onCreate={(p)=>{
            const id = `poll-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
            socket.emit('control:poll:create', { id, caseId, ...p })
          }}
        />  

        <LabPanelModal
          open={labOpen}
          onClose={()=>setLabOpen(false)}
          onAddToCase={({ title, rows, gate }) => {
            const content = rows.map(r => `${r.name}\t${r.value}\t${r.normal}`).join('\n')
            const asset: Asset = { id: newId('lab'), title, type:'lab', content }
            setAssets(prev => [asset, ...prev])
            if (gate && gate.orderCode && gate.delayMin >= 0) {
              const g: Gate = { id: `g_${gate.orderCode}_${Date.now()}`, label: `${gate.orderCode} result after ${gate.delayMin}m`, orderCode: gate.orderCode.toUpperCase(), when: { type:'time', msFromStart: gate.delayMin * 60 * 1000 }, reveals: [asset.id] }
              setGates(prev => [...prev, g])
            }
            setLabOpen(false)
          }}
          notify={notify}
        />

      {/* Edit Case Modal / Case Builder */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit Case: ${caseId}`}>
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <button onClick={()=>setBuilderTab('info')}   style={{padding:'6px 10px', border:'1px solid #ccc', borderRadius:8, background: builderTab==='info'?'#eef':'#fff'}}>Info</button>
          <button onClick={()=>setBuilderTab('assets')} style={{padding:'6px 10px', border:'1px solid #ccc', borderRadius:8, background: builderTab==='assets'?'#eef':'#fff'}}>Assets</button>
          <button onClick={()=>setBuilderTab('orders')} style={{padding:'6px 10px', border:'1px solid #ccc', borderRadius:8, background: builderTab==='orders'?'#eef':'#fff'}}>Orders & Gates</button>
          <div style={{marginLeft:'auto', display:'flex', gap:8}}>
            <button onClick={() => setEditOpen(false)} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Close</button>
            <button onClick={async () => {
              const caseJson = {
                id: caseId,
                title: (cases.find(c=>c.id===caseId)?.title) || caseId,
                summary,
                history: { hpi, pmh, meds, allergies },
                vitals,
                assets,
                ordersCatalog,
                gates
              }
              try { await updateCase(caseId, caseJson); notify('Saved case','success') } catch { notify('Save failed','error') }
            }} style={{ padding:'6px 10px', border:'1px solid #0a7', color:'#0a7', borderRadius:8 }}>Save Changes</button>
          </div>
        </div>
        {builderTab === 'info' ? (
          <div>
            <Row label="Title">
              <input value={(cases.find(c=>c.id===caseId)?.title) || caseId} onChange={e => { const title = e.target.value; setCases(prev => prev.map(c=> c.id===caseId ? {...c, title} : c)) }} style={{width:'100%', padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}} />
            </Row>
            <Row label="Summary"><textarea value={summary} onChange={e=>setSummary(e.target.value)} rows={3} style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:8}}/></Row>
            <Row label="HPI"><textarea value={hpi} onChange={e=>setHpi(e.target.value)} rows={4} style={{width:'100%', padding:8, border:'1px solid #ccc', borderRadius:8}}/></Row>
            <Row label="PMH"><StringListEditor value={pmh} onChange={setPmh} placeholder="e.g., HTN, T2DM"/></Row>
            <Row label="Meds"><StringListEditor value={meds} onChange={setMeds} placeholder="e.g., Metformin 500 mg bid"/></Row>
            <Row label="Allergies"><StringListEditor value={allergies} onChange={setAllergies}/></Row>
            <Row label="Initial Vitals"><VitalsEditor value={vitals} onChange={setVitals}/></Row>
          </div>
        ) : builderTab === 'assets' ? (
          <div>
            <div style={{display:'flex', gap:12, marginBottom:12, flexWrap:'wrap'}}>
              <button
                onClick={() => setAssets(prev => [{ id:newId('note'), title:'History', type:'note', content:'' }, ...prev])}
                style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}
              >Add Text/History</button>
              <button
                onClick={() => setLabOpen(true)}
                style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}
              >Add/Create Lab</button>
              <button
                onClick={() => builderFileRef.current?.click()}
                style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}
              >Add File (upload)</button>
              <button
                onClick={() => {
                  const url = prompt('Enter file URL (image/pdf/video):', '') || ''
                  if (!url.trim()) return
                  const t = prompt('Type (image/pdf/video):', 'image') || 'image'
                  if (!['image','pdf','video'].includes(t)) return alert('Type must be image, pdf, or video')
                  setAssets(prev => [{ id:newId(t as any), title:'New Asset', type: t as any, contentUrl: url.trim() }, ...prev])
                }}
                style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}
              >Add from URL</button>
              <input
                ref={builderFileRef}
                type="file"
                multiple
                accept="image/*,application/pdf,video/*"
                onChange={async e => {
                  const files = e.target.files
                  if (!files || !files.length) return
                  const out: Asset[] = []
                  for (const f of Array.from(files)) {
                    try {
                      const up = await uploadToCase(caseId, f)
                      out.push({ id: newId(kindFromMime(up.mime)), title: f.name, type: kindFromMime(up.mime), contentUrl: up.url })
                    } catch {
                      // ignore failures
                    }
                  }
                  if (out.length) setAssets(prev => [...out, ...prev])
                  e.currentTarget.value = ''
                }}
                style={{ display:'none' }}
              />
            </div>
            {/* Inline toggle to browse all-case library inside editor */}
            <div style={{ display:'flex', alignItems:'center', gap:8, margin:'8px 0' }}>
              <div style={{ border:'1px solid #ddd', borderRadius:999, overflow:'hidden' }}>
                <button onClick={()=>setAssetsView('case')} style={{ padding:'6px 10px', border:'none', background: assetsView==='case' ? '#eef' : '#fff' }}>Case</button>
                <button onClick={()=>{ setAssetsView('all'); listAllAssets().then(setAllAssets).catch(()=>{}) }} style={{ padding:'6px 10px', border:'none', background: assetsView==='all' ? '#eef' : '#fff' }}>All</button>
              </div>
              {assetsView==='all' && (
                <>
                  <span style={{ opacity:.7 }}>Type:</span>
                  <select value={assetsTypeFilter} onChange={e=>setAssetsTypeFilter(e.target.value as any)} style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }}>
                    <option value="ALL">All</option>
                    <option value="lab">lab</option>
                    <option value="image">image</option>
                    <option value="pdf">pdf</option>
                    <option value="video">video</option>
                    <option value="note">note</option>
                  </select>
                  <button onClick={()=>listAllAssets().then(setAllAssets)} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Refresh</button>
                </>
              )}
            </div>

            <div style={{display:'grid', gap:10}}>
              {assets.map((a, i) => (
                <div key={a.id} style={{border:'1px solid #eee', borderRadius:8, padding:10}}>
                  <div style={{display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:8, alignItems:'center'}}>
                    <input value={a.title} onChange={e => { const v = e.target.value; setAssets(prev => prev.map((x,ix)=> ix===i ? {...x, title:v} : x)) }} placeholder="Title" style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}} />
                    <select value={a.type} onChange={e => { const t = e.target.value as Asset['type']; setAssets(prev => prev.map((x,ix)=> ix===i ? {...x, type:t} : x)) }} style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}}>
                      {(['note','lab','image','pdf','video'] as Asset['type'][]).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={() => { if (i===0) return; setAssets(prev => { const c=[...prev]; [c[i-1],c[i]]=[c[i],c[i-1]]; return c }) }}>↑</button>
                    <button onClick={() => { if (i===assets.length-1) return; setAssets(prev => { const c=[...prev]; [c[i+1],c[i]]=[c[i],c[i+1]]; return c }) }}>↓</button>
                  </div>
                  {(a.type==='note' || a.type==='lab') && ( <textarea value={a.content || ''} onChange={e => { const v = e.target.value; setAssets(prev => prev.map((x,ix)=> ix===i ? {...x, content:v} : x)) }} placeholder={a.type==='lab' ? 'Lab text…' : 'Note text…'} rows={4} style={{marginTop:8, width:'100%', padding:8, border:'1px solid #ccc', borderRadius:8, fontFamily:'ui-monospace'}} /> )}
                  {(a.type==='image' || a.type==='pdf' || a.type==='video') && ( <input value={a.contentUrl || ''} onChange={e => { const v = e.target.value; setAssets(prev => prev.map((x,ix)=> ix===i ? {...x, contentUrl:v} : x)) }} placeholder="File URL (e.g., /assets/cases/anemia/cxr-1.jpg)" style={{marginTop:8, width:'100%', padding:'6px 8px', border:'1px solid #ccc', borderRadius:8}} /> )}
                  <div style={{display:'flex', justifyContent:'space-between', marginTop:8}}>
                    <div style={{fontSize:12, opacity:.6}}>id: {a.id}</div>
                    <button onClick={() => setAssets(prev => prev.filter((_,ix)=> ix!==i))} style={{ padding:'4px 8px', border:'1px solid #c33', color:'#c33', borderRadius:8 }}>Delete</button>
                  </div>
                </div>
              ))}
              {assets.length===0 && <div style={{opacity:.6}}>No assets yet.</div>}
            </div>

            {assetsView==='all' && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontWeight:700, marginBottom:6 }}>Library (All Cases)</div>
                <div style={{ display:'grid', gap:8 }}>
                  {filteredAll.map(a => (
                    <div key={`${a.caseId}-${a.id}`} style={{ border:'1px solid #eee', borderRadius:8, padding:10, display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center' }}>
                      <div>
                        <div style={{ display:'flex', gap:8, alignItems:'baseline', flexWrap:'wrap' }}>
                          <div style={{ fontWeight:600 }}>{a.title}</div>
                          <span style={{ fontSize:12, opacity:.7 }}>({a.type}{a.contentUrl ? ' • file' : ''})</span>
                          <span style={{ fontSize:12, opacity:.8, border:'1px solid #ddd', borderRadius:999, padding:'2px 8px' }}>{a.caseId}</span>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                        <button onClick={() => setQueue(prev => [a, ...prev])} style={{ padding:'6px 12px', border:'1px solid #ccc', borderRadius:8 }}>Queue</button>
                        <button onClick={() => dropToStage(a)} style={{ padding:'6px 12px', border:'1px solid #ccc', borderRadius:8 }}>Drop</button>
                        <button
                          title="Copy into this case's assets"
                          onClick={() => {
                            const base: Asset = { id: newId(a.type), title: a.title, type: a.type, contentUrl: a.contentUrl, content: a.content }
                            setAssets(prev => [base, ...prev])
                            setBuilderTab('assets')
                            notify?.('Added to current case','success')
                          }}
                          style={{ padding:'6px 12px', border:'1px solid #0a7', color:'#0a7', borderRadius:8 }}
                        >Add to current case</button>
                      </div>
                    </div>
                  ))}
                  {filteredAll.length===0 && <div style={{ opacity:.6 }}>No assets in library.</div>}
                </div>
              </div>
            )}
          </div>
        ) : (
          <OrdersGatesTab //Props
            assets={assets} 
            ordersCatalog={ordersCatalog} 
            setOrdersCatalog={setOrdersCatalog} 
            gates={gates} 
            setGates={setGates} 
            caseId={caseId} 
            notify={notify} 
            policy={policy} 
            setPolicy={setPolicy} 
            allowedRoles={allowedRoles}            // NEW
            setAllowedRoles={setAllowedRoles}      // NEW
            />
        )}
      </Modal>

      {/* Toasts */}
      <div style={{ position:'fixed', right: 16, bottom: 16, display:'grid', gap:8, zIndex: 1000 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            border:'1px solid #ddd', borderRadius:8, padding:'8px 12px', background: t.kind === 'success' ? '#e8f5e9' : t.kind === 'error' ? '#ffebee' : '#f5f5f5',
            color: '#333', boxShadow:'0 2px 8px rgba(0,0,0,.08)'
          }}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
