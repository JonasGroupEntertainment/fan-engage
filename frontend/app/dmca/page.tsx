import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DMCA / Copyright Policy",
};

export default function DmcaPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12 text-white/80">
      <div>
        <Link href="/" className="text-xs text-white/50 hover:text-white">← Fan Home</Link>
      </div>

      <h1 className="text-3xl font-semibold text-white">DMCA / Copyright Policy</h1>

      {/* Compliance statement */}
      <section className="space-y-3">
        <p>
          Fan Engage Pro LLC respects the intellectual property rights of others and complies with
          the Digital Millennium Copyright Act (DMCA), 17 U.S.C. § 512. We are not actively
          monitoring all user-generated content on the platform, but we will respond promptly to
          valid DMCA notices received by our designated agent.
        </p>
      </section>

      {/* Agent */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Designated DMCA Agent</h2>
        <p>
          If you believe that content on this site infringes your copyright, please contact our
          designated DMCA agent:
        </p>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm space-y-1">
          <p><span className="text-white/50">Name:</span> Brad Hamilton</p>
          <p><span className="text-white/50">Company:</span> Jones &amp; Keller, P.C.</p>
          <p><span className="text-white/50">Address:</span> 1675 Broadway, 28th Floor, Denver, CO 80202</p>
          <p><span className="text-white/50">Phone:</span> (303) 536-3845</p>
          <p>
            <span className="text-white/50">Email:</span>{" "}
            <a href="mailto:bhamilton@joneskeller.com" className="text-aurora hover:underline">
              bhamilton@joneskeller.com
            </a>
          </p>
        </div>
        <p className="text-xs text-white/50">
          This agent information is consistent with our registration in the U.S. Copyright Office
          DMCA Designated Agent Directory.
        </p>
      </section>

      {/* Takedown notice */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">How to Submit a Takedown Notice</h2>
        <p>
          To file a valid DMCA takedown notice, your written communication must include all of
          the following:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>A description of the copyrighted work you claim has been infringed.</li>
          <li>The URL or specific location on our site where the infringing content appears.</li>
          <li>Your name, address, telephone number, and email address.</li>
          <li>
            A statement that you have a good faith belief that the disputed use is not authorized
            by the copyright owner, its agent, or the law.
          </li>
          <li>
            A statement made under penalty of perjury that the information in your notice is
            accurate and that you are the copyright owner or authorized to act on behalf of the
            copyright owner.
          </li>
          <li>Your physical or electronic signature.</li>
        </ol>
        <p className="text-sm">
          Send your notice to our designated agent at the contact information listed above.
        </p>
      </section>

      {/* Counter-notice */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Counter-Notification</h2>
        <p>
          If you believe that content you posted was removed or disabled as a result of a mistake
          or misidentification, you may submit a counter-notification to our designated agent
          containing the following:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>Identification of the content that was removed and its location before removal.</li>
          <li>
            A statement under penalty of perjury that you have a good faith belief the content
            was removed or disabled as a result of mistake or misidentification.
          </li>
          <li>
            Your name, address, telephone number, email address, and a statement that you consent
            to the jurisdiction of the federal court in your district (or Denver, CO if outside
            the U.S.), and that you will accept service of process from the party who submitted
            the original notice.
          </li>
          <li>Your physical or electronic signature.</li>
        </ol>
        <p className="text-sm">
          Upon receipt of a valid counter-notification, we may restore the removed content within
          10–14 business days unless the original complainant files a court action.
        </p>
      </section>

      {/* Repeat infringer */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Repeat Infringer Policy</h2>
        <p>
          Fan Engage Pro LLC will terminate the accounts of users who are determined to be repeat
          infringers of copyright in appropriate circumstances, at our sole discretion.
        </p>
      </section>

      {/* No monitoring */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">No Monitoring Obligation</h2>
        <p>
          Fan Engage Pro LLC is not obligated to and does not actively monitor all content posted
          by users. However, we will respond promptly to valid DMCA notices and take appropriate
          action in accordance with applicable law.
        </p>
      </section>

      <p className="text-xs text-white/50 pt-4">
        Last updated June 20, 2026 · Fan Engage Pro LLC
      </p>
    </main>
  );
}
