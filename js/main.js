import { db } from "./firebase-init.js";
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { cldWatermark } from "./cloudinary.js";

async function loadLatestWorks() {
  const grid = document.getElementById("latest-works-grid");
  if (!grid) return;

  try {
    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      grid.innerHTML = `<div class="work-placeholder"></div><div class="work-placeholder"></div>`;
      return;
    }

    const albums = [];
    snapshot.forEach(doc => albums.push({ id: doc.id, ...doc.data() }));
    albums.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

    grid.innerHTML = "";
    albums.slice(0, 2).forEach(album => {
      const cover = album.photos?.[0] || "";
      const card = document.createElement("div");
      card.className = "work-card";
      card.innerHTML = `
        <img src="${cldWatermark(cover, 800)}" alt="${album.name}" loading="lazy" />
        <div class="work-card-overlay">
          <h3>${album.name}</h3>
        </div>
      `;
      card.addEventListener("click", () => {
        window.location.href = `gallery.html#${album.id}`;
      });
      grid.appendChild(card);
    });
  } catch (e) {
    console.error(e);
  }
}

async function loadLatestJournal() {
  const list = document.getElementById("latest-journal-list");
  if (!list) return;

  try {
    const q = query(collection(db, "articles"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = `<p class="journal-empty label">No articles yet</p>`;
      return;
    }

    const articles = [];
    snapshot.forEach(doc => articles.push({ id: doc.id, ...doc.data() }));
    const published = articles.filter(a => a.status !== "draft");
    published.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

    if (!published.length) {
      list.innerHTML = `<p class="journal-empty label">No articles yet</p>`;
      return;
    }

    list.innerHTML = "";
    published.slice(0, 4).forEach(article => {
      const date = article.createdAt?.toDate?.()
        ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric" }).format(article.createdAt.toDate())
        : "";

      const item = document.createElement("a");
      item.className = "journal-item";
      item.href = `blog.html#${article.id}`;
      item.innerHTML = `
        <div class="journal-thumb">
          ${article.cover ? `<img src="${cldWatermark(article.cover, 200)}" alt="" data-color="${!!article.coverColor}" style="object-position:${article.coverPosition || "50% 50%"};" loading="lazy" />` : ""}
        </div>
        <span class="journal-date">${date}</span>
        <span class="journal-title">${article.title}</span>
        <span class="journal-arrow">→</span>
      `;
      list.appendChild(item);
    });
  } catch (e) {
    console.error(e);
  }
}

loadLatestWorks();
loadLatestJournal();
