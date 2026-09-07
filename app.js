import { auth, db, googleProvider } from "./firebase.js";
import {
  signInWithPopup, signOut, onAuthStateChanged, updateProfile as updateAuthProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const page = document.body.dataset.page;
const SHORT_BASE = `${location.origin}/`;

const escapeHTML = (v = "") =>
  String(v).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

const aliasOK = (v) => /^[A-Za-z0-9_-]{3,48}$/.test(v);
const makeAlias = () => crypto.randomUUID().replaceAll("-", "").slice(0, 8);
const expiryDate = (v) => {
  const ms = {"1h":3600000,"1d":86400000,"7d":604800000,"30d":2592000000}[v];
  return ms ? new Date(Date.now() + ms) : null;
};
const isExpired = (x) => {
  if (!x?.expiresAt) return false;
  const d = x.expiresAt?.toDate ? x.expiresAt.toDate() : new Date(x.expiresAt);
  return d < new Date();
};
const fmtDate = (x) => {
  if (!x) return "—";
  const d = x.toDate ? x.toDate() : new Date(x);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};
const shortUrl = (alias) => `${SHORT_BASE}${encodeURIComponent(alias)}`;

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function login() {
  try {
    await signInWithPopup(auth, googleProvider);
    location.href = "app.html";
  } catch (e) {
    alert("Google sign-in failed: " + (e?.message || e));
  }
}
$("#loginBtn")?.addEventListener("click", login);
$("#logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "index.html";
});

onAuthStateChanged(auth, async (user) => {
  try {
    if (page === "app") await initApp(user);
    if (page === "profile") await initProfile(user);
    if (page === "profile-public") await initPublic();
    if (page === "redirect") await initRedirect();
  } catch (e) {
    console.error(e);
    const msg = document.querySelector(".form-message");
    if (msg) msg.textContent = "Something went wrong. Please try again.";
  }
});

async function initApp(user) {
  if (!user) {
    $("#loginBtn")?.classList.remove("hidden");
    return;
  }
  $("#loginBtn")?.classList.add("hidden");
  $("#userName").textContent = user.displayName ? ", " + user.displayName.split(" ")[0] : "";
  $("#avatar").textContent = (user.displayName || user.email || "S").charAt(0).toUpperCase();

  await renderLinks(user);
  $("#linkForm")?.addEventListener("submit", (e) => createLink(e, user));
  $("#passwordEnabled")?.addEventListener("change", (e) =>
    $("#linkPassword")?.classList.toggle("hidden", !e.target.checked)
  );
  $("#searchLinks")?.addEventListener("input", () => renderLinks(user));
}

async function getLinks(uid) {
  const q = query(collection(db, "links"), where("ownerId", "==", uid), orderBy("createdAt", "desc"));
  try {
    return (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const s = await getDocs(query(collection(db, "links"), where("ownerId", "==", uid)));
    return s.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }
}

async function renderLinks(user) {
  const list = $("#linksList");
  if (!list) return;

  const links = await getLinks(user.uid);
  const term = ($("#searchLinks")?.value || "").toLowerCase().trim();
  const filtered = links.filter(x =>
    `${x.alias || ""} ${x.originalUrl || ""} ${x.title || ""}`.toLowerCase().includes(term)
  );

  $("#statLinks").textContent = links.length;
  $("#statClicks").textContent = links.reduce((n,x) => n + (x.clicks || 0), 0).toLocaleString();
  $("#statActive").textContent = links.filter(x => x.active !== false && !isExpired(x)).length;
  $("#statExpired").textContent = links.filter(x => x.active === false || isExpired(x)).length;

  list.innerHTML = filtered.length ? filtered.map(x => {
    const unavailable = x.active === false || isExpired(x);
    const url = shortUrl(x.alias);
    return `<article class="link-row">
      <div class="link-main">
        <a target="_blank" rel="noopener" href="${url}">
          <span>${escapeHTML(url)}</span>
        </a>
        <p>${escapeHTML(x.originalUrl)}</p>
        <small>${unavailable ? "Expired / disabled" : "Active"} · ${x.clicks || 0} clicks · ${fmtDate(x.createdAt)}</small>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-copy="${escapeHTML(url)}">Copy</button>
        <button class="icon-btn" data-qr="${escapeHTML(url)}">QR</button>
        <button class="icon-btn danger" data-del="${x.id}">Delete</button>
      </div>
    </article>`;
  }).join("") : `<div class="empty">No links found. Create your first short link above.</div>`;

  list.querySelectorAll("[data-copy]").forEach(b => {
    b.onclick = async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        const old = b.textContent;
        b.textContent = "Copied!";
        setTimeout(() => b.textContent = old, 1200);
      } catch {
        prompt("Copy this URL:", b.dataset.copy);
      }
    };
  });

  list.querySelectorAll("[data-del]").forEach(b => {
    b.onclick = async () => {
      if (!confirm("Delete this short link permanently?")) return;
      await deleteDoc(doc(db, "links", b.dataset.del));
      await renderLinks(user);
    };
  });

  list.querySelectorAll("[data-qr]").forEach(b => b.onclick = () => showQR(b.dataset.qr));
  renderBars(links);
}

