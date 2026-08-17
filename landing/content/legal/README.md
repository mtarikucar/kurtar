# Legal texts — DRAFT STATUS, READ BEFORE PUBLISHING

Every document in this directory (`aracilik-sozlesmesi.ts`, `mesafeli-satis-sozlesmesi.ts`,
`on-bilgilendirme-formu.ts`, `kvkk-aydinlatma-metni.ts`, `cerez-politikasi.ts`) is a **working
draft**, written by an engineering task to be grounded in what the kurtar platform's backend
actually implements (real fee amounts, real deadlines, real data fields — each file's own
top-of-file comment cites the exact backend source for every commercial/legal figure it states).

**None of these documents has been reviewed by a lawyer. None is fit to publish as a binding
contract or legally sufficient disclosure as-is.** Before this site goes live with real users:

1. Have a Turkish lawyer specializing in e-commerce/consumer law (and, ideally, one familiar
   with KVKK) review all five documents against current legislation — especially the
   ETAHS-mandated minimum content list for intermediation agreements, which this draft was
   written from a business-plan summary of, not the regulation's own text.
2. Fill in every `[BRACKETED PLACEHOLDER]` in these documents (legal entity name, MERSİS number,
   tax ID, KEP address, registered office, contact channels, notice periods) once the
   contracting entity actually exists — see
   `docs/plans/2026-08-12-kurtar-master-plan.md` §5.6 for the incorporation plan this depends on.
2b. Confirm the payment service provider (iyzico Pazaryeri vs. PayTR — see the master plan §4.3)
   before finalizing `mesafeli-satis-sozlesmesi.ts` and `aracilik-sozlesmesi.ts` Article 8's
   split/blokaj liability language against the PSP's actual contract terms.
3. Verify VERBİS registration is complete (or confirm the exemption applies) before publishing
   `kvkk-aydinlatma-metni.ts` as final.
4. Re-run this checklist any time a commercial figure changes (bag fee, membership price,
   founding-member terms, payout SLA) — these documents and the `/isletme` page copy
   (`landing/messages/{tr,en}.json`'s `merchants` key) must never drift apart.

Each document's own top-of-file comment repeats the specific open items for that document.
This README exists so the whole set is discoverable in one place without opening every file.
