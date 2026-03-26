const STORAGE_KEY = "mobile-store-inventory-v1";

const initialState = {
  products: [],
  units: [],
  logs: [],
  audits: []
};

const state = loadState();

const dom = {
  heroStats: document.querySelector("#heroStats"),
  inventoryList: document.querySelector("#inventoryList"),
  logList: document.querySelector("#logList"),
  sellPreview: document.querySelector("#sellPreview"),
  auditResults: document.querySelector("#auditResults"),
  searchInput: document.querySelector("#searchInput"),
  seedDemoBtn: document.querySelector("#seedDemoBtn"),
  addProductForm: document.querySelector("#addProductForm"),
  sellForm: document.querySelector("#sellForm"),
  auditForm: document.querySelector("#auditForm"),
  scannerDialog: document.querySelector("#scannerDialog"),
  scannerVideo: document.querySelector("#scannerVideo"),
  scannerStatus: document.querySelector("#scannerStatus"),
  scannerTitle: document.querySelector("#scannerTitle"),
  manualScannerInput: document.querySelector("#manualScannerInput"),
  manualScannerSubmit: document.querySelector("#manualScannerSubmit"),
  inventoryCardTemplate: document.querySelector("#inventoryCardTemplate")
};

let scannerController = null;
let lastDetectedCode = "";

initialize();

function initialize() {
  bindEvents();
  render();
}

