import { createClient } from "@/lib/supabase/server";
import StudentForm from "./StudentForm";
import PlanSelect from "./PlanSelect";
import RemoveStudent from "./RemoveStudent";
import type { PlanTier } from "@/lib/billing/plans";
import { DEVICE_LIMITS } from "@/lib/devices";

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  plan: PlanTier;
  status: string;
  is_paid: boolean;
  current_period_end: string | null;
  device_count: number;
  created_at: string;
};

function DeviceUsage({ s }: { s: StudentRow }) {
  const limit = DEVICE_LIMITS[s.plan];
  const atLimit = s.device_count >= limit;
  return (
    <span
      className={`badge ${
        atLimit
          ? "bg-amber-100 text-amber-700"
          : "bg-black/[0.05] text-[var(--muted)]"
      }`}
      title="Active devices used / plan limit"
    >
      {s.device_count} / {limit}
    </span>
  );
}

function SubStatus({ s }: { s: StudentRow }) {
  const active = s.status === "active" || s.status === "trialing";
  if (!active) {
    const label =
      s.status === "canceled"
        ? "Canceled"
        : s.status === "past_due"
          ? "Past due"
          : "Free";
    const tone =
      s.status === "past_due"
        ? "bg-amber-100 text-amber-700"
        : "bg-black/[0.06] text-[var(--muted)]";
    return <span className={`badge ${tone}`}>{label}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="badge whitespace-nowrap bg-[var(--primary)]/10 text-[var(--primary)]">
        {s.is_paid ? "Active · PayMongo" : "Active · manual"}
      </span>
      {s.is_paid && s.current_period_end && (
        <span className="text-xs text-[var(--muted)]">
          renews {new Date(s.current_period_end).toLocaleDateString()}
        </span>
      )}
    </span>
  );
}

export default async function StudentsPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_students");
  const users = (data ?? []) as StudentRow[];
  const students = users.filter((u) => u.role === "student");

  return (
    <div className="space-y-8">
      <div className="max-w-md">
        <StudentForm />
        <p className="mt-3 text-xs text-[var(--muted)]">
          Accounts created here are confirmed immediately, so your students can sign in
          straight away with no email verification.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Students <span className="text-[var(--muted)]">({students.length})</span>
        </h2>
        {students.length === 0 ? (
          <div className="glass p-5 text-sm text-[var(--muted)]">No students yet.</div>
        ) : (
          <div className="glass overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Subscription</th>
                  <th className="px-4 py-3 font-medium">Devices</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-t border-white/50 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.full_name || "Unnamed"}</div>
                      <div className="text-xs text-[var(--muted)]">{s.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <PlanSelect userId={s.id} plan={s.plan} />
                    </td>
                    <td className="px-4 py-3">
                      <SubStatus s={s} />
                    </td>
                    <td className="px-4 py-3">
                      <DeviceUsage s={s} />
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RemoveStudent userId={s.id} name={s.full_name || s.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--muted)]">
          Set a plan to comp access manually. Removing a student permanently deletes their
          account and all their attempts.
        </p>
      </div>
    </div>
  );
}
