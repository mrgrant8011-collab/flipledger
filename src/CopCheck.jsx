import { useState, useEffect } from "react";

const EXAMPLE_SKUS = ["DZ5485-612", "FQ1759-001", "DV1748-601", "IE0219", "HQ6916-300"];
const STOCKX_SELLER_FEE = 0.095; // 9.5% seller fee

function getLiquidityLabel(score) {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function getSpreadLabel(spreadPct) {
  if (spreadPct === null || spreadPct === undefined) return "N/A";
  if (spreadPct <= 5) return "Tight";
  if (spreadPct <= 10) return "Moderate";
  return "Wide";
}

function getVolumeLabel(sales72h) {
  if (sales72h >= 20) return "Very High";
  if (sales72h >= 10) return "High";
  if (sales72h >= 5) return "Moderate";
  if (sales72h >= 1) return "Low";
  return "Dead";
}

// Particle component for celebrations
function Particles({ color, count = 30 }) {
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
  const [showResult, setShowResult] = useState(false);
  const [countingScore, setCountingScore] = useState(0);
  const [jackpot, setJackpot] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check for mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Counting animation for score
  useEffect(() => {
    if (result && showResult) {
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
    setShowResult(false);
    setCountingScore(0);
    setJackpot(false);

    try {
      const response = await fetch(`/api/cop-check?sku=${encodeURIComponent(sku.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        setResult({
          isUnknown: true,
          name: data.error === "SKU_NOT_FOUND" ? "Unknown SKU" : "Error fetching data",
          verdict: "DROP",
          overallLiquidityScore: 0,
          medianSpreadPct: null,
          sizesWithBidsPct: 0,
          salesLast72Hours: 0,
          estimated90DaySales: 0,
          bestSizes: [],
          avoidSizes: [],
          variants: [],
        });
      } else {
        setResult({
          isUnknown: false,
          name: data.title || "Unknown Product",
          image: data.image || null,
          verdict: data.verdict || "DROP",
          overallLiquidityScore: data.overallLiquidityScore || 0,
          medianSpreadPct: data.medianSpreadPct,
          sizesWithBidsPct: data.sizesWithBidsPct || 0,
          lowestAsk: data.lowestAsk || 0,
          highestBid: data.highestBid || 0,
          lastSale: data.lastSale || 0,
          salesLast72Hours: data.salesLast72Hours || 0,
          estimated90DaySales: data.estimated90DaySales || 0,
          bestSizes: data.bestSizes || [],
          avoidSizes: data.avoidSizes || [],
          variants: data.variants || [],
          currencyCode: data.currencyCode || "USD",
          cache: data.debug?.cache,
        });
      }
      
      setTimeout(() => setShowResult(true), 300);
    } catch (err) {
      setResult({
        isUnknown: true,
        name: "Connection Error",
        verdict: "DROP",
        overallLiquidityScore: 0,
        medianSpreadPct: null,
        sizesWithBidsPct: 0,
        salesLast72Hours: 0,
        estimated90DaySales: 0,
        bestSizes: [],
        avoidSizes: [],
        variants: [],
      });
      setTimeout(() => setShowResult(true), 300);
    }

    setLoading(false);
  };

  const handleClear = () => {
    setSku("");
    setCost("");
    setResult(null);
    setShowResult(false);
    setCountingScore(0);
    setJackpot(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleCheck();
  };

  // Calculate profit based on user cost
  const calculateProfit = (bid) => {
    if (!cost || !bid) return null;
    const costNum = parseFloat(cost);
    if (isNaN(costNum) || costNum <= 0) return null;
    
    const payout = bid * (1 - STOCKX_SELLER_FEE); // After StockX fees
    const profit = payout - costNum;
    const roi = ((profit / costNum) * 100);
    
    return { profit, roi, payout };
  };

  const verdictColors = {
    COP: { bg: "rgba(0, 255, 100, 0.15)", border: "#00ff64", text: "#00ff64" },
    MAYBE: { bg: "rgba(255, 220, 0, 0.15)", border: "#ffdc00", text: "#ffdc00" },
    DROP: { bg: "rgba(255, 50, 50, 0.15)", border: "#ff3232", text: "#ff3232" },
  };

  const liquidityColor = (score) => {
    if (score >= 70) return "#00ff64";
    if (score >= 45) return "#ffdc00";
    return "#ff3232";
  };

  const spreadColor = (spreadPct) => {
    if (spreadPct === null || spreadPct === undefined) return "#3a3a4a";
    if (spreadPct <= 5) return "#00ff64";
    if (spreadPct <= 10) return "#ffdc00";
    return "#ff3232";
  };

  const volumeColor = (sales72h) => {
    if (sales72h >= 10) return "#00ff64";
    if (sales72h >= 5) return "#ffdc00";
    return "#ff3232";
  };

  const profitColor = (profit) => {
    if (profit > 0) return "#00ff64";
    if (profit < 0) return "#ff3232";
    return "#ffdc00";
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === 0) return "—";
    return `$${value.toLocaleString()}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return "—";
    return `${value.toFixed(1)}%`;
  };

  const profitData = result?.highestBid ? calculateProfit(result.highestBid) : null;

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes slideIn { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes verdictSlam { 0% { transform: scale(2); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes liveDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes shimmer { 0% { left: -100%; } 100% { left: 200%; } }
        @keyframes particleFall { 0% { transform: translateY(-20px); opacity: 1; } 100% { transform: translateY(100vh); opacity: 0; } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes barGrow { 0% { width: 0%; } }
        * { box-sizing: border-box; }
      `}</style>
      
      {jackpot && <Particles color="#00ff64" count={50} />}
      
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <span style={styles.liveBadge}><span style={styles.liveDot}></span>LIVE</span>
            <h1 style={styles.title}>COP CHECK</h1>
          </div>
          <p style={styles.subtitle}>REAL-TIME MARKET SCANNER</p>
        </div>

        {/* Search Box */}
        <div style={styles.searchBox}>
          <div style={styles.inputGroup}>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter SKU..."
              disabled={loading}
              style={styles.input}
            />
            <input
              value={cost}
              onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="Your cost $"
              disabled={loading}
              style={{...styles.input, ...styles.costInput}}
            />
          </div>
          <div style={styles.buttonRow}>
            <button
              onClick={handleCheck}
              disabled={loading || !sku.trim()}
              style={{
                ...styles.checkBtn,
                ...(loading || !sku.trim() ? styles.checkBtnDisabled : {}),
              }}
            >
              {loading ? "SCANNING..." : "⚡ HIT IT"}
            </button>
            {(sku || result) && (
              <button onClick={handleClear} disabled={loading} style={styles.clearBtn}>✕</button>
            )}
          </div>

          {/* Quick SKUs */}
          <div style={styles.quickSkus}>
            {EXAMPLE_SKUS.slice(0, isMobile ? 3 : 5).map((s) => (
              <button key={s} onClick={() => setSku(s)} style={styles.skuChip}>{s}</button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={styles.loadingBox}>
            <div style={styles.spinner}></div>
            <span style={styles.loadingText}>Scanning market...</span>
          </div>
        )}

        {/* Result */}
        {result && !loading && showResult && (
          <div style={styles.resultCard}>
            {/* Product Info */}
            <div style={styles.productRow}>
              {result.image && (
                <img src={result.image} alt="" style={styles.productImg} />
              )}
              <div style={styles.productInfo}>
                <span style={styles.productName}>{result.name}</span>
                <span style={styles.productSku}>{sku.toUpperCase()}</span>
              </div>
            </div>

            {/* Verdict */}
            <div style={{
              ...styles.verdictBox,
              background: verdictColors[result.verdict]?.bg,
              borderColor: verdictColors[result.verdict]?.border,
            }}>
              <div style={styles.verdictMain}>
                <span style={{
                  ...styles.verdictText,
                  color: verdictColors[result.verdict]?.text,
                  animation: "verdictSlam 0.4s ease-out",
                }}>
                  {result.verdict === "COP" && "🔥 COP"}
                  {result.verdict === "MAYBE" && "🤔 MAYBE"}
                  {result.verdict === "DROP" && "❌ DROP"}
                </span>
                <div style={styles.scoreCircle}>
                  <svg viewBox="0 0 100 100" style={styles.scoreSvg}>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#1a1a2e" strokeWidth="6" />
                    <circle 
                      cx="50" cy="50" r="42" fill="none" 
                      stroke={liquidityColor(result.overallLiquidityScore)}
                      strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${countingScore * 2.64} 264`}
                      transform="rotate(-90 50 50)"
                      style={{ filter: `drop-shadow(0 0 8px ${liquidityColor(result.overallLiquidityScore)})` }}
                    />
                  </svg>
                  <span style={{...styles.scoreNum, color: liquidityColor(result.overallLiquidityScore)}}>{countingScore}</span>
                </div>
              </div>
              <span style={styles.verdictHint}>
                {result.verdict === "COP" && "High liquidity • Buy with confidence"}
                {result.verdict === "MAYBE" && "Moderate liquidity • Proceed carefully"}
                {result.verdict === "DROP" && "Low liquidity • Skip this one"}
              </span>
            </div>

            {/* Profit Calculator - Only show if cost entered */}
            {profitData && (
              <div style={{
                ...styles.profitBox,
                borderColor: profitColor(profitData.profit),
                background: profitData.profit >= 0 ? "rgba(0, 255, 100, 0.1)" : "rgba(255, 50, 50, 0.1)",
              }}>
                <div style={styles.profitRow}>
                  <div style={styles.profitItem}>
                    <span style={styles.profitLabel}>Your Cost</span>
                    <span style={styles.profitValue}>${parseFloat(cost).toFixed(0)}</span>
                  </div>
                  <div style={styles.profitItem}>
                    <span style={styles.profitLabel}>Payout (after fees)</span>
                    <span style={styles.profitValue}>${profitData.payout.toFixed(0)}</span>
                  </div>
                  <div style={styles.profitItem}>
                    <span style={styles.profitLabel}>Est. Profit</span>
                    <span style={{...styles.profitValue, color: profitColor(profitData.profit), fontSize: 24}}>
                      {profitData.profit >= 0 ? "+" : ""}{profitData.profit.toFixed(0)}
                    </span>
                  </div>
                  <div style={styles.profitItem}>
                    <span style={styles.profitLabel}>ROI</span>
                    <span style={{...styles.profitValue, color: profitColor(profitData.profit)}}>
                      {profitData.roi >= 0 ? "+" : ""}{profitData.roi.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <span style={styles.profitNote}>*Based on highest bid ${result.highestBid} minus 9.5% StockX fee</span>
              </div>
            )}

            {/* Stats Grid */}
            <div style={styles.statsGrid}>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>72H SALES</span>
                <span style={{...styles.statValue, color: volumeColor(result.salesLast72Hours)}}>
                  {result.salesLast72Hours}
                </span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>SPREAD</span>
                <span style={{...styles.statValue, color: spreadColor(result.medianSpreadPct)}}>
                  {formatPercent(result.medianSpreadPct)}
                </span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>BID COVERAGE</span>
                <span style={{...styles.statValue, color: result.sizesWithBidsPct >= 60 ? "#00ff64" : result.sizesWithBidsPct >= 40 ? "#ffdc00" : "#ff3232"}}>
                  {result.sizesWithBidsPct}%
                </span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>HIGHEST BID</span>
                <span style={styles.statValue}>{formatCurrency(result.highestBid)}</span>
              </div>
            </div>

            {/* Size Recommendations */}
            {!result.isUnknown && (result.bestSizes.length > 0 || result.avoidSizes.length > 0) && (
              <div style={styles.sizesRow}>
                {result.bestSizes.length > 0 && (
                  <div style={styles.sizeGroup}>
                    <span style={styles.sizeLabel}>🎯 Best Sizes</span>
                    <div style={styles.sizeChips}>
                      {result.bestSizes.map((s, i) => (
                        <span key={i} style={styles.sizeChipGood}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {result.avoidSizes.length > 0 && (
                  <div style={styles.sizeGroup}>
                    <span style={styles.sizeLabel}>🚫 Avoid</span>
                    <div style={styles.sizeChips}>
                      {result.avoidSizes.map((s, i) => (
                        <span key={i} style={styles.sizeChipBad}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Size Table - Collapsible on mobile */}
            {!result.isUnknown && result.variants?.length > 0 && (
              <details style={styles.tableDetails}>
                <summary style={styles.tableSummary}>
                  📋 Size Breakdown ({result.variants.length} sizes)
                </summary>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Size</th>
                        <th style={styles.thRight}>Bid</th>
                        <th style={styles.thRight}>Ask</th>
                        {!isMobile && <th style={styles.thRight}>Spread</th>}
                        <th style={styles.thRight}>Score</th>
                        {cost && <th style={styles.thRight}>Profit</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {result.variants.slice(0, isMobile ? 10 : 20).map((v, i) => {
                        const sizeProfit = calculateProfit(v.highestBid);
                        return (
                          <tr key={v.variantId || i} style={i % 2 ? styles.trOdd : {}}>
                            <td style={styles.td}><strong>{v.size}</strong></td>
                            <td style={styles.tdRight}>{formatCurrency(v.highestBid)}</td>
                            <td style={styles.tdRight}>{formatCurrency(v.lowestAsk)}</td>
                            {!isMobile && <td style={{...styles.tdRight, color: spreadColor(v.spreadPct)}}>{formatPercent(v.spreadPct)}</td>}
                            <td style={{...styles.tdRight, color: liquidityColor(v.liquidityScore)}}>{v.liquidityScore}</td>
                            {cost && sizeProfit && (
                              <td style={{...styles.tdRight, color: profitColor(sizeProfit.profit)}}>
                                {sizeProfit.profit >= 0 ? "+" : ""}{sizeProfit.profit.toFixed(0)}
                              </td>
                            )}
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
          <p style={styles.disclaimerText}>
            <strong>Disclaimer:</strong> Cop Check provides market data and algorithmic indicators for informational purposes only. 
            "COP", "MAYBE", and "DROP" are analytical labels, not recommendations. 
            Cop Check does not provide financial, investment, or resale advice. 
            All decisions are made at your own risk.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #02020a 0%, #0a0a18 100%)",
    padding: "16px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: "#fff",
  },
  particleContainer: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 1000,
    overflow: "hidden",
  },
  particle: {
    position: "absolute",
    top: -20,
    borderRadius: "50%",
    animation: "particleFall 3s ease-in forwards",
  },
  container: {
    maxWidth: 600,
    margin: "0 auto",
  },
  header: {
    textAlign: "center",
    marginBottom: 20,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 4,
  },
  liveBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    background: "rgba(255, 50, 50, 0.2)",
    border: "1px solid #ff3232",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 800,
    color: "#ff3232",
    letterSpacing: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#ff3232",
    animation: "liveDot 1s ease-in-out infinite",
  },
  title: {
    margin: 0,
    fontSize: "clamp(28px, 8vw, 42px)",
    fontWeight: 900,
    letterSpacing: 4,
  },
  subtitle: {
    margin: 0,
    fontSize: 11,
    color: "#6a6a8a",
    letterSpacing: 4,
  },
  searchBox: {
    background: "rgba(14, 14, 28, 0.8)",
    border: "1px solid #1a1a30",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  inputGroup: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  input: {
    flex: "1 1 150px",
    minWidth: 0,
    padding: "14px 16px",
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    background: "#04040a",
    border: "1px solid #1a1a30",
    borderRadius: 10,
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 2,
    outline: "none",
  },
  costInput: {
    flex: "0 1 120px",
    textTransform: "none",
    letterSpacing: 0,
  },
  buttonRow: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
  },
  checkBtn: {
    flex: 1,
    padding: "14px 20px",
    fontSize: 14,
    fontWeight: 800,
    background: "linear-gradient(135deg, #00ff64 0%, #00aa44 100%)",
    border: "none",
    borderRadius: 10,
    color: "#000",
    cursor: "pointer",
    letterSpacing: 2,
    animation: "float 3s ease-in-out infinite",
  },
  checkBtnDisabled: {
    background: "#1a1a30",
    color: "#4a4a6a",
    cursor: "not-allowed",
    animation: "none",
  },
  clearBtn: {
    width: 48,
    fontSize: 18,
    background: "rgba(255, 50, 50, 0.15)",
    border: "1px solid #ff323266",
    borderRadius: 10,
    color: "#ff3232",
    cursor: "pointer",
  },
  quickSkus: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  skuChip: {
    padding: "8px 12px",
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid #1a1a30",
    borderRadius: 8,
    color: "#6a6a8a",
    cursor: "pointer",
  },
  loadingBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    padding: 40,
    background: "rgba(14, 14, 28, 0.8)",
    border: "1px solid #1a1a30",
    borderRadius: 16,
  },
  spinner: {
    width: 40,
    height: 40,
    border: "3px solid #1a1a30",
    borderTop: "3px solid #00ff64",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    fontSize: 14,
    color: "#6a6a8a",
    letterSpacing: 2,
  },
  resultCard: {
    background: "rgba(14, 14, 28, 0.8)",
    border: "1px solid #1a1a30",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    animation: "slideIn 0.4s ease-out",
  },
  productRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottom: "1px solid #1a1a30",
  },
  productImg: {
    width: 60,
    height: 60,
    borderRadius: 10,
    background: "#fff",
    objectFit: "contain",
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    display: "block",
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  productSku: {
    fontSize: 12,
    color: "#6a6a8a",
    fontFamily: "'JetBrains Mono', monospace",
  },
  verdictBox: {
    padding: 20,
    borderRadius: 14,
    border: "2px solid",
    marginBottom: 16,
    textAlign: "center",
  },
  verdictMain: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginBottom: 8,
  },
  verdictText: {
    fontSize: "clamp(32px, 10vw, 48px)",
    fontWeight: 900,
    letterSpacing: 4,
  },
  scoreCircle: {
    position: "relative",
    width: 70,
    height: 70,
  },
  scoreSvg: {
    width: "100%",
    height: "100%",
  },
  scoreNum: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 900,
    fontFamily: "'JetBrains Mono', monospace",
  },
  verdictHint: {
    fontSize: 12,
    color: "#8a8aaa",
  },
  profitBox: {
    padding: 16,
    borderRadius: 12,
    border: "1px solid",
    marginBottom: 16,
  },
  profitRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
    textAlign: "center",
  },
  profitItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  profitLabel: {
    fontSize: 9,
    color: "#6a6a8a",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  profitValue: {
    fontSize: 16,
    fontWeight: 800,
    fontFamily: "'JetBrains Mono', monospace",
  },
  profitNote: {
    display: "block",
    fontSize: 10,
    color: "#5a5a7a",
    textAlign: "center",
    marginTop: 10,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid #1a1a30",
    borderRadius: 10,
    padding: "12px 8px",
    textAlign: "center",
  },
  statLabel: {
    display: "block",
    fontSize: 9,
    color: "#5a5a7a",
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: {
    display: "block",
    fontSize: 16,
    fontWeight: 800,
    fontFamily: "'JetBrains Mono', monospace",
    color: "#fff",
  },
  sizesRow: {
    display: "flex",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  sizeGroup: {
    flex: 1,
    minWidth: 120,
  },
  sizeLabel: {
    display: "block",
    fontSize: 11,
    color: "#7a7a9a",
    marginBottom: 8,
    fontWeight: 700,
  },
  sizeChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  sizeChipGood: {
    padding: "6px 12px",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    background: "rgba(0, 255, 100, 0.15)",
    border: "1px solid #00ff6466",
    borderRadius: 8,
    color: "#00ff64",
    fontWeight: 700,
  },
  sizeChipBad: {
    padding: "6px 12px",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    background: "rgba(255, 50, 50, 0.15)",
    border: "1px solid #ff323266",
    borderRadius: 8,
    color: "#ff3232",
    fontWeight: 700,
  },
  tableDetails: {
    marginBottom: 0,
  },
  tableSummary: {
    fontSize: 13,
    fontWeight: 700,
    color: "#8a8aaa",
    cursor: "pointer",
    padding: "12px 0",
    borderTop: "1px solid #1a1a30",
  },
  tableWrap: {
    overflowX: "auto",
    marginTop: 8,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  },
  th: {
    padding: "10px 8px",
    fontSize: 10,
    fontWeight: 800,
    color: "#5a5a7a",
    textAlign: "left",
    borderBottom: "1px solid #1a1a30",
    whiteSpace: "nowrap",
  },
  thRight: {
    padding: "10px 8px",
    fontSize: 10,
    fontWeight: 800,
    color: "#5a5a7a",
    textAlign: "right",
    borderBottom: "1px solid #1a1a30",
    whiteSpace: "nowrap",
  },
  trOdd: {
    background: "rgba(255,255,255,0.02)",
  },
  td: {
    padding: "10px 8px",
    color: "#b0b0c0",
    borderBottom: "1px solid #0f0f1a",
  },
  tdRight: {
    padding: "10px 8px",
    textAlign: "right",
    fontFamily: "'JetBrains Mono', monospace",
    color: "#b0b0c0",
    borderBottom: "1px solid #0f0f1a",
  },
  disclaimer: {
    padding: 16,
    background: "rgba(255, 220, 0, 0.05)",
    border: "1px solid rgba(255, 220, 0, 0.2)",
    borderRadius: 12,
  },
  disclaimerText: {
    margin: 0,
    fontSize: 10,
    color: "#8a8a6a",
    lineHeight: 1.6,
  },
};
