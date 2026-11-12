/* ==========================================================================
   00-core.js — модель портала: таксономия, состояние, утилиты, атмосферный слой
   ========================================================================== */
(function () {
'use strict';

const LS = 'hunter.portal.v1';

/* ---------- таксономия: 2 масштаба × 6 блоков ---------- */
const SCOPES = [
  { id:'WORLD', code:'МИР', latin:'LUMEA', title:'МИР', sub:'планетарный контур',
    hint:'континенты · столицы · мировые рынки и институты',
    pos:{x:0.00,y:0.03},
    chips:['Европа','СНГ','НАТО/ЕС','Глобальный юг','Азия','Америка'] },
  { id:'MD', code:'MD', latin:'MOLOVA', title:'МОЛДОВА', sub:'национальный контур',
    hint:'37 адм-единиц · Кишинэу · Бэлць · Gagaузия · Приднестровье',
    pos:{x:0.00,y:0.55},
    chips:['Кишинэу','Бэлць','Гагаузия','Приднестровье','диаспора','бюллетень BNM'] }
];

const TOPICS = [
  { id:'A', code:'А', key:'politics', title:'Власть и политика', ro:'Politică',
    kind:'politics', desc:'парламент · правительство · внешние контуры · выборы · безопасность',
    sources:{WORLD:['world.policy'],MD:['md.policy']} },
  { id:'B', code:'Б', key:'economy', title:'Экономика · рынок · коммерция', ro:'Economie',
    kind:'economy', desc:'валюта и цены · бюджет · торговля · бизнес-среда · логистика',
    sources:{WORLD:['world.market'],MD:['md.market','md.bnm']} },
  { id:'C', code:'В', key:'religion', title:'Религия · конфессии', ro:'Religie',
    kind:'religion', desc:'православие · синагоги · мечети · культовые общины · календарь',
    sources:{WORLD:['world.religion'],MD:['md.religion']} },
  { id:'D', code:'Г', key:'education', title:'Образование и наука', ro:'Educație',
    kind:'education', desc:'школы и лицей · университеты · аккредитация · гранты · стипендии',
    sources:{WORLD:['world.edu'],MD:['md.edu']} },
  { id:'E', code:'Д', key:'primarii', title:'Примэрии Молдовы', ro:'Primării',
    kind:'registry', desc:'реестр местных примэрий и их официальных сайтов по районам',
    sources:{WORLD:null,MD:['md.gov']} },
  { id:'F', code:'Е', key:'it', title:'IT · цифровые новшества', ro:'Tehnologii',
    kind:'it', desc:'э-государство · AI и разработка · компьютерный рынок · кибербезопасность',
    sources:{WORLD:['world.it'],MD:['md.it']} }
];

/* ---------- состояние ---------- */
const S = {
  scope:'MD', topic:'A',
  query:'', auto:false, live:false,
  feed:{},              /* feed[scope][topic] = массив карточек */
  primarii:null, ref:null, sources:{},
  nodes:{},             /* id -> {el,x,y,w,h,kind,ref} */
  drag:{},              /* id -> {dx,dy} сдвиги пользователя */
  wires:[],
  anchors:[],           /* точки входа в колонку результатов */
  lastFetch:0, net:'—', updated:null,
  fx:[]
};

/* ---------- утилиты ---------- */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
function el(tag,cls,txt){const n=document.createElement(tag); if(cls)n.className=cls; if(txt!=null)n.textContent=txt; return n;}
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function hash(s){let h=2166136261>>>0;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){let a=seed>>>0||1;return()=>{a^=a<<13;a>>>=0;a^=a>>17;a^=a<<5;a>>>=0;return a/4294967296;};}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
function norm(s){return String(s==null?'':s).toLowerCase()
  .replace(/[ăâîșşţțş]/g,c=>({'ă':'a','â':'a','î':'i','ș':'s','ş':'s','ţ':'t','ț':'t'}[c]||c))
  .replace(/[ё]/g,'е').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();}
function ago(ts){
  if(!ts) return '';
  const d=(Date.now()-ts)/1000;
  if(d<0) return 'вперёд';
  if(d<90) return 'только что';
  if(d<3600) return Math.round(d/60)+' мин назад';
  if(d<86400) return Math.round(d/3600)+' ч назад';
  const days=Math.round(d/86400);
  if(days<31) return days+' дн назад';
  if(days<365) return Math.round(days/30)+' мес назад';
  return (days/365).toFixed(1)+' г назад';
}
function dayLabel(ts){
  try{return new Date(ts).toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'numeric'});}
  catch(e){return '';}
}
function iso(ts){const d=new Date(ts);const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}

