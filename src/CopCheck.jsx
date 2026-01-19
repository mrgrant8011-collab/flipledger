import { useState } from "react";

// Mock data - raw inputs only, verdicts calculated dynamically
const MOCK_DATA = {
  "DZ5485-612": {
    name: 'Jordan 1 High "Lost & Found"',
    retailPrice: 180,
    expectedResale: 340,
    feeRate: 0.125,
    shippingCost: 14,
    sellSpeedScore: 85,
    bestSizes: ["4", "4.5", "5", "14", "15"],
    avoidSizes: ["9", "9.5", "10", "10.5"],
  },
  "FQ1759-001": {
    name: 'Dunk Low "Panda" 2024',
    retailPrice: 115,
    expectedResale: 105,
    feeRate: 0.125,
    shippingCost: 14,
    sellSpeedScore: 25,
    bestSizes: [],
    avoidSizes: ["All sizes"],
  },
  "DV1748-601": {
    name: 'Jordan 1 Low "Mocha"',
    retailPrice: 140,
    expectedResale: 230,
    feeRate: 0.125,
    shippingCost: 13,
    sellSpeedScore: 70,
    bestSizes: ["4", "5", "12", "13"],
    avoidSizes: ["9", "10"],
  },
  "IE0219": {
    name: 'Yeezy Slide "Onyx"',
    retailPrice: 70,
    expectedResale: 150,
    feeRate: 0.125,
    shippingCost: 10,
    sellSpeedScore: 78,
    bestSizes: ["4", "5", "6", "13"],
    avoidSizes: ["9", "10", "11"],
  },
  "HQ6916-300": {
    name: 'Samba OG "Green"',
    retailPrice: 100,
    expectedResale: 150,
    feeRate: 0.125,
    shippingCost: 12,
    sellSpeedScore: 45,
    bestSizes: ["4", "5"],
    avoidSizes: ["8", "9", "10", "11"],
  },
};

// Fallback for unknown SKUs
const UNKNOWN_SKU = {
  name: "Unknown SKU",
  retailPrice: 150,
  expectedResale: 145,
  feeRate: 0.125,
  shippingCost: 14,
  sellSpeedScore: 30,
  bestSizes: [],
  avoidSizes: [],
  isUnknown: true,
};

// profit = expected_resale - retail_price - (expected_resale * fee_rate) - shipping_cost
function calculateProfit(retailPrice, expectedResale, feeRate, shippingCost) {
  return expectedResale - retailPrice - expectedResale * feeRate - shippingCost;
}

// roi = profit / retail_price
function calculateROI(profit, retailPrice) {
  return (profit / retailPrice) * 100;
}

// COP: profit >= 50 AND sell_speed_score >= 60
// MAYBE: profit >= 20 AND sell_speed_score >= 40
// DROP: otherwise
function getVerdict(profit, sellSpeedScore) {
  if (profit >= 50 && sellSpeedScore >= 60) return "COP";
  if (profit >= 20 && sellSpeedScore >= 40) return "MAYBE";
  return "DROP";
}

// High: profit >= 80 OR (profit >= 50 AND sell_speed_score >= 75)
// Medium: profit >= 35
// Low: otherwise
function getConfidence(profit, sellSpeedScore) {
  if (profit >= 80 || (profit >= 50 && sellSpeedScore >= 75)) return "High";
  if (profit >= 35) return "Medium";
  return "Low";
}

function getSpeedLabel(score) {
  if (score >= 70) return "Fast";
  if (score >= 40) return "Medium";
  return "Slow";
}

function generateReasons(profit, roi, sellSpeedScore, isUnknown) {
  if (isUnknown) {
    return [
      "SKU not found in database",
      "Unable to verify market data",
      "Check SKU and try again",
    ];
  }
  const reasons = [];
  if (profit >= 50) reasons.push(`$${profit.toFixed(0)} profit — strong margin`);
  else if (profit >= 20) reasons.push(`$${profit.toFixed(0)} profit — moderate margin`);
  else if (profit > 0) reasons.push(`$${profit.toFixed(0)} profit — thin margin`);
  else reasons.push(`-$${Math.abs(profit).toFixed(0)} loss per pair`);

  if (roi >= 25) reasons.push(`${roi.toFixed(0)}% ROI — excellent efficiency`);
  else if (roi >= 10) reasons.push(`${roi.toFixed(0)}% ROI — decent return`);
  else reasons.push(`${roi.toFixed(0)}% ROI — poor efficiency`);

  if (sellSpeedScore >= 70) reasons.push(`Speed ${sellSpeedScore}/100 — fast flip`);
  else if (sellSpeedScore >= 40) reasons.push(`Speed ${sellSpeedScore}/100 — moderate`);
  else reasons.push(`Speed ${sellSpeedScore}/100 — slow mover`);

  return reasons;
}

