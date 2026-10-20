export async function sha256(value){const data=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");}
export function secureToken(){return crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");}
export function safeText(s,max=180){return String(s||"").trim().slice(0,max);}
export function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}