/* ---------- хранилище сдвига узлов, автообновления, «живого» кэша ---------- */
function lsGet(k,def){try{const v=localStorage.getItem(LS+'.'+k);return v==null?def:JSON.parse(v);}catch(e){return def;}}
function lsSet(k,v){try{localStorage.setItem(LS+'.'+k,JSON.stringify(v));}catch(e){}}
function lsDel(k){try{localStorage.removeItem(LS+'.'+k);}catch(e){}}

/* ---------- уведомления ---------- */
function toast(msg,ms){
  const box=$('#toast'); if(!box) return;
  const t=el('div','tst',msg); box.appendChild(t);
  setTimeout(()=>{t.style.transition='opacity .3s,transform .3s';t.style.opacity='0';t.style.transform='translateY(6px)';
    setTimeout(()=>t.remove(),320);},ms||2400);
}

/* ---------- зерно плёнки как инлайн-SVG ---------- */
function buildNoise(){
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>`+
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/>`+
    `<feColorMatrix type='saturate' values='0'/></filter><rect width='180' height='180' filter='url(#n)'/></svg>`;
  document.documentElement.style.setProperty('--noise','url("data:image/svg+xml,'+encodeURIComponent(svg)+'")');
}

/* ---------- атмосферный слой: блуждающие нити, как «паутинка» в кадре ---------- */
function ambient(){
  const cv=$('#filaments'); if(!cv) return;
  const ctx=cv.getContext('2d'); let W=0,H=0,dpr=Math.min(2,window.devicePixelRatio||1);
  let strands=[], t0=performance.now(), mx=0,my=0, tmx=0,tmy=0, vis=true;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  function seed(){
    const n=Math.round(clamp(W/90,10,22)); strands=[];
    for(let i=0;i<n;i++){
      const r=rng(hash('strand'+i+W));
      strands.push({
        x:r()*W, y:r()*H, len:80+r()*260, ang:r()*Math.PI*2,
        drift:0.00004+r()*0.00016, amp:0.06+r()*0.3, w:0.5+r()*0.8,
        a:0.05+r()*0.16, seg:5+(i%4), px:0, py:0
      });
    }
  }
  function size(){
    const b=cv.getBoundingClientRect(); W=Math.round(b.width); H=Math.round(b.height);
    cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0); seed();
  }
  function draw(now){
    if(!vis){requestAnimationFrame(draw);return;}
    const t=now-t0;
    ctx.clearRect(0,0,W,H);
    mx+=(tmx-mx)*0.05; my+=(tmy-my)*0.05;
    ctx.lineCap='round';
    for(const s of strands){
      const wob=reduce?0:Math.sin(t*s.drift*4+s.x)*s.amp;
      const a=s.ang+(reduce?0:t*s.drift)+wob;
      let x=s.x+mx*8, y=s.y+my*8;
      ctx.beginPath(); ctx.moveTo(x,y);
      const step=s.len/s.seg;
      for(let i=1;i<=s.seg;i++){
        const aa=a+Math.sin(i*1.7+s.y*0.01)*0.5;
        x+=Math.cos(aa)*step; y+=Math.sin(aa)*step;
        ctx.lineTo(x,y);
      }
      ctx.strokeStyle='rgba(178,192,208,'+s.a.toFixed(3)+')';
      ctx.lineWidth=s.w; ctx.stroke();
    }
    if(!reduce){
      const g=ctx.createRadialGradient(W*0.62,H*0.35,0,W*0.62,H*0.35,Math.max(W,H)*0.7);
      const p=(Math.sin(t*0.00018)+1)/2;
      g.addColorStop(0,'rgba(150,168,190,'+(0.035+p*0.02).toFixed(3)+')');
      g.addColorStop(1,'rgba(150,168,190,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    }
    requestAnimationFrame(draw);
  }
  addEventListener('resize',debounce(size,180));
  addEventListener('pointermove',e=>{tmx=(e.clientX/innerWidth-0.5);tmy=(e.clientY/innerHeight-0.5);},{passive:true});
  document.addEventListener('visibilitychange',()=>{vis=!document.hidden;});
  size(); requestAnimationFrame(draw);
}

/* ---------- параллакс призрачных панелей ---------- */
function ghostParallax(){
  const gs=$$('.ghost'); const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce||!gs.length) return;
  const base=[[-19,4],[-14,-3],[11,5]];
  addEventListener('pointermove',e=>{
    const x=(e.clientX/innerWidth-0.5), y=(e.clientY/innerHeight-0.5);
    gs.forEach((g,i)=>{
      const k=(i+1)*7;
      g.style.transform=`translate(${(x*k).toFixed(1)}px,${(y*k*0.7).toFixed(1)}px) skewX(${base[i][0]}deg) skewY(${base[i][1]}deg)`;
    });
  },{passive:true});
}

