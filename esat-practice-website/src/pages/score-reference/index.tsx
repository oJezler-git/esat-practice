import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ConversionSection,
  EstimationSection,
  LimitationsSection,
  OverviewSection,
  ScaleSection,
  SourcesSection,
  ThresholdsSection,
  WilsonSection,
} from "./sections";

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
    <div className="ref-page-shell sk-scoreref">
      <div className="sk-frame">
        <span className="sk-screw sk-screw--tl" />
        <span className="sk-screw sk-screw--tr" />
        <span className="sk-screw sk-screw--bl" />
        <span className="sk-screw sk-screw--br" />

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

        <ul className="ref-tldr">
          <li className="ref-tldr-head">TL;DR</li>
          <li>Score ranges are 80% confidence intervals on your <strong>practice accuracy</strong> — not predictions of your actual ESAT score.</li>
          <li>Module ceilings (23/27 M1, 20/27 M2, 24/27 Physics) are the weakest link: sourced from TSR self-reports, not confirmed by UAT-UK.</li>
          <li>80% confidence chosen over 95% so ranges stay narrow enough to be useful on a 10-question session; a 95% CI would span nearly the full 1–9 scale.</li>
        </ul>

        <OverviewSection />
        <ScaleSection />
        <ThresholdsSection />
        <ConversionSection />
        <WilsonSection />
        <EstimationSection />
        <LimitationsSection />
        <SourcesSection />
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
    </div>
  );
}
