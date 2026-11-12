/* ==========================================================================
   20-panel.js — правая колонка: лента карточек, реестр примэрий, читалка
   ========================================================================== */
(function () {
'use strict';
const { S, SCOPES, TOPICS, $, $$, el, esc, clamp } = P;

const LIST = $('#streamList'), TITLE = $('#streamTitle'), COUNT = $('#streamCount');
let unitFilter=null, levelFilter=null, sitesOnly=false, scrollRaf=null;

/* ---------- главный рендер ---------- */
function render(){
  const sc = SCOPES.find(s=>s.id===S.scope), tp = TOPICS.find(t=>t.id===S.topic);
  LIST.innerHTML = '';
  LIST.scrollTop = 0;
  const q = S.query.trim();
  if (tp && tp.key==='primarii' && S.scope==='MD') return renderRegistry(q);
  return renderStream(q);
}

/* ---------- лента ---------- */
function renderStream(q){
  const tp = TOPICS.find(t=>t.id===S.topic);
  const items = P.data.visibleItems(S.scope, S.topic, q);
  TITLE.textContent = (S.scope==='MD'?'Молдова':'Мир')+' · '+(tp?tp.code+' '+tp.title:'');
  COUNT.textContent = items.length + ' записей';

  if (!items.length){ LIST.appendChild(el('div','empty', q?('по запросу «'+q+'» пусто'):('в этом контуре пока нет данных — нажми «обновить»'))); 
    P.graph.setAnchors([]); return; }

  const frag = document.createDocumentFragment();
  items.forEach((it,i)=>{
    const c = el('article','card'+(it.live?' live':'')+(it.kind==='ref'?' ref':''));
    c.style.transitionDelay = Math.min(i*28,420)+'ms';
    c.classList.add('enter');
    const mark = it.kind==='ref' ? '✦' : (it.live?'●':'✓');
    c.innerHTML =
      `<div class="tick">${mark}</div>
       <div>
         <h4>${esc(it.title)}</h4>
         ${it.summary?`<p>${esc(it.summary)}</p>`:''}
         <div class="meta">
           <span class="src">${esc(it.source||'')}</span>
           ${it.date?`<span class="ago">${esc(it.date)}</span>`:(it.ts?`<span class="ago">${esc(P.ago(it.ts))}</span>`:'')}
           ${(it.tags||[]).slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}
           ${it.region?`<span class="tag">${esc(it.region)}</span>`:''}
         </div>
       </div>
       <span class="go">${it.url?'открыть ↗':'подробно →'}</span>`;
    c.addEventListener('click', ()=>{
      if (it.url){ reader(it); }
      else reader(it);
    });
    frag.appendChild(c);
  });
  LIST.appendChild(frag);
  requestAnimationFrame(()=>{ $$('.card',LIST).forEach(c=>c.classList.remove('enter')); });
  computeAnchors();
}

/* ---------- реестр примэрий (блок Д) ---------- */
function renderRegistry(q){
  TITLE.textContent = 'Реестр примэрий · МОЛДОВА';
  if (!S.primarii){
    COUNT.textContent = '';
    LIST.appendChild(el('div','empty','реестр не загружен — запусти tools\\build-data.ps1 или tools\\update-cache.ps1'));
    P.graph.setAnchors([]); return;
  }
  const all = S.primarii.items;
  const arr = P.data.visiblePrimarii(q);
  COUNT.textContent = arr.length+' из '+all.length+' · сайтов: '+S.primarii.items.filter(p=>p.site).length;

  const bar = el('div','filters');
  const sel = el('select','selbox');
  sel.appendChild(new Option('все админ-единицы ('+S.primarii.counts.units+')',''));
  S.primarii.units.forEach(u=>sel.appendChild(new Option(u,u)));
  sel.value = unitFilter||'';
  sel.onchange = ()=>{ unitFilter = sel.value||null; render(); };
  bar.appendChild(sel);
  ['','oras','municipiu','sector','comuna','sat'].forEach(lv=>{
    const b = el('button','chip'+((levelFilter||'')===lv?' on':''), lv?lv.replace('municipiu','municipiu').replace('comuna','comuna').replace('sat','sat'):('все уровни'));
    b.onclick = ()=>{ levelFilter = lv||null; render(); };
    bar.appendChild(b);
  });
  const t = el('button','chip'+(sitesOnly?' on':''),'только с сайтом');
  t.onclick = ()=>{ sitesOnly=!sitesOnly; render(); };
  bar.appendChild(t);
  const r = el('button','chip','сброс');
  r.onclick = ()=>{ unitFilter=levelFilter=null; sitesOnly=false; S.query=''; $('#q').value=''; render(); };
  bar.appendChild(r);
  LIST.appendChild(bar);

  const wrap = el('div','reg');
  const shown = arr.slice(0,600);
  shown.forEach(p=>{
    const row = el('div','reg-row'+(p.site?'':' nosite'));
    row.innerHTML =
      `<div><b>${esc(p.name)}</b><div class="rr-meta"><span>${esc(p.unit)}</span><span>${esc(p.level)}</span>`+
      `${p.villages?`<span>${p.villages} нас.п.</span>`:''}${p.verified?'':'<span>не проверено</span>'}</div></div>`+
      (p.site?`<a class="site" href="${esc(p.site)}" target="_blank" rel="noopener">${esc(String(p.site).replace(/^https?:\/\//,''))}</a>`
             :`<span class="nosite">сайта не найдено</span>`);
    row.addEventListener('click', e=>{
      if (e.target.closest('a')) return;
      reader({ title:'Primăria '+p.name, source:'реестр примэрий', date:null,
        summary: p.unit+' · '+(p.site?'официальный сайт: '+p.site:'официальный сайт в открытых источниках не найден')+
                 (p.email?(' · e-mail: '+p.email):'')+(p.phone?(' · тел: '+p.phone):'')+
                 (p.found_in?(' · найдено: '+p.found_in):''),
        url:p.site||'', tags:[p.level,p.unit], kind:'reg' });
    });
    wrap.appendChild(row);
  });
  if (arr.length>shown.length){
    const more = el('div','empty','показаны первые '+shown.length+' из '+arr.length+' — уточни район или запрос');
    wrap.appendChild(more);
  }
  LIST.appendChild(wrap);
  computeAnchors();
}

/* ---------- точки входа связей в колонку ---------- */
function computeAnchors(){
  const nodes = $$('.card', LIST).length ? $$('.card', LIST) : $$('.reg-row', LIST);
  const pts = [];
  const fr = $('#field').getBoundingClientRect();
  for (let i=0;i<Math.min(nodes.length,7);i++){
    const b = nodes[i].getBoundingClientRect();
    if (b.bottom < fr.top-40 || b.top > fr.bottom+40) { pts.push({x:fr.right+18, y:clamp(b.top-fr.top+b.height/2, 8, fr.height-8)}); continue; }
    pts.push({ x: b.left-2, y: b.top + b.height/2 });
  }
  P.graph.setAnchors(pts);
}
function watchScroll(){
  LIST.addEventListener('scroll', ()=>{ if(scrollRaf) return; scrollRaf=requestAnimationFrame(()=>{scrollRaf=null;computeAnchors();}); },{passive:true});
}

/* ---------- читалка ---------- */
function reader(it){
  const box = $('#readerBox');
  const tp = TOPICS.find(t=>t.id===S.topic);
  box.innerHTML =
    `<button class="rclose" id="rclose">esc ✕</button>
     <h2>${esc(it.title)}</h2>
     <div class="rmeta">
       <span>${esc((SCOPES.find(s=>s.id===S.scope)||{}).title||'')} · ${(tp?tp.code+' '+tp.title:'')}</span>
       <span>${esc(it.source||'')}</span>
       ${it.date?`<span>${esc(it.date)}</span>`:(it.ts?`<span>${esc(P.ago(it.ts))}</span>`:'')}
       ${(it.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}
     </div>
     <div class="rbody"><p>${esc(it.summary||'подробного текста в источнике нет')}</p></div>
     ${it.url?`<a class="rlink" href="${esc(it.url)}" target="_blank" rel="noopener">открыть первоисточник ↗ ${esc(P.data.host(it.url))}</a>`:''}`;
  $('#reader').classList.add('on');
  $('#rclose').onclick = close;
  P.lastReader = it;
}
function close(){ $('#reader').classList.remove('on'); }

/* ---------- статус-строка ---------- */
function status(){
  const meta = (window.FEED&&window.FEED.meta)||{};
  $('#stFresh').textContent = 'архив: '+(meta.updated||'—');
  let n = 0;
  for (const sc of ['WORLD','MD']){ const g = S.feed[sc]||{}; for (const k in g){ for (const it of g[k]) if (it.live) n++; } }
  $('#stNet').textContent = S.live ? ('сеть: живых карточек '+n) : 'сеть: архив (нажми «обновить»)';
  $$('#scopes .scope-pick').forEach(b=>b.classList.toggle('on', b.dataset.scope===S.scope));
  const dot = $('.dot', P.graph.NODE['hub'].el); const txt = $('.hl-text', P.graph.NODE['hub'].el);
  if (dot) dot.classList.toggle('live', !!S.live);
  if (txt) txt.textContent = S.live ? 'живой контур' : 'архивный контур';
  const fx = $('#fx');
  fx.innerHTML = (S.fx||[]).map(f=>`<span><u>${esc(f.k)}</u><i>${esc(f.v)}</i></span>`).join('');
}

function setQuery(q){ S.query = q||''; render(); }

P.panel = {
  render, renderStream, renderRegistry, computeAnchors, watchScroll, reader, close, status, setQuery,
  get unitFilter(){return unitFilter;}, get levelFilter(){return levelFilter;}, get sitesOnly(){return sitesOnly;}
};
})();