/* ---------- мини-спарклайн (ряд значений рисуются прямо в узле) ---------- */
function sparkline(cv,vals,tone){
  if(!cv) return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const w=cv.clientWidth||140, h=cv.clientHeight||22;
  cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr);
  const c=cv.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,w,h);
  const v=(vals&&vals.length?vals:[0]).map(Number).filter(n=>isFinite(n));
  if(v.length<2) return;
  const mn=Math.min(...v), mx=Math.max(...v), sp=(mx-mn)||1;
  const X=i=>i*(w/(v.length-1)), Y=i=>h-2-((v[i]-mn)/sp)*(h-4);
  c.beginPath();
  for(let i=0;i<v.length;i++){ const x=X(i),y=Y(i); i?c.lineTo(x,y):c.moveTo(x,y); }
  c.strokeStyle=tone||'rgba(190,202,215,.55)'; c.lineWidth=1.1; c.stroke();
  c.lineTo(w,h); c.lineTo(0,h); c.closePath();
  c.fillStyle='rgba(190,202,215,.07)'; c.fill();
  const i=v.length-1;
  c.beginPath(); c.arc(X(i),Y(i),1.7,0,7); c.fillStyle='rgba(226,236,246,.9)'; c.fill();
}

/* ---------- осциллограф в хабе: след «свежести» данных ---------- */
function scopeTrace(cv,series){
  if(!cv) return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const w=cv.clientWidth||150, h=cv.clientHeight||44;
  cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr);
  const c=cv.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,w,h);
  c.strokeStyle='rgba(160,172,186,.10)'; c.lineWidth=1;
  c.beginPath(); c.moveTo(0,h/2); c.lineTo(w,h/2); c.stroke();
  for(let x=0;x<w;x+=Math.max(9,w/14)){ c.beginPath(); c.moveTo(x,h*0.2); c.lineTo(x,h*0.8);
    c.strokeStyle='rgba(160,172,186,.06)'; c.stroke(); }
  const v=series&&series.length?series:new Array(24).fill(0.08);
  const X=i=>i*(w/Math.max(1,v.length-1));
  const Y=i=>{const a=Math.min(1,Math.max(0,v[i]));return h/2-a*(h/2-3)*(i%2?-1:1)*0.94;};
  c.beginPath(); for(let i=0;i<v.length;i++){const x=X(i),y=Y(i); i?c.lineTo(x,y):c.moveTo(x,y);}
  c.strokeStyle='rgba(206,220,232,.62)'; c.lineWidth=1.15; c.stroke();
}

/* ========================================================================== */
window.P = {
  LS, SCOPES, TOPICS, S,
  $,$$,el,clamp,esc,hash,rng,debounce,norm,ago,dayLabel,iso,
  lsGet,lsSet,lsDel,toast,buildNoise,ambient,ghostParallax,sparkline,scopeTrace
};
})();
