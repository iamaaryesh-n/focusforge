let observer = null;
let paused = false;
let timerInterval;
let isRunning = false;

// ─────────────────────────────────────────────────────────────────────
// AUTO-RESUME on page load if session was active
// ─────────────────────────────────────────────────────────────────────
chrome.storage.local.get(null, (config) => {
  if (config && config.focusActive && config.intent) {
    if (config.mode === "timer" && config.endTime && config.endTime <= Date.now()) {
      chrome.storage.local.set({ focusActive: false });
      return;
    }
    console.log("🔄 Auto-resuming:", config.intent);
    isRunning = true;
    initExtension(config);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "startFocus") {
    stopExtension();
    isRunning = true;
    initExtension(message.config);
  }
  if (message.action === "stopFocus") { stopExtension(); }
  if (message.action === "updatePrefs" && isRunning) {
    // Prefs are embedded in the message — apply instantly, no storage read needed
    applyBlurPreferences({ prefs: message.prefs || {} });
  }
});

// ─────────────────────────────────────────────────────────────────────
// INIT — parse strict vs broad mode from quotes
// "data science" (with quotes) → strict: only exact phrase matches
// data science   (no quotes)   → broad: related fields also match
// ─────────────────────────────────────────────────────────────────────
function initExtension(config) {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (observer) { observer.disconnect(); observer = null; }

  const raw = (config.intent || "").trim();
  const strictMatch = raw.match(/^"(.+)"$/);
  config.strictMode = !!strictMatch;
  config.strictPhrase = strictMatch ? strictMatch[1].toLowerCase() : null;

  const base = config.strictPhrase || raw;
  const intentWords = base.toLowerCase().split(/\s+/).filter(Boolean);

  if (!intentWords.length) { alert("Please enter a valid focus intent."); return; }
  console.log("🎯 Intent:", intentWords, "| Mode:", config.strictMode ? "STRICT" : "BROAD");
  startFiltering(config, intentWords);
}

