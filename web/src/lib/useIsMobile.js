import { useEffect, useState } from "react";

// Celular: tela abaixo do breakpoint `md` do Tailwind (768px), ou um aparelho de toque deitado
// (altura baixa). O segundo caso mantém a interface de toque quando o celular gira, por exemplo
// com o player em tela cheia, em que a largura passa de 768px.
const QUERY = "(max-width: 767.98px), (pointer: coarse) and (max-height: 500px)";

export function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}
