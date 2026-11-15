/* Site interactions, ported from the Framer code components: SiteFX, PixelRise, PixelGrid, FocusRows. */
(function () {
  "use strict";
  var clamp = function (v) { return Math.min(1, Math.max(0, v)); };
  var seed = function (a, b, k) { var s = Math.sin(a * 12.9898 + b * 78.233 + k) * 43758.5453; return s - Math.floor(s); };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var vh = function () { return window.innerHeight; };

  /* One scroll/resize loop shared by every effect */
  var scrollers = [];
  var queued = false;
  function runAll() { queued = false; for (var i = 0; i < scrollers.length; i++) scrollers[i](); }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(runAll); } }
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  function onScroll(fn) { scrollers.push(fn); fn(); }

  function cells(el, cols, rows, color) {
    el.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
    var frag = document.createDocumentFragment();
    for (var i = 0; i < cols * rows; i++) frag.appendChild(document.createElement("span"));
    el.textContent = "";
    el.appendChild(frag);
    if (color) el.style.setProperty("--c", color);
    return Array.prototype.slice.call(el.children);
  }
  function colsFor(el) {
    var w = window.innerWidth;
    return Number(w < 810 ? el.dataset.colsPhone || el.dataset.cols : w < 1200 ? el.dataset.colsTablet || el.dataset.cols : el.dataset.cols);
  }

  /* ---------- Word reveal and appear effects ---------- */
  document.querySelectorAll(".reveal-words").forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.setAttribute("aria-label", el.textContent.trim());
    el.innerHTML = words.map(function (w, i) {
      return '<span class="w" aria-hidden="true" style="transition-delay:' + (0.05 + i * 0.08).toFixed(2) + 's">' + w.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>";
    }).join(" ");
  });
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.2 }) : null;
  requestAnimationFrame(function () {
    document.querySelectorAll(".reveal-words, .appear").forEach(function (el) {
      if (el.hasAttribute("data-mount") || !io) el.classList.add("in"); else io.observe(el);
    });
  });

  /* ---------- Cursor orb and grain (SiteFX) ---------- */
  (function siteFX() {
    var grain = document.createElement("div");
    grain.className = "grain";
    grain.setAttribute("aria-hidden", "true");
    // case studies are mostly screens: no grain over them
    if (!document.body.classList.contains("case")) try {
      var c = document.createElement("canvas");
      c.width = c.height = 180;
      var g = c.getContext("2d"), img = g.createImageData(180, 180);
      for (var i = 0; i < img.data.length; i += 4) { var v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
      grain.style.backgroundImage = "url(" + c.toDataURL() + ")";
      document.body.appendChild(grain);
    } catch (e) { /* grain is decorative */ }

    // case studies keep the normal cursor: no orb, no trail of squares over the work
    if (!finePointer || document.body.classList.contains("case")) return;
    var orb = document.createElement("div");
    orb.className = "orb";
    orb.setAttribute("aria-hidden", "true");
    document.body.appendChild(orb);
    var tx = 0, ty = 0, x = 0, y = 0, seen = false;

    /* A trail of squares under the cursor. Orb and squares are one red, blended by difference,
       so they read teal on the paper, red on ink and violet on the blues: never black on black. */
    var layer = document.createElement("div");
    layer.className = "trail-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var live = new Map(), sweeping = 0, lastKey = "";
    var cellSize = function () { return Math.max(34, Math.round(window.innerWidth / 30)); };
    function light(c, r, ms) {
      var key = c + "," + r, hit = live.get(key), size = cellSize();
      if (!hit) {
        hit = { el: document.createElement("span"), until: 0 };
        hit.el.style.cssText = "left:" + c * size + "px;top:" + r * size + "px;width:" + size + "px;height:" + size + "px";
        layer.appendChild(hit.el); live.set(key, hit);
      }
      hit.until = Math.max(hit.until, performance.now() + ms);
    }
    function sweep() {
      var now = performance.now();
      live.forEach(function (hit, key) { if (now >= hit.until) { hit.el.remove(); live.delete(key); } });
      sweeping = live.size ? requestAnimationFrame(sweep) : 0;
    }
    function trail() {
      var size = cellSize(), c = Math.floor(tx / size), r = Math.floor(ty / size), key = c + "," + r;
      if (key === lastKey) return;
      lastKey = key;
      light(c, r, 420 + Math.random() * 320);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) { if (Math.random() < 0.3) light(c + d[0], r + d[1], 220 + Math.random() * 280); });
      if (!sweeping) sweeping = requestAnimationFrame(sweep);
    }
    function tick() {
      x += (tx - x) * 0.4; y += (ty - y) * 0.4;
      orb.style.transform = "translate(" + (x - 12.5) + "px," + (y - 12.5) + "px)";
      requestAnimationFrame(tick);
    }
    window.addEventListener("pointermove", function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!seen) { x = tx; y = ty; seen = true; }
      orb.style.opacity = "1";
      // no squares over screens and films: they would cover the work being shown
      if (!calm && e.pointerType === "mouse" && !(e.target.closest && e.target.closest("img, video, .flow-frame, .lightbox"))) trail();
    }, { passive: true });
    document.documentElement.addEventListener("mouseleave", function () { orb.style.opacity = "0"; });
    requestAnimationFrame(tick);
  })();

  /* ---------- PixelRise: stage (fills a pinned screen) and strip (stepped edge) ---------- */
  document.querySelectorAll("[data-rise]").forEach(function (root) {
    var mode = root.dataset.rise;
    var grid = mode === "stage" ? root.querySelector(".squares") : root;
    var list = [], cols = 0, rows = 0, last = "";
    function build() {
      cols = colsFor(root);
      var w = grid.clientWidth || window.innerWidth;
      var h = mode === "stage" ? vh() : root.clientHeight;
      var cell = w / cols;
      rows = Math.max(1, Math.ceil(h / cell));
      var sig = cols + "x" + rows;
      if (sig === last) return;
      last = sig;
      grid.style.gridAutoRows = cell + "px";
      list = cells(grid, cols, rows);
    }
    function on(c, y, p) {
      var edge = rows - 1 - y;
      var jitter = seed(c, edge, 4.1) * 1.25;
      if (mode === "strip") return p >= (edge + jitter) / rows;
      return p >= (edge + jitter) / (rows + 1.25);
    }
    onScroll(function () {
      build();
      var b = root.getBoundingClientRect(), h = vh();
      var p = reduced ? 1 : mode === "stage" ? clamp((h * 0.9 - b.top) / (h * 0.9)) : clamp((h - b.top) / (h * 0.7));
      for (var i = 0; i < list.length; i++) list[i].style.opacity = on(i % cols, Math.floor(i / cols), p) ? "1" : "0";
    });
  });

  /* ---------- PixelGrid: black edge dissolve and cursor trail ---------- */
  document.querySelectorAll("[data-grid]").forEach(function (el) {
    var mode = el.dataset.grid, list = [], cols = 0, rows = 0, last = "";
    function build() {
      cols = colsFor(el);
      var w = el.clientWidth || 1200, h = el.clientHeight || 700;
      rows = Math.max(1, Math.round(h / (w / cols)));
      el.style.gridTemplateRows = "repeat(" + rows + ", 1fr)";
      var sig = cols + "x" + rows;
      if (sig !== last) { last = sig; list = cells(el, cols, rows); }
    }
    if (mode === "edges") {
      var stays = function (c, r) { return c < Math.round(seed(r, 1, 0) * 2.6) || c >= cols - Math.round(seed(r, 2, 0) * 2.6); };
      onScroll(function () {
        build();
        var h = vh();
        var p = reduced ? 1 : clamp((h * 0.8 - el.getBoundingClientRect().top) / (h * 0.8));
        for (var i = 0; i < list.length; i++) {
          var c = i % cols, r = Math.floor(i / cols);
          list[i].style.opacity = stays(c, r) || p < 0.08 + seed(c * 31 + r, 3, 0) * 0.86 ? "1" : "0";
        }
      });
      return;
    }
    build();
    window.addEventListener("resize", build);
    if (!finePointer) return;
    var until = new Map(), raf = 0;
    function light(i, ms) { if (i < 0 || i >= list.length) return; list[i].style.opacity = "1"; until.set(i, performance.now() + ms); }
    function tick() {
      var now = performance.now();
      until.forEach(function (t, i) { if (now >= t) { list[i].style.opacity = "0"; until.delete(i); } });
      raf = until.size ? requestAnimationFrame(tick) : 0;
    }
    window.addEventListener("pointermove", function (e) {
      var b = el.getBoundingClientRect();
      if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) return;
      var c = Math.floor(((e.clientX - b.left) / b.width) * cols), r = Math.floor(((e.clientY - b.top) / b.height) * rows);
      light(c + r * cols, 450 + Math.random() * 350);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
        var nc = c + d[0], nr = r + d[1];
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && Math.random() < 0.3) light(nc + nr * cols, 250 + Math.random() * 300);
      });
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  });

  /* ---------- FocusRows: one-line titles, hover fill, per-band dissolve ---------- */
  document.querySelectorAll("[data-focus]").forEach(function (root) {
    var CELL = 72, MAX = 170, SHARE = 0.55;
    var bands = Array.prototype.slice.call(root.querySelectorAll(".band"));
    var titles = Array.prototype.slice.call(root.querySelectorAll(".frow-t"));
    var rowsEls = Array.prototype.slice.call(root.querySelectorAll(".frow"));
    var em = 12.4, all = [], last = "";
    function gutter() { var w = window.innerWidth; return w < 810 ? 20 : w < 1200 ? 28 : 44; }
    function pad() { var w = window.innerWidth; return w < 810 ? 40 : w < 1200 ? 56 : 72; }
    function measure() {
      var ctx = document.createElement("canvas").getContext("2d");
      ctx.font = "500 100px " + getComputedStyle(document.body).getPropertyValue("--sans");
      em = Math.max.apply(null, titles.map(function (t) { var s = t.textContent; return (ctx.measureText(s).width - s.length * 2) / 100; }));
    }
    function layout() {
      var full = root.clientWidth, gut = gutter(), width = Math.max(1, full - gut * 2);
      var compact = width < 768;
      root.classList.toggle("compact", compact);
      var room = compact ? width : width * SHARE - 24;
      var size = Math.min(MAX, Math.floor((room / em) * 0.82));
      var small = Math.max(12, Math.min(14, Math.round(width / 130)));
      root.style.setProperty("--small", small + "px");
      bands[0].style.height = bands[bands.length - 1].style.height = pad() + "px";
      bands.slice(1, -1).forEach(function (b) { b.style.padding = "0 " + gut + "px"; });
      titles.forEach(function (t) { t.style.fontSize = size + "px"; });
      rowsEls.forEach(function (r) { r.style.padding = compact ? "" : Math.round(size * 0.4) + "px 0 " + Math.round(size * 0.5) + "px"; });
      var cols = Math.max(4, Math.round(full / CELL));
      var n = bands.length;
      var spec = bands.map(function (b) { return Math.max(1, Math.round(b.offsetHeight / CELL)); });
      var sig = cols + "|" + spec.join();
      if (sig === last) return;
      last = sig;
      all = [];
      bands.forEach(function (b, band) {
        var grid = b.querySelector(".squares");
        var rows = spec[band];
        grid.style.gridTemplateRows = "repeat(" + rows + ", 1fr)";
        var list = cells(grid, cols, rows);
        list.forEach(function (cell, i) {
          var c = i % cols, r = Math.floor(i / cols);
          cell.dataset.t = String((((n - 1 - band) + (rows - 1 - r + 0.5) / rows) / n) * 0.5 + seed(c, band * 17 + r, 4.1) * 0.49);
          all.push(cell);
        });
      });
    }
    measure();
    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); last = ""; layout(); queue(); });
    window.addEventListener("resize", layout);
    onScroll(function () {
      var h = vh();
      var p = reduced ? 1 : clamp((h - root.getBoundingClientRect().bottom) / (h * 0.75));
      for (var i = 0; i < all.length; i++) all[i].style.opacity = p <= Number(all[i].dataset.t) ? "1" : "0";
    });
    rowsEls.forEach(function (r) {
      r.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") r.classList.add("on"); });
      r.addEventListener("pointerleave", function () { r.classList.remove("on"); });
    });
  });

  /* ---------- Contact form (Web3Forms, as on the previous site) ---------- */
  var form = document.getElementById("contact-form");
  if (form) {
    var btn = form.querySelector(".submit");
    var label = btn.textContent;
    var setState = function (state, text) { btn.dataset.state = state; btn.textContent = text; btn.disabled = state === "sending"; };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      setState("sending", "SENDING…");
      fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.success) throw new Error("rejected");
          setState("sent", "THANKS, I’LL BE IN TOUCH");
          form.reset();
          if (window.gtag) window.gtag("event", "form_submission", { form_type: "contact", form_status: "success" });
        })
        .catch(function () {
          setState("error", "SOMETHING WENT WRONG. TRY AGAIN");
          if (window.gtag) window.gtag("event", "form_submission", { form_type: "contact", form_status: "error" });
        });
    });
    form.addEventListener("input", function () { if (btn.dataset.state === "sent" || btn.dataset.state === "error") { btn.dataset.state = ""; btn.textContent = label; } });
  }
})();
