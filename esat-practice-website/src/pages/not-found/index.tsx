import { useState } from "react";
import { Link } from "react-router-dom";
import NotFoundGame from "./NotFoundGame";
import BoosterLandingGame from "./BoosterLandingGame";

type GameId = "slingshot" | "booster";

export default function NotFound() {
  const [won, setWon] = useState(false);
  const [game, setGame] = useState<GameId>("booster");

  return (
    <section className="max-w-3xl mx-auto px-4 py-16 sk-misc">
      <div className="sk-frame ng-frame">
        <span className="sk-screw sk-screw--tl" />
        <span className="sk-screw sk-screw--tr" />
        <span className="sk-screw sk-screw--bl" />
        <span className="sk-screw sk-screw--br" />

        <div className="ng-head">
          <div className="ng-head__text">
            <p className="ng-eyebrow">404</p>
            <h1 className="ng-title">This page does not exist</h1>
            <p className="ng-sub">
              The link may be old, or the page may have moved. You can continue
              from home.
            </p>
          </div>
          <Link
            to="/"
            className={`btn-primary ng-home${won ? " ng-home--ready" : ""}`}
          >
            Go to home
          </Link>
        </div>

        <div className="ng-tabs">
          <button
            type="button"
            className={`ng-tab${game === "booster" ? " ng-tab--on" : ""}`}
            aria-pressed={game === "booster"}
            onClick={() => setGame("booster")}
          >
            Booster landing
          </button>
          <button
            type="button"
            className={`ng-tab${game === "slingshot" ? " ng-tab--on" : ""}`}
            aria-pressed={game === "slingshot"}
            onClick={() => setGame("slingshot")}
          >
            Escape the 404
          </button>
        </div>

        {game === "slingshot" ? (
          <NotFoundGame key="slingshot" onWin={() => setWon(true)} />
        ) : (
          <BoosterLandingGame key="booster" onWin={() => setWon(true)} />
        )}
      </div>
    </section>
  );
}
