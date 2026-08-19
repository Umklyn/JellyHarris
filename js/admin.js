import { db } from "./firebase-init.js";
import { auth } from "./firebase-auth-init.js";
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, serverTimestamp, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { cldResize, cldRotate } from "./cloudinary.js";
import { wrapArticleSections } from "./article-sections.js";

const CLOUDINARY_CLOUD = "qjupwxds";
const CLOUDINARY_PRESET = "JellyHarris_uploads";
const ADMIN_EMAIL = "jelisa.harris@gmail.com";

let quill = null;
let currentArticleId = null;
let currentArticleStatus = "draft";
let currentEditAlbumId = null;
let albumPhotos = [];
let coverUrl = "";
let coverColor = false;
let coverPosition = "50% 50%";
let coverRotate = 0;
let twoColImageUrl = "";
let twoColImageColor = false;
let twoColEditEl = null;
let photoGridEditEl = null;

// Builds the inner HTML of a two-col / photo-grid block. Shared by the
// Quill blot (on first insert) and by the "click an existing block to edit
// it" flow, which mutates an existing block's innerHTML directly instead of
// deleting+reinserting at a computed index — index math on embeds is easy
// to get subtly wrong (stale index → duplicated block instead of replaced).
function buildTwoColHTML(value) {
  const imgHtml = `<div class="two-col-img" data-color="${value.color ? 'true' : 'false'}"><img src="${value.img || ''}" alt=""></div>`;
  const textHtml = `<div class="two-col-text">${value.text || ''}</div>`;
  return value.imageRight ? textHtml + imgHtml : imgHtml + textHtml;
}

function buildPhotoGridHTML(cells) {
  return (cells || [])
    .map(c => `<div class="photo-grid-item" data-span="${c.span || 'square'}" data-color="${c.color ? 'true' : 'false'}" data-rotate="${c.rotate || 0}" data-position="${c.position || '50% 50%'}" data-raw-url="${c.url || ''}"><div class="photo-grid-item-inner"><img src="${cldRotate(c.url, c.rotate) || ''}" alt="" style="object-position:${c.position || '50% 50%'};"></div></div>`)
    .join('');
}

// Marker block: "everything after this point gets this background color,
// until the next marker or the end of the article." Rendered as a plain
// dashed strip in the editor — the real colored <section> wrapping only
// happens at display time (see article-sections.js), since a Quill embed
// can't contain other editable blocks.
function buildSectionBreakHTML(value) {
  const color = value.color || '';
  const label = color ? color.toUpperCase() : 'Default background';
  return `<span class="section-break-dot" style="background:${color || 'transparent'}"></span><span>Section — ${label}</span>`;
}

// Register two-col blot for Quill before init
function registerTwoColBlot() {
  const BlockEmbed = Quill.import('blots/block/embed');
  class TwoColBlot extends BlockEmbed {
    static create(value) {
      const node = super.create();
      node.setAttribute('contenteditable', false);
      node.dataset.imageRight = value.imageRight ? 'true' : 'false';
      node.innerHTML = buildTwoColHTML(value);
      return node;
    }
    static value(node) {
      return {
        img: node.querySelector('img')?.src || '',
        text: node.querySelector('.two-col-text')?.innerHTML || '',
        imageRight: node.dataset.imageRight === 'true',
        color: node.querySelector('.two-col-img')?.dataset.color === 'true'
      };
    }
  }
  TwoColBlot.blotName = 'twoCol';
  TwoColBlot.tagName = 'div';
  TwoColBlot.className = 'two-col';
  Quill.register(TwoColBlot);
}
registerTwoColBlot();

// Register photo-grid blot for Quill before init
// Each cell is square by default; a cell can be set to span vertical (2 rows)
// or horizontal (2 columns) to become a rectangle. grid-auto-flow:dense in
// CSS packs the remaining squares around it automatically.
function registerPhotoGridBlot() {
  const BlockEmbed = Quill.import('blots/block/embed');
  class PhotoGridBlot extends BlockEmbed {
    static create(value) {
      const node = super.create();
      node.setAttribute('contenteditable', false);
      node.innerHTML = buildPhotoGridHTML(value.cells);
      return node;
    }
    static value(node) {
      return {
        cells: [...node.querySelectorAll('.photo-grid-item')].map(item => ({
          url: item.dataset.rawUrl || item.querySelector('img')?.src || '',
          span: item.dataset.span || 'square',
          color: item.dataset.color === 'true',
          rotate: parseInt(item.dataset.rotate || '0', 10),
          position: item.dataset.position || '50% 50%'
        }))
      };
    }
  }
  PhotoGridBlot.blotName = 'photoGrid';
  PhotoGridBlot.tagName = 'div';
  PhotoGridBlot.className = 'photo-grid';
  Quill.register(PhotoGridBlot);
}
registerPhotoGridBlot();

