import { ClassificationResult } from "../../../../lib/pipeline/types";
import { JsonPanel } from "../JsonPanel";
import { SectionPanel } from "../SectionPanel";

interface FinalResultsSectionProps {
  results: ClassificationResult[];
}

export function FinalResultsSection({ results }: FinalResultsSectionProps) {
  return (
    <SectionPanel
      title="Final Results JSON"
      hint={`${results.length} results`}
      defaultOpen={results.length > 0}
    >
      {results.length === 0 ? (
        <p className="muted">No results yet.</p>
      ) : (
        <JsonPanel title={`results (${results.length})`} data={results} open />
      )}
    </SectionPanel>
  );
}
