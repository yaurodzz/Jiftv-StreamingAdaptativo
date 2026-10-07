// Helper de apresentação para thumbnails do Cloudinary.
// Apenas pede o tamanho certo à mesma URL já salva no Firestore, quando ela é do Cloudinary.
//   https://res.cloudinary.com/<cloud>/video/upload/<xforms>/<public_id>.jpg
export function cldThumb(url, { width = 640 } = {}) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;

  const transform = `f_auto,q_auto,w_${width},c_fill`;
  return url.replace(/\/upload\/(?!.*\/upload\/)/, `/upload/${transform}/`);
}

// Avatar quadrado com foco no rosto (g_face). Usado nos cards e no perfil.
// `size` é em px do maior lado — o DPR fica por conta do navegador.
export function cldAvatar(url, { size = 400 } = {}) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;

  const transform = `c_fill,g_face,w_${size},h_${size},q_auto,f_auto`;
  return url.replace(/\/upload\/(?!.*\/upload\/)/, `/upload/${transform}/`);
}