// Register section-break blot for Quill before init
function registerSectionBreakBlot() {
  const BlockEmbed = Quill.import('blots/block/embed');
  class SectionBreakBlot extends BlockEmbed {
    static create(value) {
      const node = super.create();
      node.setAttribute('contenteditable', false);
      node.dataset.bg = value.color || '';
      node.innerHTML = buildSectionBreakHTML(value);
      return node;
    }
    static value(node) {
      return { color: node.dataset.bg || '' };
    }
  }
  SectionBreakBlot.blotName = 'section';
  SectionBreakBlot.tagName = 'div';
  SectionBreakBlot.className = 'section-break';
  Quill.register(SectionBreakBlot);
}
registerSectionBreakBlot();

// Extra font choice for the article body — the built-in "font" format
// already handles registering a class (ql-font-bubble) on the selection.
const FontAttributor = Quill.import('attributors/class/font');
FontAttributor.whitelist = ['bubble'];
Quill.register(FontAttributor, true);

// --- Auth ---
onAuthStateChanged(auth, user => {
  if (user && user.email === ADMIN_EMAIL) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("admin-dashboard").style.display = "grid";
    loadAlbums();
    loadArticles();
    loadMessages();
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
let albumsOrderState = [];

async function loadAlbums() {
  const list = document.getElementById("albums-admin-list");
  list.innerHTML = `<div class="loading-state"><span class="label">Loading...</span></div>`;

  try {
    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = `<div class="loading-state"><span class="label">No albums yet — create one!</span></div>`;
      albumsOrderState = [];
      return;
    }

    const albums = [];
    snapshot.forEach(docSnap => albums.push({ id: docSnap.id, ...docSnap.data() }));
    albums.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

    albumsOrderState = albums;
    renderAlbumsAdminList();
  } catch (e) {
    list.innerHTML = `<div class="loading-state"><span class="label">Error: ${e.message}</span></div>`;
    console.error("loadAlbums:", e);
  }
}

function renderAlbumsAdminList() {
  const list = document.getElementById("albums-admin-list");
  list.innerHTML = "";

  albumsOrderState.forEach(a => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.draggable = true;
    item.dataset.id = a.id;
    item.innerHTML = `
      <span class="admin-item-drag" aria-hidden="true" title="Drag to reorder">⠿</span>
      ${a.photos?.[0] ? `<img class="admin-item-thumb" src="${cldResize(a.photos[0], 200)}" alt="${a.name}" />` : `<div class="admin-item-thumb"></div>`}
      <div class="admin-item-info">
        <span class="admin-item-title">${a.name}</span>
        <span class="admin-item-meta">${a.photos?.length || 0} photo(s)${a.series ? ` · ${a.series}` : ""}</span>
      </div>
      <div class="admin-item-actions">
        <button class="admin-action-btn edit" data-id="${a.id}">Edit</button>
        <button class="admin-action-btn delete" data-id="${a.id}">Delete</button>
      </div>
    `;
    item.querySelector(".edit").addEventListener("click", () => openEditAlbum(a, a.id));
    item.querySelector(".delete").addEventListener("click", async () => {
      if (confirm(`Delete album "${a.name}"?`)) {
        await deleteDoc(doc(db, "albums", a.id));
        loadAlbums();
      }
    });

    item.addEventListener("dragstart", () => item.classList.add("dragging"));
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      persistAlbumsOrder();
    });

    list.appendChild(item);
  });
}

function getDragAfterElement(container, y, selector = ".admin-item") {
  const els = [...container.querySelectorAll(`${selector}:not(.dragging)`)];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element;
}

document.getElementById("albums-admin-list").addEventListener("dragover", e => {
  e.preventDefault();
  const list = e.currentTarget;
  const dragging = list.querySelector(".dragging");
  if (!dragging) return;
  const after = getDragAfterElement(list, e.clientY);
  if (after == null) list.appendChild(dragging);
  else list.insertBefore(dragging, after);
});

