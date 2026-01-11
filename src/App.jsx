import { useState, useEffect, Component } from 'react';
import * as XLSX from 'xlsx';

// Error Boundary for production stability
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('FlipLedger Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 40 }}>
          <h1 style={{ fontSize: 48, marginBottom: 16 }}>😵</h1>
          <h2 style={{ marginBottom: 16 }}>Something went wrong</h2>
          <p style={{ color: '#888', marginBottom: 24, textAlign: 'center', maxWidth: 400 }}>
            Don't worry - your data is safe in your browser. Try refreshing the page.
          </p>
          <button onClick={() => window.location.reload()} style={{ padding: '12px 32px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
            Refresh Page
          </button>
          <details style={{ marginTop: 24, color: '#666', fontSize: 12 }}>
            <summary style={{ cursor: 'pointer' }}>Error details</summary>
            <pre style={{ marginTop: 8, padding: 12, background: '#1a1a1a', borderRadius: 8, maxWidth: 500, overflow: 'auto' }}>
              {this.state.error?.toString()}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

// SalesPage as separate component for proper re-rendering
function SalesPage({ filteredSales, formData, setFormData, salesPage, setSalesPage, selectedSales, setSelectedSales, sales, setSales, settings, setModal, ITEMS_PER_PAGE, cardStyle, btnPrimary, c, fmt, exportCSV }) {
  // Filter
  const searchTerm = (formData.salesSearch || '').toLowerCase().trim();
  const platformFilter = formData.salesFilter || 'all';
  const monthFilter = formData.salesMonth || 'all';
  const sortBy = formData.salesSort || 'newest';
  
  const filtered = filteredSales.filter(s => {
    if (searchTerm) {
      const inName = s.name && s.name.toLowerCase().includes(searchTerm);
      const inSku = s.sku && s.sku.toLowerCase().includes(searchTerm);
      const inSize = s.size && s.size.toString().toLowerCase().includes(searchTerm);
      if (!inName && !inSku && !inSize) return false;
    }
    if (platformFilter !== 'all' && s.platform !== platformFilter) return false;
    if (monthFilter !== 'all' && (!s.saleDate || s.saleDate.substring(5, 7) !== monthFilter)) return false;
    return true;
  });
  
  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch(sortBy) {
      case 'oldest': return new Date(a.saleDate || 0) - new Date(b.saleDate || 0);
      case 'newest': return new Date(b.saleDate || 0) - new Date(a.saleDate || 0);
      case 'nameAZ': return (a.name || '').localeCompare(b.name || '');
      case 'nameZA': return (b.name || '').localeCompare(a.name || '');
      case 'skuAZ': return (a.sku || '').localeCompare(b.sku || '');
      case 'skuZA': return (b.sku || '').localeCompare(a.sku || '');
      case 'sizeAsc': return parseFloat(a.size || 0) - parseFloat(b.size || 0);
      case 'sizeDesc': return parseFloat(b.size || 0) - parseFloat(a.size || 0);
      case 'platformAZ': return (a.platform || '').localeCompare(b.platform || '');
      case 'costLow': return (a.cost || 0) - (b.cost || 0);
      case 'costHigh': return (b.cost || 0) - (a.cost || 0);
      case 'priceLow': return (a.salePrice || 0) - (b.salePrice || 0);
      case 'priceHigh': return (b.salePrice || 0) - (a.salePrice || 0);
      case 'feesLow': return (a.fees || 0) - (b.fees || 0);
      case 'feesHigh': return (b.fees || 0) - (a.fees || 0);
      case 'profitLow': return (a.profit || 0) - (b.profit || 0);
      case 'profitHigh': return (b.profit || 0) - (a.profit || 0);
      default: return new Date(b.saleDate || 0) - new Date(a.saleDate || 0);
    }
  });
  
  // Paginate
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const page = Math.min(salesPage, pages);
  const start = (page - 1) * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, total);
  const items = sorted.slice(start, end);
  const itemIds = items.map(s => s.id);
  const allSelected = items.length > 0 && itemIds.every(id => selectedSales.has(id));
  const profit = sorted.reduce((sum, s) => sum + (s.profit || 0), 0);

  return <div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
      <div style={{ ...cardStyle, padding: 16 }}><span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL SALES</span><p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: '#fff' }}>{total}</p></div>
      <div style={{ ...cardStyle, padding: 16 }}><span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL PROFIT</span><p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: profit >= 0 ? c.green : c.red }}>{fmt(profit)}</p></div>
    </div>

    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <input type="text" placeholder="🔍 Search by name, SKU, or size..." value={formData.salesSearch || ''} onChange={e => { setFormData({ ...formData, salesSearch: e.target.value }); setSalesPage(1); }} style={{ flex: 1, minWidth: 200, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14 }} />
      <select value={formData.salesMonth || 'all'} onChange={e => { setFormData({ ...formData, salesMonth: e.target.value }); setSalesPage(1); }} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13 }}>
        <option value="all">All Months</option><option value="01">January</option><option value="02">February</option><option value="03">March</option><option value="04">April</option><option value="05">May</option><option value="06">June</option><option value="07">July</option><option value="08">August</option><option value="09">September</option><option value="10">October</option><option value="11">November</option><option value="12">December</option>
      </select>
      <select value={formData.salesFilter || 'all'} onChange={e => { setFormData({ ...formData, salesFilter: e.target.value }); setSalesPage(1); }} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13 }}>
        <option value="all">All Platforms</option><option value="StockX Standard">StockX Standard</option><option value="StockX Direct">StockX Direct</option><option value="StockX Flex">StockX Flex</option><option value="GOAT">GOAT</option><option value="eBay">eBay</option><option value="Local">Local</option>
      </select>
      <button onClick={() => { setFormData({}); setModal('sale'); }} style={{ padding: '14px 24px', ...btnPrimary, fontSize: 13 }}>+ RECORD SALE</button>
    </div>

    <div style={{ marginBottom: 16, padding: '12px 20px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => {
          // Get fresh IDs directly from the items currently showing
          const freshIds = [];
          for (let i = 0; i < items.length; i++) {
            if (items[i] && items[i].id !== undefined && items[i].id !== null) {
              freshIds.push(items[i].id);
            }
          }
          console.log('Selecting', freshIds.length, 'items with IDs:', freshIds);
          // Use array instead of Set initially
          const selected = {};
          freshIds.forEach(id => { selected[id] = true; });
          // Convert to Set
          setSelectedSales(new Set(Object.keys(selected).map(k => isNaN(Number(k)) ? k : Number(k))));
        }} style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: c.green, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✓ Select Page ({items.length})</button>
        {selectedSales.size > 0 && <button onClick={() => setSelectedSales(new Set())} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}>✗ Clear</button>}
      </div>
      <span style={{ fontSize: 13, color: selectedSales.size > 0 ? c.green : c.textMuted, fontWeight: selectedSales.size > 0 ? 700 : 400 }}>{selectedSales.size > 0 ? `${selectedSales.size} selected` : 'None selected'}</span>
    </div>

    {selectedSales.size > 0 && <div style={{ marginBottom: 16, padding: '12px 20px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontWeight: 700, color: c.red, fontSize: 14 }}>🗑️ {selectedSales.size} sale{selectedSales.size > 1 ? 's' : ''} selected</span>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => setSelectedSales(new Set())} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}>Clear Selection</button>
        <button onClick={() => { if(confirm(`Delete ${selectedSales.size} sale${selectedSales.size > 1 ? 's' : ''}? This cannot be undone.`)) { setSales(sales.filter(s => !selectedSales.has(s.id))); setSelectedSales(new Set()); }}} style={{ padding: '8px 20px', background: c.red, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🗑️ Delete {selectedSales.size} Sale{selectedSales.size > 1 ? 's' : ''}</button>
      </div>
    </div>}

    <div style={cardStyle}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: c.textMuted }}>{total > 0 ? `Showing ${start + 1}-${end} of ${total}` : 'No sales'}</span>
        <button onClick={() => exportCSV(sorted, 'sales.csv', ['saleDate','name','sku','size','platform','salePrice','cost','fees','profit'])} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>📥 Export</button>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '40px 85px 1fr 110px 50px 100px 70px 70px 65px 75px 30px 30px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
        <div><input type="checkbox" checked={allSelected} onChange={e => setSelectedSales(e.target.checked ? new Set(itemIds) : new Set())} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.green }} /></div>
        <span onClick={() => { setFormData({ ...formData, salesSort: sortBy === 'oldest' ? 'newest' : 'oldest' }); setSalesPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: (sortBy === 'oldest' || sortBy === 'newest') ? c.green : c.textMuted, cursor: 'pointer' }}>DATE {sortBy === 'oldest' ? '▲' : sortBy === 'newest' ? '▼' : ''}</span>
        <span onClick={() => { setFormData({ ...formData, salesSort: sortBy === 'nameAZ' ? 'nameZA' : 'nameAZ' }); setSalesPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: (sortBy === 'nameAZ' || sortBy === 'nameZA') ? c.green : c.textMuted, cursor: 'pointer' }}>NAME {sortBy === 'nameAZ' ? '▲' : sortBy === 'nameZA' ? '▼' : ''}</span>
        <span onClick={() => { setFormData({ ...formData, salesSort: sortBy === 'skuAZ' ? 'skuZA' : 'skuAZ' }); setSalesPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: (sortBy === 'skuAZ' || sortBy === 'skuZA') ? c.green : c.textMuted, cursor: 'pointer' }}>SKU {sortBy === 'skuAZ' ? '▲' : sortBy === 'skuZA' ? '▼' : ''}</span>
        <span onClick={() => { setFormData({ ...formData, salesSort: sortBy === 'sizeAsc' ? 'sizeDesc' : 'sizeAsc' }); setSalesPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: (sortBy === 'sizeAsc' || sortBy === 'sizeDesc') ? c.green : c.textMuted, cursor: 'pointer' }}>SIZE {sortBy === 'sizeAsc' ? '▲' : sortBy === 'sizeDesc' ? '▼' : ''}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>PLATFORM</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>COST</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>PRICE</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>FEES</span>
        <span onClick={() => { setFormData({ ...formData, salesSort: sortBy === 'profitLow' ? 'profitHigh' : 'profitLow' }); setSalesPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: (sortBy === 'profitLow' || sortBy === 'profitHigh') ? c.green : c.textMuted, cursor: 'pointer', textAlign: 'right' }}>PROFIT {sortBy === 'profitLow' ? '▲' : sortBy === 'profitHigh' ? '▼' : ''}</span>
        <span></span><span></span>
      </div>

      {items.length > 0 ? items.map(s => (
        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '40px 85px 1fr 110px 50px 100px 70px 70px 65px 75px 30px 30px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', background: selectedSales.has(s.id) ? 'rgba(239,68,68,0.1)' : 'transparent' }}>
          <div><input type="checkbox" checked={selectedSales.has(s.id)} onChange={e => { const n = new Set(selectedSales); e.target.checked ? n.add(s.id) : n.delete(s.id); setSelectedSales(n); }} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.green }} /></div>
          <span style={{ fontSize: 12, color: c.textMuted }}>{s.saleDate}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
          <span style={{ fontSize: 11, color: c.green }}>{s.sku || '-'}</span>
          <span style={{ fontSize: 13 }}>{s.size || '-'}</span>
          <span style={{ fontSize: 11, color: c.textMuted }}>{s.platform}</span>
          <span style={{ fontSize: 12, textAlign: 'right', color: c.textMuted }}>{fmt(s.cost)}</span>
          <span style={{ fontSize: 12, textAlign: 'right' }}>{fmt(s.salePrice)}</span>
          <span style={{ fontSize: 12, textAlign: 'right', color: c.red }}>{fmt(s.fees)}</span>
          <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: s.profit >= 0 ? c.green : c.red }}>{s.profit >= 0 ? '+' : ''}{fmt(s.profit)}</span>
          <button onClick={() => { setFormData({ editSaleId: s.id, saleName: s.name, saleSku: s.sku, saleSize: s.size, saleCost: s.cost, salePrice: s.salePrice, saleDate: s.saleDate, platform: s.platform, sellerLevel: s.sellerLevel || settings.stockxLevel }); setModal('editSale'); }} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 14 }}>✏️</button>
          <button onClick={() => { setSales(sales.filter(x => x.id !== s.id)); setSelectedSales(prev => { const n = new Set(prev); n.delete(s.id); return n; }); }} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>💵</div><p style={{ color: c.textMuted }}>No sales</p></div>}
      
      {pages > 1 && <div style={{ padding: '16px 20px', borderTop: `1px solid ${c.border}`, display: 'flex', justifyContent: 'center', gap: 8 }}>
        <button onClick={() => setSalesPage(1)} disabled={page === 1} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === 1 ? c.textMuted : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>«</button>
        <button onClick={() => setSalesPage(page - 1)} disabled={page === 1} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === 1 ? c.textMuted : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>‹</button>
        {[...Array(Math.min(5, pages))].map((_, i) => { let n = pages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= pages - 2 ? pages - 4 + i : page - 2 + i; return <button key={n} onClick={() => setSalesPage(n)} style={{ padding: '8px 14px', background: page === n ? c.green : 'rgba(255,255,255,0.05)', border: `1px solid ${page === n ? c.green : c.border}`, borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: page === n ? 700 : 400 }}>{n}</button>; })}
        <button onClick={() => setSalesPage(page + 1)} disabled={page === pages} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === pages ? c.textMuted : '#fff', cursor: page === pages ? 'not-allowed' : 'pointer', fontSize: 12 }}>›</button>
        <button onClick={() => setSalesPage(pages)} disabled={page === pages} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === pages ? c.textMuted : '#fff', cursor: page === pages ? 'not-allowed' : 'pointer', fontSize: 12 }}>»</button>
      </div>}
    </div>
  </div>;
}

