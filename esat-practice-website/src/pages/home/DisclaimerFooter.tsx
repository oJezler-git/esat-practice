import { useEffect, useRef, useState, type TransitionEvent } from "react";

export function DisclaimerFooter() {
  const [footerDismissed, setFooterDismissed] = useState(false);
  const [footerState, setFooterState] = useState<"idle" | "confirming" | "closing">("idle");
  const confirmTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem("footer_dismissed") === "true";
    setFooterDismissed(dismissed);

    return () => {
      if (confirmTimeoutRef.current !== null) {
        window.clearTimeout(confirmTimeoutRef.current);
      }
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const isFooterConfirming = footerState === "confirming" || footerState === "closing";
  const isFooterClosing = footerState === "closing";

  function handleFooterClose() {
    if (footerState === "closing") {
      return;
    }

    if (footerState === "confirming") {
      if (confirmTimeoutRef.current !== null) {
        window.clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }

      setFooterState("closing");
      closeTimeoutRef.current = window.setTimeout(() => {
        localStorage.setItem("footer_dismissed", "true");
        setFooterDismissed(true);
        setFooterState("idle");
        closeTimeoutRef.current = null;
      }, 450);
      return;
    }

    setFooterState("confirming");
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current);
    }
    confirmTimeoutRef.current = window.setTimeout(() => {
      setFooterState("idle");
      confirmTimeoutRef.current = null;
    }, 3000);
  }

  function handleFooterTransitionEnd(event: TransitionEvent<HTMLElement>) {
    if (!isFooterClosing || event.target !== event.currentTarget) {
      return;
    }

    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    localStorage.setItem("footer_dismissed", "true");
    setFooterDismissed(true);
    setFooterState("idle");
  }

  if (footerDismissed) {
    return null;
  }

  return (
    <footer
      className={`page-footer ${isFooterClosing ? "page-footer--closing" : ""}`}
      onTransitionEnd={handleFooterTransitionEnd}
    >
      <p className="page-footer-text">
        This website is an independent educational resource and is not affiliated with, endorsed by, or sponsored by{" "}
        <a
          href="https://www.uat-uk.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="page-footer-link"
        >
          UAT-UK
        </a>
        ,{" "}
        <a
          href="https://www.pearsonvue.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="page-footer-link"
        >
          Pearson VUE
        </a>
        , the{" "}
        <a
          href="https://www.cam.ac.uk/"
          target="_blank"
          rel="noopener noreferrer"
          className="page-footer-link"
        >
          University of Cambridge
        </a>
        ,{" "}
        <a
          href="https://www.imperial.ac.uk/"
          target="_blank"
          rel="noopener noreferrer"
          className="page-footer-link"
        >
          Imperial College London
        </a>
        , or any other institution associated with the{" "}
        <a
          href="https://esat-tmua.ac.uk/about-the-tests/esat-test/"
          target="_blank"
          rel="noopener noreferrer"
          className="page-footer-link"
        >
          ESAT
        </a>
        . Questions are based on publicly available ENGAA and NSAA{" "}
        <a
          href="https://esat-tmua.ac.uk/esat-preparation-materials/"
          target="_blank"
          rel="noopener noreferrer"
          className="page-footer-link"
        >
          past papers
        </a>
        . You can view the{" "}
        <a
          href="https://github.com/oJezler-git/esat-practice"
          target="_blank"
          rel="noopener noreferrer"
          className="page-footer-link"
        >
          source code
        </a>
        {" "}
        on GitHub.
      </p>
      <button
        type="button"
        onClick={handleFooterClose}
        className={`page-footer-close ${isFooterConfirming ? "page-footer-close--confirming" : ""}`}
        aria-label={isFooterConfirming ? "Confirm close footer" : "Close footer"}
      >
        <span className="page-footer-close__icon" aria-hidden="true">
          ✕
        </span>
        <span className="page-footer-close__label" aria-hidden="true">
          Confirm
        </span>
      </button>
    </footer>
  );
}