async function persistAlbumsOrder() {
  const list = document.getElementById("albums-admin-list");
  const ids = [...list.querySelectorAll(".admin-item")].map(el => el.dataset.id);
  albumsOrderState = ids.map(id => albumsOrderState.find(a => a.id === id));
  try {
    await Promise.all(ids.map((id, index) => updateDoc(doc(db, "albums", id), { order: index })));
  } catch (e) {
    console.error("persistAlbumsOrder:", e);
    alert("Couldn't save the new order: " + e.message);
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
function createEditPhotoItem(url, caption) {
  const item = document.createElement("div");
  item.className = "edit-photo-item";
  item.draggable = true;
  item.dataset.url = url;
  item.innerHTML = `
    <span class="edit-photo-drag" aria-hidden="true" title="Drag to reorder">⠿</span>
    <img src="${cldResize(url, 300)}" class="edit-photo-thumb" alt="" />
    <textarea class="edit-caption-input" placeholder="Add a caption...">${caption || ""}</textarea>
    <button type="button" class="edit-photo-remove" title="Remove photo">✕</button>
  `;
  item.querySelector(".edit-photo-remove").addEventListener("click", () => item.remove());
  item.addEventListener("dragstart", () => item.classList.add("dragging"));
  item.addEventListener("dragend", () => item.classList.remove("dragging"));
  return item;
}

function openEditAlbum(album, id) {
  currentEditAlbumId = id;
  document.getElementById("edit-album-name").value = album.name || "";
  document.getElementById("edit-album-series").value = album.series || "";
  document.getElementById("edit-album-desc").value = album.description || "";

  const list = document.getElementById("edit-photos-list");
  list.innerHTML = "";
  (album.photos || []).forEach((url, i) => {
    list.appendChild(createEditPhotoItem(url, (album.captions || [])[i]));
  });

  openModal("modal-edit-album");
}

async function handleEditAlbumFiles(files) {
  const list = document.getElementById("edit-photos-list");
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const item = createEditPhotoItem(URL.createObjectURL(file), "");
    item.classList.add("uploading");
    list.appendChild(item);
    try {
      const url = await uploadToCloudinary(file);
      item.dataset.url = url;
      item.classList.remove("uploading");
    } catch (err) {
      item.remove();
      alert("Upload error: " + err.message);
    }
  }
}

const editAlbumZone = document.getElementById("edit-album-upload-zone");
editAlbumZone.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.onchange = e => handleEditAlbumFiles(Array.from(e.target.files));
  input.click();
});
editAlbumZone.addEventListener("dragover", e => { e.preventDefault(); editAlbumZone.classList.add("drag-over"); });
editAlbumZone.addEventListener("dragleave", () => editAlbumZone.classList.remove("drag-over"));
editAlbumZone.addEventListener("drop", e => {
  e.preventDefault();
  editAlbumZone.classList.remove("drag-over");
  handleEditAlbumFiles(Array.from(e.dataTransfer.files));
});

function getPhotoDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".edit-photo-item:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element;
}

document.getElementById("edit-photos-list").addEventListener("dragover", e => {
  e.preventDefault();
  const list = e.currentTarget;
  const dragging = list.querySelector(".dragging");
  if (!dragging) return;
  const after = getPhotoDragAfterElement(list, e.clientY);
  if (after == null) list.appendChild(dragging);
  else list.insertBefore(dragging, after);
});

