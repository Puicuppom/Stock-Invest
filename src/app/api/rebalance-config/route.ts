// These are browser-visible values. Never use a Supabase service-role key here.
export const dynamic = "force-dynamic";

export function GET() {
  const config = {
    SUPABASE_URL: process.env.REBALANCE_SUPABASE_URL ?? "",
    SUPABASE_ANON_KEY: process.env.REBALANCE_SUPABASE_ANON_KEY ?? "",
    SYNC_KEY: process.env.REBALANCE_SYNC_KEY ?? "",
  };
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  return new Response(`window.REBALANCE_CONFIG = ${json};`, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
