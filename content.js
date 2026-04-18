let observer = null;
let paused = false;
let timerInterval;
let isRunning = false;
 
console.log("Focus Guard Loaded ✅");
 
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
  // Ensure any previous timer/interval is cleared
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
  // Also remove all blur effects
  document.querySelectorAll(".fg-blur").forEach(el => {
    el.classList.remove("fg-blur");
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
    }, 150);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // Listen for YouTube navigation events and history changes
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
// YouTube uses multiple different architectures for shorts:
//   - Legacy: ytd-reel-shelf-renderer, ytd-reel-item-renderer
//   - Search page: ytd-shelf-renderer with "Shorts" title using
//     yt-shelf-header-layout + reel-item-endpoint anchors
//   - New View Model: shortsLockupViewModelHostEndpoint
//   - Individual shorts mixed as ytd-video-renderer with /shorts/ URLs
// ─────────────────────────────────────────────────────────────────────
function hideShortsSection() {
  // 1. Hide legacy shorts containers
  document.querySelectorAll(
    "ytd-search-header-renderer, " +
    "ytd-reel-shelf-renderer, " +
    "ytd-reel-item-renderer, " +
    "ytd-shorts-lockup-view-model"
  ).forEach(el => {
    if (!el.closest(PROTECTED)) hideEl(el);
  });

  // 2. Hide shelf containers that wrap shorts
  document.querySelectorAll("ytd-shelf-renderer").forEach(shelf => {
    if (shelf.closest(PROTECTED) || shelf.hasAttribute("data-fg-hidden")) return;
    if (isShortShelf(shelf)) {
      hideEl(shelf);
    }
  });

  // 3. Hide individual shorts rendered as ytd-video-renderer
  document.querySelectorAll("ytd-video-renderer").forEach(vr => {
    if (vr.closest(PROTECTED) || vr.hasAttribute("data-fg-hidden")) return;
    if (isShortsVideo(vr)) {
      hideEl(vr);
    }
  });

  // 4. Nuclear approach: find ALL containers with /shorts/ links clustered
  //    together and hide them. This catches any new YouTube structure.
  hideShortsContainers();

  // 5. Hide Shorts link in navigation sidebars (main and mini)
  //    Check by text/title to be completely robust
  document.querySelectorAll("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer").forEach(entry => {
    const text = (entry.textContent || "").trim().toLowerCase();
    const title = (entry.getAttribute("title") || "").trim().toLowerCase();
    if (text === "shorts" || title === "shorts") {
      entry.style.setProperty("display", "none", "important");
    }
  });

  // 6. If user navigated directly to a Shorts page, completely make it unavailable
  if (window.location.pathname.startsWith("/shorts/")) {
    document.body.innerHTML = `
      <div style="display:flex; justify-content:center; align-items:center; height:100vh; background:#0f0f0f; color:white; flex-direction:column; font-family:sans-serif;">
        <h1 style="font-size:2rem; margin-bottom:1rem;">Focus Layer Active</h1>
        <p>Shorts are completely disabled during your focus session.</p>
        <button onclick="window.location.href='/'" style="margin-top:20px; padding:10px 20px; font-size:1rem; cursor:pointer; background:#3ea6ff; color:#000; border:none; border-radius:5px; font-weight:bold;">Go to Home</button>
      </div>`;
  }
}

// Check if a shelf-renderer is a Shorts shelf
function isShortShelf(shelf) {
  // Strategy 1: Check text content of any heading-like element inside the shelf
  const headingEls = shelf.querySelectorAll(
    "#title, h2, h3, span#title, " +
    "yt-shelf-header-layout *, " +
    "yt-formatted-string, " +
    "[class*='title']"
  );
  for (const el of headingEls) {
    const text = (el?.textContent || "").trim().toLowerCase();
    if (text === "shorts") return true;
  }

  // Strategy 2: Check if the shelf contains reel/shorts items
  if (shelf.querySelector(
    "ytd-reel-item-renderer, ytd-shorts-lockup-view-model, " +
    "a.reel-item-endpoint, a[href*='/shorts/']"
  )) return true;

  // Strategy 3: Check if there are multiple /shorts/ links (cluster = shorts section)
  const shortsLinks = shelf.querySelectorAll("a[href*='/shorts/']");
  if (shortsLinks.length >= 2) return true;

  return false;
}

