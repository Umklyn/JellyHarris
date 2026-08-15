import { db } from "./firebase-init.js";
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { cldWatermark } from "./cloudinary.js";

let allAlbums = [];
let currentAlbum = null;
let lightboxPhotos = [];
let lightboxCaptions = [];
let lightboxIndex = 0;

async function loadAlbums() {
  const grid = document.getElementById("albums-grid");
  const filtersEl = document.getElementById("gallery-filters");

  try {
    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      grid.innerHTML = `<div class="empty-state"><span class="label">No albums yet</span></div>`;
      return;
    }

    allAlbums = [];
    snapshot.forEach(doc => allAlbums.push({ id: doc.id, ...doc.data() }));
    allAlbums.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

    renderAlbums(allAlbums);
    renderFilters(allAlbums, filtersEl);

    history.replaceState({ view: "grid" }, "", window.location.pathname);

    if (window.location.hash) {
      const id = window.location.hash.replace("#", "");
      const album = allAlbums.find(a => a.id === id);
      if (album) {
        history.pushState({ view: "album", id }, "", `#${id}`);
        openAlbumDetail(album);
      }
    }
  } catch (e) {
    console.error(e);
    grid.innerHTML = `<div class="empty-state"><span class="label">Loading error</span></div>`;
  }
}

function renderAlbums(albums) {
  const grid = document.getElementById("albums-grid");
  grid.innerHTML = "";

  albums.forEach((album, i) => {
    const cover = album.photos?.[0] || "";
    const count = album.photos?.length || 0;
    const index = String(i + 1).padStart(2, "0");

    const card = document.createElement("div");
    card.className = "album-card";
    card.innerHTML = `
      <span class="album-index">${index}</span>
      <img src="${cldWatermark(cover, 800)}" alt="${album.name}" loading="lazy" />
      <div class="album-overlay">
        <h3>${album.name}</h3>
        <span class="album-count">${count} photo${count > 1 ? "s" : ""}</span>
      </div>
    `;
    card.addEventListener("click", () => {
      history.pushState({ view: "album", id: album.id }, "", `#${album.id}`);
      openAlbumDetail(album);
    });
    grid.appendChild(card);
  });
}

function renderFilters(albums, container) {
  const series = [...new Set(albums.map(a => a.series).filter(Boolean))];
  if (!series.length) return;

  series.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.dataset.filter = s;
    btn.textContent = s;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const filtered = s === "all" ? allAlbums : allAlbums.filter(a => a.series === s);
      renderAlbums(filtered);
    });
    container.appendChild(btn);
  });

  document.querySelector('.filter-btn[data-filter="all"]').addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('.filter-btn[data-filter="all"]').classList.add("active");
    renderAlbums(allAlbums);
  });
}

async function openAlbumDetail(album) {
  currentAlbum = album;
  lightboxPhotos = album.photos || [];
  lightboxCaptions = album.captions || [];
  if (!lightboxPhotos.length) return;

  document.querySelector(".albums-grid").style.display = "none";
  document.querySelector(".page-header").style.display = "none";
  document.querySelector(".gallery-filters").style.display = "none";
  document.getElementById("album-detail").style.display = "block";
  document.querySelector("nav").classList.add("scrolled");
  window.scrollTo(0, 0);

  document.getElementById("album-detail-title").textContent = album.name || album.title || "";
  const descEl = document.getElementById("album-detail-desc");
  descEl.textContent = album.description || "";
  descEl.style.display = album.description ? "block" : "none";
  const grid = document.getElementById("photos-grid");
  grid.innerHTML = "";

  lightboxPhotos.forEach((url, i) => {
    const wrap = document.createElement("div");
    wrap.className = "photo-cell";

    const img = document.createElement("img");
    img.src = cldWatermark(url, 800);
    img.alt = album.name;
    img.loading = "lazy";
    img.className = "photo-thumb";
    img.addEventListener("click", () => {
      history.pushState({ view: "lightbox", id: album.id, index: i }, "", `#${album.id}`);
      openLightbox(i);
    });
    wrap.appendChild(img);
    grid.appendChild(wrap);
  });
}

function showGrid() {
  document.getElementById("album-detail").style.display = "none";
  document.querySelector(".albums-grid").style.display = "grid";
  document.querySelector(".page-header").style.display = "flex";
  document.querySelector(".gallery-filters").style.display = "flex";
  document.querySelector("nav").classList.remove("scrolled");
}

document.getElementById("back-to-albums").addEventListener("click", () => history.back());

function setLightboxControls(visible) {
  const display = visible ? "1" : "0";
  const events = visible ? "all" : "none";
  document.getElementById("lightbox-close").style.opacity = display;
  document.getElementById("lightbox-close").style.pointerEvents = events;
  document.getElementById("lightbox-prev").style.opacity = display;
  document.getElementById("lightbox-prev").style.pointerEvents = events;
  document.getElementById("lightbox-next").style.opacity = display;
  document.getElementById("lightbox-next").style.pointerEvents = events;
}

function openLightbox(index) {
  lightboxIndex = index;
  showLightboxPhoto(lightboxIndex);
  document.getElementById("lightbox").classList.add("open");
  document.querySelector("nav").classList.add("scrolled", "lightbox-mode");
  setLightboxControls(true);
  document.body.style.overflow = "hidden";
}

function showLightboxPhoto(index) {
  document.getElementById("lightbox-img").src = cldWatermark(lightboxPhotos[index], 1600);
  const caption = lightboxCaptions[index] || "";
  const info = document.querySelector(".lightbox-info");
  const captionEl = document.getElementById("lightbox-caption");
  captionEl.textContent = caption;
  info.style.display = caption ? "block" : "none";
}

document.getElementById("lightbox-close").addEventListener("click", () => history.back());
document.getElementById("lightbox").addEventListener("click", e => {
  if (e.target === e.currentTarget) history.back();
});

document.getElementById("lightbox-prev").addEventListener("click", () => {
  lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length;
  showLightboxPhoto(lightboxIndex);
});

document.getElementById("lightbox-next").addEventListener("click", () => {
  lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length;
  showLightboxPhoto(lightboxIndex);
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("lightbox").classList.contains("open")) history.back();
  if (e.key === "ArrowRight") { lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length; showLightboxPhoto(lightboxIndex); }
  if (e.key === "ArrowLeft") { lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length; showLightboxPhoto(lightboxIndex); }
});

function closeLightbox() {
  document.getElementById("lightbox").classList.remove("open");
  document.querySelector("nav").classList.remove("lightbox-mode");
  setLightboxControls(false);
  document.body.style.overflow = "";
  if (!document.getElementById("album-detail") || document.getElementById("album-detail").style.display === "none") {
    document.querySelector("nav").classList.remove("scrolled");
  }
}

window.addEventListener("popstate", e => {
  const state = e.state;

  if (!state || state.view === "grid") {
    closeLightbox();
    showGrid();
    return;
  }

  const album = state.id ? allAlbums.find(a => a.id === state.id) : currentAlbum;
  if (!album) return;

  if (state.view === "album") {
    closeLightbox();
    openAlbumDetail(album);
  } else if (state.view === "lightbox") {
    if (currentAlbum?.id !== album.id) openAlbumDetail(album);
    openLightbox(state.index || 0);
  }
});

loadAlbums();
