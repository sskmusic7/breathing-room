"use client";

import { useEffect, useState } from "react";

import { Card, ErrorBox, Field, PageShell, buttonClass, inputClass } from "../components/ui";
import { DraftResult, MitigatingCircumstances, NoticeFacts, draftAppeal } from "../lib/api";

const ISSUER_TYPES = [
  ["local_council", "Local council"],
  ["private_parking_operator", "Private parking company"],
  ["police", "Police"],
  ["enforcement_agent", "Enforcement agent (bailiff)"],
  ["creditor", "Creditor"],
  ["court", "Court"],
];

const NOTICE_STAGES = [
  ["penalty_charge_notice", "Penalty Charge Notice (PCN)"],
  ["notice_to_owner", "Notice to Owner"],
  ["charge_certificate", "Charge Certificate"],
  ["notice_of_intended_prosecution", "Notice of Intended Prosecution"],
];

const EMPTY_FACTS = {
  issuer_type: "local_council",
  issuer_name: "",
  contravention_code: "",
  stage_of_notice: "penalty_charge_notice",
  date_of_contravention: "",
  date_of_notice: "",
  amount_gbp: "",
  reference_number: "",
};

const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

export default function AppealPage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [facts, setFacts] = useState(EMPTY_FACTS);
  const [mitigating, setMitigating] = useState<MitigatingCircumstances>({});
  const [consent, setConsent] = useState(false);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [letter, setLetter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Health details are wiped the moment consent is withdrawn, so nothing
  // collected under consent can leak into a later request without it.
  useEffect(() => {
    if (!consent) {
      setMitigating((m) => ({ ...m, neurodivergence_or_disability: null, dependant_crisis: null }));
    }
  }, [consent]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo);
  }, [photo]);

  const set = (key: keyof typeof EMPTY_FACTS) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFacts({ ...facts, [key]: e.target.value });

  function loadDemo() {
    setFacts({
      issuer_type: "local_council",
      issuer_name: "Camden Council",
      contravention_code: "01",
      stage_of_notice: "penalty_charge_notice",
      date_of_contravention: "2026-09-01",
      date_of_notice: "2026-09-03",
      amount_gbp: "130.00",
      reference_number: "CD12345678",
    });
    setMitigating({ signage_obscured: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body: NoticeFacts = {
        issuer_type: facts.issuer_type,
        issuer_name: facts.issuer_name.trim(),
        contravention_code: orNull(facts.contravention_code),
        stage_of_notice: facts.stage_of_notice,
        date_of_contravention: orNull(facts.date_of_contravention),
        date_of_notice: orNull(facts.date_of_notice),
        amount_gbp: orNull(facts.amount_gbp),
        reference_number: orNull(facts.reference_number),
        health_data_consent: consent,
        mitigating: consent
          ? mitigating
          : { ...mitigating, neurodivergence_or_disability: null, dependant_crisis: null },
      };
      const result = await draftAppeal(body);
      setDraft(result);
      setLetter(result.letter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  function downloadLetter() {
    const blob = new Blob([letter], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appeal-${facts.reference_number || "draft"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const checkbox = (key: keyof MitigatingCircumstances, label: string) => (
    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
      <input
        type="checkbox"
        checked={Boolean(mitigating[key])}
        onChange={(e) => setMitigating({ ...mitigating, [key]: e.target.checked })}
      />
      {label}
    </label>
  );

  return (
    <PageShell
      title="Appeal a notice"
      intro="Photograph or upload your notice, check the details, and we'll draft a formal representation grounded in the relevant UK law for you to review."
    >
      <button type="button" onClick={loadDemo} className="text-sm font-medium text-teal-700 hover:underline">
        Try it with an example notice
      </button>
      <form onSubmit={submit} className="space-y-6">
        <Card title="1. Your notice">
          <Field label="Take a photo or upload the notice" hint="Automatic reading of the notice is coming soon — for now, please type the details below.">
            <input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="block w-full text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setPhoto(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
              }}
            />
          </Field>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Uploaded notice" className="mt-4 max-h-64 rounded-lg border border-slate-200" />
          )}
        </Card>

        <Card title="2. Notice details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who issued it?">
              <select className={inputClass} value={facts.issuer_type} onChange={set("issuer_type")}>
                {ISSUER_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Issuer name">
              <input required className={inputClass} placeholder="e.g. Camden Council" value={facts.issuer_name} onChange={set("issuer_name")} />
            </Field>
            <Field label="Type of notice">
              <select className={inputClass} value={facts.stage_of_notice} onChange={set("stage_of_notice")}>
                {NOTICE_STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Contravention code" hint="Usually a two-digit number on the notice">
              <input className={inputClass} value={facts.contravention_code} onChange={set("contravention_code")} />
            </Field>
            <Field label="Date of the alleged contravention">
              <input type="date" className={inputClass} value={facts.date_of_contravention} onChange={set("date_of_contravention")} />
            </Field>
            <Field label="Date of the notice">
              <input type="date" className={inputClass} value={facts.date_of_notice} onChange={set("date_of_notice")} />
            </Field>
            <Field label="Amount (£)">
              <input type="number" min="0" step="0.01" className={inputClass} value={facts.amount_gbp} onChange={set("amount_gbp")} />
            </Field>
            <Field label="Reference number">
              <input className={inputClass} value={facts.reference_number} onChange={set("reference_number")} />
            </Field>
          </div>
        </Card>

        <Card title="3. What happened?">
          <div className="space-y-2">
            {checkbox("signage_obscured", "Signs or road markings were missing, unclear or obscured")}
            {checkbox("was_loading", "I was loading or unloading")}
            {checkbox("emergency_pickup", "I was dealing with an emergency")}
            {checkbox("holds_blue_badge", "I hold a Blue Badge")}
          </div>
          <Field label="Anything else? (optional)">
            <textarea
              rows={3}
              className={`${inputClass} mt-1`}
              value={mitigating.other_notes ?? ""}
              onChange={(e) => setMitigating({ ...mitigating, other_notes: e.target.value || null })}
            />
          </Field>
        </Card>

        <Card title="4. Health or personal circumstances (optional)">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            A disability, neurodivergence or a family crisis can be relevant to an appeal under the
            Equality Act 2010. This is sensitive information, so we only ask for it with your
            explicit permission. You can skip this section entirely.
          </p>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I give permission for Breathing Room to process my health/neurodivergence details
              strictly to draft legal mitigating-circumstance letters.
            </span>
          </label>
          {consent && (
            <div className="mt-4 space-y-4">
              <Field label="Disability or neurodivergence, in your own words">
                <textarea
                  rows={3}
                  className={inputClass}
                  value={mitigating.neurodivergence_or_disability ?? ""}
                  onChange={(e) => setMitigating({ ...mitigating, neurodivergence_or_disability: e.target.value || null })}
                />
              </Field>
              <Field label="A crisis involving someone who depends on you">
                <textarea
                  rows={3}
                  className={inputClass}
                  value={mitigating.dependant_crisis ?? ""}
                  onChange={(e) => setMitigating({ ...mitigating, dependant_crisis: e.target.value || null })}
                />
              </Field>
            </div>
          )}
        </Card>

        <ErrorBox message={error} />
        <button type="submit" className={buttonClass} disabled={loading}>
          {loading ? "Drafting…" : "Draft my appeal"}
        </button>
      </form>

      {draft && (
        <Card title="Your draft letter">
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            This is a draft. Read it carefully, edit anything that isn&apos;t accurate, then sign and
            send it yourself.
          </p>
          <textarea
            rows={18}
            className={`${inputClass} font-mono text-sm`}
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={buttonClass} onClick={copyLetter}>
              {copied ? "Copied" : "Copy letter"}
            </button>
            <button type="button" className={buttonClass} onClick={downloadLetter}>
              Download
            </button>
          </div>
          {draft.citations.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Law this draft relies on</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
                {draft.citations.map((c, i) => (
                  <li key={i}>
                    {c.title}
                    {c.citation && <span className="text-slate-500"> — {c.citation}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </PageShell>
  );
}
