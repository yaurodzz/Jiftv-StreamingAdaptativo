import { Outlet } from "react-router-dom";
import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
import BottomNav from "./BottomNav.jsx";
import SkipToContent from "./SkipToContent.jsx";

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-bg px-safe text-fg supports-[min-height:100dvh]:min-h-dvh max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
      <SkipToContent />
      <Navbar />
      <main id="conteudo" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