document.getElementById("save-edit-btn").addEventListener("click", async () => {
  if (document.querySelector("#edit-photos-list .edit-photo-item.uploading")) {
    return alert("Please wait for all photos to finish uploading first.");
  }

  const btn = document.getElementById("save-edit-btn");
  btn.textContent = "Saving...";
  btn.disabled = true;

  try {
    const items = [...document.querySelectorAll("#edit-photos-list .edit-photo-item")];
    const photos = items.map(item => item.dataset.url);
    const captions = items.map(item => item.querySelector(".edit-caption-input").value.trim());

    await updateDoc(doc(db, "albums", currentEditAlbumId), {
      name: document.getElementById("edit-album-name").value.trim(),
      series: document.getElementById("edit-album-series").value.trim() || null,
      description: document.getElementById("edit-album-desc").value.trim(),
      photos,
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
let articlesOrderState = [];

async function loadArticles() {
  const list = document.getElementById("articles-admin-list");
  list.innerHTML = `<div class="loading-state"><span class="label">Loading...</span></div>`;

  try {
    const q = query(collection(db, "articles"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = `<div class="loading-state"><span class="label">No articles yet — create one!</span></div>`;
      articlesOrderState = [];
      return;
    }

    const articles = [];
    snapshot.forEach(docSnap => articles.push({ id: docSnap.id, ...docSnap.data() }));
    articles.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

    articlesOrderState = articles;
    renderArticlesAdminList();
  } catch (e) {
    list.innerHTML = `<div class="loading-state"><span class="label">Error: ${e.message}</span></div>`;
    console.error("loadArticles:", e);
  }
}

function renderArticlesAdminList() {
  const list = document.getElementById("articles-admin-list");
  list.innerHTML = "";

  articlesOrderState.forEach(a => {
    const date = a.createdAt?.toDate?.()
      ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric" }).format(a.createdAt.toDate())
      : "";
    const item = document.createElement("div");
    item.className = "admin-item";
    item.draggable = true;
    item.dataset.id = a.id;
    item.innerHTML = `
      <span class="admin-item-drag" aria-hidden="true" title="Drag to reorder">⠿</span>
      ${a.cover ? `<img class="admin-item-thumb" src="${cldResize(a.cover, 200)}" alt="${a.title}" />` : `<div class="admin-item-thumb"></div>`}
      <div class="admin-item-info">
        <span class="admin-item-title">${a.title}${a.status === "draft" ? ` <span class="draft-badge">Draft</span>` : ""}</span>
        <span class="admin-item-meta">${date}</span>
      </div>
      <div class="admin-item-actions">
        <button class="admin-action-btn preview">Preview</button>
        ${a.status === "draft" ? `<button class="admin-action-btn publish">Publish</button>` : ""}
        <button class="admin-action-btn edit">Edit</button>
        <button class="admin-action-btn delete">Delete</button>
      </div>
    `;
    item.querySelector(".preview").addEventListener("click", () => {
      renderArticlePreview(a.title, a.content, a.cover, a.coverColor, a.coverPosition, a.coverRotate);
    });
    if (a.status === "draft") {
      item.querySelector(".publish").addEventListener("click", async e => {
        e.target.textContent = "Publishing...";
        e.target.disabled = true;
        await updateDoc(doc(db, "articles", a.id), { status: "published" });
        loadArticles();
      });
    }
    item.querySelector(".edit").addEventListener("click", () => openEditArticle(a, a.id));
    item.querySelector(".delete").addEventListener("click", async () => {
      if (confirm(`Delete article "${a.title}"?`)) {
        await deleteDoc(doc(db, "articles", a.id));
        loadArticles();
      }
    });

    item.addEventListener("dragstart", () => item.classList.add("dragging"));
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      persistArticlesOrder();
    });

    list.appendChild(item);
  });
}

document.getElementById("articles-admin-list").addEventListener("dragover", e => {
  e.preventDefault();
  const list = e.currentTarget;
  const dragging = list.querySelector(".dragging");
  if (!dragging) return;
  const after = getDragAfterElement(list, e.clientY);
  if (after == null) list.appendChild(dragging);
  else list.insertBefore(dragging, after);
});

async function persistArticlesOrder() {
  const list = document.getElementById("articles-admin-list");
  const ids = [...list.querySelectorAll(".admin-item")].map(el => el.dataset.id);
  articlesOrderState = ids.map(id => articlesOrderState.find(a => a.id === id));
  try {
    await Promise.all(ids.map((id, index) => updateDoc(doc(db, "articles", id), { order: index })));
  } catch (e) {
    console.error("persistArticlesOrder:", e);
    alert("Couldn't save the new order: " + e.message);
  }
}

// Wires a Black&white/Color button pair. Calls onChange(true|false) on click.
function setupColorToggle(container, initialColor, onChange) {
  const buttons = container.querySelectorAll("button");
  buttons.forEach(btn => {
    btn.classList.toggle("active", (btn.dataset.color === "true") === initialColor);
    btn.onclick = () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(btn.dataset.color === "true");
    };
  });
}

// Click on a preview image to choose which part of it stays visible once
// object-fit:cover crops it (banner cover, photo-grid cells). Position is
// stored as a plain CSS object-position value ("X% Y%").
function makeFocalPointPickable(imgEl, initialPosition, onPick) {
  imgEl.style.objectPosition = initialPosition;
  imgEl.style.cursor = "crosshair";
  imgEl.title = "Click to choose what stays visible when cropped";
  imgEl.addEventListener("click", e => {
    const rect = imgEl.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    const position = `${x}% ${y}%`;
    imgEl.style.objectPosition = position;
    onPick(position);
  });
}

function renderCoverPreview() {
  const preview = document.getElementById("cover-preview");
  preview.innerHTML = coverUrl
    ? `<img src="${cldRotate(coverUrl, coverRotate)}" alt="Cover" data-color="${coverColor}" />`
    : "";
  const coverImg = preview.querySelector("img");
  if (coverImg) makeFocalPointPickable(coverImg, coverPosition, pos => { coverPosition = pos; });
  document.getElementById("cover-position-hint").style.display = coverImg ? "" : "none";
}

function initArticleModal(title, content = "", articleCoverUrl = "", id = null, status = "draft", initialCoverColor = false, initialCoverPosition = "50% 50%", initialCoverRotate = 0) {
  currentArticleId = id;
  currentArticleStatus = status;
  coverUrl = articleCoverUrl;
  coverColor = initialCoverColor;
  coverPosition = initialCoverPosition;
  coverRotate = initialCoverRotate;
  document.getElementById("article-title").value = title;
  document.getElementById("modal-article-title").textContent = id ? "Edit article" : "New article";
  document.getElementById("save-article-btn").textContent =
    status === "published" ? "Save changes" : "Publish article";
  renderCoverPreview();
  setupColorToggle(document.getElementById("cover-color-toggle"), coverColor, color => {
    coverColor = color;
    const img = document.querySelector("#cover-preview img");
    if (img) img.dataset.color = color;
  });

  openModal("modal-article");

  setTimeout(() => {
    if (!quill) {
      try {
        quill = new Quill("#quill-editor", {
          theme: "snow",
          modules: {
            toolbar: [
              [{ header: [1, 2, 3, false] }],
              [{ font: [false, "bubble"] }],
              ["bold", "italic", "underline"],
              [{ align: [false, "center", "right"] }],
              ["blockquote"],
              [{ list: "ordered" }, { list: "bullet" }],
              ["link", "image"],
              ["twoCol", "photoGrid", "section"],
              ["clean"]
            ]
          }
        });
        quill.getModule("toolbar").addHandler("image", () => insertImageInArticle());
        quill.getModule("toolbar").addHandler("twoCol", () => openTwoColModal());
        quill.getModule("toolbar").addHandler("photoGrid", () => openPhotoGridModal());
        quill.getModule("toolbar").addHandler("section", () => openSectionModal());
        // Click an inserted two-col, photo-grid or section-break block to edit it in place.
        quill.root.addEventListener("click", e => {
          const gridEl = e.target.closest(".photo-grid");
          if (gridEl) return openPhotoGridModal(gridEl);
          const twoColEl = e.target.closest(".two-col");
          if (twoColEl) return openTwoColModal(twoColEl);
          const sectionEl = e.target.closest(".section-break");
          if (sectionEl) return openSectionModal(sectionEl);
        });
      } catch(e) { console.error("Quill init:", e); }
    }
    quill.setContents([]);
    if (content) {
      quill.clipboard.dangerouslyPasteHTML(0, content);
    }
  }, 100);
}

document.getElementById("new-article-btn").addEventListener("click", () => {
  initArticleModal("", "", "", null, "draft");
});

function openEditArticle(article, id) {
  initArticleModal(article.title || "", article.content || "", article.cover || "", id, article.status || "published", !!article.coverColor, article.coverPosition || "50% 50%", article.coverRotate || 0);
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

function openTwoColModal(existingEl) {
  const posBtns = document.querySelectorAll(".twocol-pos-btn");
  const deleteBtn = document.getElementById("delete-twocol-btn");

  if (existingEl) {
    twoColEditEl = existingEl;
    twoColImageUrl = existingEl.querySelector("img")?.src || "";
    twoColImageColor = existingEl.querySelector(".two-col-img")?.dataset.color === "true";
    const imageRight = existingEl.dataset.imageRight === "true";
    document.getElementById("twocol-text").value = existingEl.querySelector(".two-col-text")?.textContent.trim() || "";
    document.getElementById("twocol-upload-zone").innerHTML = "<p>✓ Image uploaded — click to replace</p>";
    document.getElementById("twocol-img-preview").innerHTML =
      `<img src="${twoColImageUrl}" data-color="${twoColImageColor}" />`;
    posBtns.forEach(b => b.classList.toggle("active", (b.dataset.pos === "right") === imageRight));
    document.getElementById("twocol-text-label").textContent = imageRight ? "Text (left side)" : "Text (right side)";
    deleteBtn.style.display = "";
  } else {
    twoColEditEl = null;
    twoColImageUrl = "";
    twoColImageColor = false;
    twoColRange = quill ? quill.getSelection(true) : null;
    document.getElementById("twocol-img-preview").innerHTML = "";
    document.getElementById("twocol-text").value = "";
    document.getElementById("twocol-upload-zone").innerHTML = "<p>Click to upload image</p>";
    posBtns.forEach(b => b.classList.toggle("active", b.dataset.pos === "left"));
    document.getElementById("twocol-text-label").textContent = "Text (right side)";
    deleteBtn.style.display = "none";
  }

  setupColorToggle(document.getElementById("twocol-color-toggle"), twoColImageColor, color => {
    twoColImageColor = color;
    const img = document.querySelector("#twocol-img-preview img");
    if (img) img.dataset.color = color;
  });
  openModal("modal-twocol");
}

document.querySelectorAll(".twocol-pos-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".twocol-pos-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const isRight = btn.dataset.pos === "right";
    document.getElementById("twocol-text-label").textContent = isRight ? "Text (left side)" : "Text (right side)";
  });
});

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
        `<img src="${twoColImageUrl}" data-color="${twoColImageColor}" />`;
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
  const imageRight = document.querySelector(".twocol-pos-btn.active")?.dataset.pos === "right";
  const value = { img: twoColImageUrl, text: `<p>${text}</p>`, imageRight, color: twoColImageColor };
  if (twoColEditEl) {
    twoColEditEl.dataset.imageRight = imageRight ? "true" : "false";
    twoColEditEl.innerHTML = buildTwoColHTML(value);
    quill.update();
  } else {
    const idx = twoColRange ? twoColRange.index : quill.getLength();
    quill.insertEmbed(idx, "twoCol", value);
    quill.setSelection(idx + 1);
  }
  document.getElementById("modal-twocol").classList.remove("open");
});

