"use client";

import { QRCodeSVG } from "qrcode.react";

const MAX_QR_CHARS = 1200;

export default function InviteQRCode({
  url,
  size = 180,
}: {
  url: string;
  size?: number;
}) {
  const safeUrl = typeof url === "string" ? url.trim() : "";
  if (!safeUrl || safeUrl.length > MAX_QR_CHARS) {
    return (
      <p className="rounded-2xl bg-black/30 px-4 py-6 text-center text-xs text-white/60">
        QR unavailable — copy the invite link instead.
      </p>
    );
  }

  return (
    <div className="flex items-center justify-center rounded-2xl bg-white p-4">
      <QRCodeSVG
        value={safeUrl}
        size={size}
        bgColor="#ffffff"
        fgColor="#050b1f"
        level="M"
      />
    </div>
  );
}
