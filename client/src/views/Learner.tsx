import React, { useEffect, useMemo, useState } from "react";
import { socket } from "../socket";

// ---- Static fallback catalogs ----
const LABS = [
  { label: "Hematology", items: [
    { code: "CBC", label: "CBC" },
    { code: "RETIC", label: "Reticulocyte Count" },
    { code: "ESR", label: "ESR" },
  ]},
  { label: "Chemistry", items: [
    { code: "BMP", label: "Basic Metabolic Panel (BMP)" },
    { code: "CMP", label: "Comprehensive Metabolic Panel (CMP)" },
    { code: "LFT", label: "Liver Panel" },
    { code: "LIPASE", label: "Lipase" },
  ]},
  { label: "Coagulation", items: [
    { code: "PT/INR", label: "PT/INR" },
    { code: "PTT", label: "aPTT" },
    { code: "FIB", label: "Fibrinogen" },
  ]},
  { label: "Toxicology", items: [
    { code: "TOX-ASA", label: "Salicylate Level" },
    { code: "TOX-APAP", label: "Acetaminophen Level" },
    { code: "TOX-ETH", label: "Ethanol Level" },
  ]},
  { label: "Microbiology", items: [
    { code: "BCX", label: "Blood Cultures (x2)" },
    { code: "UCX", label: "Urine Culture" },
    { code: "SPX", label: "Sputum Culture" },
  ]},
  { label: "Urinalysis", items: [
    { code: "UA", label: "Urinalysis" },
    { code: "U-PREG", label: "Urine Pregnancy (hCG)" },
  ]},
  { label: "Serology", items: [
    { code: "TROP", label: "Troponin" },
    { code: "BNP", label: "BNP/NT-proBNP" },
    { code: "CRP", label: "CRP" },
  ]},
];
const IMAGING = [
  { label: "X-Ray", items: [
    { code: "CXR", label: "Chest X-Ray (CXR)" },
    { code: "XR-ABD", label: "Abdomen Series" },
    { code: "XR-EXT", label: "Extremity X-Ray" },
  ]},
  { label: "Ultrasound", items: [
    { code: "US-ABD", label: "RUQ/Abdominal US" },
    { code: "US-DVT", label: "LE DVT Study" },
  ]},
  { label: "POCUS", items: [
    { code: "POCUS-FAST", label: "FAST Exam" },
    { code: "POCUS-CARD", label: "Cardiac POCUS" },
  ]},
  { label: "CT", items: [
    { code: "CT-HEAD", label: "CT Head (non-contrast)" },
    { code: "CT-ABDPEL", label: "CT Abd/Pelvis (±contrast)" },
    { code: "CT-PE", label: "CT Pulmonary Angiography" },
  ]},
  { label: "MRI", items: [
    { code: "MRI-BRAIN", label: "MRI Brain" },
    { code: "MRI-SPINE", label: "MRI Spine" },
  ]},
];

