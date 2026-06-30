import { createClient } from "@/lib/supabase/server";
import UploadClient from "./UploadClient";
import type { Subject } from "@/lib/types";

export default async function UploadPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("subjects").select("*").order("order");
  return <UploadClient subjects={(data ?? []) as Subject[]} />;
}
