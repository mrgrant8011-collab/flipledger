import { useState, useEffect } from 'react';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [modal, setModal] = useState(null);
  const [year, setYear] = useState('2025');
  const [purchases, setPurchases] = useState(() => {
    const saved = localStorage.getItem('flipledger_purchases');
    return saved ? JSON.parse(saved) : [];
  });
  const [sales, setSales] = useState(() => {
    const saved = localStorage.getItem('flipledger_sales');
    return saved ? JSON.parse(saved) : [];
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
  const [stockxConnected, setStockxConnected] = useState(false);
  const [goatConnected, setGoatConnected] = useState(false);
  const [ebayConnected, setEbayConnected] = useState(false);
  const [qbConnected, setQbConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingCosts, setPendingCosts] = useState([]);

  // Save to localStorage whenever data changes
  useEffect(() => { localStorage.setItem('flipledger_purchases', JSON.stringify(purchases)); }, [purchases]);
  useEffect(() => { localStorage.setItem('flipledger_sales', JSON.stringify(sales)); }, [sales]);
  useEffect(() => { localStorage.setItem('flipledger_expenses', JSON.stringify(expenses)); }, [expenses]);
  useEffect(() => { localStorage.setItem('flipledger_storage', JSON.stringify(storageFees)); }, [storageFees]);
  useEffect(() => { localStorage.setItem('flipledger_mileage', JSON.stringify(mileage)); }, [mileage]);
  useEffect(() => { localStorage.setItem('flipledger_goals', JSON.stringify(goals)); }, [goals]);
  useEffect(() => { localStorage.setItem('flipledger_settings', JSON.stringify(settings)); }, [settings]);

  const c = { bg: '#030303', card: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)', emerald: '#10b981', emeraldGlow: 'rgba(16,185,129,0.4)', gold: '#fbbf24', red: '#ef4444', text: '#fff', textMuted: 'rgba(255,255,255,0.4)' };

  const filterByYear = (items, dateField = 'date') => year === 'all' ? items : items.filter(item => item[dateField]?.startsWith(year));
  const inventory = purchases.filter(p => !sales.find(s => s.purchaseId === p.id));
  const filteredInventory = filterByYear(inventory);
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
  const inventoryVal = filteredInventory.reduce((s, x) => s + (x.cost || 0), 0);
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
    await new Promise(r => setTimeout(r, 2000));
    const mockSales = [
      { id: platform + '_' + Date.now(), name: 'Jordan 4 Retro Military Black', size: '10', salePrice: 340, fees: 37.40, saleDate: '2025-01-05', platform, payout: 302.60 },
      { id: platform + '_' + Date.now() + 1, name: 'Nike Dunk Low Panda', size: '9.5', salePrice: 115, fees: 12.65, saleDate: '2025-01-04', platform, payout: 102.35 },
    ];
    setPendingCosts(prev => [...prev, ...mockSales]);
    setSyncing(false);
  };

  const confirmSaleWithCost = (saleId, cost) => {
    const sale = pendingCosts.find(s => s.id === saleId);
    if (!sale || !cost) return;
    setSales(prev => [...prev, { ...sale, id: Date.now(), cost: parseFloat(cost), profit: sale.salePrice - parseFloat(cost) - sale.fees }]);
    setPendingCosts(prev => prev.filter(s => s.id !== saleId));
  };

  const addPurchase = () => { if (!formData.name || !formData.cost) return; setPurchases([...purchases, { id: Date.now(), name: formData.name, sku: formData.sku || '', size: formData.size || '', cost: parseFloat(formData.cost), date: formData.date || new Date().toISOString().split('T')[0] }]); setModal(null); setFormData({}); };
  const addSale = () => { if (!formData.saleName || !formData.salePrice || !formData.saleCost) return; const price = parseFloat(formData.salePrice); const cost = parseFloat(formData.saleCost); const fees = calcFees(price, formData.platform || 'StockX Standard'); setSales([...sales, { id: Date.now(), name: formData.saleName, sku: formData.saleSku || '', size: formData.saleSize || '', cost, salePrice: price, platform: formData.platform || 'StockX Standard', fees, profit: price - cost - fees, saleDate: formData.saleDate || new Date().toISOString().split('T')[0] }]); setModal(null); setFormData({}); };
  const addExpense = () => { if (!formData.amount) return; setExpenses([...expenses, { id: Date.now(), category: formData.category || 'Shipping', amount: parseFloat(formData.amount), description: formData.description || '', date: formData.date || new Date().toISOString().split('T')[0] }]); setModal(null); setFormData({}); };
  const addStorage = () => { if (!formData.amount) return; setStorageFees([...storageFees, { id: Date.now(), month: formData.month || '2025-01', amount: parseFloat(formData.amount), notes: formData.notes || '' }]); setModal(null); setFormData({}); };
  const addMileage = () => { if (!formData.miles) return; setMileage([...mileage, { id: Date.now(), date: formData.date || new Date().toISOString().split('T')[0], miles: parseFloat(formData.miles), purpose: formData.purpose || 'Pickup/Dropoff', from: formData.from || '', to: formData.to || '' }]); setModal(null); setFormData({}); };

  const exportCSV = (data, filename, headers) => {
    const csv = [headers.join(','), ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  };

  const printTaxPackage = () => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>FlipLedger Tax Package ${year}</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#111}h1{color:#10b981}h2{border-bottom:2px solid #10b981;padding-bottom:5px;margin-top:30px}table{width:100%;border-collapse:collapse;margin:15px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#10b981;color:white}.total{font-weight:bold;background:#e8f5e9}.page-break{page-break-before:always}</style></head><body>
      <h1>📊 FlipLedger Tax Package</h1>
      <p><strong>Tax Year:</strong> ${year === 'all' ? 'All Time' : year}</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
      <p><strong>Business Type:</strong> Reselling / E-Commerce</p>
      
      <h2>📋 Executive Summary</h2>
      <table>
        <tr><td>Gross Revenue</td><td style="text-align:right">${fmt(totalRevenue)}</td></tr>
        <tr><td>Cost of Goods Sold</td><td style="text-align:right;color:#ef4444">(${fmt(totalCOGS)})</td></tr>
        <tr><td>Gross Profit</td><td style="text-align:right">${fmt(grossProfit)}</td></tr>
        <tr><td>Total Deductions</td><td style="text-align:right;color:#ef4444">(${fmt(totalDeductions)})</td></tr>
        <tr class="total"><td><strong>NET PROFIT (Schedule C Line 31)</strong></td><td style="text-align:right"><strong>${fmt(netProfit)}</strong></td></tr>
      </table>

      <h2>📦 Deductions Breakdown</h2>
      <table>
        <tr><th>Category</th><th>Amount</th><th>Schedule C Line</th></tr>
        <tr><td>Platform Selling Fees</td><td>${fmt(totalFees)}</td><td>Line 10</td></tr>
        <tr><td>Storage Fees</td><td>${fmt(totalStor)}</td><td>Line 20b</td></tr>
        <tr><td>Business Expenses</td><td>${fmt(totalExp)}</td><td>Line 27a</td></tr>
        <tr><td>Mileage (${totalMiles.toFixed(1)} mi × $${settings.mileageRate})</td><td>${fmt(totalMileageDeduction)}</td><td>Line 9</td></tr>
        <tr class="total"><td><strong>TOTAL DEDUCTIONS</strong></td><td><strong>${fmt(totalDeductions)}</strong></td><td></td></tr>
      </table>

      <h2>💰 Revenue by Platform</h2>
      <table>
        <tr><th>Platform</th><th>Sales</th><th>Revenue</th><th>Fees</th><th>Net</th></tr>
        ${Object.entries(platformBreakdown).map(([p, d]) => `<tr><td>${p}</td><td>${d.sales}</td><td>${fmt(d.revenue)}</td><td>(${fmt(d.fees)})</td><td>${fmt(d.revenue - d.fees)}</td></tr>`).join('')}
        <tr class="total"><td>TOTAL</td><td>${filteredSales.length}</td><td>${fmt(totalRevenue)}</td><td>(${fmt(totalFees)})</td><td>${fmt(totalRevenue - totalFees)}</td></tr>
      </table>

      <h2>🧾 Tax Estimate</h2>
      <table>
        <tr><td>Net Profit (Taxable Income)</td><td style="text-align:right">${fmt(netProfit)}</td></tr>
        <tr><td>Self-Employment Tax (15.3%)</td><td style="text-align:right;color:#ef4444">${fmt(selfEmploymentTax)}</td></tr>
        <tr><td>Federal Income Tax (~22%)</td><td style="text-align:right;color:#ef4444">${fmt(federalTax)}</td></tr>
        <tr><td>State Income Tax (~5%)</td><td style="text-align:right;color:#ef4444">${fmt(stateTax)}</td></tr>
        <tr class="total"><td><strong>ESTIMATED TOTAL TAX</strong></td><td style="text-align:right"><strong>${fmt(totalTax)}</strong></td></tr>
        <tr><td>Quarterly Payment Amount</td><td style="text-align:right">${fmt(totalTax / 4)}</td></tr>
      </table>
      <p style="font-size:12px;color:#666;">* Tax estimates are approximate. Consult a licensed CPA for accurate tax advice.</p>

      <div class="page-break"></div>

      <h2>📋 Detailed Sales Log</h2>
      <table>
        <tr><th>Date</th><th>Item</th><th>Style Code</th><th>Size</th><th>Platform</th><th>Sale Price</th><th>Cost</th><th>Fees</th><th>Profit</th></tr>
        ${filteredSales.map(s => `<tr><td>${s.saleDate}</td><td>${s.name}</td><td>${s.sku || '-'}</td><td>${s.size || '-'}</td><td>${s.platform}</td><td>${fmt(s.salePrice)}</td><td>(${fmt(s.cost)})</td><td>(${fmt(s.fees)})</td><td style="color:${s.profit >= 0 ? '#10b981' : '#ef4444'}">${fmt(s.profit)}</td></tr>`).join('') || '<tr><td colspan="9">No sales recorded</td></tr>'}
        <tr class="total"><td colspan="5">TOTALS</td><td>${fmt(totalRevenue)}</td><td>(${fmt(totalCOGS)})</td><td>(${fmt(totalFees)})</td><td>${fmt(totalRevenue - totalCOGS - totalFees)}</td></tr>
      </table>

      <h2>📋 Expense Log</h2>
      <table>
        <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr>
        ${filteredExpenses.map(e => `<tr><td>${e.date}</td><td>${e.category}</td><td>${e.description || '-'}</td><td>${fmt(e.amount)}</td></tr>`).join('') || '<tr><td colspan="4">No expenses recorded</td></tr>'}
        <tr class="total"><td colspan="3">TOTAL EXPENSES</td><td>${fmt(totalExp)}</td></tr>
      </table>

      <h2>🚗 Mileage Log</h2>
      <p>IRS Standard Mileage Rate: $${settings.mileageRate}/mile</p>
      <table>
        <tr><th>Date</th><th>Purpose</th><th>From</th><th>To</th><th>Miles</th><th>Deduction</th></tr>
        ${filteredMileage.map(m => `<tr><td>${m.date}</td><td>${m.purpose}</td><td>${m.from}</td><td>${m.to}</td><td>${m.miles}</td><td>${fmt(m.miles * settings.mileageRate)}</td></tr>`).join('') || '<tr><td colspan="6">No mileage recorded</td></tr>'}
        <tr class="total"><td colspan="4">TOTAL</td><td>${totalMiles.toFixed(1)}</td><td>${fmt(totalMileageDeduction)}</td></tr>
      </table>

      <h2>📦 Ending Inventory (Asset Value)</h2>
      <p>Unsold inventory as of report date - ${filteredInventory.length} items</p>
      <table>
        <tr><th>Date Acquired</th><th>Item</th><th>Style Code</th><th>Size</th><th>Cost Basis</th></tr>
        ${filteredInventory.map(p => `<tr><td>${p.date}</td><td>${p.name}</td><td>${p.sku || '-'}</td><td>${p.size || '-'}</td><td>${fmt(p.cost)}</td></tr>`).join('') || '<tr><td colspan="5">No inventory on hand</td></tr>'}
        <tr class="total"><td colspan="4">TOTAL INVENTORY VALUE</td><td>${fmt(inventoryVal)}</td></tr>
      </table>

      <h2>📝 Tax Forms Checklist</h2>
      <table>
        <tr><th>Form</th><th>Purpose</th><th>Notes</th></tr>
        <tr><td>Schedule C (Form 1040)</td><td>Profit or Loss from Business</td><td>Main form for sole proprietors</td></tr>
        <tr><td>Schedule SE (Form 1040)</td><td>Self-Employment Tax</td><td>Required if net profit > $400</td></tr>
        <tr><td>Form 1099-K</td><td>Payment Card Transactions</td><td>Should receive from StockX, GOAT, eBay if > $600</td></tr>
        <tr><td>Form 4562</td><td>Depreciation</td><td>If you have business equipment > $2,500</td></tr>
      </table>

      <div style="margin-top:40px;padding-top:20px;border-top:1px solid #ddd;font-size:11px;color:#666;">
        <p><strong>Generated by FlipLedger</strong> - Professional Reseller Accounting Software</p>
        <p>This document is for informational purposes. Please retain all receipts and 1099 forms for your records.</p>
        <p>Report generated: ${new Date().toLocaleString()}</p>
      </div>
      </body></html>`);
    w.document.close(); w.print();
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
    { id: 'inventory', label: 'Inventory', icon: '◫', count: filteredInventory.length },
    { id: 'sales', label: 'Sales', icon: '◈', count: filteredSales.length },
    { type: 'divider' },
    { id: 'expenses', label: 'Expenses', icon: '◧' },
    { id: 'mileage', label: 'Mileage', icon: '🚗' },
    { id: 'storage', label: 'Storage', icon: '▤' },
    { type: 'divider' },
    { id: 'goals', label: 'Goals', icon: '◎' },
    { id: 'taxes', label: 'Tax Center', icon: '◬' },
    { id: 'reports', label: 'CPA Reports', icon: '📊' },
    { type: 'divider' },
    { id: 'integrations', label: 'Integrations', icon: '🔗', badge: pendingCosts.length || null },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  const inputStyle = { width: '100%', padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14, boxSizing: 'border-box', outline: 'none' };
  const cardStyle = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 20, overflow: 'hidden' };
  const btnPrimary = { background: `linear-gradient(135deg, ${c.emerald} 0%, #059669 100%)`, border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: `0 8px 32px ${c.emeraldGlow}` };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: c.bg, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: c.text }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 0% 0%, rgba(16,185,129,0.07) 0%, transparent 50%), radial-gradient(ellipse at 100% 100%, rgba(251,191,36,0.04) 0%, transparent 50%)` }} />

      <aside style={{ width: 240, minWidth: 240, background: 'rgba(5,5,5,0.95)', borderRight: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <div style={{ padding: 20, borderBottom: `1px solid ${c.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, background: `linear-gradient(135deg, ${c.emerald}, #059669)`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, boxShadow: `0 8px 32px ${c.emeraldGlow}`, fontStyle: 'italic' }}>F</div>
            <div><div style={{ fontWeight: 800, fontSize: 18, fontStyle: 'italic' }}>FLIP<span style={{ color: c.emerald }}>LEDGER</span></div><div style={{ fontSize: 9, color: c.gold, letterSpacing: '0.1em' }}>GET YOUR MONEY RIGHT</div></div>
          </div>
        </div>

        <div style={{ padding: '12px' }}>
          <select value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%', padding: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, color: c.emerald, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <option value="all">All Years</option>
            {[2026,2025,2024,2023,2022,2021,2020,2019].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <nav style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
          {navItems.map((item, i) => item.type === 'divider' ? <div key={i} style={{ height: 1, background: c.border, margin: '8px' }} /> : (
            <button key={item.id} onClick={() => setPage(item.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12, width: '100%', padding: '11px 14px', marginBottom: 2, border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: page === item.id ? 'rgba(16,185,129,0.15)' : 'transparent', color: page === item.id ? c.emerald : c.textMuted, transition: 'all 0.2s' }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span>{item.label}</span>
              {item.badge && <span style={{ marginLeft: 'auto', background: c.red, padding: '2px 8px', borderRadius: 10, fontSize: 10 }}>{item.badge}</span>}
              {item.count !== undefined && <span style={{ marginLeft: 'auto', background: 'rgba(16,185,129,0.2)', padding: '2px 8px', borderRadius: 8, fontSize: 11 }}>{item.count}</span>}
            </button>
          ))}
        </nav>

        <div style={{ padding: 12, borderTop: `1px solid ${c.border}` }}>
          <button onClick={() => { setFormData({}); setModal('purchase'); }} style={{ width: '100%', padding: 10, marginBottom: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Add Purchase</button>
          <button onClick={() => { setFormData({}); setModal('sale'); }} style={{ width: '100%', padding: 10, ...btnPrimary, fontSize: 12 }}>+ Record Sale</button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: '28px 36px', overflowY: 'auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, fontStyle: 'italic' }}>{navItems.find(n => n.id === page)?.label?.toUpperCase() || 'DASHBOARD'}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>{year === 'all' ? 'All time' : `Tax Year ${year}`}</p>
        </div>

        {/* DASHBOARD */}
        {page === 'dashboard' && <>
          {pendingCosts.length > 0 && <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 14, padding: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><span style={{ fontSize: 20, marginRight: 10 }}>⚠️</span><span style={{ color: c.gold, fontWeight: 600 }}>{pendingCosts.length} sales need cost basis</span></div><button onClick={() => setPage('integrations')} style={{ padding: '8px 16px', background: c.gold, border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>REVIEW</button></div>}
          
          {/* TOP STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'YTD PROFIT', value: netProfit, color: netProfit >= 0 ? c.emerald : c.red, glow: true },
              { label: 'YTD COST', value: totalCOGS, color: c.gold },
              { label: 'YTD FEES', value: totalFees, color: c.red },
              { label: 'YTD REVENUE', value: totalRevenue, color: '#fff' }
            ].map((card, i) => (
              <div key={i} style={{ ...cardStyle, padding: 20, position: 'relative', background: card.glow ? 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(16,185,129,0.02) 100%)' : cardStyle.background, border: card.glow ? '1px solid rgba(16,185,129,0.2)' : cardStyle.border }}>
                {card.glow && <div style={{ position: 'absolute', top: -50, right: -50, width: 120, height: 120, background: `radial-gradient(circle, ${c.emeraldGlow} 0%, transparent 70%)`, pointerEvents: 'none' }} />}
                <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, letterSpacing: '0.1em' }}>{card.label}</span>
                <p style={{ margin: '10px 0 0', fontSize: 28, fontWeight: 800, color: card.color, fontStyle: 'italic' }}>{card.isText ? card.value : fmt(card.value)}</p>
              </div>
            ))}
          </div>

          {/* MONTHLY TABLE */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}` }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, fontStyle: 'italic' }}>MONTHLY BREAKDOWN</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                    <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: c.textMuted }}></th>
                    <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>YTD COST</th>
                    <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>YTD FEES</th>
                    <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>YTD PROFIT</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let runningCost = 0;
                    let runningFees = 0;
                    let runningProfit = 0;
                    return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => {
                      const monthNum = String(i + 1).padStart(2, '0');
                      const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                      const monthCost = monthSales.reduce((sum, s) => sum + (s.cost || 0), 0);
                      const monthFees = monthSales.reduce((sum, s) => sum + (s.fees || 0), 0);
                      const monthProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
                      runningCost += monthCost;
                      runningFees += monthFees;
                      runningProfit += monthProfit;
                      if (monthCost === 0 && monthFees === 0 && monthProfit === 0) return null;
                      return (
                        <tr key={month} style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ padding: '12px 20px', fontWeight: 600 }}>{month}</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', color: '#fff' }}>{fmt(runningCost)}</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', color: c.red }}>{fmt(runningFees)}</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', color: runningProfit >= 0 ? c.emerald : c.red, fontWeight: 700 }}>{fmt(runningProfit)}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(16,185,129,0.1)' }}>
                    <td style={{ padding: '14px 20px', fontWeight: 800, fontStyle: 'italic' }}>Totals:</td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: c.emerald }}>{fmt(totalCOGS)}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: c.red }}>{fmt(totalFees)}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 800, color: netProfit >= 0 ? c.emerald : c.red, fontSize: 16 }}>{fmt(netProfit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* CHART */}
          <div style={{ ...cardStyle, padding: 20 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, fontStyle: 'italic' }}>MONTHLY PERFORMANCE</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200, paddingBottom: 30, position: 'relative' }}>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => {
                const monthNum = String(i + 1).padStart(2, '0');
                const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                const monthCost = monthSales.reduce((sum, s) => sum + (s.cost || 0), 0);
                const monthFees = monthSales.reduce((sum, s) => sum + (s.fees || 0), 0);
                const monthProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
                const maxVal = Math.max(totalCOGS, totalFees, netProfit, 1000) / 12 * 2;
                const costHeight = Math.max((monthCost / maxVal) * 150, 0);
                const feesHeight = Math.max((monthFees / maxVal) * 150, 0);
                const profitHeight = Math.max((monthProfit / maxVal) * 150, 0);
                return (
                  <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 150 }}>
                      <div style={{ width: 12, height: costHeight, background: c.gold, borderRadius: '4px 4px 0 0' }} title={`Cost: ${fmt(monthCost)}`} />
                      <div style={{ width: 12, height: feesHeight, background: c.red, borderRadius: '4px 4px 0 0' }} title={`Fees: ${fmt(monthFees)}`} />
                      <div style={{ width: 12, height: profitHeight, background: c.emerald, borderRadius: '4px 4px 0 0' }} title={`Profit: ${fmt(monthProfit)}`} />
                    </div>
                    <span style={{ fontSize: 10, color: c.textMuted, marginTop: 8 }}>{month}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: c.gold, borderRadius: 3 }} /><span style={{ fontSize: 11, color: c.textMuted }}>Cost</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: c.red, borderRadius: 3 }} /><span style={{ fontSize: 11, color: c.textMuted }}>Fees</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: c.emerald, borderRadius: 3 }} /><span style={{ fontSize: 11, color: c.textMuted }}>Profit</span></div>
            </div>
          </div>
        </>}

        {/* INVENTORY */}
        {page === 'inventory' && <div>
          {/* STATS BAR */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL ITEMS</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: '#fff' }}>{purchases.length}</p>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>IN STOCK</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: c.emerald }}>{purchases.filter(p => !p.sold).length}</p>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>INVESTED</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: c.gold }}>{fmt(purchases.filter(p => !p.sold).reduce((s, x) => s + (x.cost || 0), 0))}</p>
            </div>
          </div>

          {/* SEARCH & ACTIONS */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input 
              type="text" 
              placeholder="🔍 Search by name, SKU, or size..." 
              value={formData.inventorySearch || ''} 
              onChange={e => setFormData({ ...formData, inventorySearch: e.target.value })}
              style={{ flex: 1, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14 }} 
            />
            <select value={formData.inventoryFilter || 'all'} onChange={e => setFormData({ ...formData, inventoryFilter: e.target.value })} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All ({purchases.length})</option>
              <option value="instock">In Stock ({purchases.filter(p => !p.sold).length})</option>
              <option value="sold">Sold ({purchases.filter(p => p.sold).length})</option>
            </select>
            <select value={formData.inventorySort || 'newest'} onChange={e => setFormData({ ...formData, inventorySort: e.target.value })} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="costHigh">Cost: High → Low</option>
              <option value="costLow">Cost: Low → High</option>
              <option value="name">Name A → Z</option>
            </select>
            <button onClick={() => { setFormData({ ...formData, bulkRows: [{ size: '', cost: '' }] }); setModal('bulkAdd'); }} style={{ padding: '14px 24px', ...btnPrimary, fontSize: 13 }}>+ BULK ADD</button>
            <button onClick={() => { setFormData({}); setModal('purchase'); }} style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ SINGLE</button>
          </div>

          {/* INVENTORY TABLE */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: c.textMuted }}>Showing {purchases.filter(p => {
                const search = (formData.inventorySearch || '').toLowerCase();
                const filter = formData.inventoryFilter || 'all';
                const matchesSearch = !search || p.name?.toLowerCase().includes(search) || p.sku?.toLowerCase().includes(search) || p.size?.toLowerCase().includes(search);
                const matchesFilter = filter === 'all' || (filter === 'instock' && !p.sold) || (filter === 'sold' && p.sold);
                return matchesSearch && matchesFilter;
              }).length} items</span>
              <button onClick={() => exportCSV(purchases, 'inventory.csv', ['date','name','sku','size','cost','sold'])} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>📥 Export</button>
            </div>
            
            {/* TABLE HEADER */}
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 130px 60px 80px 70px 90px 40px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>DATE</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>NAME</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>SKU</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>SIZE</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>COST</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>DAYS</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>STATUS</span>
              <span></span>
            </div>

            {/* TABLE ROWS */}
            {purchases.filter(p => {
              const search = (formData.inventorySearch || '').toLowerCase();
              const filter = formData.inventoryFilter || 'all';
              const matchesSearch = !search || p.name?.toLowerCase().includes(search) || p.sku?.toLowerCase().includes(search) || p.size?.toLowerCase().includes(search);
              const matchesFilter = filter === 'all' || (filter === 'instock' && !p.sold) || (filter === 'sold' && p.sold);
              return matchesSearch && matchesFilter;
            }).sort((a, b) => {
              const sort = formData.inventorySort || 'newest';
              if (sort === 'newest') return new Date(b.date) - new Date(a.date);
              if (sort === 'oldest') return new Date(a.date) - new Date(b.date);
              if (sort === 'costHigh') return (b.cost || 0) - (a.cost || 0);
              if (sort === 'costLow') return (a.cost || 0) - (b.cost || 0);
              if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
              return 0;
            }).length ? purchases.filter(p => {
              const search = (formData.inventorySearch || '').toLowerCase();
              const filter = formData.inventoryFilter || 'all';
              const matchesSearch = !search || p.name?.toLowerCase().includes(search) || p.sku?.toLowerCase().includes(search) || p.size?.toLowerCase().includes(search);
              const matchesFilter = filter === 'all' || (filter === 'instock' && !p.sold) || (filter === 'sold' && p.sold);
              return matchesSearch && matchesFilter;
            }).sort((a, b) => {
              const sort = formData.inventorySort || 'newest';
              if (sort === 'newest') return new Date(b.date) - new Date(a.date);
              if (sort === 'oldest') return new Date(a.date) - new Date(b.date);
              if (sort === 'costHigh') return (b.cost || 0) - (a.cost || 0);
              if (sort === 'costLow') return (a.cost || 0) - (b.cost || 0);
              if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
              return 0;
            }).map(p => {
              const daysInStock = Math.floor((new Date() - new Date(p.date)) / (1000 * 60 * 60 * 24));
              return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 130px 60px 80px 70px 90px 40px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', background: p.sold ? 'rgba(251,191,36,0.05)' : 'transparent' }}>
                <span style={{ fontSize: 12, color: c.textMuted }}>{p.date}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: p.sold ? c.textMuted : '#fff' }}>{p.name}</span>
                <span style={{ fontSize: 11, color: c.emerald }}>{p.sku || '-'}</span>
                <span style={{ fontSize: 13 }}>{p.size || '-'}</span>
                <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{fmt(p.cost)}</span>
                <span style={{ fontSize: 12, textAlign: 'center', color: !p.sold && daysInStock > 60 ? c.red : !p.sold && daysInStock > 30 ? c.gold : c.textMuted }}>{p.sold ? '-' : daysInStock}</span>
                <div style={{ textAlign: 'center' }}>
                  <button 
                    onClick={() => {
                      setPurchases(purchases.map(x => x.id === p.id ? { ...x, sold: !x.sold } : x));
                    }}
                    style={{ 
                      padding: '4px 10px', 
                      background: p.sold ? 'rgba(251,191,36,0.2)' : 'rgba(16,185,129,0.1)', 
                      border: `1px solid ${p.sold ? 'rgba(251,191,36,0.3)' : 'rgba(16,185,129,0.2)'}`, 
                      borderRadius: 6, 
                      color: p.sold ? c.gold : c.emerald, 
                      fontSize: 10, 
                      fontWeight: 700, 
                      cursor: 'pointer' 
                    }}
                  >
                    {p.sold ? '🟡 SOLD' : 'IN STOCK'}
                  </button>
                </div>
                <button onClick={() => setPurchases(purchases.filter(x => x.id !== p.id))} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            )}) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>📦</div><p style={{ color: c.textMuted }}>No inventory</p><button onClick={() => { setFormData({ ...formData, bulkRows: [{ size: '', cost: '' }] }); setModal('bulkAdd'); }} style={{ marginTop: 12, padding: '10px 20px', ...btnPrimary, fontSize: 13 }}>+ Add Items</button></div>}
          </div>
        </div>}

        {/* SALES */}
        {page === 'sales' && <div>
          {/* STATS BAR */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL SALES</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: '#fff' }}>{filteredSales.length}</p>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL PROFIT</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: netProfit >= 0 ? c.emerald : c.red }}>{fmt(netProfit)}</p>
            </div>
          </div>

          {/* SEARCH & ACTIONS */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input 
              type="text" 
              placeholder="🔍 Search by name, SKU, or size..." 
              value={formData.salesSearch || ''} 
              onChange={e => setFormData({ ...formData, salesSearch: e.target.value })}
              style={{ flex: 1, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14 }} 
            />
            <select value={formData.salesFilter || 'all'} onChange={e => setFormData({ ...formData, salesFilter: e.target.value })} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Platforms ({filteredSales.length})</option>
              <option value="StockX Standard">StockX Standard ({filteredSales.filter(s => s.platform === 'StockX Standard').length})</option>
              <option value="StockX Direct">StockX Direct ({filteredSales.filter(s => s.platform === 'StockX Direct').length})</option>
              <option value="StockX Flex">StockX Flex ({filteredSales.filter(s => s.platform === 'StockX Flex').length})</option>
              <option value="GOAT">GOAT ({filteredSales.filter(s => s.platform === 'GOAT').length})</option>
              <option value="eBay">eBay ({filteredSales.filter(s => s.platform === 'eBay').length})</option>
              <option value="Local">Local ({filteredSales.filter(s => s.platform === 'Local').length})</option>
            </select>
            <select value={formData.salesSort || 'newest'} onChange={e => setFormData({ ...formData, salesSort: e.target.value })} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="profitHigh">Profit: High → Low</option>
              <option value="profitLow">Profit: Low → High</option>
              <option value="priceHigh">Price: High → Low</option>
            </select>
            <button onClick={() => { setFormData({}); setModal('sale'); }} style={{ padding: '14px 24px', ...btnPrimary, fontSize: 13 }}>+ RECORD SALE</button>
          </div>

          {/* SALES TABLE */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: c.textMuted }}>Showing {filteredSales.filter(s => {
                const search = (formData.salesSearch || '').toLowerCase();
                const filter = formData.salesFilter || 'all';
                const matchesSearch = !search || s.name?.toLowerCase().includes(search) || s.sku?.toLowerCase().includes(search) || s.size?.toLowerCase().includes(search);
                const matchesFilter = filter === 'all' || s.platform === filter;
                return matchesSearch && matchesFilter;
              }).length} sales</span>
              <button onClick={() => exportCSV(filteredSales, 'sales.csv', ['saleDate','name','sku','size','platform','salePrice','cost','fees','profit'])} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>📥 Export</button>
            </div>
            
            {/* TABLE HEADER */}
            <div style={{ display: 'grid', gridTemplateColumns: '85px 1fr 110px 50px 100px 70px 70px 65px 75px 40px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>DATE</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>NAME</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>SKU</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>SIZE</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>PLATFORM</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>COST</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>PRICE</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>FEES</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>PROFIT</span>
              <span></span>
            </div>

            {/* TABLE ROWS */}
            {filteredSales.filter(s => {
              const search = (formData.salesSearch || '').toLowerCase();
              const filter = formData.salesFilter || 'all';
              const matchesSearch = !search || s.name?.toLowerCase().includes(search) || s.sku?.toLowerCase().includes(search) || s.size?.toLowerCase().includes(search);
              const matchesFilter = filter === 'all' || s.platform === filter;
              return matchesSearch && matchesFilter;
            }).sort((a, b) => {
              const sort = formData.salesSort || 'newest';
              if (sort === 'newest') return new Date(b.saleDate) - new Date(a.saleDate);
              if (sort === 'oldest') return new Date(a.saleDate) - new Date(b.saleDate);
              if (sort === 'profitHigh') return (b.profit || 0) - (a.profit || 0);
              if (sort === 'profitLow') return (a.profit || 0) - (b.profit || 0);
              if (sort === 'priceHigh') return (b.salePrice || 0) - (a.salePrice || 0);
              return 0;
            }).length ? filteredSales.filter(s => {
              const search = (formData.salesSearch || '').toLowerCase();
              const filter = formData.salesFilter || 'all';
              const matchesSearch = !search || s.name?.toLowerCase().includes(search) || s.sku?.toLowerCase().includes(search) || s.size?.toLowerCase().includes(search);
              const matchesFilter = filter === 'all' || s.platform === filter;
              return matchesSearch && matchesFilter;
            }).sort((a, b) => {
              const sort = formData.salesSort || 'newest';
              if (sort === 'newest') return new Date(b.saleDate) - new Date(a.saleDate);
              if (sort === 'oldest') return new Date(a.saleDate) - new Date(b.saleDate);
              if (sort === 'profitHigh') return (b.profit || 0) - (a.profit || 0);
              if (sort === 'profitLow') return (a.profit || 0) - (b.profit || 0);
              if (sort === 'priceHigh') return (b.salePrice || 0) - (a.salePrice || 0);
              return 0;
            }).map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '85px 1fr 110px 50px 100px 70px 70px 65px 75px 40px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: c.textMuted }}>{s.saleDate}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                <span style={{ fontSize: 11, color: c.emerald }}>{s.sku || '-'}</span>
                <span style={{ fontSize: 13 }}>{s.size || '-'}</span>
                <span style={{ fontSize: 11, color: c.textMuted }}>{s.platform}</span>
                <span style={{ fontSize: 12, textAlign: 'right', color: c.textMuted }}>{fmt(s.cost)}</span>
                <span style={{ fontSize: 12, textAlign: 'right' }}>{fmt(s.salePrice)}</span>
                <span style={{ fontSize: 12, textAlign: 'right', color: c.red }}>{fmt(s.fees)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: s.profit >= 0 ? c.emerald : c.red }}>{s.profit >= 0 ? '+' : ''}{fmt(s.profit)}</span>
                <button onClick={() => setSales(sales.filter(x => x.id !== s.id))} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            )) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>💵</div><p style={{ color: c.textMuted }}>No sales</p><button onClick={() => { setFormData({}); setModal('sale'); }} style={{ marginTop: 12, padding: '10px 20px', ...btnPrimary, fontSize: 13 }}>+ Record Sale</button></div>}
          </div>
        </div>}

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
        {page === 'mileage' && <div>
          <div style={{ ...cardStyle, padding: 20, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: c.textMuted, fontWeight: 600 }}>TOTAL MILES</p>
              <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color: c.emerald, fontStyle: 'italic' }}>{totalMiles.toFixed(1)} mi</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 11, color: c.textMuted, fontWeight: 600 }}>TAX DEDUCTION</p>
              <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color: c.gold, fontStyle: 'italic' }}>{fmt(totalMileageDeduction)}</p>
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: c.textMuted }}>{filteredMileage.length} trips</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => exportCSV(filteredMileage, 'mileage.csv', ['date','purpose','from','to','miles'])} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: '#fff', fontSize: 11, cursor: 'pointer' }}>📥 Export</button>
                <button onClick={() => { setFormData({}); setModal('mileage'); }} style={{ padding: '8px 16px', ...btnPrimary, fontSize: 12 }}>+ Log Trip</button>
              </div>
            </div>
            {filteredMileage.length ? filteredMileage.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: `1px solid ${c.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, background: 'rgba(251,191,36,0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🚗</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{m.purpose}</div>
                    <div style={{ fontSize: 12, color: c.textMuted }}>{m.date} • {m.from} → {m.to}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>{m.miles} mi</div>
                    <div style={{ fontSize: 12, color: c.gold }}>{fmt(m.miles * settings.mileageRate)}</div>
                  </div>
                  <button onClick={() => setMileage(mileage.filter(x => x.id !== m.id))} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
              </div>
            )) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>🚗</div><p style={{ color: c.textMuted }}>No mileage</p></div>}
          </div>
        </div>}

        {/* STORAGE */}
        {page === 'storage' && <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Total: <span style={{ color: c.red, fontWeight: 700 }}>{fmt(totalStor)}</span></span>
            <button onClick={() => { setFormData({}); setModal('storage'); }} style={{ padding: '8px 16px', ...btnPrimary, fontSize: 12 }}>+ Add Fee</button>
          </div>
          {filteredStorage.length ? filteredStorage.map(f => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: `1px solid ${c.border}` }}>
              <div>
                <div style={{ fontWeight: 600 }}>{f.month}</div>
                <div style={{ fontSize: 12, color: c.textMuted }}>{f.notes || 'Storage fee'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: c.red, fontWeight: 700 }}>{fmt(f.amount)}</span>
                <button onClick={() => setStorageFees(storageFees.filter(x => x.id !== f.id))} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
            </div>
          )) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>🏬</div><p style={{ color: c.textMuted }}>No storage fees</p></div>}
        </div>}

        {/* GOALS */}
        {page === 'goals' && <div style={{ maxWidth: 500 }}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 11, fontWeight: 700, color: c.textMuted, letterSpacing: '0.1em' }}>MONTHLY GOAL</label>
              <input type="number" value={goals.monthly} onChange={e => setGoals({ ...goals, monthly: +e.target.value || 0 })} style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 11, fontWeight: 700, color: c.textMuted, letterSpacing: '0.1em' }}>YEARLY GOAL</label>
              <input type="number" value={goals.yearly} onChange={e => setGoals({ ...goals, yearly: +e.target.value || 0 })} style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }} />
            </div>
            <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)', borderRadius: 14, padding: 18 }}>
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: c.textMuted, fontWeight: 600, fontSize: 11 }}>MONTHLY PROGRESS</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(netProfit)} / {fmt(goals.monthly)}</span>
                </div>
                <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: Math.min((netProfit / (goals.monthly || 1)) * 100, 100) + '%', background: `linear-gradient(90deg, ${c.emerald}, #059669)`, borderRadius: 10 }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: c.textMuted, fontWeight: 600, fontSize: 11 }}>YEARLY PROGRESS</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(netProfit)} / {fmt(goals.yearly)}</span>
                </div>
                <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: Math.min((netProfit / (goals.yearly || 1)) * 100, 100) + '%', background: `linear-gradient(90deg, ${c.gold}, #d97706)`, borderRadius: 10 }} />
                </div>
              </div>
            </div>
          </div>
        </div>}

        {/* TAX CENTER */}
        {page === 'taxes' && <div style={{ maxWidth: 550 }}>
          <div style={{ ...cardStyle, padding: 24, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700 }}>🧾 Tax Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: 16 }}>
                <p style={{ margin: 0, fontSize: 11, color: c.textMuted }}>NET PROFIT</p>
                <p style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800, color: c.emerald, fontStyle: 'italic' }}>{fmt(netProfit)}</p>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 16 }}>
                <p style={{ margin: 0, fontSize: 11, color: c.textMuted }}>TOTAL TAX</p>
                <p style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800, color: c.red, fontStyle: 'italic' }}>{fmt(totalTax)}</p>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16 }}>
              {[
                { l: 'Self-Employment Tax (15.3%)', v: selfEmploymentTax },
                { l: 'Federal Income Tax (~22%)', v: federalTax },
                { l: 'State Income Tax (~5%)', v: stateTax }
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 2 ? `1px solid ${c.border}` : 'none' }}>
                  <span style={{ color: c.textMuted }}>{t.l}</span>
                  <span style={{ color: c.red, fontWeight: 600 }}>{fmt(t.v)}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700 }}>📅 Quarterly Payments</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { q: 'Q1', due: 'Apr 15' },
                { q: 'Q2', due: 'Jun 15' },
                { q: 'Q3', due: 'Sep 15' },
                { q: 'Q4', due: 'Jan 15' }
              ].map(item => (
                <div key={item.q} style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 11, color: c.textMuted }}>{item.q}</p>
                  <p style={{ margin: '8px 0 4px', fontSize: 18, fontWeight: 800, color: c.emerald, fontStyle: 'italic' }}>{fmt(totalTax / 4)}</p>
                  <p style={{ margin: 0, fontSize: 10, color: c.textMuted }}>Due {item.due}</p>
                </div>
              ))}
            </div>
          </div>
        </div>}

        {/* CPA REPORTS */}
        {page === 'reports' && <div style={{ maxWidth: 900 }}>
          <div style={{ ...cardStyle, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              <div style={{ width: 50, height: 50, background: `linear-gradient(135deg, ${c.emerald}, #059669)`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📊</div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>CPA TAX PACKAGE</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>Everything your accountant needs</p>
              </div>
            </div>
          </div>

          {/* MONTHLY TOTALS - Each month individually */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, fontStyle: 'italic' }}>MONTHLY TOTALS</h3>
              <button onClick={() => {
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const rows = months.map((month, i) => {
                  const monthNum = String(i + 1).padStart(2, '0');
                  const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                  const cost = monthSales.reduce((sum, s) => sum + (s.cost || 0), 0);
                  const fees = monthSales.reduce((sum, s) => sum + (s.fees || 0), 0);
                  const profit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
                  const revenue = monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
                  const payout = revenue - fees;
                  return { month, cost, fees, profit, sellingPrice: revenue, payout };
                }).filter(r => r.cost > 0 || r.fees > 0 || r.profit > 0);
                rows.push({ month: 'TOTALS', cost: totalCOGS, fees: totalFees, profit: netProfit, sellingPrice: totalRevenue, payout: totalRevenue - totalFees });
                exportCSV(rows, 'monthly-totals.csv', ['month', 'cost', 'fees', 'profit', 'sellingPrice', 'payout']);
              }} style={{ padding: '8px 16px', background: c.emerald, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📥 Export CSV</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: c.textMuted }}></th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>COST</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>FEES</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>PROFIT</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>SELLING PRICE</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>PAYOUT</th>
                  </tr>
                </thead>
                <tbody>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => {
                    const monthNum = String(i + 1).padStart(2, '0');
                    const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                    const monthCost = monthSales.reduce((sum, s) => sum + (s.cost || 0), 0);
                    const monthFees = monthSales.reduce((sum, s) => sum + (s.fees || 0), 0);
                    const monthProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
                    const monthRevenue = monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
                    const monthPayout = monthRevenue - monthFees;
                    if (monthCost === 0 && monthFees === 0 && monthProfit === 0) return null;
                    return (
                      <tr key={month} style={{ borderBottom: `1px solid ${c.border}` }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{month}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: c.gold }}>{fmt(monthCost)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: c.red }}>{fmt(monthFees)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: monthProfit >= 0 ? c.emerald : c.red, fontWeight: 700 }}>{fmt(monthProfit)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#fff' }}>{fmt(monthRevenue)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: c.emerald }}>{fmt(monthPayout)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(16,185,129,0.1)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 800, fontStyle: 'italic' }}>Totals:</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: c.gold }}>{fmt(totalCOGS)}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: c.red }}>{fmt(totalFees)}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, color: netProfit >= 0 ? c.emerald : c.red }}>{fmt(netProfit)}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700 }}>{fmt(totalRevenue)}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: c.emerald }}>{fmt(totalRevenue - totalFees)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* YTD TOTALS - Running totals */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, fontStyle: 'italic' }}>YTD RUNNING TOTALS</h3>
              <button onClick={() => {
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                let runningCost = 0, runningFees = 0, runningProfit = 0, runningRevenue = 0, runningPayout = 0;
                const rows = months.map((month, i) => {
                  const monthNum = String(i + 1).padStart(2, '0');
                  const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                  runningCost += monthSales.reduce((sum, s) => sum + (s.cost || 0), 0);
                  runningFees += monthSales.reduce((sum, s) => sum + (s.fees || 0), 0);
                  runningProfit += monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
                  runningRevenue += monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
                  runningPayout = runningRevenue - runningFees;
                  return { month, ytdCost: runningCost, ytdFees: runningFees, ytdProfit: runningProfit, ytdSellingPrice: runningRevenue, ytdPayout: runningPayout };
                }).filter(r => r.ytdCost > 0 || r.ytdFees > 0 || r.ytdProfit > 0);
                exportCSV(rows, 'ytd-running-totals.csv', ['month', 'ytdCost', 'ytdFees', 'ytdProfit', 'ytdSellingPrice', 'ytdPayout']);
              }} style={{ padding: '8px 16px', background: c.emerald, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📥 Export CSV</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: c.textMuted }}></th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>YTD COST</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>YTD FEES</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>YTD PROFIT</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>YTD SELLING PRICE</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>YTD PAYOUT</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let runningCost = 0, runningFees = 0, runningProfit = 0, runningRevenue = 0, runningPayout = 0;
                    return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => {
                      const monthNum = String(i + 1).padStart(2, '0');
                      const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                      runningCost += monthSales.reduce((sum, s) => sum + (s.cost || 0), 0);
                      runningFees += monthSales.reduce((sum, s) => sum + (s.fees || 0), 0);
                      runningProfit += monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
                      runningRevenue += monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
                      runningPayout = runningRevenue - runningFees;
                      if (runningCost === 0 && runningFees === 0 && runningProfit === 0) return null;
                      return (
                        <tr key={month} style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{month}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: c.gold }}>{fmt(runningCost)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: c.red }}>{fmt(runningFees)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: runningProfit >= 0 ? c.emerald : c.red, fontWeight: 700 }}>{fmt(runningProfit)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#fff' }}>{fmt(runningRevenue)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: c.emerald }}>{fmt(runningPayout)}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* EXPORT BUTTONS */}
          <div style={{ ...cardStyle, padding: 20 }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>📥 Export Individual Reports</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => exportCSV(filteredSales, 'sales.csv', ['saleDate','name','sku','size','platform','salePrice','cost','fees','profit'])} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', cursor: 'pointer', textAlign: 'left' }}>Sales Report</button>
              <button onClick={() => exportCSV(filteredExpenses, 'expenses.csv', ['date','category','description','amount'])} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', cursor: 'pointer', textAlign: 'left' }}>Expenses Report</button>
              <button onClick={() => exportCSV(filteredMileage, 'mileage.csv', ['date','purpose','from','to','miles'])} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', cursor: 'pointer', textAlign: 'left' }}>Mileage Log</button>
              <button onClick={() => exportCSV(filteredInventory, 'inventory.csv', ['date','name','sku','size','cost'])} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', cursor: 'pointer', textAlign: 'left' }}>Inventory Report</button>
            </div>
          </div>
        </div>}

        {/* INTEGRATIONS */}
        {page === 'integrations' && <div style={{ maxWidth: 650 }}>
          {(stockxConnected || goatConnected || ebayConnected) && (
            <div style={{ ...cardStyle, padding: 20, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🔄 Sync All Platforms</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Pull latest sales from connected platforms</p>
              </div>
              <button onClick={() => { if (stockxConnected) syncPlatform('StockX'); if (goatConnected) syncPlatform('GOAT'); if (ebayConnected) syncPlatform('eBay'); }} disabled={syncing} style={{ padding: '12px 24px', ...btnPrimary, opacity: syncing ? 0.6 : 1 }}>
                {syncing ? '⏳ Syncing...' : '🔄 Sync Now'}
              </button>
            </div>
          )}

          {pendingCosts.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: 20 }}>
              <div style={{ padding: '16px 20px', background: 'rgba(251,191,36,0.05)', borderBottom: `1px solid ${c.border}` }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: c.gold }}>⚠️ Pending Cost Basis ({pendingCosts.length})</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Enter your purchase cost to calculate profit</p>
              </div>
              {pendingCosts.map(s => (
                <div key={s.id} style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: c.textMuted }}>Size {s.size} • {s.platform} • {s.saleDate}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13 }}>Sale: {fmt(s.salePrice)}</div>
                      <div style={{ color: c.emerald, fontWeight: 600 }}>Payout: {fmt(s.payout)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input type="number" placeholder="Enter cost" id={`cost_${s.id}`} style={{ ...inputStyle, flex: 1, padding: 10 }} />
                    <button onClick={() => { const input = document.getElementById(`cost_${s.id}`); if (input.value) confirmSaleWithCost(s.id, input.value); }} style={{ padding: '10px 18px', ...btnPrimary, fontSize: 12 }}>Confirm</button>
                    <button onClick={() => setPendingCosts(prev => prev.filter(x => x.id !== s.id))} style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 10, color: c.red, cursor: 'pointer' }}>Skip</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {[
            { name: 'StockX', code: 'SX', color: '#00c165', connected: stockxConnected, setConnected: setStockxConnected, desc: 'Auto-import your StockX sales' },
            { name: 'GOAT', code: 'GT', color: '#1a1a1a', border: '#333', connected: goatConnected, setConnected: setGoatConnected, desc: 'Auto-import your GOAT sales' },
            { name: 'eBay', code: 'eB', color: '#e53238', connected: ebayConnected, setConnected: setEbayConnected, desc: 'Auto-import your eBay sales' },
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
                  <span style={{ color: c.emerald, fontWeight: 600, fontSize: 12 }}>✓ Connected</span>
                </div>
              )}
            </div>
          ))}
        </div>}

        {/* SETTINGS */}
        {page === 'settings' && <div style={{ maxWidth: 550 }}>
          <div style={{ ...cardStyle, padding: 24, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: c.textMuted }}>📍 IRS MILEAGE RATE</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: c.textMuted }}>$</span>
              <input type="number" step="0.01" value={settings.mileageRate} onChange={e => setSettings({ ...settings, mileageRate: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 100 }} />
              <span style={{ color: c.textMuted }}>per mile</span>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11, color: c.textMuted }}>2025 IRS standard rate: $0.70/mile</p>
          </div>

          {[
            { name: 'STOCKX STANDARD', code: 'Standard', color: '#00c165', fields: [{ l: 'Seller Level', k: 'stockxLevel', opts: [[9,'Level 1 (9%)'],[8.5,'Level 2 (8.5%)'],[8,'Level 3 (8%)'],[7.5,'Level 4 (7.5%)'],[7,'Level 5 (7%)']] },{ l: 'Processing', k: 'stockxProcessing', opts: [[3,'3%'],[0,'0% (Seller+)']] }], checkbox: { label: 'Quick Ship Bonus (-2%)', key: 'stockxQuickShip' }, total: settings.stockxLevel + settings.stockxProcessing + (settings.stockxQuickShip ? -2 : 0) },
            { name: 'STOCKX DIRECT', code: 'Direct', color: '#00c165', fields: [{ l: 'Commission', k: 'stockxDirectFee', opts: [[5,'5%'],[4,'4%'],[3,'3%']] },{ l: 'Processing', k: 'stockxDirectProcessing', opts: [[3,'3%'],[0,'0%']] }], total: settings.stockxDirectFee + settings.stockxDirectProcessing },
            { name: 'STOCKX FLEX', code: 'Flex', color: '#00c165', fields: [{ l: 'Commission', k: 'stockxFlexFee', opts: [[5,'5%'],[4,'4%'],[3,'3%']] },{ l: 'Processing', k: 'stockxFlexProcessing', opts: [[3,'3%'],[0,'0%']] },{ l: 'Fulfillment', k: 'stockxFlexFulfillment', opts: [[5,'$5'],[4,'$4'],[3,'$3'],[0,'$0']] }], total: settings.stockxFlexFee + settings.stockxFlexProcessing, extra: `+ $${settings.stockxFlexFulfillment}` },
            { name: 'GOAT', code: 'GOAT', color: '#1a1a1a', border: '#333', fields: [{ l: 'Commission', k: 'goatFee', opts: [[9.5,'9.5%'],[9,'9%'],[8,'8%'],[7,'7%']] },{ l: 'Cash Out', k: 'goatProcessing', opts: [[2.9,'2.9%'],[0,'0% (Credit)']] }], total: settings.goatFee + settings.goatProcessing },
            { name: 'EBAY', code: 'eBay', color: '#e53238', fields: [{ l: 'Final Value Fee', k: 'ebayFee', opts: [[13.25,'13.25%'],[12.9,'12.9%'],[11.5,'11.5%'],[10,'10%'],[8,'8% ($150+)']] }], total: settings.ebayFee }
          ].map(platform => (
            <div key={platform.name} style={{ ...cardStyle, padding: 22, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ minWidth: 50, height: 40, paddingLeft: 8, paddingRight: 8, background: platform.color, border: platform.border ? `2px solid ${platform.border}` : 'none', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: '#fff' }}>{platform.code}</div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, fontStyle: 'italic' }}>{platform.name}</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {platform.fields.map(field => (
                  <div key={field.k}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 10, color: c.textMuted, fontWeight: 700, letterSpacing: '0.05em' }}>{field.l.toUpperCase()}</label>
                    <select value={settings[field.k]} onChange={e => setSettings({ ...settings, [field.k]: parseFloat(e.target.value) })} style={{ ...inputStyle, background: 'rgba(0,0,0,0.3)', cursor: 'pointer', fontSize: 13 }}>
                      {field.opts.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {platform.checkbox && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings[platform.checkbox.key]} onChange={e => setSettings({ ...settings, [platform.checkbox.key]: e.target.checked })} style={{ accentColor: c.emerald, width: 16, height: 16 }} />
                  {platform.checkbox.label}
                </label>
              )}
              {platform.total !== undefined && (
                <div style={{ marginTop: 14, padding: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 700, letterSpacing: '0.1em' }}>TOTAL FEE</span>
                  <span style={{ fontWeight: 800, color: c.emerald, fontStyle: 'italic', fontSize: 16 }}>{platform.total}%{platform.extra && ` ${platform.extra}`}</span>
                </div>
              )}
            </div>
          ))}
        </div>}
      </main>

      {/* MODAL */}
      {modal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ background: 'linear-gradient(180deg, #111 0%, #0a0a0a 100%)', border: `1px solid ${c.border}`, borderRadius: 20, width: 420, maxHeight: '90vh', overflow: 'auto' }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#111' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>
              {modal === 'purchase' ? 'ADD PURCHASE' : modal === 'bulkAdd' ? 'BULK ADD ITEMS' : modal === 'sale' ? 'RECORD SALE' : modal === 'expense' ? 'ADD EXPENSE' : modal === 'storage' ? 'ADD STORAGE FEE' : 'LOG MILEAGE'}
            </h3>
            <button onClick={() => setModal(null)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ padding: 22 }}>
            {modal === 'purchase' && <>
              <input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.sku || ''} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="Style Code (e.g., DH6927-111)" style={{ ...inputStyle, marginBottom: 12 }} />
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
                  style={{ width: '100%', padding: 10, background: 'rgba(16,185,129,0.1)', border: `1px dashed rgba(16,185,129,0.3)`, borderRadius: 8, color: c.emerald, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >+ Add Another Size</button>
              </div>
              
              <div style={{ padding: 14, background: 'rgba(16,185,129,0.1)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: c.textMuted, fontSize: 13 }}>Items to add:</span>
                <span style={{ fontWeight: 800, fontSize: 20, color: c.emerald }}>{(formData.bulkRows || []).filter(r => r.size && r.cost).length}</span>
              </div>
            </>}
            {modal === 'sale' && <>
              <input value={formData.saleName || ''} onChange={e => setFormData({ ...formData, saleName: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.saleSku || ''} onChange={e => setFormData({ ...formData, saleSku: e.target.value })} placeholder="Style Code" style={{ ...inputStyle, flex: 1 }} />
                <input value={formData.saleSize || ''} onChange={e => setFormData({ ...formData, saleSize: e.target.value })} placeholder="Size *" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input type="number" value={formData.saleCost || ''} onChange={e => setFormData({ ...formData, saleCost: e.target.value })} placeholder="Your cost *" style={{ ...inputStyle, flex: 1 }} />
                <input type="number" value={formData.salePrice || ''} onChange={e => setFormData({ ...formData, salePrice: e.target.value })} placeholder="Sale price *" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <select value={formData.platform || 'StockX Standard'} onChange={e => setFormData({ ...formData, platform: e.target.value })} style={{ ...inputStyle, marginBottom: 12, cursor: 'pointer' }}>
                <option>StockX Standard</option>
                <option>StockX Direct</option>
                <option>StockX Flex</option>
                <option>GOAT</option>
                <option>eBay</option>
                <option>Local</option>
              </select>
              <input type="date" value={formData.saleDate || ''} onChange={e => setFormData({ ...formData, saleDate: e.target.value })} style={inputStyle} />
              {formData.saleCost && formData.salePrice && (
                <div style={{ marginTop: 16, padding: 16, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: c.textMuted }}>Est. Profit</span>
                  <span style={{ fontWeight: 800, fontSize: 24, color: c.emerald, fontStyle: 'italic' }}>
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
              else if (modal === 'expense') addExpense(); 
              else if (modal === 'storage') addStorage(); 
              else if (modal === 'mileage') addMileage(); 
            }} style={{ flex: 1, padding: 14, ...btnPrimary, fontSize: 13 }}>
              {modal === 'purchase' ? 'ADD ITEM' : modal === 'bulkAdd' ? `ADD ${(formData.bulkRows || []).filter(r => r.size && r.cost).length} ITEMS` : modal === 'sale' ? 'RECORD 💰' : modal === 'mileage' ? 'LOG TRIP' : 'ADD'}
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
      `}</style>
    </div>
  );
}
