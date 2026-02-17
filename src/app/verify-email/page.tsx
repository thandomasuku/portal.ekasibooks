import { Suspense } from "react";
import VerifyEmailClient from "./VerifyEmailClient";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[70vh] flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-2xl border bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">Loading…</h1>
            <p className="mt-2 text-slate-600">Preparing verification…</p>
          </div>
        </main>
      }
    >
      <VerifyEmailClient />
    </Suspense>
  );
}
