import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

// ════════════════════════════════════════════════════════════════════
// LANDING PAGE — Full marketing page + auth modal
// Replace AuthPage with this component in App.jsx
// Usage: <LandingPage onLogin={setUser} />
// ════════════════════════════════════════════════════════════════════

export default function LandingPage({ onLogin }) {
  const [showAuth, setShowAuth] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const animRef = useRef(null);

  // Scroll animation observer
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('fl-vis'); });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    document.querySelectorAll('.fl-anim').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) alert('Check your email for confirmation link!');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) onLogin(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openAuth = (signup = true) => {
    setIsSignUp(signup);
    setShowAuth(true);
    setError('');
  };

  // Audience tab state
  const [audIdx, setAudIdx] = useState(0);
  const audiences = [
    { t: "Reprice faster than anyone.", d: "You're managing hundreds of listings across sizes and styles. FlipLedger lets you see market data for every size, reprice in bulk, cross-list to eBay, and auto-delist sold items — without spending hours on StockX Pro.", e: "👟" },
    { t: "Move inventory at scale.", d: "When you're buying pallets and moving thousands of units, every dollar matters. FlipLedger tracks your cost basis, calculates margins per item, syncs sales automatically, and generates CPA-ready reports.", e: "📦" },
    { t: "Start your journey right.", d: "Don't learn the hard way with spreadsheets and guesswork. FlipLedger gives you the same tools the pros use — smart repricing, cross-listing, and profit tracking from day one.", e: "🚀" }
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        
        .fl-land * { margin: 0; padding: 0; box-sizing: border-box; }
        .fl-land {
          background: #060606; color: #fff;
          font-family: 'DM Sans', sans-serif;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden; min-height: 100vh;
        }

        /* NAV */
        .fl-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 16px 40px;
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(6,6,6,0.85);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .fl-nav-logo {
          display: flex; align-items: center; gap: 10px;
          font-family: 'Outfit', sans-serif;
          font-weight: 800; font-size: 22px; color: #fff; text-decoration: none; cursor: pointer;
        }
        .fl-nav-icon {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, #C9A962, #a8853a);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 900; color: #000;
        }
        .fl-nav-links { display: flex; gap: 32px; align-items: center; }
        .fl-nav-links a, .fl-nav-links button { 
          color: #999; background: none; border: none; text-decoration: none; 
          font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;
          transition: color 0.2s; 
        }
        .fl-nav-links a:hover, .fl-nav-links button:hover { color: #fff; }
        .fl-nav-cta {
          padding: 10px 24px !important;
          background: #C9A962 !important; color: #000 !important;
          font-weight: 700 !important; border-radius: 40px !important;
          transition: transform 0.2s, box-shadow 0.2s !important;
        }
        .fl-nav-cta:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(201,169,98,0.15); }

        /* HERO */
        .fl-hero {
          padding: 160px 40px 100px;
          display: flex; align-items: center; gap: 60px;
          max-width: 1300px; margin: 0 auto; position: relative;
        }
        .fl-hero::before {
          content: ''; position: absolute; top: -200px; right: -100px;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(201,169,98,0.15) 0%, transparent 70%);
          pointer-events: none;
        }
        .fl-hero-content { flex: 1; max-width: 540px; animation: flFadeUp 0.8s ease-out; }
        .fl-hero h1 {
          font-family: 'Outfit', sans-serif;
          font-size: 64px; font-weight: 900;
          line-height: 1.05; letter-spacing: -2px; margin-bottom: 24px;
        }
        .fl-gold { color: #C9A962; }
        .fl-hero p { font-size: 18px; line-height: 1.7; color: #999; margin-bottom: 40px; max-width: 460px; }
        .fl-hero-cta {
          display: inline-block; padding: 18px 44px;
          background: #C9A962; color: #000;
          font-weight: 700; font-size: 16px;
          border-radius: 50px; border: none; cursor: pointer;
          transition: transform 0.2s, box-shadow 0.3s;
          position: relative; font-family: inherit;
        }
        .fl-hero-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 40px rgba(201,169,98,0.15); }
        .fl-hero-cta::after {
          content: ''; position: absolute; bottom: -4px; left: 10%; right: 10%;
          height: 6px; border-radius: 3px;
          background: linear-gradient(90deg, #C9A962, #10b981, #8B5CF6);
          filter: blur(1px);
        }
        .fl-hero-img { flex: 1; animation: flFadeUp 0.8s ease-out 0.2s both; }

        /* APP PREVIEW */
        .fl-preview {
          width: 100%; max-width: 640px;
          background: #141414; border: 1px solid #1a1a1a;
          border-radius: 16px; overflow: hidden;
          box-shadow: 0 40px 100px rgba(0,0,0,0.6);
        }
        .fl-preview-bar {
          padding: 12px 16px; background: #0f0f0f;
          border-bottom: 1px solid #1a1a1a;
          display: flex; align-items: center; gap: 8px;
        }
        .fl-dot { width: 10px; height: 10px; border-radius: 50%; }
        .fl-dot-r { background: #ff5f56; } .fl-dot-y { background: #ffbd2e; } .fl-dot-g { background: #27c93f; }
        .fl-ptabs { display: flex; gap: 0; margin-left: 16px; font-size: 11px; font-weight: 600; }
        .fl-ptab { padding: 6px 14px; border-radius: 6px; color: #555; }
        .fl-ptab-a { background: rgba(201,169,98,0.15); color: #C9A962; }
        .fl-preview-body { padding: 20px; }
        .fl-pstats { display: flex; gap: 12px; margin-bottom: 16px; }
        .fl-pstat { flex: 1; padding: 10px 12px; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 10px; }
        .fl-pstat-l { font-size: 9px; color: #555; font-weight: 700; letter-spacing: 0.5px; }
        .fl-pstat-v { font-size: 18px; font-weight: 800; font-family: 'Outfit'; margin-top: 2px; }
        .fl-ptable { width: 100%; font-size: 11px; border-collapse: collapse; }
        .fl-ptable th { text-align: left; padding: 8px 6px; color: #555; font-weight: 600; border-bottom: 1px solid #1a1a1a; font-size: 10px; }
        .fl-ptable td { padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.03); }
        .fl-pg { color: #10b981; font-weight: 600; }
        .fl-pgo { color: #C9A962; font-weight: 600; }
        .fl-pr { color: #ef4444; font-weight: 600; }

        /* SECTIONS */
        .fl-section { padding: 100px 40px; }
        .fl-center { text-align: center; max-width: 700px; margin: 0 auto; }
        .fl-label { font-size: 14px; font-weight: 600; color: #C9A962; margin-bottom: 16px; letter-spacing: 0.5px; }
        .fl-title { font-family: 'Outfit', sans-serif; font-size: 48px; font-weight: 900; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 20px; }
        .fl-desc { font-size: 17px; line-height: 1.7; color: #999; max-width: 560px; margin: 0 auto; }

        /* FEATURE ROWS */
        .fl-feat { background: #0a0a0a; }
        .fl-feat:nth-child(even) { background: #060606; }
        .fl-feat-row { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: 80px; }
        .fl-feat-row.fl-rev { flex-direction: row-reverse; }
        .fl-feat-text { flex: 1; }
        .fl-feat-text h3 { font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 800; line-height: 1.15; letter-spacing: -1px; margin-bottom: 28px; }
        .fl-checks { display: flex; flex-direction: column; gap: 24px; }
        .fl-chk { display: flex; gap: 14px; }
        .fl-chk-i { width: 28px; height: 28px; flex-shrink: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; margin-top: 2px; }
        .fl-chk-gold { background: rgba(201,169,98,0.15); color: #C9A962; }
        .fl-chk-green { background: rgba(16,185,129,0.12); color: #10b981; }
        .fl-chk-purple { background: rgba(139,92,246,0.12); color: #8B5CF6; }
        .fl-chk h4 { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
        .fl-chk p { font-size: 14px; line-height: 1.65; color: #999; }
        .fl-feat-vis { flex: 1; }
        .fl-mock { width: 100%; background: #141414; border: 1px solid #1a1a1a; border-radius: 14px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
        .fl-mock-bar { padding: 10px 14px; background: #0f0f0f; border-bottom: 1px solid #1a1a1a; display: flex; align-items: center; gap: 6px; }
        .fl-mock-d { width: 8px; height: 8px; border-radius: 50%; }
        .fl-mock-body { padding: 16px; font-size: 11px; color: #999; min-height: 220px; }
        .fl-feat-cta {
          display: inline-block; margin-top: 32px; padding: 14px 36px;
          background: #fff; color: #000;
          font-weight: 700; font-size: 14px;
          border-radius: 40px; border: none; cursor: pointer;
          transition: transform 0.2s; position: relative; font-family: inherit;
        }
        .fl-feat-cta:hover { transform: translateY(-2px); box-shadow: 0 6px 30px rgba(255,255,255,0.1); }
        .fl-feat-cta::after {
          content: ''; position: absolute; bottom: -3px; left: 15%; right: 15%;
          height: 4px; border-radius: 2px;
          background: linear-gradient(90deg, #C9A962, #10b981);
          filter: blur(1px);
        }

        /* BIG CTA */
        .fl-bigcta { text-align: center; padding: 80px 40px; }
        .fl-bigcta-btn {
          display: inline-block; padding: 22px 56px;
          background: #fff; color: #000;
          font-weight: 800; font-size: 18px;
          border-radius: 50px; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif;
          transition: transform 0.2s; position: relative;
        }
        .fl-bigcta-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 40px rgba(255,255,255,0.1); }
        .fl-bigcta-btn::after {
          content: ''; position: absolute; bottom: -5px; left: 10%; right: 10%;
          height: 6px; border-radius: 3px;
          background: linear-gradient(90deg, #C9A962, #10b981, #8B5CF6);
          filter: blur(1px);
        }

        /* FEATURE GRID */
        .fl-fgrid { max-width: 1100px; margin: 60px auto 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .fl-fcard {
          background: #141414; border: 1px solid #1a1a1a; border-radius: 16px; padding: 28px;
          transition: border-color 0.2s, transform 0.2s;
        }
        .fl-fcard:hover { border-color: rgba(201,169,98,0.3); transform: translateY(-2px); }
        .fl-fcard-icon { font-size: 28px; margin-bottom: 14px; }
        .fl-fcard h4 { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
        .fl-fcard p { font-size: 13px; line-height: 1.6; color: #999; }

        /* AUDIENCE */
        .fl-aud-tabs { display: flex; gap: 12px; justify-content: center; margin: 40px auto 0; flex-wrap: wrap; }
        .fl-aud-tab {
          padding: 12px 24px; background: #141414; border: 1px solid #1a1a1a;
          border-radius: 40px; font-size: 14px; font-weight: 600; cursor: pointer;
          transition: all 0.2s; color: #999; font-family: inherit;
        }
        .fl-aud-tab:hover, .fl-aud-tab-a { background: rgba(201,169,98,0.15) !important; border-color: #C9A962 !important; color: #C9A962 !important; }
        .fl-aud-card {
          max-width: 900px; margin: 40px auto 0; background: #141414;
          border: 1px solid #1a1a1a; border-radius: 20px; padding: 48px;
          display: flex; gap: 40px; align-items: center;
        }
        .fl-aud-card h3 { font-family: 'Outfit'; font-size: 28px; font-weight: 800; margin-bottom: 16px; }
        .fl-aud-card p { font-size: 15px; line-height: 1.7; color: #999; }
        .fl-aud-emoji {
          width: 280px; height: 200px; background: #0f0f0f; border: 1px solid #1a1a1a;
          border-radius: 14px; display: flex; align-items: center; justify-content: center;
          font-size: 56px; flex-shrink: 0;
        }

        /* PRICING */
        .fl-price-card {
          max-width: 520px; margin: 60px auto 0;
          background: #141414; border: 2px solid #C9A962;
          border-radius: 20px; padding: 40px; text-align: center;
        }
        .fl-price-name { font-family: 'Outfit'; font-size: 28px; font-weight: 800; margin-bottom: 4px; }
        .fl-price-sub { font-size: 13px; color: #555; margin-bottom: 20px; }
        .fl-price-amt { font-family: 'Outfit'; font-size: 52px; font-weight: 900; letter-spacing: -2px; }
        .fl-price-per { font-size: 14px; color: #555; margin-left: 6px; }
        .fl-price-trial { font-size: 14px; color: #C9A962; font-weight: 600; margin: 8px 0 28px; }
        .fl-price-divider { height: 1px; background: #1a1a1a; margin-bottom: 24px; }
        .fl-price-btn {
          display: block; width: 100%; padding: 18px;
          background: #C9A962; color: #000; font-weight: 700; font-size: 16px;
          border-radius: 40px; border: none; cursor: pointer;
          transition: transform 0.2s; margin-bottom: 24px; font-family: inherit;
        }
        .fl-price-btn:hover { transform: translateY(-1px); }
        .fl-price-feats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; text-align: left; }
        .fl-price-feat { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #999; }
        .fl-price-feat::before { content: '✓'; color: #10b981; font-weight: 700; font-size: 14px; }
        .fl-price-value {
          margin-top: 28px; padding: 16px;
          background: rgba(201,169,98,0.08); border: 1px solid rgba(201,169,98,0.2);
          border-radius: 12px; font-size: 13px; color: #999;
        }

        /* FOOTER */
        .fl-footer {
          padding: 60px 40px; border-top: 1px solid #1a1a1a;
          display: flex; justify-content: space-between; align-items: center;
          max-width: 1200px; margin: 0 auto;
        }
        .fl-footer-logo { display: flex; align-items: center; gap: 10px; font-family: 'Outfit'; font-weight: 800; font-size: 18px; color: #fff; }
        .fl-footer-links { display: flex; gap: 24px; }
        .fl-footer-links a { font-size: 13px; color: #555; text-decoration: none; transition: color 0.2s; }
        .fl-footer-links a:hover { color: #999; }

        /* MODAL */
        .fl-modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);
          z-index: 200; display: flex; align-items: center; justify-content: center;
          padding: 20px; animation: flFadeIn 0.2s ease-out;
        }
        .fl-modal {
          width: 100%; max-width: 420px;
          background: #111; border: 1px solid #1a1a1a;
          border-radius: 24px; padding: 40px;
          animation: flSlideUp 0.3s ease-out;
        }
        .fl-modal-close {
          position: absolute; top: 16px; right: 20px;
          background: none; border: none; color: #555; font-size: 24px;
          cursor: pointer; transition: color 0.2s;
        }
        .fl-modal-close:hover { color: #fff; }
        .fl-input {
          width: 100%; padding: 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid #1a1a1a; border-radius: 12px;
          color: #fff; font-size: 14px; outline: none;
          box-sizing: border-box; font-family: inherit;
        }
        .fl-input:focus { border-color: #C9A962; }
        .fl-submit {
          width: 100%; padding: 14px;
          background: linear-gradient(135deg, #C9A962, #B8943F);
          border: none; border-radius: 12px;
          color: #000; font-size: 15px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          transition: opacity 0.2s;
        }
        .fl-submit:disabled { opacity: 0.7; cursor: wait; }

        /* PILL HELPERS */
        .fl-pill { padding: 6px 12px; border-radius: 6px; font-size: 10px; font-weight: 600; display: inline-block; }
        .fl-m-row { display: flex; gap: 8px; margin-bottom: 6px; align-items: center; }
        .fl-m-stat { flex: 1; background: #0f0f0f; border-radius: 8px; padding: 12px; }
        .fl-m-stat-l { font-size: 9px; color: #555; font-weight: 600; }
        .fl-m-stat-v { font-size: 18px; font-weight: 800; font-family: 'Outfit'; margin-top: 2px; }
        .fl-m-item { padding: 6px 0; border-bottom: 1px solid #1a1a1a; display: flex; gap: 8px; align-items: center; font-size: 10px; }

        /* ANIMATIONS */
        @keyframes flFadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes flFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes flSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .fl-anim { opacity: 0; transform: translateY(30px); transition: opacity 0.6s ease, transform 0.6s ease; }
        .fl-vis { opacity: 1 !important; transform: translateY(0) !important; }

        /* RESPONSIVE */
        @media (max-width: 900px) {
          .fl-hero { flex-direction: column !important; padding: 120px 24px 60px !important; gap: 40px !important; }
          .fl-hero h1 { font-size: 42px !important; }
          .fl-feat-row, .fl-feat-row.fl-rev { flex-direction: column !important; gap: 40px !important; }
          .fl-title { font-size: 36px !important; }
          .fl-fgrid { grid-template-columns: 1fr !important; }
          .fl-aud-card { flex-direction: column !important; }
          .fl-aud-emoji { width: 100% !important; }
          .fl-footer { flex-direction: column !important; gap: 24px !important; text-align: center !important; }
          .fl-nav { padding: 12px 20px !important; }
          .fl-nav-links { gap: 16px !important; }
          .fl-price-feats { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="fl-land">
        {/* NAV */}
        <nav className="fl-nav">
          <div className="fl-nav-logo">
            <div className="fl-nav-icon">FL</div>
            FlipLedger
          </div>
          <div className="fl-nav-links">
            <a href="#fl-features">Features</a>
            <a href="#fl-pricing">Pricing</a>
            <button onClick={() => openAuth(false)}>Log In</button>
            <button className="fl-nav-cta" onClick={() => openAuth(true)}>Get Started</button>
          </div>
        </nav>

        {/* HERO */}
        <section className="fl-hero">
          <div className="fl-hero-content">
            <h1>Reprice, track & sell.<br/><span className="fl-gold">Effortlessly.</span></h1>
            <p>The all-in-one wealth intelligence platform for resellers. Reprice on StockX, cross-list to eBay, track inventory, scan receipts, and run CPA reports — all from one dashboard.</p>
            <button className="fl-hero-cta" onClick={() => openAuth(true)}>Start Your Free Trial</button>
          </div>
          <div className="fl-hero-img">
            <div className="fl-preview">
              <div className="fl-preview-bar">
                <div className="fl-dot fl-dot-r"></div><div className="fl-dot fl-dot-y"></div><div className="fl-dot fl-dot-g"></div>
                <div className="fl-ptabs">
                  <div className="fl-ptab fl-ptab-a">⚡ Repricer</div>
                  <div className="fl-ptab">🔄 Cross List</div>
                  <div className="fl-ptab">📋 Delist</div>
                </div>
              </div>
              <div className="fl-preview-body">
                <div className="fl-pstats">
                  <div className="fl-pstat"><div className="fl-pstat-l">TOTAL LISTINGS</div><div className="fl-pstat-v">1,615</div></div>
                  <div className="fl-pstat"><div className="fl-pstat-l">PRODUCTS</div><div className="fl-pstat-v">275</div></div>
                  <div className="fl-pstat"><div className="fl-pstat-l">NEED REPRICE</div><div className="fl-pstat-v" style={{color:'#C9A962'}}>28</div></div>
                </div>
                <table className="fl-ptable">
                  <thead><tr><th>SIZE</th><th>YOUR ASK</th><th>LOWEST</th><th>BID</th><th>SELL FAST</th><th>PROFIT</th></tr></thead>
                  <tbody>
                    <tr><td>8</td><td>$122</td><td className="fl-pgo">$81</td><td>$55</td><td className="fl-pg">$80</td><td className="fl-pr">~$42</td></tr>
                    <tr><td>8.5</td><td>$163</td><td className="fl-pgo">$163</td><td>$64</td><td className="fl-pg">$112</td><td className="fl-pr">~$80</td></tr>
                    <tr><td>9.5</td><td>$106</td><td className="fl-pgo">$106</td><td>$92</td><td className="fl-pg">$105</td><td className="fl-pr">~$28</td></tr>
                    <tr><td>10</td><td>$134</td><td className="fl-pg">$148</td><td>$88</td><td className="fl-pg">$130</td><td className="fl-pg">~$18</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* MEET */}
        <section id="fl-features" className="fl-section">
          <div className="fl-center fl-anim">
            <div className="fl-label">Wealth Intelligence</div>
            <div className="fl-title">Everything you need to flip smarter.</div>
            <p className="fl-desc">Stop juggling spreadsheets, StockX Pro, and eBay Seller Hub. FlipLedger brings it all together.</p>
          </div>
        </section>

        {/* FEATURE 1: REPRICER */}
        <section className="fl-feat" style={{padding:'100px 40px'}}>
          <div className="fl-feat-row fl-anim">
            <div className="fl-feat-text">
              <div className="fl-label">StockX Repricer</div>
              <h3>Beat the lowest ask. Automatically.</h3>
              <div className="fl-checks">
                <div className="fl-chk"><div className="fl-chk-i fl-chk-gold">✓</div><div><h4>One-click repricing</h4><p>Beat lowest, match lowest, sell fast, or match bid — select a strategy and apply it instantly.</p></div></div>
                <div className="fl-chk"><div className="fl-chk-i fl-chk-gold">✓</div><div><h4>Real-time market data</h4><p>See lowest ask, highest bid, and sell faster prices for every size — updated live from StockX.</p></div></div>
                <div className="fl-chk"><div className="fl-chk-i fl-chk-gold">✓</div><div><h4>Bulk price updates</h4><p>Select all listings that need repricing and save hundreds of changes at once. No more clicking one by one.</p></div></div>
              </div>
              <button className="fl-feat-cta" onClick={() => openAuth(true)}>Start Repricing</button>
            </div>
            <div className="fl-feat-vis">
              <div className="fl-mock">
                <div className="fl-mock-bar"><div className="fl-mock-d fl-dot-r"></div><div className="fl-mock-d fl-dot-y"></div><div className="fl-mock-d fl-dot-g"></div><span style={{fontSize:11,color:'#555',marginLeft:12}}>⚡ Repricer</span></div>
                <div className="fl-mock-body">
                  <div style={{display:'flex',gap:8,marginBottom:12}}>
                    <span className="fl-pill" style={{background:'rgba(201,169,98,0.15)',color:'#C9A962'}}>✓ Update Price ▾</span>
                    <span className="fl-pill" style={{background:'#0f0f0f',color:'#555'}}>Beat Lowest (-$1)</span>
                    <span className="fl-pill" style={{background:'rgba(16,185,129,0.12)',color:'#10b981'}}>Sell Fast</span>
                  </div>
                  <div className="fl-m-row" style={{fontSize:10,color:'#555',fontWeight:600}}><div style={{width:24}}>☑</div><div style={{width:40}}>SIZE</div><div style={{width:65}}>YOUR ASK</div><div style={{width:65}}>LOWEST</div><div style={{width:65}}>SELL FAST</div></div>
                  <div className="fl-m-row"><div style={{width:24,color:'#C9A962'}}>☑</div><div style={{width:40}}>7</div><div style={{width:65}}>$169</div><div style={{width:65,color:'#C9A962'}}>$170</div><div style={{width:65,color:'#10b981'}}>$169</div></div>
                  <div className="fl-m-row"><div style={{width:24,color:'#C9A962'}}>☑</div><div style={{width:40}}>8</div><div style={{width:65}}>$161</div><div style={{width:65,color:'#C9A962'}}>$162</div><div style={{width:65,color:'#10b981'}}>$161</div></div>
                  <div className="fl-m-row"><div style={{width:24,color:'#C9A962'}}>☑</div><div style={{width:40}}>9</div><div style={{width:65}}>$155</div><div style={{width:65,color:'#C9A962'}}>$149</div><div style={{width:65,color:'#10b981'}}>$148</div></div>
                  <div className="fl-m-row"><div style={{width:24,color:'#C9A962'}}>☑</div><div style={{width:40}}>10</div><div style={{width:65}}>$142</div><div style={{width:65,color:'#C9A962'}}>$138</div><div style={{width:65,color:'#10b981'}}>$137</div></div>
                  <div style={{marginTop:12,textAlign:'right'}}><span className="fl-pill" style={{background:'#10b981',color:'#fff'}}>💾 Save 132 Changes</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURE 2: CROSS LIST */}
        <section className="fl-feat" style={{padding:'100px 40px'}}>
          <div className="fl-feat-row fl-rev fl-anim">
            <div className="fl-feat-text">
              <div className="fl-label">Cross List & Auto-Delist</div>
              <h3>List everywhere. Sell anywhere.</h3>
              <div className="fl-checks">
                <div className="fl-chk"><div className="fl-chk-i fl-chk-green">✓</div><div><h4>StockX → eBay in seconds</h4><p>Pull your StockX inventory and list directly to eBay. Product data, images, and pricing carry over.</p></div></div>
                <div className="fl-chk"><div className="fl-chk-i fl-chk-green">✓</div><div><h4>Oversell prevention</h4><p>FlipLedger maps listings across platforms. When an item sells on StockX, the eBay listing is tracked so you never double-sell.</p></div></div>
                <div className="fl-chk"><div className="fl-chk-i fl-chk-green">✓</div><div><h4>Auto-delist sold items</h4><p>Sold on StockX? FlipLedger automatically delists the matching eBay listing. Runs 24/7 — even when you're asleep.</p></div></div>
              </div>
              <button className="fl-feat-cta" onClick={() => openAuth(true)}>Cross List Now</button>
            </div>
            <div className="fl-feat-vis">
              <div className="fl-mock">
                <div className="fl-mock-bar"><div className="fl-mock-d fl-dot-r"></div><div className="fl-mock-d fl-dot-y"></div><div className="fl-mock-d fl-dot-g"></div><span style={{fontSize:11,color:'#555',marginLeft:12}}>🔄 Cross List</span></div>
                <div className="fl-mock-body">
                  <div style={{display:'flex',gap:8,marginBottom:12}}>
                    <span className="fl-pill" style={{background:'rgba(16,185,129,0.12)',color:'#10b981'}}>StockX → eBay</span>
                    <span className="fl-pill" style={{background:'#0f0f0f',color:'#555'}}>275 products available</span>
                  </div>
                  <div className="fl-m-item"><div style={{width:20,height:20,background:'#0f0f0f',borderRadius:3}}></div><div style={{flex:1,fontWeight:600}}>Jordan 8 Retro White True Red</div><div style={{color:'#10b981',fontWeight:600}}>Listed ✓</div></div>
                  <div className="fl-m-item"><div style={{width:20,height:20,background:'#0f0f0f',borderRadius:3}}></div><div style={{flex:1,fontWeight:600}}>Nike Air Max 2017 Triple Black</div><div style={{color:'#10b981',fontWeight:600}}>Listed ✓</div></div>
                  <div className="fl-m-item"><div style={{width:20,height:20,background:'#0f0f0f',borderRadius:3}}></div><div style={{flex:1,fontWeight:600}}>Jordan 3 Retro Champagne</div><div style={{color:'#C9A962',fontWeight:600}}>Ready to list</div></div>
                  <div className="fl-m-item"><div style={{width:20,height:20,background:'#0f0f0f',borderRadius:3}}></div><div style={{flex:1,fontWeight:600}}>Nike Kobe 9 EM Low Protro</div><div style={{color:'#C9A962',fontWeight:600}}>Ready to list</div></div>
                  <div style={{marginTop:12,padding:8,background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:8,fontSize:10,color:'#10b981',textAlign:'center'}}>🤖 Auto-Delist: 14 items delisted this week</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURE 3: IMPORT */}
        <section className="fl-feat" style={{padding:'100px 40px'}}>
          <div className="fl-feat-row fl-anim">
            <div className="fl-feat-text">
              <div className="fl-label">Import & Sales Sync</div>
              <h3>Sales come to you. Automatically.</h3>
              <div className="fl-checks">
                <div className="fl-chk"><div className="fl-chk-i fl-chk-purple">✓</div><div><h4>StockX & eBay sales sync</h4><p>Your sales import directly from StockX and eBay. No manual entry, no CSV uploads, no forgotten transactions.</p></div></div>
                <div className="fl-chk"><div className="fl-chk-i fl-chk-purple">✓</div><div><h4>Auto-match cost basis</h4><p>FlipLedger matches each sale to your inventory so you know your exact cost and profit without lifting a finger.</p></div></div>
                <div className="fl-chk"><div className="fl-chk-i fl-chk-purple">✓</div><div><h4>Review & confirm</h4><p>Pending sales sit in your import queue until you review and confirm. Full control, zero guesswork.</p></div></div>
              </div>
              <button className="fl-feat-cta" onClick={() => openAuth(true)}>See It Work</button>
            </div>
            <div className="fl-feat-vis">
              <div className="fl-mock">
                <div className="fl-mock-bar"><div className="fl-mock-d fl-dot-r"></div><div className="fl-mock-d fl-dot-y"></div><div className="fl-mock-d fl-dot-g"></div><span style={{fontSize:11,color:'#555',marginLeft:12}}>📥 Import</span></div>
                <div className="fl-mock-body">
                  <div style={{display:'flex',gap:8,marginBottom:12}}>
                    <span className="fl-pill" style={{background:'rgba(139,92,246,0.12)',color:'#8B5CF6'}}>12 pending sales</span>
                    <span className="fl-pill" style={{background:'#0f0f0f',color:'#555'}}>Auto-Match ✨</span>
                  </div>
                  <div className="fl-m-item"><div style={{width:16,height:16,background:'#C9A962',borderRadius:3,fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#000',fontWeight:700}}>⏳</div><div style={{flex:1,fontWeight:600}}>Jordan 11 Retro Mojave — Size 9</div><div style={{fontWeight:600}}>$268</div></div>
                  <div className="fl-m-item"><div style={{width:16,height:16,background:'#C9A962',borderRadius:3,fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#000',fontWeight:700}}>⏳</div><div style={{flex:1,fontWeight:600}}>Nike Air Max 90 Black — Size 10.5</div><div style={{fontWeight:600}}>$142</div></div>
                  <div className="fl-m-item"><div style={{width:16,height:16,background:'#10b981',borderRadius:3,fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700}}>✓</div><div style={{flex:1,fontWeight:600}}>Jordan 1 Low OG Chicago — Size 8</div><div style={{color:'#10b981',fontWeight:600}}>Matched!</div></div>
                  <div className="fl-m-item"><div style={{width:16,height:16,background:'#10b981',borderRadius:3,fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700}}>✓</div><div style={{flex:1,fontWeight:600}}>Nike Kobe 9 EM Low — Size 11</div><div style={{color:'#10b981',fontWeight:600}}>Matched!</div></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURE 4: DASHBOARD + CPA */}
        <section className="fl-feat" style={{padding:'100px 40px'}}>
          <div className="fl-feat-row fl-rev fl-anim">
            <div className="fl-feat-text">
              <div className="fl-label">Dashboard & CPA Reports</div>
              <h3>Reports your CPA will love.</h3>
              <div className="fl-checks">
                <div className="fl-chk"><div className="fl-chk-i fl-chk-gold">✓</div><div><h4>Business dashboard</h4><p>Revenue, profit, expenses, and goals at a glance. Track your business health by month or year.</p></div></div>
                <div className="fl-chk"><div className="fl-chk-i fl-chk-gold">✓</div><div><h4>CPA-ready exports</h4><p>Export clean sales reports, cost of goods, and profit summaries — CSV or PDF — ready for tax season.</p></div></div>
                <div className="fl-chk"><div className="fl-chk-i fl-chk-gold">✓</div><div><h4>Expense & mileage tracking</h4><p>Track business expenses, storage fees, and mileage with IRS standard rates. Everything your CPA needs.</p></div></div>
              </div>
              <button className="fl-feat-cta" onClick={() => openAuth(true)}>See Your Numbers</button>
            </div>
            <div className="fl-feat-vis">
              <div className="fl-mock">
                <div className="fl-mock-bar"><div className="fl-mock-d fl-dot-r"></div><div className="fl-mock-d fl-dot-y"></div><div className="fl-mock-d fl-dot-g"></div><span style={{fontSize:11,color:'#555',marginLeft:12}}>📊 Dashboard</span></div>
                <div className="fl-mock-body" style={{textAlign:'center'}}>
                  <div style={{display:'flex',gap:10,marginBottom:10}}>
                    <div className="fl-m-stat"><div className="fl-m-stat-l">TOTAL REVENUE</div><div className="fl-m-stat-v" style={{color:'#10b981'}}>$48,293</div></div>
                    <div className="fl-m-stat"><div className="fl-m-stat-l">NET PROFIT</div><div className="fl-m-stat-v" style={{color:'#C9A962'}}>$12,847</div></div>
                  </div>
                  <div style={{display:'flex',gap:10}}>
                    <div className="fl-m-stat"><div className="fl-m-stat-l">ITEMS SOLD</div><div className="fl-m-stat-v">342</div></div>
                    <div className="fl-m-stat"><div className="fl-m-stat-l">AVG MARGIN</div><div className="fl-m-stat-v" style={{color:'#10b981'}}>26.6%</div></div>
                  </div>
                  <div style={{display:'flex',gap:10,marginTop:10}}>
                    <div className="fl-m-stat"><div className="fl-m-stat-l">EXPENSES</div><div className="fl-m-stat-v" style={{color:'#ef4444'}}>$2,140</div></div>
                    <div className="fl-m-stat"><div className="fl-m-stat-l">MILEAGE</div><div className="fl-m-stat-v" style={{color:'#8B5CF6'}}>1,247 mi</div></div>
                  </div>
                  <div style={{marginTop:14,padding:8,background:'#0f0f0f',borderRadius:8,fontSize:10,color:'#555',display:'flex',gap:8,justifyContent:'center'}}>
                    <span style={{padding:'4px 10px',background:'rgba(201,169,98,0.15)',borderRadius:4,color:'#C9A962',fontWeight:600}}>Export CSV</span>
                    <span style={{padding:'4px 10px',background:'#141414',borderRadius:4}}>Export PDF</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ALL FEATURES GRID */}
        <section className="fl-section" style={{paddingTop:60,background:'#060606'}}>
          <div className="fl-center fl-anim">
            <div className="fl-label">All features</div>
            <div className="fl-title">Built for the hustle.</div>
          </div>
          <div className="fl-fgrid fl-anim">
            <div className="fl-fcard"><div className="fl-fcard-icon">⬡</div><h4>Dashboard</h4><p>Revenue, profit, expenses, and goals at a glance. Track your business health by month or year.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">📦</div><h4>Inventory</h4><p>Track every item with cost basis, size, SKU, and platform. Know exactly what you own and what it's worth.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">💰</div><h4>Sales</h4><p>Full sales history synced from StockX and eBay with profit, fees, and payout for every transaction.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">🧾</div><h4>Expenses & Mileage</h4><p>Track business expenses, storage fees, and mileage with IRS standard rates. Everything for tax time.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">📊</div><h4>CPA Reports</h4><p>Export clean, tax-ready reports. Revenue, cost of goods, profit summaries — CSV or PDF.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">📥</div><h4>Import & Auto-Match</h4><p>Sales sync from StockX and eBay. Auto-match links each sale to your inventory for instant cost basis.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">⚡</div><h4>Repricer</h4><p>Beat lowest ask, match lowest, sell fast — reprice your entire StockX inventory in one click.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">🔄</div><h4>Cross List</h4><p>List your StockX inventory on eBay in seconds. Product data and images carry over automatically.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">🤖</div><h4>Auto-Delist</h4><p>Sold on StockX? eBay listing gets delisted automatically. Runs 24/7 so you never oversell.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">📸</div><h4>Receipt Scanning</h4><p>Snap a photo of your receipt. OCR extracts the data and matches it to your inventory.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">⚙</div><h4>Custom Fee Settings</h4><p>Set your StockX seller level, processing fees, eBay fees, and mileage rate for accurate profit calcs.</p></div>
            <div className="fl-fcard"><div className="fl-fcard-icon">☁️</div><h4>Cloud Sync</h4><p>Your data lives in the cloud. Access your inventory, sales, and reports from any device, anytime.</p></div>
          </div>
        </section>

        {/* BIG CTA */}
        <div className="fl-bigcta"><button className="fl-bigcta-btn" onClick={() => openAuth(true)}>Start Your Free Trial</button></div>

        {/* AUDIENCE */}
        <section className="fl-section" style={{background:'#0a0a0a'}}>
          <div className="fl-center fl-anim">
            <div className="fl-label">Built for everyone</div>
            <div className="fl-title">FlipLedger works for you.</div>
          </div>
          <div className="fl-aud-tabs fl-anim">
            {['👟 Sneaker resellers','📦 Bulk sellers','🆕 New sellers'].map((label, i) => (
              <button key={i} className={`fl-aud-tab ${audIdx === i ? 'fl-aud-tab-a' : ''}`} onClick={() => setAudIdx(i)}>{label}</button>
            ))}
          </div>
          <div className="fl-aud-card fl-anim">
            <div style={{flex:1}}>
              <h3>{audiences[audIdx].t}</h3>
              <p>{audiences[audIdx].d}</p>
            </div>
            <div className="fl-aud-emoji">{audiences[audIdx].e}</div>
          </div>
        </section>

        {/* PRICING */}
        <section id="fl-pricing" className="fl-section" style={{background:'#060606'}}>
          <div className="fl-center fl-anim">
            <div className="fl-label">Simple pricing</div>
            <div className="fl-title">One plan. Everything included.</div>
          </div>
          <div className="fl-price-card fl-anim">
            <div className="fl-price-name">FlipLedger</div>
            <div className="fl-price-sub">Everything. One price. No tiers.</div>
            <div><span className="fl-price-amt">$79</span><span className="fl-price-per">per month</span></div>
            <div className="fl-price-trial">7-day free trial — no credit card required</div>
            <div className="fl-price-divider"></div>
            <button className="fl-price-btn" onClick={() => openAuth(true)}>Start Your Free Trial</button>
            <div className="fl-price-feats">
              <div className="fl-price-feat">Unlimited inventory</div>
              <div className="fl-price-feat">StockX repricer</div>
              <div className="fl-price-feat">Bulk repricing</div>
              <div className="fl-price-feat">Cross-list to eBay</div>
              <div className="fl-price-feat">Auto-delist 24/7</div>
              <div className="fl-price-feat">Sales sync (StockX + eBay)</div>
              <div className="fl-price-feat">Auto-match cost basis</div>
              <div className="fl-price-feat">Receipt scanning (OCR)</div>
              <div className="fl-price-feat">CPA reports & exports</div>
              <div className="fl-price-feat">Expenses & mileage</div>
              <div className="fl-price-feat">Dashboard & analytics</div>
              <div className="fl-price-feat">Custom fee settings</div>
            </div>
            <div className="fl-price-value">
              💰 Replaces <span style={{color:'#C9A962',fontWeight:700}}>$150+/mo</span> in separate tools — repricing, cross-listing, inventory, and accounting in one platform.
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="fl-section" style={{textAlign:'center'}}>
          <div className="fl-title" style={{marginBottom:30}}>Ready to flip smarter?</div>
          <button className="fl-bigcta-btn" onClick={() => openAuth(true)}>Start Your Free Trial</button>
        </section>

        {/* FOOTER */}
        <footer className="fl-footer">
          <div className="fl-footer-logo"><div className="fl-nav-icon" style={{width:28,height:28,fontSize:12,borderRadius:8}}>FL</div>FlipLedger</div>
          <div className="fl-footer-links"><a href="#fl-features">Features</a><a href="#fl-pricing">Pricing</a><a href="#">Support</a><a href="#">Terms</a><a href="#">Privacy</a></div>
          <div style={{fontSize:12,color:'#555'}}>© 2026 FlipLedger. All rights reserved.</div>
        </footer>

        {/* AUTH MODAL */}
        {showAuth && (
          <div className="fl-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAuth(false); }}>
            <div className="fl-modal" style={{position:'relative'}}>
              <button className="fl-modal-close" onClick={() => setShowAuth(false)}>×</button>
              <div style={{textAlign:'center',marginBottom:32}}>
                <div style={{width:64,height:64,background:'linear-gradient(135deg,#C9A962,#B8943F)',borderRadius:16,display:'inline-flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:24,color:'#000',marginBottom:16}}>FL</div>
                <h2 style={{fontSize:24,fontWeight:700,color:'#C9A962',fontFamily:'Outfit'}}>FLIPLEDGER</h2>
                <p style={{color:'#555',fontSize:13,marginTop:4}}>{isSignUp ? 'Start your 7-day free trial' : 'Welcome back'}</p>
              </div>
              <form onSubmit={handleAuth}>
                <div style={{marginBottom:16}}>
                  <label style={{display:'block',marginBottom:8,fontSize:13,color:'#888'}}>Email</label>
                  <input className="fl-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
                </div>
                <div style={{marginBottom:24}}>
                  <label style={{display:'block',marginBottom:8,fontSize:13,color:'#888'}}>Password</label>
                  <input className="fl-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
                </div>
                {error && <div style={{padding:12,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:10,color:'#ef4444',fontSize:13,marginBottom:16}}>{error}</div>}
                <button type="submit" disabled={loading} className="fl-submit">
                  {loading ? 'Please wait...' : (isSignUp ? 'Start Free Trial' : 'Sign In')}
                </button>
              </form>
              <p style={{textAlign:'center',marginTop:24,color:'#555',fontSize:14}}>
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} style={{background:'none',border:'none',color:'#C9A962',cursor:'pointer',fontWeight:600,fontSize:14,fontFamily:'inherit'}}>
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
