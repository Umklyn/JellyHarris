const { SITE_URL, fetchCollection, slugify, escapeHtml, stripHtml, cldWatermark } = require("../_lib");

module.exports = async (req, res) => {
  const { slug } = req.query;

  let articles;
  try {
    articles = await fetchCollection("articles");
  } catch (e) {
    res.writeHead(302, { Location: "/blog.html" });
    return res.end();
  }

  const published = articles.filter(a => a.status !== "draft");
  const article = published.find(a => slugify(a.title) === slug);

  if (!article) {
    res.writeHead(302, { Location: "/blog.html" });
    return res.end();
  }

  const title = escapeHtml(article.title || "");
  const dateStr = article.createdAt
    ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric" }).format(new Date(article.createdAt))
    : "";
  const excerptRaw = (article.excerpt || stripHtml(article.content || "")).slice(0, 160);
  const excerpt = escapeHtml(excerptRaw);
  const coverUrl = article.cover ? cldWatermark(article.cover, 1200) : `${SITE_URL}/assets/logo.png`;
  const canonical = `${SITE_URL}/blog/${slug}`;
  const coverPosition = escapeHtml(article.coverPosition || "50% 50%");

  const coverImgHtml = article.cover
    ? `<img class="article-cover-img" src="${escapeHtml(coverUrl)}" alt="${title}" data-color="${!!article.coverColor}" style="object-position:${coverPosition};" />`
    : "";

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title || "",
    image: article.cover ? [coverUrl] : undefined,
    datePublished: article.createdAt || undefined,
    author: { "@type": "Person", name: "Jelly Harris" }
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="/js/theme-init.js"></script>
  <title>${title} — Jelly Harris</title>
  <meta name="description" content="${excerpt}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${title} — Jelly Harris" />
  <meta property="og:description" content="${excerpt}" />
  <meta property="og:image" content="${escapeHtml(coverUrl)}" />
  <meta property="og:url" content="${canonical}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title} — Jelly Harris" />
  <meta name="twitter:description" content="${excerpt}" />
  <meta name="twitter:image" content="${escapeHtml(coverUrl)}" />
  <link rel="icon" type="image/png" href="/assets/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preconnect" href="https://api.fontshare.com" />
  <link rel="preconnect" href="https://cdn.fontshare.com" crossorigin />
  <link rel="preconnect" href="https://firestore.googleapis.com" />
  <link rel="preconnect" href="https://www.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Space+Mono:wght@400;700&display=swap" />
  <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=clash-display@1&display=swap" />
  <link rel="modulepreload" href="https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js" />
  <link rel="modulepreload" href="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js" />
  <link rel="stylesheet" href="/css/style.css" />
  <link rel="stylesheet" href="/css/blog.css" />
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>

  <nav>
    <a href="/index.html" class="nav-logo"><img src="/assets/logo.png" alt="Jelly Harris" class="nav-logo-img" /><span class="nav-logo-text">Jelly Harris</span></a>
    <div class="nav-right">
      <ul class="nav-links">
        <li><a href="/blog.html" class="active">Journal</a></li>
        <li><a href="/gallery.html">Gallery</a></li>
        <li><a href="/contact.html">Contact</a></li>
      </ul>
      <button class="nav-burger" aria-label="Menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>

  <main class="page-content blog-main" id="blog-main">

    <div class="blog-list-view" id="blog-list-view" style="display:none;">
      <header class="page-header">
        <span class="label">Writing</span>
        <span class="display">Journal</span>
      </header>
      <div class="articles-list" id="articles-list">
        <div class="loading-state"><span class="label">Loading...</span></div>
      </div>
    </div>

    <div class="article-single-view" id="article-single-view">
      <button class="back-btn" id="back-to-list">← Back to journal</button>
      <article class="article-content" id="article-content">
        <div class="article-header">
          <span class="article-date label">${escapeHtml(dateStr)}</span>
          <h1>${title}</h1>
          ${coverImgHtml}
        </div>
        <div class="article-body">${article.content || ""}</div>
      </article>
    </div>

  </main>

  <footer>
    <p>© 2026 Jelly Harris</p>
    <p><a href="/index.html"><img src="/assets/logo.png" alt="Jelly Harris" class="footer-logo-img" /></a></p>
    <p>Brussels, Belgium <a href="https://www.instagram.com/jelly.harris/" target="_blank" rel="noopener" class="footer-insta" aria-label="Instagram"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/></svg></a><button class="theme-toggle" aria-label="Basculer le mode sombre"></button></p>
  </footer>

  <script src="/js/nav.js"></script>
  <script src="/js/theme.js"></script>
  <script src="/js/protect-images.js"></script>
  <script type="module" src="/js/firebase-init.js"></script>
  <script type="module" src="/js/blog.js"></script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.status(200).send(html);
};