function renderBars(links) {
  const el = $("#activityBars");
  if (!el) return;
  const top = [...links].sort((a,b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 10).reverse();
  const max = Math.max(1, ...top.map(x => x.clicks || 0));
  el.innerHTML = top.length ? top.map(x =>
    `<div class="bar">
      <span>${escapeHTML(x.alias)}</span>
      <i style="height:${Math.max(6, (x.clicks || 0) / max * 100)}%"></i>
      <b>${x.clicks || 0}</b>
    </div>`
  ).join("") : `<div class="empty">Click activity will appear here.</div>`;
}

async function createLink(e, user) {
  e.preventDefault();
  const msg = $("#formMessage");
  msg.textContent = "Creating…";

  const originalUrl = $("#url").value.trim();
  if (!/^https?:\/\//i.test(originalUrl)) {
    msg.textContent = "Use a valid http(s) URL.";
    return;
  }

  let alias = $("#alias").value.trim();
  alias = alias || makeAlias();

  if (!aliasOK(alias)) {
    msg.textContent = "Alias must be 3–48 characters: letters, numbers, _ or -.";
    return;
  }

  const linkRef = doc(db, "links", alias);
  const existing = await getDoc(linkRef);
  if (existing.exists()) {
    msg.textContent = "That short URL is already taken. Choose another alias.";
    return;
  }

  const protectedLink = $("#passwordEnabled").checked;
  const password = $("#linkPassword").value;
  if (protectedLink && password.length < 4) {
    msg.textContent = "Password must be at least 4 characters.";
    return;
  }

  const passwordHash = protectedLink ? await sha256(password) : null;

  await setDoc(linkRef, {
    ownerId: user.uid,
    alias,
    originalUrl,
    title: alias,
    active: true,
    public: true,
    clicks: 0,
    passwordRequired: protectedLink,
    passwordHash,
    expiresAt: expiryDate($("#expiry").value),
    createdAt: serverTimestamp()
  });

  e.target.reset();
  $("#linkPassword")?.classList.add("hidden");
  msg.textContent = `Created: ${shortUrl(alias)}`;
  await renderLinks(user);
}

function showQR(text) {
  const w = window.open("", "QR", "width=430,height=540");
  if (!w) return;
  const qr = "https://quickchart.io/qr?text=" + encodeURIComponent(text) + "&size=320";
  w.document.write(`<!doctype html><html><head><title>QR — ShortURL</title></head>
  <body style="font-family:system-ui;text-align:center;padding:28px">
    <h2>ShortURL QR</h2>
    <img src="${qr}" alt="QR Code" width="320" height="320">
    <p style="word-break:break-all">${escapeHTML(text)}</p>
    <button onclick="print()">Print / Save</button>
  </body></html>`);
  w.document.close();
}

async function initProfile(user) {
  if (!user) {
    $("#profileMessage").textContent = "Please sign in from the dashboard first.";
    return;
  }

  $("#profileEmail").textContent = user.email || "Google account";
  $("#profileAvatar").textContent = (user.displayName || user.email || "S").charAt(0).toUpperCase();

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : {};

  $("#displayName").value = d.displayName || user.displayName || "";
  $("#bio").value = d.bio || "";
  $("#username").value = d.username || "";

  $("#profileForm").onsubmit = async e => {
    e.preventDefault();
    const name = $("#displayName").value.trim();
    const bio = $("#bio").value.trim();
    const username = $("#username").value.trim();

    if (username && !/^[A-Za-z0-9_-]{3,30}$/.test(username)) {
      $("#profileMessage").textContent = "Username: 3–30 letters, numbers, _ or -.";
      return;
    }

    if (username) {
      const uq = query(collection(db, "users"), where("username", "==", username), limit(2));
      const matches = (await getDocs(uq)).docs.filter(x => x.id !== user.uid);
      if (matches.length) {
        $("#profileMessage").textContent = "That username is already in use.";
        return;
      }
    }

    await setDoc(ref, {
      uid: user.uid, displayName: name, bio, username,
      email: user.email || "", updatedAt: serverTimestamp()
    }, { merge: true });

    if (name && name !== user.displayName) await updateAuthProfile(user, { displayName: name });
    $("#profileMessage").textContent = "Profile saved successfully.";
  };
}

async function initPublic() {
  const qs = new URLSearchParams(location.search);
  const uid = qs.get("uid");
  const username = qs.get("u");

  let userData = null;
  if (uid) {
    const s = await getDoc(doc(db, "users", uid));
    if (s.exists()) userData = s.data();
  } else if (username) {
    const s = await getDocs(query(collection(db, "users"), where("username", "==", username), limit(1)));
    if (!s.empty) userData = s.docs[0].data();
  }

  if (!userData) {
    $("#publicName").textContent = "Profile not found";
    return;
  }

  $("#publicName").textContent = userData.displayName || userData.username || "ShortURL user";
  $("#publicBio").textContent = userData.bio || "";
  const ls = await getDocs(query(collection(db, "links"), where("ownerId", "==", userData.uid || "")));

  $("#publicLinks").innerHTML = ls.docs.map(d => d.data())
    .filter(x => x.public !== false && x.active !== false && !isExpired(x))
    .map(x => `<a class="public-link" target="_blank" rel="noopener" href="${shortUrl(x.alias)}">
      <strong>${escapeHTML(x.title || x.alias)}</strong>
      <span>${escapeHTML(x.originalUrl)}</span>
    </a>`).join("") || `<div class="empty">No public links yet.</div>`;
}

async function initRedirect() {
  const code = new URLSearchParams(location.search).get("c");
  const title = $("#redirectTitle");
  const text = $("#redirectText");

  if (!code || !aliasOK(code)) {
    title.textContent = "Invalid short link";
    text.textContent = "This URL is not a valid ShortURL link.";
    return;
  }

  const snap = await getDoc(doc(db, "links", code));
  if (!snap.exists()) {
    title.textContent = "Link not found";
    text.textContent = "This short link does not exist.";
    return;
  }

  const ref = snap.ref;
  const x = snap.data();

  if (x.active === false || isExpired(x)) {
    title.textContent = "Link unavailable";
    text.textContent = "This link has expired or has been disabled.";
    return;
  }

  const go = async () => {
    try {
      await updateDoc(ref, {
        clicks: increment(1),
        lastClickedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn("Click counter failed:", e);
    }
    location.replace(x.originalUrl);
  };

  if (x.passwordRequired) {
    title.textContent = "Protected link";
    text.textContent = "Enter the password to continue.";
    $("#unlockForm").classList.remove("hidden");
    $("#unlockForm").onsubmit = async e => {
      e.preventDefault();
      const entered = $("#unlockPassword").value;
      const hash = await sha256(entered);
      if (hash === x.passwordHash) go();
      else text.textContent = "Incorrect password. Try again.";
    };
  } else {
    setTimeout(go, 350);
  }
}
