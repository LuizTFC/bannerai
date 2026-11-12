import type { Metadata } from "next";
import { Suspense } from "react";
import { CreditsView } from "@/components/credits/credits-view";

export const metadata: Metadata = { title: "Credits" };

export default function CreditsPage() {
  return (
    <Suspense fallback={null}>
      <CreditsView />
    </Suspense>
  );
}
