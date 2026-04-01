import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.APP_CONFIG || {};
const supabaseConfigured = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
const supabase = supabaseConfigured
  ? createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
  : null;

const state = {
  products: [],
  units: [],
  logs: [],
  audits: [],
  profile: null,
  session: null
};

const dom = {
  authShell: document.querySelector("#authShell"),
  appShell: document.querySelector("#appShell"),
  authForm: document.querySelector("#authForm"),
  signUpBtn: document.querySelector("#signUpBtn"),
  resendConfirmationBtn: document.querySelector("#resendConfirmationBtn"),
  resetPasswordBtn: document.querySelector("#resetPasswordBtn"),
  authMessage: document.querySelector("#authMessage"),
  heroStats: document.querySelector("#heroStats"),
  inventoryList: document.querySelector("#inventoryList"),
  logList: document.querySelector("#logList"),
  sellPreview: document.querySelector("#sellPreview"),
  auditResults: document.querySelector("#auditResults"),
  searchInput: document.querySelector("#searchInput"),
  addProductForm: document.querySelector("#addProductForm"),
  sellForm: document.querySelector("#sellForm"),
  auditForm: document.querySelector("#auditForm"),
  refreshBtn: document.querySelector("#refreshBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  sessionName: document.querySelector("#sessionName"),
  sessionRole: document.querySelector("#sessionRole"),
  managerPanel: document.querySelector("#managerPanel"),
  scannerDialog: document.querySelector("#scannerDialog"),
  scannerVideo: document.querySelector("#scannerVideo"),
  scannerStatus: document.querySelector("#scannerStatus"),
  scannerTitle: document.querySelector("#scannerTitle"),
  manualScannerInput: document.querySelector("#manualScannerInput"),
  manualScannerSubmit: document.querySelector("#manualScannerSubmit"),
  inventoryCardTemplate: document.querySelector("#inventoryCardTemplate")
};

const authActionButtons = [
  dom.authForm?.querySelector('button[type="submit"]'),
  dom.signUpBtn,
  dom.resendConfirmationBtn,
  dom.resetPasswordBtn
].filter(Boolean);

let scannerController = null;
let lastDetectedCode = "";

initialize();

async function initialize() {
  bindEvents();

  if (!supabaseConfigured) {
    setMessage(dom.authMessage, "Set your Supabase URL and anon key in config.js before signing in.", "error");
    return;
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    await handleSession(session);
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setMessage(dom.authMessage, error.message, "error");
    return;
  }

  await handleSession(data.session);
}

function bindEvents() {
  dom.authForm.addEventListener("submit", handleSignIn);
  dom.signUpBtn.addEventListener("click", handleSignUp);
  dom.resendConfirmationBtn.addEventListener("click", handleResendConfirmation);
  dom.resetPasswordBtn.addEventListener("click", handleResetPassword);
  dom.searchInput.addEventListener("input", renderInventory);
  dom.addProductForm.addEventListener("submit", handleAddProduct);
  dom.sellForm.addEventListener("submit", handleSellProduct);
  dom.sellForm.elements.imei.addEventListener("input", renderSellPreview);
  dom.auditForm.addEventListener("submit", handleAudit);
  dom.refreshBtn.addEventListener("click", refreshData);
  dom.logoutBtn.addEventListener("click", handleLogout);
  dom.scannerDialog.addEventListener("close", stopScanner);

  document.querySelector("#scanAddImeiBtn").addEventListener("click", () => {
    openScanner({
      title: "Scan IMEI for stock intake",
      onDetected: (code) => {
        dom.addProductForm.elements.imei.value = code;
      },
      onManual: async (code) => {
        dom.addProductForm.elements.imei.value = code;
        await recordActivity("Manual IMEI fallback used", `Stock intake IMEI ${code} was entered manually after scan fallback`);
      }
    });
  });

  document.querySelector("#scanSellImeiBtn").addEventListener("click", () => {
    openScanner({
      title: "Scan IMEI for sale",
      onDetected: (code) => {
        dom.sellForm.elements.imei.value = code;
        renderSellPreview();
      },
      onManual: async (code) => {
        dom.sellForm.elements.imei.value = code;
        await recordActivity("Manual IMEI fallback used", `Sale IMEI ${code} was entered manually after scan fallback`);
        renderSellPreview();
      }
    });
  });

  document.querySelector("#scanAuditImeiBtn").addEventListener("click", () => {
    openScanner({
      title: "Scan IMEI into audit list",
      onDetected: (code) => appendToTextarea(dom.auditForm.elements.auditImeis, code),
      onManual: async (code) => {
        appendToTextarea(dom.auditForm.elements.auditImeis, code);
        await recordActivity("Manual IMEI fallback used", `Audit IMEI ${code} was entered manually after scan fallback`);
      }
    });
  });
}

async function handleSession(session) {
  state.session = session;

  if (!session) {
    state.profile = null;
    state.products = [];
    state.units = [];
    state.logs = [];
    state.audits = [];
    dom.authShell.classList.remove("hidden");
    dom.appShell.classList.add("hidden");
    setMessage(dom.authMessage, "Sign in with your Supabase staff account.", "subtle");
    return;
  }

  const profile = await fetchProfile(session.user.id);
  state.profile = profile || {
    id: session.user.id,
    full_name: session.user.email?.split("@")[0] || "Staff",
    role: "staff"
  };

  dom.sessionName.textContent = state.profile.full_name || session.user.email;
  dom.sessionRole.textContent = `${state.profile.role} | ${session.user.email}`;
  dom.managerPanel.classList.toggle("hidden", state.profile.role !== "manager");
  dom.authShell.classList.add("hidden");
  dom.appShell.classList.remove("hidden");

  await refreshData();
}

async function handleSignIn(event) {
  event.preventDefault();
  if (!supabase) return;

  const form = new FormData(dom.authForm);
  const email = normalizeEmail(form.get("email"));
  const password = String(form.get("password") || "");

  if (!email || !password) {
    setMessage(dom.authMessage, "Enter your email and password to sign in.", "error");
    return;
  }

  let error;
  setAuthBusy(true, "Signing in...");
  try {
    ({ error } = await supabase.auth.signInWithPassword({ email, password }));
  } finally {
    setAuthBusy(false);
  }

  if (error) {
    setMessage(dom.authMessage, getAuthErrorMessage(error), "error");
    return;
  }

  setMessage(dom.authMessage, "Signed in successfully.", "success");
}

async function handleSignUp() {
  if (!supabase) return;

  const form = new FormData(dom.authForm);
  const fullName = String(form.get("fullName") || "").trim();
  const role = "staff";
  const email = normalizeEmail(form.get("email"));
  const password = String(form.get("password") || "");

  if (!email || !password) {
    setMessage(dom.authMessage, "Enter email and password to create the account.", "error");
    return;
  }

  let data;
  let error;
  setAuthBusy(true, "Creating account...");
  try {
    ({ data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || email.split("@")[0],
          role
        },
        emailRedirectTo: getAuthRedirectUrl()
      }
    }));
  } finally {
    setAuthBusy(false);
  }

  if (error) {
    setMessage(dom.authMessage, getAuthErrorMessage(error), "error");
    return;
  }

  if (data.session) {
    setMessage(dom.authMessage, "Account created and signed in.", "success");
  } else {
    setMessage(dom.authMessage, "Account created. If email confirmation is enabled, verify email before signing in.", "success");
  }
}

