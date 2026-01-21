import { useState, useEffect } from "react";

const EXAMPLE_SKUS = ["DZ5485-612", "FQ1759-001", "DV1748-601", "IE0219", "HQ6916-300"];

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
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [countingScore, setCountingScore] = useState(0);
  const [jackpot, setJackpot] = useState(false);

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
          // Trigger jackpot effect for COP
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
      const response = await fetch(`/api/stockx-market?sku=${encodeURIComponent(sku.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404 || data.error === "SKU_NOT_FOUND") {
          setResult({
            isUnknown: true,
            name: "Unknown SKU",
            verdict: "DROP",
            overallLiquidityScore: 0,
            medianSpreadPct: null,
            sizesWithBidsPct: 0,
            bestSizes: [],
            avoidSizes: [],
            variants: [],
          });
        } else {
          setResult({
            isUnknown: true,
            name: "Error fetching data",
            verdict: "DROP",
            overallLiquidityScore: 0,
            medianSpreadPct: null,
            sizesWithBidsPct: 0,
            bestSizes: [],
            avoidSizes: [],
            variants: [],
          });
        }
      } else {
        setResult({
          isUnknown: false,
          name: data.title || "Unknown Product",
          verdict: data.verdict || "DROP",
          overallLiquidityScore: data.overallLiquidityScore || 0,
          medianSpreadPct: data.medianSpreadPct,
          sizesWithBidsPct: data.sizesWithBidsPct || 0,
          bestSizes: data.bestSizes || [],
          avoidSizes: data.avoidSizes || [],
          variants: data.variants || [],
          currencyCode: data.currencyCode || "USD",
          cache: data.debug?.cache,
        });
      }
      
      // Dramatic reveal delay
      setTimeout(() => setShowResult(true), 300);
    } catch (err) {
      setResult({
        isUnknown: true,
        name: "Connection Error",
        verdict: "DROP",
        overallLiquidityScore: 0,
        medianSpreadPct: null,
        sizesWithBidsPct: 0,
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
    setResult(null);
    setShowResult(false);
    setCountingScore(0);
    setJackpot(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleCheck();
  };

  const verdictColors = {
    COP: { 
      bg: "rgba(0, 255, 100, 0.15)", 
      border: "#00ff64", 
      text: "#00ff64", 
      glow: "0 0 60px rgba(0, 255, 100, 0.6), 0 0 120px rgba(0, 255, 100, 0.4), inset 0 0 60px rgba(0, 255, 100, 0.2)" 
    },
    MAYBE: { 
      bg: "rgba(255, 220, 0, 0.15)", 
      border: "#ffdc00", 
      text: "#ffdc00", 
      glow: "0 0 60px rgba(255, 220, 0, 0.5), 0 0 120px rgba(255, 220, 0, 0.3), inset 0 0 60px rgba(255, 220, 0, 0.15)" 
    },
    DROP: { 
      bg: "rgba(255, 50, 50, 0.15)", 
      border: "#ff3232", 
      text: "#ff3232", 
      glow: "0 0 60px rgba(255, 50, 50, 0.5), 0 0 120px rgba(255, 50, 50, 0.3), inset 0 0 60px rgba(255, 50, 50, 0.15)" 
    },
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

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return "—";
    return `$${value.toLocaleString()}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return "—";
    return `${value.toFixed(1)}%`;
  };

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.98); }
        }
        @keyframes glowPulse {
          0%, 100% { filter: brightness(1) drop-shadow(0 0 10px currentColor); }
          50% { filter: brightness(1.4) drop-shadow(0 0 30px currentColor); }
        }
        @keyframes slideIn {
          0% { opacity: 0; transform: translateY(40px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes verdictSlam {
          0% { transform: scale(3) rotate(-10deg); opacity: 0; filter: blur(20px); }
          50% { transform: scale(0.9) rotate(2deg); filter: blur(0); }
          70% { transform: scale(1.1) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes jackpotFlash {
          0%, 100% { background: rgba(0, 255, 100, 0.05); }
          25% { background: rgba(0, 255, 100, 0.2); }
          50% { background: rgba(0, 255, 100, 0.05); }
          75% { background: rgba(0, 255, 100, 0.15); }
        }
        @keyframes barPulse {
          0%, 100% { opacity: 1; filter: brightness(1); }
          50% { opacity: 0.8; filter: brightness(1.3); }
        }
        @keyframes barGrow {
          0% { width: 0%; }
        }
        @keyframes liveDot {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 10px currentColor; }
          50% { transform: scale(1.8); opacity: 0.6; box-shadow: 0 0 25px currentColor; }
        }
        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 200%; }
        }
        @keyframes textGlow {
          0%, 100% { text-shadow: 0 0 20px currentColor, 0 0 40px currentColor; }
          50% { text-shadow: 0 0 40px currentColor, 0 0 80px currentColor, 0 0 120px currentColor; }
        }
        @keyframes borderPulse {
          0%, 100% { border-color: currentColor; }
          50% { border-color: transparent; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes particleFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes scoreCount {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        @keyframes slotSpin {
          0% { transform: translateY(0); }
          25% { transform: translateY(-20px); }
          50% { transform: translateY(0); }
          75% { transform: translateY(10px); }
          100% { transform: translateY(0); }
        }
        @keyframes neonFlicker {
          0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% { opacity: 1; }
          20%, 24%, 55% { opacity: 0.6; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        @keyframes rainbow {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }
        @keyframes scannerPulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.5); opacity: 0.2; }
        }
        @keyframes revealLine {
          0% { width: 0; }
          50% { width: 100%; }
          100% { width: 0; left: 100%; }
        }
        @keyframes breathe {
          0%, 100% { box-shadow: 0 0 30px currentColor, inset 0 0 30px rgba(255,255,255,0.05); }
          50% { box-shadow: 0 0 60px currentColor, 0 0 100px currentColor, inset 0 0 50px rgba(255,255,255,0.1); }
        }
      `}</style>
      
      {/* Jackpot Particles */}
      {jackpot && <Particles color="#00ff64" count={50} />}
      
      <div style={{
        ...styles.container,
        ...(jackpot ? { animation: "shake 0.5s ease-in-out" } : {}),
      }}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleWrapper}>
            <div style={styles.liveBadge}>
              <span style={styles.liveDot}></span>
              <span>LIVE</span>
            </div>
            <h1 style={styles.title}>COP CHECK</h1>
            <div style={styles.liveBadge}>
              <span style={styles.liveDot}></span>
              <span>24/7</span>
            </div>
          </div>
          <p style={styles.subtitle}>🎰 REAL-TIME MARKET SCANNER 🎰</p>
        </div>

        {/* Search Terminal */}
        <div style={styles.searchTerminal}>
          <div style={styles.terminalHeader}>
            <div style={styles.terminalDots}>
              <span style={styles.terminalDotRed}></span>
              <span style={styles.terminalDotYellow}></span>
              <span style={styles.terminalDotGreen}></span>
            </div>
            <span style={styles.terminalTitle}>💎 SKU SCANNER</span>
            <div style={styles.terminalStatus}>
              <span style={styles.statusPulse}></span>
              <span>READY TO SCAN</span>
            </div>
          </div>
          <div style={styles.inputRow}>
            <div style={styles.inputWrapper}>
              <span style={styles.inputPrefix}>▶</span>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="DROP YOUR SKU HERE..."
                disabled={loading}
                style={styles.input}
              />
            </div>
            <button
              onClick={handleCheck}
              disabled={loading || !sku.trim()}
              style={{
                ...styles.checkBtn,
                ...(loading || !sku.trim() ? styles.checkBtnDisabled : {}),
              }}
            >
              {loading ? "🎰 SPINNING..." : "⚡ HIT IT"}
            </button>
            {(sku || result) && (
              <button onClick={handleClear} disabled={loading} style={styles.clearBtn}>
                ✕
              </button>
            )}
          </div>

          <div style={styles.chipsRow}>
            <span style={styles.chipsLabel}>🔥 HOT PICKS</span>
            <div style={styles.chipsContainer}>
              {EXAMPLE_SKUS.map((s) => (
                <button key={s} onClick={() => setSku(s)} style={styles.chip}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading - Casino Style */}
        {loading && (
          <div style={styles.loadingCard}>
            <div style={styles.slotMachine}>
              <div style={styles.slotWindow}>
                <div style={styles.slotReel}>
                  <span style={styles.slotItem}>💰</span>
                  <span style={styles.slotItem}>🔥</span>
                  <span style={styles.slotItem}>💎</span>
                  <span style={styles.slotItem}>⚡</span>
                </div>
              </div>
              <div style={styles.slotWindow}>
                <div style={{...styles.slotReel, animationDelay: "0.1s"}}>
                  <span style={styles.slotItem}>💎</span>
                  <span style={styles.slotItem}>💰</span>
                  <span style={styles.slotItem}>🔥</span>
                  <span style={styles.slotItem}>⚡</span>
                </div>
              </div>
              <div style={styles.slotWindow}>
                <div style={{...styles.slotReel, animationDelay: "0.2s"}}>
                  <span style={styles.slotItem}>⚡</span>
                  <span style={styles.slotItem}>💎</span>
                  <span style={styles.slotItem}>💰</span>
                  <span style={styles.slotItem}>🔥</span>
                </div>
              </div>
            </div>
            <span style={styles.loadingText}>SCANNING FOR GEMS...</span>
            <div style={styles.loadingBar}>
              <div style={styles.loadingBarFill}></div>
            </div>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={{
            ...styles.resultCard,
            ...(jackpot ? { animation: "jackpotFlash 0.3s ease-in-out infinite" } : {}),
          }}>
            {/* Product Header */}
            <div style={styles.productHeader}>
              <div style={styles.productInfo}>
                {result.isUnknown && <span style={styles.unknownBadge}>⚠ NOT FOUND</span>}
                <span style={styles.productName}>{result.name}</span>
              </div>
              <div style={styles.productMeta}>
                <span style={styles.skuLabel}>SKU</span>
                <span style={styles.skuValue}>{sku.toUpperCase()}</span>
              </div>
            </div>

            {/* VERDICT - THE BIG REVEAL */}
            {showResult && (
              <div 
                style={{
                  ...styles.verdictSection,
                  background: verdictColors[result.verdict]?.bg,
                  borderColor: verdictColors[result.verdict]?.border,
                  boxShadow: verdictColors[result.verdict]?.glow,
                  animation: "breathe 2s ease-in-out infinite",
                }}
              >
                <div style={styles.verdictContent}>
                  <div style={styles.verdictLeft}>
                    <span style={styles.verdictLabel}>
                      {result.verdict === "COP" && "🎰 JACKPOT 🎰"}
                      {result.verdict === "MAYBE" && "⚠️ CAUTION ⚠️"}
                      {result.verdict === "DROP" && "🚫 SKIP IT 🚫"}
                    </span>
                    <div 
                      style={{ 
                        ...styles.verdictValue, 
                        color: verdictColors[result.verdict]?.text,
                        animation: "verdictSlam 0.6s ease-out, textGlow 1.5s ease-in-out infinite",
                      }}
                    >
                      {result.verdict === "COP" && "🔥 COP 🔥"}
                      {result.verdict === "MAYBE" && "🤔 MAYBE"}
                      {result.verdict === "DROP" && "❌ DROP"}
                    </div>
                    <span 
                      style={{
                        ...styles.verdictTag,
                        background: verdictColors[result.verdict]?.bg,
                        borderColor: verdictColors[result.verdict]?.border,
                        color: verdictColors[result.verdict]?.text,
                      }}
                    >
                      {result.verdict === "COP" && "💰 HIGH LIQUIDITY • BUY NOW 💰"}
                      {result.verdict === "MAYBE" && "⚖️ MODERATE • PROCEED WITH CAUTION"}
                      {result.verdict === "DROP" && "📉 LOW LIQUIDITY • WALK AWAY"}
                    </span>
                  </div>
                  
                  {/* Animated Score */}
                  <div style={styles.scoreCircleWrapper}>
                    <svg viewBox="0 0 120 120" style={styles.scoreSvg}>
                      <circle cx="60" cy="60" r="52" fill="none" stroke="#1a1a2e" strokeWidth="8" />
                      <circle 
                        cx="60" 
                        cy="60" 
                        r="52" 
                        fill="none" 
                        stroke={liquidityColor(result.overallLiquidityScore)}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${countingScore * 3.27} 327`}
                        transform="rotate(-90 60 60)"
                        style={{ 
                          filter: `drop-shadow(0 0 15px ${liquidityColor(result.overallLiquidityScore)})`,
                          transition: "stroke-dasharray 0.1s ease-out",
                        }}
                      />
                    </svg>
                    <div style={styles.scoreInner}>
                      <span 
                        style={{ 
                          ...styles.scoreNumber, 
                          color: liquidityColor(result.overallLiquidityScore),
                          animation: countingScore < result.overallLiquidityScore ? "scoreCount 0.1s ease-in-out infinite" : "none",
                        }}
                      >
                        {countingScore}
                      </span>
                      <span style={styles.scoreMax}>/100</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Live Stats */}
            {showResult && (
              <div style={styles.liveStatsSection}>
                <div style={styles.liveStatsHeader}>
                  <span style={styles.liveIndicator}>
                    <span style={styles.liveIndicatorDot}></span>
                    LIVE STATS
                  </span>
                </div>
                
                <div style={styles.metricRow}>
                  <div style={styles.metricInfo}>
                    <span style={styles.metricLabel}>💎 LIQUIDITY SCORE</span>
                    <span style={{ ...styles.metricValue, color: liquidityColor(result.overallLiquidityScore) }}>
                      {result.overallLiquidityScore} • {getLiquidityLabel(result.overallLiquidityScore).toUpperCase()}
                    </span>
                  </div>
                  <div style={styles.liveBarContainer}>
                    <div style={styles.liveBarTrack}>
                      <div 
                        style={{
                          ...styles.liveBarFill,
                          width: `${result.overallLiquidityScore}%`,
                          background: `linear-gradient(90deg, ${liquidityColor(result.overallLiquidityScore)}88, ${liquidityColor(result.overallLiquidityScore)})`,
                          boxShadow: `0 0 30px ${liquidityColor(result.overallLiquidityScore)}`,
                          animation: "barGrow 1s ease-out, barPulse 2s ease-in-out infinite",
                        }}
                      >
                        <div style={styles.liveBarShimmer}></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={styles.metricRow}>
                  <div style={styles.metricInfo}>
                    <span style={styles.metricLabel}>📊 SPREAD</span>
                    <span style={{ ...styles.metricValue, color: spreadColor(result.medianSpreadPct) }}>
                      {formatPercent(result.medianSpreadPct)} • {getSpreadLabel(result.medianSpreadPct).toUpperCase()}
                    </span>
                  </div>
                  <div style={styles.liveBarContainer}>
                    <div style={styles.liveBarTrack}>
                      <div 
                        style={{
                          ...styles.liveBarFill,
                          width: `${Math.min((result.medianSpreadPct || 0) * 5, 100)}%`,
                          background: `linear-gradient(90deg, ${spreadColor(result.medianSpreadPct)}88, ${spreadColor(result.medianSpreadPct)})`,
                          boxShadow: `0 0 30px ${spreadColor(result.medianSpreadPct)}`,
                          animation: "barGrow 1.2s ease-out, barPulse 2s ease-in-out infinite",
                        }}
                      >
                        <div style={styles.liveBarShimmer}></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={styles.metricRow}>
                  <div style={styles.metricInfo}>
                    <span style={styles.metricLabel}>🎯 BID COVERAGE</span>
                    <span style={{ ...styles.metricValue, color: result.sizesWithBidsPct >= 60 ? "#00ff64" : result.sizesWithBidsPct >= 40 ? "#ffdc00" : "#ff3232" }}>
                      {result.sizesWithBidsPct}% • {result.sizesWithBidsPct >= 60 ? "STRONG" : result.sizesWithBidsPct >= 40 ? "MODERATE" : "WEAK"}
                    </span>
                  </div>
                  <div style={styles.liveBarContainer}>
                    <div style={styles.liveBarTrack}>
                      <div 
                        style={{
                          ...styles.liveBarFill,
                          width: `${result.sizesWithBidsPct}%`,
                          background: `linear-gradient(90deg, ${result.sizesWithBidsPct >= 60 ? "#00ff64" : result.sizesWithBidsPct >= 40 ? "#ffdc00" : "#ff3232"}88, ${result.sizesWithBidsPct >= 60 ? "#00ff64" : result.sizesWithBidsPct >= 40 ? "#ffdc00" : "#ff3232"})`,
                          boxShadow: `0 0 30px ${result.sizesWithBidsPct >= 60 ? "#00ff64" : result.sizesWithBidsPct >= 40 ? "#ffdc00" : "#ff3232"}`,
                          animation: "barGrow 1.4s ease-out, barPulse 2s ease-in-out infinite",
                        }}
                      >
                        <div style={styles.liveBarShimmer}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis */}
            {!result.isUnknown && showResult && (
              <div style={styles.analysisSection}>
                <div style={styles.sectionHeader}>
                  <span style={styles.sectionIcon}>🔮</span>
                  <span style={styles.sectionTitle}>MARKET INTEL</span>
                </div>
                <div style={styles.analysisList}>
                  <div style={styles.analysisItem}>
                    <span style={{ ...styles.analysisIndicator, background: spreadColor(result.medianSpreadPct), boxShadow: `0 0 15px ${spreadColor(result.medianSpreadPct)}` }}></span>
                    <span style={styles.analysisText}>
                      Spread {formatPercent(result.medianSpreadPct)} — {getSpreadLabel(result.medianSpreadPct).toLowerCase()} gap
                    </span>
                  </div>
                  <div style={styles.analysisItem}>
                    <span style={{ ...styles.analysisIndicator, background: result.sizesWithBidsPct >= 60 ? "#00ff64" : result.sizesWithBidsPct >= 40 ? "#ffdc00" : "#ff3232", boxShadow: `0 0 15px ${result.sizesWithBidsPct >= 60 ? "#00ff64" : result.sizesWithBidsPct >= 40 ? "#ffdc00" : "#ff3232"}` }}></span>
                    <span style={styles.analysisText}>
                      {result.sizesWithBidsPct}% sizes active — {result.sizesWithBidsPct >= 60 ? "high" : result.sizesWithBidsPct >= 40 ? "moderate" : "low"} demand
                    </span>
                  </div>
                  <div style={styles.analysisItem}>
                    <span style={{ ...styles.analysisIndicator, background: liquidityColor(result.overallLiquidityScore), boxShadow: `0 0 15px ${liquidityColor(result.overallLiquidityScore)}` }}></span>
                    <span style={styles.analysisText}>
                      Score {result.overallLiquidityScore} — {getLiquidityLabel(result.overallLiquidityScore).toLowerCase()} liquidity
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Size Picks */}
            {!result.isUnknown && showResult && (
              <div style={styles.sizesSection}>
                <div style={{...styles.sizeBox, borderColor: "#00ff6466"}}>
                  <div style={styles.sizeBoxHeader}>
                    <span style={styles.sizeBoxIconGreen}>✓</span>
                    <span style={styles.sizeBoxTitle}>🎯 TARGET SIZES</span>
                  </div>
                  <div style={styles.sizeChips}>
                    {result.bestSizes.length ? result.bestSizes.map((size, i) => (
                      <span key={i} style={styles.sizeChipGood}>{size}</span>
                    )) : <span style={styles.noSizes}>—</span>}
                  </div>
                </div>
                <div style={{...styles.sizeBox, borderColor: "#ff323266"}}>
                  <div style={styles.sizeBoxHeader}>
                    <span style={styles.sizeBoxIconRed}>✕</span>
                    <span style={styles.sizeBoxTitle}>🚫 AVOID</span>
                  </div>
                  <div style={styles.sizeChips}>
                    {result.avoidSizes.length ? result.avoidSizes.map((size, i) => (
                      <span key={i} style={styles.sizeChipBad}>{size}</span>
                    )) : <span style={styles.noSizes}>—</span>}
                  </div>
                </div>
              </div>
            )}

            {/* Table */}
            {!result.isUnknown && result.variants && result.variants.length > 0 && showResult && (
              <div style={styles.tableSection}>
                <div style={styles.sectionHeader}>
                  <span style={styles.sectionIcon}>📋</span>
                  <span style={styles.sectionTitle}>SIZE BREAKDOWN</span>
                  <span style={styles.tableCount}>{result.variants.length} SIZES</span>
                </div>
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>SIZE</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>BID</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>ASK</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>SPREAD</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>SCORE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.variants.map((v, i) => (
                        <tr key={v.variantId || i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                          <td style={styles.td}>
                            <span style={styles.sizeCell}>{v.size}</span>
                          </td>
                          <td style={{ ...styles.td, ...styles.tdMono, textAlign: 'right' }}>
                            {formatCurrency(v.highestBid)}
                          </td>
                          <td style={{ ...styles.td, ...styles.tdMono, textAlign: 'right' }}>
                            {formatCurrency(v.lowestAsk)}
                          </td>
                          <td style={{ ...styles.td, ...styles.tdMono, textAlign: 'right', color: spreadColor(v.spreadPct) }}>
                            {formatPercent(v.spreadPct)}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>
                            <div style={styles.scoreCell}>
                              <div style={styles.miniBarTrack}>
                                <div
                                  style={{
                                    ...styles.miniBarFill,
                                    width: `${v.liquidityScore}%`,
                                    background: liquidityColor(v.liquidityScore),
                                    boxShadow: `0 0 10px ${liquidityColor(v.liquidityScore)}`,
                                  }}
                                />
                              </div>
                              <span style={{ ...styles.miniScore, color: liquidityColor(v.liquidityScore) }}>
                                {v.liquidityScore}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={styles.footer}>
              <div style={styles.legend}>
                <span style={styles.legendItem}>
                  <span style={{...styles.legendDot, background: "#00ff64"}}></span>
                  COP 🔥
                </span>
                <span style={styles.legendItem}>
                  <span style={{...styles.legendDot, background: "#ffdc00"}}></span>
                  MAYBE 🤔
                </span>
                <span style={styles.legendItem}>
                  <span style={{...styles.legendDot, background: "#ff3232"}}></span>
                  DROP ❌
                </span>
              </div>
              {result.cache && (
                <span style={styles.cacheTag}>
                  <span style={styles.cacheDot}></span>
                  {result.cache}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #02020a 0%, #0a0a18 50%, #02020a 100%)",
    padding: "40px 20px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    position: "relative",
    overflow: "hidden",
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
    maxWidth: 700,
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
  },
  header: {
    marginBottom: 28,
    textAlign: "center",
  },
  titleWrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 12,
  },
  liveBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    background: "rgba(255, 50, 50, 0.2)",
    border: "1px solid #ff3232",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 800,
    color: "#ff3232",
    letterSpacing: "2px",
    animation: "neonFlicker 2s ease-in-out infinite",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ff3232",
    animation: "liveDot 0.8s ease-in-out infinite",
  },
  title: {
    margin: 0,
    fontSize: 52,
    fontWeight: 900,
    color: "#ffffff",
    letterSpacing: "8px",
    textShadow: "0 0 30px rgba(255,255,255,0.3), 0 0 60px rgba(255,255,255,0.1)",
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    color: "#6a6a8a",
    letterSpacing: "6px",
    fontWeight: 700,
  },
  searchTerminal: {
    background: "linear-gradient(180deg, #0e0e1c 0%, #08080f 100%)",
    border: "2px solid #1a1a30",
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 24,
    boxShadow: "0 10px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
  },
  terminalHeader: {
    display: "flex",
    alignItems: "center",
    padding: "14px 24px",
    background: "rgba(0,0,0,0.4)",
    borderBottom: "1px solid #1a1a30",
  },
  terminalDots: {
    display: "flex",
    gap: 8,
    marginRight: 20,
  },
  terminalDotRed: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#ff3232",
    boxShadow: "0 0 10px #ff3232",
  },
  terminalDotYellow: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#ffdc00",
    boxShadow: "0 0 10px #ffdc00",
  },
  terminalDotGreen: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#00ff64",
    boxShadow: "0 0 10px #00ff64",
  },
  terminalTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: 800,
    color: "#5a5a7a",
    letterSpacing: "3px",
  },
  terminalStatus: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 11,
    fontWeight: 800,
    color: "#00ff64",
    letterSpacing: "2px",
  },
  statusPulse: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#00ff64",
    boxShadow: "0 0 15px #00ff64",
    animation: "liveDot 1s ease-in-out infinite",
  },
  inputRow: {
    display: "flex",
    gap: 12,
    padding: 24,
  },
  inputWrapper: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    background: "#04040a",
    border: "2px solid #1a1a30",
    borderRadius: 14,
    padding: "0 20px",
    transition: "all 0.3s ease",
  },
  inputPrefix: {
    color: "#00ff64",
    fontSize: 16,
    marginRight: 14,
    animation: "glowPulse 1.5s ease-in-out infinite",
  },
  input: {
    flex: 1,
    padding: "18px 0",
    fontSize: 16,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    background: "transparent",
    border: "none",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: "3px",
    outline: "none",
  },
  checkBtn: {
    padding: "18px 32px",
    fontSize: 14,
    fontWeight: 900,
    background: "linear-gradient(135deg, #00ff64 0%, #00aa44 100%)",
    border: "none",
    borderRadius: 14,
    color: "#000000",
    cursor: "pointer",
    letterSpacing: "2px",
    boxShadow: "0 5px 30px rgba(0, 255, 100, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
    transition: "all 0.3s ease",
    animation: "float 3s ease-in-out infinite",
  },
  checkBtnDisabled: {
    background: "#1a1a30",
    color: "#4a4a6a",
    boxShadow: "none",
    cursor: "not-allowed",
    animation: "none",
  },
  clearBtn: {
    width: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    background: "rgba(255, 50, 50, 0.15)",
    border: "2px solid #ff323266",
    borderRadius: 14,
    color: "#ff3232",
    cursor: "pointer",
    transition: "all 0.3s ease",
  },
  chipsRow: {
    padding: "0 24px 24px",
  },
  chipsLabel: {
    display: "block",
    fontSize: 11,
    color: "#4a4a6a",
    letterSpacing: "3px",
    marginBottom: 12,
    fontWeight: 800,
  },
  chipsContainer: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  chip: {
    padding: "12px 18px",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid #1a1a30",
    borderRadius: 10,
    color: "#7a7a9a",
    cursor: "pointer",
    letterSpacing: "1px",
    transition: "all 0.3s ease",
  },
  loadingCard: {
    background: "linear-gradient(180deg, #0e0e1c 0%, #08080f 100%)",
    border: "2px solid #1a1a30",
    borderRadius: 20,
    padding: 60,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 30,
  },
  slotMachine: {
    display: "flex",
    gap: 12,
  },
  slotWindow: {
    width: 60,
    height: 70,
    background: "#04040a",
    border: "3px solid #2a2a4a",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)",
  },
  slotReel: {
    display: "flex",
    flexDirection: "column",
    animation: "slotSpin 0.15s linear infinite",
  },
  slotItem: {
    fontSize: 32,
    height: 70,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    fontWeight: 800,
    color: "#6a6a8a",
    letterSpacing: "5px",
    animation: "pulse 1s ease-in-out infinite",
  },
  loadingBar: {
    width: 250,
    height: 6,
    background: "#1a1a30",
    borderRadius: 3,
    overflow: "hidden",
  },
  loadingBarFill: {
    width: "100%",
    height: "100%",
    background: "linear-gradient(90deg, transparent, #00ff64, transparent)",
    animation: "shimmer 0.8s linear infinite",
  },
  resultCard: {
    background: "linear-gradient(180deg, #0e0e1c 0%, #08080f 100%)",
    border: "2px solid #1a1a30",
    borderRadius: 20,
    overflow: "hidden",
    animation: "slideIn 0.6s ease-out",
    boxShadow: "0 10px 60px rgba(0,0,0,0.5)",
  },
  productHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 28,
    background: "rgba(0,0,0,0.3)",
    borderBottom: "1px solid #1a1a30",
  },
  productInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: 1,
  },
  unknownBadge: {
    display: "inline-block",
    padding: "8px 14px",
    fontSize: 11,
    fontWeight: 800,
    background: "rgba(255, 50, 50, 0.2)",
    border: "2px solid #ff3232",
    borderRadius: 8,
    color: "#ff3232",
    letterSpacing: "2px",
    width: "fit-content",
  },
  productName: {
    fontSize: 20,
    fontWeight: 800,
    color: "#ffffff",
    lineHeight: 1.4,
  },
  productMeta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
  },
  skuLabel: {
    fontSize: 10,
    color: "#4a4a6a",
    letterSpacing: "3px",
    fontWeight: 800,
  },
  skuValue: {
    fontSize: 15,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    color: "#7a7a9a",
    letterSpacing: "2px",
  },
  verdictSection: {
    margin: 28,
    padding: 36,
    borderRadius: 20,
    border: "3px solid",
    position: "relative",
    overflow: "hidden",
  },
  verdictContent: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 30,
    position: "relative",
    zIndex: 1,
  },
  verdictLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  verdictLabel: {
    fontSize: 14,
    fontWeight: 900,
    color: "#7a7a9a",
    letterSpacing: "4px",
  },
  verdictValue: {
    fontSize: 58,
    fontWeight: 900,
    letterSpacing: "6px",
    lineHeight: 1,
  },
  verdictTag: {
    display: "inline-block",
    padding: "10px 18px",
    fontSize: 11,
    fontWeight: 800,
    borderRadius: 10,
    border: "2px solid",
    letterSpacing: "2px",
    width: "fit-content",
  },
  scoreCircleWrapper: {
    position: "relative",
    width: 130,
    height: 130,
  },
  scoreSvg: {
    width: "100%",
    height: "100%",
  },
  scoreInner: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNumber: {
    fontSize: 42,
    fontWeight: 900,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    lineHeight: 1,
  },
  scoreMax: {
    fontSize: 14,
    color: "#4a4a6a",
    fontWeight: 700,
  },
  liveStatsSection: {
    padding: "0 28px 28px",
  },
  liveStatsHeader: {
    marginBottom: 24,
  },
  liveIndicator: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    fontWeight: 900,
    color: "#00ff64",
    letterSpacing: "3px",
  },
  liveIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#00ff64",
    boxShadow: "0 0 15px #00ff64",
    animation: "liveDot 0.8s ease-in-out infinite",
  },
  metricRow: {
    marginBottom: 24,
  },
  metricInfo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: "#5a5a7a",
    letterSpacing: "2px",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 900,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    letterSpacing: "1px",
  },
  liveBarContainer: {
    position: "relative",
  },
  liveBarTrack: {
    height: 16,
    background: "#08080f",
    borderRadius: 8,
    overflow: "hidden",
    border: "2px solid #1a1a30",
  },
  liveBarFill: {
    height: "100%",
    borderRadius: 6,
    position: "relative",
    overflow: "hidden",
  },
  liveBarShimmer: {
    position: "absolute",
    top: 0,
    left: "-100%",
    width: "50%",
    height: "100%",
    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
    animation: "shimmer 1.5s linear infinite",
  },
  analysisSection: {
    padding: "0 28px 28px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 900,
    color: "#7a7a9a",
    letterSpacing: "3px",
    flex: 1,
  },
  tableCount: {
    fontSize: 11,
    color: "#5a5a7a",
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  },
  analysisList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  analysisItem: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "16px 20px",
    background: "rgba(255, 255, 255, 0.02)",
    borderRadius: 12,
    border: "1px solid #1a1a30",
  },
  analysisIndicator: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
    animation: "liveDot 1.5s ease-in-out infinite",
  },
  analysisText: {
    fontSize: 14,
    color: "#a0a0b0",
    lineHeight: 1.5,
  },
  sizesSection: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    padding: "0 28px 28px",
  },
  sizeBox: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "2px solid",
    borderRadius: 16,
    padding: 20,
  },
  sizeBoxHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  sizeBoxIconGreen: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 255, 100, 0.2)",
    borderRadius: 8,
    color: "#00ff64",
    fontSize: 14,
    fontWeight: 900,
  },
  sizeBoxIconRed: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255, 50, 50, 0.2)",
    borderRadius: 8,
    color: "#ff3232",
    fontSize: 14,
    fontWeight: 900,
  },
  sizeBoxTitle: {
    fontSize: 11,
    fontWeight: 900,
    color: "#7a7a9a",
    letterSpacing: "2px",
  },
  sizeChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  sizeChipGood: {
    padding: "10px 16px",
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    background: "rgba(0, 255, 100, 0.15)",
    border: "2px solid #00ff6466",
    borderRadius: 10,
    color: "#00ff64",
    fontWeight: 800,
    boxShadow: "0 0 15px rgba(0, 255, 100, 0.2)",
  },
  sizeChipBad: {
    padding: "10px 16px",
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    background: "rgba(255, 50, 50, 0.15)",
    border: "2px solid #ff323266",
    borderRadius: 10,
    color: "#ff3232",
    fontWeight: 800,
    boxShadow: "0 0 15px rgba(255, 50, 50, 0.2)",
  },
  noSizes: {
    color: "#3a3a5a",
    fontSize: 14,
  },
  tableSection: {
    padding: "0 28px 28px",
  },
  tableWrapper: {
    background: "#06060c",
    border: "2px solid #1a1a30",
    borderRadius: 16,
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    padding: "16px 20px",
    fontSize: 11,
    fontWeight: 900,
    color: "#5a5a7a",
    letterSpacing: "2px",
    textTransform: "uppercase",
    borderBottom: "2px solid #1a1a30",
    background: "#04040a",
    position: "sticky",
    top: 0,
  },
  trEven: {
    background: "transparent",
  },
  trOdd: {
    background: "rgba(255, 255, 255, 0.02)",
  },
  td: {
    padding: "16px 20px",
    color: "#b0b0c0",
    borderBottom: "1px solid #0f0f1a",
  },
  tdMono: {
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    fontSize: 13,
  },
  sizeCell: {
    fontWeight: 800,
    color: "#ffffff",
  },
  scoreCell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 14,
  },
  miniBarTrack: {
    width: 70,
    height: 8,
    background: "#1a1a30",
    borderRadius: 4,
    overflow: "hidden",
  },
  miniBarFill: {
    height: "100%",
    borderRadius: 4,
    animation: "barPulse 2s ease-in-out infinite",
  },
  miniScore: {
    fontSize: 14,
    fontWeight: 900,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    minWidth: 30,
    textAlign: "right",
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 28px",
    borderTop: "2px solid #1a1a30",
    background: "rgba(0,0,0,0.3)",
  },
  legend: {
    display: "flex",
    gap: 24,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    fontWeight: 800,
    color: "#6a6a8a",
    letterSpacing: "1px",
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    animation: "liveDot 2s ease-in-out infinite",
  },
  cacheTag: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 11,
    color: "#4a4a6a",
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    letterSpacing: "2px",
  },
  cacheDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#00ff64",
    boxShadow: "0 0 10px #00ff64",
  },
};
