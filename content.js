let observer = null;
let paused = false;
let timerInterval;
let isRunning = false;

console.log("Focus Guard Loaded ✅");

// ─────────────────────────────────────────────────────────────────────
// AUTO-RESUME on page load (fixes reload after "Go to Home" click)
// If the user had focus active, restart it immediately without needing
// the popup to send a message again.
// ─────────────────────────────────────────────────────────────────────
chrome.storage.sync.get(null, (config) => {
  if (config && config.focusActive && config.intent) {
    // If timer mode — check the session hasn't already expired
    if (config.mode === "timer" && config.endTime && config.endTime <= Date.now()) {
      // Session expired while page was loading — clean up storage
      chrome.storage.sync.set({ focusActive: false });
      return;
    }
    console.log("🔄 Auto-resuming focus session for intent:", config.intent);
    isRunning = true;
    initExtension(config);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "startFocus") {
    stopExtension();
    isRunning = true;
    console.log("▶ Starting with intent:", message.config.intent);
    initExtension(message.config);
  }
  if (message.action === "stopFocus") { stopExtension(); }
});

function initExtension(config) {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (observer) { observer.disconnect(); observer = null; }
  const intentWords = (config.intent || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!intentWords.length) {
    alert("Please enter a valid focus intent.");
    return;
  }
  console.log("🎯 Intent words:", intentWords);
  startFiltering(config, intentWords);
}

function stopExtension() {
  isRunning = false; paused = false;
  if (observer) { observer.disconnect(); observer = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  document.querySelectorAll("[data-fg-hidden]").forEach(el => {
    if (el) {
      el.style.removeProperty("display");
      el.removeAttribute("data-fg-hidden");
    }
  });
  document.querySelectorAll(".fg-blur").forEach(el => {
    el.classList.remove("fg-blur");
  });
  document.querySelectorAll("[data-fg-handled]").forEach(el => {
    el.removeAttribute("data-fg-handled");
  });
  const panel = document.querySelector(".fg-control-panel");
  if (panel) panel.remove();
}

function startFiltering(config, intentWords) {
  runFilter(config, intentWords);
  let throttle = null;
  observer = new MutationObserver(() => {
    if (!isRunning || paused) return;
    if (throttle) return;
    throttle = setTimeout(() => {
      runFilter(config, intentWords);
      throttle = null;
    }, 40);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => runFilter(config, intentWords), 300);
  });
  window.addEventListener('spfdone', () => {
    setTimeout(() => runFilter(config, intentWords), 300);
  });
  window.addEventListener('popstate', () => {
    setTimeout(() => runFilter(config, intentWords), 300);
  });
  createControlPanel(config);
  if (config.mode === "timer" && config.endTime) startTimer(config.endTime);
}

