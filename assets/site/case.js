/* Case-study pages: lightbox, and for protected studies, client-side decryption.
   Protected content ships only as AES-GCM ciphertext; the password derives the key (PBKDF2-SHA256). */
(function () {
  "use strict";

  /* ---------- Lightbox ---------- */
  var box = document.createElement("dialog");
  box.className = "lightbox";
  box.innerHTML = '<button type="button" aria-label="Close image"><img alt=""></button>';
  document.body.appendChild(box);
  var big = box.querySelector("img");
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".shot button");
    if (b) { var i = b.querySelector("img"); if (!i || !i.src) return; big.src = i.src; big.alt = i.alt; box.showModal(); return; }
    if (e.target.closest(".lightbox")) box.close();
  });

  var sealedEl = document.getElementById("sealed");
  if (!sealedEl) return;

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
    var media = function (url) {
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (buf) { return open(key, new Uint8Array(buf)); });
    };
    var blobUrl = function (url, type) { return media(url).then(function (plain) { return URL.createObjectURL(new Blob([plain], { type: type })); }); };
    out.querySelectorAll("img[data-enc]").forEach(function (img) {
      blobUrl(img.dataset.enc, img.dataset.type).then(function (u) { img.src = u; });
    });
    out.querySelectorAll(".video[data-enc]").forEach(function (box) {
      var poster = document.createElement("img");
      poster.alt = "";
      box.appendChild(poster);
      blobUrl(box.dataset.poster, box.dataset.posterType).then(function (u) { poster.src = u; });
      var play = document.createElement("button");
      play.type = "button";
      play.className = "play";
      play.innerHTML = '<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M0 0l10 6-10 6z" fill="currentColor"/></svg><span>Play recording · ' + box.dataset.size + "</span>";
      play.setAttribute("aria-label", box.dataset.label || "Play recording");
      box.appendChild(play);
      play.addEventListener("click", function () {
        play.disabled = true;
        play.querySelector("span").textContent = "Loading…";
        blobUrl(box.dataset.enc, "video/mp4").then(function (u) {
          var v = document.createElement("video");
          v.src = u; v.controls = true; v.muted = true; v.playsInline = true;
          v.setAttribute("aria-label", box.dataset.label || "");
          box.textContent = "";
          box.appendChild(v);
          v.play().catch(function () {});
        }).catch(function () { play.disabled = false; play.querySelector("span").textContent = "Couldn’t load. Try again"; });
      });
    });
  }

  function reveal(key) {
    return open(key, b64(sealed.body)).then(function (plain) {
      out.innerHTML = dec.decode(plain);
      out.hidden = false;
      gate.hidden = true;
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
