import ipaddress
import os
import re
import socket
import time
import uuid
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_TOKEN = os.getenv("SCANNER_API_TOKEN", "")
ZAP_API_URL = os.getenv("ZAP_API_URL", "http://zap:8080").rstrip("/")
ZAP_API_KEY = os.getenv("ZAP_API_KEY", "")
FRONTEND_ORIGINS = [
    x.strip().rstrip("/")
    for x in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if x.strip()
]
ALLOWED_TARGET_HOSTS = {
    x.strip().lower().rstrip(".")
    for x in os.getenv("ALLOWED_TARGET_HOSTS", "").split(",")
    if x.strip()
}

app = FastAPI(title="Hacking Weakness Finder Active Scan API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Scanner-Token"],
)

class ScanRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)

def require_auth(token: str | None):
    if not APP_TOKEN:
        raise HTTPException(503, "Backend is not configured: set SCANNER_API_TOKEN.")
    if not token or token != APP_TOKEN:
        raise HTTPException(401, "Unauthorized scanner request.")

def validate_target(raw: str) -> str:
    parsed = urlparse(raw.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(400, "Enter a valid HTTP or HTTPS URL.")
    if parsed.username or parsed.password:
        raise HTTPException(400, "URLs containing credentials are not allowed.")
    host = parsed.hostname.rstrip(".").lower()
    if host == "localhost" or host.endswith(".localhost"):
        raise HTTPException(400, "Local targets are not allowed.")
    if not ALLOWED_TARGET_HOSTS:
        raise HTTPException(503, "Backend is not configured: set ALLOWED_TARGET_HOSTS.")
    if not any(host == allowed or host.endswith("." + allowed)
               for allowed in ALLOWED_TARGET_HOSTS):
        raise HTTPException(403, "Target host is not in the authorized allowlist.")
    try:
        addresses = {
            item[4][0] for item in socket.getaddrinfo(
                host, parsed.port or (443 if parsed.scheme == "https" else 80),
                type=socket.SOCK_STREAM
            )
        }
    except (socket.gaierror, ValueError, OSError):
        raise HTTPException(400, "Hostname could not be resolved.")
    if not addresses:
        raise HTTPException(400, "No IP addresses found.")
    for address in addresses:
        if not ipaddress.ip_address(address).is_global:
            raise HTTPException(400, "Private or non-public network targets are not allowed.")
    return parsed.geturl()

async def zap_get(path: str, params: dict | None = None):
    if not ZAP_API_KEY:
        raise HTTPException(503, "Backend is not configured: set ZAP_API_KEY.")
    p = dict(params or {})
    p["apikey"] = ZAP_API_KEY
    try:
        async with httpx.AsyncClient(timeout=20.0, trust_env=False) as client:
            r = await client.get(f"{ZAP_API_URL}{path}", params=p)
            r.raise_for_status()
            data = r.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, "Could not communicate with the OWASP ZAP engine.")
    if isinstance(data, dict) and data.get("code") and data.get("message"):
        raise HTTPException(502, f"ZAP API error: {data.get('message')}")
    return data

# MVP in-memory scan tracking. For multiple backend replicas/restarts, use Redis or a DB.
SCANS: dict[str, dict] = {}
MAX_ACTIVE_SCANS = 1
MAX_SCAN_AGE_SECONDS = 45 * 60

def scope_regex(url: str) -> str:
    p = urlparse(url)
    # Exact host and optional subdomains are not implicitly trusted; only the host supplied.
    host = re.escape(p.hostname or "")
    port = f":{p.port}" if p.port else ""
    scheme = re.escape(p.scheme)
    # Limit the context to the selected scheme + host + optional port.
    return f"^{scheme}://{host}{re.escape(port)}(?::\\d+)?/.*$"

@app.get("/")
def root():
    return {"name": "Hacking Weakness Finder Active Scan API", "status": "ok", "engine": "OWASP ZAP"}

@app.get("/health")
async def health():
    # Does not expose the API key or internal service details.
    return {"status": "ok", "engine_configured": bool(ZAP_API_URL and ZAP_API_KEY)}

