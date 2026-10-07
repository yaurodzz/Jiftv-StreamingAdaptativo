import { useEffect } from "react";
import ClassesPanel from "../../features/admin/ClassesPanel.jsx";

// /admin/turmas — turmas oferecidas no cadastro público de atletas.
export default function Classes() {
  useEffect(() => { document.title = "Turmas · Painel JIFTv"; }, []);
  return <ClassesPanel />;
}
