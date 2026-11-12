/* ==========================================================================
   10-graph.js — сцена: узлы-блоки, связи-безье, хаб, морфинг МИР ⇄ МОЛДОВА
   ========================================================================== */
(function () {
'use strict';
const { S, SCOPES, TOPICS, $, el, clamp, esc, lsGet, lsSet } = P;

const NODES = $('#nodes');
const WIRE_LAYER = $('#wireLayer');
const FIELD = $('#field');

const W = { scope:236, topic:214, hub:188 };
const NODE = {};                 /* id -> {el,kind,x,y,w,h,dy,dx} */
let wires = [];                  /* {from,to,path,flow,cls}       */
let anchors = [];                /* точки входа в колонку результатов */
let rafPending = false;

/* ---------- доступен ли блок в данном масштабе ---------- */
function topicEnabled(t, scope){
  if (t.key === 'primarii') return scope === 'MD';   /* примэрии — только национальный контур */
  return true;
}

/* ---------- создание узлов ---------- */
function scopeNode(sc){
  const n = el('div','node scope');
  n.dataset.id = 'scope:'+sc.id;
  n.innerHTML =
    `<div class="n-ring"></div>
     <div class="n-body">
       <div class="n-kicker"><span class="n-code">${esc(sc.code)}</span><span class="n-kind">${esc(sc.latin)}</span></div>
       <h3>${esc(sc.title)}</h3>
       <div class="n-sub">${esc(sc.sub)}</div>
       <div class="n-lines"><i></i><i></i></div>
       <div class="scope-flag">${sc.chips.map(c=>`<span class="chip">${esc(c)}</span>`).join('')}</div>
       <div class="scope-bar"></div>
     </div>`;
  NODES.appendChild(n);
  return n;
}

function topicNode(t){
  const n = el('div','node topic');
  n.dataset.id = 'topic:'+t.id;
  n.innerHTML =
    `<div class="n-ring">${esc(t.code)}</div>
     <div class="n-body">
       <div class="n-kicker"><span class="n-code">блок ${esc(t.code)}</span><span class="n-kind">${esc(t.kind)}</span></div>
       <h3>${esc(t.title)}</h3>
       <div class="n-sub">${esc(t.desc)}</div>
       <canvas class="n-spark" height="22"></canvas>
       <div class="n-metrics">
         <span class="n-metric"><b class="m-count">—</b><s>записей</s></span>
         <span class="n-metric"><b class="m-fresh">—</b><s>свежесть</s></span>
       </div>
     </div>`;
  NODES.appendChild(n);
  return n;
}

function hubNode(){
  const n = el('div','node hub');
  n.dataset.id = 'hub';
  n.innerHTML =
    `<div class="n-body">
       <div class="n-kicker"><span class="n-code">HUB</span><span class="n-kind">сопряжение</span></div>
       <div class="hub-scope">—</div>
       <div class="hub-topic">—</div>
       <canvas class="hub-trace" height="44"></canvas>
       <div class="hub-live"><span class="dot"></span><span class="hl-text">архив</span></div>
     </div>`;
  NODES.appendChild(n);
  return n;
}

function build(){
  SCOPES.forEach(sc => NODE['scope:'+sc.id] = { el: scopeNode(sc), kind:'scope', scope:sc.id });
  TOPICS.forEach(t  => NODE['topic:'+t.id] = { el: topicNode(t),  kind:'topic', topic:t.id });
  NODE['hub'] = { el: hubNode(), kind:'hub' };

  /* связи: масштаб → хаб, хаб → блоки, хаб → колонка результатов */
  for (const sc of SCOPES) addWire('scope:'+sc.id, 'hub', 'sc');
  for (const t of TOPICS)  addWire('hub', 'topic:'+t.id, 'tp');
  for (let i=0;i<7;i++)    addWire('hub','stream:'+i,'st');

  Object.keys(NODE).forEach(id => makeDraggable(NODE[id]));
  NODES.addEventListener('click', e=>{
    const n = e.target.closest('.node'); if(!n) return;
    const id = n.dataset.id;
    if (id.startsWith('scope:')) setScope(id.slice(6), 'click');
    else if (id.startsWith('topic:')) setTopic(id.slice(6));
    else hubFlash();
  });
}

/* ---------- связи ---------- */
function addWire(from,to,cls){
  const g = el('g','wire-g');
  const p = el('path','wire '+cls);
  const f = el('path','wire-flow flow-'+cls);
  p.setAttribute('marker-end','url(#arw)');
  g.appendChild(p); g.appendChild(f);
  WIRE_LAYER.appendChild(g);
  const w = { from, to, cls, path:p, flow:f, g };
  wires.push(w);
  return w;
}

function anchorOf(id, side){
  const fr = FIELD.getBoundingClientRect();
  if (id.startsWith('stream:')){
    const i = +id.slice(7);
    const a = anchors[i];
    if (!a) return null;
    return { x:a.x - fr.left, y:a.y - fr.top };
  }
  const n = NODE[id]; if(!n) return null;
  const b = n.el.getBoundingClientRect();
  const x = side === 'r' ? b.right - fr.left : b.left - fr.left;
  const y = b.top - fr.top + b.height*(side==='r'?0.5:0.42);
  return { x, y };
}

function curve(a,b){
  const dx = Math.max(40, Math.abs(b.x-a.x)*0.46);
  const dy = (b.y-a.y)*0.12;
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${(a.x+dx).toFixed(1)},${(a.y+dy).toFixed(1)} `+
         `${(b.x-dx).toFixed(1)},${(b.y-dy).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
}

function drawWires(){
  for (const w of wires){
    const a = anchorOf(w.from,'r'), b = anchorOf(w.to,'l');
    if (!a || !b){ w.path.setAttribute('d',''); w.flow.setAttribute('d',''); w.g.style.display='none'; continue; }
    w.g.style.display='';
    const d = curve(a,b);
    w.path.setAttribute('d',d); w.flow.setAttribute('d',d);
    markWire(w);
  }
}

function markWire(w){
  let on = true, hot = false;
  if (w.cls==='sc'){
    const id = w.from.slice(6);
    on = true; hot = (S.scope===id);
    w.path.classList.toggle('dim', !hot);
  } else if (w.cls==='tp'){
    const id = w.to.slice(6);
    const t = TOPICS.find(x=>x.id===id);
    hot = (S.topic===id);
    w.path.classList.toggle('dim', !hot || !topicEnabled(t,S.scope));
  } else {
    const i = +w.to.slice(7);
    hot = false; on = i < anchors.length;
    w.path.classList.toggle('dim', i >= 3);
  }
  w.path.classList.toggle('hot', hot);
  w.path.setAttribute('marker-end', hot?'url(#arwHot)':'url(#arw)');
  w.path.style.display = on ? '' : 'none';
  w.flow.style.display = on ? '' : 'none';
}

/* ---------- раскладка ---------- */
function layout(animate){
  const fr = FIELD.getBoundingClientRect();
  const fw = fr.width, fh = fr.height;
  const scopeW = fw < 900 ? 200 : W.scope;
  const topicW = fw < 760 ? 186 : (fw < 1000 ? 198 : W.topic);
  const hubW   = fw < 700 ? 158 : W.hub;

  const twoCol = fh < 700;
  const topicX = clamp(fw*0.30, scopeW+34, Math.max(scopeW+34, fw - hubW - topicW - 70));
  const hubX   = Math.max(topicX + topicW + 46, fw - hubW - 6);
  if (hubX + hubW > fw) NODE['hub'].el.style.width = Math.max(140, fw - hubX) + 'px';

  let idx = 0;
  const offs = S.scope==='MD' ? [[0,0],[6,10],[-4,-6],[8,4],[-6,8],[4,-8]] : [[0,0],[-6,8],[6,-6],[-4,6],[6,6],[0,-8]];

  for (const sc of SCOPES){
    const n = NODE['scope:'+sc.id];
    n.w = scopeW; n.el.style.width = scopeW+'px';
    n.baseX = 0; n.baseY = Math.round(clamp(sc.pos.y*fh, 0, fh - 40));
  }
  for (const t of TOPICS){
    const n = NODE['topic:'+t.id];
    n.w = topicW; n.el.style.width = topicW+'px';
    let bx, by;
    if (twoCol){
      const col = idx % 2, row = Math.floor(idx/2);
      bx = topicX + col*(topicW+26);
      by = clamp(row*((fh-40)/2), 0, fh-60);
    } else {
      bx = topicX;
      by = clamp(idx*((fh-30)/5), 0, fh-40);
    }
    const o = offs[idx % offs.length];
    n.baseX = Math.round(bx + o[0]); n.baseY = Math.round(by + o[1]);
    idx++;
  }
  const h = NODE['hub'];
  h.w = hubW; h.el.style.width = hubW+'px';
  h.baseX = Math.round(hubX); h.baseY = Math.round(clamp(fh*0.40, 0, fh-140));

  for (const id in NODE){
    const n = NODE[id];
    const d = S.drag[id] || {dx:0,dy:0};
    n.x = clamp(n.baseX + d.dx, 0, Math.max(0, fw - (n.w||120)));
    n.y = clamp(n.baseY + d.dy, 0, Math.max(0, fh - 60));
    n.el.style.transition = animate ? 'transform .62s cubic-bezier(.16,.8,.2,1),opacity .45s' : 'none';
    n.el.style.transform = `translate(${n.x}px,${n.y}px)`;
    if (animate){
      const i = Object.keys(NODE).indexOf(id);
      n.el.style.transitionDelay = (i*22)+'ms';
      setTimeout(()=>{ n.el.style.transitionDelay='0ms'; }, 700+i*22);
    }
  }
  scheduleWires();
}

function scheduleWires(){
  if (rafPending) return; rafPending = true;
  requestAnimationFrame(()=>{ rafPending=false; drawWires(); });
}

/* ---------- перетаскивание узлов ---------- */
function makeDraggable(n){
  const e = n.el;
  let st = null;
  e.addEventListener('pointerdown', ev=>{
    if (ev.target.closest('.chip') || ev.target.closest('button')) return;
    if (ev.button !== 0) return;
    st = { sx:ev.clientX, sy:ev.clientY, ox:n.x, oy:n.y, moved:false };
    e.setPointerCapture(ev.pointerId);
    e.style.transition='none';
    e.classList.add('drag');
  });
  e.addEventListener('pointermove', ev=>{
    if (!st) return;
    const dx = ev.clientX-st.sx, dy = ev.clientY-st.sy;
    if (Math.abs(dx)+Math.abs(dy) > 3) st.moved = true;
    if (!st.moved) return;
    const fr = FIELD.getBoundingClientRect();
    n.x = clamp(st.ox+dx, 0, Math.max(0, fr.width-(n.w||120)));
    n.y = clamp(st.oy+dy, 0, Math.max(0, fr.height-60));
    n.drag = true;
    e.style.transform = `translate(${n.x}px,${n.y}px)`;
    scheduleWires();
  });
  const end = ev=>{
    if (!st) return;
    e.classList.remove('drag');
    if (st.moved){
      S.drag[Object.keys(NODE).find(k=>NODE[k]===n)] = { dx:n.x-n.baseX, dy:n.y-n.baseY };
      lsSet('drag', S.drag);
      if (ev.type==='pointerup') ev.stopPropagation();
    }
    st = null;
  };
  e.addEventListener('pointerup', end);
  e.addEventListener('pointercancel', end);
}

function resetLayout(){
  S.drag = {}; lsDel('drag');
  for (const id in NODE){ const n=NODE[id]; n.el.style.transform=''; }
  layout(true); P.toast('граф возвращён к типовым позициям');
}

/* ---------- выделение / переключение ---------- */
function paint(){
  for (const sc of SCOPES){
    const n = NODE['scope:'+sc.id];
    n.el.classList.toggle('sel', S.scope===sc.id);
    n.el.querySelector('.n-ring').textContent = String(scopeCount(sc.id));
  }
  for (const t of TOPICS){
    const n = NODE['topic:'+t.id];
    const on = topicEnabled(t,S.scope);
    n.el.classList.toggle('sel', S.topic===t.id);
    n.el.classList.toggle('off', !on);
    n.el.classList.toggle('solid', false);
  }
  const h = NODE['hub'];
  const sc = SCOPES.find(s=>s.id===S.scope), tp = TOPICS.find(t=>t.id===S.topic);
  h.el.querySelector('.hub-scope').textContent = sc ? sc.title : '—';
  h.el.querySelector('.hub-topic').textContent = tp ? (tp.code+' · '+tp.title) : '—';
  $('#stScope').textContent = sc ? sc.title : '—';
  $('#stTopic').textContent = tp ? tp.title : '—';
  wires.forEach(markWire);
}

function scopeCount(scope){
  let c = 0;
  for (const t of TOPICS){ if(!topicEnabled(t,scope)) continue; c += ((S.feed[scope]&&S.feed[scope][t.id])||[]).length; }
  if (scope==='MD' && S.primarii) c += S.primarii.items.length;
  return c;
}

function setScope(id, how){
  if (S.scope===id) return;
  S.scope = id;
  const tp = TOPICS.find(t=>t.id===S.topic);
  if (tp && !topicEnabled(tp,id)){
    S.topic = 'A';
    P.toast('блок «Примэрии» существует только в масштабе МОЛДОВА — переключено на А');
  }
  layout(true); paint();
  P.emit && P.emit('scope', id);
  pulseWires();
}
function setTopic(id){
  const t = TOPICS.find(x=>x.id===id); if(!t) return;
  if (!topicEnabled(t,S.scope)){
    P.toast('блок «'+t.title+'» недоступен в масштабе '+S.scope);
    return;
  }
  S.topic = id; paint();
  P.emit && P.emit('topic', id);
  flowOnce('tp');
}
function hubFlash(){
  const h = NODE['hub'];
  h.el.classList.remove('pulse'); void h.el.offsetWidth; h.el.classList.add('pulse');
  flowOnce('tp'); flowOnce('st');
}
function flowOnce(cls){
  wires.filter(w=>w.cls===cls).forEach((w,i)=>{
    w.flow.classList.remove('go'); void w.flow.offsetWidth;
    setTimeout(()=>w.flow.classList.add('go'), i*70);
  });
}
function pulseWires(){ flowOnce('sc'); setTimeout(()=>flowOnce('tp'),160); setTimeout(()=>flowOnce('st'),320); }

/* ---------- метрики узлов и спарклайны ---------- */
function refreshNodeMetrics(){
  for (const t of TOPICS){
    const n = NODE['topic:'+t.id];
    const items = (S.feed[S.scope]&&S.feed[S.scope][t.id])||[];
    const cnt = n.el.querySelector('.m-count');
    const fr  = n.el.querySelector('.m-fresh');
    if (t.key==='primarii' && S.primarii){
      const withSite = S.primarii.items.filter(p=>p.site).length;
      cnt.textContent = items.length || S.primarii.items.length;
      fr.textContent = withSite+' с сайтом';
    } else {
      cnt.textContent = items.length;
      const newest = items.reduce((a,x)=>Math.max(a, x.ts||0), 0);
      fr.textContent = newest ? P.ago(newest) : '—';
    }
    const series = [];
    for (let w=11; w>=0; w--){
      const from = Date.now() - (w+1)*7*864e5, to = Date.now() - w*7*864e5;
      series.push(items.filter(x=>(x.ts||0)>=from && (x.ts||0)<to).length);
    }
    const tone = S.scope==='MD' ? 'rgba(190,175,140,.55)' : 'rgba(160,185,210,.55)';
    P.sparkline(n.el.querySelector('.n-spark'), series, tone);
  }
  const sc = SCOPES.find(s=>s.id===S.scope);
  const trace = [];
  for (const t of TOPICS){
    const items=(S.feed[S.scope]&&S.feed[S.scope][t.id])||[];
    trace.push(items.length ? clamp(items.length/18,0.08,1) : 0.05);
  }
  const tp = TOPICS.find(t=>t.id===S.topic);
  if (S.primarii) trace.push(clamp(S.primarii.items.length/900,0.1,1));
  P.scopeTrace(NODE['hub'].el.querySelector('.hub-trace'), trace);
}

/* ---------- точки входа в колонку результатов ---------- */
function setAnchors(list){ anchors = list||[]; scheduleWires(); }

/* ---------- инициирование ---------- */
function init(){
  S.drag = P.lsGet('drag',{}) || {};
  build();
  layout(false);
  requestAnimationFrame(()=>{ layout(false); drawWires(); });
  addEventListener('resize', P.debounce(()=>{ layout(false); drawWires(); },160));
  paint();
}

P.graph = { init, layout, drawWires, scheduleWires, setAnchors, resetLayout, paint, refreshNodeMetrics,
            setScope, setTopic, NODE, topicEnabled, scopeCount, hubFlash, pulseWires };
})();
