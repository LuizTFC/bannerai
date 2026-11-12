import type { Metadata } from "next";
import { BannerEditor } from "@/components/editor/banner-editor";

export const metadata: Metadata = { title: "Banner" };

export default async function BannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BannerEditor bannerId={id} />;
}