function App() {
  const [page, setPage] = useState('dashboard');
  const [modal, setModal] = useState(null);
  const [year, setYear] = useState('2025');
  const [stockxImport, setStockxImport] = useState({ show: false, data: [], year: 'all', month: 'all', headers: [] });
  const [ebayImport, setEbayImport] = useState({ show: false, data: [], year: 'all', month: 'all', headers: [] });
  const [purchases, setPurchases] = useState(() => {
    const saved = localStorage.getItem('flipledger_purchases');
    return saved ? JSON.parse(saved) : [];
  });
  const [sales, setSales] = useState(() => {
    const saved = localStorage.getItem('flipledger_sales');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    // FIX: Regenerate unique IDs if duplicates exist
    const ids = new Set();
    let hasDupes = false;
    parsed.forEach(s => {
      if (ids.has(s.id)) hasDupes = true;
      ids.add(s.id);
    });
    if (hasDupes) {
      console.log('Fixing duplicate IDs in sales...');
      return parsed.map((s, i) => ({ ...s, id: Date.now() + i }));
    }
    return parsed;
  });
  const [expenses, setExpenses] = useState(() => {
    const saved = localStorage.getItem('flipledger_expenses');
    return saved ? JSON.parse(saved) : [];
  });
  const [storageFees, setStorageFees] = useState(() => {
    const saved = localStorage.getItem('flipledger_storage');
    return saved ? JSON.parse(saved) : [];
  });
  const [mileage, setMileage] = useState(() => {
    const saved = localStorage.getItem('flipledger_mileage');
    return saved ? JSON.parse(saved) : [];
  });
  const [goals, setGoals] = useState(() => {
    const saved = localStorage.getItem('flipledger_goals');
    return saved ? JSON.parse(saved) : { monthly: 3000, yearly: 25000 };
  });
  const [formData, setFormData] = useState({});
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('flipledger_settings');
    return saved ? JSON.parse(saved) : { stockxLevel: 9, stockxProcessing: 3, stockxQuickShip: false, stockxDirectFee: 5, stockxDirectProcessing: 3, stockxFlexFee: 5, stockxFlexProcessing: 3, stockxFlexFulfillment: 5, goatFee: 9.5, goatProcessing: 2.9, ebayFee: 12.9, mileageRate: 0.67 };
  });
  const [stockxConnected, setStockxConnected] = useState(() => {
    return !!localStorage.getItem('flipledger_stockx_token');
  });
  const [stockxToken, setStockxToken] = useState(() => {
    return localStorage.getItem('flipledger_stockx_token') || null;
  });
  const [goatConnected, setGoatConnected] = useState(false);
  const [ebayConnected, setEbayConnected] = useState(() => {
    return !!localStorage.getItem('flipledger_ebay_token');
  });
  const [ebayToken, setEbayToken] = useState(() => {
    return localStorage.getItem('flipledger_ebay_token') || null;
  });
  const [qbConnected, setQbConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingCosts, setPendingCosts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('flipledger_pending')) || []; }
    catch { return []; }
  });
  const [selectedPending, setSelectedPending] = useState(new Set());
  const [bulkCost, setBulkCost] = useState('');
  const [selectedSales, setSelectedSales] = useState(new Set());
  const [selectedInventory, setSelectedInventory] = useState(new Set());
  const [salesPage, setSalesPage] = useState(1);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [invLookupSearch, setInvLookupSearch] = useState('');
  const [selectedPendingItem, setSelectedPendingItem] = useState(null);
  const [showInvCsvImport, setShowInvCsvImport] = useState(false);
  const [selectedInvLookup, setSelectedInvLookup] = useState(new Set());
  const ITEMS_PER_PAGE = 50;

  // Check for StockX token in URL on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('access_token');
    if (token) {
      localStorage.setItem('flipledger_stockx_token', token);
      setStockxToken(token);
      setStockxConnected(true);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Check for eBay OAuth callback on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ebayConnectedParam = params.get('ebay_connected');
    const ebayTokenParam = params.get('ebay_token');
    const ebayRefreshParam = params.get('ebay_refresh');
    const ebayError = params.get('ebay_error');
    
    if (ebayConnectedParam === 'true' && ebayTokenParam) {
      // Store tokens
      localStorage.setItem('flipledger_ebay_token', ebayTokenParam);
      localStorage.setItem('flipledger_ebay_refresh', ebayRefreshParam || '');
      setEbayToken(ebayTokenParam);
      setEbayConnected(true);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Navigate to settings to show success
      setPage('settings');
    } else if (ebayError) {
      console.error('eBay connection error:', ebayError);
      window.history.replaceState({}, document.title, window.location.pathname);
      alert('eBay connection failed: ' + ebayError);
    }
  }, []);

  // Safe localStorage save with error handling
  const safeSave = (key, data) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('localStorage save failed:', key, e);
      if (e.name === 'QuotaExceededError') {
        alert('Storage full! Please export your data and clear old records.');
      }
    }
  };

  useEffect(() => { safeSave('flipledger_purchases', purchases); }, [purchases]);
  useEffect(() => { safeSave('flipledger_sales', sales); }, [sales]);
  useEffect(() => { safeSave('flipledger_expenses', expenses); }, [expenses]);
  useEffect(() => { safeSave('flipledger_storage', storageFees); }, [storageFees]);
  useEffect(() => { safeSave('flipledger_mileage', mileage); }, [mileage]);
  useEffect(() => { safeSave('flipledger_goals', goals); }, [goals]);
  useEffect(() => { safeSave('flipledger_settings', settings); }, [settings]);
  useEffect(() => { safeSave('flipledger_pending', pendingCosts); }, [pendingCosts]);

  // Fetch StockX sales
  const fetchStockXSales = async () => {
    if (!stockxToken) return;
    setSyncing(true);
    try {
      const response = await fetch(`/api/stockx-sales?year=${year}`, {
        headers: {
          'Authorization': `Bearer ${stockxToken}`
        }
      });
      const data = await response.json();
      if (data.sales && data.sales.length > 0) {
        // Filter out duplicates - check pending (by id) AND confirmed sales (by orderId)
        const existingIds = new Set([
          ...pendingCosts.map(p => p.id),
          ...sales.map(s => s.orderId || s.id) // orderId is the original order number
        ]);
        
        const newSales = data.sales.filter(s => !existingIds.has(s.id));
        
        if (newSales.length > 0) {
          setPendingCosts(prev => [...prev, ...newSales]);
          if (data.sales.length - newSales.length > 0) {
            alert(`Synced ${newSales.length} NEW sales from ${year}! (${data.sales.length - newSales.length} already existed)`);
          } else {
            alert(`Synced ${newSales.length} sales from ${year}!`);
          }
        } else {
          alert(`All ${data.sales.length} sales from ${year} already imported - nothing new to add.`);
        }
      } else {
        alert(`No sales found on StockX for ${year}`);
      }
    } catch (error) {
      console.error('Failed to fetch StockX sales:', error);
      alert('Failed to sync StockX sales');
    }
    setSyncing(false);
  };

  // Disconnect StockX
  const disconnectStockX = () => {
    localStorage.removeItem('flipledger_stockx_token');
    setStockxToken(null);
    setStockxConnected(false);
  };

  const c = { 
    bg: '#0C0C0C', 
    card: '#141414', 
    cardHover: '#1A1A1A',
    border: 'rgba(255,255,255,0.06)', 
    gold: '#C9A962', 
    goldLight: '#E8D5A3',
    goldDark: '#8B7355',
    goldGlow: 'rgba(201,169,98,0.3)',
    green: '#34D399', 
    greenMuted: '#10B981',
    greenGlow: 'rgba(52,211,153,0.3)',
    red: '#F87171', 
    text: '#FFFFFF', 
    textMuted: 'rgba(255,255,255,0.5)',
    textDim: 'rgba(255,255,255,0.3)'
  };

  const filterByYear = (items, dateField = 'date') => year === 'all' ? items : items.filter(item => item[dateField]?.startsWith(year));
  const inventory = purchases.filter(p => !sales.find(s => s.purchaseId === p.id));
  const filteredInventory = purchases; // Inventory shows ALL items regardless of year
  const filteredSales = filterByYear(sales, 'saleDate');
  const filteredExpenses = filterByYear(expenses);
  const filteredMileage = filterByYear(mileage);
  const filteredStorage = filterByYear(storageFees, 'month');

  const calcFees = (price, platform) => {
    if (platform === 'StockX Standard') return price * ((settings.stockxLevel + settings.stockxProcessing + (settings.stockxQuickShip ? -2 : 0)) / 100);
    if (platform === 'StockX Direct') return price * ((settings.stockxDirectFee + settings.stockxDirectProcessing) / 100);
    if (platform === 'StockX Flex') return price * ((settings.stockxFlexFee + settings.stockxFlexProcessing) / 100) + settings.stockxFlexFulfillment;
    if (platform === 'GOAT') return price * ((settings.goatFee + settings.goatProcessing) / 100);
    if (platform === 'eBay') return price * (settings.ebayFee / 100);
    return 0;
  };

  const totalRevenue = filteredSales.reduce((s, x) => s + (x.salePrice || 0), 0);
  const totalCOGS = filteredSales.reduce((s, x) => s + (x.cost || 0), 0);
  const totalFees = filteredSales.reduce((s, x) => s + (x.fees || 0), 0);
  const totalExp = filteredExpenses.reduce((s, x) => s + (x.amount || 0), 0);
  const totalStor = filteredStorage.reduce((s, x) => s + (x.amount || 0), 0);
  const totalMiles = filteredMileage.reduce((s, x) => s + (x.miles || 0), 0);
  const totalMileageDeduction = totalMiles * settings.mileageRate;
  const totalDeductions = totalFees + totalExp + totalStor + totalMileageDeduction;
  const netProfit = totalRevenue - totalCOGS - totalDeductions;
  const inventoryVal = purchases.filter(p => !p.sold).reduce((s, x) => s + (x.cost || 0), 0);
  const grossProfit = totalRevenue - totalCOGS;
  const selfEmploymentTax = netProfit > 0 ? netProfit * 0.153 : 0;
  const federalTax = netProfit > 0 ? netProfit * 0.22 : 0;
  const stateTax = netProfit > 0 ? netProfit * 0.05 : 0;
  const totalTax = selfEmploymentTax + federalTax + stateTax;
  const fmt = n => (n < 0 ? '-$' + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits: 2}) : '$' + (n || 0).toLocaleString('en-US', {minimumFractionDigits: 2}));

  const expenseCategories = ['Shipping', 'Packaging & Supplies', 'Labels & Printing', 'Storage Unit', 'Software & Subscriptions', 'Authentication Fees', 'Office Supplies', 'Travel & Meals', 'Other'];

  const platformBreakdown = filteredSales.reduce((acc, s) => {
    const p = s.platform || 'Other';
    if (!acc[p]) acc[p] = { sales: 0, revenue: 0, fees: 0, profit: 0 };
    acc[p].sales++; acc[p].revenue += s.salePrice || 0; acc[p].fees += s.fees || 0; acc[p].profit += s.profit || 0;
    return acc;
  }, {});

  const expenseByCategory = filteredExpenses.reduce((acc, e) => {
    if (!acc[e.category]) acc[e.category] = 0;
    acc[e.category] += e.amount;
    return acc;
  }, {});

  const syncPlatform = async (platform) => {
    setSyncing(true);
    if (platform === 'StockX' && stockxToken) {
      await fetchStockXSales();
    } else {
      // Mock data for other platforms
      await new Promise(r => setTimeout(r, 2000));
      const mockSales = [
        { id: platform + '_' + Date.now(), name: 'Jordan 4 Retro Military Black', size: '10', salePrice: 340, fees: 37.40, saleDate: '2025-01-05', platform, payout: 302.60 },
        { id: platform + '_' + Date.now() + 1, name: 'Nike Dunk Low Panda', size: '9.5', salePrice: 115, fees: 12.65, saleDate: '2025-01-04', platform, payout: 102.35 },
      ];
      setPendingCosts(prev => [...prev, ...mockSales]);
    }
    setSyncing(false);
  };

  // Lookup product by SKU
  const lookupSku = async (sku) => {
    if (!sku || sku.length < 3) return null;
    try {
      const response = await fetch(`/api/stockx-lookup?sku=${encodeURIComponent(sku)}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('SKU lookup failed:', error);
    }
    return null;
  };

  const confirmSaleWithCost = (saleId, cost, channel = 'StockX Standard') => {
    const sale = pendingCosts.find(s => s.id === saleId);
    if (!sale || !cost) return;
    
    // CHECK: Don't add if this order already exists in sales
    const alreadyExists = sales.some(s => s.orderId === sale.id || s.id === sale.id);
    if (alreadyExists) {
      console.log('Sale already exists, skipping:', sale.id);
      setPendingCosts(prev => prev.filter(s => s.id !== saleId)); // Remove from pending anyway
      return;
    }
    
    const costNum = parseFloat(cost);
    const profit = sale.payout - costNum;
    const uniqueId = Date.now() + Math.random();
    setSales(prev => [...prev, { 
      ...sale, 
      id: uniqueId,
      orderId: sale.id, // KEEP original order number for deduplication!
      cost: costNum, 
      platform: sale.platform || channel, // USE the pending item's platform if it has one!
      fees: sale.fees || (sale.salePrice - sale.payout),
      profit: profit 
    }]);
    setPendingCosts(prev => prev.filter(s => s.id !== saleId));
  };

  const addPurchase = () => { if (!formData.name || !formData.cost) return; setPurchases([...purchases, { id: Date.now(), name: formData.name, sku: formData.sku || '', size: formData.size || '', cost: parseFloat(formData.cost), date: formData.date || new Date().toISOString().split('T')[0], image: formData.image || '' }]); setModal(null); setFormData({}); };
  const addSale = () => { if (!formData.saleName || !formData.salePrice || !formData.saleCost) return; const price = parseFloat(formData.salePrice); const cost = parseFloat(formData.saleCost); const fees = calcFees(price, formData.platform || 'StockX Standard'); setSales([...sales, { id: Date.now(), name: formData.saleName, sku: formData.saleSku || '', size: formData.saleSize || '', cost, salePrice: price, platform: formData.platform || 'StockX Standard', fees, profit: price - cost - fees, saleDate: formData.saleDate || new Date().toISOString().split('T')[0], image: formData.saleImage || '' }]); setModal(null); setFormData({}); };
  const addExpense = () => { if (!formData.amount) return; setExpenses([...expenses, { id: Date.now(), category: formData.category || 'Shipping', amount: parseFloat(formData.amount), description: formData.description || '', date: formData.date || new Date().toISOString().split('T')[0] }]); setModal(null); setFormData({}); };
  const addStorage = () => { if (!formData.amount) return; setStorageFees([...storageFees, { id: Date.now(), month: formData.month || '2025-01', amount: parseFloat(formData.amount), notes: formData.notes || '' }]); setModal(null); setFormData({}); };
  const addMileage = () => { if (!formData.miles) return; setMileage([...mileage, { id: Date.now(), date: formData.date || new Date().toISOString().split('T')[0], miles: parseFloat(formData.miles), purpose: formData.purpose || 'Pickup/Dropoff', from: formData.from || '', to: formData.to || '' }]); setModal(null); setFormData({}); };

  const exportCSV = (data, filename, headers) => {
    const csv = [headers.join(','), ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  };

  // Download inventory template CSV
  const downloadInventoryTemplate = () => {
    const template = 'Date,Name,SKU,Size,Cost\n1/15/2024,Jordan 4 Retro Example,AB1234-001,10,150\n';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flipledger-inventory-template.csv';
    a.click();
  };

  // Import inventory from CSV or XLSX
  const handleInventoryFileUpload = (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (isExcel) {
      // Handle Excel file
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          
          if (rows.length < 2) {
            alert('Excel file is empty or has no data rows');
            return;
          }
          
          // Parse headers (first row)
          const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
          
          // Find column indexes
          const dateIdx = headers.findIndex(h => h === 'date');
          const nameIdx = headers.findIndex(h => h === 'name');
          const skuIdx = headers.findIndex(h => h === 'sku');
          const sizeIdx = headers.findIndex(h => h === 'size');
          const costIdx = headers.findIndex(h => h === 'cost');
          
          const newItems = [];
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            // Excel dates might be numbers - convert them
            let rawDate = dateIdx >= 0 ? row[dateIdx] : '';
            if (typeof rawDate === 'number') {
              // Excel date serial number to JS date
              const excelDate = new Date((rawDate - 25569) * 86400 * 1000);
              rawDate = excelDate.toISOString().split('T')[0];
            }
            
            const name = nameIdx >= 0 ? String(row[nameIdx] || '') : '';
            const sku = skuIdx >= 0 ? String(row[skuIdx] || '') : '';
            const size = sizeIdx >= 0 ? String(row[sizeIdx] || '') : '';
            const cost = costIdx >= 0 ? parseFloat(row[costIdx]) || 0 : 0;
            
            if (name || sku) {
              newItems.push({
                id: Date.now() + Math.random() + i,
                date: parseDate(String(rawDate)) || new Date().toISOString().split('T')[0],
                name: name || 'Unknown Item',
                sku: sku,
                size: size,
                cost: cost
              });
            }
          }
          
          if (newItems.length > 0) {
            setPurchases(prev => [...prev, ...newItems]);
            alert(`Imported ${newItems.length} items to inventory!`);
          } else {
            alert('No items found. Make sure your Excel file has headers: Date, Name, SKU, Size, Cost');
          }
          
          setShowInvCsvImport(false);
        } catch (err) {
          console.error('Excel parse error:', err);
          alert('Error reading Excel file. Please check the format.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Handle CSV file
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n');
        
        // Parse header row
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        
        // Find column indexes
        const dateIdx = headers.findIndex(h => h === 'date');
        const nameIdx = headers.findIndex(h => h === 'name');
        const skuIdx = headers.findIndex(h => h === 'sku');
        const sizeIdx = headers.findIndex(h => h === 'size');
        const costIdx = headers.findIndex(h => h === 'cost');
        
        const newItems = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          // Parse CSV line (handle commas in quotes)
          const values = [];
          let current = '';
          let inQuotes = false;
          for (const char of lines[i]) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
            else current += char;
          }
          values.push(current.trim());
          
          // Extract values
          const rawDate = dateIdx >= 0 ? values[dateIdx]?.replace(/"/g, '') : '';
          const name = nameIdx >= 0 ? values[nameIdx]?.replace(/"/g, '') : '';
          const sku = skuIdx >= 0 ? values[skuIdx]?.replace(/"/g, '') : '';
          const size = sizeIdx >= 0 ? values[sizeIdx]?.replace(/"/g, '') : '';
          const cost = costIdx >= 0 ? parseFloat(values[costIdx]?.replace(/[$",]/g, '')) || 0 : 0;
          
          if (name || sku) {
            newItems.push({
              id: Date.now() + Math.random() + i,
              date: parseDate(rawDate) || new Date().toISOString().split('T')[0],
              name: name || 'Unknown Item',
              sku: sku || '',
              size: size || '',
              cost: cost
            });
          }
        }
        
        if (newItems.length > 0) {
          setPurchases(prev => [...prev, ...newItems]);
          alert(`Imported ${newItems.length} items to inventory!`);
        } else {
          alert('No items found. Make sure your CSV has headers: Date, Name, SKU, Size, Cost');
        }
        
        setShowInvCsvImport(false);
      };
      reader.readAsText(file);
    }
    
    if (e.target) e.target.value = ''; // Reset file input
  };

  // Parse date from various formats to YYYY-MM-DD
  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const str = dateStr.trim();
    
    // Already YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.substring(0, 10);
    }
    
    // MM/DD/YYYY or M/D/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
      const parts = str.split('/');
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2].substring(0, 4);
      return `${year}-${month}-${day}`;
    }
    
    // MM-DD-YYYY format
    if (/^\d{1,2}-\d{1,2}-\d{4}/.test(str)) {
      const parts = str.split('-');
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2].substring(0, 4);
      return `${year}-${month}-${day}`;
    }
    
    // Try to parse with Date object as fallback
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toISOString().substring(0, 10);
      }
    } catch {}
    
    return str.substring(0, 10);
  };

  // Helper to parse CSV line with quote handling
  const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/"/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/"/g, ''));
    return values;
  };

  // StockX CSV Import
  const handleStockxCsvUpload = (e) => {
    const file = e.target?.files?.[0] || e;
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').replace(/^\uFEFF/, ''));
      
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        
        const dateField = row['Sale Date'] || row['SaleDate'] || row['Date'] || '';
        if (dateField) {
          row['_parsedDate'] = parseDate(dateField);
          parsed.push(row);
        }
      }
      
      console.log('StockX CSV - Parsed rows:', parsed.length);
      setStockxImport({ show: true, data: parsed, headers, year: 'all', month: 'all' });
    };
    reader.readAsText(file);
  };

  // eBay CSV Import
  const handleEbayCsvUpload = (e) => {
    const file = e.target?.files?.[0] || e;
    if (!file) return;
    
    const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      
      // Detect which report type: Order Earnings Report or Transaction Report
      const isOrderEarningsReport = text.includes('Order earnings report') || text.includes('Order creation date,Order number');
      console.log('eBay CSV Type:', isOrderEarningsReport ? 'ORDER EARNINGS REPORT ✓' : 'Transaction Report');
      
      // Find header row
      let headerIndex = 0;
      for (let i = 0; i < Math.min(25, lines.length); i++) {
        if (isOrderEarningsReport && lines[i].includes('Order creation date')) {
          headerIndex = i;
          break;
        } else if (!isOrderEarningsReport && lines[i].includes('Transaction creation date')) {
          headerIndex = i;
          break;
        }
      }
      
      const headers = parseCSVLine(lines[headerIndex]).map(h => h.replace(/^\uFEFF/, ''));
      console.log('eBay CSV - Headers:', headers.slice(0, 8));
      
      const orders = [];
      const adFees = {}; // Only used for Transaction Report format
      
      for (let i = headerIndex + 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        
        if (isOrderEarningsReport) {
          // ORDER EARNINGS REPORT - has "Order earnings" column directly!
          const dateField = row['Order creation date'] || '';
          if (dateField && dateField !== '--') {
            const match = dateField.match(/(\w+)\s+(\d+),?\s+(\d{4})/);
            if (match) {
              row['_parsedDate'] = `${match[3]}-${months[match[1]] || '01'}-${match[2].padStart(2, '0')}`;
            }
            row['_reportType'] = 'orderEarnings';
            orders.push(row);
          }
        } else {
          // TRANSACTION REPORT - need to calculate from Net amount - ad fees
          if (row['Type'] === 'Order') {
            const ebayDate = row['Transaction creation date'] || '';
            if (ebayDate) {
              const match = ebayDate.match(/(\w+)\s+(\d+),?\s+(\d{4})/);
              if (match) {
                row['_parsedDate'] = `${match[3]}-${months[match[1]] || '01'}-${match[2].padStart(2, '0')}`;
              }
            }
            row['_reportType'] = 'transaction';
            orders.push(row);
          }
          
          // Capture Promoted Listing fees from fee rows
          const rowType = (row['Type'] || '').trim().toLowerCase();
          if (rowType === 'fee' || rowType === 'other fee') {
            const desc = (row['Description'] || '').toLowerCase();
            if (desc.includes('promoted')) {
              const orderNum = row['Order number'] || '';
              if (orderNum && orderNum !== '--') {
                const feeAmount = Math.abs(parseFloat((row['Net amount'] || '0').toString().replace(/[$,]/g, ''))) || 0;
                adFees[orderNum] = (adFees[orderNum] || 0) + feeAmount;
              }
            }
          }
        }
      }
      
      // For Transaction Report, attach ad fees to orders
      if (!isOrderEarningsReport) {
        orders.forEach(order => {
          const orderNum = order['Order number'] || '';
          order['_adFee'] = adFees[orderNum] || 0;
        });
        console.log('Transaction Report - Ad fees captured:', Object.keys(adFees).length);
      }
      
      console.log('eBay CSV - Parsed orders:', orders.length);
      if (orders.length > 0) {
        const sample = orders[0];
        if (isOrderEarningsReport) {
          console.log('Sample:', sample['Item title']?.substring(0, 30), '| Gross:', sample['Gross amount'], '| OrderEarnings:', sample['Order earnings']);
        } else {
          console.log('Sample:', sample['Item title']?.substring(0, 30), '| Gross:', sample['Gross transaction amount'], '| Net:', sample['Net amount'], '| AdFee:', sample['_adFee']);
        }
      }
      
      setEbayImport({ show: true, data: orders, headers, year: 'all', month: 'all' });
    };
    reader.readAsText(file);
  };

  // Drag and drop handlers
  const handleStockxDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleStockxCsvUpload({ target: { files: [file] } });
  };
  
  const handleEbayDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleEbayCsvUpload({ target: { files: [file] } });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Filter functions for each platform
  const filterStockxData = () => {
    const { data, year: filterYear, month: filterMonth } = stockxImport;
    return data.filter(row => {
      const parsedDate = row['_parsedDate'] || '';
      if (!parsedDate) return false;
      const rowYear = parsedDate.substring(0, 4);
      const rowMonth = parsedDate.substring(5, 7);
      if (filterYear !== 'all' && rowYear !== filterYear) return false;
      if (filterMonth !== 'all' && rowMonth !== filterMonth) return false;
      return true;
    });
  };

  const filterEbayData = () => {
    const { data, year: filterYear, month: filterMonth } = ebayImport;
    return data.filter(row => {
      const parsedDate = row['_parsedDate'] || '';
      if (!parsedDate) return false;
      const rowYear = parsedDate.substring(0, 4);
      const rowMonth = parsedDate.substring(5, 7);
      if (filterYear !== 'all' && rowYear !== filterYear) return false;
      if (filterMonth !== 'all' && rowMonth !== filterMonth) return false;
      return true;
    });
  };

  // Import StockX sales
  const importStockxSales = () => {
    const filtered = filterStockxData();
    const newPending = filtered.map(row => {
      const orderNum = row['Order Number'] || row['Order Id'] || row['Order #'] || '';
      const salePrice = parseFloat((row['Price'] || row['Sale Price'] || row['Order Total'] || '0').replace(/[$,]/g, '')) || 0;
      const payout = parseFloat((row['Final Payout Amount'] || row['Payout'] || row['Total Payout'] || '0').replace(/[$,]/g, '')) || 0;
      
      return {
        id: orderNum || Date.now() + Math.random(),
        name: row['Item'] || row['Product Name'] || 'Unknown Item',
        sku: row['Style'] || row['SKU'] || row['Style Code'] || '',
        size: String(row['Sku Size'] || row['Size'] || row['Product Size'] || ''),
        salePrice,
        payout,
        saleDate: row['_parsedDate'] || '',
        platform: 'StockX',
        source: 'csv'
      };
    });
    
    const existingIds = new Set([...pendingCosts.map(p => p.id), ...sales.map(s => s.orderId || s.id)]);
    const uniqueNew = newPending.filter(p => !existingIds.has(p.id));
    
    setPendingCosts([...pendingCosts, ...uniqueNew]);
    setStockxImport({ show: false, data: [], year: 'all', month: 'all', headers: [] });
    
    if (uniqueNew.length === 0) {
      alert(`All ${newPending.length} StockX sales already imported.`);
    } else {
      alert(`Imported ${uniqueNew.length} StockX sales!${newPending.length - uniqueNew.length > 0 ? ` (${newPending.length - uniqueNew.length} duplicates skipped)` : ''}`);
    }
  };

  // Import eBay sales
  const importEbaySales = () => {
    const filtered = filterEbayData();
    const parseAmount = (val) => parseFloat((val || '0').toString().replace(/[$,]/g, '')) || 0;
    
    const newPending = filtered.map(row => {
      const isOrderEarningsReport = row['_reportType'] === 'orderEarnings';
      
      let salePrice, payout, totalFees;
      
      if (isOrderEarningsReport) {
        // ORDER EARNINGS REPORT - use columns directly!
        salePrice = parseAmount(row['Gross amount']);
        payout = parseAmount(row['Order earnings']); // TRUE PAYOUT - already calculated by eBay!
        totalFees = Math.abs(parseAmount(row['Expenses']));
        
        console.log('Order Earnings Import:', row['Item title']?.substring(0, 25), '| Gross:', salePrice, '| OrderEarnings:', payout);
      } else {
        // TRANSACTION REPORT - calculate payout
        salePrice = parseAmount(row['Gross transaction amount']);
        const netAmount = parseAmount(row['Net amount']);
        const adFee = parseFloat(row['_adFee'] || 0);
        payout = netAmount - adFee; // Net minus ad fees
        
        const feeFixed = Math.abs(parseAmount(row['Final Value Fee - fixed']));
        const feeVariable = Math.abs(parseAmount(row['Final Value Fee - variable']));
        const regFee = Math.abs(parseAmount(row['Regulatory operating fee']));
        const intlFee = Math.abs(parseAmount(row['International fee']));
        totalFees = feeFixed + feeVariable + regFee + intlFee + adFee;
        
        console.log('Transaction Import:', row['Item title']?.substring(0, 25), '| Gross:', salePrice, '| Net:', netAmount, '| AdFee:', adFee, '| Payout:', payout);
      }
      
      return {
        id: 'ebay_' + (row['Order number'] || Date.now() + Math.random()),
        orderId: row['Order number'] || '',
        orderNumber: row['Order number'] || '',
        name: row['Item title'] || 'Unknown Item',
        sku: row['Custom label'] || '',
        size: '',
        salePrice: salePrice,  // SOLD
        payout: payout,        // TRUE PAYOUT
        fees: totalFees,
        saleDate: row['_parsedDate'] || '',
        platform: 'eBay',
        source: 'csv',
        buyer: row['Buyer name'] || row['Buyer username'] || ''
      };
    });
    
    // Build comprehensive set of existing IDs to prevent duplicates
    const existingIds = new Set();
    [...sales, ...pendingCosts].forEach(s => {
      if (s.id) existingIds.add(s.id);
      if (s.orderId) existingIds.add(s.orderId);
      if (s.orderNumber) existingIds.add(s.orderNumber);
      if (s.orderId) existingIds.add('ebay_' + s.orderId);
      if (s.orderNumber) existingIds.add('ebay_' + s.orderNumber);
    });
    
    const uniqueNew = newPending.filter(p => {
      if (existingIds.has(p.id)) return false;
      if (existingIds.has(p.orderId)) return false;
      if (existingIds.has(p.orderNumber)) return false;
      return true;
    });
    
    setPendingCosts([...pendingCosts, ...uniqueNew]);
    setEbayImport({ show: false, data: [], year: 'all', month: 'all', headers: [] });
    
    if (uniqueNew.length === 0) {
      alert(`All ${newPending.length} eBay sales already imported.`);
    } else {
      alert(`Imported ${uniqueNew.length} eBay sales!${newPending.length - uniqueNew.length > 0 ? ` (${newPending.length - uniqueNew.length} duplicates skipped)` : ''}`);
    }
  };

  const printTaxPackage = () => {
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>FlipLedger Tax Summary ${year}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      @page { size: letter; margin: 0.75in; }
      body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: #fff; padding: 40px; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      .header { margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #000; }
      .header p { margin: 4px 0; color: #444; }
      .section { margin-bottom: 25px; }
      .section h2 { font-size: 14px; font-weight: bold; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #ccc; }
      .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
      .row.total { border-top: 2px solid #000; border-bottom: none; font-weight: bold; font-size: 14px; margin-top: 8px; padding-top: 12px; }
      .label { color: #333; }
      .value { font-weight: 600; }
      .negative { color: #c00; }
      .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 10px; color: #666; }
    </style></head><body>
    
    <div class="header">
      <h1>Tax Summary</h1>
      <p><strong>Tax Year:</strong> ${year === 'all' ? 'All Time' : year}</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
      <p><strong>Total Transactions:</strong> ${filteredSales.length}</p>
    </div>

    <div class="section">
      <h2>Income</h2>
      <div class="row">
        <span class="label">Gross Sales Revenue</span>
        <span class="value">${fmt(totalRevenue)}</span>
      </div>
      <div class="row">
        <span class="label">Cost of Goods Sold</span>
        <span class="value negative">(${fmt(totalCOGS)})</span>
      </div>
      <div class="row total">
        <span class="label">Gross Profit</span>
        <span class="value">${fmt(totalRevenue - totalCOGS)}</span>
      </div>
    </div>

    <div class="section">
      <h2>Expenses</h2>
      <div class="row">
        <span class="label">Platform Selling Fees</span>
        <span class="value negative">(${fmt(totalFees)})</span>
      </div>
      <div class="row">
        <span class="label">Business Expenses</span>
        <span class="value negative">(${fmt(totalExp)})</span>
      </div>
      <div class="row total">
        <span class="label">Total Expenses</span>
        <span class="value negative">(${fmt(totalFees + totalExp)})</span>
      </div>
    </div>

    <div class="section">
      <h2>Net Income</h2>
      <div class="row total" style="font-size: 18px;">
        <span class="label">Net Profit (Schedule C, Line 31)</span>
        <span class="value" style="color: ${netProfit >= 0 ? '#000' : '#c00'}">${fmt(netProfit)}</span>
      </div>
    </div>

    <div class="footer">
      Generated by FlipLedger • For informational purposes only • Consult a licensed CPA for tax advice
    </div>

    </body></html>`);
    w.document.close();
    w.print();
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
    { id: 'inventory', label: 'Inventory', icon: '◫', count: purchases.filter(p => !p.sold).length },
    { id: 'sales', label: 'Sales', icon: '◈', count: filteredSales.length },
    { type: 'divider' },
    { id: 'expenses', label: 'Expenses', icon: '◧' },
    { id: 'reports', label: 'CPA Reports', icon: '📊' },
    { type: 'divider' },
    { id: 'import', label: 'Import', icon: '📥', badge: pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length || null },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  const inputStyle = { width: '100%', padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14, boxSizing: 'border-box', outline: 'none' };
  const cardStyle = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 20, overflow: 'hidden', transition: 'all 0.3s ease' };
  const btnPrimary = { background: `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)`, border: 'none', borderRadius: 10, color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: `0 4px 20px ${c.goldGlow}` };
  const btnSecondary = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: c.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: c.text, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 0% 0%, rgba(201,169,98,0.04) 0%, transparent 50%), radial-gradient(ellipse at 100% 100%, rgba(52,211,153,0.03) 0%, transparent 50%)` }} />

      <aside className="no-print" style={{ width: 240, minWidth: 240, background: '#0A0A0A', borderRight: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <div style={{ padding: 24, borderBottom: `1px solid ${c.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 44, height: 44, background: `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, color: '#000' }}>FL</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '1px', color: c.gold }}>FLIPLEDGER</div>
              <div style={{ fontSize: 10, color: c.textDim, letterSpacing: '2px', fontWeight: 500 }}>WEALTH INTELLIGENCE</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
          {navItems.map((item, i) => item.type === 'divider' ? <div key={i} style={{ height: 1, background: c.border, margin: '12px 8px' }} /> : (
            <button key={item.id} className="nav-item" onClick={() => setPage(item.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 16px', marginBottom: 4, border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: page === item.id ? `rgba(201,169,98,0.1)` : 'transparent', color: page === item.id ? c.gold : c.textMuted, transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 16, opacity: page === item.id ? 1 : 0.6 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.badge && <span style={{ background: c.red, padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{item.badge}</span>}
              {item.count !== undefined && <span style={{ background: c.gold, color: '#000', padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{item.count}</span>}
            </button>
          ))}
        </nav>

        <div style={{ padding: 16, borderTop: `1px solid ${c.border}` }}>
          <button className="btn-hover" onClick={() => { setFormData({}); setModal('purchase'); }} style={{ width: '100%', padding: 12, marginBottom: 8, background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Add Purchase</button>
          <button className="btn-hover" onClick={() => { setFormData({}); setModal('sale'); }} style={{ width: '100%', padding: 12, ...btnPrimary }}>+ Record Sale</button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: '32px 48px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${c.border}` }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '0.5px' }}>{navItems.find(n => n.id === page)?.label || 'Dashboard'}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 100, fontSize: 12, fontWeight: 500, color: c.textMuted }}>
              <div style={{ width: 8, height: 8, background: c.green, borderRadius: '50%', animation: 'pulse 3s ease-in-out infinite' }} />
              Connected
            </div>
            <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '10px 24px 10px 20px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 100, fontSize: 13, fontWeight: 600, color: c.text, cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
              {[2026,2025,2024,2023].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* DASHBOARD */}
        {page === 'dashboard' && (() => {
          // Live Pulse Component
          const LivePulse = ({ color = '#10b981', size = 8, speed = 2, label = null, style = {} }) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
              <div style={{ position: 'relative', width: size, height: size }}>
                <div className="pulse-ring" style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: color, opacity: 0.3 }} />
                <div className="pulse-glow" style={{ width: size, height: size, borderRadius: '50%', background: color, boxShadow: `0 0 ${size * 1.5}px ${color}` }} />
              </div>
              {label && <span style={{ fontSize: 11, fontWeight: 600, color, letterSpacing: '0.05em' }}>{label}</span>}
            </div>
          );

          // Status Indicator Component
          const StatusIndicator = ({ status = 'live', label = null }) => {
            const configs = { live: { color: '#10b981', label: label || 'LIVE' }, profit: { color: '#10b981', label: label || 'PROFIT' }, synced: { color: '#8b5cf6', label: label || 'SYNCED' } };
            const config = configs[status] || configs.live;
            return (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${config.color}15`, border: `1px solid ${config.color}30`, borderRadius: 100, padding: '6px 14px' }}>
                <LivePulse color={config.color} size={6} speed={2} />
                <span style={{ fontSize: 11, fontWeight: 700, color: config.color, letterSpacing: '0.08em' }}>{config.label}</span>
              </div>
            );
          };

          return <>
          {/* Pending costs alert */}
          {pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length > 0 && (
            <div className="pending-pulse" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 14, padding: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <LivePulse color="#fbbf24" size={10} speed={1.5} />
                <span style={{ color: c.gold, fontWeight: 600 }}>{pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length} sales need cost basis</span>
              </div>
              <button className="btn-hover" onClick={() => setPage('import')} style={{ padding: '8px 16px', background: c.gold, border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', color: '#000' }}>REVIEW</button>
            </div>
          )}

          {/* HERO PROFIT CARD - GAMIFIED */}
          <div className="hero-card" style={{
            background: c.card,
            border: `1px solid ${c.border}`,
            borderRadius: 24,
            padding: '48px 56px',
            marginBottom: 28,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Animated top border */}
            <div className="border-flow" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${c.gold}, ${c.green}, ${c.gold}, transparent)`, backgroundSize: '200% 100%' }} />
            
            {/* Breathing glow */}
            <div className="breathe" style={{ position: 'absolute', top: -100, right: -50, width: 400, height: 400, background: `radial-gradient(circle, rgba(201,169,98,0.15) 0%, transparent 60%)`, pointerEvents: 'none' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '1px', color: c.textDim, textTransform: 'uppercase' }}>Net Profit YTD</span>
                  <div className="live-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 100 }}>
                    <div className="pulse-glow" style={{ width: 8, height: 8, background: c.green, borderRadius: '50%', boxShadow: `0 0 12px ${c.green}` }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: c.green, letterSpacing: '1px' }}>LIVE</span>
                  </div>
                </div>
                
                <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, letterSpacing: '-2px', marginBottom: 16 }}>
                  <span style={{ color: c.gold, textShadow: `0 0 40px rgba(201,169,98,0.4)` }}>${netProfit < 0 ? '-' : ''}</span>
                  <span style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #34D399 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 30px rgba(52,211,153,0.4))' }}>{Math.abs(netProfit).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                
                <div style={{ fontSize: 14, color: c.textMuted }}>
                  <span style={{ color: c.green, fontWeight: 600 }}>↑ {filteredSales.length > 0 && totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0}%</span>
                  <span style={{ margin: '0 8px' }}>·</span>
                  {filteredSales.length} transactions
                </div>
              </div>

              {/* Animated Margin Ring */}
              <div style={{ position: 'relative', width: 180, height: 180 }}>
                {/* Spinning dashed ring */}
                <div className="spin-slow" style={{ position: 'absolute', top: -5, left: -5, right: -5, bottom: -5, border: '1px dashed rgba(201,169,98,0.3)', borderRadius: '50%' }} />
                
                <svg width="180" height="180" style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 20px rgba(201,169,98,0.3))` }}>
                  <circle cx="90" cy="90" r="70" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                  <circle className="ring-pulse" cx="90" cy="90" r="70" fill="none" stroke="url(#marginGradGameified)" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${totalRevenue > 0 ? Math.max(0, (netProfit / totalRevenue * 100)) * 4.4 : 0} 440`} />
                  <defs><linearGradient id="marginGradGameified" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={c.green} /><stop offset="100%" stopColor={c.gold} /></linearGradient></defs>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '2px', color: c.textDim, textTransform: 'uppercase', marginBottom: 4 }}>Margin</span>
                  <span style={{ fontSize: 42, fontWeight: 800, color: c.gold, textShadow: `0 0 30px rgba(201,169,98,0.4)` }}>{totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(0) : '0'}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* STATS ROW - GAMIFIED */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 28 }}>
            {[
              { label: 'Gross Revenue', value: totalRevenue, icon: '📈', color: c.gold, glow: 'rgba(201,169,98,0.3)', trend: filteredSales.length > 0 ? '+' + ((totalRevenue / (totalRevenue || 1)) * 18).toFixed(0) + '%' : '+0%' },
              { label: 'Cost of Goods', value: totalCOGS, icon: '💎', color: c.green, glow: 'rgba(52,211,153,0.3)', trend: '+12%' },
              { label: 'Platform Fees', value: totalFees, icon: '⚡', color: c.red, glow: 'rgba(248,113,113,0.3)', trend: '-3%' },
              { label: 'Inventory Value', value: inventoryVal, icon: '🏦', color: '#8B5CF6', glow: 'rgba(139,92,246,0.3)', trend: '+8%' },
            ].map((stat, i) => (
              <div key={i} className="stat-card-hover" style={{
                background: c.card,
                border: `1px solid ${c.border}`,
                borderRadius: 20,
                padding: '28px',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                cursor: 'pointer'
              }}>
                {/* Animated shimmer top line */}
                <div className="shimmer-line" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` }} />
                
                {/* Pulse dot */}
                <div className="pulse-glow" style={{ position: 'absolute', top: 20, right: 20, width: 8, height: 8, background: stat.color, borderRadius: '50%', boxShadow: `0 0 12px ${stat.color}`, animationDelay: `${i * 0.5}s` }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{stat.icon}</div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: stat.trend.startsWith('+') ? c.green : c.red, marginRight: 24 }}>{stat.trend}</span>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, color: c.textDim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</p>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: stat.color, textShadow: `0 0 20px ${stat.glow}` }}>{fmt(stat.value)}</p>
              </div>
            ))}
          </div>

          {/* TWO COLUMN - TABLE & CHART */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* MONTHLY TABLE */}
            <div style={{ ...cardStyle }}>
              <div style={{ padding: '24px 28px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Monthly Breakdown</h3>
                  <div className="pulse-glow" style={{ width: 6, height: 6, background: c.green, borderRadius: '50%', boxShadow: `0 0 10px ${c.green}` }} />
                </div>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 300 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ padding: '14px 24px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: c.textDim, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Month</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: c.textDim }}>Sales</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: c.textDim }}>Revenue</th>
                      <th style={{ padding: '14px 24px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: c.textDim }}>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => {
                      const monthNum = String(i + 1).padStart(2, '0');
                      const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                      if (monthSales.length === 0) return null;
                      const monthRevenue = monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
                      const monthProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
                      return (
                        <tr key={month} className="row-hover" style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <LivePulse color="#10b981" size={6} speed={2} />
                              <span style={{ fontWeight: 600, fontSize: 14 }}>{month}</span>
                            </div>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', fontSize: 14, color: c.textMuted }}>{monthSales.length}</td>
                          <td style={{ padding: '16px', textAlign: 'right', fontSize: 14 }}>{fmt(monthRevenue)}</td>
                          <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: c.green, background: 'rgba(16,185,129,0.1)', padding: '6px 12px', borderRadius: 6 }}>+{fmt(monthProfit)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'rgba(16,185,129,0.08)' }}>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <LivePulse color="#10b981" size={8} speed={1.5} />
                          <span style={{ fontWeight: 800, fontSize: 14 }}>TOTAL</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: 14, fontWeight: 700 }}>{filteredSales.length}</td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: 14, fontWeight: 700 }}>{fmt(totalRevenue)}</td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: c.green, textShadow: '0 0 20px rgba(16,185,129,0.4)' }}>+{fmt(netProfit)}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* CHART */}
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Performance Chart</h3>
                  <LivePulse color="#10b981" size={6} speed={2} />
                </div>
                <StatusIndicator status="live" label="REALTIME" />
              </div>
              <div style={{ padding: '24px' }}>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
                  {[{ label: 'Revenue', color: 'rgba(255,255,255,0.5)' }, { label: 'Profit', color: '#10b981' }].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color }} />
                      <span style={{ fontSize: 12, color: c.textMuted }}>{item.label}</span>
                      <LivePulse color={item.color} size={4} speed={2} />
                    </div>
                  ))}
                </div>

                {/* Chart Container */}
                <div style={{ position: 'relative', height: 200, display: 'flex', flexDirection: 'column' }}>
                  {/* Y-axis grid lines */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    {[100, 75, 50, 25, 0].map((pct, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                      </div>
                    ))}
                  </div>

                  {/* Bars */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, paddingBottom: 40 }}>
                    {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((month, i) => {
                      const monthNum = String(i + 1).padStart(2, '0');
                      const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                      const monthRevenue = monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
                      const monthProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
                      
                      // Calculate max value for scaling (use highest month value, minimum 1000)
                      const allMonthsRevenue = ['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => 
                        filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === m).reduce((sum, s) => sum + (s.salePrice || 0), 0)
                      );
                      const maxVal = Math.max(...allMonthsRevenue, 1000);
                      
                      // Scale to max 120px height
                      const revHeight = monthRevenue > 0 ? Math.max((monthRevenue / maxVal) * 120, 4) : 0;
                      const profitHeight = monthProfit > 0 ? Math.max((monthProfit / maxVal) * 120, 4) : 0;
                      const hasData = monthRevenue > 0;
                      
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                          {/* Bar group */}
                          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 120, width: '100%' }}>
                            {/* Revenue bar */}
                            <div style={{ 
                              width: hasData ? 14 : 8, 
                              height: hasData ? revHeight : 2,
                              background: hasData 
                                ? 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.15) 100%)' 
                                : 'rgba(255,255,255,0.05)',
                              borderRadius: hasData ? '4px 4px 0 0' : 2,
                              transition: 'all 0.5s ease'
                            }} />
                            {/* Profit bar */}
                            <div style={{ 
                              width: hasData ? 14 : 8, 
                              height: hasData ? profitHeight : 2,
                              background: hasData 
                                ? 'linear-gradient(180deg, #10b981 0%, rgba(16,185,129,0.4) 100%)' 
                                : 'rgba(16,185,129,0.08)',
                              borderRadius: hasData ? '4px 4px 0 0' : 2,
                              boxShadow: hasData ? '0 0 12px rgba(16,185,129,0.3)' : 'none',
                              transition: 'all 0.5s ease'
                            }} />
                          </div>
                          
                          {/* Month label */}
                          <div style={{ 
                            position: 'absolute', 
                            bottom: 0, 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            gap: 4 
                          }}>
                            <span style={{ 
                              fontSize: 11, 
                              fontWeight: 600, 
                              color: hasData ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'
                            }}>{month}</span>
                            {hasData && <LivePulse color="#10b981" size={4} speed={2.5} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>;
        })()}

        {/* INVENTORY */}
        {page === 'inventory' && (() => {
          const currentSort = formData.inventorySort || 'newest';
          
          // Filter inventory
          const filteredInventory = purchases.filter(p => {
            const search = (formData.inventorySearch || '').toLowerCase().trim();
            const filter = formData.inventoryFilter || 'all';
            
            let matchesSearch = true;
            if (search) {
              matchesSearch = p.name?.toLowerCase().includes(search) || 
                             p.sku?.toLowerCase().includes(search) || 
                             p.size?.toString().toLowerCase().includes(search);
            }
            
            const matchesFilter = filter === 'all' || (filter === 'instock' && !p.sold) || (filter === 'sold' && p.sold);
            return matchesSearch && matchesFilter;
          });
          
          // Sort inventory
          const sortedInventory = [...filteredInventory].sort((a, b) => {
            switch(currentSort) {
              case 'newest': return new Date(b.date) - new Date(a.date);
              case 'oldest': return new Date(a.date) - new Date(b.date);
              case 'costHigh': return (b.cost || 0) - (a.cost || 0);
              case 'costLow': return (a.cost || 0) - (b.cost || 0);
              case 'nameAZ': return (a.name || '').localeCompare(b.name || '');
              case 'nameZA': return (b.name || '').localeCompare(a.name || '');
              case 'skuAZ': return (a.sku || '').localeCompare(b.sku || '');
              case 'skuZA': return (b.sku || '').localeCompare(a.sku || '');
              case 'sizeAsc': return (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0);
              case 'sizeDesc': return (parseFloat(b.size) || 0) - (parseFloat(a.size) || 0);
              default: return 0;
            }
          });
          
          // Pagination
          const totalPages = Math.ceil(sortedInventory.length / ITEMS_PER_PAGE);
          const startIdx = (inventoryPage - 1) * ITEMS_PER_PAGE;
          const paginatedInventory = sortedInventory.slice(startIdx, startIdx + ITEMS_PER_PAGE);
          const allPageIds = paginatedInventory.map(p => p.id);
          const allSelected = paginatedInventory.length > 0 && allPageIds.every(id => selectedInventory.has(id));
          
          // Handlers
          const handleSort = (sortKey, sortKeyAlt) => {
            setInventoryPage(1); // Reset to page 1 when sorting
            if (currentSort === sortKey) {
              setFormData(prev => ({ ...prev, inventorySort: sortKeyAlt }));
            } else {
              setFormData(prev => ({ ...prev, inventorySort: sortKey }));
            }
          };
          
          const handleSelectAll = (checked) => {
            if (checked) {
              setSelectedInventory(new Set(allPageIds));
            } else {
              setSelectedInventory(new Set());
            }
          };
          
          const handleSelectOne = (id, checked) => {
            setSelectedInventory(prev => {
              const newSet = new Set(prev);
              if (checked) newSet.add(id);
              else newSet.delete(id);
              return newSet;
            });
          };
          
          const isActiveSort = (key1, key2) => currentSort === key1 || currentSort === key2;
          const getSortArrow = (key1) => currentSort === key1 ? '▲' : '▼';
          
          return <div>
          {/* STATS BAR */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL ITEMS</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: '#fff' }}>{purchases.length}</p>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>IN STOCK</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: c.green }}>{purchases.filter(p => !p.sold).length}</p>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>INVESTED</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: c.gold }}>{fmt(purchases.filter(p => !p.sold).reduce((s, x) => s + (x.cost || 0), 0))}</p>
            </div>
          </div>

          {/* SEARCH & ACTIONS */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="🔍 Search by name, SKU, or size..." 
              value={formData.inventorySearch || ''} 
              onChange={e => { setFormData(prev => ({ ...prev, inventorySearch: e.target.value })); setInventoryPage(1); }}
              style={{ flex: 1, minWidth: 200, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14 }} 
            />
            <select value={formData.inventoryFilter || 'all'} onChange={e => { setFormData(prev => ({ ...prev, inventoryFilter: e.target.value })); setInventoryPage(1); }} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All ({purchases.length})</option>
              <option value="instock">In Stock ({purchases.filter(p => !p.sold).length})</option>
              <option value="sold">Sold ({purchases.filter(p => p.sold).length})</option>
            </select>
            <button onClick={() => setShowInvCsvImport(true)} style={{ padding: '14px 20px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 12, color: c.gold, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>📥 IMPORT CSV</button>
            <button onClick={() => { setFormData(prev => ({ ...prev, bulkRows: [{ size: '', cost: '' }] })); setModal('bulkAdd'); }} style={{ padding: '14px 24px', ...btnPrimary, fontSize: 13 }}>+ BULK ADD</button>
            <button onClick={() => { setFormData({}); setModal('purchase'); }} style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ SINGLE</button>
          </div>

          {/* CSV IMPORT PANEL */}
          {showInvCsvImport && (
            <div style={{ marginBottom: 16, padding: 20, background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: c.gold }}>📥 Import Inventory CSV</h3>
                <button onClick={() => setShowInvCsvImport(false)} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 20 }}>×</button>
              </div>
              
              <p style={{ margin: '0 0 16px', fontSize: 13, color: c.textMuted }}>
                CSV or Excel file with columns: <strong style={{ color: '#fff' }}>Date, Name, SKU, Size, Cost</strong>
              </p>
              
              {/* Drag & Drop Zone */}
              <div 
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.background = 'rgba(251,191,36,0.1)'; }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                onDrop={(e) => { 
                  e.preventDefault(); 
                  e.currentTarget.style.borderColor = c.border; 
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  const file = e.dataTransfer.files[0];
                  if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                    handleInventoryFileUpload({ target: { files: [file] } });
                  } else {
                    alert('Please drop a CSV or Excel file');
                  }
                }}
                style={{ 
                  padding: 40, 
                  border: `2px dashed ${c.border}`, 
                  borderRadius: 12, 
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  marginBottom: 16,
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
                <p style={{ margin: 0, fontSize: 14, color: c.textMuted }}>
                  Drag & drop your CSV or Excel file here
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: c.textMuted }}>or</p>
                <label style={{ display: 'inline-block', marginTop: 12, padding: '10px 20px', ...btnPrimary, fontSize: 12, cursor: 'pointer' }}>
                  Browse Files
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleInventoryFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
              
              <button onClick={downloadInventoryTemplate} style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                📄 Download Template
              </button>
            </div>
          )}

          {/* SELECTION BAR */}
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => {
                const pageIds = paginatedInventory.map(p => p.id);
                setSelectedInventory(new Set(pageIds));
              }} style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: c.green, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✓ Select Page ({paginatedInventory.length})</button>
              {selectedInventory.size > 0 && <button onClick={() => setSelectedInventory(new Set())} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}>✗ Clear</button>}
            </div>
            <span style={{ fontSize: 13, color: selectedInventory.size > 0 ? c.green : c.textMuted, fontWeight: selectedInventory.size > 0 ? 700 : 400 }}>{selectedInventory.size > 0 ? `${selectedInventory.size} selected` : 'None selected'}</span>
          </div>

          {/* BULK DELETE BAR */}
          {selectedInventory.size > 0 && (
            <div style={{ marginBottom: 16, padding: '12px 20px', background: 'rgba(239,68,68,0.15)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: c.red, fontSize: 14 }}>
                🗑️ {selectedInventory.size} item{selectedInventory.size > 1 ? 's' : ''} selected
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setSelectedInventory(new Set())} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}>
                  Clear Selection
                </button>
                <button onClick={() => {
                  if (confirm(`Delete ${selectedInventory.size} item${selectedInventory.size > 1 ? 's' : ''}? This cannot be undone.`)) {
                    setPurchases(prev => prev.filter(p => !selectedInventory.has(p.id)));
                    setSelectedInventory(new Set());
                  }
                }} style={{ padding: '8px 20px', background: c.red, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  🗑️ Delete {selectedInventory.size} Item{selectedInventory.size > 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* INVENTORY TABLE */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: c.textMuted }}>Showing {startIdx + 1}-{Math.min(startIdx + ITEMS_PER_PAGE, sortedInventory.length)} of {sortedInventory.length} items</span>
              <button onClick={() => exportCSV(sortedInventory, 'inventory.csv', ['date','name','sku','size','cost','sold'])} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>📥 Export</button>
            </div>
            
            {/* TABLE HEADER - Clickable for sorting */}
            <div style={{ display: 'grid', gridTemplateColumns: '40px 90px 1fr 130px 60px 80px 70px 90px 60px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input type="checkbox" checked={allSelected} onChange={(e) => handleSelectAll(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.green }} />
              </div>
              <span onClick={() => handleSort('oldest', 'newest')} style={{ fontSize: 10, fontWeight: 700, color: isActiveSort('oldest', 'newest') ? c.green : c.textMuted, cursor: 'pointer', userSelect: 'none' }}>
                DATE {isActiveSort('oldest', 'newest') && getSortArrow('oldest')}
              </span>
              <span onClick={() => handleSort('nameAZ', 'nameZA')} style={{ fontSize: 10, fontWeight: 700, color: isActiveSort('nameAZ', 'nameZA') ? c.green : c.textMuted, cursor: 'pointer', userSelect: 'none' }}>
                NAME {isActiveSort('nameAZ', 'nameZA') && getSortArrow('nameAZ')}
              </span>
              <span onClick={() => handleSort('skuAZ', 'skuZA')} style={{ fontSize: 10, fontWeight: 700, color: isActiveSort('skuAZ', 'skuZA') ? c.green : c.textMuted, cursor: 'pointer', userSelect: 'none' }}>
                SKU {isActiveSort('skuAZ', 'skuZA') && getSortArrow('skuAZ')}
              </span>
              <span onClick={() => handleSort('sizeAsc', 'sizeDesc')} style={{ fontSize: 10, fontWeight: 700, color: isActiveSort('sizeAsc', 'sizeDesc') ? c.green : c.textMuted, cursor: 'pointer', userSelect: 'none' }}>
                SIZE {isActiveSort('sizeAsc', 'sizeDesc') && getSortArrow('sizeAsc')}
              </span>
              <span onClick={() => handleSort('costLow', 'costHigh')} style={{ fontSize: 10, fontWeight: 700, color: isActiveSort('costLow', 'costHigh') ? c.green : c.textMuted, cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}>
                COST {isActiveSort('costLow', 'costHigh') && getSortArrow('costLow')}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>DAYS</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>STATUS</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>ACTIONS</span>
            </div>

            {/* TABLE ROWS */}
            {paginatedInventory.length ? paginatedInventory.map(p => {
              const daysInStock = Math.floor((new Date() - new Date(p.date)) / (1000 * 60 * 60 * 24));
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '40px 90px 1fr 130px 60px 80px 70px 90px 60px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', background: selectedInventory.has(p.id) ? 'rgba(239,68,68,0.1)' : p.sold ? 'rgba(251,191,36,0.05)' : 'transparent' }}>
                  <div>
                    <input type="checkbox" checked={selectedInventory.has(p.id)} onChange={(e) => handleSelectOne(p.id, e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.green }} />
                  </div>
                  <span style={{ fontSize: 12, color: c.textMuted }}>{p.date}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: p.sold ? c.textMuted : '#fff' }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: c.green }}>{p.sku || '-'}</span>
                  <span style={{ fontSize: 13 }}>{p.size || '-'}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{fmt(p.cost)}</span>
                  <span style={{ fontSize: 12, textAlign: 'center', color: !p.sold && daysInStock > 60 ? c.red : !p.sold && daysInStock > 30 ? c.gold : c.textMuted }}>{p.sold ? '-' : daysInStock}</span>
                  <div style={{ textAlign: 'center' }}>
                    <button onClick={() => setPurchases(purchases.map(x => x.id === p.id ? { ...x, sold: !x.sold } : x))} style={{ padding: '4px 10px', background: p.sold ? 'rgba(251,191,36,0.2)' : 'rgba(16,185,129,0.1)', border: `1px solid ${p.sold ? 'rgba(251,191,36,0.3)' : 'rgba(16,185,129,0.2)'}`, borderRadius: 6, color: p.sold ? c.gold : c.green, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      {p.sold ? '🟡 SOLD' : 'IN STOCK'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button onClick={() => { setFormData({ editId: p.id, name: p.name, sku: p.sku, size: p.size, cost: p.cost, date: p.date }); setModal('editInventory'); }} style={{ background: 'none', border: 'none', color: c.green, cursor: 'pointer', fontSize: 14 }}>✏️</button>
                    <button onClick={() => { setPurchases(purchases.filter(x => x.id !== p.id)); setSelectedInventory(prev => { const n = new Set(prev); n.delete(p.id); return n; }); }} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                </div>
              );
            }) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>📦</div><p style={{ color: c.textMuted }}>No inventory matches your filters</p><button onClick={() => { setFormData(prev => ({ ...prev, bulkRows: [{ size: '', cost: '' }] })); setModal('bulkAdd'); }} style={{ marginTop: 12, padding: '10px 20px', ...btnPrimary, fontSize: 13 }}>+ Add Items</button></div>}
            
            {/* PAGINATION */}
            {totalPages > 1 && (
              <div style={{ padding: '16px 20px', borderTop: `1px solid ${c.border}`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setInventoryPage(1)} disabled={inventoryPage === 1} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: inventoryPage === 1 ? c.textMuted : '#fff', cursor: inventoryPage === 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>«</button>
                <button onClick={() => setInventoryPage(p => Math.max(1, p - 1))} disabled={inventoryPage === 1} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: inventoryPage === 1 ? c.textMuted : '#fff', cursor: inventoryPage === 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>‹</button>
                
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (inventoryPage <= 3) pageNum = i + 1;
                  else if (inventoryPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = inventoryPage - 2 + i;
                  return (
                    <button key={pageNum} onClick={() => setInventoryPage(pageNum)} style={{ padding: '8px 14px', background: inventoryPage === pageNum ? c.green : 'rgba(255,255,255,0.05)', border: `1px solid ${inventoryPage === pageNum ? c.green : c.border}`, borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: inventoryPage === pageNum ? 700 : 400 }}>{pageNum}</button>
                  );
                })}
                
                <button onClick={() => setInventoryPage(p => Math.min(totalPages, p + 1))} disabled={inventoryPage === totalPages} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: inventoryPage === totalPages ? c.textMuted : '#fff', cursor: inventoryPage === totalPages ? 'not-allowed' : 'pointer', fontSize: 12 }}>›</button>
                <button onClick={() => setInventoryPage(totalPages)} disabled={inventoryPage === totalPages} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: inventoryPage === totalPages ? c.textMuted : '#fff', cursor: inventoryPage === totalPages ? 'not-allowed' : 'pointer', fontSize: 12 }}>»</button>
              </div>
            )}
          </div>
        </div>;
        })()}

        {/* SALES */}
        {page === 'sales' && <SalesPage 
          key={`sales-${salesPage}-${formData.salesSort}-${formData.salesMonth}-${formData.salesFilter}`}
          filteredSales={filteredSales}
          formData={formData}
          setFormData={setFormData}
          salesPage={salesPage}
          setSalesPage={setSalesPage}
          selectedSales={selectedSales}
          setSelectedSales={setSelectedSales}
          sales={sales}
          setSales={setSales}
          settings={settings}
          setModal={setModal}
          ITEMS_PER_PAGE={ITEMS_PER_PAGE}
          cardStyle={cardStyle}
          btnPrimary={btnPrimary}
          c={c}
          fmt={fmt}
          exportCSV={exportCSV}
        />}

        {/* EXPENSES */}
        {page === 'expenses' && <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Total: <span style={{ color: c.red, fontWeight: 700 }}>{fmt(totalExp)}</span></span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => exportCSV(filteredExpenses, 'expenses.csv', ['date','category','description','amount'])} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: '#fff', fontSize: 11, cursor: 'pointer' }}>📥 Export</button>
              <button onClick={() => { setFormData({}); setModal('expense'); }} style={{ padding: '8px 16px', ...btnPrimary, fontSize: 12 }}>+ Add Expense</button>
            </div>
          </div>
          {filteredExpenses.length ? filteredExpenses.map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: `1px solid ${c.border}` }}>
              <div>
                <div style={{ fontWeight: 600 }}>{e.category}</div>
                <div style={{ fontSize: 12, color: c.textMuted }}>{e.date} • {e.description || '-'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: c.red, fontWeight: 700 }}>{fmt(e.amount)}</span>
                <button onClick={() => setExpenses(expenses.filter(x => x.id !== e.id))} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
            </div>
          )) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>💳</div><p style={{ color: c.textMuted }}>No expenses</p></div>}
        </div>}

        {/* MILEAGE */}
        {/* CPA REPORTS */}
        {page === 'reports' && <div style={{ maxWidth: 900 }}>
          {/* PRINT BUTTON */}
          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-hover" onClick={printTaxPackage} style={{ padding: '12px 24px', ...btnPrimary, fontSize: 13 }}>🖨️ Print Tax Summary</button>
          </div>
          
          {/* PRINTABLE REPORT - Single clean page */}
          <div className="print-report" style={{ ...cardStyle, padding: 32 }}>
            {/* HEADER */}
            <div style={{ textAlign: 'center', marginBottom: 32, paddingBottom: 20, borderBottom: '2px solid #333' }}>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>TAX SUMMARY</h1>
              <p style={{ margin: '8px 0 0', fontSize: 14, color: c.textMuted }}>Tax Year {year} • Generated {new Date().toLocaleDateString()}</p>
            </div>
            
            {/* INCOME SECTION */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: c.textMuted, letterSpacing: '0.15em', borderBottom: `1px solid ${c.border}`, paddingBottom: 8 }}>INCOME</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span>Gross Sales (Revenue)</span>
                <span style={{ fontWeight: 600 }}>{fmt(totalRevenue)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span>Cost of Goods Sold (COGS)</span>
                <span style={{ fontWeight: 600 }}>({fmt(totalCOGS)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span>Platform Fees</span>
                <span style={{ fontWeight: 600 }}>({fmt(totalFees)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', marginTop: 8, borderTop: `1px solid ${c.border}` }}>
                <span style={{ fontWeight: 700 }}>Net Sales Income</span>
                <span style={{ fontWeight: 800, fontSize: 16 }}>{fmt(totalRevenue - totalCOGS - totalFees)}</span>
              </div>
            </div>
            
            {/* DEDUCTIONS SECTION */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: c.textMuted, letterSpacing: '0.15em', borderBottom: `1px solid ${c.border}`, paddingBottom: 8 }}>DEDUCTIONS</h3>
              
              {/* Expense Categories */}
              {(() => {
                const categories = {};
                filteredExpenses.forEach(e => {
                  categories[e.category] = (categories[e.category] || 0) + (e.amount || 0);
                });
                const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
                if (sorted.length === 0) {
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                      <span>Business Expenses</span>
                      <span style={{ fontWeight: 600 }}>$0.00</span>
                    </div>
                  );
                }
                return sorted.map(([cat, amt]) => (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span>{cat}</span>
                    <span style={{ fontWeight: 600 }}>({fmt(amt)})</span>
                  </div>
                ));
              })()}
              
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', marginTop: 8, borderTop: `1px solid ${c.border}` }}>
                <span style={{ fontWeight: 700 }}>Total Deductions</span>
                <span style={{ fontWeight: 800, fontSize: 16 }}>({fmt(totalExp)})</span>
              </div>
            </div>
            
            {/* NET PROFIT - THE BIG NUMBER */}
            <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: 20, marginTop: 24, border: `2px solid ${c.green}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>NET PROFIT (Schedule C, Line 31)</span>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: c.textMuted }}>Gross Sales − COGS − Fees − Expenses</p>
                </div>
                <span style={{ fontSize: 32, fontWeight: 800, color: (totalRevenue - totalCOGS - totalFees - totalExp) >= 0 ? c.green : c.red }}>
                  {fmt(totalRevenue - totalCOGS - totalFees - totalExp)}
                </span>
              </div>
            </div>
            
            {/* FOOTER */}
            <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${c.border}`, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 11, color: c.textMuted }}>Generated by FlipLedger • {filteredSales.length} sales recorded</p>
            </div>
          </div>
          
          {/* MONTHLY BREAKDOWN - Screen only */}
          <div className="card-hover no-print" style={{ ...cardStyle, marginTop: 20, marginBottom: 20 }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, fontStyle: 'italic' }}>📅 MONTHLY BREAKDOWN</h3>
              <button className="btn-hover" onClick={() => {
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const rows = months.map((month, i) => {
                  const monthNum = String(i + 1).padStart(2, '0');
                  const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                  const revenue = monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
                  const cogs = monthSales.reduce((sum, s) => sum + (s.cost || 0), 0);
                  const fees = monthSales.reduce((sum, s) => sum + (s.fees || 0), 0);
                  const profit = revenue - cogs - fees;
                  return { month, sales: monthSales.length, revenue, cogs, fees, profit };
                }).filter(r => r.revenue > 0);
                rows.push({ month: 'TOTAL', sales: filteredSales.length, revenue: totalRevenue, cogs: totalCOGS, fees: totalFees, profit: totalRevenue - totalCOGS - totalFees });
                exportCSV(rows, 'monthly-breakdown.csv', ['month', 'sales', 'revenue', 'cogs', 'fees', 'profit']);
              }} style={{ padding: '8px 16px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📥 Export CSV</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: c.textMuted }}>MONTH</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>SALES</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>REVENUE</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>COGS</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>FEES</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>PROFIT</th>
                  </tr>
                </thead>
                <tbody>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => {
                    const monthNum = String(i + 1).padStart(2, '0');
                    const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                    const monthRevenue = monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
                    const monthCOGS = monthSales.reduce((sum, s) => sum + (s.cost || 0), 0);
                    const monthFees = monthSales.reduce((sum, s) => sum + (s.fees || 0), 0);
                    const monthProfit = monthRevenue - monthCOGS - monthFees;
                    if (monthRevenue === 0) return null;
                    return (
                      <tr key={month} className="row-hover" style={{ borderBottom: `1px solid ${c.border}`, cursor: 'pointer' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>{month}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>{monthSales.length}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>{fmt(monthRevenue)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: c.gold }}>{fmt(monthCOGS)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: c.red }}>{fmt(monthFees)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: monthProfit >= 0 ? c.green : c.red }}>{fmt(monthProfit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(16,185,129,0.1)' }}>
                    <td style={{ padding: '16px', fontWeight: 800, fontStyle: 'italic' }}>YEARLY TOTAL</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700 }}>{filteredSales.length}</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700 }}>{fmt(totalRevenue)}</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: c.gold }}>{fmt(totalCOGS)}</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: c.red }}>{fmt(totalFees)}</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: (totalRevenue - totalCOGS - totalFees) >= 0 ? c.green : c.red }}>{fmt(totalRevenue - totalCOGS - totalFees)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          
          {/* EXPORT SECTION - Screen only */}
          <div className="card-hover no-print" style={{ ...cardStyle, padding: 24 }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, fontStyle: 'italic' }}>📎 EXPORT DETAIL REPORTS</h4>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: c.textMuted }}>Download detailed data if your CPA needs backup documentation</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <button className="btn-hover" onClick={() => exportCSV(filteredSales, 'sales-detail.csv', ['saleDate','name','sku','size','platform','salePrice','cost','fees','profit'])} style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>💰</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Sales Detail</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{filteredSales.length} transactions</div>
              </button>
              <button className="btn-hover" onClick={() => exportCSV(filteredExpenses, 'expenses-detail.csv', ['date','category','description','amount'])} style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🧾</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Expenses Detail</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{filteredExpenses.length} expenses</div>
              </button>
              <button className="btn-hover" onClick={() => exportCSV(inventory, 'inventory.csv', ['date','name','sku','size','cost'])} style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📦</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Inventory</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{inventory.length} items • {fmt(inventory.reduce((s, x) => s + (x.cost || 0), 0))}</div>
              </button>
            </div>
          </div>
        </div>}

        {/* IMPORT */}
        {page === 'import' && <div style={{ maxWidth: 1100 }}>
          {/* SPLIT SCREEN LAYOUT - Always visible */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
            {/* LEFT SIDE - Main Content */}
            <div>
          {(stockxConnected || goatConnected || ebayConnected) && (
            <div style={{ ...cardStyle, padding: 20, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🔄 Sync All Platforms</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Pull latest sales from connected platforms</p>
              </div>
              <button onClick={() => { if (stockxConnected) syncPlatform('StockX'); if (goatConnected) syncPlatform('GOAT'); if (ebayConnected) syncPlatform('eBay'); }} disabled={syncing} style={{ padding: '12px 24px', ...btnPrimary, opacity: syncing ? 0.6 : 1 }}>
                {syncing ? <><span className="spin-icon">🔄</span> Syncing...</> : '🔄 Sync Now'}
              </button>
            </div>
          )}

          {pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {/* Header */}
              <div style={{ padding: '16px 20px', background: 'rgba(251,191,36,0.1)', border: `1px solid rgba(251,191,36,0.2)`, borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: c.gold }}>⚡ Bulk Cost Entry</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Enter costs manually or lookup from your inventory</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select 
                    defaultValue="date"
                    onChange={(e) => {
                      const sortBy = e.target.value;
                      setPendingCosts(prev => {
                        const sorted = [...prev];
                        if (sortBy === 'item') sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                        if (sortBy === 'sku') sorted.sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));
                        if (sortBy === 'date') sorted.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
                        if (sortBy === 'price') sorted.sort((a, b) => (b.salePrice || 0) - (a.salePrice || 0));
                        return sorted;
                      });
                    }}
                    style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12, cursor: 'pointer' }}
                  >
                    <option value="date">Sort: Date</option>
                    <option value="item">Sort: Item Name</option>
                    <option value="sku">Sort: SKU</option>
                    <option value="price">Sort: Price</option>
                  </select>
                  <button onClick={() => { 
                    if (confirm(`Delete all pending sales?`)) {
                      setPendingCosts([]);
                      setSelectedPending(new Set());
                    }
                  }} style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 10, color: c.red, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    🗑️ Clear All
                  </button>
                </div>
              </div>

              {/* Multi-Select Action Bar */}
              {selectedPending.size > 0 && (
                <div style={{ padding: '12px 20px', background: 'rgba(16,185,129,0.15)', borderLeft: `1px solid ${c.border}`, borderRight: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontWeight: 700, color: c.green, fontSize: 14 }}>
                    {selectedPending.size} selected
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ fontSize: 13, color: c.textMuted }}>Cost each:</span>
                    <input 
                      type="number" 
                      placeholder="$0.00"
                      value={bulkCost}
                      onChange={e => setBulkCost(e.target.value)}
                      style={{ width: 100, padding: '10px 14px', background: 'rgba(255,255,255,0.1)', border: `2px solid ${c.green}`, borderRadius: 8, color: c.text, fontSize: 15, fontWeight: 600, textAlign: 'center' }} 
                    />
                    <button 
                      onClick={() => {
                        if (!bulkCost) { alert('Enter a cost first'); return; }
                        selectedPending.forEach(id => confirmSaleWithCost(id, bulkCost, 'StockX Standard'));
                        setSelectedPending(new Set());
                        setBulkCost('');
                      }}
                      style={{ padding: '10px 20px', ...btnPrimary, fontSize: 13 }}
                    >
                      ✓ Apply to {selectedPending.size} Items
                    </button>
                  </div>
                  <button onClick={() => setSelectedPending(new Set())} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}>
                    Clear Selection
                  </button>
                </div>
              )}

              {/* Pending Sales Table */}
              <div style={{ border: `1px solid ${c.border}`, borderTop: selectedPending.size > 0 ? 'none' : `1px solid ${c.border}`, borderRadius: '0 0 12px 12px', overflow: 'hidden', background: c.card }}>
                <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                  {/* Table Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 50px 70px 70px 80px 30px', padding: '10px 12px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', position: 'sticky', top: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <input 
                        type="checkbox"
                        checked={selectedPending.size === pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length && selectedPending.size > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                              const allIds = pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).map(s => s.id);
                              setSelectedPending(new Set(allIds));
                            } else {
                              setSelectedPending(new Set());
                            }
                          }}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.green }}
                        />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>ITEM</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>SIZE</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>SOLD</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>PAYOUT</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>COST</span>
                      <span></span>
                    </div>

                    {/* Table Rows */}
                    {pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).map(s => (
                      <div 
                        key={s.id}
                        onClick={() => setSelectedPendingItem(selectedPendingItem === s.id ? null : s.id)}
                        style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '36px 1fr 50px 70px 70px 80px 30px', 
                          padding: '10px 12px', 
                          borderBottom: `1px solid ${c.border}`,
                          background: selectedPendingItem === s.id ? 'rgba(16,185,129,0.15)' : selectedPending.has(s.id) ? 'rgba(16,185,129,0.08)' : 'transparent',
                          cursor: 'pointer',
                          alignItems: 'center'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                          <input 
                            type="checkbox"
                            checked={selectedPending.has(s.id)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedPending);
                              if (e.target.checked) newSelected.add(s.id);
                              else newSelected.delete(s.id);
                              setSelectedPending(newSelected);
                            }}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.green }}
                          />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                          <div style={{ fontSize: 10, color: c.green }}>{s.sku}</div>
                          <div style={{ fontSize: 9, color: c.textMuted }}>{s.saleDate}</div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{s.size || '-'}</span>
                        <span style={{ fontSize: 12, textAlign: 'right' }}>{fmt(s.salePrice)}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.green, textAlign: 'right' }}>{fmt(s.payout)}</span>
                        <div style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <input 
                            type="number" 
                            placeholder="$"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.target.value) {
                                confirmSaleWithCost(s.id, e.target.value, 'StockX Standard');
                                e.target.value = '';
                              }
                            }}
                            style={{ width: 65, padding: '8px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: c.text, fontSize: 12, textAlign: 'center' }} 
                          />
                        </div>
                        <div style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <button 
                            onClick={() => {
                              setPendingCosts(prev => prev.filter(x => x.id !== s.id));
                              setSelectedPending(prev => { const n = new Set(prev); n.delete(s.id); return n; });
                            }} 
                            style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 14 }}
                          >×</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.border}`, borderTop: 'none', borderRadius: '0 0 12px 12px', fontSize: 11, color: c.textMuted }}>
                    💡 Click a sale, then click an inventory item on the right to auto-fill cost & mark sold
                  </div>
                </div>
              </div>
            )}

          {/* StockX Integration - Real OAuth */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 54, height: 54, background: '#00c165', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff' }}>SX</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>STOCKX</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Auto-import your StockX sales</p>
              </div>
              {stockxConnected ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => syncPlatform('StockX')} disabled={syncing} style={{ padding: '10px 18px', ...btnPrimary, fontSize: 12, opacity: syncing ? 0.6 : 1 }}>
                    {syncing ? 'Syncing...' : 'Sync Sales'}
                  </button>
                  <button onClick={disconnectStockX} style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 10, color: c.red, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Disconnect</button>
                </div>
              ) : (
                <button onClick={() => window.location.href = '/api/stockx-auth'} style={{ padding: '12px 22px', ...btnPrimary }}>Connect</button>
              )}
            </div>
            {stockxConnected && (
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${c.border}`, background: 'rgba(0,193,101,0.1)' }}>
                <span style={{ color: c.green, fontWeight: 600, fontSize: 12 }}>✓ Connected to StockX</span>
              </div>
            )}
          </div>

          {/* StockX CSV Import Section */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ width: 54, height: 54, background: 'linear-gradient(135deg, #00c165 0%, #009e52 100%)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff' }}>SX</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>STOCKX CSV</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Upload StockX historical sales CSV</p>
                </div>
              </div>
              
              {!stockxImport.show ? (
                <div>
                  <input type="file" accept=".csv" onChange={handleStockxCsvUpload} id="stockx-csv-upload" style={{ display: 'none' }} />
                  <label htmlFor="stockx-csv-upload" onDrop={handleStockxDrop} onDragOver={handleDragOver}
                    style={{ display: 'block', padding: 30, border: '2px dashed rgba(0,193,101,0.3)', borderRadius: 16, textAlign: 'center', cursor: 'pointer', background: 'rgba(0,193,101,0.05)' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#00c165' }}>Click or drag StockX CSV</div>
                    <div style={{ fontSize: 11, color: c.textMuted }}>Download from StockX → Seller Tools → Historical Sales</div>
                  </label>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <select value={stockxImport.year} onChange={e => setStockxImport({ ...stockxImport, year: e.target.value })} style={{ ...inputStyle, padding: 10, flex: 1 }}>
                      <option value="all">All Years</option>
                      {[2026,2025,2024,2023,2022,2021,2020].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={stockxImport.month} onChange={e => setStockxImport({ ...stockxImport, month: e.target.value })} style={{ ...inputStyle, padding: 10, flex: 1 }}>
                      <option value="all">All Months</option>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ background: 'rgba(0,193,101,0.1)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 12, color: c.textMuted }}>Total in CSV</div><div style={{ fontSize: 22, fontWeight: 800 }}>{stockxImport.data.length}</div></div>
                    <div style={{ fontSize: 24 }}>→</div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: c.textMuted }}>Filtered</div><div style={{ fontSize: 22, fontWeight: 800, color: '#00c165' }}>{filterStockxData().length}</div></div>
                  </div>
                  {filterStockxData().length > 0 && (
                    <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 16, borderRadius: 10, border: `1px solid ${c.border}` }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <tbody>
                          {filterStockxData().slice(0, 5).map((row, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                              <td style={{ padding: 10, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row['Item'] || row['Product Name'] || 'Unknown'}</td>
                              <td style={{ padding: 10 }}>{row['Sku Size'] || '-'}</td>
                              <td style={{ padding: 10, textAlign: 'right', color: '#00c165' }}>${row['Price'] || '0'}</td>
                            </tr>
                          ))}
                          {filterStockxData().length > 5 && <tr><td colSpan={3} style={{ padding: 8, textAlign: 'center', color: c.textMuted, fontSize: 10 }}>+{filterStockxData().length - 5} more</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setStockxImport({ show: false, data: [], year: 'all', month: 'all', headers: [] })} style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                    <button onClick={importStockxSales} disabled={filterStockxData().length === 0} style={{ flex: 2, padding: 12, background: 'linear-gradient(135deg, #00c165 0%, #009e52 100%)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: filterStockxData().length === 0 ? 0.5 : 1 }}>Import {filterStockxData().length} StockX Sales</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* eBay CSV Import Section */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ width: 54, height: 54, background: 'linear-gradient(135deg, #e53238 0%, #c62828 100%)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff' }}>eB</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>EBAY CSV</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Upload eBay Transaction Report CSV</p>
                </div>
              </div>
              
              {!ebayImport.show ? (
                <div>
                  <input type="file" accept=".csv" onChange={handleEbayCsvUpload} id="ebay-csv-upload" style={{ display: 'none' }} />
                  <label htmlFor="ebay-csv-upload" onDrop={handleEbayDrop} onDragOver={handleDragOver}
                    style={{ display: 'block', padding: 30, border: '2px dashed rgba(229,50,56,0.3)', borderRadius: 16, textAlign: 'center', cursor: 'pointer', background: 'rgba(229,50,56,0.05)' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🏪</div>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#e53238' }}>Click or drag eBay CSV</div>
                    <div style={{ fontSize: 11, color: c.textMuted }}>Download from eBay → Payments → Reports → Transaction Report</div>
                  </label>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <select value={ebayImport.year} onChange={e => setEbayImport({ ...ebayImport, year: e.target.value })} style={{ ...inputStyle, padding: 10, flex: 1 }}>
                      <option value="all">All Years</option>
                      {[2026,2025,2024,2023,2022,2021,2020].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={ebayImport.month} onChange={e => setEbayImport({ ...ebayImport, month: e.target.value })} style={{ ...inputStyle, padding: 10, flex: 1 }}>
                      <option value="all">All Months</option>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ background: 'rgba(229,50,56,0.1)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 12, color: c.textMuted }}>Orders in CSV</div><div style={{ fontSize: 22, fontWeight: 800 }}>{ebayImport.data.length}</div></div>
                    <div style={{ fontSize: 24 }}>→</div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: c.textMuted }}>Filtered</div><div style={{ fontSize: 22, fontWeight: 800, color: '#e53238' }}>{filterEbayData().length}</div></div>
                  </div>
                  {filterEbayData().length > 0 && (
                    <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 16, borderRadius: 10, border: `1px solid ${c.border}` }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <tbody>
                          {filterEbayData().slice(0, 5).map((row, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                              <td style={{ padding: 10, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row['Item title'] || 'Unknown'}</td>
                              <td style={{ padding: 10, textAlign: 'right', color: '#e53238' }}>${String(row['Gross transaction amount'] || '0').replace(/[$,]/g, '')}</td>
                            </tr>
                          ))}
                          {filterEbayData().length > 5 && <tr><td colSpan={2} style={{ padding: 8, textAlign: 'center', color: c.textMuted, fontSize: 10 }}>+{filterEbayData().length - 5} more</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setEbayImport({ show: false, data: [], year: 'all', month: 'all', headers: [] })} style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                    <button onClick={importEbaySales} disabled={filterEbayData().length === 0} style={{ flex: 2, padding: 12, background: 'linear-gradient(135deg, #e53238 0%, #c62828 100%)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: filterEbayData().length === 0 ? 0.5 : 1 }}>Import {filterEbayData().length} eBay Sales</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* eBay API Sync Section */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ width: 54, height: 54, background: 'linear-gradient(135deg, #e53238 0%, #c62828 100%)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff' }}>eBay</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>EBAY API SYNC</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>
                    {ebayConnected ? '✓ Connected - Pull your sold items automatically' : 'Connect your eBay account to sync sales'}
                  </p>
                </div>
              </div>
              
              {ebayConnected ? (
                <div>
                  <button
                    onClick={async () => {
                      setSyncing(true);
                      try {
                        const token = localStorage.getItem('flipledger_ebay_token');
                        const res = await fetch('/api/ebay-sales', {
                          headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const data = await res.json();
                        if (data.success && data.sales && data.sales.length > 0) {
                          const newPending = data.sales.map(s => ({
                            ...s,
                            id: s.id || 'ebay_' + (s.orderId || Date.now() + Math.random()),
                            platform: 'eBay',
                            needsCost: true,
                            source: 'api'
                          }));
                          
                          // Build comprehensive set of existing IDs to prevent duplicates
                          // Check: id, orderId, orderNumber (covers both CSV and API formats)
                          const existingIds = new Set();
                          [...sales, ...pendingCosts].forEach(s => {
                            if (s.id) existingIds.add(s.id);
                            if (s.orderId) existingIds.add(s.orderId);
                            if (s.orderNumber) existingIds.add(s.orderNumber);
                            // Also add the ebay_ prefixed version
                            if (s.orderId) existingIds.add('ebay_' + s.orderId);
                            if (s.orderNumber) existingIds.add('ebay_' + s.orderNumber);
                          });
                          
                          const fresh = newPending.filter(s => {
                            // Check if any identifier already exists
                            if (existingIds.has(s.id)) return false;
                            if (existingIds.has(s.orderId)) return false;
                            if (existingIds.has(s.orderNumber)) return false;
                            return true;
                          });
                          if (fresh.length > 0) {
                            setPendingCosts(prev => [...prev, ...fresh]);
                            localStorage.setItem('flipledger_pending', JSON.stringify([...pendingCosts, ...fresh]));
                            alert(`Imported ${fresh.length} new sales from eBay! Add cost basis below.`);
                          } else {
                            alert('No new sales to import. All caught up!');
                          }
                        } else {
                          alert('No sales found or error: ' + (data.error || 'Failed to fetch orders'));
                        }
                      } catch (err) {
                        console.error('eBay sync error:', err);
                        alert('Failed to sync: ' + err.message);
                      }
                      setSyncing(false);
                    }}
                    disabled={syncing}
                    style={{ width: '100%', padding: '14px', background: `linear-gradient(135deg, #e53238 0%, #c62828 100%)`, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.7 : 1 }}
                  >
                    {syncing ? '⏳ Syncing...' : '🔄 Sync eBay Sales (Last 90 Days)'}
                  </button>
                  <p style={{ margin: '10px 0 0', fontSize: 11, color: c.textMuted, textAlign: 'center' }}>
                    Pulls your sold items. You'll add cost basis to calculate profit.
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => window.location.href = '/api/ebay-auth'}
                  style={{ width: '100%', padding: '14px', background: '#e53238', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                >
                  🔗 Connect eBay Account
                </button>
              )}
            </div>
          </div>

          {/* Other Platforms */}
          {[
            { name: 'GOAT', code: 'GT', color: '#1a1a1a', border: '#333', connected: goatConnected, setConnected: setGoatConnected, desc: 'Auto-import your GOAT sales' },
            { name: 'QuickBooks', code: 'QB', color: '#2CA01C', connected: qbConnected, setConnected: setQbConnected, desc: 'Sync with QuickBooks accounting' }
          ].map(p => (
            <div key={p.name} style={{ ...cardStyle, marginBottom: 16 }}>
              <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 54, height: 54, background: p.color, border: p.border ? `2px solid ${p.border}` : 'none', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: p.color === '#1a1a1a' ? '#fff' : '#fff' }}>{p.code}</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>{p.name.toUpperCase()}</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>{p.desc}</p>
                </div>
                {p.connected ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {p.name !== 'QuickBooks' && (
                      <button onClick={() => syncPlatform(p.name)} disabled={syncing} style={{ padding: '10px 18px', ...btnPrimary, fontSize: 12, opacity: syncing ? 0.6 : 1 }}>
                        {syncing ? '...' : 'Sync'}
                      </button>
                    )}
                    <button onClick={() => p.setConnected(false)} style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 10, color: c.red, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Disconnect</button>
                  </div>
                ) : (
                  <button onClick={() => p.setConnected(true)} style={{ padding: '12px 22px', ...btnPrimary }}>Connect</button>
                )}
              </div>
              {p.connected && (
                <div style={{ padding: '12px 20px', borderTop: `1px solid ${c.border}`, background: `${p.color}10` }}>
                  <span style={{ color: c.green, fontWeight: 600, fontSize: 12 }}>✓ Connected</span>
                </div>
              )}
            </div>
          ))}
            </div>

            {/* RIGHT SIDE - Inventory Lookup (ALWAYS VISIBLE) */}
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, overflow: 'hidden', height: 'fit-content', position: 'sticky', top: 20 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>📦 YOUR INVENTORY</span>
                {selectedInvLookup.size > 0 && (
                  <button 
                    onClick={() => {
                      if (confirm(`Mark ${selectedInvLookup.size} item${selectedInvLookup.size > 1 ? 's' : ''} as sold?`)) {
                        setPurchases(prev => prev.map(p => selectedInvLookup.has(p.id) ? { ...p, sold: true } : p));
                        setSelectedInvLookup(new Set());
                      }
                    }}
                    style={{ padding: '6px 12px', background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 6, color: c.gold, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Mark {selectedInvLookup.size} Sold
                  </button>
                )}
              </div>
              
              <div style={{ padding: 12, borderBottom: `1px solid ${c.border}` }}>
                <input 
                  type="text"
                  placeholder="🔍 Search SKU, name, size..."
                  value={invLookupSearch}
                  onChange={e => setInvLookupSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
                />
              </div>

              {selectedPendingItem && (
                <div style={{ padding: '10px 12px', background: 'rgba(16,185,129,0.1)', borderBottom: `1px solid ${c.border}`, fontSize: 11, color: c.green, fontWeight: 600 }}>
                  👆 Click an item below to use its cost
                </div>
              )}

              {purchases.filter(p => !p.sold).length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: c.textMuted }}>No inventory yet</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 16 }}>Add items to track costs</div>
                  <button onClick={() => setPage('inventory')} style={{ padding: '10px 20px', ...btnPrimary, fontSize: 12 }}>+ Add Inventory</button>
                </div>
              ) : (
                <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                  {/* Select All Row */}
                  {!selectedPendingItem && purchases.filter(p => !p.sold).filter(p => {
                    if (!invLookupSearch) return true;
                    const search = invLookupSearch.toLowerCase();
                    return (p.name && p.name.toLowerCase().includes(search)) ||
                           (p.sku && p.sku.toLowerCase().includes(search)) ||
                           (p.size && p.size.toString().toLowerCase().includes(search));
                  }).length > 0 && (
                    <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input 
                        type="checkbox"
                        checked={(() => {
                          const visible = purchases.filter(p => !p.sold).filter(p => {
                            if (!invLookupSearch) return true;
                            const search = invLookupSearch.toLowerCase();
                            return (p.name && p.name.toLowerCase().includes(search)) ||
                                   (p.sku && p.sku.toLowerCase().includes(search)) ||
                                   (p.size && p.size.toString().toLowerCase().includes(search));
                          }).slice(0, 50);
                          return visible.length > 0 && visible.every(p => selectedInvLookup.has(p.id));
                        })()}
                        onChange={(e) => {
                          const visible = purchases.filter(p => !p.sold).filter(p => {
                            if (!invLookupSearch) return true;
                            const search = invLookupSearch.toLowerCase();
                            return (p.name && p.name.toLowerCase().includes(search)) ||
                                   (p.sku && p.sku.toLowerCase().includes(search)) ||
                                   (p.size && p.size.toString().toLowerCase().includes(search));
                          }).slice(0, 50);
                          if (e.target.checked) {
                            setSelectedInvLookup(new Set(visible.map(p => p.id)));
                          } else {
                            setSelectedInvLookup(new Set());
                          }
                        }}
                        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: c.gold }}
                      />
                      <span style={{ fontSize: 10, color: c.textMuted }}>Select All</span>
                    </div>
                  )}
                  {purchases
                    .filter(p => !p.sold)
                    .filter(p => {
                      if (!invLookupSearch) return true;
                      const search = invLookupSearch.toLowerCase();
                      return (p.name && p.name.toLowerCase().includes(search)) ||
                             (p.sku && p.sku.toLowerCase().includes(search)) ||
                             (p.size && p.size.toString().toLowerCase().includes(search));
                    })
                    .slice(0, 50)
                    .map(p => (
                      <div 
                        key={p.id}
                        style={{ 
                          padding: '10px 12px', 
                          borderBottom: `1px solid ${c.border}`,
                          cursor: selectedPendingItem ? 'pointer' : 'default',
                          transition: 'background 0.15s',
                          background: selectedInvLookup.has(p.id) ? 'rgba(251,191,36,0.1)' : 'transparent'
                        }}
                        onClick={() => {
                          if (selectedPendingItem) {
                            confirmSaleWithCost(selectedPendingItem, p.cost, 'StockX Standard');
                            setPurchases(prev => prev.map(x => x.id === p.id ? { ...x, sold: true } : x));
                            setSelectedPendingItem(null);
                          }
                        }}
                        onMouseEnter={e => { if (selectedPendingItem) e.currentTarget.style.background = 'rgba(16,185,129,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = selectedInvLookup.has(p.id) ? 'rgba(251,191,36,0.1)' : 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          {!selectedPendingItem && (
                            <input 
                              type="checkbox"
                              checked={selectedInvLookup.has(p.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedInvLookup(prev => {
                                  const newSet = new Set(prev);
                                  if (e.target.checked) newSet.add(p.id);
                                  else newSet.delete(p.id);
                                  return newSet;
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: 14, height: 14, cursor: 'pointer', accentColor: c.gold, marginTop: 2 }}
                            />
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: c.green, marginBottom: 4 }}>{p.sku} · Size {p.size}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                              <span style={{ color: c.gold, fontWeight: 700 }}>{fmt(p.cost)}</span>
                              <span style={{ color: c.textMuted }}>{p.date}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}

              <div style={{ padding: '10px 12px', borderTop: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', fontSize: 10, color: c.textMuted, textAlign: 'center' }}>
                {purchases.filter(p => !p.sold).length} items in stock
              </div>
            </div>
          </div>
        </div>}

        {/* SETTINGS */}
        {page === 'settings' && <div style={{ maxWidth: 550 }}>
          {/* Platform Connections */}
          <div style={{ ...cardStyle, padding: 24, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              🔗 Platform Connections
            </h3>
            
            {/* eBay Connection */}
            <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${c.border}`, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, background: '#e53238', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff' }}>eBay</div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>eBay</div>
                    <div style={{ fontSize: 12, color: c.textMuted }}>
                      {ebayConnected ? '✓ Connected' : 'Import your sold items automatically'}
                    </div>
                  </div>
                </div>
                {ebayConnected ? (
                  <button
                    onClick={() => {
                      localStorage.removeItem('flipledger_ebay_token');
                      localStorage.removeItem('flipledger_ebay_refresh');
                      setEbayToken(null);
                      setEbayConnected(false);
                    }}
                    style={{ padding: '10px 20px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, color: c.red, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => window.location.href = '/api/ebay-auth'}
                    style={{ padding: '10px 20px', background: '#e53238', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Connect eBay
                  </button>
                )}
              </div>
              
              {ebayConnected && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(16,185,129,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: c.green, fontSize: 12 }}>✓ Connected</span>
                  <span style={{ color: c.textMuted, fontSize: 11 }}>• Go to Import page to sync sales</span>
                </div>
              )}
            </div>

            {/* StockX Connection */}
            <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${c.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, background: '#00c165', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, color: '#fff' }}>StockX</div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>StockX</div>
                    <div style={{ fontSize: 12, color: c.textMuted }}>
                      {stockxConnected ? '✓ Connected' : 'Coming soon - use CSV import for now'}
                    </div>
                  </div>
                </div>
                <div style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, fontWeight: 600, fontSize: 13 }}>
                  {stockxConnected ? 'Connected' : 'CSV Import'}
                </div>
              </div>
            </div>
          </div>

          {/* Simple explanation */}
          <div style={{ ...cardStyle, padding: 24, marginBottom: 16, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>💡 Fee Settings</h3>
            <p style={{ margin: 0, fontSize: 13, color: c.textMuted, lineHeight: 1.6 }}>
              <strong>API Sync & CSV Import:</strong> Fees are automatically calculated from your StockX payout. No settings needed.
            </p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: c.textMuted, lineHeight: 1.6 }}>
              <strong>Manual Entry:</strong> Use the settings below to calculate fees when entering sales manually.
            </p>
          </div>

          {/* Advanced Settings - Collapsible */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <button 
              onClick={() => setSettings({ ...settings, showAdvanced: !settings.showAdvanced })}
              style={{ width: '100%', padding: '16px 24px', background: 'none', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: c.text }}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>⚙️ Advanced Fee Settings (Manual Entry)</span>
              <span style={{ fontSize: 18, color: c.textMuted }}>{settings.showAdvanced ? '▲' : '▼'}</span>
            </button>
            
            {settings.showAdvanced && (
              <div style={{ padding: '0 24px 24px' }}>
                {[
                  { name: 'STOCKX STANDARD', code: 'Standard', color: '#00c165', fields: [{ l: 'Seller Level', k: 'stockxLevel', opts: [[9,'Level 1 (9%)'],[8.5,'Level 2 (8.5%)'],[8,'Level 3 (8%)'],[7.5,'Level 4 (7.5%)'],[7,'Level 5 (7%)']] },{ l: 'Processing', k: 'stockxProcessing', opts: [[3,'3%'],[0,'0% (Seller+)']] }], checkbox: { label: 'Quick Ship Bonus (-2%)', key: 'stockxQuickShip' }, total: settings.stockxLevel + settings.stockxProcessing + (settings.stockxQuickShip ? -2 : 0) },
                  { name: 'STOCKX DIRECT', code: 'Direct', color: '#00c165', fields: [{ l: 'Commission', k: 'stockxDirectFee', opts: [[5,'5%'],[4,'4%'],[3,'3%']] },{ l: 'Processing', k: 'stockxDirectProcessing', opts: [[3,'3%'],[0,'0%']] }], total: settings.stockxDirectFee + settings.stockxDirectProcessing },
                  { name: 'STOCKX FLEX', code: 'Flex', color: '#00c165', fields: [{ l: 'Commission', k: 'stockxFlexFee', opts: [[5,'5%'],[4,'4%'],[3,'3%']] },{ l: 'Processing', k: 'stockxFlexProcessing', opts: [[3,'3%'],[0,'0%']] },{ l: 'Fulfillment', k: 'stockxFlexFulfillment', opts: [[5,'$5'],[4,'$4'],[3,'$3'],[0,'$0']] }], total: settings.stockxFlexFee + settings.stockxFlexProcessing, extra: `+ $${settings.stockxFlexFulfillment}` },
                  { name: 'GOAT', code: 'GOAT', color: '#1a1a1a', border: '#333', fields: [{ l: 'Commission', k: 'goatFee', opts: [[9.5,'9.5%'],[9,'9%'],[8,'8%'],[7,'7%']] },{ l: 'Cash Out', k: 'goatProcessing', opts: [[2.9,'2.9%'],[0,'0% (Credit)']] }], total: settings.goatFee + settings.goatProcessing },
                  { name: 'EBAY', code: 'eBay', color: '#e53238', fields: [{ l: 'Final Value Fee', k: 'ebayFee', opts: [[13.25,'13.25%'],[12.9,'12.9%'],[11.5,'11.5%'],[10,'10%'],[8,'8% ($150+)']] }], total: settings.ebayFee }
                ].map(platform => (
                  <div key={platform.name} style={{ padding: 18, marginTop: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${c.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <div style={{ minWidth: 44, height: 32, paddingLeft: 6, paddingRight: 6, background: platform.color, border: platform.border ? `2px solid ${platform.border}` : 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, color: '#fff' }}>{platform.code}</div>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{platform.name}</h3>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {platform.fields.map(field => (
                        <div key={field.k}>
                          <label style={{ display: 'block', marginBottom: 4, fontSize: 10, color: c.textMuted, fontWeight: 600 }}>{field.l.toUpperCase()}</label>
                          <select value={settings[field.k]} onChange={e => setSettings({ ...settings, [field.k]: parseFloat(e.target.value) })} style={{ ...inputStyle, background: 'rgba(0,0,0,0.3)', cursor: 'pointer', fontSize: 12, padding: 10 }}>
                            {field.opts.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    {platform.checkbox && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={settings[platform.checkbox.key]} onChange={e => setSettings({ ...settings, [platform.checkbox.key]: e.target.checked })} style={{ accentColor: c.green, width: 14, height: 14 }} />
                        {platform.checkbox.label}
                      </label>
                    )}
                    {platform.total !== undefined && (
                      <div style={{ marginTop: 12, padding: 10, background: 'rgba(16,185,129,0.1)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, color: c.textMuted, fontWeight: 600 }}>TOTAL FEE</span>
                        <span style={{ fontWeight: 700, color: c.green, fontSize: 14 }}>{platform.total}%{platform.extra && ` ${platform.extra}`}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>}
      </main>

      {/* MODAL */}
      {modal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ background: 'linear-gradient(180deg, #111 0%, #0a0a0a 100%)', border: `1px solid ${c.border}`, borderRadius: 20, width: 420, maxHeight: '90vh', overflow: 'auto' }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#111' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>
              {modal === 'purchase' ? 'ADD PURCHASE' : modal === 'bulkAdd' ? 'BULK ADD ITEMS' : modal === 'sale' ? 'RECORD SALE' : modal === 'editSale' ? 'EDIT SALE' : modal === 'editInventory' ? 'EDIT INVENTORY' : modal === 'expense' ? 'ADD EXPENSE' : modal === 'storage' ? 'ADD STORAGE FEE' : 'LOG MILEAGE'}
            </h3>
            <button onClick={() => setModal(null)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ padding: 22 }}>
            {/* EDIT INVENTORY MODAL */}
            {modal === 'editInventory' && <>
              <input value={formData.sku || ''} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="Style Code (SKU)" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.size || ''} onChange={e => setFormData({ ...formData, size: e.target.value })} placeholder="Size" style={{ ...inputStyle, flex: 1 }} />
                <input type="number" value={formData.cost || ''} onChange={e => setFormData({ ...formData, cost: e.target.value })} placeholder="Cost *" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <input type="date" value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} style={inputStyle} />
            </>}
            {modal === 'purchase' && <>
              {formData.image && (
                <div style={{ marginBottom: 16, padding: 16, background: '#1a1a1a', borderRadius: 12, textAlign: 'center' }}>
                  <img src={formData.image} alt="" style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} />
                </div>
              )}
              <input 
                value={formData.sku || ''} 
                onChange={async (e) => {
                  const sku = e.target.value;
                  setFormData({ ...formData, sku });
                  if (sku.length >= 6) {
                    const product = await lookupSku(sku);
                    if (product) {
                      setFormData(prev => ({ 
                        ...prev, 
                        sku,
                        name: product.name || prev.name,
                        image: product.image || prev.image
                      }));
                    }
                  }
                }} 
                placeholder="Style Code (e.g., DH6927-111) *" 
                style={{ ...inputStyle, marginBottom: 12 }} 
              />
              <input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.size || ''} onChange={e => setFormData({ ...formData, size: e.target.value })} placeholder="Size *" style={{ ...inputStyle, flex: 1 }} />
                <input type="number" value={formData.cost || ''} onChange={e => setFormData({ ...formData, cost: e.target.value })} placeholder="Cost *" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <input type="date" value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} style={inputStyle} />
            </>}
            {modal === 'bulkAdd' && <>
              <input value={formData.bulkName || ''} onChange={e => setFormData({ ...formData, bulkName: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.bulkSku || ''} onChange={e => setFormData({ ...formData, bulkSku: e.target.value })} placeholder="Style Code (e.g., DH6927-111)" style={{ ...inputStyle, marginBottom: 12 }} />
              <input type="date" value={formData.bulkDate || new Date().toISOString().split('T')[0]} onChange={e => setFormData({ ...formData, bulkDate: e.target.value })} style={{ ...inputStyle, marginBottom: 16 }} />
              
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: c.textMuted }}>SIZE</span>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: c.textMuted }}>COST</span>
                  <span style={{ width: 32 }}></span>
                </div>
                {(formData.bulkRows || [{ size: '', cost: '' }]).map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                    <input 
                      value={row.size} 
                      onChange={e => {
                        const newRows = [...(formData.bulkRows || [{ size: '', cost: '' }])];
                        newRows[i].size = e.target.value;
                        setFormData({ ...formData, bulkRows: newRows });
                      }}
                      placeholder="10.5" 
                      style={{ ...inputStyle, flex: 1, padding: 10 }} 
                    />
                    <input 
                      type="number"
                      value={row.cost} 
                      onChange={e => {
                        const newRows = [...(formData.bulkRows || [{ size: '', cost: '' }])];
                        newRows[i].cost = e.target.value;
                        setFormData({ ...formData, bulkRows: newRows });
                      }}
                      placeholder="76.97" 
                      style={{ ...inputStyle, flex: 1, padding: 10 }} 
                    />
                    <button 
                      onClick={() => {
                        const newRows = (formData.bulkRows || []).filter((_, idx) => idx !== i);
                        setFormData({ ...formData, bulkRows: newRows.length ? newRows : [{ size: '', cost: '' }] });
                      }}
                      style={{ width: 32, background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 8, color: c.red, cursor: 'pointer', fontSize: 16 }}
                    >×</button>
                  </div>
                ))}
                <button 
                  onClick={() => {
                    const newRows = [...(formData.bulkRows || [{ size: '', cost: '' }]), { size: '', cost: '' }];
                    setFormData({ ...formData, bulkRows: newRows });
                  }}
                  style={{ width: '100%', padding: 10, background: 'rgba(16,185,129,0.1)', border: `1px dashed rgba(16,185,129,0.3)`, borderRadius: 8, color: c.green, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >+ Add Another Size</button>
              </div>
              
              <div style={{ padding: 14, background: 'rgba(16,185,129,0.1)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: c.textMuted, fontSize: 13 }}>Items to add:</span>
                <span style={{ fontWeight: 800, fontSize: 20, color: c.green }}>{(formData.bulkRows || []).filter(r => r.size && r.cost).length}</span>
              </div>
            </>}
            {modal === 'sale' && <>
              {formData.saleImage && (
                <div style={{ marginBottom: 16, padding: 16, background: '#1a1a1a', borderRadius: 12, textAlign: 'center' }}>
                  <img src={formData.saleImage} alt="" style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} />
                </div>
              )}
              <input 
                value={formData.saleSku || ''} 
                onChange={async (e) => {
                  const sku = e.target.value;
                  setFormData({ ...formData, saleSku: sku });
                  if (sku.length >= 6) {
                    const product = await lookupSku(sku);
                    if (product) {
                      setFormData(prev => ({ 
                        ...prev, 
                        saleSku: sku,
                        saleName: product.name || prev.saleName,
                        saleImage: product.image || prev.saleImage
                      }));
                    }
                  }
                }} 
                placeholder="Style Code (e.g., DH6927-111) *" 
                style={{ ...inputStyle, marginBottom: 12 }} 
              />
              <input value={formData.saleName || ''} onChange={e => setFormData({ ...formData, saleName: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.saleSize || ''} onChange={e => setFormData({ ...formData, saleSize: e.target.value })} placeholder="Size *" style={{ ...inputStyle, flex: 1 }} />
                <input type="number" value={formData.saleCost || ''} onChange={e => setFormData({ ...formData, saleCost: e.target.value })} placeholder="Your cost *" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input type="number" value={formData.salePrice || ''} onChange={e => setFormData({ ...formData, salePrice: e.target.value })} placeholder="Sale price *" style={{ ...inputStyle, flex: 1 }} />
                <select value={formData.platform || 'StockX Standard'} onChange={e => setFormData({ ...formData, platform: e.target.value })} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
                  <option>StockX Standard</option>
                  <option>StockX Direct</option>
                  <option>StockX Flex</option>
                  <option>GOAT</option>
                  <option>eBay</option>
                  <option>Local</option>
                </select>
              </div>
              {(!formData.platform || formData.platform === 'StockX Standard') && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: c.textMuted, display: 'block', marginBottom: 4 }}>SELLER LEVEL</label>
                  <select value={formData.sellerLevel || settings.stockxLevel} onChange={e => setFormData({ ...formData, sellerLevel: parseFloat(e.target.value) })} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                    <option value={9}>Level 1 (9%)</option>
                    <option value={8.5}>Level 2 (8.5%)</option>
                    <option value={8}>Level 3 (8%)</option>
                    <option value={7.5}>Level 4 (7.5%)</option>
                    <option value={7}>Level 5 (7%)</option>
                  </select>
                </div>
              )}
              <input type="date" value={formData.saleDate || ''} onChange={e => setFormData({ ...formData, saleDate: e.target.value })} style={inputStyle} />
              {formData.saleCost && formData.salePrice && (
                <div style={{ marginTop: 16, padding: 16, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: c.textMuted }}>Est. Profit</span>
                  <span style={{ fontWeight: 800, fontSize: 24, color: c.green, fontStyle: 'italic' }}>
                    {fmt((+formData.salePrice || 0) - (+formData.saleCost || 0) - calcFees(+formData.salePrice || 0, formData.platform || 'StockX Standard'))}
                  </span>
                </div>
              )}
            </>}
            {modal === 'expense' && <>
              <select value={formData.category || 'Shipping'} onChange={e => setFormData({ ...formData, category: e.target.value })} style={{ ...inputStyle, marginBottom: 12, cursor: 'pointer' }}>
                {expenseCategories.map(cat => <option key={cat}>{cat}</option>)}
              </select>
              <input type="number" value={formData.amount || ''} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="Amount *" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Description" style={{ ...inputStyle, marginBottom: 12 }} />
              <input type="date" value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} style={inputStyle} />
            </>}
            {modal === 'storage' && <>
              <input type="month" value={formData.month || '2025-01'} onChange={e => setFormData({ ...formData, month: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} />
              <input type="number" value={formData.amount || ''} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="Amount *" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Notes" style={inputStyle} />
            </>}
            {modal === 'mileage' && <>
              <input type="date" value={formData.date || new Date().toISOString().split('T')[0]} onChange={e => setFormData({ ...formData, date: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} />
              <select value={formData.purpose || 'Pickup/Dropoff'} onChange={e => setFormData({ ...formData, purpose: e.target.value })} style={{ ...inputStyle, marginBottom: 12, cursor: 'pointer' }}>
                <option>Pickup/Dropoff</option>
                <option>Post Office</option>
                <option>Store Visit</option>
                <option>Storage Unit</option>
                <option>Shipping Center</option>
                <option>Client Meeting</option>
                <option>Other</option>
              </select>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.from || ''} onChange={e => setFormData({ ...formData, from: e.target.value })} placeholder="From" style={{ ...inputStyle, flex: 1 }} />
                <input value={formData.to || ''} onChange={e => setFormData({ ...formData, to: e.target.value })} placeholder="To" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <input type="number" value={formData.miles || ''} onChange={e => setFormData({ ...formData, miles: e.target.value })} placeholder="Miles *" style={inputStyle} />
              {formData.miles && (
                <div style={{ marginTop: 16, padding: 14, background: 'rgba(251,191,36,0.1)', borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: c.textMuted }}>Deduction</span>
                  <span style={{ fontWeight: 700, color: c.gold }}>{fmt((+formData.miles || 0) * settings.mileageRate)}</span>
                </div>
              )}
            </>}
            {modal === 'editSale' && <>
              <input value={formData.saleName || ''} onChange={e => setFormData({ ...formData, saleName: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.saleSku || ''} onChange={e => setFormData({ ...formData, saleSku: e.target.value })} placeholder="SKU" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.saleSize || ''} onChange={e => setFormData({ ...formData, saleSize: e.target.value })} placeholder="Size *" style={{ ...inputStyle, flex: 1 }} />
                <input type="number" value={formData.saleCost || ''} onChange={e => setFormData({ ...formData, saleCost: e.target.value })} placeholder="Your cost *" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input type="number" value={formData.salePrice || ''} onChange={e => setFormData({ ...formData, salePrice: e.target.value })} placeholder="Sale price *" style={{ ...inputStyle, flex: 1 }} />
                <select value={formData.platform || 'StockX Standard'} onChange={e => setFormData({ ...formData, platform: e.target.value })} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
                  <option>StockX Standard</option>
                  <option>StockX Direct</option>
                  <option>StockX Flex</option>
                  <option>GOAT</option>
                  <option>eBay</option>
                  <option>Local</option>
                </select>
              </div>
              {(!formData.platform || formData.platform === 'StockX Standard') && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: c.textMuted, display: 'block', marginBottom: 4 }}>SELLER LEVEL</label>
                  <select value={formData.sellerLevel || settings.stockxLevel} onChange={e => setFormData({ ...formData, sellerLevel: parseFloat(e.target.value) })} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                    <option value={9}>Level 1 (9%)</option>
                    <option value={8.5}>Level 2 (8.5%)</option>
                    <option value={8}>Level 3 (8%)</option>
                    <option value={7.5}>Level 4 (7.5%)</option>
                    <option value={7}>Level 5 (7%)</option>
                  </select>
                </div>
              )}
              <input type="date" value={formData.saleDate || ''} onChange={e => setFormData({ ...formData, saleDate: e.target.value })} style={inputStyle} />
            </>}
          </div>
          <div style={{ display: 'flex', gap: 12, padding: '16px 22px 22px' }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, padding: 14, background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>CANCEL</button>
            <button onClick={() => { 
              if (modal === 'purchase') addPurchase(); 
              else if (modal === 'bulkAdd') {
                const rows = (formData.bulkRows || []).filter(r => r.size && r.cost);
                if (!formData.bulkName || rows.length === 0) return;
                const newItems = rows.map((row, i) => ({
                  id: Date.now() + i,
                  name: formData.bulkName,
                  sku: formData.bulkSku || '',
                  size: row.size,
                  cost: parseFloat(row.cost),
                  date: formData.bulkDate || new Date().toISOString().split('T')[0],
                  sold: false
                }));
                setPurchases([...purchases, ...newItems]);
                setModal(null);
                setFormData({});
              }
              else if (modal === 'sale') addSale(); 
              else if (modal === 'editSale') {
                // Update existing sale
                const price = parseFloat(formData.salePrice);
                const cost = parseFloat(formData.saleCost);
                const fees = calcFees(price, formData.platform || 'StockX Standard');
                setSales(sales.map(s => s.id === formData.editSaleId ? {
                  ...s,
                  name: formData.saleName,
                  sku: formData.saleSku,
                  size: formData.saleSize,
                  cost,
                  salePrice: price,
                  platform: formData.platform,
                  saleDate: formData.saleDate,
                  sellerLevel: formData.sellerLevel,
                  fees,
                  profit: price - cost - fees
                } : s));
                setModal(null);
                setFormData({});
              }
              else if (modal === 'editInventory') {
                // Update existing inventory item
                setPurchases(purchases.map(p => p.id === formData.editId ? {
                  ...p,
                  name: formData.name,
                  sku: formData.sku,
                  size: formData.size,
                  cost: parseFloat(formData.cost) || 0,
                  date: formData.date
                } : p));
                setModal(null);
                setFormData({});
              }
              else if (modal === 'expense') addExpense(); 
              else if (modal === 'storage') addStorage(); 
              else if (modal === 'mileage') addMileage(); 
            }} style={{ flex: 1, padding: 14, ...btnPrimary, fontSize: 13 }}>
              {modal === 'purchase' ? 'ADD ITEM' : modal === 'bulkAdd' ? `ADD ${(formData.bulkRows || []).filter(r => r.size && r.cost).length} ITEMS` : modal === 'sale' ? 'RECORD 💰' : modal === 'editSale' ? 'SAVE CHANGES' : modal === 'editInventory' ? 'SAVE CHANGES' : modal === 'mileage' ? 'LOG TRIP' : 'ADD'}
            </button>
          </div>
        </div>
      </div>}

      <style>{`
        * { box-sizing: border-box; }
        input::placeholder { color: rgba(255,255,255,0.25); }
        select option { background: #111; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(16,185,129,0.2); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(16,185,129,0.3); }
        
        /* Premium Animations */
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(16,185,129,0.1); }
          50% { box-shadow: 0 0 40px rgba(16,185,129,0.2); }
        }
        
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .card-hover {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .card-hover:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3), 0 0 60px rgba(16,185,129,0.08);
          border-color: rgba(16,185,129,0.2) !important;
        }
        
        .btn-hover {
          transition: all 0.2s ease;
        }
        
        .btn-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(16,185,129,0.4);
        }
        
        .btn-hover:active {
          transform: translateY(0);
        }
        
        .row-hover {
          transition: all 0.2s ease;
        }
        
        .row-hover:hover {
          background: rgba(16,185,129,0.05) !important;
          transform: translateX(4px);
        }
        
        .nav-item {
          transition: all 0.2s ease;
        }
        
        .nav-item:hover {
          transform: translateX(4px);
        }
        
        .stat-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }
        
        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #10b981, #059669);
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3), 0 0 60px rgba(16,185,129,0.1);
          border-color: rgba(16,185,129,0.3) !important;
        }
        
        .stat-card:hover::before {
          opacity: 1;
        }
        
        .progress-shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
        
        .pending-pulse {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        
        .spin-icon {
          animation: spin 1s linear infinite;
        }
        
        .fade-in {
          animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        /* PRINT STYLES */
        @media print {
          /* Force everything white */
          *, *::before, *::after {
            background: white !important;
            background-color: white !important;
            background-image: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          body, html {
            background: white !important;
          }
          
          /* Hide sidebar, navigation, buttons */
          aside, .no-print, button, nav {
            display: none !important;
          }
          
          /* Hide the background gradient overlay */
          div[style*="radial-gradient"], 
          div[style*="linear-gradient"] {
            background: white !important;
            background-image: none !important;
          }
          
          /* Make main content full width */
          main {
            margin: 0 !important;
            padding: 20px !important;
            width: 100% !important;
            max-width: 100% !important;
            background: white !important;
          }
          
          /* White background for all divs */
          div {
            background: white !important;
            background-color: white !important;
            box-shadow: none !important;
          }
          
          /* Cards get a subtle border */
          .card-hover {
            border: 1px solid #ccc !important;
            break-inside: avoid;
            margin-bottom: 20px !important;
          }
          
          /* Black text everywhere */
          * {
            color: black !important;
          }
          
          /* Page breaks */
          h2, h3 {
            page-break-after: avoid;
          }
          
          table {
            page-break-inside: avoid;
          }
          
          /* Make sure text is readable */
          p, span, td, th, div {
            color: black !important;
          }
        }

        /* PULSE ANIMATIONS */
        .pulse-ring {
          animation: pulse-ring 2s ease-out infinite;
        }
        
        .pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        
        .shimmer-line {
          animation: shimmer 3s ease-in-out infinite;
        }
        
        .breathe {
          animation: breathe 4s ease-in-out infinite;
        }

        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        
        @keyframes pulse-glow {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
        }
        
        .pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        
        @keyframes shimmer {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        
        .shimmer-line {
          animation: shimmer 2s ease-in-out infinite;
        }
        
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.1); opacity: 0.6; }
        }
        
        @keyframes border-flow {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        .border-flow {
          animation: border-flow 3s linear infinite;
        }
        
        @keyframes spin-slow {
          100% { transform: rotate(360deg); }
        }
        
        .spin-slow {
          animation: spin-slow 20s linear infinite;
        }
        
        @keyframes ring-pulse {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(201,169,98,0.3)); }
          50% { filter: drop-shadow(0 0 20px rgba(201,169,98,0.5)); }
        }
        
        .ring-pulse {
          animation: ring-pulse 3s ease-in-out infinite;
        }
        
        .stat-card-hover:hover {
          transform: translateY(-8px);
          border-color: rgba(201,169,98,0.3);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        
        .hero-card:hover .breathe {
          animation-duration: 2s;
        }
      `}</style>
    </div>
  );
}

// Wrap App in ErrorBoundary for production stability
export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
