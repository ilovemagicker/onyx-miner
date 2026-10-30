/** Server helpers for Supabase REST (leaderboard). Prefer raw fetch for reliability. */

export function getSupabaseRestConfig(): { url: string; key: string } {
  // Prefer NEXT_PUBLIC_* so local shells that inject another project's
  // SUPABASE_URL (without NEXT_PUBLIC_) do not shadow the miner store.
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  )
    .trim()
    .replace(/^"|"$/g, "");
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  )
    .trim()
    .replace(/^"|"$/g, "");
  if (!url || !key) {
    throw new Error("supabase_env_missing");
  }
  return { url: url.replace(/\/$/, ""), key };
}

export function supabaseHeaders(key: string, extra?: Record<string, string>) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extra,
  };
}
