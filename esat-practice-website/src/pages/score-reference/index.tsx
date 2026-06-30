import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const PAGE_MARKDOWN = `# ESAT Score Reference

> **Reliability note:** There are two important sources of error in these estimates: (1) practice accuracy is not the same as real-exam raw performance, and (2) UAT-UK does not publish the raw → scaled conversion table. The ranges in this app should therefore be read as practice benchmarks, not predictions of an actual ESAT score.

The ESAT is scored on a 1-9 scale for each module. UAT-UK publishes scaled scores, but not the raw-mark-to-scaled-score conversion table. That table is recalibrated each sitting so that papers of different difficulty can be compared. This page sets out the model used in the app, the assumptions behind it, and the evidence used for the benchmark figures.

---

## 1. The 1-9 scale

UAT-UK designs the ESAT so that the average candidate, across subjects and sittings, scores about 4.5. Scores below 1.0 are not issued: candidates with 4 or fewer raw marks out of 27 are placed at 1.0. A score of 9.0 corresponds to a raw mark near the top of the paper, although not always full marks.

The three modules taken by Cambridge Engineering applicants are:

- **Mathematics 1** — sequences, algebra, calculus, geometry (prefixed M in this app)
- **Mathematics 2** — harder calculus, complex numbers, differential equations (prefixed MM)
- **Physics** — mechanics, waves, electricity, thermal physics (prefixed P)

Maths 2 appears to be the hardest of the three. In the UAT-UK October 2024 distributions, its modal scaled score is about 3.5, compared with about 4.0 for Maths 1 and 5.0 for Physics. A raw 16/27 in Maths 2 maps to roughly 7.0 on the scale, while the same raw mark in Maths 1 maps to roughly 6.1. The module scales should not be treated as interchangeable.

| Band | Scaled range | What it means |
|---|---|---|
| Below Average | < 4.5 | Below the typical applicant. Not automatically disqualifying, but it would be a weakness. |
| Average | 4.5-5.5 | Around average for the applicant pool. For very competitive engineering courses, this probably needs support from the rest of the application. |
| Above Average | 5.5-6.5 | Clearly above average, but still a range where interviews, grades, and wider application context matter a lot. |
| Competitive | 6.5-7.0 | Close to or above the Engineering offer-holder average in the FOI data (~6.35), depending on module and college. |
| Top ~10% | 7.0-7.5 | Around the top decile of applicants. At this level the ESAT is more likely to help than hurt. |
| Strongly Competitive | 7.5-8.5 | A strong ESAT profile, assuming the module scores are balanced. |
| Exceptional | 8.5-9.0 | Very rare. This would usually be well above the level needed for ESAT to be a concern. |

---

## 2. Score thresholds

| Benchmark | Scaled | M1 raw | M2 raw | Physics raw | Source |
|---|---|---|---|---|---|
| Floor cap | 1.0 | ≤ 4 | ≤ 4 | ≤ 4 | Official |
| Typical / modal candidate | ~4.0-4.5 | ~11-12 | ~9 | ~14 | Official |
| Average of all applicants | ~4.5 | ~12 | ~11 | ~13 | Official |
| Cambridge Eng offer holder avg | ~6.2-6.5 | ~16-17 | ~14-15 | ~17 | FOI (High) |
| Competitive / interview-viable | ~6.5 | ~17 | ~15 | ~18 | Moderate |
| Top ~10% of all applicants | ~7.0 | ~18-19 | ~16 | ~19 | Official |
| Strongly competitive | ~7.5 | ~19-20 | ~17 | ~20 | Inferred |
| Top ~3-5% | ~8.0 | ~21 | ~18 | ~21 | Estimate |
| Exceptional / near-ceiling | ~8.5 | ~22 | ~19 | ~23 | Inferred |
| Module ceiling (9.0) | 9.0 | ≥ 23 | ≥ 20 | ≥ 24 | Crowdsource |

**On the offer-holder average:** the Cambridge FOI response (FOI-2025-1028, November 2025) gives ESAT scores broken down by college and outcome. The ~6.2-6.5 figure is an average across modules for Engineering offer holders. College averages vary, and the offer-holder distribution is wide, so 6.5 is not a guarantee of an offer and 5.8 is not an automatic rejection.

**On the module ceilings:** UAT-UK has not published the raw → scaled mapping. The ceiling values used here (23/27 for M1, 20/27 for M2, 24/27 for Physics) come from TSR threads where students reported their raw marks and scaled scores. This is the least reliable part of the model.

---

## 3. Conversion model

Because UAT-UK does not publish the conversion table, the app uses a simple linear interpolation model anchored to the known points on the scale.

### Anchor points

- Raw marks 0-4 → scaled score **1.0** (the floor cap)
- Raw mark 5 → scaled score **1.5** (the first non-floor score)
- Raw mark ≥ ceiling → scaled score **9.0** (the ceiling cap)

Between raw 5 and the ceiling the model interpolates linearly:

\`\`\`
score = 1.5 + (raw - 5) / (ceiling - 5) * 7.5   // clamped to [1.0, 9.0]
if raw ≤ 4       → score = 1.0
if raw ≥ ceiling → score = 9.0
\`\`\`

### Why linear?

The real UAT-UK conversion is not linear. It is re-equated each sitting using Item Response Theory (IRT), so paper difficulty is taken into account. I use a linear model here because it is a transparent way to interpolate between the known points, it matches the official modal and top-10% scaled scores to about 0.1 points if the TSR ceiling estimates are right, and a more complicated curve would imply more certainty than the public data allows.

### Module ceilings and why they differ

The three modules have different estimated raw-mark ceilings because their difficulty distributions differ. Maths 2 has the lowest estimated ceiling (20/27), so a 9.0 may require only about 74% raw accuracy. That does not mean Maths 2 is easier; it reflects the harder paper being scaled differently. Physics has the highest estimated ceiling (24/27), which is close to full marks. These ceiling estimates come from October 2024 TSR threads and are not confirmed by UAT-UK.

### Full conversion table

Module ceilings: **Maths 1 = 23/27, Maths 2 = 20/27, Physics = 24/27**

| Raw /27 | Maths 1 | Maths 2 | Physics | Notes |
|---:|:---:|:---:|:---:|:---|
| 0-4 | 1.0 | 1.0 | 1.0 | Floor cap |
| 5 | 1.5 | 1.5 | 1.5 | |
| 6 | 1.9 | 2.0 | 1.9 | |
| 7 | 2.3 | 2.5 | 2.3 | |
| 8 | 2.8 | 3.0 | 2.7 | |
| **9** | **3.2** | **3.5** | **3.1** | M2 modal (UAT-UK) |
| 10 | 3.6 | 4.0 | 3.5 | |
| **11** | **4.0** | **4.5** | **3.9** | M1 modal (UAT-UK) |
| 12 | 4.4 | 5.0 | 4.3 | |
| 13 | 4.8 | 5.5 | 4.7 | |
| **14** | **5.3** | **6.0** | **~5.1** | Physics modal (UAT-UK) |
| 15 | 5.7 | 6.5 | 5.4 | |
| **16** | **6.1** | **7.0** | **5.8** | M2 top 10% boundary |
| **17** | **6.5** | **7.5** | **6.2** | M1 lower offer-holder avg |
| 18 | 6.9 | 8.0 | 6.6 | M1 near top 10% |
| **19** | **7.3** | **8.5** | **7.0** | Physics top 10%; M1 top 10% |
| **20** | **7.8** | **9.0** | **7.4** | M2 ceiling (TSR) |
| 21 | 8.2 | 9.0 | 7.8 | |
| 22 | 8.6 | 9.0 | 8.2 | |
| **23** | **9.0** | **9.0** | **8.6** | M1 ceiling (TSR) |
| **24** | **9.0** | **9.0** | **9.0** | Physics ceiling (TSR) |
| 25-27 | 9.0 | 9.0 | 9.0 | Perfect score |

---

## 4. Wilson confidence interval and score ranges

The score panel shows a *range*, not a single estimate. This is intentional: a 10-question session is not enough data to pin down true accuracy, and turning that result into one scaled score would make the estimate look more precise than it is.

### Why Wilson and not a simple percentage?

The naïve approach — "I got 7/10, so my accuracy is 70%" — treats 7/10 and 70/100 as equally reliable. They are not. The Wilson score interval is a frequentist confidence interval for a binomial proportion, and it behaves better than the normal approximation for small samples and for results close to 0% or 100%.

### The formula

For *k* correct answers out of *n* attempts, with z = 1.28 (80% confidence):

\`\`\`
p̂ = k / n                                          // observed proportion
centre = (p̂ + z²/2n) / (1 + z²/n)                // Wilson centre
half   = z * √(p̂(1-p̂)/n + z²/4n²) / (1 + z²/n)  // Wilson half-width
pLow  = centre - half
pHigh = centre + half

if n = 0 → [pLow, pHigh] = [0, 1]                 // maximum uncertainty
\`\`\`

### Why 80% and not 95%?

A 95% Wilson interval on a 10-question session covers nearly the full 1-9 range. That may be statistically cautious, but it is not very useful for feedback. I use 80% because it gives a narrower range while still showing that practice data is noisy. This is a calibration choice, not a claim that 80% is the "correct" confidence level.

### Converting the interval to scaled scores

\`\`\`
rawLow   = clamp(round(pLow  * 27), 0, 27)
rawHigh  = clamp(round(pHigh * 27), 0, 27)
scaledLow  = convertRawToScaled(rawLow,  module)
scaledHigh = convertRawToScaled(rawHigh, module)
\`\`\`

The band headline comes from the two endpoints. If both endpoints are in the same band, the headline uses that band. If the range crosses a boundary, it shows both bands, for example "Above Average-Competitive".

> **Scope of this interval:** the Wilson CI only measures sampling noise in your practice accuracy. It does not include the two bigger uncertainties: how practice performance transfers to the real exam, and whether the estimated raw → scaled table is right. The range bar is therefore a confidence interval on *practice accuracy*, not on the ESAT score itself.

### How the range behaves with more data

The values below are computed from the app's implementation at about 70% accuracy (k = round(0.7 * n)). The n = 5 row uses k = 4, or 80%, because 70% of 5 is not an integer. These rows are included to show the shape of the uncertainty, not as new benchmarks.

| n | k correct | 80% CI | M1 scaled range |
|---|---|---|---|
| 5† | 4 (80%) | 51%-94% | 5.3-9.0 |
| 10 | 7 (70%) | 50%-85% | 4.8-9.0 |
| 20 | 14 (70%) | 56%-81% | 5.7-8.6 |
| 40 | 28 (70%) | 60%-78% | 6.1-8.2 |
| 80 | 56 (70%) | 63%-76% | 6.5-8.2 |

† 70% of 5 is not an integer; row uses k = 4 (80% accuracy). The high end stays near 9.0 at small n because the upper CI bound maps to raw marks at or above the M1 ceiling (23/27). The "low sample" caveat on the score card (fewer than 10 questions) reflects the fact that these ranges span multiple bands.

---

## 5. How estimates work end-to-end

The score panel turns question attempts into a scaled range in four steps:

1. **Classify questions by module** — Each question's \`primary_topic\` is checked against prefix rules: "MM…" → Mathematics 2; "M…" (but not "MM") → Mathematics 1; "P…" → Physics. The "MM" check runs first so that Maths 2 topics are not mistaken for Maths 1. Skipped attempts are excluded. Unclassified topics are tracked but not shown.

2. **Compute per-module correct / total counts** — Count correct and total (non-skipped) attempts per module. A card is only shown if at least one attempt was made.

3. **Apply Wilson CI to get accuracy bounds** — Run the Wilson formula on (correct, total) for each module to produce [pLow, pHigh]. If total = 0, return [0, 1] — full uncertainty.

4. **Convert bounds to scaled scores** — Multiply each bound by 27, round, clamp to [0, 27], then pass through the linear scaling formula to get [scaledLow, scaledHigh].

The point-estimate scaled score, used for the gap-to-next-benchmark calculation, is computed directly from the observed proportion: round(correct/total * 27). It is not computed from the Wilson centre.

---

## 6. Limitations

**The official conversion table is not public.** UAT-UK recalibrates the raw → scaled mapping each sitting using IRT equating. The same raw mark can produce a different scaled score on a harder or easier paper. This app uses a fixed linear formula with fixed ceilings, so it cannot model sitting-by-sitting variation. Treat it as a rough band indicator, not an accurate score prediction.

**Practice accuracy ≠ exam raw mark.** This app is unproctored and often untimed. The question bank uses past NSAA and ENGAA papers, not released ESAT papers. The material is close enough to be useful for practice, but it is not the same exam. The gap between practice accuracy and real-exam performance cannot be measured from this data.

**Module ceiling estimates are informal.** The values 23/27 (M1), 20/27 (M2), and 24/27 (Physics) come from student self-reports on TSR. They were not verified by UAT-UK and may not hold for other sittings.

**ESAT is not additive in admissions decisions.** Cambridge and Imperial look at module profiles, not just averages. A 9.0 in Maths 1 and a 4.0 in Physics is a very different profile from two 6.5s.

**Interview performance still matters most after shortlisting.** The Cambridge FOI data suggests that ESAT helps shape the shortlist, but interview scores carry the most weight in final offer decisions.

---

## 7. Sources

### Official / primary

- **[UAT-UK Explanation of Results — October 2024 (PDF)](https://uat-wp.s3.eu-west-2.amazonaws.com/wp-content/uploads/2024/11/25172754/ESAT_Explanation_of_Results-October2024.pdf)** — Primary source for the 4.5 typical score, ~10% above 7.0, and modal score distribution charts. Highest-confidence data in the model.
- **[UAT-UK ESAT test page](https://esat-tmua.ac.uk/about-the-tests/esat-test/)** — Format, scoring, and no-negative-marking confirmation.
- **[Cambridge FOI response FOI-2025-1028 — data PDF](https://www.whatdotheyknow.com/request/interview_and_esat_score/response/3218616/attach/4/FOI%202025%201028%20Smith%20data.pdf)** · [request page](https://www.whatdotheyknow.com/request/interview_and_esat_score) — Offer-holder ESAT scores by college (November 2025). Supports the ~6.2-6.5 average across modules for Engineering offer holders. The distribution within offer holders is wide; the average is not a cutoff.
- **[Cambridge application statistics dashboard](https://www.undergraduate.study.cam.ac.uk/apply/before/applicationstatistics)** — Applications, offers, and acceptances by course and college.

### Community data (The Student Room)

Crowdsourced and unverified. The only public source for raw-mark ceiling estimates.

- [TSR — Grade boundary predictions](https://www.thestudentroom.co.uk/showthread.php?t=7535848) — Origin of the 23/20/24 ceiling estimates for M1 / M2 / Physics.
- [TSR — Mark conversion discussion](https://www.thestudentroom.co.uk/showthread.php?t=7535842) — 26/27 ≈ 9.0 discussion.
- [TSR — ESAT results thread](https://www.thestudentroom.co.uk/showthread.php?t=7548316) — Self-reported offer-holder scores e.g. 7.6 / 6.4 / 6.8.
- [TSR — Cambridge / Imperial engineering scores](https://www.thestudentroom.co.uk/showthread.php?t=7567282) — ~6.5 for successful applicants.
- [TSR — Minimum Cambridge grades](https://www.thestudentroom.co.uk/showthread.php?t=7530101) — Admitted average ~5-6.
- [TSR — Grade boundaries query](https://www.thestudentroom.co.uk/showthread.php?t=7634104)

### Tutoring / admissions-prep commentary

Secondary interpretation. Commercially motivated but broadly consistent with the primary sources on key thresholds (7.0 ≈ top 10%, 8.0+ ≈ top 3-5%).

- [UEIE — ESAT test explained](https://ueie.com/esat-test-explained/) (7.0 = top 10%, 8.0+ = top 5%)
- [Tutela Prep — What is a good ESAT score?](https://www.tutelaprep.com/blog/what-is-a-good-esat-score/) (tier breakdown)
- [UniAdmissions — ESAT results guide](https://www.uniadmissions.co.uk/esat/guides/esat-results/) (NSAA/ENGAA comparison)
- [Exams.Ninja — ESAT results guide](https://exams.ninja/esat/guides/results/) (score distribution charts)
- [Oxbridge Mind — ESAT complete guide](https://www.oxbridgemind.co.uk/ucas/esat-complete-guide/)
- [Simply Learning Tuition — ESAT](https://www.simplylearningtuition.co.uk/university-admission-consultants/esat/) (top-15% framing)
- [Beyond Tutors — ESAT and interview invitations](https://www.beyond-tutors.com/resources/faq/what-is-the-impact-of-cambridge-esat-results-on-interview-invitations/) (Cambridge tier categories)
- [Quest For Success — ESAT score guide](https://www.questforsuccess.in/esat-score/)
- [Oxbridge Applications — ESAT guide](https://oxbridgeapplications.com/application-resources/admissions-tests-resources/esat-guide/)
`.trim();

