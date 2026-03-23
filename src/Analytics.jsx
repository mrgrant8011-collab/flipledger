import { useState, useMemo } from 'react';

export default function Analytics({ sales, purchases, year, c, fmt }) {
  const [platform, setPlatform] = useState('all');
  const [sortBy, setSortBy] = useState('totalProfit');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  // Filter sales by year and platform
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const matchesYear = year === 'all' || (s.saleDate && s.saleDate.startsWith(year));
      const matchesPlatform = platform === 'all' || s.platform === platform;
      return matchesYear && matchesPlatform;
    });
  }, [sales, year, platform]);

  // Aggregate by SKU
  const skuData = useMemo(() => {
    const map = {};
    filteredSales.forEach(s => {
      const key = s.sku || s.name || 'Unknown';
      if (!map[key]) {
        map[key] = {
          sku: s.sku || '',
          name: s.name || 'Unknown',
          units: 0,
          totalCost: 0,
          totalSale: 0,
          totalFees: 0,
          totalProfit: 0,
          platforms: new Set(),
        };
      }
      map[key].units++;
      map[key].totalCost += s.cost || 0;
      map[key].totalSale += s.salePrice || 0;
      map[key].totalFees += s.fees || 0;
      map[key].totalProfit += s.profit || 0;
      if (s.platform) map[key].platforms.add(s.platform);
    });

    return Object.values(map).map(d => ({
      ...d,
      avgCost: d.units > 0 ? d.totalCost / d.units : 0,
      avgSale: d.units > 0 ? d.totalSale / d.units : 0,
      avgProfit: d.units > 0 ? d.totalProfit / d.units : 0,
      margin: d.totalSale > 0 ? (d.totalProfit / d.totalSale) * 100 : 0,
      platforms: [...d.platforms],
    }));
  }, [filteredSales]);

  // Filter by search
  const searched = useMemo(() => {
    if (!search.trim()) return skuData;
    const s = search.toLowerCase();
    return skuData.filter(d => d.name.toLowerCase().includes(s) || d.sku.toLowerCase().includes(s));
  }, [skuData, search]);

  // Sort
  const sorted = useMemo(() => {
    return [...searched].sort((a, b) => {
      switch (sortBy) {
        case 'totalProfit': return b.totalProfit - a.totalProfit;
        case 'units': return b.units - a.units;
        case 'avgProfit': return b.avgProfit - a.avgProfit;
        case 'margin': return b.margin - a.margin;
        case 'avgSale': return b.avgSale - a.avgSale;
        default: return b.totalProfit - a.totalProfit;
      }
    });
  }, [searched, sortBy]);

  const maxProfit = sorted.length > 0 ? sorted[0].totalProfit : 1;
  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const paginated = sorted.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Summary stats
  const totalProfit = filteredSales.reduce((s, x) => s + (x.profit || 0), 0);
  const totalRevenue = filteredSales.reduce((s, x) => s + (x.salePrice || 0), 0);
  const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;
  const bestSku = sorted[0];

  const platforms = ['all', 'StockX Standard', 'StockX Direct', 'StockX Flex', 'eBay', 'GOAT', 'Local'];

  const SortHeader = ({ label, field }) => (
    <span
      onClick={() => { setSortBy(field); setPage(1); }}
      style={{
        fontSize: 10, fontWeight: 700, cursor: 'pointer', userSelect: 'none',
        color: sortBy === field ? c.green : c.textMuted,
        textAlign: 'right'
      }}
    >
      {label} {sortBy === field ? '▼' : ''}
    </span>
  );

  const cardStyle = {
    background: c.card,
    border: `1px solid ${c.border}`,
    borderRadius: 20,
    padding: '28px',
    position: 'relative',
    overflow: 'hidden',
  };

  return (
    <div>
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 28 }}>
        {[
          { label: 'Total Profit', value: fmt(totalProfit), color: c.gold },
          { label: 'Unique SKUs', value: skuData.length, color: c.green },
          { label: 'Avg Margin', value: `${avgMargin}%`, color: c.green },
          { label: 'Best SKU', value: bestSku?.sku || bestSku?.name?.substring(0, 14) || '—', color: '#8B5CF6' },
        ].map((stat, i) => (
          <div key={i} style={cardStyle}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` }} />
            <div style={{ position: 'absolute', top: 20, right: 20, width: 8, height: 8, background: stat.color, borderRadius: '50%', boxShadow: `0 0 12px ${stat.color}` }} />
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: c.textDim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="🔍 Search by name or SKU..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 200, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', fontSize: 14 }}
        />
        <select
          value={platform}
          onChange={e => { setPlatform(e.target.value); setPage(1); }}
          style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="all">All Platforms</option>
          <option value="StockX Standard">StockX Standard</option>
          <option value="StockX Direct">StockX Direct</option>
          <option value="StockX Flex">StockX Flex</option>
          <option value="eBay">eBay</option>
          <option value="GOAT">GOAT</option>
          <option value="Local">Local</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 20, overflow: 'hidden' }}>
        {/* Table header bar */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: c.textMuted }}>
            {sorted.length > 0 ? `Showing ${(page - 1) * ITEMS_PER_PAGE + 1}–${Math.min(page * ITEMS_PER_PAGE, sorted.length)} of ${sorted.length} SKUs` : 'No data'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, background: c.green, borderRadius: '50%', boxShadow: `0 0 10px ${c.green}` }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: c.green }}>LIVE</span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 0.5fr 0.8fr 0.8fr 0.8fr 1fr', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', gap: 8, alignItems: 'center', minWidth: 700 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>ITEM / SKU</span>
          <span onClick={() => { setSortBy('units'); setPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: sortBy === 'units' ? c.green : c.textMuted, cursor: 'pointer', textAlign: 'center' }}>UNITS {sortBy === 'units' ? '▼' : ''}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>AVG COST</span>
          <span onClick={() => { setSortBy('avgSale'); setPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: sortBy === 'avgSale' ? c.green : c.textMuted, cursor: 'pointer', textAlign: 'right' }}>AVG SALE {sortBy === 'avgSale' ? '▼' : ''}</span>
          <span onClick={() => { setSortBy('margin'); setPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: sortBy === 'margin' ? c.green : c.textMuted, cursor: 'pointer', textAlign: 'right' }}>MARGIN {sortBy === 'margin' ? '▼' : ''}</span>
          <span onClick={() => { setSortBy('totalProfit'); setPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: sortBy === 'totalProfit' ? c.green : c.textMuted, cursor: 'pointer', textAlign: 'right' }}>TOTAL PROFIT {sortBy === 'totalProfit' ? '▼' : ''}</span>
        </div>

        {/* Rows */}
        {paginated.length > 0 ? paginated.map((d, i) => {
          const barWidth = maxProfit > 0 ? Math.max((d.totalProfit / maxProfit) * 100, 3) : 0;
          return (
            <div key={d.sku + d.name + i} style={{ display: 'grid', gridTemplateColumns: '2.5fr 0.5fr 0.8fr 0.8fr 0.8fr 1fr', padding: '14px 20px', borderBottom: `1px solid ${c.border}`, gap: 8, alignItems: 'center', transition: 'background 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(52,211,153,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</p>
                <p style={{ margin: '0 0 6px', fontSize: 11, color: c.green }}>{d.sku || '—'}</p>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(52,211,153,0.1)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barWidth}%`, background: '#34D399', borderRadius: 2 }} />
                </div>
              </div>
              <span style={{ fontSize: 13, textAlign: 'center', color: c.textMuted }}>{d.units}</span>
              <span style={{ fontSize: 13, textAlign: 'right', color: c.textMuted }}>{fmt(d.avgCost)}</span>
              <span style={{ fontSize: 13, textAlign: 'right', color: '#fff' }}>{fmt(d.avgSale)}</span>
              <span style={{ fontSize: 13, textAlign: 'right', color: d.margin >= 20 ? c.green : d.margin >= 10 ? c.gold : '#F87171' }}>{d.margin.toFixed(1)}%</span>
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: c.green, background: 'rgba(52,211,153,0.1)', padding: '5px 12px', borderRadius: 6, display: 'block' }}>+{fmt(d.totalProfit)}</span>
            </div>
          );
        }) : (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <p style={{ color: c.textMuted }}>No sales data yet. Confirm some sales to see analytics.</p>
          </div>
        )}

        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '16px 20px', borderTop: `1px solid ${c.border}`, display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === 1 ? c.textMuted : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === 1 ? c.textMuted : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let n = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
              return <button key={n} onClick={() => setPage(n)} style={{ padding: '8px 14px', background: page === n ? c.green : 'rgba(255,255,255,0.05)', border: `1px solid ${page === n ? c.green : c.border}`, borderRadius: 6, color: page === n ? '#000' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: page === n ? 700 : 400 }}>{n}</button>;
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === totalPages ? c.textMuted : '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 12 }}>›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === totalPages ? c.textMuted : '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 12 }}>»</button>
          </div>
        )}
      </div>
    </div>
  );
}
