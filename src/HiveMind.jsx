import { useState } from 'react';

const c = {
  bg: '#0C0C0C',
  card: '#141414',
  border: 'rgba(255,255,255,0.06)',
  gold: '#C9A962',
  goldDark: '#8B7355',
  goldGlow: 'rgba(201,169,98,0.3)',
  green: '#34D399',
  greenGlow: 'rgba(52,211,153,0.3)',
  red: '#F87171',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.5)',
  textDim: 'rgba(255,255,255,0.3)',
};

export default function HiveMind({ stockxToken, ebayToken, userId }) {
  const [sku, setSku] = useState('');
  const [selectedSize, setSelectedSize] = useState(null);
  const [cost, setCost] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sizeLoading, setSizeLoading] = useState(false);
  const [error, setError] = useState(null);

  const allSizes = result?.stockx?.allVariants?.map(v => v.size) || [];
  const { personal, community, stockx, ebay, hotSizes, signals } = result || {};

  async function scan(overrideSku, overrideSize) {
    const scanSku = (overrideSku || sku).trim().toUpperCase();
    if (!scanSku || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sku: scanSku, user_id: userId });
      if (overrideSize) params.set('size', overrideSize);
      if (stockxToken) params.set('stockxToken', stockxToken);
      const res = await fetch(`/api/hive-mind?${params}`, {
        headers: ebayToken ? { Authorization: `Bearer ${ebayToken}` } : {},
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed');
      setResult(data);
      setSelectedSize(overrideSize || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSizeSelect(sz) {
    if (sizeLoading) return;
    const newSize = sz === selectedSize ? null : sz;
    setSizeLoading(true);
    setSelectedSize(newSize);
    setError(null);
    try {
      const params = new URLSearchParams({ sku: sku.trim().toUpperCase(), user_id: userId });
      if (newSize) params.set('size', newSize);
      if (stockxToken) params.set('stockxToken', stockxToken);
      const res = await fetch(`/api/hive-mind?${params}`, {
        headers: ebayToken ? { Authorization: `Bearer ${ebayToken}` } : {},
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSizeLoading(false);
    }
  }

  const sellRate = community?.sellRate || 0;
  const hotSize = hotSizes?.find(h => h.size === selectedSize)?.heat;

  // StockX earnMore is the target sell price
  const stockxEarnMore = stockx?.earnMore || null;
  const STOCKX_FEE = 0.095;
  const stockxNet = stockxEarnMore ? Math.round(stockxEarnMore * (1 - STOCKX_FEE)) : null;

  // Real profit = stockx net - user's cost
  const costNum = cost ? parseFloat(cost) : null;
  const estProfit = costNum && stockxNet ? Math.round(stockxNet - costNum) : null;

  function getVerdict() {
    if (!selectedSize) return null;
    if (costNum && stockxNet) {
      const profit = Math.round(stockxNet - costNum);
      if (profit >= 60 && sellRate >= 70) return { label: 'STRONG BUY', color: '#34D399', glow: 'rgba(52,211,153,0.3)', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.3)' };
      if (profit >= 30) return { label: 'WORTH IT', color: '#C9A962', glow: 'rgba(201,169,98,0.3)', bg: 'rgba(201,169,98,0.08)', border: 'rgba(201,169,98,0.3)' };
      if (profit >= 15) return { label: 'MAYBE', color: 'rgba(255,255,255,0.5)', glow: 'none', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' };
      return { label: 'PASS', color: '#F87171', glow: 'rgba(248,113,113,0.3)', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.2)' };
    }
    // No cost yet — show market signal
    if (sellRate >= 80 && hotSize === 'hot') return { label: 'STRONG MARKET', color: '#34D399', glow: 'rgba(52,211,153,0.3)', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.3)' };
    if (sellRate >= 50) return { label: 'ACTIVE MARKET', color: '#C9A962', glow: 'rgba(201,169,98,0.3)', bg: 'rgba(201,169,98,0.08)', border: 'rgba(201,169,98,0.3)' };
    if (sellRate >= 20) return { label: 'SLOW MARKET', color: 'rgba(255,255,255,0.5)', glow: 'none', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' };
    return { label: 'WEAK MARKET', color: '#F87171', glow: 'rgba(248,113,113,0.3)', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.2)' };
  }

  const verdict = getVerdict();

  return (
    <div style={{ background: c.bg, minHeight: '100vh', padding: '28px', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: c.text }}>
      <style>{`
        @keyframes border-flow { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes breathe { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.1); opacity: 0.6; } }
        @keyframes pulse-glow { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: 0.7; } }
        @keyframes shimmer-line { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .hive-row { transition: all 0.2s ease; }
        .hive-row:hover { background: rgba(52,211,153,0.04) !important; transform: translateX(4px); }
        .size-btn { transition: all 0.2s ease; }
        .size-btn:hover { transform: translateY(-2px); }
        .scan-btn { transition: all 0.2s ease; }
        .scan-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(201,169,98,0.5) !important; }
        .net-card { transition: all 0.3s ease; }
        .net-card:hover { transform: translateY(-4px); }
        .fade-in { animation: fadeInUp 0.4s ease both; }
      `}</style>

      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, background: `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 20px ${c.goldGlow}`, flexShrink: 0 }}>
            <svg width="26" height="26" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="3" fill="#000"/>
              <circle cx="4" cy="6" r="2.2" fill="#000"/>
              <circle cx="18" cy="6" r="2.2" fill="#000"/>
              <circle cx="4" cy="16" r="2.2" fill="#000"/>
              <circle cx="18" cy="16" r="2.2" fill="#000"/>
              <line x1="6" y1="7.5" x2="9" y2="9.5" stroke="#000" strokeWidth="1.5"/>
              <line x1="16" y1="7.5" x2="13" y2="9.5" stroke="#000" strokeWidth="1.5"/>
              <line x1="6" y1="14.5" x2="9" y2="12.5" stroke="#000" strokeWidth="1.5"/>
              <line x1="16" y1="14.5" x2="13" y2="12.5" stroke="#000" strokeWidth="1.5"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.gold, letterSpacing: '2px', textShadow: `0 0 30px ${c.goldGlow}` }}>HIVE MIND</div>
            <div style={{ fontSize: 10, color: c.textDim, letterSpacing: '3px', marginTop: 1 }}>BUYING INTELLIGENCE</div>
          </div>
          {result && (
            <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 100 }}>
              <div style={{ width: 7, height: 7, background: c.green, borderRadius: '50%', boxShadow: `0 0 10px ${c.green}`, animation: 'pulse-glow 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: c.green, letterSpacing: '1px' }}>LIVE</span>
            </div>
          )}
        </div>

        {/* SEARCH */}
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${c.gold}, ${c.green}, ${c.gold}, transparent)`, backgroundSize: '200% 100%', animation: 'border-flow 3s linear infinite' }} />
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke={c.textDim} strokeWidth="1.3"/>
            <line x1="10" y1="10" x2="13.5" y2="13.5" stroke={c.textDim} strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            value={sku}
            onChange={e => setSku(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && scan()}
            placeholder="SKU — e.g. CN8490-002"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: c.text, fontSize: 14, flex: 1, minWidth: 0, fontFamily: "'SF Mono', 'Courier New', monospace", letterSpacing: '0.5px' }}
          />
          <button className="scan-btn" onClick={() => scan()} disabled={loading || !sku.trim()}
            style={{ background: loading ? 'rgba(201,169,98,0.4)' : `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)`, color: '#000', fontSize: 11, fontWeight: 800, padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', letterSpacing: '1px', boxShadow: `0 4px 16px ${c.goldGlow}`, opacity: !sku.trim() ? 0.5 : 1, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {loading ? '···' : 'SCAN'}
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: c.red }}>{error}</div>
        )}

        {result && (
          <div className="fade-in">

            {/* PRODUCT HEADER */}
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 20, padding: '20px 24px', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, background: `radial-gradient(circle, ${c.goldGlow} 0%, transparent 60%)`, pointerEvents: 'none', animation: 'breathe 4s ease-in-out infinite' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: c.text, marginBottom: 4 }}>{stockx?.productTitle || sku}</div>
                  <div style={{ fontSize: 12, color: c.textMuted }}>{sku}{stockx?.retailPrice ? ` · Retail $${stockx.retailPrice}` : ''}{selectedSize ? ` · Size ${selectedSize}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {(signals || []).map((s, i) => (
                    <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: s === 'green' ? c.green : s === 'yellow' ? c.gold : s === 'red' ? c.red : 'rgba(255,255,255,0.1)', boxShadow: s === 'green' ? `0 0 10px ${c.greenGlow}` : s === 'yellow' ? `0 0 10px ${c.goldGlow}` : 'none', animation: 'pulse-glow 2s ease-in-out infinite', animationDelay: `${i * 0.3}s` }} />
                  ))}
                </div>
              </div>
            </div>

            {/* HERO DECISION BLOCK */}
            {selectedSize && verdict && (
              <div style={{ background: verdict.bg, border: `1px solid ${verdict.border}`, borderRadius: 20, padding: '24px 28px', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${verdict.color}, transparent)`, animation: 'shimmer-line 2s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, background: `radial-gradient(circle, ${verdict.glow} 0%, transparent 60%)`, pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: `${verdict.color}20`, border: `1px solid ${verdict.color}50`, borderRadius: 100 }}>
                      <div style={{ width: 7, height: 7, background: verdict.color, borderRadius: '50%', boxShadow: `0 0 10px ${verdict.color}`, animation: 'pulse-glow 2s ease-in-out infinite' }} />
                      <span style={{ fontSize: 11, fontWeight: 800, color: verdict.color, letterSpacing: '2px' }}>{verdict.label}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>SIZE {selectedSize}</span>
                  </div>
                  <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: '-2px', marginBottom: 12 }}>
                    <span style={{ color: verdict.color, textShadow: `0 0 30px ${verdict.glow}` }}>
                      {estProfit !== null
                        ? (estProfit >= 0 ? `+$${estProfit}` : `-$${Math.abs(estProfit)}`)
                        : stockxNet ? `$${stockxNet}` : '—'}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 500, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>
                      {estProfit !== null ? 'profit' : 'net'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {stockxNet && (
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>${stockxNet}</span> stockx net
                      </div>
                    )}
                    {community?.sellRate !== null && community?.sellRate !== undefined && (
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{community.sellRate}%</span> sell rate
                      </div>
                    )}
                    {hotSize && (
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                        <span style={{ color: hotSize === 'hot' ? '#34D399' : '#C9A962', fontWeight: 700 }}>{hotSize}</span> size
                      </div>
                    )}
                    {personal?.avgProfit && (
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                        <span style={{ color: '#C9A962', fontWeight: 700 }}>${personal.avgProfit}</span> your avg profit
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}



            {/* EBAY MARKET */}
            {ebay && (
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${c.gold}, transparent)`, animation: 'shimmer-line 3s ease-in-out infinite' }} />
                <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '2px', marginBottom: 14 }}>EBAY MARKET{selectedSize ? ` · SIZE ${selectedSize}` : ''}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, textAlign: 'center', marginBottom: 10 }}>
                  {[['lowest', ebay.low, c.text], ['median', ebay.median, c.gold], ['average', ebay.avg, c.gold], ['highest', ebay.high, c.text]].map(([label, val, color]) => (
                    <div key={label}>
                      <div style={{ fontSize: 9, color: c.textDim, marginBottom: 5 }}>{label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color, textShadow: color === c.gold ? `0 0 15px ${c.goldGlow}` : 'none' }}>${val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: c.textDim }}>{ebay.total} listings found</div>
              </div>
            )}

            {/* SIZE SELECTOR */}
            {allSizes.length > 0 && (
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '2px', marginBottom: 12 }}>SELECT SIZE</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {allSizes.map(sz => {
                    const isSelected = selectedSize === sz;
                    const heat = hotSizes?.find(h => h.size === sz)?.heat;
                    return (
                      <button key={sz} className="size-btn" onClick={() => handleSizeSelect(sz)} disabled={sizeLoading}
                        style={{ background: isSelected ? `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)` : heat === 'hot' ? 'rgba(52,211,153,0.1)' : heat === 'warm' ? 'rgba(201,169,98,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSelected ? c.gold : heat === 'hot' ? 'rgba(52,211,153,0.4)' : heat === 'warm' ? 'rgba(201,169,98,0.4)' : c.border}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, color: isSelected ? '#000' : heat === 'hot' ? c.green : heat === 'warm' ? c.gold : c.textMuted, cursor: sizeLoading ? 'wait' : 'pointer', boxShadow: isSelected ? `0 4px 16px ${c.goldGlow}` : 'none' }}>
                        {sz}
                      </button>
                    );
                  })}
                </div>
                {sizeLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <div style={{ width: 6, height: 6, background: c.green, borderRadius: '50%', animation: 'pulse-glow 1s ease-in-out infinite' }} />
                    <span style={{ fontSize: 11, color: c.textDim }}>loading size data...</span>
                  </div>
                )}
              </div>
            )}

            {/* STOCKX DATA */}
            {stockx && (stockx.highestBid || stockx.lowestAsk) && (
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${c.green}, transparent)`, animation: 'shimmer-line 2.5s ease-in-out infinite' }} />
                <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '2px', marginBottom: 14 }}>STOCKX{selectedSize ? ` · SIZE ${selectedSize}` : ''}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {[['highest bid', stockx.highestBid, c.green], ['lowest ask', stockx.lowestAsk, c.text], ['sell faster', stockx.sellFaster, c.green], ['earn more', stockx.earnMore, c.gold]].filter(([, val]) => val).map(([label, val, color]) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: c.textDim, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color, textShadow: color !== c.text ? `0 0 15px ${color === c.green ? c.greenGlow : c.goldGlow}` : 'none' }}>${val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* YOUR DATA */}
            {personal && (
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
                {[
                  personal.timesBought > 0 && ['bought before', `${personal.timesBought}x`, c.text],
                  personal.avgProfit !== null && ['avg reseller profit', `$${personal.avgProfit}`, c.gold],
                  personal.avgSellTime !== null && [`avg sell time`, `${personal.avgSellTime} days`, c.text],
                  personal.sellRate && ['sell rate', personal.sellRate, c.green],
                  personal.bestPlatform && ['best platform', personal.bestPlatform, c.text],
                ].filter(Boolean).map(([label, val, color], i, arr) => (
                  <div key={label} className="hive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: i < arr.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                    <span style={{ fontSize: 13, color: c.textMuted }}>{label}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color, textShadow: color !== c.text ? `0 0 15px ${color === c.green ? c.greenGlow : c.goldGlow}` : 'none' }}>{val}</span>
                  </div>
                ))}
              </div>
            )}

            {/* COMMUNITY DATA */}
            {community && (
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ padding: '14px 20px 4px', fontSize: 9, color: c.textDim, letterSpacing: '2px' }}>COMMUNITY DATA</div>
                {[
                  community.avgProfit !== null && ['avg reseller profit', `$${community.avgProfit}`, c.gold],
                  community.sellRate !== null && ['sell rate', `${community.sellRate}%`, community.sellRate >= 80 ? c.green : community.sellRate >= 50 ? c.gold : c.red],
                  community.totalSales > 0 && ['units sold', community.totalSales.toLocaleString(), c.text],
                ].filter(Boolean).map(([label, val, color], i, arr) => (
                  <div key={label} className="hive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: i < arr.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                    <span style={{ fontSize: 13, color: c.textMuted }}>{label}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color, textShadow: color !== c.text ? `0 0 15px ${color === c.green ? c.greenGlow : c.goldGlow}` : 'none' }}>{val}</span>
                  </div>
                ))}
              </div>
            )}

            {/* HOT SIZES */}
            {hotSizes?.length > 0 && (
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '2px', marginBottom: 12 }}>HOT SIZES</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {hotSizes.map(({ size: sz, heat }) => {
                    const color = heat === 'hot' ? c.green : heat === 'warm' ? c.gold : c.red;
                    const bg = heat === 'hot' ? 'rgba(52,211,153,0.1)' : heat === 'warm' ? 'rgba(201,169,98,0.1)' : 'rgba(248,113,113,0.08)';
                    const border = heat === 'hot' ? 'rgba(52,211,153,0.3)' : heat === 'warm' ? 'rgba(201,169,98,0.3)' : 'rgba(248,113,113,0.2)';
                    return (
                      <div key={sz} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '6px 13px', fontSize: 13, fontWeight: 800, color, boxShadow: `0 0 10px ${color}30` }}>{sz}</div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[['hot', c.green], ['warm', c.gold], ['slow', c.red]].map(([label, color]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 6, height: 6, background: color, borderRadius: '50%', boxShadow: `0 0 8px ${color}`, animation: 'pulse-glow 2s ease-in-out infinite' }} />
                      <span style={{ fontSize: 10, color: c.textDim }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* COST CALCULATOR */}
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 28, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', bottom: -30, left: -30, width: 120, height: 120, background: `radial-gradient(circle, ${c.greenGlow} 0%, transparent 70%)`, pointerEvents: 'none' }} />
              <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '2px', marginBottom: 4 }}>YOUR COST AT OUTLET</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginBottom: 12 }}>
                {stockxNet
                  ? `StockX earn more: $${stockx?.earnMore} → net $${stockxNet} after 9.5% fee`
                  : 'select a size to calculate profit'}
              </div>
              <div style={{ display: 'flex', gap: 10, position: 'relative', zIndex: 1 }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <span style={{ fontSize: 16, color: c.textDim, fontWeight: 800 }}>$</span>
                  <input type="number" placeholder="what did you pay?" value={cost} onChange={e => setCost(e.target.value)}
                    style={{ background: 'transparent', border: 'none', outline: 'none', color: c.text, fontSize: 15, width: '100%', fontFamily: 'inherit', fontWeight: 600 }} />
                </div>
                <div style={{ background: estProfit === null ? 'rgba(255,255,255,0.03)' : estProfit >= 0 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)', border: `1px solid ${estProfit === null ? c.border : estProfit >= 0 ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`, borderRadius: 12, padding: '12px 16px', textAlign: 'center', minWidth: 110 }}>
                  <div style={{ fontSize: 9, color: c.textDim, marginBottom: 4 }}>STOCKX PROFIT</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: estProfit === null ? c.textDim : estProfit >= 0 ? c.green : c.red, textShadow: estProfit !== null && estProfit >= 0 ? `0 0 15px ${c.greenGlow}` : 'none' }}>
                    {estProfit === null ? '—' : estProfit >= 0 ? `+$${estProfit}` : `-$${Math.abs(estProfit)}`}
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {!result && !loading && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <svg width="60" height="60" viewBox="0 0 22 22" fill="none" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.2 }}>
              <circle cx="11" cy="11" r="3" fill={c.gold}/>
              <circle cx="4" cy="6" r="2.2" fill={c.gold}/>
              <circle cx="18" cy="6" r="2.2" fill={c.gold}/>
              <circle cx="4" cy="16" r="2.2" fill={c.gold}/>
              <circle cx="18" cy="16" r="2.2" fill={c.gold}/>
              <line x1="6" y1="7.5" x2="9" y2="9.5" stroke={c.gold} strokeWidth="1.5"/>
              <line x1="16" y1="7.5" x2="13" y2="9.5" stroke={c.gold} strokeWidth="1.5"/>
              <line x1="6" y1="14.5" x2="9" y2="12.5" stroke={c.gold} strokeWidth="1.5"/>
              <line x1="16" y1="14.5" x2="13" y2="12.5" stroke={c.gold} strokeWidth="1.5"/>
            </svg>
            <div style={{ fontSize: 14, color: c.textDim }}>scan a sku to see buying intelligence</div>
          </div>
        )}

      </div>
    </div>
  );
}
