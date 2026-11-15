/* Case-study pages: journey chapters, the screen viewer, and for protected studies, client-side decryption.
   Protected content ships only as AES-GCM ciphertext; the password derives the key (PBKDF2-SHA256). */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wide = window.matchMedia("(min-width: 1024px) and (min-height: 600px)"); // where journeys pin; site.css uses the same query
  var ARROW = function (d) { return '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'; };

  /* ---------- Viewer: one screen at a time; a journey steps through with the arrows ---------- */
  var box = document.createElement("dialog");
  box.className = "lightbox";
  box.setAttribute("aria-label", "Screen viewer");
  box.innerHTML =
    '<div class="lb-top"><span class="lb-count micro"></span><button type="button" class="lb-btn lb-close" aria-label="Close viewer">' + ARROW("M3 3l12 12M15 3L3 15") + "</button></div>" +
    '<button type="button" class="lb-btn lb-prev" aria-label="Previous screen">' + ARROW("M11 3L5 9l6 6") + "</button>" +
    '<img class="lb-img" alt="">' +
    '<button type="button" class="lb-btn lb-next" aria-label="Next screen">' + ARROW("M7 3l6 6-6 6") + "</button>" +
    '<p class="lb-cap"></p>';
  document.body.appendChild(box);
  var lbImg = box.querySelector(".lb-img"), lbCap = box.querySelector(".lb-cap"), lbCount = box.querySelector(".lb-count");
  var lbPrev = box.querySelector(".lb-prev"), lbNext = box.querySelector(".lb-next");
  var set = [], at = 0, onStep = null;

  function show(i) {
    at = Math.max(0, Math.min(set.length - 1, i));
    var s = set[at];
    lbImg.src = s.img.currentSrc || s.img.src;
    box.classList.toggle("tall", s.img.naturalHeight > s.img.naturalWidth * 1.2);
    box.scrollTop = 0;
    lbImg.alt = s.img.alt;
    lbCap.textContent = s.cap || "";
    lbCount.textContent = set.length > 1 ? (at + 1) + " / " + set.length : "";
    lbPrev.hidden = lbNext.hidden = set.length < 2;
    lbPrev.disabled = at === 0; lbNext.disabled = at === set.length - 1;
    if (onStep) onStep(at);
  }
  function openViewer(items, i, follow) {
    if (!items.length || !items[i].img.src) return;
    set = items; onStep = follow || null;
    show(i);
    box.showModal();
  }
  lbPrev.addEventListener("click", function () { show(at - 1); });
  lbNext.addEventListener("click", function () { show(at + 1); });
  box.querySelector(".lb-close").addEventListener("click", function () { box.close(); });
  box.addEventListener("click", function (e) { if (e.target === box) box.close(); });
  box.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { show(at + 1); e.preventDefault(); }
    if (e.key === "ArrowLeft") { show(at - 1); e.preventDefault(); }
  });

  /* Single screens and small groups outside journeys */
  function wireShots(root) {
    root.querySelectorAll(".shot button").forEach(function (b) {
      if (b.closest(".flow")) return;
      var group = b.closest(".routes");
      b.addEventListener("click", function () {
        var buttons = group ? Array.prototype.slice.call(group.querySelectorAll(".shot button")) : [b];
        var items = buttons.map(function (x) {
          var cap = x.parentNode.querySelector("figcaption");
          return { img: x.querySelector("img"), cap: cap ? cap.textContent.replace(/^\s*[A-Z0-9]\s*/, "") : "" };
        });
        openViewer(items, buttons.indexOf(b));
      });
    });
    // plain figures (diagrams, long screens) open in the viewer too, where they can be read at full size
    root.querySelectorAll(".cs-sec figure:not(.shot):not(.film) > img").forEach(function (img) {
      var cap = img.parentNode.querySelector("figcaption");
      img.classList.add("zoomable");
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", "Open full size: " + img.alt);
      var go = function () { openViewer([{ img: img, cap: cap ? cap.textContent : "" }], 0); };
      img.addEventListener("click", go);
      img.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  /* ---------- Journeys ----------
     .stage > .stage-card(.stage-n, h3, p) + .strip > figure.shot(button > img, figcaption > b) becomes a chapter:
     the heading, its sentence and a numbered step list beside one big screen. On wide screens the chapter holds
     in view while the page scrolls through its steps. */
  var flows = [];
  function buildFlows(root) {
    root.querySelectorAll(".board .stage").forEach(function (stage) {
      var card = stage.querySelector(".stage-card"), shots = stage.querySelectorAll(".strip .shot");
      if (!card || !shots.length) return;
      var num = ((card.querySelector(".stage-n") || {}).textContent || "").match(/\d+/);
      var title = card.querySelector("h3"), text = card.querySelector("p");
      var steps = Array.prototype.map.call(shots, function (f) {
        var img = f.querySelector("img"), cap = f.querySelector("figcaption"), b = cap && cap.querySelector("b");
        return { img: img, cap: cap ? cap.textContent.replace(b ? b.textContent : "", "").trim() : img.alt };
      });

      var flow = document.createElement("div");
      flow.className = "flow";
      flow.style.setProperty("--n", steps.length);
      var id = "flow-" + flows.length;
      flow.innerHTML =
        '<div class="flow-pin"><div class="flow-side">' +
        '<h3 class="flow-title">' + (num ? '<span class="flow-n">' + num[0] + "</span>" : "") + "<span></span></h3>" +
        (text ? "<p></p>" : "") +
        '<ol class="flow-steps" aria-label="Steps"></ol></div>' +
        '<div class="flow-screen"><button type="button" class="flow-frame" aria-describedby="' + id + '-count"></button>' +
        '<div class="flow-nav"><button type="button" class="flow-btn flow-prev" aria-label="Previous screen"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M11 3.5 5.5 9l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>' +
        '<p class="flow-count micro" id="' + id + '-count" aria-live="polite"></p>' +
        '<button type="button" class="flow-btn flow-next" aria-label="Next screen"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M7 3.5 12.5 9 7 14.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button></div></div></div>';
      flow.querySelector(".flow-title span:last-child").textContent = title ? title.textContent : "";
      if (text) flow.querySelector(".flow-side > p").textContent = text.textContent;

      var list = flow.querySelector(".flow-steps"), frame = flow.querySelector(".flow-frame"), count = flow.querySelector(".flow-count");
      var prev = flow.querySelector(".flow-prev"), next = flow.querySelector(".flow-next");
      var items = [], bigs = [];
      steps.forEach(function (s, i) {
        var li = document.createElement("li");
        li.innerHTML = '<button type="button" class="flow-step"><span class="k">' + (i + 1) + "</span><span></span></button>";
        li.querySelector("span:last-child").textContent = s.cap;
        // phones: the screen sits under its step
        var small = s.img.cloneNode(false);
        small.className = "flow-m"; small.loading = "lazy";
        li.appendChild(small);
        list.appendChild(li);
        var big = s.img.cloneNode(false);
        big.loading = i < 2 ? "eager" : "lazy";
        frame.appendChild(big);
        bigs.push(big);
        items.push({ img: big, cap: s.cap, li: li, small: small });
      });

      // one resting point per screen, in the middle of its stretch of scrolling: the page settles there
      steps.forEach(function (_, i) {
        var snap = document.createElement("i");
        snap.className = "flow-snap"; snap.style.setProperty("--k", (i + 0.5) / steps.length);
        flow.appendChild(snap);
      });
      var pin = flow.querySelector(".flow-pin");
      var state = { el: flow, pin: pin, items: items, list: list, frame: frame, count: count, active: -1 };
      function activate(i) {
        if (i === state.active) return;
        state.active = i;
        items.forEach(function (it, k) {
          it.li.classList.toggle("on", k === i);
          it.li.querySelector(".flow-step").setAttribute("aria-current", k === i ? "step" : "false");
          it.img.classList.toggle("on", k === i);
          if (k <= i + 1) it.img.loading = "eager";
        });
        frame.setAttribute("aria-label", "Open screen " + (i + 1) + " full size: " + items[i].img.alt);
        count.textContent = (i + 1) + " / " + items.length;
        list.style.setProperty("--p", items.length > 1 ? i / (items.length - 1) : 1);
        prev.disabled = i === 0; next.disabled = i === items.length - 1;
      }
      state.activate = activate;
      activate(0);

      // a step, the arrows and the arrow keys all scroll the page to the point where that step is showing,
      // so scrolling and clicking always agree on which screen is up
      function goTo(i) {
        i = Math.max(0, Math.min(items.length - 1, i));
        if (!wide.matches) { items[i].small.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); return; }
        var top = flow.getBoundingClientRect().top + window.scrollY, run = flow.offsetHeight - pin.offsetHeight;
        window.scrollTo({ top: top - pinTop(pin) + run * (i + 0.5) / items.length, behavior: reduced ? "auto" : "smooth" });
        activate(i);
      }
      state.goTo = goTo;
      prev.addEventListener("click", function () { goTo(state.active - 1); });
      next.addEventListener("click", function () { goTo(state.active + 1); });
      items.forEach(function (it, i) {
        it.li.querySelector(".flow-step").addEventListener("click", function () { goTo(i); });
        it.small.addEventListener("click", function () { openViewer(items, i); });
      });
      frame.addEventListener("click", function () {
        openViewer(items, state.active, function (k) { activate(k); });
      });

      stage.textContent = "";
      stage.appendChild(flow);
      flows.push(state);
    });
    track();
  }

  function pinTop(pin) { return parseFloat(getComputedStyle(pin).top) || 0; } // the folded section bars above the journey
  // a section's bar shows once its heading has gone under the stack of bars
  function bars() {
    var list = document.querySelectorAll(".cs-bar");
    for (var i = 0; i < list.length; i++) {
      var b = list[i], sec = b.nextElementSibling, p = 0;
      if (wide.matches && sec) {
        // the heading is folded by exactly as much as its section has been scrolled past its slot, so its lower
        // edge travels with the text beneath it
        var cs = getComputedStyle(b), slot = parseFloat(cs.top) || 0, h = b.offsetHeight;
        var room = parseFloat(getComputedStyle(sec).paddingTop) || 1;
        p = Math.min(1, Math.max(0, (slot + h - sec.getBoundingClientRect().top) / room));
      }
      if (b._p === p) continue;
      b._p = p;
      b.style.setProperty("--p", p.toFixed(4));
      b.classList.toggle("on", p === 1);
      if (p === 1) b.tabIndex = 0; else b.removeAttribute("tabindex");
    }
  }
  // a folded heading takes you back to its section
  function openBar(b) {
    var sec = b.nextElementSibling; if (!sec || !b.classList.contains("on")) return;
    var slot = parseFloat(getComputedStyle(b).top) || 0;
    window.scrollTo({ top: window.scrollY + sec.getBoundingClientRect().top - b.offsetHeight - slot, behavior: reduced ? "auto" : "smooth" });
  }
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest(".cs-bar"); if (b) openBar(b); });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.classList && e.target.classList.contains("cs-bar")) openBar(e.target); });
  function track() {
    bars();
    if (!wide.matches) return;
    var h = window.innerHeight;
    flows.forEach(function (f) {
      var r = f.el.getBoundingClientRect(), top = pinTop(f.pin), run = r.height - f.pin.offsetHeight;
      if (run <= 0 || r.bottom < 0 || r.top > h) return;
      var p = Math.min(0.9999, Math.max(0, (top - r.top) / run));
      f.activate(Math.floor(p * f.items.length));
    });
  }
  // ← and → step through the journey that is holding the screen
  document.addEventListener("keydown", function (e) {
    if (box.open || !wide.matches || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    var h = window.innerHeight;
    flows.some(function (f) {
      var r = f.el.getBoundingClientRect();
      if (r.top > pinTop(f.pin) + 1 || r.bottom < h - 1) return false;
      f.goTo(f.active + (e.key === "ArrowRight" ? 1 : -1));
      e.preventDefault();
      return true;
    });
  });
  var queued = false;
  function queue() { if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; track(); }); } }
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  if (wide.addEventListener) wide.addEventListener("change", queue);

  function enhance(root) {
    buildFlows(root);
    wireShots(root);
  }

  var sealedEl = document.getElementById("sealed");
  if (!sealedEl) { enhance(document); return; }

  /* ---------- Decryption ---------- */
  var sealed = JSON.parse(sealedEl.textContent);
  var gate = document.getElementById("gate");
  var out = document.getElementById("protected");
  var STORE = "yv-case-key";
  var enc = new TextEncoder(), dec = new TextDecoder();
  var b64 = function (s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  var toB64 = function (buf) { var u = new Uint8Array(buf), s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };

  function deriveRaw(password) {
    return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]).then(function (base) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64(sealed.salt), iterations: sealed.iter }, base, 256);
    });
  }
  function importKey(raw) { return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]); }
  function open(key, bytes) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12)); }

  function hydrate(key) {
    var cache = {};
    var blobUrl = function (url, type) {
      if (!cache[url]) {
        cache[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(function (buf) { return open(key, new Uint8Array(buf)); })
          .then(function (plain) { return URL.createObjectURL(new Blob([plain], { type: type })); });
      }
      return cache[url];
    };
    // the same screen can appear twice in a journey (big and phone-sized): each file is decrypted once
    out.querySelectorAll("img[data-enc]").forEach(function (img) {
      blobUrl(img.dataset.enc, img.dataset.type).then(function (u) { img.src = u; });
    });
    out.querySelectorAll(".video[data-enc]").forEach(function (v) {
      var poster = document.createElement("img");
      poster.alt = "";
      v.appendChild(poster);
      blobUrl(v.dataset.poster, v.dataset.posterType).then(function (u) { poster.src = u; });
      var play = document.createElement("button");
      play.type = "button";
      play.className = "play";
      play.innerHTML = '<span class="play-dot"><svg viewBox="0 0 14 16" aria-hidden="true"><path d="M0 0l14 8-14 8z" fill="currentColor"/></svg></span><span class="play-txt">Play the recording<small>' + v.dataset.size + "</small></span>";
      play.setAttribute("aria-label", v.dataset.label || "Play recording");
      v.appendChild(play);
      play.addEventListener("click", function () {
        play.disabled = true;
        play.querySelector(".play-txt").textContent = "Loading…";
        blobUrl(v.dataset.enc, "video/mp4").then(function (u) {
          var el = document.createElement("video");
          el.src = u; el.controls = true; el.muted = true; el.playsInline = true;
          el.setAttribute("aria-label", v.dataset.label || "");
          v.textContent = "";
          v.appendChild(el);
          el.play().catch(function () {});
        }).catch(function () { play.disabled = false; play.querySelector(".play-txt").textContent = "Couldn’t load. Try again"; });
      });
    });
  }

  function reveal(key) {
    return open(key, b64(sealed.body)).then(function (plain) {
      out.innerHTML = dec.decode(plain);
      // a body that opens on a film already leads with a picture: the cover would only repeat it
      var first = out.querySelector(".cs-sec");
      var cover = document.querySelector("[data-cover]");
      if (cover && first && first.classList.contains("cs-open") && first.querySelector(".film")) cover.remove();
      out.style.display = "contents";
      out.hidden = false;
      gate.hidden = true;
      enhance(out);
      hydrate(key);
    });
  }

  var stored = null;
  try { stored = JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { stored = null; }
  if (stored && stored.salt === sealed.salt) {
    importKey(b64(stored.key)).then(reveal).catch(function () { gate.hidden = false; });
  } else {
    gate.hidden = false;
  }

  var form = gate.querySelector("form"), err = gate.querySelector(".gate-err"), btn = gate.querySelector(".submit");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = form.password.value;
    if (!pw) { err.textContent = "Enter the password to continue."; return; }
    btn.disabled = true; btn.textContent = "UNLOCKING…"; err.textContent = "";
    var raw;
    deriveRaw(pw).then(function (r) { raw = r; return importKey(r); }).then(reveal).then(function () {
      try { localStorage.setItem(STORE, JSON.stringify({ salt: sealed.salt, key: toB64(raw) })); } catch (e2) { /* stays unlocked for this page view */ }
    }).catch(function () {
      err.textContent = "That password didn’t work. Check it and try again.";
      btn.disabled = false; btn.textContent = "UNLOCK";
      form.password.select();
    });
  });
})();
