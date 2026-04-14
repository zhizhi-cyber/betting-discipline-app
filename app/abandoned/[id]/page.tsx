import { mockAbandonedRecords } from "@/lib/mock-data";
import AbandonedDetail from "./AbandonedDetail";

export function generateStaticParams() {
  return mockAbandonedRecords.map((r) => ({ id: r.id }));
}

export default function Page() {
  return <AbandonedDetail />;
}
