import React, { useEffect, useMemo, useState } from "react";
import { socket, Asset } from "../socket";
import "../ui/theme.css";

type StageItem = { asset: Asset; at?: number; orderAt?: number };
type CaseBrief = { id: string; title: string };
type Learner = { id: string; name: string; color?: string };

async function listCases(): Promise<CaseBrief[]> {
  try { const r = await fetch("/api/cases"); return r.ok ? r.json() : []; } catch { return []; }
}
async function getCase(id: string) {
  const r = await fetch(`/api/case/${id}`); if (!r.ok) throw new Error("case load failed"); return r.json();
}
async function getSession(id: string) {
  const r = await fetch(`/api/session/${id}`); if (!r.ok) throw new Error("session load failed"); return r.json();
}
function download(name: string, data: BlobPart, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export default function ControlLite() {
  const [cases, setCases] = useState<CaseBrief[]>([]);
  const [caseId, setCaseId] = useState<string>("");
  const [items, setItems] = useState<StageItem[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);

  useEffect(() => { listCases().then(setCases).catch(()=>{}); }, []);
  useEffect(() => {
    if (!caseId) return;
    getSession(caseId).then(s => setItems(s.stage || [])).catch(()=>{});
    const onShow  = (p:{asset:Asset; at:number; orderAt?:number}) => { setItems(prev => [...prev, { asset:p.asset, at:p.at, orderAt:p.orderAt }]); };
    const onClear = () => setItems([]);
    socket.on("stage:show", onShow); socket.on("stage:clear", onClear);
    return () => { socket.off("stage:show", onShow); socket.off("stage:clear", onClear); };
  }, [caseId]);

  useEffect(() => {
    const sync = () => socket.emit("control:hello", { caseId: caseId || "case-anemia" });
    if (socket.connected) sync();
    socket.on("connect", sync);
    const onList  = (p:{caseId?:string; learners:Learner[]}) => {
      if ((caseId||"case-anemia") !== (p.caseId||"case-anemia")) return; setLearners(p.learners||[]);
    };
    socket.on("control:learner:list", onList);
    return () => { socket.off("connect", sync); socket.off("control:learner:list", onList); };
  }, [caseId]);

  const jump = (it: StageItem) => { socket.emit("control:stage:select", { caseId, assetId: it.asset.id, at: it.at }); };
  const clearStage = () => socket.emit("control:stage:clear", { caseId });
  const exportSession = async () => {
    if (!caseId) return;
    const [c, s] = await Promise.all([getCase(caseId), getSession(caseId)]);
    const bundle = { exportedAt: new Date().toISOString(), case: c, session: s, learners };
    download(`simlab-session-${caseId}.json`, JSON.stringify(bundle, null, 2));
  };
  const fmt = (t?:number) => t ? new Date(t).toLocaleTimeString() : "";

  return (
    <div style={{ fontFamily:"system-ui", padding:20, maxWidth:1000, margin:"0 auto", display:"grid", gap:12 }}>
      <h2 style={{margin:0}}>Control Lite</h2>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <label>Case:&nbsp;</label>
        <select value={caseId} onChange={e=>setCaseId(e.target.value)} style={{ padding:"6px 8px" }}>
          <option value="">Select…</option>
          {cases.map(c => <option key={c.id} value={c.id}>{c.title} ({c.id})</option>)}
        </select>
        <button onClick={exportSession} disabled={!caseId} className="toolbtn">Export Session (JSON)</button>
        <a className="toolbtn" href={caseId ? `/api/session/${caseId}/assess.csv` : "#"} onClick={e=>!caseId && e.preventDefault()}>
          Export Assessment CSV
        </a>
        <button onClick={clearStage} disabled={!caseId} className="toolbtn" style={{ borderColor:"#c33", color:"#c33" }}>Clear Stage</button>
      </div>

      <div style={{ border:"1px solid #eee", borderRadius:12, padding:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
          <strong>Stage Items</strong>
          <div style={{ fontSize:12, opacity:.7 }}>{items.length} item(s)</div>
        </div>
        <div style={{ display:"grid", gap:8, marginTop:8 }}>
          {items.length===0 && <div style={{ opacity:.6 }}>Nothing on Stage yet.</div>}
          {items.map((it, i) => (
            <div key={`${it.asset.id}-${it.at||i}`} style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, alignItems:"center", border:"1px solid #eee", borderRadius:8, padding:8 }}>
              <div>
                <div style={{ fontWeight:600 }}>{it.asset.title}</div>
                <div style={{ fontSize:12, opacity:.7 }}>{it.asset.type}{it.at ? ` • ${fmt(it.at)}` : ""}</div>
              </div>
              <button className="toolbtn" onClick={() => jump(it)}>Jump on Stage</button>
              {it.asset.contentUrl && <a className="toolbtn" href={it.asset.contentUrl} target="_blank" rel="noreferrer">Open</a>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}