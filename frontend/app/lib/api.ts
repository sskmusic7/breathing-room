const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type DebtCategory = "priority" | "non_priority";

export interface Income {
  employment_income: number;
  benefits_income: number;
  other_income: number;
  deductions: number;
}

export interface Outgoings {
  fixed_costs: number;
  flexible_costs: number;
}

export interface Creditor {
  id: string;
  name: string;
  category: DebtCategory;
  balance: number;
  priority_token_offer?: number | null;
  is_ccj: boolean;
}

export interface SfsRequest {
  income: Income;
  outgoings: Outgoings;
  creditors: Creditor[];
  savings_buffer: number;
}

export interface CreditorAllocation {
  creditor_id: string;
  name: string;
  category: DebtCategory;
  balance: string;
  debt_share_pct: string;
  strict_pro_rata_share: string;
  pragmatic_offer: string;
  pro_rata_share_bps: number;
}

export interface SfsResult {
  total_income: string;
  total_outgoings: string;
  net_disposable_income: string;
  savings_buffer: string;
  surplus_for_creditors: string;
  is_token_payment_territory: boolean;
  allocations: CreditorAllocation[];
}

export async function calculateSfs(request: SfsRequest): Promise<SfsResult> {
  const res = await fetch(`${API_URL}/calculate-sfs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`calculate-sfs failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type IssuerType =
  | "local_council"
  | "private_parking_operator"
  | "police"
  | "enforcement_agent"
  | "creditor"
  | "court";

export type StageOfNotice =
  | "penalty_charge_notice"
  | "notice_to_owner"
  | "charge_certificate"
  | "notice_of_intended_prosecution"
  | "parking_charge_notice"
  | "letter_before_action"
  | "county_court_claim";

export interface MitigatingCircumstances {
  emergency_pickup?: boolean;
  signage_obscured?: boolean;
  was_loading?: boolean;
  neurodivergence_or_disability?: string | null;
  dependant_crisis?: string | null;
  holds_blue_badge?: boolean;
  other_notes?: string | null;
}

export interface NoticeFacts {
  issuer_type: IssuerType;
  issuer_name: string;
  contravention_code?: string | null;
  stage_of_notice: StageOfNotice;
  date_of_contravention?: string | null;
  date_of_notice?: string | null;
  amount_gbp?: string | null;
  reference_number?: string | null;
  mitigating: MitigatingCircumstances;
}

export interface DraftAppealResult {
  letter: string;
  citations: Array<Record<string, unknown>>;
  used_llm: boolean;
}

export async function draftAppeal(facts: NoticeFacts): Promise<DraftAppealResult> {
  const res = await fetch(`${API_URL}/draft-appeal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(facts),
  });
  if (!res.ok) throw new Error(`draft-appeal failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface ScannedLetter {
  issuer_type: IssuerType | null;
  issuer_name: string | null;
  stage_of_notice: StageOfNotice | null;
  reference_number: string | null;
  contravention_code: string | null;
  date_of_contravention: string | null;
  date_of_notice: string | null;
  amount_gbp: number | null;
  creditor_bank: { sort_code?: string; account_no?: string; payee_name?: string } | null;
  issuer_full_name?: string | null;
  debt_type?: string | null;
  letter_kind?: string | null;
  original_creditor?: string | null;
  respond_by?: string | null;
  fees_added_gbp?: number | null;
  payee_address?: { address?: string; city?: string; postcode?: string } | null;
}

/** Read a photo of a notice with KIMI vision (backend /scan-letter). */
export async function scanLetter(imageDataUrl: string): Promise<ScannedLetter> {
  const res = await fetch(`${API_URL}/scan-letter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail).catch(() => null);
    throw new Error(detail ?? "We couldn't read that letter. Please type the details in.");
  }
  return res.json();
}

export const SFS_RESULT_STORAGE_KEY = "br_last_sfs_result";

// ---- Open Banking (TrueLayer sandbox, via the backend's /bank/* routes) ----

export interface BankStatus {
  configured: boolean;
  providers: { name: string; label: string }[];
  collector: string | null;
  bank_connected: boolean;
  mandate_status: string | null;
  plan: { pot_address: string; surplus_gbp: number; creditors?: CreditorPayee[] } | null;
  collecting: boolean;
  events: { at: string; text: string }[];
}

export const bankConnectUrl = (wallet: string, next: "sweep" | "sfs" = "sweep") =>
  `${API_URL}/bank/connect?wallet=${encodeURIComponent(wallet)}&next=${next}`;

async function bankFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/bank${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export const getBankStatus = (wallet: string) =>
  bankFetch<BankStatus>(`/status?wallet=${encodeURIComponent(wallet)}`);

export const getBankSummary = (wallet: string) =>
  bankFetch<{ employment: number; fixed_costs: number; flexible_costs: number }>(
    `/summary?wallet=${encodeURIComponent(wallet)}`
  );

export const startBankMandate = (body: {
  wallet: string;
  name: string;
  email: string;
  max_monthly_gbp: number;
  provider?: string;
}) =>
  bankFetch<{ url: string }>("/mandate", { method: "POST", body: JSON.stringify(body) });

// Where a creditor's share is paid in GBP, and the reference they match it by.
export interface CreditorPayee {
  label: string;
  sort_code: string;
  account_no: string;
  reference: string;
  address: string;
  city: string;
  postcode: string;
}

export const saveBankPlan = (body: {
  wallet: string;
  pot_address: string;
  surplus_gbp: number;
  creditors?: CreditorPayee[];
}) =>
  bankFetch<{ ok: boolean }>("/plan", { method: "POST", body: JSON.stringify(body) });

export const checkPaydayNow = (wallet: string) =>
  bankFetch<BankStatus>(`/check-now?wallet=${encodeURIComponent(wallet)}`, { method: "POST" });

// ---- Saved progress (backend /me, keyed by the verified Privy login) ----

export interface SavedLetter {
  id: string;
  created_at: string;
  issuer_name: string | null;
  issuer_type: string | null;
  reference_number: string | null;
  amount_gbp: string | null;
  letter: string;
}

export interface SavedPayee {
  sort_code: string;
  account_no: string;
  reference: string;
  address: string;
  city: string;
  postcode: string;
}

export interface Me {
  sfs: { inputs: Record<string, unknown>; result: SfsResult } | null;
  creditors: Record<string, SavedPayee>;
  letters: SavedLetter[];
}

async function meFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/me${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`/me${path} failed: ${res.status}`);
  return res.json();
}

export const getMe = (token: string) => meFetch<Me>(token, "");
export const saveMeSfs = (token: string, inputs: Record<string, unknown>, result: SfsResult) =>
  meFetch(token, "/sfs", { method: "PUT", body: JSON.stringify({ inputs, result }) });
export const saveMeCreditors = (token: string, creditors: Record<string, SavedPayee>) =>
  meFetch(token, "/creditors", { method: "PUT", body: JSON.stringify({ creditors }) });
export const saveMeLetter = (token: string, letter: Omit<SavedLetter, "id" | "created_at">) =>
  meFetch<SavedLetter>(token, "/letters", { method: "POST", body: JSON.stringify(letter) });

/** Last SFS result on this device (survives the phone closing the tab). */
export function readLocalSfs(): SfsResult | null {
  try {
    const raw = localStorage.getItem(SFS_RESULT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function writeLocalSfs(result: SfsResult): void {
  try {
    localStorage.setItem(SFS_RESULT_STORAGE_KEY, JSON.stringify(result));
  } catch {}
}

// ---- Background jobs for slow requests (letters, scans) ----
// Start a job, then check back every few seconds. A check that fails (phone
// locked, app in the background, flaky signal) is simply retried, so a
// locked screen can't lose the result.

export async function startJob(path: "draft-appeal" | "scan-letter", body: unknown): Promise<string> {
  const res = await fetch(`${API_URL}/jobs/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("We couldn't start that just now. Please try again.");
  return (await res.json()).job_id;
}

export async function waitForJob<T>(jobId: string, maxMinutes = 6): Promise<T> {
  const deadline = Date.now() + maxMinutes * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const res = await fetch(`${API_URL}/jobs/${jobId}`);
      if (res.status === 404) throw new Error("That request expired. Please try again.");
      if (!res.ok) continue; // server busy or restarting: check again shortly
      const job = await res.json();
      if (job.status === "done") return job.result as T;
      if (job.status === "error") throw new Error(job.error);
    } catch (err) {
      if (err instanceof Error && !/fetch|load failed|network/i.test(err.message)) throw err;
    }
  }
  throw new Error("This is taking longer than usual. Please try again.");
}

// ---- Creditors read from scanned letters ----
// Scanning a letter once captures who to pay and how (name, amount,
// reference, bank details, address), so the plan and Autopilot fill
// themselves instead of asking the user to retype it.

export interface LetterCreditor {
  name: string;
  amount: number | null;
  reference: string;
  sort_code: string;
  account_no: string;
  address: string;
  city: string;
  postcode: string;
}

const LETTER_CREDITORS_KEY = "breathing-room:letter-creditors";

export function readLetterCreditors(): LetterCreditor[] {
  try {
    return JSON.parse(localStorage.getItem(LETTER_CREDITORS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveLetterCreditor(f: ScannedLetter): void {
  const name = (f.issuer_name || f.issuer_full_name || "").trim();
  if (!name) return;
  const entry: LetterCreditor = {
    name: /council tax/i.test(f.debt_type || "")
      ? "Council tax"
      : /pcn|penalty|parking/i.test(`${f.stage_of_notice} ${f.debt_type}`)
        ? `${name} PCN`
        : name,
    amount: f.amount_gbp ?? null,
    reference: f.reference_number || "",
    sort_code: f.creditor_bank?.sort_code || "",
    account_no: f.creditor_bank?.account_no || "",
    address: f.payee_address?.address || "",
    city: f.payee_address?.city || "",
    postcode: f.payee_address?.postcode || "",
  };
  // Merge with an earlier scan of the same letter, so a later step that knows
  // less (e.g. writing the letter) never wipes the bank details the scan found.
  const all = readLetterCreditors();
  const prev = all.find((c) => c.reference && c.reference === entry.reference);
  const merged = prev
    ? { ...prev, ...Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== "" && v !== null)) }
    : entry;
  const rest = all.filter((c) => c !== prev);
  try {
    localStorage.setItem(LETTER_CREDITORS_KEY, JSON.stringify([merged as LetterCreditor, ...rest].slice(0, 20)));
  } catch {}
}

/** The scanned-letter creditor that matches a creditor name in the plan, if any. */
export function findLetterCreditor(label: string): LetterCreditor | undefined {
  const l = label.toLowerCase().trim();
  const letters = readLetterCreditors();
  // Best match first: exact name, then one name containing the other.
  return (
    letters.find((c) => c.name.toLowerCase() === l) ??
    letters.find((c) => c.name.toLowerCase().includes(l) || l.includes(c.name.toLowerCase()))
  );
}
