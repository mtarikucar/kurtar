import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware wrappers around Next's Link/router/usePathname, scoped to
 * `routing` above. `getPathname` is the pure function the locale switcher
 * (and its unit test) use to compute "same page, other locale" — no
 * component rendering required to verify path preservation.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
