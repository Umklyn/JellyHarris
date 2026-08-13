import { db } from "./firebase-init.js";
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allAlbums = [];
let lightboxPhotos = [];
let lightboxIndex = 0;

async function loadAlbums() {
  const grid = document.getElementById("albums-grid");
  const filtersEl = document.getElementById("gallery-filters");

  try {
    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      grid.innerHTML = `<div class="empty-state"><span class="label">Aucun album pour le moment</span></div>`;
      return;
    }

    allAlbums = [];
    snapshot.forEach(doc => allAlbums.push({ id: doc.id, ...doc.data() }));

    renderAlbums(allAlbums);
    renderFilters(allAlbums, filtersEl);

    if (window.location.hash) {
      const id = window.location.hash.replace("#", "");
      const album = allAlbums.find(a => a.id === id);
      if (album) openAlbumLightbox(album);
    }
  } catch (e) {
    console.error(e);
    grid.innerHTML = `<div class="empty-state"><span class="label">Erreur de chargement</span></div>`;
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
      <img src="${cover}" alt="${album.name}" loading="lazy" />
      <div class="album-overlay">
        <h3>${album.name}</h3>
        <span class="album-count">${count} photo${count > 1 ? "s" : ""}</span>
      </div>
    `;
    card.addEventListener("click", () => openAlbumDetail(album));
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
  lightboxPhotos = album.photos || [];
  if (!lightboxPhotos.length) return;

  document.querySelector(".albums-grid").style.display = "none";
  document.querySelector(".page-header").style.display = "none";
  document.querySelector(".gallery-filters").style.display = "none";
  document.getElementById("album-detail").style.display = "block";
  document.querySelector("nav").classList.add("scrolled");
  window.scrollTo(0, 0);

  document.getElementById("album-detail-title").textContent = album.name || album.title || "";
  const grid = document.getElementById("photos-grid");
  grid.innerHTML = "";

  const COLS = window.innerWidth < 480 ? 1 : window.innerWidth < 900 ? 2 : 3;

  // Précharge toutes les images pour connaître les ratios
  const loaded = await Promise.all(lightboxPhotos.map((url, i) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ url, i, ratio: img.naturalHeight / img.naturalWidth });
    img.onerror = () => resolve({ url, i, ratio: 1 });
    img.src = url;
  })));

  // Crée les colonnes
  const columns = Array.from({ length: COLS }, () => {
    const col = document.createElement("div");
    col.className = "masonry-col";
    grid.appendChild(col);
    return col;
  });
  const colHeights = new Array(COLS).fill(0);

  // Place chaque photo dans la colonne la plus courte
  loaded.forEach(({ url, i, ratio }) => {
    const minIdx = colHeights.indexOf(Math.min(...colHeights));
    colHeights[minIdx] += ratio;

    const wrap = document.createElement("div");
    wrap.style.overflow = "hidden";

    const img = document.createElement("img");
    img.src = url;
    img.alt = album.name;
    img.loading = "lazy";
    img.className = "photo-thumb";
    img.addEventListener("click", () => openLightbox(i));
    wrap.appendChild(img);
    columns[minIdx].appendChild(wrap);
  });
}

document.getElementById("back-to-albums").addEventListener("click", () => {
  document.getElementById("album-detail").style.display = "none";
  document.querySelector(".albums-grid").style.display = "grid";
  document.querySelector(".page-header").style.display = "flex";
  document.querySelector(".gallery-filters").style.display = "flex";
  document.querySelector("nav").classList.remove("scrolled");
});

function openLightbox(index) {
  lightboxIndex = index;
  showLightboxPhoto(lightboxIndex);
  document.getElementById("lightbox").classList.add("open");
  document.querySelector("nav").classList.add("scrolled", "lightbox-mode");
  document.body.style.overflow = "hidden";
}

function showLightboxPhoto(index, seriesName) {
  const img = document.getElementById("lightbox-img");
  const series = document.getElementById("lightbox-series");
  img.src = lightboxPhotos[index];
  if (seriesName) series.textContent = seriesName;
}

document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
document.getElementById("lightbox").addEventListener("click", e => {
  if (e.target === e.currentTarget) closeLightbox();
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
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowRight") { lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length; showLightboxPhoto(lightboxIndex); }
  if (e.key === "ArrowLeft") { lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length; showLightboxPhoto(lightboxIndex); }
});

function closeLightbox() {
  document.getElementById("lightbox").classList.remove("open");
  document.querySelector("nav").classList.remove("lightbox-mode");
  document.body.style.overflow = "";
  if (!document.getElementById("album-detail") || document.getElementById("album-detail").style.display === "none") {
    document.querySelector("nav").classList.remove("scrolled");
  }
}

loadAlbums();
