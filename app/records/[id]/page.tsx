import { mockDetailedRecords } from "@/lib/mock-data";
import RecordDetail from "./RecordDetail";

export function generateStaticParams() {
  const ids = mockDetailedRecords.map((r) => ({ id: r.id }));
  return ids.length > 0 ? ids : [{ id: "_" }];
}

export default function Page() {
  return <RecordDetail />;
}
