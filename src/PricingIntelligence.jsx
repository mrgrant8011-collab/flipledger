import React, { useState } from 'react';

/**
 * PRICING INTELLIGENCE - Reusable sidebar panel
 * 
 * ACCURATE eBay Fee Structure (Men's/Women's Athletic Shoes):
 * ────────────────────────────────────────────────────────────
 * No Store:   $150+ → 8% FVF   |  Under $150 → 13.6% + $0.40
 * Basic+:     $150+ → 7% FVF   |  Under $150 → 12.7% + $0.40
 * Below Standard penalty: +6%
 * 
 * Authenticity Guarantee ($75+): Seller shipping = $0
 * Under $75: Seller shipping = user-configurable (default $14)
 * 
 * Props:
 * - price, setPrice, promotedOn, adRate, stockxAsk
 * - marketData: { total, low, high, avg, median, promotedPct, listings[] }
 * - size: string (for size-specific filtering)
 * - ebaySellerLevel: 'top_rated' | 'above_standard' | 'below_standard'
 * - ebayStoreType: 'none' | 'starter' | 'basic' | 'premium' | 'anchor' | 'enterprise'
 * - c: color theme object
 */
export default function PricingIntelligence({ 
  price, setPrice, promotedOn, adRate, stockxAsk, 
  marketData, size, cost = 0, ebaySellerLevel = 'above_standard', 
  ebayStoreType = 'none', c 
}) {
  const [showCompetitors, setShowCompetitors] = useState(false);
  const [customShip, setCustomShip] = useState(null); // null = auto

  const pv = parseFloat(price) || 0;
  const rv = promotedOn ? (parseFloat(adRate) || 0) : 0;

  // ═══ ACCURATE FEE CALCULATION ═══
  const hasStore = ebayStoreType !== 'none';
  const isBelowStandard = ebaySellerLevel === 'below_standard';

  // Tiered FVF rates for Athletic Shoes
  let fvfRate;
  if (pv >= 150) {
    fvfRate = hasStore ? 0.07 : 0.08;
  } else {
    fvfRate = hasStore ? 0.127 : 0.136;
  }

  // Below Standard penalty: +6%
  if (isBelowStandard) fvfRate += 0.06;

  // Per-order fee: $0.40 under $150, waived at $150+
  const perOrderFee = pv >= 150 ? 0 : 0.40;

  const fvf = pv * fvfRate;
  const promoFee = pv * rv / 100;

  // Smart shipping: $75+ = $0 (AG), under $75 = $14 default
  const autoShip = pv >= 75 ? 0 : 14;
  const ship = customShip !== null ? parseFloat(customShip) || 0 : autoShip;

  const ebayNet = Math.round(pv - fvf - perOrderFee - promoFee - ship);

  // StockX net calc
  const sxAsk = parseFloat(stockxAsk) || 0;
  const sxNet = Math.round(sxAsk * 0.88);
  const diff = ebayNet - sxNet;

  const rank = marketData?.listings 
    ? marketData.listings.filter(l => l.price < pv).length + 1 
    : null;

  // ═══ SIZE-SPECIFIC FILTERING ═══
  let sizeStats = null;
  let sizeRank = null;
  if (size && marketData?.listings) {
    const sizeNum = String(size).replace(/[^0-9.]/g, '');
    const sizeListings = marketData.listings.filter(l => {
      const lSize = String(l.size || '').replace(/[^0-9.]/g, '');
      return lSize === sizeNum;
    });
    if (sizeListings.length > 0) {
      const prices = sizeListings.map(l => l.price).sort((a, b) => a - b);
      const sum = prices.reduce((a, b) => a + b, 0);
      const mid = Math.floor(prices.length / 2);
      sizeStats = {
        count: sizeListings.length,
        low: prices[0],
        high: prices[prices.length - 1],
        avg: Math.round(sum / prices.length),
        median: prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2),
        promotedPct: Math.round(sizeListings.filter(l => l.promoted).length / sizeListings.length * 100)
      };
      sizeRank = sizeListings.filter(l => l.price < pv).length + 1;
    }
  }

  const card = { background: c.card, borderRadius: 12, border: `1px solid ${c.border}` };

  // Format labels
  const fvfPct = (fvfRate * 100).toFixed(1);
  const fvfLabel = isBelowStandard 
    ? `FVF (${fvfPct}% incl. penalty)` 
    : `Final Value Fee (${fvfPct}%)`;
  const shipLabel = customShip !== null 
    ? 'Shipping (custom)' 
    : pv >= 75 ? 'Shipping ($0 AG)' : 'Shipping (est)';

  // No market data loaded — still show fees
  if (!marketData) {
    return (
      <div>
        <FeeBreakdown pv={pv} fvf={fvf} fvfLabel={fvfLabel} perOrderFee={perOrderFee}
          promoFee={promoFee} rv={rv} ship={ship} shipLabel={shipLabel} ebayNet={ebayNet} 
          customShip={customShip} setCustomShip={setCustomShip} autoShip={autoShip}
          cost={cost} c={c} card={card} />
      </div>
    );
  }

  return (
    <div>
      {/* ════ NET COMPARISON ════ */}
      {sxAsk > 0 && (
        <div style={{ ...card, padding: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, marginBottom: 10 }}>
            NET COMPARISON
          </div>
          <div style={{ 
            padding: '10px 12px', 
            background: diff > 0 ? 'rgba(34,197,94,0.05)' : diff < 0 ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${diff > 0 ? 'rgba(34,197,94,0.15)' : diff < 0 ? 'rgba(239,68,68,0.15)' : c.border}`,
            borderRadius: 10 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: c.textMuted }}>
                eBay Net <span style={{ fontSize: 9 }}>(at ${pv})</span>
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: c.green }}>${ebayNet}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: c.textMuted }}>
                StockX Net <span style={{ fontSize: 9 }}>(your ask ${sxAsk})</span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>${sxNet}</span>
            </div>
            <div style={{ height: 1, background: c.border, margin: '4px 0' }} />
            <div style={{ 
              textAlign: 'center', fontSize: 12, fontWeight: 700, marginTop: 4,
              color: diff > 0 ? c.green : diff < 0 ? c.red : c.textMuted 
            }}>
              {diff > 0 ? `+$${diff} more on eBay ✓` : diff < 0 ? `-$${Math.abs(diff)} less on eBay` : 'Same net'}
            </div>
          </div>
        </div>
      )}

      {/* ════ SIZE-SPECIFIC LISTINGS ════ */}
      {sizeStats && (
        <div style={{ ...card, padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: c.gold }}>SIZE {size} LISTINGS</span>
            <span style={{ 
              padding: '2px 6px', background: 'rgba(201,169,98,0.1)', 
              borderRadius: 10, fontSize: 9, color: c.gold, fontWeight: 600 
            }}>
              {sizeStats.count} listed
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            {[
              { l: 'LOWEST', v: `$${sizeStats.low}`, color: c.gold, big: true },
              { l: 'AVERAGE', v: `$${sizeStats.avg}`, big: true },
              { l: 'MEDIAN', v: `$${sizeStats.median}` },
              { l: 'HIGHEST', v: `$${sizeStats.high}` },
            ].map(s => (
              <div key={s.l} style={{ padding: 6, background: 'rgba(201,169,98,0.04)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: c.textMuted, marginBottom: 2 }}>{s.l}</div>
                <div style={{ fontSize: s.big ? 16 : 13, fontWeight: s.big ? 800 : 700, color: s.color || c.text }}>{s.v}</div>
              </div>
            ))}
          </div>
          {sizeRank !== null && (
            <div style={{ 
              padding: '5px 10px', background: 'rgba(201,169,98,0.06)', 
              border: '1px solid rgba(201,169,98,0.15)', borderRadius: 8,
              fontSize: 11, fontWeight: 700 
            }}>
              ${pv} ranks <span style={{ color: c.gold }}>#{sizeRank}</span> of {sizeStats.count} for size {size}
            </div>
          )}
        </div>
      )}

      {/* ════ ALL SIZES LISTINGS ════ */}
      <div style={{ ...card, padding: 14, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>
            {sizeStats ? 'ALL SIZES' : 'EBAY ACTIVE LISTINGS'}
          </span>
          <span style={{ 
            padding: '2px 6px', background: 'rgba(34,197,94,0.1)', 
            borderRadius: 10, fontSize: 9, color: c.green, fontWeight: 600 
          }}>
            {marketData.total} listed
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          {[
            { l: 'LOWEST', v: `$${marketData.low}`, color: c.gold, big: true },
            { l: 'AVERAGE', v: `$${marketData.avg}`, big: true },
            { l: 'MEDIAN', v: `$${marketData.median}` },
            { l: 'HIGHEST', v: `$${marketData.high}` },
          ].map(s => (
            <div key={s.l} style={{ padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: c.textMuted, marginBottom: 2 }}>{s.l}</div>
              <div style={{ fontSize: s.big ? 16 : 13, fontWeight: s.big ? 800 : 700, color: s.color || c.text }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Position — only show if no size-specific rank shown */}
        {rank !== null && !sizeStats && (
          <div style={{ 
            padding: '6px 10px', background: 'rgba(201,169,98,0.06)', 
            border: '1px solid rgba(201,169,98,0.15)', borderRadius: 8, marginBottom: 10,
            fontSize: 11, fontWeight: 700 
          }}>
            ${pv} ranks <span style={{ color: c.gold }}>#{rank}</span> of {marketData.total}
          </div>
        )}

        {/* Quick Set — use size-specific stats if available */}
        <div style={{ fontSize: 9, color: c.textMuted, fontWeight: 600, marginBottom: 6 }}>QUICK SET</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5, marginBottom: 10 }}>
          {[
            { l: 'Beat Low', v: (sizeStats?.low || marketData.low) - 1 },
            { l: 'Lowest', v: sizeStats?.low || marketData.low },
            { l: 'Median', v: sizeStats?.median || marketData.median },
            { l: 'Average', v: sizeStats?.avg || marketData.avg },
          ].map(q => (
            <button key={q.l} onClick={() => setPrice(String(q.v))} style={{ 
              padding: '6px 2px', textAlign: 'center', cursor: 'pointer', borderRadius: 6,
              border: parseFloat(price) === q.v ? `2px solid ${c.green}` : `1px solid ${c.border}`,
              background: parseFloat(price) === q.v ? 'rgba(34,197,94,0.1)' : 'transparent',
              color: parseFloat(price) === q.v ? c.green : c.text 
            }}>
              <div style={{ fontSize: 8, color: c.textMuted }}>{q.l}</div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>${q.v}</div>
            </button>
          ))}
        </div>

        {/* Competitors */}
        {marketData.listings && marketData.listings.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: c.textMuted, fontWeight: 600 }}>COMPETING LISTINGS</span>
              <button onClick={() => setShowCompetitors(!showCompetitors)} 
                style={{ background: 'none', border: 'none', color: c.green, fontSize: 9, cursor: 'pointer', fontWeight: 600 }}>
                {showCompetitors ? 'Hide ▲' : 'Show ▼'}
              </button>
            </div>
            {showCompetitors && (
              <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                {marketData.listings.map((l, i) => (
                  <div key={i} onClick={() => setPrice(String(l.price))} style={{ 
                    display: 'flex', justifyContent: 'space-between', padding: '6px',
                    cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: l.price < pv ? 'rgba(239,68,68,0.03)' : 'transparent' 
                  }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: l.price < pv ? c.red : c.text }}>
                        ${l.price}
                      </span>
                      <span style={{ fontSize: 9, color: c.textMuted }}>
                        {l.shipping === 0 ? 'free' : `+$${l.shipping}`}
                      </span>
                      {l.promoted && (
                        <span style={{ 
                          fontSize: 8, color: c.gold, fontWeight: 700,
                          background: 'rgba(201,169,98,0.1)', padding: '1px 3px', borderRadius: 3 
                        }}>AD</span>
                      )}
                    </div>
                    <span style={{ fontSize: 9, color: c.textMuted }}>sz {l.size}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ════ FEE BREAKDOWN ════ */}
      <FeeBreakdown pv={pv} fvf={fvf} fvfLabel={fvfLabel} perOrderFee={perOrderFee}
        promoFee={promoFee} rv={rv} ship={ship} shipLabel={shipLabel} ebayNet={ebayNet}
        customShip={customShip} setCustomShip={setCustomShip} autoShip={autoShip}
        cost={cost} c={c} card={card} />
    </div>
  );
}

// Fee breakdown — renders with or without market data
function FeeBreakdown({ pv, fvf, fvfLabel, perOrderFee, promoFee, rv, ship, shipLabel, 
  ebayNet, customShip, setCustomShip, autoShip, cost, c, card }) {
  const rows = [
    { l: 'List Price', v: `$${pv}`, bold: true },
    { l: fvfLabel, v: `-$${fvf.toFixed(2)}`, color: c.red },
    ...(perOrderFee > 0 ? [{ l: 'Per-order fee', v: `-$${perOrderFee.toFixed(2)}`, color: c.red }] : []),
    ...(rv > 0 ? [{ l: `Promoted (${rv}%)`, v: `-$${Math.round(promoFee)}`, color: c.gold }] : []),
    { l: shipLabel, v: ship === 0 ? '$0 ✓' : `-$${ship}`, color: ship === 0 ? c.green : c.red },
  ];

  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, marginBottom: 8 }}>FEE BREAKDOWN</div>
      {rows.map(r => (
        <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
          <span style={{ color: c.textMuted }}>{r.l}</span>
          <span style={{ fontWeight: r.bold ? 700 : 600, color: r.color || c.text }}>{r.v}</span>
        </div>
      ))}

      {/* Shipping override */}
      <div style={{ 
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
        padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 
      }}>
        <span style={{ fontSize: 9, color: c.textMuted, whiteSpace: 'nowrap' }}>Ship cost:</span>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <button 
            onClick={() => setCustomShip(null)}
            style={{ 
              padding: '3px 8px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
              border: customShip === null ? `1px solid ${c.green}` : `1px solid ${c.border}`,
              background: customShip === null ? 'rgba(34,197,94,0.1)' : 'transparent',
              color: customShip === null ? c.green : c.textMuted, fontWeight: 600
            }}
          >
            Auto (${autoShip})
          </button>
          <input
            type="number"
            value={customShip !== null ? customShip : ''}
            placeholder="$"
            onChange={e => setCustomShip(e.target.value)}
            onFocus={() => { if (customShip === null) setCustomShip(String(autoShip)); }}
            style={{ 
              width: 55, padding: '3px 6px', fontSize: 10, borderRadius: 4,
              border: customShip !== null ? `1px solid ${c.green}` : `1px solid ${c.border}`,
              background: 'transparent', color: c.text, textAlign: 'center'
            }}
          />
        </div>
      </div>

      <div style={{ height: 1, background: c.border, margin: '8px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ fontWeight: 700 }}>Your Net</span>
        <span style={{ fontWeight: 800, color: c.green }}>${ebayNet}</span>
      </div>
      {cost > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
            <span style={{ color: c.textMuted }}>Buy Cost</span>
            <span style={{ color: c.textMuted }}>-${parseFloat(cost).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 4 }}>
            <span style={{ fontWeight: 700 }}>Profit</span>
            <span style={{ fontWeight: 800, color: (ebayNet - parseFloat(cost)) >= 0 ? c.green : c.red }}>
              ${(ebayNet - parseFloat(cost)).toFixed(0)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