const SECTION_IDS = ["overview", "scale", "thresholds", "conversion", "wilson", "estimation", "limitations", "sources"];

const SECTIONS = [
  { id: "overview",    label: "Overview" },
  { id: "scale",       label: "The 1-9 scale" },
  { id: "thresholds",  label: "Score thresholds" },
  { id: "conversion",  label: "Conversion model" },
  { id: "wilson",      label: "Wilson CI & ranges" },
  { id: "estimation",  label: "How estimates work" },
  { id: "limitations", label: "Limitations" },
  { id: "sources",     label: "Sources" },
];

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function copy() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { copied, copy };
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActive(id); },
        { rootMargin: "-20% 0px -70% 0px" },
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((obs) => obs.disconnect());
  }, [ids]);

  return active;
}

export default function ScoreReference() {
  const activeSection = useActiveSection(SECTION_IDS);
  const { copied, copy } = useCopy(PAGE_MARKDOWN);

  return (
    <div className="ref-page-shell">
      {/* Main content */}
      <article className="ref-content">
        <div className="ref-breadcrumb">
          <Link to="/progress" className="ref-breadcrumb-link">Progress</Link>
          <span className="ref-breadcrumb-sep">/</span>
          <span>Score reference</span>
        </div>

        <div className="ref-title-row">
          <h1 className="ref-page-title">ESAT Score Reference</h1>
          <button type="button" onClick={copy} className="ref-copy-btn">
            {copied ? (
              <>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 4H2a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Copy as Markdown
              </>
            )}
          </button>
        </div>
        <p className="ref-page-subtitle">
          How the app estimates scaled scores, what the Cambridge benchmark figures mean,
          and the assumptions behind the score panel.
        </p>

        {/* ── Overview ─────────────────────────────────────────────── */}
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

        {/* ── The 1-9 scale ────────────────────────────────────────── */}
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
            Maths 2 appears to be the hardest of the three. In the UAT-UK October 2024 distributions,
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

        {/* ── Thresholds ───────────────────────────────────────────── */}
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

        {/* ── Conversion model ─────────────────────────────────────── */}
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

        {/* ── Wilson CI ────────────────────────────────────────────── */}
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

        {/* ── How estimates work ───────────────────────────────────── */}
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
            computed directly from the observed proportion: round(correct/total * 27). It is not
            computed from the Wilson centre. This keeps the "you need +0.7 to reach offer-holder
            average" figure tied to the observed result rather than the uncertainty-adjusted centre.
          </p>
        </section>

        {/* ── Limitations ──────────────────────────────────────────── */}
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

        {/* ── Sources ──────────────────────────────────────────────── */}
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

      </article>

      {/* Sticky TOC */}
      <aside className="ref-toc">
        <div className="ref-toc-inner">
          <div className="ref-toc-heading">On this page</div>
          <nav>
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`ref-toc-link ${activeSection === section.id ? "ref-toc-link--active" : ""}`}
              >
                {section.label}
              </a>
            ))}
          </nav>
        </div>
      </aside>
    </div>
  );
}
