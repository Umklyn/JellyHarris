export function cldResize(url, width) {
  if (!url || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/w_${width},q_auto,f_auto,c_limit/`);
}
