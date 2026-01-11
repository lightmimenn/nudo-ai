// ====== CONFIG ======
const WORKER_BASE = "https://YOUR_WORKER_SUBDOMAIN.workers.dev"; // <-- вставишь после деплоя воркера
const DISCORD_INVITE = "https://discord.gg/YOUR_INVITE"; // <-- вставь инвайт

// banned topics quick client-side (очень грубо; основная защита — на модели)
const BANNED_HINTS = [
  "porn","sex","эрот","порн","секс",
  "terror","террор","isis","игил",
  "extrem","экстрем",
  "putin","байден","трамп","выбор","политик","политика"
];

// ====== STATE (no chat persistence) ======
const state = {
  mode: localStorage.getItem("nudo_mode") || "text",
  model: localStorage.getItem("nudo_model") || "chatgpt-4o-latest",
  showUsage: localStorage.getItem("nudo_usage") || "yes",
  customInstructions: localStorage.getItem("nudo_custom") || "",
  code: localStorage.getItem("nudo_code") || "",
  meta: null,
  messages: [],
  abort: null
};

// ====== DOM ======
const bg = document.getElementById("bg");
const log = document.getElementById("log");
const composer = document.getElementById("composer");
const input = document.getElementById("input");
const btnSend = document.getElementById("btnSend");
const btnStop = document.getElementById("btnStop");
const modePill = document.getElementById("modePill");

const overlay = document.getElementById("overlay");
const regionBlocked = document.getElementById("regionBlocked");
const codeModal = document.getElementById("codeModal");
const settingsModal = document.getElementById("settingsModal");
const promptsModal = document.getElementById("promptsModal");
const docModal = document.getElementById("docModal");
const errorModal = document.getElementById("errorModal");

const btnSettings = document.getElementById("btnSettings");
const btnPrompts = document.getElementById("btnPrompts");
const btnExit = document.getElementById("btnExit");

const codeInput = document.getElementById("codeInput");
const btnSaveCode = document.getElementById("btnSaveCode");
const btnDiscord = document.getElementById("btnDiscord");

const modeSelect = document.getElementById("modeSelect");
const modelSelect = document.getElementById("modelSelect");
const showUsage = document.getElementById("showUsage");
const customInstructions = document.getElementById("customInstructions");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const btnResetSettings = document.getElementById("btnResetSettings");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const btnClosePrompts = document.getElementById("btnClosePrompts");

const openTerms = document.getElementById("openTerms");
const openPrivacy = document.getElementById("openPrivacy");
const openSupport = document.getElementById("openSupport");
const docTitle = document.getElementById("docTitle");
const docSub = document.getElementById("docSub");
const docBody = document.getElementById("docBody");
const btnCloseDoc = document.getElementById("btnCloseDoc");

const errTitle = document.getElementById("errTitle");
const errSub = document.getElementById("errSub");
const btnCloseError = document.getElementById("btnCloseError");

const btnCloseBlocked = document.getElementById("btnCloseBlocked");

// ====== BG animation: red stains ======
function setupBG() {
  const ctx = bg.getContext("2d");
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    bg.width = Math.floor(window.innerWidth * dpr);
    bg.height = Math.floor(window.innerHeight * dpr);
    bg.style.width = window.innerWidth + "px";
    bg.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  const blobs = [];
  const maxBlobs = 14;

  function spawn() {
    if (blobs.length >= maxBlobs) return;
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * window.innerHeight;
    const r = 120 + Math.random() * 260;
    const life = 6000 + Math.random() * 9000;
    blobs.push({ x, y, r, life, born: performance.now() });
  }

  function draw(t) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // subtle vignette
    const g = ctx.createRadialGradient(
      window.innerWidth / 2, window.innerHeight / 2, 100,
      window.innerWidth / 2, window.innerHeight / 2, Math.max(window.innerWidth, window.innerHeight)
    );
    g.addColorStop(0, "rgba(0,0,0,0.0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = blobs.length - 1; i >= 0; i--) {
      const b = blobs[i];
      const age = t - b.born;
      const p = Math.min(1, age / b.life);
      const fade = p < 0.2 ? (p / 0.2) : (p > 0.85 ? (1 - p) / 0.15 : 1);
      const alpha = 0.18 * fade;

      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      grad.addColorStop(0, `rgba(255,43,43,${alpha})`);
      grad.addColorStop(1, "rgba(255,43,43,0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      if (p >= 1) blobs.splice(i, 1);
    }

    if (Math.random() < 0.08) spawn();
    requestAnimationFrame(draw);
  }

  for (let i = 0; i < 6; i++) spawn();
  requestAnimationFrame(draw);
}

