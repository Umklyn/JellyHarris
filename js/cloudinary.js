export function cldRotate(url, degrees) {
  if (!url || !url.includes("/upload/") || !degrees) return url;
  return url.replace("/upload/", `/upload/a_${degrees}/`);
}

export function cldResize(url, width) {
  if (!url || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/w_${width},q_auto,f_auto,c_limit/`);
}

const WATERMARK_TEXT = encodeURIComponent("© Jelly Harris");

export function cldWatermark(url, width) {
  if (!url || !url.includes("/upload/")) return url;
  const transform = `w_${width},q_auto,f_auto,c_limit/l_text:Space%20Mono_11:${WATERMARK_TEXT},co_white,o_45/fl_layer_apply,g_south,y_18`;
  return url.replace("/upload/", `/upload/${transform}/`);
}
