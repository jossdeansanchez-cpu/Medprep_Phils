import Link from "next/link";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { getCurrentProfile } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const tabs = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/upload", label: "Upload" },
    { href: "/admin/questions", label: "Questions" },
    { href: "/admin/exams", label: "Exams" },
  ];

  return (
    <>
      <Nav />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <nav className="mb-6 flex gap-1 border-b border-[var(--border)]">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </>
  );
}
