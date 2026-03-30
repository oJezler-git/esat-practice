import { PageData } from "../../../../lib/pdf-processor";
import { SectionPanel } from "../SectionPanel";

interface RawPagesSectionProps {
  pages: PageData[];
  showPageImages: boolean;
  visibleRawPages: number;
  onShowAll: () => void;
}

export function RawPagesSection({
  pages,
  showPageImages,
  visibleRawPages,
  onShowAll,
}: RawPagesSectionProps) {
  return (
    <SectionPanel
      title="Raw Pages"
      hint={`${pages.length} pages`}
      defaultOpen={pages.length > 0 && pages.length <= 2}
    >
      {pages.length === 0 ? (
        <p className="muted">No pages loaded.</p>
      ) : (
        <>
          <div className="stack">
            {pages.slice(0, visibleRawPages).map((page) => (
              <details key={page.pageNumber} className="json-panel">
                <summary>
                  Page {page.pageNumber} | chars={page.text.length} | lines=
                  {page.text.split("\n").length}
                </summary>
                {showPageImages && page.image && (
                  <img
                    className="page-image"
                    src={page.image}
                    alt={`page-${page.pageNumber}`}
                  />
                )}
                <pre>{page.text}</pre>
              </details>
            ))}
          </div>
          {visibleRawPages < pages.length ? (
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
