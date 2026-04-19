const modeSelect = document.getElementById("modeSelect");
const timerContainer = document.getElementById("timerContainer");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

// ─── Helpers ───────────────────────────────────────────────────────────
function setStatus(active) {
  if (active) {
    statusDot.className = "status-dot active";
    statusText.textContent = "🟢 Active";
    statusText.className = "status-text active";
    // Visual feedback only — do NOT disable Start so user can always re-trigger
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
  if (visible) {
    timerContainer.classList.add("visible");
  } else {
    timerContainer.classList.remove("visible");
  }
}

// ─── SHOW / HIDE TIMER INPUT ───────────────────────────────────────────
modeSelect.addEventListener("change", () => {
  setTimerVisible(modeSelect.value === "timer");
});

// ─── LOAD PREVIOUS SETTINGS ───────────────────────────────────────────
chrome.storage.local.get(null, (config) => {
  if (!config) return;

  const isActive = config.focusActive || false;
  modeSelect.value = config.mode || "normal";
  document.getElementById("intentInput").value = config.intent || "";

  setStatus(isActive);
  setTimerVisible(config.mode === "timer");
});

// ─── START FOCUS ───────────────────────────────────────────────────────
startBtn.addEventListener("click", () => {
  const intentValue = document.getElementById("intentInput").value.trim();

  if (!intentValue) {
    alert("Please enter your focus intent.");
    return;
  }

  const config = {
    focusActive: true,
    mode: modeSelect.value,
    level: "basic",
    intent: intentValue.toLowerCase(),
    endTime: null
  };

  if (config.mode === "timer") {
    const time = parseInt(document.getElementById("timerInput").value);
    if (!time || time <= 0) {
      alert("Please enter a valid time.");
      return;
    }
    config.endTime = Date.now() + time * 60000;
  }

  chrome.storage.local.set(config, () => {
    setStatus(true);
    sendMessageToActiveTab({ action: "startFocus", config });
  });
});

// ─── STOP FOCUS ────────────────────────────────────────────────────────
stopBtn.addEventListener("click", () => {
  chrome.storage.local.set({ focusActive: false }, () => {
    setStatus(false);
    sendMessageToActiveTab({ action: "stopFocus" });
  });
});

// ─── MESSAGE HELPER — with script injection fallback ──────────────────
// If the content script is orphaned (e.g. extension was reloaded while the
// tab was already open), chrome.tabs.sendMessage fails silently. We catch
// that and re-inject content.js + styles.css, then retry the message.
function sendMessageToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length || !tabs[0].id) return;
    const tabId = tabs[0].id;

    chrome.tabs.sendMessage(tabId, message, () => {
      if (!chrome.runtime.lastError) return;

      // Content script not reachable — inject it fresh, then retry
      console.log("⚙️ Content script not found, injecting...");

      Promise.all([
        chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }),
        chrome.scripting.insertCSS({ target: { tabId }, files: ["styles.css"] })
      ])
        .then(() => {
          // Give the script a moment to initialise before sending the message
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, () => {
              if (chrome.runtime.lastError) {
                console.warn("❌ Retry also failed:", chrome.runtime.lastError.message);
              } else {
                console.log("✅ Message delivered after injection.");
              }
            });
          }, 150);
        })
        .catch((err) => {
          console.warn("❌ Script injection failed:", err.message);
        });
    });
  });
}
