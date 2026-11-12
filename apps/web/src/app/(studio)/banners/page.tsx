import type { Metadata } from "next";
import { BannerGrid } from "@/components/banners/banner-grid";

export const metadata: Metadata = { title: "My Banners" };

export default function BannersPage() {
  return <BannerGrid />;
}
