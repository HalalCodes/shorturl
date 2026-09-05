import { auth, db, googleProvider } from "./firebase.js";
import { signInWithPopup, signOut, onAuthStateChanged, updateProfile as updateAuthProfile } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $ = s => document.querySelector(s);
const page = document.body.dataset.page;
const base = location.origin + location.pathname.replace(/\/[^/]*$/, "/");
const shortBase = base;

function escapeHTML(v=""){ return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function makeAlias(){ return crypto.randomUUID().replaceAll("-","").slice(0,7); }
function expiryDate(v){ if(!v)return null; const ms={ "1h":3600000,"1d":86400000,"7d":604800000,"30d":2592000000}[v]; return new Date(Date.now()+ms); }
function isExpired(x){ return x.expiresAt && x.expiresAt.toDate ? x.expiresAt.toDate() < new Date() : false; }
function fmtDate(x){ if(!x)return "—"; const d=x.toDate?x.toDate():new Date(x); return d.toLocaleString(); }

async function login(){
  try{ await signInWithPopup(auth,googleProvider); location.href="app.html"; }
  catch(e){ alert("Google sign-in failed: "+e.message); }
}
$("#loginBtn")?.addEventListener("click",login);
$("#logoutBtn")?.addEventListener("click",async()=>{await signOut(auth);location.href="index.html";});

onAuthStateChanged(auth, async user=>{
  if(page==="app") await initApp(user);
  if(page==="profile") await initProfile(user);
  if(page==="profile-public") await initPublic();
  if(page==="redirect") await initRedirect();
});

async function initApp(user){
  if(!user){ $("#loginBtn")?.classList.remove("hidden"); return; }
  $("#loginBtn")?.classList.add("hidden");
  $("#userName").textContent = user.displayName ? ", "+user.displayName.split(" ")[0] : "";
  $("#avatar").textContent=(user.displayName||user.email||"S").charAt(0).toUpperCase();
  await renderLinks(user);
  $("#linkForm")?.addEventListener("submit", e=>createLink(e,user));
  $("#passwordEnabled")?.addEventListener("change",e=>$("#linkPassword").classList.toggle("hidden",!e.target.checked));
  $("#searchLinks")?.addEventListener("input",()=>renderLinks(user));
}
async function getLinks(uid){
  const q=query(collection(db,"links"),where("ownerId","==",uid),orderBy("createdAt","desc"));
  try { return (await getDocs(q)).docs.map(d=>({id:d.id,...d.data()})); }
  catch { const s=await getDocs(query(collection(db,"links"),where("ownerId","==",uid))); return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); }
}
async function renderLinks(user){
  const list=$("#linksList"); if(!list)return;
  const links=await getLinks(user.uid); const term=($("#searchLinks")?.value||"").toLowerCase();
  const filtered=links.filter(x=>(x.alias+" "+x.originalUrl).toLowerCase().includes(term));
  $("#statLinks").textContent=links.length;
  $("#statClicks").textContent=links.reduce((n,x)=>n+(x.clicks||0),0).toLocaleString();
  $("#statActive").textContent=links.filter(x=>x.active!==false&&!isExpired(x)).length;
  $("#statExpired").textContent=links.filter(isExpired).length;
  list.innerHTML=filtered.length?filtered.map(x=>{
    const expired=isExpired(x)||x.active===false;
    return `<article class="link-row"><div class="link-main"><a target="_blank" href="${shortBase}link.html?c=${encodeURIComponent(x.alias)}">${escapeHTML(shortBase)}<strong>${escapeHTML(x.alias)}</strong></a><p>${escapeHTML(x.originalUrl)}</p><small>${expired?"Expired/disabled":"Active"} · ${x.clicks||0} clicks · ${fmtDate(x.createdAt)}</small></div><div class="row-actions"><button class="icon-btn" data-copy="${escapeHTML(shortBase+"link.html?c="+x.alias)}">Copy</button><button class="icon-btn" data-qr="${escapeHTML(x.alias)}">QR</button><button class="icon-btn danger" data-del="${x.id}">Delete</button></div></article>`;
  }).join(""):`<div class="empty">No links yet. Create your first short link above.</div>`;
  list.querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>navigator.clipboard.writeText(b.dataset.copy).then(()=>{b.textContent="Copied";setTimeout(()=>b.textContent="Copy",1000)}));
  list.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this link?")){await deleteDoc(doc(db,"links",b.dataset.del));renderLinks(user)}});
  list.querySelectorAll("[data-qr]").forEach(b=>b.onclick=()=>showQR(shortBase+"link.html?c="+b.dataset.qr));
  renderBars(links);
}
function renderBars(links){
  const el=$("#activityBars"); if(!el)return;
  const max=Math.max(1,...links.map(x=>x.clicks||0));
  el.innerHTML=links.slice(0,10).reverse().map(x=>`<div class="bar"><span>${escapeHTML(x.alias)}</span><i style="height:${Math.max(6,(x.clicks||0)/max*100)}%"></i><b>${x.clicks||0}</b></div>`).join("");
}
async function createLink(e,user){
  e.preventDefault(); const msg=$("#formMessage"); msg.textContent="Creating…";
  const url=$("#url").value.trim(); const alias=($("#alias").value.trim()||makeAlias()).replace(/[^A-Za-z0-9_-]/g,"");
  if(!/^https?:\/\//i.test(url)){msg.textContent="Use a valid http(s) URL.";return;}
  const existing=await getDocs(query(collection(db,"links"),where("alias","==",alias),limit(1)));
  if(!existing.empty){msg.textContent="That alias is already taken.";return;}
  const password=$("#passwordEnabled").checked?$("#linkPassword").value:null;
  if($("#passwordEnabled").checked && password.length<4){msg.textContent="Password must be at least 4 characters.";return;}
  await addDoc(collection(db,"links"),{ownerId:user.uid,alias,originalUrl:url,active:true,clicks:0,password,passwordRequired:!!password,expiresAt:expiryDate($("#expiry").value),createdAt:serverTimestamp(),title:alias});
  e.target.reset();$("#linkPassword").classList.add("hidden");msg.textContent="Link created successfully.";await renderLinks(user);
}
function showQR(text){
  const w=window.open("","QR","width=420,height=500"); if(!w)return;
  const qr="https://quickchart.io/qr?text="+encodeURIComponent(text)+"&size=300";
  w.document.write(`<title>QR Code</title><body style="font-family:system-ui;text-align:center;padding:30px"><h2>ShortURL QR Code</h2><img src="${qr}" alt="QR Code" width="300"><p>${escapeHTML(text)}</p><button onclick="window.print()">Print / Save</button></body>`);
}

async function initProfile(user){
  if(!user){ $("#profileMessage").textContent="Please sign in from the dashboard first."; return; }
  $("#profileEmail").textContent=user.email||"Google account";
  $("#profileAvatar").textContent=(user.displayName||user.email||"S").charAt(0).toUpperCase();
  const ref=doc(db,"users",user.uid), snap=await getDoc(ref), d=snap.exists()?snap.data():{};
  $("#displayName").value=d.displayName||user.displayName||"";
  $("#bio").value=d.bio||"";
  $("#username").value=d.username||"";
  $("#profileForm").onsubmit=async e=>{e.preventDefault();const name=$("#displayName").value.trim(),bio=$("#bio").value.trim(),username=$("#username").value.trim();await setDoc(ref,{displayName:name,bio,username,email:user.email,updatedAt:serverTimestamp()},{merge:true});if(name&&name!==user.displayName)await updateAuthProfile(user,{displayName:name});$("#profileMessage").textContent="Profile saved.";};
}
async function initPublic(){
  const uid=new URLSearchParams(location.search).get("uid"); const username=new URLSearchParams(location.search).get("u");
  let userData=null;
  if(uid){const s=await getDoc(doc(db,"users",uid));if(s.exists())userData=s.data();}
  else if(username){const s=await getDocs(query(collection(db,"users"),where("username","==",username),limit(1)));if(!s.empty)userData=s.docs[0].data();}
  if(!userData){$("#publicName").textContent="Profile not found";return;}
  $("#publicName").textContent=userData.displayName||userData.username||"ShortURL user";$("#publicBio").textContent=userData.bio||"";
  const ls=await getDocs(query(collection(db,"links"),where("ownerId","==",userData.uid||"")));
  $("#publicLinks").innerHTML=ls.docs.map(d=>d.data()).filter(x=>x.public!==false&&x.active!==false&&!isExpired(x)).map(x=>`<a class="public-link" target="_blank" href="${shortBase}link.html?c=${encodeURIComponent(x.alias)}"><strong>${escapeHTML(x.title||x.alias)}</strong><span>${escapeHTML(x.originalUrl)}</span></a>`).join("");
}
async function initRedirect(){
  const code=new URLSearchParams(location.search).get("c"); const title=$("#redirectTitle"), text=$("#redirectText");
  if(!code){title.textContent="Invalid short link";text.textContent="No link code was provided.";return;}
  const s=await getDocs(query(collection(db,"links"),where("alias","==",code),limit(1)));
  if(s.empty){title.textContent="Link not found";text.textContent="This short link does not exist.";return;}
  const ref=s.docs[0].ref,x=s.docs[0].data();
  if(x.active===false||isExpired(x)){title.textContent="Link unavailable";text.textContent="This link has expired or has been disabled.";return;}
  const go=async()=>{await updateDoc(ref,{clicks:increment(1),lastClickedAt:serverTimestamp()});location.replace(x.originalUrl);};
  if(x.passwordRequired){
    title.textContent="Protected link";text.textContent="Enter the password to continue.";
    $("#unlockForm").classList.remove("hidden");$("#unlockForm").onsubmit=async e=>{e.preventDefault();if($("#unlockPassword").value===x.password)go();else text.textContent="Incorrect password.";};
  } else { setTimeout(go,700); }
}