async function handleResendConfirmation() {
  if (!supabase) return;

  const form = new FormData(dom.authForm);
  const email = normalizeEmail(form.get("email"));

  if (!email) {
    setMessage(dom.authMessage, "Enter your email first, then resend the confirmation link.", "error");
    return;
  }

  let error;
  setAuthBusy(true, "Sending confirmation...");
  try {
    ({ error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: getAuthRedirectUrl()
      }
    }));
  } finally {
    setAuthBusy(false);
  }

  if (error) {
    setMessage(dom.authMessage, getAuthErrorMessage(error), "error");
    return;
  }

  setMessage(dom.authMessage, "Confirmation email sent. Check your inbox and spam folder, then try signing in again.", "success");
}

async function handleResetPassword() {
  if (!supabase) return;

  const form = new FormData(dom.authForm);
  const email = normalizeEmail(form.get("email"));

  if (!email) {
    setMessage(dom.authMessage, "Enter your email first, then request a password reset link.", "error");
    return;
  }

  let error;
  setAuthBusy(true, "Sending reset link...");
  try {
    ({ error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl()
    }));
  } finally {
    setAuthBusy(false);
  }

  if (error) {
    setMessage(dom.authMessage, getAuthErrorMessage(error), "error");
    return;
  }

  setMessage(dom.authMessage, "Password reset email sent. Follow the link in your inbox to choose a new password.", "success");
}