document.getElementById("delete-twocol-btn").addEventListener("click", () => {
  if (!quill || !twoColEditEl) return;
  twoColEditEl.remove();
  quill.update();
  document.getElementById("modal-twocol").classList.remove("open");
});

document.getElementById("cancel-twocol-btn").addEventListener("click", () => {
  document.getElementById("modal-twocol").classList.remove("open");
});
document.getElementById("close-twocol-modal").addEventListener("click", () => {
  document.getElementById("modal-twocol").classList.remove("open");
});

// --- Photo grid block ---
// Each cell is square by default. The admin can switch a cell to vertical
// (spans 2 rows) or horizontal (spans 2 columns) to make it a rectangle;
// grid-auto-flow:dense in CSS packs the other squares around it.
let photoGridRange = null;
let photoGridCells = [];

function openPhotoGridModal(existingEl) {
  const deleteBtn = document.getElementById("delete-photogrid-btn");
  if (existingEl) {
    photoGridEditEl = existingEl;
    photoGridCells = [...existingEl.querySelectorAll(".photo-grid-item")].map(item => ({
      url: item.dataset.rawUrl || item.querySelector("img")?.src || "",
      span: item.dataset.span || "square",
      color: item.dataset.color === "true",
      rotate: parseInt(item.dataset.rotate || "0", 10),
      position: item.dataset.position || "50% 50%"
    }));
    deleteBtn.style.display = "";
  } else {
    photoGridEditEl = null;
    photoGridRange = quill ? quill.getSelection(true) : null;
    photoGridCells = [{ url: "", span: "square", color: false, rotate: 0 }];
    deleteBtn.style.display = "none";
  }
  renderPhotoGridCells();
  openModal("modal-photogrid");
}