function bindEvents() {
  dom.searchInput.addEventListener("input", renderInventory);
  dom.seedDemoBtn.addEventListener("click", seedDemoData);
  dom.addProductForm.addEventListener("submit", handleAddProduct);
  dom.sellForm.addEventListener("submit", handleSellProduct);
  dom.sellForm.elements.imei.addEventListener("input", renderSellPreview);
  dom.auditForm.addEventListener("submit", handleAudit);
  dom.scannerDialog.addEventListener("close", stopScanner);

  document.querySelector("#scanAddImeiBtn").addEventListener("click", () => {
    openScanner({
      title: "Scan IMEI for stock intake",
      onDetected: (code) => {
        dom.addProductForm.elements.imei.value = code;
      },
      onManual: (code) => {
        dom.addProductForm.elements.imei.value = code;
        addLog({
          title: "Manual IMEI fallback used",
          meta: `Stock intake IMEI ${code} was entered manually after scan fallback`
        });
        saveState();
        renderLogs();
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
      onManual: (code) => {
        dom.sellForm.elements.imei.value = code;
        addLog({
          title: "Manual IMEI fallback used",
          meta: `Sale IMEI ${code} was entered manually after scan fallback`
        });
        saveState();
        renderSellPreview();
        renderLogs();
      }
    });
  });

  document.querySelector("#scanAuditImeiBtn").addEventListener("click", () => {
    openScanner({
      title: "Scan IMEI into audit list",
      onDetected: (code) => appendToTextarea(dom.auditForm.elements.auditImeis, code),
      onManual: (code) => {
        appendToTextarea(dom.auditForm.elements.auditImeis, code);
        addLog({
          title: "Manual IMEI fallback used",
          meta: `Audit IMEI ${code} was entered manually after scan fallback`
        });
        saveState();
        renderLogs();
      }
    });
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return deepClone(initialState);
    }
    return { ...deepClone(initialState), ...JSON.parse(raw) };
  } catch (error) {
    console.error("Failed to load state", error);
    return deepClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    const haystack = [
      summary.brand,
      summary.model,
      summary.variant,
      summary.color,
      summary.availableImeis.join(" ")
    ].join(" ").toLowerCase();
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
    node.querySelector(".inventory-meta").textContent = `${summary.variant} • ${summary.color}`;
    node.querySelector(".quantity-badge").textContent = `${summary.quantity} in stock`;
    node.querySelector(".price-chip").textContent = `MOP ₹${formatCurrency(summary.mop)}`;

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
    .slice()
    .reverse()
    .map((log) => `
      <article class="log-card">
        <strong>${escapeHtml(log.title)}</strong>
        <p class="log-meta">${escapeHtml(log.meta)}</p>
        <p class="log-meta">${new Date(log.createdAt).toLocaleString()}</p>
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

  const product = state.products.find((item) => item.id === unit.productId);
  const statusText = unit.status === "sold" ? "Already sold" : "Ready to sell";
  dom.sellPreview.className = `message ${unit.status === "sold" ? "error" : "success"}`;
  dom.sellPreview.textContent = `${product.brand} ${product.model} ${product.variant} ${product.color} • MOP ₹${formatCurrency(product.mop)} • ${statusText}`;
}

function handleAddProduct(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const brand = form.get("brand").trim();
  const model = form.get("model").trim();
  const variant = normalizeStorageValue(form.get("variant"));
  const color = form.get("color").trim();
  const mop = Number(form.get("mop"));
  const staffName = form.get("staffName").trim();
  const imei = normalizeImei(form.get("imei"));

  if (!imei) {
    alert("Enter one IMEI for this stock unit.");
    return;
  }

  if (!isValidImei(imei)) {
    alert(`IMEI ${imei} is invalid. Use 15 digits.`);
    return;
  }

  if (state.units.some((unit) => unit.imei === imei)) {
    alert(`IMEI ${imei} already exists in inventory or sales history.`);
    return;
  }

  let product = state.products.find(
    (item) =>
      item.brand.toLowerCase() === brand.toLowerCase() &&
      item.model.toLowerCase() === model.toLowerCase() &&
      item.variant.toLowerCase() === variant.toLowerCase() &&
      item.color.toLowerCase() === color.toLowerCase()
  );

  if (!product) {
      product = {
      id: makeId(),
      brand,
      model,
      variant,
      color,
      mop,
      createdAt: new Date().toISOString()
    };
    state.products.push(product);
  } else {
    product.mop = mop;
  }

  state.units.push({
    id: makeId(),
    productId: product.id,
    imei,
    status: "in_stock",
    createdAt: new Date().toISOString()
  });

  addLog({
    title: `Stock added by ${staffName}`,
    meta: `1 unit added for ${brand} ${model} ${variant} ${color} with IMEI ${imei}`
  });

  saveState();
  event.currentTarget.reset();
  render();
}

function handleSellProduct(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const staffName = form.get("staffName").trim();
  const customerNote = form.get("customerNote").trim();
  const imei = normalizeImei(form.get("imei").trim());

  if (!isValidImei(imei)) {
    alert("Enter a valid 15-digit IMEI.");
    return;
  }

  const unit = state.units.find((item) => item.imei === imei);
  if (!unit) {
    alert("This IMEI is not present in inventory.");
    return;
  }
  if (unit.status === "sold") {
    alert("This IMEI has already been sold.");
    return;
  }

  unit.status = "sold";
  unit.soldAt = new Date().toISOString();
  unit.saleNote = customerNote;
  unit.soldBy = staffName;

  const product = state.products.find((item) => item.id === unit.productId);
  addLog({
    title: `Sale completed by ${staffName}`,
    meta: `${product.brand} ${product.model} ${product.variant} ${product.color} sold with IMEI ${imei}. Note: ${customerNote}`
  });

  playSuccessBeep();
  saveState();
  event.currentTarget.reset();
  render();
}

function handleAudit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const auditorName = form.get("auditorName").trim();
  const auditLabel = form.get("auditLabel").trim();
  const scannedImeis = [...new Set(parseImeis(form.get("auditImeis")).filter(isValidImei))];
  const expectedImeis = state.units.filter((unit) => unit.status === "in_stock").map((unit) => unit.imei);

  const missing = expectedImeis.filter((imei) => !scannedImeis.includes(imei));
  const extra = scannedImeis.filter((imei) => !expectedImeis.includes(imei));

  const audit = {
    id: makeId(),
    label: auditLabel,
    auditorName,
    scannedImeis,
    missing,
    extra,
    createdAt: new Date().toISOString()
  };

  state.audits.push(audit);

  addLog({
    title: `Audit submitted by ${auditorName}`,
    meta: `${auditLabel}: ${missing.length} missing, ${extra.length} extra IMEIs flagged for manager review`
  });

  saveState();
  renderAuditResults(audit);
  event.currentTarget.reset();
  render();
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
      .filter((unit) => unit.productId === product.id && unit.status === "in_stock")
      .map((unit) => unit.imei);

    return {
      ...product,
      quantity: availableImeis.length,
      availableImeis
    };
  });
}

function addLog(entry) {
  state.logs.push({
    id: makeId(),
    createdAt: new Date().toISOString(),
    ...entry
  });
}

function seedDemoData() {
  if (state.products.length || state.units.length) {
    const confirmed = confirm("Demo data will be appended to your current inventory. Continue?");
    if (!confirmed) return;
  }

  const samples = [
    {
      brand: "Samsung",
      model: "Galaxy S24",
      variant: "8GB/256GB",
      color: "Onyx Black",
      mop: 74999,
      imeis: ["353915081234561", "353915081234579"]
    },
    {
      brand: "OnePlus",
      model: "12R",
      variant: "12GB/256GB",
      color: "Cool Blue",
      mop: 42999,
      imeis: ["861234567890123", "861234567890131", "861234567890149"]
    }
  ];

  samples.forEach((sample) => {
    let product = state.products.find(
      (item) =>
        item.brand === sample.brand &&
        item.model === sample.model &&
        item.variant === sample.variant &&
        item.color === sample.color
    );

    if (!product) {
      product = {
        id: makeId(),
        brand: sample.brand,
        model: sample.model,
        variant: sample.variant,
        color: sample.color,
        mop: sample.mop,
        createdAt: new Date().toISOString()
      };
      state.products.push(product);
    }

    sample.imeis.forEach((imei) => {
      if (!state.units.some((unit) => unit.imei === imei)) {
        state.units.push({
          id: makeId(),
          productId: product.id,
          imei,
          status: "in_stock",
          createdAt: new Date().toISOString()
        });
      }
    });
  });

  addLog({
    title: "Demo inventory loaded",
    meta: "Sample Samsung and OnePlus stock added for testing the flows"
  });

  saveState();
  render();
}

async function openScanner({ title, onDetected, onManual }) {
  dom.scannerTitle.textContent = title;
  dom.scannerStatus.textContent = "Starting camera...";
  dom.manualScannerInput.value = "";
  dom.scannerDialog.showModal();

  dom.manualScannerSubmit.onclick = () => {
    const manualValue = normalizeImei(dom.manualScannerInput.value);
    if (!isValidImei(manualValue)) {
      dom.scannerStatus.textContent = "Manual IMEI must be 15 digits.";
      return;
    }
    playSuccessBeep();
    if (onManual) {
      onManual(manualValue);
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
  return value
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

function formatCurrency(value) {
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
