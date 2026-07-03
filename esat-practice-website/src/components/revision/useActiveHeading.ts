import { useEffect, useState } from "react";
import type { RevisionHeading } from "../../content/revision/types";

/**
 * Returns [activeId, markActive]. `markActive` lets a TOC link set the
 * active heading immediately on click — the IntersectionObserver's
 * rootMargin band doesn't line up with the scroll-margin-top landing spot,
 * so a discrete anchor jump can land the target heading outside the
 * observed band and leave the previous (lower) heading marked active until
 * the user scrolls further.
 */
export function useActiveHeading(headings: RevisionHeading[]) {
  const [active, setActive] = useState(headings[0]?.id ?? "");

  useEffect(() => {
    if (headings.length === 0) {
      setActive("");
      return;
    }

    setActive(headings[0].id);
    const observers: IntersectionObserver[] = [];

    headings.forEach((heading) => {
      const element = document.getElementById(heading.id);
      if (!element) {
        return;
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActive(heading.id);
          }
        },
        // Top offset matches the headings' scroll-margin-top (5rem = 80px) in
        // revision-docs.css, so a heading that just settled at its anchor-jump
        // landing spot is immediately inside the observed band instead of
        // sitting above it until further scrolling.
        { rootMargin: "-80px 0px -70% 0px" },
      );
      observer.observe(element);
      observers.push(observer);
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [headings]);

  return [active, setActive] as const;
}
