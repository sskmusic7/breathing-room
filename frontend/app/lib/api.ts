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
