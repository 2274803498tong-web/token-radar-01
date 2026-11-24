// Token Radar's dashboard, radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, the live-token comparables, and the method. No network:
// every byte it shows is in data.js. The page recomputes each row's implied value from the
// snapshot figures, so the arithmetic it shows and board.json are the same numbers.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var MODEL = DATA.model;

  // Row tuple: [rank, slug, name, category, chains, tvl, change_7d, age, implied, growthMult,
  // maturityMult, categoryMultiple, comparables]
  // Live tuple: [slug, name, category, chains, tvl, mcap, change_7d, multiple]
  function row(rank, slug, name, category, chains, tvl, change, age, implied, gm, mm, mult, n) {
    return { rank: rank, slug: slug, name: name, category: category, chains: chains, tvl: tvl,
      change_7d: change, age_days: age, implied: implied, growthMult: gm, maturityMult: mm,
      catMult: mult, comparables: n };
  }
  var ROWS = DATA.rows.map(function (r) { return row.apply(null, r); });
  var LIVE = DATA.live.map(function (l) {
    return { slug: l[0], name: l[1], category: l[2], chains: l[3], tvl: l[4], mcap: l[5],
      change_7d: l[6], multiple: l[7] };
  });
  var BY_SLUG = {};
  ROWS.forEach(function (r) { BY_SLUG[r.slug] = r; });
  // The snapshot's watchlist, by slug: the page marks a row on the watchlist exactly when
  // its slug is one of these, the same list board.json covers.
  var WATCHLIST = {};
  (DATA.watchlist || []).forEach(function (s) { WATCHLIST[s] = true; });
  var state = { q: '', category: 'all', chain: 'all', watchlist: false, sort: 'implied',
    dir: -1, selected: null, tab: 'board' };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the
  // same arithmetic. Order of operations matches lib/model.ts exactly.
  function impliedOf(r) {
    return Math.max(1, Math.round(r.tvl * r.catMult * r.growthMult * r.maturityMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL
  // and age decide the action, the capital, the hold and every cost and time. No name is
  // special-cased, so the plan the detail view shows and the plan board.json carries agree.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl >= 5e9) return 250;
    if (p.tvl >= 1e9) return 150;
    if (p.tvl >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow a small amount against it and repay it once.';
    if (c.indexOf('dex') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s highest-volume pool on " + chain + ' and keep the LP receipt.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-yield vault on " + chain + ' and leave it compounding.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ', then use the bridged funds inside its app.';
    if (c.indexOf('restak') >= 0) return 'Restake $' + capital + ' of the receipt token through ' + name + ' on ' + chain + ' and keep the restaking receipt.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('staking pool') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and hold the staking receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0 || c.indexOf('synthetic') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ', open one small hedged position, and close it within the week.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and take one small position in a market that settles after this week.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0 || c.indexOf('anchor btc') >= 0 || c.indexOf('decentralized btc') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + "'s yield-bearing asset on " + chain + ' and hold it to maturity of the position.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('launchpad') >= 0) return 'Stake the qualifying amount on ' + name + ' and register for its next launch allocation.';
    if (c.indexOf('nft marketplace') >= 0) return 'List one item or buy one low-value item on ' + name + ' to open a trading history.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + " through " + name + "'s card or payment flow on " + chain + ' and keep the receipt.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold it.';
    if (c.indexOf('governance') >= 0) return "Join " + name + "'s governance forum and vote in its next off-chain poll.";
    if (c.indexOf('token locker') >= 0) return 'Lock $' + capital + ' of LP tokens in ' + name + ' on ' + chain + ' for the shortest lock it offers.';
    if (c.indexOf('privacy') >= 0) return 'Use ' + name + "'s shielded pool on " + chain + ' for one private deposit and withdrawal.';
    if (c.indexOf('ai agent') >= 0 || c.indexOf('decentralized ai') >= 0) return 'Run one paid task through ' + name + "'s agent marketplace on " + chain + ' and keep the job receipt.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to the chain ' + name + ' runs and use one of its apps.';
    if (c.indexOf('otc') >= 0) return 'Place one small OTC quote request on ' + name + ' and settle it on ' + chain + '.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' managed position on ' + chain + ' and keep it open.';
    if (c.indexOf('cede') >= 0 || c.indexOf('reserve currency') >= 0 || c.indexOf('dor') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a top-up supply and one borrow-and-repay';
    if (c.indexOf('dex') >= 0) return 'one more swap in the main pool';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'a top-up deposit into the vault';
    if (c.indexOf('bridge') >= 0) return 'one more bridge of a small amount';
    if (c.indexOf('restak') >= 0) return 'one more restake of a small receipt';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('staking pool') >= 0 || c.indexOf('staking') >= 0) return 'a top-up stake';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0 || c.indexOf('synthetic') >= 0 || c.indexOf('options') >= 0) return 'one small hedged trade';
    if (c.indexOf('prediction') >= 0) return 'one small position in a new market';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'a top-up deposit into the vault';
    if (c.indexOf('stable') >= 0 || c.indexOf('anchor btc') >= 0 || c.indexOf('decentralized btc') >= 0) return 'one more mint or deposit';
    if (c.indexOf('rwa') >= 0) return 'a top-up mint of the yield asset';
    if (c.indexOf('insurance') >= 0) return 'a renewal check on the cover';
    if (c.indexOf('launchpad') >= 0) return 'one check of the next allocation round';
    if (c.indexOf('nft marketplace') >= 0) return 'one more low-value trade';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'one more spend through the card';
    if (c.indexOf('index') >= 0) return 'a top-up buy of the index';
    if (c.indexOf('governance') >= 0) return 'one more vote in an off-chain poll';
    if (c.indexOf('token locker') >= 0) return 'one check of the lock schedule';
    if (c.indexOf('privacy') >= 0) return 'one more shielded transfer';
    if (c.indexOf('ai agent') >= 0 || c.indexOf('decentralized ai') >= 0) return 'one more paid task through the marketplace';
    if (c.indexOf('chain') >= 0) return 'one more use of an app on the chain';
    if (c.indexOf('otc') >= 0) return 'one more small quote request';
    if (c.indexOf('liquidity manager') >= 0) return 'a top-up deposit into the managed position';
    return 'one more deposit into the position';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Once a week, do one more qualifying action on ' + chain + ', such as ' + weeklyActionFor(p) + '.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open " + p.name + "'s own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // State in the hash, so a filtered view or a detail view is a link anyone can open.
  function readHash() {
    var params = new URLSearchParams(location.hash.slice(1));
    state.q = params.get('q') || '';
    state.category = params.get('category') || 'all';
    state.chain = params.get('chain') || 'all';
    state.watchlist = params.get('wl') === '1';
    state.sort = params.get('sort') || 'implied';
    state.dir = params.get('dir') === 'asc' ? 1 : -1;
    state.selected = params.get('p') || null;
    state.tab = params.get('tab') || 'board';
    if (['board', 'live', 'method'].indexOf(state.tab) < 0) state.tab = 'board';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlist) params.set('wl', '1');
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.dir === 1) params.set('dir', 'asc');
    if (state.selected) params.set('p', state.selected);
    if (state.tab !== 'board') params.set('tab', state.tab);
    var hash = params.toString();
    history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
  }

  var $ = function (id) { return document.getElementById(id); };
  var qInput = $('q'), catSelect = $('category'), chainSelect = $('chain'),
    wlCheck = $('watchlist'), sortSelect = $('sort'), dirBtn = $('dir'),
    countEl = $('count'), rowsEl = $('rows'), detailEl = $('detail'),
    boardView = $('board-view'), liveView = $('live-view'), methodView = $('method-view'),
    controlsEl = $('controls');

  // The filter options come from the board itself, so no category or chain is ever empty.
  var categories = {}, chains = {};
  ROWS.forEach(function (r) {
    if (r.category) categories[r.category] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  Object.keys(categories).sort().forEach(function (c) {
    catSelect.appendChild(el('option', { value: c, text: c + ' (' + ROWS.filter(function (r) { return r.category === c; }).length + ')' }));
  });
  Object.keys(chains).sort().forEach(function (c) {
    chainSelect.appendChild(el('option', { value: c, text: c }));
  });

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = ROWS.filter(function (r) {
      if (state.watchlist && !WATCHLIST[r.slug]) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    list.sort(function (a, b) {
      var d = 0;
      if (key === 'rank' || key === 'implied') d = a.implied - b.implied;
      else if (key === 'tvl') d = a.tvl - b.tvl;
      else if (key === 'change') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (key === 'age') d = (a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days);
      else if (key === 'name') d = a.name.localeCompare(b.name);
      if (d === 0) d = a.rank - b.rank;
      return d * dir;
    });
    return list;
  }

  function renderBoard() {
    var list = filtered();
    var top = fmtUsd(list.length ? list[0].implied : 0);
    countEl.innerHTML = '';
    countEl.appendChild(el('strong', { text: String(list.length) }));
    countEl.appendChild(document.createTextNode(' of ' + ROWS.length + ' ranked protocols'));
    if (list.length) countEl.appendChild(document.createTextNode(' · top implied value ' + top));
    rowsEl.innerHTML = '';
    var frag = document.createDocumentFragment();
    list.forEach(function (r) {
      var tr = el('tr', { 'data-slug': r.slug, onclick: function () { select(r.slug); } });
      if (state.selected === r.slug) tr.className = 'selected';
      var nameCell = el('td', null, el('span', { class: 'name', text: r.name }), document.createTextNode(' '), el('span', { class: 'slug', text: r.slug }));
      if (WATCHLIST[r.slug]) nameCell.appendChild(el('span', { class: 'badge', text: 'WATCHLIST' }));
      tr.appendChild(el('td', { class: 'rank num', text: String(r.rank) }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { text: r.category || '—' }));
      tr.appendChild(el('td', { text: r.chains.slice(0, 2).join(', ') || '—' }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl) }));
      var chg = el('td', { class: 'num ' + ((r.change_7d || 0) >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) });
      tr.appendChild(chg);
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.implied) }));
      tr.appendChild(el('td', { class: 'num', text: fmtMult(r.catMult) }));
      frag.appendChild(tr);
    });
    rowsEl.appendChild(frag);
  }

  function stat(label, value, note) {
    var v = el('div', { class: 'v' });
    if (typeof value === 'string') v.textContent = value;
    else v.appendChild(value);
    if (note) v.appendChild(el('small', { text: ' ' + note }));
    return el('div', { class: 'stat' }, el('div', { class: 'k', text: label }), v);
  }

  function renderDetail() {
    detailEl.innerHTML = '';
    var r = state.selected ? BY_SLUG[state.selected] : null;
    if (!r) { detailEl.hidden = true; return; }
    detailEl.hidden = false;
    var recomputed = impliedOf(r);
    var head = el('div', null,
      el('h2', { text: r.name }),
      el('p', { class: 'sub', text: r.slug + ' · ' + (r.category || 'uncategorised') + ' · ' + (r.chains.join(', ') || 'no chain recorded') + (WATCHLIST[r.slug] ? ' · on the watchlist' : ' · early radar') + ' · rank #' + r.rank + ' of ' + ROWS.length }));
    var stats = el('div', { class: 'stats' },
      stat('Implied value', fmtUsd(r.implied)),
      stat('TVL', fmtUsd(r.tvl)),
      stat('7-day change', fmtPct(r.change_7d)),
      stat('Age', fmtAge(r.age_days)),
      stat('Category multiple', fmtMult(r.catMult), '(' + r.comparables + ' peers)'),
      stat('Growth × maturity', r.growthMult.toFixed(2) + ' × ' + r.maturityMult.toFixed(2)));
    var modelLine = el('p', { class: 'model-line' });
    modelLine.appendChild(document.createTextNode('Implied value = TVL × category multiple × growth × maturity = '));
    modelLine.appendChild(el('code', { text: fmtUsd(r.tvl) + ' × ' + r.catMult.toFixed(4) + ' × ' + r.growthMult.toFixed(4) + ' × ' + r.maturityMult.toFixed(4) }));
    modelLine.appendChild(document.createTextNode(' = ' + fmtUsd(recomputed) + '. '));
    if (recomputed === r.implied) {
      modelLine.appendChild(el('span', { class: 'ok', text: '✓ matches the board' }));
    } else {
      modelLine.appendChild(document.createTextNode('Board carries ' + fmtUsd(r.implied) + '.'));
    }
    var steps = el('ol', { class: 'steps' });
    farmSteps(r).forEach(function (s) { steps.appendChild(el('li', { text: s })); });
    detailEl.appendChild(head);
    detailEl.appendChild(stats);
    detailEl.appendChild(modelLine);
    detailEl.appendChild(el('h3', { text: 'Farm plan — six steps, cost and time for each' }));
    detailEl.appendChild(steps);
    detailEl.appendChild(el('p', { class: 'caveat', text: 'The snapshot records no token for ' + r.name + ' — no market cap, no CoinGecko id, no symbol. That is the snapshot’s own record, not proof it has none: a token may exist off the snapshot, and a farm plan is a plan for a possible airdrop, not a promise of one. Do not put in more than you can lose, and never pay to claim.' }));
  }

  function renderLive() {
    liveView.innerHTML = '';
    liveView.appendChild(el('h2', { text: 'Live tokens — the comparables' }));
    liveView.appendChild(el('p', { text: 'These ' + LIVE.length + ' protocols already trade. Their market-cap-to-TVL ratios are the comparables the model reads: each category’s multiple is the median of its tokenized peers in this same snapshot. The board never ranks them — a live token has a market price, so there is nothing to imply.' }));
    var table = el('table', null,
      el('thead', null, el('tr', null,
        el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { text: 'Chains' }),
        el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }),
        el('th', { class: 'num', text: '7d' }), el('th', { class: 'num', text: 'MCap / TVL' }))));
    var body = el('tbody');
    LIVE.forEach(function (l) {
      var tr = el('tr', null);
      tr.appendChild(el('td', null, el('span', { class: 'name', text: l.name }), document.createTextNode(' '), el('span', { class: 'slug', text: l.slug })));
      tr.appendChild(el('td', { text: l.category || '—' }));
      tr.appendChild(el('td', { text: l.chains.slice(0, 2).join(', ') || '—' }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(l.tvl) }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(l.mcap) }));
      tr.appendChild(el('td', { class: 'num ' + ((l.change_7d || 0) >= 0 ? 'up' : 'down'), text: fmtPct(l.change_7d) }));
      tr.appendChild(el('td', { class: 'num', text: fmtMult(l.multiple) }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    liveView.appendChild(table);
  }

  function renderMethod() {
    methodView.innerHTML = '';
    methodView.appendChild(el('h2', { text: 'How the radar ranks' }));
    methodView.appendChild(el('p', { text: 'The board ranks ' + ROWS.length + ' pre-token protocols: the ' + DATA.watchlist_size + ' on the watchlist, plus the ' + DATA.early_size + ' strongest pre-token protocols below the $50M watchlist floor. A protocol is pre-token when its snapshot record carries no token — no market cap, no CoinGecko id, no symbol. Live-token protocols are set aside as comparables, and exchanges and versioned pools are excluded from ranking.' }));
    var formula = 'implied value  =  TVL  x  category multiple  x  growth  x  maturity\n' +
      'category multiple  =  median market-cap / TVL of the tokenized peers\n' +
      '                     in the same category, clamped to 0.05x – 3.0x\n' +
      '                     (fewer than ' + MODEL.min_comparables + ' peers: the global median)\n' +
      'growth             =  1 + clamp(7-day change, ' + MODEL.growth_floor + '%, ' + MODEL.growth_cap + '%) / 100 x ' + MODEL.growth_weight + '\n' +
      'maturity           =  ' + MODEL.maturity_floor + ' + min(age, ' + MODEL.maturity_days + ' days) / ' + MODEL.maturity_days + ' x ' + MODEL.maturity_range + '\n' +
      '                     (age unknown: ' + MODEL.unknown_age_days + ' days)\n' +
      'implied value is capped at ' + fmtUsd(MODEL.implied_cap) + ' and floored at $1.';
    methodView.appendChild(el('div', { class: 'formula', text: formula }));
    methodView.appendChild(el('p', { text: 'Every multiple below is read out of this snapshot, not typed in by hand. A category with a small sample falls back to the global median, and the multiple is clamped so one outlier peer cannot carry a whole category.' }));
    var table = el('table', null,
      el('thead', null, el('tr', null,
        el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Multiple' }), el('th', { class: 'num', text: 'Peers' }))));
    var body = el('tbody');
    Object.keys(DATA.multiples).sort(function (a, b) { return DATA.multiples[b][0] - DATA.multiples[a][0]; }).forEach(function (cat) {
      var m = DATA.multiples[cat];
      var tr = el('tr', null);
      tr.appendChild(el('td', { text: cat === '(global)' ? 'Global fallback' : cat }));
      tr.appendChild(el('td', { class: 'num', text: fmtMult(m[0]) }));
      tr.appendChild(el('td', { class: 'num', text: String(m[1]) }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    methodView.appendChild(table);
    methodView.appendChild(el('p', { text: 'What the model cannot see: the snapshot has no points program, no airdrop promise and no future token supply, so the farm plan is a concrete way to qualify, not a claim that a token will launch. Implied values are this entry’s own claim, built from the snapshot’s figures — not investment advice, and not a prediction.' }));
  }

  function select(slug) {
    state.selected = state.selected === slug ? null : slug;
    writeHash();
    renderAll();
    if (state.selected) detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderAll() {
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
    });
    boardView.hidden = state.tab !== 'board';
    liveView.hidden = state.tab !== 'live';
    methodView.hidden = state.tab !== 'method';
    controlsEl.style.display = state.tab === 'board' ? '' : 'none';
    countEl.style.display = state.tab === 'board' ? '' : 'none';
    if (state.tab === 'board') { renderBoard(); renderDetail(); }
    if (state.tab === 'live') renderLive();
    if (state.tab === 'method') renderMethod();
  }

  qInput.addEventListener('input', function () { state.q = qInput.value; writeHash(); renderBoard(); });
  catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); renderBoard(); });
  chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); renderBoard(); });
  wlCheck.addEventListener('change', function () { state.watchlist = wlCheck.checked; writeHash(); renderBoard(); });
  sortSelect.addEventListener('change', function () { state.sort = sortSelect.value; writeHash(); renderBoard(); });
  dirBtn.addEventListener('click', function () {
    state.dir = state.dir === 1 ? -1 : 1;
    dirBtn.textContent = state.dir === 1 ? '↑ asc' : '↓ desc';
    writeHash(); renderBoard();
  });
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.tab = b.getAttribute('data-tab');
      writeHash(); renderAll();
    });
  });
  document.querySelectorAll('#board thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sort === key) state.dir = state.dir === 1 ? -1 : 1;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      sortSelect.value = state.sort;
      dirBtn.textContent = state.dir === 1 ? '↑ asc' : '↓ desc';
      writeHash(); renderBoard();
    });
  });
  window.addEventListener('hashchange', function () { readHash(); syncControls(); renderAll(); });

  function syncControls() {
    qInput.value = state.q;
    catSelect.value = state.category;
    chainSelect.value = state.chain;
    wlCheck.checked = state.watchlist;
    sortSelect.value = state.sort;
    dirBtn.textContent = state.dir === 1 ? '↑ asc' : '↓ desc';
  }

  // The header and footer carry the snapshot's own provenance.
  var top = ROWS.length ? ROWS[0] : null;
  $('meta').innerHTML = '';
  $('meta').appendChild(el('div', null, el('strong', { text: String(ROWS.length) }), document.createTextNode(' ranked · ' + DATA.watchlist_size + ' watchlist · ' + DATA.early_size + ' early')));
  $('meta').appendChild(el('div', { text: 'Snapshot ' + DATA.as_of + ' · DefiLlama' }));
  $('meta').appendChild(el('div', { text: 'Model ' + DATA.model_version + ' · top implied ' + (top ? fmtUsd(top.implied) : 'n/a') }));
  $('foot').textContent = 'Source: ' + DATA.source + ', snapshot ' + DATA.as_of + '. Implied values are this entry’s own claim from the snapshot’s figures — not investment advice, not a prediction that a token will launch. The board covers every protocol on the snapshot’s watchlist plus the strongest pre-token protocols below the $50M floor. Model ' + DATA.model_version + '.';

  readHash();
  syncControls();
  renderAll();
})();
