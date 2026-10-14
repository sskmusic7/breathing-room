import { gbp } from "./ui";

// What each kind of letter means and what to do next, written from real
// letters (council and TfL PCNs, private parking charges, police NIPs,
// collection agencies, solicitors, Form PE2 and bailiff notices).
// General information, not legal advice.
const GUIDE: Record<string, { title: string; points: string[]; canAppeal: boolean }> = {
  council_pcn: {
    title: "A council Penalty Charge Notice",
    points: [
      "You can challenge it in writing, usually within 28 days. Paying within 14 days often halves the charge.",
      "If the council rejects your challenge, you can appeal to an independent tribunal: London Tribunals in London, or the Traffic Penalty Tribunal elsewhere in England and Wales.",
    ],
    canAppeal: true,
  },
  tfl_pcn: {
    title: "A Transport for London Penalty Charge Notice",
    points: [
      "You can challenge it with TfL, usually within 28 days. Paying within 14 days often halves the charge.",
      "If TfL rejects your challenge, you can appeal to London Tribunals, which is independent.",
    ],
    canAppeal: true,
  },
  private_parking_charge: {
    title: "A private parking charge",
    points: [
      "This is an invoice from a private company, not a fine. Appeal to the company first, usually within 28 days.",
      "If they reject it, you can appeal for free to an independent service: POPLA if they belong to the British Parking Association, or the IAS if they belong to the International Parking Community.",
    ],
    canAppeal: true,
  },
  police_nip: {
    title: "A police Notice of Intended Prosecution",
    points: [
      "You must tell the police who was driving within 28 days, even if it was not you. Not replying is a separate offence that can mean 6 points and a fine of up to £1,000.",
      "This is not something to challenge with a letter from this app. Reply using the form or website on the notice, and get free legal advice if you dispute the offence.",
    ],
    canAppeal: false,
  },
  debt_collector: {
    title: "A letter from a debt collection agency",
    points: [
      "Collection agencies have no special legal powers. They cannot enter your home or take your belongings, and their warnings do not mean a court case has started.",
      "If you dispute the original charge, tell them in writing and ask them to put the account on hold. Only a court can order you to pay.",
    ],
    canAppeal: true,
  },
  solicitor_letter: {
    title: "A letter from a solicitor",
    points: [
      "This can come before a court claim. If you dispute the debt, reply in writing and keep a copy.",
      "If a court claim form arrives, you must respond by the date it gives. Free advisers can help you do this.",
    ],
    canAppeal: true,
  },
  order_for_recovery: {
    title: "An Order for Recovery (Form PE2)",
    points: [
      "You have 21 days to either pay or file a statutory declaration with the Traffic Enforcement Centre.",
      "A statutory declaration can only be made on the grounds listed on the form, such as not receiving earlier notices. Making a false one is a criminal offence.",
    ],
    canAppeal: false,
  },
  bailiff_notice: {
    title: "A Notice of Enforcement from bailiffs",
    points: [
      "This is the bailiff stage. Contact the agency or a free adviser before the date on the notice: fees rise sharply after it, for example from £79 to £247 or more once a visit is made.",
      "A free debt adviser can ask the agency for more time, set up an affordable plan, or apply for Breathing Space, which pauses most enforcement for 60 days.",
    ],
    canAppeal: false,
  },
  council_tax: {
    title: "A council tax letter",
    points: [
      "Council tax is a priority debt, because falling behind can lead to bailiffs or court action. It is paid first in your plan.",
      "If you are behind, contact the council: they can often spread what you owe over the rest of the year.",
    ],
    canAppeal: false,
  },
};

export default function LetterGuide({
  kind,
  respondBy,
  fees,
  originalCreditor,
}: {
  kind?: string | null;
  respondBy?: string | null;
  fees?: number | null;
  originalCreditor?: string | null;
}) {
  const g = kind ? GUIDE[kind] : undefined;
  if (!g) return null;
  const due = respondBy ? new Date(respondBy) : null;
  return (
    <section className="card flex flex-col gap-2 text-[14px] leading-[1.5]">
      <h2 className="font-semibold text-[15px]">What this letter means: {g.title}</h2>
      {due && !isNaN(due.getTime()) && (
        <p className="font-semibold text-ink">
          Respond by {due.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
        </p>
      )}
      {originalCreditor && <p className="text-muted">They are collecting on behalf of {originalCreditor}.</p>}
      {fees ? <p className="text-muted">{gbp(fees, 2)} of fees have been added to the original amount.</p> : null}
      <ul className="list-disc pl-5 flex flex-col gap-1">
        {g.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      {!g.canAppeal && (
        <a href="tel:08088084000" className="btn-ghost">
          Talk to National Debtline (free): 0808 808 4000
        </a>
      )}
      <p className="text-[12px] text-muted">General information, not legal advice.</p>
    </section>
  );
}
