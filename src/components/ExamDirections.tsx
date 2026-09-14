import type { PartDirections } from "@/lib/nmat-directions";

/**
 * Renders NMAT directions. No hooks and no server-only imports, so the same
 * markup serves the pre-start page and the panel inside the exam runner.
 */
export default function ExamDirections({ parts }: { parts: PartDirections[] }) {
  return (
    <div className="space-y-6">
      {parts.map((p) => (
        <section key={p.part}>
          <h2 className="text-lg font-semibold">{p.title}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
            {p.general.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>

          {p.subjects.map((s) => (
            <div key={s.slug} className="mt-4">
              <h3 className="font-semibold">{s.name}</h3>
              {s.summary && (
                <p className="mt-1 text-sm text-[var(--muted)]">{s.summary}</p>
              )}
              <ol className="mt-2 space-y-3">
                {s.sections.map((sec, i) => (
                  <li
                    key={sec.title}
                    className="rounded-xl border border-[var(--border)] bg-white/70 p-4"
                  >
                    <p className="text-sm font-semibold">
                      Section {i + 1} · {sec.title}
                    </p>
                    <p className="mt-1 text-sm">{sec.directions}</p>
                    {sec.example && (
                      <p className="mt-2 rounded-lg bg-black/[0.03] px-3 py-2 text-sm">
                        <span className="text-[var(--muted)]">Example: </span>
                        {sec.example.prompt}
                        <span className="text-[var(--muted)]"> → </span>
                        <span className="font-medium">{sec.example.answer}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
