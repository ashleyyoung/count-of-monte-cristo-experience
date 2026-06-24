import { Suspense } from "react";
import { getAll, getParts } from "@/lib/installments";
import { getUserProgress } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";
import TimelineView from "@/components/timeline/TimelineView";

export const metadata = {
  title: "The Serialization · Journal des Débats 1844–46",
  description:
    "Follow The Count of Monte Cristo installment by installment as it appeared in the Journal des Débats, 28 August 1844 through 15 January 1846.",
};

export default async function TimelinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [installments, parts, progress] = await Promise.all([
    Promise.resolve(getAll()),
    Promise.resolve(getParts()),
    getUserProgress(),
  ]);

  return (
    <Suspense>
      <TimelineView
        installments={installments}
        parts={parts}
        initialView={progress.viewPref}
        initialCompletedDates={progress.completedDates}
        initialLastLocation={progress.lastLocation}
        isSignedIn={!!user}
      />
    </Suspense>
  );
}
