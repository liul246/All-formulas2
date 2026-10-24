import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Hacking Weakness Finder API")

# Replace with your actual frontend origin(s).
# Example: "https://YOUR-USERNAME.github.io"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://YOUR-USERNAME.github.io",
        "https://YOUR-PROJECT.vercel.app",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

TIMEOUT = 8.0


class ScanRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)


def validate_target(raw: str) -> str:
    p = urlparse(raw.strip())

    if p.scheme not in ("http", "https") or not p.hostname:
        raise HTTPException(400, "Enter a valid HTTP or HTTPS URL.")

    if p.username or p.password:
        raise HTTPException(400, "URLs containing credentials are not allowed.")

    host = p.hostname.rstrip(".").lower()

    if host == "localhost" or host.endswith(".localhost"):
        raise HTTPException(400, "Local targets are not allowed.")

    try:
        addresses = {
            item[4][0]
            for item in socket.getaddrinfo(
                host, p.port or (443 if p.scheme == "https" else 80),
                type=socket.SOCK_STREAM
            )
        }
    except (socket.gaierror, ValueError, OSError):
        raise HTTPException(400, "Hostname could not be resolved.")

    if not addresses:
        raise HTTPException(400, "No IP addresses found.")

    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise HTTPException(
                400, "Private or non-public network targets are not allowed."
            )

    return p.geturl()


def add(findings, severity, title, description, evidence, recommendation):
    findings.append({
        "severity": severity,
        "title": title,
        "description": description,
        "evidence": evidence,
        "recommendation": recommendation,
    })


@app.get("/")
def root():
    return {"name": "Hacking Weakness Finder API", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/scan")
async def scan(req: ScanRequest):
    target = validate_target(req.url)
    parsed = urlparse(target)
    findings = []

    if parsed.scheme != "https":
        add(
            findings, "High", "HTTPS is not enabled",
            "The submitted URL uses HTTP.",
            target,
            "Enable HTTPS and redirect HTTP requests to HTTPS."
        )

    try:
        async with httpx.AsyncClient(
            timeout=TIMEOUT,
            follow_redirects=False,
            trust_env=False,
        ) as client:
            response = await client.get(
                target,
                headers={"User-Agent": "HackingWeaknessFinder/1.0"},
            )
    except httpx.HTTPError:
        raise HTTPException(
            502, "Could not fetch the target. Check the URL and try again."
        )

    headers = {k.lower(): v for k, v in response.headers.items()}

    for header, title, recommendation in [
        (
            "content-security-policy",
            "Content-Security-Policy is missing",
            "Configure a suitable Content-Security-Policy."
        ),
        (
            "x-content-type-options",
            "X-Content-Type-Options is missing",
            "Set X-Content-Type-Options: nosniff."
        ),
        (
            "referrer-policy",
            "Referrer-Policy is missing",
            "Set an appropriate Referrer-Policy."
        ),
        (
            "permissions-policy",
            "Permissions-Policy is missing",
            "Restrict browser features that the site does not need."
        ),
    ]:
        if header not in headers:
            add(
                findings, "Medium", title,
                "The HTTP response does not include this security header.",
                f"Missing response header: {header}",
                recommendation,
            )

    if parsed.scheme == "https" and "strict-transport-security" not in headers:
        add(
            findings, "Low", "HSTS header is missing",
            "The HTTPS response does not include Strict-Transport-Security.",
            "Missing response header: strict-transport-security",
            "Consider enabling HSTS after confirming HTTPS works correctly."
        )

    for cookie in response.headers.get_list("set-cookie"):
        lower_cookie = cookie.lower()
        if "secure" not in lower_cookie:
            add(
                findings, "Medium", "Cookie lacks Secure attribute",
                "A cookie may be sent over an unencrypted connection.",
                cookie.split(";", 1)[0],
                "Set the Secure attribute on cookies that should only use HTTPS."
            )
        if "httponly" not in lower_cookie:
            add(
                findings, "Low", "Cookie lacks HttpOnly attribute",
                "Client-side scripts may be able to access this cookie.",
                cookie.split(";", 1)[0],
                "Use HttpOnly for cookies that do not need JavaScript access."
            )

    return {
        "target": target,
        "status_code": response.status_code,
        "findings_count": len(findings),
        "findings": findings,
        "note": "Basic configuration checks only; this is not a full vulnerability audit.",
    }
