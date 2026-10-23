// Replace with your deployed Python API URL, e.g. https://your-api.example.com
const API_BASE = "https://YOUR-BACKEND-HOST";
const $ = s => document.querySelector(s);
let report = null;
function text(tag, cls, value){const e=document.createElement(tag);e.className=cls;e.textContent=value||"";return e;}
$("#scan-form").addEventListener("submit", async e=>{
 e.preventDefault(); const url=$("#target").value.trim();
 if(!/^https?:\/\//i.test(url)){ $("#status").textContent="Enter a URL starting with http:// or https://."; return; }
 if(API_BASE.includes("YOUR-BACKEND-HOST")){ $("#status").textContent="Setup needed: set API_BASE in frontend/app.js to your deployed backend URL."; return; }
 $("#scan-button").disabled=true; $("#status").textContent="Scanning…";
 try{
  const r=await fetch(API_BASE.replace(/\/$/,"")+"/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});
  const d=await r.json(); if(!r.ok) throw Error(d.detail||"Scan failed"); report=d;
  const fs=d.findings||[]; $("#all").textContent=fs.length; $("#high").textContent=fs.filter(x=>x.severity==="High").length; $("#medium").textContent=fs.filter(x=>x.severity==="Medium").length; $("#low").textContent=fs.filter(x=>["Low","Info"].includes(x.severity)).length;
  $("#meta").textContent=`Target: ${d.target} · Checked: ${d.checked_at} · HTTP status: ${d.http_status}`;
  const list=$("#list"); list.replaceChildren();
  fs.forEach(f=>{const card=text("article","finding","");const top=text("div","findingtop","");top.append(text("h3","",f.title));top.append(text("span","badge "+(f.severity||"Info").toLowerCase(),f.severity));card.append(top);card.append(text("p","",f.description));if(f.evidence)card.append(text("p","","Evidence: "+f.evidence));if(f.recommendation)card.append(text("p","","Recommendation: "+f.recommendation));list.append(card);});
  $("#summary").classList.remove("hidden");$("#results").classList.remove("hidden");$("#status").textContent="Scan complete. Verify findings before treating them as confirmed.";
 }catch(err){$("#status").textContent="Scan failed: "+err.message+" (check API URL, CORS, and backend status).";}
 finally{$("#scan-button").disabled=false;}
});
$("#export").addEventListener("click",()=>{if(!report)return;const u=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=u;a.download="hacking-weakness-finder-report.json";a.click();URL.revokeObjectURL(u);});