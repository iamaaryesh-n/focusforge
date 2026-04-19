const modeSelect = document.getElementById("modeSelect");
const timerContainer = document.getElementById("timerContainer");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const prefComments = document.getElementById("prefComments");

// ─── Helpers ──────────────────────────────────────────────────────────
function setStatus(active) {
  if (active) {
    statusDot.className = "status-dot active";
    statusText.textContent = "🟢 Active";
    statusText.className = "status-text active";
    startBtn.style.opacity = "0.5";
    stopBtn.style.opacity = "1";
    stopBtn.style.pointerEvents = "auto";
  } else {
    statusDot.className = "status-dot inactive";
    statusText.textContent = "⚫ Inactive";
    statusText.className = "status-text";
    startBtn.style.opacity = "1";
    stopBtn.style.opacity = "0.45";
    stopBtn.style.pointerEvents = "none";
  }
}

function setTimerVisible(visible) {
  timerContainer.classList.toggle("visible", visible);
}

// ─── SHOW / HIDE TIMER ────────────────────────────────────────────────
modeSelect.addEventListener("change", () => {
  setTimerVisible(modeSelect.value === "timer");
});

// ─── SAVE PREFS ON TOGGLE ─────────────────────────────────────────────
// Fires the instant the toggle is clicked.
// 1. Persist to storage (fire-and-forget, for page-reload recovery)
// 2. Simultaneously read only focusActive and send prefs to the tab NOW
//    — the prefs value is carried IN the message, no storage read needed.
prefComments.addEventListener("change", savePrefsOnly);

function savePrefsOnly() {
  const prefs = { blurComments: prefComments.checked };

  // Persist (async, we don't wait for it)
  chrome.storage.local.set({ prefs });

  // Send to content script immediately — only needs focusActive flag
  chrome.storage.local.get(["focusActive"], (s) => {
    if (s.focusActive) {
      sendMessageToActiveTab({ action: "updatePrefs", prefs });
    }
  });
}


// ─── LOAD PREVIOUS SETTINGS ───────────────────────────────────────────
chrome.storage.local.get(null, (config) => {
  if (!config) return;
  const isActive = config.focusActive || false;
  modeSelect.value = config.mode || "normal";
  document.getElementById("intentInput").value = config.intent || "";
  setStatus(isActive);
  setTimerVisible(config.mode === "timer");

  // Restore pref checkboxes
  const prefs = config.prefs || {};
  prefComments.checked = prefs.blurComments || false;
});

// ─── START FOCUS ──────────────────────────────────────────────────────
startBtn.addEventListener("click", () => {
  const intentValue = document.getElementById("intentInput").value.trim();
  if (!intentValue) { alert("Please enter your focus intent."); return; }

  const prefs = {
    blurComments: prefComments.checked,
  };

  const config = {
    focusActive: true,
    mode: modeSelect.value,
    level: "basic",
    intent: intentValue.toLowerCase(),
    endTime: null,
    prefs,
  };

  if (config.mode === "timer") {
    const time = parseInt(document.getElementById("timerInput").value);
    if (!time || time <= 0) { alert("Please enter a valid time."); return; }
    config.endTime = Date.now() + time * 60000;
  }

  chrome.storage.local.set(config, () => {
    setStatus(true);
    sendMessageToActiveTab({ action: "startFocus", config });
  });
});

// ─── STOP FOCUS ───────────────────────────────────────────────────────
stopBtn.addEventListener("click", () => {
  chrome.storage.local.set({ focusActive: false }, () => {
    setStatus(false);
    sendMessageToActiveTab({ action: "stopFocus" });
  });
});

// ─── MESSAGE HELPER with injection fallback ───────────────────────────
function sendMessageToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length || !tabs[0].id) return;
    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId, message, () => {
      if (!chrome.runtime.lastError) return;
      console.log("⚙️ Injecting content script...");
      Promise.all([
        chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }),
        chrome.scripting.insertCSS({ target: { tabId }, files: ["styles.css"] })
      ]).then(() => {
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, message, () => {
            if (chrome.runtime.lastError) console.warn("❌ Retry failed:", chrome.runtime.lastError.message);
          });
        }, 150);
      }).catch(err => console.warn("❌ Injection failed:", err.message));
    });
  });
}
