import { ExtractionLogEntry } from "../../types";
import { SectionPanel } from "../SectionPanel";

interface ExtractionLogsSectionProps {
  extractionLogs: ExtractionLogEntry[];
  visibleExtractionLogs: number;
  onShowAll: () => void;
}

export function ExtractionLogsSection({
  extractionLogs,
  visibleExtractionLogs,
  onShowAll,
}: ExtractionLogsSectionProps) {
  return (
    <SectionPanel
      title="Extraction Logs"
      hint={`${extractionLogs.length} entries`}
      defaultOpen={extractionLogs.length > 0}
    >
      {extractionLogs.length === 0 ? (
        <p className="muted">No extraction logs yet.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>timestamp</th>
                  <th>page</th>
                  <th>total</th>
                  <th>detail</th>
                </tr>
              </thead>
              <tbody>
                {extractionLogs.slice(0, visibleExtractionLogs).map((log, index) => (
                  <tr key={`${log.timestamp}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{log.timestamp}</td>
                    <td>{log.page}</td>
                    <td>{log.total}</td>
                    <td>{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleExtractionLogs < extractionLogs.length ? (
            <div className="overlay-more-wrap">
              <div className="overlay-fade-tail" />
              <button className="overlay-more-button" onClick={onShowAll}>
                Show more...
              </button>
            </div>
          ) : null}
        </>
      )}
    </SectionPanel>
  );
}
