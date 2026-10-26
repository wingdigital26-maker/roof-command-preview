/* Roof Command opening. Part 1 is the Wing website's first-load intro, driven exactly the way
   wing-site-v4/assets/site.js drives it (WingPiece.playIntro -> onDone reveals nav + words + line).
   Then the roofer beat (who this is for and what is in here today) and, after a storm, a short report.
   Two lengths: ?short=1 is the once-per-session opening (about 3 s to the Wing headline, one beat, then
   hand off to Today); ?about=1 or no flag is the long "About" version the Opening tab replays.
   ?hold=1 freezes at the end of the site intro; ?beat=info|storm jumps to that beat and holds;
   ?storm=1 (or a storm in the last 7 days) adds the storm report; ?nointro=1 hands off at once.
   Every number comes from window.RC (lib/rc-state.js). Any key or click skips, silently. */
(function(){
  'use strict';
  var qs = new URLSearchParams(location.search);
  var HOLD = qs.has('hold');
  var BEAT = qs.get('beat');
  var SHORT = qs.get('short') === '1';
  var WAIT = qs.get('wait') === '1';   /* first open: this is the loading screen. After the beats, hold (piece idling, hail falling) until the shell says Today is ready */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var docEl = document.documentElement;
  var NEXT = 'product.html#/daily';
  var ended = false;
  var RC = window.RC;
  var STORM = qs.get('storm') === '1' || recentStorm();
  function recentStorm(){
    try{ var iso = RC && RC.facts.storm.iso; return !!iso && (Date.now() - Date.parse(iso)) < 7*864e5; }catch(e){ return false; }
  }

  if(window.applyRoofer) applyRoofer(rooferKey());

  /* ---------- the facts: one source, lib/rc-state.js ---------- */
  function fill(){
    if(!RC) return;
    var f = RC.facts, s = f.storm, set = function(id, v){ var el = document.getElementById(id); if(el) el.textContent = v; };
    if(!f.homes) return;   /* the catalog has not landed yet: no numbers until it does */
    set('f-homes', RC.fmt(f.homes)); set('f-counties', String(f.counties));
    set('f-storm', s.d); set('f-hit', RC.fmt(s.homes));
    set('s-storm', s.d); set('s-hit', RC.fmt(s.homes)); set('s-max', String(s.max));
  }
  fill();
  if(RC && RC.factsReady) RC.factsReady.then(function(){ fill(); STORM = STORM || recentStorm(); });

  if(qs.get('nointro') === '1'){ end(); return; }

  /* ---------- hail: thin streaks falling toward the storm, kept off the centre lockup ---------- */
  (function(){
    var c = document.getElementById('hail'), g = c.getContext('2d');
    function size(){ c.width = innerWidth; c.height = innerHeight; }
    size(); addEventListener('resize', size);
    var s = 7; function R(){ s = (s*16807) % 2147483647; return s/2147483647; }
    var P = []; for(var i=0;i<(innerWidth<600?220:380);i++) P.push({x:R()*c.width, y:R()*c.height, len:10+R()*24, a:0.08+R()*0.34, v:1.6+R()*2.6, w:R()<0.14?1.5:0.9});
    function draw(){
      g.clearRect(0,0,c.width,c.height); var cx = c.width/2, cy = c.height*0.46, kx = Math.min(360, c.width*0.3), ky = c.height*0.26;
      for(var i=0;i<P.length;i++){ var p = P[i], depth = p.y/c.height;
        var keep = !(Math.abs(p.x-cx) < kx && Math.abs(p.y-cy) < ky);
        if(keep){ var a = p.a*(0.25+0.75*depth);
          g.strokeStyle = 'rgba(70,80,101,'+a+')'; g.lineWidth = p.w; g.beginPath(); g.moveTo(p.x,p.y); g.lineTo(p.x-p.len*0.18, p.y-p.len); g.stroke();
          g.fillStyle = 'rgba(39,87,230,'+Math.min(1,a+0.2)+')'; g.beginPath(); g.arc(p.x,p.y,0.9+depth*1.3,0,7); g.fill(); }
        if(!reduced){ p.y += p.v*(0.5+depth); p.x -= p.v*0.18; if(p.y > c.height+30){ p.y = -30; p.x = R()*c.width; } } }
      if(!reduced && !ended) requestAnimationFrame(draw);
    }
    draw();
  })();

  /* ---------- part 1: the site's intro gate, verbatim logic from site.js ---------- */
  var settled = false, started = false;
  function reveal(){
    if(settled) return; settled = true;
    docEl.classList.remove('intro-active');
    window.__revealT = performance.now();
    if(BEAT){ setTimeout(function(){ showBeat(BEAT === 'storm' ? 'storm' : 'info'); }, 450); return; }
    if(HOLD) return;
    setTimeout(function(){ showBeat('info'); }, SHORT ? 350 : 700);
  }
  setTimeout(reveal, SHORT ? 4200 : 6500);
  function start(){
    if(started) return; started = true;
    if(window.WingPiece && typeof window.WingPiece.playIntro === 'function'){
      try{ window.WingPiece.playIntro({reducedMotion: reduced, onDone: reveal}); }catch(e){ reveal(); }
    } else reveal();
  }
  /* the engine fires wingpiece:ready on every boot path (live three.js, poster fallback, failed import), so the opening
     waits for it. The old 1.2 s fallback called the shim before three.js had loaded on a cold cache or a slow GPU: the
     shim ran onDone at once, the beats played over an empty stage and About bounced to Today in 3 s. 8 s is the floor
     for a script that never arrives at all. */
  if(window.WingPiece && window.WingPiece.ready) start();
  else { window.addEventListener('wingpiece:ready', start, {once:true}); setTimeout(start, 8000); }

  /* ---------- parts 2 and 3: the beats ---------- */
  var current = null;
  function showBeat(name){
    if(ended) return;
    docEl.classList.add('beat-on');
    var el = document.getElementById('beat-'+name);
    if(current && current !== el){ current.classList.remove('in'); current.classList.add('out'); }
    current = el;
    setTimeout(function(){ el.classList.add('in'); window.__beat = name; }, current ? 320 : 0);
    if(BEAT || HOLD) return;
    /* the greeting follows the info (or storm) beat on the first open and the short opening; the About replay has no greeting */
    var GREET = WAIT || SHORT;
    if(name === 'info') setTimeout(function(){ STORM ? showBeat('storm') : GREET ? showBeat('hi') : beatsOver(); }, SHORT ? (STORM ? 1200 : 1500) : (STORM ? 1300 : 1600));
    else if(name === 'storm') setTimeout(function(){ GREET ? showBeat('hi') : beatsOver(); }, SHORT ? 2400 : 3400);
    else setTimeout(beatsOver, 1800);   /* the greeting is on for at least this long, then stays up through the hold */
  }
  (function(){ var o = window.activeRoofer && activeRoofer(); var el = document.querySelector('#beat-hi [data-r="owner"]');
    if(el && !(o && o.owner)){ el.parentNode.textContent = 'Hi there'; } })();

  /* ---------- the hold (?wait=1): the beats are over, Today may still be getting ready ----------
     The shell posts {type:'intro-stage'} as Today's map, cards and lines land, then {type:'intro-go'} when it is ready
     (or at its own cap). The cue appears only if the wait outlives the beats by a moment, so a fast load never shows it.
     The intro never ends early for a ready signal: the beats and the greeting always play out. A key, a click or the
     corner Skip still skips. */
  var goAsked = !WAIT, beatsDone = false, cueT = null;
  var STAGE = {map:'Drawing the map', cards:'Building today’s list', lines:'Lines ready', storms:'Storms loaded', crm:'CRM ready', ask:'Nimbus is up', still:'Still loading, almost there', ready:'Opening today'};
  var stillT = null;
  function cue(text){
    var t = document.getElementById('load-t'); if(!t || t.textContent === text) return;
    t.classList.add('swap'); setTimeout(function(){ t.textContent = text; t.classList.remove('swap'); }, reduced ? 0 : 300);
  }
  /* About (#/opening/about, ?about=1): the beats play, then the page HOLDS on the last beat instead of bouncing to Today,
     so a roofer can read it. The corner button becomes the way out (any key or click still works). */
  var ABOUT = !WAIT && !SHORT && !HOLD && !BEAT;
  if(ABOUT) docEl.classList.add('about-mode');   /* phone: the beats sit a row higher from the start, so the hold's button never lands on them */
  function beatsOver(){
    beatsDone = true;
    if(ABOUT){ var b = document.getElementById('skip'); if(b){ b.textContent = 'Open Roof Command'; docEl.classList.add('skip-on'); docEl.classList.add('about-hold'); } return; }
    if(goAsked){ end(); return; }
    cueT = setTimeout(function(){ if(!ended && !goAsked) docEl.classList.add('loading'); }, 600);
    stillT = setTimeout(function(){ if(!ended && !goAsked) cue(STAGE.still); }, 12000);   /* a long hold gets one calm line, never an error look */
    setTimeout(function(){ if(!ended) end(); }, 27000);   /* the shell has its own cap (25 s); this is the floor under it */
  }
  /* skip: a small word in the corner from 1.5 s in (any key or click skips too) */
  (function(){ var b = document.getElementById('skip'); if(!b || HOLD || BEAT) return;
    b.hidden = false; setTimeout(function(){ if(!ended) docEl.classList.add('skip-on'); }, reduced ? 0 : 1500);
    b.addEventListener('click', function(e){ e.stopPropagation(); end(); }); })();
  if(WAIT) addEventListener('message', function(e){
    if(e.origin !== location.origin) return; var d = e.data || {};
    if(d.type === 'intro-stage'){ if(STAGE[d.stage]) cue(STAGE[d.stage]); return; }
    if(d.type === 'intro-go'){ goAsked = true; clearTimeout(stillT); cue(STAGE.ready); if(beatsDone && !ended){ clearTimeout(cueT); setTimeout(end, docEl.classList.contains('loading') ? 350 : 0); } }
  });

  /* ---------- end: hand off to Today ---------- */
  function end(){
    if(ended) return; ended = true;
    clearTimeout(cueT); clearTimeout(stillT); docEl.classList.remove('loading'); docEl.classList.remove('skip-on');
    document.body.classList.add('go');
    try{ sessionStorage.setItem('rc.introSeen', '1'); }catch(e){}
    try{ window.parent.postMessage({type:'intro-done'}, '*'); }catch(e){}
    if(window.parent === window && !HOLD) setTimeout(function(){ location.href = NEXT; }, 420);
  }
  addEventListener('keydown', function(){ if(!HOLD && !BEAT) end(); });
  addEventListener('click', function(){ if(!HOLD && !BEAT) end(); });
})();
