// Animated figures for the i.MX95 boot series.
//
// Usage in a post:
//   <div class="bootviz" data-viz="poweron"></div>
//   <script src="/assets/js/boot-viz.js" defer></script>
//
// Optional attributes: data-frame="N" opens at step N (1-based, no autoplay),
// data-tab="sd|emmc|fspi|usb" picks the starting tab of a tabbed figure.
//
// The script is self-contained: it injects its own CSS, uses the site's theme
// variables when they exist, and falls back to plain light/dark tokens
// otherwise. With prefers-reduced-motion it shows a static, numbered diagram
// first and lets the reader step through it without motion.
//
// Visual language, shared by every figure in the series:
//   cores    = rounded boxes, solid tint   M33 orange, A55 blue, M7 violet, ELE magenta
//   memories = square boxes, light tint    ROM grey (hatched), TCM/OCRAM teal, DDR ochre, flash olive
//   a block sliding between boxes = an image being copied (coloured by its target core)
//   green check badge = signature/header verified, red cross = failed
(function () {
  "use strict";

  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var uidN = 0;

  // ===========================================================================
  // CSS
  // ===========================================================================
  var TOK_LIGHT =
    "--bv-m33:#e8590c;--bv-a55:#1971c2;--bv-m7:#7048e8;--bv-ele:#c2255c;" +
    "--bv-rom:#868e96;--bv-sram:#0c8599;--bv-ddr:#b88a00;--bv-flash:#5c940d;" +
    "--bv-ok:#10b981;--bv-bad:#ef4444;--bv-on-c:#ffffff;";
  var TOK_DARK =
    "--bv-m33:#ff8a4c;--bv-a55:#4dabf7;--bv-m7:#9775fa;--bv-ele:#f06595;" +
    "--bv-rom:#adb5bd;--bv-sram:#3bc9db;--bv-ddr:#fcc419;--bv-flash:#94d82d;" +
    "--bv-ok:#34d399;--bv-bad:#f87171;--bv-on-c:#10131a;";
  var TOK_BASE =
    "--bv-fg:var(--global-text-color,#1f2328);--bv-fg2:var(--global-text-color-light,#5f6b7a);" +
    "--bv-bg:var(--global-bg-color,#ffffff);--bv-line:var(--surface-border,#d0d7de);" +
    "--bv-acc:var(--global-theme-color,#1971c2);";

  // Rules for the SVG itself. Also embedded in the exported static SVG files.
  var CSS_SVG = [
    ".bv-svg{" + TOK_LIGHT + TOK_BASE + "display:block;width:100%;height:auto;overflow:visible;font-size:12px}",
    'html[data-theme="dark"] .bv-svg{' + TOK_DARK + "}",
    ".bv-svg text{fill:var(--bv-fg)}",
    ".bv-svg .board{fill:none;stroke:var(--bv-line);stroke-width:1.5;stroke-dasharray:6 5}",
    ".bv-svg .tl-box{fill:none;stroke:var(--bv-line);stroke-width:1.2}",
    ".bv-svg .lbl{fill:var(--bv-fg2);font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;font-weight:650}",
    ".bv-svg .note{fill:var(--bv-fg2);font-size:10.5px}",
    ".bv-svg .note tspan.code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
    ".bv-soc .soc-box{fill:color-mix(in srgb,var(--bv-fg) 3%,var(--bv-bg));stroke:var(--bv-line);stroke-width:1.5;transition:stroke .5s}",
    ".bv-soc[data-s~=pw] .soc-box{stroke:var(--bv-fg2)}",

    // blocks
    ".bv-blk .box{fill:var(--bv-bg);stroke:var(--bv-line);stroke-width:1.4;transition:fill .45s,stroke .45s,stroke-width .45s}",
    ".bv-blk .t{font-size:12.5px;font-weight:650;text-anchor:middle;fill:var(--bv-fg2);transition:fill .45s}",
    ".bv-blk .s{font-size:10.5px;text-anchor:middle;fill:var(--bv-fg2)}",
    ".bv-blk .s.v1,.bv-blk .s.v2{display:none;fill:var(--c);font-weight:650}",
    ".bv-blk[data-s~=v1] .s.v0,.bv-blk[data-s~=v2] .s.v0,.bv-blk[data-s~=v2] .s.v1{display:none}",
    ".bv-blk[data-s~=v1] .s.v1,.bv-blk[data-s~=v2] .s.v2{display:inline}",
    ".bv-blk[data-s~=pw] .box{stroke:color-mix(in srgb,var(--c) 55%,var(--bv-line))}",
    ".bv-blk[data-s~=pw] .t,.bv-blk[data-s~=on] .t{fill:var(--bv-fg)}",
    ".bv-blk[data-s~=on] .box{fill:color-mix(in srgb,var(--c) 14%,var(--bv-bg));stroke:var(--c);stroke-width:2.2}",
    ".bv-blk.k-core[data-s~=on] .box{fill:color-mix(in srgb,var(--c) 24%,var(--bv-bg))}",
    ".bv-blk[data-s~=dim]{opacity:.4}",
    ".bv-blk[data-s~=glow] .box{animation:bv-glow 1.8s ease-in-out infinite}",
    "@keyframes bv-glow{0%,100%{filter:drop-shadow(0 0 7px color-mix(in srgb,var(--c) 75%,transparent))}50%{filter:drop-shadow(0 0 2px color-mix(in srgb,var(--c) 40%,transparent))}}",
    ".bv-blk .hatch{opacity:0;pointer-events:none;transition:opacity .45s}",
    ".bv-blk.k-rom .hatch{opacity:.3}",
    ".bv-blk[data-s~=lock] .hatch{opacity:.5}",
    ".bv-hl{stroke:var(--bv-fg2);stroke-width:1.1}",
    ".bv-blk .lock{opacity:0;transition:opacity .45s}",
    ".bv-blk[data-s~=lock] .lock{opacity:1}",
    ".bv-blk[data-s~=pulse] .lock{animation:bv-blink .7s ease-in-out 4}",
    "@keyframes bv-blink{50%{opacity:.15}}",
    ".bv-blk .lock path{fill:none;stroke:var(--bv-fg);stroke-width:1.6}",
    ".bv-blk .lock rect{fill:var(--bv-bg);stroke:var(--bv-fg);stroke-width:1.6}",
    ".bv-blk .mini{fill:none;stroke:var(--c);stroke-opacity:.3;stroke-width:1.2;transition:stroke-opacity .45s}",
    ".bv-blk[data-s~=pw] .mini,.bv-blk[data-s~=on] .mini{stroke-opacity:.75}",
    ".bv-blk .sine{fill:none;stroke:var(--bv-line);stroke-width:1.6;transition:stroke .45s}",
    ".bv-blk[data-s~=on] .sine{stroke:var(--c);stroke-dasharray:6 3;animation:bv-dash .6s linear infinite}",
    ".bv-blk .slot{fill:var(--bv-bg);stroke:var(--bv-fg2);stroke-width:1.1}",
    ".bv-blk .knob{fill:var(--bv-fg2);transition:fill .45s}",
    ".bv-blk[data-s~=on] .knob{fill:var(--c)}",
    ".bv-blk.k-chip .t{font-size:10.5px}",
    ".bv-blk.k-chip .box{stroke-dasharray:3 3}",
    ".bv-blk.k-chip[data-s~=on] .box{stroke-dasharray:none;stroke-width:1.6}",

    // wires and flows
    ".bv-wire{--c:var(--bv-fg);fill:none;stroke:var(--bv-line);stroke-width:1.6;stroke-dasharray:4 4;transition:stroke .45s,stroke-width .45s}",
    ".bv-wire[data-s~=on]{stroke:var(--c);stroke-dasharray:none;stroke-width:2.2}",
    ".bv-wire[data-s~=ok]{stroke:var(--bv-ok);stroke-dasharray:none;stroke-width:2.4}",
    ".bv-wire[data-s~=bad]{stroke:var(--bv-bad);stroke-dasharray:6 4;stroke-width:2.4}",
    ".bv-wl{font-size:9.5px;font-weight:650;fill:var(--bv-fg2)}",
    ".bv-flow{fill:none;stroke:var(--c);stroke-width:2.2;stroke-dasharray:3 7;stroke-linecap:round;opacity:0;transition:opacity .45s}",
    ".bv-flow[data-s~=on]{opacity:1;animation:bv-dash .8s linear infinite}",
    "@keyframes bv-dash{to{stroke-dashoffset:-20}}",

    // tags (text that fades in)
    ".bv-tag{opacity:0;transition:opacity .45s}",
    ".bv-tag[data-s~=on]{opacity:1}",
    ".bv-tag text{font-size:10.5px;fill:var(--bv-fg2)}",
    ".bv-tag text.em{fill:var(--c);font-weight:650}",
    ".bv-seg{stroke:var(--bv-line);stroke-width:1}",
    ".bv-seg.meta{fill:color-mix(in srgb,var(--bv-fg) 9%,var(--bv-bg))}",
    ".bv-seg.boot{fill:color-mix(in srgb,var(--bv-flash) 40%,var(--bv-bg));stroke:var(--bv-flash);stroke-width:1.4}",
    ".bv-seg.part{fill:color-mix(in srgb,var(--bv-flash) 12%,var(--bv-bg))}",
    ".bv-seg.free{fill:none;stroke-dasharray:3 3}",
    ".bv-segt{font-size:10.5px;text-anchor:middle}",
    ".bv-strip{opacity:.35;transition:opacity .45s}",
    ".bv-strip[data-s~=on]{opacity:1}",

    // power-up timeline
    ".bv-tr .base{fill:none;stroke:var(--bv-line);stroke-width:1.1;stroke-dasharray:3 3}",
    ".bv-tr .ramp{fill:none;stroke:var(--c);stroke-width:2;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset 1.2s ease-in-out}",
    ".bv-tr[data-s~=on] .ramp{stroke-dashoffset:0}",
    ".bv-tr .tl{font-size:10px;fill:var(--bv-fg2);transition:fill .45s}",
    ".bv-tr[data-s~=on] .tl{fill:var(--bv-fg)}",
    ".bv-tr .mark{stroke:var(--c);stroke-width:1;stroke-dasharray:2 3;opacity:0;transition:opacity .45s .9s}",
    ".bv-tr .mt{font-size:10px;fill:var(--c);font-weight:650;opacity:0;transition:opacity .45s .9s}",
    ".bv-tr[data-s~=on] .mark,.bv-tr[data-s~=on] .mt{opacity:1}",

    // moving image blocks
    ".bv-mv{opacity:0;transition:opacity .3s}",
    ".bv-mv[data-s~=show]{opacity:1}",
    ".bv-mv rect{fill:var(--c);filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))}",
    ".bv-mv text{fill:var(--bv-on-c);font-size:10px;font-weight:700;text-anchor:middle}",

    // badges
    ".bv-badge{opacity:0;transform:scale(.3);transform-box:fill-box;transform-origin:center;transition:opacity .3s,transform .45s cubic-bezier(.3,1.6,.5,1)}",
    ".bv-badge[data-s~=on]{opacity:1;transform:scale(1)}",
    ".bv-badge circle{fill:var(--c);stroke:var(--bv-bg);stroke-width:2}",
    ".bv-badge path{fill:none;stroke:var(--bv-on-c);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}",

    // host terminal
    ".bv-term .box{fill:#1f2328;stroke:var(--bv-line)}",
    ".bv-term text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;fill:#e6edf3}",
    ".bv-term text.p{fill:#7ee787}",
    ".bv-term{opacity:.3;transition:opacity .45s}",
    ".bv-term[data-s~=on]{opacity:1}",

    // numbered pins (static version)
    ".bv-pin circle{fill:var(--bv-acc);stroke:var(--bv-bg);stroke-width:2}",
    ".bv-pin text{fill:#fff;font-size:10.5px;font-weight:700;text-anchor:middle}",
    ".bv-caps text{font-size:11.5px;fill:var(--bv-fg)}",
    ".bv-caps text.n{font-weight:700;fill:var(--bv-acc)}",

    // colour classes (last, so they override defaults above)
    ".c-m33{--c:var(--bv-m33)}.c-a55{--c:var(--bv-a55)}.c-m7{--c:var(--bv-m7)}.c-ele{--c:var(--bv-ele)}",
    ".c-rom{--c:var(--bv-rom)}.c-sram{--c:var(--bv-sram)}.c-ddr{--c:var(--bv-ddr)}.c-flash{--c:var(--bv-flash)}",
    ".c-ok{--c:var(--bv-ok)}.c-bad{--c:var(--bv-bad)}.c-pwr{--c:var(--bv-fg)}.c-acc{--c:var(--bv-acc)}",

    ".bv-instant *,.bv-instant{transition:none!important}",
  ].join("\n");

  // Extra rules for the exported standalone SVG files (no site CSS around them).
  var CSS_STANDALONE = [
    ".bv-svg.bv-standalone{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    "@media (prefers-color-scheme:dark){.bv-svg.bv-standalone{" +
      TOK_DARK +
      "--bv-fg:#e6edf3;--bv-fg2:#9ba7b4;--bv-bg:#16181d;--bv-line:#3a414b;--bv-acc:#4dabf7}}",
    ".bv-standalone *{animation:none!important;transition:none!important}",
    ".bv-standalone .bv-bgrect{fill:var(--bv-bg)}",
  ].join("\n");

  // Rules for the figure chrome around the SVG (controls, caption, legend).
  var CSS_UI = [
    ".bootviz{" +
      TOK_LIGHT +
      TOK_BASE +
      "position:relative;margin:2rem 0;padding:1.1rem 1.25rem 1rem;border:1px solid var(--bv-line);border-radius:14px;background:var(--global-card-bg-color,var(--bv-bg));color:var(--bv-fg);font-size:.9rem}",
    'html[data-theme="dark"] .bootviz{' + TOK_DARK + "}",
    "@media (max-width:576px){.bootviz{padding:.9rem .8rem}}",
    ".bootviz:focus-visible{outline:2px solid var(--bv-acc);outline-offset:2px}",
    ".bv-kicker{font-size:.7rem;font-weight:650;letter-spacing:.12em;text-transform:uppercase;color:var(--bv-acc)}",
    ".bv-title{font-weight:700;font-size:1.02rem;margin:.1rem 0 .8rem}",
    ".bv-stage{overflow-x:auto;-webkit-overflow-scrolling:touch}",
    ".bv-stage .bv-svg{min-width:580px}",
    ".bv-cap{min-height:3.4em;margin:.8rem 0 .7rem;padding:.6rem .85rem;border-left:3px solid var(--bv-acc);border-radius:0 8px 8px 0;background:color-mix(in srgb,var(--bv-acc) 7%,transparent);line-height:1.45}",
    ".bv-cap b{color:var(--bv-acc);margin-right:.4em}",
    ".bv-ctl{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}",
    ".bootviz button{font:inherit;font-size:.82rem;font-weight:500;line-height:1.2;color:var(--bv-fg);background:var(--bv-bg);border:1px solid var(--bv-line);border-radius:999px;padding:.34rem .8rem;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;transition:border-color .2s,background .2s,color .2s}",
    ".bootviz button:hover{border-color:var(--bv-acc)}",
    ".bootviz button:disabled{opacity:.4;cursor:default;border-color:var(--bv-line)}",
    ".bootviz button.active{background:var(--bv-acc);border-color:var(--bv-acc);color:#fff}",
    ".bootviz button svg{width:13px;height:13px;fill:currentColor}",
    ".bv-dots{display:flex;gap:4px;flex:1 1 140px;margin:0 .35rem}",
    ".bootviz .bv-dots button{flex:1;height:7px;min-width:6px;padding:0;border:0;border-radius:4px;background:var(--bv-line)}",
    ".bootviz .bv-dots button.done{background:color-mix(in srgb,var(--bv-acc) 45%,var(--bv-line))}",
    ".bootviz .bv-dots button.cur{background:var(--bv-acc)}",
    ".bv-count{font-size:.8rem;color:var(--bv-fg2);font-variant-numeric:tabular-nums;min-width:3.2em;text-align:right}",
    ".bv-tabs{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin-bottom:.8rem}",
    ".bv-tabs span{font-size:.78rem;color:var(--bv-fg2);margin-right:.2rem}",
    ".bv-legend{display:flex;flex-wrap:wrap;gap:.3rem 1rem;margin-top:.85rem;font-size:.75rem;color:var(--bv-fg2)}",
    ".bv-legend i{display:inline-block;width:.8rem;height:.8rem;margin-right:.35rem;vertical-align:-.12em;box-sizing:border-box}",
    ".bv-legend .core i{border-radius:50%;background:var(--sw)}",
    ".bv-legend .mem i{border-radius:2px;border:2px solid var(--sw);background:color-mix(in srgb,var(--sw) 18%,transparent)}",
    ".bv-legend .img i{border-radius:2px;background:var(--bv-ele);width:1.1rem;height:.6rem;vertical-align:.05em}",
    ".bv-legend .ok i{border-radius:50%;background:var(--bv-ok)}",
    ".bv-list{margin:.8rem 0 .5rem;padding-left:1.5rem;line-height:1.45}",
    ".bv-list li{margin:.3rem 0}",
    ".bv-list li::marker{color:var(--bv-acc);font-weight:700}",
    ".bv-nomotion *{transition:none!important;animation:none!important}",
  ].join("\n");

  function injectCSS() {
    if (document.getElementById("bootviz-css")) return;
    var s = document.createElement("style");
    s.id = "bootviz-css";
    s.textContent = CSS_SVG + "\n" + CSS_UI;
    document.head.appendChild(s);
  }

  // ===========================================================================
  // SVG helpers
  // ===========================================================================
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function svgOpen(u, w, h, label) {
    return (
      '<svg class="bv-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      w +
      " " +
      h +
      '" role="img" aria-label="' +
      esc(label) +
      '">' +
      "<defs>" +
      '<pattern id="' +
      u +
      '-h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="bv-hl" x1="0" y1="0" x2="0" y2="7"/></pattern>' +
      '<marker id="' +
      u +
      '-a" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker>' +
      "</defs>"
    );
  }

  function lockIcon(x, y) {
    return (
      '<g class="lock"><path d="M' +
      (x + 3) +
      "," +
      (y + 6) +
      ' v-2.5 a3.5,3.5 0 0 1 7,0 v2.5"/>' +
      '<rect x="' +
      x +
      '" y="' +
      (y + 6) +
      '" width="13" height="9" rx="2"/></g>'
    );
  }

  // A labelled block. cls carries the kind (k-core / k-mem / k-rom) and colour (c-*).
  // subs: sub-labels; index 0 is shown by default, 1 and 2 with state v1 / v2.
  function blk(id, x, y, w, h, cls, title, subs, o) {
    o = o || {};
    subs = subs ? [].concat(subs) : [];
    var cx = x + w / 2;
    var r = o.r !== undefined ? o.r : /k-core/.test(cls) ? 9 : 3;
    var ty = o.ty !== undefined ? y + o.ty : subs.length ? y + h / 2 - 2 : y + h / 2 + 4.5;
    var s = '<g class="bv-blk ' + cls + '"' + (id ? ' data-id="' + id + '"' : "") + ">";
    s += o.shape || '<rect class="box" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '"/>';
    if (o.hatch)
      s += '<rect class="hatch" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="url(#' + o.hatch + ')"/>';
    if (o.lock) s += lockIcon(x + w - 19, y + 5);
    s += o.extra || "";
    s += '<text class="t" x="' + cx + '" y="' + ty + '">' + esc(title) + "</text>";
    subs.forEach(function (t, k) {
      s += '<text class="s v' + k + '" x="' + cx + '" y="' + (ty + 14) + '">' + esc(t) + "</text>";
    });
    return s + "</g>";
  }

  function diamond(id, cx, cy, hw, hh, cls, title, subs) {
    var pts = cx + "," + (cy - hh) + " " + (cx + hw) + "," + cy + " " + cx + "," + (cy + hh) + " " + (cx - hw) + "," + cy;
    return blk(id, cx - hw, cy - hh, hw * 2, hh * 2, cls, title, subs, { shape: '<polygon class="box" points="' + pts + '"/>' });
  }

  function wire(id, d, cls, u) {
    return (
      '<path class="bv-wire ' +
      (cls || "") +
      '"' +
      (id ? ' data-id="' + id + '"' : "") +
      ' d="' +
      d +
      '"' +
      (u ? ' marker-end="url(#' + u + '-a)"' : "") +
      "/>"
    );
  }

  function wl(x, y, t, anchor) {
    return '<text class="bv-wl" x="' + x + '" y="' + y + '"' + (anchor ? ' text-anchor="' + anchor + '"' : "") + ">" + esc(t) + "</text>";
  }

  function mover(id, x, y, w, h, cls, label) {
    return (
      '<g class="bv-mv ' +
      cls +
      '" data-id="' +
      id +
      '"><rect x="' +
      x +
      '" y="' +
      y +
      '" width="' +
      w +
      '" height="' +
      h +
      '" rx="4"/>' +
      '<text x="' +
      (x + w / 2) +
      '" y="' +
      (y + h / 2 + 3.6) +
      '">' +
      esc(label) +
      "</text></g>"
    );
  }

  function badge(id, cx, cy, ok) {
    var p = ok
      ? "M" + (cx - 4.2) + "," + cy + " l3,3 l5.6,-6"
      : "M" + (cx - 3.5) + "," + (cy - 3.5) + " l7,7 M" + (cx + 3.5) + "," + (cy - 3.5) + " l-7,7";
    return (
      '<g class="bv-badge ' +
      (ok ? "c-ok" : "c-bad") +
      '" data-id="' +
      id +
      '"><circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="9.5"/><path d="' +
      p +
      '"/></g>'
    );
  }

  // ===========================================================================
  // Figure 1: power-on to the first instruction
  // ===========================================================================
  var TL_X0 = 140,
    TL_X1 = 770;

  function trace(id, label, y, t, cls, step, mark) {
    var x0 = TL_X0 + t * (TL_X1 - TL_X0);
    var d = "M" + TL_X0 + "," + y + " H" + x0 + " L" + (x0 + (step ? 0 : 18)) + "," + (y - 9) + " H" + TL_X1;
    var s = '<g class="bv-tr ' + cls + '" data-id="' + id + '">';
    s += '<text class="tl" x="22" y="' + (y - 1) + '">' + esc(label) + "</text>";
    s += '<path class="base" d="M' + TL_X0 + "," + y + " H" + TL_X1 + '"/>';
    s += '<path class="ramp" pathLength="1" d="' + d + '"/>';
    if (mark) {
      s += '<line class="mark" x1="' + x0 + '" y1="472" x2="' + x0 + '" y2="' + (y + 4) + '"/>';
      s += '<text class="mt" x="' + (x0 + 6) + '" y="' + (y - 13) + '">' + esc(mark) + "</text>";
    }
    return s + "</g>";
  }

  function svgPowerOn(u) {
    var H = u + "-h";
    var s = svgOpen(u, 800, 600, "Power-on sequence of an i.MX95 board, from the PMIC to the BootROM reading the first container");

    // board
    s += '<rect class="board" x="8" y="8" width="784" height="424" rx="14"/>';
    s += '<text class="lbl" x="22" y="28">i.MX95 board (simplified)</text>';

    // input + PMIC
    s += wire("wVin", "M75,76 V100", "c-pwr");
    s += blk("vin", 30, 48, 90, 28, "c-pwr", "VIN");
    s += blk("pmic", 30, 100, 140, 110, "c-pwr", "PMIC", ["power sequencer"], { ty: 24 });
    s += blk("otp", 42, 150, 116, 46, "c-acc k-chip", "OTP", ["rail order · V · delays"], { ty: 17 });

    // SoC rails, POR_B, boot pins, clock
    [
      ["rs1", 122, "SOC"],
      ["rs2", 140, "ARM"],
      ["rs3", 158, "1V8"],
    ].forEach(function (r) {
      s += wire(r[0], "M170," + r[1] + " H230", "c-pwr");
      s += wl(200, r[1] - 3, r[2], "middle");
    });
    s += wire("wPor", "M170,196 H230", "c-acc");
    s += wl(200, 192, "POR_B", "middle");
    s += wire("wStrap", "M170,297 H230", "c-acc");
    s += wl(200, 293, "pins", "middle");
    s += wire("wXtal", "M170,385 H230", "c-acc");
    s += wl(200, 381, "24M", "middle");

    // LPDDR5 rails, routed over the top
    s += wire("rd1", "M140,100 V40 H700 V75", "c-ddr");
    s += wire("rd2", "M150,100 V46 H710 V75", "c-ddr");
    s += wire("rd3", "M160,100 V52 H720 V75", "c-ddr");
    s += wl(590, 35, "VDD1 · VDD2H · VDDQ", "middle");

    // boot-mode switch (knob pattern is illustrative, not an encoding)
    var sw = "";
    [1, 0, 1, 1].forEach(function (up, k) {
      var x = 53 + k * 26;
      sw += '<rect class="slot" x="' + x + '" y="281" width="16" height="28" rx="3"/>';
      sw += '<rect class="knob" x="' + (x + 2) + '" y="' + (up ? 283 : 296) + '" width="12" height="11" rx="2"/>';
    });
    s += blk("bsw", 30, 255, 140, 85, "c-acc", "BOOT_MODE", null, { ty: 19, extra: sw });
    s += '<g class="bv-tag c-acc" data-id="mode"><text class="em" x="100" y="330" text-anchor="middle">→ SD card</text></g>';

    // crystal
    s += blk("xtal", 30, 360, 140, 50, "c-acc", "24 MHz XTAL", null, {
      ty: 19,
      extra: '<path class="sine" d="M52,395 q8,-9 16,0 t16,0 t16,0 t16,0 t16,0 t16,0"/>',
    });

    // SoC
    s += '<g class="bv-soc" data-id="soc"><rect class="soc-box" x="230" y="60" width="370" height="360" rx="12"/>';
    s += '<text class="lbl" x="585" y="80" text-anchor="end">i.MX95 SoC</text></g>';

    s += blk("rom", 245, 92, 105, 50, "k-mem k-rom c-rom", "BootROM", ["mask ROM"], { hatch: H });
    s += blk("m33", 365, 92, 105, 50, "k-core c-m33", "Cortex-M33", ["boot core", "▶ running ROM"]);
    s += blk("tcm", 485, 92, 100, 50, "k-mem c-sram", "OCRAM", ["on-chip RAM"]);
    s += blk("ele", 245, 160, 105, 55, "k-core c-ele", "ELE", ["Secure Enclave", "running ELE ROM", "firmware running"]);
    s += blk("ocram", 365, 160, 220, 55, "k-mem c-sram", "M33 TCM", ["tightly coupled RAM", "ROM stack · data · images"]);
    s += blk("fuses", 245, 235, 105, 42, "k-mem c-rom", "Fuses", ["OCOTP"]);
    s += blk("usb", 365, 235, 105, 42, "c-acc", "USB", ["not used here"]);
    s += blk("usdhc", 485, 235, 100, 42, "c-flash", "uSDHC", ["SD/eMMC ctrl"]);
    var minis = "";
    for (var k = 0; k < 6; k++) minis += '<rect class="mini" x="' + (259.5 + k * 34) + '" y="327" width="26" height="16" rx="4"/>';
    s += blk("a55", 245, 297, 225, 55, "k-core c-a55", "Cortex-A55 cluster", null, { ty: 19, extra: minis });
    s += blk("ddrc", 485, 297, 100, 55, "c-ddr", "DDR ctrl", ["+ PHY"]);
    s += blk("m7", 245, 370, 105, 38, "k-core c-m7", "Cortex-M7");
    s += '<g class="bv-tag" data-id="rst"><text x="362" y="393">◂ A55 cluster and M7 held in reset</text></g>';

    // instruction fetch: ROM -> M33
    s += '<path class="bv-flow c-m33" data-id="fetch" d="M297,92 C297,68 417,68 417,92"/>';

    // external memories
    s += wire("wDdr", "M585,324 H612 V112 H640", "c-ddr");
    s += wire("wSd", "M585,248 H640", "c-flash");
    s += wire("wEmmc", "M585,266 H624 V347 H640", "c-flash");
    s += blk("lpddr", 640, 75, 130, 75, "k-mem c-ddr", "LPDDR5", ["external DRAM", "powered · untrained"], { hatch: H, lock: true });
    s += blk("sd", 640, 200, 130, 80, "k-mem c-flash", "microSD", ["boot device"], { ty: 18 });
    s +=
      '<g class="bv-tag c-flash" data-id="sdOff">' +
      '<rect class="bv-seg meta" x="650" y="240" width="40" height="16"/>' +
      '<rect class="bv-seg boot" x="690" y="240" width="70" height="16"/>' +
      '<text class="bv-segt" x="670" y="252" style="font-size:9px">0–32K</text>' +
      '<line x1="690" y1="256" x2="690" y2="262" stroke="currentColor" style="stroke:var(--bv-fg2)"/>' +
      '<text class="em" x="690" y="274" text-anchor="middle">32 KiB</text></g>';
    s += blk("emmc", 640, 320, 130, 55, "k-mem c-flash", "eMMC", ["not selected"]);

    // moving blocks
    s += mover("hdr", 690, 240, 70, 16, "c-ele", "hdr #1");
    s += mover("elefw", 690, 240, 70, 16, "c-ele", "ELE FW");
    s += badge("eleOk", 341, 160, true);

    // timeline
    s += '<rect class="tl-box" x="8" y="444" width="784" height="150" rx="12"/>';
    s += '<text class="lbl" x="22" y="464">Power-up timeline · order simplified from the i.MX 95 datasheet, not to scale</text>';
    s += trace("tSoc", "VDD_SOC", 488, 0.06, "c-pwr");
    s += trace("tArm", "VDD_ARM", 503, 0.16, "c-pwr");
    s += trace("t1v8", "1.8 V supplies", 518, 0.26, "c-pwr");
    s += trace("tV1", "LPDDR5 VDD1 1.8 V", 533, 0.38, "c-ddr");
    s += trace("tV2", "LPDDR5 VDD2H 1.05 V", 548, 0.48, "c-ddr");
    s += trace("tVq", "LPDDR5 VDDQ 0.5 V", 563, 0.58, "c-ddr");
    s += trace("tPor", "POR_B", 582, 0.78, "c-acc", true, "reset released");

    return s + "</svg>";
  }

  function framesPowerOn() {
    return [
      { cap: "Board unpowered. Every rail is at 0 V and nothing on the SoC is running.", s: {} },
      {
        cap: "Input power reaches the PMIC. Its one-time-programmable memory (OTP) holds the rail order, the voltages and the delays between rails.",
        s: { vin: "on", wVin: "on", pmic: "on", otp: "on" },
        pin: [30, 102],
      },
      {
        cap: "The PMIC brings up the SoC rails in the order its OTP sets. The datasheet sequence: NVCC_BBSM_1P8 first, then VDD_SOC, VDD_ARM (with or after VDD_SOC), the 0.8 V analog and PHY supplies, and the 1.8 V supplies. Some steps may overlap.",
        s: { rs1: "on", rs2: "on", rs3: "on", tSoc: "on", t1v8: "on", tArm: "on", soc: "pw" },
        delay: { rs2: 0.4, tArm: 0.4, rs3: 0.8, t1v8: 0.8 },
        pin: [214, 104],
        dur: 4400,
      },
      {
        cap: "Then the DRAM rails, with VDDQ after VDD2H. The SoC has no VDD2H/VDDQ ordering requirement of its own; the DRAM part does. The DRAM has power from now on, but nothing can use it until it has been trained (part 3).",
        s: { rd1: "on", rd2: "on", rd3: "on", tV1: "on", tV2: "on", tVq: "on", lpddr: "pw lock v1" },
        delay: { rd2: 0.4, tV2: 0.4, rd3: 0.8, tVq: 0.8 },
        pin: [628, 63],
        dur: 5000,
      },
      {
        cap: "The 24 MHz crystal oscillator starts and settles. The SoC's clocks are derived from it.",
        s: { xtal: "on", wXtal: "on" },
        pin: [173, 364],
      },
      {
        cap: "With every rail in regulation, the PMIC releases POR_B, the last step of the datasheet sequence. The SoC leaves reset; the hardware samples the BOOT_MODE pins before the ROM starts and holds the value in a register.",
        s: { wPor: "on", tPor: "on" },
        pin: [184, 212],
        dur: 4200,
      },
      {
        cap: "The BootROM starts executing on the Cortex-M33, not on the A55: NXP calls this Low Power Boot, with only the M33 running after POR. The ELE runs its own ROM. The A55 cluster and the M7 stay in reset.",
        s: { rom: "on", m33: "on glow v1", fetch: "on", ele: "pw v1", a55: "pw", m7: "pw", tcm: "pw", rst: "on" },
        pin: [478, 96],
        dur: 5200,
      },
      {
        cap: "The ROM works out of the M33's own TCM: a reserved area for its stack and data, and the rest zero-filled (the TCM has ECC) and used for the images it loads. The DDR is powered, but still locked.",
        s: { ocram: "on v1", lpddr: "pw lock v1 pulse" },
        pin: [592, 164],
      },
      {
        cap: "The ROM reads the boot mode, latched from the BOOT_MODE pins at reset, and the boot fuses. Here they select the SD card.",
        s: { bsw: "on", wStrap: "on", fuses: "on", mode: "on" },
        pin: [173, 258],
      },
      {
        cap: "The ROM brings up uSDHC and the card, starting at the ≤ 400 kHz identification clock the SD specification requires, and reads from offset 32 KiB.",
        s: { usdhc: "on", wSd: "on", sd: "on", sdOff: "on" },
        pin: [778, 204],
        dur: 4600,
      },
      {
        cap: "Container #1 starts at 32 KiB. The ROM copies its header into the M33 TCM, then hands the NXP-signed ELE firmware to the ELE, which verifies it and starts running it. Part 2 opens this container.",
        s: { hdr: "show", elefw: "show", eleOk: "on", ele: "on v2" },
        mv: { hdr: { to: [-180, -70] }, elefw: { to: [-428, -84], delay: 1.7 } },
        delay: { eleOk: 3.1, ele: 3.1 },
        pin: [236, 152],
        dur: 7000,
      },
    ];
  }

  // ===========================================================================
  // Figure 2: how the ROM picks a boot device
  // ===========================================================================
  var DEV = {
    sd: {
      label: "SD card",
      ctl: "uSDHC",
      ctlSub: "SD card",
      read: "@ 32 KiB",
      pick: "The pins select SD boot.",
      init: "The ROM brings up uSDHC and the card: identification at ≤ 400 kHz first, then a faster bus mode.",
      copy: "It copies the first container header from offset 32 KiB into the M33 TCM. The space before 32 KiB is left for the partition table.",
      segs: [
        [20, 60, "MBR / GPT", "meta"],
        [80, 170, "", "free"],
        [250, 200, "flash.bin", "boot"],
        [450, 60, "…", "free"],
        [510, 270, "partitions: boot, rootfs", "part"],
      ],
      ticks: [
        [20, "0"],
        [250, "32 KiB"],
        [510, "first partition"],
      ],
      hx: 255,
      note: ["Written raw: ", "dd if=flash.bin of=/dev/sdX bs=1k seek=32 conv=fsync"],
    },
    emmc: {
      label: "eMMC",
      ctl: "uSDHC",
      ctlSub: "eMMC",
      read: "boot0 @ 0",
      pick: "The pins select eMMC boot.",
      init: "The ROM brings up uSDHC and the eMMC, and reads from the boot0 hardware partition, not from the user area.",
      copy: "It copies the first container header from offset 0 of boot0 into the M33 TCM.",
      segs: [
        [20, 300, "boot0: flash.bin", "boot"],
        [330, 90, "boot1", "meta"],
        [430, 350, "user area: partitions (boot, rootfs)", "part"],
      ],
      ticks: [
        [20, "boot0, offset 0"],
        [430, "user area"],
      ],
      hx: 25,
      note: ["boot0, boot1 and the user area are separate hardware partitions. From U-Boot: ", "mmc dev <n> 1"],
    },
    fspi: {
      label: "FlexSPI NOR",
      ctl: "FlexSPI",
      ctlSub: "NOR flash",
      read: "@ 4 KiB, after FCB",
      pick: "The pins select FlexSPI serial NOR boot. (FlexSPI serial NAND is a separate boot mode.)",
      init: "The ROM brings up FlexSPI in single-bit SDR mode at 20 MHz and reads the 512-byte FlexSPI configuration block (FCB) at 0x400, which tells it how to drive this particular flash chip.",
      copy: "With the flash configured, it reads the first container header at 0x1000 into the M33 TCM.",
      segs: [
        [20, 40, "", "free"],
        [60, 110, "FCB", "meta"],
        [170, 250, "container #1 …", "boot"],
        [420, 360, "rest of the flash", "free"],
      ],
      ticks: [
        [20, "0"],
        [60, "1 KiB"],
        [170, "4 KiB"],
      ],
      hx: 175,
      note: ["FCB at 0x400, container #1 at 0x1000. imx-mkimage target: ", "make flash_a55_flexspi"],
    },
    usb: {
      label: "USB",
      ctl: "boot media",
      ctlSub: "skipped",
      read: "—",
      segs: [[20, 760, "no boot media is read: flash.bin comes from the host over USB", "meta"]],
      ticks: [],
      note: ["", "uuu flash.bin"],
    },
  };
  var DEV_ORDER = ["sd", "emmc", "fspi", "usb"];

  function stripRow(d, y, h, x0, scale, small) {
    var s = "";
    d.segs.forEach(function (g) {
      var x = x0 + (g[0] - 20) * scale,
        w = g[1] * scale;
      s += '<rect class="bv-seg ' + g[3] + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2"/>';
      if (g[2])
        s +=
          '<text class="bv-segt" x="' +
          (x + w / 2) +
          '" y="' +
          (y + h / 2 + 3.8) +
          '"' +
          (small ? ' style="font-size:9.5px"' : "") +
          ">" +
          esc(g[2]) +
          "</text>";
    });
    return s;
  }

  function svgBootDev(u, tab, isStatic) {
    var all = tab === "all";
    var d = DEV[all ? "sd" : tab];
    var Hh = all ? 520 : 470;
    var s = svgOpen(u, 800, Hh, "Flowchart of how the i.MX95 BootROM picks a boot device, with the secondary, recovery and serial download paths");

    // edges
    s += wire("eIn", "M150,61 H174", "c-acc", u);
    s += wire("eCtl", "M275,61 H289", "c-acc", u);
    s += wire("eRd", "M415,61 H434", "c-acc", u);
    s += wire("eOk", "M560,61 H572", "c-acc", u);
    s += wire("eGo", "M663,61 H674", "c-acc", u);
    s += wire("eNo", "M618,93 V134", "c-acc", u);
    s += wl(626, 118, "no");
    s += wire("eFail", "M618,187 V212 H425 V234", "c-acc", u);
    s += wl(520, 206, "all stages failed", "middle");
    s += wire("eSer", "M225,93 V265 H289", "c-acc", u);
    s += wl(233, 160, "serial");
    s += wl(233, 172, "download");
    s += wire("eHost", "M560,265 H574", "c-acc", u);

    // nodes
    s += blk("nIn", 20, 35, 130, 52, "c-acc", "BOOT_MODE", ["+ boot fuses"]);
    s += diamond("dMode", 225, 61, 50, 32, "c-acc", "mode?");
    s += blk("nCtl", 290, 35, 125, 52, all ? "c-flash" : tab === "usb" ? "c-rom" : "c-flash", all ? "uSDHC / FlexSPI" : d.ctl, [
      all ? "boot device" : d.ctlSub,
    ]);
    s += blk("nRead", 435, 35, 125, 52, "c-sram", "read header", [all ? "→ M33 TCM" : d.read]);
    s += diamond("dOk", 618, 61, 45, 32, "c-acc", "valid?", ["tag 0x87"]);
    s += blk("nGo", 675, 35, 110, 52, "c-ok", "continue", ["→ ELE FW, part 2"]);
    s += blk("nSec", 559, 135, 118, 52, "c-bad", "reset → retry", ["2nd set · LPSPI"]);
    s += blk("nUsb", 290, 235, 270, 60, "c-acc", "Serial download (USB)", ["the ROM waits for a host"]);
    s += badge("ok", 650, 36, true);
    s += badge("bad", 650, 36, false);

    // host terminal
    s +=
      '<g class="bv-term" data-id="term"><rect class="box" x="575" y="228" width="210" height="80" rx="8"/>' +
      '<text x="586" y="248"><tspan class="p">$</tspan> lsusb | grep -i nxp</text>' +
      '<text x="586" y="263">… ID 1fc9:015d NXP Semi…</text>' +
      '<text x="586" y="283"><tspan class="p">$</tspan> uuu flash.bin</text>' +
      '<text x="586" y="298">SDPS: boot -f flash.bin</text></g>';

    // where the ROM reads
    if (!all) {
      s += '<text class="lbl" x="20" y="352">Where the ROM reads first · ' + esc(d.label) + "</text>";
      s += '<g class="bv-strip" data-id="strip">' + stripRow(d, 366, 30, 20, 1, false);
      d.ticks.forEach(function (t) {
        s += '<line x1="' + t[0] + '" y1="396" x2="' + t[0] + '" y2="404" style="stroke:var(--bv-fg2)"/>';
        s += '<text class="note" x="' + t[0] + '" y="416">' + esc(t[1]) + "</text>";
      });
      s += '<text class="note" x="20" y="446">' + esc(d.note[0]) + '<tspan class="code">' + esc(d.note[1]) + "</tspan></text></g>";
      if (d.hx !== undefined) s += mover("hdr", d.hx, 370, 90, 22, "c-ele", "header #1");
      if (tab === "usb") s += mover("fb", 595, 282, 80, 20, "c-ele", "flash.bin");
    } else {
      s += '<text class="lbl" x="20" y="352">Where the ROM reads first</text>';
      ["sd", "emmc", "fspi"].forEach(function (k, i) {
        var y = 366 + i * 34;
        s += '<text class="note" x="20" y="' + (y + 16) + '" style="font-weight:650;fill:var(--bv-fg)">' + esc(DEV[k].label) + "</text>";
        s += stripRow(DEV[k], y, 24, 120, 660 / 760, true);
      });
      s +=
        '<text class="note" x="20" y="490">SD: flash.bin at 32 KiB · eMMC: boot0 hardware partition, offset 0 · FlexSPI NOR: FCB at 1 KiB, container at 4 KiB</text>';
      s += '<text class="note" x="20" y="508">USB serial download reads no boot media: the host sends flash.bin with uuu.</text>';
    }
    return s + "</svg>";
  }

  function framesBootDev(tab) {
    var first = {
      cap: 'The ROM has two inputs: the BOOT_MODE pins, latched at reset, and the boot fuses. In "boot from fuses" mode the fuses alone decide.',
      s: { nIn: "on" },
    };
    if (tab === "usb") {
      return [
        first,
        { cap: "The pins select serial download. The ROM skips the boot media completely.", s: { dMode: "on", eIn: "on", eSer: "on", nCtl: "dim" } },
        {
          cap: "The ROM brings up USB1 and enumerates as a USB HID device, then waits for a host. (Fuses can move this to USB2 on special parts, or disable it.)",
          s: { nUsb: "on" },
        },
        {
          cap: "On the host, the board appears in lsusb as 1fc9:015d. uuu finds it and talks to the ROM.",
          s: { term: "on", eHost: "on" },
        },
        {
          cap: 'uuu streams flash.bin to the ROM (SDPS), which loads it as it would from a boot device: container #1, the ELE firmware, and so on. Plain "uuu flash.bin" only boots the image into RAM; "uuu -b emmc flash.bin" also writes it to eMMC boot0.',
          s: { fb: "show", strip: "on" },
          mv: { fb: { to: [-215, 18] } },
          dur: 6400,
        },
      ];
    }
    var d = DEV[tab];
    return [
      first,
      { cap: d.pick, s: { dMode: "on", eIn: "on", eCtl: "on" } },
      { cap: d.init, s: { nCtl: "on", strip: "on" }, dur: 4600 },
      { cap: d.copy, s: { eRd: "on", nRead: "on", hdr: "show" }, mv: { hdr: { to: [447 - d.hx, -275] } }, dur: 4800 },
      {
        cap: "The ROM checks the header: tag 0x87, version and length. If it is valid, the boot continues with the ELE firmware. That is where part 2 starts.",
        s: { eOk: "on", dOk: "on", eGo: "ok", nGo: "on", ok: "on" },
        dur: 4400,
      },
      {
        cap: "What if the header is missing, for example on a blank card, or with flash.bin written at the wrong offset? The ROM records the next boot stage and resets the SoC. Then it tries the secondary image set (if fused) and a recovery device on LPSPI1/2 (if enabled), with a reset between each stage.",
        s: { eGo: "", nGo: "", ok: "", bad: "on", eNo: "bad", nSec: "on" },
        dur: 5000,
      },
      {
        cap: "If every stage fails, the last one is USB serial download: the board enumerates over USB and waits for uuu, unless a fuse has disabled it. The board looks dead, but the ROM is running.",
        s: { eFail: "bad", nUsb: "on", eHost: "on", term: "on" },
        dur: 5600,
      },
    ];
  }

  var STATIC_BOOTDEV = {
    nIn: "on",
    dMode: "on",
    nCtl: "on",
    nRead: "on",
    dOk: "on",
    nGo: "on",
    nSec: "on",
    nUsb: "on",
    term: "on",
    ok: "on",
    eIn: "on",
    eCtl: "on",
    eRd: "on",
    eOk: "on",
    eGo: "ok",
    eNo: "bad",
    eFail: "bad",
    eSer: "on",
    eHost: "on",
  };

  // ===========================================================================
  // Figure registry
  // ===========================================================================
  var LEG_CORES = [
    ["core", "--bv-m33", "Cortex-M33"],
    ["core", "--bv-a55", "Cortex-A55"],
    ["core", "--bv-m7", "Cortex-M7"],
    ["core", "--bv-ele", "ELE"],
  ];
  var LEG_MEMS = [
    ["mem", "--bv-rom", "ROM / fuses"],
    ["mem", "--bv-sram", "TCM / OCRAM"],
    ["mem", "--bv-ddr", "DDR"],
    ["mem", "--bv-flash", "Flash / SD / eMMC"],
  ];
  var LEG_MARKS = [
    ["img", "", "image being copied"],
    ["ok", "", "verified"],
  ];

  var VIZ = {
    poweron: {
      kicker: "Figure 1",
      title: "From power-on to the first instruction",
      svg: svgPowerOn,
      frames: framesPowerOn,
      legend: LEG_CORES.concat(LEG_MEMS, LEG_MARKS),
    },
    bootdev: {
      kicker: "Figure 2",
      title: "How the BootROM picks a boot device",
      tabs: DEV_ORDER.map(function (k) {
        return { id: k, label: DEV[k].label };
      }),
      svg: svgBootDev,
      frames: framesBootDev,
      staticState: function () {
        return STATIC_BOOTDEV;
      },
      staticFrames: function () {
        return framesBootDev("sd");
      },
      legend: [
        ["mem", "--bv-sram", "M33 TCM"],
        ["mem", "--bv-flash", "boot media"],
        ["core", "--bv-ele", "container for the ELE"],
        ["ok", "", "valid"],
        ["core", "--bv-bad", "invalid / fallback"],
      ],
    },
  };

  // ===========================================================================
  // State engine
  // ===========================================================================
  function collectIds(frames) {
    var ids = {},
      movers = {};
    frames.forEach(function (f) {
      for (var k in f.s || {}) ids[k] = 1;
      for (var m in f.mv || {}) movers[m] = ids[m] = 1;
    });
    return { ids: Object.keys(ids), movers: Object.keys(movers) };
  }

  function stateAt(frames, i) {
    var st = {},
      mv = {};
    for (var k = 0; k <= i; k++) {
      var f = frames[k];
      for (var a in f.s || {}) st[a] = f.s[a];
      for (var b in f.mv || {}) mv[b] = f.mv[b];
    }
    return { s: st, mv: mv };
  }

  function lookup(svg, id) {
    return svg.querySelector('[data-id="' + id + '"]');
  }

  // Apply the state of frame i. With animate, transitions and delays of frame i play.
  function apply(svg, frames, meta, i, animate) {
    var cur = frames[i],
      st = stateAt(frames, i),
      delay = (animate && cur.delay) || {};
    if (!animate) svg.classList.add("bv-instant");
    meta.ids.forEach(function (id) {
      var el = lookup(svg, id);
      if (!el) return;
      el.style.transitionDelay = delay[id] ? delay[id] + "s" : "";
      el.setAttribute("data-s", st.s[id] || "");
    });
    meta.movers.forEach(function (id) {
      var el = lookup(svg, id);
      if (!el) return;
      var m = st.mv[id],
        to = m ? m.to : [0, 0],
        target = "translate(" + to[0] + "px," + to[1] + "px)";
      if (animate && cur.mv && cur.mv[id]) {
        var dl = cur.mv[id].delay || 0;
        el.style.transition = "none";
        el.style.transform = "translate(0px,0px)";
        el.getBoundingClientRect();
        el.style.transition = "transform 1.3s cubic-bezier(.45,0,.2,1) " + (dl + 0.35) + "s, opacity .3s " + dl + "s";
        el.style.transform = target;
      } else {
        el.style.transition = "none";
        el.style.transform = target;
      }
    });
    if (!animate) {
      svg.getBoundingClientRect();
      svg.classList.remove("bv-instant");
    }
  }

  function staticState(def, tab, frames) {
    if (def.staticState) return { s: def.staticState(tab), mv: {} };
    return stateAt(frames, frames.length - 1);
  }

  function addPins(svg, frames) {
    var s = "";
    frames.forEach(function (f, k) {
      if (!f.pin) return;
      s +=
        '<g class="bv-pin"><circle cx="' +
        f.pin[0] +
        '" cy="' +
        f.pin[1] +
        '" r="9.5"/><text x="' +
        f.pin[0] +
        '" y="' +
        (f.pin[1] + 3.8) +
        '">' +
        (k + 1) +
        "</text></g>";
    });
    svg.insertAdjacentHTML("beforeend", s);
  }

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

  function h(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function Player(root, def) {
    var self = this;
    this.root = root;
    this.def = def;
    this.uid = "bv" + ++uidN;
    this.tab = def.tabs ? root.getAttribute("data-tab") || def.tabs[0].id : null;
    this.i = 0;
    this.playing = false;
    this.timer = null;
    this.isStatic = REDUCE;

    root.innerHTML = "";
    root.classList.add("bootviz");
    if (REDUCE) root.classList.add("bv-nomotion");
    root.setAttribute("tabindex", "0");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", def.title + " (animated figure; arrow keys step, space plays)");

    root.appendChild(h("div", "bv-head", '<div class="bv-kicker">' + def.kicker + '</div><div class="bv-title">' + esc(def.title) + "</div>"));

    if (def.tabs) {
      this.tabsEl = h("div", "bv-tabs", "<span>Boot device:</span>");
      def.tabs.forEach(function (t) {
        var b = h("button", t.id === self.tab ? "active" : "", esc(t.label));
        b.type = "button";
        b.setAttribute("data-tab", t.id);
        b.addEventListener("click", function () {
          self.setTab(t.id);
        });
        self.tabsEl.appendChild(b);
      });
      root.appendChild(this.tabsEl);
    }

    this.stage = h("div", "bv-stage");
    root.appendChild(this.stage);
    this.cap = h("div", "bv-cap");
    this.cap.setAttribute("aria-live", "polite");
    root.appendChild(this.cap);
    this.list = h("ol", "bv-list");
    root.appendChild(this.list);

    this.ctl = h("div", "bv-ctl");
    this.bPrev = this.btn(ICON.prev, "Previous step", function () {
      self.stop();
      self.go(self.i - 1, false);
    });
    this.bPlay = this.btn(ICON.play + "<span>Play</span>", "Play", function () {
      self.playing ? self.stop() : self.play();
    });
    this.bNext = this.btn(ICON.next, "Next step", function () {
      self.stop();
      self.go(self.i + 1, true);
    });
    this.dots = h("div", "bv-dots");
    this.count = h("span", "bv-count");
    [this.bPrev, this.bPlay, this.bNext, this.dots, this.count].forEach(function (e) {
      self.ctl.appendChild(e);
    });
    root.appendChild(this.ctl);

    this.bStatic = h("button", "", ICON.play + "<span>Step through it</span>");
    this.bStatic.type = "button";
    this.bStatic.addEventListener("click", function () {
      self.isStatic = false;
      self.load(0);
      self.root.focus();
    });
    root.appendChild(this.bStatic);

    var leg = h("div", "bv-legend");
    def.legend.forEach(function (l) {
      var sp = h("span", l[0], "<i></i>" + esc(l[2]));
      if (l[1]) sp.style.setProperty("--sw", "var(" + l[1] + ")");
      leg.appendChild(sp);
    });
    root.appendChild(leg);

    root.addEventListener("keydown", function (e) {
      if (self.isStatic) return;
      if (e.key === "ArrowRight") {
        self.stop();
        self.go(self.i + 1, true);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        self.stop();
        self.go(self.i - 1, false);
        e.preventDefault();
      } else if ((e.key === " " || e.key === "Spacebar") && e.target === root) {
        self.playing ? self.stop() : self.play();
        e.preventDefault();
      }
    });

    var start = parseInt(root.getAttribute("data-frame"), 10);
    if (start > 0) this.isStatic = false;
    this.load(start > 0 ? start - 1 : 0);
    if (!this.isStatic && !(start > 0)) {
      whenVisible(root, function () {
        self.play();
      });
    }
  }

  Player.prototype.btn = function (html, label, fn) {
    var b = h("button", "", html);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.addEventListener("click", fn);
    return b;
  };

  Player.prototype.setTab = function (id) {
    this.stop();
    this.tab = id;
    var bs = this.tabsEl.querySelectorAll("button");
    for (var k = 0; k < bs.length; k++) bs[k].classList.toggle("active", bs[k].getAttribute("data-tab") === id);
    this.load(0);
  };

  Player.prototype.load = function (startAt) {
    var self = this,
      def = this.def;
    var tab = this.isStatic && def.tabs ? "all" : this.tab;
    this.frames = this.isStatic && def.staticFrames ? def.staticFrames() : def.frames(this.tab);
    this.meta = collectIds(this.frames);
    this.stage.innerHTML = def.svg(this.uid, tab, this.isStatic);
    this.svg = this.stage.querySelector("svg");

    var showStatic = this.isStatic;
    this.cap.style.display = showStatic ? "none" : "";
    this.ctl.style.display = showStatic ? "none" : "";
    this.list.style.display = showStatic ? "" : "none";
    this.bStatic.style.display = showStatic ? "" : "none";
    if (this.tabsEl) this.tabsEl.style.display = showStatic ? "none" : "";

    if (showStatic) {
      var st = staticState(def, tab, this.frames);
      var fake = [{ s: st.s, mv: st.mv }];
      apply(this.svg, fake, collectIds(fake), 0, false);
      if (!def.staticState) addPins(this.svg, this.frames);
      this.list.innerHTML = this.frames
        .map(function (f) {
          return "<li>" + f.cap + "</li>";
        })
        .join("");
      return;
    }

    this.dots.innerHTML = "";
    this.frames.forEach(function (f, k) {
      var b = h("button");
      b.type = "button";
      b.setAttribute("aria-label", "Step " + (k + 1));
      b.addEventListener("click", function () {
        self.stop();
        self.go(k, k === self.i + 1);
      });
      self.dots.appendChild(b);
    });
    this.go(startAt || 0, false);
  };

  Player.prototype.go = function (i, animate) {
    var n = this.frames.length;
    i = Math.max(0, Math.min(n - 1, i));
    this.i = i;
    apply(this.svg, this.frames, this.meta, i, animate && !REDUCE);
    this.cap.innerHTML = "<b>" + (i + 1) + ".</b>" + this.frames[i].cap;
    var ds = this.dots.children;
    for (var k = 0; k < ds.length; k++) {
      ds[k].classList.toggle("cur", k === i);
      ds[k].classList.toggle("done", k < i);
    }
    this.count.textContent = i + 1 + " / " + n;
    this.bPrev.disabled = i === 0;
    this.bNext.disabled = i === n - 1;
    this.syncPlay();
  };

  Player.prototype.syncPlay = function () {
    var last = this.i === this.frames.length - 1;
    if (this.playing) {
      this.bPlay.innerHTML = ICON.pause + "<span>Pause</span>";
      this.bPlay.setAttribute("aria-label", "Pause");
    } else if (last) {
      this.bPlay.innerHTML = ICON.replay + "<span>Replay</span>";
      this.bPlay.setAttribute("aria-label", "Replay from the start");
    } else {
      this.bPlay.innerHTML = ICON.play + "<span>Play</span>";
      this.bPlay.setAttribute("aria-label", "Play");
    }
  };

  Player.prototype.play = function () {
    if (this.i === this.frames.length - 1) this.go(0, false);
    this.playing = true;
    this.syncPlay();
    this.schedule(this.i === 0 ? 2200 : 700);
  };

  Player.prototype.schedule = function (wait) {
    var self = this;
    clearTimeout(this.timer);
    this.timer = setTimeout(function () {
      if (!self.playing) return;
      self.go(self.i + 1, true);
      if (self.i >= self.frames.length - 1) self.stop();
      else self.schedule(self.frames[self.i].dur || 3800);
    }, wait);
  };

  Player.prototype.stop = function () {
    this.playing = false;
    clearTimeout(this.timer);
    this.syncPlay();
  };

  function whenVisible(node, fn) {
    if (!("IntersectionObserver" in window)) return fn();
    var io = new IntersectionObserver(
      function (en) {
        if (en[0].isIntersecting) {
          io.disconnect();
          fn();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(node);
  }

  // ===========================================================================
  // Static SVG export (used to generate the <noscript> fallback files)
  // ===========================================================================
  function wrapText(t, n) {
    var words = t.split(/\s+/),
      lines = [],
      cur = "";
    words.forEach(function (w) {
      if ((cur + " " + w).trim().length > n) {
        lines.push(cur.trim());
        cur = w;
      } else cur += " " + w;
    });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }

  function exportSVG(name) {
    injectCSS();
    var def = VIZ[name];
    var tab = def.tabs ? "all" : null;
    var frames = def.staticFrames ? def.staticFrames() : def.frames(tab);
    var host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-9999px;top:0;width:800px";
    document.body.appendChild(host);
    host.innerHTML = def.svg("s-" + name, tab, true);
    var svg = host.querySelector("svg");
    var st = staticState(def, tab, frames);
    var fake = [{ s: st.s, mv: st.mv }];
    apply(svg, fake, collectIds(fake), 0, false);
    if (!def.staticState) addPins(svg, frames);

    var vb = svg.getAttribute("viewBox").split(" ").map(Number);
    var y = vb[3] + 22,
      caps = '<g class="bv-caps">';
    frames.forEach(function (f, k) {
      var txt = f.cap.replace(/<[^>]+>/g, "");
      wrapText(txt, 118).forEach(function (line, j) {
        if (j === 0) caps += '<text class="n" x="12" y="' + y + '">' + (k + 1) + ".</text>";
        caps += '<text x="34" y="' + y + '">' + esc(line) + "</text>";
        y += 16;
      });
      y += 4;
    });
    caps += "</g>";
    svg.insertAdjacentHTML("beforeend", caps);
    var H = Math.ceil(y);
    svg.setAttribute("viewBox", "-8 -8 816 " + (H + 16));
    svg.setAttribute("width", "816");
    svg.setAttribute("height", String(H + 16));
    svg.classList.add("bv-standalone");
    var style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = CSS_SVG + "\n" + CSS_STANDALONE;
    svg.insertBefore(style, svg.firstChild);
    var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("class", "bv-bgrect");
    bg.setAttribute("x", "-8");
    bg.setAttribute("y", "-8");
    bg.setAttribute("width", "816");
    bg.setAttribute("height", String(H + 16));
    bg.setAttribute("rx", "14");
    style.parentNode.insertBefore(bg, style.nextSibling);
    var title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = def.title;
    svg.insertBefore(title, svg.firstChild);
    svg.classList.remove("bv-instant");
    var out = new XMLSerializer().serializeToString(svg);
    host.remove();
    return out;
  }

  // ===========================================================================
  // Boot
  // ===========================================================================
  function init() {
    injectCSS();
    var nodes = document.querySelectorAll(".bootviz[data-viz]");
    for (var k = 0; k < nodes.length; k++) {
      var def = VIZ[nodes[k].getAttribute("data-viz")];
      if (def && !nodes[k].__bv) nodes[k].__bv = new Player(nodes[k], def);
    }
  }

  window.BootViz = { exportSVG: exportSVG, init: init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
