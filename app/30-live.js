/* ==========================================================================
   30-live.js — живой контур: обход CORS-ограничений, RSS/JSON, курсы BNM, кэш
   Портал работает и офлайн (из архива). Кнопка «обновить» подтягивает свежее.
   ========================================================================== */
(function () {
'use strict';
const { S, TOPICS, $, el, esc, clamp, debounce } = P;

const PROXIES = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://corsproxy.io/?' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u),
  u => u
];
const BNM_XML = [
  u => 'https://www.bnm.md/ro/official_exchange_rates?get_xml=1&date=' + bnmDate(),
  u => 'https://www.bnm.md/en/official_exchange_rates?get_xml=1&date=' + bnmDate()
];
function bnmDate(){
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return p(d.getDate())+'.'+p(d.getMonth()+1)+'.'+d.getFullYear();
}

const KEYMAP = { policy:'A', market:'B', bnm:'B', religion:'C', edu:'D', gov:'A', it:'F',
                 politics:'A', economy:'B', educație:'D', tehnologii:'F' };
const CATBYID = { A:'A', B:'B', C:'C', D:'D', E:'E', F:'F' };

function keyToTarget(key){
  const parts = key.split('.');
  const scope = parts[0].toLowerCase()==='md' ? 'MD' : 'WORLD';
  const tail = (parts[1]||'').toLowerCase();
  const cat = KEYMAP[tail] || null;
  return cat ? {scope, cat} : null;
}

/* ---------- fetch с таймаутом ---------- */
function withTimeout(url, ms){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), ms||9000);
  return fetch(url, {signal:ctl.signal, redirect:'follow', credentials:'omit'})
    .then(r=>{ clearTimeout(t); if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); })
    .catch(e=>{ clearTimeout(t); throw e; });
}
function viaProxies(url, ms){
  let chain = Promise.reject(new Error('start'));
  for (const mk of PROXIES){
    chain = chain.catch(()=> withTimeout(mk(url), ms));
  }
  return chain;
}

/* ---------- разбор RSS/Atom ---------- */
function parseFeed(text, srcName){
  if (!text) return [];
  let doc;
  try { doc = new DOMParser().parseFromString(text, 'application/xml'); } catch(e){ return []; }
  if (doc.querySelector('parsererror')) {
    try { doc = new DOMParser().parseFromString(text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,''), 'application/xml'); }
    catch(e){ return []; }
  }
  let nodes = [...doc.querySelectorAll('item'), ...doc.querySelectorAll('entry')];
  const out = [];
  const one = n => (n.textContent||'').trim();
  const linkOf = n => {
    const l = n.querySelector('link');
    if (l){ const h = l.getAttribute('href') || one(l); if (h) return h; }
    const gu = n.querySelector('guid'); if (gu && /^https?:/.test(one(gu))) return one(gu);
    return '';
  };
  for (const n of nodes.slice(0,14)){
    const title = one(n.querySelector('title')) || one(n.querySelector('media\\:title'));
    if (!title) continue;
    let dateRaw = one(n.querySelector('pubDate')) || one(n.querySelector('updated')) ||
                  one(n.querySelector('published')) || one(n.querySelector('dc\\:date'));
    let ts = dateRaw ? Date.parse(dateRaw) : NaN;
    if (!isFinite(ts)) ts = 0;
    let sum = one(n.querySelector('description')) || one(n.querySelector('summary')) || one(n.querySelector('content\\:encoded')) || '';
    sum = sum.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#\d+;/g,' ').replace(/\s+/g,' ').trim().slice(0,420);
    out.push({ title: title.slice(0,220), url: linkOf(n), ts, date: ts?P.iso(ts):null,
               summary: sum, source: srcName || 'источник', live:true, uid:P.hash(linkOf(n)||title) });
  }
  return out;
}
function parseJsonFeed(json, srcName){
  let d; try { d = JSON.parse(json); } catch(e){ return []; }
  const arr = Array.isArray(d) ? d : (d.items||d.articles||d.results||d.data||[]);
  const out = [];
  for (const x of (Array.isArray(arr)?arr:[]).slice(0,14)){
    const title = x.title||x.headline||x.name; if (!title) continue;
    const url = x.url||x.link||(x.guid&&String(x.guid))||'';
    let ts = Date.parse(x.publishedAt||x.published_at||x.date||x.pubDate||''); if(!isFinite(ts)) ts=0;
    out.push({ title:String(title).slice(0,220), url, ts, date: ts?P.iso(ts):null,
      summary: String(x.description||x.summary||x.content||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,420),
      source: (x.source&&(x.source.name||x.source))||srcName||'источник', live:true, uid:P.hash(url||title) });
  }
  return out;
}

