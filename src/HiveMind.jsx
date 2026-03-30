import { useState, useEffect } from 'react';

const c = {
  bg: '#060606',
  card: '#0f0f0f',
  cardInner: '#111',
  border: '#1a1a1a',
  gold: '#C9A962',
  green: '#10b981',
  red: '#ef4444',
  text: '#fff',
  muted: '#3a3a3a',
  dim: '#2a2a2a',
};

export default function HiveMind({ stockxToken, ebayToken, userId }) {
  const [sku, setSku] = useState('');
  const [selectedSize, setSelectedSize] = useState(null);
  const [cost, setCost] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sizeLoading, setSizeLoading] = useState(false);

  const allSizes = result?.stockx?.allVariants?.map(v => v.size) || [];

  async function scan(skuOverride, sizeOverride) {
    const scanSku = skuOverride || sku.trim().toUpperCase();
    const scanSize = sizeOverride !== undefined ? sizeOverride : selectedSize;

    if (!scanSku) return;

    const isInitialScan = !skuOverride;
    if (isInitialScan) setLoading(true);
    else setSizeLoading(true);

    setError(null);

    try {
      const params = new URLSearchParams({ sku: scanSku, user_id: userId });
      if (scanSize) params.set('size', scanSize);
      if (stockxToken) params.set('stockxToken', stockxToken);

      const res = await fetch(`/api/hive-mind?${params}`, {
        headers: ebayToken ? { Authorization: `Bearer ${ebayToken}` } : {},
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load');
      setResult(data);
      if (isInitialScan && data.stockx?.allVariants?.length > 0 && !selectedSize) {
        setSelectedSize(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setSizeLoading(false);
    }
  }

  async function handleSizeSelect(size) {
    const newSize = size === selectedSize ? null : size;
    setSelectedSize(newSize);
    await scan(sku.trim().toUpperCase(), newSize);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') scan();
  }

  const { personal, community, stockx, ebay, netComparison, hotSizes, signals } = result || {};

  const signalDots = signals || [];

  function dot(color) {
    const bg = color === 'green' ? c.green : color === 'yellow' ? c.gold : color === 'red' ? c.red : '#2a2a2a';
    return <div style={{ width: 9, height: 9, borderRadius: '50%', background: bg }} />;
  }

  function Row({ label, value, color }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `0.5px solid ${c.border}` }}>
        <span style={{ fontSize: 12, color: c.muted }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: color || c.text }}>{value}</span>
      </div>
    );
  }

  function Section({ children }) {
    return (
      <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${c.border}` }}>
        {children}
      </div>
    );
  }

  const estProfit = cost && ebay?.avg
    ? Math.round(ebay.avg * 0.92 - parseFloat(cost))
    : null;

  return (
    <div style={{ background: c.bg, minHeight: '100vh', padding: '20px 16px', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, background: c.gold, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="2.5" fill="#000"/>
              <circle cx="3.5" cy="5.5" r="2" fill="#000"/>
              <circle cx="16.5" cy="5.5" r="2" fill="#000"/>
              <circle cx="3.5" cy="14.5" r="2" fill="#000"/>
              <circle cx="16.5" cy="14.5" r="2" fill="#000"/>
              <line x1="5.2" y1="6.8" x2="8" y2="8.5" stroke="#000" strokeWidth="1.3"/>
              <line x1="14.8" y1="6.8" x2="12" y2="8.5" stroke="#000" strokeWidth="1.3"/>
              <line x1="5.2" y1="13.2" x2="8" y2="11.5" stroke="#000" strokeWidth="1.3"/>
              <line x1="14.8" y1="13.2" x2="12" y2="11.5" stroke="#000" strokeWidth="1.3"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: c.gold, letterSpacing: 1.5 }}>HIVE MIND</div>
            <div style={{ fontSize: 9, color: c.muted, letterSpacing: 2, marginTop: 1 }}>BUYING INTELLIGENCE</div>
          </div>
        </div>

        <div style={{ background: c.cardInner, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke={c.muted} strokeWidth="1.3"/>
            <line x1="10" y1="10" x2="13.5" y2="13.5" stroke={c.muted} strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            value={sku}
            onChange={e => setSku(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="enter sku — e.g. CN8490-002"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: c.text, fontSize: 14, flex: 1, fontFamily: 'SF Mono, monospace' }}
          />
          <button
            onClick={() => scan()}
            disabled={loading || !sku.trim()}
            style={{ background: loading ? '#8a7030' : c.gold, color: '#000', fontSize: 10, fontWeight: 800, padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', letterSpacing: 1, opacity: !sku.trim() ? 0.5 : 1 }}
          >
            {loading ? '...' : 'SCAN'}
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: `0.5px solid rgba(239,68,68,0.3)`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: c.red }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ background: c.card, border: `0.5px solid ${c.border}`, borderRadius: 14, overflow: 'hidden' }}>

            <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{stockx?.productTitle || sku}</div>
                <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>
                  {sku}{stockx?.retailPrice ? ` · Retail $${stockx.retailPrice}` : ''}
                  {selectedSize ? ` · Size ${selectedSize}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {signalDots.map((s, i) => <div key={i}>{dot(s)}</div>)}
              </div>
            </div>

            {netComparison && (
              <Section>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ background: netComparison.better === 'stockx' ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)', border: `0.5px solid ${netComparison.better === 'stockx' ? 'rgba(16,185,129,0.2)' : c.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 10, color: c.muted, letterSpacing: 1, marginBottom: 6 }}>STOCKX NET</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: netComparison.better === 'stockx' ? c.green : c.text, lineHeight: 1 }}>${netComparison.stockxNet}</div>
                    <div style={{ fontSize: 10, color: c.muted, marginTop: 4 }}>after 9.5% fee</div>
                  </div>
                  <div style={{ background: netComparison.better === 'ebay' ? 'rgba(201,169,98,0.08)' : 'rgba(255,255,255,0.02)', border: `0.5px solid ${netComparison.better === 'ebay' ? 'rgba(201,169,98,0.2)' : c.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 10, color: c.muted, letterSpacing: 1, marginBottom: 6 }}>EBAY NET</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: netComparison.better === 'ebay' ? c.gold : c.text, lineHeight: 1 }}>${netComparison.ebayNet}</div>
                    <div style={{ fontSize: 10, color: c.muted, marginTop: 4 }}>
                      {netComparison.diff && netComparison.better
                        ? `+$${netComparison.diff} more on ${netComparison.better}`
                        : 'after 8% fee'}
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {ebay && (
              <Section>
                <div style={{ fontSize: 9, color: c.muted, letterSpacing: 2, marginBottom: 12 }}>
                  EBAY MARKET{selectedSize ? ` · SIZE ${selectedSize}` : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, textAlign: 'center', marginBottom: 10 }}>
                  {[['lowest', ebay.low, c.text], ['median', ebay.median, c.gold], ['average', ebay.avg, c.gold], ['highest', ebay.high, c.text]].map(([label, val, color]) => (
                    <div key={label}>
                      <div style={{ fontSize: 9, color: c.muted, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color }}>${val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: c.muted }}>{ebay.total} listings found</div>
              </Section>
            )}

            {allSizes.length > 0 && (
              <Section>
                <div style={{ fontSize: 9, color: c.muted, letterSpacing: 2, marginBottom: 10 }}>SELECT SIZE</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {allSizes.map(sz => {
                    const isSelected = selectedSize === sz;
                    const heat = hotSizes?.find(h => h.size === sz)?.heat;
                    const borderColor = isSelected ? c.gold : heat === 'hot' ? 'rgba(16,185,129,0.3)' : heat === 'warm' ? 'rgba(201,169,98,0.3)' : c.border;
                    const textColor = isSelected ? '#000' : heat === 'hot' ? c.green : heat === 'warm' ? c.gold : c.muted;
                    const bg = isSelected ? c.gold : heat === 'hot' ? 'rgba(16,185,129,0.08)' : heat === 'warm' ? 'rgba(201,169,98,0.08)' : c.cardInner;
                    return (
                      <button
                        key={sz}
                        onClick={() => handleSizeSelect(sz)}
                        disabled={sizeLoading}
                        style={{ background: bg, border: `0.5px solid ${borderColor}`, borderRadius: 6, padding: '5px 11px', fontSize: 12, fontWeight: 700, color: textColor, cursor: 'pointer' }}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
                {sizeLoading && <div style={{ fontSize: 10, color: c.muted, marginTop: 8 }}>loading size data...</div>}
              </Section>
            )}

            {stockx && !stockx.variantNotFound && (stockx.highestBid || stockx.lowestAsk) && (
              <Section>
                <div style={{ fontSize: 9, color: c.muted, letterSpacing: 2, marginBottom: 12 }}>
                  STOCKX{selectedSize ? ` · SIZE ${selectedSize}` : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    ['highest bid', stockx.highestBid, c.green],
                    ['lowest ask', stockx.lowestAsk, c.text],
                    ['sell faster', stockx.sellFaster, c.green],
                    ['earn more', stockx.earnMore, c.gold],
                  ].filter(([, val]) => val).map(([label, val, color]) => (
                    <div key={label}>
                      <div style={{ fontSize: 9, color: c.muted, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color }}>${val}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {personal && (
              <Section>
                <div style={{ fontSize: 9, color: c.muted, letterSpacing: 2, marginBottom: 4 }}>YOUR DATA</div>
                {personal.timesBought > 0 && <Row label="bought before" value={`${personal.timesBought}x`} />}
                {personal.avgProfit !== null && <Row label="avg profit" value={`$${personal.avgProfit}`} color={c.gold} />}
                {personal.avgSellTime !== null && <Row label="avg sell time" value={`${personal.avgSellTime} days`} />}
                {personal.sellRate && <Row label="sell rate" value={personal.sellRate} color={c.green} />}
                {personal.bestPlatform && <Row label="best platform" value={personal.bestPlatform} />}
              </Section>
            )}

            {community && (
              <Section>
                <div style={{ fontSize: 9, color: c.muted, letterSpacing: 2, marginBottom: 4 }}>COMMUNITY DATA</div>
                {community.avgProfit !== null && <Row label="avg profit" value={`$${community.avgProfit}`} color={c.gold} />}
                {community.sellRate !== null && <Row label="sell rate" value={`${community.sellRate}%`} color={community.sellRate >= 80 ? c.green : community.sellRate >= 50 ? c.gold : c.red} />}
                {community.totalSales > 0 && <Row label="units sold" value={community.totalSales.toLocaleString()} />}
              </Section>
            )}

            {hotSizes?.length > 0 && (
              <Section>
                <div style={{ fontSize: 9, color: c.muted, letterSpacing: 2, marginBottom: 10 }}>HOT SIZES</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                  {hotSizes.map(({ size: sz, heat }) => {
                    const color = heat === 'hot' ? c.green : heat === 'warm' ? c.gold : c.red;
                    const bg = heat === 'hot' ? 'rgba(16,185,129,0.1)' : heat === 'warm' ? 'rgba(201,169,98,0.1)' : 'rgba(239,68,68,0.07)';
                    const border = heat === 'hot' ? 'rgba(16,185,129,0.25)' : heat === 'warm' ? 'rgba(201,169,98,0.25)' : 'rgba(239,68,68,0.18)';
                    return (
                      <div key={sz} style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 6, padding: '5px 11px', fontSize: 12, fontWeight: 700, color }}>
                        {sz}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  {[['hot', c.green], ['warm', c.gold], ['slow', c.red]].map(([label, color]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 6, height: 6, background: color, borderRadius: '50%' }} />
                      <span style={{ fontSize: 10, color: c.muted }}>{label}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 9, color: c.muted, letterSpacing: 2, marginBottom: 10 }}>YOUR COST</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ background: c.cardInner, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <span style={{ fontSize: 14, color: c.muted, fontWeight: 700 }}>$</span>
                  <input
                    type="number"
                    placeholder="outlet price"
                    value={cost}
                    onChange={e => setCost(e.target.value)}
                    style={{ background: 'transparent', border: 'none', outline: 'none', color: c.text, fontSize: 14, width: '100%', fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ background: c.cardInner, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: '11px 14px', textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: 9, color: c.muted, marginBottom: 3 }}>est. profit</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: estProfit === null ? c.muted : estProfit >= 0 ? c.green : c.red }}>
                    {estProfit === null ? '—' : estProfit >= 0 ? `+$${estProfit}` : `-$${Math.abs(estProfit)}`}
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {!result && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: c.muted, fontSize: 13 }}>
            scan a sku to see buying intelligence
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 9, color: '#1a1a1a', letterSpacing: 1 }}>powered by FlipLedger · flipledgerhq.com</span>
        </div>

      </div>
    </div>
  );
}