function stopExtension() {
  isRunning = false; paused = false;
  if (observer) { observer.disconnect(); observer = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  document.querySelectorAll("[data-fg-hidden]").forEach(el => {
    el.style.removeProperty("display"); el.removeAttribute("data-fg-hidden");
  });
  document.querySelectorAll(".fg-blur").forEach(el => el.classList.remove("fg-blur"));
  document.querySelectorAll("[data-fg-handled]").forEach(el => el.removeAttribute("data-fg-handled"));
  const panel = document.querySelector(".fg-control-panel");
  if (panel) panel.remove();
}

function startFiltering(config, intentWords) {
  runFilter(config, intentWords);
  let throttle = null;
  observer = new MutationObserver(() => {
    if (!isRunning || paused) return;
    if (throttle) return;
    throttle = setTimeout(() => { runFilter(config, intentWords); throttle = null; }, 40);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('yt-navigate-finish', () => setTimeout(() => runFilter(config, intentWords), 300));
  window.addEventListener('spfdone', () => setTimeout(() => runFilter(config, intentWords), 300));
  window.addEventListener('popstate', () => setTimeout(() => runFilter(config, intentWords), 300));
  createControlPanel(config);
  if (config.mode === "timer" && config.endTime) startTimer(config.endTime);
}

const PROTECTED = "ytd-masthead, #masthead, header, .fg-control-panel, " +
  "ytd-mini-guide-renderer, ytd-guide-renderer, #guide, #mini-guide, " +
  "ytd-mini-guide-entry-renderer, ytd-guide-entry-renderer, " +
  // Never let the card-loop blur the main video player
  "#player, ytd-player, .html5-video-player, #movie_player";

function hideEl(el) {
  if (!el || el.hasAttribute("data-fg-hidden")) return;
  el.setAttribute("data-fg-hidden", "1");
  el.style.setProperty("display", "none", "important");
}
function showEl(el) {
  if (!el || !el.hasAttribute("data-fg-hidden")) return;
  el.removeAttribute("data-fg-hidden");
  el.style.removeProperty("display");
}

// ─────────────────────────────────────────────────────────────────────
// BLUR PREFERENCES
// prefs.blurComments → blur ytd-comments section
// ─────────────────────────────────────────────────────────────────────
function applyBlurPreferences(config) {
  const prefs = config.prefs || {};

  const commentSection = document.querySelector("ytd-comments, #comments");
  if (commentSection) {
    if (prefs.blurComments) commentSection.classList.add("fg-blur");
    else commentSection.classList.remove("fg-blur");
  }
}


// ─────────────────────────────────────────────────────────────────────
// SHORTS — hide entire section
// ─────────────────────────────────────────────────────────────────────
function hideShortsSection() {
  document.querySelectorAll(
    "ytd-reel-shelf-renderer, ytd-reel-item-renderer, ytd-shorts-lockup-view-model"
  ).forEach(el => { if (!el.closest(PROTECTED)) hideEl(el); });

  document.querySelectorAll("ytd-shelf-renderer").forEach(shelf => {
    if (shelf.closest(PROTECTED) || shelf.hasAttribute("data-fg-hidden")) return;
    if (isShortShelf(shelf)) hideEl(shelf);
  });

  document.querySelectorAll("ytd-video-renderer").forEach(vr => {
    if (vr.closest(PROTECTED) || vr.hasAttribute("data-fg-hidden")) return;
    if (isShortsVideo(vr)) hideEl(vr);
  });

  hideShortsContainers();

  document.querySelectorAll("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer").forEach(entry => {
    const text = (entry.textContent || "").trim().toLowerCase();
    const title = (entry.getAttribute("title") || "").trim().toLowerCase();
    if (text === "shorts" || title === "shorts") entry.style.setProperty("display", "none", "important");
  });

  if (window.location.pathname.startsWith("/shorts/")) {
    if (document.getElementById("fg-shorts-block")) return;
    if (observer) observer.disconnect();
    document.documentElement.style.cssText = "margin:0;padding:0;height:100%;width:100%;background:#0f0f0f;";
    document.body.innerHTML = "";
    document.body.style.cssText = "margin:0;padding:0;height:100%;width:100%;background:#0f0f0f;display:flex;justify-content:center;align-items:center;";
    const w = document.createElement("div");
    w.id = "fg-shorts-block";
    w.style.cssText = "display:flex;flex-direction:column;align-items:center;text-align:center;padding:40px;max-width:600px;";
    const ic = document.createElement("div"); ic.textContent = "⚡"; ic.style.cssText = "font-size:4rem;margin-bottom:16px;";
    const h1 = document.createElement("h1"); h1.textContent = "Focus Layer Active";
    h1.style.cssText = "font-size:3rem;font-weight:800;margin:0 0 16px;color:#fff;font-family:system-ui,sans-serif;letter-spacing:-1px;";
    const p = document.createElement("p"); p.textContent = "Shorts are disabled during your focus session.";
    p.style.cssText = "color:#9ca3af;font-size:1.1rem;margin:0 0 32px;font-family:system-ui,sans-serif;";
    const btn = document.createElement("button"); btn.textContent = "⬅ Go to Home";
    btn.style.cssText = "padding:12px 32px;font-size:1rem;cursor:pointer;background:linear-gradient(135deg,#3ea6ff,#2563eb);color:#fff;border:none;border-radius:10px;font-weight:700;font-family:system-ui,sans-serif;";
    btn.addEventListener("click", () => { window.location.href = "https://www.youtube.com/"; });
    w.append(ic, h1, p, btn);
    document.body.appendChild(w);
    if (observer && isRunning) observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function isShortShelf(shelf) {
  const headingEls = shelf.querySelectorAll("#title, h2, h3, span#title, yt-shelf-header-layout *, yt-formatted-string, [class*='title']");
  for (const el of headingEls) {
    if ((el?.textContent || "").trim().toLowerCase() === "shorts") return true;
  }
  if (shelf.querySelector("ytd-reel-item-renderer, ytd-shorts-lockup-view-model, a.reel-item-endpoint, a[href*='/shorts/']")) return true;
  return shelf.querySelectorAll("a[href*='/shorts/']").length >= 2;
}

function isShortsVideo(el) {
  for (const link of el.querySelectorAll("a[href]")) {
    if (link.href && link.href.includes("/shorts/")) return true;
  }
  for (const badge of el.querySelectorAll("badge-shape, ytd-badge-supported-renderer")) {
    if ((badge.innerText || badge.getAttribute("aria-label") || "").toLowerCase().includes("shorts")) return true;
  }
  return false;
}

function hideShortsContainers() {
  document.querySelectorAll("a[href*='/shorts/']").forEach(anchor => {
    if (anchor.closest(PROTECTED) || anchor.closest("[data-fg-hidden]")) return;
    let container = anchor.closest("ytd-shelf-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer");
    if (!container) {
      let parent = anchor.parentElement;
      for (let i = 0; i < 8 && parent; i++) {
        if (parent.classList && (parent.classList.contains("ytd-item-section-renderer") || parent.classList.contains("yt-horizontal-list-renderer") || parent.tagName === "YTD-ITEM-SECTION-RENDERER")) { container = parent; break; }
        parent = parent.parentElement;
      }
    }
    if (!container) return;
    if (container.id === "contents" || container.tagName === "YTD-SECTION-LIST-RENDERER" || container.tagName === "YTD-SEARCH") return;
    if (container.hasAttribute("data-fg-hidden")) return;
    const sl = container.querySelectorAll("a[href*='/shorts/']");
    const tl = container.querySelectorAll("a[href*='/watch?v='], a[href*='/shorts/']");
    if (sl.length >= 2 && sl.length >= (tl.length * 0.5)) hideEl(container);
  });
}

// ─────────────────────────────────────────────────────────────────────
// PLAYLIST / COURSE DETECTION
// ─────────────────────────────────────────────────────────────────────
function isPlaylistOrCourse(el) {
  const tag = el.tagName.toLowerCase();
  if (["ytd-playlist-renderer", "ytd-compact-playlist-renderer", "ytd-grid-playlist-renderer", "ytd-lockup-view-model", "yt-lockup-view-model"].includes(tag)) return true;
  if (el.querySelector("ytd-playlist-renderer, ytd-lockup-view-model, yt-lockup-view-model")) return true;
  for (const meta of el.querySelectorAll("yt-lockup-metadata-view-model")) {
    const t = (meta.innerText || "").toLowerCase();
    if (/\bplaylist\b/.test(t) || /\bcourse\b/.test(t)) return true;
  }
  const badge = el.querySelector("ytd-thumbnail-overlay-side-panel-renderer")?.innerText ||
    el.querySelector("ytd-thumbnail-overlay-bottom-panel-renderer")?.innerText || "";
  if (/\d+\s*(video|lesson|chapter|part)s?/i.test(badge)) return true;
  for (const line of (el.innerText || "").split("\n")) {
    const t = line.trim();
    if (t.length > 0 && t.length < 50 && (/\bcourse\b/i.test(t) || /\bplaylist\b/i.test(t))) return true;
    if (/\bview full course\b/i.test(t)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// SEMANTIC INTENT EXPANSION (only used in broad mode)
// ─────────────────────────────────────────────────────────────────────
const INTENT_EXPANSION = {
  "python": ["numpy", "pandas", "django", "flask", "pytorch", "tensorflow", "pip", "jupyter", "scipy", "matplotlib", "fastapi", "asyncio", "pydantic", "sqlalchemy", "celery", "pytest"],
  "javascript": ["nodejs", "node.js", "react", "vue", "angular", "typescript", "webpack", "babel", "express", "nextjs", "deno", "jquery", "npm", "vite", "svelte", "eslint"],
  "java": ["spring", "maven", "gradle", "hibernate", "junit", "jvm", "servlet", "jdbc", "springboot", "tomcat", "intellij", "struts", "jackson"],
  "kotlin": ["android", "jetpack", "coroutines", "compose", "gradle", "ktor", "flow", "room", "retrofit"],
  "cpp": ["pointers", "stl", "cmake", "memory management", "templates", "namespace", "linked list", "vectors", "algorithms", "boost", "makefile", "oop"],
  "rust": ["cargo", "ownership", "borrowing", "lifetime", "tokio", "actix", "serde", "wasm", "traits", "enums"],
  "golang": ["goroutine", "channel", "go modules", "gin", "gorm", "concurrency", "interfaces", "cobra", "fiber"],
  "swift": ["xcode", "swiftui", "uikit", "cocoapods", "combine", "core data", "ios", "macos", "appkit"],
  "machine learning": ["neural network", "backpropagation", "gradient descent", "overfitting", "regularization", "cross validation", "feature engineering", "sklearn", "scikit"],
  "deep learning": ["cnn", "rnn", "lstm", "transformer", "attention", "bert", "gpt", "diffusion", "gan", "autoencoder", "pytorch", "tensorflow", "keras"],
  "data science": ["pandas", "numpy", "matplotlib", "seaborn", "sql", "tableau", "power bi", "etl", "eda", "statistics", "regression", "classification", "clustering", "data analyst", "data engineering", "data pipeline", "data visualization", "business intelligence"],
  "sql": ["mysql", "postgresql", "sqlite", "joins", "indexes", "queries", "stored procedures", "normalization", "nosql"],
  "web development": ["html", "css", "javascript", "react", "backend", "frontend", "api", "rest", "graphql", "http", "responsive", "deployment", "hosting"],
  "ui ux": ["figma", "sketch", "prototype", "wireframe", "typography", "color theory", "accessibility", "design system", "mockup"],
  "css": ["flexbox", "grid", "tailwind", "sass", "scss", "animations", "responsive", "bootstrap", "styled components"],
  "linux": ["bash", "shell", "terminal", "ubuntu", "debian", "arch", "kernel", "systemd", "cron", "chmod", "vim", "grep", "awk"],
  "devops": ["docker", "kubernetes", "ci cd", "jenkins", "github actions", "terraform", "ansible", "nginx", "aws", "azure", "gcp"],
  "networking": ["tcp ip", "dns", "http", "ssl", "firewall", "routing", "subnetting", "osi model", "vpn", "load balancer"],
  "physics": ["mechanics", "thermodynamics", "electromagnetism", "quantum", "relativity", "optics", "waves", "kinematics", "newton"],
  "chemistry": ["organic chemistry", "reactions", "periodic table", "bonding", "stoichiometry", "acids", "bases", "equilibrium", "electrolysis"],
  "biology": ["cell biology", "genetics", "dna", "evolution", "ecology", "anatomy", "physiology", "microbiology", "biochemistry"],
  "mathematics": ["calculus", "algebra", "geometry", "trigonometry", "statistics", "probability", "linear algebra", "differential equations", "number theory", "discrete math"],
};

const DISTRACTION_KEYWORDS = [
  "meme", "funny", "viral", "prank", "celebrity", "gossip", "drama",
  "reaction", "roast", "challenge", "exposed", "shocking", "gone wrong",
  "paranormal", "ghost", "horror", "rant", "irl"
];

function expandIntent(intentWords) {
  const expanded = new Set(intentWords);
  for (const word of intentWords) {
    if (INTENT_EXPANSION[word]) { INTENT_EXPANSION[word].forEach(s => expanded.add(s)); continue; }
    for (const [key, synonyms] of Object.entries(INTENT_EXPANSION)) {
      const kws = key.split(" ");
      if (kws.some(kw => kw === word) || synonyms.some(s => s === word)) {
        synonyms.forEach(s => expanded.add(s));
        kws.forEach(kw => expanded.add(kw));
      }
    }
  }
  return Array.from(expanded);
}

// ─────────────────────────────────────────────────────────────────────
// RELEVANCE CHECK
//
// STRICT MODE ("data science" with quotes):
//   Only the exact phrase must appear — no expansion, no related fields.
//   "data analyst" → BLUR. "data science" → SHOW.
//
// BROAD MODE (data science without quotes):
//   Keyword + semantic expansion + contextual scoring.
//   "data analyst", "data engineering" also pass.
// ─────────────────────────────────────────────────────────────────────
function isBasicRelevant(text, intentWords, config) {
  if (!text || !intentWords.length) return false;

  if (config && config.strictMode && config.strictPhrase) {
    return text.includes(config.strictPhrase);
  }

  const hasDirectIntent = intentWords.some(w => text.includes(w));
  const expandedWords = expandIntent(intentWords);
  const hasExpandedMatch = expandedWords.some(w => w.length > 2 && text.includes(w));
  const hasDistraction = DISTRACTION_KEYWORDS.some(w => text.includes(w));

  if (hasDistraction && !hasDirectIntent) return false;
  if (hasDirectIntent) return true;
  if (hasExpandedMatch) return true;
  return isContextuallyRelevant(text, intentWords);
}

function isContextuallyRelevant(text, intentWords) {
  if (!intentWords.length) return true;
  let score = 0;
  const contextWords = ["tutorial", "course", "learn", "how to", "guide", "introduction", "beginner", "lesson", "walkthrough", "step by step", "explained", "crash course", "for beginners", "from scratch"];
  let hasIntent = false;
  for (const word of intentWords) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) hasIntent = true;
    const rx = new RegExp(`\\b${word}\\b.{0,40}(${contextWords.join("|")})|(${contextWords.join("|")}).{0,40}\\b${word}\\b`, "i");
    if (rx.test(text)) score += 5;
    if (text.includes(word + " tutorial") || text.includes("tutorial " + word)) score += 3;
    if (text.includes(intentWords.join(" "))) score += 2;
  }
  if (hasIntent) return true;
  return score >= 3;
}

// ─────────────────────────────────────────────────────────────────────
// STRUCTURAL FEED DETECTION
// ─────────────────────────────────────────────────────────────────────
function findFeedLikeContainers() {
  const results = [], seen = new WeakSet();
  const candidates = document.querySelectorAll('div[class], section, ul, ol, ytd-section-list-renderer, ytd-rich-grid-renderer, ytd-item-section-renderer');
  candidates.forEach(el => {
    if (seen.has(el) || el.closest(PROTECTED) || el.hasAttribute("data-fg-hidden")) return;
    const children = Array.from(el.children).filter(c => c.offsetHeight > 80 && c.offsetWidth > 100);
    if (children.length < 4) return;
    const heights = children.map(c => c.offsetHeight);
    const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
    if (heights.every(h => Math.abs(h - avg) < avg * 0.35) && el.scrollHeight > window.innerHeight * 0.6) {
      seen.add(el); results.push(el);
      children.forEach(c => { if (!seen.has(c)) { seen.add(c); results.push(c); } });
    }
  });
  return results;
}

// ─────────────────────────────────────────────────────────────────────
// VIDEO CARDS
// ─────────────────────────────────────────────────────────────────────
function getVideoCards() {
  const legacyCards = Array.from(document.querySelectorAll([
    "ytd-rich-item-renderer", "ytd-video-renderer", "ytd-compact-video-renderer",
    "ytd-grid-video-renderer", "ytd-playlist-renderer", "ytd-compact-playlist-renderer",
    "ytd-grid-playlist-renderer", "ytd-lockup-view-model", "yt-lockup-view-model",
    "ytd-shelf-renderer", "ytd-radio-renderer", "ytd-horizontal-card-list-renderer",
    "#related ytd-compact-video-renderer",
    "ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer",
    "ytd-item-section-renderer ytd-compact-video-renderer"
  ].join(", "))).filter(el => {
    if (el.closest(PROTECTED)) return false;
    if (el.hasAttribute("data-fg-hidden")) return false;
    if (el.closest("ytd-reel-shelf-renderer, ytd-reel-item-renderer")) return false;
    if (el.tagName === "YTD-SHELF-RENDERER" && isShortShelf(el)) return false;
    if (el.tagName === "YTD-VIDEO-RENDERER" && isShortsVideo(el)) return false;
    return true;
  });

  const viewModelCards = getWatchPageSuggestionCards();
  const allCards = [...legacyCards];
  viewModelCards.forEach(card => {
    if (!allCards.some(e => e.contains(card) || card.contains(e))) allCards.push(card);
  });

  findFeedLikeContainers().forEach(el => {
    if (!el.closest(PROTECTED) && !el.hasAttribute("data-fg-hidden") && !allCards.some(e => e.contains(el) || el.contains(e))) allCards.push(el);
  });

  return allCards;
}

function getWatchPageSuggestionCards() {
  const container = document.querySelector("ytd-watch-next-secondary-results-renderer");
  if (!container) return [];
  const cards = [], seen = new WeakSet();
  container.querySelectorAll("yt-lockup-metadata-view-model").forEach(meta => {
    let card = meta, parent = meta.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      if (parent === container || parent.tagName === "YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER" || parent.tagName === "YTD-ITEM-SECTION-RENDERER") break;
      card = parent; parent = parent.parentElement;
    }
    if (!seen.has(card) && !card.closest(PROTECTED)) { seen.add(card); cards.push(card); }
  });
  return cards;
}

// ─────────────────────────────────────────────────────────────────────
// MAIN FILTER
// ─────────────────────────────────────────────────────────────────────
function runFilter(config, intentWords) {
  if (paused || !isRunning) return;
  hideShortsSection();

  const cards = getVideoCards();
  console.log(`🔍 ${cards.length} cards | ${config.strictMode ? "STRICT" : "BROAD"} mode`);

  cards.forEach(el => {
    if (el.closest("[data-fg-hidden]")) return;
    const text = (el.innerText || "").toLowerCase();
    const relevant = isBasicRelevant(text, intentWords, config);
    if (isPlaylistOrCourse(el)) {
      if (relevant) { showEl(el); el.classList.remove("fg-blur"); }
      else el.classList.add("fg-blur");
      return;
    }
    if (relevant) { showEl(el); el.classList.remove("fg-blur"); }
    else el.classList.add("fg-blur");
  });

  filterViewModelSuggestions(intentWords, config);

  // ── PLAYER BLUR ───────────────────────────────────────────────────
  // Only runs on watch pages. Requires the h1 title to be in the DOM
  // before making a blur decision — avoids blurring during SPA load
  // when document.title is still the stale "YouTube" default.
  try {
    if (!window.location.pathname.startsWith("/watch")) return;
    const player = document.querySelector("#player, ytd-player, .html5-video-player");
    if (!player) return;

    // Wait for the actual h1 — if it's missing, page is still loading.
    const titleEl = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, ' +
      'h1.title yt-formatted-string, ' +
      '#title h1 yt-formatted-string, ' +
      'h1.ytd-watch-metadata, ' +
      '#container h1'
    );

    // No title element yet → page loading, bail out (don't blur)
    if (!titleEl) return;
    const titleText = (titleEl.innerText || titleEl.textContent || "").trim();
    // Title is empty → still loading, bail out
    if (titleText.length < 3) return;

    const descEl = document.querySelector(
      '#description-inline-expander, #description, #description-inner'
    );
    let mainText = titleText.toLowerCase() + " ";
    if (descEl) mainText += (descEl.innerText || "").toLowerCase().slice(0, 500);

    if (isBasicRelevant(mainText, intentWords, config)) {
      player.classList.remove("fg-blur");
    } else {
      player.classList.add("fg-blur");
    }
  } catch (e) { /* ignore */ }

  applyBlurPreferences(config);
}

function filterViewModelSuggestions(intentWords, config) {
  const container = document.querySelector("ytd-watch-next-secondary-results-renderer");
  if (!container) return;
  if (container.querySelectorAll("[data-fg-handled]").length > 0) return;

  container.querySelectorAll("yt-lockup-metadata-view-model").forEach(meta => {
    let card = meta, parent = meta.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      if (parent === container || parent.tagName === "YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER" || parent.tagName === "YTD-ITEM-SECTION-RENDERER") break;
      card = parent; parent = parent.parentElement;
    }
    if (card.closest(PROTECTED)) return;
    if (card.hasAttribute("data-fg-hidden") || card.classList.contains("fg-blur")) return;
    const text = (card.innerText || "").toLowerCase();
    if (isBasicRelevant(text, intentWords, config)) card.classList.remove("fg-blur");
    else card.classList.add("fg-blur");
    card.setAttribute("data-fg-handled", "1");
  });
}

// ─────────────────────────────────────────────────────────────────────
// CONTROL PANEL
// ─────────────────────────────────────────────────────────────────────
function createControlPanel(config) {
  const oldPanel = document.querySelector(".fg-control-panel");
  if (oldPanel) oldPanel.remove();
  const panel = document.createElement("div");
  panel.className = "fg-control-panel";

  const modeTag = document.createElement("span");
  modeTag.style.cssText = "font-size:10px;background:rgba(62,166,255,0.15);color:#3ea6ff;padding:2px 8px;border-radius:20px;font-weight:600;letter-spacing:0.3px;";
  modeTag.textContent = config.strictMode ? "STRICT" : "BROAD";

  const timerText = document.createElement("span");
  timerText.innerText = config.mode === "timer" ? "⏱ --:--" : "⚡ Focus";
  timerText.style.cssText = "font-size:12px;color:#9ca3af;min-width:70px;";

  const pauseBtn = document.createElement("button");
  pauseBtn.innerText = "⏸"; pauseBtn.className = "fg-btn";
  pauseBtn.onclick = () => { paused = !paused; pauseBtn.innerText = paused ? "▶" : "⏸"; };

  const stopBtn = document.createElement("button");
  stopBtn.innerText = "✕"; stopBtn.className = "fg-btn";
  stopBtn.style.cssText = "color:#f87171;";
  stopBtn.onclick = () => { chrome.storage.local.set({ focusActive: false }); stopExtension(); };

  panel.append(modeTag, timerText, pauseBtn, stopBtn);
  if (document.body) { document.body.appendChild(panel); panel.timerText = timerText; }
}

function startTimer(endTime) {
  const timerText = document.querySelector(".fg-control-panel")?.timerText;
  timerInterval = setInterval(() => {
    if (paused) return;
    const rem = endTime - Date.now();
    if (rem <= 0) {
      clearInterval(timerInterval);
      if (timerText) timerText.innerText = "⏰ Done!";
      chrome.storage.local.set({ focusActive: false });
      stopExtension();
      return;
    }
    const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
    if (timerText) timerText.innerText = `⏱ ${m}:${s.toString().padStart(2, "0")}`;
  }, 1000);
}
