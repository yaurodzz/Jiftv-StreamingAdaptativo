// Geração de stream keys e nomes públicos (slugs) das transmissões.
//
// Chave: base32 Crockford (dígitos + letras maiúsculas, sem I O L U).
// - URL-safe (nada que precise escapar em query string ou path)
// - Sem caracteres visualmente ambíguos (0/O, 1/I/L)
// - 20 caracteres → ~100 bits de entropia, muito acima do necessário
//
// A entropia vem de crypto.getRandomValues, nunca de Math.random.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 símbolos Crockford

export function generateStreamKey(length = 20) {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[buf[i] & 0x1f];
  return out;
}

// Nome público usado nas URLs de HLS/DASH e na pasta da gravação.
// O sufixo aleatório evita colisão entre transmissões de mesmo título.
export function generateSlug(title) {
  const base = (title || "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40).replace(/-+$/, "") || "transmissao";
  const buf = new Uint8Array(2);
  crypto.getRandomValues(buf);
  const suffix = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${base}-${suffix}`;
}
