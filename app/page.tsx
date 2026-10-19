import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/routes";

export default async function HomePage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }
  redirect(homePathForRole(user.role));
}
