import { redirect } from "next/navigation";

export const metadata = { title: "Settings" };

/** /settings was a 404 — account lives at /me (profile, privacy, notifications). */
export default function SettingsIndexPage() {
  redirect("/me");
}
