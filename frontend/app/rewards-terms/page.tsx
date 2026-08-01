import type { Metadata } from "next";
import PolicyPage from "@/app/(legal)/policy-page";

export const metadata: Metadata = {
  title: "Rewards Program Terms & Conditions",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <PolicyPage slug="rewards_terms" />;
}