async function handleLogout() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

async function refreshData() {
  if (!supabase || !state.session) return;

  const logsPromise = state.profile?.role === "manager"
    ? supabase.from("activity_logs").select("id, title, meta, created_at, created_by_email").order("created_at", { ascending: false }).limit(100)
    : Promise.resolve({ data: [], error: null });

  const [productsResult, unitsResult, logsResult, auditsResult] = await Promise.all([
    supabase.from("products").select("id, brand, model, variant, color, mop, created_at").order("created_at", { ascending: false }),
    supabase.from("stock_units").select("id, product_id, imei, status, created_at, sold_at, sale_note, sold_by").order("created_at", { ascending: false }),
    logsPromise,
    supabase.from("audits").select("id, label, scanned_imeis, missing_imeis, extra_imeis, created_at, auditor_name").order("created_at", { ascending: false }).limit(20)
  ]);

  const firstError = [productsResult.error, unitsResult.error, logsResult.error, auditsResult.error].find(Boolean);
  if (firstError) {
    setMessage(dom.authMessage, firstError.message, "error");
    return;
  }

  state.products = productsResult.data || [];
  state.units = unitsResult.data || [];
  state.logs = logsResult.data || [];
  state.audits = auditsResult.data || [];
  render();
}

function render() {
  renderHeroStats();
  renderInventory();
  renderLogs();
  renderSellPreview();
}

function renderHeroStats() {
  const activeUnits = state.units.filter((unit) => unit.status === "in_stock");
  const soldUnits = state.units.filter((unit) => unit.status === "sold");

  const stats = [
    { label: "Active phones", value: activeUnits.length },
    { label: "Products", value: state.products.length },
    { label: "Sold units", value: soldUnits.length }
  ];

  dom.heroStats.innerHTML = stats
    .map((stat) => `<article class="stat"><strong>${stat.value}</strong><span>${stat.label}</span></article>`)
    .join("");
}