// Check if a ytd-video-renderer is actually a Short
function isShortsVideo(el) {
  // Check for /shorts/ in any link
  const links = el.querySelectorAll("a[href]");
  for (const link of links) {
    if (link.href && link.href.includes("/shorts/")) return true;
  }
  // Check for Shorts badge
  const badges = el.querySelectorAll("badge-shape, ytd-badge-supported-renderer");
  for (const badge of badges) {
    const text = (badge.innerText || badge.getAttribute("aria-label") || "").toLowerCase();
    if (text.includes("shorts")) return true;
  }
  return false;
}

// Nuclear approach: find and hide any container that holds a cluster of
// shorts links. This handles YouTube's new view model architecture where
// shorts are rendered as <a class="reel-item-endpoint"> with /shorts/ URLs
// inside generic containers.
function hideShortsContainers() {
  const shortsAnchors = document.querySelectorAll("a[href*='/shorts/']");
  
  shortsAnchors.forEach(anchor => {
    if (anchor.closest(PROTECTED) || anchor.closest("[data-fg-hidden]")) return;

    // Find the nearest wrapper that constitutes a "shelf" or section
    // Typically ytd-shelf-renderer, ytd-rich-shelf-renderer, or a specific div
    let container = anchor.closest("ytd-shelf-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer");
    
    // If no custom tag wrapper, try to find a structural div that only contains the shorts
    if (!container) {
      let parent = anchor.parentElement;
      for (let i = 0; i < 8 && parent; i++) {
        // Look for common shelf/row container classes
        if (parent.classList && (
            parent.classList.contains("ytd-item-section-renderer") || 
            parent.classList.contains("yt-horizontal-list-renderer") ||
            parent.tagName === "YTD-ITEM-SECTION-RENDERER"
        )) {
            container = parent;
            break;
        }
        parent = parent.parentElement;
      }
    }

    if (!container) return; // Unsafe to hide unknown structure

    // Ensure we don't hide the entire page's contents!
    if (container.id === "contents" || container.tagName === "YTD-SECTION-LIST-RENDERER" || container.tagName === "YTD-SEARCH") {
        return;
    }

    if (container.hasAttribute("data-fg-hidden")) return;

    // Count how many shorts are in this container
    const shortsLinks = container.querySelectorAll("a[href*='/shorts/']");
    const totalLinks = container.querySelectorAll("a[href*='/watch?v='], a[href*='/shorts/']");
    
    // If it's densely packed with shorts (e.g. >= 2 shorts and mostly shorts)
    if (shortsLinks.length >= 2 && shortsLinks.length >= (totalLinks.length * 0.5)) {
      hideEl(container);
      console.log("🎬 Hiding shorts container:", container.tagName, 
        "with", shortsLinks.length, "shorts links");
    }
  });
}
 
