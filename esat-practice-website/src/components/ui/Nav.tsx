import { useState, useRef, useEffect } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import logo from "../../assets/logo.svg";

const links = [
  { to: "/", label: "Home" },
  { to: "/practice", label: "Practice" },
  { to: "/question-bank", label: "Bank" },
  { to: "/revision", label: "Revision" },
  { to: "/progress", label: "Progress" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" },
];

export function Nav({ isHidden }: { isHidden?: boolean }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  
  const navGroupRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const current = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const target = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const velocity = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const isFirstRender = useRef(true);
  const [isVisible, setIsVisible] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsMenuOpen(false);
      setIsClosing(false);
    }, 300); // Should match animation duration
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const currentDay = currentTime.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const currentClock = currentTime.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let isRunning = false;

    // Spring stiffness and damping coefficients
    const stiffness = 320;
    const damping = 28;

    const updateStyles = () => {
      const pill = pillRef.current;
      if (!pill) return;

      const absVx = Math.abs(velocity.current.x);
      const scaleX = 1 + Math.min(absVx * 0.0006, 0.6);
      const blur = Math.min(absVx * 0.002, 2.5);

      pill.style.width = `${current.current.width}px`;
      pill.style.height = `${current.current.height}px`;
      pill.style.transform = `translate3d(${current.current.x}px, ${current.current.y}px, 0) scaleX(${scaleX})`;
      pill.style.filter = blur > 0.15 ? `blur(${blur}px)` : "none";
    };

    const animate = (time: number) => {
      let dt = (time - lastTime) / 1000;
      lastTime = time;

      if (dt > 0.1) dt = 0.1;

      // Fixed step physics integration
      const step = 0.002;
      let accumulator = dt;

      while (accumulator >= step) {
        // Position X
        const dx = target.current.x - current.current.x;
        const ax = dx * stiffness - velocity.current.x * damping;
        velocity.current.x += ax * step;
        current.current.x += velocity.current.x * step;

        // Position Y
        const dy = target.current.y - current.current.y;
        const ay = dy * stiffness - velocity.current.y * damping;
        velocity.current.y += ay * step;
        current.current.y += velocity.current.y * step;

        // Width
        const dw = target.current.width - current.current.width;
        const aw = dw * stiffness - velocity.current.width * damping;
        velocity.current.width += aw * step;
        current.current.width += velocity.current.width * step;

        // Height
        const dh = target.current.height - current.current.height;
        const ah = dh * stiffness - velocity.current.height * damping;
        velocity.current.height += ah * step;
        current.current.height += velocity.current.height * step;

        accumulator -= step;
      }

      updateStyles();

      // Check if spring has converged to target
      const isSettled =
        Math.abs(target.current.x - current.current.x) < 0.05 &&
        Math.abs(velocity.current.x) < 0.05 &&
        Math.abs(target.current.y - current.current.y) < 0.05 &&
        Math.abs(velocity.current.y) < 0.05 &&
        Math.abs(target.current.width - current.current.width) < 0.05 &&
        Math.abs(velocity.current.width) < 0.05 &&
        Math.abs(target.current.height - current.current.height) < 0.05 &&
        Math.abs(velocity.current.height) < 0.05;

      if (isSettled) {
        current.current = { ...target.current };
        velocity.current = { x: 0, y: 0, width: 0, height: 0 };
        updateStyles();
        isRunning = false;
      } else {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    const startAnimation = () => {
      if (isRunning) return;
      isRunning = true;
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(animate);
    };

    const updateTarget = () => {
      const container = navGroupRef.current;
      if (!container) return;

      const activeElement = container.querySelector(".nav-link-active") as HTMLElement;
      if (activeElement) {
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeElement.getBoundingClientRect();

        const nextTarget = {
          x: activeRect.left - containerRect.left,
          y: activeRect.top - containerRect.top,
          width: activeRect.width,
          height: activeRect.height,
        };

        if (isFirstRender.current) {
          current.current = { ...nextTarget };
          target.current = { ...nextTarget };
          isFirstRender.current = false;
          setIsVisible(true);
          requestAnimationFrame(updateStyles);
        } else {
          const hasChanged =
            Math.abs(target.current.x - nextTarget.x) > 0.1 ||
            Math.abs(target.current.y - nextTarget.y) > 0.1 ||
            Math.abs(target.current.width - nextTarget.width) > 0.1 ||
            Math.abs(target.current.height - nextTarget.height) > 0.1;

          setIsVisible(true);
          if (hasChanged) {
            target.current = nextTarget;
            startAnimation();
          }
        }
      } else {
        setIsVisible(false);
      }
    };

    updateTarget();
    
    // Tiny delay to allow React Router DOM update to paint the active class
    const timeoutId = setTimeout(updateTarget, 0);

    const handleResize = () => {
      isFirstRender.current = true;
      updateTarget();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [location]);

  return (
    <>
      <nav
        className={`nav-shell ${isHidden ? "nav-shell-hidden" : ""} ${
          isMenuOpen ? "nav-shell-menu-open" : ""
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center">
            <img src={logo} alt="ESAT practice" className="h-8 w-auto" />
          </Link>

          <div className="nav-group nav-desktop-only" ref={navGroupRef}>
            <div
              ref={pillRef}
              className="nav-active-pill"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transformOrigin: "center center",
                willChange: "transform, width, height, filter",
                opacity: isVisible ? 1 : 0,
                transition: "opacity 150ms ease",
              }}
            />
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "nav-link-active" : "nav-link-idle"}`
                }
              >
                {label}
              </NavLink>
            ))}

            <div className="nav-time">
              <span className="nav-time-day">{currentDay}</span>
              <span className="nav-time-clock">{currentClock}</span>
            </div>
          </div>

          <div className="nav-mobile-hamburger-wrapper">
            <button type="button" className="nav-mobile-hamburger-button" aria-label={isMenuOpen ? "Close menu" : "Open menu"} aria-expanded={isMenuOpen} onClick={() => isMenuOpen ? handleClose() : setIsMenuOpen(true)}>
              <div className={`hamburger ${isMenuOpen ? 'open' : ''}`}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </button>
          </div>
        </div>
      </nav>

      {isMenuOpen && (
        <div className={`mobile-menu-overlay ${isClosing ? 'mobile-menu-closing' : ''}`} onClick={handleClose}>
          <div className="mobile-menu-content">
            {links.map(({ to, label }, index) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `mobile-nav-link ${isActive ? "mobile-nav-link-active" : "mobile-nav-link-idle"}`
                }
                style={{ '--delay': `${index * 50}ms` } as React.CSSProperties}
                onClick={(e) => { e.stopPropagation(); handleClose(); }}
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