const OrderBtn = ({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) => (
  <button onClick={onClick} style={{ padding: "6px 10px", border: `1px solid ${active ? "#0a7" : "#ccc"}`, color: active ? "#0a7" : "inherit", borderRadius: 8, background: active ? "rgba(0,170,119,.08)" : "white" }}>
    {active ? "✓ " : ""}{children}
  </button>
);

type LivePoll = { id: string; question: string; options: string[]; multi?: boolean; closesAt?: number | null };

function PollCard({ poll, onVote }: { poll: LivePoll; onVote: (choices: number[]) => void }) {
  const [sel, setSel] = useState<number[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const deadline = poll.closesAt ? Math.max(0, poll.closesAt - now) : null;
  const disabled = !!deadline && deadline <= 0;
  useEffect(() => {
    if (!poll.closesAt) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id);
  }, [poll.closesAt]);
  const toggle = (i: number) => setSel(prev => poll.multi ? (prev.includes(i) ? prev.filter(x=>x!==i) : [...prev, i]) : [i]);
  const fmt = (ms: number) => { const s = Math.max(0, Math.floor(ms/1000)); const m = Math.floor(s/60); const r = s % 60; return `${m}:${r.toString().padStart(2,'0')}` };
  return (
    <div style={{ border:'1px solid #eee', borderRadius:8, padding:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
        <div style={{ fontWeight:600, marginBottom:6 }}>{poll.question}</div>
        {deadline != null && <div style={{ fontSize:12, opacity:.75 }}>{disabled ? 'Closed' : `Closes in ${fmt(deadline)}`}</div>}
      </div>
      <div style={{ display:'grid', gap:6, opacity: disabled ? .6 : 1 }}>
        {poll.options.map((opt, i) => (
          <label key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type={poll.multi ? 'checkbox' : 'radio'} name={`poll-${poll.id}`} checked={sel.includes(i)} onChange={() => !disabled && toggle(i)} disabled={disabled} />
            {opt}
          </label>
        ))}
      </div>
      <div style={{ marginTop:8 }}>
        <button onClick={() => onVote(sel)} disabled={sel.length === 0 || disabled} style={{ padding:'6px 12px', border:'1px solid #0a7', borderRadius:8, color:'#0a7', opacity: (sel.length && !disabled) ? 1 : .5 }}>Submit</button>
      </div>
    </div>
  );
}

const Section = ({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) => (
  <section style={{ margin:'10px 0' }}>
    <button onClick={onToggle} style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', padding:0, cursor:'pointer' }}>
      <span style={{ display:'inline-block', width:10, transform:`rotate(${open?90:0}deg)`, transition:'transform .15s' }}>▸</span>
      <h3 style={{ margin:0 }}>{title}</h3>
    </button>
    {open && <div style={{ marginTop:8 }}>{children}</div>}
  </section>
);

export default function Learner() {
  // Identity/state
  const [connected, setConnected] = useState<boolean>(!!socket.connected);
  const [caseId] = useState<string | undefined>(() => new URLSearchParams(window.location.search).get('case') || undefined);
  const [name, setName] = useState<string>(() => sessionStorage.getItem('learnerName') || 'Learner');
  const [learnerId, setLearnerId] = useState<string>(() => sessionStorage.getItem('learnerId') || `L-${Math.random().toString(36).slice(2,8)}-${Date.now().toString(36)}`);
  const [color, setColor] = useState<string | undefined>(() => sessionStorage.getItem('learnerColor') || undefined);
  const [role, setRole] = useState<string>('Team Lead');

  const [inbox, setInbox] = useState<Array<{ text: string; at: number }>>([]);
  const [polls, setPolls] = useState<LivePoll[]>([]);

  const [cart, setCart] = useState<string[]>([]);
  const [ordered, setOrdered] = useState<string[]>([]);

  const notify = (msg: string) => { try { (window as any).toast?.(msg) } catch { /* no-op */ } console.log(msg) };

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); };
  }, []);

  useEffect(() => {
    sessionStorage.setItem('learnerId', learnerId);
    sessionStorage.setItem('learnerName', name);
    socket.emit('learner:hello', { id: learnerId, name, caseId });
  }, [learnerId, name, caseId]);

  // Name entry is optional; no sign-in required

  // Adopt color (and id if server decides) and persist per tab; survives refresh
  useEffect(() => {
    const onWelcome = (me: { id: string; color?: string }) => {
      if (me?.id && me.id !== learnerId) {
        setLearnerId(me.id);
        sessionStorage.setItem('learnerId', me.id);
      }
      if (typeof me?.color !== 'undefined') {
        setColor(me.color);
        sessionStorage.setItem('learnerColor', me.color || '');
      }
    };
    socket.on('learner:welcome', onWelcome);
    return () => { socket.off('learner:welcome', onWelcome); };
  }, [learnerId]);

  useEffect(() => {
    const onMsg = (m: { text: string; at: number }) => setInbox(prev => [...prev, { text: m.text, at: m.at }]);
    const onPoll = (p: { id: string; question: string; options: string[]; multi?: boolean; closesAt?: number | null }) =>
      setPolls(prev => [...prev.filter(x => x.id !== p.id), { id: p.id, question: p.question, options: p.options, multi: p.multi, closesAt: p.closesAt ?? null }]);
    const onPollClosed = ({ id }: { id: string }) => setPolls(prev => prev.filter(p => p.id !== id));
    const onPollUpdate = (p: { id: string; closesAt?: number | null }) => setPolls(prev => prev.map(x => x.id === p.id ? { ...x, closesAt: p.closesAt ?? x.closesAt } : x));
    socket.on('learner:message', onMsg);
    socket.on('learner:poll', onPoll);
    socket.on('control:poll:closed', onPollClosed);
    socket.on('control:poll:update', onPollUpdate);
    return () => {
      socket.off('learner:message', onMsg);
      socket.off('learner:poll', onPoll);
      socket.off('control:poll:closed', onPollClosed);
      socket.off('control:poll:update', onPollUpdate);
    };
  }, []);

  const order = (code: string) => {
    socket.emit('learner:order', { code, by: name, learnerId, caseId, role });
    setOrdered(prev => (prev.includes(code) ? prev : [...prev, code]));
  };

  const toggleCart = (code: string) => setCart(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);

  const submitCart = () => {
    cart.forEach(code => order(code));
    if (cart.length) notify(`Submitted ${cart.length} order(s)`);
    setCart([]);
  };

  const request = (kind: string, detail?: string) => {
    socket.emit('learner:request', { kind, detail, by: name, learnerId, caseId, role, at: Date.now() });
    notify('Request sent');
  };

  // Catalog/policy pushed from Control
  const [policyMap, setPolicyMap] = useState<Record<string, 'ok'|'justify'|'blocked'>>({});
  const [pushedCatalog, setPushedCatalog] = useState<Array<{ code: string; name: string; kind: 'lab'|'imaging'|'med'|'other' }>>([]);
  const [pushedIndex, setPushedIndex] = useState<Record<string, { kind:string; category:string; group:string; label:string }>>({});
  const [allowedRolesMap, setAllowedRolesMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const onCatalog = (p: { catalog?: any[]; index?: Record<string, any>; policy?: Record<string, string>; roles?: Record<string, string[]> }) => {
      setPushedCatalog(Array.isArray(p.catalog) ? p.catalog : []);
      setPushedIndex(p.index || {});
      const allowed = new Set(['ok','justify','blocked']);
      const filtered: Record<string,'ok'|'justify'|'blocked'> = {};
      Object.entries(p.policy || {}).forEach(([code, v]) => { const val = String(v); if (allowed.has(val)) filtered[code.toUpperCase()] = val as any; });
      setPolicyMap(filtered);
      setAllowedRolesMap(p.roles || {});
    };
    socket.on('learner:orders:catalog', onCatalog);
    return () => { socket.off('learner:orders:catalog', onCatalog); };
  }, []);

  const canSee = (code: string) => { const list = allowedRolesMap[code.toUpperCase()]; return !list || list.length === 0 ? true : list.includes(role); };

  type Grouped = Record<string, Record<string, Array<{code:string; label:string}>>>;
  const grouped = useMemo<Grouped>(() => {
    if (!pushedCatalog.length || !Object.keys(pushedIndex).length) return {};
    const allowed = new Set(pushedCatalog.map(o => o.code.toUpperCase()));
    const out: Grouped = {};
    for (const code of allowed) {
      if (!canSee(code)) continue;
      const meta = pushedIndex[code]; if (!meta) continue;
      if (!out[meta.category]) out[meta.category] = {};
      if (!out[meta.category][meta.group]) out[meta.category][meta.group] = [];
      out[meta.category][meta.group].push({ code, label: meta.label || code });
    }
    for (const cat of Object.keys(out)) for (const g of Object.keys(out[cat])) out[cat][g].sort((a,b)=>a.label.localeCompare(b.label));
    return out;
  }, [pushedCatalog, pushedIndex, allowedRolesMap, role]);

  const policyOf = (code: string) => policyMap[code.toUpperCase()] || 'ok';
  const btnStyleFor = (code: string, active: boolean) => {
    const pol = policyOf(code);
    const baseBorder = active ? '#0a7' : '#ccc';
    const border = pol === 'ok' ? baseBorder : pol === 'justify' ? '#b8860b' : '#c33';
    const bg = pol === 'ok' && active ? 'rgba(0,170,119,.08)' : pol === 'justify' ? 'rgba(184,134,11,.08)' : pol === 'blocked' ? 'rgba(198,51,51,.08)' : 'white';
    const color = pol === 'blocked' ? '#c33' : pol === 'justify' ? '#b8860b' : active ? '#0a7' : 'inherit';
    return { border: `1px solid ${border}`, background: bg, color, borderRadius: 8, padding: '6px 10px' } as React.CSSProperties;
  };

  const [report, setReport] = useState<{ good: string; bad: string; improve: string }>(() => {
    try { const raw = sessionStorage.getItem(`learner.report.${learnerId || 'draft'}`); return raw ? JSON.parse(raw) : { good: '', bad: '', improve: '' }; } catch { return { good: '', bad: '', improve: '' } }
  });
  useEffect(() => { sessionStorage.setItem(`learner.report.${learnerId || 'draft'}`, JSON.stringify(report)); }, [report, learnerId]);

  // Search removed per request; show full catalogs

  // Section open states; collapse all on connect
  const [openOrders, setOpenOrders] = useState(false);
  const [openRequests, setOpenRequests] = useState(false);
  const [openMessages, setOpenMessages] = useState(false);
  const [openPolls, setOpenPolls] = useState(false);
  const [openReport, setOpenReport] = useState(false);
  const [catOpen, setCatOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { if (connected) { setOpenOrders(false); setOpenRequests(false); setOpenMessages(false); setOpenPolls(false); setOpenReport(false); } }, [connected]);

  // Enter submits cart when not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e as any).isComposing) return;
      if (e.key === 'Enter' && cart.length) { e.preventDefault(); submitCart(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [cart]);

  return (
    <div style={{ fontFamily: 'system-ui', padding: 20, display: 'grid', gap: 16 }}>
      <h2 style={{ display:'flex', alignItems:'center', gap:8 }}>
        📋 Learner
        <span title={connected ? 'Connected' : 'Disconnected'} style={{ width:10, height:10, borderRadius:'50%', display:'inline-block', background: connected ? '#2e7d32' : '#c62828' }} />
      </h2>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>Your name:</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter name" style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 8 }} />
  <button onClick={() => { sessionStorage.removeItem('learnerId'); sessionStorage.removeItem('learnerColor'); const fresh = `L-${Math.random().toString(36).slice(2,8)}-${Date.now().toString(36)}`; setLearnerId(fresh); setColor(undefined); socket.emit('learner:hello', { id: fresh, name, caseId }); }} style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 8 }}>Reset</button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>Your role:</label>
        <select value={role} onChange={(e)=>setRole(e.target.value)} style={{ padding:'6px 8px', border:'1px solid #ccc', borderRadius:8 }}>
          <option>Team Lead</option>
          <option>Airway</option>
          <option>Meds/IV</option>
          <option>Compressions</option>
          <option>Recorder</option>
        </select>
      </div>

      {/* Orders */}
  <Section title="Orders" open={openOrders} onToggle={()=>setOpenOrders(v=>!v)}>
    {Object.keys(grouped).length > 0 ? (
          <div style={{ display:'grid', gap:10 }}>
    {Object.entries(grouped).map(([category, groups]) => (
              <div key={category}>
                <button onClick={()=>setCatOpen(prev=>({ ...prev, [category]: !prev[category] }))} style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontWeight:600, fontSize:15 }}>
                  <span style={{ display:'inline-block', width:10, transform:`rotate(${catOpen[category]?90:0}deg)`, transition:'transform .15s' }}>▸</span>
                  {category}
                </button>
                {catOpen[category] && (
                  <div style={{ marginLeft:16, display:'grid', gap:8 }}>
                    {Object.entries(groups).map(([groupName, items]) => (
                      <div key={`${category}/${groupName}`}>
                        <div style={{ fontWeight:600, fontSize:13, opacity:.85, marginTop:4 }}>{groupName}</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
                          {items.map(it => { const active = cart.includes(it.code); const pol = policyOf(it.code); return (
                            <button key={it.code} onClick={() => { if (pol === 'blocked') { alert('Not indicated for this case.'); return } if (pol === 'justify') { const reason = prompt(`Briefly justify ordering "${it.label}"`); if (!reason) return; socket.emit('learner:request', { kind: it.code, detail: reason, by: name, learnerId, caseId, role }); notify('Justification sent'); return } toggleCart(it.code) }} style={btnStyleFor(it.code, active)} title={pol === 'ok' ? it.label : pol === 'justify' ? 'Justification required' : 'Not indicated'}>
                              {(pol === 'ok' && active ? '✓ ' : '') + it.label}
                            </button>
                          )})}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display:'grid', gap:8 }}>
            <div>
              <button onClick={()=>setCatOpen(prev=>({ ...prev, Labs: !prev['Labs'] }))} style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontWeight:600, fontSize:15 }}>
                <span style={{ display:'inline-block', width:10, transform:`rotate(${catOpen['Labs']?90:0}deg)`, transition:'transform .15s' }}>▸</span>
                Labs
              </button>
              {catOpen['Labs'] && (
                <div style={{ marginLeft:16, display:'grid', gap:8 }}>
      {LABS.map(group => (
                    <div key={`labs/${group.label}`}>
                      <div style={{ fontWeight:600, fontSize:13, opacity:.85 }}>{group.label}</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
        {group.items.map(it => { const active = cart.includes(it.code); return (<OrderBtn key={it.code} active={active} onClick={() => toggleCart(it.code)}>{it.label}</OrderBtn>) })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <button onClick={()=>setCatOpen(prev=>({ ...prev, Imaging: !prev['Imaging'] }))} style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontWeight:600, fontSize:15 }}>
                <span style={{ display:'inline-block', width:10, transform:`rotate(${catOpen['Imaging']?90:0}deg)`, transition:'transform .15s' }}>▸</span>
                Imaging
              </button>
              {catOpen['Imaging'] && (
                <div style={{ marginLeft:16, display:'grid', gap:8 }}>
      {IMAGING.map(group => (
                    <div key={`imaging/${group.label}`}>
                      <div style={{ fontWeight:600, fontSize:13, opacity:.85 }}>{group.label}</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
        {group.items.map(it => { const active = cart.includes(it.code); return (<OrderBtn key={it.code} active={active} onClick={() => toggleCart(it.code)}>{it.label}</OrderBtn>) })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ fontSize: 12, opacity: 0.8, minWidth: 200 }}>Pending: {cart.length ? cart.join(', ') : '—'}</div>
          <button onClick={submitCart} disabled={!cart.length} style={{ padding:'6px 12px', border:'1px solid #0a7', borderRadius:8, color:'#0a7', opacity: cart.length ? 1 : .5 }}>Submit Orders</button>
          <button onClick={() => setCart([])} disabled={!cart.length} style={{ padding:'6px 12px', border:'1px solid #c33', borderRadius:8, color:'#c33', opacity: cart.length ? 1 : .5 }}>Clear</button>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Ordered: {ordered.length ? ordered.join(', ') : '—'}</div>
      </Section>

      {/* Requests */}
      <Section title="Requests" open={openRequests} onToggle={()=>setOpenRequests(v=>!v)}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => request('history', 'H&P')}>Prior H&P</button>
          <button onClick={() => request('mar')}>Medication Admin Record</button>
          <button onClick={() => request('imaging')}>Prior Imaging</button>
          <button onClick={() => request('labs')}>Prior Labs</button>
        </div>
      </Section>

      {/* Messages */}
      <Section title="Messages" open={openMessages} onToggle={()=>setOpenMessages(v=>!v)}>
        <div style={{ display:'grid', gap:6 }}>
          {inbox.length === 0 && <div style={{ opacity:.6 }}>No messages yet.</div>}
          {inbox.map((m, i) => (
            <div key={i} style={{ border:'1px solid #eee', borderRadius:8, padding:8 }}>
              <div style={{ fontSize:12, opacity:.7 }}>{new Date(m.at).toLocaleTimeString()}</div>
              <div>{m.text}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
          <input id="msg-out" placeholder="Ask Control a question…" style={{ flex:1, padding:'8px 10px', border:'1px solid #ccc', borderRadius:8 }} />
          <button onClick={()=>{ const el = document.getElementById('msg-out') as HTMLInputElement | null; const text = (el?.value||'').trim(); if (!text) return; socket.emit('learner:question', { text, by: name, learnerId, caseId, role }); if (el) el.value=''; notify('Question sent') }} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:8 }}>Send</button>
        </div>
      </Section>

      {/* Polls */}
      <Section title="Polls" open={openPolls} onToggle={()=>setOpenPolls(v=>!v)}>
        {polls.length === 0 && <div style={{ opacity: 0.6 }}>No active polls.</div>}
        <div style={{ display: 'grid', gap: 10 }}>
          {polls.map((p) => (
            <PollCard key={p.id} poll={p} onVote={(choices: number[]) => { socket.emit('learner:poll:vote', { pollId: p.id, caseId, choiceId: choices, by: name, role, learnerId }); }} />
          ))}
        </div>
      </Section>

      {/* Session Report */}
      <Section title="Session Report" open={openReport} onToggle={()=>setOpenReport(v=>!v)}>
        <p style={{ fontSize: 12, opacity: 0.7 }}>What went well / didn’t go well / what to work on next.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <label>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>What went well?</div>
            <textarea value={report.good} onChange={(e) => setReport((r) => ({ ...r, good: e.target.value }))} rows={3} style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 8 }} />
          </label>
          <label>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>What did not go well?</div>
            <textarea value={report.bad} onChange={(e) => setReport((r) => ({ ...r, bad: e.target.value }))} rows={3} style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 8 }} />
          </label>
          <label>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>What do you want to work on?</div>
            <textarea value={report.improve} onChange={(e) => setReport((r) => ({ ...r, improve: e.target.value }))} rows={3} style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 8 }} />
          </label>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button onClick={() => { socket.emit('learner:reflection', { by: name, role, learnerId, caseId, at: Date.now(), good: report.good.trim(), bad: report.bad.trim(), improve: report.improve.trim() }); alert('Reflection sent to faculty.'); }} disabled={!report.good.trim() && !report.bad.trim() && !report.improve.trim()} style={{ padding: '6px 12px', border: '1px solid #0a7', borderRadius: 8, color: '#0a7', opacity: (!report.good.trim() && !report.bad.trim() && !report.improve.trim()) ? 0.5 : 1 }}>Submit</button>
          <button onClick={() => { setReport({ good: '', bad: '', improve: '' }); sessionStorage.removeItem(`learner.report.${learnerId || 'draft'}`); }} style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: 8 }}>Clear</button>
        </div>
      </Section>
    </div>
  );
}

