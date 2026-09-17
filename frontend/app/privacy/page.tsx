import type { Metadata } from "next";
import PolicyPage from "@/app/(legal)/policy-page";
import { generatePolicyMetadata } from "@/app/(legal)/policy-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return generatePolicyMetadata("privacy", "Privacy Policy");
}

export default function Page() {
  return <PolicyPage slug="privacy" />;
}
