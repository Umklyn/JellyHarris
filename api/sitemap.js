const { SITE_URL, fetchCollection, slugify } = require("./_lib");

module.exports = async (req, res) => {
  let articles = [];
  let albums = [];

  try {
    [articles, albums] = await Promise.all([
      fetchCollection("articles"),
      fetchCollection("albums")
    ]);
  } catch (e) {
    // fall through with empty lists rather than failing the whole sitemap
  }

  const published = articles.filter(a => a.status !== "draft");
  const validAlbums = albums.filter(a => (a.photos || []).length);

  const staticUrls = [
    { loc: `${SITE_URL}/`, priority: "1.0" },
    { loc: `${SITE_URL}/gallery`, priority: "0.9" },
    { loc: `${SITE_URL}/blog`, priority: "0.9" },
    { loc: `${SITE_URL}/contact`, priority: "0.5" }
  ];

  const articleUrls = published.map(a => ({
    loc: `${SITE_URL}/blog/${slugify(a.title)}`,
    lastmod: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : undefined,
    priority: "0.7"
  }));

  const albumUrls = validAlbums.map(a => ({
    loc: `${SITE_URL}/gallery/${slugify(a.name)}`,
    lastmod: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : undefined,
    priority: "0.7"
  }));

  const allUrls = [...staticUrls, ...articleUrls, ...albumUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    u => `  <url>
    <loc>${u.loc}</loc>
${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ""}    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(xml);
};