// ─────────────────────────────────────────────────────────────────────
// PLAYLIST / COURSE DETECTION
// Handles both legacy (ytd-playlist-renderer) and new (yt-lockup-view-model)
// ─────────────────────────────────────────────────────────────────────
function isPlaylistOrCourse(el) {
  const tag = el.tagName.toLowerCase();
 
  // Direct tag match (both old and new)
  if (["ytd-playlist-renderer", "ytd-compact-playlist-renderer",
       "ytd-grid-playlist-renderer", "ytd-lockup-view-model",
       "yt-lockup-view-model"].includes(tag)) return true;
 
  // Contains playlist/lockup elements
  if (el.querySelector("ytd-playlist-renderer, ytd-lockup-view-model, yt-lockup-view-model")) return true;
 
  // Check for new yt-lockup-metadata-view-model with Playlist/Course text
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
// VIDEO CARDS
// ─────────────────────────────────────────────────────────────────────
function getVideoCards() {
  // Include all possible video cards and suggestions, even dynamically injected
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
    // Skip protected elements
    if (el.closest(PROTECTED)) return false;
    // Skip elements already hidden by shorts filter
    if (el.hasAttribute("data-fg-hidden")) return false;
    // Skip shorts-related elements (handled separately)
    if (el.closest("ytd-reel-shelf-renderer, ytd-reel-item-renderer")) return false;
    // Skip shelf-renderers that are shorts (already hidden)
    if (el.tagName === "YTD-SHELF-RENDERER") {
      if (isShortShelf(el)) return false;
    }
    // Skip individual shorts videos (already hidden by hideShortsSection)
    if (el.tagName === "YTD-VIDEO-RENDERER" && isShortsVideo(el)) return false;
    return true;
  });

  // New YouTube View Model suggestion cards (watch page sidebar)
  // YouTube now uses yt-lockup-metadata-view-model inside generic divs
  const viewModelCards = getWatchPageSuggestionCards();

  // Merge both, deduplicate by checking if a legacy card already contains a viewModel card
  const allCards = [...legacyCards];
  viewModelCards.forEach(card => {
    if (!allCards.some(existing => existing.contains(card) || card.contains(existing))) {
      allCards.push(card);
    }
  });
  return allCards;
}

