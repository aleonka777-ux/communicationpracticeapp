import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const dynamic = "force-dynamic";

/**
 * Deliberately does not redirect an unauthenticated visitor (middleware doesn't protect /auth/*
 * either — see src/lib/supabase/middleware.ts's comment) — a redirect-based guard here would
 * fight with /auth/callback, which itself briefly has no session until the exchange completes,
 * and step 12 of the Stage B.2 task explicitly requires no redirect loop. Missing/expired session
 * is shown as an inline error with a way back to request a new link, not a bounce to /login.
 */
export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-center text-lg font-semibold text-foreground">Set new password</h2>
        <p className="rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          This reset link is invalid or has expired. Request a new one.
        </p>
        <Link href="/forgot-password" className="text-center text-sm font-medium text-primary">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-center text-lg font-semibold text-foreground">Set new password</h2>
      <UpdatePasswordForm />
    </div>
  );
}