function createPhotoGridCell(cell) {
  const wrap = document.createElement("div");
  wrap.className = "photogrid-cell";
  wrap.draggable = true;
  wrap._cell = cell;

  wrap.addEventListener("dragstart", () => wrap.classList.add("dragging"));
  wrap.addEventListener("dragend", () => {
    wrap.classList.remove("dragging");
    const container = document.getElementById("photogrid-slots");
    photoGridCells = [...container.children].map(el => el._cell);
  });

  const slot = document.createElement("div");
  slot.className = "upload-zone upload-zone-sm photogrid-slot";

  function openFilePicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      slot.innerHTML = "<p>Uploading...</p>";
      try {
        cell.url = await uploadToCloudinary(file);
        cell.position = "50% 50%";
        renderSlot();
      } catch (err) {
        slot.innerHTML = "<p>Upload error</p>";
        alert("Upload error: " + err.message);
      }
    };
    input.click();
  }

  function renderSlot() {
    if (!cell.url) {
      slot.innerHTML = "<p>Click to upload</p>";
      slot.onclick = openFilePicker;
      return;
    }
    slot.onclick = null;
    slot.innerHTML = `<img src="${cell.url}" data-color="${!!cell.color}" style="transform:rotate(${cell.rotate || 0}deg);" /><button type="button" class="photogrid-slot-replace" title="Replace photo">↻</button>`;
    makeFocalPointPickable(slot.querySelector("img"), cell.position || "50% 50%", pos => { cell.position = pos; });
    slot.querySelector(".photogrid-slot-replace").addEventListener("click", e => {
      e.stopPropagation();
      openFilePicker();
    });
  }
  renderSlot();

  const toggles = document.createElement("div");
  toggles.className = "photogrid-cell-toggles";

  const spanToggle = document.createElement("div");
  spanToggle.className = "photogrid-span-toggle";
  spanToggle.innerHTML = `
    <button type="button" data-span="square" class="${cell.span === "square" ? "active" : ""}">Square</button>
    <button type="button" data-span="vertical" class="${cell.span === "vertical" ? "active" : ""}">Vertical</button>
    <button type="button" data-span="horizontal" class="${cell.span === "horizontal" ? "active" : ""}">Horizontal</button>
  `;
  spanToggle.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      spanToggle.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      cell.span = btn.dataset.span;
    });
  });

  const colorToggle = document.createElement("div");
  colorToggle.className = "photogrid-color-toggle";
  colorToggle.innerHTML = `
    <button type="button" data-color="false" class="${!cell.color ? "active" : ""}">Black &amp; white</button>
    <button type="button" data-color="true" class="${cell.color ? "active" : ""}">Color</button>
  `;
  setupColorToggle(colorToggle, !!cell.color, color => {
    cell.color = color;
    const img = slot.querySelector("img");
    if (img) img.dataset.color = color;
  });

  const rotateBtn = document.createElement("button");
  rotateBtn.type = "button";
  rotateBtn.className = "photogrid-rotate-btn";
  rotateBtn.title = "Rotate photo 90°";
  rotateBtn.textContent = "⟳ Rotate";
  rotateBtn.addEventListener("click", () => {
    cell.rotate = ((cell.rotate || 0) + 90) % 360;
    const img = slot.querySelector("img");
    if (img) img.style.transform = `rotate(${cell.rotate}deg)`;
  });

  toggles.appendChild(spanToggle);
  toggles.appendChild(colorToggle);
  toggles.appendChild(rotateBtn);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "photogrid-cell-remove";
  removeBtn.textContent = "✕ Remove photo";
  removeBtn.addEventListener("click", () => {
    photoGridCells = photoGridCells.filter(c => c !== cell);
    renderPhotoGridCells();
  });

  wrap.appendChild(slot);
  wrap.appendChild(toggles);
  wrap.appendChild(removeBtn);
  return wrap;
}

