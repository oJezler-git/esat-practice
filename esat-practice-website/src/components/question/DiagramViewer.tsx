import { useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface Props {
  src: string;
}

export function DiagramViewer({ src }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setExpanded(false);
      setIsClosing(false);
    }, 200); // Matches animation duration
  };

  return (
    <>
      <button
        type="button"
        className="w-full border border-gray-200 rounded-lg overflow-hidden cursor-zoom-in shadow"
        onClick={() => setExpanded(true)}
      >
        <img
          src={src}
          alt="Question diagram"
          className="w-full h-auto max-h-64 object-contain bg-white p-2"
        />
        <div className="text-xs text-gray-400 text-center py-1 bg-gray-50">
          Click to enlarge
        </div>
      </button>

      {expanded && (
        <div
          className={`fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 ${
            isClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
          }`}
          onClick={handleClose}
        >
          <div className={`modal-content-enter ${isClosing ? "modal-content-exit" : ""}`}>
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={4}
              centerOnInit={true}
              wheel={{ disabled: true }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <div className="zoom-button-group">
                    <button
                      onClick={(e) => { e.stopPropagation(); zoomIn(); }}
                      className="zoom-button"
                      title="Zoom in"
                    >
                      +
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); zoomOut(); }}
                      className="zoom-button"
                      title="Zoom out"
                    >
                      -
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); resetTransform(); }}
                      className="zoom-button zoom-button-reset"
                      title="Reset zoom"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleClose}
                      className="zoom-button"
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <TransformComponent
                    wrapperStyle={{ width: "100%", height: "100%" }}
                    contentStyle={{ cursor: "grab" }}
                  >
                    <img
                      src={src}
                      alt="Question diagram"
                      className="max-w-full max-h-full object-contain cursor-default"
                    />
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          </div>
        </div>
      )}
    </>
  );
}