function renderInventory() {
  const query = dom.searchInput.value.trim().toLowerCase();
  const summaries = getProductSummaries().filter((summary) => {
    if (!query) return true;
    const haystack = [summary.brand, summary.model, summary.variant, summary.color, summary.availableImeis.join(" ")]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  if (!summaries.length) {
    dom.inventoryList.innerHTML = `<p class="message subtle">No products matched that search yet.</p>`;
    return;
  }

  dom.inventoryList.innerHTML = "";
  summaries.forEach((summary) => {
    const node = dom.inventoryCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".inventory-title").textContent = `${summary.brand} ${summary.model}`;
    node.querySelector(".inventory-meta").textContent = `${summary.variant} | ${summary.color}`;
    node.querySelector(".quantity-badge").textContent = `${summary.quantity} in stock`;
    node.querySelector(".price-chip").textContent = `MOP Rs ${formatCurrency(summary.mop)}`;

    const statusChip = node.querySelector(".status-chip");
    statusChip.textContent = summary.quantity <= 2 ? "Low stock" : "Available";
    statusChip.classList.add(summary.quantity <= 2 ? "low" : "available");

    node.querySelector(".inventory-imeis").textContent = summary.availableImeis.length
      ? `Available IMEIs: ${summary.availableImeis.join(", ")}`
      : "No active IMEIs in stock.";

    dom.inventoryList.appendChild(node);
  });
}

function renderLogs() {
  if (!state.logs.length) {
    dom.logList.innerHTML = `<p class="message subtle">Activity logs will appear here after stock adds, audits, and sales.</p>`;
    return;
  }

  dom.logList.innerHTML = state.logs
    .map((log) => `
      <article class="log-card">
        <strong>${escapeHtml(log.title)}</strong>
        <p class="log-meta">${escapeHtml(log.meta)}</p>
        <p class="log-meta">${new Date(log.created_at).toLocaleString()}</p>
      </article>
    `)
    .join("");
}

function renderSellPreview() {
  const imei = normalizeImei(dom.sellForm.elements.imei.value);
  if (!imei) {
    dom.sellPreview.className = "message subtle";
    dom.sellPreview.textContent = "Scan or enter an IMEI to preview the device before selling.";
    return;
  }

  const unit = state.units.find((item) => item.imei === imei);
  if (!unit) {
    dom.sellPreview.className = "message error";
    dom.sellPreview.textContent = `IMEI ${imei} is not in inventory.`;
    return;
  }

  const product = state.products.find((item) => item.id === unit.product_id);
  if (!product) {
    dom.sellPreview.className = "message error";
    dom.sellPreview.textContent = `IMEI ${imei} exists, but its product record is missing.`;
    return;
  }

  const statusText = unit.status === "sold" ? "Already sold" : "Ready to sell";
  dom.sellPreview.className = `message ${unit.status === "sold" ? "error" : "success"}`;
  dom.sellPreview.textContent = `${product.brand} ${product.model} ${product.variant} ${product.color} | MOP Rs ${formatCurrency(product.mop)} | ${statusText}`;
}

async function handleAddProduct(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const brand = String(form.get("brand") || "").trim();
  const model = String(form.get("model") || "").trim();
  const variant = normalizeStorageValue(form.get("variant"));
  const color = String(form.get("color") || "").trim();
  const mop = Number(form.get("mop"));
  const imei = normalizeImei(form.get("imei"));

  if (!isValidImei(imei)) {
    alert("Enter a valid 15-digit IMEI.");
    return;
  }

  const duplicate = state.units.some((unit) => unit.imei === imei);
  if (duplicate) {
    alert(`IMEI ${imei} already exists in inventory or sales history.`);
    return;
  }

  let product = await findExistingProduct({ brand, model, variant, color });
  if (!product) {
    const { data, error } = await supabase
      .from("products")
      .insert({
        brand,
        model,
        variant,
        color,
        mop,
        created_by: state.session.user.id
      })
      .select("id, brand, model, variant, color, mop")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    product = data;
  } else if (Number(product.mop) !== mop) {
    const { data, error } = await supabase
      .from("products")
      .update({ mop })
      .eq("id", product.id)
      .select("id, brand, model, variant, color, mop")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    product = data;
  }

  const { error } = await supabase.from("stock_units").insert({
    product_id: product.id,
    imei,
    status: "in_stock",
    created_by: state.session.user.id
  });

  if (error) {
    alert(error.message);
    return;
  }

  await recordActivity("Stock added", `1 unit added for ${brand} ${model} ${variant} ${color} with IMEI ${imei}`);
  event.currentTarget.reset();
  await refreshData();
}

async function handleSellProduct(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const customerNote = String(form.get("customerNote") || "").trim();
  const imei = normalizeImei(form.get("imei"));

  if (!isValidImei(imei)) {
    alert("Enter a valid 15-digit IMEI.");
    return;
  }

  const currentUnit = state.units.find((item) => item.imei === imei);
  if (!currentUnit) {
    alert("This IMEI is not present in inventory.");
    return;
  }
  if (currentUnit.status === "sold") {
    alert("This IMEI has already been sold.");
    return;
  }

  const { data, error } = await supabase
    .from("stock_units")
    .update({
      status: "sold",
      sold_at: new Date().toISOString(),
      sold_by: state.session.user.id,
      sale_note: customerNote
    })
    .eq("imei", imei)
    .eq("status", "in_stock")
    .select("id, product_id")
    .maybeSingle();

  if (error) {
    alert(error.message);
    return;
  }

  if (!data) {
    alert("This IMEI could not be sold because its stock status changed.");
    return;
  }

  const product = state.products.find((item) => item.id === data.product_id);
  await recordActivity(
    "Sale completed",
    `${product.brand} ${product.model} ${product.variant} ${product.color} sold with IMEI ${imei}. Note: ${customerNote}`
  );

  playSuccessBeep();
  event.currentTarget.reset();
  await refreshData();
}

async function handleAudit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const auditLabel = String(form.get("auditLabel") || "").trim();
  const scannedImeis = [...new Set(parseImeis(form.get("auditImeis")).filter(isValidImei))];
  const expectedImeis = state.units.filter((unit) => unit.status === "in_stock").map((unit) => unit.imei);

  const missing = expectedImeis.filter((imei) => !scannedImeis.includes(imei));
  const extra = scannedImeis.filter((imei) => !expectedImeis.includes(imei));

  const { data, error } = await supabase
    .from("audits")
    .insert({
      label: auditLabel,
      scanned_imeis: scannedImeis,
      missing_imeis: missing,
      extra_imeis: extra,
      created_by: state.session.user.id,
      auditor_name: state.profile?.full_name || state.session.user.email
    })
    .select("id, label, scanned_imeis, missing_imeis, extra_imeis")
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  await recordActivity(
    "Audit submitted",
    `${auditLabel}: ${missing.length} missing, ${extra.length} extra IMEIs flagged for manager review`
  );

  renderAuditResults({
    scannedImeis: data.scanned_imeis,
    missing: data.missing_imeis,
    extra: data.extra_imeis
  });

  event.currentTarget.reset();
  await refreshData();
}

