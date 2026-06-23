import { ZoomableImage } from "./ZoomableImage";

interface Props {
  src: string;
}

export function DiagramViewer({ src }: Props) {
  return (
    <ZoomableImage
      src={src}
      alt="Question diagram"
      previewButtonClassName="w-full border border-gray-200 rounded-lg overflow-hidden cursor-zoom-in shadow"
      previewImageClassName="w-full h-auto max-h-64 object-contain bg-white p-2"
      previewFooter={
        <div className="text-xs text-gray-400 text-center py-1 bg-gray-50">
          Click to enlarge
        </div>
      }
    />
  );
}
