import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="mb-2 text-center text-lg font-semibold text-foreground">Reset your password</h2>
      <ForgotPasswordForm expiredLink={error === "link"} />
    </div>
  );
}
