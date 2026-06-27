import { ZoomableImage } from "./ZoomableImage";

interface Props {
  src: string;
}

export function DiagramViewer({ src }: Props) {
  return (
    <ZoomableImage
      src={src}
      alt="Question diagram"
      previewButtonClassName="w-full border border-subtle rounded-lg overflow-hidden cursor-zoom-in shadow"
      previewImageClassName="w-full h-auto max-h-64 object-contain bg-soft p-2"
      previewFooter={
        <div className="text-xs text-muted text-center py-1 bg-soft">
          Click to enlarge
        </div>
      }
    />
  );
}
