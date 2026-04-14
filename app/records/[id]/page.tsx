import { mockDetailedRecords } from "@/lib/mock-data";
import RecordDetail from "./RecordDetail";

export function generateStaticParams() {
  return mockDetailedRecords.map((r) => ({ id: r.id }));
}

export default function Page() {
  return <RecordDetail />;
}
