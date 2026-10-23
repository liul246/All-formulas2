from datetime import datetime, timezone
import ipaddress, socket
from urllib.parse import urlparse
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Hacking Weakness Finder API", version="1.0.0")
# Replace "*" with your exact GitHub Pages origin before public deployment.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False,
                   allow_methods=["GET","POST","OPTIONS"], allow_headers=["Content-Type"])
TIMEOUT = httpx.Timeout(8.0, connect=4.0)

class ScanRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)

def validate_target(raw):
    p = urlparse(raw.strip())
    if p.scheme not in ("http","https") or not p.hostname:
        raise HTTPException(400, "Enter a valid http:// or https:// URL.")
    if p.username or p.password:
        raise HTTPException(400, "URLs containing credentials are not accepted.")
    host = p.hostname.rstrip(".").lower()
    if host == "localhost" or host.endswith((".localhost",".local")):
        raise HTTPException(400, "Local hostnames are blocked by this hosted scanner.")
    try:
        infos = socket.getaddrinfo(host, p.port or (443 if p.scheme=="https" else 80), type=socket.SOCK_STREAM)
    except (socket.gaierror, ValueError):
        raise HTTPException(400, "Hostname could not be resolved.")
    ips = {i[4][0] for i in infos}
    if not ips or any(not ipaddress.ip_address(x).is_global for x in ips):
        raise HTTPException(400, "Target resolves to a non-public IP and was blocked.")
    return p.geturl()

def add(fs, severity, title, description, evidence, recommendation):
    fs.append({"severity":severity,"title":title,"description":description,
               "evidence":evidence,"recommendation":recommendation})

@app.get("/")
def root(): return {"name":"Hacking Weakness Finder API","status":"ok"}
@app.get("/health")
def health(): return {"status":"ok"}

@app.post("/api/scan")
async def scan(req: ScanRequest):
    target = validate_target(req.url)
    fs=[]; original=urlparse(target)
    if original.scheme != "https":
        add(fs,"High","HTTPS is not enabled","Traffic sent over HTTP may be read or modified in transit.",
            "Submitted URL uses HTTP","Enable HTTPS and redirect HTTP requests to HTTPS.")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT,follow_redirects=True,max_redirects=4,
             headers={"User-Agent":"Hacking-Weakness-Finder/1.0"}) as client:
            response = await client.get(target)
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not fetch target: "+type(exc).__name__)
    final_url=str(response.url)
    # Validate the final URL too. Production deployments should additionally enforce
    # network-level egress restrictions and pin resolved IPs to prevent DNS rebinding.
    validate_target(final_url)
    headers={k.lower():v for k,v in response.headers.items()}
    body=response.content[:1_000_000].decode("utf-8",errors="replace")
    if original.scheme=="https" and final_url.startswith("http://"):
        add(fs,"High","Redirect ends on HTTP","The HTTPS URL redirected to an unencrypted destination.",
            "Final URL: "+final_url,"Keep redirects on HTTPS.")
    checks=[
      ("content-security-policy","Content-Security-Policy missing","Medium","A CSP can reduce the impact of some script-injection issues.","Configure a restrictive CSP suitable for the app."),
      ("x-content-type-options","X-Content-Type-Options missing","Low","Browsers may MIME-sniff some responses without this header.","Set X-Content-Type-Options: nosniff."),
      ("referrer-policy","Referrer-Policy missing","Low","Referrer information may be shared more broadly than intended.","Set a suitable Referrer-Policy."),
      ("permissions-policy","Permissions-Policy missing","Info","A Permissions Policy can restrict browser features.","Disable browser features the app does not need.")
    ]
    for key,title,sev,desc,rec in checks:
        if key not in headers: add(fs,sev,title,desc,key+" not present",rec)
    if original.scheme=="https" and "strict-transport-security" not in headers:
        add(fs,"Low","Strict-Transport-Security missing","HSTS asks browsers to prefer HTTPS on future visits.",
            "Header not present","After confirming HTTPS works site-wide, configure HSTS.")
    for cookie in response.headers.get_list("set-cookie"):
        name=cookie.split("=",1)[0].strip() or "(unknown)"
        low=cookie.lower(); missing=[]
        if original.scheme=="https" and "secure" not in low: missing.append("Secure")
        if "httponly" not in low: missing.append("HttpOnly")
        if "samesite" not in low: missing.append("SameSite")
        if missing:
            sev="Medium" if ("Secure" in missing or "HttpOnly" in missing) else "Low"
            add(fs,sev,"Cookie flags may be missing: "+name,
                "A cookie was set without one or more common protective attributes; the correct settings depend on its purpose.",
                "Missing flags: "+", ".join(missing),
                "Use Secure for HTTPS cookies, HttpOnly when JavaScript need not read the cookie, and an appropriate SameSite value.")
    if "text/html" in headers.get("content-type","").lower():
        if original.scheme=="https" and "http://" in body.lower():
            add(fs,"Info","Possible mixed-content reference","HTML contains an http:// string; this heuristic does not prove a browser-loaded resource is mixed content.",
                "Found http:// in response body","Inspect resource URLs and use HTTPS where supported.")
        if original.scheme!="https" and "<form" in body.lower() and 'type="password"' in body.lower():
            add(fs,"High","Password field appears on HTTP page","The response appears to include a password input while served over HTTP.",
                'Found <form> and type="password" in HTML','Serve login pages over HTTPS and ensure form actions also use HTTPS.')
    if not fs:
        add(fs,"Info","No issues found by starter checks","The configured checks did not identify listed indicators. This does not prove the app is vulnerability-free.",
            "Starter checks completed","Review the app manually and add application-specific tests.")
    return {"tool":"Hacking Weakness Finder","version":"1.0.0","target":target,
            "final_url":final_url,"checked_at":datetime.now(timezone.utc).isoformat(),
            "http_status":response.status_code,"findings":fs,
            "notice":"Heuristic, non-destructive checks only; verify findings manually."}
