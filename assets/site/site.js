/* Site interactions: load reveals, the comet at the pointer, What I do, the Work list, the contact form.
   Scroll reveals are CSS (scroll timelines in site.css). */
(function () {
  "use strict";
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

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

  /* ---------- Grain, and the comet that follows the pointer over the 3D scenes ---------- */
  (function siteFX() {
    // case studies are mostly screens: no grain over them
    if (!document.body.classList.contains("case")) try {
      var grain = document.createElement("div");
      grain.className = "grain";
      grain.setAttribute("aria-hidden", "true");
      var c = document.createElement("canvas");
      c.width = c.height = 180;
      var g = c.getContext("2d"), img = g.createImageData(180, 180);
      for (var i = 0; i < img.data.length; i += 4) { var v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
      grain.style.backgroundImage = "url(" + c.toDataURL() + ")";
      document.body.appendChild(grain);
    } catch (e) { /* grain is decorative */ }

    /* The comet: a pale core in a gold ball in a red coat, each a rounded shape with a torn, restless edge, and a
       tail along the way it came that closes to a single point. It is drawn in the scene's own colours, as flat
       shapes. Under it lies a lens: where the comet is and has just been, the page shows through in black and
       white, tinted orange and yellow nearer the fire. The lens fades more slowly than the tail.
       It exists only over the scenes (the home hero, the footer, a case study's hero); everywhere else the pointer
       is the plain one. */
    if (!finePointer) return;
    var SCENES = ".hero, .foot, .cs-hero";
    function layer(name) {
      var el = document.createElement("canvas");
      el.className = name;
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
      return el;
    }
    var glass = layer("comet-lens"), cv = layer("comet");
    var ctx = cv.getContext("2d"), lens = glass.getContext("2d");
    if (!ctx || !lens) return;
    var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var RED = "#D4573B", RUST = "#A9402A", SUN = "#E6C046", GLOW = "#F5D75E", CREAM = "#FBEFC6";
    var GREY = "#808080", AMBER = "#E2873A", STRAW = "#EFC44A";   // the lens: these give the page their hue and keep its light and dark
    var R = 18, LIFE = 560, BURN = 1300; // head radius; how long a point of the tail lasts, and of the lens behind it, ms
    var tx = 0, ty = 0, x = 0, y = 0, seen = false, inside = false, show = 0, raf = 0, last = 0;
    var path = [];                       // where the head has been, newest first: {x, y, t}
    function size() {
      var d = Math.min(2, window.devicePixelRatio || 1);
      [[cv, ctx], [glass, lens]].forEach(function (p) {
        p[0].width = Math.round(window.innerWidth * d); p[0].height = Math.round(window.innerHeight * d);
        p[1].setTransform(d, 0, 0, d, 0, 0);
      });
    }
    /* Roughness for the silhouettes: a value between -1 and 1 that changes abruptly every few pixels along an
       edge and again a few times a second, like a torn or grainy outline. */
    function rough(along, seed, now) {
      var s = Math.sin(Math.floor(along / 3) * 12.9898 + seed * 78.233 + Math.floor(now / 90) * 37.719) * 43758.5453;
      return (s - Math.floor(s)) * 2 - 1;
    }
    /* One flame: a ribbon along the path, from `from` to `to` of `life`. It starts `off` to one side and `w` wide,
       then closes in on the path and narrows to a point, so all the flames end together as one tip. `lick` makes
       its edges waver like fire; `grit` roughens them, in pixels. */
    function flame(c, now, life, from, to, off, w, lick, grit) {
      var L = [], Rt = [], n = path.length, run = 0;
      for (var k = 0; k < n; k++) {
        if (k) run += Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y);
        var f = (now - path[k].t) / life;
        if (f < from) continue;
        if (f > to) {
          // a fast stroke leaves the points far apart: end the flame exactly where its life runs out, on a point
          if (L.length) {
            var pf = (now - path[k - 1].t) / life, q = (to - pf) / (f - pf);
            var ex = path[k - 1].x + (path[k].x - path[k - 1].x) * q, ey = path[k - 1].y + (path[k].y - path[k - 1].y) * q;
            L.push([ex, ey]); Rt.push([ex, ey]);
          }
          break;
        }
        var a = path[Math.max(0, k - 1)], b = path[Math.min(n - 1, k + 1)];
        var dx = a.x - b.x, dy = a.y - b.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
        var u = (f - from) / (to - from), half = w * Math.pow(1 - u, 1.2), side = off * Math.pow(1 - u, 1.7);
        var g = grit ? grit * Math.min(1, half / 4) : 0;   // the roughness dies out with the flame, so the tip stays a point
        var hl = half * (lick ? 1 + lick * Math.sin(run / 8 - now * 0.013) : 1) + g * rough(run, w + 1, now);
        var hr = half * (lick ? 1 + lick * Math.sin(run / 6 + 1.7 - now * 0.011) : 1) + g * rough(run, w + 9, now);
        L.push([path[k].x + nx * (side + hl), path[k].y + ny * (side + hl)]);
        Rt.push([path[k].x + nx * (side - hr), path[k].y + ny * (side - hr)]);
      }
      if (L.length < 2) return;
      c.beginPath();
      c.moveTo(L[0][0], L[0][1]);
      for (var q = 1; q < L.length; q++) c.lineTo(L[q][0], L[q][1]);
      for (q = Rt.length - 1; q >= 0; q--) c.lineTo(Rt[q][0], Rt[q][1]);
      c.closePath(); c.fill();
    }
    /* A layer of the head: a round shape whose edge swells slowly in a few places and is torn in small bites. */
    function blob(c, now, rad, swell, grit, seed) {
      var n = Math.max(18, Math.round(rad * 1.6));
      c.beginPath();
      for (var k = 0; k < n; k++) {
        var a = k / n * 6.2832;
        var rr = rad * (1 + swell * (0.6 * Math.sin(a * 3 + seed + now * 0.004) + 0.4 * Math.sin(a * 5 - seed * 2 - now * 0.0055))) + grit * rough(k * 3, seed, now);
        if (k) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.closePath(); c.fill();
    }
    function draw(now) {
      raf = 0;
      var dt = Math.min(48, now - (last || now)); last = now;
      var k = 1 - Math.pow(0.001, dt / 110);
      x += (tx - x) * k; y += (ty - y) * k;
      show += ((inside ? 1 : 0) - show) * Math.min(1, dt / 120);
      if (!path.length || Math.hypot(path[0].x - x, path[0].y - y) > 0.5) path.unshift({ x: x, y: y, t: now });
      while (path.length && now - path[path.length - 1].t > BURN) path.pop();
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      lens.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (show > 0.01) {
        var r = R * show, t = calm ? 0 : now;
        // the lens: black and white where the comet has been (laid down four times, each shorter, so it is
        // strongest just behind the head), then orange and yellow closer in
        lens.fillStyle = GREY;
        if (!calm) {
          lens.globalAlpha = 0.5 * show;
          flame(lens, now, BURN, 0, 1, 0, r * 2.9, 0, 4);
          flame(lens, now, BURN, 0, 0.7, 0, r * 2.9, 0, 4);
          flame(lens, now, BURN, 0, 0.45, 0, r * 2.9, 0, 4);
          flame(lens, now, BURN, 0, 0.22, 0, r * 2.9, 0, 4);
        }
        lens.globalAlpha = 0.96 * show;
        blob(lens, t, r * 3.3, 0.1, 4, 5);
        lens.fillStyle = AMBER;
        lens.globalAlpha = 0.72 * show;
        if (!calm) flame(lens, now, BURN, 0, 0.5, r * 0.35, r * 1.55, 0, 3);
        blob(lens, t, r * 2.3, 0.12, 3, 6);
        lens.fillStyle = STRAW;
        lens.globalAlpha = 0.75 * show;
        if (!calm) flame(lens, now, BURN, 0, 0.3, -r * 0.3, r * 1.15, 0, 2.5);
        blob(lens, t, r * 1.72, 0.1, 2.5, 7);
        lens.globalAlpha = 1;
        // the comet itself: red outside, with the tail's widest flames
        ctx.fillStyle = RED;
        if (!calm) {
          flame(ctx, now, LIFE, 0, 1, 0, r * 1.02, 0.16, 2.6);
          flame(ctx, now, LIFE, 0.02, 0.8, r * 0.8, r * 0.42, 0.2, 2.2);
          flame(ctx, now, LIFE, 0.02, 0.72, -r * 0.84, r * 0.4, 0.2, 2.2);
        }
        blob(ctx, t, r * 1.34, 0.07, 2.2, 1);
        if (!calm) {
          ctx.fillStyle = RUST;                            // two dark licks inside the tail
          flame(ctx, now, LIFE, 0.05, 0.86, r * 0.56, r * 0.08, 0, 0.8);
          flame(ctx, now, LIFE, 0.05, 0.78, -r * 0.54, r * 0.07, 0, 0.8);
        }
        // gold inside the red; the tail is slimmer than the ball, so the ball stays a ball
        ctx.fillStyle = SUN;
        if (!calm) flame(ctx, now, LIFE, 0, 0.74, 0, r * 0.66, 0.12, 2);
        blob(ctx, t, r * 0.98, 0.06, 1.6, 2);
        ctx.fillStyle = GLOW;
        if (!calm) flame(ctx, now, LIFE, 0, 0.52, 0, r * 0.4, 0.1, 1.5);
        // and the pale core
        ctx.fillStyle = CREAM;
        if (!calm) flame(ctx, now, LIFE, 0, 0.32, 0, r * 0.17, 0, 1);
        blob(ctx, t, r * 0.56, 0.05, 1, 3);
      }
      // over a scene the head keeps stirring; away from one, or with reduced motion, the drawing stops once it has settled
      var settled = Math.abs(tx - x) < 0.1 && Math.abs(ty - y) < 0.1 && path.length < 2 && Math.abs((inside ? 1 : 0) - show) < 0.01;
      if (settled && (calm || !inside)) last = 0; else kick();
    }
    function kick() { if (!raf) raf = requestAnimationFrame(draw); }
    function place(e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      tx = e.clientX; ty = e.clientY;
      if (!seen) { x = tx; y = ty; seen = true; }
      var was = inside;
      inside = !!(e.target && e.target.closest && e.target.closest(SCENES)) && !e.target.closest(".lightbox");
      if (inside && !was && show < 0.05) { x = tx; y = ty; path.length = 0; } // arrives where the pointer is, not from where it last left
      kick();
    }
    size();
    window.addEventListener("resize", function () { size(); kick(); });
    window.addEventListener("pointermove", place, { passive: true });
    // the page can scroll a scene away from under a resting pointer
    window.addEventListener("scroll", function () {
      if (!seen) return;
      var el = document.elementFromPoint(tx, ty);
      inside = !!(el && el.closest && el.closest(SCENES));
      kick();
    }, { passive: true });
    document.documentElement.addEventListener("mouseleave", function () { inside = false; kick(); });
  })();

  /* ---------- What I do: a heading's text shrinks into its bar as the heading comes to hold at the top ----------
     Each heading is followed by an empty gap. --c is how much of that gap has gone under the heading (0 to 1);
     the type size follows it in CSS. A held heading under the pointer opens again and pushes the ones below down. */
  (function whatList() {
    var heads = Array.prototype.slice.call(document.querySelectorAll(".what-head"));
    if (!heads.length) return;
    var list = heads[0].parentNode, held = window.matchMedia("(min-width: 900px) and (min-height: 620px)"), over = -1;
    function update() {
      if (!held.matches) { heads.forEach(function (h) { h.style.removeProperty("--c"); h.style.removeProperty("--shift"); h.classList.remove("on"); }); return; }
      var cs = getComputedStyle(list), bar = parseFloat(cs.getPropertyValue("--bar")) || 64, grow = parseFloat(cs.getPropertyValue("--grow")) || 30, shift = 0;
      heads.forEach(function (head, i) {
        var gap = head.nextElementSibling.getBoundingClientRect();
        var c = Math.max(0, Math.min(1, ((i + 1) * bar + shift - gap.top) / (gap.height || 1)));
        head.style.setProperty("--c", c.toFixed(3));
        head.style.setProperty("--shift", shift.toFixed(1) + "px");
        head.classList.toggle("on", i === over);
        if (i === over) shift += c * grow;
      });
    }
    heads.forEach(function (head, i) {
      head.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") { over = i; update(); } });
    });
    list.addEventListener("pointerleave", function () { over = -1; update(); });
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  })();

  /* ---------- Work: a row opens only while the pointer is on it (or it holds focus) ----------
     A row that scrolls in under a resting pointer stays closed: only a pointer that has really moved opens one. */
  (function workList() {
    var rows = Array.prototype.slice.call(document.querySelectorAll(".wrow"));
    if (!rows.length) return;
    var list = rows[0].parentNode, timer = 0, mx = -1, my = -1;
    function open(row) { rows.forEach(function (r) { r.classList.toggle("open", r === row); }); }
    list.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse" || (e.clientX === mx && e.clientY === my)) return;
      mx = e.clientX; my = e.clientY;
      var row = e.target.closest ? e.target.closest(".wrow") : null;
      if (!row || row.classList.contains("open")) return;
      clearTimeout(timer);
      timer = setTimeout(function () { open(row); }, 70); // a pointer crossing the list on its way elsewhere opens nothing
    }, { passive: true });
    list.addEventListener("pointerleave", function () { clearTimeout(timer); open(null); });
    rows.forEach(function (row) { row.addEventListener("focus", function () { open(row); }); });
    list.addEventListener("focusout", function (e) { if (!list.contains(e.relatedTarget)) open(null); });

    /* A tag rides the pointer over the rows and says what a click does. */
    if (!finePointer) return;
    var LOCK = '<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M2.5 5V3.5a2.5 2.5 0 015 0V5" fill="none" stroke="currentColor"/><rect x="1" y="5" width="8" height="6.5" fill="currentColor"/></svg>';
    var tag = document.createElement("div");
    tag.className = "cursor-tag";
    tag.setAttribute("aria-hidden", "true");
    document.body.appendChild(tag);
    var shown = null, px = -1, py = -1;
    function show(row) {
      if (row === shown) return;
      shown = row;
      if (row) tag.innerHTML = (row.hasAttribute("data-locked") ? LOCK : "") + "View case study";
      tag.classList.toggle("on", !!row);
    }
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      px = e.clientX; py = e.clientY;
      var row = e.target.closest ? e.target.closest(".wrow") : null;
      show(row);
      if (row) tag.style.transform = "translate(" + (px + 18) + "px," + (py + 18) + "px)";
    }, { passive: true });
    // the page can move under a resting pointer: check what is under it again
    window.addEventListener("scroll", function () {
      if (px < 0) return;
      var el = document.elementFromPoint(px, py);
      show(el && el.closest ? el.closest(".wrow") : null);
    }, { passive: true });
    document.documentElement.addEventListener("mouseleave", function () { px = -1; show(null); });
  })();

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
