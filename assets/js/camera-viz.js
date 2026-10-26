// Interactive figures for the i.MX95 camera series.
// Each figure is a <div class="camviz" data-viz="..."> placeholder in a post.
// Everything is drawn at the container's real pixel size, so text stays readable.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function head(root, kicker, title) {
    root.appendChild(el("div", { class: "camviz-head" }, '<div class="camviz-kicker">' + kicker + '</div><div class="camviz-h">' + title + "</div>"));
  }

  // Calls fn(width) now and whenever the container width changes.
  function onWidth(node, fn) {
    var last = -1;
    function check() {
      var w = Math.floor(node.clientWidth);
      if (w !== last && w > 0) {
        last = w;
        fn(w);
      }
    }
    if ("ResizeObserver" in window) new ResizeObserver(check).observe(node);
    else window.addEventListener("resize", check);
    check();
  }

  // Runs fn once the figure scrolls into view.
  function whenVisible(node, fn) {
    if (!("IntersectionObserver" in window)) return fn();
    var io = new IntersectionObserver(
      function (en) {
        if (en[0].isIntersecting) {
          io.disconnect();
          fn();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(node);
  }

  // ===========================================================================
  // 1. Capture pipeline
  // ===========================================================================
  var DOMAIN = { cam: "Camera module", soc: "i.MX95 hardware", mem: "Memory (DDR)", sw: "Software" };

  // 20 x 20 line icons
  var ICON = {
    sensor: '<rect x="2" y="4" width="16" height="13" rx="2.5"/><circle cx="10" cy="10.5" r="3.6"/><path d="M7 4V2.5h6V4"/>',
    dphy: '<path d="M1 5c3-3 5 3 9 0s6 3 9 0M1 10c3-3 5 3 9 0s6 3 9 0M1 15c3-3 5 3 9 0s6 3 9 0"/>',
    csi: '<rect x="1.5" y="5" width="17" height="10" rx="2"/><path d="M6.5 5v10M14.5 5v10"/>',
    fmt: '<rect x="2" y="2" width="4.5" height="4.5" rx="1"/><rect x="7.75" y="2" width="4.5" height="4.5" rx="1"/><rect x="13.5" y="2" width="4.5" height="4.5" rx="1"/><rect x="2" y="7.75" width="4.5" height="4.5" rx="1"/><rect x="7.75" y="7.75" width="4.5" height="4.5" rx="1"/><rect x="13.5" y="7.75" width="4.5" height="4.5" rx="1"/><rect x="2" y="13.5" width="4.5" height="4.5" rx="1"/><rect x="7.75" y="13.5" width="4.5" height="4.5" rx="1"/><rect x="13.5" y="13.5" width="4.5" height="4.5" rx="1"/>',
    isi: '<path d="M10 2v10M6 8l4 4 4-4M3 13v4h14v-4"/>',
    ddr: '<rect x="4.5" y="2.5" width="11" height="15" rx="1.5"/><path d="M1.5 6h3M1.5 10h3M1.5 14h3M15.5 6h3M15.5 10h3M15.5 14h3"/>',
    isp: '<rect x="2.5" y="2.5" width="15" height="15" rx="3.5"/><path d="M10 5.5l1.2 3.3 3.3 1.2-3.3 1.2L10 14.5l-1.2-3.3L5.5 10l3.3-1.2z"/>',
    lc: '<path d="M10 2l8 4-8 4-8-4zM2 10l8 4 8-4M2 14l8 4 8-4"/>',
    app: '<rect x="2" y="3" width="16" height="14" rx="2.5"/><path d="M2 7h16M5 5h.01M7.5 5h.01"/>',
  };

  var NODES = [
    { id: "sensor", d: "cam", t: "AR2020", s: { raw: "photons → RAW10", smart: "sensor + ISP" } },
    { id: "dphy", d: "soc", t: "D-PHY RX", s: "up to 4 lanes" },
    { id: "csi", d: "soc", t: "CSI-2 RX", s: "unpacks packets" },
    { id: "fmt", d: "soc", t: "Formatter", s: "packets → pixels" },
    { id: "isi", d: "soc", t: "ISI", s: "DMA to memory" },
    { id: "ddr1", d: "mem", t: "DDR", s: { raw: "RAW frame", smart: "YUV frame" }, ic: "ddr" },
    { id: "isp", d: "soc", t: "NEO-ISP", s: "RAW → image" },
    { id: "ddr2", d: "mem", t: "DDR", s: "YUV frame", ic: "ddr" },
    { id: "lc", d: "sw", t: "libcamera", s: "pipeline + 3A" },
    { id: "app", d: "sw", t: "Application", s: "cam, GStreamer" },
  ];

  var STEPS = {
    sensor: {
      t: "The image sensor",
      raw: "The onsemi AR2020 turns light into numbers: a 5120 × 3840 grid of photodiodes behind a Bayer color filter. A bare sensor sends <b>RAW</b> data, one 10-bit value per pixel, with no color processing at all. It is configured over I²C and streams over MIPI CSI-2.",
      smart:
        "Some camera modules put an ISP chip next to the sensor (TechNexion's TEVS-AR2020 is one). The module does the color processing itself and sends ready-made <b>YUV</b> frames, so the i.MX95 doesn't need its own ISP for this camera.",
      io: { raw: ["light", "RAW10 over CSI-2"], smart: ["light", "YUV over CSI-2"] },
    },
    dphy: {
      t: "MIPI D-PHY receiver",
      b: "The physical layer: one clock lane and up to four data lanes, each a differential pair. Each i.MX95 camera interface carries up to 10 Gbps, so 2.5 Gbps per lane. Lanes idle in low-power mode between lines and frames, and switch to high-speed bursts while pixel data flows.",
      io: ["differential signals", "bytes, per lane"],
    },
    csi: {
      t: "MIPI CSI-2 controller",
      b: "The protocol layer. It merges the bytes from all lanes back into packets, checks each header's ECC and each payload's CRC, and reads the packet's data type (RAW10, YUV422…) and virtual channel. The i.MX95 has two of these, one per camera interface.",
      io: ["bytes from N lanes", "checked CSI-2 packets"],
    },
    fmt: {
      t: "CSI pixel formatter",
      b: "Packets are not pixels yet. The formatter picks the stream it wants by virtual channel and data type, unpacks it (for example RAW10's 5-bytes-per-4-pixels packing) and passes a plain pixel stream to the ISI over the internal pixel link.",
      io: ["CSI-2 packets", "pixel stream"],
    },
    isi: {
      t: "Image Sensing Interface (ISI)",
      b: "The DMA engine of the camera domain: it writes frames into DDR, and can convert color formats and scale on the way. In Linux this is where the capture <code>/dev/videoN</code> nodes come from.",
      io: { raw: ["pixel stream", "RAW frame in DDR"], smart: ["pixel stream", "YUV frame in DDR"] },
    },
    ddr1: {
      t: "Frame in memory",
      raw: "With a RAW sensor the frame in memory is still a Bayer mosaic, not a viewable image. NXP's libcamera stack runs the ISP in <b>memory-to-memory</b> mode, so the ISP reads this RAW frame back from DDR.",
      smart: "With a module ISP, the frame in memory is already a YUV image. It goes straight to the application, and the i.MX95 ISP stays idle.",
      io: { raw: ["from ISI", "to NEO-ISP"], smart: ["from ISI", "to the application"] },
    },
    isp: {
      t: "NEO-ISP",
      b: "The i.MX95's image signal processor turns RAW into an image: black level, demosaicing, white balance, color correction, noise reduction, tone mapping. It also produces <b>statistics</b> that the 3A algorithms use to steer exposure, gain and white balance.",
      io: ["RAW frame", "YUV frame + statistics"],
    },
    ddr2: {
      t: "Processed frame",
      b: "The ISP writes the finished frame back to DDR. The application gets it as a buffer it can map directly, with no copy.",
      io: ["from NEO-ISP", "zero-copy buffer"],
    },
    lc: {
      t: "libcamera",
      b: "User-space glue. A <b>pipeline handler</b> configures every block through V4L2 and the media controller and moves the buffers around. An <b>IPA</b> module runs auto exposure and auto white balance from the ISP statistics. NXP ships one handler for the ISI-only path and one for the NEO-ISP path.",
      io: ["buffers + statistics", "frames + sensor settings"],
    },
    app: {
      t: "Application",
      b: "Frames finally reach your code: libcamera's <code>cam</code> tool, GStreamer's <code>libcamerasrc</code>, or your own program. On the ISI-only path, plain V4L2 applications work too.",
      io: ["frames", "display, encoder, AI…"],
    },
    ctl: {
      t: "The control path",
      d: "sw",
      b: "Pixels flow one way, control flows back. The 3A algorithms pick a new exposure or gain, libcamera sets the matching V4L2 control, and the sensor driver writes the sensor's registers over <b>I²C</b>. Image data never travels over I²C, and register writes never travel over CSI-2.",
      io: ["3A decision", "I²C register writes"],
    },
  };

  var ORDER = {
    raw: ["sensor", "dphy", "csi", "fmt", "isi", "ddr1", "isp", "ddr2", "lc", "app", "ctl"],
    smart: ["sensor", "dphy", "csi", "fmt", "isi", "ddr1", "lc", "app", "ctl"],
  };

  function pick(v, mode) {
    return v && typeof v === "object" && !Array.isArray(v) ? v[mode] : v;
  }

  function pipeline(root) {
    var mode = "raw",
      idx = 0,
      timer = null,
      playing = !reduceMotion,
      svg,
      width = 0;

    root.innerHTML = "";
    head(root, "Interactive", "The i.MX95 capture pipeline");
    var bar = el("div", { class: "camviz-row" }, '<span class="camviz-label">Camera type</span>');
    var bRaw = el("button", { type: "button", class: "active" }, "RAW sensor");
    var bSmart = el("button", { type: "button" }, "Module with its own ISP");
    bar.appendChild(bRaw);
    bar.appendChild(bSmart);
    root.appendChild(bar);
    var stage = el("div");
    root.appendChild(stage);
    var legend = el("div", { class: "camviz-legend" });
    legend.innerHTML = Object.keys(DOMAIN)
      .map(function (k) {
        return '<span class="d-' + k + '">' + DOMAIN[k] + "</span>";
      })
      .join("");
    root.appendChild(legend);
    var panel = el("div", { class: "cvp-panel d-cam", "aria-live": "polite" });
    root.appendChild(panel);
    panel.innerHTML =
      '<span class="cvp-tag"></span><div class="cvp-title"></div><div class="cvp-body"></div><div class="cvp-io"></div>' +
      '<div class="cvp-nav"><button type="button" data-a="prev" aria-label="Previous">←</button><div class="cvp-dots"></div>' +
      '<button type="button" data-a="next" aria-label="Next">→</button><button type="button" data-a="play"></button></div>';

    function geometry(W) {
      var P = {},
        narrow = W < 600;
      if (!narrow) {
        var gap = Math.max(16, Math.round(W * 0.03)),
          bw = (W - 4 * gap) / 5,
          bh = 92,
          rowGap = 84;
        NODES.forEach(function (n, i) {
          var r = i < 5 ? 0 : 1,
            c = i < 5 ? i : 9 - i;
          P[n.id] = { x: c * (bw + gap), y: 2 + r * (bh + rowGap), w: bw, h: bh };
        });
        return { P: P, H: 2 + 2 * bh + rowGap + 4, narrow: false, rowGap: rowGap, bh: bh };
      }
      var cgap = 34,
        cw = (W - cgap) / 2,
        ch = 80,
        rg = 30;
      NODES.forEach(function (n, i) {
        var col = i < 5 ? 0 : 1,
          row = i < 5 ? i : 9 - i;
        P[n.id] = { x: col * (cw + cgap), y: 2 + row * (ch + rg), w: cw, h: ch };
      });
      return { P: P, H: 2 + 5 * ch + 4 * rg + 4, narrow: true };
    }

    // straight segment from the edge of box a to the edge of box b
    function seg(a, b) {
      var acx = a.x + a.w / 2,
        acy = a.y + a.h / 2,
        bcx = b.x + b.w / 2,
        bcy = b.y + b.h / 2;
      if (Math.abs(acy - bcy) < 1) {
        var r = bcx > acx;
        return [r ? a.x + a.w : a.x, acy, r ? b.x : b.x + b.w, bcy];
      }
      var d = bcy > acy;
      return [acx, d ? a.y + a.h : a.y, bcx, d ? b.y : b.y + b.h];
    }

    function arrowHead(x1, y1, x2, y2) {
      var ang = Math.atan2(y2 - y1, x2 - x1),
        s = 7;
      var p1 = [x2 - s * Math.cos(ang - 0.5), y2 - s * Math.sin(ang - 0.5)],
        p2 = [x2 - s * Math.cos(ang + 0.5), y2 - s * Math.sin(ang + 0.5)];
      return '<path class="cvp-arrow" d="M' + x2 + "," + y2 + "L" + p1 + "L" + p2 + 'Z"/>';
    }

    function draw() {
      var G = geometry(width),
        P = G.P,
        s = "";
      var rawIds = ["sensor", "dphy", "csi", "fmt", "isi", "ddr1"],
        outIds = ["ddr1", "isp", "ddr2", "lc", "app"];
      // connectors with arrowheads, plus an animated "flow" dash on top
      [rawIds, outIds].forEach(function (ids) {
        for (var i = 0; i < ids.length - 1; i++) {
          var g = seg(P[ids[i]], P[ids[i + 1]]);
          var d = "M" + g[0] + "," + g[1] + "L" + g[2] + "," + g[3];
          s += '<path class="cvp-link" d="' + d + '"/>';
          if (!reduceMotion) s += '<path class="cvp-flow" d="' + d + '"/>';
          s += arrowHead(g[0], g[1], g[2], g[3]);
        }
      });

      // control path: libcamera -> sensor (I2C)
      var lc = P.lc,
        se = P.sensor,
        ctl,
        pill = "";
      if (!G.narrow) {
        var my = se.y + se.h + G.rowGap / 2;
        var x0 = lc.x + lc.w / 2,
          x1 = se.x + se.w / 2;
        ctl = "M" + x0 + "," + lc.y + " C" + x0 + "," + my + " " + x1 + "," + my + " " + x1 + "," + (se.y + se.h);
        var px = (x0 + x1) / 2,
          py = my,
          label = "I²C · exposure, gain",
          pw = 136;
        pill =
          '<g class="cvp-pill" data-id="ctl" tabindex="0" role="button" aria-label="Control path"><rect x="' +
          (px - pw / 2) +
          '" y="' +
          (py - 12) +
          '" width="' +
          pw +
          '" height="24" rx="12"/><text x="' +
          px +
          '" y="' +
          (py + 4) +
          '" text-anchor="middle">' +
          label +
          "</text></g>";
      } else {
        var mx = se.x + se.w + 17;
        ctl =
          "M" +
          lc.x +
          "," +
          (lc.y + lc.h / 2) +
          " C" +
          mx +
          "," +
          (lc.y + lc.h / 2) +
          " " +
          mx +
          "," +
          (se.y + se.h / 2) +
          " " +
          (se.x + se.w) +
          "," +
          (se.y + se.h / 2);
      }
      s += '<path class="cvp-ctl" data-id="ctl" d="' + ctl + '"/>';

      // boxes
      NODES.forEach(function (n) {
        var p = P[n.id],
          cx = p.x + p.w / 2,
          off = mode === "smart" && (n.id === "isp" || n.id === "ddr2") ? " off" : "";
        var compact = G.narrow;
        var iy = compact ? p.y + 12 : p.y + 16,
          ty = compact ? p.y + 50 : p.y + 58,
          sy = ty + 17;
        s +=
          '<g class="cvp-node d-' +
          n.d +
          off +
          '" data-id="' +
          n.id +
          '" tabindex="0" role="button" aria-label="' +
          n.t +
          '"><rect class="box" x="' +
          p.x +
          '" y="' +
          p.y +
          '" width="' +
          p.w +
          '" height="' +
          p.h +
          '" rx="12"/><g class="ic" transform="translate(' +
          (cx - 11) +
          "," +
          iy +
          ') scale(1.1)">' +
          ICON[n.ic || n.id] +
          '</g><text class="t" x="' +
          cx +
          '" y="' +
          ty +
          '" text-anchor="middle">' +
          n.t +
          '</text><text class="s" x="' +
          cx +
          '" y="' +
          sy +
          '" text-anchor="middle">' +
          pick(n.s, mode) +
          "</text></g>";
      });
      s += pill;

      stage.innerHTML =
        '<svg width="' +
        width +
        '" height="' +
        G.H +
        '" viewBox="0 0 ' +
        width +
        " " +
        G.H +
        '" role="img" aria-label="i.MX95 camera capture pipeline">' +
        s +
        "</svg>";
      svg = stage.firstChild;
      show(idx, true);
    }

    function show(i, keepTour) {
      var seq = ORDER[mode];
      idx = (i + seq.length) % seq.length;
      var id = seq[idx],
        st = STEPS[id];
      var dom =
        st.d ||
        (
          NODES.filter(function (n) {
            return n.id === id;
          })[0] || {}
        ).d ||
        "sw";
      panel.className = "cvp-panel d-" + dom;
      panel.querySelector(".cvp-tag").textContent = id === "ctl" ? "I²C control" : DOMAIN[dom];
      panel.querySelector(".cvp-title").textContent = st.t;
      panel.querySelector(".cvp-body").innerHTML = st.b || st[mode];
      var io = pick(st.io, mode);
      panel.querySelector(".cvp-io").innerHTML = "In <b>" + io[0] + "</b> → Out <b>" + io[1] + "</b>";
      panel.querySelector(".cvp-dots").innerHTML = seq
        .map(function (sid, k) {
          return '<button type="button" data-k="' + k + '" class="' + (k === idx ? "active" : "") + '" aria-label="Step ' + (k + 1) + '"></button>';
        })
        .join("");
      if (svg)
        svg.querySelectorAll("[data-id]").forEach(function (g) {
          g.classList.toggle("active", g.getAttribute("data-id") === id);
        });
      if (!keepTour && playing) {
        playing = false;
        sync();
      }
    }

    function sync() {
      clearInterval(timer);
      timer = playing
        ? setInterval(function () {
            show(idx + 1, true);
          }, 5000)
        : null;
      panel.querySelector('[data-a="play"]').textContent = playing ? "❚❚ Pause" : "▶ Tour";
    }

    stage.addEventListener("click", function (e) {
      var g = e.target.closest("[data-id]");
      if (g) show(ORDER[mode].indexOf(g.getAttribute("data-id")));
    });
    stage.addEventListener("keydown", function (e) {
      var g = e.target.closest("[data-id]");
      if (g && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        show(ORDER[mode].indexOf(g.getAttribute("data-id")));
      }
    });
    panel.addEventListener("click", function (e) {
      var t = e.target,
        a = t.getAttribute("data-a"),
        k = t.getAttribute("data-k");
      if (k !== null) show(+k);
      if (a === "prev") show(idx - 1);
      if (a === "next") show(idx + 1);
      if (a === "play") {
        playing = !playing;
        sync();
      }
    });
    function setMode(m) {
      mode = m;
      idx = 0;
      bRaw.classList.toggle("active", m === "raw");
      bSmart.classList.toggle("active", m === "smart");
      draw();
    }
    bRaw.addEventListener("click", function () {
      setMode("raw");
    });
    bSmart.addEventListener("click", function () {
      setMode("smart");
    });

    onWidth(stage, function (w) {
      width = w;
      draw();
    });
    sync();
  }

  // ===========================================================================
  // 2. Bayer mosaic with a pixel inspector
  // ===========================================================================
  var BW = 64,
    BH = 40;

  function scene(u, v) {
    var c = [0.3 + 0.35 * v, 0.55 + 0.3 * v, 0.95]; // sky
    if (v > 0.64 + 0.07 * Math.sin(u * 7)) c = [0.18, 0.5 + 0.25 * (1 - v), 0.16]; // hill
    var dx = u - 0.74,
      dy = v - 0.27;
    if (dx * dx * 2.6 + dy * dy < 0.017) c = [1, 0.83, 0.18]; // sun
    if (u > 0.12 && u < 0.36 && v > 0.34 && v < 0.8) c = [0.86, 0.13, 0.18]; // red house
    if (u > 0.08 && u < 0.4 && v > 0.22 && v < 0.36 && v > 0.36 - (0.14 - Math.abs(u - 0.24) * 0.9)) c = [0.35, 0.2, 0.15]; // roof
    if (u > 0.17 && u < 0.24 && v > 0.48 && v < 0.62) c = [0.97, 0.95, 0.85]; // window
    return c;
  }

  function filterAt(x, y) {
    return y % 2 === 0 ? (x % 2 === 0 ? 0 : 1) : x % 2 === 0 ? 1 : 2; // RGGB
  }

  var FCOL = [
    [239, 68, 68],
    [34, 197, 94],
    [59, 130, 246],
  ];
  var FNAME = ["R", "G", "B"];

  function bayer(root) {
    var raw = new Float32Array(BW * BH),
      full = [],
      demo = [];
    var x, y;
    for (y = 0; y < BH; y++)
      for (x = 0; x < BW; x++) {
        var c = scene((x + 0.5) / BW, (y + 0.5) / BH);
        full.push(c);
        raw[y * BW + x] = c[filterAt(x, y)];
      }
    for (y = 0; y < BH; y++)
      for (x = 0; x < BW; x++) {
        var sum = [0, 0, 0],
          n = [0, 0, 0];
        for (var dy = -1; dy <= 1; dy++)
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx,
              yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= BW || yy >= BH) continue;
            var f = filterAt(xx, yy);
            sum[f] += raw[yy * BW + xx];
            n[f]++;
          }
        var own = filterAt(x, y);
        demo.push(
          [0, 1, 2].map(function (ch) {
            return ch === own ? raw[y * BW + x] : sum[ch] / n[ch];
          })
        );
      }

    var VIEWS = [
      ["Scene", "<b>The scene.</b> What's in front of the lens: full color everywhere."],
      ["Sensor output", "<b>What the sensor sends.</b> One number per pixel: the brightness behind that pixel's color filter. No color yet."],
      ["Bayer mosaic", "<b>The same numbers, tinted</b> by each pixel's filter. Every 2 × 2 block is one red, two green, one blue: RGGB."],
      [
        "Demosaiced",
        "<b>After demosaicing.</b> Each pixel estimates its two missing colors from its neighbours. Look for color fringes at sharp edges.",
      ],
    ];

    root.innerHTML = "";
    head(root, "Interactive", "What a RAW Bayer sensor really captures");
    var tabs = el("div", { class: "camviz-row" });
    VIEWS.forEach(function (v, i) {
      tabs.appendChild(el("button", { type: "button", "data-v": i }, i + 1 + ". " + v[0]));
    });
    root.appendChild(tabs);
    var wrap = el("div", { class: "cvb-wrap" });
    var left = el("div");
    var stageEl = el("div", { class: "cvb-stage" });
    var cv = el("canvas", { width: BW, height: BH, "aria-label": "Simulated sensor image" });
    var lens = el("div", { class: "cvb-lens" });
    stageEl.appendChild(cv);
    stageEl.appendChild(lens);
    left.appendChild(stageEl);
    var stepTxt = el("div", { class: "cvb-step" });
    left.appendChild(stepTxt);
    wrap.appendChild(left);
    var insp = el("div", { class: "cvb-inspector" }, '<div class="cvb-grid"></div><div class="cvb-read"></div>');
    wrap.appendChild(insp);
    root.appendChild(wrap);
    root.appendChild(
      el(
        "p",
        { class: "camviz-caption" },
        "Move over the image (or tap it) to inspect a 4 × 4 block of real sensor values. A 64 × 40 toy sensor, magnified; demosaicing here is simple bilinear interpolation, real ISPs use edge-aware methods."
      )
    );

    var ctx = cv.getContext("2d"),
      img = ctx.createImageData(BW, BH),
      view = 0,
      sel = [20, 26],
      auto = null;

    function px(i, v) {
      var r = raw[i],
        f,
        o = i * 4,
        c;
      if (v === 0) c = full[i];
      else if (v === 1) c = [r, r, r];
      else if (v === 2) {
        f = filterAt(i % BW, (i / BW) | 0);
        c = [0, 0, 0];
        c[f] = r;
      } else c = demo[i];
      img.data[o] = c[0] * 255;
      img.data[o + 1] = c[1] * 255;
      img.data[o + 2] = c[2] * 255;
      img.data[o + 3] = 255;
    }

    function render() {
      for (var i = 0; i < BW * BH; i++) px(i, view);
      ctx.putImageData(img, 0, 0);
      tabs.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("active", +b.getAttribute("data-v") === view);
      });
      stepTxt.innerHTML = VIEWS[view][1];
    }

    function inspect() {
      var x0 = Math.min(BW - 4, Math.max(0, sel[0] - 1)) & ~1,
        y0 = Math.min(BH - 4, Math.max(0, sel[1] - 1)) & ~1;
      lens.style.left = (x0 / BW) * 100 + "%";
      lens.style.top = (y0 / BH) * 100 + "%";
      lens.style.width = (4 / BW) * 100 + "%";
      lens.style.height = (4 / BH) * 100 + "%";
      var h = "";
      for (var yy = y0; yy < y0 + 4; yy++)
        for (var xx = x0; xx < x0 + 4; xx++) {
          var f = filterAt(xx, yy),
            v = raw[yy * BW + xx],
            a = 0.18 + 0.82 * v,
            k = FCOL[f];
          h +=
            '<div class="cvb-cell' +
            (xx === sel[0] && yy === sel[1] ? " sel" : "") +
            '" style="background:rgba(' +
            k[0] +
            "," +
            k[1] +
            "," +
            k[2] +
            "," +
            a.toFixed(2) +
            ')"><b>' +
            FNAME[f] +
            "</b><span>" +
            Math.round(v * 1023) +
            "</span></div>";
        }
      insp.querySelector(".cvb-grid").innerHTML = h;
      var i = sel[1] * BW + sel[0],
        f0 = filterAt(sel[0], sel[1]);
      var miss = [0, 1, 2].filter(function (c) {
        return c !== f0;
      });
      insp.querySelector(".cvb-read").innerHTML =
        "Pixel <b>(" +
        sel[0] +
        ", " +
        sel[1] +
        ")</b> sits under a <b>" +
        FNAME[f0] +
        "</b> filter and reads <b>" +
        Math.round(raw[i] * 1023) +
        "</b> / 1023. Its " +
        FNAME[miss[0]] +
        " and " +
        FNAME[miss[1]] +
        " values were never measured; demosaicing estimates them from neighbours: " +
        miss
          .map(function (c) {
            return FNAME[c] + " ≈ <b>" + Math.round(demo[i][c] * 1023) + "</b>";
          })
          .join(", ") +
        ".";
    }

    function stopAuto() {
      clearInterval(auto);
      auto = null;
    }

    function pointer(e) {
      var r = cv.getBoundingClientRect();
      var x = Math.floor(((e.clientX - r.left) / r.width) * BW),
        y = Math.floor(((e.clientY - r.top) / r.height) * BH);
      if (x < 0 || y < 0 || x >= BW || y >= BH) return;
      sel = [x, y];
      inspect();
    }
    stageEl.addEventListener("pointermove", pointer);
    stageEl.addEventListener("pointerdown", function (e) {
      stopAuto();
      pointer(e);
    });
    tabs.addEventListener("click", function (e) {
      var v = e.target.getAttribute("data-v");
      if (v === null) return;
      stopAuto();
      view = +v;
      render();
    });

    render();
    inspect();
    if (!reduceMotion)
      whenVisible(root, function () {
        auto = setInterval(function () {
          view = (view + 1) % VIEWS.length;
          render();
        }, 3200);
      });
  }

  // ===========================================================================
  // 3. One CSI-2 long packet striped across the data lanes
  // ===========================================================================
  function lanes(root) {
    var GROUPS = [
      { n: "Header", c: "#f59e0b", b: ["DI", "WC", "WC", "ECC"] },
      { n: "Payload · pixels", c: "var(--global-theme-color)", b: ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"] },
      { n: "CRC", c: "#10b981", b: ["CRC", "CRC"] },
    ];
    var BYTES = [];
    GROUPS.forEach(function (g) {
      g.b.forEach(function (b) {
        BYTES.push({ t: b, c: g.c });
      });
    });
    var N = BYTES.length,
      nLanes = 4,
      timer = null,
      tick = 0,
      started = false;

    root.innerHTML = "";
    head(root, "Interactive", "One CSI-2 packet on the wire");
    var bar = el("div", { class: "camviz-row" }, '<span class="camviz-label">Data lanes</span>');
    [1, 2, 4].forEach(function (n) {
      bar.appendChild(el("button", { type: "button", "data-n": n, class: n === 4 ? "active" : "" }, n + (n > 1 ? " lanes" : " lane")));
    });
    var replay = el("button", { type: "button" }, "↻ Replay");
    bar.appendChild(replay);
    root.appendChild(bar);
    var box = el("div", { class: "cvl" });
    root.appendChild(box);
    var status = el("p", { class: "camviz-caption", "aria-live": "polite" });
    root.appendChild(status);
    var timeBox = el("div", { class: "cvl-time" });
    root.appendChild(timeBox);

    function build() {
      var h = '<div class="cvl-groups">';
      GROUPS.forEach(function (g) {
        h += '<div style="--g:' + g.c + ";width:calc(" + g.b.length + " * var(--cell) + " + (g.b.length - 1) * 3 + 'px)">' + g.n + "</div>";
      });
      h += '</div><div class="cvl-row packet"><span class="cvl-name">packet</span>';
      BYTES.forEach(function (b, i) {
        h += '<span class="cvl-byte" data-i="' + i + '" style="--g:' + b.c + '">' + b.t + "</span>";
      });
      h += "</div>";
      h +=
        '<div class="cvl-row"><span class="cvl-name">clock</span><div class="cvl-clock"><svg viewBox="0 0 400 20" preserveAspectRatio="none"><path d="' +
        wave() +
        '"/></svg></div></div>';
      var slots = Math.ceil(N / nLanes);
      for (var l = 0; l < nLanes; l++) {
        h += '<div class="cvl-row"><span class="cvl-name">lane ' + l + "</span>";
        for (var s = 0; s < slots; s++) h += '<span class="cvl-cell" data-l="' + l + '" data-s="' + s + '"></span>';
        h += "</div>";
      }
      box.innerHTML = h;
      timeBox.innerHTML = [1, 2, 4]
        .map(function (n) {
          var t = Math.ceil(N / n);
          return (
            '<div class="cvl-bar' +
            (n === nLanes ? " on" : "") +
            '"><span>' +
            n +
            " lane" +
            (n > 1 ? "s" : "") +
            '</span><div style="width:' +
            (t / N) * 55 +
            '%"></div><span>' +
            t +
            " byte-times</span></div>"
          );
        })
        .join("");
      status.textContent = "Every clock tick, each lane carries one byte. Byte n goes to lane n mod " + nLanes + ".";
      tick = 0;
    }

    function wave() {
      var d = "M0,16",
        x = 0;
      while (x < 400) {
        d += " L" + x + ",4 L" + (x + 10) + ",4 L" + (x + 10) + ",16 L" + (x + 20) + ",16";
        x += 20;
      }
      return d;
    }

    function size() {
      var lab = box.clientWidth < 420 ? 46 : 64;
      var cell = Math.max(12, Math.min(34, Math.floor((box.clientWidth - lab) / N) - 3));
      box.style.setProperty("--lab", lab + "px");
      box.style.setProperty("--cell", cell + "px");
      box.classList.toggle("tiny", cell < 20);
    }

    function send() {
      var slots = Math.ceil(N / nLanes);
      if (tick >= slots) {
        clearInterval(timer);
        timer = null;
        status.innerHTML =
          "<b>" +
          N +
          " bytes in " +
          slots +
          " byte-times</b> on " +
          nLanes +
          " lane" +
          (nLanes > 1 ? "s" : "") +
          ". The receiver merges the lanes back into one packet, in order.";
        if (!reduceMotion) timer = setTimeout(start, 3500);
        return;
      }
      var base = box.getBoundingClientRect();
      for (var l = 0; l < nLanes; l++) {
        var i = tick * nLanes + l;
        if (i >= N) break;
        var src = box.querySelector('[data-i="' + i + '"]'),
          dst = box.querySelector('[data-l="' + l + '"][data-s="' + tick + '"]');
        var sr = src.getBoundingClientRect(),
          dr = dst.getBoundingClientRect();
        var fly = el("span", { class: "cvl-byte cvl-fly", style: "--g:" + BYTES[i].c }, BYTES[i].t);
        fly.style.transform = "translate(" + (sr.left - base.left) + "px," + (sr.top - base.top) + "px)";
        box.appendChild(fly);
        src.classList.add("sent");
        if (reduceMotion) {
          landed(fly, dst);
        } else {
          (function (f, d, dx, dy) {
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                f.style.transform = "translate(" + dx + "px," + dy + "px)";
              });
            });
            setTimeout(function () {
              landed(f, d);
            }, 520);
          })(fly, dst, dr.left - base.left, dr.top - base.top);
        }
      }
      tick++;
    }

    function landed(fly, dst) {
      fly.remove();
      if (!box.contains(dst)) return;
      dst.outerHTML = '<span class="cvl-byte" style="--g:' + fly.style.getPropertyValue("--g") + '">' + fly.textContent + "</span>";
    }

    function start() {
      clearInterval(timer);
      clearTimeout(timer);
      size();
      build();
      if (reduceMotion) {
        while (tick < Math.ceil(N / nLanes)) send();
        send(); // prints the summary
      } else timer = setInterval(send, 750);
    }

    bar.addEventListener("click", function (e) {
      var n = e.target.getAttribute("data-n");
      if (!n) return;
      nLanes = +n;
      bar.querySelectorAll("[data-n]").forEach(function (b) {
        b.classList.toggle("active", b === e.target);
      });
      start();
    });
    replay.addEventListener("click", start);
    onWidth(box, function () {
      size();
      if (!started) build();
    });
    whenVisible(root, function () {
      started = true;
      start();
    });
  }

  // ===========================================================================
  // 4. Bandwidth calculator (method from NXP UG10215, section 5.1)
  // ===========================================================================
  var PRESETS = [
    { n: "AR2020 · 20 MP · 30 fps", w: 5120, h: 3840, b: 10, f: 30 },
    { n: "AR2020 · 20 MP · 60 fps", w: 5120, h: 3840, b: 10, f: 60 },
    { n: "4K · 30 fps", w: 3840, h: 2160, b: 10, f: 30 },
    { n: "1080p · 60 fps", w: 1920, h: 1080, b: 10, f: 60 },
  ];

  function bandwidth(root) {
    root.innerHTML = "";
    head(root, "Interactive", "Will this camera mode fit on the i.MX95?");
    var pre = el("div", { class: "cvw-presets" });
    PRESETS.forEach(function (p, i) {
      pre.appendChild(el("button", { type: "button", "data-p": i }, p.n));
    });
    root.appendChild(pre);
    var form = el(
      "div",
      { class: "cvw-form" },
      '<label>Width (px)<input type="number" min="1" data-k="w"></label>' +
        '<label>Height (px)<input type="number" min="1" data-k="h"></label>' +
        '<label>Bits per pixel<select data-k="b"><option value="8">RAW8</option><option value="10">RAW10</option><option value="12">RAW12</option></select></label>' +
        '<label>Frame rate (fps)<input type="number" min="1" data-k="f"></label>' +
        '<label>Data lanes<select data-k="l"><option>1</option><option>2</option><option selected>4</option></select></label>' +
        '<label>Blanking (%)<input type="number" min="0" max="100" value="20" data-k="k"></label>' +
        '<label>RAW32 mode<select data-k="r"><option value="1" selected>Enabled</option><option value="0">Disabled</option></select></label>' +
        '<label>Camera clock<select data-k="c"><option value="333.33">333 MHz · low drive</option><option value="500" selected>500 MHz · nominal</option><option value="666.67">667 MHz · override</option></select></label>'
    );
    root.appendChild(form);
    var gauges = el("div", { class: "cvw-gauges" });
    root.appendChild(gauges);
    var verdict = el("div", { class: "cvw-verdict", "aria-live": "polite" });
    root.appendChild(verdict);
    root.appendChild(
      el(
        "p",
        { class: "camviz-caption" },
        "Limits from NXP's i.MX 95x Camera Porting Guide (UG10215): up to 10 Gbps per camera interface, i.e. 2.5 Gbps per lane on 4 lanes. The formatter, ISI and ISP pixel clocks come from cam_isi_clk_root. RAW32 mode moves 2 pixels per clock for RAW10/12 and 4 for RAW8."
      )
    );

    var q = function (k) {
      return form.querySelector('[data-k="' + k + '"]');
    };

    function preset(i) {
      var p = PRESETS[i];
      q("w").value = p.w;
      q("h").value = p.h;
      q("b").value = p.b;
      q("f").value = p.f;
      pre.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("active", +b.getAttribute("data-p") === i);
      });
    }

    function gauge(name, val, max, unit, dig) {
      var r = 28,
        C = 2 * Math.PI * r,
        frac = Math.min(1, val / max),
        pct = Math.round((val / max) * 100);
      return (
        '<div class="cvw-gauge' +
        (val > max ? " over" : "") +
        '"><svg viewBox="0 0 68 68"><circle class="trk" cx="34" cy="34" r="' +
        r +
        '"/><circle class="val" cx="34" cy="34" r="' +
        r +
        '" transform="rotate(-90 34 34)" stroke-dasharray="' +
        C.toFixed(1) +
        '" stroke-dashoffset="' +
        (C * (1 - frac)).toFixed(1) +
        '"/><text class="pct" x="34" y="39" text-anchor="middle">' +
        pct +
        '%</text></svg><div><div class="cvw-name">' +
        name +
        '</div><div class="cvw-num">' +
        val.toFixed(dig) +
        " " +
        unit +
        '</div><div class="cvw-lim">limit ' +
        max.toFixed(dig) +
        " " +
        unit +
        "</div></div></div>"
      );
    }

    function calc() {
      var w = +q("w").value,
        h = +q("h").value,
        b = +q("b").value,
        f = +q("f").value,
        l = +q("l").value,
        k = +q("k").value / 100,
        raw32 = q("r").value === "1",
        clk = +q("c").value;
      var link = (w * h * b * f * (1 + k)) / 1e9,
        lane = link / l,
        ppc = raw32 ? (b <= 8 ? 4 : 2) : 1,
        pix = (w * h * f * (1 + k)) / ppc / 1e6;
      gauges.innerHTML =
        gauge("MIPI link · " + l + "L", link, Math.min(10, 2.5 * l), "Gbps", 2) +
        gauge("Per lane", lane, 2.5, "Gbps", 2) +
        gauge("Pixel clock · " + ppc + "×", pix, clk, "MHz", 0);
      var linkBad = link > 2.5 * l,
        clkBad = pix > clk;
      verdict.className = "cvw-verdict " + (linkBad || clkBad ? "bad" : "ok");
      verdict.innerHTML =
        (linkBad || clkBad
          ? "<b>✗ Doesn't fit.</b> " +
            (linkBad ? "The MIPI link is too slow for this mode. " : "") +
            (clkBad ? "The camera-domain pixel clock can't keep up" + (raw32 ? "." : ": try enabling RAW32 mode.") : "")
          : "<b>✓ Fits.</b>") +
        " The sensor driver would report a link frequency of <b>" +
        ((lane * 1e3) / 2).toFixed(0) +
        " MHz</b> (lane rate ÷ 2, because D-PHY is double data rate).";
    }

    pre.addEventListener("click", function (e) {
      var p = e.target.getAttribute("data-p");
      if (p === null) return;
      preset(+p);
      calc();
    });
    form.addEventListener("input", function (e) {
      if ("whbf".indexOf(e.target.getAttribute("data-k")) >= 0)
        pre.querySelectorAll("button").forEach(function (b) {
          b.classList.remove("active");
        });
      calc();
    });
    preset(0);
    calc();
  }

  var VIZ = { pipeline: pipeline, bayer: bayer, lanes: lanes, bandwidth: bandwidth };

  function init() {
    document.querySelectorAll(".camviz[data-viz]").forEach(function (root) {
      var fn = VIZ[root.getAttribute("data-viz")];
      if (fn) fn(root);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
