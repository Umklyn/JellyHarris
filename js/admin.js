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
let currentArticleId = null;
let currentEditAlbumId = null;
let albumPhotos = [];
let coverUrl = "";
let twoColImageUrl = "";

// Register two-col blot for Quill before init
function registerTwoColBlot() {
  const BlockEmbed = Quill.import('blots/block/embed');
  class TwoColBlot extends BlockEmbed {
    static create(value) {
      const node = super.create();
      node.setAttribute('contenteditable', false);
      node.innerHTML = `
        <div class="two-col-img"><img src="${value.img || ''}" alt=""></div>
        <div class="two-col-text">${value.text || ''}</div>
      `;
      return node;
    }
    static value(node) {
      return {
        img: node.querySelector('img')?.src || '',
        text: node.querySelector('.two-col-text')?.innerHTML || ''
      };
    }
  }
  TwoColBlot.blotName = 'twoCol';
  TwoColBlot.tagName = 'div';
  TwoColBlot.className = 'two-col';
  Quill.register(TwoColBlot);
}
registerTwoColBlot();

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
    alert("Sign in error: " + e.message);
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.reload();
  } catch (e) {
    alert("Sign out error: " + e.message);
  }
});

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
  if (!data.secure_url) throw new Error(data.error?.message || "Cloudinary upload failed");
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
  list.innerHTML = `<div class="loading-state"><span class="label">Loading...</span></div>`;

  try {
    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = `<div class="loading-state"><span class="label">No albums yet — create one!</span></div>`;
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
          <span class="admin-item-meta">${a.photos?.length || 0} photo(s)${a.series ? ` · ${a.series}` : ""}</span>
        </div>
        <div class="admin-item-actions">
          <button class="admin-action-btn edit" data-id="${docSnap.id}">Edit</button>
          <button class="admin-action-btn delete" data-id="${docSnap.id}">Delete</button>
        </div>
      `;
      item.querySelector(".edit").addEventListener("click", () => openEditAlbum(a, docSnap.id));
      item.querySelector(".delete").addEventListener("click", async () => {
        if (confirm(`Delete album "${a.name}"?`)) {
          await deleteDoc(doc(db, "albums", docSnap.id));
          loadAlbums();
        }
      });
      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = `<div class="loading-state"><span class="label">Error: ${e.message}</span></div>`;
    console.error("loadAlbums:", e);
  }
}

document.getElementById("new-album-btn").addEventListener("click", () => {
  albumPhotos = [];
  document.getElementById("album-name").value = "";
  document.getElementById("album-series").value = "";
  document.getElementById("album-desc").value = "";
  document.getElementById("album-upload-preview").innerHTML = "";
  openModal("modal-album");
});

// Upload zone — click + drag & drop
function handleAlbumFiles(files) {
  const preview = document.getElementById("album-upload-preview");
  files.forEach(file => {
    if (!file.type.startsWith("image/")) return;
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
  });
}

const albumZone = document.getElementById("album-upload-zone");
albumZone.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.onchange = e => handleAlbumFiles(Array.from(e.target.files));
  input.click();
});
albumZone.addEventListener("dragover", e => { e.preventDefault(); albumZone.classList.add("drag-over"); });
albumZone.addEventListener("dragleave", () => albumZone.classList.remove("drag-over"));
albumZone.addEventListener("drop", e => {
  e.preventDefault();
  albumZone.classList.remove("drag-over");
  handleAlbumFiles(Array.from(e.dataTransfer.files));
});

document.getElementById("save-album-btn").addEventListener("click", async () => {
  const name = document.getElementById("album-name").value.trim();
  if (!name) return alert("Album name is required!");

  const btn = document.getElementById("save-album-btn");
  btn.textContent = "Uploading...";
  btn.disabled = true;

  try {
    const urls = [];
    for (const file of albumPhotos) {
      const url = await uploadToCloudinary(file);
      urls.push(url);
    }

    await addDoc(collection(db, "albums"), {
      name,
      series: document.getElementById("album-series").value.trim() || null,
      description: document.getElementById("album-desc").value.trim(),
      photos: urls,
      createdAt: serverTimestamp()
    });

    closeAllModals();
    loadAlbums();
  } catch (e) {
    alert("Upload error: " + e.message);
  } finally {
    btn.textContent = "Publish album";
    btn.disabled = false;
  }
});

document.getElementById("cancel-album-btn").addEventListener("click", closeAllModals);
document.getElementById("close-album-modal").addEventListener("click", closeAllModals);

// --- Edit album ---
function openEditAlbum(album, id) {
  currentEditAlbumId = id;
  document.getElementById("edit-album-name").value = album.name || "";
  document.getElementById("edit-album-series").value = album.series || "";

  const list = document.getElementById("edit-photos-list");
  list.innerHTML = "";
  (album.photos || []).forEach((url, i) => {
    const caption = (album.captions || [])[i] || "";
    const item = document.createElement("div");
    item.className = "edit-photo-item";
    item.innerHTML = `
      <img src="${url}" class="edit-photo-thumb" alt="Photo ${i + 1}" />
      <textarea class="edit-caption-input" data-index="${i}" placeholder="Add a caption...">${caption}</textarea>
    `;
    list.appendChild(item);
  });

  openModal("modal-edit-album");
}

document.getElementById("save-edit-btn").addEventListener("click", async () => {
  const btn = document.getElementById("save-edit-btn");
  btn.textContent = "Saving...";
  btn.disabled = true;

  try {
    const captions = Array.from(document.querySelectorAll(".edit-caption-input"))
      .map(el => el.value.trim());

    await updateDoc(doc(db, "albums", currentEditAlbumId), {
      name: document.getElementById("edit-album-name").value.trim(),
      series: document.getElementById("edit-album-series").value.trim() || null,
      captions
    });

    closeAllModals();
    loadAlbums();
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    btn.textContent = "Save changes";
    btn.disabled = false;
  }
});

document.getElementById("cancel-edit-btn").addEventListener("click", closeAllModals);
document.getElementById("close-edit-modal").addEventListener("click", closeAllModals);

// --- Articles ---
async function loadArticles() {
  const list = document.getElementById("articles-admin-list");
  list.innerHTML = `<div class="loading-state"><span class="label">Loading...</span></div>`;

  try {
    const q = query(collection(db, "articles"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = `<div class="loading-state"><span class="label">No articles yet — create one!</span></div>`;
      return;
    }

    list.innerHTML = "";
    snapshot.forEach(docSnap => {
      const a = docSnap.data();
      const date = a.createdAt?.toDate?.()
        ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric" }).format(a.createdAt.toDate())
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
          <button class="admin-action-btn edit">Edit</button>
          <button class="admin-action-btn delete">Delete</button>
        </div>
      `;
      item.querySelector(".edit").addEventListener("click", () => openEditArticle(a, docSnap.id));
      item.querySelector(".delete").addEventListener("click", async () => {
        if (confirm(`Delete article "${a.title}"?`)) {
          await deleteDoc(doc(db, "articles", docSnap.id));
          loadArticles();
        }
      });
      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = `<div class="loading-state"><span class="label">Error: ${e.message}</span></div>`;
    console.error("loadArticles:", e);
  }
}

