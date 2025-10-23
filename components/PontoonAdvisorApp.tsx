// components/PontoonAdvisorApp.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/** ---------------- Types ----------------- */
type ToonKind = "pontoon" | "tritoon";
export type InventoryItem = {
  id: string;
  brand: string;
  model: string;
  year?: number;
  lengthFt: number;
  beamIn?: number;
  toonType: ToonKind;
  maxPersons: number;
  hp: number;
  engineBrand: string;
  fuel?: string;
  color?: string;
  hull?: string;
  hours?: number;
  stockNumber?: string;
  serialNumber?: string;
  condition?: "new" | "used";
  status?: "available" | "sold" | "pending";
  msrp: number;
  salePrice: number;
  available: boolean;
  location: string;
  city?: string;
  state?: string;
  imageUrl: string;
  images?: string[];
  description?: string;
  features?: string[];
};

export type AddOn = {
  code: string;
  name: string;
  price: number; // dollars
  taxable: boolean;
};

/** --------------- Demo defaults (used until API returns) ---------------- */
const DEFAULT_INVENTORY: InventoryItem[] = [
  {
    id: "tahoe-ltz-2385-ql-honda",
    brand: "Tahoe",
    model: "LTZ 2385 QL",
    year: 2024,
    lengthFt: 23,
    toonType: "tritoon",
    maxPersons: 12,
    hp: 200,
    engineBrand: "Honda",
    features: ["quad lounge", "rear lounge", "luxury", "family"],
    msrp: 84995,
    salePrice: 71995,
    available: true,
    status: "available",
    location: "Dodge Center, MN",
    imageUrl:
      "https://images.unsplash.com/photo-1526498460520-4c246339dccb?q=80&w=1600&auto=format&fit=crop",
    description: "Beautiful tri-toon set up for family cruising on big lakes.",
  },
];

const DEFAULT_ADDONS: AddOn[] = [
  { code: "TRAILER", name: "Tandem Axle Trailer", price: 4995, taxable: true },
  { code: "COVER", name: "Full Mooring Cover", price: 1195, taxable: true },
  { code: "WARRANTY", name: "Extended Warranty (5yr)", price: 1895, taxable: false },
  { code: "ELECTRONICS", name: "GPS/Depth + Stereo Upgrade", price: 1595, taxable: true },
];

/** --------------- Helpers ---------------- */
function fmt(n: number | undefined | null, digits = 0) {
  const val = Math.round((n || 0) * 10 ** digits) / 10 ** digits;
  try {
    return val.toLocaleString(undefined, { maximumFractionDigits: digits });
  } catch {
    return String(val);
  }
}

function monthlyPayment({
  amount,
  apr,
  months,
}: {
  amount: number;
  apr: number;
  months: number;
}) {
  const r = (apr ?? 0) / 100 / 12;
  const n = Math.max(1, Math.floor(months ?? 1));
  if (r === 0) return amount / n;
  return (r * amount) / (1 - Math.pow(1 + r, -n));
}

function toggleInArray<T extends Record<string, any[]>>(
  obj: T,
  key: keyof T,
  token: string
): T {
  const current = new Set((obj[key] || []).map((v: any) => String(v).toLowerCase()));
  const t = token.toLowerCase();
  if (current.has(t)) current.delete(t);
  else current.add(t);
  return { ...obj, [key]: Array.from(current) } as T;
}

function scoreMatch(
  answers: {
    budget?: number;
    partySize?: number;
    activities?: string[];
    waterType?: "big" | "small";
    enginePref?: string;
    layoutPrefs?: string[];
    brandPref?: string;
  },
  boat: InventoryItem
) {
  let s = 0;
  if (!boat.available) return -1;

  if (answers.budget) {
    const within = Math.abs(boat.salePrice - answers.budget) / answers.budget;
    if (within <= 0.15) s += 30;
    else if (within <= 0.3) s += 10;
    else s -= 10;
  }

  if (answers.partySize) s += boat.maxPersons >= answers.partySize ? 20 : -15;

  if (answers.activities?.length) {
    const fs = new Set((boat.features || []).map((f) => f.toLowerCase()));
    answers.activities.forEach((a) => {
      if (fs.has(a)) s += 8;
    });
  }

  if (answers.waterType === "big") {
    if (boat.toonType === "tritoon") s += 15;
    if (boat.hp >= 200) s += 10;
  } else if (answers.waterType === "small" && boat.hp <= 150) s += 8;

  if (answers.enginePref)
    s += boat.engineBrand?.toLowerCase() === answers.enginePref ? 6 : -2;

  if (answers.layoutPrefs?.length) {
    const fs = new Set((boat.features || []).map((f) => f.toLowerCase()));
    answers.layoutPrefs.forEach((l) => {
      if (fs.has(l)) s += 6;
    });
  }

  if (answers.brandPref && boat.brand?.toLowerCase() === answers.brandPref) s += 5;
  return s;
}

