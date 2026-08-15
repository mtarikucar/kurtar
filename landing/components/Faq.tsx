export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Native <details>/<summary> — no client JS, fully keyboard/AT operable
 * out of the box. Pair with `buildFaqJsonLd` (lib/seo.ts) on pages that
 * need FAQPage structured data (task-13 brief: "JSON-LD ... FAQPage on
 * /isletme").
 */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="kt-faq">
      {items.map((item) => (
        <details key={item.question} className="kt-faq__item">
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
