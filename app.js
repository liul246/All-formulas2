// This endpoint must be the URL of YOUR deployed FastAPI backend.
const API_BASE = "https://YOUR-BACKEND-HOST";
const SCANNER_TOKEN = "SET_A_USER_TOKEN_HERE"; // MVP only: don't use a shared secret in a public frontend.

const $ = s => document.querySelector(s);
let report = null;
let pollTimer = null;

function text(tag, cls, value) {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = value == null ? "" : String(value);
  return e;
}

async function api(path, options = {}) {
  const r = await fetch(API_BASE.replace(/\/$/, "") + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Scanner-Token": SCANNER_TOKEN,
      ...(options.headers || {})
    }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || `Request failed (${r.status})`);
  return d;
}

$("#scan-form").addEventListener("submit", async e => {
  e.preventDefault();
  const url = $("#target").value.trim();
  if (!/^https?:\/\//i.test(url)) {
    $("#status").textContent = "Enter a URL starting with http:// or https://.";
    return;
  }
  if (API_BASE.includes("YOUR-BACKEND-HOST") || SCANNER_TOKEN.includes("SET_A_USER_TOKEN")) {
    $("#status").textContent = "Setup required: configure backend URL and token.";
    return;
  }

  if (pollTimer) clearTimeout(pollTimer);
  $("#scan-button").disabled = true;
  $("#status").textContent = "Starting OWASP ZAP scan…";
  $("#results").classList.add("hidden");

  try {
    const started = await api("/api/scan/start", {
      method: "POST", body: JSON.stringify({ url })
    });
    $("#status").textContent = `Scan ${started.scan_id}: ${started.status}`;
    poll(started.scan_id);
  } catch (err) {
    $("#status").textContent = "Could not start scan: " + err.message;
    $("#scan-button").disabled = false;
  }
});

async function poll(id) {
  try {
    const d = await api("/api/scan/" + encodeURIComponent(id));
    $("#status").textContent = `Scan status: ${d.status} · Progress: ${d.progress || 0}%`;
    if (d.status === "complete") {
      report = d;
      renderReport(d);
      $("#scan-button").disabled = false;
      return;
    }
    if (d.status === "error" || d.status === "expired") {
      $("#scan-button").disabled = false;
      return;
    }
    pollTimer = setTimeout(() => poll(id), 2500);
  } catch (err) {
    $("#status").textContent = "Could not read scan status: " + err.message;
    $("#scan-button").disabled = false;
  }
}

function renderReport(d) {
  const fs = d.findings || [];
  $("#all").textContent = fs.length;
  $("#high").textContent = fs.filter(x => x.severity === "High").length;
  $("#medium").textContent = fs.filter(x => x.severity === "Medium").length;
  $("#low").textContent = fs.filter(x => ["Low", "Info"].includes(x.severity)).length;
  $("#meta").textContent = `Target: ${d.target} · Scan ID: ${d.scan_id}`;

  const list = $("#list");
  list.replaceChildren();
  fs.forEach(f => {
    const card = text("article", "finding", "");
    const top = text("div", "findingtop", "");
    top.append(text("h3", "", f.title));
    top.append(text("span", "badge " + (f.severity || "Info").toLowerCase(), f.severity || "Info"));
    card.append(top);
    card.append(text("p", "", f.description));
    if (f.url) card.append(text("p", "", "URL: " + f.url));
    if (f.parameter) card.append(text("p", "", "Parameter: " + f.parameter));
    if (f.evidence) card.append(text("p", "", "Evidence: " + f.evidence));
    if (f.solution) card.append(text("p", "", "Solution: " + f.solution));
    list.append(card);
  });
  $("#summary").classList.remove("hidden");
  $("#results").classList.remove("hidden");
  $("#status").textContent = "Scan complete. Manually verify findings before treating them as confirmed vulnerabilities.";
}

$("#export").addEventListener("click", () => {
  if (!report) return;
  const u = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json"
  }));
  const a = document.createElement("a");
  a.href = u;
  a.download = "active-scan-report.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
});