function nextHigherTerm(
  table: { term: number; apr: number }[],
  desired: number
): { term: number; apr: number } {
  const sorted = (table || []).slice().sort((a, b) => a.term - b.term);
  return sorted.find((r) => r.term >= desired) || sorted[sorted.length - 1] || { term: desired, apr: 0 };
}

/** Totals calculator with trailer tax and trade-in credit rules */
function calcTotals({
  selectedBoat,
  addons,
  selectedAddons,
  finance,
  nextHigherTermFn = nextHigherTerm,
}: {
  selectedBoat: InventoryItem | undefined;
  addons: AddOn[];
  selectedAddons: Record<string, boolean>;
  finance: {
    taxRatePct: number; // main
    trailerTaxRatePct: number; // 6.875
    docFee: number;
    registration: number;
    apr: number;
    termMonths: number;
    downPayment: number;
    includeTaxOnAddons: boolean;
    tradeInValue: number;
    payoff: number;
    applyTradeInTaxCredit: boolean;
    creditTier: "Excellent" | "Good" | "Fair" | "Manual";
    aprMatrix: Record<string, { term: number; apr: number }[]>;
    minAmountByTerm: Record<string, number>;
  };
  nextHigherTermFn?: typeof nextHigherTerm;
}) {
  if (!selectedBoat) return null;

  const base = selectedBoat.salePrice;

  const addonSubtotal = Object.entries(selectedAddons || {}).reduce((sum, [code, on]) => {
    if (!on) return sum;
    const add = addons.find((a) => a.code === code);
    return sum + (add?.price || 0);
  }, 0);

  const taxableAdds = (addons || []).filter((a) => selectedAddons?.[a.code] && a.taxable);
  const taxableTrailerAdds = taxableAdds.filter((a) =>
    a.code.toUpperCase().includes("TRAILER")
  );
  const taxableNonTrailerAdds = taxableAdds.filter(
    (a) => !a.code.toUpperCase().includes("TRAILER")
  );
  const taxableTrailerTotal = taxableTrailerAdds.reduce((s, a) => s + a.price, 0);
  const taxableNonTrailerTotal = taxableNonTrailerAdds.reduce((s, a) => s + a.price, 0);

  // APR via next-higher term (unless Manual)
  const desired = finance.termMonths;
  const tierTable =
    finance.creditTier === "Manual"
      ? []
      : finance.aprMatrix?.[finance.creditTier] || [];
  const picked =
    finance.creditTier === "Manual"
      ? { term: desired, apr: finance.apr }
      : nextHigherTermFn(tierTable, desired);
  const selectedTerm = picked?.term ?? desired;
  const aprUsed = picked?.apr ?? finance.apr;

  // Tax base; trade-in credit applies to MAIN ONLY; trailer base unaffected
  const includeAdds = !!finance.includeTaxOnAddons;
  const mainTaxBasePre = base + (includeAdds ? taxableNonTrailerTotal : 0);
  const trailerTaxBasePre = includeAdds ? taxableTrailerTotal : 0;

  const tradeCredit = finance.applyTradeInTaxCredit
    ? Math.max(0, finance.tradeInValue || 0)
    : 0;

  const mainTaxBase = Math.max(0, mainTaxBasePre - tradeCredit);
  const trailerTaxBase = Math.max(0, trailerTaxBasePre);

  const taxMain = mainTaxBase * (finance.taxRatePct / 100);
  const taxTrailer = trailerTaxBase * (finance.trailerTaxRatePct / 100);
  const tax = taxMain + taxTrailer;

  const outTheDoor =
    base +
    addonSubtotal +
    tax +
    finance.docFee +
    finance.registration -
    Math.max(0, finance.tradeInValue || 0) +
    Math.max(0, finance.payoff || 0);

  const grossDue = Math.max(0, outTheDoor);
  const amountToFinance = Math.max(0, grossDue - (finance.downPayment || 0));
  const payment = monthlyPayment({
    amount: amountToFinance,
    apr: aprUsed,
    months: selectedTerm,
  });

  // Term minimums validation
  const thresholds = finance.minAmountByTerm || {};
  const sortedTerms = Object.keys(thresholds)
    .map((k) => +k)
    .sort((a, b) => a - b);
  const violates = sortedTerms.filter(
    (t) => selectedTerm >= t && amountToFinance < thresholds[t]
  );
  const belowMinForSelectedTerm = violates.length > 0;

  let suggestedTerm = selectedTerm;
  if (belowMinForSelectedTerm) {
    const matrixTerms = (finance.aprMatrix?.[finance.creditTier] || [])
      .map((r) => r.term)
      .sort((a, b) => a - b);
    const meets = (term: number) =>
      !Object.entries(thresholds).some(
        ([th, min]) => term >= +th && amountToFinance < (min as number)
      );
    suggestedTerm =
      matrixTerms.filter((t) => t < selectedTerm && meets(t)).pop() ||
      matrixTerms[0] ||
      selectedTerm;
  }

  return {
    base,
    addonSubtotal,
    tax,
    taxBreakdown: { taxMain, taxTrailer, mainTaxBase, trailerTaxBase },
    outTheDoor: grossDue,
    amountToFinance,
    payment,
    aprUsed,
    effectiveTerm: selectedTerm,
    netTrade:
      Math.max(0, finance.tradeInValue || 0) - Math.max(0, finance.payoff || 0),
    belowMinForSelectedTerm,
    suggestedTerm,
  };
}

