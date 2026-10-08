"use client";

import { useState } from "react";
import Link from "next/link";
import {
  draftAppeal,
  type DraftAppealResult,
  type IssuerType,
  type MitigatingCircumstances,
  type StageOfNotice,
} from "../lib/api";

export default function AppealPage() {
  const [issuerType, setIssuerType] = useState<IssuerType>("private_parking_operator");
  const [issuerName, setIssuerName] = useState("");
  const [contraventionCode, setContraventionCode] = useState("");
  const [stageOfNotice, setStageOfNotice] = useState<StageOfNotice>("notice_to_owner");
  const [dateOfContravention, setDateOfContravention] = useState("");
  const [dateOfNotice, setDateOfNotice] = useState("");
  const [amountGbp, setAmountGbp] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");

  const [consentGiven, setConsentGiven] = useState(false);
  const [mitigating, setMitigating] = useState<MitigatingCircumstances>({});

  const [result, setResult] = useState<DraftAppealResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const draft = await draftAppeal({
        issuer_type: issuerType,
        issuer_name: issuerName,
        contravention_code: contraventionCode || null,
        stage_of_notice: stageOfNotice,
        date_of_contravention: dateOfContravention || null,
        date_of_notice: dateOfNotice || null,
        amount_gbp: amountGbp || null,
        reference_number: referenceNumber || null,
        // Only ever send mitigating fields once consent has been explicitly
        // given — if consent is withheld, submit an empty object so no
        // special-category data is included at all.
        mitigating: consentGiven ? mitigating : {},
      });
      setResult(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Home
        </Link>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-2 mb-2">
          Draft a representation
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Auto-extracting these details from a photo of your notice is coming
          soon. For now, enter them yourself below.
        </p>

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="bg-white dark:bg-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-slate-600 dark:text-slate-300">
                Issuer type
                <select
                  value={issuerType}
                  onChange={(e) => setIssuerType(e.target.value as IssuerType)}
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 mt-1"
                >
                  <option value="local_council">Local council</option>
                  <option value="private_parking_operator">Private parking operator</option>
                  <option value="police">Police</option>
                  <option value="enforcement_agent">Enforcement agent</option>
                  <option value="creditor">Creditor</option>
                  <option value="court">Court</option>
                </select>
              </label>
              <label className="text-sm text-slate-600 dark:text-slate-300">
                Stage of notice
                <select
                  value={stageOfNotice}
                  onChange={(e) => setStageOfNotice(e.target.value as StageOfNotice)}
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 mt-1"
                >
                  <option value="penalty_charge_notice">Penalty charge notice</option>
                  <option value="notice_to_owner">Notice to owner</option>
                  <option value="charge_certificate">Charge certificate</option>
                  <option value="notice_of_intended_prosecution">
                    Notice of intended prosecution
                  </option>
                  <option value="parking_charge_notice">Parking charge notice</option>
                  <option value="letter_before_action">Letter before action</option>
                  <option value="county_court_claim">County court claim</option>
                </select>
              </label>
              <TextField label="Issuer name" value={issuerName} onChange={setIssuerName} />
              <TextField
                label="Contravention code"
                value={contraventionCode}
                onChange={setContraventionCode}
              />
              <TextField
                label="Date of contravention"
                type="date"
                value={dateOfContravention}
                onChange={setDateOfContravention}
              />
              <TextField label="Date of notice" type="date" value={dateOfNotice} onChange={setDateOfNotice} />
              <TextField label="Amount (£)" value={amountGbp} onChange={setAmountGbp} />
              <TextField
                label="Reference number"
                value={referenceNumber}
                onChange={setReferenceNumber}
              />
            </div>
          </section>

          <section className="bg-white dark:bg-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200">
              Mitigating circumstances (optional)
            </h2>
            <label className="flex items-start gap-2 text-sm bg-slate-50 dark:bg-slate-900 rounded p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={consentGiven}
                onChange={(e) => {
                  setConsentGiven(e.target.checked);
                  if (!e.target.checked) setMitigating({});
                }}
              />
              <span>
                I give permission for Breathing Room to process my health/neurodivergence
                details strictly to draft legal mitigating-circumstance letters.
              </span>
            </label>

            {!consentGiven && (
              <p className="text-xs text-slate-400">
                Tick the box above to add any health, neurodivergence, or other
                personal circumstances — these fields stay hidden until you
                consent.
              </p>
            )}

            {consentGiven && (
              <div className="space-y-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <CheckField
                    label="Emergency pickup"
                    checked={!!mitigating.emergency_pickup}
                    onChange={(v) => setMitigating((m) => ({ ...m, emergency_pickup: v }))}
                  />
                  <CheckField
                    label="Signage was obscured"
                    checked={!!mitigating.signage_obscured}
                    onChange={(v) => setMitigating((m) => ({ ...m, signage_obscured: v }))}
                  />
                  <CheckField
                    label="Was loading/unloading"
                    checked={!!mitigating.was_loading}
                    onChange={(v) => setMitigating((m) => ({ ...m, was_loading: v }))}
                  />
                  <CheckField
                    label="Holds a Blue Badge"
                    checked={!!mitigating.holds_blue_badge}
                    onChange={(v) => setMitigating((m) => ({ ...m, holds_blue_badge: v }))}
                  />
                </div>
                <TextField
                  label="Neurodivergence or disability (free text, optional)"
                  value={mitigating.neurodivergence_or_disability ?? ""}
                  onChange={(v) =>
                    setMitigating((m) => ({ ...m, neurodivergence_or_disability: v || null }))
                  }
                />
                <TextField
                  label="Dependant crisis (free text, optional)"
                  value={mitigating.dependant_crisis ?? ""}
                  onChange={(v) => setMitigating((m) => ({ ...m, dependant_crisis: v || null }))}
                />
                <TextField
                  label="Other notes"
                  value={mitigating.other_notes ?? ""}
                  onChange={(v) => setMitigating((m) => ({ ...m, other_notes: v || null }))}
                />
              </div>
            )}
          </section>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 py-3 font-semibold disabled:opacity-50"
          >
            {loading ? "Drafting…" : "Draft my representation"}
          </button>
        </form>

        {result && (
          <section className="mt-8 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm space-y-3">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200">Your draft</h2>
            <pre className="whitespace-pre-wrap text-sm font-sans bg-slate-50 dark:bg-slate-900 rounded p-3">
              {result.letter}
            </pre>
            <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-900 rounded p-2">
              This is a draft only. Breathing Room provides legal information and
              software tools, not legal advice — review, personalise, and sign it
              yourself before sending. {result.used_llm ? "" : "(Generated from the deterministic template — set a KIMI API key for LLM-drafted prose.)"}
            </p>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(result.letter)}
              className="text-sm text-blue-600 hover:underline"
            >
              Copy to clipboard
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="text-sm text-slate-600 dark:text-slate-300">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 mt-1"
      />
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