function renderPhotoGridCells() {
  const wrap = document.getElementById("photogrid-slots");
  wrap.innerHTML = "";
  photoGridCells.forEach(cell => wrap.appendChild(createPhotoGridCell(cell)));
}

document.getElementById("photogrid-slots").addEventListener("dragover", e => {
  e.preventDefault();
  const list = e.currentTarget;
  const dragging = list.querySelector(".dragging");
  if (!dragging) return;
  const after = getDragAfterElement(list, e.clientY, ".photogrid-cell");
  if (after == null) list.appendChild(dragging);
  else list.insertBefore(dragging, after);
});

document.getElementById("add-photogrid-slot-btn").addEventListener("click", () => {
  photoGridCells.push({ url: "", span: "square", color: false, rotate: 0 });
  renderPhotoGridCells();
});

document.getElementById("insert-photogrid-btn").addEventListener("click", () => {
  if (!quill) return;
  if (!photoGridCells.length) return alert("Add at least one photo.");
  if (photoGridCells.some(c => !c.url)) return alert("Please upload all photos first.");
  if (photoGridEditEl) {
    photoGridEditEl.innerHTML = buildPhotoGridHTML(photoGridCells);
    quill.update();
  } else {
    const idx = photoGridRange ? photoGridRange.index : quill.getLength();
    quill.insertEmbed(idx, "photoGrid", { cells: photoGridCells });
    quill.setSelection(idx + 1);
  }
  document.getElementById("modal-photogrid").classList.remove("open");
});

document.getElementById("delete-photogrid-btn").addEventListener("click", () => {
  if (!quill || !photoGridEditEl) return;
  photoGridEditEl.remove();
  quill.update();
  document.getElementById("modal-photogrid").classList.remove("open");
});

document.getElementById("cancel-photogrid-btn").addEventListener("click", () => {
  document.getElementById("modal-photogrid").classList.remove("open");
});
document.getElementById("close-photogrid-modal").addEventListener("click", () => {
  document.getElementById("modal-photogrid").classList.remove("open");
});

// --- Section background block ---
let sectionRange = null;
let sectionEditEl = null;
let sectionColor = "";

function openSectionModal(existingEl) {
  const deleteBtn = document.getElementById("delete-section-btn");
  if (existingEl) {
    sectionEditEl = existingEl;
    sectionColor = existingEl.dataset.bg || "";
    sectionRange = null;
    deleteBtn.style.display = "";
  } else {
    sectionEditEl = null;
    sectionColor = "";
    sectionRange = quill ? quill.getSelection(true) : null;
    deleteBtn.style.display = "none";
  }
  document.querySelectorAll(".section-swatch").forEach(b => {
    b.classList.toggle("active", b.dataset.color === sectionColor);
  });
  document.getElementById("section-custom-color").value = sectionColor || "#F4F3F1";
  openModal("modal-section");
}

document.querySelectorAll(".section-swatch").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".section-swatch").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    sectionColor = btn.dataset.color;
    document.getElementById("section-custom-color").value = sectionColor || "#F4F3F1";
  });
});

document.getElementById("section-custom-color").addEventListener("input", e => {
  sectionColor = e.target.value;
  document.querySelectorAll(".section-swatch").forEach(b => b.classList.remove("active"));
});

document.getElementById("insert-section-btn").addEventListener("click", () => {
  if (!quill) return;
  const value = { color: sectionColor };
  if (sectionEditEl) {
    sectionEditEl.dataset.bg = sectionColor;
    sectionEditEl.innerHTML = buildSectionBreakHTML(value);
    quill.update();
  } else {
    const idx = sectionRange ? sectionRange.index : quill.getLength();
    quill.insertEmbed(idx, "section", value);
    quill.setSelection(idx + 1);
  }
  document.getElementById("modal-section").classList.remove("open");
});

document.getElementById("delete-section-btn").addEventListener("click", () => {
  if (!quill || !sectionEditEl) return;
  sectionEditEl.remove();
  quill.update();
  document.getElementById("modal-section").classList.remove("open");
});

document.getElementById("cancel-section-btn").addEventListener("click", () => {
  document.getElementById("modal-section").classList.remove("open");
});
document.getElementById("close-section-modal").addEventListener("click", () => {
  document.getElementById("modal-section").classList.remove("open");
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
      coverPosition = "50% 50%";
      coverRotate = 0;
      renderCoverPreview();
    } catch(e) {
      alert("Cover upload error: " + e.message);
    }
  };
  input.click();
});

document.getElementById("cover-rotate-btn").addEventListener("click", () => {
  if (!coverUrl) return;
  coverRotate = (coverRotate + 90) % 360;
  renderCoverPreview();
});

