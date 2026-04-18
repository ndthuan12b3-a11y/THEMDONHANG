import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { motion, AnimatePresence } from 'motion/react';
import { X, Crop as CropIcon, RotateCw, RotateCcw, Check, Eye, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageEditorModalProps {
  isOpen: boolean;
  imageSrc: string;
  onSave: (croppedImageUrl: string) => void;
  onClose: () => void;
}

export function ImageEditorModal({ isOpen, imageSrc, onSave, onClose }: ImageEditorModalProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [rotation, setRotation] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode('view');
      setCrop(undefined);
      setCompletedCrop(undefined);
      setRotation(0);
    }
  }, [isOpen, imageSrc]);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        1, // We don't force a square, just to initialize
        width,
        height
      ),
      width,
      height
    );
    // Don't force initial crop so user can just rotate if they want
  }

  const handleSave = async () => {
    if (!imgRef.current) return;
    setLoading(true);

    try {
      const image = imgRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('No 2d context');

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      const pixelRatio = window.devicePixelRatio || 1;

      // Ensure cropped area exists, if not use full image
      const targetCrop = completedCrop || {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
        unit: 'px'
      };

      const rad = (rotation * Math.PI) / 180;
      
      // Calculate bounding box after rotation
      const absCos = Math.abs(Math.cos(rad));
      const absSin = Math.abs(Math.sin(rad));
      
      const naturalTargetW = targetCrop.width * scaleX;
      const naturalTargetH = targetCrop.height * scaleY;

      // the dimensions of the canvas need to fit the rotated image
      const canvasWidth = naturalTargetW * absCos + naturalTargetH * absSin;
      const canvasHeight = naturalTargetW * absSin + naturalTargetH * absCos;

      canvas.width = Math.floor(canvasWidth * pixelRatio);
      canvas.height = Math.floor(canvasHeight * pixelRatio);
      ctx.scale(pixelRatio, pixelRatio);
      ctx.imageSmoothingQuality = 'high';

      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.rotate(rad);
      ctx.translate(-naturalTargetW / 2, -naturalTargetH / 2);

      // Draw the cropped image
      ctx.drawImage(
        image,
        targetCrop.x * scaleX,
        targetCrop.y * scaleY,
        targetCrop.width * scaleX,
        targetCrop.height * scaleY,
        0,
        0,
        naturalTargetW,
        naturalTargetH
      );

      const base64Image = canvas.toDataURL('image/jpeg', 0.9);
      onSave(base64Image);
    } catch (e) {
      console.error("Error saving image", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-6 bg-zinc-950/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 40 }}
            className="relative w-full max-w-2xl bg-white rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[90vh] md:h-auto max-h-[100dvh] md:max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", mode === 'edit' ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600")}>
                  {mode === 'edit' ? <Scissors className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-tight text-zinc-900">{mode === 'edit' ? "Chỉnh sửa ảnh" : "Xem chi tiết"}</h2>
                  <p className="text-[10px] font-bold text-zinc-500">{mode === 'edit' ? "Cắt và xoay trước khi tải lên" : "Vuốt để thu phóng kiểm tra thông tin"}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="h-10 w-10 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:text-zinc-900 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-auto bg-zinc-50/80 relative">
              {mode === 'view' ? (
                 <div className="absolute inset-0 overflow-auto touch-pan-x touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                   <div className="min-h-full min-w-full flex items-center justify-center p-2">
                      <img
                        alt="Chi tiết"
                        src={imageSrc}
                        className="max-w-none w-full sm:max-w-full sm:max-h-[60vh] object-contain"
                        referrerPolicy="no-referrer"
                      />
                   </div>
                 </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-2 sm:p-6 overflow-hidden">
                  <div className="max-h-[400px] sm:max-h-[500px] max-w-full overflow-hidden flex items-center justify-center touch-none">
                    <ReactCrop
                      crop={crop}
                      onChange={(_, percentCrop) => setCrop(percentCrop)}
                      onComplete={(c) => setCompletedCrop(c)}
                      className="rounded-xl overflow-hidden shadow-sm border border-zinc-200 bg-zinc-100/50"
                      style={{ display: 'inline-block' }}
                    >
                      <img
                        ref={imgRef}
                        alt="Tiền xử lý"
                        src={imageSrc}
                        onLoad={onImageLoad}
                        className="max-h-[400px] sm:max-h-[500px] max-w-full object-contain transition-transform duration-300"
                        style={{ transform: `rotate(${rotation}deg)` }}
                        referrerPolicy="no-referrer"
                      />
                    </ReactCrop>
                  </div>
                </div>
              )}
            </div>

            {/* Controls & Footer */}
            <div className="p-4 sm:p-6 bg-white border-t border-zinc-100 shrink-0 space-y-4">
              {mode === 'edit' && (
                <div className="flex items-center justify-center gap-4">
                  <Button variant="outline" size="icon" onClick={() => setRotation(r => r - 90)} className="rounded-xl h-12 w-12 border-zinc-200">
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                  <div className="text-xs font-bold text-zinc-500 w-16 text-center">{rotation}°</div>
                  <Button variant="outline" size="icon" onClick={() => setRotation(r => r + 90)} className="rounded-xl h-12 w-12 border-zinc-200">
                    <RotateCw className="h-5 w-5" />
                  </Button>
                </div>
              )}
              
              <div className="flex gap-3">
                {mode === 'view' ? (
                  <>
                    <Button variant="ghost" onClick={onClose} className="flex-1 h-12 rounded-2xl font-bold bg-zinc-100 hover:bg-zinc-200">
                      Đóng
                    </Button>
                    <Button onClick={() => setMode('edit')} className="flex-[2] h-12 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold gap-2 shadow-lg shadow-amber-200">
                      <Scissors className="h-5 w-5" />
                      Cắt / Xoay ảnh
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setMode('view')} className="flex-1 h-12 rounded-2xl font-bold bg-zinc-100 hover:bg-zinc-200">
                      Hủy cắt
                    </Button>
                    <Button onClick={handleSave} disabled={loading} className="flex-[2] h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold gap-2">
                      <Check className="h-5 w-5" />
                      {loading ? 'Đang lưu...' : 'Lưu bản cắt'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
