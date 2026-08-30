/** Same visual chrome as src/app/(auth)/layout.tsx, duplicated rather than shared because this is
 *  a real "/auth" URL segment (route handlers + the recovery password-update page live here),
 *  not the (auth) route group used by /login and /signup. */
export default function AuthSegmentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Virtual Communication Coach</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Practise the conversation before you have it.</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
