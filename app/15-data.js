/* ==========================================================================
   15-data.js — приём данных: ленты, справочники, реестр примэрий → карточки
   ========================================================================== */
(function () {
'use strict';
const { S, TOPICS } = P;

/* ---------- нормализация карточки ленты ---------- */
function newsCard(it, scope, cat){
  const ts = it.ts || (it.date ? Date.parse(it.date) : 0);
  return {
    id: 'n:'+scope+':'+cat+':'+(it.uid || P.hash(it.url || it.title)),
    cat, kind:'news', scope,
    title: it.title || '—',
    summary: it.summary || '',
    url: it.url || '',
    source: it.source || (it.url ? host(it.url) : 'источник'),
    date: it.date || (ts ? P.iso(ts) : null),
    ts: isFinite(ts) ? ts : 0,
    tags: it.tags || [],
    region: it.region || it.localitate || null,
    live: !!it.live
  };
}
function refCard(cat, scope, key, title, summary, url, src, extra){
  return Object.assign({
    id:'r:'+scope+':'+cat+':'+key, cat, kind:'ref', scope,
    title, summary: summary||'', url: url||'', source: src||'справочник портала',
    date:null, ts:0, tags:['справка'], region:null, live:false
  }, extra||{});
}
function host(u){ try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return 'источник'; } }

/* ---------- справочник → карточки ---------- */
const pick = (a,n)=>Array.isArray(a)?a.slice(0,n||999):[];
function txt(o){ if(o==null) return ''; if(typeof o==='string') return o; return o.note||o.name||''; }

function refCardsMD(){
  const R = S.ref && S.ref.MD || {}; const out = [];
  const pol = R.politics||{};
  pick(pol.institutions).forEach((x,i)=>out.push(refCard('A','MD','inst'+i,x.name_ru||x.name_ro,x.role,x.url,'справочник')));
  if (pol.parliament) out.push(refCard('A','MD','parl','Парламент RM · '+pol.parliament.name,
    [pol.parliament.seats&&('мест: '+pol.parliament.seats), pol.parliament.electoral_system].filter(Boolean).join(' · '), pol.parliament.url));
  if (pol.admin_split) out.push(refCard('A','MD','adm','Административное деление', pol.admin_split.note, null));
  pick(pol.recent_elections,4).forEach((x,i)=>out.push(refCard('A','MD','el'+i,'Выборы · '+(x.date||''), x.title, x.url)));

  const ec = R.economy||{};
  if (ec.currency) out.push(refCard('B','MD','cur','Валюта: '+ec.currency.name+' ('+(ec.currency.code||'MDL')+')',
    ec.currency.issuer?('эмитент: '+(ec.currency.issuer.name||'')):'', ec.currency.issuer&&ec.currency.issuer.url));
  pick(ec.indicators).forEach((x,i)=>out.push(refCard('B','MD','ind'+i,String(x.name),
    [x.value, x.unit, x.date].filter(Boolean).join(' · '), x.src, x.src?host(x.src):'справочник')));
  pick(ec.institutions).forEach((x,i)=>out.push(refCard('B','MD','eci'+i,x.name,x.role,x.url)));
  pick(ec.business_registers).forEach((x,i)=>out.push(refCard('B','MD','br'+i,'Реестр: '+x.name, x.note||'официальный публичный реестр', x.url)));

  const rel = R.religion||{};
  pick(rel.recognized).forEach((x,i)=>out.push(refCard('C','MD','rec'+i,x.name_ru||x.name_ro,
    [x.jurisdiction&&('юрисдикция: '+x.jurisdiction), x.note].filter(Boolean).join(' · '), x.src, x.src?host(x.src):'справочник')));
  if (rel.communities) out.push(refCard('C','MD','com','Культовые общины: '+ (rel.communities.total||'—'),
    pick(rel.communities.by_denomination,6).map(d=>d.denomination+(d.count?' — '+d.count:'')).join('; '),
    (rel.communities.by_denomination||[])[0]&&(rel.communities.by_denomination[0].src||null)));
  pick(rel.synagogues).forEach((x,i)=>out.push(refCard('C','MD','syn'+i,'Синагога · '+x.name,
    [x.city&&('город: '+x.city), x.address, x.note].filter(Boolean).join(' · '), x.src)));
  pick(rel.mosques).forEach((x,i)=>out.push(refCard('C','MD','mos'+i,'Мечеть · '+x.name, [x.city,x.note].filter(Boolean).join(' · '), x.src)));
  pick(rel.holidays,5).forEach((x,i)=>out.push(refCard('C','MD','hol'+i,'Календарь · '+x.name, [x.type,x.note].filter(Boolean).join(' · '))));
  if (rel.registry) out.push(refCard('C','MD','reg','Регистрация культов: '+rel.registry.name, rel.registry.note||'', rel.registry.url));

  const ed = R.education||{};
  pick(ed.universities,14).forEach((x,i)=>out.push(refCard('D','MD','uni'+i,(x.abbr?x.abbr+' · ':'')+x.name_ro,
    [x.city, x.kind==='public'?'государственный':x.kind].filter(Boolean).join(' · '), x.url)));
  pick(ed.authorities).forEach((x,i)=>out.push(refCard('D','MD','ea'+i,x.name,x.role,x.url)));
  if (ed.quality_assurance) out.push(refCard('D','MD','qa','Качество образования: '+ed.quality_assurance.name, ed.quality_assurance.note, ed.quality_assurance.url));
  if (ed.baccalaureate) out.push(refCard('D','MD','bac','Бакалау', [ed.baccalaureate.note, ed.baccalaureate.session_dates].filter(Boolean).join(' · '), ed.baccalaureate.url));
  pick(ed.programs,5).forEach((x,i)=>out.push(refCard('D','MD','pr'+i,'Программа: '+x.name, [x.kind,x.period,x.note].filter(Boolean).join(' · '), x.url)));
  if (ed.school_system) out.push(refCard('D','MD','sys','Система образования', ed.school_system.note, ed.school_system.source));

  const it = R.it||{};
  pick(it.institutions).forEach((x,i)=>out.push(refCard('F','MD','ii'+i,x.name,x.role,x.url)));
  pick(it.services).forEach((x,i)=>out.push(refCard('F','MD','is'+i,'Сервис: '+x.name, x.note, x.url)));
  pick(it.programs,5).forEach((x,i)=>out.push(refCard('F','MD','ip'+i,'Программа: '+x.name, [x.period,x.note].filter(Boolean).join(' · '), x.url)));
  pick(it.cyber).forEach((x,i)=>out.push(refCard('F','MD','ic'+i,x.name,x.role,x.url)));
  if (it.market && pick(it.market.operators).length) out.push(refCard('F','MD','op','Операторы связи и рынок',
    pick(it.market.operators).map(o=>o.name).join(' · '), (it.market.operators[0]||{}).url, 'справочник'));
  if (it.registry) out.push(refCard('F','MD','ir','Домены и реестры: '+it.registry.name, it.registry.note, it.registry.url));
  return out;
}

function refCardsWorld(){
  const R = (S.ref && S.ref.WORLD) || {}; const out = [];
  const pol = R.politics||{};
  pick(pol.institutions).forEach((x,i)=>out.push(refCard('A','WORLD','inst'+i,x.name,[x.role,x.founded&&('осн. '+x.founded)].filter(Boolean).join(' · '),x.url)));
  pick(pol.regions).forEach((x,i)=>out.push(refCard('A','WORLD','reg'+i,x.region||x.name,x.note,x.src,x.src?host(x.src):'справочник')));
  pick(pol.conflicts_watch,8).forEach((x,i)=>out.push(refCard('A','WORLD','cf'+i,'Контуры напряжения · '+x.place,
    [x.status,x.updated&&('данные: '+x.updated)].filter(Boolean).join(' · '),x.src,x.src?host(x.src):'справочник')));

  const ec = R.economy||{};
  pick(ec.indicators).forEach((x,i)=>out.push(refCard('B','WORLD','ind'+i,String(x.name),[x.value,x.unit,x.date].filter(Boolean).join(' · '),x.src,x.src?host(x.src):'справочник')));
  pick(ec.markets).forEach((x,i)=>out.push(refCard('B','WORLD','mkt'+i,'Рынок: '+x.name,x.kind,x.url)));
  pick(ec.institutions).forEach((x,i)=>out.push(refCard('B','WORLD','ei'+i,x.name,x.role,x.url)));
  pick(ec.currencies,10).forEach((x,i)=>out.push(refCard('B','WORLD','cc'+i,x.code+' · '+x.name,x.note||'ключевая резервная/расчётная валюта')));

  const rel = R.religion||{};
  pick(rel.demography).forEach((x,i)=>out.push(refCard('C','WORLD','dem'+i,x.faith,[x.adherents&&('адептов: '+x.adherents),x.share].filter(Boolean).join(' · '),x.src,x.src?host(x.src):'справочник')));
  pick(rel.centers).forEach((x,i)=>out.push(refCard('C','WORLD','cen'+i,x.name,[x.kind,x.note].filter(Boolean).join(' · '),x.url)));
  pick(rel.holy_sites).forEach((x,i)=>out.push(refCard('C','WORLD','hs'+i,x.place+' · '+x.faith,[x.name,x.note].filter(Boolean).join(' · '))));

  const ed = R.education||{};
  pick(ed.top_universities,10).forEach((x,i)=>out.push(refCard('D','WORLD','uni'+i,x.name,[x.country,x.rank_source].filter(Boolean).join(' · '),x.url)));
  pick(ed.programs,5).forEach((x,i)=>out.push(refCard('D','WORLD','pr'+i,'Программа: '+x.name,[x.kind,x.note].filter(Boolean).join(' · '),x.url)));
  pick(ed.rankings,5).forEach((x,i)=>out.push(refCard('D','WORLD','rk'+i,'Рейтинг: '+x.name,'',x.url)));

  const it = R.it||{};
  pick(it.trends).forEach((x,i)=>out.push(refCard('F','WORLD','tr'+i,x.trend||x.name,x.note,x.src,x.src?host(x.src):'справочник')));
  pick(it.companies).forEach((x,i)=>out.push(refCard('F','WORLD','co'+i,x.name,[x.field,x.note].filter(Boolean).join(' · '),x.url)));
  pick(it.bodies).forEach((x,i)=>out.push(refCard('F','WORLD','bo'+i,x.name,x.role,x.url)));
  pick(it.domains,10).forEach((x,i)=>out.push(refCard('F','WORLD','dm'+i,'Домен .'+x.tld,'регистратура: '+(x.registry||'—'),x.url)));
  return out;
}

/* ---------- реестр примэрий ---------- */
function loadPrimarii(){
  const raw = window.PRIMARII;
  if (!raw || !Array.isArray(raw.items)) { S.primarii = null; return; }
  const items = raw.items.map((p,i)=>({
    uid: p.uat_id || ('x'+i),
    name: p.name, unit: p.unit, unit_id: p.unit_id, level: p.level || 'comuna',
    villages: p.villages || null,
    site: p.site || null, email: p.email || null, phone: p.phone || null,
    verified: p.verified !== false, found_in: p.found_in || null
  }));
  const units = {};
  items.forEach(p=>{ units[p.unit]=(units[p.unit]||0)+1; });
  S.primarii = { meta: raw.meta||{}, items, units: Object.keys(units).sort(),
                 counts:{ total:items.length, with_site:items.filter(p=>p.site).length, units:Object.keys(units).length } };
}

/* ---------- сборка ленты: справочник + новости + «живые» догрузки ---------- */
function buildFeed(){
  S.feed = { WORLD:{}, MD:{} };
  const fmeta = (window.FEED && window.FEED.meta) || {};
  if (!S.fx && fmeta.fx){ S.fx = fmeta.fx; S.fxDate = fmeta.fx_date || null; }
  const refW = refCardsWorld(), refM = refCardsMD();
  const news = (window.FEED && window.FEED.items) || {};   /* {WORLD:[...], MD:[...]} */
  const newsW = (news.WORLD||[]).map(x=>newsCard(x,'WORLD',x.cat)).filter(x=>'ABCDF'.includes(x.cat));
  const newsM = (news.MD||[]).map(x=>newsCard(x,'MD',x.cat)).filter(x=>'ABCDF'.includes(x.cat));
  for (const t of TOPICS){
    const cat = t.id;
    S.feed.WORLD[cat] = merge(refW.filter(x=>x.cat===cat), newsW.filter(x=>x.cat===cat));
    S.feed.MD[cat]    = merge(refM.filter(x=>x.cat===cat), newsM.filter(x=>x.cat===cat));
  }
  if (S.primarii){
    const m = S.primarii.counts;
    S.feed.MD.E = merge([{
      id:'r:MD:E:meta', cat:'E', kind:'ref', scope:'MD',
      title:'Реестр примэрий: '+m.total+' единиц · '+m.with_site+' с официальным сайтом',
      summary:'Покрыто '+m.units+' административных единиц. Ниже — фильтруемый список; строка с доменом открывает сайт примэрии.',
      url:'', source:'primarii.md / casata.md', date:null, ts:0, tags:['реестр'], live:false
    }], S.feed.MD.E.filter(x=>x.kind==='news'));
  }
  applyCache();
}

/* живой кэш поверх архива: добавляет свежие карточки, не дублируя архивные */
function applyCache(){
  const cache = P.lsGet('feed',{}) || {};
  S.liveItems = [];
  for (const scope in cache){
    for (const cat in cache[scope]){
      for (const it of (cache[scope][cat]||[])){
        const c = newsCard(it, scope, cat); c.live = true; c.fresh = true;
        const arr = S.feed[scope][cat] || (S.feed[scope][cat]=[]);
        const dupe = arr.some(x=>x.url && c.url && x.url===c.url);
        if (!dupe) arr.unshift(c);
        S.liveItems.push(c);
      }
    }
  }
  if (S.liveItems.length){ S.live = true; }
}

function merge(a,b){
  const seen = new Set(); const out = [];
  for (const x of a.concat(b)){
    const k = (x.url||'') + '|' + P.norm(x.title).slice(0,48);
    if (seen.has(k)) continue; seen.add(k); out.push(x);
  }
  return out;
}

/* ---------- фильтрация ---------- */
function visibleItems(scope, topic, q){
  let arr = (S.feed[scope] && S.feed[scope][topic]) || [];
  if (q){
    const nq = P.norm(q);
    arr = arr.filter(x => P.norm(x.title+' '+x.summary+' '+x.source+' '+(x.tags||[]).join(' ')).includes(nq));
  }
  arr = arr.slice();
  arr.sort((p1,p2)=>{
    if (p2.live !== p1.live) return p2.live - p1.live;
    const a=p2.ts||0, b=p1.ts||0;
    if (a!==b) return a-b;
    return (p1.kind==='ref'?1:0)-(p2.kind==='ref'?1:0);
  });
  return arr;
}
function visiblePrimarii(q){
  if (!S.primarii) return [];
  let arr = S.primarii.items;
  if (P.panel && P.panel.unitFilter) arr = arr.filter(p=>p.unit===P.panel.unitFilter);
  if (P.panel && P.panel.levelFilter) arr = arr.filter(p=>p.level===P.panel.levelFilter);
  if (P.panel && P.panel.sitesOnly) arr = arr.filter(p=>p.site);
  if (q){
    const nq = P.norm(q);
    arr = arr.filter(p=>P.norm(p.name+' '+p.unit+' '+(p.site||'')+' '+(p.email||'')).includes(nq));
  }
  return arr;
}

P.data = { buildFeed, loadPrimarii, visibleItems, visiblePrimarii, applyCache, newsCard, refCard, host };
})();
