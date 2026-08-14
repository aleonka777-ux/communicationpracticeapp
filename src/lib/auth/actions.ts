"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AuthActionState {
  error: string | null;
}

function readableAuthError(message: string): string {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "That email and password don't match an account. Check for typos or sign up below.";
  }
  if (message.toLowerCase().includes("already registered") || message.toLowerCase().includes("already exists")) {
    return "An account with that email already exists. Try logging in instead.";
  }
  if (message.toLowerCase().includes("password")) {
    return "Password must be at least 6 characters.";
  }
  return "Something went wrong. Please try again.";
}

export async function signUpAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || email.split("@")[0] } },
  });

  if (error) {
    return { error: readableAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/home");
}

export async function logInAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/home");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: readableAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/home");
}

export async function logOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