/* ---------- курсы BNM ---------- */
function parseBnm(xml){
  let doc; try{ doc = new DOMParser().parseFromString(xml,'application/xml'); }catch(e){ return null; }
  if (!doc || !doc.documentElement) return null;
  if (doc.getElementsByTagName('parsererror').length) return null;
  /* BNM: <ValCurs Date=".."><Valute><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>20.1616</Value> */
  const vals = [...doc.querySelectorAll('Valute, ValItem')];
  if (!vals.length) return null;
  const de = doc.documentElement;
  const date = (de.getAttribute('Date') || de.getAttribute('date') || '').trim();
  const WANT = { EUR:'EUR',USD:'USD',RON:'RON',RUB:'RUB',UAH:'UAH',GBP:'GBP',TRY:'TRY',BGN:'BGN',CHF:'CHF',PLN:'PLN',
                 '978':'EUR','840':'USD','946':'RON','643':'RUB','980':'UAH','826':'GBP','949':'TRY','975':'BGN','756':'CHF','985':'PLN' };
  const txt = (node, tag) => { const e = node.getElementsByTagName(tag); return (e && e[0] && e[0].textContent.trim()) || ''; };
  const out = [];
  for (const v of vals){
    const raw = (txt(v,'CharCode') || txt(v,'Iso')).toUpperCase();
    const code = WANT[raw];
    if (!code) continue;
    const scale = parseFloat(txt(v,'Nominal') || txt(v,'Scale') || '1') || 1;
    const rate  = parseFloat((txt(v,'Value') || txt(v,'Rate')).replace(',','.'));
    if (isFinite(rate) && rate > 0) out.push({ code, rate: rate/(scale||1) });
  }
  return out.length ? {date, rates:out} : null;
}
function renderFx(){
  const box = $('#fx'); if(!box) return;
  if (!S.fx || !S.fx.length){ box.innerHTML=''; return; }
  box.innerHTML = S.fx.slice(0,6).map(f=>`<span><u>${esc(f.k)} MDL</u><i>${esc(f.v)}</i></span>`).join('');
}
function refreshBnm(){
  let chain = Promise.reject(new Error('start'));
  for (const mk of BNM_XML) chain = chain.catch(()=> viaProxies(mk(''), 9000));
  return chain.then(xml=>{
    const r = parseBnm(xml);
    if (!r) throw new Error('BNM: нет структуры XML');
    const want = ['EUR','USD','RON','RUB','UAH','GBP','TRY','BGN'];
    S.fx = r.rates.filter(x=>want.includes(x.code)).sort((a,b)=>want.indexOf(a.code)-want.indexOf(b.code))
                  .map(x=>({k:x.code, v:x.rate.toFixed(4)}));
    S.fxDate = r.date;
    renderFx();
    P.toast('BNM: курсы на '+(r.date||'сегодня')+' · '+S.fx.length+' валют');
    return true;
  }).catch(()=>{ renderFx(); return false; });
}

/* ---------- обновление ленты ---------- */
let busy = false;
function sourcesMap(){
  const src = window.SOURCES;
  if (!src) return {};
  const o = {};
  for (const k in src){ if (k !== '_meta') o[k] = src[k]; }
  return o;
}
async function update(scope, quiet){
  const map = sourcesMap();
  const keys = Object.keys(map).filter(k => keyToTarget(k) && keyToTarget(k).scope === (scope||S.scope));
  if (!keys.length){
    if (!quiet) P.toast('нет карты живых источников — запусти tools\\update-cache.ps1 для архива', 3200);
    return {ok:0, items:0};
  }
  if (busy) return {ok:0, items:0, skipped:true};
  busy = true; S.net = 'обмен…'; updNet();
  const cache = P.lsGet('feed',{}) || {};
  let ok=0, items=0, fails=0;
  for (const key of keys){
    const tgt = keyToTarget(key);
    const list = (map[key]||[]).slice(0,3);
    for (const src of list){
      if (!src || !src.url) continue;
      try {
        const body = await viaProxies(src.url, 9000);
        let got = (src.kind==='json') ? parseJsonFeed(body, src.name) : parseFeed(body, src.name);
        if (!got.length && /^\s*[{[]/.test(body)) got = parseJsonFeed(body, src.name);
        if (got.length){
          ok++; items += got.length;
          const arr = cache[tgt.scope] && cache[tgt.scope][tgt.cat] ? cache[tgt.scope][tgt.cat] : [];
          const seen = new Set(arr.map(x=>x.url||x.title));
          for (const g of got){ if(!seen.has(g.url||g.title)) arr.unshift(g); }
          const cutoff = Date.now() - 21*864e5;
          cache[tgt.scope] = cache[tgt.scope] || {};
          cache[tgt.scope][tgt.cat] = arr
            .filter(x => !x.ts || x.ts > cutoff)
            .filter(x => (x.ts||0) > Date.now() - 400*864e5)
            .slice(0,26);
          break;   /* один живой источник на ключ достаточен */
        } else fails++;
      } catch(e){ fails++; }
    }
    if (Date.now() - (S.lastFetch||0) > 60000) { /* мягкий темп */ }
  }
  cache._updated = new Date().toISOString();
  P.lsSet('feed', cache);
  S.lastFetch = Date.now();
  busy = false;
  S.net = ok ? ('обмен ok: '+keys.length+' ключей, сбойных '+fails) : 'сеть недоступна';
  updNet();
  P.data.applyCache();
  S.live = !!(S.liveItems && S.liveItems.length);
  P.panel.render(); P.graph.paint(); P.graph.refreshNodeMetrics(); P.panel.status();
  if (S.live) P.graph.pulseWires();
  if (!quiet) P.toast(ok?('живой контур: '+ok+' источника, '+items+' карточек')
                           :('интернет недоступен — показан архив '+(window.FEED&&window.FEED.meta?window.FEED.meta.updated:'')), 3400);
  refreshBnm();
  return {ok, items, fails};
}
function updNet(){ const n=$('#stNet'); if(n) n.textContent = 'сеть: '+S.net; }

/* ---------- автообновление ---------- */
let timer=null;
function setAuto(on){
  S.auto = !!on;
  const b=$('#btnAuto'); if(b){ b.textContent='авто: '+(S.auto?'вкл':'выкл'); b.classList.toggle('on',S.auto); }
  if (timer) clearInterval(timer);
  if (S.auto) timer = setInterval(()=>{ update(S.scope,true); }, 10*60*1000);
  P.lsSet('auto', S.auto);
  if (S.auto) update(S.scope,true);
}

P.live = { update, setAuto, refreshBnm, parseFeed, parseBnm, renderFx, sourcesMap,
           get busy(){return busy;} };
})();
