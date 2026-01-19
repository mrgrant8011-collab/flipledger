import { useState } from "react";

export default function CopCheck() {
  const [sku, setSku] = useState("");
  const [result, setResult] = useState(null);

  const handleCheck = () => {
    setResult({
      verdict: "MAYBE",
      confidence: "Medium",
      reasons: [
        "Margins are thin after fees",
        "Strong demand in sizes 9-11",
        "Avoid larger sizes"
      ],
      best_sizes: ["9", "9.5", "10"],
      avoid_sizes: ["14", "15"]
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>👮 Cop Check</h1>
      <input
        value={sku}
        onChange={(e) => setSku(e.target.value)}
        placeholder="Enter SKU"
        style={{ padding: 12, fontSize: 16, width: 300, marginRight: 12 }}
      />
      <button onClick={handleCheck} style={{ padding: 12, fontSize: 16 }}>
        Check
      </button>

      {result && (
        <div style={{ marginTop: 24 }}>
          <h2>Verdict: {result.verdict}</h2>
          <p>Confidence: {result.confidence}</p>
          <p>Best sizes: {result.best_sizes.join(", ")}</p>
          <p>Avoid: {result.avoid_sizes.join(", ")}</p>
        </div>
      )}
    </div>
  );
}
