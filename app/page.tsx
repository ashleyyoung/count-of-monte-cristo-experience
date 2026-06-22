import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  let sessionLabel = "Not connected";
  if (supabaseConfigured) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      sessionLabel = user ? `Signed in as ${user.email}` : "No active session";
    } catch {
      sessionLabel = "Supabase client error";
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Alexandre Dumas</p>
        <h1>The Count of Monte Cristo Experience</h1>
        <p className="lede">
          A literary journey through betrayal, imprisonment, and revenge on the
          Mediterranean. The experience is under construction.
        </p>
        <dl className="status">
          <div>
            <dt>Supabase</dt>
            <dd>{supabaseConfigured ? "Configured" : "Add env vars"}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{sessionLabel}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
