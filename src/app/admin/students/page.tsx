import { createClient } from "@/lib/supabase/server";
import StudentForm from "./StudentForm";

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  created_at: string;
};

export default async function StudentsPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_students");
  const users = (data ?? []) as StudentRow[];
  const students = users.filter((u) => u.role === "student");

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div>
        <StudentForm />
        <p className="mt-3 text-xs text-[var(--muted)]">
          Accounts created here are confirmed immediately — no email verification needed,
          so your students can log in straight away.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Students <span className="text-[var(--muted)]">({students.length})</span>
        </h2>
        {students.length === 0 ? (
          <div className="glass p-5 text-sm text-[var(--muted)]">No students yet.</div>
        ) : (
          <div className="glass overflow-hidden p-0">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-t border-white/50">
                    <td className="px-4 py-2.5 font-medium">{s.full_name || "—"}</td>
                    <td className="px-4 py-2.5 text-[var(--muted)]">{s.email}</td>
                    <td className="px-4 py-2.5 text-[var(--muted)]">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
