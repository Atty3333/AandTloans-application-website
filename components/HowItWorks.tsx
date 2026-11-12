import { CONTACT_EMAIL, LOAN_MAX, LOAN_MIN } from '@/lib/config';

const STEPS = [
  ['Create an account', 'Sign up with your email and confirm it.'],
  ['Apply online', `Request P${LOAN_MIN}–P${LOAN_MAX}, upload your documents and sign on screen.`],
  ['Get a reply', 'Track your application and its status from your dashboard.'],
  ['Repay & upload proof', 'Once approved, upload your proof of payment from the application page.'],
] as const;

const FAQ = [
  ['How much can I borrow?', `Between P${LOAN_MIN} and P${LOAN_MAX} per application. You can apply again once we have replied to your current one.`],
  ['What documents do I need?', 'Your latest bank statement, Omang (front and back), a registration letter and your student ID. JPG, PNG, WebP or PDF, up to 10 MB each.'],
  ['Can I change an application after sending it?', 'No, but you can cancel it while it is awaiting a reply and submit a new one. Proof of payment can be added once the loan is approved.'],
  ['Is my information safe?', 'Your documents are stored privately and are only seen by the lender. We never show them publicly.'],
] as const;

/** Public explainer under the sign-in form: how it works + frequently asked questions. */
export default function HowItWorks() {
  return (
    <div className="space-y-8">
      <section aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">
          How it works
        </h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="paper flex gap-3 p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white" aria-hidden="true">
                {i + 1}
              </span>
              <span className="text-sm">
                <span className="block font-semibold text-slate-900">{title}</span>
                <span className="text-slate-600">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="faq-title">
        <h2 id="faq-title" className="section-title">
          Frequently asked questions
        </h2>
        <div className="space-y-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="paper group p-3 text-sm">
              <summary className="cursor-pointer list-none font-semibold text-brand-900 marker:hidden">
                <span className="mr-2 inline-block text-brand-500 transition group-open:rotate-90" aria-hidden="true">
                  ▸
                </span>
                {q}
              </summary>
              <p className="mt-2 pl-5 text-slate-600">{a}</p>
            </details>
          ))}
        </div>
        {CONTACT_EMAIL && <p className="mt-3 text-xs text-slate-500">Still have a question? {CONTACT_EMAIL}</p>}
      </section>
    </div>
  );
}
