"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface Influencer {
  id: string;
  handle: string;
  platform: string;
  real_name: string | null;
  artist_slug: string;
  status: string;
  created_at: string;
}

export const dynamic = "force-dynamic";

export default function AdminInfluencersPage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInfluencers = async () => {
      try {
        const res = await fetch("/api/admin/influencers");
        if (!res.ok) throw new Error("Failed to fetch influencers");
        const { data } = await res.json();
        setInfluencers(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchInfluencers();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Influencers
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Manage influencer handles, platforms, and assigned promo codes for campaign attribution.
        </p>
      </div>

      <section className="space-y-3">
        {loading ? (
          <p className="text-xs text-white/50">Loading influencers...</p>
        ) : error ? (
          <p className="text-xs text-red-400">Error: {error}</p>
        ) : influencers.length === 0 ? (
          <p className="text-xs text-white/50">No influencers yet.</p>
        ) : (
          influencers.map((inf) => (
            <Link
              key={inf.id}
              href={`/admin/influencers/${inf.id}`}
              className="block rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:border-white/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold">@{inf.handle}</p>
                  <p className="text-xs text-white/60">
                    {inf.platform} • {inf.artist_slug}
                    {inf.real_name && ` (${inf.real_name})`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/70">
                  {inf.status !== "active" && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 uppercase tracking-wide">
                      {inf.status}
                    </span>
                  )}
                  <span className="text-white/50">
                    {new Date(inf.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
        <p className="text-sm font-semibold">Add a new influencer</p>
        <p className="mt-1 text-xs text-white/60">
          Create an influencer profile and assign promo codes for tracking campaign attribution.
        </p>
        <CreateInfluencerForm />
      </section>
    </div>
  );
}

function CreateInfluencerForm() {
  const [artists, setArtists] = useState<{ slug: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchArtists = async () => {
      try {
        const res = await fetch("/api/admin/influencers?artist_slug=dummy");
        // Fallback: hardcode known artists for now since we don't have a separate artists API
        setArtists([
          { slug: "raelynn", name: "RaeLynn" },
          { slug: "bailee", name: "Bailee" },
          { slug: "blake", name: "Blake" },
          { slug: "dan", name: "Dan" },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchArtists();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const handle = formData.get("handle");
    const platform = formData.get("platform");
    const artistSlug = formData.get("artist_slug");

    if (!handle || !platform || !artistSlug) {
      setStatus("All fields are required");
      return;
    }

    try {
      setStatus("Creating...");
      const res = await fetch("/api/admin/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          platform,
          real_name: formData.get("real_name"),
          artist_slug: artistSlug,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setStatus(`Error: ${err.error}`);
        return;
      }

      setStatus("Influencer created!");
      e.currentTarget.reset();
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <div>
        <label className="text-xs font-semibold">Handle (username)</label>
        <input
          type="text"
          name="handle"
          placeholder="e.g., raelynn_official"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40"
        />
      </div>

      <div>
        <label className="text-xs font-semibold">Platform</label>
        <select
          name="platform"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        >
          <option value="">Select platform</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold">Real Name (optional)</label>
        <input
          type="text"
          name="real_name"
          placeholder="e.g., Rachael Lynn"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40"
        />
      </div>

      <div>
        <label className="text-xs font-semibold">Artist</label>
        <select
          name="artist_slug"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        >
          <option value="">Select artist</option>
          {artists.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20"
        >
          Create Influencer
        </button>
      </div>

      {status && (
        <p className={`text-xs ${status.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
          {status}
        </p>
      )}
    </form>
  );
}
