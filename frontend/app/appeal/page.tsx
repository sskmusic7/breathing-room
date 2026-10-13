"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  draftAppeal,
  type DraftAppealResult,
  type IssuerType,
  type MitigatingCircumstances,
  type StageOfNotice,
} from "../lib/api";
import { TopBar } from "../components/ui";

const ISSUERS: { type: IssuerType; label: string; nameLabel: string; stage: StageOfNotice; hasCode: boolean }[] = [
  { type: "local_council", label: "Council", nameLabel: "Council", stage: "penalty_charge_notice", hasCode: true },
  { type: "private_parking_operator", label: "Private", nameLabel: "Company", stage: "parking_charge_notice", hasCode: false },
  { type: "police", label: "Police", nameLabel: "Force", stage: "notice_of_intended_prosecution", hasCode: true },
  { type: "enforcement_agent", label: "Bailiff", nameLabel: "Firm", stage: "notice_to_owner", hasCode: false },
  { type: "creditor", label: "Creditor", nameLabel: "Creditor", stage: "letter_before_action", hasCode: false },
  { type: "court", label: "Court", nameLabel: "Claimant", stage: "county_court_claim", hasCode: false },
];

const STAGES: { value: StageOfNotice; label: string }[] = [
  { value: "penalty_charge_notice", label: "Penalty charge notice" },
  { value: "notice_to_owner", label: "Notice to owner" },
  { value: "charge_certificate", label: "Charge certificate" },
  { value: "notice_of_intended_prosecution", label: "Notice of intended prosecution" },
  { value: "parking_charge_notice", label: "Parking charge notice" },
  { value: "letter_before_action", label: "Letter before action" },
  { value: "county_court_claim", label: "County court claim" },
];

const REASONS: { key: "signage_obscured" | "was_loading" | "emergency_pickup"; label: string }[] = [
  { key: "signage_obscured", label: "The sign was hard to see" },
  { key: "was_loading", label: "I was loading or unloading" },
  { key: "emergency_pickup", label: "It was an emergency" },
];

type Step = "details" | "reasons" | "health" | "letter";

