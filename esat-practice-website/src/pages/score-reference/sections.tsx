export function OverviewSection() {
  return (
    <section id="overview" className="ref-section">
      <div className="ref-callout ref-callout--warning">
        <strong>Reliability note:</strong> There are two important sources of error in these estimates:
        (1) practice accuracy is not the same as real-exam raw performance, and (2) UAT-UK
        does not publish the raw → scaled conversion table. The ranges in this app should
        be read as practice benchmarks, not predictions of an actual ESAT score.
      </div>

      <p className="ref-prose">
        The ESAT is scored on a 1-9 scale for each module. UAT-UK publishes scaled scores,
        but not the raw-mark-to-scaled-score conversion table. That table is recalibrated
        each sitting so that papers of different difficulty can be compared. This page sets
        out the model used in the app, the assumptions behind it, and the evidence used for
        the benchmark figures.
      </p>
    </section>
  );
}

export function ScaleSection() {
  return (
    <section id="scale" className="ref-section">
      <h2 className="ref-h2">The 1-9 scale</h2>

      <p className="ref-prose">
        UAT-UK designs the ESAT so that the average candidate, across subjects and sittings,
        scores about 4.5. Scores below 1.0 are not issued: candidates with 4 or fewer raw
        marks out of 27 are placed at 1.0. A score of 9.0 corresponds to a raw mark near the
        top of the paper, although not always full marks.
      </p>
      <p className="ref-prose">
        The three modules taken by Cambridge Engineering applicants are:
      </p>
      <ul className="ref-prose-list">
        <li><strong>Mathematics 1</strong> — sequences, algebra, calculus, geometry (prefixed M in this app)</li>
        <li><strong>Mathematics 2</strong> — harder calculus, complex numbers, differential equations (prefixed MM)</li>
        <li><strong>Physics</strong> — mechanics, waves, electricity, thermal physics (prefixed P)</li>
      </ul>
      <p className="ref-prose">
        Two further optional modules can be enabled as addons in Settings:
      </p>
      <ul className="ref-prose-list">
        <li><strong>Chemistry</strong> — atomic structure, bonding, quantitative chemistry, organic chemistry (prefixed C)</li>
        <li><strong>Biology</strong> — cells, inheritance, DNA, enzymes, physiology (prefixed B)</li>
      </ul>
      <p className="ref-prose">
        Chemistry and Biology are scored on the same 1-9 scale, but — unlike the three modules
        above — <strong>no crowdsourced raw↔scaled data point exists for either module</strong>.
        Their benchmark figures and ceilings are extrapolated rather than measured; see{" "}
        <a className="ref-link" href="#addons">Chemistry &amp; Biology</a> below for the details
        and the confidence caveats.
      </p>
      <p className="ref-prose">
        Maths 2 appears to be the hardest of the three required modules. In the UAT-UK October 2024 distributions,
        its modal scaled score is about 3.5, compared with about 4.0 for Maths 1 and 5.0 for
        Physics. A raw 16/27 in Maths 2 maps to roughly 7.0 on the scale, while the same raw
        mark in Maths 1 maps to roughly 6.1. The module scales should not be treated as
        interchangeable.
      </p>

      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead>
            <tr>
              <th>Band</th>
              <th>Scaled range</th>
              <th>What it means</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="ref-band-chip ref-band-chip--red">Below Average</span></td>
              <td className="tabular-nums">&lt; 4.5</td>
              <td>Below the typical applicant. Not automatically disqualifying, but it would be a weakness.</td>
            </tr>
            <tr>
              <td><span className="ref-band-chip ref-band-chip--amber">Average</span></td>
              <td className="tabular-nums">4.5-5.5</td>
              <td>Around average for the applicant pool. For very competitive engineering courses, this probably needs support from the rest of the application.</td>
            </tr>
            <tr>
              <td><span className="ref-band-chip ref-band-chip--amber-hi">Above Average</span></td>
              <td className="tabular-nums">5.5-6.5</td>
              <td>Clearly above average, but still a range where interviews, grades, and wider application context matter a lot.</td>
            </tr>
            <tr>
              <td><span className="ref-band-chip ref-band-chip--green">Competitive</span></td>
              <td className="tabular-nums">6.5-7.0</td>
              <td>Close to or above the Engineering offer-holder average in the FOI data (~6.35), depending on module and college.</td>
            </tr>
            <tr>
              <td><span className="ref-band-chip ref-band-chip--teal">Top ~10%</span></td>
              <td className="tabular-nums">7.0-7.5</td>
              <td>Around the top decile of applicants. At this level the ESAT is more likely to help than hurt.</td>
            </tr>
            <tr>
              <td><span className="ref-band-chip ref-band-chip--strong">Strongly Competitive</span></td>
              <td className="tabular-nums">7.5-8.5</td>
              <td>A strong ESAT profile, assuming the module scores are balanced.</td>
            </tr>
            <tr>
              <td><span className="ref-band-chip ref-band-chip--strong">Exceptional</span></td>
              <td className="tabular-nums">8.5-9.0</td>
              <td>Very rare. This would usually be well above the level needed for ESAT to be a concern.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ThresholdsSection() {
  return (
    <section id="thresholds" className="ref-section">
      <h2 className="ref-h2">Score thresholds</h2>
      <p className="ref-prose">
        The anchor points below drive the benchmark lines shown on the score track. They are
        listed in order of evidence quality — the first three are from official UAT-UK
        publications or a Cambridge FOI response; the rest are inferred or community-sourced.
      </p>

      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead>
            <tr>
              <th>Benchmark</th>
              <th>Scaled</th>
              <th>M1 raw</th>
              <th>M2 raw</th>
              <th>Physics raw</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Floor cap</td><td>1.0</td><td>≤ 4</td><td>≤ 4</td><td>≤ 4</td>
              <td><span className="ref-badge ref-badge--high">Official</span></td>
            </tr>
            <tr>
              <td>Typical / modal candidate</td><td>~4.0-4.5</td><td>~11-12</td><td>~9</td><td>~14</td>
              <td><span className="ref-badge ref-badge--high">Official</span></td>
            </tr>
            <tr>
              <td>Average of all applicants</td><td>~4.5</td><td>~12</td><td>~11</td><td>~13</td>
              <td><span className="ref-badge ref-badge--high">Official</span></td>
            </tr>
            <tr>
              <td>Cambridge Eng offer holder avg</td><td>~6.2-6.5</td><td>~16-17</td><td>~14-15</td><td>~17</td>
              <td><span className="ref-badge ref-badge--high">FOI</span></td>
            </tr>
            <tr>
              <td>Competitive / interview-viable</td><td>~6.5</td><td>~17</td><td>~15</td><td>~18</td>
              <td><span className="ref-badge ref-badge--moderate">Moderate</span></td>
            </tr>
            <tr>
              <td>Top ~10% of all applicants</td><td>~7.0</td><td>~18-19</td><td>~16</td><td>~19</td>
              <td><span className="ref-badge ref-badge--high">Official</span></td>
            </tr>
            <tr>
              <td>Strongly competitive</td><td>~7.5</td><td>~19-20</td><td>~17</td><td>~20</td>
              <td><span className="ref-badge ref-badge--moderate">Inferred</span></td>
            </tr>
            <tr>
              <td>Top ~3-5%</td><td>~8.0</td><td>~21</td><td>~18</td><td>~21</td>
              <td><span className="ref-badge ref-badge--low">Estimate</span></td>
            </tr>
            <tr>
              <td>Exceptional / near-ceiling</td><td>~8.5</td><td>~22</td><td>~19</td><td>~23</td>
              <td><span className="ref-badge ref-badge--low">Inferred</span></td>
            </tr>
            <tr>
              <td>Module ceiling (9.0)</td><td>9.0</td><td>≥ 23</td><td>≥ 20</td><td>≥ 24</td>
              <td><span className="ref-badge ref-badge--low">Crowdsource</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="ref-prose">
        <strong>On the offer-holder average:</strong> the Cambridge FOI response (FOI-2025-1028,
        November 2025) gives ESAT scores broken down by college and outcome. The ~6.2-6.5
        figure is an average across modules for Engineering offer holders. College averages
        vary, and the offer-holder distribution is wide, so 6.5 is not a guarantee of an offer
        and 5.8 is not an automatic rejection.
      </p>
      <p className="ref-prose">
        <strong>On the module ceilings:</strong> UAT-UK has not published the raw → scaled
        mapping. The ceiling values used here (23/27 for M1, 20/27 for M2, 24/27 for Physics)
        come from TSR threads where students reported their raw marks and scaled scores. This
        is the least reliable part of the model.
      </p>
    </section>
  );
}

export function ConversionSection() {
  return (
    <section id="conversion" className="ref-section">
      <h2 className="ref-h2">Conversion model</h2>

      <p className="ref-prose">
        Because UAT-UK does not publish the conversion table, the app uses a simple linear
        interpolation model anchored to the known points on the scale.
      </p>

      <h3 className="ref-h3">Anchor points</h3>
      <p className="ref-prose">
        The model is built from two hard constraints that come from the official UAT-UK documentation:
      </p>
      <ul className="ref-prose-list">
        <li>Raw marks 0-4 → scaled score <strong>1.0</strong> (the floor cap)</li>
        <li>Raw mark 5 → scaled score <strong>1.5</strong> (the first non-floor score)</li>
        <li>Raw mark ≥ ceiling → scaled score <strong>9.0</strong> (the ceiling cap)</li>
      </ul>
      <p className="ref-prose">
        Between raw 5 and the ceiling the model interpolates linearly. The formula is:
      </p>
      <div className="ref-formula">
        <div className="ref-formula-line">
          <span className="ref-formula-comment">// clamped to [1.0, 9.0]</span>
        </div>
        <div className="ref-formula-line">
          score = 1.5 + (raw - 5) / (ceiling - 5) * 7.5
        </div>
        <div className="ref-formula-line ref-formula-line--gap">
          <span className="ref-formula-comment">// special cases</span>
        </div>
        <div className="ref-formula-line">
          if raw ≤ 4  → score = 1.0
        </div>
        <div className="ref-formula-line">
          if raw ≥ ceiling → score = 9.0
        </div>
      </div>

      <h3 className="ref-h3">Why linear?</h3>
      <p className="ref-prose">
        The real UAT-UK conversion is not linear. It is re-equated each sitting using Item
        Response Theory (IRT), so paper difficulty is taken into account. I use a linear model
        here because it is a transparent way to interpolate between the known points, it matches
        the official modal and top-10% scaled scores to about 0.1 points if the TSR ceiling
        estimates are right, and a more complicated curve would imply more certainty than the
        public data allows.
      </p>

      <h3 className="ref-h3">Module ceilings and why they differ</h3>
      <p className="ref-prose">
        The three modules have different estimated raw-mark ceilings because their difficulty
        distributions differ. Maths 2 has the lowest estimated ceiling (20/27), so a 9.0 may
        require only about 74% raw accuracy. That does not mean Maths 2 is easier; it reflects
        the harder paper being scaled differently. Physics has the highest estimated ceiling
        (24/27), which is close to full marks. These ceiling estimates come from October 2024
        TSR threads and are not confirmed by UAT-UK.
      </p>
      <p className="ref-prose">
        The consequence for interpretation: the same practice accuracy maps to different scaled
        scores depending on which module the questions belong to. An 80% accuracy rate in Maths 2
        is considerably more impressive than 80% in Physics.
      </p>

      <h3 className="ref-h3">Full conversion table</h3>
      <div className="ref-table-wrap">
        <table className="ref-table ref-table--mono">
          <thead>
            <tr>
              <th>Raw /27</th>
              <th>Maths 1</th>
              <th>Maths 2</th>
              <th>Physics</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>0-4</td><td>1.0</td><td>1.0</td><td>1.0</td><td className="ref-td-note">Floor cap</td></tr>
            <tr><td>5</td><td>1.5</td><td>1.5</td><td>1.5</td><td></td></tr>
            <tr><td>6</td><td>1.9</td><td>2.0</td><td>1.9</td><td></td></tr>
            <tr><td>7</td><td>2.3</td><td>2.5</td><td>2.3</td><td></td></tr>
            <tr><td>8</td><td>2.8</td><td>3.0</td><td>2.7</td><td></td></tr>
            <tr className="ref-row--highlight"><td>9</td><td>3.2</td><td>3.5</td><td>3.1</td><td className="ref-td-note">M2 modal (UAT-UK)</td></tr>
            <tr><td>10</td><td>3.6</td><td>4.0</td><td>3.5</td><td></td></tr>
            <tr className="ref-row--highlight"><td>11</td><td>4.0</td><td>4.5</td><td>3.9</td><td className="ref-td-note">M1 modal (UAT-UK)</td></tr>
            <tr><td>12</td><td>4.4</td><td>5.0</td><td>4.3</td><td></td></tr>
            <tr><td>13</td><td>4.8</td><td>5.5</td><td>4.7</td><td></td></tr>
            <tr className="ref-row--highlight"><td>14</td><td>5.3</td><td>6.0</td><td>~5.1</td><td className="ref-td-note">Physics modal (UAT-UK)</td></tr>
            <tr><td>15</td><td>5.7</td><td>6.5</td><td>5.4</td><td></td></tr>
            <tr className="ref-row--highlight"><td>16</td><td>6.1</td><td>7.0</td><td>5.8</td><td className="ref-td-note">M2 top 10% boundary</td></tr>
            <tr className="ref-row--highlight"><td>17</td><td>6.5</td><td>7.5</td><td>6.2</td><td className="ref-td-note">M1 lower offer-holder avg</td></tr>
            <tr><td>18</td><td>6.9</td><td>8.0</td><td>6.6</td><td className="ref-td-note">M1 near top 10%</td></tr>
            <tr className="ref-row--highlight"><td>19</td><td>7.3</td><td>8.5</td><td>7.0</td><td className="ref-td-note">Physics top 10%; M1 top 10%</td></tr>
            <tr className="ref-row--highlight"><td>20</td><td>7.8</td><td>9.0</td><td>7.4</td><td className="ref-td-note">M2 ceiling (TSR)</td></tr>
            <tr><td>21</td><td>8.2</td><td>9.0</td><td>7.8</td><td></td></tr>
            <tr><td>22</td><td>8.6</td><td>9.0</td><td>8.2</td><td></td></tr>
            <tr className="ref-row--highlight"><td>23</td><td>9.0</td><td>9.0</td><td>8.6</td><td className="ref-td-note">M1 ceiling (TSR)</td></tr>
            <tr className="ref-row--highlight"><td>24</td><td>9.0</td><td>9.0</td><td>9.0</td><td className="ref-td-note">Physics ceiling (TSR)</td></tr>
            <tr><td>25-27</td><td>9.0</td><td>9.0</td><td>9.0</td><td className="ref-td-note">Perfect score</td></tr>
          </tbody>
        </table>
      </div>
      <p className="ref-prose">
        Highlighted rows are anchor points with named significance — modal scores, module ceilings,
        and key admissions thresholds. Plain rows are linear interpolations from the formula above.
      </p>
    </section>
  );
}

export function AddonModulesSection() {
  return (
    <section id="addons" className="ref-section">
      <h2 className="ref-h2">Chemistry &amp; Biology (addon modules)</h2>

      <div className="ref-callout ref-callout--warning">
        <strong>Lower confidence than M1/M2/Physics:</strong> both Chemistry and Biology are
        among the higher-scoring ESAT science modules, but for neither module does a genuine
        crowdsourced ESAT raw↔scaled pair exist. Their 9.0 raw-mark ceilings are extrapolated
        from the last published NSAA conversion table and FOI module-ordering, not measured
        from real ESAT self-reports — materially weaker evidence than the TSR-anchored
        ceilings for Maths 1, Maths 2 and Physics. Score cards for these two modules show an
        "estimated" badge for this reason.
      </div>

      <p className="ref-prose">
        Chemistry is required for Chemical Engineering routes and is a free-choice option for
        Natural Sciences and Veterinary Medicine applicants. Biology cannot be taken for
        Imperial Engineering/Physics routes; it is chosen mainly by Cambridge Natural Sciences
        (biological) and Veterinary Medicine applicants. Both are 27-question, 40-minute,
        no-negative-marking modules, same as the three required modules.
      </p>

      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead>
            <tr>
              <th>Benchmark</th>
              <th>Scaled</th>
              <th>Chemistry raw</th>
              <th>Biology raw</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Floor cap</td><td>1.0</td><td>≤ 4</td><td>≤ 4</td>
              <td><span className="ref-badge ref-badge--high">Official</span></td>
            </tr>
            <tr>
              <td>Modal / typical candidate</td><td>~4.0</td><td>~11-12</td><td>~11-12</td>
              <td><span className="ref-badge ref-badge--moderate">Chart (secondhand)</span></td>
            </tr>
            <tr>
              <td>All-applicant mean</td><td>4.62 / 4.72</td><td>~12-13</td><td>~12-13</td>
              <td><span className="ref-badge ref-badge--high">FOI</span></td>
            </tr>
            <tr>
              <td>Median</td><td>4.5</td><td>~12-13</td><td>~12</td>
              <td><span className="ref-badge ref-badge--high">FOI</span></td>
            </tr>
            <tr>
              <td>75th percentile</td><td>5.7 / 5.9</td><td>~16</td><td>~15</td>
              <td><span className="ref-badge ref-badge--high">FOI</span></td>
            </tr>
            <tr>
              <td>Competitive / interview-viable</td><td>~6.5</td><td>~18</td><td>~16-17</td>
              <td><span className="ref-badge ref-badge--low">Extrapolated</span></td>
            </tr>
            <tr>
              <td>Top ~10%</td><td>7.0</td><td>~19</td><td>~18</td>
              <td><span className="ref-badge ref-badge--moderate">Anchor official, raw est.</span></td>
            </tr>
            <tr>
              <td>Top ~3-5%</td><td>~8.0</td><td>~22</td><td>~20</td>
              <td><span className="ref-badge ref-badge--low">Extrapolated</span></td>
            </tr>
            <tr>
              <td>Module ceiling (9.0)</td><td>9.0</td><td>~24 (23-25)</td><td>~22 (21-23)</td>
              <td><span className="ref-badge ref-badge--low">Extrapolated</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="ref-prose">
        Scaled figures are Chemistry / Biology respectively where they differ. Chemistry mean
        4.62, Biology mean 4.72 — both above the Maths 1 and Physics means. Chemistry's 75th
        percentile is 5.7, Biology's is 5.9 (the highest 75th percentile of the five modules).
      </p>

      <h3 className="ref-h3">Why the ceilings differ from M1/M2/Physics</h3>
      <p className="ref-prose">
        The recommended ceiling of <strong>24/27 for Chemistry</strong> and{" "}
        <strong>22/27 for Biology</strong> both come from proportionally rescaling the last
        published NSAA Section 1 conversion table (2023) to the ESAT's /27 mark scheme, cross-checked
        against the FOI module-mean ordering. This is a much weaker anchor than the Maths 1 (23/27),
        Maths 2 (20/27) and Physics (24/27) ceilings, which are self-reported ESAT raw/scaled
        pairs from TSR. Treat the Chemistry/Biology ceilings as a plausible range (23-25 and 21-23
        respectively), not a fixed boundary.
      </p>

      <h3 className="ref-h3">Distribution shape</h3>
      <p className="ref-prose">
        The two modules do not share a curve shape. Per UniAdmissions' reading of the official
        October 2024 chart, <strong>Chemistry is comparatively peaked</strong>: nearly 50% of
        candidates scored in the 4.0-5.5 range, the tightest cluster of any module, alongside a
        heavy low tail (over 20% scored the 1.0 floor on the legacy NSAA; a 3.0 spike appeared in
        the 2025/26 ESAT cohort). <strong>Biology is the flattest, widest curve of the five
        modules</strong> — about 39% of candidates fell in 4.0-5.5, spread roughly evenly rather
        than peaked, staying "fairly smooth until 7.5." Biology also has the thinnest top end
        (~1% scored 9.0, versus a ~2% module average), and its low tail is volatile between
        sittings — a 2025/26-only floor spike put 6-7% of candidates at 1.0, a spike absent from
        2024/25. In both modules essentially no candidate scored 8.5, so the curve jumps from
        ~8.0 straight to a small 9.0 pile in each case.
      </p>

      <h3 className="ref-h3">Limitations specific to these two modules</h3>
      <ul className="ref-prose-list">
        <li>No candidate on The Student Room, Reddit, or the WhatDoTheyKnow FOI archive has posted a paired raw Chemistry or Biology mark and its scaled score.</li>
        <li>Every UAT-UK request for a raw-to-scaled conversion table has been refused under FOI exemption s.43(2) (commercial sensitivity).</li>
        <li>Distribution percentages are read secondhand from tutoring-company descriptions of the official charts, not extracted from the chart images directly.</li>
        <li>FOI means/quartiles cover the whole ESAT applicant pool, not the self-selected sub-cohort who sit Chemistry or Biology specifically.</li>
      </ul>
    </section>
  );
}

export function WilsonSection() {
  return (
    <section id="wilson" className="ref-section">
      <h2 className="ref-h2">Wilson confidence interval and score ranges</h2>

      <p className="ref-prose">
        The score panel shows a <em>range</em>, not a single estimate. This is intentional:
        a 10-question session is not enough data to pin down true accuracy, and turning that
        result into one scaled score would make the estimate look more precise than it is.
      </p>

      <h3 className="ref-h3">Why Wilson and not a simple percentage?</h3>
      <p className="ref-prose">
        The naïve approach — "I got 7/10, so my accuracy is 70%" — treats 7/10 and 70/100 as
        equally reliable. They are not. The Wilson score interval is a frequentist confidence
        interval for a binomial proportion, and it behaves better than the normal approximation
        for small samples and for results close to 0% or 100%.
      </p>
      <p className="ref-prose">
        The interval gives you the range of true underlying proportions that are consistent with
        your observed result at a given confidence level.
      </p>

      <h3 className="ref-h3">The formula</h3>
      <p className="ref-prose">
        For <em>k</em> correct answers out of <em>n</em> attempts, with z = 1.28 (80% confidence):
      </p>
      <div className="ref-formula">
        <div className="ref-formula-line ref-formula-comment-line">{"// p̂ = observed proportion"}</div>
        <div className="ref-formula-line">p̂ = k / n</div>
        <div className="ref-formula-line ref-formula-line--gap ref-formula-comment-line">{"// Wilson centre and half-width"}</div>
        <div className="ref-formula-line">centre = (p̂ + z²/2n) / (1 + z²/n)</div>
        <div className="ref-formula-line">half   = z * √(p̂(1-p̂)/n + z²/4n²) / (1 + z²/n)</div>
        <div className="ref-formula-line ref-formula-line--gap ref-formula-comment-line">{"// 80% CI bounds"}</div>
        <div className="ref-formula-line">pLow  = centre - half</div>
        <div className="ref-formula-line">pHigh = centre + half</div>
        <div className="ref-formula-line ref-formula-line--gap ref-formula-comment-line">{"// edge case: zero attempts → maximum uncertainty"}</div>
        <div className="ref-formula-line">if n = 0 → [pLow, pHigh] = [0, 1]</div>
      </div>

      <h3 className="ref-h3">Why 80% and not 95%?</h3>
      <p className="ref-prose">
        A 95% Wilson interval on a 10-question session covers nearly the full 1-9 range —
        that may be statistically cautious, but it is not very useful for feedback. I use 80%
        because it gives a narrower range while still showing that practice data is noisy. This
        is a calibration choice, not a claim that 80% is the "correct" confidence level.
      </p>

      <h3 className="ref-h3">Converting the interval to scaled scores</h3>
      <p className="ref-prose">
        Once [pLow, pHigh] is computed, each endpoint is converted to a raw mark and then
        to a scaled score through the conversion model above:
      </p>
      <div className="ref-formula">
        <div className="ref-formula-line">rawLow   = clamp(round(pLow  * 27), 0, 27)</div>
        <div className="ref-formula-line">rawHigh  = clamp(round(pHigh * 27), 0, 27)</div>
        <div className="ref-formula-line ref-formula-line--gap"></div>
        <div className="ref-formula-line">scaledLow  = convertRawToScaled(rawLow,  module)</div>
        <div className="ref-formula-line">scaledHigh = convertRawToScaled(rawHigh, module)</div>
      </div>
      <p className="ref-prose">
        The range bar on the score track spans [scaledLow, scaledHigh]. The band headline
        comes from the two endpoints. If both endpoints are in the same band, the headline
        uses that band. If the range crosses a boundary, it shows both bands, for example
        "Above Average-Competitive".
      </p>
      <div className="ref-callout ref-callout--warning">
        <strong>Scope of this interval:</strong> the Wilson CI only measures sampling noise in your
        practice accuracy. It does not include the two bigger uncertainties: how practice
        performance transfers to the real exam, and whether the estimated raw → scaled table is
        right. The range bar is therefore a confidence interval on your <em>practice accuracy</em>,
        not on the ESAT score itself.
      </div>

      <h3 className="ref-h3">How the range behaves with more data</h3>
      <p className="ref-prose">
        The Wilson interval narrows as <em>n</em> grows. The values below are computed from
        the app's implementation at about 70% accuracy (k&nbsp;=&nbsp;round(0.7&nbsp;*&nbsp;n)).
        The n&nbsp;=&nbsp;5 row uses k&nbsp;=&nbsp;4, or 80%, because 70% of 5 is not an integer.
        These rows are included to show the shape of the uncertainty, not as new benchmarks.
      </p>
      <div className="ref-table-wrap">
        <table className="ref-table ref-table--mono">
          <thead>
            <tr><th>n</th><th>k correct</th><th>80% CI</th><th>M1 scaled range</th></tr>
          </thead>
          <tbody>
            <tr><td>5†</td><td>4 (80%)</td><td>51%-94%</td><td>5.3-9.0</td></tr>
            <tr><td>10</td><td>7 (70%)</td><td>50%-85%</td><td>4.8-9.0</td></tr>
            <tr><td>20</td><td>14 (70%)</td><td>56%-81%</td><td>5.7-8.6</td></tr>
            <tr><td>40</td><td>28 (70%)</td><td>60%-78%</td><td>6.1-8.2</td></tr>
            <tr><td>80</td><td>56 (70%)</td><td>63%-76%</td><td>6.5-8.2</td></tr>
          </tbody>
        </table>
      </div>
      <p className="ref-prose">
        † 70% of 5 is not an integer; row uses k&nbsp;=&nbsp;4 (80% accuracy).
        The high end stays near 9.0 at small n because the upper CI bound maps to raw marks
        at or above the M1 ceiling (23/27). The "low sample" caveat on the score card
        (fewer than 10 questions) reflects the fact that these ranges span multiple bands.
      </p>
    </section>
  );
}

export function EstimationSection() {
  return (
    <section id="estimation" className="ref-section">
      <h2 className="ref-h2">How estimates work end-to-end</h2>

      <p className="ref-prose">
        The score panel turns question attempts into a scaled range in four steps:
      </p>

      <ol className="ref-steps">
        <li>
          <div>
            <div className="ref-step-head">Classify questions by module</div>
            <p className="ref-step-body">
              Each question's <code>primary_topic</code> is checked against the prefix rules:
              topics starting with "MM" → Mathematics 2; topics starting with "M" (but not "MM") →
              Mathematics 1; topics starting with "P" → Physics. The "MM" check runs first so
              that Maths 2 topics are not mistaken for Maths 1. Skipped attempts are excluded.
              Unclassified topics are tracked but not shown in a module card.
            </p>
          </div>
        </li>
        <li>
          <div>
            <div className="ref-step-head">Compute per-module correct / total counts</div>
            <p className="ref-step-body">
              For each module group, count the number of correct and total (non-skipped) attempts.
              A module card is only shown if at least one attempt was made.
            </p>
          </div>
        </li>
        <li>
          <div>
            <div className="ref-step-head">Apply Wilson CI to get accuracy bounds</div>
            <p className="ref-step-body">
              Run the Wilson formula above on (correct, total) for each module to produce
              [pLow, pHigh]. If total = 0 (no attempts), return [0, 1] — full uncertainty.
            </p>
          </div>
        </li>
        <li>
          <div>
            <div className="ref-step-head">Convert bounds to scaled scores</div>
            <p className="ref-step-body">
              Multiply each bound by 27, round to the nearest integer, clamp to [0, 27], then
              pass through the linear scaling formula. The result is [scaledLow, scaledHigh]
              for the range bar and band headline.
            </p>
          </div>
        </li>
      </ol>

      <p className="ref-prose">
        The point-estimate scaled score, used for the gap-to-next-benchmark calculation, is
        computed directly from the observed proportion: round(correct/total × 27). It is not
        computed from the Wilson centre. This keeps the "you need +0.7 to reach offer-holder
        average" figure tied to the observed result rather than the uncertainty-adjusted centre.
        As a side effect, the point estimate can sit off-centre in the range bar — this is
        intentional, not a bug.
      </p>
    </section>
  );
}

export function LimitationsSection() {
  return (
    <section id="limitations" className="ref-section">
      <h2 className="ref-h2">Limitations</h2>

      <div className="ref-limitation">
        <div className="ref-limitation-head">The official conversion table is not public</div>
        <p className="ref-prose">
          UAT-UK recalibrates the raw → scaled mapping each sitting using IRT equating.
          The same raw mark can produce a different scaled score on a harder or easier paper.
          This app uses a fixed linear formula with fixed ceilings, so it cannot model
          sitting-by-sitting variation. Treat it as a rough band indicator, not an accurate
          score prediction.
        </p>
      </div>

      <div className="ref-limitation">
        <div className="ref-limitation-head">Practice accuracy ≠ exam raw mark</div>
        <p className="ref-prose">
          This app is unproctored and often untimed. The question bank uses past NSAA and ENGAA
          papers, not released ESAT papers. The material is close enough to be useful for
          practice, but it is not the same exam. The gap between practice accuracy and real-exam
          performance cannot be measured from this data.
        </p>
      </div>

      <div className="ref-limitation">
        <div className="ref-limitation-head">Module ceiling estimates are informal</div>
        <p className="ref-prose">
          The values 23/27 (M1), 20/27 (M2), and 24/27 (Physics) come from student self-reports
          on TSR. They were not verified by UAT-UK and may not hold for other sittings. If the
          real ceiling is lower (harder paper), the model will underestimate your scaled score;
          if it is higher (easier paper), it will overestimate.
        </p>
      </div>

      <div className="ref-limitation">
        <div className="ref-limitation-head">Chemistry and Biology ceilings are extrapolated, not measured</div>
        <p className="ref-prose">
          Unlike M1/M2/Physics, no candidate has publicly reported a paired raw Chemistry or
          Biology mark and its scaled score. The 24/27 (Chemistry) and 22/27 (Biology) ceilings
          are extrapolated from the last published NSAA conversion table and FOI module-mean
          ordering. See <a className="ref-link" href="#addons">Chemistry &amp; Biology</a> for
          the full reasoning and the plausible ranges.
        </p>
      </div>

      <div className="ref-limitation">
        <div className="ref-limitation-head">ESAT is not additive in admissions decisions</div>
        <p className="ref-prose">
          Cambridge and Imperial look at module profiles, not just averages. A 9.0 in Maths 1 and a
          4.0 in Physics is a very different profile from two 6.5s. This app shows per-module
          estimates separately because collapsing them into one number would obscure module-level
          strengths and weaknesses.
        </p>
      </div>

      <div className="ref-limitation">
        <div className="ref-limitation-head">Interview performance still matters most after shortlisting</div>
        <p className="ref-prose">
          The Cambridge FOI data suggests that ESAT helps shape the shortlist, but interview scores carry
          the most weight in final offer decisions. A strong ESAT does not guarantee an offer;
          a weaker ESAT does not make one impossible.
        </p>
      </div>
    </section>
  );
}

export function SourcesSection() {
  return (
    <section id="sources" className="ref-section">
      <h2 className="ref-h2">Sources</h2>

      <h3 className="ref-h3">Official / primary</h3>
      <ul className="ref-source-list">
        <li>
          <span className="ref-badge ref-badge--high">Official</span>
          <div>
            <a className="ref-link" href="https://uat-wp.s3.eu-west-2.amazonaws.com/wp-content/uploads/2024/11/25172754/ESAT_Explanation_of_Results-October2024.pdf" target="_blank" rel="noopener noreferrer">
              UAT-UK Explanation of Results — October 2024 (PDF)
            </a>
            <p className="ref-source-note">
              Primary source for the 4.5 typical score, ~10% above 7.0, and the module-level
              modal score distribution charts. Highest-confidence data in the model.
            </p>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--high">Official</span>
          <div>
            <a className="ref-link" href="https://esat-tmua.ac.uk/about-the-tests/esat-test/" target="_blank" rel="noopener noreferrer">
              UAT-UK ESAT test page
            </a>
            <p className="ref-source-note">
              Format, scoring, and no-negative-marking confirmation.
            </p>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--high">FOI</span>
          <div>
            <span>
              <a className="ref-link" href="https://www.whatdotheyknow.com/request/interview_and_esat_score/response/3218616/attach/4/FOI%202025%201028%20Smith%20data.pdf" target="_blank" rel="noopener noreferrer">
                Cambridge FOI response FOI-2025-1028 — data PDF
              </a>
              <span className="ref-source-sep"> · </span>
              <a className="ref-link" href="https://www.whatdotheyknow.com/request/interview_and_esat_score" target="_blank" rel="noopener noreferrer">
                request page
              </a>
            </span>
            <p className="ref-source-note">
              Offer-holder ESAT scores by college (November 2025). The most useful single
              source for the ~6.2-6.5 average across modules for Engineering offer holders.
              The distribution within offer holders is wide; the average is not a cutoff.
            </p>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--high">Official</span>
          <div>
            <a className="ref-link" href="https://www.undergraduate.study.cam.ac.uk/apply/before/applicationstatistics" target="_blank" rel="noopener noreferrer">
              Cambridge application statistics dashboard
            </a>
            <p className="ref-source-note">
              Applications, offers, and acceptances by course and college. Referenced in the FOI response.
            </p>
          </div>
        </li>
      </ul>

      <h3 className="ref-h3">Chemistry &amp; Biology (extrapolated ceilings)</h3>
      <p className="ref-prose">
        No TSR/FOI raw↔scaled pair exists for either module. These sources support the FOI
        scaled means/quartiles and the NSAA-proportional ceiling estimate only.
      </p>
      <ul className="ref-source-list">
        <li>
          <span className="ref-badge ref-badge--high">FOI</span>
          <div>
            <a className="ref-link" href="https://www.whatdotheyknow.com/request/esat_2025" target="_blank" rel="noopener noreferrer">
              FOI "Esat 2025" (UAT-UK, 2024/25 cycle)
            </a>
            <p className="ref-source-note">
              Per-module scaled means and quartiles: Chemistry mean 4.617 (median 4.5, 25th 3.4,
              75th 5.7); Biology mean 4.715 (median 4.5, 25th 3.6, 75th 5.9) — the highest mean
              and 75th percentile of the five modules.
            </p>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--low">Extrapolated</span>
          <div>
            <a className="ref-link" href="https://www.uniadmissions.co.uk/esat/guides/esat-results/" target="_blank" rel="noopener noreferrer">
              UniAdmissions — ESAT results guide
            </a>
            <p className="ref-source-note">
              Secondhand description of the official 2024/25 and 2025/26 charts: ~50% of Chemistry
              candidates in 4.0-5.5 vs ~39% of Biology; no candidates at 8.5 in either module;
              ~2% at 9.0 on average vs Biology's ~1%; reproduces the NSAA 2023 conversion table
              used as the ceiling anchor (Chemistry 18/20→9.0, Biology 16/20→9.0).
            </p>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--low">Extrapolated</span>
          <div>
            <a className="ref-link" href="https://exams.ninja/esat/guides/results/" target="_blank" rel="noopener noreferrer">
              Exams.Ninja — ESAT results guide
            </a>
            <p className="ref-source-note">
              Secondhand description of 2025/26 charts: Chemistry spike at 3.0; Biology "over 7%"
              of candidates scoring the 1.0 floor, a spike not present in 2024/25 data.
            </p>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--low">Extrapolated</span>
          <div>
            <a className="ref-link" href="https://www.tutelaprep.com/blog/what-is-a-good-esat-score/" target="_blank" rel="noopener noreferrer">
              Tutela Prep — What is a good ESAT score?
            </a>
            <p className="ref-source-note">Secondhand 2025/26 figure: Biology "over 6%" scoring 1.0.</p>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--low">Extrapolated</span>
          <div>
            <a className="ref-link" href="https://www.oxbridgemind.co.uk/ucas/ucas-esat-for-imperial-college-london/" target="_blank" rel="noopener noreferrer">
              Oxbridge Mind — ESAT for Imperial College London
            </a>
            <p className="ref-source-note">Secondhand Chemistry percentages, 2024/25: ~72% scored ≥4.0, ~32% scored above 5.0.</p>
          </div>
        </li>
      </ul>

      <h3 className="ref-h3">Community data (The Student Room)</h3>
      <p className="ref-prose">
        Crowdsourced and unverified. The only public source for raw-mark ceiling estimates.
        Treat with caution — the ceiling figures are the least reliable part of the conversion model.
      </p>
      <ul className="ref-source-list">
        <li>
          <span className="ref-badge ref-badge--low">Crowdsource</span>
          <div>
            <a className="ref-link" href="https://www.thestudentroom.co.uk/showthread.php?t=7535848" target="_blank" rel="noopener noreferrer">
              TSR — Grade boundary predictions (origin of 23/20/24 ceiling estimates)
            </a>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--low">Crowdsource</span>
          <div>
            <a className="ref-link" href="https://www.thestudentroom.co.uk/showthread.php?t=7535842" target="_blank" rel="noopener noreferrer">
              TSR — Mark conversion discussion (26/27 ≈ 9.0)
            </a>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--low">Crowdsource</span>
          <div>
            <a className="ref-link" href="https://www.thestudentroom.co.uk/showthread.php?t=7548316" target="_blank" rel="noopener noreferrer">
              TSR — ESAT results thread (self-reported offer-holder scores e.g. 7.6 / 6.4 / 6.8)
            </a>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--low">Crowdsource</span>
          <div>
            <a className="ref-link" href="https://www.thestudentroom.co.uk/showthread.php?t=7567282" target="_blank" rel="noopener noreferrer">
              TSR — Cambridge / Imperial engineering scores (~6.5 for successful applicants)
            </a>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--low">Crowdsource</span>
          <div>
            <a className="ref-link" href="https://www.thestudentroom.co.uk/showthread.php?t=7530101" target="_blank" rel="noopener noreferrer">
              TSR — Minimum Cambridge grades (admitted average ~5-6)
            </a>
          </div>
        </li>
        <li>
          <span className="ref-badge ref-badge--low">Crowdsource</span>
          <div>
            <a className="ref-link" href="https://www.thestudentroom.co.uk/showthread.php?t=7634104" target="_blank" rel="noopener noreferrer">
              TSR — Grade boundaries query thread
            </a>
          </div>
        </li>
      </ul>

      <h3 className="ref-h3">Tutoring / admissions-prep commentary</h3>
      <p className="ref-prose">
        Secondary interpretation. Commercially motivated but broadly consistent with the
        primary sources on the key thresholds (7.0 ≈ top 10%, 8.0+ ≈ top 3-5%).
      </p>
      <ul className="ref-source-list ref-source-list--compact">
        <li><span className="ref-badge ref-badge--moderate">Moderate</span><a className="ref-link" href="https://ueie.com/esat-test-explained/" target="_blank" rel="noopener noreferrer">UEIE — ESAT test explained</a><span className="ref-source-aside">(7.0 = top 10%, 8.0+ = top 5%)</span></li>
        <li><span className="ref-badge ref-badge--moderate">Moderate</span><a className="ref-link" href="https://www.tutelaprep.com/blog/what-is-a-good-esat-score/" target="_blank" rel="noopener noreferrer">Tutela Prep — What is a good ESAT score?</a><span className="ref-source-aside">(tier breakdown)</span></li>
        <li><span className="ref-badge ref-badge--moderate">Moderate</span><a className="ref-link" href="https://www.uniadmissions.co.uk/esat/guides/esat-results/" target="_blank" rel="noopener noreferrer">UniAdmissions — ESAT results guide</a><span className="ref-source-aside">(NSAA/ENGAA comparison)</span></li>
        <li><span className="ref-badge ref-badge--moderate">Moderate</span><a className="ref-link" href="https://exams.ninja/esat/guides/results/" target="_blank" rel="noopener noreferrer">Exams.Ninja — ESAT results guide</a><span className="ref-source-aside">(score distribution charts)</span></li>
        <li><span className="ref-badge ref-badge--moderate">Moderate</span><a className="ref-link" href="https://www.oxbridgemind.co.uk/ucas/esat-complete-guide/" target="_blank" rel="noopener noreferrer">Oxbridge Mind — ESAT complete guide</a></li>
        <li><span className="ref-badge ref-badge--moderate">Moderate</span><a className="ref-link" href="https://www.simplylearningtuition.co.uk/university-admission-consultants/esat/" target="_blank" rel="noopener noreferrer">Simply Learning Tuition — ESAT</a><span className="ref-source-aside">(top-15% framing)</span></li>
        <li><span className="ref-badge ref-badge--moderate">Moderate</span><a className="ref-link" href="https://www.beyond-tutors.com/resources/faq/what-is-the-impact-of-cambridge-esat-results-on-interview-invitations/" target="_blank" rel="noopener noreferrer">Beyond Tutors — ESAT and interview invitations</a><span className="ref-source-aside">(Cambridge tier categories)</span></li>
        <li><span className="ref-badge ref-badge--moderate">Moderate</span><a className="ref-link" href="https://www.questforsuccess.in/esat-score/" target="_blank" rel="noopener noreferrer">Quest For Success — ESAT score guide</a></li>
        <li><span className="ref-badge ref-badge--moderate">Moderate</span><a className="ref-link" href="https://oxbridgeapplications.com/application-resources/admissions-tests-resources/esat-guide/" target="_blank" rel="noopener noreferrer">Oxbridge Applications — ESAT guide</a></li>
      </ul>
    </section>
  );
}
