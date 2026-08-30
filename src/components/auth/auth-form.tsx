"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { AuthActionState } from "@/lib/auth/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Please wait…" : label}
    </Button>
  );
}

export function AuthForm({
  mode,
  action,
  next,
  resetSuccess = false,
}: {
  mode: "login" | "signup";
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  next?: string;
  resetSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {mode === "login" && resetSuccess ? (
        <p className="rounded-xl bg-accent-green/10 px-4 py-2 text-sm text-accent-green" role="status">
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      {mode === "signup" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" name="displayName" autoComplete="name" placeholder="How should we address you?" />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          {mode === "login" ? (
            <Link href="/forgot-password" className="text-sm font-medium text-primary">
              Forgot password?
            </Link>
          ) : null}
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={6}
          placeholder="At least 6 characters"
        />
      </div>
      {state.error ? (
        <p className="rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton label={mode === "signup" ? "Create account" : "Log in"} />
      <p className="text-center text-sm text-foreground-muted">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-primary">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
