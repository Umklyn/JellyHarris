export function cldResize(url, width) {
  if (!url || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/w_${width},q_auto,f_auto,c_limit/`);
}

const WATERMARK_TEXT = encodeURIComponent("© Jelly Harris");

export function cldWatermark(url, width) {
  if (!url || !url.includes("/upload/")) return url;
  const transform = `w_${width},q_auto,f_auto,c_limit/l_text:Arial_14_bold:${WATERMARK_TEXT},co_white,o_65,g_south_east,x_18,y_18/fl_layer_apply`;
  return url.replace("/upload/", `/upload/${transform}/`);
}
