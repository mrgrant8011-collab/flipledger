import React, { useState } from 'react';

/**
 * PRICING INTELLIGENCE - Reusable sidebar panel
 * 
 * Shows eBay active listing data + StockX net comparison to help
 * sellers make informed pricing decisions.
 * 
 * Used by:
 * - ListingReview (new listings - Step 2)
 * - EbayInlineEdit (editing existing - On eBay view)
 * 
 * Props:
 * - price: current eBay price (string)
 * - setPrice: function to update price
 * - promotedOn: boolean
 * - adRate: string (e.g. "4")
 * - stockxAsk: number or string (user's StockX ask for this item)
 * - marketData: { total, low, high, avg, median, promotedPct, listings[] }
 * - shippingEstimate: number (default 14)
 * - c: color theme object
 */
export default function PricingIntelligence({ 
  price, setPrice, promotedOn, adRate, stockxAsk, 
  marketData, shippingEstimate = 14, c 
}) {
  const [showCompetitors, setShowCompetitors] = useState(false);

  const pv = parseFloat(price) || 0;
  const rv = promotedOn ? (parseFloat(adRate) || 0) : 0;
  const ship = shippingEstimate;

  // eBay fee calc
  const fvf = pv * 0.1255;
  const processing = pv * 0.0057;
  const promoFee = pv * rv / 100;
  const ebayNet = Math.round(pv - fvf - processing - promoFee - ship);

  // StockX net calc (Level 1 default 12%, user's ask price)
  const sxAsk = parseFloat(stockxAsk) || 0;
  const sxNet = Math.round(sxAsk * 0.88);

  const diff = ebayNet - sxNet;
  const rank = marketData?.listings 
    ? marketData.listings.filter(l => l.price < pv).length + 1 
    : null;

  const card = { background: c.card, borderRadius: 12, border: `1px solid ${c.border}` };

  // No market data loaded
  if (!marketData) {
    return (
      <div>
        {/* Still show fee breakdown even without market data */}
        <FeeBreakdown pv={pv} fvf={fvf} processing={processing} promoFee={promoFee} 
          rv={rv} ship={ship} ebayNet={ebayNet} c={c} card={card} />
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

      {/* ════ ACTIVE LISTINGS ════ */}
      <div style={{ ...card, padding: 14, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>EBAY ACTIVE LISTINGS</span>
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

        {/* Position */}
        {rank !== null && (
          <div style={{ 
            padding: '6px 10px', background: 'rgba(201,169,98,0.06)', 
            border: '1px solid rgba(201,169,98,0.15)', borderRadius: 8, marginBottom: 10,
            fontSize: 11, fontWeight: 700 
          }}>
            ${pv} ranks <span style={{ color: c.gold }}>#{rank}</span> of {marketData.total}
          </div>
        )}

        {/* Quick Set */}
        <div style={{ fontSize: 9, color: c.textMuted, fontWeight: 600, marginBottom: 6 }}>QUICK SET</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5, marginBottom: 10 }}>
          {[
            { l: 'Beat Low', v: marketData.low - 1 },
            { l: 'Lowest', v: marketData.low },
            { l: 'Median', v: marketData.median },
            { l: 'Average', v: marketData.avg },
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
      <FeeBreakdown pv={pv} fvf={fvf} processing={processing} promoFee={promoFee} 
        rv={rv} ship={ship} ebayNet={ebayNet} c={c} card={card} />
    </div>
  );
}

// Extracted so it can render with or without market data
function FeeBreakdown({ pv, fvf, processing, promoFee, rv, ship, ebayNet, c, card }) {
  const rows = [
    { l: 'List Price', v: `$${pv}`, bold: true },
    { l: 'Final Value (12.55%)', v: `-$${Math.round(fvf)}`, color: c.red },
    { l: 'Processing (0.57%)', v: `-$${Math.round(processing)}`, color: c.red },
    ...(rv > 0 ? [{ l: `Promoted (${rv}%)`, v: `-$${Math.round(promoFee)}`, color: c.gold }] : []),
    { l: 'Shipping (est)', v: `-$${ship}`, color: c.red },
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
      <div style={{ height: 1, background: c.border, margin: '6px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ fontWeight: 700 }}>Your Net</span>
        <span style={{ fontWeight: 800, color: c.green }}>${ebayNet}</span>
      </div>
    </div>
  );
}
