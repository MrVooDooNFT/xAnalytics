// assets/app.js
(() => {
  const FIXED_KEYWORDS = [
    "Süper Lig",
    "Fenerbahçe",
    "Galatasaray",
    "Beşiktaş",
    "Trabzonspor",
    "Arda Güler",
    "Kenan Yıldız",
    "Ferdi Kadıoğlu",
    "Hakan Çalhanoğlu",
    "İlkay Gündoğan",
    "Real Madrid",
    "Barcelona",
    "Manchester City",
    "Arsenal",
    "Bayern Munich",
    "Champions League",
    "Europa League",
    "Conference League",
    "Transfer",
    "VAR",
    "Hakem",
    "Derbi",
    "Sakatlık",
    "Penaltı",
    "Kırmızı Kart"
  ];

  const els = {
    apiUrl: document.getElementById("apiUrl"),
    token: document.getElementById("token"),
    hours: document.getElementById("hours"),
    lang: document.getElementById("lang"),
    kwGrid: document.getElementById("kwGrid"),
    kwInput: document.getElementById("kwInput"),
    btnAddKw: document.getElementById("btnAddKw"),
    btnSelectAll: document.getElementById("btnSelectAll"),
    btnSelectNone: document.getElementById("btnSelectNone"),
    btnFetch: document.getElementById("btnFetch"),
    btnClear: document.getElementById("btnClear"),
    status: document.getElementById("status"),
    meta: document.getElementById("meta"),
    results: document.getElementById("results"),
  };

  // State
  const state = {
    keywords: [], // { id, text, selected, builtin }
    loading: false,
    lastResults: [],
  };

  // Utils
  const uid = () => Math.random().toString(36).slice(2, 10);

  function normalizeToken(t) {
    const s = String(t || "").trim();
    return s.replace(/^Bearer\s+/i, "");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setStatus(msg, isError = false) {
    els.status.textContent = msg || "";
    els.status.style.color = isError ? "var(--danger)" : "var(--muted)";
  }

  function setLoading(on) {
    state.loading = on;
    els.btnFetch.disabled = on;
    els.btnClear.disabled = on;
    els.btnAddKw.disabled = on;
    els.btnSelectAll.disabled = on;
    els.btnSelectNone.disabled = on;
  }

  function saveLocal() {
    localStorage.setItem("xTopPosts_apiUrl", els.apiUrl.value.trim());
    localStorage.setItem("xTopPosts_token", els.token.value.trim());
    localStorage.setItem("xTopPosts_lang", els.lang.value);
    localStorage.setItem("xTopPosts_hours", els.hours.value);

    const extra = state.keywords
      .filter(k => !k.builtin)
      .map(k => ({ text: k.text, selected: k.selected }));
    localStorage.setItem("xTopPosts_extraKeywords", JSON.stringify(extra));
  }

  function loadLocal() {
    els.apiUrl.value = localStorage.getItem("xTopPosts_apiUrl") || "";
    els.token.value = localStorage.getItem("xTopPosts_token") || "";
    els.lang.value = localStorage.getItem("xTopPosts_lang") || "tr";
    els.hours.value = localStorage.getItem("xTopPosts_hours") || "3";
  }

  function buildInitialKeywords() {
    state.keywords = FIXED_KEYWORDS.map(text => ({
      id: uid(),
      text,
      selected: true,   // default hepsi seçili
      builtin: true
    }));

    // Extra keywords from localStorage
    const extraRaw = localStorage.getItem("xTopPosts_extraKeywords");
    if (extraRaw) {
      try {
        const extra = JSON.parse(extraRaw);
        if (Array.isArray(extra)) {
          extra.forEach(item => {
            const text = String(item?.text || "").trim();
            if (!text) return;
            if (state.keywords.some(k => k.text.toLowerCase() === text.toLowerCase())) return;
            state.keywords.push({
              id: uid(),
              text,
              selected: item?.selected !== false, // default selected
              builtin: false
            });
          });
        }
      } catch { /* ignore */ }
    }
  }

  function renderKeywords() {
    els.kwGrid.innerHTML = "";
    state.keywords.forEach(k => {
      const div = document.createElement("div");
      div.className = "kw-item";
      div.innerHTML = `
        <input type="checkbox" id="kw_${k.id}" ${k.selected ? "checked" : ""} />
        <label class="kw-label" for="kw_${k.id}">${escapeHtml(k.text)}</label>
      `;
      const cb = div.querySelector("input");
      cb.addEventListener("change", () => {
        k.selected = cb.checked;
        saveLocal();
      });
      els.kwGrid.appendChild(div);
    });
  }

  function selectAll(on) {
    state.keywords.forEach(k => k.selected = on);
    renderKeywords();
    saveLocal();
  }

  function addKeyword() {
    const text = String(els.kwInput.value || "").trim();
    if (!text) return;

    const exists = state.keywords.some(k => k.text.toLowerCase() === text.toLowerCase());
    if (exists) {
      setStatus("Bu keyword zaten var.", true);
      return;
    }

    state.keywords.push({
      id: uid(),
      text,
      selected: true,
      builtin: false
    });

    els.kwInput.value = "";
    setStatus("");
    renderKeywords();
    saveLocal();
  }

  function clearResults() {
    state.lastResults = [];
    els.results.innerHTML = "";
    els.meta.textContent = "";
    setStatus("");
  }

  function getSelectedKeywords() {
    return state.keywords.filter(k => k.selected).map(k => k.text);
  }

  function scoreTweet(metrics) {
    const like = Number(metrics?.like ?? 0);
    const repost = Number(metrics?.repost ?? 0);
    const reply = Number(metrics?.reply ?? 0);
    const quote = Number(metrics?.quote ?? 0);
    return like + repost * 2 + reply * 1.5 + quote * 2;
  }

  function renderResults(items, meta) {
    els.results.innerHTML = "";
    if (!items || items.length === 0) {
      els.results.innerHTML = `<div class="hint">Sonuç yok.</div>`;
      return;
    }

    els.meta.textContent = meta || "";

    items.forEach((t, idx) => {
      const score = scoreTweet(t.metrics);
      const author = t.author?.username ? `@${t.author.username}` : "";
      const name = t.author?.name ? `(${t.author.name})` : "";
      const created = t.created_at ? new Date(t.created_at).toLocaleString("tr-TR") : "";

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-top">
          <div class="score">#${idx + 1} Skor: ${score.toFixed(1)}</div>
          <div class="author">${escapeHtml(author)} ${escapeHtml(name)} ${created ? " | " + escapeHtml(created) : ""}</div>
        </div>
        <div class="text">${escapeHtml(t.text || "")}</div>
        <div class="metrics">
          <span>❤️ ${Number(t.metrics?.like ?? 0)}</span>
          <span>🔁 ${Number(t.metrics?.repost ?? 0)}</span>
          <span>💬 ${Number(t.metrics?.reply ?? 0)}</span>
          <span>💭 ${Number(t.metrics?.quote ?? 0)}</span>
        </div>
        <div class="link">
          <a href="${escapeHtml(t.link || "#")}" target="_blank" rel="noreferrer">X'te aç</a>
        </div>
      `;
      els.results.appendChild(card);
    });
  }

  async function fetchTopPosts() {
    const apiUrl = String(els.apiUrl.value || "").trim();
    const token = normalizeToken(els.token.value);
    const hours = String(els.hours.value || "3");
    const lang = String(els.lang.value || "tr");

    const selected = getSelectedKeywords();

    if (!apiUrl) {
      setStatus("Vercel Proxy URL gir.", true);
      return;
    }
    if (!token) {
      setStatus("Bearer token yapıştır.", true);
      return;
    }
    if (selected.length === 0) {
      setStatus("En az 1 keyword seç.", true);
      return;
    }

    setLoading(true);
    setStatus("Çekiliyor...");
    els.meta.textContent = "";

    try {
      const url = new URL(apiUrl);
      url.searchParams.set("keywords", selected.join(","));
      url.searchParams.set("hours", hours);
      url.searchParams.set("lang", lang);
      url.searchParams.set("max", "10");

      const r = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "Authorization": "Bearer " + token
        }
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        const msg = data?.error ? String(data.error) : "İstek başarısız.";
        setStatus(msg, true);
        return;
      }

      // Beklenen response formatı:
      // { results: [ {text, created_at, author:{}, metrics:{like,repost,reply,quote}, score, link } ], window:{}, total_fetched }
      const results = Array.isArray(data.results) ? data.results : [];
      // Eğer proxy score döndürüyorsa, yine de biz local skorla sıralıyoruz.
      const normalized = results.map(t => ({
        id: t.id,
        text: t.text,
        created_at: t.created_at,
        author: t.author || {},
        metrics: {
          like: t.metrics?.like ?? t.metrics?.like_count ?? 0,
          repost: t.metrics?.repost ?? t.metrics?.retweet_count ?? 0,
          reply: t.metrics?.reply ?? t.metrics?.reply_count ?? 0,
          quote: t.metrics?.quote ?? t.metrics?.quote_count ?? 0,
        },
        link: t.link
      }));

      normalized.sort((a, b) => scoreTweet(b.metrics) - scoreTweet(a.metrics));
      const top10 = normalized.slice(0, 10);

      const meta = data.window?.start && data.window?.end
        ? `Pencere: ${data.window.start} -> ${data.window.end} | Çekilen: ${data.total_fetched ?? results.length} | Gösterilen: ${top10.length}`
        : `Gösterilen: ${top10.length}`;

      renderResults(top10, meta);
      setStatus("");
      saveLocal();
    } catch (e) {
      setStatus("Hata: " + String(e?.message || e), true);
    } finally {
      setLoading(false);
    }
  }

  // Events
  els.btnAddKw.addEventListener("click", addKeyword);
  els.kwInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addKeyword();
  });

  els.btnSelectAll.addEventListener("click", () => selectAll(true));
  els.btnSelectNone.addEventListener("click", () => selectAll(false));

  els.btnClear.addEventListener("click", clearResults);
  els.btnFetch.addEventListener("click", fetchTopPosts);

  // Init
  loadLocal();
  buildInitialKeywords();
  renderKeywords();
  clearResults();
})();
