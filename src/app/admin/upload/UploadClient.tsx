"use client";

import { Fragment, useState, useTransition } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { CSV_HEADERS, validateRows, type RawRow, type ValidationResult } from "@/lib/csv";
import {
  importQuestions,
  checkDuplicateQuestions,
  type DuplicateMatch,
} from "@/app/admin/actions";
import { CATEGORY_LABELS } from "@/lib/categories";
import {
  TRACK_ORDER,
  TRACK_LABELS,
  DEFAULT_TRACK,
  type ExamTrack,
} from "@/lib/tracks";
import type { Subject } from "@/lib/types";

const SAMPLES: Record<ExamTrack, string> = {
  ple: [
    CSV_HEADERS.join(","),
    `Anatomy,daily,"The brachial plexus is formed by the ventral rami of which spinal nerves?",C5-T1,C3-C5,L1-L4,T1-T4,,A,"The brachial plexus arises from ventral rami of C5 through T1."`,
    `Pharmacology,weekly,"Which drug is a beta-blocker?",Metoprolol,Amlodipine,Losartan,Furosemide,,A,"Metoprolol is a selective beta-1 adrenergic blocker."`,
    `Medicine,mock,"Most common cause of acute pancreatitis?",Gallstones,Alcohol,Hypertriglyceridemia,Trauma,,A,"Gallstones are the leading cause of acute pancreatitis."`,
  ].join("\n"),
  nmat: [
    CSV_HEADERS.join(","),
    `Biology,daily,"Which organelle is the site of aerobic respiration?",Mitochondrion,Ribosome,Golgi apparatus,Lysosome,,A,"The mitochondrion carries out oxidative phosphorylation."`,
    `Quantitative,weekly,"If 3x + 7 = 22, what is x?",5,3,7,15,,A,"3x = 15, so x = 5."`,
    `Verbal,mock,"Select the word most nearly opposite in meaning to ABUNDANT.",Scarce,Plentiful,Ample,Copious,,A,"Abundant means plentiful; its antonym is scarce."`,
  ].join("\n"),
};

