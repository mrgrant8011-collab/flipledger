/**
 * ═══════════════════════════════════════════════════════════════
 * MILEAGE API — /api/mileage
 * ═══════════════════════════════════════════════════════════════
 * All queries scoped to user_id — no data leaks between users.
 * Auth required on every method.
 *
 * TRIPS:
 *   GET    /api/mileage              → fetch trips (user scoped)
 *   POST   /api/mileage              → save trip
 *   DELETE /api/mileage?id=xxx       → delete trip (user scoped)
 *
 * SAVED ROUTES:
 *   GET    /api/mileage?type=routes               → fetch routes
 *   POST   /api/mileage?type=routes               → save route
 *   DELETE /api/mileage?type=routes&id=xxx        → delete route
 *   PATCH  /api/mileage?type=routes&id=xxx&action=use → +1 use count
 * ═══════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Auth ─────────────────────────────────────────────────────
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

  const isRoutes = req.query.type === 'routes';

  // ══════════════════════════════════════════════════════════════
  // TRIPS
  // ══════════════════════════════════════════════════════════════
  if (!isRoutes) {

    if (req.method === 'GET') {
      try {
        const year = req.query.year;
        let query = supabase
          .from('mileage_logs')
          .select('id, trip_date, total_miles, duration_seconds, purpose, stores_visited, round_trip, irs_rate, irs_deduction, logged_at, created_at')
          .eq('user_id', user.id)  // ← always scoped to user
          .order('trip_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1000);

        if (year && year !== 'all') {
          query = query.gte('trip_date', `${year}-01-01`).lte('trip_date', `${year}-12-31`);
        }

        const { data: trips, error } = await query;
        if (error) {
          console.error('[Mileage] Fetch error:', error);
          return res.status(500).json({ error: 'Failed to fetch trips' });
        }

        const totalMiles = (trips || []).reduce((s, t) => s + parseFloat(t.total_miles || 0), 0);
        const totalDeduction = (trips || []).reduce((s, t) => s + parseFloat(t.irs_deduction || 0), 0);

        return res.status(200).json({
          success: true,
          trips: trips || [],
          summary: {
            totalTrips: (trips || []).length,
            totalMiles: parseFloat(totalMiles.toFixed(2)),
            totalDeduction: parseFloat(totalDeduction.toFixed(2)),
          },
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (req.method === 'POST') {
      try {
        const {
          trip_date, total_miles, duration_seconds,
          purpose, stores_visited,
          home_address, round_trip,
          irs_rate, irs_deduction,
        } = req.body;

        // Validate required IRS fields
        if (!trip_date) return res.status(400).json({ error: 'trip_date required' });
        if (!total_miles || parseFloat(total_miles) < 0.05) return res.status(400).json({ error: 'total_miles required (min 0.05)' });
        if (!purpose?.trim()) return res.status(400).json({ error: 'purpose required — IRS regulation' });

        const { data, error } = await supabase
          .from('mileage_logs')
          .insert({
            user_id: user.id,  // ← always set from auth, never from client
            trip_date,
            logged_at: new Date().toISOString(),  // when they tapped Log Trip
            total_miles: parseFloat(parseFloat(total_miles).toFixed(2)),
            duration_seconds: parseInt(duration_seconds) || 0,
            purpose: purpose.trim(),
            stores_visited: Array.isArray(stores_visited) ? stores_visited.filter(Boolean) : [],
            home_address: home_address?.trim() || null,
            round_trip: !!round_trip,
            irs_rate: parseFloat(irs_rate) || 0.70,
            irs_deduction: parseFloat(irs_deduction) || parseFloat((total_miles * (irs_rate || 0.70)).toFixed(2)),
          })
          .select('id')
          .single();

        if (error) {
          console.error('[Mileage] Insert error:', error);
          return res.status(500).json({ error: 'Failed to save trip' });
        }

        console.log(`[Mileage] Trip ${data.id} — ${total_miles} mi — user ${user.id}`);
        return res.status(200).json({ success: true, id: data.id });

      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (req.method === 'DELETE') {
      try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });

        // user_id check prevents deleting another user's trip
        const { error } = await supabase
          .from('mileage_logs')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);  // ← double safety

        if (error) return res.status(500).json({ error: 'Failed to delete trip' });
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SAVED ROUTES
  // ══════════════════════════════════════════════════════════════
  if (isRoutes) {

    if (req.method === 'GET') {
      try {
        const { data: routes, error } = await supabase
          .from('mileage_saved_routes')
          .select('*')
          .eq('user_id', user.id)  // ← user scoped
          .order('use_count', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: 'Failed to fetch routes' });
        return res.status(200).json({ success: true, routes: routes || [] });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (req.method === 'POST') {
      try {
        const { name, home_address, stops, round_trip, total_miles, duration_seconds } = req.body;

        if (!name?.trim()) return res.status(400).json({ error: 'name required' });
        if (!total_miles) return res.status(400).json({ error: 'total_miles required' });

        // Check for duplicate route name for this user
        // maybeSingle() returns null when no row exists (no error)
        // single() would throw an error when no row found — wrong for existence checks
        const { data: existing } = await supabase
          .from('mileage_saved_routes')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', name.trim())
          .maybeSingle();

        if (existing) {
          return res.status(409).json({ error: `A route named "${name.trim()}" already exists. Please use a different name.` });
        }

        const { data, error } = await supabase
          .from('mileage_saved_routes')
          .insert({
            user_id: user.id,  // ← always from auth
            name: name.trim(),
            home_address: home_address?.trim() || null,
            stops: Array.isArray(stops) ? stops.filter(Boolean) : [],
            round_trip: !!round_trip,
            total_miles: parseFloat(parseFloat(total_miles).toFixed(2)),
            duration_seconds: parseInt(duration_seconds) || 0,
            use_count: 0,
          })
          .select('id')
          .single();

        if (error) {
          console.error('[Mileage Routes] Insert error:', error);
          return res.status(500).json({ error: 'Failed to save route' });
        }

        return res.status(200).json({ success: true, id: data.id });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (req.method === 'PATCH') {
      try {
        const { id, action } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });

        if (action === 'use') {
          // Read current count — user scoped
          const { data: current, error: fetchError } = await supabase
            .from('mileage_saved_routes')
            .select('use_count')
            .eq('id', id)
            .eq('user_id', user.id)  // ← only their routes
            .single();

          if (fetchError || !current) {
            return res.status(404).json({ error: 'Route not found' });
          }

          const { error: updateError } = await supabase
            .from('mileage_saved_routes')
            .update({
              use_count: (current.use_count || 0) + 1,
              last_used_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('user_id', user.id);  // ← double safety

          if (updateError) {
            console.error('[Mileage Routes] Patch error:', updateError);
            return res.status(500).json({ error: 'Failed to update use count' });
          }
        }

        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (req.method === 'DELETE') {
      try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });

        // user_id check prevents deleting another user's route
        const { error } = await supabase
          .from('mileage_saved_routes')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);  // ← double safety

        if (error) return res.status(500).json({ error: 'Failed to delete route' });
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
