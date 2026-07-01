import { useEffect, useState } from "react";
import type { RevisionHeading } from "../../content/revision/types";

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
        { rootMargin: "-18% 0px -72% 0px" },
      );
      observer.observe(element);
      observers.push(observer);
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [headings]);

  return active;
}
