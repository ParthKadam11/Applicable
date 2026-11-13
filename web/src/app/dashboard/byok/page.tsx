import { redirect } from "next/navigation";

/** BYOK lives under AI Search (+ copy in Settings). */
export default function DashboardByokPage() {
  redirect("/dashboard/search");
}