// ====== helpers ======
btnDiscord.href = DISCORD_INVITE;

marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false
});

function showOverlay(modalEl) {
  overlay.classList.remove("hidden");
  [regionBlocked, codeModal, settingsModal, promptsModal, docModal, errorModal].forEach(m => m.classList.add("hidden"));
  modalEl.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
  [regionBlocked, codeModal, settingsModal, promptsModal, docModal, errorModal].forEach(m => m.classList.add("hidden"));
}

function showError(title, sub) {
  errTitle.textContent = title;
  errSub.textContent = sub;
  showOverlay(errorModal);
}

function setModeUI() {
  modePill.textContent = state.mode === "code" ? "Coding mode" : "Text generation";
}

function isProbablyBanned(text) {
  const s = (text || "").toLowerCase();
  return BANNED_HINTS.some(k => s.includes(k));
}

// ====== cards ======
function createCard(role) {
  const card = document.createElement("div");
  card.className = "card";

  const head = document.createElement("div");
  head.className = "card-head";

  const roleEl = document.createElement("div");
  roleEl.className = "role " + (role === "user" ? "user" : "ai");
  roleEl.textContent = role === "user" ? "You" : "NudoAI";

  const actions = document.createElement("div");
  actions.className = "card-actions";

  head.appendChild(roleEl);
  head.appendChild(actions);

  const body = document.createElement("div");
  body.className = "card-body";
  body.textContent = "";

  const usage = document.createElement("div");
  usage.className = "usage";
  usage.style.display = "none";

  card.appendChild(head);
  card.appendChild(body);
  card.appendChild(usage);

  log.appendChild(card);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

  return { card, head, actions, body, usage };
}

function renderMarkdown(el, text) {
  const raw = marked.parse(text || "");
  const safe = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  el.innerHTML = safe;
  el.querySelectorAll("pre code").forEach((block) => hljs.highlightElement(block));
}

function addUser(text) {
  const { body, actions } = createCard("user");
  body.textContent = text;

  const copyBtn = document.createElement("button");
  copyBtn.className = "iconbtn";
  copyBtn.textContent = "Copy";
  copyBtn.onclick = async () => {
    await navigator.clipboard.writeText(text);
  };
  actions.appendChild(copyBtn);
}

function addAssistantStreaming() {
  const { body, actions, usage } = createCard("assistant");
  body.textContent = "";
  let full = "";

  const copyBtn = document.createElement("button");
  copyBtn.className = "iconbtn";
  copyBtn.textContent = "Copy";
  copyBtn.onclick = async () => {
    await navigator.clipboard.writeText(full);
  };

  const regenBtn = document.createElement("button");
  regenBtn.className = "iconbtn";
  regenBtn.textContent = "Regenerate";
  regenBtn.onclick = () => regenerate();

  actions.appendChild(copyBtn);
  actions.appendChild(regenBtn);

  return {
    appendDelta(delta) {
      full += delta;
      body.textContent = full;
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    },
    finalize({ tokensIn, tokensOut, costUsd }) {
      renderMarkdown(body, full);

      if (state.showUsage === "yes") {
        usage.style.display = "flex";
        usage.innerHTML = `
          <span>Tokens: in ${tokensIn ?? "?"} • out ${tokensOut ?? "?"}</span>
          <span>≈ Cost: ${typeof costUsd === "number" ? "$" + costUsd.toFixed(6) : "?"}</span>
        `;
      } else {
        usage.style.display = "none";
      }

      // push to history
      state.messages.push({ role: "assistant", content: full });
    },
    setError(msg) {
      body.textContent = msg;
    }
  };
}

