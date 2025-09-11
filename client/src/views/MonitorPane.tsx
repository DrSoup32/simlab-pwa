import React, { useEffect, useRef, useState } from "react";

export default function MonitorPane({ caseId }: { caseId?: string }) {
  const [ts, setTs] = useState<number>(Date.now());
  const timer = useRef<number | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Refresh snapshot every 1.5s
    timer.current = window.setInterval(() => setTs(Date.now()), 1500);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, []);

  async function sendFrame() {
    try {
      setSending(true);
      const url = caseId
        ? `/api/monitor/send?caseId=${encodeURIComponent(caseId)}`
        : `/api/monitor/send`;
      const r = await fetch(url, { method: "POST" });
      if (!r.ok) throw new Error(`send failed: ${r.status}`);
      setErr(null);
    } catch (e: any) {
      setErr("Failed to send frame.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <strong>Live Monitor</strong>
        <button className="toolbtn" onClick={sendFrame} disabled={sending}>
          {sending ? "Sending…" : "Send frame → Stage"}
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <img
          src={`/monitor.jpg?ts=${ts}`}
          alt="Monitor"
          style={{ width:"100%", maxHeight: 280, objectFit: "contain", borderRadius: 8, border: "1px solid #ddd" }}
          onError={() => setErr("No snapshot found at /monitor.jpg")}
          onLoad={() => setErr(null)}
        />
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          Refreshes every 1.5s. Button uploads current frame and shows it on Stage.
        </div>
        {err && <div style={{ color:"#c33", fontSize:12, marginTop:6 }}>{err}</div>}
      </div>
    </div>
  );
}
