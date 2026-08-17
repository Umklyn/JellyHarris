import { db } from "./firebase-init.js";
import { collection, query, orderBy, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { cldWatermark } from "./cloudinary.js";

async function loadArticles() {
  const list = document.getElementById("articles-list");

  try {
    const q = query(collection(db, "articles"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = `<div class="empty-state"><span class="label">No articles yet</span></div>`;
      return;
    }

    const articles = [];
    snapshot.forEach(docSnap => articles.push({ id: docSnap.id, ...docSnap.data() }));
    const published = articles.filter(a => a.status !== "draft");
    published.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

    if (!published.length) {
      list.innerHTML = `<div class="empty-state"><span class="label">No articles yet</span></div>`;
      return;
    }

    list.innerHTML = "";
    published.forEach(article => {
      const date = article.createdAt?.toDate?.()
        ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric" }).format(article.createdAt.toDate())
        : "";

      const excerpt = article.excerpt || stripHtml(article.content).slice(0, 180) + "...";

      const row = document.createElement("div");
      row.className = "article-row";
      row.innerHTML = `
        <div class="article-row-cover">
          ${article.cover ? `<img src="${cldWatermark(article.cover, 600)}" alt="${article.title}" loading="lazy" />` : ""}
        </div>
        <div class="article-row-body">
          <h2 class="article-row-title">${article.title}</h2>
          <p class="article-row-excerpt">${excerpt}</p>
        </div>
        <div class="article-row-meta">
          <span class="article-row-date">${date}</span>
          ${article.tag ? `<span class="article-row-tag">${article.tag}</span>` : ""}
        </div>
      `;
      row.addEventListener("click", () => openArticle(article.id, article));
      list.appendChild(row);
    });

    if (window.location.hash) {
      const id = window.location.hash.replace("#", "");
      const docSnap = await getDoc(doc(db, "articles", id));
      if (docSnap.exists() && docSnap.data().status !== "draft") openArticle(id, docSnap.data());
    }
  } catch (e) {
    console.error(e);
    list.innerHTML = `<div class="empty-state"><span class="label">Loading error</span></div>`;
  }
}

function openArticle(id, article) {
  window.history.pushState({}, "", `#${id}`);

  const date = article.createdAt?.toDate?.()
    ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric" }).format(article.createdAt.toDate())
    : "";

  document.getElementById("article-content").innerHTML = `
    <div class="article-header">
      <span class="article-date label">${date}</span>
      <h1>${article.title}</h1>
      ${article.cover ? `<img class="article-cover-img" src="${cldWatermark(article.cover, 1200)}" alt="${article.title}" />` : ""}
    </div>
    <div class="article-body">${article.content || ""}</div>
  `;

  document.getElementById("blog-list-view").style.display = "none";
  document.getElementById("article-single-view").style.display = "block";
  window.scrollTo(0, 0);
}

document.getElementById("back-to-list").addEventListener("click", () => {
  window.history.pushState({}, "", window.location.pathname);
  document.getElementById("article-single-view").style.display = "none";
  document.getElementById("blog-list-view").style.display = "block";
});

function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  return tmp.textContent || "";
}

loadArticles();
