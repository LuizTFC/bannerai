import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Bannerai — AI banners for your events",
  description: "Describe your event or campaign and get a professional, on-brand banner in minutes. Pay per banner, no subscription.",
};

export default function HomePage() {
  return <LandingPage />;
}
