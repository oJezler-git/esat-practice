import { PipelineSummary, PipelineTraceEntry } from "../../types";
import { JsonPanel } from "../JsonPanel";
import { SectionPanel } from "../SectionPanel";

interface PipelineTraceSectionProps {
  pipelineTrace: PipelineTraceEntry[];
  pipelineSummary: PipelineSummary;
}

export function PipelineTraceSection({
  pipelineTrace,
  pipelineSummary,
}: PipelineTraceSectionProps) {
  return (
    <SectionPanel
      title="Pipeline Trace"
      hint={`${pipelineTrace.length} calls`}
      defaultOpen={pipelineTrace.length > 0}
    >
      <div className="status-grid">
        <div>
          <strong>Stage 1 calls:</strong> {pipelineSummary.stage1Calls}
        </div>
        <div>
          <strong>Stage 2 calls:</strong> {pipelineSummary.stage2Calls}
        </div>
        <div>
          <strong>Escalated questions:</strong> {pipelineSummary.escalatedCount}
        </div>
        <div>
          <strong>Trace errors:</strong> {pipelineSummary.errors}
        </div>
      </div>
      {pipelineTrace.length === 0 ? (
        <p className="muted">No trace entries yet.</p>
      ) : (
        <div className="stack">
          {pipelineTrace.map((entry, index) => (
            <details key={`${entry.timestamp}-${index}`} className="json-panel">
              <summary>
                {index + 1}. {entry.stage} | model={entry.model} | parsed=
                {entry.parsed_count} | questions={entry.question_ids.length}
                {entry.error ? " | error=true" : ""}
              </summary>
              <JsonPanel
                title="Trace Metadata"
                data={{
                  timestamp: entry.timestamp,
                  stage: entry.stage,
                  model: entry.model,
                  batch_index: entry.batch_index,
                  batch_total: entry.batch_total,
                  question_ids: entry.question_ids,
                  escalated_ids: entry.escalated_ids,
                  parsed_count: entry.parsed_count,
                  note: entry.note,
                  error: entry.error,
                }}
              />
              <details className="json-panel">
                <summary>Prompt</summary>
                <pre>{entry.prompt || "(empty prompt)"}</pre>
              </details>
              <details className="json-panel">
                <summary>Raw Model Response</summary>
                <pre>{entry.raw_response || "(empty response)"}</pre>
              </details>
            </details>
          ))}
        </div>
      )}
    </SectionPanel>
  );
}
