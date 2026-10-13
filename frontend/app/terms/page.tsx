import type { Metadata } from "next";
import { TopBar } from "../components/ui";

export const metadata: Metadata = { title: "Key Facts and terms" };

// Plain-language Key Facts, prototype terms, privacy and complaints, from the
// team's Terms of Use and GRC Pack (draft, pending solicitor review).
export default function TermsPage() {
  return (
    <div className="wrap">
      <TopBar back="/" />
      <h1 className="h2">Key Facts</h1>
      <p className="text-[13px] text-muted -mt-2">Draft terms, version 0.1. Not yet reviewed by a solicitor.</p>

      <Section id="prototype" title="This is a prototype">
        <p>
          Breathing Room is currently a prototype. It runs on a test blockchain with demonstration data. Banking and payment
          providers run in their test (sandbox) modes, and the step that turns pounds into tokens is simulated. No real money is
          collected or paid, and no real creditor is contacted.
        </p>
        <p>
          Please don&apos;t enter real personal, financial or health information. Features may change or break, and nothing you
          see should be relied on for real decisions.
        </p>
      </Section>

      <Section title="The short version">
        <p>
          Breathing Room helps you work out what you can afford to pay your creditors and, if you choose, sends that money to them
          each payday. It is free to you. We don&apos;t lend money, we can&apos;t guarantee a creditor will accept your offer, and
          our letter tool gives guidance, not legal advice. You can stop at any time.
        </p>
      </Section>

      <Section title="What it costs and who pays us">
        <p>
          It&apos;s free to you: no set-up, monthly or exit fees. Creditors fund us through &quot;Fair Share&quot;, a percentage
          (currently 5%) of what they receive through us. It comes from the creditor&apos;s side and doesn&apos;t reduce what goes
          towards your debt.
        </p>
        <p>
          Because creditors fund us, there could be a conflict of interest. So we never choose, rank or favour creditors by what
          they contribute: your split is worked out by the published Standard Financial Statement rules shown to you.
        </p>
      </Section>

      <Section title="How your money moves">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Before anything is collected you see your surplus, each creditor, what each gets, and when. You confirm it first.</li>
          <li>Your living costs and safety buffer are protected first, then priority debts, then everyone else shares the rest fairly.</li>
          <li>When money is very tight, creditors may be offered a token payment such as £1 a month.</li>
          <li>Direct Debits are covered by the Direct Debit Guarantee, which we show when you set one up.</li>
          <li>If a creditor rejects a payment, the others still go ahead and we tell you.</li>
        </ul>
      </Section>

      <Section title="Good to know">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>You stay legally responsible for your debts. Using Breathing Room doesn&apos;t stop interest, charges or enforcement unless a creditor agrees or a formal protection applies.</li>
          <li>Creditors may not accept reduced or token payments, and paying less than agreed may show on your credit file.</li>
          <li>If you might be eligible for formal help (Breathing Space, a Debt Relief Order, an IVA or a debt management plan), we&apos;ll point you to free advice. You decide.</li>
          <li>All money calculations use fixed, tested rules, not AI.</li>
        </ul>
      </Section>

      <Section title="Pausing and stopping">
        <p>
          You can pause, change or cancel your plan at any time in the app, free. Pausing stops future payouts once it&apos;s
          recorded; a bank payment already submitted may still complete. Only you can pause or resume, never a creditor. You can
          also cancel a Direct Debit through your bank at any time.
        </p>
      </Section>

      <Section title="Letters">
        <p>
          The letter tool uses automated drafting, including AI, together with a library of UK law to draft letters for you to
          review, edit and send yourself. Drafts are information only, not legal advice, and may contain mistakes. Check every
          fact and deadline, and get free advice for anything important. We never send a letter for you.
        </p>
      </Section>

      <Section title="Your information">
        <p>
          You can use Breathing Room without telling us about health, disability or neurodivergence. If you choose to, we ask for
          your separate, explicit consent first, use it only for the letter you asked for, and you can turn it off at any time.
          Letter photos are read once to fill in the form and not stored. Nothing personal is ever written to the blockchain.
        </p>
      </Section>

      <Section title="If you need extra help">
        <p>
          If things are hard because of health, bereavement, job loss, domestic abuse, language or anything else, tell us through
          Help and we&apos;ll adapt: more time, a pause, or a referral to free specialist help such as StepChange, Citizens Advice,
          National Debtline, Samaritans or Mind.
        </p>
      </Section>

      <Section id="complaints" title="Complaints">
        <p>
          Unhappy with something? Tell us through Help. We&apos;ll acknowledge within 3 business days and aim to resolve it within
          8 weeks. Once we&apos;re authorised, eligible complaints can go to the Financial Ombudsman Service for free.
        </p>
      </Section>

      <Section title="Who you can use it with">
        <p>You need to be 18 or over, live in the UK and use it for your own debts.</p>
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card flex flex-col gap-2 text-[14px] leading-[1.5] scroll-mt-4">
      <h2 className="font-semibold text-[15px]">{title}</h2>
      {children}
    </section>
  );
}
