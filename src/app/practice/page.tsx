import { redirect } from "next/navigation";

// Practice is now part of the unified Exams catalog.
export default function PracticeRedirect() {
  redirect("/exams");
}