export default function AppealPage() {
  const [step, setStep] = useState<Step>("details");

  const [issuerType, setIssuerType] = useState<IssuerType>("local_council");
  const [issuerName, setIssuerName] = useState("");
  const [contraventionCode, setContraventionCode] = useState("");
  const [stageOfNotice, setStageOfNotice] = useState<StageOfNotice>("penalty_charge_notice");
  const [dateOfContravention, setDateOfContravention] = useState("");
  const [dateOfNotice, setDateOfNotice] = useState("");
  const [amountGbp, setAmountGbp] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [showWhere, setShowWhere] = useState(false);

  const [consentGiven, setConsentGiven] = useState(false);
  const [mitigating, setMitigating] = useState<MitigatingCircumstances>({});

  const [result, setResult] = useState<DraftAppealResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const issuer = ISSUERS.find((i) => i.type === issuerType)!;

  function pickIssuer(type: IssuerType) {
    setIssuerType(type);
    setStageOfNotice(ISSUERS.find((i) => i.type === type)!.stage);
  }

  function setConsent(on: boolean) {
    setConsentGiven(on);
    // Turning it off deletes what they typed, as the screen promises.
    if (!on) setMitigating((m) => ({ ...m, holds_blue_badge: false, neurodivergence_or_disability: null, dependant_crisis: null }));
  }

  async function draft() {
    setStep("letter");
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await draftAppeal({
        issuer_type: issuerType,
        issuer_name: issuerName,
        contravention_code: contraventionCode || null,
        stage_of_notice: stageOfNotice,
        date_of_contravention: dateOfContravention || null,
        date_of_notice: dateOfNotice || null,
        amount_gbp: amountGbp || null,
        reference_number: referenceNumber || null,
        // Reasons are always sent; health and personal-circumstance fields
        // only once consent has been given, so no special-category data is
        // included without it.
        mitigating: {
          emergency_pickup: mitigating.emergency_pickup,
          signage_obscured: mitigating.signage_obscured,
          was_loading: mitigating.was_loading,
          other_notes: mitigating.other_notes,
          ...(consentGiven
            ? {
                holds_blue_badge: mitigating.holds_blue_badge,
                neurodivergence_or_disability: mitigating.neurodivergence_or_disability,
              }
            : {}),
        },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (step === "details") {
    return (
      <div className="wrap">
        <TopBar back="/" />
        <h1 className="h2">Tell us about the letter</h1>
        <div className="flex flex-wrap gap-2">
          {ISSUERS.map((i) => (
            <button key={i.type} type="button" className="chip" aria-pressed={i.type === issuerType} onClick={() => pickIssuer(i.type)}>
              {i.label}
            </button>
          ))}
        </div>

        <div className="card flex flex-col gap-1">
          <DetailRow label={issuer.nameLabel} value={issuerName} onChange={setIssuerName} placeholder="e.g. Lambeth" />
          <DetailRow label="Reference" value={referenceNumber} onChange={setReferenceNumber} placeholder="LB44170921" />
          {issuer.hasCode && (
            <DetailRow label="Code" value={contraventionCode} onChange={setContraventionCode} placeholder="01" />
          )}
          <DetailRow label="Happened" type="date" value={dateOfContravention} onChange={setDateOfContravention} />
          <DetailRow label="Letter dated" type="date" value={dateOfNotice} onChange={setDateOfNotice} />
          <DetailRow label="Amount" value={amountGbp} onChange={setAmountGbp} placeholder="£70" inputMode="decimal" />
          <label className="row py-1.5">
            <span>Letter type</span>
            <select
              value={stageOfNotice}
              onChange={(e) => setStageOfNotice(e.target.value as StageOfNotice)}
              className="bg-transparent text-right font-semibold outline-none max-w-[60%]"
            >
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button type="button" onClick={() => setShowWhere((v) => !v)} className="self-start text-sm font-semibold underline underline-offset-[3px]">
          Where&apos;s this on my letter?
        </button>
        {showWhere && (
          <p className="text-sm leading-[1.45] text-muted -mt-2">
            The reference is usually at the top right, near a barcode, and often starts with letters. The code (if there is
            one) sits next to a short description of what you&apos;re said to have done. &quot;Happened&quot; is the date of
            the incident; &quot;Letter dated&quot; is the date printed on the letter itself.
          </p>
        )}

        <div className="mt-auto">
          <button type="button" className="btn" disabled={!issuerName.trim()} onClick={() => setStep("reasons")}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === "reasons") {
    return (
      <div className="wrap">
        <TopBar onBack={() => setStep("details")} />
        <h1 className="h2">Why should it be cancelled?</h1>
        <p className="text-[15px] text-muted -mt-2">Tap anything that applies. Not sure? Just write it in your own words.</p>
        <div className="flex flex-col gap-2">
          {REASONS.map((r) => (
            <button
              key={r.key}
              type="button"
              className="chip text-left py-3 rounded-2xl"
              aria-pressed={!!mitigating[r.key]}
              onClick={() => setMitigating((m) => ({ ...m, [r.key]: !m[r.key] }))}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="field">
          In your own words (optional)
          <textarea
            rows={3}
            value={mitigating.other_notes ?? ""}
            onChange={(e) => setMitigating((m) => ({ ...m, other_notes: e.target.value || null }))}
            className="input"
          />
        </label>
        <div className="mt-auto">
          <button type="button" className="btn" onClick={() => setStep("health")}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === "health") {
    return (
      <div className="wrap">
        <TopBar onBack={() => setStep("reasons")} />
        <h1 className="h2 text-[24px]">Was anything making things harder that day?</h1>

        <button
          type="button"
          role="switch"
          aria-checked={consentGiven}
          onClick={() => setConsent(!consentGiven)}
          className={`flex items-center justify-between gap-2.5 bg-card rounded-2xl px-4 py-3.5 border-[1.5px] ${consentGiven ? "border-ink" : "border-line"}`}
        >
          <span className="font-semibold text-[15px]">Add this to my letter</span>
          <span className={`relative w-[46px] h-7 rounded-full flex-none ${consentGiven ? "bg-ink" : "bg-line"}`}>
            <span className={`absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white transition-all ${consentGiven ? "right-[3px]" : "left-[3px]"}`} />
          </span>
        </button>

        {consentGiven ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px]">Blue Badge holder?</span>
              <span className="flex gap-1.5">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    className="chip text-[13px] px-3 py-[7px]"
                    aria-pressed={!!mitigating.holds_blue_badge === v}
                    onClick={() => setMitigating((m) => ({ ...m, holds_blue_badge: v }))}
                  >
                    {v ? "Yes" : "No"}
                  </button>
                ))}
              </span>
            </div>
            <OwnWords
              value={mitigating.neurodivergence_or_disability ?? ""}
              onChange={(v) => setMitigating((m) => ({ ...m, neurodivergence_or_disability: v || null }))}
            />
            <p className="text-[13px] leading-[1.45] text-muted">
              Used only for this letter. Turn it off any time and we delete it. By turning it on, you agree we can use these
              health or personal details to write this letter, and for nothing else.
            </p>
          </>
        ) : (
          <p className="text-[15px] leading-[1.45] text-muted">
            Things like a disability, a health condition or a family emergency can matter. Leaving this off won&apos;t weaken
            your letter.
          </p>
        )}

        <div className="mt-auto">
          <button type="button" className="btn" onClick={draft}>
            Write my letter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <TopBar onBack={() => setStep("health")} />
      {loading ? (
        <>
          <h1 className="h2">Writing your letter…</h1>
          <p className="text-[15px] leading-[1.45] text-muted">
            We&apos;re checking it against the law that applies to your letter. This can take up to 2 minutes, so put the kettle
            on.
          </p>
          <div className="card h-48 animate-pulse" />
        </>
      ) : error || !result ? (
        <>
          <h1 className="h2">That didn&apos;t work</h1>
          <p className="error">{error ?? "Something went wrong."}</p>
          <button type="button" className="btn" onClick={draft}>
            Try again
          </button>
        </>
      ) : (
        <>
          <h1 className="h2">Your letter is ready</h1>
          <div className="bg-white border border-line rounded-[10px] p-4 font-[Georgia,serif] text-[13.5px] leading-[1.6] text-[#222] whitespace-pre-wrap max-h-[52vh] overflow-auto">
            {result.letter.replace(/\*\*/g, "")}
          </div>
          <p className="text-xs leading-[1.45] text-muted">Draft only, not legal advice. You check it, sign it and send it.</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              navigator.clipboard.writeText(result.letter.replace(/\*\*/g, ""));
              setCopied(true);
            }}
          >
            {copied ? "Copied ✓" : "Copy letter"}
          </button>
          <Link href="/sfs" className="btn-ghost">
            Next: sort out what I owe →
          </Link>
        </>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: "decimal";
}) {
  return (
    <label className="row py-1.5">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-right font-semibold outline-none min-w-0 w-[58%] placeholder:text-muted/50 placeholder:font-normal"
      />
    </label>
  );
}

// "In your own words" with optional voice input (where the browser supports it).
function OwnWords({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const rec = new (w.SpeechRecognition || w.webkitSpeechRecognition)();
    rec.lang = "en-GB";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const said = e.results[0][0].transcript;
      onChange(valueRef.current ? `${valueRef.current} ${said}` : said);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="field">
        In your own words
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. I have ADHD and missed the sign while sorting the kids out."
          className="input rounded-[10px] leading-[1.4] placeholder:text-muted/60"
        />
      </label>
      {supported && (
        <button type="button" onClick={toggle} className="self-start flex items-center gap-2 text-[13px] font-semibold">
          <span className={`w-[30px] h-[30px] rounded-full bg-butter grid place-items-center ${listening ? "animate-pulse" : ""}`}>●</span>
          {listening ? "Listening… tap to stop" : "Tap to speak instead"}
        </button>
      )}
    </div>
  );
}
