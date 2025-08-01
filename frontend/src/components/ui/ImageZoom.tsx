import { useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, X } from 'lucide-react';

interface ImageZoomProps {
  src: string;
  alt: string;
  className?: string;
}

export default function ImageZoom({ src, alt, className = '' }: ImageZoomProps) {
  const [zoomed, setZoomed] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!zoomed || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPosition({ x, y });
  }, [zoomed]);

  const toggleZoom = () => {
    if (zoomed) {
      setZoomed(false);
      setScale(1);
    } else {
      setZoomed(true);
      setScale(2.5);
    }
  };

  return (
    <>
      <div
        ref={imgRef}
        className={`relative overflow-hidden cursor-zoom-in group ${className}`}
        onClick={toggleZoom}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => zoomed && setZoomed(false)}
      >
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-transform duration-300 ${
            zoomed ? 'scale-[2.5]' : 'group-hover:scale-105'
          }`}
          style={zoomed ? { transformOrigin: `${position.x}% ${position.y}%` } : undefined}
          draggable={false}
        />
        {!zoomed && (
          <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
            <ZoomIn size={16} className="text-zinc-600" />
          </div>
        )}
      </div>

      {/* Fullscreen lightbox */}
      {zoomed && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center cursor-zoom-out animate-fade-in"
          onClick={toggleZoom}
        >
          <button
            className="absolute top-4 right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
            onClick={toggleZoom}
            aria-label="Close zoom"
          >
            <X size={20} />
          </button>
          <img
            src={src}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl"
          />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
            <button
              onClick={(e) => { e.stopPropagation(); setScale(Math.max(1, scale - 0.5)); }}
              className="text-white p-1 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Zoom out"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-white text-xs font-mono">{Math.round(scale * 100)}%</span>
            <button
              onClick={(e) => { e.stopPropagation(); setScale(Math.min(5, scale + 0.5)); }}
              className="text-white p-1 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Zoom in"
            >
              <ZoomIn size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
