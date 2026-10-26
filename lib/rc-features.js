/* Feature switchboard (kept from the 10-10 trials, Jack's picks 10-11). One plain config object, no UI, no URL flags.
   Each feature file reads its switch here and returns at once when it is off:
     daylight      Today map: time-of-day lighting (dawn / day / dusk / night) following the roofer's clock
     briefing      Today: the Daily 50 counts in under the greeting, then settles
     newStorm      Today: a new-storm takeover, once per storm per user (cloud CRM kv when signed in, this device otherwise)
     stormReplay   Storms: the storm sweeps across the whole map, hit homes light as the front crosses them
     roofBuild     CRM record: the 3D roof assembles (walls rise, planes drop) and stamps its estimated numbers
     rollup        CRM pipeline: counts roll like an odometer when they change
     physical      every button and card: press depth and spring (lib/rc-physical.css)
     nimbusReacts  Nimbus: ping on a reply, pulse on a new storm, glow on a booking; the orb never moves
   Also: stormSeen, the one place the "seen" storm lives (RC key stormSeen, mirrored to crm_kv by lib/rc-cloud.js). */
(function () {
  if (window.RC_FEATURES) return;
  var F = { daylight: true, briefing: true, newStorm: true, stormReplay: true, roofBuild: true, rollup: true, physical: true, nimbusReacts: true };
  var KEY = 'stormSeen';
  F.stormSeen = {
    get: function () { try { return (window.RC && RC.__get) ? (RC.__get(KEY, null) || '') : (localStorage.getItem('rc.t.' + KEY) ? JSON.parse(localStorage.getItem('rc.t.' + KEY)) : ''); } catch (e) { return ''; } },
    set: function (iso) { try { if (window.RC && RC.__set) RC.__set(KEY, iso); else localStorage.setItem('rc.t.' + KEY, JSON.stringify(iso)); } catch (e) { } }
  };
  try { if (F.physical) document.documentElement.classList.add('rc-phys'); } catch (e) { }
  window.RC_FEATURES = F;
})();