function initArticleModal(title, content = "", articleCoverUrl = "", id = null) {
  currentArticleId = id;
  coverUrl = articleCoverUrl;
  document.getElementById("article-title").value = title;
  document.getElementById("modal-article-title").textContent = id ? "Edit article" : "New article";
  document.getElementById("save-article-btn").textContent = id ? "Save changes" : "Publish article";
  document.getElementById("cover-preview").innerHTML = articleCoverUrl
    ? `<img src="${articleCoverUrl}" alt="Cover" />`
    : "";

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
              ["twoCol"],
              ["clean"]
            ]
          }
        });
        quill.getModule("toolbar").addHandler("image", () => insertImageInArticle());
        quill.getModule("toolbar").addHandler("twoCol", () => openTwoColModal());
      } catch(e) { console.error("Quill init:", e); }
    }
    if (content) {
      quill.clipboard.dangerouslyPasteHTML(0, content);
    } else {
      quill.setContents([]);
    }
  }, 100);
}

document.getElementById("new-article-btn").addEventListener("click", () => {
  initArticleModal("", "", "", null);
});

function openEditArticle(article, id) {
  initArticleModal(article.title || "", article.content || "", article.cover || "", id);
}

function insertImageInArticle() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const url = await uploadToCloudinary(file);
      const range = quill.getSelection(true);
      quill.insertEmbed(range.index, "image", url);
    } catch(e) {
      alert("Image upload error: " + e.message);
    }
  };
  input.click();
}

// --- Two-column block ---
let twoColRange = null;

