// Animated life timeline for the CV page.
// Markup: <div class="lifeviz"></div> plus <script type="application/json" id="life-resume">{work, education}</script>
// Cards marked .lv-fallback (the classic Work/Education cards) are hidden once this runs.
(function () {
  "use strict";

  var root = document.querySelector(".lifeviz");
  if (!root) return;

  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var R = {};
  try {
    R = JSON.parse((document.getElementById("life-resume") || {}).textContent || "{}");
  } catch (e) {}

  // ===========================================================================
  // CSS
  // ===========================================================================
  var CSS = [
    ".lifeviz{--lv-sky:#e3f0fb;--lv-sky2:#f6fbff;--lv-mtn:#a9bfd0;--lv-mtn2:#c5d5e2;--lv-snow:#ffffff;--lv-hill:#9cc98a;--lv-gr-ir:#b9dca8;--lv-gr-it:#e6d9c2;--lv-city:#d3c2ab;--lv-city2:#e2d6c4;--lv-cloud:#ffffff;",
    "--lv-skin:#e5b48a;--lv-hair:#2b1d14;--lv-pants:#34435a;--lv-shoe:#1f2630;--lv-wood:#c8955f;--lv-wood2:#a8763f;--lv-bldg:#f2ece2;--lv-bldg2:#d9cdbb;--lv-ink:#2d3440;",
    "--lv-fg:var(--global-text-color,#1f2328);--lv-fg2:var(--global-text-color-light,#6b7280);--lv-acc:var(--global-theme-color,#b509ac);--lv-line:var(--surface-border,#e5e5e5);--lv-bg:var(--global-bg-color,#fff)}",
    'html[data-theme="dark"] .lifeviz{--lv-sky:#16202e;--lv-sky2:#1d2a3b;--lv-mtn:#2c3b50;--lv-mtn2:#24324a;--lv-snow:#c9d6e3;--lv-hill:#2f4a33;--lv-gr-ir:#263b2a;--lv-gr-it:#3a3428;--lv-city:#3b352d;--lv-city2:#312c26;--lv-cloud:#2a3a50;--lv-bldg:#3a3f49;--lv-bldg2:#2f343d;--lv-wood:#8a6440;--lv-wood2:#6e4f31}',
    ".lv-stage{border-radius:12px;overflow:hidden;border:1px solid var(--lv-line)}",
    ".lv-svg{display:block;width:100%;height:auto}",
    ".lv-svg text{font-family:inherit}",
    // layers
    ".lv-k{opacity:0;transition:opacity .7s ease}",
    ".lv-k.on{opacity:1}",
    ".lv-char{transform-box:fill-box;transform-origin:50% 100%;transform:scale(.9);transition:opacity .6s ease,transform .8s cubic-bezier(.3,1.4,.5,1)}",
    ".lv-char.on{transform:scale(1)}",
    ".lv-char.on .bob{animation:lv-bob 2.6s ease-in-out infinite}",
    "@keyframes lv-bob{50%{transform:translateY(-2px)}}",
    ".lv-pop{transform-box:fill-box;transform-origin:50% 100%;transform:translateY(14px);transition:opacity .6s ease,transform .7s cubic-bezier(.3,1.4,.5,1)}",
    ".lv-pop.on{transform:none}",
    // paint
    ".skin{fill:var(--lv-skin)}.hair{fill:var(--lv-hair)}.pants{fill:var(--lv-pants)}.shoe{fill:var(--lv-shoe)}",
    ".shirt{fill:var(--shirt)}.arm{stroke:var(--sleeve,var(--shirt));fill:none;stroke-linecap:round}",
    ".eye{fill:#1d1d1d}.mouth{fill:none;stroke:#7a3b2b;stroke-width:1.6;stroke-linecap:round}.cheek{fill:#f19a8a;opacity:.55}",
    ".bp{fill:#c0392b}.strap{stroke:#962d22;stroke-width:3;stroke-linecap:round;fill:none}",
    ".gown{fill:#1f2a44}.capt{fill:#141b2d}.tassel{stroke:#e8b931;stroke-width:2;fill:none;stroke-linecap:round}",
    ".leaf{fill:#3f8f3a}.ribbon{fill:#d62828}",
    ".laptop{fill:#9aa5b1}.laptop2{fill:#5d6875}.screen{fill:#1b2330}",
    ".wood{fill:var(--lv-wood)}.wood2{fill:var(--lv-wood2)}",
    ".bldg{fill:var(--lv-bldg);stroke:var(--lv-bldg2);stroke-width:1.5}.bldg2{fill:var(--lv-bldg2)}.win{fill:#8fb8d8;opacity:.8}",
    ".sign{fill:var(--lv-bg);stroke:var(--lv-line);stroke-width:1}.signt{fill:var(--lv-fg);font-size:12px;font-weight:650;text-anchor:middle}",
    ".chip rect{fill:var(--lv-acc)}.chip text{fill:#fff;font-size:13px;font-weight:700;text-anchor:middle}",
    ".lv-year{fill:var(--lv-fg);opacity:.07;font-size:118px;font-weight:800;text-anchor:middle;letter-spacing:-2px}",
    ".lv-year.flash{animation:lv-yr .8s ease}",
    "@keyframes lv-yr{from{opacity:0;transform:translateY(10px)}to{opacity:.07}}",
    ".cloud{fill:var(--lv-cloud);opacity:.9}",
    ".lv-drift{animation:lv-drift 40s linear infinite}",
    "@keyframes lv-drift{from{transform:translateX(-60px)}to{transform:translateX(60px)}}",
    ".sine{fill:none;stroke:#3ee08f;stroke-width:2;stroke-dasharray:5 3;animation:lv-dash 1s linear infinite}",
    "@keyframes lv-dash{to{stroke-dashoffset:-16}}",
    ".term{fill:#7ee787;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:8.5px}",
    ".cursor{fill:#7ee787;animation:lv-blink 1s steps(1) infinite}",
    "@keyframes lv-blink{50%{opacity:0}}",
    ".steam{fill:none;stroke:var(--lv-fg2);stroke-width:1.4;stroke-linecap:round;opacity:.6;animation:lv-steam 2s ease-in-out infinite}",
    "@keyframes lv-steam{50%{transform:translateY(-3px);opacity:.2}}",
    ".lv-conf rect{animation:lv-fall linear forwards}",
    "@keyframes lv-fall{from{transform:translateY(-40px) rotate(0)}to{transform:translateY(340px) rotate(540deg)}}",
    ".toss{transform-box:fill-box;transform-origin:50% 50%}",
    ".toss.go{animation:lv-toss 1.5s cubic-bezier(.3,0,.4,1) .5s 2}",
    "@keyframes lv-toss{0%,100%{transform:none}45%{transform:translateY(-95px) rotate(200deg)}55%{transform:translateY(-95px) rotate(220deg)}}",
    ".arc{fill:none;stroke:var(--lv-fg2);stroke-width:1.6;stroke-dasharray:2 7;stroke-linecap:round}",
    ".pin{fill:var(--lv-acc)}.pint{fill:var(--lv-fg);font-size:12px;font-weight:650;text-anchor:middle}",
    ".pie1{fill:var(--lv-acc)}.pie2{fill:#3f8f3a}",
    // timeline
    ".tl-line{stroke:var(--lv-line);stroke-width:4;stroke-linecap:round}",
    ".tl-prog{stroke:var(--lv-acc);stroke-width:4;stroke-linecap:round;transition:all .8s ease}",
    ".tl-dot{cursor:pointer}.tl-dot circle.d{fill:var(--lv-bg);stroke:var(--lv-fg2);stroke-width:2;transition:all .3s}",
    ".tl-dot.done circle.d{fill:var(--lv-acc);stroke:var(--lv-acc)}",
    ".tl-dot.cur circle.d{fill:var(--lv-acc);stroke:var(--lv-bg);stroke-width:3;r:9}",
    ".tl-dot:hover circle.d,.tl-dot:focus-visible circle.d{stroke:var(--lv-acc)}",
    ".tl-dot:focus{outline:none}",
    ".tl-dot text{fill:var(--lv-fg2);font-size:11.5px;text-anchor:middle}",
    ".tl-dot.cur text{fill:var(--lv-fg);font-weight:700}",
    ".tl-tail{stroke:var(--lv-fg2);stroke-width:2;stroke-dasharray:2 5;stroke-linecap:round}",
    ".tl-soon{fill:var(--lv-fg2);font-size:11px;font-style:italic}",
    // info + controls
    ".lv-info{display:flex;gap:1rem;align-items:flex-start;margin:1rem 0 .8rem;min-height:5.2rem}",
    ".lv-when{flex:0 0 auto;min-width:7.2rem;font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--lv-acc);padding-top:.3rem}",
    ".lv-body{flex:1;min-width:0}",
    ".lv-ttl{font-size:1.12rem;font-weight:700;margin:0 0 .15rem;color:var(--lv-fg)}",
    ".lv-sub{color:var(--lv-fg2);font-size:.92rem}",
    ".lv-sub i{margin-right:.3rem}",
    ".lv-more{margin-top:.55rem;font-size:.9rem}",
    ".lv-more ul{margin:.3rem 0 0;padding-left:1.15rem}",
    ".lv-more li{margin:.15rem 0}",
    ".lv-more details{margin-top:.5rem}",
    ".lv-more summary{cursor:pointer;color:var(--lv-acc);font-weight:600}",
    "@media (max-width:576px){.lv-info{flex-direction:column;gap:.2rem}.lv-when{padding-top:0}}",
    ".lv-ctl{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}",
    ".lifeviz button{font:inherit;font-size:.82rem;font-weight:500;line-height:1.2;color:var(--lv-fg);background:var(--lv-bg);border:1px solid var(--lv-line);border-radius:999px;padding:.34rem .85rem;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem}",
    ".lifeviz button:hover{border-color:var(--lv-acc)}",
    ".lifeviz button:disabled{opacity:.4;cursor:default}",
    ".lifeviz button svg{width:13px;height:13px;fill:currentColor}",
    ".lv-count{margin-left:auto;font-size:.8rem;color:var(--lv-fg2);font-variant-numeric:tabular-nums}",
    ".lifeviz:focus-visible{outline:2px solid var(--lv-acc);outline-offset:4px;border-radius:8px}",
    ".lv-nomotion *{animation:none!important;transition:none!important}",
    ".lv-instant *{transition:none!important}",
  ].join("\n");

  // ===========================================================================
  // Drawing helpers
  // ===========================================================================
  var G = 300; // ground line
  var CX = 450; // character x

  function n(v) {
    return Math.round(v * 10) / 10;
  }

  // A standing person, feet at (0,0).
  // o: h height, hr head ratio, leg ratio, shirt colour, arms [left, right] targets, extras.
  function person(o) {
    var h = o.h,
      hr = h * o.hr,
      top = -h,
      cy = top + hr,
      neck = top + 2 * hr,
      legL = h * o.leg,
      hip = -legL,
      tw = o.tw || h * 0.27,
      sw = tw / 2,
      aw = Math.max(5, tw * 0.3),
      lw = sw - 1.5;
    var s = '<g class="bob" style="--shirt:' + o.shirt + (o.sleeve ? ";--sleeve:" + o.sleeve : "") + '">';

    if (o.backpack) {
      s +=
        '<rect class="bp" x="' + n(-sw - 6) + '" y="' + n(neck + 6) + '" width="' + n(tw + 12) + '" height="' + n((hip - neck) * 0.8) + '" rx="7"/>';
    }
    // legs + shoes
    s +=
      '<rect class="pants" x="' +
      n(-sw + 1) +
      '" y="' +
      n(hip - 4) +
      '" width="' +
      n(lw) +
      '" height="' +
      n(legL + 1) +
      '" rx="' +
      n(lw / 2.4) +
      '"/>';
    s += '<rect class="pants" x="0.5" y="' + n(hip - 4) + '" width="' + n(lw) + '" height="' + n(legL + 1) + '" rx="' + n(lw / 2.4) + '"/>';
    s += '<ellipse class="shoe" cx="' + n(-sw / 2 - 1) + '" cy="-2.5" rx="' + n(lw * 0.75) + '" ry="3.5"/>';
    s += '<ellipse class="shoe" cx="' + n(sw / 2 + 2) + '" cy="-2.5" rx="' + n(lw * 0.75) + '" ry="3.5"/>';
    // torso
    s +=
      '<rect class="shirt" x="' +
      n(-sw) +
      '" y="' +
      n(neck + 3) +
      '" width="' +
      n(tw) +
      '" height="' +
      n(hip - neck + 2) +
      '" rx="' +
      n(sw * 0.55) +
      '"/>';
    if (o.gown)
      s +=
        '<path class="gown" d="M' +
        n(-sw - 1) +
        "," +
        n(neck + 4) +
        " L" +
        n(sw + 1) +
        "," +
        n(neck + 4) +
        " L" +
        n(sw + 10) +
        ",-12 L" +
        n(-sw - 10) +
        ',-12 Z"/>';
    if (o.blazer)
      s +=
        '<path d="M' +
        n(-sw) +
        "," +
        n(neck + 5) +
        " L0," +
        n(neck + 26) +
        " L" +
        n(sw) +
        "," +
        n(neck + 5) +
        '" fill="none" stroke="#f4f4f4" stroke-width="5"/>' +
        '<path d="M-2,' +
        n(neck + 10) +
        " L0," +
        n(neck + 40) +
        " L2," +
        n(neck + 10) +
        'Z" fill="#b8323a"/>';
    if (o.backpack)
      s +=
        '<path class="strap" d="M' +
        n(-sw + 4) +
        "," +
        n(neck + 5) +
        " L" +
        n(-sw + 6) +
        "," +
        n(hip - 6) +
        " M" +
        n(sw - 4) +
        "," +
        n(neck + 5) +
        " L" +
        n(sw - 6) +
        "," +
        n(hip - 6) +
        '"/>';
    if (o.lanyard)
      s +=
        '<path d="M' +
        n(-sw * 0.5) +
        "," +
        n(neck + 4) +
        " L0," +
        n(neck + 26) +
        " L" +
        n(sw * 0.5) +
        "," +
        n(neck + 4) +
        '" fill="none" stroke="' +
        o.lanyard +
        '" stroke-width="2.2"/>' +
        '<rect x="-6" y="' +
        n(neck + 25) +
        '" width="12" height="15" rx="2" fill="#fff" stroke="#c9ced6"/><rect x="-6" y="' +
        n(neck + 25) +
        '" width="12" height="4" rx="1.5" fill="' +
        o.lanyard +
        '"/>';

    // arms
    var sh = neck + 9;
    var T = {
      down: function (sg) {
        return [sg * (sw + 4), hip + 2];
      },
      out: function (sg) {
        return [sg * (sw + 18), neck + (hip - neck) * 0.45];
      },
      up: function (sg) {
        return [sg * (sw + 9), top - 4];
      },
      hold: function (sg) {
        return [sg * (sw * 0.15), neck + (hip - neck) * 0.62];
      },
      side: function (sg) {
        return [sg * (sw + 13), hip + 6];
      },
    };
    [-1, 1].forEach(function (sg, k) {
      var p = T[o.arms[k]](sg),
        sx = sg * (sw - 2);
      var ex = sx + (p[0] - sx) * 0.45 + sg * 4,
        ey = sh + (p[1] - sh) * 0.5;
      s +=
        '<path class="arm" stroke-width="' +
        n(aw) +
        '" d="M' +
        n(sx) +
        "," +
        n(sh) +
        " Q" +
        n(ex) +
        "," +
        n(ey) +
        " " +
        n(p[0]) +
        "," +
        n(p[1]) +
        '"/>';
      s += '<circle class="skin" cx="' + n(p[0]) + '" cy="' + n(p[1]) + '" r="' + n(aw * 0.58) + '"/>';
    });

    // head
    s += '<rect class="skin" x="-3.5" y="' + n(neck - 3) + '" width="7" height="8" rx="2"/>';
    s += '<circle class="skin" cx="0" cy="' + n(cy) + '" r="' + n(hr) + '"/>';
    s +=
      '<path class="hair" d="M' +
      n(-hr * 1.04) +
      "," +
      n(cy + hr * 0.05) +
      " A" +
      n(hr * 1.04) +
      "," +
      n(hr * 1.08) +
      " 0 0 1 " +
      n(hr * 1.04) +
      "," +
      n(cy + hr * 0.05) +
      " Q" +
      n(hr * 0.75) +
      "," +
      n(cy - hr * 0.55) +
      " " +
      n(hr * 0.1) +
      "," +
      n(cy - hr * 0.42) +
      " Q" +
      n(-hr * 0.6) +
      "," +
      n(cy - hr * 0.3) +
      " " +
      n(-hr * 1.04) +
      "," +
      n(cy + hr * 0.05) +
      'Z"/>';
    s += '<circle class="eye" cx="' + n(-hr * 0.36) + '" cy="' + n(cy + hr * 0.12) + '" r="' + n(Math.max(1.4, hr * 0.09)) + '"/>';
    s += '<circle class="eye" cx="' + n(hr * 0.36) + '" cy="' + n(cy + hr * 0.12) + '" r="' + n(Math.max(1.4, hr * 0.09)) + '"/>';
    s +=
      '<path class="mouth" d="M' +
      n(-hr * 0.28) +
      "," +
      n(cy + hr * 0.42) +
      " Q0," +
      n(cy + hr * 0.62) +
      " " +
      n(hr * 0.28) +
      "," +
      n(cy + hr * 0.42) +
      '"/>';
    if (o.cheeks) {
      s += '<circle class="cheek" cx="' + n(-hr * 0.58) + '" cy="' + n(cy + hr * 0.38) + '" r="' + n(hr * 0.16) + '"/>';
      s += '<circle class="cheek" cx="' + n(hr * 0.58) + '" cy="' + n(cy + hr * 0.38) + '" r="' + n(hr * 0.16) + '"/>';
    }
    if (o.beard)
      s +=
        '<path d="M' +
        n(-hr * 0.75) +
        "," +
        n(cy + hr * 0.2) +
        " Q0," +
        n(cy + hr * 1.25) +
        " " +
        n(hr * 0.75) +
        "," +
        n(cy + hr * 0.2) +
        " Q0," +
        n(cy + hr * 0.85) +
        " " +
        n(-hr * 0.75) +
        "," +
        n(cy + hr * 0.2) +
        'Z" class="hair" opacity=".85"/>';

    // headwear
    if (o.cap) {
      s +=
        '<g class="toss"><path class="capt" d="M' +
        n(-hr * 1.35) +
        "," +
        n(top + hr * 0.2) +
        " L0," +
        n(top - hr * 0.3) +
        " L" +
        n(hr * 1.35) +
        "," +
        n(top + hr * 0.2) +
        " L0," +
        n(top + hr * 0.68) +
        'Z"/>' +
        '<rect class="capt" x="' +
        n(-hr * 0.72) +
        '" y="' +
        n(top + hr * 0.25) +
        '" width="' +
        n(hr * 1.44) +
        '" height="' +
        n(hr * 0.45) +
        '" rx="2"/>' +
        '<path class="tassel" d="M0,' +
        n(top + hr * 0.2) +
        " L" +
        n(hr * 1.05) +
        "," +
        n(top + hr * 0.4) +
        " L" +
        n(hr * 1.1) +
        "," +
        n(top + hr * 1.1) +
        '"/></g>';
    }
    if (o.wreath) {
      for (var a = 0; a < 13; a++) {
        var ang = Math.PI * (1.02 + a * 0.075),
          rx = Math.cos(ang) * hr * 1.03,
          ry = cy + Math.sin(ang) * hr * 1.03;
        s +=
          '<ellipse class="leaf" cx="' +
          n(rx) +
          '" cy="' +
          n(ry) +
          '" rx="' +
          n(hr * 0.28) +
          '" ry="' +
          n(hr * 0.13) +
          '" transform="rotate(' +
          n((ang * 180) / Math.PI + 60) +
          " " +
          n(rx) +
          " " +
          n(ry) +
          ')"/>';
      }
      s +=
        '<path class="ribbon" d="M' +
        n(hr * 0.85) +
        "," +
        n(cy + hr * 0.1) +
        " l6,16 l-4,-1 M" +
        n(hr * 0.85) +
        "," +
        n(cy + hr * 0.1) +
        ' l10,12 l-4,1"/>';
    }

    // hand-held props
    if (o.laptop) {
      var lx = T.hold(1)[0],
        ly = T.hold(1)[1];
      s += '<rect class="laptop" x="' + n(lx - 2) + '" y="' + n(ly - 26) + '" width="7" height="34" rx="2"/>';
    }
    if (o.mug) {
      var mx = T.hold(1)[0] + 2,
        my = T.hold(1)[1] - 8;
      s += '<rect x="' + n(mx) + '" y="' + n(my) + '" width="12" height="13" rx="2" fill="#f4f4f4" stroke="#9aa5b1"/>';
      s += '<path d="M' + n(mx + 12) + "," + n(my + 3) + " q5,0 5,4 q0,4 -5,4" + '" fill="none" stroke="#9aa5b1" stroke-width="1.6"/>';
      s += '<path class="steam" d="M' + n(mx + 4) + "," + n(my - 3) + " q-3,-4 0,-8 M" + n(mx + 8) + "," + n(my - 3) + ' q-3,-4 0,-8"/>';
    }
    if (o.diploma) {
      var up = T.up(1);
      s += '<rect x="' + n(up[0] - 3) + '" y="' + n(up[1] - 26) + '" width="8" height="30" rx="3.5" fill="#fbf3dc" stroke="#c9b37a"/>';
      s += '<rect x="' + n(up[0] - 3.5) + '" y="' + n(up[1] - 13) + '" width="9" height="3" fill="#d62828"/>';
    }
    if (o.suitcase) {
      var sx2 = sw + 8;
      s += '<path d="M' + n(sx2 + 8) + "," + n(hip + 4) + " v-10 h12 v10" + '" fill="none" stroke="#5d6875" stroke-width="2.5"/>';
      s += '<rect x="' + n(sx2) + '" y="' + n(hip + 4) + '" width="30" height="' + n(legL - 10) + '" rx="5" fill="#d9822b"/>';
      s +=
        '<path d="M' +
        n(sx2 + 10) +
        "," +
        n(hip + 8) +
        " v" +
        n(legL - 18) +
        " M" +
        n(sx2 + 20) +
        "," +
        n(hip + 8) +
        " v" +
        n(legL - 18) +
        '" stroke="#b5651d" stroke-width="2"/>';
      s += '<circle cx="' + n(sx2 + 6) + '" cy="-3" r="3" fill="#333"/><circle cx="' + n(sx2 + 24) + '" cy="-3" r="3" fill="#333"/>';
    }
    return s + "</g>";
  }

  function baby() {
    var s = '<g class="bob" style="--shirt:#f7c5d8">';
    // crib back
    s += '<rect class="wood" x="-82" y="-82" width="164" height="7" rx="3"/>';
    s += '<rect x="-78" y="-26" width="156" height="12" rx="4" fill="#ffffff" stroke="#d9d9d9"/>';
    // baby (sitting)
    s += '<ellipse class="shirt" cx="0" cy="-36" rx="19" ry="15"/>';
    s += '<ellipse class="shirt" cx="-15" cy="-40" rx="5" ry="8" transform="rotate(25 -15 -40)"/>';
    s += '<ellipse class="shirt" cx="15" cy="-40" rx="5" ry="8" transform="rotate(-25 15 -40)"/>';
    s += '<circle class="skin" cx="-18" cy="-33" r="4.5"/><circle class="skin" cx="18" cy="-33" r="4.5"/>';
    s += '<circle class="skin" cx="0" cy="-66" r="17"/>';
    s += '<path class="hair" d="M-4,-83 q4,-6 9,-1 q-5,-2 -5,4z"/>';
    s += '<circle class="eye" cx="-6" cy="-65" r="1.8"/><circle class="eye" cx="6" cy="-65" r="1.8"/>';
    s += '<path class="mouth" d="M-4,-58 Q0,-55 4,-58"/>';
    s += '<circle class="cheek" cx="-10" cy="-60" r="3"/><circle class="cheek" cx="10" cy="-60" r="3"/>';
    // crib front
    for (var x = -76; x <= 76; x += 15.2) s += '<rect class="wood" x="' + n(x - 2) + '" y="-80" width="4" height="66" rx="2"/>';
    s += '<rect class="wood2" x="-84" y="-20" width="168" height="7" rx="3"/>';
    s += '<rect class="wood2" x="-84" y="-86" width="7" height="86" rx="3"/><rect class="wood2" x="77" y="-86" width="7" height="86" rx="3"/>';
    return s + "</g>";
  }

  // character stages
  var CHARS = {
    baby: baby(),
    toddler: person({ h: 82, hr: 0.21, leg: 0.3, shirt: "#f4a261", arms: ["out", "out"], cheeks: true }),
    kid: person({ h: 112, hr: 0.155, leg: 0.38, shirt: "#2a9d8f", arms: ["down", "down"], backpack: true, cheeks: true }),
    student: person({ h: 150, hr: 0.118, leg: 0.45, shirt: "#457b9d", arms: ["down", "down"], backpack: true }),
    grad: person({ h: 150, hr: 0.118, leg: 0.45, shirt: "#1f2a44", sleeve: "#1f2a44", arms: ["down", "up"], gown: true, cap: true }),
    traveler: person({ h: 150, hr: 0.118, leg: 0.45, shirt: "#6c757d", arms: ["down", "side"], suitcase: true }),
    master: person({ h: 150, hr: 0.118, leg: 0.45, shirt: "#e76f51", arms: ["down", "hold"], backpack: true, laptop: true }),
    intern: person({ h: 150, hr: 0.118, leg: 0.45, shirt: "#5a7d9a", arms: ["down", "hold"], laptop: true, lanyard: "#e63946" }),
    apprentice: person({ h: 150, hr: 0.118, leg: 0.45, shirt: "#6a4c93", arms: ["down", "hold"], laptop: true, backpack: true, lanyard: "#e63946" }),
    laurea: person({ h: 150, hr: 0.118, leg: 0.45, shirt: "#2b2d42", arms: ["down", "up"], blazer: true, wreath: true, diploma: true }),
    engineer: person({ h: 150, hr: 0.118, leg: 0.45, shirt: "#264653", arms: ["down", "hold"], mug: true, lanyard: "#e63946" }),
  };

  function cloud(x, y, s) {
    return (
      '<g class="cloud" transform="translate(' +
      x +
      "," +
      y +
      ") scale(" +
      s +
      ')"><circle cx="0" cy="0" r="14"/><circle cx="16" cy="-7" r="17"/><circle cx="34" cy="0" r="13"/><rect x="0" y="-2" width="34" height="15" rx="7"/></g>'
    );
  }

  function chip(id, text, w) {
    var y = G - 150 - 46;
    return (
      '<g class="lv-k lv-pop chip" data-k="' +
      id +
      '"><rect x="' +
      (CX - w / 2) +
      '" y="' +
      y +
      '" width="' +
      w +
      '" height="26" rx="13"/><text x="' +
      CX +
      '" y="' +
      (y + 17.5) +
      '">' +
      text +
      "</text></g>"
    );
  }

  // ===========================================================================
  // Scene
  // ===========================================================================
  var ARC = "M130,232 Q450,30 770,232";

  function scene() {
    var s =
      '<svg class="lv-svg" viewBox="0 0 900 410" role="img" aria-label="Animated timeline of Parsa Majidi\'s life, from birth in 2000 to working as an embedded systems engineer">';
    s +=
      '<defs><linearGradient id="lvsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--lv-sky)"/><stop offset="1" stop-color="var(--lv-sky2)"/></linearGradient></defs>';
    s += '<rect width="900" height="410" fill="url(#lvsky)"/>';
    s += '<g class="lv-drift">' + cloud(90, 60, 1) + cloud(330, 40, 0.8) + cloud(640, 70, 1.1) + cloud(800, 35, 0.7) + "</g>";
    s += '<text class="lv-year" x="450" y="150">2000</text>';

    // Iran: Alborz range with Damavand, rolling green hills
    s +=
      '<g class="lv-k" data-k="iran">' +
      '<path fill="var(--lv-mtn2)" d="M0,250 L80,200 L150,225 L240,170 L330,215 L420,185 L520,220 L600,175 L700,118 L790,180 L860,160 L900,190 V300 H0Z"/>' +
      '<path fill="var(--lv-snow)" d="M700,118 L676,138 L688,135 L696,142 L706,134 L714,140 L724,136Z"/>' +
      '<path fill="var(--lv-mtn)" d="M0,270 L110,230 L200,255 L300,225 L420,260 L540,232 L660,262 L780,236 L900,258 V300 H0Z"/>' +
      '<path fill="var(--lv-hill)" d="M0,285 Q120,262 240,284 T480,282 T720,280 T900,282 V300 H0Z"/>' +
      '<rect y="300" width="900" height="34" fill="var(--lv-gr-ir)"/></g>';

    // Italy: Padova skyline (domes and towers of the basilica, a bell tower, porticoes)
    var dome = function (x, r, base) {
      return (
        '<rect x="' +
        (x - r) +
        '" y="' +
        (base - 18) +
        '" width="' +
        2 * r +
        '" height="18"/><path d="M' +
        (x - r) +
        "," +
        (base - 18) +
        " a" +
        r +
        "," +
        r * 1.15 +
        " 0 0 1 " +
        2 * r +
        ',0Z"/><rect x="' +
        (x - 1.5) +
        '" y="' +
        (base - 18 - r * 1.15 - 10) +
        '" width="3" height="10"/>'
      );
    };
    s +=
      '<g class="lv-k" data-k="italy">' +
      '<g fill="var(--lv-city2)"><rect x="0" y="262" width="900" height="38"/><rect x="40" y="240" width="70" height="40"/><rect x="150" y="248" width="60" height="40"/><rect x="380" y="236" width="18" height="60"/><path d="M380,236 l9,-16 l9,16z"/></g>' +
      '<g fill="var(--lv-city)">' +
      '<rect x="590" y="226" width="200" height="74"/>' +
      dome(620, 18, 226) +
      dome(660, 22, 226) +
      dome(705, 26, 226) +
      dome(752, 20, 226) +
      '<rect x="600" y="150" width="9" height="76"/><path d="M600,150 l4.5,-18 l4.5,18z"/><rect x="772" y="150" width="9" height="76"/><path d="M772,150 l4.5,-18 l4.5,18z"/>' +
      '<rect x="835" y="170" width="22" height="130"/><path d="M835,170 l11,-20 l11,20z"/></g>' +
      '<g fill="var(--lv-city2)">' +
      [0, 1, 2, 3, 4, 5, 6]
        .map(function (k) {
          return '<path d="M' + (590 + k * 28.5) + ',300 v-26 a14,14 0 0 1 28,0 v26z" opacity=".55"/>';
        })
        .join("") +
      "</g>" +
      '<rect y="300" width="900" height="34" fill="var(--lv-gr-it)"/></g>';

    // flight
    s +=
      '<g class="lv-k" data-k="flight"><rect y="300" width="900" height="34" fill="var(--lv-gr-it)" opacity=".5"/>' +
      cloud(200, 170, 1.3) +
      cloud(560, 120, 1.1) +
      cloud(690, 210, 1) +
      '<path class="arc" d="' +
      ARC +
      '"/>' +
      '<path class="pin" d="M130,232 m0,-26 a9,9 0 1 1 0.1,0 M121,206 L130,226 L139,206Z"/><text class="pint" x="130" y="250">Iran</text>' +
      '<path class="pin" d="M770,232 m0,-26 a9,9 0 1 1 0.1,0 M761,206 L770,226 L779,206Z"/><text class="pint" x="770" y="250">Italy</text>' +
      '<g class="lv-plane" opacity="0"><animateMotion id="lvfly" dur="3.4s" begin="indefinite" fill="freeze" rotate="auto" path="' +
      ARC +
      '" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .25 1"/>' +
      '<path d="M-22,0 L14,-4 Q24,0 14,4 Z" fill="#f4f4f4" stroke="#8a96a3" stroke-width="1.2"/><path d="M-2,-2 L-12,-18 L-6,-18 L8,-2Z M-2,2 L-12,18 L-6,18 L8,2Z M-20,-1 L-26,-10 L-21,-10 L-14,-1Z" fill="#c8d1da"/></g></g>';

    // set pieces
    s +=
      '<g class="lv-k lv-pop" data-k="school"><rect class="bldg" x="120" y="200" width="200" height="100" rx="3"/><path class="bldg2" d="M110,204 L220,150 L330,204Z"/>' +
      '<rect class="win" x="140" y="222" width="30" height="26" rx="2"/><rect class="win" x="270" y="222" width="30" height="26" rx="2"/><rect x="200" y="246" width="40" height="54" rx="3" class="bldg2"/>' +
      '<circle cx="220" cy="184" r="9" fill="#e8b931"/><text class="signt" x="220" y="218">SCHOOL</text></g>';

    var cols = "";
    for (var c = 0; c < 6; c++) cols += '<rect class="bldg2" x="' + (130 + c * 38) + '" y="208" width="12" height="80" rx="2"/>';
    s +=
      '<g class="lv-k lv-pop" data-k="umz"><rect class="bldg" x="110" y="200" width="230" height="90"/><path class="bldg" d="M100,202 L225,150 L350,202Z"/>' +
      cols +
      '<rect class="bldg2" x="100" y="288" width="250" height="12"/><rect class="sign" x="120" y="162" width="0" height="0"/>' +
      '<rect class="sign" x="130" y="304" width="190" height="22" rx="4"/><text class="signt" x="225" y="319">University of Mazandaran</text></g>';

    s +=
      '<g class="lv-k lv-pop" data-k="scope"><rect class="wood" x="560" y="252" width="150" height="8" rx="2"/><rect class="wood2" x="570" y="260" width="6" height="40"/><rect class="wood2" x="694" y="260" width="6" height="40"/>' +
      '<rect x="580" y="196" width="110" height="56" rx="5" fill="#4a5563"/><rect class="screen" x="587" y="203" width="70" height="42" rx="3"/>' +
      '<path class="sine" d="M590,224 q8,-14 16,0 t16,0 t16,0 t16,0"/><circle cx="672" cy="212" r="5" fill="#c8d1da"/><circle cx="672" cy="232" r="5" fill="#c8d1da"/></g>';

    s +=
      '<g class="lv-k lv-pop" data-k="blocks"><rect x="540" y="272" width="28" height="28" rx="3" fill="#e63946"/><rect x="570" y="272" width="28" height="28" rx="3" fill="#2a9d8f"/><rect x="555" y="244" width="28" height="28" rx="3" fill="#e8b931"/>' +
      '<text x="554" y="292" fill="#fff" font-size="17" font-weight="800" text-anchor="middle">0</text><text x="584" y="292" fill="#fff" font-size="17" font-weight="800" text-anchor="middle">1</text><text x="569" y="264" fill="#fff" font-size="17" font-weight="800" text-anchor="middle">1</text></g>';

    s +=
      '<g class="lv-k lv-pop" data-k="mobile"><path d="M450,20 V70 M400,70 H500" stroke="var(--lv-fg2)" stroke-width="1.5"/><path d="M400,70 v18 M450,70 v26 M500,70 v14" stroke="var(--lv-fg2)" stroke-width="1"/>' +
      '<path d="M400,88 l4,8 l9,1 l-7,6 l2,9 l-8,-5 l-8,5 l2,-9 l-7,-6 l9,-1z" fill="#e8b931"/><circle cx="450" cy="104" r="8" fill="#f19a8a"/><path d="M500,84 a9,9 0 1 0 6,15 a7,7 0 1 1 -6,-15z" fill="#8fb8d8"/>' +
      '<rect class="sign" x="560" y="170" width="150" height="30" rx="15"/><text class="signt" x="635" y="190" style="font-family:ui-monospace,Menlo,monospace">Hello, world!</text></g>';

    var arches = "";
    for (var a2 = 0; a2 < 6; a2++) arches += '<path class="bldg2" d="M' + (118 + a2 * 37) + ',300 v-34 a15,15 0 0 1 30,0 v34z"/>';
    s +=
      '<g class="lv-k lv-pop" data-k="unipd"><rect class="bldg" x="110" y="198" width="230" height="102"/><rect class="bldg" x="200" y="140" width="50" height="60"/><path class="bldg2" d="M196,142 h58 l-29,-22z"/>' +
      '<circle cx="225" cy="166" r="12" fill="var(--lv-bg)" stroke="var(--lv-bldg2)" stroke-width="2"/><path d="M225,166 v-8 M225,166 h6" stroke="var(--lv-ink)" stroke-width="1.6"/>' +
      '<rect class="win" x="125" y="212" width="20" height="26" rx="2"/><rect class="win" x="160" y="212" width="20" height="26" rx="2"/><rect class="win" x="270" y="212" width="20" height="26" rx="2"/><rect class="win" x="305" y="212" width="20" height="26" rx="2"/>' +
      arches +
      '<rect class="sign" x="135" y="304" width="180" height="22" rx="4"/><text class="signt" x="225" y="319">University of Padova</text></g>';

    s +=
      '<g class="lv-k lv-pop" data-k="books"><rect x="560" y="284" width="70" height="16" rx="2" fill="#264653"/><rect x="566" y="270" width="62" height="14" rx="2" fill="#e76f51"/><rect x="558" y="257" width="66" height="13" rx="2" fill="#e8b931"/>' +
      '<path d="M640,300 l20,-8 l20,8 v-22 l-20,-8 l-20,8z" fill="#fff" stroke="#c9ced6"/><path d="M660,292 v-22" stroke="#c9ced6"/></g>';

    // desk + things on it
    s +=
      '<g class="lv-k lv-pop" data-k="desk"><rect class="wood" x="535" y="246" width="260" height="9" rx="2"/><rect class="wood2" x="548" y="255" width="7" height="45"/><rect class="wood2" x="775" y="255" width="7" height="45"/></g>';
    s +=
      '<g class="lv-k lv-pop" data-k="laptopd"><path class="laptop2" d="M600,246 h90 l-6,-4 h-78z"/><rect class="laptop" x="610" y="196" width="70" height="46" rx="3"/><rect class="screen" x="614" y="200" width="62" height="38" rx="2"/>' +
      '<rect x="620" y="208" width="34" height="3" fill="#7ee787"/><rect x="620" y="215" width="44" height="3" fill="#8fb8d8"/><rect x="620" y="222" width="26" height="3" fill="#7ee787"/></g>';
    s +=
      '<g class="lv-k lv-pop" data-k="monitor"><rect x="645" y="230" width="12" height="16" fill="#5d6875"/><rect x="620" y="243" width="62" height="4" rx="2" fill="#5d6875"/>' +
      '<rect x="578" y="150" width="146" height="84" rx="5" fill="#4a5563"/><rect class="screen" x="584" y="156" width="134" height="72" rx="3"/>' +
      '<text class="term" x="590" y="170">U-Boot SPL 2025.04</text><text class="term" x="590" y="182">NOTICE:  BL31: v2.12</text><text class="term" x="590" y="194">=&gt; booti</text>' +
      '<text class="term" x="590" y="206">Starting kernel ...</text><text class="term" x="590" y="220">login:</text><rect class="cursor" x="622" y="213" width="5" height="9"/></g>';
    s +=
      '<g class="lv-k lv-pop" data-k="board"><rect x="732" y="232" width="52" height="14" rx="2" fill="#1f7a4d"/><rect x="751" y="235" width="14" height="8" fill="#222"/><circle cx="738" cy="239" r="2" fill="#e8b931"/><circle cx="778" cy="239" r="2" fill="#e63946"/></g>';
    s +=
      '<g class="lv-k lv-pop" data-k="pie"><circle cx="590" cy="150" r="16" class="pie2"/><path class="pie1" d="M590,150 V134 A16,16 0 0 1 590,166Z"/><text class="signt" x="590" y="184" style="font-size:11px;fill:var(--lv-fg2)">work · study</text></g>';

    s += chip("cIntern", "Intern", 92) + chip("cAppr", "Apprentice · part-time", 190) + chip("cFull", "Embedded Systems Engineer", 220);

    // character stages
    Object.keys(CHARS).forEach(function (k) {
      s += '<g class="lv-k lv-char" data-k="ch-' + k + '"><g transform="translate(' + CX + "," + G + ')">' + CHARS[k] + "</g></g>";
    });

    s += '<g class="lv-conf"></g>';

    // timeline
    s += '<rect y="334" width="900" height="76" fill="var(--lv-bg)"/>';
    s += '<line class="tl-line" x1="40" y1="360" x2="' + tlX(M.length - 1) + '" y2="360"/>';
    s += '<line class="tl-tail" x1="' + (tlX(M.length - 1) + 14) + '" y1="360" x2="872" y2="360"/>';
    s += '<text class="tl-soon" x="872" y="385" text-anchor="end">so far…</text>';
    s += '<line class="tl-prog" x1="40" y1="360" x2="40" y2="360"/>';
    M.forEach(function (m, i) {
      s +=
        '<g class="tl-dot" data-i="' +
        i +
        '" tabindex="0" role="button" aria-label="' +
        m.when +
        ": " +
        m.title.replace(/"/g, "") +
        '">' +
        '<circle cx="' +
        tlX(i) +
        '" cy="360" r="15" fill="transparent"/><circle class="d" cx="' +
        tlX(i) +
        '" cy="360" r="6.5"/>' +
        '<text x="' +
        tlX(i) +
        '" y="388">' +
        m.tick +
        "</text></g>";
    });
    return s + "</svg>";
  }

  function tlX(i) {
    return 40 + i * ((800 - 40) / (M.length - 1));
  }

  // ===========================================================================
  // Milestones
  // ===========================================================================
  function edu(part) {
    var list = R.education || [];
    for (var i = 0; i < list.length; i++) if ((list[i].institution || "").indexOf(part) >= 0) return list[i];
    return null;
  }
  function ul(items) {
    return items && items.length
      ? "<ul>" +
          items
            .map(function (x) {
              return "<li>" + x + "</li>";
            })
            .join("") +
          "</ul>"
      : "";
  }
  function eduMore(part) {
    var e = edu(part);
    return e ? ul(e.courses) : "";
  }
  function workMore() {
    var w = (R.work || [])[0];
    if (!w) return "";
    var s = ul(w.highlights);
    if (w.contributions && w.contributions.length)
      s += "<details><summary>Key projects and contributions</summary>" + ul(w.contributions) + "</details>";
    return s;
  }
  var PIN = '<i class="fa-solid fa-location-dot"></i>';

  var M = [
    { tick: "2000", when: "21 May 2000", year: "2000", title: "Hello, world!", sub: "Born in Iran", loc: "iran", show: ["ch-baby", "mobile"] },
    {
      tick: "early",
      when: "Early years",
      year: "2000s",
      title: "First steps",
      sub: "…and the first building blocks",
      loc: "iran",
      show: ["ch-toddler", "blocks"],
    },
    {
      tick: "school",
      when: "School years",
      year: "2010s",
      title: "School",
      sub: "Backpack on, learning the basics",
      loc: "iran",
      show: ["ch-kid", "school"],
    },
    {
      tick: "2018",
      when: "Oct 2018",
      year: "2018",
      title: "B.Sc. in Electrical Engineering",
      sub: PIN + "University of Mazandaran, Iran",
      loc: "iran",
      show: ["ch-student", "umz", "scope"],
      more: function () {
        return eduMore("Mazandaran");
      },
    },
    {
      tick: "Jun '22",
      when: "June 2022",
      year: "2022",
      title: "Graduated",
      sub: "B.Sc. in Electrical Engineering · University of Mazandaran",
      loc: "iran",
      show: ["ch-grad", "umz"],
      confetti: "multi",
      toss: true,
      more: function () {
        return eduMore("Mazandaran");
      },
    },
    {
      tick: "'22",
      when: "2022",
      year: "2022",
      title: "Moving to Italy",
      sub: "One suitcase, one flight, a new country",
      loc: "flight",
      show: ["ch-traveler"],
      fly: true,
      dur: 5200,
    },
    {
      tick: "Oct '22",
      when: "Oct 2022",
      year: "2022",
      title: "M.Sc. in ICT for Internet and Multimedia",
      sub: PIN + "University of Padova, Italy",
      loc: "italy",
      show: ["ch-master", "unipd", "books"],
      more: function () {
        return eduMore("Padova");
      },
    },
    {
      tick: "Sep '23",
      when: "Sep 2023",
      year: "2023",
      title: "Intern at Kynetics",
      sub: PIN + "Kynetics, Padova",
      loc: "italy",
      show: ["ch-intern", "desk", "laptopd", "cIntern"],
    },
    {
      tick: "Aug '24",
      when: "Aug 2024",
      year: "2024",
      title: "Apprentice at Kynetics",
      sub: "Part-time: working and studying at the same time",
      loc: "italy",
      show: ["ch-apprentice", "unipd", "desk", "laptopd", "cAppr", "pie"],
    },
    {
      tick: "Oct '25",
      when: "Oct 2025",
      year: "2025",
      title: "M.Sc. graduation",
      sub: "University of Padova · with the traditional laurel wreath",
      loc: "italy",
      show: ["ch-laurea", "unipd"],
      confetti: "it",
      dur: 5000,
      more: function () {
        return eduMore("Padova");
      },
    },
    {
      tick: "Nov '25",
      when: "Nov 2025 – now",
      year: "now",
      title: "Embedded Systems Engineer",
      sub: PIN + "Kynetics, Padova · full time",
      loc: "italy",
      show: ["ch-engineer", "desk", "monitor", "board", "cFull"],
      more: workMore,
    },
  ];

  // ===========================================================================
  // Player
  // ===========================================================================
  var ICON = {
    prev: '<svg viewBox="0 0 16 16"><path d="M3 2h2v12H3zM14 2v12L6 8z"/></svg>',
    next: '<svg viewBox="0 0 16 16"><path d="M11 2h2v12h-2zM2 2v12l8-6z"/></svg>',
    play: '<svg viewBox="0 0 16 16"><path d="M4 2v12l10-6z"/></svg>',
    pause: '<svg viewBox="0 0 16 16"><path d="M3 2h4v12H3zM9 2h4v12H9z"/></svg>',
    replay: '<svg viewBox="0 0 16 16"><path d="M8 2a6 6 0 1 1-6 6h2a4 4 0 1 0 1.2-2.8L7 7H2V2l1.8 1.8A6 6 0 0 1 8 2z"/></svg>',
  };

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  root.innerHTML =
    '<div class="lv-stage">' +
    scene() +
    "</div>" +
    '<div class="lv-info" aria-live="polite"><div class="lv-when"></div><div class="lv-body"><div class="lv-ttl"></div><div class="lv-sub"></div><div class="lv-more"></div></div></div>' +
    '<div class="lv-ctl"><button type="button" data-a="prev" aria-label="Previous milestone">' +
    ICON.prev +
    '</button><button type="button" data-a="play"></button><button type="button" data-a="next" aria-label="Next milestone">' +
    ICON.next +
    '</button><span class="lv-count"></span></div>';
  root.setAttribute("tabindex", "0");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Life timeline (arrow keys step through milestones)");
  if (REDUCE) root.classList.add("lv-nomotion");
  var fb = document.querySelectorAll(".lv-fallback");
  for (var f = 0; f < fb.length; f++) fb[f].style.display = "none";

  var svg = root.querySelector("svg"),
    keyed = svg.querySelectorAll("[data-k]"),
    yearEl = svg.querySelector(".lv-year"),
    conf = svg.querySelector(".lv-conf"),
    prog = svg.querySelector(".tl-prog"),
    dots = svg.querySelectorAll(".tl-dot"),
    plane = svg.querySelector(".lv-plane"),
    fly = svg.querySelector("#lvfly"),
    q = function (s) {
      return root.querySelector(s);
    },
    bPrev = q('[data-a="prev"]'),
    bPlay = q('[data-a="play"]'),
    bNext = q('[data-a="next"]');
  var cur = 0,
    playing = false,
    timer = null;

  function confetti(kind) {
    if (REDUCE) return;
    var cols = kind === "it" ? ["#2e9e4f", "#ffffff", "#d62828", "#e8b931"] : ["#e63946", "#e8b931", "#2a9d8f", "#457b9d", "#f4a261", "#b509ac"];
    var s = "";
    for (var i = 0; i < 46; i++) {
      var x = 120 + Math.random() * 660,
        d = 2.4 + Math.random() * 1.8,
        dl = Math.random() * 1.6;
      s +=
        '<rect x="' +
        n(x) +
        '" y="-10" width="' +
        n(5 + Math.random() * 4) +
        '" height="' +
        n(3 + Math.random() * 3) +
        '" fill="' +
        cols[i % cols.length] +
        '" stroke="rgba(0,0,0,.08)" style="animation-duration:' +
        n(d) +
        "s;animation-delay:" +
        n(dl) +
        's"/>';
    }
    conf.innerHTML = s;
  }

  function go(i, animate) {
    i = Math.max(0, Math.min(M.length - 1, i));
    cur = i;
    var m = M[i],
      on = {};
    m.show.concat([m.loc]).forEach(function (k) {
      on[k] = 1;
    });
    if (!animate) svg.classList.add("lv-instant");
    for (var k = 0; k < keyed.length; k++) keyed[k].classList.toggle("on", !!on[keyed[k].getAttribute("data-k")]);
    if (!animate) {
      svg.getBoundingClientRect();
      svg.classList.remove("lv-instant");
    }

    yearEl.textContent = m.year;
    yearEl.classList.remove("flash");
    svg.getBoundingClientRect();
    if (animate) yearEl.classList.add("flash");

    conf.innerHTML = "";
    if (m.confetti && animate) confetti(m.confetti);

    var toss = svg.querySelectorAll(".toss");
    for (var t = 0; t < toss.length; t++) {
      toss[t].classList.remove("go");
      if (m.toss && animate && !REDUCE) {
        toss[t].getBoundingClientRect();
        toss[t].classList.add("go");
      }
    }

    if (m.fly) {
      plane.setAttribute("opacity", "1");
      fly.setAttribute("dur", animate && !REDUCE ? "3.4s" : "0.001s");
      try {
        fly.beginElement();
      } catch (e) {
        plane.setAttribute("transform", "translate(770,232)");
      }
    } else plane.setAttribute("opacity", "0");

    prog.setAttribute("x2", tlX(i));
    for (var d = 0; d < dots.length; d++) {
      dots[d].classList.toggle("cur", d === i);
      dots[d].classList.toggle("done", d < i);
    }

    q(".lv-when").textContent = m.when;
    q(".lv-ttl").textContent = m.title;
    q(".lv-sub").innerHTML = m.sub;
    q(".lv-more").innerHTML = m.more ? m.more() : "";
    q(".lv-count").textContent = i + 1 + " / " + M.length;
    bPrev.disabled = i === 0;
    bNext.disabled = i === M.length - 1;
    sync();
  }

  function sync() {
    var last = cur === M.length - 1;
    bPlay.innerHTML = playing ? ICON.pause + "<span>Pause</span>" : last ? ICON.replay + "<span>Replay</span>" : ICON.play + "<span>Play</span>";
    bPlay.setAttribute("aria-label", playing ? "Pause" : last ? "Replay from the start" : "Play");
  }

  function schedule(wait) {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!playing) return;
      go(cur + 1, true);
      if (cur >= M.length - 1) stop();
      else schedule(M[cur].dur || 3900);
    }, wait);
  }
  function play() {
    if (cur === M.length - 1) go(0, false);
    playing = true;
    sync();
    schedule(cur === 0 ? 2600 : 900);
  }
  function stop() {
    playing = false;
    clearTimeout(timer);
    sync();
  }

  bPrev.addEventListener("click", function () {
    stop();
    go(cur - 1, true);
  });
  bNext.addEventListener("click", function () {
    stop();
    go(cur + 1, true);
  });
  bPlay.addEventListener("click", function () {
    playing ? stop() : play();
  });
  for (var d = 0; d < dots.length; d++) {
    (function (el) {
      var i = +el.getAttribute("data-i");
      el.addEventListener("click", function () {
        stop();
        go(i, true);
      });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          stop();
          go(i, true);
        }
      });
    })(dots[d]);
  }
  root.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") {
      stop();
      go(cur + 1, true);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      stop();
      go(cur - 1, true);
      e.preventDefault();
    }
  });

  var start = parseInt(root.getAttribute("data-frame"), 10);
  if (start > 0) {
    go(start - 1, true);
  } else if (REDUCE) {
    go(M.length - 1, false);
  } else {
    go(0, false);
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (en) {
          if (en[0].isIntersecting) {
            io.disconnect();
            play();
          }
        },
        { threshold: 0.4 }
      );
      io.observe(root);
    } else play();
  }
})();
