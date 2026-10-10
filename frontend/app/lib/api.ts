export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8420";

export type DebtCategory = "priority" | "non_priority";

export interface CreditorInput {
  id: string;
  name: string;
  category: DebtCategory;
  balance: string;
  priority_token_offer?: string | null;
  is_ccj: boolean;
}

export interface SfsRequest {
  income: {
    employment_income: string;
    benefits_income: string;
    other_income: string;
    deductions: string;
  };
  outgoings: { fixed_costs: string; flexible_costs: string };
  creditors: CreditorInput[];
  savings_buffer: string;
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

export interface MitigatingCircumstances {
  emergency_pickup?: boolean;
  signage_obscured?: boolean;
  was_loading?: boolean;
  holds_blue_badge?: boolean;
  neurodivergence_or_disability?: string | null;
  dependant_crisis?: string | null;
  other_notes?: string | null;
}

export interface NoticeFacts {
  issuer_type: string;
  issuer_name: string;
  contravention_code: string | null;
  stage_of_notice: string;
  date_of_contravention: string | null;
  date_of_notice: string | null;
  amount_gbp: string | null;
  reference_number: string | null;
  health_data_consent: boolean;
  mitigating: MitigatingCircumstances;
}

export interface DraftResult {
  letter: string;
  citations: Record<string, string>[];
  used_llm: boolean;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(
      typeof detail?.detail === "string" ? detail.detail : `Request failed (${res.status})`
    );
  }
  return res.json();
}

export const calculateSfs = (req: SfsRequest) => post<SfsResult>("/calculate-sfs", req);
export const draftAppeal = (facts: NoticeFacts) => post<DraftResult>("/draft-appeal", facts);

// The latest SFS plan is handed from /budget to /sweep within the session.
const PLAN_KEY = "breathing-room:sfs-plan";

export function savePlan(plan: SfsResult) {
  try {
    sessionStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {}
}

export function loadPlan(): SfsResult | null {
  try {
    const raw = sessionStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as SfsResult) : null;
  } catch {
    return null;
  }
}
