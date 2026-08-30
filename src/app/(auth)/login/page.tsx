import { AuthForm } from "@/components/auth/auth-form";
import { logInAction } from "@/lib/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; resetSuccess?: string }>;
}) {
  const { next, resetSuccess } = await searchParams;
  return <AuthForm mode="login" action={logInAction} next={next} resetSuccess={resetSuccess === "1"} />;
}
