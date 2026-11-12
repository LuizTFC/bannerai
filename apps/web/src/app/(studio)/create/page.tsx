import type { Metadata } from "next";
import { CreateStudio } from "@/components/studio/create-studio";

export const metadata: Metadata = { title: "Create Banner" };

export default function CreatePage() {
  return <CreateStudio />;
}
