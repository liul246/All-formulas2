
const API_BASE = "https://all-formulas-api.liul.blitz.cloud";

let scannerToken = "";
let report = null;
let pollTimer = null;

const $ = (selector) => document.querySelector(selector);

function text(tag, cls, value) {
  const element = document.createElement(tag);
  element.className = cls;
  element.textContent = value == null ? "" : String(value);
  return element;
}

async function api(path, options = {}) {
  if (!scannerToken) {
    throw new Error("Scanner token አልገባም።");
  }

  const response = await fetch(
    API_BASE.replace(/\/$/, "") + path,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Scanner-Token": scannerToken,
        ...(options.headers || {})
      }
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.detail || `Request failed (${response.status})`
    );
  }

  return data;
}

$("#scan-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const url = $("#target").value.trim();

  if (!/^https?:\/\//i.test(url)) {
    $("#status").textContent =
      "http:// ወይም https:// የሚጀምር URL አስገባ።";
    return;
  }

  if (!scannerToken) {
    const token = window.prompt(
      "በBackend ውስጥ ያለውን SCANNER_API_TOKEN አስገባ:"
    );

    if (!token || !token.trim()) {
      $("#status").textContent = "Token አልገባም።";
      return;
    }

    scannerToken = token.trim();
  }

  if (pollTimer) {
    clearTimeout(pollTimer);
  }

  $("#scan-button").disabled = true;
  $("#status").textContent = "OWASP ZAP scan በመጀመር ላይ…";
  $("#results").classList.add("hidden");

  try {
    const started = await api("/api/scan/start", {
      method: "POST",
      body: JSON.stringify({ url })
    });

    $("#status").textContent =
      `Scan ${started.scan_id}: ${started.status}`;

    poll(started.scan_id);

  } catch (error) {
    $("#status").textContent =
      "Scan መጀመር አልተቻለም: " + error.message;

    $("#scan-button").disabled = false;

    if (
      /unauthorized/i.test(error.message) ||
      /401/.test(error.message)
    ) {
      scannerToken = "";
    }
  }
});

async function poll(scanId) {
  try {
    const data = await api(
      "/api/scan/" + encodeURIComponent(scanId)
    );

    $("#status").textContent =
      `Scan status: ${data.status} · Progress: ${data.progress || 0}%`;

    if (data.status === "complete") {
      report = data;
      renderReport(data);
      $("#scan-button").disabled = false;
      return;
    }

    if (
      data.status === "error" ||
      data.status === "expired"
    ) {
      $("#scan-button").disabled = false;

      if (data.error) {
        $("#status").textContent += " · " + data.error;
      }

      return;
    }

    pollTimer = setTimeout(() => poll(scanId), 2500);

  } catch (error) {
    $("#status").textContent =
      "የScan ሁኔታን ማንበብ አልተቻለም: " +
      error.message;

    $("#scan-button").disabled = false;

    if (
      /unauthorized/i.test(error.message) ||
      /401/.test(error.message)
    ) {
      scannerToken = "";
    }
  }
}

function renderReport(data) {
  const findings = data.findings || [];

  $("#all").textContent = findings.length;

  $("#high").textContent = findings.filter(
    item => item.severity === "High"
  ).length;

  $("#medium").textContent = findings.filter(
    item => item.severity === "Medium"
  ).length;

  $("#low").textContent = findings.filter(
    item => ["Low", "Info"].includes(item.severity)
  ).length;

  $("#meta").textContent =
    `Target: ${data.target} · Scan ID: ${data.scan_id}`;

  const list = $("#list");
  list.replaceChildren();

  findings.forEach((finding) => {
    const card = text("article", "finding", "");
    const top = text("div", "findingtop", "");

    top.append(
      text("h3", "", finding.title)
    );

    top.append(
      text(
        "span",
        "badge " + (finding.severity || "Info").toLowerCase(),
        finding.severity || "Info"
      )
    );

    card.append(top);

    card.append(
      text("p", "", finding.description)
    );

    if (finding.url) {
      card.append(text("p", "", "URL: " + finding.url));
    }

    if (finding.parameter) {
      card.append(
        text("p", "", "Parameter: " + finding.parameter)
      );
    }

    if (finding.evidence) {
      card.append(
        text("p", "", "Evidence: " + finding.evidence)
      );
    }

    if (finding.solution) {
      card.append(
        text("p", "", "Solution: " + finding.solution)
      );
    }

    list.append(card);
  });

  $("#summary").classList.remove("hidden");
  $("#results").classList.remove("hidden");

  $("#status").textContent =
    "Scan ተጠናቋል። ግኝቶቹን በእጅ አረጋግጥ።";
}

$("#export").addEventListener("click", () => {
  if (!report) return;

  const blob = new Blob(
    [JSON.stringify(report, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "active-scan-report.json";
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
