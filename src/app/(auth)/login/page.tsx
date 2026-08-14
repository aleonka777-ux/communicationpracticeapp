import { AuthForm } from "@/components/auth/auth-form";
import { logInAction } from "@/lib/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="login" action={logInAction} next={next} />;
}
