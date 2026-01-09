import { useState, useEffect } from 'react';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [modal, setModal] = useState(null);
  const [year, setYear] = useState('2025');
  const [csvImport, setCsvImport] = useState({ show: false, data: [], filteredData: [], year: 'all', month: 'all', preview: false, headers: [] });
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
  const [stockxConnected, setStockxConnected] = useState(() => {
    return !!localStorage.getItem('flipledger_stockx_token');
  });
  const [stockxToken, setStockxToken] = useState(() => {
    return localStorage.getItem('flipledger_stockx_token') || null;
  });
  const [goatConnected, setGoatConnected] = useState(false);
  const [ebayConnected, setEbayConnected] = useState(false);
  const [qbConnected, setQbConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingCosts, setPendingCosts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('flipledger_pending')) || []; }
    catch { return []; }
  });
  const [selectedPending, setSelectedPending] = useState(new Set());
  const [bulkCost, setBulkCost] = useState('');
  const [selectedSales, setSelectedSales] = useState(new Set());

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

  // Save to localStorage whenever data changes
  useEffect(() => { localStorage.setItem('flipledger_purchases', JSON.stringify(purchases)); }, [purchases]);
  useEffect(() => { localStorage.setItem('flipledger_sales', JSON.stringify(sales)); }, [sales]);
  useEffect(() => { localStorage.setItem('flipledger_expenses', JSON.stringify(expenses)); }, [expenses]);
  useEffect(() => { localStorage.setItem('flipledger_storage', JSON.stringify(storageFees)); }, [storageFees]);
  useEffect(() => { localStorage.setItem('flipledger_mileage', JSON.stringify(mileage)); }, [mileage]);
  useEffect(() => { localStorage.setItem('flipledger_goals', JSON.stringify(goals)); }, [goals]);
  useEffect(() => { localStorage.setItem('flipledger_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('flipledger_pending', JSON.stringify(pendingCosts)); }, [pendingCosts]);

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
    const costNum = parseFloat(cost);
    // Use actual payout from StockX, calculate profit
    const profit = sale.payout - costNum;
    setSales(prev => [...prev, { 
      ...sale, 
      id: Date.now(),
      orderId: sale.id, // KEEP original order number for deduplication!
      cost: costNum, 
      platform: channel,
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

  // CSV Import for StockX
  const handleCsvUpload = (e) => {
    const file = e.target?.files?.[0] || e;
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      // Debug: log headers to console
      console.log('CSV Headers:', headers);
      
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        // Handle CSV with commas inside quotes - improved regex
        const values = [];
        let current = '';
        let inQuotes = false;
        for (const char of lines[i]) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());
        
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] ? values[idx].replace(/"/g, '').trim() : '';
        });
        
        // Find the date field (try multiple possible names)
        const dateField = row['Sale Date'] || row['SaleDate'] || row['Date'] || row['Order Date'] || row['Sold Date'] || '';
        if (dateField) {
          row['_parsedDate'] = parseDate(dateField);
          row['_originalDate'] = dateField;
          parsed.push(row);
        }
      }
      
      // Log sample data for debugging
      console.log('Sample parsed rows:', parsed.slice(0, 3));
      console.log('Sample dates:', parsed.slice(0, 5).map(r => ({ original: r['_originalDate'], parsed: r['_parsedDate'] })));
      
      setCsvImport({ ...csvImport, show: true, data: parsed, headers: headers, preview: true });
    };
    reader.readAsText(file);
  };

  // Handle drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleCsvUpload({ target: { files: [file] } });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const filterCsvData = () => {
    const { data, year: filterYear, month: filterMonth } = csvImport;
    return data.filter(row => {
      const parsedDate = row['_parsedDate'] || '';
      if (!parsedDate) return false;
      
      const rowYear = parsedDate.substring(0, 4);
      const rowMonth = parsedDate.substring(5, 7);
      
      // "all" year means show everything
      if (filterYear !== 'all' && rowYear !== filterYear) return false;
      if (filterMonth !== 'all' && rowMonth !== filterMonth) return false;
      return true;
    });
  };

  const importCsvSales = () => {
    const filtered = filterCsvData();
    // Only grab what we actually USE - nothing extra
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
        saleDate: row['_parsedDate'] || ''
      };
    });
    
    // Avoid duplicates - check pending (by id) AND confirmed sales (by orderId)
    const existingIds = new Set([
      ...pendingCosts.map(p => p.id),
      ...sales.map(s => s.orderId || s.id) // orderId is the original order number
    ]);
    const uniqueNew = newPending.filter(p => !existingIds.has(p.id));
    
    setPendingCosts([...pendingCosts, ...uniqueNew]);
    setCsvImport({ show: false, data: [], filteredData: [], year: 'all', month: 'all', preview: false, headers: [] });
    
    // Clear message based on what happened
    if (uniqueNew.length === 0) {
      alert(`All ${newPending.length} sales already imported - nothing new to add.`);
    } else if (newPending.length - uniqueNew.length > 0) {
      alert(`Imported ${uniqueNew.length} NEW sales! (${newPending.length - uniqueNew.length} already existed)`);
    } else {
      alert(`Imported ${uniqueNew.length} sales!`);
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
    { id: 'inventory', label: 'Inventory', icon: '◫', count: filteredInventory.length },
    { id: 'sales', label: 'Sales', icon: '◈', count: filteredSales.length },
    { type: 'divider' },
    { id: 'expenses', label: 'Expenses', icon: '◧' },
    { id: 'reports', label: 'CPA Reports', icon: '📊' },
    { type: 'divider' },
    { id: 'integrations', label: 'Integrations', icon: '🔗', badge: pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length || null },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  const inputStyle = { width: '100%', padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14, boxSizing: 'border-box', outline: 'none' };
  const cardStyle = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 20, overflow: 'hidden' };
  const btnPrimary = { background: `linear-gradient(135deg, ${c.emerald} 0%, #059669 100%)`, border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: `0 8px 32px ${c.emeraldGlow}` };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: c.bg, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: c.text }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 0% 0%, rgba(16,185,129,0.07) 0%, transparent 50%), radial-gradient(ellipse at 100% 100%, rgba(251,191,36,0.04) 0%, transparent 50%)` }} />

      <aside className="no-print" style={{ width: 240, minWidth: 240, background: 'rgba(5,5,5,0.95)', borderRight: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <div style={{ padding: 20, borderBottom: `1px solid ${c.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, background: `linear-gradient(135deg, ${c.emerald}, #059669)`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, boxShadow: `0 8px 32px ${c.emeraldGlow}`, fontStyle: 'italic' }}>F</div>
            <div><div style={{ fontWeight: 800, fontSize: 18, fontStyle: 'italic' }}>FLIP<span style={{ color: c.emerald }}>LEDGER</span></div><div style={{ fontSize: 9, color: c.gold, letterSpacing: '0.1em' }}>GET YOUR MONEY RIGHT</div></div>
          </div>
        </div>

        <div style={{ padding: '12px' }}>
          <select value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%', padding: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, color: c.emerald, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <option value="all">All Years</option>
            {[2026,2025,2024].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <nav style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
          {navItems.map((item, i) => item.type === 'divider' ? <div key={i} style={{ height: 1, background: c.border, margin: '8px' }} /> : (
            <button key={item.id} className="nav-item" onClick={() => setPage(item.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12, width: '100%', padding: '11px 14px', marginBottom: 2, border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: page === item.id ? 'rgba(16,185,129,0.15)' : 'transparent', color: page === item.id ? c.emerald : c.textMuted, transition: 'all 0.2s' }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span>{item.label}</span>
              {item.badge && <span style={{ marginLeft: 'auto', background: c.red, padding: '2px 8px', borderRadius: 10, fontSize: 10 }}>{item.badge}</span>}
              {item.count !== undefined && <span style={{ marginLeft: 'auto', background: 'rgba(16,185,129,0.2)', padding: '2px 8px', borderRadius: 8, fontSize: 11 }}>{item.count}</span>}
            </button>
          ))}
        </nav>

        <div style={{ padding: 12, borderTop: `1px solid ${c.border}` }}>
          <button className="btn-hover" onClick={() => { setFormData({}); setModal('purchase'); }} style={{ width: '100%', padding: 10, marginBottom: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Add Purchase</button>
          <button className="btn-hover" onClick={() => { setFormData({}); setModal('sale'); }} style={{ width: '100%', padding: 10, ...btnPrimary, fontSize: 12 }}>+ Record Sale</button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: '28px 36px', overflowY: 'auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, fontStyle: 'italic' }}>{navItems.find(n => n.id === page)?.label?.toUpperCase() || 'DASHBOARD'}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>{year === 'all' ? 'All time' : `Tax Year ${year}`}</p>
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
              <button className="btn-hover" onClick={() => setPage('integrations')} style={{ padding: '8px 16px', background: c.gold, border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', color: '#000' }}>REVIEW</button>
            </div>
          )}

          {/* HERO PROFIT CARD */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.02) 50%, transparent 100%)',
            border: '1px solid rgba(16,185,129,0.15)',
            borderRadius: 24,
            padding: '40px 48px',
            marginBottom: 24,
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div className="shimmer-line" style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.6), transparent)' }} />
            <div className="breathe" style={{ position: 'absolute', top: -150, right: -100, width: 400, height: 400, background: 'radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 60%)', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <LivePulse color="#10b981" size={10} speed={2} label="NET PROFIT YTD" />
                  <StatusIndicator status="live" />
                </div>
                
                <div style={{ fontSize: 72, fontWeight: 800, color: c.emerald, lineHeight: 1, textShadow: '0 0 80px rgba(16,185,129,0.5)', letterSpacing: '-0.02em' }}>
                  {fmt(netProfit)}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, position: 'relative' }}>
                      📦
                      <div style={{ position: 'absolute', top: -3, right: -3 }}><LivePulse color="#10b981" size={6} speed={2.5} /></div>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: c.textMuted, fontWeight: 600 }}>TOTAL SALES</p>
                      <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 800 }}>{filteredSales.length}</p>
                    </div>
                  </div>
                  <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.1)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, position: 'relative' }}>
                      🎯
                      <div style={{ position: 'absolute', top: -3, right: -3 }}><LivePulse color="#10b981" size={6} speed={3} /></div>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: c.textMuted, fontWeight: 600 }}>AVG PER SALE</p>
                      <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 800 }}>{filteredSales.length > 0 ? fmt(netProfit / filteredSales.length) : '$0'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Circular Progress */}
              <div style={{ position: 'relative', width: 180, height: 180 }}>
                <svg width="180" height="180" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="90" cy="90" r="75" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                  <circle cx="90" cy="90" r="75" fill="none" stroke="url(#profitGrad)" strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${totalRevenue > 0 ? (netProfit / totalRevenue * 100) * 4.71 : 0} 471`}
                    style={{ filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.5))' }} />
                  <defs><linearGradient id="profitGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#34d399" /></linearGradient></defs>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <LivePulse color="#10b981" size={6} speed={2} label="MARGIN" style={{ marginBottom: 4 }} />
                  <span style={{ fontSize: 36, fontWeight: 800, color: c.emerald }}>{totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : '0'}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* STATS ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Gross Revenue', value: totalRevenue, icon: '📈', color: '#fff' },
              { label: 'Cost of Goods', value: totalCOGS, icon: '📦', color: c.gold },
              { label: 'Platform Fees', value: totalFees, icon: '💳', color: c.red },
              { label: 'Inventory Value', value: inventoryVal, icon: '🏪', color: '#8b5cf6' },
            ].map((stat, i) => (
              <div key={i} className="stat-card" style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${c.border}`,
                borderRadius: 20,
                padding: '24px',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s'
              }}>
                <div style={{ position: 'absolute', top: 16, right: 16 }}><LivePulse color={stat.color} size={6} speed={2 + i * 0.3} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `${stat.color}10`, border: `1px solid ${stat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{stat.icon}</div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: c.textMuted }}>{stat.label}</span>
                </div>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: stat.color }}>{fmt(stat.value)}</p>
              </div>
            ))}
          </div>

          {/* TWO COLUMN - TABLE & CHART */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* MONTHLY TABLE */}
            <div style={{ ...cardStyle }}>
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Monthly Breakdown</h3>
                  <LivePulse color="#10b981" size={6} speed={2} />
                </div>
                <StatusIndicator status="profit" label={`+${fmt(netProfit)}`} />
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 300 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: c.textMuted, letterSpacing: '0.08em' }}>MONTH</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: c.textMuted }}>SALES</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: c.textMuted }}>REVENUE</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: c.textMuted }}>PROFIT</th>
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
                            <span style={{ fontSize: 14, fontWeight: 700, color: c.emerald, background: 'rgba(16,185,129,0.1)', padding: '6px 12px', borderRadius: 6 }}>+{fmt(monthProfit)}</span>
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
                        <span style={{ fontSize: 16, fontWeight: 800, color: c.emerald, textShadow: '0 0 20px rgba(16,185,129,0.4)' }}>+{fmt(netProfit)}</span>
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
        {page === 'sales' && (() => {
          // Get filtered sales once to use everywhere
          const getFilteredSalesDisplay = () => filteredSales.filter(s => {
            const search = (formData.salesSearch || '').toLowerCase().trim();
            const filter = formData.salesFilter || 'all';
            const monthFilter = formData.salesMonth || 'all';
            
            // Search matches - check if search term is in name, sku, or size
            let matchesSearch = true;
            if (search) {
              const nameMatch = s.name?.toLowerCase().includes(search);
              const skuMatch = s.sku?.toLowerCase().includes(search);
              const sizeMatch = s.size?.toString().toLowerCase().includes(search);
              matchesSearch = nameMatch || skuMatch || sizeMatch;
            }
            
            const matchesFilter = filter === 'all' || s.platform === filter;
            const matchesMonth = monthFilter === 'all' || (s.saleDate && s.saleDate.substring(5, 7) === monthFilter);
            return matchesSearch && matchesFilter && matchesMonth;
          });
          
          // Sort function based on current sort setting
          const sortSales = (salesList) => {
            const sort = formData.salesSort || 'newest';
            return [...salesList].sort((a, b) => {
              switch(sort) {
                case 'newest': return new Date(b.saleDate) - new Date(a.saleDate);
                case 'oldest': return new Date(a.saleDate) - new Date(b.saleDate);
                case 'profitHigh': return (b.profit || 0) - (a.profit || 0);
                case 'profitLow': return (a.profit || 0) - (b.profit || 0);
                case 'priceHigh': return (b.salePrice || 0) - (a.salePrice || 0);
                case 'priceLow': return (a.salePrice || 0) - (b.salePrice || 0);
                case 'costHigh': return (b.cost || 0) - (a.cost || 0);
                case 'costLow': return (a.cost || 0) - (b.cost || 0);
                case 'nameAZ': return (a.name || '').localeCompare(b.name || '');
                case 'nameZA': return (b.name || '').localeCompare(a.name || '');
                case 'skuAZ': return (a.sku || '').localeCompare(b.sku || '');
                case 'skuZA': return (b.sku || '').localeCompare(a.sku || '');
                case 'sizeAsc': return (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0);
                case 'sizeDesc': return (parseFloat(b.size) || 0) - (parseFloat(a.size) || 0);
                case 'platformAZ': return (a.platform || '').localeCompare(b.platform || '');
                case 'feesHigh': return (b.fees || 0) - (a.fees || 0);
                case 'feesLow': return (a.fees || 0) - (b.fees || 0);
                default: return 0;
              }
            });
          };
          
          const displayedSales = sortSales(getFilteredSalesDisplay());
          const displayedProfit = displayedSales.reduce((sum, s) => sum + (s.profit || 0), 0);
          
          // Clickable header component
          const SortHeader = ({ label, sortKey, sortKeyAlt, align = 'left' }) => {
            const isActive = formData.salesSort === sortKey || formData.salesSort === sortKeyAlt;
            const isAsc = formData.salesSort === sortKey;
            return (
              <span 
                onClick={() => {
                  if (formData.salesSort === sortKey) {
                    setFormData({ ...formData, salesSort: sortKeyAlt });
                  } else {
                    setFormData({ ...formData, salesSort: sortKey });
                  }
                }}
                style={{ 
                  fontSize: 10, 
                  fontWeight: 700, 
                  color: isActive ? c.emerald : c.textMuted, 
                  cursor: 'pointer',
                  textAlign: align,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
                  userSelect: 'none'
                }}
              >
                {label}
                {isActive && <span style={{ fontSize: 8 }}>{isAsc ? '▲' : '▼'}</span>}
              </span>
            );
          };
          
          return <div>
          {/* STATS BAR */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL SALES</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: '#fff' }}>{displayedSales.length}</p>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL PROFIT</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: displayedProfit >= 0 ? c.emerald : c.red }}>{fmt(displayedProfit)}</p>
            </div>
          </div>

          {/* SEARCH & FILTERS */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="🔍 Search by name, SKU, or size..." 
              value={formData.salesSearch || ''} 
              onChange={e => setFormData({ ...formData, salesSearch: e.target.value })}
              style={{ flex: 1, minWidth: 200, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14 }} 
            />
            <select value={formData.salesMonth || 'all'} onChange={e => setFormData({ ...formData, salesMonth: e.target.value })} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Months</option>
              <option value="01">January</option>
              <option value="02">February</option>
              <option value="03">March</option>
              <option value="04">April</option>
              <option value="05">May</option>
              <option value="06">June</option>
              <option value="07">July</option>
              <option value="08">August</option>
              <option value="09">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
            <select value={formData.salesFilter || 'all'} onChange={e => setFormData({ ...formData, salesFilter: e.target.value })} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Platforms</option>
              <option value="StockX Standard">StockX Standard</option>
              <option value="StockX Direct">StockX Direct</option>
              <option value="StockX Flex">StockX Flex</option>
              <option value="GOAT">GOAT</option>
              <option value="eBay">eBay</option>
              <option value="Local">Local</option>
            </select>
            <button onClick={() => { setFormData({}); setModal('sale'); }} style={{ padding: '14px 24px', ...btnPrimary, fontSize: 13 }}>+ RECORD SALE</button>
          </div>

          {/* BULK DELETE BAR - shows when items selected */}
          {selectedSales.size > 0 && (
            <div style={{ marginBottom: 16, padding: '12px 20px', background: 'rgba(239,68,68,0.15)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: c.red, fontSize: 14 }}>
                {selectedSales.size} sale{selectedSales.size > 1 ? 's' : ''} selected
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button 
                  onClick={() => setSelectedSales(new Set())}
                  style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}
                >
                  Clear Selection
                </button>
                <button 
                  onClick={() => {
                    if (confirm(`Delete ${selectedSales.size} sale${selectedSales.size > 1 ? 's' : ''}? This cannot be undone.`)) {
                      setSales(prev => prev.filter(s => !selectedSales.has(s.id)));
                      setSelectedSales(new Set());
                    }
                  }}
                  style={{ padding: '8px 20px', background: c.red, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  🗑️ Delete {selectedSales.size} Sale{selectedSales.size > 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* SALES TABLE */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: c.textMuted }}>Showing {displayedSales.length} sales</span>
              <button onClick={() => exportCSV(displayedSales, 'sales.csv', ['saleDate','name','sku','size','platform','salePrice','cost','fees','profit'])} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>📥 Export</button>
            </div>
            
            {/* TABLE HEADER - Clickable for sorting */}
            <div style={{ display: 'grid', gridTemplateColumns: '40px 85px 1fr 110px 50px 100px 70px 70px 65px 75px 30px 30px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input 
                  type="checkbox"
                  checked={displayedSales.length > 0 && displayedSales.every(s => selectedSales.has(s.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedSales(new Set(displayedSales.map(s => s.id)));
                    } else {
                      setSelectedSales(new Set());
                    }
                  }}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.emerald }}
                />
              </div>
              <SortHeader label="DATE" sortKey="oldest" sortKeyAlt="newest" />
              <SortHeader label="NAME" sortKey="nameAZ" sortKeyAlt="nameZA" />
              <SortHeader label="SKU" sortKey="skuAZ" sortKeyAlt="skuZA" />
              <SortHeader label="SIZE" sortKey="sizeAsc" sortKeyAlt="sizeDesc" />
              <SortHeader label="PLATFORM" sortKey="platformAZ" sortKeyAlt="platformAZ" />
              <SortHeader label="COST" sortKey="costLow" sortKeyAlt="costHigh" align="right" />
              <SortHeader label="PRICE" sortKey="priceLow" sortKeyAlt="priceHigh" align="right" />
              <SortHeader label="FEES" sortKey="feesLow" sortKeyAlt="feesHigh" align="right" />
              <SortHeader label="PROFIT" sortKey="profitLow" sortKeyAlt="profitHigh" align="right" />
              <span></span>
              <span></span>
            </div>

            {/* TABLE ROWS */}
            {displayedSales.length ? displayedSales.map(s => (
              <div 
                key={s.id} 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '40px 85px 1fr 110px 50px 100px 70px 70px 65px 75px 30px 30px', 
                  padding: '12px 20px', 
                  borderBottom: `1px solid ${c.border}`, 
                  alignItems: 'center',
                  background: selectedSales.has(s.id) ? 'rgba(239,68,68,0.1)' : 'transparent'
                }}
              >
                <div>
                  <input 
                    type="checkbox"
                    checked={selectedSales.has(s.id)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedSales);
                      if (e.target.checked) {
                        newSelected.add(s.id);
                      } else {
                        newSelected.delete(s.id);
                      }
                      setSelectedSales(newSelected);
                    }}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.emerald }}
                  />
                </div>
                <span style={{ fontSize: 12, color: c.textMuted }}>{s.saleDate}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                <span style={{ fontSize: 11, color: c.emerald }}>{s.sku || '-'}</span>
                <span style={{ fontSize: 13 }}>{s.size || '-'}</span>
                <span style={{ fontSize: 11, color: c.textMuted }}>{s.platform}</span>
                <span style={{ fontSize: 12, textAlign: 'right', color: c.textMuted }}>{fmt(s.cost)}</span>
                <span style={{ fontSize: 12, textAlign: 'right' }}>{fmt(s.salePrice)}</span>
                <span style={{ fontSize: 12, textAlign: 'right', color: c.red }}>{fmt(s.fees)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: s.profit >= 0 ? c.emerald : c.red }}>{s.profit >= 0 ? '+' : ''}{fmt(s.profit)}</span>
                <button onClick={() => { setFormData({ editSaleId: s.id, saleName: s.name, saleSku: s.sku, saleSize: s.size, saleCost: s.cost, salePrice: s.salePrice, saleDate: s.saleDate, platform: s.platform, sellerLevel: s.sellerLevel || settings.stockxLevel }); setModal('editSale'); }} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 14 }}>✏️</button>
                <button onClick={() => { setSales(sales.filter(x => x.id !== s.id)); setSelectedSales(prev => { const n = new Set(prev); n.delete(s.id); return n; }); }} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            )) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>💵</div><p style={{ color: c.textMuted }}>No sales match your filters</p><button onClick={() => { setFormData({}); setModal('sale'); }} style={{ marginTop: 12, padding: '10px 20px', ...btnPrimary, fontSize: 13 }}>+ Record Sale</button></div>}
          </div>
        </div>;
        })()}

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
            <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: 20, marginTop: 24, border: `2px solid ${c.emerald}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>NET PROFIT (Schedule C, Line 31)</span>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: c.textMuted }}>Gross Sales − COGS − Fees − Expenses</p>
                </div>
                <span style={{ fontSize: 32, fontWeight: 800, color: (totalRevenue - totalCOGS - totalFees - totalExp) >= 0 ? c.emerald : c.red }}>
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
              }} style={{ padding: '8px 16px', background: c.emerald, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📥 Export CSV</button>
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
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: monthProfit >= 0 ? c.emerald : c.red }}>{fmt(monthProfit)}</td>
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
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: (totalRevenue - totalCOGS - totalFees) >= 0 ? c.emerald : c.red }}>{fmt(totalRevenue - totalCOGS - totalFees)}</td>
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

        {/* INTEGRATIONS */}
        {page === 'integrations' && <div style={{ maxWidth: 750 }}>
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
              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', background: 'rgba(251,191,36,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${c.border}` }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: c.gold }}>⚡ Bulk Cost Entry</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Select multiple items to apply same cost</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select 
                      id="pendingSort"
                      defaultValue="date"
                      onChange={(e) => {
                        const sortBy = e.target.value;
                        setPendingCosts(prev => {
                          const sorted = [...prev];
                          if (sortBy === 'item') sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                          if (sortBy === 'date') sorted.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
                          if (sortBy === 'price') sorted.sort((a, b) => (b.salePrice || 0) - (a.salePrice || 0));
                          return sorted;
                        });
                      }}
                      style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12, cursor: 'pointer' }}
                    >
                      <option value="date">Sort: Date</option>
                      <option value="item">Sort: Item Name</option>
                      <option value="price">Sort: Price</option>
                    </select>
                    <button onClick={() => { 
                      const yearPending = pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year)));
                      if (confirm(`Delete all ${yearPending.length} pending sales?`)) {
                        setPendingCosts(pendingCosts.filter(s => !(year === 'all' || (s.saleDate && s.saleDate.startsWith(year)))));
                        setSelectedPending(new Set());
                      }
                    }} style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 10, color: c.red, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      🗑️ Clear All
                    </button>
                  </div>
                </div>

                {/* Multi-Select Action Bar - shows when items selected */}
                {selectedPending.size > 0 && (
                  <div style={{ padding: '12px 20px', background: 'rgba(16,185,129,0.15)', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontWeight: 700, color: c.emerald, fontSize: 14 }}>
                      {selectedPending.size} selected
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <span style={{ fontSize: 13, color: c.textMuted }}>Cost each:</span>
                      <input 
                        type="number" 
                        placeholder="$0.00"
                        value={bulkCost}
                        onChange={e => setBulkCost(e.target.value)}
                        style={{ 
                          width: 100, 
                          padding: '10px 14px', 
                          background: 'rgba(255,255,255,0.1)', 
                          border: `2px solid ${c.emerald}`, 
                          borderRadius: 8, 
                          color: c.text, 
                          fontSize: 15, 
                          fontWeight: 600,
                          textAlign: 'center'
                        }} 
                      />
                      <button 
                        onClick={() => {
                          if (!bulkCost) { alert('Enter a cost first'); return; }
                          selectedPending.forEach(id => {
                            confirmSaleWithCost(id, bulkCost, 'StockX Standard');
                          });
                          setSelectedPending(new Set());
                          setBulkCost('');
                        }}
                        style={{ padding: '10px 20px', ...btnPrimary, fontSize: 13 }}
                      >
                        ✓ Apply to {selectedPending.size} Items
                      </button>
                    </div>
                    <button 
                      onClick={() => setSelectedPending(new Set())}
                      style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}
                    >
                      Clear Selection
                    </button>
                  </div>
                )}
                
                {/* Bulk Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: 40 }}>
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
                            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: c.emerald }}
                          />
                        </th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: c.textMuted, letterSpacing: '0.05em' }}>ITEM</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: c.textMuted }}>SIZE</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>SOLD</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>PAYOUT</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: c.textMuted }}>YOUR COST</th>
                        <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: c.textMuted }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).map((s, idx) => (
                        <tr 
                          key={s.id} 
                          style={{ 
                            borderTop: `1px solid ${c.border}`,
                            background: selectedPending.has(s.id) ? 'rgba(16,185,129,0.1)' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <input 
                              type="checkbox"
                              checked={selectedPending.has(s.id)}
                              onChange={(e) => {
                                const newSelected = new Set(selectedPending);
                                if (e.target.checked) {
                                  newSelected.add(s.id);
                                } else {
                                  newSelected.delete(s.id);
                                }
                                setSelectedPending(newSelected);
                              }}
                              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: c.emerald }}
                            />
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: c.emerald }}>{s.sku}</div>
                            <div style={{ fontSize: 10, color: c.textMuted }}>{s.saleDate}</div>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{s.size || '-'}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 14, fontWeight: 600 }}>{fmt(s.salePrice)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: c.emerald }}>{fmt(s.payout)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <input 
                              type="number" 
                              id={`bulkcost_${s.id}`}
                              placeholder="$"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const cost = e.target.value;
                                  if (cost) {
                                    confirmSaleWithCost(s.id, cost, 'StockX Standard');
                                    e.target.value = '';
                                  }
                                }
                              }}
                              style={{ 
                                width: 80, 
                                padding: '10px 12px', 
                                background: 'rgba(255,255,255,0.05)', 
                                border: `1px solid ${c.border}`, 
                                borderRadius: 8, 
                                color: c.text, 
                                fontSize: 14, 
                                textAlign: 'center',
                                outline: 'none'
                              }} 
                            />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button 
                              onClick={() => {
                                setPendingCosts(prev => prev.filter(x => x.id !== s.id));
                                setSelectedPending(prev => { const n = new Set(prev); n.delete(s.id); return n; });
                              }} 
                              style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 16, padding: 4 }}
                            >×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Footer Stats */}
                <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.02)', borderTop: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: c.textMuted }}>
                    {pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length} sales pending
                  </span>
                  <span style={{ fontSize: 11, color: c.textMuted }}>
                    💡 Select items with checkbox, then apply cost to all • Or enter cost + Enter for single item
                  </span>
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
                <span style={{ color: c.emerald, fontWeight: 600, fontSize: 12 }}>✓ Connected to StockX</span>
              </div>
            )}
          </div>

          {/* CSV Import Section */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ width: 54, height: 54, background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📄</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>IMPORT CSV</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Upload StockX historical sales CSV - filter by year & month</p>
                </div>
              </div>
              
              {!csvImport.show ? (
                <div>
                  <input 
                    type="file" 
                    accept=".csv" 
                    onChange={handleCsvUpload}
                    id="csv-upload"
                    style={{ display: 'none' }}
                  />
                  <label 
                    htmlFor="csv-upload" 
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    style={{ display: 'block', padding: 40, border: `2px dashed ${c.border}`, borderRadius: 16, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📤</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Click or drag CSV file here</div>
                    <div style={{ fontSize: 12, color: c.textMuted }}>Download from StockX → Seller Tools → Historical Sales</div>
                  </label>
                </div>
              ) : (
                <div>
                  {/* Filter Controls */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: c.textMuted, fontWeight: 600, display: 'block', marginBottom: 6 }}>YEAR</label>
                      <select 
                        value={csvImport.year} 
                        onChange={e => setCsvImport({ ...csvImport, year: e.target.value })}
                        style={{ ...inputStyle, padding: 12 }}
                      >
                        <option value="all">All Years</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                        <option value="2024">2024</option>
                        <option value="2023">2023</option>
                        <option value="2022">2022</option>
                        <option value="2021">2021</option>
                        <option value="2020">2020</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: c.textMuted, fontWeight: 600, display: 'block', marginBottom: 6 }}>MONTH</label>
                      <select 
                        value={csvImport.month} 
                        onChange={e => setCsvImport({ ...csvImport, month: e.target.value })}
                        style={{ ...inputStyle, padding: 12 }}
                      >
                        <option value="all">All Months</option>
                        <option value="01">January</option>
                        <option value="02">February</option>
                        <option value="03">March</option>
                        <option value="04">April</option>
                        <option value="05">May</option>
                        <option value="06">June</option>
                        <option value="07">July</option>
                        <option value="08">August</option>
                        <option value="09">September</option>
                        <option value="10">October</option>
                        <option value="11">November</option>
                        <option value="12">December</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Preview Stats */}
                  <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 4 }}>Total rows in CSV</div>
                        <div style={{ fontSize: 24, fontWeight: 800 }}>{csvImport.data.length.toLocaleString()}</div>
                      </div>
                      <div style={{ fontSize: 32 }}>→</div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 4 }}>Matching your filter</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: c.emerald }}>{filterCsvData().length.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Preview Table */}
                  {filterCsvData().length > 0 && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, borderRadius: 12, border: `1px solid ${c.border}` }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Item</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Size</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Price</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filterCsvData().slice(0, 5).map((row, i) => (
                            <tr key={i} style={{ borderTop: `1px solid ${c.border}` }}>
                              <td style={{ padding: '10px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row['Item'] || row['Product Name'] || row['Product'] || 'Unknown'}</td>
                              <td style={{ padding: '10px 12px' }}>{row['Sku Size'] || row['Size'] || '-'}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', color: c.emerald }}>${row['Price'] || row['Sale Price'] || '0'}</td>
                              <td style={{ padding: '10px 12px', color: c.textMuted }}>{row['_parsedDate'] || '-'}</td>
                            </tr>
                          ))}
                          {filterCsvData().length > 5 && (
                            <tr style={{ borderTop: `1px solid ${c.border}` }}>
                              <td colSpan={4} style={{ padding: '10px 12px', textAlign: 'center', color: c.textMuted, fontStyle: 'italic' }}>
                                ...and {filterCsvData().length - 5} more
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button 
                      onClick={() => setCsvImport({ show: false, data: [], filteredData: [], year: 'all', month: 'all', preview: false, headers: [] })}
                      style={{ flex: 1, padding: 14, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={importCsvSales}
                      disabled={filterCsvData().length === 0}
                      style={{ flex: 2, padding: 14, ...btnPrimary, opacity: filterCsvData().length === 0 ? 0.5 : 1 }}
                    >
                      Import {filterCsvData().length} Sales
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Other Platforms */}
          {[
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
                        <input type="checkbox" checked={settings[platform.checkbox.key]} onChange={e => setSettings({ ...settings, [platform.checkbox.key]: e.target.checked })} style={{ accentColor: c.emerald, width: 14, height: 14 }} />
                        {platform.checkbox.label}
                      </label>
                    )}
                    {platform.total !== undefined && (
                      <div style={{ marginTop: 12, padding: 10, background: 'rgba(16,185,129,0.1)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, color: c.textMuted, fontWeight: 600 }}>TOTAL FEE</span>
                        <span style={{ fontWeight: 700, color: c.emerald, fontSize: 14 }}>{platform.total}%{platform.extra && ` ${platform.extra}`}</span>
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
              {modal === 'purchase' ? 'ADD PURCHASE' : modal === 'bulkAdd' ? 'BULK ADD ITEMS' : modal === 'sale' ? 'RECORD SALE' : modal === 'editSale' ? 'EDIT SALE' : modal === 'expense' ? 'ADD EXPENSE' : modal === 'storage' ? 'ADD STORAGE FEE' : 'LOG MILEAGE'}
            </h3>
            <button onClick={() => setModal(null)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ padding: 22 }}>
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
                  style={{ width: '100%', padding: 10, background: 'rgba(16,185,129,0.1)', border: `1px dashed rgba(16,185,129,0.3)`, borderRadius: 8, color: c.emerald, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >+ Add Another Size</button>
              </div>
              
              <div style={{ padding: 14, background: 'rgba(16,185,129,0.1)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: c.textMuted, fontSize: 13 }}>Items to add:</span>
                <span style={{ fontWeight: 800, fontSize: 20, color: c.emerald }}>{(formData.bulkRows || []).filter(r => r.size && r.cost).length}</span>
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
              else if (modal === 'expense') addExpense(); 
              else if (modal === 'storage') addStorage(); 
              else if (modal === 'mileage') addMileage(); 
            }} style={{ flex: 1, padding: 14, ...btnPrimary, fontSize: 13 }}>
              {modal === 'purchase' ? 'ADD ITEM' : modal === 'bulkAdd' ? `ADD ${(formData.bulkRows || []).filter(r => r.size && r.cost).length} ITEMS` : modal === 'sale' ? 'RECORD 💰' : modal === 'editSale' ? 'SAVE CHANGES' : modal === 'mileage' ? 'LOG TRIP' : 'ADD'}
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
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes shimmer {
          0% { opacity: 0.3; left: 10%; right: 90%; }
          50% { opacity: 1; left: 45%; right: 45%; }
          100% { opacity: 0.3; left: 90%; right: 10%; }
        }
        
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
