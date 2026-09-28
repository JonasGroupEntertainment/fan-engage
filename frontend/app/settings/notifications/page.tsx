import { redirect } from "next/navigation";

// Notification settings now live on one page.
export default function SettingsNotificationsRedirect() {
  redirect("/me/notifications");
}
