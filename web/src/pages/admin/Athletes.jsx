import { useEffect } from "react";
import AthletesModerationPanel from "../../features/admin/AthletesModerationPanel.jsx";

// /admin/atletas — moderação dos cadastros enviados pelo formulário público.
export default function Athletes() {
  useEffect(() => { document.title = "Atletas · Painel JIFTv"; }, []);
  return <AthletesModerationPanel />;
}