export default function UploadClient({ subjects }: { subjects: Subject[] }) {
  const [track, setTrack] = useState<ExamTrack>(DEFAULT_TRACK);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; skipped: number; error?: string } | null>(null);
  const [isImporting, startImport] = useTransition();
  const [duplicates, setDuplicates] = useState<Record<number, DuplicateMatch[]>>({});
  const [checkingDuplicates, startDupCheck] = useTransition();

  // Only the chosen track's subjects are offered to the validator, so a sheet
  // uploaded under the wrong track reports "unknown subject" instead of quietly
  // filing NMAT questions under a PLE subject. The server repeats this.
  const trackSubjects = subjects.filter((s) => s.track === track);

  /** Re-check an already-loaded file against the newly chosen track's subjects. */
  function changeTrack(next: ExamTrack) {
    setTrack(next);
    setDone(null);
    if (rows.length === 0) return;
    setDuplicates({});
    setResult(validateRows(rows, subjects.filter((s) => s.track === next)));
  }

  function ingest(parsed: RawRow[]) {
    setParseError(null);
    setDone(null);
    setRows(parsed);
    setDuplicates({});
    const validated = validateRows(parsed, trackSubjects);
    setResult(validated);

    if (validated.valid.length > 0) {
      startDupCheck(async () => {
        const warnings = await checkDuplicateQuestions(
          validated.valid.map((q, i) => ({ rowIndex: i, subjectId: q.subject_id, stem: q.stem }))
        );
        const byRow: Record<number, DuplicateMatch[]> = {};
        for (const w of warnings) byRow[w.rowIndex] = w.matches;
        setDuplicates(byRow);
      });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        Papa.parse<RawRow>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (res) => ingest(res.data),
          error: (err) => setParseError(err.message),
        });
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
        ingest(json);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse file");
    }
  }

  function downloadTemplate() {
    const blob = new Blob([SAMPLES[track]], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medprep-${track}-question-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function commit() {
    if (!result || result.valid.length === 0) return;
    startImport(async () => {
      const res = await importQuestions(rows, track);
      setDone(res);
      if (!res.error) {
        setRows([]);
        setResult(null);
        setFileName(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Anyone arriving here to add a Perceptual Acuity item is in the wrong
          place, and nothing on this page would otherwise tell them. */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        A spreadsheet can&apos;t carry images. For questions with figures — NMAT
        Perceptual Acuity especially —{" "}
        <a href="/admin/questions/new?track=nmat" className="font-semibold underline">
          add them one at a time instead
        </a>
        .
      </div>

      <div>
        <h1 className="text-xl font-semibold">Bulk upload (text-only)</h1>
        <p className="text-sm text-[var(--muted)]">
          CSV or Excel with columns: {CSV_HEADERS.join(", ")}. <code>subject</code> must
          match one of the {trackSubjects.length} {TRACK_LABELS[track]} subjects (e.g.
          &quot;{trackSubjects[0]?.name ?? "Anatomy"}&quot;), and <code>category</code>{" "}
          is the exam type: <code>daily</code>, <code>weekly</code>, or <code>mock</code>{" "}
          (blank = daily).
        </p>
      </div>

      <div className="card">
        <label className="label" htmlFor="upload_track">Exam track</label>
        <select
          id="upload_track"
          className="input max-w-xs"
          value={track}
          onChange={(e) => changeTrack(e.target.value as ExamTrack)}
          disabled={isImporting}
        >
          {TRACK_ORDER.map((t) => (
            <option key={t} value={t}>
              {TRACK_LABELS[t]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Which bank these questions join. Subject names are matched within this
          track only.
        </p>
      </div>

      <div className="card flex flex-wrap items-center gap-3">
        <label className="btn-primary cursor-pointer">
          Choose file
          <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} className="hidden" />
        </label>
        <button onClick={downloadTemplate} className="btn-outline">
          Download CSV template
        </button>
        {fileName && <span className="text-sm text-[var(--muted)]">{fileName}</span>}
      </div>

      {parseError && (
        <div className="card text-sm text-[var(--danger)]">Parse error: {parseError}</div>
      )}

      {done && (
        <div className="card text-sm">
          {done.error ? (
            <span className="text-[var(--danger)]">{done.error}</span>
          ) : (
            <span className="text-[var(--primary)]">
              Imported {done.inserted} question{done.inserted === 1 ? "" : "s"}
              {done.skipped > 0 ? `, skipped ${done.skipped} invalid row(s)` : ""}.
            </span>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="badge bg-[var(--primary)]/10 text-[var(--primary)]">
              {result.valid.length} valid
            </span>
            <span className="badge bg-[var(--danger)]/10 text-[var(--danger)]">
              {result.errors.length} with errors
            </span>
            {checkingDuplicates ? (
              <span className="text-sm text-[var(--muted)]">Checking for duplicates…</span>
            ) : (
              Object.keys(duplicates).length > 0 && (
                <span className="badge bg-amber-100 text-amber-700">
                  {Object.keys(duplicates).length} possible duplicate
                  {Object.keys(duplicates).length === 1 ? "" : "s"}
                </span>
              )
            )}
            <span className="text-sm text-[var(--muted)]">{result.total} total rows</span>
            <button
              onClick={commit}
              disabled={isImporting || result.valid.length === 0}
              className="btn-primary ml-auto"
            >
              {isImporting ? "Importing…" : `Import ${result.valid.length} questions`}
            </button>
          </div>

          {result.errors.length > 0 && (
            <div className="card">
              <h2 className="mb-2 text-sm font-medium text-[var(--danger)]">
                Rows that will be skipped
              </h2>
              <div className="max-h-48 space-y-1 overflow-auto text-sm">
                {result.errors.map((e) => (
                  <div key={e.row}>
                    <span className="font-medium">Row {e.row}:</span>{" "}
                    <span className="text-[var(--muted)]">{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.valid.length > 0 && (
            <div className="card overflow-auto">
              <h2 className="mb-2 text-sm font-medium">Preview (first 10 valid)</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="py-1 pr-3">Subject</th>
                    <th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Stem</th>
                    <th className="py-1 pr-3">Opts</th>
                    <th className="py-1">Ans</th>
                  </tr>
                </thead>
                <tbody>
                  {result.valid.slice(0, 10).map((q, i) => {
                    const matches = duplicates[i];
                    return (
                      <Fragment key={i}>
                        <tr className="border-t border-[var(--border)]">
                          <td className="py-1.5 pr-3 whitespace-nowrap">{q.subject_name}</td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            {CATEGORY_LABELS[q.category]}
                          </td>
                          <td className="py-1.5 pr-3">
                            {q.stem.slice(0, 60)}{q.stem.length > 60 ? "…" : ""}
                          </td>
                          <td className="py-1.5 pr-3">{q.options.length}</td>
                          <td className="py-1.5 font-medium">{q.correct_label}</td>
                        </tr>
                        {matches && matches.length > 0 && (
                          <tr>
                            <td colSpan={5} className="pb-1.5 pl-1">
                              <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
                                ⚠ {Math.round(matches[0].similarity * 100)}% similar to an existing
                                question: “{matches[0].stem.slice(0, 80)}
                                {matches[0].stem.length > 80 ? "…" : ""}”
                                {matches.length > 1 ? ` (+${matches.length - 1} more match)` : ""}
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
