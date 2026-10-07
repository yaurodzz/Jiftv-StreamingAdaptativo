import { useCallback, useEffect, useRef, useState } from "react";

// Copia para o clipboard e mantém estado "copiado" por ~1.6s para feedback visual.
// Fallback via textarea temporária cobre navegadores sem Clipboard API.

export function useClipboard(resetMs = 1600) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  const copy = useCallback(async (text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      timer.current && clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), resetMs);
      return true;
    } catch {
      return false;
    }
  }, [resetMs]);

  return { copy, copied };
}
