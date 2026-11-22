import BroadcastForm from "./broadcast-form";

// A broadcast can email and text a few thousand fans. Server actions on
// this page get five minutes (see lib/send-budget.ts for the deadline
// the send keeps inside that). This has to live in a server file, which
// is why the form itself is in broadcast-form.tsx.
export const maxDuration = 300;

export default function BroadcastPage() {
  return <BroadcastForm />;
}
