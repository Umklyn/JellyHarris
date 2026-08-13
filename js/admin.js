import { db, auth } from "./firebase-init.js";
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const CLOUDINARY_CLOUD = "qjupwxds";
const CLOUDINARY_PRESET = "JellyHarris_uploads";
const ADMIN_EMAIL = "jelisa.harris@gmail.com";

let quill = null;
let currentAlbumId = null;
let currentArticleId = null;
let albumPhotos = [];
let coverUrl = "";

// --- Auth ---
onAuthStateChanged(auth, user => {
  if (user && user.email === ADMIN_EMAIL) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("admin-dashboard").style.display = "grid";
    loadAlbums();
    loadArticles();
  } else {
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("admin-dashboard").style.display = "none";
  }
});

document.getElementById("google-login-btn").addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    alert("Erreur de connexion : " + e.message);
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

// --- Sidebar navigation ---
document.querySelectorAll(".sidebar-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".admin-panel").forEach(p => p.style.display = "none");
    document.getElementById(`panel-${btn.dataset.panel}`).style.display = "block";
  });
});

// --- Cloudinary upload ---
async function uploadToCloudinary(file) {
  const compressed = await compressImage(file, 1600, 0.85);
  const formData = new FormData();
  formData.append("file", compressed);
  formData.append("upload_preset", CLOUDINARY_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: "POST",
    body: formData
  });
  const data = await res.json();
  return data.secure_url;
}

function compressImage(file, maxWidth, quality) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(resolve, "image/jpeg", quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- Albums ---
async function loadAlbums() {
  const list = document.getElementById("albums-admin-list");
  list.innerHTML = `<div class="loading-state"><span class="label">Chargement...</span></div>`;

  try {
    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = `<div class="loading-state"><span class="label">Aucun album — créez-en un !</span></div>`;
      return;
    }

    list.innerHTML = "";
    snapshot.forEach(docSnap => {
      const a = docSnap.data();
      const item = document.createElement("div");
      item.className = "admin-item";
      item.innerHTML = `
        ${a.photos?.[0] ? `<img class="admin-item-thumb" src="${a.photos[0]}" alt="${a.name}" />` : `<div class="admin-item-thumb"></div>`}
        <div class="admin-item-info">
          <span class="admin-item-title">${a.name}</span>
          <span class="admin-item-meta">${a.photos?.length || 0} photo(s) · ${a.series || ""}</span>
        </div>
        <div class="admin-item-actions">
          <button class="admin-action-btn view" data-id="${docSnap.id}">Voir les photos</button>
          <button class="admin-action-btn delete" data-id="${docSnap.id}">Supprimer</button>
        </div>
      `;
      item.querySelector(".view").addEventListener("click", () => {
        const photos = a.photos || [];
        const win = window.open("", "_blank");
        win.document.write(`<html><body style="background:#fff;display:flex;flex-wrap:wrap;gap:8px;padding:16px;">${photos.map(u => `<img src="${u}" style="height:200px;object-fit:cover;" />`).join("")}</body></html>`);
      });
      item.querySelector(".delete").addEventListener("click", async () => {
        if (confirm(`Supprimer l'album "${a.name}" ?`)) {
          await deleteDoc(doc(db, "albums", docSnap.id));
          loadAlbums();
        }
      });
      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = `<div class="loading-state"><span class="label">Erreur : ${e.message}</span></div>`;
    console.error("loadAlbums:", e);
  }
}

document.getElementById("new-album-btn").addEventListener("click", () => {
  currentAlbumId = null;
  albumPhotos = [];
  document.getElementById("album-name").value = "";
  document.getElementById("album-desc").value = "";
  document.getElementById("album-upload-preview").innerHTML = "";
  openModal("modal-album");
});

document.getElementById("album-upload-zone").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.onchange = async e => {
    const files = Array.from(e.target.files);
    const preview = document.getElementById("album-upload-preview");
    for (const file of files) {
      const wrap = document.createElement("div");
      wrap.className = "preview-thumb-wrap";
      const img = document.createElement("img");
      img.className = "preview-thumb";
      img.src = URL.createObjectURL(file);
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✕";
      removeBtn.onclick = () => {
        const idx = albumPhotos.indexOf(file);
        if (idx > -1) albumPhotos.splice(idx, 1);
        wrap.remove();
      };
      wrap.appendChild(img);
      wrap.appendChild(removeBtn);
      preview.appendChild(wrap);
      albumPhotos.push(file);
    }
  };
  input.click();
});

