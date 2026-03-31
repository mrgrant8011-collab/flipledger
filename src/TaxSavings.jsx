import { useState, useMemo } from 'react';

const c = {
  bg: '#0C0C0C',
  card: '#141414',
  border: 'rgba(255,255,255,0.06)',
  gold: '#C9A962',
  goldDark: '#8B7355',
  goldGlow: 'rgba(201,169,98,0.3)',
  green: '#34D399',
  greenGlow: 'rgba(52,211,153,0.3)',
  red: '#F87171',
  redGlow: 'rgba(248,113,113,0.3)',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.5)',
  textDim: 'rgba(255,255,255,0.3)',
};

const STATE_RATES = {
  AL:5,AK:0,AZ:2.5,AR:4.7,CA:9.3,CO:4.4,CT:6.99,DE:6.6,FL:0,GA:5.49,
  HI:8.25,ID:5.8,IL:4.95,IN:3.05,IA:6,KS:5.7,KY:4.5,LA:3,ME:7.15,MD:5.75,
  MA:5,MI:4.25,MN:9.85,MS:5,MO:5.3,MT:6.75,NE:6.84,NV:0,NH:0,NJ:8.97,
  NM:5.9,NY:10.9,NC:4.75,ND:2.9,OH:3.99,OK:4.75,OR:9.9,PA:3.07,RI:5.99,
  SC:7,SD:0,TN:0,TX:0,UT:4.65,VT:8.75,VA:5.75,WA:0,WV:6.5,WI:7.65,WY:0,DC:10.75
};

const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',
  WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'Washington DC'
};

function getFederalBracket(income) {
  if (income <= 11600) return { rate: 10, label: '10%' };
  if (income <= 47150) return { rate: 12, label: '12%' };
  if (income <= 100525) return { rate: 22, label: '22%' };
  if (income <= 191950) return { rate: 24, label: '24%' };
  if (income <= 243725) return { rate: 32, label: '32%' };
  if (income <= 609350) return { rate: 35, label: '35%' };
  return { rate: 37, label: '37%' };
}

function calcFederalTax(income) {
  const brackets = [
    { max: 11600, rate: 0.10 },{ max: 47150, rate: 0.12 },{ max: 100525, rate: 0.22 },
    { max: 191950, rate: 0.24 },{ max: 243725, rate: 0.32 },{ max: 609350, rate: 0.35 },
    { max: Infinity, rate: 0.37 },
  ];
  let tax = 0, prev = 0;
  for (const b of brackets) {
    if (income <= prev) break;
    tax += (Math.min(income, b.max) - prev) * b.rate;
    prev = b.max;
  }
  return Math.round(tax);
}

