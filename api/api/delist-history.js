/**
 * DELIST HISTORY API
 * ===================
 * Returns the delist log for a user.
 * Can be used to show users what was automatically delisted.
 * 
 * GET /api/delist-history
 *   - Requires Authorization header with Supabase session token
 *   - Returns recent delist operations
 * 
 * Query params:
 *   - limit: number of records (default 50, max 200)
 *   - status: filter by status ('success', 'failed', 'skipped', 'not_found')
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Get auth token from header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  // Initialize Supabase client with user's token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cgwwzithkdtunrpwctvb.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_q3biAcBkFiSKEYrdUlkQwg_4a6SjiRy',
    {
      global: { headers: { Authorization: `Bearer ${token}` } }
    }
  );
  
  try {
    // Get user from token
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Parse query params
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const status = req.query.status;
    
    // Build query
    let query = supabase
      .from('delist_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    // Apply status filter if provided
    if (status && ['success', 'failed', 'skipped', 'not_found'].includes(status)) {
      query = query.eq('status', status);
    }
    
    const { data: logs, error } = await query;
    
    if (error) {
      console.error('[DelistHistory] Query error:', error);
      return res.status(500).json({ error: 'Failed to fetch delist history' });
    }
    
    // Calculate summary stats
    const summary = {
      total: logs.length,
      success: logs.filter(l => l.status === 'success').length,
      failed: logs.filter(l => l.status === 'failed').length,
      skipped: logs.filter(l => l.status === 'skipped').length,
      notFound: logs.filter(l => l.status === 'not_found').length
    };
    
    return res.status(200).json({
      success: true,
      logs,
      summary
    });
    
  } catch (err) {
    console.error('[DelistHistory] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
