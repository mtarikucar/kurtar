import type { ReactNode } from "react";

/**
 * Extracts every string/number leaf from a React element tree, in
 * document order — a minimal, dependency-free stand-in for "render to
 * text" that walks `.props.children` directly instead of going through
 * `react-dom`.
 *
 * Why this exists instead of `@testing-library/react`'s `render()`: this
 * npm workspace intentionally runs two different React major versions
 * side by side (landing/apps/consumer on React 19, apps/merchant-web/
 * apps/admin-web pinned to React 18 — see docs/frontend-contract.md
 * §10's "duplicate react/react-dom" footgun note). `@testing-library/
 * react` is hoisted to the workspace ROOT node_modules, which ties it to
 * root's React 18 copy, while landing's own component code resolves its
 * nested React 19 copy — two live React instances in one Vitest process,
 * which makes `react-dom`'s reconciler reject every element ("Objects
 * are not valid as a React child") regardless of Vite alias/dedupe
 * configuration (confirmed: even `React.createElement("div", null,
 * "hello")` fails the same way — this is an environment-level dependency
 * duplication issue, not a landing/ code defect).
 *
 * `ImpactCounter` (the one component this is written for) is a plain,
 * hookless function component, so calling it directly and walking its
 * returned element tree is a faithful, dependency-free substitute for a
 * full DOM render for the purposes required here: proving the component
 * "renders, not throws" for both branches of `ImpactSnapshot`, and that
 * the expected text actually appears in the output.
 */
export function extractText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string") return node.length > 0 ? [node] : [];
  if (typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(extractText);

  if (typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return extractText(props?.children);
  }

  return [];
}