export default function TaxSavings({ sales = [], expenses = [], settings = {}, userId }) {
  const [stateCode, setStateCode] = useState(settings.state || 'UT');
  const [expanded, setExpanded] = useState(null);

  // Toggleable deductions
  const [hasSepIra, setHasSepIra] = useState(false);
  const [hasHSA, setHasHSA] = useState(false);
  const [hasHomeOffice, setHasHomeOffice] = useState(false);
  const [homeOfficePct, setHomeOfficePct] = useState(10);
  const [hasHealthIns, setHasHealthIns] = useState(false);
  const [healthInsAmt, setHealthInsAmt] = useState(6000);
  const [hasDental, setHasDental] = useState(false);
  const [dentalAmt, setDentalAmt] = useState(1200);
  const [hasKids, setHasKids] = useState(false);
  const [kidsAmt, setKidsAmt] = useState(14600);
  const [hasRoth, setHasRoth] = useState(false);
  const [compoundYears, setCompoundYears] = useState(20);
  const [compoundRate, setCompoundRate] = useState(10);
  const [compoundPrincipal, setCompoundPrincipal] = useState(0);
  const [compoundMonthly, setCompoundMonthly] = useState(null); // null = auto from tax savings
  const [mileage, setMileage] = useState(0);

  const year = new Date().getFullYear();

  const scheduleC = useMemo(() => {
    const yearSales = sales.filter(s => !s.sale_date || new Date(s.sale_date).getFullYear() === year);
    const grossRevenue = yearSales.reduce((sum, s) => sum + (s.sale_price || s.salePrice || 0), 0);
    const cogs = yearSales.reduce((sum, s) => sum + (s.cost || 0), 0);
    const fees = yearSales.reduce((sum, s) => sum + (s.fees || 0), 0);
    const expTotal = expenses
      .filter(e => new Date(e.date || e.created_at || Date.now()).getFullYear() === year)
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    return { grossRevenue, cogs, fees, expTotal, netProfit: Math.max(0, grossRevenue - cogs - fees - expTotal) };
  }, [sales, expenses, year]);

  const netProfit = Math.round(scheduleC.netProfit);
  const stateRate = STATE_RATES[stateCode] || 0;

  const seTaxFull = Math.round(netProfit * 0.9235 * 0.153);
  const halfSETax = Math.round(seTaxFull / 2);
  const qbiDeduction = Math.round(netProfit * 0.20);
  const sepIraMax = Math.min(Math.round(netProfit * 0.25), 69000);
  const sepIraContrib = hasSepIra ? sepIraMax : 0;
  const hsaContrib = hasHSA ? 4150 : 0;
  const healthInsDeduct = hasHealthIns ? Math.min(healthInsAmt, netProfit) : 0;
  const dentalDeduct = hasDental ? Math.min(dentalAmt, netProfit) : 0;
  const kidsDeduct = hasKids ? Math.min(kidsAmt, netProfit) : 0;
  const mileageDeduct = Math.round(mileage * 0.67);
  const homeOfficeDeduct = hasHomeOffice ? Math.round(scheduleC.expTotal * homeOfficePct / 100) : 0;

  const adjustedIncome = Math.max(0,
    netProfit - halfSETax - sepIraContrib - hsaContrib - healthInsDeduct - dentalDeduct
    - kidsDeduct - mileageDeduct - homeOfficeDeduct - qbiDeduction
  );

  const federalIncomeTax = calcFederalTax(adjustedIncome);
  const stateIncomeTax = Math.round(adjustedIncome * stateRate / 100);
  const totalTax = seTaxFull + federalIncomeTax + stateIncomeTax;

  const baseTax = seTaxFull + calcFederalTax(Math.max(0, netProfit - halfSETax - qbiDeduction))
    + Math.round(Math.max(0, netProfit - halfSETax - qbiDeduction) * stateRate / 100);
  const totalSavings = baseTax - totalTax;
  const bracket = getFederalBracket(adjustedIncome);
  const marginalRate = (bracket.rate / 100) + (stateRate / 100);

  function TipCard({ tip }) {
    const isExpanded = expanded === tip.id;
    return (
      <div style={{
        background: tip.active ? `${tip.color}0D` : c.card,
        border: `1px solid ${tip.active ? `${tip.color}40` : c.border}`,
        borderRadius: 16, overflow: 'hidden', transition: 'all .2s ease'
      }}>
        {tip.active && <div style={{ height: 2, background: `linear-gradient(90deg,transparent,${tip.color},transparent)`, animation: 'shimmer-line 2s ease-in-out infinite' }} />}
        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: c.text }}>{tip.title}</span>
                {tip.badge && (
                  <span style={{ fontSize: 9, color: tip.color, background: `${tip.color}20`, border: `1px solid ${tip.color}40`, borderRadius: 100, padding: '2px 8px', letterSpacing: '1px', flexShrink: 0 }}>
                    {tip.badge}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: c.textMuted, marginBottom: tip.input ? 8 : 0, lineHeight: 1.5 }}>{tip.desc}</div>
              {tip.input}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {tip.saving ? (
                <div style={{ fontSize: 18, fontWeight: 900, color: tip.color, textShadow: `0 0 15px ${tip.color}50` }}>
                  −${tip.saving.toLocaleString()}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: c.textDim }}>{tip.savingLabel || 'varies'}</div>
              )}
              {tip.toggle && (
                <button onClick={tip.toggle}
                  style={{ marginTop: 6, fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 100, border: `1px solid ${tip.active ? tip.color : c.border}`, background: tip.active ? `${tip.color}20` : 'transparent', color: tip.active ? tip.color : c.textDim, letterSpacing: '1px', cursor: 'pointer' }}>
                  {tip.active ? 'ON' : 'OFF'}
                </button>
              )}
            </div>
          </div>
          <button onClick={() => setExpanded(isExpanded ? null : tip.id)}
            style={{ marginTop: 8, fontSize: 11, color: c.textDim, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {isExpanded ? '▲ less' : '▼ learn more'}
          </button>
          {isExpanded && (
            <div style={{ marginTop: 10, fontSize: 12, color: c.textMuted, lineHeight: 1.7, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: `1px solid ${c.border}` }}>
              {tip.detail}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── SECTION 1: APPLY NOW — toggleable, live dollar impact ────────────────
  const applyNowTips = [
    {
      id: 'sep',
      title: 'SEP-IRA contribution',
      badge: hasSepIra ? 'ACTIVE' : null,
      desc: `Contribute up to 25% of net profit pre-tax. Reduces taxable income dollar for dollar. Max $${sepIraMax.toLocaleString()} this year.`,
      detail: `A SEP-IRA is the easiest and most powerful retirement account for self-employed people. You have until tax filing day (including extensions) to open and fund it for the prior year. At your ${bracket.label} bracket, every dollar you contribute saves you ${bracket.rate}¢ federal + ${stateRate}¢ state in taxes. Vanguard, Fidelity, and Schwab all offer free SEP-IRAs. Invest it in diversified index funds or a target date fund and let it compound tax-deferred until retirement.`,
      saving: hasSepIra ? Math.round(sepIraContrib * marginalRate) : Math.round(sepIraMax * marginalRate),
      active: hasSepIra,
      toggle: () => setHasSepIra(!hasSepIra),
      color: c.green,
    },
    {
      id: 'hsa',
      title: 'HSA — and invest it in the market',
      badge: hasHSA ? 'ACTIVE' : '🔥 UNDERRATED',
      desc: 'Health savings account — $4,150 pre-tax, grows tax-free, withdrawals tax-free for medical. Invest it in index funds, not cash.',
      detail: `The HSA is the only triple tax advantage account that exists: 1) contributions are pre-tax (saves you ${Math.round(4150 * marginalRate).toLocaleString()} in taxes now), 2) growth is 100% tax-free, 3) withdrawals for medical expenses are tax-free. Most people make the mistake of leaving HSA funds in a cash account earning 0.1%. Wrong move. Many HSA providers like Fidelity and Lively allow you to invest your HSA balance in the market rather than leaving it as cash. If you contribute $4,150/year from age 30-65 and invest it, that's potentially $1M+ tax-free for medical expenses. After 65 you can withdraw for anything (like a Traditional IRA). Requires a high deductible health plan ($1,600+ deductible for individuals). This is one of the most powerful wealth-building tools available to self-employed people.`,
      saving: Math.round(4150 * marginalRate),
      active: hasHSA,
      toggle: () => setHasHSA(!hasHSA),
      color: c.green,
    },
    {
      id: 'health',
      title: 'Health insurance premiums',
      badge: hasHealthIns ? 'ACTIVE' : null,
      desc: 'Self-employed health insurance is 100% deductible off your 1040 — reduces income tax AND SE tax base.',
      detail: 'If you pay for your own health insurance (not through a spouse\'s employer), 100% of premiums are deductible. This is an above-the-line deduction — it comes off before your AGI is calculated, meaning it reduces both your income tax and the base for SE tax calculations. Average individual premium is $6,000-$8,000/year. Also includes dental and vision.',
      saving: hasHealthIns ? Math.round(healthInsDeduct * marginalRate) : null,
      savingLabel: 'enter amount',
      active: hasHealthIns,
      toggle: () => setHasHealthIns(!hasHealthIns),
      color: c.gold,
      input: hasHealthIns ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: c.textDim }}>Annual premium:</span>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: c.textDim }}>$</span>
            <input type="number" value={healthInsAmt} onChange={e => setHealthInsAmt(parseFloat(e.target.value)||0)}
              style={{ background:'transparent',border:'none',outline:'none',color:c.text,fontSize:13,width:70,fontFamily:'inherit' }} />
          </div>
        </div>
      ) : null,
    },
    {
      id: 'dental',
      title: 'Dental & vision insurance',
      badge: hasDental ? 'ACTIVE' : null,
      desc: 'Same as health insurance — self-employed dental and vision premiums are 100% deductible. Most people forget this.',
      detail: 'Dental and vision insurance premiums are deductible under the same self-employed health insurance deduction as your main health plan. If you pay separately for dental/vision, deduct the full amount. Average dental plan is $600-$1,200/year. Vision is typically $200-$400/year.',
      saving: hasDental ? Math.round(dentalDeduct * marginalRate) : null,
      savingLabel: 'enter amount',
      active: hasDental,
      toggle: () => setHasDental(!hasDental),
      color: c.gold,
      input: hasDental ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: c.textDim }}>Annual premium:</span>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: c.textDim }}>$</span>
            <input type="number" value={dentalAmt} onChange={e => setDentalAmt(parseFloat(e.target.value)||0)}
              style={{ background:'transparent',border:'none',outline:'none',color:c.text,fontSize:13,width:70,fontFamily:'inherit' }} />
          </div>
        </div>
      ) : null,
    },
    {
      id: 'homeoffice',
      title: 'Home office deduction',
      badge: hasHomeOffice ? 'ACTIVE' : null,
      desc: 'Dedicated workspace at home — deduct % of rent/mortgage and utilities by square footage.',
      detail: 'The home office must be used regularly and exclusively for business. Calculate: office sq ft ÷ total home sq ft = percentage. Apply that % to rent/mortgage, utilities, and home insurance. Alternatively use the simplified method: $5/sq ft up to 300 sq ft ($1,500 max). The regular method usually wins. Important: this deduction cannot create a loss, it can only reduce income to zero.',
      saving: hasHomeOffice ? Math.round(homeOfficeDeduct * marginalRate) : null,
      savingLabel: 'enter % below',
      active: hasHomeOffice,
      toggle: () => setHasHomeOffice(!hasHomeOffice),
      color: c.green,
      input: hasHomeOffice ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: c.textDim }}>Office % of home:</span>
          <input type="range" min={1} max={50} value={homeOfficePct} onChange={e => setHomeOfficePct(parseInt(e.target.value))}
            style={{ flex: 1, accentColor: c.gold }} />
          <span style={{ fontSize: 13, color: c.gold, fontWeight: 700, minWidth: 32 }}>{homeOfficePct}%</span>
        </div>
      ) : null,
    },
    {
      id: 'kids',
      title: 'Hire your children',
      badge: hasKids ? 'ACTIVE' : '🔥 MOST MISS THIS',
      desc: 'Pay your kids up to $14,600/year for real work — packing orders, photographing shoes, labeling inventory. You deduct it, they pay zero federal tax.',
      detail: `This is completely legal and one of the most powerful family tax strategies available. Pay your children for actual work they perform in your business: photographing shoes for listings, packing and labeling orders, sorting inventory, data entry. Their standard deduction is $14,600 — meaning they pay ZERO federal income tax on earnings up to that amount. You deduct the full amount as a business expense. That saves you ${Math.round(14600 * marginalRate).toLocaleString()} in taxes. Additionally, children under 18 working for a parent's sole proprietorship are exempt from FICA (Social Security and Medicare taxes). Must pay reasonable wages for real work and keep records. Put the money in a Roth IRA for them and it grows tax-free for 50+ years.`,
      saving: hasKids ? Math.round(kidsDeduct * marginalRate) : Math.round(14600 * marginalRate),
      active: hasKids,
      toggle: () => setHasKids(!hasKids),
      color: c.green,
    },
    {
      id: 'mileage',
      title: 'Mileage deduction',
      badge: mileage > 0 ? 'ACTIVE' : null,
      desc: 'Every business mile = $0.67 deduction. Outlet runs, post office, UPS, storage — it adds up fast.',
      detail: `IRS standard mileage rate 2024: $0.67/mile. Every trip for your business counts: outlet runs, post office, UPS/FedEx drop-offs, storage unit visits, business meetings. 5,000 miles = $3,350 deduction. 10,000 miles = $6,700. Use MileIQ, TripLog, or just log in your notes — date, destination, purpose, miles. Keep a log. IRS loves seeing documentation. At your ${bracket.label} bracket, 5,000 miles saves you $${Math.round(3350 * marginalRate).toLocaleString()} in taxes.`,
      saving: mileage > 0 ? Math.round(mileageDeduct * marginalRate) : null,
      savingLabel: 'enter miles below',
      active: mileage > 0,
      color: c.green,
      input: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: c.textDim }}>Business miles this year:</span>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, padding: '4px 10px' }}>
            <input type="number" value={mileage || ''} placeholder="0" onChange={e => setMileage(parseInt(e.target.value)||0)}
              style={{ background:'transparent',border:'none',outline:'none',color:c.text,fontSize:13,width:80,fontFamily:'inherit' }} />
          </div>
          {mileage > 0 && <span style={{ fontSize: 12, color: c.green, fontWeight: 700 }}>= ${mileageDeduct.toLocaleString()} deduction</span>}
        </div>
      ),
    },
  ];

  // ─── SECTION 2: START TRACKING / ADVANCED ────────────────────────────────
  const trackingTips = [
    {
      id: 'packing',
      title: 'Packing & shipping supplies',
      badge: 'LOG IN EXPENSES',
      desc: 'Boxes, tape, bubble wrap, poly mailers, labels, printer ink — 100% deductible. Log every purchase in FlipLedger Expenses.',
      detail: 'Every dollar spent on packing and shipping supplies reduces your taxable income dollar for dollar. Boxes, poly mailers, bubble wrap, tissue paper, packing tape, thermal label paper, shipping scale, printer ink. If you spend $200/month on supplies that\'s $2,400/year off your taxes. Make a habit of logging every supply run in the Expenses tab with a receipt photo.',
      color: c.gold,
      savingLabel: 'log to calculate',
    },
    {
      id: 'roth',
      title: 'Roth IRA',
      badge: 'TAX-FREE FOREVER',
      desc: 'Contribute $7,000/year after-tax. Grows completely tax-free forever. Pull it out in retirement with zero taxes.',
      detail: `You pay taxes on Roth contributions now, but every dollar of growth and every withdrawal in retirement is 100% tax-free — forever. Max contribution 2024: $7,000 ($8,000 if 50+). Income limit: phases out above $146k single/$230k married. At your income level you qualify. $7,000/year invested in the market over 30-40 years can grow to millions tax-free. Open at Fidelity or Vanguard in 10 minutes. Pair this with your SEP-IRA: SEP saves taxes now, Roth saves taxes later. Consult a financial advisor on investment options.`,
      color: c.green,
      savingLabel: '$7,000/yr max',
    },
    {
      id: 'deadinventory',
      title: 'Write off dead inventory',
      badge: 'MOST FORGET THIS',
      desc: 'Shoes that won\'t sell, wrong sizes, damaged pairs — write them off as a loss. Log in FlipLedger and deduct the cost.',
      detail: 'If you have inventory that\'s genuinely unsellable (wrong size, damaged, out of style, lost), you can write off the cost as an inventory loss. Go through your inventory annually and identify items you\'re never going to sell. Document them (photos help), remove from inventory, and deduct the original cost. This is legitimate COGS — you\'re not making money on it and you already paid for it. Most resellers have hundreds or thousands of dollars sitting in dead inventory they\'ve never written off.',
      color: c.gold,
      savingLabel: 'audit your inventory',
    },
    {
      id: 'section179',
      title: 'Section 179 equipment deduction',
      badge: 'DEDUCT 100% IMMEDIATELY',
      desc: 'Cameras, computers, label printers, shelving, scanner guns — deduct 100% in the year you buy it, not over years.',
      detail: 'Section 179 lets you deduct the full cost of business equipment in the year of purchase instead of depreciating it over 5-7 years. Camera and lighting for product photos, MacBook, label printer, shelving, storage bins, scanner guns, barcode readers — all eligible. Keep receipts. Must be used more than 50% for business. Also includes vehicles used for business (with limits). The "Bonus Depreciation" rule also allows 60% immediate deduction on many assets in 2024.',
      color: c.green,
      savingLabel: 'save receipts',
    },
    {
      id: 'scorp',
      title: 'S-Corp election',
      badge: netProfit >= 80000 ? '🔥 DO THIS NOW' : netProfit >= 60000 ? 'CONSIDER NOW' : `WORTH IT AT $80K+`,
      desc: netProfit >= 80000
        ? `At $${netProfit.toLocaleString()} net profit the S-Corp saves you real money. Pay yourself a salary, take the rest as distributions — no SE tax on distributions.`
        : `You\'re at $${netProfit.toLocaleString()} net profit. S-Corp starts making sense at $60k. Strong case at $80k+. File Form 2553 when ready.`,
      detail: `Currently every dollar of profit gets hit with 15.3% SE tax. With an S-Corp you pay yourself a "reasonable salary" (say $40,000) and take the rest as distributions. SE tax only applies to the salary portion. At $${netProfit.toLocaleString()} net profit: salary $40k × 15.3% SE = $6,120. Distribution ${Math.max(0, netProfit-40000).toLocaleString()} × 0% SE = $0. Total SE tax: $6,120 vs $${seTaxFull.toLocaleString()} now. Savings: $${Math.max(0, seTaxFull - 6120).toLocaleString()}. Cost: ~$1,800-2,200/year for payroll (Gusto) + CPA fees. Net benefit starts at $60k, strong at $80k+. File Form 2553 with the IRS (free) and set up payroll. Utah LLC filing fee: $70/year.`,
      color: netProfit >= 60000 ? c.green : c.textDim,
      saving: netProfit >= 60000 ? Math.max(0, seTaxFull - Math.round(40000 * 0.153) - 2000) : null,
      savingLabel: netProfit >= 60000 ? undefined : 'not yet worth it',
    },
    {
      id: 'solo401k',
      title: 'Solo 401(k)',
      badge: 'HIGHER LIMITS THAN SEP',
      desc: 'Contribute as both employer AND employee — up to $69,000 total. More flexible than SEP-IRA.',
      detail: 'A Solo 401(k) has the same tax benefits as a SEP-IRA but higher effective limits for some income levels. Employee contribution: up to $23,000 (or $30,500 if 50+). Employer contribution: up to 25% of net profit. Combined max: $69,000. You can also take loans against a Solo 401(k) — up to 50% of balance or $50,000. More paperwork to set up but Fidelity offers a free one. If you want to contribute more than the SEP-IRA allows at your income level, this is the move.',
      color: c.gold,
      savingLabel: 'up to $69k/yr',
    },
    {
      id: 'backdoorroth',
      title: 'Backdoor Roth IRA',
      badge: 'WHEN INCOME GROWS',
      desc: 'When income gets too high for regular Roth contributions, use the backdoor method. Contribute to Traditional IRA then convert.',
      detail: 'At higher income levels ($146k+ single in 2024) you can\'t directly contribute to a Roth IRA. The backdoor method: contribute to a non-deductible Traditional IRA ($7,000), then immediately convert it to a Roth IRA. You pay tax on any gains (minimal if done quickly), then the account is a Roth going forward. Completely legal — the IRS has explicitly approved this strategy. Relevant when your income grows significantly.',
      color: c.gold,
      savingLabel: 'future strategy',
    },
    {
      id: 'hirekids529',
      title: '529 college savings plan',
      badge: 'IF YOU HAVE KIDS',
      desc: 'State tax deduction for contributions. Money grows tax-free and withdraws tax-free for education expenses.',
      detail: `Utah has one of the best 529 plans in the country (my529). Contributions up to $4,080/year per beneficiary get a Utah state income tax credit of 5% = $204 credit (better than a deduction). Growth is 100% tax-free. Withdrawals for qualified education expenses (tuition, room, board, books, computers) are tax-free. Can also be used for K-12 tuition ($10,000/year). Recent law change: unused 529 funds can be rolled into a Roth IRA after 15 years. If you have kids, start this early — even $100/month from birth compounds to $60,000+ by college.`,
      color: c.gold,
      savingLabel: 'state tax credit',
    },
    {
      id: 'subscriptions',
      title: 'Business subscriptions',
      badge: 'ALREADY IN SCHEDULE C',
      desc: 'FlipLedger, eBay store, StockX fees, phone % for business, internet % for business — all deductible.',
      detail: 'Any subscription used for your business is deductible. Your FlipLedger subscription, eBay store subscription, StockX and GOAT platform fees are already captured as fees in your Schedule C. Additionally: your cell phone bill (deduct the business use percentage — typically 50-80% for resellers), home internet (business use percentage), and any research tools or apps. Keep a note of what percentage of phone/internet you use for business.',
      color: c.green,
      savingLabel: 'most already tracked',
    },
    {
      id: 'education',
      title: 'Education & research costs',
      badge: 'LOG IN EXPENSES',
      desc: 'Reselling courses, books, Discord memberships, cop group subscriptions, this CPA consultation — all deductible.',
      detail: 'Any education directly related to maintaining or improving skills for your current business is deductible. This includes: reselling courses, books about sneakers or collectibles, Discord server memberships for release info, cop tool subscriptions, YouTube Premium (if used for product research), and even business consulting. Keep receipts and note the business purpose for each. Cannot deduct education for a new career — must be related to your current reselling business.',
      color: c.gold,
      savingLabel: 'log to calculate',
    },
  ];

  return (
    <div style={{ background: c.bg, minHeight: '100vh', padding: '28px', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: c.text }}>
      <style>{`
        @keyframes shimmer-line { 0%,100%{opacity:.5}50%{opacity:1} }
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.25}50%{transform:scale(1.1);opacity:.5} }
        @keyframes pulse-glow { 0%,100%{transform:scale(1)}50%{transform:scale(1.3);opacity:.7} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
        .fade-in { animation: fadeInUp .4s ease both; }
      `}</style>

      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, background: `linear-gradient(135deg,${c.gold},${c.goldDark})`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 20px ${c.goldGlow}`, flexShrink: 0 }}>
            <svg width="28" height="28" viewBox="0 0 44 44" fill="none">
              <polygon points="22,6 40,14 40,30 22,22" fill="#000"/>
              <polygon points="4,14 22,6 22,22 4,30" fill="#000"/>
              <polygon points="4,30 22,22 40,30 22,38" fill="#000"/>
              <line x1="26" y1="9" x2="38" y2="15" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.gold, letterSpacing: '2px', textShadow: `0 0 30px ${c.goldGlow}` }}>GOLD MINE</div>
            <div style={{ fontSize: 10, color: c.textDim, letterSpacing: '3px', marginTop: 1 }}>WEALTH INTELLIGENCE</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <select value={stateCode} onChange={e => setStateCode(e.target.value)}
              style={{ background: '#141414', border: `1px solid ${c.border}`, borderRadius: 10, padding: '6px 10px', color: c.text, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
              {Object.entries(STATE_NAMES).sort((a,b)=>a[1].localeCompare(b[1])).map(([code,name])=>(
                <option key={code} value={code}>{code} — {name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* METRICS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'NET PROFIT', val: `$${netProfit.toLocaleString()}`, sub: `${year} YTD`, color: c.gold, bg: c.card, border: c.border },
            { label: 'EST. TAX BILL', val: `$${totalTax.toLocaleString()}`, sub: 'with savings applied', color: c.red, bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)' },
            { label: 'SAVING', val: `$${totalSavings.toLocaleString()}`, sub: 'vs no deductions', color: c.green, bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.25)' },
          ].map(m => (
            <div key={m.label} style={{ background: m.bg, border: `1px solid ${m.border}`, borderRadius: 16, padding: 16, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top:0,left:0,right:0,height:2, background:`linear-gradient(90deg,transparent,${m.color},transparent)`, animation:'shimmer-line 3s ease-in-out infinite' }} />
              <div style={{ fontSize: 9, color: `${m.color}B0`, letterSpacing: '2px', marginBottom: 8 }}>{m.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: m.color, textShadow:`0 0 20px ${m.color}50` }}>{m.val}</div>
              <div style={{ fontSize: 10, color: c.textDim, marginTop: 4 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* TAX BREAKDOWN */}
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position:'absolute',top:-50,right:-30,width:150,height:150,background:`radial-gradient(circle,${c.redGlow} 0%,transparent 60%)`,pointerEvents:'none',animation:'breathe 4s ease-in-out infinite' }} />
          <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '2px', marginBottom: 14 }}>TAX BREAKDOWN · {STATE_NAMES[stateCode]?.toUpperCase()}</div>
          {[
            [`SE tax (15.3% federal)`, seTaxFull],
            [`Federal income (${bracket.label} bracket)`, federalIncomeTax],
            [`${STATE_NAMES[stateCode]} state (${stateRate}%)`, stateIncomeTax],
          ].map(([label, val], i, arr) => (
            <div key={label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:i<arr.length-1?`1px solid ${c.border}`:'none',position:'relative',zIndex:1 }}>
              <span style={{ fontSize: 13, color: c.textMuted }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: c.text }}>${val.toLocaleString()}</span>
            </div>
          ))}
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:12,position:'relative',zIndex:1 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>Total estimated</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: c.red, textShadow:`0 0 15px ${c.redGlow}` }}>${totalTax.toLocaleString()}</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: c.textDim, borderTop:`1px solid ${c.border}`, paddingTop: 10 }}>
            QBI deduction: −${qbiDeduction.toLocaleString()} · ½ SE tax deduction: −${halfSETax.toLocaleString()} · Taxable income: ${adjustedIncome.toLocaleString()}
          </div>
        </div>

        {/* SECTION 1 */}
        <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '2px', marginBottom: 10 }}>APPLY NOW — TOGGLE TO UPDATE YOUR ESTIMATE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {applyNowTips.map(tip => <TipCard key={tip.id} tip={tip} />)}
        </div>

        {/* SECTION 2 */}
        <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '2px', marginBottom: 10 }}>START TRACKING & ADVANCED STRATEGIES</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {trackingTips.map(tip => <TipCard key={tip.id} tip={tip} />)}
        </div>

        {/* NEW BILL */}
        <div style={{ background:'rgba(52,211,153,0.08)',border:'1px solid rgba(52,211,153,0.3)',borderRadius:16,padding:'20px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',position:'relative',overflow:'hidden',marginBottom:12 }}>
          <div style={{ position:'absolute',top:0,left:0,right:0,height:2,background:'linear-gradient(90deg,transparent,#34D399,transparent)',animation:'shimmer-line 2s ease-in-out infinite' }} />
          <div>
            <div style={{ fontSize: 11, color:'rgba(52,211,153,0.7)',letterSpacing:'2px',marginBottom:4 }}>ESTIMATED BILL WITH ALL SAVINGS</div>
            <div style={{ fontSize: 12, color: c.textDim }}>saving ${totalSavings.toLocaleString()} vs no deductions</div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: c.green, textShadow:`0 0 25px ${c.greenGlow}` }}>${totalTax.toLocaleString()}</div>
        </div>

        {/* QUARTERLY */}
        <div style={{ background: c.card, border:`1px solid rgba(248,113,113,0.2)`,borderRadius:16,padding:'16px 20px',marginBottom:20 }}>
          <div style={{ fontSize: 9, color:'rgba(248,113,113,0.7)',letterSpacing:'2px',marginBottom:8 }}>QUARTERLY TAX DATES</div>
          <div style={{ fontSize: 13, color: c.textMuted, lineHeight: 1.6 }}>
            Pay estimated taxes quarterly to avoid IRS penalties. Due: <span style={{ color:c.text,fontWeight:700 }}>Apr 15 · Jun 17 · Sep 16 · Jan 15</span>
            <br/>Each quarter pay approximately: <span style={{ color:c.red,fontWeight:700 }}>${Math.round(totalTax/4).toLocaleString()}</span> · Pay at <span style={{ color:c.gold }}>IRS.gov/payments</span>
          </div>
        </div>

        {/* COMPOUND INTEREST CALCULATOR */}
        {(() => {
          const monthly = compoundMonthly !== null ? compoundMonthly : Math.round(totalSavings / 12);
          const monthlyRate = (compoundRate / 100) / 12;
          const months = compoundYears * 12;
          // Future value with monthly contributions + lump sum
          const fvLump = compoundPrincipal * Math.pow(1 + monthlyRate, months);
          const fvMonthly = monthly > 0 ? monthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate) : 0;
          const future = fvLump + fvMonthly;
          const totalContributed = compoundPrincipal + monthly * 12 * compoundYears;
          const gain = future - totalContributed;
          const roi = totalContributed > 0 ? Math.round((gain / totalContributed) * 100) : 0;

          // Year by year for table
          const tableYears = [];
          for (let y of [1,5,10,15,20,25,30,35,40].filter(y => y <= compoundYears)) {
            const m = y * 12;
            const fvL = compoundPrincipal * Math.pow(1 + monthlyRate, m);
            const fvM = monthly > 0 ? monthly * ((Math.pow(1 + monthlyRate, m) - 1) / monthlyRate) * (1 + monthlyRate) : 0;
            const tot = fvL + fvM;
            const contrib = compoundPrincipal + monthly * 12 * y;
            tableYears.push({ year: y, total: tot, contributed: contrib, interest: tot - contrib });
          }
          // Always include final year
          if (!tableYears.find(t => t.year === compoundYears)) {
            tableYears.push({ year: compoundYears, total: future, contributed: totalContributed, interest: gain });
          }

          // Chart bars (every 5 years)
          const chartPts = [];
          for (let y = 1; y <= compoundYears; y++) {
            if (y % Math.max(1, Math.floor(compoundYears / 8)) === 0 || y === compoundYears) {
              const m = y * 12;
              const fvL = compoundPrincipal * Math.pow(1 + monthlyRate, m);
              const fvM = monthly > 0 ? monthly * ((Math.pow(1 + monthlyRate, m) - 1) / monthlyRate) * (1 + monthlyRate) : 0;
              const tot = fvL + fvM;
              const contrib = compoundPrincipal + monthly * 12 * y;
              chartPts.push({ year: y, total: tot, contributed: contrib });
            }
          }
          const maxVal = future;

          return (
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: '20px', marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position:'absolute',bottom:-40,left:-30,width:160,height:160,background:`radial-gradient(circle,${c.greenGlow} 0%,transparent 60%)`,pointerEvents:'none' }} />
              <div style={{ position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${c.gold},${c.green},${c.gold},transparent)`,backgroundSize:'200% 100%',animation:'border-flow 3s linear infinite' }} />
              <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '2px', marginBottom: 4 }}>COMPOUND INTEREST CALCULATOR</div>
              <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 16 }}>What if you invested your tax savings every year?</div>

              {/* Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '1px', marginBottom: 6 }}>STARTING AMOUNT</div>
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: c.textDim, fontWeight: 800 }}>$</span>
                    <input type="number" value={compoundPrincipal} onChange={e => setCompoundPrincipal(parseFloat(e.target.value)||0)} placeholder="0"
                      style={{ background:'transparent',border:'none',outline:'none',color:c.text,fontSize:15,fontWeight:700,width:'100%',fontFamily:'inherit' }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '1px', marginBottom: 6 }}>MONTHLY CONTRIBUTION</div>
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: c.textDim, fontWeight: 800 }}>$</span>
                    <input type="number" value={compoundMonthly !== null ? compoundMonthly : Math.round(totalSavings/12)}
                      onChange={e => setCompoundMonthly(parseFloat(e.target.value)||0)} placeholder={Math.round(totalSavings/12)}
                      style={{ background:'transparent',border:'none',outline:'none',color:c.text,fontSize:15,fontWeight:700,width:'100%',fontFamily:'inherit' }} />
                  </div>
                  {compoundMonthly === null && <div style={{ fontSize: 10, color: c.textDim, marginTop: 4 }}>auto-filled from tax savings</div>}
                </div>
              </div>

              {/* Rate slider */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '1px' }}>ANNUAL RETURN</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: c.gold }}>{compoundRate}%</div>
                </div>
                <input type="range" min={1} max={20} step={0.5} value={compoundRate} onChange={e => setCompoundRate(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: c.gold }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: c.textDim, marginTop: 3 }}>
                  <span>1%</span><span style={{ color: compoundRate >= 9 && compoundRate <= 11 ? c.gold : c.textDim }}>S&P 500 avg ~10%</span><span>20%</span>
                </div>
              </div>

              {/* Year buttons */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: c.textDim, letterSpacing: '1px', marginBottom: 8 }}>TIME PERIOD</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[5,10,20,30,40].map(y => (
                    <button key={y} onClick={() => setCompoundYears(y)}
                      style={{ background: compoundYears === y ? `linear-gradient(135deg,${c.gold},${c.goldDark})` : 'rgba(255,255,255,0.04)', border: `1px solid ${compoundYears === y ? c.gold : c.border}`, borderRadius: 100, padding: '6px 16px', fontSize: 12, fontWeight: 700, color: compoundYears === y ? '#000' : c.textMuted, cursor: 'pointer', boxShadow: compoundYears === y ? `0 4px 14px ${c.goldGlow}` : 'none' }}>
                      {y} yrs
                    </button>
                  ))}
                </div>
              </div>

              {/* Hero result */}
              <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 14, padding: '16px 18px', marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position:'absolute',top:0,left:0,right:0,height:2,background:'linear-gradient(90deg,transparent,#34D399,transparent)',animation:'shimmer-line 2s ease-in-out infinite' }} />
                <div style={{ fontSize: 9, color: 'rgba(52,211,153,0.7)', letterSpacing: '2px', marginBottom: 6 }}>AFTER {compoundYears} YEARS</div>
                <div style={{ fontSize: 44, fontWeight: 900, color: c.green, textShadow: `0 0 30px ${c.greenGlow}`, lineHeight: 1, letterSpacing: '-2px', marginBottom: 12 }}>
                  ${Math.round(future).toLocaleString()}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {[
                    ['CONTRIBUTED', `$${Math.round(totalContributed).toLocaleString()}`, c.textMuted],
                    ['INTEREST', `$${Math.round(gain).toLocaleString()}`, c.green],
                    ['RETURN', `${roi}%`, c.gold],
                  ].map(([label, val, color]) => (
                    <div key={label}>
                      <div style={{ fontSize: 9, color: c.textDim, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
                  {chartPts.map(p => {
                    const h = Math.max(4, Math.round((p.total / maxVal) * 96));
                    const contribH = Math.max(2, Math.round((Math.min(p.contributed, p.total) / maxVal) * 96));
                    const interestH = Math.max(0, h - contribH);
                    return (
                      <div key={p.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                        <div style={{ width: '100%', background: c.green, borderRadius: '3px 3px 0 0', height: interestH }} />
                        <div style={{ width: '100%', background: 'rgba(201,169,98,0.5)', height: contribH }} />
                        <div style={{ fontSize: 9, color: c.textDim, marginTop: 4, whiteSpace: 'nowrap' }}>y{p.year}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, background: 'rgba(201,169,98,0.5)', borderRadius: 2 }} />
                    <span style={{ fontSize: 10, color: c.textDim }}>contributed</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, background: c.green, borderRadius: 2 }} />
                    <span style={{ fontSize: 10, color: c.textDim }}>interest</span>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', marginBottom: 8 }}>
                  {['YEAR','CONTRIBUTED','INTEREST','TOTAL'].map(h => (
                    <div key={h} style={{ fontSize: 9, color: c.textDim, letterSpacing: '1px', textAlign: h !== 'YEAR' ? 'right' : 'left' }}>{h}</div>
                  ))}
                </div>
                {tableYears.map((row, i) => (
                  <div key={row.year} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '8px 0', borderBottom: i < tableYears.length - 1 ? `1px solid ${c.border}` : 'none', background: row.year === compoundYears ? 'rgba(52,211,153,0.05)' : 'transparent', borderRadius: row.year === compoundYears ? 8 : 0 }}>
                    <div style={{ fontSize: 13, fontWeight: row.year === compoundYears ? 800 : 500, color: row.year === compoundYears ? c.text : c.textMuted }}>{row.year}</div>
                    <div style={{ fontSize: 13, fontWeight: row.year === compoundYears ? 800 : 500, color: row.year === compoundYears ? 'rgba(201,169,98,0.8)' : c.textDim, textAlign: 'right' }}>${Math.round(row.contributed).toLocaleString()}</div>
                    <div style={{ fontSize: 13, fontWeight: row.year === compoundYears ? 800 : 500, color: row.year === compoundYears ? c.green : 'rgba(52,211,153,0.5)', textAlign: 'right' }}>${Math.round(row.interest).toLocaleString()}</div>
                    <div style={{ fontSize: 13, fontWeight: row.year === compoundYears ? 900 : 600, color: row.year === compoundYears ? c.gold : c.textMuted, textAlign: 'right' }}>${Math.round(row.total).toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {/* COMPOUND DISCLAIMER */}
              <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: c.textDim, lineHeight: 1.7 }}>
                  <span style={{ color: c.textMuted, fontWeight: 700 }}>Illustrative purposes only.</span> Calculations assume a fixed annual return compounded monthly. Actual investment returns vary and are not guaranteed. Past market performance does not predict future results. FlipLedger is not a registered investment advisor. This calculator does not constitute investment advice. Consult a qualified financial advisor before making investment decisions.
                </div>
              </div>

            </div>
          );
        })()}

        {/* LEGAL DISCLAIMER */}
        <div style={{ background:'rgba(255,255,255,0.02)', border:`1px solid ${c.border}`, borderRadius:16, padding:'20px 24px', marginBottom:28 }}>
          <div style={{ fontSize:9, color:'rgba(248,113,113,0.6)', letterSpacing:'2px', marginBottom:14 }}>⚠️ IMPORTANT — PLEASE READ</div>

          <div style={{ fontSize:12, color:c.textDim, lineHeight:1.9, marginBottom:10 }}>
            <span style={{ color:c.text, fontWeight:700 }}>This is NOT tax advice. This is NOT legal advice. This is NOT financial advice.</span> Nothing in this section constitutes professional advice of any kind. FlipLedger is a software tool that performs general calculations for <span style={{ color:c.textMuted, fontWeight:700 }}>informational and educational purposes only.</span>
          </div>

          <div style={{ fontSize:12, color:c.textDim, lineHeight:1.9, marginBottom:10 }}>
            All numbers shown are <span style={{ color:c.textMuted, fontWeight:700 }}>estimates based on publicly available general tax rates</span> and do not account for your specific financial situation, deduction eligibility, filing status, or applicable laws. Actual tax liability may differ significantly.
          </div>

          <div style={{ fontSize:12, color:c.textDim, lineHeight:1.9, marginBottom:10 }}>
            FlipLedger LLC does not prepare tax returns, represent users before the IRS or any tax authority, provide accounting services, or offer investment advisory services. <span style={{ color:c.textMuted, fontWeight:700 }}>FlipLedger LLC is not a licensed CPA firm, law firm, or registered investment advisor.</span>
          </div>

          <div style={{ fontSize:12, color:c.textDim, lineHeight:1.9, marginBottom:10 }}>
            Tax laws change frequently and vary by jurisdiction. Information presented may be outdated or inapplicable to your situation. <span style={{ color:c.textMuted, fontWeight:700 }}>Always consult a licensed CPA, enrolled agent, tax attorney, or qualified financial advisor</span> before making any tax, legal, or investment decisions.
          </div>

          <div style={{ marginTop:16, padding:'14px 16px', background:'rgba(248,113,113,0.05)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:10 }}>
            <div style={{ fontSize:11, color:'rgba(248,113,113,0.7)', lineHeight:1.8 }}>
              <span style={{ fontWeight:700, color:'rgba(248,113,113,0.9)' }}>LIMITATION OF LIABILITY:</span> By using this feature, you acknowledge and agree that FlipLedger LLC, its owners, employees, and affiliates are not liable for any tax penalties, interest charges, audits, fines, financial losses, or damages of any kind arising from your use of or reliance on any information, estimate, or calculation provided here. Use entirely at your own risk.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
