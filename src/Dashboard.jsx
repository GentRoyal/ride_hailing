import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, BarChart, Bar, ResponsiveContainer
} from "recharts";

const API = "https://ride-hailing-nga2.onrender.com/api";


const STATUS_COLORS = {
  completed: "#22c55e", in_progress: "#3b82f6",
  requested: "#f59e0b", accepted: "#8b5cf6", cancelled: "#ef4444",
};
const PAY_COLORS = { cash: "#6366f1", card: "#22c55e", wallet: "#f59e0b" };
const VEH_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];

function fmt(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return "₦" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "₦" + (n / 1_000).toFixed(1) + "K";
  return "₦" + Number(n).toLocaleString();
}
function num(n) { return n == null ? "—" : Number(n).toLocaleString(); }
function pct(n, t) { return t ? ((n / t) * 100).toFixed(1) + "%" : "0%"; }

// ─── Shared ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || "#888";
  return (
    <span style={{
      background: c + "22", color: c, border: `1px solid ${c}44`,
      borderRadius: 5, padding: "2px 8px", fontSize: 10,
      fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
    }}>{(status || "").replace("_", " ")}</span>
  );
}

function Section({ title, children, style }) {
  return (
    <div style={{
      background: "#111", border: "1px solid #1e1e1e",
      borderRadius: 14, padding: "18px 20px", ...style,
    }}>
      {title && (
        <p style={{ margin: "0 0 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#444", textTransform: "uppercase" }}>
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#141414", border: "1px solid #1e1e1e",
      borderRadius: 12, padding: "16px 18px",
    }}>
      <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#555", textTransform: "uppercase" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: color || "#f1f5f9", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#444" }}>{sub}</p>}
    </div>
  );
}

function Loader() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        border: "2px solid #222", borderTopColor: "#6366f1",
        animation: "spin 0.8s linear infinite",
      }} />
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

function DonutChart({ data, colorFn, keyFn, size = 130 }) {
  if (!data?.length) return <p style={{ color: "#555", fontSize: 12 }}>No data</p>;
  const total = data.reduce((s, d) => s + Number(d.count || 0), 0) || 1;
  let angle = -Math.PI / 2;
  const cx = size / 2, cy = size / 2, r = size * 0.41, ir = size * 0.26;

  function arcPath(s, e) {
    const { cos, sin } = Math;
    const x1 = cx + r * cos(s), y1 = cy + r * sin(s);
    const x2 = cx + r * cos(e), y2 = cy + r * sin(e);
    const x3 = cx + ir * cos(e), y3 = cy + ir * sin(e);
    const x4 = cx + ir * cos(s), y4 = cy + ir * sin(s);
    const lg = e - s > Math.PI ? 1 : 0;
    return `M${x1},${y1}A${r},${r},0,${lg},1,${x2},${y2}L${x3},${y3}A${ir},${ir},0,${lg},0,${x4},${y4}Z`;
  }

  const slices = data.map(d => {
    const count = Number(d.count || 0);
    const start = angle;
    angle += (count / total) * 2 * Math.PI;
    const key = keyFn(d);
    return { key, color: colorFn(d, key), start, end: angle, count };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={arcPath(s.start, s.end)} fill={s.color} stroke="#111" strokeWidth={2} />
        ))}
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#f1f5f9" fontSize={18} fontWeight={700} fontFamily="'JetBrains Mono',monospace">
          {num(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#555" fontSize={9}>total</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#999", textTransform: "capitalize", minWidth: 76 }}>
              {String(s.key).replace(/_/g, " ")}
            </span>
            <span style={{ fontSize: 11, color: "#f1f5f9", fontFamily: "'JetBrains Mono',monospace", marginLeft: "auto", paddingLeft: 8 }}>
              {pct(s.count, total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recharts Tooltip ─────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1a1a1a", border: "1px solid #2a2a2a",
      borderRadius: 8, padding: "10px 14px", fontSize: 12,
    }}>
      <p style={{ margin: "0 0 6px", color: "#888", fontWeight: 600 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: "3px 0", color: p.color, fontFamily: "'JetBrains Mono', monospace" }}>
          {p.name}: {currency ? fmt(p.value) : num(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav({ page, setPage, onRefresh, loading, lastUpdated }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 24, paddingBottom: 18, borderBottom: "1px solid #1a1a1a",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em", color: "#f8fafc" }}>
            🚖 Ride-Hailing Dashboard
          </h1>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "#444" }}>
            {lastUpdated ? `Last updated ${lastUpdated}` : "Loading…"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, background: "#141414", border: "1px solid #1e1e1e", borderRadius: 9, padding: 3 }}>
          {["Overview", "Analytics"].map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              background: page === p ? "#1e1e2e" : "transparent",
              border: page === p ? "1px solid #2e2e4e" : "1px solid transparent",
              borderRadius: 7, color: page === p ? "#a78bfa" : "#555",
              padding: "6px 18px", fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", fontWeight: page === p ? 600 : 400,
              transition: "all 0.15s",
            }}>{p}</button>
          ))}
        </div>
      </div>
      <button onClick={onRefresh} disabled={loading} style={{
        background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8,
        color: loading ? "#444" : "#888", padding: "8px 16px",
        fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em",
      }}>
        {loading ? "↺ Refreshing…" : "↺ Refresh"}
      </button>
    </div>
  );
}

