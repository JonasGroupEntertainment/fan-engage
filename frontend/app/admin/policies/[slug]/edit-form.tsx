"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SimpleMarkdown } from "@/components/simple-markdown";
import { updatePolicyAction } from "../actions";

export default function PolicyEditForm({
  slug,
  initial,
}: {
  slug: string;
  initial: {
    title: string;
    content_md: string;
    effective_date: string;
    is_draft: boolean;
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [contentMd, setContentMd] = useState(initial.content_md);
  const [effectiveDate, setEffectiveDate] = useState(initial.effective_date);
  const [isDraft, setIsDraft] = useState(initial.is_draft);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    try {
      formData.set("slug", slug);
      formData.set("title", title);
      formData.set("content_md", contentMd);
      formData.set("effective_date", effectiveDate);
      formData.set("is_draft", String(isDraft));
      await updatePolicyAction(formData);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/60">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/60">Effective date</span>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-white/70">
        <input
          type="checkbox"
          checked={isDraft}
          onChange={(e) => setIsDraft(e.target.checked)}
          className="h-4 w-4 accent-aurora"
        />
        Show &ldquo;DRAFT — pending legal review&rdquo; banner on the public page
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-white/60">Markdown</p>
          <textarea
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            rows={26}
            spellCheck={false}
            className="w-full rounded-2xl border border-white/10 bg-black/60 px-3 py-2 font-mono text-xs text-white/90"
          />
          <p className="mt-1 text-xs text-white/50">
            Supports # headings, **bold**, *italic*, [links](url), -/1. lists, &gt; blockquotes, --- rules.
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-white/60">Live preview</p>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <SimpleMarkdown source={contentMd} />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save policy"}
        </button>
      </div>
    </form>
  );
}
