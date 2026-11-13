import { redirect } from "next/navigation";

/** Overview removed — land on Jobs. */
export default function DashboardPage() {
  redirect("/dashboard/jobs");
}
