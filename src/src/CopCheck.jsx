import { useState } from "react";

export default function CopCheck() {
  const [sku, setSku] = useState("");
  const [result, setResult] = useState(null);

  const handleCheck = () => {
    // MOCK DATA FOR NOW
    setResult({
      verdict: "MAYBE",
      confidence: "Medium",
      reasons: [
        "Margins are thin after fees",
        "Strong demand in sizes 9–11",
        "Avoid larger sizes"
      ],
      best_sizes: ["9", "9.5", "10"],
      avoid_sizes: ["14", "15"]
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>🔥 Cop Check</h1>

      <input
        placeholder="Enter style code (e.g. DC0774-101)"
        value={sku}
        onChange={(e) => setSku(e.target.value)}
        style={{ padding: 10, width: 280 }}
      />

      <button
        onClick={handleCheck}
        style={{ marginLeft: 10, padding: "10px 16px" }}
      >
        Check
      </button>

      {result && (
        <div style={{ marginTop: 24 }}>
          <h2>{result.verdict}</h2>
          <p>Confidence: {result.confidence}</p>

          <ul>
            {result.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>

          <p><strong>Best sizes:</strong> {result.best_sizes.join(", ")}</p>
          <p><strong>Avoid sizes:</strong> {result.avoid_sizes.join(", ")}</p>
        </div>
      )}
    </div>
  );
}
