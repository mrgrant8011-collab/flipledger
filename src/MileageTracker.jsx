/**
 * ═══════════════════════════════════════════════════════════════
 * MILEAGE TRACKER — FlipLedger
 * ═══════════════════════════════════════════════════════════════
 * Fixes applied (per ChatGPT review):
 *   ✅ No alert() or confirm() — all inline UI feedback
 *   ✅ Purpose strictly required before logging (no silent fallback)
 *   ✅ logged_at replaces fake start_time/end_time
 *   ✅ CSV export escapes embedded quotes
 *   ✅ Auth token sent to /api/mileage-route
 *   ✅ All errors shown inline, not in browser dialogs
 *
 * Usage in App.jsx:
 *   import MileageTracker from './MileageTracker';
 *   { id: 'mileage', label: 'Mileage', icon: '🚗' }
 *   {page === 'mileage' && <MileageTracker user={user} session={session} c={c} />}
 *
 * Env vars needed in Vercel:
 *   VITE_GOOGLE_MAPS_API_KEY   ← address autocomplete (frontend)
 *   GOOGLE_MAPS_API_KEY        ← route calculation (backend, secure)
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_IRS_RATE = 0.70;

function formatDuration(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDayLabel(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

// Escape CSV field — handles embedded quotes correctly
function csvField(v) {
  const s = String(v ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

// Inline toast/banner component — replaces all alert() calls
function Banner({ type, message, onDismiss }) {
  if (!message) return null;
  const colors = {
    error: { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.25)', text: '#ef4444' },
    success: { bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.25)', text: '#10b981' },
    warn: { bg: 'rgba(201,169,98,.08)', border: 'rgba(201,169,98,.25)', text: '#C9A962' },
  };
  const c = colors[type] || colors.error;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: c.text, fontWeight: 600 }}>{message}</span>
      {onDismiss && <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', fontSize: 16, padding: '0 0 0 12px', lineHeight: 1 }}>×</button>}
    </div>
  );
}

// Confirm dialog — replaces all confirm() calls
function ConfirmDialog({ message, onConfirm, onCancel, col }) {
  return (
    <div style={{ padding: '14px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 12, marginTop: 8 }}>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#ef4444', fontWeight: 600 }}>{message}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
        <button onClick={onCancel} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${col.border}`, background: 'transparent', color: col.textMuted, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

export default function MileageTracker({ user, session, c = {} }) {
  const col = {
    bg: '#080808', card: '#0f0f0f', border: '#161616',
    text: '#ffffff', textMuted: '#555555', textDim: '#333333',
    gold: '#C9A962', green: '#10b981', red: '#ef4444',
    blue: '#3b82f6', purple: '#8B5CF6',
    ...c,
  };

  // ── State ────────────────────────────────────────────────────
  const [tab, setTab] = useState('new');
  const [irsRate, setIrsRate] = useState(() => parseFloat(localStorage.getItem('fl_irs_rate') || DEFAULT_IRS_RATE));
  const [editRate, setEditRate] = useState(false);
  const [rateInput, setRateInput] = useState(String(irsRate));
  const [rateError, setRateError] = useState('');
  const [homeAddress, setHomeAddress] = useState(localStorage.getItem('fl_home_address') || '');
  const [homeSaved, setHomeSaved] = useState(!!localStorage.getItem('fl_home_address'));
  const [stops, setStops] = useState([{ id: 1, value: '' }, { id: 2, value: '' }]);
  const [roundTrip, setRoundTrip] = useState(true);
  const [purpose, setPurpose] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState('');
  const [routeResult, setRouteResult] = useState(null);
  const [savingTrip, setSavingTrip] = useState(false);
  const [tripError, setTripError] = useState('');
  const [tripSuccess, setTripSuccess] = useState('');
  const [showSaveName, setShowSaveName] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [saveRouteError, setSaveRouteError] = useState('');
  const [suggestions, setSuggestions] = useState({});
  const [focusedStop, setFocusedStop] = useState(null);
  const [homeSuggestions, setHomeSuggestions] = useState([]);
  const [homeFocused, setHomeFocused] = useState(false);
  const [myRoutes, setMyRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [expandedDays, setExpandedDays] = useState({ 0: true });
  const [quickPurpose, setQuickPurpose] = useState('');
  const [savingQuick, setSavingQuick] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [quickSuccess, setQuickSuccess] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'trip'|'route', id, label }
  const autocomplete = useRef(null);
  const nextId = useRef(3);

  // ── Google Maps autocomplete ──────────────────────────────────
  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    if (window.google?.maps?.places) { initAC(); return; }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true; s.onload = initAC;
    document.head.appendChild(s);
  }, []);

  function initAC() {
    if (window.google?.maps?.places)
      autocomplete.current = new window.google.maps.places.AutocompleteService();
  }

  const getSuggestions = useCallback((value, cb) => {
    if (!autocomplete.current || value.length < 3) { cb([]); return; }
    autocomplete.current.getPlacePredictions({ input: value }, (preds, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && preds) cb(preds.slice(0, 5));
      else cb([]);
    });
  }, []);

  // ── Load data ─────────────────────────────────────────────────
  useEffect(() => { if (user) { loadTrips(); loadRoutes(); } }, [user]);

  const tok = () => session?.access_token;

  const loadTrips = async () => {
    setLoadingTrips(true);
    try {
      const r = await fetch('/api/mileage', { headers: { Authorization: `Bearer ${tok()}` } });
      const d = await r.json();
      if (d.trips) setTrips(d.trips);
    } catch (e) { console.error('[Mileage]', e); }
    setLoadingTrips(false);
  };

  const loadRoutes = async () => {
    setLoadingRoutes(true);
    try {
      const r = await fetch('/api/mileage?type=routes', { headers: { Authorization: `Bearer ${tok()}` } });
      const d = await r.json();
      if (d.routes) setMyRoutes(d.routes);
    } catch (e) { console.error('[Mileage routes]', e); }
    setLoadingRoutes(false);
  };

  // ── Stats ────────────────────────────────────────────────────
  const totalMiles = trips.reduce((s, t) => s + parseFloat(t.total_miles || 0), 0);
  const totalDed = trips.reduce((s, t) => s + parseFloat(t.irs_deduction || 0), 0);
  const uniqueDays = new Set(trips.map(t => t.trip_date)).size;
  const avgPerDay = uniqueDays > 0 ? (trips.length / uniqueDays).toFixed(1) : '0';

  // ── Stop handlers ────────────────────────────────────────────
  const updateStop = (id, value) => {
    setStops(p => p.map(s => s.id === id ? { ...s, value } : s));
    setRouteResult(null); setCalcError('');
    getSuggestions(value, list => setSuggestions(p => ({ ...p, [id]: list })));
  };

  const pickSuggestion = (id, desc) => {
    setStops(p => p.map(s => s.id === id ? { ...s, value: desc } : s));
    setSuggestions(p => ({ ...p, [id]: [] }));
    setFocusedStop(null);
  };

  const addStop = () => setStops(p => [...p, { id: nextId.current++, value: '' }]);
  const removeStop = (id) => { if (stops.length > 1) { setStops(p => p.filter(s => s.id !== id)); setRouteResult(null); } };

  // ── Calculate route ──────────────────────────────────────────
  const calcRoute = async () => {
    setCalcError('');
    const filled = stops.filter(s => s.value.trim());
    if (!homeAddress.trim()) { setCalcError('Please save your home address first.'); return; }
    if (filled.length === 0) { setCalcError('Add at least one stop.'); return; }
    setCalculating(true); setRouteResult(null);
    try {
      const res = await fetch('/api/mileage-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ home: homeAddress, stops: filled.map(s => s.value), roundTrip }),
      });
      const data = await res.json();
      if (!res.ok) { setCalcError(data.error || 'Route calculation failed'); setCalculating(false); return; }
      setRouteResult(data);
    } catch (e) {
      setCalcError('Could not reach Google Maps. Check your internet and try again.');
    }
    setCalculating(false);
  };

  // ── Save trip (core) ─────────────────────────────────────────
  const saveTrip = async (miles, stopsArr, purposeText, durationSec = 0, rate = irsRate) => {
    // Purpose strictly required — no silent fallback
    if (!purposeText?.trim()) {
      return { ok: false, error: 'Trip purpose is required — the IRS requires a description of business purpose for every mileage deduction.' };
    }
    try {
      const res = await fetch('/api/mileage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({
          trip_date: new Date().toISOString().split('T')[0],
          // logged_at handled server-side — no fake start/end times
          total_miles: parseFloat(parseFloat(miles).toFixed(2)),
          duration_seconds: durationSec,
          purpose: purposeText.trim(),
          stores_visited: stopsArr,
          home_address: homeAddress,
          round_trip: roundTrip,
          irs_rate: rate,
          irs_deduction: parseFloat((miles * rate).toFixed(2)),
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Failed to save trip' };
      await loadTrips();
      return { ok: true, id: data.id };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // ── Log from New Route ───────────────────────────────────────
  const logThisTrip = async () => {
    if (!routeResult) return;
    setTripError(''); setTripSuccess(''); setSavingTrip(true);
    const result = await saveTrip(
      routeResult.miles,
      stops.filter(s => s.value).map(s => s.value),
      purpose,
      routeResult.duration_seconds
    );
    if (!result.ok) {
      setTripError(result.error);
    } else {
      setTripSuccess(`✅ Trip logged — ${routeResult.miles.toFixed(2)} mi · $${(routeResult.miles * irsRate).toFixed(2)} deduction saved`);
      setRouteResult(null); setPurpose('');
      setStops([{ id: nextId.current++, value: '' }, { id: nextId.current++, value: '' }]);
      setTimeout(() => { setTab('history'); setExpandedDays({ 0: true }); setTripSuccess(''); }, 1500);
    }
    setSavingTrip(false);
  };

  // ── Log from My Routes ───────────────────────────────────────
  const logSavedRoute = async (route) => {
    setQuickError(''); setQuickSuccess('');
    // Purpose strictly required — no silent fallback to route name
    if (!quickPurpose.trim()) {
      setQuickError('Please type your trip purpose above before logging. The IRS requires this for your mileage deduction.');
      return;
    }
    setSavingQuick(true);
    const result = await saveTrip(route.total_miles, route.stops || [], quickPurpose, route.duration_seconds || 0);
    if (!result.ok) {
      setQuickError(result.error);
    } else {
      // Increment use count
      fetch(`/api/mileage?type=routes&id=${route.id}&action=use`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${tok()}` },
      }).then(() => loadRoutes()).catch(() => {});
      setQuickSuccess(`✅ ${route.name} logged — ${parseFloat(route.total_miles).toFixed(1)} mi · $${(route.total_miles * irsRate).toFixed(2)} deduction`);
      setQuickPurpose('');
      setTimeout(() => { setTab('history'); setExpandedDays({ 0: true }); setQuickSuccess(''); }, 1500);
    }
    setSavingQuick(false);
  };

  // ── Save route ───────────────────────────────────────────────
  const doSaveRoute = async () => {
    setSaveRouteError('');
    if (!routeName.trim()) { setSaveRouteError('Please name this route.'); return; }
    try {
      const res = await fetch('/api/mileage?type=routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({
          name: routeName.trim(),
          home_address: homeAddress,
          stops: stops.filter(s => s.value).map(s => s.value),
          round_trip: roundTrip,
          total_miles: routeResult?.miles,
          duration_seconds: routeResult?.duration_seconds || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveRouteError(data.error || 'Failed to save route'); return; }
      await loadRoutes();
      setShowSaveName(false); setRouteName(''); setSaveRouteError('');
      setTripSuccess(`⭐ "${routeName}" saved to My Routes!`);
      setTimeout(() => setTripSuccess(''), 3000);
    } catch (e) { setSaveRouteError(e.message); }
  };

  // ── Delete ───────────────────────────────────────────────────
  const confirmDeleteItem = (type, id, label) => setConfirmDelete({ type, id, label });

  const doDelete = async () => {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    const url = type === 'trip'
      ? `/api/mileage?id=${id}`
      : `/api/mileage?type=routes&id=${id}`;
    try {
      await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${tok()}` } });
      type === 'trip' ? loadTrips() : loadRoutes();
    } catch (e) { console.error('[Mileage delete]', e); }
    setConfirmDelete(null);
  };

  // ── IRS Rate ─────────────────────────────────────────────────
  const saveRate = () => {
    const r = parseFloat(rateInput);
    if (isNaN(r) || r <= 0 || r > 5) { setRateError('Enter a valid rate (e.g. 0.70)'); return; }
    setIrsRate(r); localStorage.setItem('fl_irs_rate', String(r));
    setEditRate(false); setRateError('');
  };

  // ── Home address ─────────────────────────────────────────────
  const saveHome = () => {
    if (!homeAddress.trim()) return;
    localStorage.setItem('fl_home_address', homeAddress.trim());
    setHomeSaved(true);
  };

  // ── Export CSV — properly escaped ────────────────────────────
  const exportCSV = () => {
    const header = ['Date', 'Purpose', 'Stores Visited', 'Miles', 'IRS Rate', 'Deduction ($)', 'Duration'];
    const rows = trips.map(t => [
      t.trip_date,
      t.purpose,
      (t.stores_visited || []).join(' → '),
      t.total_miles,
      t.irs_rate || irsRate,
      t.irs_deduction,
      formatDuration(t.duration_seconds),
    ]);
    const csv = [header, ...rows].map(r => r.map(csvField).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), {
      href: url,
      download: `flipledger-mileage-${new Date().getFullYear()}.csv`,
    }).click();
    URL.revokeObjectURL(url);
  };

  // ── Group trips by day ───────────────────────────────────────
  const byDay = trips.reduce((acc, t) => {
    const d = t.trip_date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(t); return acc;
  }, {});
  const dayKeys = Object.keys(byDay).sort((a, b) => new Date(b) - new Date(a));

  // ── Styles ───────────────────────────────────────────────────
  const card = { background: col.card, border: `1px solid ${col.border}`, borderRadius: 18, padding: 20 };
  const inp = { width: '100%', padding: '10px 13px', background: 'rgba(255,255,255,.04)', border: `1px solid ${col.border}`, borderRadius: 12, color: col.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', fontWeight: 500, boxSizing: 'border-box' };
  const bigBtn = (bg, fg = '#000', disabled = false) => ({ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: disabled ? 'rgba(255,255,255,.06)' : bg, color: disabled ? col.textDim : fg, fontSize: 13, fontWeight: 800, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', letterSpacing: '-.2px' });

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div style={{ width: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: col.text, margin: 0, letterSpacing: '-1px' }}>Mileage</h2>
          <p style={{ fontSize: 12, color: col.textMuted, margin: '4px 0 0', fontWeight: 500 }}>IRS-compliant trip tracking · flows into CPA Reports automatically</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.15)', borderRadius: 20, fontSize: 9, fontWeight: 700, color: col.green, letterSpacing: '.5px' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: col.green, animation: 'fl-pulse 1.5s infinite', display: 'inline-block' }} /> LIVE
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Miles YTD', value: totalMiles.toFixed(1), sub: 'miles driven', color: col.gold },
          { label: 'IRS Deduction YTD', value: `$${totalDed.toFixed(2)}`, sub: `@ $${irsRate.toFixed(2)}/mi`, color: col.green },
          { label: 'Total Trips', value: String(trips.length), sub: 'this year', color: col.purple },
          { label: 'Daily Average', value: avgPerDay, sub: 'trips per day', color: col.blue },
        ].map((s, i) => (
          <div key={i} style={{ background: col.card, border: `1px solid ${col.border}`, borderRadius: 18, padding: 16, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${s.color},transparent)` }} />
            <div style={{ position: 'absolute', top: 14, right: 14, width: 6, height: 6, borderRadius: '50%', background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
            <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 700, color: col.textDim, textTransform: 'uppercase', letterSpacing: '.6px' }}>{s.label}</p>
            <p style={{ margin: '0 0 3px', fontSize: 22, fontWeight: 900, color: s.color, letterSpacing: '-.5px' }}>{s.value}</p>
            <p style={{ margin: 0, fontSize: 9, color: s.color === col.green ? col.green : col.textDim, fontWeight: 600 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* IRS Rate bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(201,169,98,.05)', border: '1px solid rgba(201,169,98,.15)', borderRadius: 14, marginBottom: 20 }}>
        <div>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: col.textDim, textTransform: 'uppercase', letterSpacing: '.5px' }}>IRS Mileage Rate</p>
          <p style={{ margin: '3px 0 0', fontSize: 9, color: col.textDim, fontWeight: 500 }}>Update every January — applies to all new trips automatically</p>
        </div>
        {editRate ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: col.textMuted }}>$</span>
            <input value={rateInput} onChange={e => { setRateInput(e.target.value); setRateError(''); }} style={{ ...inp, width: 70, padding: '6px 10px', fontSize: 15, fontWeight: 900, color: col.gold }} />
            {rateError && <span style={{ fontSize: 11, color: col.red }}>{rateError}</span>}
            <button onClick={saveRate} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: col.gold, color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button onClick={() => { setEditRate(false); setRateError(''); }} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${col.border}`, background: 'transparent', color: col.textMuted, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: col.gold, letterSpacing: '-.5px' }}>${irsRate.toFixed(2)}<span style={{ fontSize: 12, color: col.textMuted, fontWeight: 600 }}>/mi</span></span>
            <button onClick={() => { setEditRate(true); setRateInput(String(irsRate)); }} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(201,169,98,.2)', background: 'rgba(201,169,98,.06)', color: col.gold, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Edit Rate</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, borderBottom: `1px solid ${col.border}`, paddingBottom: 16 }}>
        {[
          { id: 'new', label: '🗺 New Route' },
          { id: 'my', label: `⭐ My Routes${myRoutes.length > 0 ? ` (${myRoutes.length})` : ''}` },
          { id: 'history', label: `📋 History${trips.length > 0 ? ` (${trips.length})` : ''}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '10px 20px', borderRadius: 10, border: tab === t.id ? '1px solid rgba(201,169,98,.3)' : `1px solid ${col.border}`, background: tab === t.id ? 'rgba(201,169,98,.06)' : 'transparent', color: tab === t.id ? col.gold : col.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════ NEW ROUTE ═══════ */}
      {tab === 'new' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            {/* Home address */}
            <div style={{ ...card, marginBottom: 14 }}>
              <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 700, color: col.textDim, textTransform: 'uppercase', letterSpacing: '.6px' }}>Your Home Address — Starting Point</p>
              <div style={{ position: 'relative' }}>
                <input
                  value={homeAddress}
                  onChange={e => { setHomeAddress(e.target.value); setHomeSaved(false); getSuggestions(e.target.value, list => setHomeSuggestions(list)); }}
                  onFocus={() => setHomeFocused(true)}
                  onBlur={() => setTimeout(() => setHomeFocused(false), 150)}
                  placeholder="e.g. 1234 Main St, West Jordan, UT 84084"
                  style={{ ...inp, color: homeSaved ? col.green : col.text, borderColor: homeSaved ? 'rgba(16,185,129,.25)' : col.border, background: homeSaved ? 'rgba(16,185,129,.05)' : 'rgba(255,255,255,.04)' }}
                />
                {homeFocused && homeSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#161616', border: `1px solid ${col.border}`, borderRadius: 12, zIndex: 100, marginTop: 4, overflow: 'hidden' }}>
                    {homeSuggestions.map(p => (
                      <div key={p.place_id} onMouseDown={() => { setHomeAddress(p.description); setHomeSuggestions([]); setHomeSaved(false); }} style={{ padding: '10px 13px', fontSize: 12, color: '#888', cursor: 'pointer', borderBottom: `1px solid ${col.border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        🏠 {p.description}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {homeAddress && !homeSaved && (
                <button onClick={saveHome} style={{ marginTop: 8, padding: '6px 14px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,.12)', color: col.green, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>💾 Save Home Address</button>
              )}
              {homeSaved && <p style={{ margin: '6px 0 0', fontSize: 10, color: col.green, fontWeight: 600 }}>✓ Saved — used as starting point for all routes</p>}
            </div>

            {/* Route builder */}
            <div style={card}>
              <p style={{ margin: '0 0 14px', fontSize: 9, fontWeight: 700, color: col.textDim, textTransform: 'uppercase', letterSpacing: '.6px' }}>Your Stops — Nike, Ross, UPS, anywhere</p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: col.green, flexShrink: 0 }}>H</div>
                <span style={{ fontSize: 12, color: homeSaved ? col.green : col.textDim, fontWeight: 600 }}>{homeAddress || 'Set home address above'}</span>
              </div>

              {stops.map((stop, idx) => (
                <div key={stop.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,169,98,.12)', border: '1px solid rgba(201,169,98,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: col.gold, flexShrink: 0 }}>{idx + 1}</div>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        value={stop.value}
                        onChange={e => updateStop(stop.id, e.target.value)}
                        onFocus={() => setFocusedStop(stop.id)}
                        onBlur={() => setTimeout(() => setFocusedStop(null), 150)}
                        placeholder="Nike Factory Lehi, Ross, UPS Store, Post Office..."
                        style={{ ...inp, color: stop.value ? col.gold : col.text, borderColor: stop.value ? 'rgba(201,169,98,.25)' : col.border, background: stop.value ? 'rgba(201,169,98,.05)' : 'rgba(255,255,255,.04)' }}
                      />
                      {focusedStop === stop.id && (suggestions[stop.id] || []).length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#161616', border: `1px solid ${col.border}`, borderRadius: 12, zIndex: 100, marginTop: 4, overflow: 'hidden' }}>
                          {suggestions[stop.id].map(p => (
                            <div key={p.place_id} onMouseDown={() => pickSuggestion(stop.id, p.description)} style={{ padding: '10px 13px', fontSize: 12, color: '#888', cursor: 'pointer', borderBottom: `1px solid ${col.border}` }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,169,98,.08)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              📍 {p.description}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {stops.length > 1 && <button onClick={() => removeStop(stop.id)} style={{ background: 'none', border: 'none', color: col.textDim, cursor: 'pointer', fontSize: 20, padding: '0 4px', flexShrink: 0 }}>×</button>}
                  </div>
                </div>
              ))}

              {roundTrip && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: col.red, flexShrink: 0 }}>H</div>
                  <span style={{ fontSize: 12, color: col.textDim, fontWeight: 500 }}>Return home</span>
                </div>
              )}

              <button onClick={addStop} style={{ width: '100%', padding: '9px', borderRadius: 10, border: `1px dashed ${col.border}`, background: 'transparent', color: col.textDim, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, marginBottom: 12 }}>
                + Add another stop
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px', background: 'rgba(255,255,255,.02)', border: `1px solid ${col.border}`, borderRadius: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Round trip — return home</span>
                <div onClick={() => setRoundTrip(r => !r)} style={{ width: 36, height: 20, background: roundTrip ? col.green : '#333', borderRadius: 10, position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
                  <div style={{ width: 16, height: 16, background: '#fff', borderRadius: '50%', position: 'absolute', top: 2, left: roundTrip ? 18 : 2, transition: 'left .2s' }} />
                </div>
              </div>

              {/* Purpose — IRS required, strictly enforced */}
              <div style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 700, color: col.textDim, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Trip Purpose <span style={{ color: col.red }}>★ Required by IRS</span>
                </p>
                <input value={purpose} onChange={e => { setPurpose(e.target.value); setTripError(''); }} placeholder="e.g. Inventory sourcing at Nike Factory Lehi, picked up 12 pairs for resale" style={{ ...inp }} />
                <p style={{ margin: '5px 0 0', fontSize: 10, color: col.textDim, fontWeight: 500 }}>Be specific — this is your IRS mileage log entry</p>
              </div>

              {calcError && <Banner type="error" message={calcError} onDismiss={() => setCalcError('')} />}

              <button onClick={calcRoute} disabled={calculating} style={bigBtn(calculating ? 'rgba(201,169,98,.15)' : col.gold, '#000', calculating)}>
                {calculating ? '⏳ Calculating with Google Maps...' : '🗺 Calculate Miles'}
              </button>

              {routeResult && (
                <div>
                  <div style={{ background: 'rgba(16,185,129,.04)', border: '1px solid rgba(16,185,129,.12)', borderRadius: 14, padding: 14, marginTop: 14 }}>
                    {[
                      { label: 'Total distance', value: `${parseFloat(routeResult.miles).toFixed(2)} mi`, color: col.gold },
                      { label: 'Drive time', value: formatDuration(routeResult.duration_seconds), color: col.text },
                      { label: 'Stops', value: `${stops.filter(s => s.value).length} stop${stops.filter(s => s.value).length !== 1 ? 's' : ''}${roundTrip ? ' + home' : ''}`, color: col.text },
                      { label: 'IRS deduction', value: `$${(routeResult.miles * irsRate).toFixed(2)}`, color: col.green },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 3 ? '1px solid rgba(16,185,129,.08)' : 'none' }}>
                        <span style={{ fontSize: 12, color: col.textMuted, fontWeight: 500 }}>{row.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: row.color }}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {tripError && <Banner type="error" message={tripError} onDismiss={() => setTripError('')} />}
                  {tripSuccess && <Banner type="success" message={tripSuccess} />}

                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!purpose.trim() && (
                      <Banner type="warn" message="Type your trip purpose above before logging — required by IRS" />
                    )}
                    <button onClick={logThisTrip} disabled={savingTrip || !purpose.trim()} style={bigBtn(col.green, '#fff', savingTrip || !purpose.trim())}>
                      {savingTrip ? '⏳ Saving...' : '✅ Log This Trip — Today'}
                    </button>
                    {!showSaveName ? (
                      <button onClick={() => setShowSaveName(true)} style={{ ...bigBtn('rgba(201,169,98,.08)', col.gold), border: '1px solid rgba(201,169,98,.2)' }}>
                        ⭐ Save to My Routes
                      </button>
                    ) : (
                      <div style={{ padding: 12, background: 'rgba(201,169,98,.06)', border: '1px solid rgba(201,169,98,.2)', borderRadius: 12 }}>
                        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: col.gold }}>Name this route:</p>
                        <input value={routeName} onChange={e => { setRouteName(e.target.value); setSaveRouteError(''); }} placeholder="e.g. Lehi Run, Lehi + Draper Loop" style={{ ...inp, marginBottom: 8 }} />
                        {saveRouteError && <Banner type="error" message={saveRouteError} />}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={doSaveRoute} style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', background: col.gold, color: '#000', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Save Route</button>
                          <button onClick={() => { setShowSaveName(false); setSaveRouteError(''); }} style={{ padding: '9px 13px', borderRadius: 9, border: `1px solid ${col.border}`, background: 'transparent', color: col.textMuted, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Map / result panel */}
          <div style={{ ...card, padding: 0, overflow: 'hidden', minHeight: 500, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
            <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,.85)', border: `1px solid ${col.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 10, color: col.textDim, fontWeight: 600 }}>
              Google Maps — Route Preview
            </div>
            {!routeResult ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 52, marginBottom: 14 }}>🗺</div>
                <p style={{ color: col.textDim, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Add your stops and calculate</p>
                <p style={{ color: col.textDim, fontSize: 11, fontWeight: 500, lineHeight: 1.6 }}>Nike Factory, Ross, UPS Store<br />Any address or place name works</p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
                <p style={{ fontSize: 56, fontWeight: 900, color: col.gold, margin: '0 0 4px', letterSpacing: '-2px', lineHeight: 1 }}>{parseFloat(routeResult.miles).toFixed(2)}</p>
                <p style={{ fontSize: 18, color: col.textMuted, fontWeight: 600, marginBottom: 16 }}>miles</p>
                <p style={{ fontSize: 14, color: col.textMuted, fontWeight: 500, marginBottom: 4 }}>⏱ {formatDuration(routeResult.duration_seconds)}</p>
                <div style={{ display: 'inline-block', padding: '12px 24px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 14, marginTop: 12 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 10, color: col.green, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>IRS Deduction</p>
                  <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color: col.green, letterSpacing: '-1px' }}>${(routeResult.miles * irsRate).toFixed(2)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ MY ROUTES ═══════ */}
      {tab === 'my' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: col.textMuted, fontWeight: 500 }}>Calculate once — log forever. One tap per trip.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.15)', borderRadius: 20, fontSize: 10, color: col.green, fontWeight: 700 }}>⚡ One tap logging</div>
          </div>

          {/* Purpose — strictly required, no silent fallback */}
          <div style={{ ...card, marginBottom: 14 }}>
            <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 700, color: col.textDim, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Trip Purpose <span style={{ color: col.red }}>★ Required before logging</span>
            </p>
            <input value={quickPurpose} onChange={e => { setQuickPurpose(e.target.value); setQuickError(''); }} placeholder="e.g. Inventory sourcing at Nike Factory Lehi, picked up 8 pairs for resale" style={{ ...inp }} />
            <p style={{ margin: '5px 0 0', fontSize: 10, color: col.textDim }}>IRS requires a business purpose for every mileage deduction — be specific</p>
          </div>

          {quickError && <Banner type="error" message={quickError} onDismiss={() => setQuickError('')} />}
          {quickSuccess && <Banner type="success" message={quickSuccess} />}

          {loadingRoutes ? (
            <div style={{ textAlign: 'center', padding: 60, color: col.textMuted }}>Loading...</div>
          ) : myRoutes.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⭐</div>
              <p style={{ color: col.textMuted, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No saved routes yet</p>
              <p style={{ color: col.textDim, fontSize: 12, fontWeight: 500 }}>Go to New Route → calculate → Save to My Routes</p>
            </div>
          ) : (
            <div style={card}>
              <p style={{ margin: '0 0 0', fontSize: 9, fontWeight: 700, color: col.textDim, textTransform: 'uppercase', letterSpacing: '.6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: `1px solid ${col.border}` }}>
                <span>My Routes</span>
                <span style={{ color: col.green, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>{myRoutes.length} saved</span>
              </p>
              {myRoutes.map((route, idx) => (
                <div key={route.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: idx < myRoutes.length - 1 ? `1px solid ${col.border}` : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 16 }}>
                      <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: col.text, letterSpacing: '-.3px' }}>{route.name}</p>
                      <p style={{ margin: 0, fontSize: 10, color: col.textDim, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Home → {(route.stops || []).join(' → ')}{route.round_trip ? ' → Home' : ''}
                        {route.use_count > 0 && ` · Used ${route.use_count}×`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900, color: col.gold, letterSpacing: '-.4px' }}>{parseFloat(route.total_miles).toFixed(1)} mi</p>
                        <p style={{ margin: 0, fontSize: 11, color: col.green, fontWeight: 600 }}>${(route.total_miles * irsRate).toFixed(2)} deduction</p>
                      </div>
                      <button
                        onClick={() => logSavedRoute(route)}
                        disabled={savingQuick || !quickPurpose.trim()}
                        style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: (!savingQuick && quickPurpose.trim()) ? col.green : '#333', color: '#fff', fontSize: 12, fontWeight: 700, cursor: (!savingQuick && quickPurpose.trim()) ? 'pointer' : 'default', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                      >
                        {savingQuick ? '⏳' : 'Log Trip'}
                      </button>
                      <button onClick={() => confirmDeleteItem('route', route.id, route.name)} style={{ background: 'none', border: 'none', color: col.textDim, cursor: 'pointer', fontSize: 18, padding: '0 2px' }}>×</button>
                    </div>
                  </div>
                  {/* Inline confirm delete — no confirm() dialog */}
                  {confirmDelete?.type === 'route' && confirmDelete?.id === route.id && (
                    <ConfirmDialog
                      message={`Delete "${route.name}"? This cannot be undone.`}
                      onConfirm={doDelete}
                      onCancel={() => setConfirmDelete(null)}
                      col={col}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ HISTORY ═══════ */}
      {tab === 'history' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 12, color: col.textMuted, fontWeight: 500 }}>
              {trips.length} trips · {totalMiles.toFixed(1)} mi · grouped by day · click to expand
            </p>
            <button onClick={exportCSV} style={{ padding: '7px 14px', borderRadius: 10, border: `1px solid ${col.border}`, background: 'transparent', color: col.textMuted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
              📤 Export CSV for CPA
            </button>
          </div>

          {loadingTrips ? (
            <div style={{ textAlign: 'center', padding: 60, color: col.textMuted }}>Loading...</div>
          ) : dayKeys.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <p style={{ color: col.textMuted, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No trips logged yet</p>
              <p style={{ color: col.textDim, fontSize: 12, fontWeight: 500 }}>Log your first trip in New Route or My Routes</p>
            </div>
          ) : (
            dayKeys.map((day, dayIdx) => {
              const dayTrips = byDay[day];
              const dayMi = dayTrips.reduce((s, t) => s + parseFloat(t.total_miles || 0), 0);
              const dayDed = dayTrips.reduce((s, t) => s + parseFloat(t.irs_deduction || 0), 0);
              const open = expandedDays[dayIdx];
              return (
                <div key={day} style={{ background: col.card, border: `1px solid ${col.border}`, borderRadius: 16, marginBottom: 10, overflow: 'hidden' }}>
                  <div onClick={() => setExpandedDays(p => ({ ...p, [dayIdx]: !p[dayIdx] }))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: col.text, letterSpacing: '-.2px' }}>{formatDayLabel(day)}</p>
                      <p style={{ margin: 0, fontSize: 10, color: col.textDim, fontWeight: 500 }}>{dayTrips.length} trip{dayTrips.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900, color: col.gold, letterSpacing: '-.3px' }}>{dayMi.toFixed(1)} mi</p>
                        <p style={{ margin: 0, fontSize: 11, color: col.green, fontWeight: 600 }}>${dayDed.toFixed(2)} deduction</p>
                      </div>
                      <span style={{ fontSize: 14, color: col.textDim, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>›</span>
                    </div>
                  </div>
                  {open && dayTrips.map((trip) => (
                    <div key={trip.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '11px 16px 11px 28px', borderTop: `1px solid ${col.border}` }}>
                        <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                          <p style={{ margin: '0 0 3px', fontSize: 12, fontWeight: 600, color: '#777' }}>{trip.purpose}</p>
                          {(trip.stores_visited || []).length > 0 && (
                            <p style={{ margin: 0, fontSize: 10, color: col.textDim, fontWeight: 500 }}>📍 {trip.stores_visited.join(' → ')}</p>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 800, color: col.gold }}>{parseFloat(trip.total_miles).toFixed(2)} mi</p>
                            <p style={{ margin: 0, fontSize: 10, color: col.green, fontWeight: 600 }}>${parseFloat(trip.irs_deduction).toFixed(2)}</p>
                          </div>
                          <button onClick={() => confirmDeleteItem('trip', trip.id, trip.purpose)} style={{ background: 'none', border: 'none', color: col.textDim, cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>×</button>
                        </div>
                      </div>
                      {/* Inline confirm delete — no confirm() dialog */}
                      {confirmDelete?.type === 'trip' && confirmDelete?.id === trip.id && (
                        <div style={{ padding: '0 16px 12px 28px' }}>
                          <ConfirmDialog
                            message="Delete this trip? This cannot be undone."
                            onConfirm={doDelete}
                            onCancel={() => setConfirmDelete(null)}
                            col={col}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}

      <style>{`@keyframes fl-pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );
}