@app.post("/api/scan/start")
async def start_scan(req: ScanRequest, x_scanner_token: str | None = Header(default=None)):
    require_auth(x_scanner_token)
    target = validate_target(req.url)

    now = time.time()
    for sid in list(SCANS):
        if now - SCANS[sid].get("created_epoch", now) > MAX_SCAN_AGE_SECONDS:
            SCANS.pop(sid, None)
    if sum(s.get("status") in {"starting", "spidering", "scanning"} for s in SCANS.values()) >= MAX_ACTIVE_SCANS:
        raise HTTPException(429, "A scan is already running. Wait for it to finish.")

    # Set up a dedicated ZAP context with an exact host scope.
    scan_id = uuid.uuid4().hex
    context_name = f"scan-{scan_id[:12]}"
    p = urlparse(target)
    host = re.escape(p.hostname or "")
    port = f":{p.port}" if p.port else ""
    scheme = re.escape(p.scheme)
    regex = f"^{scheme}://{host}{re.escape(port)}/.*$"

    await zap_get("/JSON/context/action/newContext/", {"contextName": context_name})
    await zap_get("/JSON/context/action/includeInContext/", {
        "contextName": context_name, "regex": regex
    })
    # ZAP returns the exact spider ID for this request.
    spider_result = await zap_get("/JSON/spider/action/scan/", {
        "url": target, "contextName": context_name, "recurse": "true"
    })
    spider_id = str(spider_result.get("scan")) if spider_result.get("scan") is not None else None
    if spider_id is None:
        raise HTTPException(502, "ZAP did not return a spider scan ID.")

    SCANS[scan_id] = {
        "id": scan_id, "target": target, "context": context_name,
        "spider_id": spider_id, "ascan_id": None, "status": "spidering",
        "created_epoch": now, "created_at": time.time()
    }
    return {
        "scan_id": scan_id,
        "status": "spidering",
        "message": "Crawling the authorized target before active checks."
    }

@app.get("/api/scan/{scan_id}")
async def scan_status(scan_id: str, x_scanner_token: str | None = Header(default=None)):
    require_auth(x_scanner_token)
    item = SCANS.get(scan_id)
    if not item:
        raise HTTPException(404, "Scan ID not found. The MVP keeps scan state in memory.")
    if time.time() - item["created_epoch"] > MAX_SCAN_AGE_SECONDS:
        item["status"] = "expired"
        raise HTTPException(410, "Scan expired.")

    if item["status"] == "spidering":
        data = await zap_get("/JSON/spider/view/status/", {"scanId": item["spider_id"]})
        progress = int(data.get("status", 0))
        item["progress"] = progress
        if progress >= 100:
            result = await zap_get("/JSON/ascan/action/scan/", {
                "url": item["target"],
                "contextId": await get_context_id(item["context"]),
                "recurse": "true",
                "inScopeOnly": "true",
            })
            item["ascan_id"] = str(result.get("scan"))
            if not item["ascan_id"] or item["ascan_id"] == "None":
                item["status"] = "error"
                item["error"] = "ZAP did not return an active scan ID."
            else:
                item["status"] = "scanning"
                item["progress"] = 0
        return {"scan_id": scan_id, "target": item["target"],
                "status": item["status"], "progress": item.get("progress", 0)}

    if item["status"] == "scanning":
        data = await zap_get("/JSON/ascan/view/status/", {"scanId": item["ascan_id"]})
        progress = int(data.get("status", 0))
        item["progress"] = progress
        if progress >= 100:
            alerts = await zap_get("/JSON/core/view/alerts/", {
                "baseurl": item["target"], "start": "0", "count": "500"
            })
            item["status"] = "complete"
            item["findings"] = normalize_alerts(alerts.get("alerts", []), item["target"])
        return {"scan_id": scan_id, "target": item["target"],
                "status": item["status"], "progress": item.get("progress", 0)}

    if item["status"] == "complete":
        return {
            "scan_id": scan_id, "target": item["target"], "status": "complete",
            "progress": 100, "findings_count": len(item.get("findings", [])),
            "findings": item.get("findings", []),
            "note": "ZAP findings are scanner results and should be manually verified."
        }
    return {"scan_id": scan_id, "target": item["target"],
            "status": item["status"], "progress": item.get("progress", 0),
            "error": item.get("error")}

async def get_context_id(context_name: str) -> str:
    data = await zap_get("/JSON/context/view/context/", {"contextName": context_name})
    context = data.get("context", {})
    context_id = context.get("id")
    if context_id is None:
        raise HTTPException(502, "Could not resolve ZAP context ID.")
    return str(context_id)

def normalize_alerts(alerts: list, target: str) -> list:
    out = []
    for a in alerts:
        risk = str(a.get("risk", "Informational"))
        severity = {
            "High": "High", "Medium": "Medium", "Low": "Low",
            "Informational": "Info"
        }.get(risk, "Info")
        out.append({
            "severity": severity,
            "title": a.get("alert", "ZAP finding"),
            "description": a.get("description", ""),
            "evidence": a.get("evidence", "") or a.get("other", ""),
            "url": a.get("url", target),
            "method": a.get("method", ""),
            "parameter": a.get("param", ""),
            "cweid": a.get("cweid", ""),
            "solution": a.get("solution", ""),
            "reference": a.get("reference", ""),
            "plugin_id": a.get("pluginId", ""),
        })
    return out
