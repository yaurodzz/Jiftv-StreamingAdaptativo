import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Trilha horizontal com scroll-snap, arrastar no toque e setas no desktop.
// Setas só aparecem se houver overflow real e desaparecem quando não há
// mais para onde rolar naquele lado.
export default function Row({ title, count, children, action }) {
  const scrollerRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const updateBounds = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= max - 2);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateBounds();
    el.addEventListener("scroll", updateBounds, { passive: true });
    const ro = new ResizeObserver(updateBounds);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateBounds);
      ro.disconnect();
    };
  }, [updateBounds]);

  const scrollBy = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  // Setas do teclado quando a trilha está focada.
  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); scrollBy(1); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); scrollBy(-1); }
  };

  const hasOverflow = !(atStart && atEnd);

  return (
    <section className="relative">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {title}
          {typeof count === "number" && (
            <span className="ml-2 text-sm font-normal text-muted">{count}</span>
          )}
        </h2>
        {action}
      </header>

      <div className="relative">
        {hasOverflow && !atStart && (
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Rolar para a esquerda"
            className="absolute left-1 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface/90 p-2 text-fg shadow-sm backdrop-blur transition-opacity hover:border-accent md:inline-flex"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        {hasOverflow && !atEnd && (
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Rolar para a direita"
            className="absolute right-1 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface/90 p-2 text-fg shadow-sm backdrop-blur transition-opacity hover:border-accent md:inline-flex"
          >
            <ChevronRight size={18} />
          </button>
        )}

        <div
          ref={scrollerRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          role="list"
          aria-label={title}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </div>
      </div>
    </section>
  );
}

// Wrapper de item para a trilha: aplica largura responsiva e snap-start.
export function RowItem({ children }) {
  return (
    <div
      role="listitem"
      className="min-w-[75%] shrink-0 snap-start sm:min-w-[48%] md:min-w-[32%] lg:min-w-[24%] xl:min-w-[20%]"
    >
      {children}
    </div>
  );
}