function renderArticlePreview(title, content, cover, coverIsColor, coverPos, coverRot) {
  const preview = document.getElementById("article-preview-content");
  preview.innerHTML = `
    <h1 class="preview-title">${title || "Untitled"}</h1>
    ${cover ? `<img src="${cldRotate(cover, coverRot)}" class="preview-cover" alt="Cover" data-color="${coverIsColor}" style="object-position:${coverPos || "50% 50%"};" />` : ""}
    <div class="preview-body">${wrapArticleSections(content) || ""}</div>
  `;
  openModal("modal-preview");
}

document.getElementById("preview-article-btn").addEventListener("click", () => {
  if (!quill) return;
  const title = document.getElementById("article-title").value.trim();
  renderArticlePreview(title, quill.root.innerHTML, coverUrl, coverColor, coverPosition, coverRotate);
});

async function saveArticleAs(status, btn, savingLabel) {
  const title = document.getElementById("article-title").value.trim();
  if (!title) return alert("Article title is required!");
  if (!quill) return alert("Editor not ready.");

  const originalLabel = btn.textContent;
  btn.textContent = savingLabel;
  btn.disabled = true;

  try {
    const content = quill.root.innerHTML;
    const excerpt = quill.getText().trim().slice(0, 200);

    if (currentArticleId) {
      await updateDoc(doc(db, "articles", currentArticleId), { title, content, excerpt, cover: coverUrl, coverColor, coverPosition, coverRotate, status });
    } else {
      await addDoc(collection(db, "articles"), {
        title, content, excerpt, cover: coverUrl, coverColor, coverPosition, coverRotate, status, createdAt: serverTimestamp()
      });
    }

    closeAllModals();
    loadArticles();
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    btn.textContent = originalLabel;
    btn.disabled = false;
  }
}

document.getElementById("save-article-btn").addEventListener("click", () => {
  const btn = document.getElementById("save-article-btn");
  saveArticleAs("published", btn, currentArticleId ? "Saving..." : "Publishing...");
});

document.getElementById("save-draft-btn").addEventListener("click", () => {
  const btn = document.getElementById("save-draft-btn");
  saveArticleAs("draft", btn, "Saving draft...");
});

document.getElementById("cancel-article-btn").addEventListener("click", closeAllModals);
document.getElementById("close-article-modal").addEventListener("click", closeAllModals);
document.getElementById("close-preview-modal").addEventListener("click", () => {
  document.getElementById("modal-preview").classList.remove("open");
});
document.getElementById("back-to-edit-btn").addEventListener("click", () => {
  document.getElementById("modal-preview").classList.remove("open");
});

// --- Messages ---
async function loadMessages() {
  const list = document.getElementById("messages-admin-list");
  list.innerHTML = `<div class="loading-state"><span class="label">Loading...</span></div>`;

  try {
    const q = query(collection(db, "messages"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    // Badge de notification
    const unreadCount = snapshot.docs.filter(d => !d.data().read).length;
    const badge = document.getElementById("msg-badge");
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }

    if (snapshot.empty) {
      list.innerHTML = `<div class="loading-state"><span class="label">No messages yet.</span></div>`;
      return;
    }

    list.innerHTML = "";
    snapshot.forEach(docSnap => {
      const m = docSnap.data();
      const date = m.createdAt?.toDate?.()
        ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(m.createdAt.toDate())
        : "";

      const item = document.createElement("div");
      item.className = `message-item${m.read ? " read" : ""}`;
      item.innerHTML = `
        <div class="message-header">
          <div class="message-meta">
            <span class="message-sender">${m.name || "Unknown"}</span>
            <span class="message-email">${m.email || ""}</span>
          </div>
          <div class="message-header-right">
            <span class="message-date">${date}</span>
            <span class="message-toggle">▾</span>
          </div>
        </div>
        <div class="message-subject">${m.subject || "(no subject)"}</div>
        <div class="message-body">${m.message || ""}</div>
        <div class="message-actions">
          <a class="admin-action-btn reply-btn" href="mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject || '')}&body=${encodeURIComponent('\n\n---\n' + (m.message || ''))}">Reply by email</a>
          <button class="admin-action-btn delete" data-id="${docSnap.id}">Delete</button>
        </div>
      `;

      // Click sur le header pour déplier/replier
      const header = item.querySelector(".message-header");
      const toggle = item.querySelector(".message-toggle");
      header.addEventListener("click", async () => {
        const isOpen = item.classList.toggle("expanded");
        toggle.textContent = isOpen ? "▴" : "▾";
        if (isOpen && !item.classList.contains("read")) {
          item.classList.add("read");
          await updateDoc(doc(db, "messages", docSnap.id), { read: true });
          // Met à jour le badge
          const currentBadge = parseInt(badge.textContent) - 1;
          if (currentBadge <= 0) badge.style.display = "none";
          else badge.textContent = currentBadge;
        }
      });

      item.querySelector(".delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm("Delete this message?")) {
          await deleteDoc(doc(db, "messages", docSnap.id));
          loadMessages();
        }
      });

      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = `<div class="loading-state"><span class="label">Error: ${e.message}</span></div>`;
  }
}

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
