"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import {
  getMe,
  saveLetterCreditor,
  saveMeLetter,
  startJob,
  waitForJob,
  type ScannedLetter,
  type SavedLetter,
  type DraftAppealResult,
  type IssuerType,
  type MitigatingCircumstances,
  type StageOfNotice,
} from "../lib/api";
import { KettleIllustration, Sheet, TopBar } from "../components/ui";
import LetterGuide from "../components/LetterGuide";

const PENDING_LETTER_KEY = "breathing-room:pending-letter";

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
  { value: "notice_of_intended_prosecution", label: "Speeding / camera notice" },
  { value: "parking_charge_notice", label: "Parking charge notice" },
  { value: "letter_before_action", label: "Letter before action" },
  { value: "county_court_claim", label: "County court claim" },
];

const REASONS: { key: "signage_obscured" | "was_loading" | "emergency_pickup"; label: string }[] = [
  { key: "signage_obscured", label: "The sign was hard to see" },
  { key: "was_loading", label: "I was loading or unloading" },
  { key: "emergency_pickup", label: "It was an emergency" },
];

type Step = "details" | "reasons" | "health" | "letter" | "police";

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
  const [scanState, setScanState] = useState<"idle" | "reading" | "filled" | "error">("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<ScannedLetter | null>(null);

  const [consentGiven, setConsentGiven] = useState(false);
  const [mitigating, setMitigating] = useState<MitigatingCircumstances>({});

  const [result, setResult] = useState<DraftAppealResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const issuer = ISSUERS.find((i) => i.type === issuerType)!;

  // Saved letters: every drafted letter is kept on the person's account.
  const { user, getAccessToken } = usePrivy();
  const { login } = useLogin();
  const [letters, setLetters] = useState<SavedLetter[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SavedLetter | null>(null);

  useEffect(() => {
    if (!user) return;
    getAccessToken().then((t) => {
      if (t) getMe(t).then((me) => setLetters(me.letters)).catch(() => {});
    });
  }, [user, getAccessToken]);

  // Save the draft as soon as there's both a letter and a login (also after
  // "Log in to save" on the letter screen).
  useEffect(() => {
    if (!result || !user || savedId) return;
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const saved = await saveMeLetter(token, {
        issuer_name: issuerName,
        issuer_type: issuerType,
        reference_number: referenceNumber || null,
        amount_gbp: amountGbp || null,
        letter: result.letter.replace(/\*\*/g, ""),
      }).catch(() => null);
      if (saved) {
        setSavedId(saved.id);
        setLetters((l) => [saved, ...l]);
      }
    })();
  }, [result, user, savedId, getAccessToken, issuerName, issuerType, referenceNumber, amountGbp]);

  function pickIssuer(type: IssuerType) {
    setIssuerType(type);
    setStageOfNotice(ISSUERS.find((i) => i.type === type)!.stage);
  }

  // Scan a letter: shrink the photo on the phone, then KIMI vision reads it
  // and fills the form for the user to check.
  async function onScan(file: File) {
    setScanState("reading");
    setScanError(null);
    try {
      const jobId = await startJob("scan-letter", { image: await shrinkPhoto(file) });
      const f = await waitForJob<ScannedLetter>(jobId, 3);
      if (f.issuer_type) pickIssuer(f.issuer_type);
      if (f.stage_of_notice) setStageOfNotice(f.stage_of_notice);
      if (f.issuer_name) setIssuerName(f.issuer_name);
      if (f.reference_number) setReferenceNumber(f.reference_number);
      if (f.contravention_code) setContraventionCode(f.contravention_code);
      if (f.date_of_contravention) setDateOfContravention(f.date_of_contravention);
      if (f.date_of_notice) setDateOfNotice(f.date_of_notice);
      if (f.amount_gbp != null) setAmountGbp(String(f.amount_gbp));
      saveLetterCreditor(f);
      setScanned(f);
      setScanState("filled");
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
      setScanState("error");
    }
  }

  function setConsent(on: boolean) {
    setConsentGiven(on);
    // Turning it off deletes what they typed, as the screen promises.
    if (!on) setMitigating((m) => ({ ...m, holds_blue_badge: false, neurodivergence_or_disability: null, dependant_crisis: null }));
  }

  // If the page was closed while a letter was being written, pick it back up.
  useEffect(() => {
    let pending: { jobId: string; issuerName: string; issuerType: IssuerType; referenceNumber: string; amountGbp: string } | null = null;
    try {
      pending = JSON.parse(localStorage.getItem(PENDING_LETTER_KEY) || "null");
    } catch {}
    if (!pending) return;
    setIssuerName(pending.issuerName);
    setIssuerType(pending.issuerType);
    setReferenceNumber(pending.referenceNumber);
    setAmountGbp(pending.amountGbp);
    setStep("letter");
    setLoading(true);
    finishLetter(pending.jobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finishLetter(jobId: string) {
    try {
      const res = await waitForJob<DraftAppealResult>(jobId);
      setResult(res);
      ping();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      try {
        localStorage.removeItem(PENDING_LETTER_KEY);
      } catch {}
      setLoading(false);
    }
  }

  async function draft() {
    setStep("letter");
    setError(null);
    setResult(null);
    setSavedId(null);
    setLoading(true);
    let jobId: string;
    try {
      jobId = await startJob("draft-appeal", {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
      return;
    }
    try {
      localStorage.setItem(PENDING_LETTER_KEY, JSON.stringify({ jobId, issuerName, issuerType, referenceNumber, amountGbp }));
    } catch {}
    await finishLetter(jobId);
  }

  if (viewing) {
    return (
      <div className="wrap">
        <TopBar onBack={() => setViewing(null)} />
        <h1 className="h2">{viewing.issuer_name || "Your letter"}</h1>
        <p className="text-[13px] text-muted -mt-2">
          {viewing.reference_number ? `Reference ${viewing.reference_number}. ` : ""}
          Written {new Date(viewing.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </p>
        <div className="bg-white border border-line rounded-[6px] p-4 font-[Georgia,serif] text-[13.5px] leading-[1.6] text-[#222] whitespace-pre-wrap max-h-[58vh] overflow-auto">
          {viewing.letter}
        </div>
        <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(viewing.letter)}>
          Copy letter
        </button>
      </div>
    );
  }

  if (step === "details") {
    return (
      <div className="wrap">
        <TopBar back="/" />
        {letters.length > 0 && (
          <details className="card">
            <summary className="cursor-pointer font-semibold flex items-center justify-between">
              <span>Your letters</span>
              <span className="text-sm text-muted font-medium">{letters.length} saved</span>
            </summary>
            <ul className="mt-2 flex flex-col">
              {letters.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => setViewing(l)} className="w-full text-left py-2 border-t border-line flex justify-between gap-2 text-sm">
                    <span className="font-semibold truncate">
                      {l.issuer_name || "Letter"}
                      {l.reference_number ? <span className="text-muted font-normal">, {l.reference_number}</span> : null}
                    </span>
                    <span className="text-muted flex-none">
                      {new Date(l.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <h1 className="h2">Tell us about the letter</h1>
        <label
          id="scan"
          className={`flex items-center gap-3 cursor-pointer rounded-2xl px-4 py-4 bg-butter/25 border-[1.5px] border-butter ${scanState === "reading" ? "animate-pulse" : ""}`}
        >
          <span className="w-12 h-12 flex-none rounded-full bg-butter grid place-items-center" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F2340" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
          <span className="flex flex-col">
            <span className="font-semibold text-[15px]">
              {scanState === "reading" ? "Reading your letter…" : scanState === "filled" ? "Scan another letter" : "Photograph or upload your letter"}
            </span>
            <span className="text-[13px] text-muted">
              {scanState === "reading"
                ? "Please wait while we fill in the details for you."
                : "We will fill in the details for you. Your photo is not stored."}
            </span>
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={scanState === "reading"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onScan(file);
              e.target.value = "";
            }}
          />
        </label>
        {scanState === "filled" && (
          <p className="text-[13px] font-semibold text-safe -mt-2">We have filled in the details from your photo. Please check each one.</p>
        )}
        {scanState === "error" && <p className="error -mt-2">{scanError}</p>}
        {scanState === "filled" && scanned && (
          <LetterGuide
            kind={scanned.letter_kind}
            respondBy={scanned.respond_by}
            fees={scanned.fees_added_gbp}
            originalCreditor={scanned.original_creditor}
          />
        )}
        <p className="text-[13px] text-muted text-center -my-1">Or enter the details yourself below.</p>
        <div className="flex flex-wrap gap-2">
          {ISSUERS.map((i) => (
            <button key={i.type} type="button" className="chip" aria-pressed={i.type === issuerType} onClick={() => pickIssuer(i.type)}>
              {i.label}
            </button>
          ))}
        </div>

        <div className="card flex flex-col gap-1">
          <DetailRow label={issuer.nameLabel} required value={issuerName} onChange={setIssuerName} placeholder={issuerType === "local_council" ? "For example, Lambeth" : issuerType === "private_parking_operator" ? "For example, UK Car Park Management" : "Who sent the letter"} />
          <DetailRow label="Reference" required value={referenceNumber} onChange={setReferenceNumber} placeholder="LB44170921" />
          {issuer.hasCode && (
            <DetailRow label="Code" value={contraventionCode} onChange={setContraventionCode} placeholder="01" />
          )}
          <DetailRow label="Date of occurrence" type="date" value={dateOfContravention} onChange={setDateOfContravention} />
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
          Where can I find these details?
        </button>
        {showWhere && (
          <p className="text-sm leading-[1.45] text-muted -mt-2">
            The reference is usually at the top right, near a barcode, and often starts with letters. The code (if there is
            one) sits next to a short description of what you&apos;re said to have done. &quot;Date of occurrence&quot; is
            when the incident happened; &quot;Letter dated&quot; is the date printed on the letter itself.
          </p>
        )}

        <div className="mt-auto">
          <button type="button" className="btn" disabled={!issuerName.trim() || !referenceNumber.trim()} onClick={() => setStep(issuerType === "police" ? "police" : "reasons")}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === "police") {
    // A Notice of Intended Prosecution is a criminal matter with a legal duty
    // to name the driver: we never draft a letter for it.
    return (
      <div className="wrap">
        <TopBar onBack={() => setStep("details")} />
        <h1 className="h2">What to do with a speeding or camera notice</h1>
        <LetterGuide kind="police_nip" respondBy={null} fees={null} originalCreditor={null} />
        <p className="text-[14px] leading-[1.5] text-muted">
          We do not write letters for police notices, because the law requires a specific response: you must name the driver
          within 28 days using the form or website on the notice. If you want to dispute the offence itself, please get free
          legal advice first.
        </p>
        <Link href="/sfs" className="btn-ghost">
          Plan my repayments instead
        </Link>
      </div>
    );
  }

  if (step === "reasons") {
    return (
      <div className="wrap">
        <TopBar onBack={() => setStep("details")} />
        <h1 className="h2">Reason for appeal</h1>
        <p className="text-[15px] text-muted -mt-2">
          Tell us what happened, in your own words. Even if it can&apos;t be cancelled, it may be reduced.
        </p>
        <label className="field">
          What happened?
          <textarea
            rows={4}
            value={mitigating.other_notes ?? ""}
            onChange={(e) => setMitigating((m) => ({ ...m, other_notes: e.target.value || null }))}
            placeholder="For example: I stopped for two minutes to drop off my mother, and the sign was hidden behind a tree."
            className="input placeholder:text-muted/60"
          />
        </label>
        <span className="text-[13px] font-semibold text-muted">Select any that also apply</span>
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
        <h1 className="h2 text-[24px]">Was there anything causing you distress that day?</h1>

        <button
          type="button"
          role="switch"
          aria-checked={consentGiven}
          onClick={() => setConsent(!consentGiven)}
          className={`flex items-center justify-between gap-2.5 bg-card rounded-2xl px-4 py-3.5 border-[1.5px] ${consentGiven ? "border-ink" : "border-line"}`}
        >
          <span className="font-semibold text-[15px]">Include this in my letter</span>
          <span className={`relative w-[46px] h-7 rounded-full flex-none ${consentGiven ? "bg-ink" : "bg-line"}`}>
            <span className={`absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white transition-all ${consentGiven ? "right-[3px]" : "left-[3px]"}`} />
          </span>
        </button>

        {consentGiven ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px]">Do you hold a Blue Badge?</span>
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
            Circumstances such as a disability, a health condition or a family emergency can be taken into account. Leaving this out will not weaken
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
          <KettleIllustration animated />
          <h1 className="h2">Put the kettle on.</h1>
          <p className="text-[15px] leading-[1.45] text-muted">
            We&apos;re writing your letter and checking it against the law that applies to you. We&apos;ll give you a shout when
            it&apos;s ready. You can leave this screen and come back.
          </p>
          <PingMe />
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
          <div className="bg-white border border-line rounded-[6px] p-4 font-[Georgia,serif] text-[13.5px] leading-[1.6] text-[#222] whitespace-pre-wrap max-h-[52vh] overflow-auto">
            {result.letter.replace(/\*\*/g, "")}
          </div>
          {result.citations.length > 0 && (
            <details className="text-[13px] leading-[1.45]">
              <summary className="cursor-pointer font-semibold">Laws this letter relies on</summary>
              <ul className="list-disc pl-5 mt-1 text-muted">
                {result.citations.map((c, i) => (
                  <li key={i}>{String(c.title ?? c.citation ?? "UK law")}{c.citation && c.title ? ` (${String(c.citation)})` : ""}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs leading-[1.45] text-muted">
            Draft only, not legal advice. It was prepared by our letter tool (which uses AI) from UK law, and may contain mistakes:
            check every fact, then sign and send it yourself. Check the deadline on your letter and send it in time; discounts
            often end after 14 days. Unsure? National Debtline (0808 808 4000) will check it for free.
          </p>
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
          {savedId ? (
            <p className="text-[13px] font-semibold text-safe text-center">Saved to your letters ✓</p>
          ) : !user ? (
            <>
              <p className="text-[13px] text-rust text-center">
                This letter is not saved yet. Copy it or log in, or it will be lost when you leave this page.
              </p>
              <button type="button" className="btn-ghost" onClick={() => login()}>
                Log in to save this letter
              </button>
            </>
          ) : null}
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
  required,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: "decimal";
}) {
  return (
    <label className="row py-1.5">
      <span>
        {label}
        {required && <span className="text-rust"> *</span>}
      </span>
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

  const [examples, setExamples] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted">In your own words</span>
        <button type="button" onClick={() => setExamples(true)} className="text-[13px] font-semibold text-safe underline underline-offset-2">
          For example…
        </button>
      </div>
      <Sheet open={examples} onClose={() => setExamples(false)} title="Things that can count">
        <p className="text-sm leading-[1.45] text-muted">
          Councils and companies must consider circumstances like these. Include only what&apos;s true for you.
        </p>
        <ul className="list-disc pl-5 text-sm leading-[1.5] flex flex-col gap-1">
          <li>A disability, illness or health condition, including mental health or neurodivergence such as ADHD or autism</li>
          <li>You hold a Blue Badge, or were helping someone who does</li>
          <li>A medical emergency, or caring for a child or relative who needed you urgently</li>
          <li>A bereavement or a family crisis around that time</li>
          <li>Your car broke down, or something outside your control stopped you moving it</li>
          <li>You were pregnant, or had a newborn with you</li>
        </ul>
        <p className="text-[12px] leading-[1.45] text-muted">
          These are examples, not legal advice. Sharing them doesn&apos;t guarantee the charge will be cancelled or reduced. Add
          evidence if you have it, such as a letter from your doctor.
        </p>
        <button type="button" className="btn" onClick={() => setExamples(false)}>
          Got it
        </button>
      </Sheet>
      <label className="field">
        <span className="sr-only">In your own words</span>
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="For example: I have ADHD and missed the sign while looking after my children."
          className="input rounded-[6px] leading-[1.4] placeholder:text-muted/60"
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

// Phone photos are 3-12MB; ~1600px JPEG keeps the text readable and the upload small.
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// "Give you a shout": a notification (where the phone allows it), a buzz and
// the tab title, when the letter is ready.
function ping() {
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {}
  if (typeof document !== "undefined") document.title = "✓ Your letter is ready";
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden)
      new Notification("Your letter is ready", { body: "Breathing Room has finished your letter.", icon: "/icons/android-chrome-192x192.png" });
  } catch {}
}

function PingMe() {
  const [state, setState] = useState<"ask" | "on" | "hidden">("hidden");
  useEffect(() => {
    if (!("Notification" in window)) return;
    setState(Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "hidden" : "ask");
  }, []);
  if (state === "hidden") return null;
  return state === "on" ? (
    <p className="text-[13px] font-semibold text-safe">We&apos;ll ping you when it&apos;s ready ✓</p>
  ) : (
    <button
      type="button"
      className="btn-ghost"
      onClick={() => Notification.requestPermission().then((p) => setState(p === "granted" ? "on" : "hidden"))}
    >
      Ping me when it&apos;s ready
    </button>
  );
}
