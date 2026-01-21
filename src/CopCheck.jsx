import { useState, useEffect } from "react";

const EXAMPLE_SKUS = ["DZ5485-612", "FQ1759-001", "DV1748-601", "IE0219", "HQ6916-300"];
const STOCKX_SELLER_FEE = 0.095;

function Particles({ color, count = 40 }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1 + Math.random() * 2,
    size: 4 + Math.random() * 8,
  }));

  return (
    <div style={styles.particleContainer}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            ...styles.particle,
            left: `${p.x}%`,
            width: p.size,
            height: p.size,
            background: color,
            boxShadow: `0 0 ${p.size * 2}px ${color}`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function CopCheck() {
  const [sku, setSku] = useState("");
  const [cost, setCost] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [countingScore, setCountingScore] = useState(0);
  const [jackpot, setJackpot] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (result && showResult && result.overallLiquidityScore) {
      const target = result.overallLiquidityScore;
      const duration = 1500;
      const steps = 60;
      const increment = target / steps;
      let current = 0;
      
      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          setCountingScore(target);
          clearInterval(timer);
          if (result.verdict === "COP") {
            setJackpot(true);
            setTimeout(() => setJackpot(false), 3000);
          }
        } else {
          setCountingScore(Math.floor(current));
        }
      }, duration / steps);

      return () => clearInterval(timer);
    }
  }, [result, showResult]);

  const handleCheck = async () => {
    if (!sku.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setShowResult(false);
    setCountingScore(0);
    setJackpot(false);

    try {
      const response = await fetch(`/api/cop-check?sku=${encodeURIComponent(sku.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        // Handle specific error types
        if (data.error === 'SKU_NOT_FOUND') {
          setError({ type: 'not_found', message: 'SKU not found. Check the style code and try again.' });
        } else if (data.error === 'AUTH_REQUIRED') {
          setError({ type: 'auth', message: 'API authentication required. Using limited data.' });
        } else {
          setError({ type: 'general', message: data.message || 'Unable to fetch market data.' });
        }
        setLoading(false);
        return;
      }

      setResult(data);
      setTimeout(() => setShowResult(true), 300);
    } catch (err) {
      setError({ type: 'connection', message: 'Connection error. Please check your internet and try again.' });
    }

    setLoading(false);
  };

  const handleClear = () => {
    setSku("");
    setCost("");
    setResult(null);
    setError(null);
    setShowResult(false);
    setCountingScore(0);
    setJackpot(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleCheck();
  };

  const calculateProfit = (bid) => {
    if (!cost || !bid) return null;
    const costNum = parseFloat(cost);
    if (isNaN(costNum) || costNum <= 0) return null;
    const payout = bid * (1 - STOCKX_SELLER_FEE);
    const profit = payout - costNum;
    const roi = ((profit / costNum) * 100);
    return { profit, roi, payout };
  };

  const verdictColors = {
    COP: { bg: "rgba(0, 255, 100, 0.15)", border: "#00ff64", text: "#00ff64", glow: "0 0 60px rgba(0, 255, 100, 0.6)" },
    MAYBE: { bg: "rgba(255, 220, 0, 0.15)", border: "#ffdc00", text: "#ffdc00", glow: "0 0 60px rgba(255, 220, 0, 0.5)" },
    DROP: { bg: "rgba(255, 50, 50, 0.15)", border: "#ff3232", text: "#ff3232", glow: "0 0 60px rgba(255, 50, 50, 0.5)" },
  };

  const liquidityColor = (score) => score >= 70 ? "#00ff64" : score >= 45 ? "#ffdc00" : "#ff3232";
  const spreadColor = (pct) => pct === null ? "#3a3a4a" : pct <= 5 ? "#00ff64" : pct <= 10 ? "#ffdc00" : "#ff3232";
  const volumeColor = (s) => s >= 10 ? "#00ff64" : s >= 5 ? "#ffdc00" : "#ff3232";
  const profitColor = (p) => p > 0 ? "#00ff64" : p < 0 ? "#ff3232" : "#ffdc00";
  const formatCurrency = (v) => v ? `$${v.toLocaleString()}` : "—";
  const formatPercent = (v) => v !== null && v !== undefined ? `${v.toFixed(1)}%` : "—";

  const profitData = result?.highestBid ? calculateProfit(result.highestBid) : null;

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes glowPulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.4); } }
        @keyframes slideIn { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes verdictSlam { 0% { transform: scale(2.5); opacity: 0; } 50% { transform: scale(0.95); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes jackpotFlash { 0%, 100% { background: rgba(0, 255, 100, 0.05); } 50% { background: rgba(0, 255, 100, 0.2); } }
        @keyframes liveDot { 0%, 100% { opacity: 1; box-shadow: 0 0 10px currentColor; } 50% { opacity: 0.4; box-shadow: 0 0 20px currentColor; } }
        @keyframes shimmer { 0% { left: -100%; } 100% { left: 200%; } }
        @keyframes textGlow { 0%, 100% { text-shadow: 0 0 20px currentColor; } 50% { text-shadow: 0 0 40px currentColor, 0 0 80px currentColor; } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes particleFall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
        @keyframes slotSpin { 0% { transform: translateY(0); } 25% { transform: translateY(-20px); } 50% { transform: translateY(0); } 75% { transform: translateY(10px); } 100% { transform: translateY(0); } }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-3px); } 40%, 80% { transform: translateX(3px); } }
        @keyframes breathe { 0%, 100% { box-shadow: 0 0 30px currentColor; } 50% { box-shadow: 0 0 60px currentColor, 0 0 100px currentColor; } }
        * { box-sizing: border-box; }
      `}</style>
      
      {jackpot && <Particles color="#00ff64" count={50} />}
      
      <div style={{...styles.container, ...(jackpot ? { animation: "shake 0.5s" } : {})}}>
        
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.logo}>💎</span>
            <span style={styles.title}>COP CHECK</span>
          </div>
          <div style={styles.liveBadge}>
            <span style={styles.liveDot}></span>
            LIVE
          </div>
        </div>

        {/* Search Terminal */}
        <div style={styles.terminal}>
          <div style={styles.inputSection}>
            <div style={styles.inputRow}>
              <div style={styles.skuInputWrap}>
                <span style={styles.inputIcon}>▶</span>
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="ENTER SKU..."
                  disabled={loading}
                  style={styles.skuInput}
                />
              </div>
              <div style={styles.costInputWrap}>
                <span style={styles.costIcon}>$</span>
                <input
                  value={cost}
                  onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="COST"
                  disabled={loading}
                  style={styles.costInput}
                />
              </div>
            </div>
            
            <div style={styles.buttonRow}>
              <button
                onClick={handleCheck}
                disabled={loading || !sku.trim()}
                style={{...styles.scanBtn, ...(loading || !sku.trim() ? styles.scanBtnDisabled : {})}}
              >
                {loading ? "🎰 SCANNING..." : "⚡ HIT IT"}
              </button>
              {(sku || result || error) && (
                <button onClick={handleClear} style={styles.clearBtn}>✕</button>
              )}
            </div>
            
            <div style={styles.quickPicks}>
              <span style={styles.quickLabel}>🔥 HOT PICKS</span>
              <div style={styles.quickChips}>
                {EXAMPLE_SKUS.slice(0, isMobile ? 3 : 5).map((s) => (
                  <button key={s} onClick={() => setSku(s)} style={styles.chip}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={styles.loadingCard}>
            <div style={styles.slots}>
              {[0, 1, 2].map(i => (
                <div key={i} style={styles.slotWindow}>
                  <div style={{...styles.slotReel, animationDelay: `${i * 0.1}s`}}>
                    <span style={styles.slotEmoji}>💰</span>
                    <span style={styles.slotEmoji}>🔥</span>
                    <span style={styles.slotEmoji}>💎</span>
                  </div>
                </div>
              ))}
            </div>
            <span style={styles.loadingText}>SCANNING MARKET...</span>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div style={styles.errorCard}>
            <div style={styles.errorIcon}>
              {error.type === 'not_found' ? '🔍' : error.type === 'auth' ? '🔐' : '⚠️'}
            </div>
            <div style={styles.errorTitle}>
              {error.type === 'not_found' ? 'SKU Not Found' : 
               error.type === 'auth' ? 'Limited Access' : 'Connection Error'}
            </div>
            <div style={styles.errorMsg}>{error.message}</div>
            <button onClick={handleClear} style={styles.errorBtn}>Try Again</button>
          </div>
        )}

        {/* Result */}
        {result && !loading && !error && (
          <div style={{...styles.resultCard, ...(jackpot ? { animation: "jackpotFlash 0.3s infinite" } : {})}}>
            
            {/* Product */}
            <div style={styles.productRow}>
              {result.image && <img src={result.image} alt="" style={styles.productImg} />}
              <div style={styles.productInfo}>
                <span style={styles.productName}>{result.title}</span>
                <span style={styles.productSku}>{result.sku || sku.toUpperCase()}</span>
                {result.source && (
                  <span style={styles.sourceTag}>via {result.source}</span>
                )}
              </div>
            </div>

            {/* Verdict */}
            {showResult && (
              <div style={{
                ...styles.verdictBox,
                background: verdictColors[result.verdict]?.bg,
                borderColor: verdictColors[result.verdict]?.border,
                boxShadow: verdictColors[result.verdict]?.glow,
              }}>
                <div style={styles.verdictInner}>
                  <div style={styles.verdictLeft}>
                    <span style={styles.verdictLabel}>
                      {result.verdict === "COP" ? "🎰 JACKPOT" : result.verdict === "MAYBE" ? "⚠️ CAUTION" : "🚫 SKIP"}
                    </span>
                    <span style={{
                      ...styles.verdictText,
                      color: verdictColors[result.verdict]?.text,
                      animation: "verdictSlam 0.5s ease-out, textGlow 2s infinite",
                    }}>
                      {result.verdict === "COP" ? "🔥 COP" : result.verdict === "MAYBE" ? "🤔 MAYBE" : "❌ DROP"}
                    </span>
                  </div>
                  <div style={styles.scoreRing}>
                    <svg viewBox="0 0 100 100" style={styles.scoreSvg}>
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#1a1a2e" strokeWidth="6" />
                      <circle 
                        cx="50" cy="50" r="42" fill="none" 
                        stroke={liquidityColor(result.overallLiquidityScore)}
                        strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={`${countingScore * 2.64} 264`}
                        transform="rotate(-90 50 50)"
                        style={{ filter: `drop-shadow(0 0 10px ${liquidityColor(result.overallLiquidityScore)})` }}
                      />
                    </svg>
                    <span style={{...styles.scoreNum, color: liquidityColor(result.overallLiquidityScore)}}>{countingScore}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Profit Calculator */}
            {showResult && profitData && (
              <div style={{
                ...styles.profitBox,
                borderColor: profitColor(profitData.profit),
                background: profitData.profit >= 0 ? "rgba(0,255,100,0.08)" : "rgba(255,50,50,0.08)",
              }}>
                <div style={styles.profitTitle}>💰 PROFIT CALCULATOR</div>
                <div style={styles.profitGrid}>
                  <div style={styles.profitCell}>
                    <span style={styles.profitLabel}>COST</span>
                    <span style={styles.profitVal}>${parseFloat(cost).toFixed(0)}</span>
                  </div>
                  <div style={styles.profitCell}>
                    <span style={styles.profitLabel}>PAYOUT</span>
                    <span style={styles.profitVal}>${profitData.payout.toFixed(0)}</span>
                  </div>
                  <div style={styles.profitCell}>
                    <span style={styles.profitLabel}>PROFIT</span>
                    <span style={{...styles.profitValBig, color: profitColor(profitData.profit)}}>
                      {profitData.profit >= 0 ? "+" : ""}{profitData.profit.toFixed(0)}
                    </span>
                  </div>
                  <div style={styles.profitCell}>
                    <span style={styles.profitLabel}>ROI</span>
                    <span style={{...styles.profitVal, color: profitColor(profitData.profit)}}>
                      {profitData.roi >= 0 ? "+" : ""}{profitData.roi.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <span style={styles.profitNote}>*Based on ${result.highestBid} bid - 9.5% fee</span>
              </div>
            )}

            {/* Stats */}
            {showResult && (
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <span style={styles.statLabel}>72H SALES</span>
                  <span style={{...styles.statVal, color: volumeColor(result.salesLast72Hours)}}>{result.salesLast72Hours}</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statLabel}>SPREAD</span>
                  <span style={{...styles.statVal, color: spreadColor(result.medianSpreadPct)}}>{formatPercent(result.medianSpreadPct)}</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statLabel}>BID %</span>
                  <span style={{...styles.statVal, color: result.sizesWithBidsPct >= 60 ? "#00ff64" : result.sizesWithBidsPct >= 40 ? "#ffdc00" : "#ff3232"}}>{result.sizesWithBidsPct}%</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statLabel}>TOP BID</span>
                  <span style={styles.statVal}>{formatCurrency(result.highestBid)}</span>
                </div>
              </div>
            )}

            {/* Sizes */}
            {showResult && (result.bestSizes?.length > 0 || result.avoidSizes?.length > 0) && (
              <div style={styles.sizesRow}>
                {result.bestSizes?.length > 0 && (
                  <div style={{...styles.sizeBox, borderColor: "#00ff6444"}}>
                    <span style={styles.sizeTitle}>🎯 TARGET</span>
                    <div style={styles.sizeChips}>
                      {result.bestSizes.map((s, i) => <span key={i} style={styles.sizeGood}>{s}</span>)}
                    </div>
                  </div>
                )}
                {result.avoidSizes?.length > 0 && (
                  <div style={{...styles.sizeBox, borderColor: "#ff323244"}}>
                    <span style={styles.sizeTitle}>🚫 AVOID</span>
                    <div style={styles.sizeChips}>
                      {result.avoidSizes.map((s, i) => <span key={i} style={styles.sizeBad}>{s}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Table */}
            {showResult && result.variants?.length > 0 && (
              <details style={styles.tableDetails}>
                <summary style={styles.tableSummary}>📋 SIZE BREAKDOWN ({result.variants.length})</summary>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>SIZE</th>
                        <th style={styles.thR}>BID</th>
                        <th style={styles.thR}>ASK</th>
                        {!isMobile && <th style={styles.thR}>SPREAD</th>}
                        <th style={styles.thR}>SCORE</th>
                        {cost && <th style={styles.thR}>PROFIT</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {result.variants.slice(0, isMobile ? 10 : 20).map((v, i) => {
                        const sp = calculateProfit(v.highestBid);
                        return (
                          <tr key={i} style={i % 2 ? styles.trAlt : {}}>
                            <td style={styles.td}><strong>{v.size}</strong></td>
                            <td style={styles.tdR}>{formatCurrency(v.highestBid)}</td>
                            <td style={styles.tdR}>{formatCurrency(v.lowestAsk)}</td>
                            {!isMobile && <td style={{...styles.tdR, color: spreadColor(v.spreadPct)}}>{formatPercent(v.spreadPct)}</td>}
                            <td style={{...styles.tdR, color: liquidityColor(v.liquidityScore), fontWeight: 800}}>{v.liquidityScore}</td>
                            {cost && sp && <td style={{...styles.tdR, color: profitColor(sp.profit)}}>{sp.profit >= 0 ? "+" : ""}{sp.profit.toFixed(0)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div style={styles.disclaimer}>
          <strong>Disclaimer:</strong> Cop Check provides market data and algorithmic indicators for informational purposes only. "COP", "MAYBE", and "DROP" are analytical labels, not recommendations. Cop Check does not provide financial, investment, or resale advice. All decisions are made at your own risk.
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100%",
    background: "linear-gradient(180deg, #05050f 0%, #0a0a18 100%)",
    padding: 16,
    fontFamily: "'Inter', -apple-system, sans-serif",
    color: "#fff",
  },
  particleContainer: { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1000, overflow: "hidden" },
  particle: { position: "absolute", top: -20, borderRadius: "50%", animation: "particleFall 3s ease-in forwards" },
  container: { maxWidth: 640, margin: "0 auto" },
  
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    padding: "0 4px",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  logo: { fontSize: 28 },
  title: { fontSize: 24, fontWeight: 900, letterSpacing: 3, background: "linear-gradient(135deg, #fff 0%, #aaa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  liveBadge: { display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 800, color: "#00ff64", letterSpacing: 2, padding: "6px 12px", background: "rgba(0,255,100,0.1)", border: "1px solid rgba(0,255,100,0.3)", borderRadius: 20 },
  liveDot: { width: 6, height: 6, borderRadius: "50%", background: "#00ff64", animation: "liveDot 1s infinite" },
  
  terminal: {
    background: "linear-gradient(180deg, #0c0c1a 0%, #06060c 100%)",
    border: "1px solid #1a1a30",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  
  inputSection: { padding: 16 },
  inputRow: { display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" },
  skuInputWrap: { flex: "1 1 200px", display: "flex", alignItems: "center", background: "#03030a", border: "1px solid #1a1a30", borderRadius: 10, padding: "0 12px" },
  inputIcon: { color: "#00ff64", fontSize: 12, marginRight: 10, animation: "glowPulse 1.5s infinite" },
  skuInput: { flex: 1, padding: "14px 0", fontSize: 14, fontFamily: "monospace", background: "transparent", border: "none", color: "#fff", textTransform: "uppercase", letterSpacing: 2, outline: "none", minWidth: 0 },
  costInputWrap: { flex: "0 0 90px", display: "flex", alignItems: "center", background: "#03030a", border: "1px solid #1a1a30", borderRadius: 10, padding: "0 12px" },
  costIcon: { color: "#00ff64", fontSize: 14, marginRight: 6 },
  costInput: { flex: 1, padding: "14px 0", fontSize: 14, fontFamily: "monospace", background: "transparent", border: "none", color: "#fff", outline: "none", width: "100%", minWidth: 0 },
  
  buttonRow: { display: "flex", gap: 10, marginBottom: 16 },
  scanBtn: { flex: 1, padding: "14px", fontSize: 14, fontWeight: 900, background: "linear-gradient(135deg, #00ff64, #00aa44)", border: "none", borderRadius: 10, color: "#000", cursor: "pointer", letterSpacing: 2, boxShadow: "0 4px 20px rgba(0,255,100,0.4)", animation: "float 3s infinite" },
  scanBtnDisabled: { background: "#1a1a30", color: "#4a4a6a", boxShadow: "none", cursor: "not-allowed", animation: "none" },
  clearBtn: { width: 48, fontSize: 18, background: "rgba(255,50,50,0.15)", border: "1px solid #ff323266", borderRadius: 10, color: "#ff3232", cursor: "pointer" },
  
  quickPicks: {},
  quickLabel: { display: "block", fontSize: 10, color: "#4a4a6a", letterSpacing: 2, marginBottom: 10, fontWeight: 800 },
  quickChips: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: { padding: "8px 12px", fontSize: 11, fontFamily: "monospace", background: "rgba(255,255,255,0.03)", border: "1px solid #1a1a30", borderRadius: 8, color: "#6a6a8a", cursor: "pointer" },
  
  loadingCard: { background: "#0c0c1a", border: "1px solid #1a1a30", borderRadius: 16, padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, marginBottom: 16 },
  slots: { display: "flex", gap: 8 },
  slotWindow: { width: 50, height: 60, background: "#03030a", border: "2px solid #2a2a4a", borderRadius: 8, overflow: "hidden" },
  slotReel: { display: "flex", flexDirection: "column", animation: "slotSpin 0.15s linear infinite" },
  slotEmoji: { fontSize: 28, height: 60, display: "flex", alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 12, fontWeight: 800, color: "#6a6a8a", letterSpacing: 4, animation: "pulse 1s infinite" },
  
  errorCard: { background: "#0c0c1a", border: "1px solid #ff323266", borderRadius: 16, padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 16, textAlign: "center" },
  errorIcon: { fontSize: 48 },
  errorTitle: { fontSize: 18, fontWeight: 800, color: "#ff6b6b" },
  errorMsg: { fontSize: 14, color: "#888", maxWidth: 300 },
  errorBtn: { marginTop: 8, padding: "10px 24px", fontSize: 12, fontWeight: 700, background: "transparent", border: "1px solid #ff323266", borderRadius: 8, color: "#ff6b6b", cursor: "pointer" },
  
  resultCard: { background: "#0c0c1a", border: "1px solid #1a1a30", borderRadius: 16, overflow: "hidden", animation: "slideIn 0.5s ease-out", marginBottom: 16 },
  
  productRow: { display: "flex", alignItems: "center", gap: 14, padding: 16, borderBottom: "1px solid #1a1a30" },
  productImg: { width: 56, height: 56, borderRadius: 10, background: "#fff", objectFit: "contain" },
  productInfo: { flex: 1, minWidth: 0 },
  productName: { display: "block", fontSize: 14, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  productSku: { display: "block", fontSize: 11, color: "#6a6a8a", fontFamily: "monospace" },
  sourceTag: { display: "inline-block", marginTop: 4, padding: "2px 6px", fontSize: 9, background: "rgba(255,255,255,0.05)", borderRadius: 4, color: "#5a5a7a" },
  
  verdictBox: { margin: 16, padding: 20, borderRadius: 14, border: "2px solid", animation: "breathe 2s infinite" },
  verdictInner: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 },
  verdictLeft: { display: "flex", flexDirection: "column", gap: 6 },
  verdictLabel: { fontSize: 11, fontWeight: 900, color: "#7a7a9a", letterSpacing: 2 },
  verdictText: { fontSize: "clamp(28px, 10vw, 42px)", fontWeight: 900, letterSpacing: 3 },
  scoreRing: { position: "relative", width: 80, height: 80, flexShrink: 0 },
  scoreSvg: { width: "100%", height: "100%" },
  scoreNum: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, fontFamily: "monospace" },
  
  profitBox: { margin: "0 16px 16px", padding: 14, borderRadius: 12, border: "1px solid" },
  profitTitle: { display: "block", fontSize: 10, fontWeight: 900, color: "#7a7a9a", letterSpacing: 2, marginBottom: 10, textAlign: "center" },
  profitGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, textAlign: "center" },
  profitCell: { display: "flex", flexDirection: "column", gap: 4 },
  profitLabel: { fontSize: 8, color: "#5a5a7a", letterSpacing: 1 },
  profitVal: { fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: "#fff" },
  profitValBig: { fontSize: 18, fontWeight: 900, fontFamily: "monospace" },
  profitNote: { display: "block", fontSize: 9, color: "#4a4a6a", textAlign: "center", marginTop: 8 },
  
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "0 16px 16px" },
  statCard: { background: "rgba(255,255,255,0.02)", border: "1px solid #1a1a30", borderRadius: 10, padding: "12px 6px", textAlign: "center" },
  statLabel: { display: "block", fontSize: 8, color: "#5a5a7a", letterSpacing: 1, marginBottom: 6 },
  statVal: { display: "block", fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: "#fff" },
  
  sizesRow: { display: "flex", gap: 10, padding: "0 16px 16px", flexWrap: "wrap" },
  sizeBox: { flex: "1 1 140px", background: "rgba(255,255,255,0.02)", border: "1px solid", borderRadius: 10, padding: 12 },
  sizeTitle: { display: "block", fontSize: 10, fontWeight: 800, color: "#7a7a9a", marginBottom: 8, letterSpacing: 1 },
  sizeChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  sizeGood: { padding: "5px 10px", fontSize: 12, fontFamily: "monospace", background: "rgba(0,255,100,0.15)", border: "1px solid #00ff6466", borderRadius: 6, color: "#00ff64", fontWeight: 700 },
  sizeBad: { padding: "5px 10px", fontSize: 12, fontFamily: "monospace", background: "rgba(255,50,50,0.15)", border: "1px solid #ff323266", borderRadius: 6, color: "#ff3232", fontWeight: 700 },
  
  tableDetails: { padding: "0 16px 16px" },
  tableSummary: { fontSize: 11, fontWeight: 800, color: "#7a7a9a", cursor: "pointer", padding: "12px 0", borderTop: "1px solid #1a1a30", letterSpacing: 1 },
  tableWrap: { background: "#06060c", border: "1px solid #1a1a30", borderRadius: 10, overflow: "auto", maxHeight: 280, marginTop: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { padding: "10px 8px", fontSize: 9, fontWeight: 900, color: "#5a5a7a", textAlign: "left", borderBottom: "1px solid #1a1a30", background: "#04040a", position: "sticky", top: 0 },
  thR: { padding: "10px 8px", fontSize: 9, fontWeight: 900, color: "#5a5a7a", textAlign: "right", borderBottom: "1px solid #1a1a30", background: "#04040a", position: "sticky", top: 0 },
  trAlt: { background: "rgba(255,255,255,0.02)" },
  td: { padding: "10px 8px", color: "#b0b0c0", borderBottom: "1px solid #0f0f1a" },
  tdR: { padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#b0b0c0", borderBottom: "1px solid #0f0f1a" },
  
  disclaimer: { padding: 14, background: "rgba(255,220,0,0.05)", border: "1px solid rgba(255,220,0,0.15)", borderRadius: 10, fontSize: 9, color: "#7a7a5a", lineHeight: 1.5 },
};
