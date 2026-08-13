import { db } from "./firebase-init.js";
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

async function loadLatestWorks() {
  const grid = document.getElementById("latest-works-grid");
  if (!grid) return;

  try {
    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"), limit(2));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      grid.innerHTML = `<div class="work-placeholder"></div><div class="work-placeholder"></div>`;
      return;
    }

    grid.innerHTML = "";
    snapshot.forEach(doc => {
      const album = doc.data();
      const cover = album.photos?.[0] || "";
      const card = document.createElement("div");
      card.className = "work-card";
      card.innerHTML = `
        <img src="${cover}" alt="${album.name}" loading="lazy" />
        <div class="work-card-overlay">
          <h3>${album.name}</h3>
        </div>
      `;
      card.addEventListener("click", () => {
        window.location.href = `gallery.html#${doc.id}`;
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
    const q = query(collection(db, "articles"), orderBy("createdAt", "desc"), limit(4));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = `<p class="journal-empty label">No articles yet</p>`;
      return;
    }

    list.innerHTML = "";
    snapshot.forEach(doc => {
      const article = doc.data();
      const date = article.createdAt?.toDate?.()
        ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric" }).format(article.createdAt.toDate())
        : "";

      const item = document.createElement("a");
      item.className = "journal-item";
      item.href = `blog.html#${doc.id}`;
      item.innerHTML = `
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
