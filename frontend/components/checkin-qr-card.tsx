"use client";

import { QRCodeSVG } from "qrcode.react";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app";

export default function CheckinQrCard({
  artistSlug,
  artistName,
}: {
  artistSlug: string;
  artistName: string;
}) {
  const url = `${APP_URL}/artists/${artistSlug}/checkin`;

  return (
    <section className="glass-card p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold">Visit Check-in QR</p>
        <p className="mt-1 text-xs text-white/60">
          Display or print this at the venue / merch table. Fans scan it to earn{" "}
          <strong>25 points</strong> per day.
        </p>
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-2xl bg-white p-4">
          <QRCodeSVG value={url} size={200} />
        </div>
        <div className="space-y-2 text-left">
          <p className="text-xs text-white/50 break-all">{url}</p>
          <p className="text-xs text-white/50">
            One check-in per fan per day. Points post instantly.
          </p>
          <button
            onClick={() => window.print()}
            className="mt-2 rounded-full border border-white/20 px-4 py-2 text-xs text-white/70 hover:bg-white/10 transition"
          >
            🖨 Print QR card
          </button>
        </div>
      </div>
      <p className="text-xs text-white/30">Artist: {artistName}</p>
    </section>
  );
}
