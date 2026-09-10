const PROJECT_ID = "jellyharris-92239";
const SITE_URL = "https://www.jellyharris.com";

function unwrapValue(v) {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(unwrapValue);
  if (v.mapValue !== undefined) return unwrapFields(v.mapValue.fields || {});
  return null;
}

function unwrapFields(fields) {
  const out = {};
  for (const key in fields) out[key] = unwrapValue(fields[key]);
  return out;
}

async function fetchCollection(name) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${name}?pageSize=300`
  );
  if (!res.ok) throw new Error(`Firestore fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.documents || []).map(doc => ({
    id: doc.name.split("/").pop(),
    ...unwrapFields(doc.fields || {})
  }));
}

function slugify(str) {
  return (str || "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(str) {
  return (str || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function cldTransform(url, transform) {
  if (!url || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/${transform}/`);
}

function cldWatermark(url, width) {
  if (!url) return "";
  const text = encodeURIComponent("© Jelly Harris");
  const transform = `w_${width},q_auto,f_auto,c_limit/l_text:Space%20Mono_11:${text},co_white,o_45/fl_layer_apply,g_south,y_18`;
  return cldTransform(url, transform);
}

function cldResize(url, width) {
  return cldTransform(url, `w_${width},q_auto,f_auto,c_limit`);
}

module.exports = {
  SITE_URL,
  fetchCollection,
  slugify,
  escapeHtml,
  stripHtml,
  cldWatermark,
  cldResize
};