document.getElementById("save-album-btn").addEventListener("click", async () => {
  const name = document.getElementById("album-name").value.trim();
  if (!name) return alert("Donne un nom à l'album !");

  const btn = document.getElementById("save-album-btn");
  btn.textContent = "Upload en cours...";
  btn.disabled = true;

  try {
    const urls = [];
    for (const file of albumPhotos) {
      const url = await uploadToCloudinary(file);
      urls.push(url);
    }

    await addDoc(collection(db, "albums"), {
      name,
      description: document.getElementById("album-desc").value.trim(),
      photos: urls,
      createdAt: serverTimestamp()
    });

    closeAllModals();
    loadAlbums();
  } catch (e) {
    alert("Erreur lors de l'upload : " + e.message);
  } finally {
    btn.textContent = "Publier l'album";
    btn.disabled = false;
  }
});

document.getElementById("cancel-album-btn").addEventListener("click", closeAllModals);
document.getElementById("close-album-modal").addEventListener("click", closeAllModals);

// --- Articles ---
async function loadArticles() {
  const list = document.getElementById("articles-admin-list");
  list.innerHTML = `<div class="loading-state"><span class="label">Chargement...</span></div>`;

  try {
    const q = query(collection(db, "articles"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = `<div class="loading-state"><span class="label">Aucun article — créez-en un !</span></div>`;
      return;
    }

    list.innerHTML = "";
    snapshot.forEach(docSnap => {
      const a = docSnap.data();
      const date = a.createdAt?.toDate?.()
        ? new Intl.DateTimeFormat("fr-BE", { year: "numeric", month: "long", day: "numeric" }).format(a.createdAt.toDate())
        : "";
      const item = document.createElement("div");
      item.className = "admin-item";
      item.innerHTML = `
        ${a.cover ? `<img class="admin-item-thumb" src="${a.cover}" alt="${a.title}" />` : `<div class="admin-item-thumb"></div>`}
        <div class="admin-item-info">
          <span class="admin-item-title">${a.title}</span>
          <span class="admin-item-meta">${date}</span>
        </div>
        <div class="admin-item-actions">
          <button class="admin-action-btn delete" data-id="${docSnap.id}">Supprimer</button>
        </div>
      `;
      item.querySelector(".delete").addEventListener("click", async () => {
        if (confirm(`Supprimer l'article "${a.title}" ?`)) {
          await deleteDoc(doc(db, "articles", docSnap.id));
          loadArticles();
        }
      });
      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = `<div class="loading-state"><span class="label">Erreur</span></div>`;
  }
}

document.getElementById("new-article-btn").addEventListener("click", () => {
  currentArticleId = null;
  coverUrl = "";
  document.getElementById("article-title").value = "";
  document.getElementById("cover-preview").innerHTML = "";
  document.getElementById("modal-article-title").textContent = "Nouvel article";

  openModal("modal-article");

  setTimeout(() => {
    if (!quill) {
      try {
        quill = new Quill("#quill-editor", {
          theme: "snow",
          modules: {
            toolbar: [
              [{ header: [1, 2, 3, false] }],
              ["bold", "italic", "underline"],
              ["blockquote"],
              [{ list: "ordered" }, { list: "bullet" }],
              ["link", "image"],
              ["clean"]
            ]
          }
        });
        quill.getModule("toolbar").addHandler("image", () => insertImageInArticle());
      } catch(e) { console.error("Quill init:", e); }
    } else {
      quill.setText("");
    }
  }, 100);
});

function insertImageInArticle() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadToCloudinary(file);
    const range = quill.getSelection(true);
    quill.insertEmbed(range.index, "image", url);
  };
  input.click();
}

document.getElementById("cover-upload-zone").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    coverUrl = await uploadToCloudinary(file);
    document.getElementById("cover-preview").innerHTML = `<img src="${coverUrl}" alt="Cover" />`;
  };
  input.click();
});

document.getElementById("save-article-btn").addEventListener("click", async () => {
  const title = document.getElementById("article-title").value.trim();
  if (!title) return alert("Donne un titre à l'article !");

  const btn = document.getElementById("save-article-btn");
  btn.textContent = "Publication...";
  btn.disabled = true;

  try {
    const content = quill.root.innerHTML;
    const plainText = quill.getText().trim();
    const excerpt = plainText.slice(0, 200);

    await addDoc(collection(db, "articles"), {
      title,
      content,
      excerpt,
      cover: coverUrl,
      createdAt: serverTimestamp()
    });

    closeAllModals();
    loadArticles();
  } catch (e) {
    alert("Erreur : " + e.message);
  } finally {
    btn.textContent = "Publier l'article";
    btn.disabled = false;
  }
});

document.getElementById("cancel-article-btn").addEventListener("click", closeAllModals);
document.getElementById("close-article-modal").addEventListener("click", closeAllModals);

// --- Modal helpers ---
function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.getElementById("modal-overlay").classList.add("open");
}

function closeAllModals() {
  document.querySelectorAll(".modal").forEach(m => m.classList.remove("open"));
  document.getElementById("modal-overlay").classList.remove("open");
}

document.getElementById("modal-overlay").addEventListener("click", closeAllModals);
