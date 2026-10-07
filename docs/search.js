"use strict";

// Search (🔍) and links into the app (?w=学校, ?k=学, ?q=...).
// Uses the globals from app.js / details.js.

const hasKanji = (s) => /[一-鿿々]/.test(s);
const isKana = (s) => /^[ぁ-ヿー]+$/.test(s);

// Best matches first: exact, then prefix, then anywhere.
function rank(value, q) {
  if (value === q) return 0;
  if (value.startsWith(q)) return 1;
  return value.includes(q) ? 2 : -1;
}

function searchWords(raw) {
  const q = raw.trim();
  if (!q) return [];
  const scored = [];
  if (hasKanji(q) || isKana(q)) {
    const h = kataToHira(q);
    for (const w of words) {
      const r = hasKanji(q) ? rank(w.w, q) : rank(w.r, h);
      if (r >= 0) scored.push([r, w]);
    }
  } else {
    const ql = q.toLowerCase();
    const re = new RegExp(`\\b${ql.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    for (const w of words) {
      let best = 9;
      w.m.forEach((m, i) => {
        const ml = m.toLowerCase().replace(/^to /, "");
        if (ml === ql || m.toLowerCase() === ql) best = Math.min(best, i ? 1 : 0);
        else if (re.test(m.toLowerCase())) best = Math.min(best, 2 + Math.min(i, 2));
      });
      if (best < 9) scored.push([best, w]);
    }
  }
  // Deck words before others, then shorter words, then easier levels.
  const deckRank = (w) => (inDeck(w) ? 0 : 1);
  scored.sort((a, b) => a[0] - b[0] || deckRank(a[1]) - deckRank(b[1]) || a[1].w.length - b[1].w.length || b[1].lv - a[1].lv);
  return scored.slice(0, 60).map(([, w]) => w);
}

async function renderSearch() {
  const q = $("search-input").value;
  const res = searchWords(q);
  // Kanji in the query that have details.
  const data = hasKanji(q) ? await loadKanji() : {};
  const ks = [...new Set([...q].filter((c) => data[c]))];
  let html = "";
  if (ks.length) {
    html += `<div class="kanji-hits" lang="ja">` + ks.map((k) =>
      `<button type="button" data-k="${k}"><b>${k}</b><span lang="en">${esc(data[k].m.slice(0, 2).join(", "))}</span></button>`).join("") + `</div>`;
  }
  if (res.length) {
    html += `<ul class="words" lang="ja">` + res.map((w) => {
      const tag = inDeck(w) ? "" : ` <span class="tag">N${w.lv}${w.lv >= state.wordLevel ? " · hidden" : ""}</span>`;
      return `<li><button type="button" data-id="${w.id}"><b>${w.w}</b> <span class="r">${w.r}</span>${tag}` +
        `<span class="mn" lang="en">${esc(w.m.slice(0, 2).join("; "))}</span></button></li>`;
    }).join("") + `</ul>`;
  } else if (q.trim()) {
    html += `<p class="none">${ks.length ? "No word in the app matches; tap a kanji above for its details and words." : "Nothing found. Try a kanji, a word, a reading (kana) or an English word."}</p>`;
  }
  $("search-results").innerHTML = html;
}

function openSearch(q = "") {
  $("search-input").value = q;
  $("search-results").innerHTML = "";
  $("search").showModal();
  if (q) renderSearch(); else $("search-input").focus();
}

let searchTimer;
$("search-input").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderSearch, 150);
});
$("search-results").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  $("search").close();
  if (b.dataset.k) openDetails(b.dataset.k);
  else if (b.dataset.id) { practice = null; show(b.dataset.id, "from search"); }
});
$("search-btn").onclick = () => openSearch();
$("random-in-search").onclick = () => {
  $("search").close();
  practice = null;
  show(fallbackId(cur.id), "random word");
};

// Links: ?w=学校 opens that word, ?k=学 a word with that kanji plus its
// details, ?q=... the search. Returns true if it handled the start.
function openFromLink() {
  const p = new URLSearchParams(location.search);
  const w = p.get("w"), k = p.get("k"), q = p.get("q");
  if (!w && !k && !q) return false;
  window.history.replaceState(null, "", location.pathname); // don't re-open on reload
  if (w) {
    const hits = words.filter((x) => x.w === w);
    const hit = hits.find(inDeck) || hits[0];
    if (hit) { show(hit.id, "from link"); return true; }
    show(fallbackId(null), "");
    openSearch(w);
    return true;
  }
  if (k) {
    const ids = [...(index.core.k.get(k) || []), ...(index.bridge.k.get(k) || [])];
    const any = words.filter((x) => x.w.includes(k)).map((x) => x.id);
    const pool = ids.length ? ids : any;
    show(pool.length ? pick(pool) : fallbackId(null), pool.length ? `<b>${k}</b> · from link` : "");
    peeked = true; // the details give this word away; no points for it
    openDetails(k);
    return true;
  }
  show(fallbackId(null), "");
  openSearch(q);
  return true;
}
