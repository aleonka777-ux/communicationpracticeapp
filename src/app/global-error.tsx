"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#faf6ef] px-6 text-center text-[#262322]">
        <p className="text-lg font-semibold">Something went wrong.</p>
        <p className="max-w-sm text-sm opacity-80">Please reload the page. If this keeps happening, come back later.</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-[#b5613f] px-5 py-2 text-sm font-medium text-[#fdf8f2]"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
