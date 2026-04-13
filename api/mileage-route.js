/**
 * ═══════════════════════════════════════════════════════════════
 * MILEAGE ROUTE API — /api/mileage-route
 * ═══════════════════════════════════════════════════════════════
 * Auth required. Server-side Google Maps key. User scoped logs.
 * POST /api/mileage-route
 * Headers: Authorization: Bearer <session_token>
 * Body: { home: string, stops: string[], roundTrip: boolean }
 * ═══════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // ── Auth — required, same as all FlipLedger APIs ─────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const sessionToken = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${sessionToken}` } } }
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid session token' });
  }

  // ── Validate ──────────────────────────────────────────────────
  const { home, stops, roundTrip } = req.body;
  if (!home?.trim()) return res.status(400).json({ error: 'Home address required' });
  const filteredStops = (stops || []).filter(s => s?.trim());
  if (filteredStops.length === 0) return res.status(400).json({ error: 'At least one stop required' });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY not configured in Vercel' });

  try {
    const origin = encodeURIComponent(home.trim());
    const destination = roundTrip
      ? encodeURIComponent(home.trim())
      : encodeURIComponent(filteredStops[filteredStops.length - 1]);

    const waypointList = roundTrip ? filteredStops : filteredStops.slice(0, -1);
    const waypointsParam = waypointList.length > 0
      ? `&waypoints=optimize:false|${waypointList.map(s => encodeURIComponent(s)).join('|')}`
      : '';

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypointsParam}&mode=driving&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error(`[MileageRoute] Google error for user ${user.id}:`, data.status, data.error_message);
      return res.status(400).json({ error: `Route error: ${data.status}`, details: data.error_message });
    }

    const legs = data.routes?.[0]?.legs || [];
    let totalMeters = 0;
    let totalSeconds = 0;
    for (const leg of legs) {
      totalMeters += leg.distance?.value || 0;
      totalSeconds += leg.duration?.value || 0;
    }

    const miles = totalMeters / 1609.344;
    console.log(`[MileageRoute] User ${user.id}: ${miles.toFixed(2)} mi`);

    return res.status(200).json({
      success: true,
      miles: parseFloat(miles.toFixed(2)),
      duration_seconds: totalSeconds,
      legs: legs.map(leg => ({
        start: leg.start_address,
        end: leg.end_address,
        miles: parseFloat((leg.distance?.value / 1609.344).toFixed(2)),
        duration_seconds: leg.duration?.value || 0,
      })),
    });
  } catch (err) {
    console.error('[MileageRoute] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
