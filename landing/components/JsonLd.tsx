/**
 * Renders a JSON-LD <script> tag. `data` is serialized with
 * `JSON.stringify` — every caller passes a plain, statically-built object
 * (schema.org shapes assembled in lib/seo.ts), never raw user input, so
 * there is no injection surface here.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON-LD requires literal script content; `data` is always a
      // statically-constructed schema.org object (see lib/seo.ts), never
      // user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
