import { Button, Card } from "../ui/kit";
import { BRAND } from "../ui/visual";
import { startSignIn } from "../bungie/auth";

export function SignIn({ error }: { error?: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-5 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <img src={BRAND.emblem} alt="Steeped" className="h-56 w-auto drop-shadow-[0_10px_30px_rgb(123_63_242/0.55)]" />
        <p className="text-sm text-ink-dim">by Bobby Saggs</p>
      </div>
      <Card className="space-y-4 p-6">
        <h2 className="text-2xl">Max out your Hunter or Warlock without the homework.</h2>
        <p className="text-ink-dim">
          Steeped reads your characters and vault from Bungie, builds your strongest loadouts, and tells you what to play and chase next.
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
