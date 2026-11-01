import { PublicFeedbackForm } from "@/components/shared/public-feedback-form";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicFeedbackForm token={token} />;
}