const PROTECTED = "ytd-masthead, #masthead, header, .fg-control-panel, " +
  "ytd-mini-guide-renderer, ytd-guide-renderer, #guide, #mini-guide, " +
  "ytd-mini-guide-entry-renderer, ytd-guide-entry-renderer";

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
// SHORTS — hide entire section (all pages)
// ─────────────────────────────────────────────────────────────────────
function hideShortsSection() {
  document.querySelectorAll(
    "ytd-reel-shelf-renderer, " +
    "ytd-reel-item-renderer, " +
    "ytd-shorts-lockup-view-model"
  ).forEach(el => {
    if (!el.closest(PROTECTED)) hideEl(el);
  });

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
    if (text === "shorts" || title === "shorts") {
      entry.style.setProperty("display", "none", "important");
    }
  });

  if (window.location.pathname.startsWith("/shorts/")) {
    if (document.getElementById("fg-shorts-block")) return;
    if (observer) observer.disconnect();

    // ── Full-screen block page ──────────────────────────────────────────
    // height + width on BOTH html/body is required for the flex wrapper to
    // fill the viewport and properly center its children.
    document.documentElement.style.cssText =
      "margin:0;padding:0;height:100%;width:100%;background:#0f0f0f;";
    document.body.innerHTML = "";
    document.body.style.cssText =
      "margin:0;padding:0;height:100%;width:100%;background:#0f0f0f;" +
      "display:flex;justify-content:center;align-items:center;";

    // Outer wrapper — flex column, centered
    const wrapper = document.createElement("div");
    wrapper.id = "fg-shorts-block";
    wrapper.style.cssText =
      "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "text-align:center;padding:40px;max-width:600px;width:100%;";

    // ⚡ Icon
    const icon = document.createElement("div");
    icon.textContent = "⚡";
    icon.style.cssText = "font-size:4rem;margin-bottom:16px;line-height:1;";

    // Heading — larger
    const heading = document.createElement("h1");
    heading.textContent = "Focus Layer Active";
    heading.style.cssText =
      "font-size:3.5rem;font-weight:800;margin:0 0 16px;color:#ffffff;" +
      "font-family:system-ui,-apple-system,sans-serif;letter-spacing:-1px;line-height:1.1;";

    // Subtitle — larger
    const msg = document.createElement("p");
    msg.textContent = "Shorts are disabled during your focus session.";
    msg.style.cssText =
      "color:#9ca3af;font-size:1.25rem;margin:0 0 36px;" +
      "font-family:system-ui,-apple-system,sans-serif;line-height:1.5;";

    // Go to Home button
    const btn = document.createElement("button");
    btn.textContent = "⬅ Go to Home";
    btn.style.cssText =
      "padding:14px 36px;font-size:1.1rem;cursor:pointer;" +
      "background:linear-gradient(135deg,#3ea6ff,#2563eb);color:#fff;" +
      "border:none;border-radius:10px;font-weight:700;" +
      "font-family:system-ui,-apple-system,sans-serif;" +
      "transition:opacity 0.15s,transform 0.15s;" +
      "box-shadow:0 4px 20px rgba(62,166,255,0.35);";
    btn.onmouseenter = () => {
      btn.style.opacity = "0.85";
      btn.style.transform = "translateY(-2px)";
    };
    btn.onmouseleave = () => {
      btn.style.opacity = "1";
      btn.style.transform = "translateY(0)";
    };

    // ── Redirect ─────────────────────────────────────────────────────────
    // Use a full navigation to YouTube home. The auto-resume block at the top
    // of content.js reads focusActive:true from storage and restarts the
    // filter on the new page — so the session continues seamlessly.
    // We deliberately do NOT clear focusActive before navigating.
    btn.addEventListener("click", () => {
      window.location.href = "https://www.youtube.com/";
    });

    wrapper.append(icon, heading, msg, btn);
    document.body.appendChild(wrapper);

    // Reconnect observer — needed for navigations on the same tab
    if (observer && isRunning) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
}

function isShortShelf(shelf) {
  const headingEls = shelf.querySelectorAll(
    "#title, h2, h3, span#title, yt-shelf-header-layout *, yt-formatted-string, [class*='title']"
  );
  for (const el of headingEls) {
    const text = (el?.textContent || "").trim().toLowerCase();
    if (text === "shorts") return true;
  }
  if (shelf.querySelector("ytd-reel-item-renderer, ytd-shorts-lockup-view-model, a.reel-item-endpoint, a[href*='/shorts/']")) return true;
  const shortsLinks = shelf.querySelectorAll("a[href*='/shorts/']");
  if (shortsLinks.length >= 2) return true;
  return false;
}

function isShortsVideo(el) {
  const links = el.querySelectorAll("a[href]");
  for (const link of links) {
    if (link.href && link.href.includes("/shorts/")) return true;
  }
  const badges = el.querySelectorAll("badge-shape, ytd-badge-supported-renderer");
  for (const badge of badges) {
    const text = (badge.innerText || badge.getAttribute("aria-label") || "").toLowerCase();
    if (text.includes("shorts")) return true;
  }
  return false;
}