function openTwoColModal() {
  twoColImageUrl = "";
  twoColRange = quill ? quill.getSelection(true) : null;
  document.getElementById("twocol-img-preview").innerHTML = "";
  document.getElementById("twocol-text").value = "";
  document.getElementById("twocol-upload-zone").innerHTML = "<p>Click to upload image</p>";
  openModal("modal-twocol");
}

document.getElementById("twocol-upload-zone").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const zone = document.getElementById("twocol-upload-zone");
    zone.innerHTML = "<p>Uploading...</p>";
    try {
      twoColImageUrl = await uploadToCloudinary(file);
      zone.innerHTML = "<p>✓ Image uploaded</p>";
      document.getElementById("twocol-img-preview").innerHTML =
        `<img src="${twoColImageUrl}" style="max-width:100%;max-height:120px;object-fit:cover;filter:grayscale(100%);margin-top:0.5rem;display:block;" />`;
    } catch(e) {
      zone.innerHTML = "<p>Upload error</p>";
      alert("Upload error: " + e.message);
    }
  };
  input.click();
});

document.getElementById("insert-twocol-btn").addEventListener("click", () => {
  if (!quill) return;
  const text = document.getElementById("twocol-text").value.trim();
  if (!twoColImageUrl) return alert("Please upload an image first.");
  const idx = twoColRange ? twoColRange.index : quill.getLength();
  quill.insertEmbed(idx, "twoCol", { img: twoColImageUrl, text: `<p>${text}</p>` });
  quill.setSelection(idx + 1);
  document.getElementById("modal-twocol").classList.remove("open");
});

document.getElementById("cancel-twocol-btn").addEventListener("click", () => {
  document.getElementById("modal-twocol").classList.remove("open");
});
document.getElementById("close-twocol-modal").addEventListener("click", () => {
  document.getElementById("modal-twocol").classList.remove("open");
});

document.getElementById("cover-upload-zone").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      coverUrl = await uploadToCloudinary(file);
      document.getElementById("cover-preview").innerHTML = `<img src="${coverUrl}" alt="Cover" />`;
    } catch(e) {
      alert("Cover upload error: " + e.message);
    }
  };
  input.click();
});

document.getElementById("preview-article-btn").addEventListener("click", () => {
  if (!quill) return;
  const title = document.getElementById("article-title").value.trim() || "Untitled";
  const content = quill.root.innerHTML;
  document.getElementById("article-preview-content").innerHTML = `
    <h1 class="preview-title">${title}</h1>
    ${coverUrl ? `<img src="${coverUrl}" class="preview-cover" alt="Cover" />` : ""}
    <div class="preview-body">${content}</div>
  `;
  openModal("modal-preview");
});

document.getElementById("save-article-btn").addEventListener("click", async () => {
  const title = document.getElementById("article-title").value.trim();
  if (!title) return alert("Article title is required!");
  if (!quill) return alert("Editor not ready.");

  const btn = document.getElementById("save-article-btn");
  btn.textContent = currentArticleId ? "Saving..." : "Publishing...";
  btn.disabled = true;

  try {
    const content = quill.root.innerHTML;
    const excerpt = quill.getText().trim().slice(0, 200);

    if (currentArticleId) {
      await updateDoc(doc(db, "articles", currentArticleId), { title, content, excerpt, cover: coverUrl });
    } else {
      await addDoc(collection(db, "articles"), {
        title, content, excerpt, cover: coverUrl, createdAt: serverTimestamp()
      });
    }

    closeAllModals();
    loadArticles();
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    btn.textContent = "Publish article";
    btn.disabled = false;
  }
});

document.getElementById("cancel-article-btn").addEventListener("click", closeAllModals);
document.getElementById("close-article-modal").addEventListener("click", closeAllModals);
document.getElementById("close-preview-modal").addEventListener("click", () => {
  document.getElementById("modal-preview").classList.remove("open");
});
document.getElementById("back-to-edit-btn").addEventListener("click", () => {
  document.getElementById("modal-preview").classList.remove("open");
});

// --- Modal helpers ---
function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.getElementById("modal-overlay").classList.add("open");
}

function closeAllModals() {
  document.querySelectorAll(".modal").forEach(m => m.classList.remove("open"));
  document.getElementById("modal-overlay").classList.remove("open");
}

document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", e => {
    if (e.target === modal) closeAllModals();
  });
});

document.getElementById("modal-overlay").addEventListener("click", closeAllModals);
