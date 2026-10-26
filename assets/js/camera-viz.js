// Interactive figures for the i.MX95 camera series.
// Each figure is a <div class="camviz" data-viz="..."> placeholder in a post.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SVGNS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ---------------------------------------------------------------------------
  // 1. Capture pipeline: sensor -> CSI-2 -> ISI -> DDR -> ISP -> app
  // ---------------------------------------------------------------------------
  var NODES = [
    { id: "sensor", t: "AR2020", s: { raw: "photons → RAW10", smart: "sensor + module ISP" } },
    { id: "dphy", t: "D-PHY RX", s: "up to 4 data lanes" },
    { id: "csi", t: "CSI-2 receiver", s: "unpacks packets" },
    { id: "fmt", t: "Pixel formatter", s: "packets → pixels" },
    { id: "isi", t: "ISI", s: "DMA into memory" },
    { id: "ddr1", t: "DDR", s: { raw: "RAW Bayer frame", smart: "YUV frame" } },
    { id: "isp", t: "NEO-ISP", s: "RAW → image" },
    { id: "ddr2", t: "DDR", s: "YUV frame" },
    { id: "lc", t: "libcamera", s: "pipeline + 3A" },
    { id: "app", t: "Application", s: "cam, GStreamer…" },
  ];

  var STEPS = {
    sensor: [
      "The image sensor",
      {
        raw: "The onsemi AR2020 turns light into numbers: a 5120 × 3840 grid of photodiodes behind a Bayer color filter. A bare sensor outputs <b>RAW</b> data, one 10-bit value per pixel, with no color processing at all. It is configured over I²C and streams pixels over MIPI CSI-2.",
        smart:
          "Some camera modules put an ISP chip next to the sensor (TechNexion's TEVS-AR2020 is one). The module then does the color processing itself and sends ready-made <b>YUV</b> frames over MIPI CSI-2, so the i.MX95 doesn't need its own ISP for this camera.",
      },
    ],
    dphy: [
      "MIPI D-PHY receiver",
      "The physical layer. One clock lane and up to four data lanes, each a differential pair. On the i.MX95 each camera interface carries up to 10 Gbps, so 2.5 Gbps per lane. The D-PHY switches between low-power signalling (between lines and frames) and high-speed bursts (while pixel data flows).",
    ],
    csi: [
      "MIPI CSI-2 controller",
      "The protocol layer. It reassembles the bytes from all lanes into CSI-2 packets, checks the ECC and CRC, and reads each packet's data type (RAW10, YUV422…) and virtual channel. The i.MX95 has two CSI-2 controllers, one per camera interface.",
    ],
    fmt: [
      "CSI pixel formatter",
      "Packets are not pixels yet. The formatter picks the stream it wants (by virtual channel and data type), unpacks it into a pixel stream and hands it on over the internal pixel link.",
    ],
    isi: [
      "Image Sensing Interface (ISI)",
      "The ISI is the DMA engine of the camera domain: it writes frames into DDR. It can also convert color formats and scale on the way. In Linux it is the block that finally gives you a <code>/dev/videoN</code> capture node.",
    ],
    ddr1: [
      "Frame in memory",
      {
        raw: "With a RAW sensor, the frame that lands in memory is still a Bayer mosaic. It isn't a viewable image yet. The libcamera stack on i.MX95 runs the ISP in <b>memory-to-memory</b> mode, so this RAW frame is read back from DDR for processing.",
        smart: "With a module ISP, the frame in memory is already a YUV image. It goes straight to the application, and the i.MX95 ISP stays idle.",
      },
    ],
    isp: [
      "NEO-ISP",
      "The i.MX95's image signal processor turns RAW into an image: black level, demosaicing, white balance, color correction, noise reduction, tone mapping. It also produces <b>statistics</b> (brightness, color histograms) that the 3A algorithms use to steer exposure, gain and white balance.",
    ],
    ddr2: ["Processed frame", "The ISP writes the finished YUV frame back to DDR, where the application can read it with no copy."],
    lc: [
      "libcamera",
      "User space glue. A <b>pipeline handler</b> configures every block above through V4L2 and the media controller, and circulates the buffers. An <b>IPA</b> (image processing algorithm) module runs auto-exposure, auto-white-balance and friends from the ISP statistics. i.MX95 has two handlers: one for the ISI-only path, one for the NEO-ISP path.",
    ],
    app: [
      "Application",
      "Finally, frames reach your code: NXP's examples use libcamera's <code>cam</code> tool or GStreamer's <code>libcamerasrc</code> element, and plain V4L2 applications are possible on the ISI-only path.",
    ],
    ctl: [
      "The control path (dashed)",
      "Pixels flow one way, but control flows back. 3A decides a new exposure or gain, libcamera sets the matching V4L2 control, and the sensor driver writes the sensor's registers over <b>I²C</b>. Image data never travels over I²C, and register writes never travel over CSI-2.",
    ],
  };

  var ORDER = {
    raw: ["sensor", "dphy", "csi", "fmt", "isi", "ddr1", "isp", "ddr2", "lc", "app", "ctl"],
    smart: ["sensor", "dphy", "csi", "fmt", "isi", "ddr1", "lc", "app", "ctl"],
  };

  function layout(narrow) {
    var pos = {},
      w = 150,
      h = narrow ? 56 : 64;
    NODES.forEach(function (n, i) {
      if (narrow) {
        var col = i < 5 ? 0 : 1,
          row = i < 5 ? i : 9 - i;
        pos[n.id] = { x: col ? 230 : 20, y: 20 + row * 110, w: w, h: h };
      } else {
        var r = i < 5 ? 0 : 1,
          c = i < 5 ? i : 9 - i;
        pos[n.id] = { x: 20 + c * 192, y: r ? 196 : 36, w: w, h: h };
      }
    });
    for (var k in pos) {
      pos[k].cx = pos[k].x + w / 2;
      pos[k].cy = pos[k].y + h / 2;
    }
    return { pos: pos, vb: narrow ? "0 0 400 590" : "0 0 960 290" };
  }

  function pipeline(root) {
    var mode = "raw",
      idx = 0,
      timer = null,
      playing = !reduceMotion;

    root.innerHTML = "";
    root.appendChild(el("div", { class: "camviz-title" }, "Interactive · the i.MX95 capture pipeline"));
    var bar = el("div", { class: "camviz-toolbar" }, "Camera type:");
    var bRaw = el("button", { type: "button", class: "active" }, "RAW sensor → NEO-ISP");
    var bSmart = el("button", { type: "button" }, "Module with its own ISP");
    bar.appendChild(bRaw);
    bar.appendChild(bSmart);
    root.appendChild(bar);
    var holder = el("div");
    root.appendChild(holder);
    var panel = el(
      "div",
      { class: "camviz-panel", "aria-live": "polite" },
      '<div class="camviz-step-title"></div><div class="camviz-step-body"></div>' +
        '<div class="camviz-nav"><button type="button" data-a="prev" aria-label="Previous step">←</button>' +
        '<span class="camviz-count"></span><button type="button" data-a="next" aria-label="Next step">→</button>' +
        '<button type="button" data-a="play"></button></div>'
    );
    root.appendChild(panel);
    root.appendChild(
      el("p", { class: "camviz-caption" }, "Click a block, or use the arrows. Moving squares are RAW Bayer data, circles are processed YUV frames.")
    );

    var svg;

    function draw() {
      var narrow = root.clientWidth < 620;
      var L = layout(narrow),
        P = L.pos;
      var seq = ORDER[mode];
      var flow = seq.filter(function (id) {
        return id !== "ctl";
      });
      var line = function (ids) {
        return ids
          .map(function (id, i) {
            return (i ? "L" : "M") + P[id].cx + "," + P[id].cy;
          })
          .join(" ");
      };
      var rawIds = ["sensor", "dphy", "csi", "fmt", "isi", "ddr1"];
      var yuvIds = mode === "raw" ? ["ddr1", "isp", "ddr2", "lc", "app"] : ["ddr1", "isp", "ddr2", "lc", "app"];
      var s = "";
      // links
      s += '<path class="camviz-link" d="' + line(rawIds) + '"/>';
      s += '<path class="camviz-link" d="' + line(yuvIds) + '"/>';
      // control path: libcamera -> sensor over I2C
      var a = P.lc,
        b = P.sensor,
        ctlD,
        lx,
        ly;
      if (narrow) {
        ctlD = "M" + a.x + "," + a.cy + " C200," + a.cy + " 200," + b.cy + " " + (b.x + b.w) + "," + b.cy;
        lx = null;
      } else {
        ctlD = "M" + a.cx + "," + a.y + " C" + a.cx + ",150 " + b.cx + ",150 " + b.cx + "," + (b.y + b.h);
        lx = (a.cx + b.cx) / 2;
        ly = 180;
      }
      s += '<path class="camviz-ctl" data-id="ctl" d="' + ctlD + '"/>';
      if (lx) s += '<text class="camviz-ctl-label" x="' + lx + '" y="' + ly + '" text-anchor="middle">I²C control</text>';
      // moving data
      var rawPath = line(rawIds),
        yuvPath = line(yuvIds);
      var bayer = ["#ef4444", "#22c55e", "#22c55e", "#3b82f6"];
      var dur = narrow ? 5 : 4.5;
      for (var i = 0; i < 6; i++) {
        var fill = mode === "raw" ? bayer[i % 4] : "var(--global-theme-color)";
        var shape = mode === "raw" ? '<rect x="-5" y="-5" width="10" height="10" rx="2" fill="' + fill + '">' : '<circle r="6" fill="' + fill + '">';
        var close = mode === "raw" ? "</rect>" : "</circle>";
        s += shape + '<animateMotion dur="' + dur + 's" repeatCount="indefinite" begin="' + (i * dur) / 6 + 's" path="' + rawPath + '"/>' + close;
        s +=
          '<circle r="6" fill="var(--global-theme-color)"><animateMotion dur="' +
          dur +
          's" repeatCount="indefinite" begin="' +
          (i * dur) / 6 +
          's" path="' +
          yuvPath +
          '"/></circle>';
      }
      // nodes
      NODES.forEach(function (n) {
        var p = P[n.id];
        var sub = typeof n.s === "string" ? n.s : n.s[mode];
        var off = mode === "smart" && (n.id === "isp" || n.id === "ddr2") ? " off" : "";
        s +=
          '<g class="camviz-node' +
          off +
          '" data-id="' +
          n.id +
          '" tabindex="0" role="button" aria-label="' +
          n.t +
          '"><rect x="' +
          p.x +
          '" y="' +
          p.y +
          '" width="' +
          p.w +
          '" height="' +
          p.h +
          '" rx="10"/><text class="t" x="' +
          p.cx +
          '" y="' +
          (p.cy - 3) +
          '" text-anchor="middle">' +
          n.t +
          '</text><text class="s" x="' +
          p.cx +
          '" y="' +
          (p.cy + 17) +
          '" text-anchor="middle">' +
          sub +
          "</text></g>";
      });
      holder.innerHTML = '<svg viewBox="' + L.vb + '" role="img" aria-label="i.MX95 camera capture pipeline">' + s + "</svg>";
      svg = holder.firstChild;
      if (!playing && svg.pauseAnimations) svg.pauseAnimations();
      svg.addEventListener("click", function (e) {
        var g = e.target.closest("[data-id]");
        if (g) show(seq.indexOf(g.getAttribute("data-id")));
      });
      svg.addEventListener("keydown", function (e) {
        var g = e.target.closest("[data-id]");
        if (g && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          show(seq.indexOf(g.getAttribute("data-id")));
        }
      });
      show(idx, true);
    }

    function show(i, keepTimer) {
      var seq = ORDER[mode];
      if (i < 0) return;
      idx = (i + seq.length) % seq.length;
      var id = seq[idx],
        st = STEPS[id];
      panel.querySelector(".camviz-step-title").textContent = st[0];
      panel.querySelector(".camviz-step-body").innerHTML = typeof st[1] === "string" ? st[1] : st[1][mode];
      panel.querySelector(".camviz-count").textContent = idx + 1 + " / " + seq.length;
      svg.querySelectorAll("[data-id]").forEach(function (g) {
        g.classList.toggle("active", g.getAttribute("data-id") === id);
      });
      if (!keepTimer && timer) {
        playing = false;
        sync();
      }
    }

    function sync() {
      clearInterval(timer);
      timer = null;
      if (playing)
        timer = setInterval(function () {
          show(idx + 1, true);
        }, 4500);
      panel.querySelector('[data-a="play"]').textContent = playing ? "❚❚ Pause tour" : "▶ Play tour";
      if (svg) playing ? svg.unpauseAnimations() : svg.pauseAnimations();
    }

    panel.addEventListener("click", function (e) {
      var a = e.target.getAttribute("data-a");
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

    var lastNarrow = null;
    function onResize() {
      var n = root.clientWidth < 620;
      if (n !== lastNarrow) {
        lastNarrow = n;
        draw();
      }
    }
    window.addEventListener("resize", onResize);
    onResize();
    sync();
  }

  // ---------------------------------------------------------------------------
  // 2. Bayer mosaic: scene -> RAW values -> RAW by filter color -> demosaiced
  // ---------------------------------------------------------------------------
  function scene(x, y, W, H) {
    var u = x / W,
      v = y / H;
    var c = [0.35 + 0.4 * v, 0.6 + 0.25 * v, 0.95]; // sky
    if (v > 0.62 + 0.08 * Math.sin(u * 6)) c = [0.2, 0.55 + 0.2 * (1 - v), 0.18]; // hill
    var dx = u - 0.72,
      dy = v - 0.28;
    if (dx * dx * 2.2 + dy * dy < 0.018) c = [1, 0.82, 0.15]; // sun
    if (u > 0.14 && u < 0.36 && v > 0.36 && v < 0.78) c = [0.85, 0.15, 0.2]; // red box
    if (u > 0.18 && u < 0.24 && v > 0.48 && v < 0.62) c = [0.95, 0.95, 0.95]; // window
    return c;
  }

  function filterAt(x, y) {
    // RGGB: 0 = R, 1 = G, 2 = B
    return y % 2 === 0 ? (x % 2 === 0 ? 0 : 1) : x % 2 === 0 ? 1 : 2;
  }

  function bayer(root) {
    var W = 48,
      H = 32;
    root.innerHTML = "";
    root.appendChild(el("div", { class: "camviz-title" }, "Interactive · what a RAW Bayer sensor really captures"));
    var grid = el("div", { class: "camviz-grid4" });
    var caps = [
      "<b>1. The scene.</b> Full color everywhere.",
      "<b>2. What the sensor sends.</b> One number per pixel: just brightness behind a color filter.",
      "<b>3. The same data, tinted</b> by each pixel's filter: the RGGB mosaic.",
      "<b>4. After demosaicing.</b> Each pixel borrows its missing colors from neighbours.",
    ];
    var cv = caps.map(function (cap) {
      var f = el("figure");
      var c = el("canvas", { width: W, height: H });
      f.appendChild(c);
      f.appendChild(el("figcaption", {}, cap));
      grid.appendChild(f);
      return c.getContext("2d");
    });
    root.appendChild(grid);
    root.appendChild(
      el(
        "p",
        { class: "camviz-caption" },
        "A tiny 48 × 32 example, magnified. Half the pixels see green, a quarter red, a quarter blue. Demosaicing (here simple bilinear interpolation) is one of the ISP's jobs, and real ISPs use much smarter edge-aware versions."
      )
    );

    var img = [0, 1, 2, 3].map(function (i) {
      return cv[i].createImageData(W, H);
    });
    var raw = new Float32Array(W * H);
    var x, y, i, o;
    for (y = 0; y < H; y++)
      for (x = 0; x < W; x++) {
        var c = scene(x + 0.5, y + 0.5, W, H),
          f = filterAt(x, y);
        i = y * W + x;
        o = i * 4;
        raw[i] = c[f];
        img[0].data.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], o);
        img[1].data.set([raw[i] * 255, raw[i] * 255, raw[i] * 255, 255], o);
        var t = [0, 0, 0];
        t[f] = raw[i] * 255;
        img[2].data.set([t[0], t[1], t[2], 255], o);
      }
    for (y = 0; y < H; y++)
      for (x = 0; x < W; x++) {
        var sum = [0, 0, 0],
          n = [0, 0, 0];
        for (var dy = -1; dy <= 1; dy++)
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx,
              yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            var ff = filterAt(xx, yy);
            sum[ff] += raw[yy * W + xx];
            n[ff]++;
          }
        var own = filterAt(x, y);
        var px = [0, 1, 2].map(function (ch) {
          return ch === own ? raw[y * W + x] : sum[ch] / n[ch];
        });
        img[3].data.set([px[0] * 255, px[1] * 255, px[2] * 255, 255], (y * W + x) * 4);
      }
    img.forEach(function (d, k) {
      cv[k].putImageData(d, 0, 0);
    });
  }

  // ---------------------------------------------------------------------------
  // 3. CSI-2 long packet striped across the data lanes
  // ---------------------------------------------------------------------------
  function lanes(root) {
    var bytes = [
      ["DI", "hdr"],
      ["WC", "hdr"],
      ["WC", "hdr"],
      ["ECC", "hdr"],
    ];
    for (var i = 0; i < 10; i++) bytes.push(["P" + i, "pay"]);
    bytes.push(["CRC", "ftr"], ["CRC", "ftr"]);
    var nLanes = 4,
      step = 0,
      timer = null;

    root.innerHTML = "";
    root.appendChild(el("div", { class: "camviz-title" }, "Interactive · one CSI-2 packet on the wire"));
    var bar = el("div", { class: "camviz-toolbar" }, "Data lanes:");
    [1, 2, 4].forEach(function (n) {
      var b = el("button", { type: "button", "data-n": n, class: n === 4 ? "active" : "" }, String(n));
      bar.appendChild(b);
    });
    var replay = el("button", { type: "button" }, "↻ Replay");
    bar.appendChild(replay);
    root.appendChild(bar);
    var pkt = el("div", { class: "camviz-bytes", "aria-hidden": "true" });
    root.appendChild(pkt);
    var lanesBox = el("div");
    root.appendChild(lanesBox);
    var info = el("p", { class: "camviz-caption" });
    root.appendChild(info);
    root.appendChild(
      el(
        "div",
        { class: "camviz-legend" },
        '<span><i style="background:#f59e0b"></i>Header: data identifier (virtual channel + data type), word count, ECC</span>' +
          '<span><i style="background:var(--global-theme-color)"></i>Payload: one line of pixels</span>' +
          '<span><i style="background:#10b981"></i>Footer: CRC checksum</span>'
      )
    );

    function build() {
      pkt.innerHTML = bytes
        .map(function (b) {
          return '<span class="camviz-byte ' + b[1] + '">' + b[0] + "</span>";
        })
        .join("");
      var h = '<div class="camviz-lane"><span>clock</span><div class="camviz-clock"></div></div>';
      for (var l = 0; l < nLanes; l++) h += '<div class="camviz-lane" data-l="' + l + '"><span>lane ' + (l + 1) + "</span></div>";
      lanesBox.innerHTML = h;
      info.textContent = "";
      step = 0;
    }

    function tick() {
      if (step >= bytes.length) {
        var t = Math.ceil(bytes.length / nLanes);
        info.textContent =
          bytes.length +
          " bytes took " +
          t +
          " byte-times on " +
          nLanes +
          " lane" +
          (nLanes > 1 ? "s" : "") +
          ". Byte n goes to lane (n mod " +
          nLanes +
          "); the receiver merges them back in order.";
        clearInterval(timer);
        timer = reduceMotion ? null : setTimeout(start, 3500);
        return;
      }
      var b = bytes[step];
      pkt.children[step].classList.add("on");
      var lane = lanesBox.querySelector('[data-l="' + (step % nLanes) + '"]');
      lane.appendChild(el("span", { class: "camviz-byte on " + b[1] + (reduceMotion ? "" : " pop") }, b[0]));
      step++;
    }

    function start() {
      clearInterval(timer);
      clearTimeout(timer);
      build();
      if (reduceMotion) {
        while (step < bytes.length) tick();
        tick(); // prints the summary
      } else {
        timer = setInterval(tick, 380);
      }
    }

    bar.addEventListener("click", function (e) {
      var n = e.target.getAttribute("data-n");
      if (n) {
        nLanes = +n;
        bar.querySelectorAll("[data-n]").forEach(function (b) {
          b.classList.toggle("active", b === e.target);
        });
        start();
      }
    });
    replay.addEventListener("click", start);

    // start when scrolled into view
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) {
          io.disconnect();
          start();
        }
      });
      build();
      io.observe(root);
    } else start();
  }

  // ---------------------------------------------------------------------------
  // 4. Bandwidth calculator (method from NXP UG10215, section 5.1)
  // ---------------------------------------------------------------------------
  var PRESETS = [
    { n: "AR2020 full res · 5120×3840 · 30 fps · RAW10", w: 5120, h: 3840, b: 10, f: 30 },
    { n: "AR2020 full res · 5120×3840 · 60 fps · RAW10", w: 5120, h: 3840, b: 10, f: 60 },
    { n: "4K · 3840×2160 · 30 fps · RAW10", w: 3840, h: 2160, b: 10, f: 30 },
    { n: "1080p · 1920×1080 · 60 fps · RAW10", w: 1920, h: 1080, b: 10, f: 60 },
  ];

  function bandwidth(root) {
    root.innerHTML = "";
    root.appendChild(el("div", { class: "camviz-title" }, "Interactive · will this camera mode fit on the i.MX95?"));
    var opts = PRESETS.map(function (p, i) {
      return '<option value="' + i + '">' + p.n + "</option>";
    }).join("");
    var form = el(
      "div",
      { class: "camviz-form" },
      '<label style="grid-column:1/-1">Preset<select data-k="preset">' +
        opts +
        '<option value="c">Custom</option></select></label>' +
        '<label>Width<input type="number" min="1" data-k="w"></label>' +
        '<label>Height<input type="number" min="1" data-k="h"></label>' +
        '<label>Bits per pixel<select data-k="b"><option>8</option><option>10</option><option>12</option></select></label>' +
        '<label>Frames per second<input type="number" min="1" data-k="f"></label>' +
        '<label>Data lanes<select data-k="l"><option>1</option><option>2</option><option selected>4</option></select></label>' +
        '<label>Blanking overhead %<input type="number" min="0" max="100" value="20" data-k="k"></label>' +
        '<label>RAW32 mode<select data-k="r"><option value="1" selected>enabled</option><option value="0">disabled</option></select></label>' +
        '<label>cam_isi_clk_root<select data-k="c"><option value="333.33">333.33 MHz (low drive)</option><option value="500" selected>500 MHz (nominal)</option><option value="666.67">666.67 MHz (override)</option></select></label>'
    );
    root.appendChild(form);
    var out = el("div");
    root.appendChild(out);
    root.appendChild(
      el(
        "p",
        { class: "camviz-caption" },
        "Limits from NXP's i.MX 95x Camera Porting Guide (UG10215): 10 Gbps per camera interface (2.5 Gbps per lane on 4 lanes), and the pixel clock of the formatter, ISI and ISP is derived from cam_isi_clk_root. RAW32 mode moves 2 pixels per clock for RAW10/12 and 4 for RAW8."
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
    }

    function meter(label, val, max, unit, digits) {
      var pct = Math.min(100, (val / max) * 100);
      return (
        '<div class="camviz-meter"><div class="camviz-meter-head"><span>' +
        label +
        "</span><span>" +
        val.toFixed(digits) +
        " / " +
        max.toFixed(digits) +
        " " +
        unit +
        '</span></div><div class="camviz-bar' +
        (val > max ? " over" : "") +
        '"><div style="width:' +
        pct +
        '%"></div></div></div>'
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
      var link = (w * h * b * f * (1 + k)) / 1e9; // Gbps
      var lane = link / l;
      var ppc = raw32 ? (b <= 8 ? 4 : 2) : 1;
      var pixclk = (w * h * f * (1 + k)) / ppc / 1e6; // MHz
      var ok = link <= 10 && lane <= 2.5 && pixclk <= clk;
      out.innerHTML =
        meter("Link bandwidth (whole interface)", link, 10, "Gbps", 2) +
        meter("Per lane (" + l + " lane" + (l > 1 ? "s" : "") + ")", lane, 2.5, "Gbps", 2) +
        meter("Pixel clock needed (" + ppc + " px/clock)", pixclk, clk, "MHz", 1) +
        '<p class="camviz-verdict ' +
        (ok ? "ok" : "bad") +
        '">' +
        (ok
          ? "✓ Fits."
          : "✗ Doesn't fit: " +
            (link > 10 || lane > 2.5 ? "the MIPI link is too slow for this mode. " : "") +
            (pixclk > clk ? "The camera domain pixel clock is too slow. " : "")) +
        " Sensor link frequency would be " +
        ((lane * 1e3) / 2).toFixed(0) +
        " MHz (lane rate ÷ 2, D-PHY is double data rate).</p>";
    }

    form.addEventListener("input", function (e) {
      var k = e.target.getAttribute("data-k");
      if (k === "preset") {
        if (e.target.value !== "c") preset(+e.target.value);
      } else if ("whbf".indexOf(k) >= 0) q("preset").value = "c";
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
