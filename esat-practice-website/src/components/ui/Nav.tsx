import { useState } from "react";
import { NavLink, Link } from "react-router-dom";

const links = [
  { to: "/", label: "Home" },
  { to: "/practice", label: "Practice" },
  { to: "/question-bank", label: "Bank" },
  { to: "/progress", label: "Progress" },
  { to: "/settings", label: "Settings" },
];

export function Nav({ isHidden }: { isHidden?: boolean }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsMenuOpen(false);
      setIsClosing(false);
    }, 300); // Should match animation duration
  };

  return (
    <>
      <nav className={`nav-shell top-0 z-50 ${isHidden ? "nav-shell-hidden" : ""}`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="text-sm tracking-wide text-gray-400">ESAT practice</Link>

          <div className="nav-group nav-desktop-only">
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
          </div>

          <div className="nav-mobile-hamburger-wrapper">
            <button className="nav-mobile-hamburger-button" onClick={() => isMenuOpen ? handleClose() : setIsMenuOpen(true)}>
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