function renderAuditResults(audit) {
  const cards = [
    {
      title: "Matched in-store units",
      body: `${audit.scannedImeis.length - audit.extra.length} IMEIs matched active inventory`,
      mismatch: false
    },
    {
      title: "Missing IMEIs",
      body: audit.missing.length ? audit.missing.join(", ") : "None",
      mismatch: Boolean(audit.missing.length)
    },
    {
      title: "Extra scanned IMEIs",
      body: audit.extra.length ? audit.extra.join(", ") : "None",
      mismatch: Boolean(audit.extra.length)
    }
  ];

  dom.auditResults.innerHTML = cards
    .map(
      (card) => `
      <article class="audit-card ${card.mismatch ? "mismatch" : ""}">
        <strong>${escapeHtml(card.title)}</strong>
        <p class="audit-delta">${escapeHtml(card.body)}</p>
      </article>
    `
    )
    .join("");
}

function getProductSummaries() {
  return state.products.map((product) => {
    const availableImeis = state.units
      .filter((unit) => unit.product_id === product.id && unit.status === "in_stock")
      .map((unit) => unit.imei);

    return {
      ...product,
      quantity: availableImeis.length,
      availableImeis
    };
  });
}

async function findExistingProduct(criteria) {
  const { data, error } = await supabase
    .from("products")
    .select("id, brand, model, variant, color, mop")
    .eq("brand", criteria.brand)
    .eq("model", criteria.model)
    .eq("variant", criteria.variant)
    .eq("color", criteria.color)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

async function recordActivity(title, meta) {
  if (!supabase || !state.session) return;

  const { error } = await supabase.from("activity_logs").insert({
    title,
    meta,
    created_by: state.session.user.id,
    created_by_email: state.session.user.email
  });

  if (error) {
    console.error(error);
  }
}

async function openScanner({ title, onDetected, onManual }) {
  dom.scannerTitle.textContent = title;
  dom.scannerStatus.textContent = "Starting camera...";
  dom.manualScannerInput.value = "";
  dom.scannerDialog.showModal();

  dom.manualScannerSubmit.onclick = async () => {
    const manualValue = normalizeImei(dom.manualScannerInput.value);
    if (!isValidImei(manualValue)) {
      dom.scannerStatus.textContent = "Manual IMEI must be 15 digits.";
      return;
    }
    playSuccessBeep();
    if (onManual) {
      await onManual(manualValue);
    } else {
      onDetected(manualValue);
    }
    dom.scannerDialog.close();
  };

  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    dom.scannerStatus.textContent = "Barcode scanning is not supported here. Use the manual IMEI field.";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    dom.scannerVideo.srcObject = stream;
    scannerController = { stream, active: true };
    const detector = new BarcodeDetector({
      formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e"]
    });

    scanLoop(detector, onDetected);
  } catch (error) {
    console.error(error);
    dom.scannerStatus.textContent = "Camera access failed. Use manual IMEI entry.";
  }
}