// ─────────────────────────────────────────────────────────────────────
// NEW: Watch page sidebar suggestion cards (View Model architecture)
// YouTube moved from ytd-compact-video-renderer to yt-lockup-metadata-view-model
// Hierarchy: YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER > div > div > yt-lockup-metadata-view-model
// ─────────────────────────────────────────────────────────────────────
function getWatchPageSuggestionCards() {
  const container = document.querySelector("ytd-watch-next-secondary-results-renderer");
  if (!container) return [];

  const metaItems = container.querySelectorAll("yt-lockup-metadata-view-model");
  const cards = [];
  const seen = new WeakSet();

  metaItems.forEach(meta => {
    // Walk up to find the suggestion card wrapper div
    // The card is typically the div that is a direct child of the main items container
    let card = meta;
    let parent = meta.parentElement;
    // Walk up max 5 levels to find the card-level wrapper
    for (let i = 0; i < 5 && parent; i++) {
      // Stop if we hit the main container or a known wrapper
      if (parent === container ||
          parent.tagName === "YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER" ||
          parent.tagName === "YTD-ITEM-SECTION-RENDERER") {
        break;
      }
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
// RELEVANCE — \b word boundary: "java" won't match "javascript"
// ─────────────────────────────────────────────────────────────────────
// SMARTER RELEVANCE: Require context, not just word match
function isContextuallyRelevant(text, intentWords) {
  if (!intentWords.length) return true;
  let score = 0;
  const contextWords = ["tutorial", "course", "learn", "how to", "guide", "introduction", "beginner", "lesson", "walkthrough", "step by step"];
  let hasIntent = false;
  for (const word of intentWords) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) hasIntent = true;
    // Require the intent word AND a context word nearby
    const regex = new RegExp(`\\b${word}\\b.{0,40}(${contextWords.join("|")})|(${contextWords.join("|")}).{0,40}\\b${word}\\b`, "i");
    if (regex.test(text)) score += 5;
    // Bonus for exact phrase
    if (text.includes(word + " tutorial") || text.includes("tutorial " + word)) score += 3;
    // Fallback: if the whole intent phrase is present
    if (text.includes(intentWords.join(" "))) score += 2;
  }
  // Penalize for entertainment/distraction keywords
  let irrelevant = false;
  ["meme", "funny", "viral", "prank", "celebrity", "gossip", "drama", "reaction"].forEach(w => {
    if (text.includes(w)) irrelevant = true;
  });
  // If intent word is present and not irrelevant, always show
  if (hasIntent && !irrelevant) return true;
  return score >= 3;
}
 
// ─────────────────────────────────────────────────────────────────────
// MAIN FILTER
// ─────────────────────────────────────────────────────────────────────
function runFilter(config, intentWords) {
  if (paused || !isRunning) return;
 
  hideShortsSection();
 
  const cards = getVideoCards();
  console.log(`🔍 Scanning ${cards.length} cards (including view-model suggestions)...`);

  cards.forEach(el => {
    if (el.closest("[data-fg-hidden]")) return;

    const text = (el.innerText || "").toLowerCase();
    // Check if content matches any intent word
    let relevant = false;
    for (const word of intentWords) {
      if (text.includes(word)) {
        relevant = true;
        break;
      }
    }

    // Playlists/courses: blur if irrelevant (not unconditionally hidden)
    if (isPlaylistOrCourse(el)) {
      if (relevant) {
        showEl(el);
        el.classList.remove("fg-blur");
      } else {
        el.classList.add("fg-blur");
      }
      return;
    }

    if (relevant) {
      showEl(el);
      el.classList.remove("fg-blur");
    } else {
      el.classList.add("fg-blur");
    }
  });

  // Additionally, directly handle any new view-model items that might have been missed
  filterViewModelSuggestions(intentWords);

  // Blur the main video player if not relevant
  try {
    const player = document.querySelector("#player") || document.querySelector(".html5-video-player");
    const titleEl = document.querySelector('h1.title, h1.ytd-watch-metadata, #container h1');
    const descEl = document.querySelector('#description, #description-inner, .ytd-video-secondary-info-renderer');
    let mainText = "";
    if (titleEl) mainText += titleEl.innerText.toLowerCase() + " ";
    if (descEl) mainText += descEl.innerText.toLowerCase();
    let relevant = false;
    for (const word of intentWords) {
      if (mainText.includes(word)) {
        relevant = true;
        break;
      }
    }
    if (player) {
      if (!relevant) {
        player.classList.add("fg-blur");
      } else {
        player.classList.remove("fg-blur");
      }
    }
  } catch (e) {
    // ignore errors
  }
}

// ─────────────────────────────────────────────────────────────────────
// Direct filter for new YouTube View Model suggestion items
// Catches any watch page suggestions that getVideoCards() might miss
// ─────────────────────────────────────────────────────────────────────
function filterViewModelSuggestions(intentWords) {
  const container = document.querySelector("ytd-watch-next-secondary-results-renderer");
  if (!container) return;

  // Target each yt-lockup-metadata-view-model as a suggestion
  const metaItems = container.querySelectorAll("yt-lockup-metadata-view-model");
  metaItems.forEach(meta => {
    // Get the suggestion card wrapper (walk up to the card-level div)
    let card = meta;
    let parent = meta.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      if (parent === container ||
          parent.tagName === "YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER" ||
          parent.tagName === "YTD-ITEM-SECTION-RENDERER") {
        break;
      }
      card = parent;
      parent = parent.parentElement;
    }

    if (card.closest(PROTECTED)) return;
    // Skip if already handled by the main filter
    if (card.hasAttribute("data-fg-hidden") || card.classList.contains("fg-blur")) return;

    const text = (card.innerText || "").toLowerCase();
    let relevant = false;
    for (const word of intentWords) {
      if (text.includes(word)) {
        relevant = true;
        break;
      }
    }
    if (relevant) {
      card.classList.remove("fg-blur");
    } else {
      card.classList.add("fg-blur");
    }
  });
}
 
function createControlPanel(config) {
  const oldPanel = document.querySelector(".fg-control-panel");
  if (oldPanel) oldPanel.remove();
  const panel = document.createElement("div");
  panel.className = "fg-control-panel";
  const timerText = document.createElement("span");
  timerText.innerText = "⏱ --:--";
  const pauseBtn = document.createElement("button");
  pauseBtn.innerText = "⏸"; pauseBtn.className = "fg-btn";
  pauseBtn.onclick = () => { paused = !paused; pauseBtn.innerText = paused ? "▶" : "⏸"; };
  const stopBtn = document.createElement("button");
  stopBtn.innerText = "✕"; stopBtn.className = "fg-btn";
  stopBtn.onclick = stopExtension;
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
      return;
    }
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    if (timerText) timerText.innerText = `⏱ ${m}:${s.toString().padStart(2, "0")}`;
  }, 1000);
}
