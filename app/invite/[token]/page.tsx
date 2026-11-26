import { Suspense } from "react";
import AwasoApp from "@/app/awaso-app";

export default function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={<p>招待情報を読み込んでいます...</p>}>
      {params.then(({ token }) => (
        <AwasoApp invitationToken={token} />
      ))}
    </Suspense>
  );
}