function hideShortsContainers() {
  const shortsAnchors = document.querySelectorAll("a[href*='/shorts/']");
  shortsAnchors.forEach(anchor => {
    if (anchor.closest(PROTECTED) || anchor.closest("[data-fg-hidden]")) return;
    let container = anchor.closest("ytd-shelf-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer");
    if (!container) {
      let parent = anchor.parentElement;
      for (let i = 0; i < 8 && parent; i++) {
        if (parent.classList && (
          parent.classList.contains("ytd-item-section-renderer") ||
          parent.classList.contains("yt-horizontal-list-renderer") ||
          parent.tagName === "YTD-ITEM-SECTION-RENDERER"
        )) { container = parent; break; }
        parent = parent.parentElement;
      }
    }
    if (!container) return;
    if (container.id === "contents" || container.tagName === "YTD-SECTION-LIST-RENDERER" || container.tagName === "YTD-SEARCH") return;
    if (container.hasAttribute("data-fg-hidden")) return;
    const shortsLinks = container.querySelectorAll("a[href*='/shorts/']");
    const totalLinks = container.querySelectorAll("a[href*='/watch?v='], a[href*='/shorts/']");
    if (shortsLinks.length >= 2 && shortsLinks.length >= (totalLinks.length * 0.5)) {
      hideEl(container);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// PLAYLIST / COURSE DETECTION
// ─────────────────────────────────────────────────────────────────────
function isPlaylistOrCourse(el) {
  const tag = el.tagName.toLowerCase();
  if (["ytd-playlist-renderer", "ytd-compact-playlist-renderer",
    "ytd-grid-playlist-renderer", "ytd-lockup-view-model",
    "yt-lockup-view-model"].includes(tag)) return true;
  if (el.querySelector("ytd-playlist-renderer, ytd-lockup-view-model, yt-lockup-view-model")) return true;
  const metaViews = el.querySelectorAll("yt-lockup-metadata-view-model");
  for (const meta of metaViews) {
    const metaText = (meta.innerText || "").toLowerCase();
    if (/\bplaylist\b/.test(metaText) || /\bcourse\b/.test(metaText)) return true;
  }
  const badge =
    el.querySelector("ytd-thumbnail-overlay-side-panel-renderer")?.innerText ||
    el.querySelector("ytd-thumbnail-overlay-bottom-panel-renderer")?.innerText || "";
  if (/\d+\s*(video|lesson|chapter|part)s?/i.test(badge)) return true;
  const lines = (el.innerText || "").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 0 && t.length < 50) {
      if (/\bcourse\b/i.test(t)) return true;
      if (/\bplaylist\b/i.test(t)) return true;
    }
    if (/\bview full course\b/i.test(t)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// SEMANTIC INTENT EXPANSION
// ─────────────────────────────────────────────────────────────────────
const INTENT_EXPANSION = {
  "python": ["numpy", "pandas", "django", "flask", "pytorch", "tensorflow",
    "pip", "jupyter", "scipy", "matplotlib", "fastapi", "asyncio",
    "pydantic", "sqlalchemy", "celery", "pytest"],

  "javascript": ["nodejs", "node.js", "react", "vue", "angular", "typescript",
    "webpack", "babel", "express", "nextjs", "deno", "jquery",
    "npm", "vite", "svelte", "eslint"],

  "java": ["spring", "maven", "gradle", "hibernate", "junit", "jvm",
    "servlet", "jdbc", "springboot", "tomcat", "intellij",
    "struts", "jackson"],

  "kotlin": ["android", "jetpack", "coroutines", "compose", "gradle",
    "ktor", "flow", "room", "retrofit"],

  "cpp": ["pointers", "stl", "cmake", "memory management", "templates",
    "namespace", "linked list", "vectors", "algorithms",
    "boost", "makefile", "oop"],

  "rust": ["cargo", "ownership", "borrowing", "lifetime", "tokio",
    "actix", "serde", "wasm", "traits", "enums"],

  "golang": ["goroutine", "channel", "go modules", "gin", "gorm",
    "concurrency", "interfaces", "cobra", "fiber"],

  "swift": ["xcode", "swiftui", "uikit", "cocoapods", "combine",
    "core data", "ios", "macos", "appkit"],

  "machine learning": ["neural network", "backpropagation", "gradient descent",
    "overfitting", "regularization", "cross validation",
    "feature engineering", "sklearn", "scikit"],

  "deep learning": ["cnn", "rnn", "lstm", "transformer", "attention",
    "bert", "gpt", "diffusion", "gan", "autoencoder",
    "pytorch", "tensorflow", "keras"],

  "data science": ["pandas", "numpy", "matplotlib", "seaborn", "sql",
    "tableau", "power bi", "etl", "eda", "statistics",
    "regression", "classification", "clustering"],

  "sql": ["mysql", "postgresql", "sqlite", "joins", "indexes",
    "queries", "stored procedures", "normalization", "nosql"],

  "web development": ["html", "css", "javascript", "react", "backend",
    "frontend", "api", "rest", "graphql", "http",
    "responsive", "deployment", "hosting"],

  "ui ux": ["figma", "sketch", "prototype", "wireframe", "typography",
    "color theory", "accessibility", "design system", "mockup"],

  "css": ["flexbox", "grid", "tailwind", "sass", "scss",
    "animations", "responsive", "bootstrap", "styled components"],

  "linux": ["bash", "shell", "terminal", "ubuntu", "debian", "arch",
    "kernel", "systemd", "cron", "chmod", "vim", "grep", "awk"],

  "devops": ["docker", "kubernetes", "ci cd", "jenkins", "github actions",
    "terraform", "ansible", "nginx", "aws", "azure", "gcp"],

  "networking": ["tcp ip", "dns", "http", "ssl", "firewall", "routing",
    "subnetting", "osi model", "vpn", "load balancer"],

  "physics": ["mechanics", "thermodynamics", "electromagnetism", "quantum",
    "relativity", "optics", "waves", "kinematics", "newton"],

  "chemistry": ["organic chemistry", "reactions", "periodic table", "bonding",
    "stoichiometry", "acids", "bases", "equilibrium", "electrolysis"],

  "biology": ["cell biology", "genetics", "dna", "evolution", "ecology",
    "anatomy", "physiology", "microbiology", "biochemistry"],

  "mathematics": ["calculus", "algebra", "geometry", "trigonometry", "statistics",
    "probability", "linear algebra", "differential equations",
    "number theory", "discrete math"],
};

const DISTRACTION_KEYWORDS = [
  "meme", "funny", "viral", "prank", "celebrity", "gossip", "drama",
  "reaction", "roast", "challenge", "exposed", "shocking", "gone wrong",
  "paranormal", "ghost", "horror", "beef", "rant", "irl"
];

function expandIntent(intentWords) {
  const expanded = new Set(intentWords);

  for (const word of intentWords) {
    if (INTENT_EXPANSION[word]) {
      INTENT_EXPANSION[word].forEach(s => expanded.add(s));
      continue;
    }
    for (const [key, synonyms] of Object.entries(INTENT_EXPANSION)) {
      const keyWords = key.split(" ");
      const matchesKey = keyWords.some(kw => kw === word || word === kw);
      const matchesSynonym = synonyms.some(s => s === word);
      if (matchesKey || matchesSynonym) {
        synonyms.forEach(s => expanded.add(s));
        keyWords.forEach(kw => expanded.add(kw));
      }
    }
  }

  return Array.from(expanded);
}

function isBasicRelevant(text, intentWords) {
  if (!text || !intentWords.length) return false;

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
  const contextWords = ["tutorial", "course", "learn", "how to", "guide",
    "introduction", "beginner", "lesson", "walkthrough", "step by step",
    "explained", "crash course", "for beginners", "from scratch"];
  let hasIntent = false;
  for (const word of intentWords) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) hasIntent = true;
    const regex = new RegExp(
      `\\b${word}\\b.{0,40}(${contextWords.join("|")})|(${contextWords.join("|")}).{0,40}\\b${word}\\b`, "i"
    );
    if (regex.test(text)) score += 5;
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
  const results = [];
  const seen = new WeakSet();
  const candidates = document.querySelectorAll(
    'div[class], section, ul, ol, ytd-section-list-renderer, ' +
    'ytd-rich-grid-renderer, ytd-item-section-renderer'
  );
  candidates.forEach(el => {
    if (seen.has(el)) return;
    if (el.closest(PROTECTED)) return;
    if (el.hasAttribute("data-fg-hidden")) return;
    const children = Array.from(el.children).filter(c =>
      c.offsetHeight > 80 && c.offsetWidth > 100
    );
    if (children.length < 4) return;
    const heights = children.map(c => c.offsetHeight);
    const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
    const isUniform = heights.every(h => Math.abs(h - avg) < avg * 0.35);
    const isTall = el.scrollHeight > window.innerHeight * 0.6;
    if (isUniform && isTall) {
      seen.add(el);
      results.push(el);
      children.forEach(c => {
        if (!seen.has(c)) { seen.add(c); results.push(c); }
      });
    }
  });
  return results;
}

// ─────────────────────────────────────────────────────────────────────
// VIDEO CARDS
// ─────────────────────────────────────────────────────────────────────
function getVideoCards() {
  const legacyCards = Array.from(document.querySelectorAll([
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-renderer",
    "ytd-compact-playlist-renderer",
    "ytd-grid-playlist-renderer",
    "ytd-lockup-view-model",
    "yt-lockup-view-model",
    "ytd-shelf-renderer",
    "ytd-radio-renderer",
    "ytd-horizontal-card-list-renderer",
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
    if (!allCards.some(existing => existing.contains(card) || card.contains(existing))) {
      allCards.push(card);
    }
  });

  const structuralFeeds = findFeedLikeContainers();
  structuralFeeds.forEach(el => {
    if (!el.closest(PROTECTED) &&
      !el.hasAttribute("data-fg-hidden") &&
      !allCards.some(existing => existing.contains(el) || el.contains(existing))) {
      allCards.push(el);
    }
  });

  return allCards;
}

function getWatchPageSuggestionCards() {
  const container = document.querySelector("ytd-watch-next-secondary-results-renderer");
  if (!container) return [];
  const metaItems = container.querySelectorAll("yt-lockup-metadata-view-model");
  const cards = [];
  const seen = new WeakSet();
  metaItems.forEach(meta => {
    let card = meta;
    let parent = meta.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      if (parent === container ||
        parent.tagName === "YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER" ||
        parent.tagName === "YTD-ITEM-SECTION-RENDERER") break;
      card = parent;
      parent = parent.parentElement;
    }
    if (!seen.has(card) && !card.closest(PROTECTED)) {
      seen.add(card);
      cards.push(card);
    }
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
  console.log(`🔍 Scanning ${cards.length} cards...`);

  cards.forEach(el => {
    if (el.closest("[data-fg-hidden]")) return;
    const text = (el.innerText || "").toLowerCase();
    const relevant = isBasicRelevant(text, intentWords);

    if (isPlaylistOrCourse(el)) {
      if (relevant) { showEl(el); el.classList.remove("fg-blur"); }
      else { el.classList.add("fg-blur"); }
      return;
    }

    if (relevant) { showEl(el); el.classList.remove("fg-blur"); }
    else { el.classList.add("fg-blur"); }
  });

  filterViewModelSuggestions(intentWords);

  try {
    const player = document.querySelector("#player") || document.querySelector(".html5-video-player");
    const titleEl = document.querySelector('h1.title, h1.ytd-watch-metadata, #container h1');
    const descEl = document.querySelector('#description, #description-inner, .ytd-video-secondary-info-renderer');
    let mainText = "";
    if (titleEl) mainText += titleEl.innerText.toLowerCase() + " ";
    if (descEl) mainText += descEl.innerText.toLowerCase();
    if (player) {
      if (!isBasicRelevant(mainText, intentWords)) { player.classList.add("fg-blur"); }
      else { player.classList.remove("fg-blur"); }
    }
  } catch (e) { /* ignore */ }
}

function filterViewModelSuggestions(intentWords) {
  const container = document.querySelector("ytd-watch-next-secondary-results-renderer");
  if (!container) return;

  const alreadyHandled = container.querySelectorAll("[data-fg-handled]");
  if (alreadyHandled.length > 0) return;

  const metaItems = container.querySelectorAll("yt-lockup-metadata-view-model");
  metaItems.forEach(meta => {
    let card = meta;
    let parent = meta.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      if (parent === container ||
        parent.tagName === "YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER" ||
        parent.tagName === "YTD-ITEM-SECTION-RENDERER") break;
      card = parent;
      parent = parent.parentElement;
    }
    if (card.closest(PROTECTED)) return;
    if (card.hasAttribute("data-fg-hidden") || card.classList.contains("fg-blur")) return;

    const text = (card.innerText || "").toLowerCase();
    if (isBasicRelevant(text, intentWords)) { card.classList.remove("fg-blur"); }
    else { card.classList.add("fg-blur"); }
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
  const timerText = document.createElement("span");
  timerText.innerText = config.mode === "timer" ? "⏱ --:--" : "⚡ Focus Active";
  timerText.style.cssText = "font-size:12px;color:#9ca3af;min-width:90px;";
  const pauseBtn = document.createElement("button");
  pauseBtn.innerText = "⏸"; pauseBtn.className = "fg-btn";
  pauseBtn.onclick = () => { paused = !paused; pauseBtn.innerText = paused ? "▶" : "⏸"; };
  const stopBtn = document.createElement("button");
  stopBtn.innerText = "✕"; stopBtn.className = "fg-btn";
  stopBtn.style.cssText = "color:#f87171;";
  stopBtn.onclick = () => {
    // Also update storage so popup reflects stopped state
    chrome.storage.sync.set({ focusActive: false });
    stopExtension();
  };
  panel.append(timerText, pauseBtn, stopBtn);
  if (document.body) {
    document.body.appendChild(panel);
    panel.timerText = timerText;
  }
}

function startTimer(endTime) {
  const panel = document.querySelector(".fg-control-panel");
  const timerText = panel?.timerText;
  timerInterval = setInterval(() => {
    if (paused) return;
    const rem = endTime - Date.now();
    if (rem <= 0) {
      clearInterval(timerInterval);
      if (timerText) timerText.innerText = "⏰ Done!";
      chrome.storage.sync.set({ focusActive: false });
      stopExtension();
      return;
    }
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    if (timerText) timerText.innerText = `⏱ ${m}:${s.toString().padStart(2, "0")}`;
  }, 1000);
}