// ====== API ======
async function fetchMeta() {
  const r = await fetch(`${WORKER_BASE}/api/meta`, { method: "GET" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "meta_failed");
  state.meta = j;
  return j;
}

function estimateCostUsd(model, inTok, outTok) {
  const pricing = state.meta?.pricingUsdPer1M?.[model];
  if (!pricing || typeof inTok !== "number" || typeof outTok !== "number") return null;

  const cost = (inTok / 1_000_000) * pricing.input + (outTok / 1_000_000) * pricing.output;
  return cost;
}

async function streamChat() {
  const text = input.value.trim();
  if (!text) return;

  if (text.length > (state.meta?.limits?.maxInputChars || 8000)) {
    showError("Too long", `Message is too long. Limit: ${state.meta?.limits?.maxInputChars || 8000} chars.`);
    return;
  }

  if (isProbablyBanned(text)) {
    showError("Blocked request", "This topic is not allowed in NudoAI.");
    return;
  }

  // ensure code
  if (!state.code) {
    codeInput.value = "";
    showOverlay(codeModal);
    return;
  }

  // push user message
  addUser(text);
  state.messages.push({ role: "user", content: text });
  input.value = "";

  // assistant streaming placeholder
  const a = addAssistantStreaming();

  btnStop.disabled = false;
  btnSend.disabled = true;
  input.disabled = true;

  const controller = new AbortController();
  state.abort = controller;

  try {
    const body = JSON.stringify({
      messages: state.messages.slice(-20),
      mode: state.mode,
      model: state.model,
      customInstructions: state.customInstructions
    });

    const r = await fetch(`${WORKER_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NudoAI-Code": state.code
      },
      body,
      signal: controller.signal
    });

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      if (j?.error === "region_blocked") {
        showOverlay(regionBlocked);
        a.setError("App unavailable in your region.");
        return;
      }
      if (j?.error === "invalid_code") {
        localStorage.removeItem("nudo_code");
        state.code = "";
        showOverlay(codeModal);
        a.setError("Invalid code.");
        return;
      }
      if (j?.error === "rate_limited") {
        showError("Rate limited", "Too many requests. Try again in a minute.");
        a.setError("Rate limited.");
        return;
      }

      showError("Server error", j?.error || "Request failed");
      a.setError("Error.");
      return;
    }

    // SSE stream parsing
    const reader = r.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";

    let tokensIn = null;
    let tokensOut = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // Split SSE frames by double newline
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";

      for (const part of parts) {
        const line = part.split("\n").find(l => l.startsWith("data:"));
        if (!line) continue;

        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") continue;

        let evt;
        try { evt = JSON.parse(data); } catch { continue; }

        // We care about:
        // - response.output_text.delta (delta text)
        // - response.completed (usage tokens)
        // Docs: :contentReference[oaicite:4]{index=4}
        if (evt.type === "response.output_text.delta") {
          a.appendDelta(evt.delta || "");
        }

        if (evt.type === "response.completed") {
          const usage = evt.response?.usage;
          // usage обычно: { input_tokens, output_tokens, total_tokens }
          tokensIn = typeof usage?.input_tokens === "number" ? usage.input_tokens : tokensIn;
          tokensOut = typeof usage?.output_tokens === "number" ? usage.output_tokens : tokensOut;
        }

        if (evt.type === "error") {
          a.setError("OpenAI error.");
        }
      }
    }

    const costUsd = estimateCostUsd(state.model, tokensIn, tokensOut);
    a.finalize({ tokensIn, tokensOut, costUsd });

  } catch (e) {
    if (e.name === "AbortError") {
      a.setError("Stopped.");
    } else {
      showError("Network error", e.message || "Unknown error");
      a.setError("Error.");
    }
  } finally {
    btnStop.disabled = true;
    btnSend.disabled = false;
    input.disabled = false;
    input.focus();
    state.abort = null;
  }
}

function stopStream() {
  if (state.abort) state.abort.abort();
}

function regenerate() {
  // Удаляем последний assistant, если он есть
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i].role === "assistant") {
      state.messages.splice(i, 1);
      break;
    }
  }
  // Визуально чистим ленту и перерисуем из state.messages
  log.innerHTML = "";
  const msgs = [...state.messages];
  state.messages = [];
  for (const m of msgs) {
    if (m.role === "user") {
      addUser(m.content);
      state.messages.push(m);
    } else {
      const { body, actions, usage } = createCard("assistant");
      renderMarkdown(body, m.content);
      state.messages.push(m);

      const copyBtn = document.createElement("button");
      copyBtn.className = "iconbtn";
      copyBtn.textContent = "Copy";
      copyBtn.onclick = async () => navigator.clipboard.writeText(m.content);
      actions.appendChild(copyBtn);

      const regenBtn = document.createElement("button");
      regenBtn.className = "iconbtn";
      regenBtn.textContent = "Regenerate";
      regenBtn.onclick = () => regenerate();
      actions.appendChild(regenBtn);

      usage.style.display = "none";
    }
  }

  // перезапросим последний user
  const lastUser = [...state.messages].reverse().find(x => x.role === "user");
  if (!lastUser) return;

  input.value = lastUser.content;
  streamChat();
}

// ====== events ======
composer.addEventListener("submit", (e) => {
  e.preventDefault();
  streamChat();
});

btnStop.addEventListener("click", stopStream);

btnSettings.addEventListener("click", () => {
  modeSelect.value = state.mode;
  modelSelect.value = state.model;
  showUsage.value = state.showUsage;
  customInstructions.value = state.customInstructions;
  showOverlay(settingsModal);
});

btnPrompts.addEventListener("click", () => showOverlay(promptsModal));

btnExit.addEventListener("click", () => {
  // “Exit” = logout + clear chat
  state.messages = [];
  log.innerHTML = "";
  localStorage.removeItem("nudo_code");
  state.code = "";
  showOverlay(codeModal);
});

btnCloseSettings.addEventListener("click", hideOverlay);
btnClosePrompts.addEventListener("click", hideOverlay);
btnCloseDoc.addEventListener("click", hideOverlay);
btnCloseError.addEventListener("click", hideOverlay);
btnCloseBlocked.addEventListener("click", hideOverlay);

btnSaveSettings.addEventListener("click", () => {
  state.mode = modeSelect.value === "code" ? "code" : "text";
  state.model = modelSelect.value;
  state.showUsage = showUsage.value;
  state.customInstructions = customInstructions.value || "";

  localStorage.setItem("nudo_mode", state.mode);
  localStorage.setItem("nudo_model", state.model);
  localStorage.setItem("nudo_usage", state.showUsage);
  localStorage.setItem("nudo_custom", state.customInstructions);

  setModeUI();
  hideOverlay();
});

btnResetSettings.addEventListener("click", () => {
  state.mode = "text";
  state.model = "chatgpt-4o-latest";
  state.showUsage = "yes";
  state.customInstructions = "";

  localStorage.setItem("nudo_mode", state.mode);
  localStorage.setItem("nudo_model", state.model);
  localStorage.setItem("nudo_usage", state.showUsage);
  localStorage.setItem("nudo_custom", state.customInstructions);

  modeSelect.value = state.mode;
  modelSelect.value = state.model;
  showUsage.value = state.showUsage;
  customInstructions.value = state.customInstructions;
  setModeUI();
});

btnSaveCode.addEventListener("click", () => {
  const code = codeInput.value.trim();
  if (!code) return;
  state.code = code;
  localStorage.setItem("nudo_code", code);
  hideOverlay();
});

document.querySelectorAll(".chip").forEach(btn => {
  btn.addEventListener("click", () => {
    input.value = btn.getAttribute("data-prompt") || "";
    hideOverlay();
    input.focus();
  });
});

function openDoc(kind) {
  let title = "";
  let sub = "";
  let body = "";

  if (kind === "terms") {
    title = "Terms";
    sub = "Basic rules of using NudoAI";
    body = `
      <p><b>1)</b> Do not use NudoAI for illegal or harmful content.</p>
      <p><b>2)</b> Forbidden topics: sexual content, terrorism, extremism, politics.</p>
      <p><b>3)</b> Abuse (spam) may be rate-limited or blocked.</p>
      <p class="small muted">This is a simple placeholder. Replace with your full terms later.</p>
    `;
  }

  if (kind === "privacy") {
    title = "Privacy";
    sub = "What we store";
    body = `
      <p><b>1)</b> We store your settings (mode/model/instructions) locally in your browser.</p>
      <p><b>2)</b> Chat history is not persisted after refresh (session only).</p>
      <p><b>3)</b> Server may log technical errors and token usage (without your full messages).</p>
      <p class="small muted">Replace with your full privacy policy later.</p>
    `;
  }

  if (kind === "support") {
    title = "Support";
    sub = "Contact";
    body = `
      <p>If you think you’re getting errors by mistake, contact us in Discord:</p>
      <p><a href="${DISCORD_INVITE}" target="_blank" rel="noreferrer">${DISCORD_INVITE}</a></p>
    `;
  }

  docTitle.textContent = title;
  docSub.textContent = sub;
  docBody.innerHTML = body;
  showOverlay(docModal);
}

openTerms.addEventListener("click", (e) => { e.preventDefault(); openDoc("terms"); });
openPrivacy.addEventListener("click", (e) => { e.preventDefault(); openDoc("privacy"); });
openSupport.addEventListener("click", (e) => { e.preventDefault(); openDoc("support"); });

// ====== INIT ======
async function init() {
  setupBG();
  setModeUI();

  try {
    const meta = await fetchMeta();
    // регион блок
    if (meta.blocked) {
      showOverlay(regionBlocked);
      return;
    }
  } catch (e) {
    showError("Startup error", "Cannot reach backend. Check WORKER_BASE.");
    return;
  }

  // если нет кода — просим
  if (!state.code) showOverlay(codeModal);
}

init();
