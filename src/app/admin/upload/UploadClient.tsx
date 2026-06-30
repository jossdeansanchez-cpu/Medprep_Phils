"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { CSV_HEADERS, validateRows, type RawRow, type ValidationResult } from "@/lib/csv";
import { importQuestions } from "@/app/admin/actions";
import type { Subject } from "@/lib/types";

const SAMPLE = [
  CSV_HEADERS.join(","),
  `Anatomy,"The brachial plexus is formed by the ventral rami of which spinal nerves?",C5-T1,C3-C5,L1-L4,T1-T4,,A,"The brachial plexus arises from ventral rami of C5 through T1."`,
  `Pharmacology,"Which drug is a beta-blocker?",Metoprolol,Amlodipine,Losartan,Furosemide,,A,"Metoprolol is a selective beta-1 adrenergic blocker."`,
].join("\n");

export default function UploadClient({ subjects }: { subjects: Subject[] }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; skipped: number; error?: string } | null>(null);
  const [isImporting, startImport] = useTransition();

  function ingest(parsed: RawRow[]) {
    setParseError(null);
    setDone(null);
    setRows(parsed);
    setResult(validateRows(parsed, subjects));
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
    const blob = new Blob([SAMPLE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "medprep-question-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function commit() {
    if (!result || result.valid.length === 0) return;
    startImport(async () => {
      const res = await importQuestions(rows);
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
      <div>
        <h1 className="text-xl font-semibold">Upload question bank</h1>
        <p className="text-sm text-[var(--muted)]">
          CSV or Excel with columns: {CSV_HEADERS.join(", ")}. The{" "}
          <code>subject</code> must match one of the 12 PLE subjects (e.g. &quot;Anatomy&quot;).
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
                    <th className="py-1 pr-3">Stem</th>
                    <th className="py-1 pr-3">Opts</th>
                    <th className="py-1">Ans</th>
                  </tr>
                </thead>
                <tbody>
                  {result.valid.slice(0, 10).map((q, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{q.subject_name}</td>
                      <td className="py-1.5 pr-3">{q.stem.slice(0, 70)}{q.stem.length > 70 ? "…" : ""}</td>
                      <td className="py-1.5 pr-3">{q.options.length}</td>
                      <td className="py-1.5 font-medium">{q.correct_label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
