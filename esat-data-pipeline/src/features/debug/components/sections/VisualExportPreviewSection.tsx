import {
  ExportPayload,
  ExportPreviewQuestion,
  ExportPreviewStats,
} from "../../types";
import { truncateText } from "../../utils";
import { JsonPanel } from "../JsonPanel";
import { SectionPanel } from "../SectionPanel";

interface VisualExportPreviewSectionProps {
  exportedQuestionsBase: ExportPreviewQuestion[];
  exportPayloadPreview: ExportPayload;
  exportPreviewStats: ExportPreviewStats;
}

export function VisualExportPreviewSection({
  exportedQuestionsBase,
  exportPayloadPreview,
  exportPreviewStats,
}: VisualExportPreviewSectionProps) {
  return (
    <SectionPanel
      title="Visual Export Preview"
      hint={`${exportedQuestionsBase.length} questions`}
      defaultOpen={exportedQuestionsBase.length > 0}
    >
      {exportedQuestionsBase.length === 0 ? (
        <p className="muted">
          No export preview yet. Upload a paper, run classification, then this
          section will mirror export JSON in a readable dashboard format.
        </p>
      ) : (
        <>
          <div className="preview-meta-grid">
            <div>
              <span className="kv-key">version</span>
              <span className="kv-value">{exportPayloadPreview.version}</span>
            </div>
            <div>
              <span className="kv-key">file_name</span>
              <span className="kv-value">
                {exportPayloadPreview.file_name ?? "none"}
              </span>
            </div>
            <div>
              <span className="kv-key">dev_first_batch_only</span>
              <span className="kv-value">
                {String(exportPayloadPreview.dev_first_batch_only)}
              </span>
            </div>
            <div>
              <span className="kv-key">answer_key_file</span>
              <span className="kv-value">
                {exportPayloadPreview.answer_key_file ?? "none"}
              </span>
            </div>
          </div>

          <div className="preview-metrics">
            <div>
              <span className="metric-key">questions</span>
              <strong>{exportPreviewStats.total}</strong>
            </div>
            <div>
              <span className="metric-key">classified</span>
              <strong>{exportPreviewStats.classified}</strong>
            </div>
            <div>
              <span className="metric-key">with answer</span>
              <strong>{exportPreviewStats.answered}</strong>
            </div>
            <div>
              <span className="metric-key">verified</span>
              <strong>{exportPreviewStats.verified}</strong>
            </div>
            <div>
              <span className="metric-key">high uncertainty</span>
              <strong>{exportPreviewStats.highUncertainty}</strong>
            </div>
            <div>
              <span className="metric-key">avg confidence</span>
              <strong>
                {Math.round(exportPreviewStats.avgConfidence * 100)}%
              </strong>
            </div>
          </div>

          <div className="preview-breakdowns">
            <div>
              <h4>Topic Distribution</h4>
              <div className="chip-row">
                {exportPreviewStats.topicBreakdown.map(([topic, count]) => (
                  <span key={topic} className="chip">
                    {topic} ({count})
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4>Answer Distribution</h4>
              <div className="chip-row">
                {exportPreviewStats.answerBreakdown.length === 0 ? (
                  <span className="muted">No answers mapped.</span>
                ) : (
                  exportPreviewStats.answerBreakdown.map(([answer, count]) => (
                    <span key={answer} className="chip">
                      {answer} ({count})
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Answer</th>
                  <th>Topic</th>
                  <th>Conf</th>
                  <th>Uncertainty</th>
                  <th>Verified</th>
                  <th>Model</th>
                  <th>Page</th>
                  <th>Question Text</th>
                </tr>
              </thead>
              <tbody>
                {exportedQuestionsBase.map((question) => (
                  <tr key={question.id}>
                    <td>{question.number}</td>
                    <td>{question.correctAnswer ?? "-"}</td>
                    <td>
                      {question.classification?.primary_topic ?? "Unclassified"}
                    </td>
                    <td>
                      {question.classification
                        ? `${Math.round((question.classification.confidence ?? 0) * 100)}%`
                        : "-"}
                    </td>
                    <td>
                      {question.classification
                        ? (
                            question.classification.uncertainty_score ?? 0
                          ).toFixed(3)
                        : "-"}
                    </td>
                    <td>{question.classification?.verified ? "yes" : "no"}</td>
                    <td>{question.classification?.model_used ?? "-"}</td>
                    <td>{question.page}</td>
                    <td>{truncateText(question.text, 170)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <JsonPanel
            title="Export Payload (Raw JSON) - may take a moment to load do not spam"
            data={exportPayloadPreview}
          />
        </>
      )}
    </SectionPanel>
  );
}