async function scanLoop(detector, onDetected) {
  while (scannerController?.active) {
    try {
      const barcodes = await detector.detect(dom.scannerVideo);
      if (barcodes.length) {
        const rawValue = normalizeImei(barcodes[0].rawValue || "");
        if (rawValue && rawValue !== lastDetectedCode) {
          lastDetectedCode = rawValue;
          if (isValidImei(rawValue)) {
            playSuccessBeep();
            onDetected(rawValue);
            dom.scannerStatus.textContent = `Scanned ${rawValue}`;
            dom.scannerDialog.close();
            return;
          }
          dom.scannerStatus.textContent = "Barcode detected, but it is not a valid 15-digit IMEI.";
        }
      }
    } catch (error) {
      dom.scannerStatus.textContent = "Scanning interrupted. Use manual IMEI entry if needed.";
      console.error(error);
    }
    await sleep(250);
  }
}

function stopScanner() {
  if (scannerController?.stream) {
    scannerController.stream.getTracks().forEach((track) => track.stop());
  }
  lastDetectedCode = "";
  scannerController = null;
}

function appendToTextarea(textarea, value) {
  const existing = textarea.value.trim();
  textarea.value = existing ? `${existing}\n${value}` : value;
}

function parseImeis(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => normalizeImei(item))
    .filter(Boolean);
}

function normalizeImei(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidImei(value) {
  return /^\d{15}$/.test(value);
}

function normalizeStorageValue(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function playSuccessBeep() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const audio = new AudioContextClass();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, audio.currentTime);
  oscillator.connect(gain);
  gain.connect(audio.destination);

  gain.gain.setValueAtTime(0.001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);

  oscillator.start(audio.currentTime);
  oscillator.stop(audio.currentTime + 0.2);
  oscillator.onended = () => audio.close();
}

function setMessage(element, message, type) {
  element.className = `message ${type}`;
  element.textContent = message;
}

function setAuthBusy(isBusy, label = "Working...") {
  authActionButtons.forEach((button) => {
    button.disabled = isBusy;
  });

  const submitButton = dom.authForm?.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.textContent = isBusy ? label : "Sign in";
  }
}

function getAuthRedirectUrl() {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.href;
  }

  return undefined;
}

function getAuthErrorMessage(error) {
  const message = String(error?.message || "").trim();
  const normalized = message.toLowerCase();

  if (normalized.includes("email not confirmed")) {
    return "This account exists, but the email is not confirmed yet. Use 'Resend confirmation' and open the latest email from Supabase.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Email or password did not match. If the account was created in Supabase manually, re-enter the exact password, including any spaces, or use 'Send reset link'.";
  }

  return message || "Authentication failed. Please try again.";
}
