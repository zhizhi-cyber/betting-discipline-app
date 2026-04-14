import { mockAbandonedRecords } from "@/lib/mock-data";
import AbandonedDetail from "./AbandonedDetail";

export function generateStaticParams() {
  const ids = mockAbandonedRecords.map((r) => ({ id: r.id }));
  return ids.length > 0 ? ids : [{ id: "_" }];
}

export default function Page() {
  return <AbandonedDetail />;
}
