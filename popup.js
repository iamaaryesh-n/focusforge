const modeSelect = document.getElementById("modeSelect");
const timerContainer = document.getElementById("timerContainer");

const startBtn = document.getElementById("startBtn");
const focusToggle = document.getElementById("focusToggle");

// SHOW / HIDE TIMER INPUT
modeSelect.addEventListener("change", () => {
  timerContainer.style.display =
    modeSelect.value === "timer" ? "block" : "none";
});

// LOAD PREVIOUS SETTINGS
chrome.storage.sync.get(null, (config) => {
  if (!config) return;

  focusToggle.checked = config.focusActive || false;
  modeSelect.value = config.mode || "normal";
  document.getElementById("levelSelect").value = config.level || "basic";
  document.getElementById("intentInput").value = config.intent || "";

  if (config.mode === "timer") {
    timerContainer.style.display = "block";
  }
});

// 🚀 START FOCUS (FINAL FIX)
startBtn.onclick = () => {
  const intentValue = document.getElementById("intentInput").value.trim();

  if (!intentValue) {
    alert("Please enter your focus intent.");
    return;
  }

  const config = {
    focusActive: true,
    mode: modeSelect.value,
    level: document.getElementById("levelSelect").value,
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

  chrome.storage.sync.set(config, () => {
    focusToggle.checked = true;
    sendMessageToActiveTab({ action: "startFocus", config });
  });
};

// 🛑 STOP
focusToggle.addEventListener("change", () => {
  if (!focusToggle.checked) {
    chrome.storage.sync.set({ focusActive: false }, () => {
      sendMessageToActiveTab({ action: "stopFocus" });
    });
  }
});

// ✅ FIXED MESSAGE FUNCTION (NO RELOAD)
function sendMessageToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, message, () => {
        if (chrome.runtime.lastError) {
          console.log("⚠️ Content script not ready, ignoring...");
          // ❌ NO RELOAD HERE
        }
      });
    }
  });
}