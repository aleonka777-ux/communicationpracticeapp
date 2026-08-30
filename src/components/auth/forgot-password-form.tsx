"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { requestPasswordResetAction, type ForgotPasswordState } from "@/lib/auth/actions";
import { NEUTRAL_RESET_NOTE } from "@/lib/auth/constants";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}

const initialState: ForgotPasswordState = { error: null, submitted: false };

export function ForgotPasswordForm({ expiredLink = false }: { expiredLink?: boolean }) {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);

  if (state.submitted) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-accent-green/10 px-4 py-3 text-sm text-accent-green" role="status">
          {NEUTRAL_RESET_NOTE}
        </p>
        <Link href="/login" className="text-center text-sm font-medium text-primary">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {expiredLink ? (
        <p className="rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          This reset link is invalid or has expired. Request a new one below.
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      {state.error ? (
        <p className="rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
      <Link href="/login" className="text-center text-sm font-medium text-primary">
        Back to log in
      </Link>
    </form>
  );
}
