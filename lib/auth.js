/* Roof Command tour: sign-in gate (window.RCT_AUTH).
   Same accounts as the app (js/auth.js, docs/ACCOUNTS.md): Supabase Auth over plain REST with the public anon key,
   session in localStorage "rc.session" (same key and shape, so one sign-in serves the app and the tour on one origin),
   token refresh, sign out, "Forgot password" through Supabase's recover endpoint. No sign-up form: Wing creates accounts.

   Shell (product.html):  RCT_AUTH.gate(start)  runs start() only once a valid session exists (frames are made by start).
   Screen pages (public build only, injected by scripts/build_public.py):  <script src="lib/auth.js" data-guard>
     sends a signed-out visitor back to product.html.
   Local dev: on localhost / 127.0.0.1, ?dev=1 skips the gate for this tab (sessionStorage); ?dev=0 turns it off.
   The public build flips PUBLIC to true (build_public.py), which removes the dev bypass entirely.
   Honest limit: the demo data files are static, so they are downloadable by anyone with the URL. The gate stops the
   tour loading them; it does not make them secret. */
(function () {
  if (window.RCT_AUTH) return;
  var CFG = {
    PUBLIC: true /*@RC_PUBLIC_BUILD@*/,
    // same project and public anon key as js/config.js (public by design; row level security protects the tables)
    URL: "https://preview.invalid",
    KEY: "preview-no-key"
  };
  var SK = "rc.session", DEVK = "rc.dev";
  var me = document.currentScript;
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } }, del: function (k) { try { localStorage.removeItem(k); } catch (e) { } } };
  var ss = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }, del: function (k) { try { sessionStorage.removeItem(k); } catch (e) { } } };
  var now = function () { return Math.floor(Date.now() / 1000); };
  var session = function () { try { var s = JSON.parse(ls.get(SK) || "null"); return s && s.access_token ? s : null; } catch (e) { return null; } };
  var f0 = window.fetch.bind(window);

  // ---- dev bypass (never in the public build)
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname);
  var q = new URLSearchParams(location.search);
  if (!CFG.PUBLIC && LOCAL) { if (q.get("dev") === "1") ss.set(DEVK, "1"); else if (q.get("dev") === "0") ss.del(DEVK); }
  var DEV = true;

  // ---- screen-page guard (public build): a signed-out visitor never loads a screen on its own
  if (me && me.hasAttribute("data-guard")) {
    if (!DEV && !session()) {
      var shell = new URL("product.html", me.src).href;
      try { (window.top === window ? window : window.top).location.replace(shell); } catch (e) { location.replace(shell); }
      document.documentElement.style.visibility = "hidden";
    }
    window.RCT_AUTH = { session: session, guard: true };
    return;
  }

  function api(path, method, body, token) {
    return f0(CFG.URL + path, { method: method || "GET", headers: { apikey: CFG.KEY, Authorization: "Bearer " + (token || CFG.KEY), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
          if (!r.ok) { var er = new Error((j && (j.msg || j.error_description || j.message)) || ("HTTP " + r.status)); er.status = r.status; er.code = j && (j.error_code || j.error); throw er; }
          return j;
        });
      });
  }
  function store(tok) {
    var old = session();
    var s = { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: tok.expires_at || (now() + (tok.expires_in || 3600)), user: { id: tok.user && tok.user.id, email: tok.user && tok.user.email } };
    if (!s.user.id && old) s.user = old.user;
    ls.set(SK, JSON.stringify(s)); return s;
  }
  function refresh() {
    var s = session(); if (!s || !s.refresh_token) return Promise.reject(new Error("signed out"));
    return api("/auth/v1/token?grant_type=refresh_token", "POST", { refresh_token: s.refresh_token }).then(store);
  }
  function fresh() { var s = session(); if (!s) return Promise.reject(new Error("signed out")); return s.expires_at > now() + 60 ? Promise.resolve(s) : refresh(); }
  function login(email, pw) { return api("/auth/v1/token?grant_type=password", "POST", { email: email, password: pw }).then(store); }
  function signOut() {
    var s = session();
    var done = function () { ls.del(SK); ls.del("rc.company"); ss.del(DEVK); location.replace(location.pathname + location.search.replace(/([?&])dev=1&?/, "$1").replace(/[?&]$/, "")); };
    if (!s) return done();
    api("/auth/v1/logout", "POST", null, s.access_token).then(done, done);
  }

  var ok = false, user = null;
  // keep the session alive while the tour is open (same rule as js/config.js: refresh inside the last two minutes)
  setInterval(function () { var s = session(); if (ok && s && s.expires_at < now() + 120) refresh().catch(function (e) { if (e && (e.status === 400 || e.status === 401)) { ls.del(SK); location.reload(); } }); }, 30000);

  // ---- styles (Wing light theme, Inter from the shell's @font-face)
  var CSS = ".rcg{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px 16px;overflow:auto;font-family:'Inter',system-ui,sans-serif;color:#0B1020;" +
    "background:radial-gradient(ellipse 60% 48% at 50% 40%,rgba(255,255,255,.95),rgba(255,255,255,0) 70%),linear-gradient(180deg,#B9BEC9 0%,#D5D9E0 30%,#ECEEF2 62%,#F7F8FA 100%)}" +
    ".rcg-card{width:min(400px,100%);background:#fff;border-radius:8px;border:1px solid rgba(11,16,32,.10);box-shadow:0 10px 40px rgba(11,16,32,.12);padding:28px 26px 22px}" +
    ".rcg-co{display:flex;align-items:center;gap:12px;margin-bottom:22px}.rcg-co .mark{width:40px;height:40px;border-radius:6px;background:var(--roofer,#B3262E);display:grid;place-items:center;flex:none}.rcg-co .mark svg{width:22px;height:22px}" +
    ".rcg-co b{display:block;font-weight:700;font-size:16px;letter-spacing:-.01em;line-height:1.2}.rcg-co small{display:block;font-size:12.5px;color:#465065;margin-top:2px}" +
    ".rcg h1{font-size:24px;font-weight:600;letter-spacing:-.015em;margin:0 0 6px}.rcg p.lead{margin:0 0 18px;color:#465065;font-size:14px;line-height:1.5}" +
    ".rcg label{display:block;font-size:13px;font-weight:500;color:#2B3346;margin:14px 0 6px}" +
    ".rcg input{width:100%;box-sizing:border-box;min-height:48px;padding:0 14px;border:1px solid rgba(11,16,32,.22);border-radius:6px;font:inherit;font-size:16px;color:#0B1020;background:#fff}" +
    ".rcg input:focus{outline:2px solid #2757E6;outline-offset:1px;border-color:#2757E6}" +
    ".rcg .go{width:100%;min-height:48px;margin-top:20px;border:0;border-radius:6px;background:#0B1020;color:#fff;font:inherit;font-size:15px;font-weight:600;cursor:pointer}" +
    ".rcg .go:hover{background:#1B2440}.rcg .go:disabled{opacity:.6;cursor:default}.rcg .go:focus-visible,.rcg .lnk:focus-visible{outline:2px solid #2757E6;outline-offset:2px}" +
    ".rcg .lnk{display:inline-flex;align-items:center;min-height:44px;margin-top:6px;padding:0 2px;background:none;border:0;color:#2757E6;font:inherit;font-size:14px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}" +
    ".rcg .msg{min-height:20px;margin-top:10px;font-size:14px;line-height:1.45;color:#2B3346}.rcg .msg.bad{color:#B3261E}" +
    ".rcg .need{margin:14px 0 0;padding-top:14px;border-top:1px solid rgba(11,16,32,.10);font-size:13.5px;color:#465065}" +
    ".rcg .sig{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#465065}.rcg .sig svg{width:13px;height:13.6px}.rcg .sig b{color:#0B1020;font-weight:600}" +
    ".rcm{position:fixed;z-index:99000;min-width:260px;max-width:calc(100vw - 24px);background:#fff;border:1px solid rgba(11,16,32,.14);border-radius:8px;box-shadow:0 10px 30px rgba(11,16,32,.16);padding:12px;font-family:'Inter',system-ui,sans-serif;color:#0B1020}" +
    ".rcm small{display:block;font-size:13px;color:#465065}.rcm b{display:block;font-size:15px;font-weight:600;margin:2px 0 10px;overflow-wrap:anywhere}" +
    ".rcm button{width:100%;min-height:44px;border:1px solid rgba(11,16,32,.18);border-radius:6px;background:#fff;font:inherit;font-size:15px;font-weight:500;color:#0B1020;cursor:pointer}.rcm button:hover{background:#F1F3F7}.rcm button+button{margin-top:6px}" +
    ".rcm .rcm-note{margin:12px 0 0;padding-top:10px;border-top:1px solid rgba(11,16,32,.10);font-size:13.5px;line-height:1.45;color:#465065;max-width:260px}" +
    "@media (max-width:599px){.rcg{justify-content:flex-start;padding-top:28px}.rcg-card{padding:24px 20px 18px}}";
  function css() { if (document.getElementById("rcg-css")) return; var st = document.createElement("style"); st.id = "rcg-css"; st.textContent = CSS; document.head.appendChild(st); }
  var WING = '<svg viewBox="0 0 63 66" aria-hidden="true"><path fill="#2757E6" d="M 0 3 Q 0 0 3 0 L 27 0 Q 30.5 0 30.5 3.5 L 30.5 28.5 Q 30.5 33.5 35.5 33.5 L 60 33.5 Q 63 33.5 63 36.5 L 63 63 Q 63 66 60 66 L 36 66 Q 32.5 66 32.5 62.5 L 32.5 37.5 Q 32.5 32.5 27.5 32.5 L 3 32.5 Q 0 32.5 0 29.5 Z"/></svg>';
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  // the roofer co-brand comes from the shell's own header (set from lib/brand.js), nothing hard-coded here
  function coBrand() {
    var co = document.querySelector("header .co"); var mark = co && co.querySelector(".mark");
    var name = co && co.querySelector("b"), area = co && co.querySelector("small");
    return '<div class="rcg-co">' + (mark ? '<span class="' + esc(mark.className) + '" style="' + esc(mark.getAttribute("style") || "") + '" aria-hidden="true">' + mark.innerHTML + "</span>" : "") +
      "<div><b>" + esc(name ? name.textContent : "Roof Command") + "</b><small>" + esc(area && area.textContent !== (name && name.textContent) ? area.textContent : "Roof Command") + "</small></div></div>";
  }
  var wall = null;
  function setInert(on) { ["header", "main", "#note"].forEach(function (s) { var el = document.querySelector(s); if (!el) return; if (on) { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); } else { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); } }); }
  function showWall(mode, note) {
    css(); setInert(true);
    if (wall) wall.remove();
    wall = document.createElement("div"); wall.className = "rcg"; wall.setAttribute("role", "dialog"); wall.setAttribute("aria-modal", "true"); wall.setAttribute("aria-labelledby", "rcgH");
    var reset = mode === "reset";
    wall.innerHTML = '<form class="rcg-card" novalidate>' + coBrand() +
      (reset
        ? '<h1 id="rcgH">Set a new password</h1><p class="lead">Use at least 10 characters.</p>' +
          '<label for="rcgPw">New password</label><input id="rcgPw" type="password" autocomplete="new-password" required>' +
          '<label for="rcgPw2">Type it again</label><input id="rcgPw2" type="password" autocomplete="new-password" required>' +
          '<button class="go" type="submit">Save and sign in</button>'
        : '<h1 id="rcgH">Sign in</h1><p class="lead">Use the email and password for your Roof Command account.</p>' +
          '<label for="rcgEm">Email</label><input id="rcgEm" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required>' +
          '<label for="rcgPw">Password</label><input id="rcgPw" type="password" autocomplete="current-password" required>' +
          '<button class="go" type="submit">Sign in</button><button class="lnk" type="button" id="rcgForgot">Forgot password?</button>') +
      '<div class="msg" id="rcgMsg" role="status" aria-live="polite"></div>' +
      '<p class="need">Need access? Ask Wing Digital.</p></form>' +
      '<div class="sig">Powered by ' + WING + "<b>Wing Digital</b></div>";
    document.body.appendChild(wall);
    wall.addEventListener("keydown", function (e) { e.stopPropagation(); }); // the shell's 1 to 5 and Ctrl K shortcuts stay off while signed out
    var form = wall.querySelector("form"), go = wall.querySelector(".go"), msgEl = wall.querySelector("#rcgMsg");
    var msg = function (m, bad) { msgEl.textContent = m || ""; msgEl.classList.toggle("bad", !!bad); msgEl.setAttribute("role", bad ? "alert" : "status"); };
    if (note) msg(note.t, note.bad);
    var first = wall.querySelector("input"); setTimeout(function () { try { first.focus(); } catch (e) { } }, 30);
    return { form: form, go: go, msg: msg };
  }
  function hideWall() { if (wall) { wall.remove(); wall = null; } setInert(false); }

  function signInWall(onReady, note) {
    var w = showWall("signin", note);
    var em = wall.querySelector("#rcgEm"), pw = wall.querySelector("#rcgPw");
    var last = ls.get("rc.lastEmail"); if (last) { em.value = last; setTimeout(function () { try { pw.focus(); } catch (e) { } }, 40); }
    w.form.onsubmit = function (e) {
      e.preventDefault();
      var e1 = em.value.trim(), p1 = pw.value;
      if (!e1 || !p1) { w.msg("Enter your email and password.", true); (e1 ? pw : em).focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e1)) { w.msg("That email does not look right. Check it and try again.", true); em.focus(); return; }
      w.go.disabled = true; w.msg("Signing in...");
      login(e1, p1).then(function (s) { ls.set("rc.lastEmail", e1); enter(s, onReady); }, function (err) {
        w.go.disabled = false; pw.select();
        w.msg(err.status === 400 || err.status === 401 ? "That email and password do not match an account. Check both and try again." :
          err.status === 429 ? "Too many tries. Wait a minute, then try again." : "Could not reach the sign-in service. Check your connection and try again.", true);
      });
    };
    wall.querySelector("#rcgForgot").onclick = function () {
      var e1 = em.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e1)) { w.msg("Type your email above first, then press Forgot password.", true); em.focus(); return; }
      var back = location.href.split("#")[0];
      w.msg("Sending...");
      api("/auth/v1/recover?redirect_to=" + encodeURIComponent(back), "POST", { email: e1 }).then(function () { w.msg("If that email has an account, a reset link is on its way. It opens this page."); },
        function (err) { w.msg(err.status === 429 ? "A reset email was sent recently. Wait a minute, then try again." : "Could not send the reset email. Try again later.", true); });
    };
  }
  function resetWall(tok, onReady) {
    var w = showWall("reset");
    w.form.onsubmit = function (e) {
      e.preventDefault();
      var p1 = wall.querySelector("#rcgPw").value, p2 = wall.querySelector("#rcgPw2").value;
      if (p1.length < 10) { w.msg("Use at least 10 characters.", true); return; }
      if (p1 !== p2) { w.msg("The two passwords do not match.", true); return; }
      w.go.disabled = true; w.msg("Saving...");
      api("/auth/v1/user", "PUT", { password: p1 }, tok).then(function (u) { return login(u.email, p1); }).then(function (s) { enter(s, onReady); }, function (err) {
        w.go.disabled = false;
        w.msg(err.status === 401 || err.status === 403 ? "This link has expired or was already used. Ask for a new one from the sign-in screen." : (err.status === 422 ? "Pick a different password: " + err.message : "Could not save the password. Try again."), true);
      });
    };
  }

  // ---- the avatar menu: signed-in email and Sign out
  function menu() {
    var av = document.getElementById("me"); if (!av || av.dataset.rcm) return; av.dataset.rcm = "1";
    av.setAttribute("role", "button"); av.setAttribute("aria-haspopup", "menu"); av.setAttribute("aria-expanded", "false"); av.style.cursor = "pointer";
    var pop = null;
    var close = function () { if (pop) { pop.remove(); pop = null; av.setAttribute("aria-expanded", "false"); } };
    var open = function () {
      css(); close(); pop = document.createElement("div"); pop.className = "rcm"; pop.setAttribute("role", "menu");
      var NOTE = '<p class="rcm-note">Homes, hail, roofs and owner names come from public records. A phone marked sample is a placeholder until real numbers are loaded.</p>';
      var SETUP = window.RC_SETUP ? '<button type="button" role="menuitem" data-setup>Company setup</button>' : '';
      pop.innerHTML = (DEV && !user ? '<small>Demo preview</small><b>Not signed in</b>' + SETUP + '<button type="button" role="menuitem" data-out>Sign in</button>'
        : '<small>Signed in as</small><b>' + esc(user && user.email || "your account") + '</b>' + SETUP + '<button type="button" role="menuitem" data-out>Sign out</button>') + NOTE;
      document.body.appendChild(pop);
      var r = av.getBoundingClientRect(), wv = pop.offsetWidth;
      pop.style.top = Math.round(r.bottom + 8) + "px"; pop.style.left = Math.max(12, Math.min(innerWidth - wv - 12, Math.round(r.right - wv))) + "px";
      var b = pop.querySelector("[data-out]"); b.onclick = DEV && !user ? function () { ss.del(DEVK); location.replace(location.pathname); } : signOut;
      var su = pop.querySelector("[data-setup]"); if (su) su.onclick = function () { close(); window.RC_SETUP.open(); };
      (su || b).focus();
      av.setAttribute("aria-expanded", "true");
    };
    av.addEventListener("click", function (e) { e.stopPropagation(); pop ? close() : open(); });
    av.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pop ? close() : open(); } });
    document.addEventListener("click", function (e) { if (pop && !pop.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && pop) { close(); av.focus(); } });
    addEventListener("resize", close);
  }

  function enter(s, onReady) {
    ok = true; user = s && s.user || null; hideWall(); menu();
    var av = document.getElementById("me"); if (av && user && user.email) av.title = user.email;
    try { onReady(); } catch (e) { setTimeout(function () { throw e; }); }
  }

  function gate(onReady) {
    if (DEV) { ok = true; menu(); onReady(); return; }
    // a password reset link lands here: #access_token=...&type=recovery (or #error_description=... when it expired)
    var h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    if (h.get("type") === "recovery" || h.get("error_description")) {
      history.replaceState(null, "", location.pathname + location.search); // keep the token out of the address bar and history
      if (h.get("access_token") && h.get("type") === "recovery") return resetWall(h.get("access_token"), onReady);
      return signInWall(onReady, { t: "That link has expired or was already used. Ask for a new one with Forgot password.", bad: true });
    }
    var s = session();
    if (!s) return signInWall(onReady);
    fresh().then(function (s2) {
      return api("/auth/v1/user", "GET", null, s2.access_token).then(function (u) { if (u && u.email) { s2.user = { id: u.id, email: u.email }; ls.set(SK, JSON.stringify(s2)); } enter(s2, onReady); });
    }).catch(function (e) {
      if (e && e.status && e.status < 500) { ls.del(SK); return signInWall(onReady, { t: "Your session ended. Sign in again.", bad: false }); }
      var s3 = session(); // offline or the service is down: a session that has not expired still opens the cached tour
      if (s3 && s3.expires_at > now()) enter(s3, onReady); else signInWall(onReady);
    });
  }

  window.RCT_AUTH = { gate: gate, ok: function () { return ok; }, session: session, signOut: signOut, dev: DEV, public: CFG.PUBLIC, user: function () { return user; } };
})();