export default function CopCheck() {
  const [sku, setSku] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    if (!sku.trim()) return;
    setLoading(true);
    setResult(null);

    // 600ms simulated delay
    await new Promise((r) => setTimeout(r, 600));

    const raw = MOCK_DATA[sku.toUpperCase().trim()] || UNKNOWN_SKU;
    const profit = calculateProfit(raw.retailPrice, raw.expectedResale, raw.feeRate, raw.shippingCost);
    const roi = calculateROI(profit, raw.retailPrice);
    const verdict = getVerdict(profit, raw.sellSpeedScore);
    const confidence = getConfidence(profit, raw.sellSpeedScore);
    const reasons = generateReasons(profit, roi, raw.sellSpeedScore, raw.isUnknown);

    setResult({
      ...raw,
      profit,
      roi,
      verdict,
      confidence,
      reasons,
      fees: raw.expectedResale * raw.feeRate,
    });
    setLoading(false);
  };

  const handleClear = () => {
    setSku("");
    setResult(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleCheck();
  };

  const verdictColors = {
    COP: { bg: "rgba(34, 197, 94, 0.15)", border: "#22c55e", text: "#22c55e" },
    MAYBE: { bg: "rgba(212, 175, 55, 0.15)", border: "#d4af37", text: "#d4af37" },
    DROP: { bg: "rgba(239, 68, 68, 0.15)", border: "#ef4444", text: "#ef4444" },
  };

  const confidenceColor = {
    High: "#22c55e",
    Medium: "#d4af37",
    Low: "#ef4444",
  };

  const speedColor = (score) => {
    if (score >= 70) return "#22c55e";
    if (score >= 40) return "#d4af37";
    return "#ef4444";
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Cop Check</h1>
          <p style={styles.subtitle}>Profit & speed analysis for resellers</p>
        </div>

        {/* Input Card */}
        <div style={styles.card}>
          <div style={styles.inputRow}>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter SKU..."
              disabled={loading}
              style={styles.input}
            />
            <button
              onClick={handleCheck}
              disabled={loading || !sku.trim()}
              style={{
                ...styles.checkBtn,
                opacity: loading || !sku.trim() ? 0.5 : 1,
                cursor: loading || !sku.trim() ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Checking..." : "Check"}
            </button>
            {(sku || result) && (
              <button onClick={handleClear} disabled={loading} style={styles.clearBtn}>
                Clear
              </button>
            )}
          </div>

          {/* Quick SKU chips */}
          <div style={styles.chipsRow}>
            <span style={styles.chipsLabel}>Try:</span>
            {Object.keys(MOCK_DATA).map((s) => (
              <button key={s} onClick={() => setSku(s)} style={styles.chip}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={styles.loadingCard}>
            <div style={styles.spinner}></div>
            <span style={styles.loadingText}>Analyzing market data...</span>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={styles.resultCard}>
            {/* Product Header */}
            <div style={styles.productHeader}>
              {result.isUnknown && <span style={styles.unknownBadge}>Unknown</span>}
              <span style={styles.productName}>{result.name}</span>
            </div>

            {/* Verdict Row */}
            <div style={styles.verdictRow}>
              <div
                style={{
                  ...styles.verdictBox,
                  background: verdictColors[result.verdict].bg,
                  borderColor: verdictColors[result.verdict].border,
                }}
              >
                <span style={styles.verdictLabel}>Verdict</span>
                <span style={{ ...styles.verdictValue, color: verdictColors[result.verdict].text }}>
                  {result.verdict === "COP" && "🟢 "}
                  {result.verdict === "MAYBE" && "🟡 "}
                  {result.verdict === "DROP" && "🔴 "}
                  {result.verdict}
                </span>
              </div>
              <div style={styles.confidenceBox}>
                <span style={styles.verdictLabel}>Confidence</span>
                <span style={{ ...styles.confidenceValue, color: confidenceColor[result.confidence] }}>
                  {result.confidence}
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div style={styles.metricsGrid}>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Net Profit</span>
                <span style={{ ...styles.metricValue, color: result.profit >= 0 ? "#22c55e" : "#ef4444" }}>
                  {result.profit >= 0 ? "+" : ""}${result.profit.toFixed(0)}
                </span>
                <span style={styles.metricSub}>per pair</span>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>ROI</span>
                <span style={{ ...styles.metricValue, color: result.roi >= 15 ? "#22c55e" : "#d4af37" }}>
                  {result.roi.toFixed(0)}%
                </span>
                <span style={styles.metricSub}>return</span>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Sell Speed</span>
                <span style={{ ...styles.metricValue, color: speedColor(result.sellSpeedScore) }}>
                  {result.sellSpeedScore}
                </span>
                <span style={styles.metricSub}>{getSpeedLabel(result.sellSpeedScore)}</span>
              </div>
            </div>

            {/* Speed Bar */}
            <div style={styles.speedSection}>
              <div style={styles.speedHeader}>
                <span style={styles.speedLabel}>Sell Speed</span>
                <span style={{ ...styles.speedValue, color: speedColor(result.sellSpeedScore) }}>
                  {result.sellSpeedScore}/100
                </span>
              </div>
              <div style={styles.speedTrack}>
                <div
                  style={{
                    ...styles.speedFill,
                    width: `${result.sellSpeedScore}%`,
                    background: `linear-gradient(90deg, ${speedColor(result.sellSpeedScore)}88, ${speedColor(result.sellSpeedScore)})`,
                  }}
                />
              </div>
            </div>

            {/* Breakdown */}
            <div style={styles.breakdownSection}>
              <div style={styles.sectionHeader}>Price Breakdown</div>
              <div style={styles.breakdownCard}>
                <div style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>Retail (Cost)</span>
                  <span style={styles.breakdownValue}>${result.retailPrice}</span>
                </div>
                <div style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>Expected Resale</span>
                  <span style={styles.breakdownValue}>${result.expectedResale}</span>
                </div>
                <div style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>Platform Fees ({(result.feeRate * 100).toFixed(1)}%)</span>
                  <span style={{ ...styles.breakdownValue, color: "#ef4444" }}>-${result.fees.toFixed(0)}</span>
                </div>
                <div style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>Shipping</span>
                  <span style={{ ...styles.breakdownValue, color: "#ef4444" }}>-${result.shippingCost}</span>
                </div>
                <div style={styles.breakdownTotal}>
                  <span style={styles.totalLabel}>Net Profit</span>
                  <span style={{ ...styles.totalValue, color: result.profit >= 0 ? "#22c55e" : "#ef4444" }}>
                    {result.profit >= 0 ? "+" : ""}${result.profit.toFixed(0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Analysis */}
            <div style={styles.analysisSection}>
              <div style={styles.sectionHeader}>Analysis</div>
              <div style={styles.reasonsList}>
                {result.reasons.map((r, i) => (
                  <div key={i} style={styles.reasonItem}>
                    <span style={styles.reasonIcon}>→</span>
                    <span style={styles.reasonText}>{r}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sizes */}
            {!result.isUnknown && (
              <div style={styles.sizesSection}>
                <div style={styles.sizesGrid}>
                  <div style={styles.sizeCard}>
                    <div style={styles.sizeHeader}>
                      <span style={{ ...styles.sizeDot, background: "#22c55e" }}></span>
                      <span style={styles.sizeTitle}>Best Sizes</span>
                    </div>
                    <span style={styles.sizeValues}>
                      {result.bestSizes.length ? result.bestSizes.join(", ") : "—"}
                    </span>
                  </div>
                  <div style={styles.sizeCard}>
                    <div style={styles.sizeHeader}>
                      <span style={{ ...styles.sizeDot, background: "#ef4444" }}></span>
                      <span style={styles.sizeTitle}>Avoid</span>
                    </div>
                    <span style={styles.sizeValues}>
                      {result.avoidSizes.length ? result.avoidSizes.join(", ") : "—"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={styles.footer}>
              <span style={styles.footerText}>
                COP: profit ≥$50 + speed ≥60 • MAYBE: profit ≥$20 + speed ≥40 • DROP: otherwise
              </span>
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
    background: "#0a0a0a",
    padding: "32px 24px",
  },
  container: {
    maxWidth: 560,
    margin: "0 auto",
  },
  header: {
    marginBottom: 32,
  },
  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 700,
    color: "#ffffff",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    margin: "8px 0 0",
    fontSize: 14,
    color: "#737373",
  },
  card: {
    background: "#141414",
    border: "1px solid #262626",
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  },
  inputRow: {
    display: "flex",
    gap: 12,
  },
  input: {
    flex: 1,
    padding: "14px 18px",
    fontSize: 15,
    fontFamily: "monospace",
    background: "#0a0a0a",
    border: "1px solid #262626",
    borderRadius: 10,
    color: "#ffffff",
    textTransform: "uppercase",
    outline: "none",
  },
  checkBtn: {
    padding: "14px 28px",
    fontSize: 14,
    fontWeight: 600,
    background: "linear-gradient(135deg, #d4af37, #b8962e)",
    border: "none",
    borderRadius: 10,
    color: "#000000",
    transition: "all 0.2s",
  },
  clearBtn: {
    padding: "14px 20px",
    fontSize: 14,
    fontWeight: 500,
    background: "#1f1f1f",
    border: "1px solid #262626",
    borderRadius: 10,
    color: "#a3a3a3",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  chipsRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    flexWrap: "wrap",
  },
  chipsLabel: {
    fontSize: 12,
    color: "#525252",
  },
  chip: {
    padding: "6px 12px",
    fontSize: 11,
    fontFamily: "monospace",
    background: "#1f1f1f",
    border: "1px solid #262626",
    borderRadius: 6,
    color: "#a3a3a3",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  loadingCard: {
    background: "#141414",
    border: "1px solid #262626",
    borderRadius: 16,
    padding: 48,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #262626",
    borderTopColor: "#d4af37",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  loadingText: {
    fontSize: 14,
    color: "#737373",
  },
  resultCard: {
    background: "#141414",
    border: "1px solid #262626",
    borderRadius: 16,
    overflow: "hidden",
  },
  productHeader: {
    padding: "20px 24px",
    borderBottom: "1px solid #262626",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  unknownBadge: {
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 600,
    background: "rgba(239, 68, 68, 0.15)",
    border: "1px solid #ef4444",
    borderRadius: 6,
    color: "#ef4444",
  },
  productName: {
    fontSize: 14,
    color: "#a3a3a3",
    fontFamily: "monospace",
  },
  verdictRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    padding: 24,
  },
  verdictBox: {
    padding: 20,
    borderRadius: 12,
    border: "1px solid",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  verdictLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  verdictValue: {
    fontSize: 24,
    fontWeight: 700,
  },
  confidenceBox: {
    padding: 20,
    borderRadius: 12,
    background: "#1f1f1f",
    border: "1px solid #262626",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  confidenceValue: {
    fontSize: 24,
    fontWeight: 700,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    padding: "0 24px 24px",
  },
  metricCard: {
    background: "#1f1f1f",
    border: "1px solid #262626",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: "monospace",
  },
  metricSub: {
    fontSize: 10,
    color: "#525252",
  },
  speedSection: {
    padding: "0 24px 24px",
  },
  speedHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  speedLabel: {
    fontSize: 12,
    color: "#737373",
  },
  speedValue: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "monospace",
  },
  speedTrack: {
    height: 8,
    background: "#1f1f1f",
    borderRadius: 4,
    overflow: "hidden",
  },
  speedFill: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.5s ease",
  },
  breakdownSection: {
    padding: "0 24px 24px",
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: 600,
    color: "#d4af37",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: 12,
  },
  breakdownCard: {
    background: "#1f1f1f",
    border: "1px solid #262626",
    borderRadius: 12,
    padding: 16,
  },
  breakdownRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #262626",
  },
  breakdownLabel: {
    fontSize: 13,
    color: "#a3a3a3",
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: 500,
    color: "#ffffff",
    fontFamily: "monospace",
  },
  breakdownTotal: {
    display: "flex",
    justifyContent: "space-between",
    paddingTop: 14,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#ffffff",
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "monospace",
  },
  analysisSection: {
    padding: "0 24px 24px",
  },
  reasonsList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  reasonItem: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  reasonIcon: {
    color: "#d4af37",
    fontWeight: 600,
  },
  reasonText: {
    fontSize: 14,
    color: "#d4d4d4",
    lineHeight: 1.5,
  },
  sizesSection: {
    padding: "0 24px 24px",
  },
  sizesGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  sizeCard: {
    background: "#1f1f1f",
    border: "1px solid #262626",
    borderRadius: 12,
    padding: 16,
  },
  sizeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sizeDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  sizeTitle: {
    fontSize: 11,
    fontWeight: 500,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  sizeValues: {
    fontSize: 14,
    fontWeight: 500,
    color: "#ffffff",
    fontFamily: "monospace",
  },
  footer: {
    padding: "16px 24px",
    borderTop: "1px solid #262626",
    background: "#0f0f0f",
  },
  footerText: {
    fontSize: 11,
    color: "#525252",
    textAlign: "center",
    display: "block",
  },
};
