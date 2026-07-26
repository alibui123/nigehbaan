import { ReplayProvider } from "@/lib/replay/ReplayContext";
import { createClient } from "@/lib/supabase/server";
import { isProvincialOps, type AppRole } from "@/lib/alert-workflow";
import MobileBottomNav from "./MobileBottomNav";
import DashboardRouteLoadOverlay from "@/components/DashboardRouteLoadOverlay";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isOps = false;
  let role: string | undefined;

  if (user) {
    const { data: profile } = await supabase
      .from("profile")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role ?? undefined;
    isOps = isProvincialOps(role as AppRole | undefined);
  }

  return (
    <ReplayProvider>
      <div className="dashboard-shell min-h-dvh bg-[var(--color-base)]">
        {children}
        <DashboardRouteLoadOverlay />
        <MobileBottomNav
          locale={locale}
          isOps={isOps}
          role={role}
        />
      </div>
    </ReplayProvider>
  );
}
