/* ==========================================================================
   90-boot.js — сборка портала: события, клавиши, порядок запуска
   ========================================================================== */
(function () {
'use strict';
const { S, SCOPES, TOPICS, $, $$, debounce } = P;

/* ---------- события граф ↔ колонка ---------- */
P.emit = function(ev, val){
  if (ev==='scope' || ev==='topic'){
    P.panel.render();
    P.graph.refreshNodeMetrics();
    P.panel.status();
    P.lsSet('state', {scope:S.scope, topic:S.topic});
  }
};

/* ---------- панель инструментов ---------- */
function controls(){
  $('#btnLive').addEventListener('click', ()=>{
    const b=$('#btnLive'); b.textContent='обмен…'; b.classList.add('on');
    P.live.update(S.scope).finally(()=>{ b.textContent='обновить'; b.classList.remove('on'); });
  });
  $('#btnAuto').addEventListener('click', ()=> P.live.setAuto(!S.auto));
  $('#btnReset').addEventListener('click', ()=> P.graph.resetLayout());
  $$('#scopes .scope-pick').forEach(b=>{
    b.addEventListener('click', ()=>{
      if (b.dataset.scope === S.scope){ P.graph.hubFlash(); return; }
      P.graph.setScope(b.dataset.scope);
    });
  });
  const q = $('#q');
  q.addEventListener('input', debounce(()=> P.panel.setQuery(q.value), 220));
  q.addEventListener('keydown', e=>{ if(e.key==='Escape'){ q.value=''; P.panel.setQuery(''); q.blur(); } });
  $('#reader').addEventListener('click', e=>{ if (e.target.id==='reader') P.panel.close(); });
}

/* ---------- клавиши ---------- */
function keys(){
  addEventListener('keydown', e=>{
    if (e.key==='Escape'){ P.panel.close(); return; }
    const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (inField) return;
    if (e.key==='/'){ e.preventDefault(); $('#q').focus(); return; }
    const k = e.key.toLowerCase();
    if (k==='q'){ P.graph.setScope('WORLD','key'); return; }
    if (k==='w'){ P.graph.setScope('MD','key'); return; }
    if (k==='r'){ P.live.update(S.scope); return; }
    if (k==='e'){ P.graph.resetLayout(); return; }
    if (/^[1-6]$/.test(k)){ const t=TOPICS[+k-1]; if(t) P.graph.setTopic(t.id); }
  });
}

/* ---------- приветственная последовательность ---------- */
function intro(){
  const ids = Object.keys(P.graph.NODE);
  const order = ids.sort((a,b)=>{
    const rank = s => s.startsWith('scope:')?0 : s==='hub'?1 : s.startsWith('topic:')?2 : 3;
    return rank(a)-rank(b);
  });
  order.forEach((id,i)=>{
    const el2 = P.graph.NODE[id].el;
    el2.style.opacity = '0';
    setTimeout(()=>{ el2.style.transition='opacity .7s ease'; el2.style.opacity='1'; }, 90 + i*55);
  });
  setTimeout(()=>{ P.graph.pulseWires(); }, 90 + order.length*55 + 220);
  setTimeout(()=>{ P.graph.pulseWires(); }, 1900);
}

/* ---------- запуск ---------- */
function boot(){
  P.buildNoise(); P.ambient(); P.ghostParallax();
  P.graph.init();

  /* данные */
  const warns = [];
  if (!window.FEED) warns.push('лента не найдена (data/feeds.js)');
  if (!window.PRIMARII) warns.push('реестр примэрий не найден (data/primarii.js)');
  if (!window.REF) warns.push('справочник не найден (data/reference.js)');
  if (!window.SOURCES) warns.push('карта живых источников не найдена (data/sources.js)');

  S.ref = window.REF || null;
  P.data.loadPrimarii();
  P.data.buildFeed();
  S.liveItems = S.liveItems || [];

  /* восстановим последнее состояние */
  const st = P.lsGet('state', null);
  if (st && st.scope && st.topic){
    const okScope = SCOPES.some(s=>s.id===st.scope), okTopic = TOPICS.some(t=>t.id===st.topic);
    if (okScope) S.scope = st.scope;
    if (okTopic && P.graph.topicEnabled(TOPICS.find(t=>t.id===st.topic), S.scope)) S.topic = st.topic;
  }
  if (P.lsGet('auto', false)) P.live.setAuto(true);
  /* прямая ссылка на контур: index.html?scope=MD&topic=E&q=Cahul */
  try{
    const up = new URLSearchParams(location.search);
    const sc = (up.get('scope')||'').toUpperCase();
    const tp = (up.get('topic')||up.get('t')||'').toUpperCase();
    if (sc==='MD' || sc==='WORLD') S.scope = sc;
    if (tp){ const t = TOPICS.find(x=>x.id===tp || x.code===tp); if (t && P.graph.topicEnabled(t,S.scope)) S.topic = t.id; }
    if (up.get('q')){ S.query = up.get('q'); $('#q').value = S.query; }
  }catch(e){ /* движок без URLSearchParams */ }

  P.panel.watchScroll();
  controls(); keys();
  P.graph.layout(true); P.graph.paint();
  P.panel.render(); P.graph.refreshNodeMetrics(); P.panel.status(); P.live.renderFx();
  intro();

  if (warns.length) P.toast('нет данных: '+warns.join(', ')+' — собери их скриптом tools\\build-data.ps1', 5200);
  else P.toast('портал готов · масштаб '+(S.scope==='MD'?'МОЛДОВА':'МИР')+' · блок '+S.topic, 2600);

  /* если есть свежий кэш живого контура — сразу показываем индикатор */
  if (S.liveItems.length){ S.live = true; P.panel.status(); }
  /* при наличии интернета тихая проверка курсов BNM */
  if (navigator.onLine) setTimeout(()=>P.live.refreshBnm(), 2200);
}

if (document.readyState==='loading') addEventListener('DOMContentLoaded', boot);
else boot();
})();
