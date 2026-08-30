import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isCoach } from "@/lib/db/profiles";
import { TopBar } from "@/components/layout/top-bar";
import { BottomNav } from "@/components/layout/bottom-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!isCoach(profile)) redirect("/home");

  return (
    <div className="min-h-dvh bg-background">
      <TopBar displayName={profile?.display_name || user.email || "Coach"} />
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        <div className="mb-4 flex items-center gap-4 text-sm font-medium">
          <Link href="/admin/tools" className="text-foreground hover:text-primary">
            Communication tools
          </Link>
          <Link href="/admin/scenarios" className="text-foreground hover:text-primary">
            Scenarios
          </Link>
          <Link href="/admin/manual" className="text-foreground hover:text-primary">
            Manual
          </Link>
        </div>
        {children}
      </main>
      <BottomNav isCoach={true} />
    </div>
  );
}