// ─── Overview Page ────────────────────────────────────────────────────────────

function OverviewPage({ kpi, statusData, paymentMethods, vehicleTypes, topDrivers, recentTrips }) {
  const vColorMap = vehicleTypes.reduce((m, v, i) => ({ ...m, [v.vehicle_type]: VEH_COLORS[i % 5] }), {});

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Total Trips" value={num(kpi?.total_trips)} />
        <KpiCard label="Completed" value={num(kpi?.completed_trips)} color="#22c55e" />
        <KpiCard label="Active Now" value={num(kpi?.active_trips)} color="#3b82f6" />
        <KpiCard label="Cancelled" value={num(kpi?.cancelled_trips)} color="#ef4444" />
        <KpiCard label="Total Revenue" value={fmt(kpi?.total_revenue_ngn)} color="#a78bfa" />
        <KpiCard label="Avg Fare" value={fmt(kpi?.avg_fare_ngn)} />
        <KpiCard label="Drivers" value={num(kpi?.total_drivers)} sub={`${kpi?.available_drivers || 0} available`} />
        <KpiCard label="Riders" value={num(kpi?.total_riders)} />
        <KpiCard label="Avg Distance" value={kpi?.avg_distance_km ? kpi.avg_distance_km + " km" : "—"} />
        <KpiCard label="Avg Driver Rating" value={kpi?.avg_driver_rating ? Number(kpi.avg_driver_rating).toFixed(1) + " ⭐" : "—"} color="#f59e0b" />
        <KpiCard label="Pending Payments" value={num(kpi?.pending_payments)} color="#f87171" />
        <KpiCard label="Payments Processed" value={fmt(kpi?.total_payments_processed)} color="#34d399" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <Section title="Trip Status">
          <DonutChart data={statusData} colorFn={d => STATUS_COLORS[d.status] || "#888"} keyFn={d => d.status} />
        </Section>
        <Section title="Payment Methods">
          <DonutChart
            data={paymentMethods.map(p => ({ ...p, count: p.count }))}
            colorFn={d => PAY_COLORS[d.payment_method] || "#888"}
            keyFn={d => d.payment_method}
          />
        </Section>
        <Section title="Vehicle Types">
          <DonutChart
            data={vehicleTypes.map(v => ({ ...v, count: v.driver_count }))}
            colorFn={(d, k) => vColorMap[k] || "#888"}
            keyFn={d => d.vehicle_type}
          />
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Section title="Top Drivers by Earnings">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topDrivers.map((d, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 11px", background: "#0d0d0d",
                border: "1px solid #1a1a1a", borderRadius: 8,
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: VEH_COLORS[i % 5] + "22",
                  border: `1px solid ${VEH_COLORS[i % 5]}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: VEH_COLORS[i % 5], flexShrink: 0,
                }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.full_name}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: "#555", textTransform: "capitalize" }}>
                    {d.vehicle_type} · {d.completed_trips} trips · ⭐ {d.rating}
                  </p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
                  {fmt(d.total_earnings_ngn)}
                </span>
              </div>
            ))}
            {!topDrivers.length && <p style={{ color: "#555", fontSize: 12 }}>No driver data</p>}
          </div>
        </Section>

        <Section title="Recent Trips">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentTrips.map((t, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "9px 11px", background: "#0d0d0d",
                border: "1px solid #1a1a1a", borderRadius: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: "#555" }}>#{t.trip_id}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: "#888" }}>{t.rider_name || "—"} → {t.driver_name || "Unassigned"}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: "#555", textTransform: "capitalize" }}>
                    {t.vehicle_type || "—"} · {t.distance_km ? t.distance_km + " km" : "—"}
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#f1f5f9", fontFamily: "'JetBrains Mono',monospace" }}>
                    {t.fare_ngn ? "₦" + Number(t.fare_ngn).toLocaleString() : "—"}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: "#555" }}>
                    {t.created_at ? new Date(t.created_at).toLocaleDateString("en-NG", { month: "short", day: "numeric" }) : ""}
                  </p>
                </div>
              </div>
            ))}
            {!recentTrips.length && <p style={{ color: "#555", fontSize: 12 }}>No trips yet</p>}
          </div>
        </Section>
      </div>
    </>
  );
}

// ─── Analytics Page ───────────────────────────────────────────────────────────

function AnalyticsPage({ monthly, topDrivers, paymentMethods, ratingsData }) {
  const avgRating = ratingsData?.length
    ? (ratingsData.reduce((s, r) => s + Number(r.rating_value) * Number(r.count), 0) /
       ratingsData.reduce((s, r) => s + Number(r.count), 0)).toFixed(2)
    : "—";

  return (
    <>
      <Section title="Revenue & Trip Volume — Monthly Trend" style={{ marginBottom: 14 }}>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={monthly} margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis dataKey="month" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + "k" : v} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip currency={false} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#666", paddingTop: 10 }} />
            <Line yAxisId="left" type="monotone" dataKey="revenue_ngn" name="Revenue (₦)"
              stroke="#a78bfa" strokeWidth={2.5}
              dot={{ fill: "#a78bfa", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "#a78bfa" }} />
            <Line yAxisId="right" type="monotone" dataKey="total_trips" name="Total Trips"
              stroke="#22c55e" strokeWidth={2.5} strokeDasharray="5 3"
              dot={{ fill: "#22c55e", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "#22c55e" }} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Completed Trips — Monthly Trend" style={{ marginBottom: 14 }}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={monthly} margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis dataKey="month" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#666", paddingTop: 10 }} />
            <Line type="monotone" dataKey="completed_trips" name="Completed Trips"
              stroke="#3b82f6" strokeWidth={2.5}
              dot={{ fill: "#3b82f6", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "#3b82f6" }} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 12, marginBottom: 14 }}>
        <Section title="Driver Earnings Comparison">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topDrivers.slice(0, 8)} layout="vertical"
              margin={{ top: 0, right: 16, left: 90, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + "k" : v} />
              <YAxis type="category" dataKey="full_name" tick={{ fill: "#888", fontSize: 11 }}
                axisLine={false} tickLine={false} width={90} />
              <Tooltip content={<CustomTooltip currency />} />
              <Bar dataKey="total_earnings_ngn" name="Earnings" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title={`Ratings Distribution · avg ${avgRating} ⭐`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            {[5, 4, 3, 2, 1].map(star => {
              const row = ratingsData?.find(r => Number(r.rating_value) === star);
              const count = row ? Number(row.count) : 0;
              const total = ratingsData?.reduce((s, r) => s + Number(r.count), 0) || 1;
              const w = Math.round((count / total) * 100);
              const color = star >= 4 ? "#22c55e" : star === 3 ? "#f59e0b" : "#ef4444";
              return (
                <div key={star} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#888", width: 18, textAlign: "right" }}>{star}⭐</span>
                  <div style={{ flex: 1, height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: w + "%", background: color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#555", fontFamily: "'JetBrains Mono',monospace", width: 28, textAlign: "right" }}>{count}</span>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <Section title="Payment Method Breakdown">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e1e1e" }}>
              {["Method", "Transactions", "Total Revenue", "Share"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#444", fontWeight: 700, fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paymentMethods.map((p, i) => {
              const total = paymentMethods.reduce((s, x) => s + Number(x.total_ngn || 0), 0);
              return (
                <tr key={i} style={{ borderBottom: "1px solid #141414" }}>
                  <td style={{ padding: "10px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: PAY_COLORS[p.payment_method] || "#888" }} />
                      <span style={{ color: "#e2e8f0", textTransform: "capitalize" }}>{p.payment_method}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 10px", color: "#aaa", fontFamily: "'JetBrains Mono',monospace" }}>{num(p.count)}</td>
                  <td style={{ padding: "10px 10px", color: "#a78bfa", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(p.total_ngn)}</td>
                  <td style={{ padding: "10px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: pct(p.total_ngn, total), background: PAY_COLORS[p.payment_method] || "#888", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#666", fontFamily: "'JetBrains Mono',monospace", minWidth: 40, textAlign: "right" }}>
                        {pct(p.total_ngn, total)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [page, setPage] = useState("Overview");
  const [kpi, setKpi] = useState(null);
  const [statusData, setStatusData] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [topDrivers, setTopDrivers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [recentTrips, setRecentTrips] = useState([]);
  const [ratingsData, setRatingsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [k, s, m, d, p, v, r, rt] = await Promise.all([
        fetch(`${API}/kpi`).then(r => r.json()),
        fetch(`${API}/trips/by-status`).then(r => r.json()),
        fetch(`${API}/trips/monthly`).then(r => r.json()),
        fetch(`${API}/drivers/top?limit=8`).then(r => r.json()),
        fetch(`${API}/payments/methods`).then(r => r.json()),
        fetch(`${API}/drivers/vehicle-types`).then(r => r.json()),
        fetch(`${API}/trips/recent?limit=12`).then(r => r.json()),
        fetch(`${API}/ratings/distribution`).then(r => r.json()),
      ]);
      setKpi(k); setStatusData(s); setMonthly(m); setTopDrivers(d);
      setPaymentMethods(p); setVehicleTypes(v); setRecentTrips(r); setRatingsData(rt);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError("Cannot reach the API — make sure FastAPI is running on localhost:8000");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div style={{
      background: "#0d0d0d", minHeight: "100vh",
      color: "#f1f5f9", fontFamily: "'Inter', -apple-system, sans-serif",
      padding: "22px 26px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>

      <Nav page={page} setPage={setPage} onRefresh={fetchAll} loading={loading} lastUpdated={lastUpdated} />

      {error && (
        <div style={{
          background: "#1a0a0a", border: "1px solid #5c1a1a", borderRadius: 10,
          padding: "12px 16px", marginBottom: 20, color: "#f87171", fontSize: 13,
        }}>{error}</div>
      )}

      {loading && !kpi ? <Loader /> : (
        page === "Overview"
          ? <OverviewPage kpi={kpi} statusData={statusData} paymentMethods={paymentMethods}
              vehicleTypes={vehicleTypes} topDrivers={topDrivers} recentTrips={recentTrips} />
          : <AnalyticsPage monthly={monthly} topDrivers={topDrivers}
              paymentMethods={paymentMethods} ratingsData={ratingsData} />
      )}

      <p style={{ marginTop: 24, textAlign: "center", fontSize: 10, color: "#222", letterSpacing: "0.07em" }}>
        RIDE-HAILING DB ADMIN · GROUP PROJECT · 2026
      </p>
    </div>
  );
}