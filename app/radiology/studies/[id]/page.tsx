import { StudyWorkspace } from "@/features/radiology/study-workspace";

export default async function RadiologyStudyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudyWorkspace orderId={id} />;
}
