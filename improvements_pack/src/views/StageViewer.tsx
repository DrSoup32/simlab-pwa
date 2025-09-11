import React from "react";
import { Asset } from "../socket";

const NORMALS: Record<string, {range:string}> = {
  WBC:{range:'4.0–11.0 x10^3/µL'}, Hgb:{range:'13.5–17.5 g/dL'}, Hct:{range:'41–53 %'}, Plt:{range:'150–450 x10^3/µL'},
  MCV:{range:'80–100 fL'}, RDW:{range:'11.5–14.5 %'}, Na:{range:'135–145 mmol/L'}, K:{range:'3.5–5.0 mmol/L'},
  Cl:{range:'98–107 mmol/L'}, 'CO₂':{range:'22–29 mmol/L'}, BUN:{range:'7–20 mg/dL'}, Cr:{range:'0.6–1.3 mg/dL'},
  Glucose:{range:'70–99 mg/dL'}, Ca:{range:'8.6–10.2 mg/dL'}, AST:{range:'10–40 U/L'}, ALT:{range:'7–56 U/L'},
  Tbili:{range:'0.1–1.2 mg/dL'}, Albumin:{range:'3.5–5.0 g/dL'}, PT:{range:'11–13.5 sec'}, INR:{range:'0.8–1.2'},
  aPTT:{range:'25–35 sec'}, pH:{range:'7.35–7.45'}, pCO2:{range:'35–45 mmHg'}, pO2:{range:'80–100 mmHg'},
  'HCO₃⁻':{range:'22–26 mmol/L'}, SaO2:{range:'95–100 %'},
};
type LabRow = { test: string; value: string; range?: string };
function parseLabRowsFromText(text?: string): LabRow[] {
  if (!text) return []; const lines = text.replace(/\r\n/g, '\n').split('\n').map(l=>l.trim()).filter(Boolean);
  const out: LabRow[] = [];
  for (const line of lines) {
    if (line.includes('\t')) { const [t,v,n]=line.split('\t'); out.push({ test:(t||'').trim(), value:(v||'').trim(), range:(n||'').replace(/^\(|\)$/g,'').trim() }); continue; }
    let m = line.match(/^(.+?):\s*(.+?)(?:\s*\((.+?)\))?$/); if (m) { out.push({ test:m[1].trim(), value:m[2].trim(), range:m[3]?.trim() }); continue; }
    m = line.match(/^(.+?)\s{2,}(.+?)(?:\s*\((.+?)\))?$/);     if (m) { out.push({ test:m[1].trim(), value:m[2].trim(), range:m[3]?.trim() }); continue; }
    m = line.match(/^(.+?)\s+(.+?)(?:\s*\((.+?)\))?$/);        if (m && m[1] && m[2]) { out.push({ test:m[1].trim(), value:m[2].trim(), range:m[3]?.trim() }); continue; }
  }
  return out.filter(r => r.test && r.value);
}
function rowsFromAsset(a: Asset): LabRow[] {
  if ((a as any).lab && (a as any).lab.values) {
    const lab = (a as any).lab as { values: Record<string,string>, units?: Record<string,string>, ranges?: Record<string,string> }
    return Object.entries(lab.values).map(([name, val]) => {
      const unit = lab.units?.[name] ? ` ${lab.units[name]}` : '';
      const r    = lab.ranges?.[name] || NORMALS[name]?.range || '';
      return { test: name, value: val, range: r || unit.trim() }
    });
  }
  const parsed = parseLabRowsFromText(a.content);
  return parsed.map(r => ({ ...r, range: r.range || NORMALS[r.test]?.range }));
}
function extractNumber(s?: string){ if(!s) return null; const m=String(s).replace(',', '.').match(/-?\d+(\.\d+)?/); return m?Number(m[0]):null; }
function parseRange(r?: string){ if(!r) return null; const m=r.replace(/\s/g,'').replace('–','-').match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/); if(!m) return null; const [_,lo,hi]=m; const low=+lo, high=+hi; return (isNaN(low)||isNaN(high))?null:{low,high}; }
function isAbnormal(v?:string, r?:string){ const n=extractNumber(v), rng=parseRange(r); return n==null||!rng?false:(n<rng.low||n>rng.high); }

export function StageViewer({ item, fitMode, scale }:{ item: { asset: Asset; at?: number; orderAt?: number } | null; fitMode:'contain'|'cover'; scale:number }) {
  if (!item) return null;
  const a = item.asset;
  const rows = a.type==='lab' ? rowsFromAsset(a) : [];
  const title = (() => {
    const tests = rows.map(r=>r.test.toLowerCase()), has=(n:string)=>tests.some(t=>t.includes(n));
    if (rows.length) {
      if (has('hgb')||has('hct')||has('wbc')||has('plt')) return 'CBC';
      if (has('pt')||has('inr')||has('aptt')) return 'Coags';
      if (has('pco2')||has('hco')||has('sao2')||has('po2')||has('ph')) return 'ABG';
      if (has('na')||has('k')||has('cl')||has('bun')||has('cr')) return (has('ast')||has('alt')||has('tbili')||has('albumin')) ? 'CMP' : 'BMP';
      if (has('specific gravity')||has('leukocyte')||has('nitrite')) return 'Urinalysis';
    }
    return a.title;
  })();

  return (
    <div className="viewer-frame">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12 }}>
        <div style={{ fontWeight: 'bold' }}>{title}</div>
        <div style={{ fontSize:12, opacity:.7 }}>
          {item.orderAt && <>Ordered: {new Date(item.orderAt).toLocaleString()} • </>}
          {item.at && <>Revealed: {new Date(item.at).toLocaleString()}</>}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        {a.type==='image' && a.contentUrl && (
          <div style={{ width:'100%', height:'75vh', overflow:'auto' }}>
            <img src={a.contentUrl} alt={title}
              style={{ display:'block', transform:`scale(${scale})`, transformOrigin:'top left', width:'100%', height:'auto', objectFit: fitMode }} />
          </div>
        )}
        {a.type==='video' && a.contentUrl && (
          <video src={a.contentUrl} controls autoPlay muted playsInline
                 style={{ width:'100%', maxHeight:'75vh', borderRadius:8, objectFit: fitMode as any }} />
        )}
        {a.type==='pdf' && a.contentUrl && (
          <div style={{ width:'100%', height:'75vh', overflow:'auto' }}>
            <div style={{ transform:`scale(${scale})`, transformOrigin:'top left', width:`${100/scale}%` }}>
              <embed src={a.contentUrl} type="application/pdf" style={{ display:'block', width:'100%', height:'75vh', border:'none' }} />
            </div>
          </div>
        )}
        {a.type==='lab' && rows.length>0 && (
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
                {rows.map((r,i) => {
                  const abnormal = isAbnormal(r.value, r.range);
                  const style = abnormal
                    ? { padding:'8px 10px', whiteSpace:'nowrap', fontWeight:700, color:'#c62828' }
                    : { padding:'8px 10px', whiteSpace:'nowrap', fontWeight:600 };
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid #f2f2f2' }}>
                      <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>{r.test}</td>
                      <td style={style}>{r.value}</td>
                      <td style={{ padding:'8px 10px', whiteSpace:'nowrap', opacity:.75 }}>{r.range || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="legend" style={{ marginTop:6 }}>Bold red = out of reference range.</div>
          </div>
        )}
        {(a.type==='lab' || a.type==='note') && !rows.length && a.content && (
          <pre style={{ whiteSpace:'pre-wrap' }}>{a.content}</pre>
        )}
      </div>
    </div>
  );
}