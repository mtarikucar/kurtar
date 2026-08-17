import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Moves keyboard/assistive-tech focus to the new page's heading on every
 * route change. React Router does not do this itself — without it, a
 * keyboard/screen-reader user's focus silently stays on whatever element
 * they last interacted with on the PREVIOUS page (often now unmounted),
 * which is exactly the "accessibility: focus management on route change"
 * requirement in the task brief.
 */
export function useRouteFocus(): void {
  const location = useLocation();
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>("main h1, h1");
    if (heading) {
      if (!heading.hasAttribute("tabindex"))
        heading.setAttribute("tabindex", "-1");
      heading.focus();
    }
  }, [location.pathname]);
}
