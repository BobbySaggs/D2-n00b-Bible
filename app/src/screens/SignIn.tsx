import { Button, Card, Logo } from "../ui/kit";
import { startSignIn } from "../bungie/auth";

export function SignIn({ error }: { error?: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-5 py-12">
      <div className="flex items-center gap-3">
        <Logo size={48} />
        <div>
          <h1 className="text-4xl">Steeped</h1>
          <p className="text-sm text-ink-dim">by Bobby Saggs</p>
        </div>
      </div>
      <Card className="space-y-4 p-6">
        <h2 className="text-2xl">Know what to play tonight, and how to build for it.</h2>
        <p className="text-ink-dim">
          Steeped reads your characters and vault straight from Bungie, then builds the strongest loadout you can play with what you
          already own, and tells you exactly what to get next.
        </p>
        <Button size="lg" onClick={startSignIn} className="w-full sm:w-auto">Sign in with Bungie</Button>
        <p className="text-xs text-ink-dim">
          Steeped only sees your Destiny account. Your sign-in stays in this browser.
        </p>
      </Card>
      {error && <Card className="border-bad/40 text-bad">{error}</Card>}
      <p className="text-center text-xs text-ink-dim">Beta. The classic Steeped is still at the main site.</p>
    </main>
  );
}
