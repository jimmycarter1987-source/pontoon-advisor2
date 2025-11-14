"use client";
import React, { useEffect, useState } from "react";

type AprRow = { term: number; apr: number };
type CreditTier = "Excellent" | "Good" | "Fair";
type AprMatrix = Record<CreditTier, AprRow[]>;
type MinByTerm = Record<string, number>;
type AppConfig = { aprMatrix: AprMatrix; minAmountByTerm: MinByTerm };

export default function AdminPage() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  async function load() {
    setError("");
    try {
      const r = await fetch("/api/config", { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load config");
      setCfg(await r.json());
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true); setError("");
    try {
      const r = await fetch("/api/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!r.ok) throw new Error("Save failed");
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (!cfg) return <div className="p-6">Loading… {error && <span className="text-rose-600">{error}</span>}</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Admin — Config</h1>

      <section className="space-y-2">
        <h2 className="font-medium">APR Matrix</h2>
        {(["Excellent","Good","Fair"] as const).map(tier=>(
          <div key={tier} className="border rounded p-3 space-y-2 bg-white">
            <p className="text-sm font-medium">{tier}</p>
            {(cfg.aprMatrix[tier]||[]).map((row,i)=>(
              <div key={i} className="grid grid-cols-3 gap-2 items-center">
                <label className="text-xs">Term (mo)
                  <input className="border rounded px-2 py-1 w-full" type="number" value={row.term}
                    onChange={e=>{
                      const term = +e.target.value;
                      setCfg(c=>({...c!, aprMatrix:{...c!.aprMatrix, [tier]: c!.aprMatrix[tier].map((r,idx)=> idx===i?{...r,term}:r)}}));
                    }}/>
                </label>
                <label className="text-xs">APR %
                  <input className="border rounded px-2 py-1 w-full" type="number" step="0.01" value={row.apr}
                    onChange={e=>{
                      const apr = +e.target.value;
                      setCfg(c=>({...c!, aprMatrix:{...c!.aprMatrix, [tier]: c!.aprMatrix[tier].map((r,idx)=> idx===i?{...r,apr}:r)}}));
                    }}/>
                </label>
                <button className="border px-2 py-1 rounded" onClick={()=>{
                  setCfg(c=>({...c!, aprMatrix:{...c!.aprMatrix, [tier]: c!.aprMatrix[tier].filter((_,idx)=>idx!==i)}}));
                }}>Remove</button>
              </div>
            ))}
            <button className="border px-2 py-1 rounded" onClick={()=>{
              setCfg(c=>({...c!, aprMatrix:{...c!.aprMatrix, [tier]: [...(c!.aprMatrix[tier]||[]), {term:60, apr:7.99}]}}));
            }}>Add Row</button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Minimum Finance Amounts by Term</h2>
        {Object.entries(cfg.minAmountByTerm).sort(([a],[b])=>+a-+b).map(([term,min])=>(
          <div key={term} className="grid grid-cols-3 gap-2 items-center">
            <label className="text-xs">Term (mo)
              <input className="border rounded px-2 py-1 w-full" type="number" value={term} disabled/>
            </label>
            <label className="text-xs">Min Amount $
              <input className="border rounded px-2 py-1 w-full" type="number" value={min}
                onChange={e=>{
                  const v = +e.target.value;
                  setCfg(c=>({...c!, minAmountByTerm:{...c!.minAmountByTerm, [term]: v}}));
                }}/>
            </label>
            <button className="border px-2 py-1 rounded" onClick={()=>{
              setCfg(c=>{ const m={...c!.minAmountByTerm}; delete m[term]; return {...c!, minAmountByTerm:m}; });
            }}>Remove</button>
          </div>
        ))}
        <button className="border px-2 py-1 rounded" onClick={()=>{
          setCfg(c=>{ const m={...c!.minAmountByTerm}; if (!m["84"]) m["84"]=15000; return {...c!, minAmountByTerm:m}; });
        }}>Add 84 mo threshold</button>
      </section>

      {error && <p className="text-rose-600 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="border px-3 py-1.5 rounded bg-white">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={load} className="border px-3 py-1.5 rounded bg-white">Reload</button>
      </div>
    </div>
  );
}