/** Safe clipboard copy with fallback to selection (works under strict Permissions-Policy) */
async function safeCopy(text: string) {
  if (!text) return false;
  try {
    if ((navigator as any)?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}

/** ---------------- UI bits ------------------ */
function Pill({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-3 py-1.5 rounded-full text-xs border transition " +
        (active ? "bg-blue-600 text-white border-blue-600" : "bg-white hover:bg-slate-50")
      }
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white border p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

/** ---------------- Main App ------------------ */
export default function PontoonAdvisorApp() {
  const [inventory, setInventory] = useState<InventoryItem[]>(DEFAULT_INVENTORY);
  const [addons, setAddons] = useState<AddOn[]>(DEFAULT_ADDONS);

  const [answers, setAnswers] = useState({
    name: "",
    email: "",
    phone: "",
    budget: 70000,
    partySize: 10,
    activities: ["family"],
    waterType: "big" as "big" | "small",
    enginePref: "honda",
    layoutPrefs: ["rear lounge", "quad lounge"],
    brandPref: "",
  });

  const [finance, setFinance] = useState({
    taxRatePct: 7.375,
    trailerTaxRatePct: 6.875,
    docFee: 199,
    registration: 150,
    apr: 7.99,
    termMonths: 180,
    downPayment: 5000,
    includeTaxOnAddons: true,
    tradeInValue: 0,
    payoff: 0,
    applyTradeInTaxCredit: true,
    creditTier: "Excellent" as "Excellent" | "Good" | "Fair" | "Manual",
    aprMatrix: {
      Excellent: [
        { term: 60, apr: 5.99 },
        { term: 84, apr: 6.19 },
        { term: 120, apr: 6.49 },
        { term: 180, apr: 6.99 },
        { term: 240, apr: 7.49 },
      ],
      Good: [
        { term: 60, apr: 7.49 },
        { term: 84, apr: 7.69 },
        { term: 120, apr: 7.99 },
        { term: 180, apr: 8.49 },
        { term: 240, apr: 8.99 },
      ],
      Fair: [
        { term: 60, apr: 9.99 },
        { term: 84, apr: 10.19 },
        { term: 120, apr: 10.49 },
        { term: 180, apr: 10.99 },
        { term: 240, apr: 11.49 },
      ],
    } as Record<string, { term: number; apr: number }[]>,
    minAmountByTerm: { 84: 15000, 120: 20000, 180: 30000, 240: 40000 } as Record<
      string,
      number
    >,
  });

  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>({
    TRAILER: false,
    COVER: false,
    WARRANTY: false,
    ELECTRONICS: false,
  });
  const [selectedBoatId, setSelectedBoatId] = useState<string>(
    DEFAULT_INVENTORY[0]?.id || ""
  );

  /** Load config (APR matrix + term minimums) from DB-backed API */
  useEffect(() => {
    (async () => {
      try {
        const cfg = await fetch("/api/config", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : null
        );
        if (cfg?.aprMatrix) {
          setFinance((f) => ({
            ...f,
            aprMatrix: cfg.aprMatrix,
            minAmountByTerm: cfg.minAmountByTerm || f.minAmountByTerm,
          }));
        }
      } catch {}
    })();
  }, []);

  /** Load inventory from DB-backed API (feed is normalized by cron) */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" });
        if (res.ok) {
          const items: InventoryItem[] = await res.json();
          if (Array.isArray(items) && items.length) {
            setInventory(items);
            setSelectedBoatId(items[0]?.id || selectedBoatId);
          }
        }
      } catch (e) {
        console.warn("Inventory API load failed; using fallback.", e);
      }
    })();
  }, []);

  const selectedBoat = useMemo(
    () => inventory.find((b) => b.id === selectedBoatId) ?? inventory[0],
    [inventory, selectedBoatId]
  );

  const ranked = useMemo(() => {
    const lower = {
      ...answers,
      enginePref: answers.enginePref?.toLowerCase() || "",
      brandPref: answers.brandPref?.toLowerCase() || "",
      activities: answers.activities?.map((a) => a.toLowerCase()) || [],
      layoutPrefs: answers.layoutPrefs?.map((a) => a.toLowerCase()) || [],
    };
    return [...inventory]
      .map((b) => ({ boat: b, score: scoreMatch(lower, b) }))
      .sort((a, b) => b.score - a.score);
  }, [inventory, answers]);

  const totals = useMemo(
    () =>
      calcTotals({
        selectedBoat,
        addons,
        selectedAddons,
        finance,
      }),
    [selectedBoat, selectedAddons, addons, finance]
  );

  function toggleAddon(code: string) {
    setSelectedAddons((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  function buildQuoteText() {
    if (!selectedBoat || !totals) return "";
    const lines: string[] = [];
    lines.push(
      `Customer: ${answers.name || "(name)"}  |  Email: ${
        answers.email || ""
      }  |  Phone: ${answers.phone || ""}`
    );
    lines.push(
      `Selected: ${selectedBoat.brand} ${selectedBoat.model} (${
        selectedBoat.lengthFt
      }ft ${selectedBoat.toonType}) — $${fmt(selectedBoat.salePrice)}`
    );
    lines.push(
      `Location: ${selectedBoat.location} | Engine: ${selectedBoat.engineBrand} ${selectedBoat.hp}hp`
    );
    lines.push("");
    lines.push("Add-ons:");
    addons.forEach((a) => {
      const on = !!selectedAddons[a.code];
      if (on) lines.push(`  [x] ${a.name}  $${fmt(a.price)}`);
    });
    lines.push("");
    lines.push(
      `Trade-in: $${fmt(finance.tradeInValue)}  |  Payoff: $${fmt(
        finance.payoff
      )}  |  Net: $${fmt(totals.netTrade)}`
    );
    lines.push(
      `Tax main (${finance.taxRatePct}%): $${fmt(
        totals.taxBreakdown.taxMain
      )}  (base after credit: $${fmt(totals.taxBreakdown.mainTaxBase)})`
    );
    lines.push(
      `Tax trailer (${finance.trailerTaxRatePct}%): $${fmt(
        totals.taxBreakdown.taxTrailer
      )}  (base: $${fmt(totals.taxBreakdown.trailerTaxBase)})`
    );
    lines.push(
      `Doc fee: $${fmt(finance.docFee)} | Registration: $${fmt(
        finance.registration
      )}`
    );
    lines.push(`Down payment: $${fmt(finance.downPayment)}`);
    lines.push("");
    lines.push(`Out-the-door: $${fmt(totals.outTheDoor)}`);
    lines.push(`Amount financed: $${fmt(totals.amountToFinance)}`);
    lines.push(
      `Est. monthly (${totals.effectiveTerm} mo @ ${totals.aprUsed?.toFixed?.(
        2
      )}%): $${fmt(totals.payment)}`
    );
    if (totals.belowMinForSelectedTerm) {
      lines.push(
        `NOTE: Selected term ${totals.effectiveTerm} months may not be bank-eligible at this amount. Suggested term: ${totals.suggestedTerm} months. Subject to lender approval.`
      );
    }
    return lines.join("\n");
  }

  async function exportQuoteTXT() {
    const text = buildQuoteText();
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Quote-${selectedBoat?.brand}-${selectedBoat?.model}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportQuotePDF() {
    if (!selectedBoat || !totals) return;
    try {
      const res = await fetch("/api/quote-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, selectedBoat, addons, selectedAddons, finance, totals }),
      });
      if (!res.ok) throw new Error("PDF service failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quote-${selectedBoat.brand}-${selectedBoat.model}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("PDF error: " + e.message);
    }
  }

  async function textQuote() {
    if (!answers.phone) {
      alert("Add a phone number first.");
      return;
    }
    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // If your /api/sms expects x-api-key, add it here:
        // headers: { "Content-Type": "application/json", "x-api-key": "<APP_API_KEY>" }
        body: JSON.stringify({
          phone: answers.phone,
          payload: { answers, selectedBoatId, selectedAddons, finance },
        }),
      });
      if (!res.ok) throw new Error("SMS failed");
      alert("Text sent!");
    } catch (e: any) {
      alert("SMS error: " + e.message);
    }
  }

  async function copySelectedQuote() {
    const sel = window?.getSelection?.()?.toString?.() || "";
    const fallback =
      totals && selectedBoat
        ? `${selectedBoat.brand} ${selectedBoat.model} — $${fmt(
            selectedBoat.salePrice
          )}\n` +
          `Out-the-door $${fmt(totals.outTheDoor)} | Financed $${fmt(
            totals.amountToFinance
          )} | ` +
          `Est. ${totals.effectiveTerm}mo @ ${totals.aprUsed?.toFixed?.(2)}% ≈ $${fmt(
            totals.payment
          )}`
        : "Pontoon Advisor quote";
    const text = sel.trim() || fallback;
    const ok = await safeCopy(text);
    if (!ok) {
      alert(
        "Copy blocked by browser policy. I placed the text in a hidden field—press Ctrl/Cmd+C."
      );
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "8px";
        ta.style.top = "8px";
        ta.style.width = "1px";
        ta.style.height = "1px";
        ta.style.opacity = "0.001";
        document.body.appendChild(ta);
        ta.select();
      } catch {}
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="font-semibold">Pontoon Advisor — AI Sales Guide</span>
          <a
            className="ml-auto text-sm px-3 py-1.5 border rounded-lg hover:bg-slate-50"
            href="/admin"
          >
            Admin
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-2 gap-6">
        {/* Left column */}
        <section className="space-y-4">
          <div className="rounded-2xl shadow-sm bg-white border p-5 space-y-5">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm">
              <p className="font-medium">
                Hi! I’m your Boat World guide. Let’s find the right pontoon and your best payment.
              </p>
              <p className="mt-2">
                Answer a few quick questions—your matches, price, taxes, and monthly will update
                instantly.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm grid gap-1">
                <span className="text-slate-700">Your name</span>
                <input
                  className="border rounded-lg px-3 py-2"
                  value={answers.name}
                  onChange={(e) => setAnswers((a) => ({ ...a, name: e.target.value }))}
                  placeholder="Customer name"
                />
              </label>
              <label className="text-sm grid gap-1">
                <span className="text-slate-700">Email</span>
                <input
                  className="border rounded-lg px-3 py-2"
                  value={answers.email}
                  onChange={(e) => setAnswers((a) => ({ ...a, email: e.target.value }))}
                  placeholder="customer@email.com"
                  type="email"
                />
              </label>
              <label className="text-sm grid gap-1">
                <span className="text-slate-700">Phone</span>
                <input
                  className="border rounded-lg px-3 py-2"
                  value={answers.phone}
                  onChange={(e) => setAnswers((a) => ({ ...a, phone: e.target.value }))}
                  placeholder="555-555-5555"
                />
              </label>

              <label className="text-sm grid gap-2">
                <span className="text-slate-700">Budget: ${fmt(answers.budget)}</span>
                <input
                  type="range"
                  min={20000}
                  max={120000}
                  step={500}
                  value={answers.budget}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, budget: Number(e.target.value) }))
                  }
                />
              </label>

              <label className="text-sm grid gap-2">
                <span className="text-slate-700">How many people? ({answers.partySize})</span>
                <input
                  type="range"
                  min={2}
                  max={14}
                  step={1}
                  value={answers.partySize}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, partySize: Number(e.target.value) }))
                  }
                />
              </label>

              <div className="text-sm grid gap-1">
                <span className="text-slate-700">Water type</span>
                <div className="flex gap-2 flex-wrap">
                  <Pill
                    active={answers.waterType === "small"}
                    onClick={() => setAnswers((a) => ({ ...a, waterType: "small" }))}
                  >
                    Small/medium lakes
                  </Pill>
                  <Pill
                    active={answers.waterType === "big"}
                    onClick={() => setAnswers((a) => ({ ...a, waterType: "big" }))}
                  >
                    Large/busy lakes
                  </Pill>
                </div>
              </div>

              <div className="text-sm grid gap-1">
                <span className="text-slate-700">Engine preference</span>
                <div className="flex gap-2 flex-wrap">
                  <Pill
                    active={!answers.enginePref}
                    onClick={() => setAnswers((a) => ({ ...a, enginePref: "" }))}
                  >
                    No preference
                  </Pill>
                  {["honda", "mercury", "yamaha", "suzuki"].map((b) => (
                    <Pill
                      key={b}
                      active={answers.enginePref === b}
                      onClick={() => setAnswers((a) => ({ ...a, enginePref: b }))}
                    >
                      {b[0].toUpperCase() + b.slice(1)}
                    </Pill>
                  ))}
                </div>
              </div>

              <div className="text-sm grid gap-1">
                <span className="text-slate-700">Brand preference (optional)</span>
                <div className="flex gap-2 flex-wrap">
                  {["", "tahoe", "bentley", "princecraft", "avalon"].map((b) => (
                    <Pill
                      key={b || "none"}
                      active={answers.brandPref === b}
                      onClick={() => setAnswers((a) => ({ ...a, brandPref: b }))}
                    >
                      {b ? b[0].toUpperCase() + b.slice(1) : "No preference"}
                    </Pill>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Activities & layout</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  "family",
                  "fish",
                  "luxury",
                  "performance",
                  "value",
                  "rear lounge",
                  "quad lounge",
                  "swingback",
                ].map((tag) => {
                  const active = answers.activities
                    .map((v) => v.toLowerCase())
                    .includes(tag.toLowerCase());
                  return (
                    <Pill
                      key={tag}
                      active={active}
                      onClick={() =>
                        setAnswers((a) => toggleInArray(a as any, "activities", tag))
                      }
                    >
                      {tag}
                    </Pill>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500">
                Tip: choose a couple to guide the match scoring.
              </p>
            </div>

            {/* Selected boat overview */}
            {selectedBoat && (
              <div className="grid sm:grid-cols-[160px,1fr] gap-4">
                <img
                  src={selectedBoat.imageUrl}
                  className="w-full h-32 object-cover rounded-xl"
                  alt={selectedBoat.model}
                />
                <div>
                  <p className="font-medium">
                    {selectedBoat.year ? `${selectedBoat.year} ` : ""}
                    {selectedBoat.brand} {selectedBoat.model} — ${fmt(selectedBoat.salePrice)}
                  </p>
                  <p className="text-sm text-slate-600">
                    {selectedBoat.lengthFt}′ {selectedBoat.toonType} • {selectedBoat.engineBrand}{" "}
                    {selectedBoat.hp}hp • {selectedBoat.maxPersons} persons
                  </p>
                  <p className="text-xs text-slate-500">
                    {selectedBoat.location}
                    {selectedBoat.stockNumber ? ` • Stock #${selectedBoat.stockNumber}` : ""}
                  </p>
                </div>
              </div>
            )}

            {/* Add-ons */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Add-ons</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {addons.map((a) => {
                  const on = !!selectedAddons[a.code];
                  const trailerTag = a.code.toUpperCase().includes("TRAILER")
                    ? " • Trailer rate"
                    : "";
                  return (
                    <button
                      key={a.code}
                      type="button"
                      onClick={() => toggleAddon(a.code)}
                      className={
                        "text-left rounded-xl border p-3 bg-white hover:shadow transition " +
                        (on ? "ring-2 ring-emerald-500" : "")
                      }
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-slate-500">
                            Code: {a.code} • {a.taxable ? "Taxable" : "Non-taxable"}
                            {trailerTag}
                          </p>
                        </div>
                        <div
                          className={
                            "px-2 py-1 text-xs rounded " +
                            (on ? "bg-emerald-600 text-white" : "bg-slate-100")
                          }
                        >
                          {on ? "Added" : `+$${fmt(a.price)}`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Finance summary */}
            {totals && (
              <>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Stat label="Out-the-door" value={`$${fmt(totals.outTheDoor)}`} />
                  <Stat label="Amount financed" value={`$${fmt(totals.amountToFinance)}`} />
                  <Stat
                    label={`Est. monthly (${totals.effectiveTerm} mo @ ${totals.aprUsed?.toFixed?.(
                      2
                    )}%)`}
                    value={`$${fmt(totals.payment)}`}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Net trade equity: ${fmt(totals.netTrade)} (Trade-in ${fmt(
                    finance.tradeInValue
                  )} − Payoff ${fmt(finance.payoff)})
                </p>
                <p className="text-xs text-slate-500">
                  Tax: main ${fmt(Math.round(totals.taxBreakdown.taxMain))} + trailer $
                  {fmt(Math.round(totals.taxBreakdown.taxTrailer))} (bases: main $
                  {fmt(Math.round(totals.taxBreakdown.mainTaxBase))}, trailer $
                  {fmt(Math.round(totals.taxBreakdown.trailerTaxBase))})
                </p>

                {totals.belowMinForSelectedTerm && (
                  <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
                    The selected term of <strong>{totals.effectiveTerm} months</strong> may not be
                    bank-eligible for this amount financed (${fmt(totals.amountToFinance)}).
                    Suggested term: <strong>{totals.suggestedTerm} months</strong>.{" "}
                    <em>Subject to lender approval.</em>
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportQuoteTXT}
                className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
              >
                Download Quote (TXT)
              </button>
              <button
                onClick={copySelectedQuote}
                className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
              >
                Copy Quote
              </button>
              <button
                onClick={exportQuotePDF}
                className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
              >
                Export PDF Quote
              </button>
              <button
                onClick={textQuote}
                className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
              >
                Text me this quote
              </button>
            </div>

            <p className="text-xs text-slate-500 italic mt-1">Subject to lender approval.</p>
          </div>
        </section>

        {/* Right column: Matches + Finance controls */}
        <section className="space-y-4">
          {/* Matches */}
          <div className="rounded-2xl shadow-sm bg-white border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Best Matches</h3>
            </div>
            <div className="grid gap-3">
              {ranked.map(({ boat, score }) => (
                <button
                  key={boat.id}
                  onClick={() => setSelectedBoatId(boat.id)}
                  className={
                    "text-left rounded-xl border p-3 bg-white hover:shadow transition " +
                    (selectedBoatId === boat.id ? "ring-2 ring-blue-500" : "")
                  }
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={boat.imageUrl}
                      className="h-16 w-24 object-cover rounded-lg"
                      alt={boat.model}
                    />
                    <div className="flex-1">
                      <p className="font-medium">
                        {boat.year ? `${boat.year} ` : ""}
                        {boat.brand} {boat.model}
                      </p>
                      <p className="text-xs text-slate-600">
                        {boat.lengthFt}′ {boat.toonType} • {boat.engineBrand} {boat.hp}hp •{" "}
                        {boat.maxPersons} persons
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-semibold">${fmt(boat.salePrice)}</span>
                        <span className="text-xs text-slate-500">Match score: {score}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Finance controls */}
          <div className="rounded-2xl shadow-sm bg-white border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Finance & Fees</h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {/* Credit tier / APR */}
              <div className="text-sm grid gap-1">
                <span className="text-slate-700">
                  APR (
                  {finance.creditTier === "Manual"
                    ? `${finance.apr}%`
                    : `${totals?.aprUsed?.toFixed?.(2) || finance.apr.toFixed?.(2)}%`}
                  )
                </span>
                <div className="flex gap-2 flex-wrap">
                  {(["Excellent", "Good", "Fair", "Manual"] as const).map((tier) => (
                    <Pill
                      key={tier}
                      active={finance.creditTier === tier}
                      onClick={() => setFinance((f) => ({ ...f, creditTier: tier }))}
                    >
                      {tier}
                    </Pill>
                  ))}
                </div>
                {finance.creditTier === "Manual" && (
                  <input
                    type="range"
                    min={0}
                    max={18}
                    step={0.25}
                    value={finance.apr}
                    onChange={(e) =>
                      setFinance((f) => ({ ...f, apr: +Number(e.target.value).toFixed(2) }))
                    }
                  />
                )}
              </div>

              {/* Term */}
              <label className="text-sm grid gap-2">
                <span className="text-slate-700">
                  Term ({totals?.effectiveTerm ?? finance.termMonths} mo)
                </span>
                <input
                  type="range"
                  min={36}
                  max={240}
                  step={6}
                  value={finance.termMonths}
                  onChange={(e) =>
                    setFinance((f) => ({ ...f, termMonths: Number(e.target.value) }))
                  }
                />
              </label>

              {/* Down payment */}
              <label className="text-sm grid gap-2">
                <span className="text-slate-700">Down payment: ${fmt(finance.downPayment)}</span>
                <input
                  type="range"
                  min={0}
                  max={40000}
                  step={500}
                  value={finance.downPayment}
                  onChange={(e) =>
                    setFinance((f) => ({ ...f, downPayment: Number(e.target.value) }))
                  }
                />
              </label>

              {/* Tax rates */}
              <div className="text-sm grid gap-2">
                <span className="text-slate-700">
                  Sales tax (main {finance.taxRatePct}%, trailer {finance.trailerTaxRatePct}%)
                </span>
                <label className="text-xs">
                  Main rate
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={0.125}
                    value={finance.taxRatePct}
                    onChange={(e) =>
                      setFinance((f) => ({ ...f, taxRatePct: +Number(e.target.value).toFixed(3) }))
                    }
                  />
                </label>
                <label className="text-xs">
                  Trailer rate
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={0.125}
                    value={finance.trailerTaxRatePct}
                    onChange={(e) =>
                      setFinance((f) => ({
                        ...f,
                        trailerTaxRatePct: +Number(e.target.value).toFixed(3),
                      }))
                    }
                  />
                </label>
              </div>

              {/* Fees */}
              <label className="text-sm grid gap-2">
                <span className="text-slate-700">Doc fee: ${fmt(finance.docFee)}</span>
                <input
                  type="range"
                  min={0}
                  max={999}
                  step={25}
                  value={finance.docFee}
                  onChange={(e) =>
                    setFinance((f) => ({ ...f, docFee: Number(e.target.value) }))
                  }
                />
              </label>

              <label className="text-sm grid gap-2">
                <span className="text-slate-700">Registration: ${fmt(finance.registration)}</span>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={25}
                  value={finance.registration}
                  onChange={(e) =>
                    setFinance((f) => ({ ...f, registration: Number(e.target.value) }))
                  }
                />
              </label>

              {/* Include add-ons in tax base */}
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={finance.includeTaxOnAddons}
                  onChange={(e) =>
                    setFinance((f) => ({ ...f, includeTaxOnAddons: e.target.checked }))
                  }
                />
                Include taxable add-ons in tax base
              </label>

              {/* Trade-in & payoff */}
              <label className="text-sm grid gap-2">
                <span className="text-slate-700">Trade-in value: ${fmt(finance.tradeInValue)}</span>
                <input
                  type="range"
                  min={0}
                  max={100000}
                  step={500}
                  value={finance.tradeInValue}
                  onChange={(e) =>
                    setFinance((f) => ({ ...f, tradeInValue: Number(e.target.value) }))
                  }
                />
              </label>

              <label className="text-sm grid gap-2">
                <span className="text-slate-700">Loan payoff: ${fmt(finance.payoff)}</span>
                <input
                  type="range"
                  min={0}
                  max={100000}
                  step={500}
                  value={finance.payoff}
                  onChange={(e) =>
                    setFinance((f) => ({ ...f, payoff: Number(e.target.value) }))
                  }
                />
              </label>

              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={finance.applyTradeInTaxCredit}
                  onChange={(e) =>
                    setFinance((f) => ({ ...f, applyTradeInTaxCredit: e.target.checked }))
                  }
                />
                Apply trade-in as tax credit (main base only)
              </label>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8" />
    </div>
  );
}

/** ---------------- Dev Self-tests (kept & expanded) ---------------- */
if (typeof window !== "undefined" && !(window as any).__PA_SKIP_TESTS__) {
  // monthlyPayment zero APR
  console.assert(
    Math.round(monthlyPayment({ amount: 12000, apr: 0, months: 12 })) === 1000,
    "mp zero apr"
  );
  // amortized around a known range
  const p = monthlyPayment({ amount: 20000, apr: 6, months: 120 });
  console.assert(p > 220 && p < 230, "mp amortized range");

  // toggleInArray case-insensitive
  const t1 = toggleInArray({ activities: ["Family"] } as any, "activities", "family");
  console.assert((t1.activities || []).length === 0, "toggle remove");
  const t2 = toggleInArray({ activities: [] } as any, "activities", "FAMILY");
  console.assert((t2.activities || []).includes("family"), "toggle add");

  // scoreMatch positive sanity
  const s = scoreMatch(
    {
      budget: 70000,
      partySize: 10,
      activities: ["family"],
      waterType: "big",
      enginePref: "honda",
      layoutPrefs: ["rear lounge"],
      brandPref: "tahoe",
    },
    DEFAULT_INVENTORY[0]
  );
  console.assert(typeof s === "number" && s > 0, "score positive for close match");

  // nextHigherTerm tests
  const table = [
    { term: 60, apr: 5 },
    { term: 120, apr: 6 },
    { term: 180, apr: 7 },
  ];
  const pick1 = nextHigherTerm(table, 72); // expect 120
  console.assert(pick1.term === 120, "nextHigherTerm picks next up");
  const pick2 = nextHigherTerm(table, 240); // expect highest 180
  console.assert(pick2.term === 180, "nextHigherTerm falls back to highest");

  // Add-on tax base tests
  const boat = DEFAULT_INVENTORY[0];
  const baseFinance = {
    taxRatePct: 7.375,
    trailerTaxRatePct: 6.875,
    docFee: 0,
    registration: 0,
    apr: 6,
    termMonths: 120,
    downPayment: 0,
    includeTaxOnAddons: true,
    tradeInValue: 0,
    payoff: 0,
    applyTradeInTaxCredit: true,
    creditTier: "Manual" as const,
    aprMatrix: {},
    minAmountByTerm: {},
  };
  // COVER (taxable, non-trailer) increases MAIN tax base
  const cover = DEFAULT_ADDONS.find((a) => a.code === "COVER")!;
  const totalsCover = calcTotals({
    selectedBoat: boat,
    addons: DEFAULT_ADDONS,
    selectedAddons: { COVER: true },
    finance: baseFinance,
  })!;
  console.assert(
    Math.round(totalsCover.taxBreakdown.mainTaxBase) ===
      Math.round(boat.salePrice + cover.price),
    "COVER increases main tax base"
  );
  // TRAILER increases TRAILER tax base only
  const trailer = DEFAULT_ADDONS.find((a) => a.code === "TRAILER")!;
  const totalsTrailer = calcTotals({
    selectedBoat: boat,
    addons: DEFAULT_ADDONS,
    selectedAddons: { TRAILER: true },
    finance: baseFinance,
  })!;
  console.assert(
    Math.round(totalsTrailer.taxBreakdown.trailerTaxBase) === Math.round(trailer.price),
    "TRAILER increases trailer base"
  );
  console.assert(
    Math.round(totalsTrailer.taxBreakdown.mainTaxBase) === Math.round(boat.salePrice),
    "TRAILER leaves main base unchanged"
  );
  // Trade-in credit applies to MAIN only; floors at 0; not applied to trailer
  const financeWithTrade = { ...baseFinance, tradeInValue: 10000 };
  const totalsTrade = calcTotals({
    selectedBoat: boat,
    addons: DEFAULT_ADDONS,
    selectedAddons: { TRAILER: true, COVER: true },
    finance: financeWithTrade,
  })!;
  console.assert(
    totalsTrade.taxBreakdown.mainTaxBase >= 0,
    "main base floors at 0 after trade credit"
  );
  console.assert(
    Math.round(totalsTrade.taxBreakdown.trailerTaxBase) === Math.round(trailer.price),
    "no credit on trailer tax base"
  );
}
