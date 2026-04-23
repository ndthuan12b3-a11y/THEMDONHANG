import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RotateCcw, RotateCw, Loader2, Crop, Check, X, Sun, Contrast, Undo2 } from 'lucide-react';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';

interface ImageEditorProps {
  file: File;
  previewUrl: string;
  onSave: (file: File, url: string) => void;
  onCancel: () => void;
  isOpen: boolean;
}

type ToolMode = 'crop' | 'brightness' | 'contrast';

export function ImageEditor({ file, previewUrl, onSave, onCancel, isOpen }: ImageEditorProps) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolMode>('crop');

  const rotateLeft = () => cropperRef.current?.cropper.rotate(-90);
  const rotateRight = () => cropperRef.current?.cropper.rotate(90);

  const handleSave = async () => {
    setIsProcessing(true);
    try {
      const cropper = cropperRef.current?.cropper;
      if (!cropper) throw new Error("Cropper not initialized");

      const croppedCanvas = cropper.getCroppedCanvas({
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });

      if (!croppedCanvas) throw new Error("Could not get cropped canvas");

      const filterCanvas = document.createElement('canvas');
      filterCanvas.width = croppedCanvas.width;
      filterCanvas.height = croppedCanvas.height;
      const ctx = filterCanvas.getContext('2d');
      
      if (ctx) {
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
        ctx.drawImage(croppedCanvas, 0, 0);
      }

      const finalCanvas = ctx ? filterCanvas : croppedCanvas;

      finalCanvas.toBlob((blob) => {
        if (blob) {
          const newFile = new File([blob], file.name, { type: file.type || 'image/jpeg' });
          const newUrl = URL.createObjectURL(blob);
          onSave(newFile, newUrl);
        } else {
          onCancel();
        }
      }, file.type || 'image/jpeg', 0.95); // Match the high upload quality (0.95)
    } catch (error) {
      console.error("Error saving edited image", error);
      onCancel();
    } finally {
      setIsProcessing(false);
    }
  };

  const restoreDefaults = () => {
    setBrightness(100);
    setContrast(100);
    cropperRef.current?.cropper.reset();
  };

  const sliderClass = "w-full appearance-none h-1 bg-zinc-800 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-110 transition-all cursor-pointer";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      {/* 
        Native App Style: Full screen on mobile, bounded on desktop.
        Dark immersive background. 
      */}
      <DialogContent className="w-[100dvw] h-[100dvh] max-w-none m-0 p-0 flex flex-col bg-black text-white border-0 sm:max-w-3xl sm:h-[90vh] sm:rounded-[2rem] sm:m-auto gap-0 overflow-hidden shadow-2xl">
        <DialogTitle className="sr-only">Chỉnh sửa ảnh 4K</DialogTitle>
        
        <style>{`
          .filtered-cropper .cropper-canvas img,
          .filtered-cropper .cropper-view-box img {
            filter: brightness(${brightness}%) contrast(${contrast}%);
            transition: filter 0.1s;
          }
          .cropper-view-box { outline: 1px solid rgba(255,255,255,0.8); }
          .cropper-line, .cropper-point { background-color: rgba(255,255,255,0.8); }
          .cropper-center::before, .cropper-center::after { background-color: rgba(255,255,255,0.8); }
        `}</style>

        {/* TOP NAVBAR */}
        <div className="flex justify-between items-center px-4 py-3 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-50">
          <button onClick={onCancel} className="p-2 text-zinc-300 hover:text-white transition-colors rounded-full bg-black/40 backdrop-blur-md">
            <X className="w-5 h-5" />
          </button>
          
          <span className="text-xs font-bold tracking-widest text-zinc-100 drop-shadow-md">
            {activeTool === 'crop' && 'CẮT & XOAY'}
            {activeTool === 'brightness' && 'ĐỘ SÁNG'}
            {activeTool === 'contrast' && 'TƯƠNG PHẢN'}
          </span>
          
          <button 
            onClick={handleSave} 
            disabled={isProcessing} 
            className="p-2 text-zinc-900 bg-emerald-400 hover:bg-emerald-300 transition-colors rounded-full shadow-lg font-bold flex items-center justify-center disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          </button>
        </div>

        {/* IMAGE PREVIEW/CROP AREA */}
        <div className="flex-1 w-full bg-[#0a0a0a] relative overflow-hidden flex items-center justify-center pb-[#120px]">
          <Cropper
            ref={cropperRef}
            src={previewUrl}
            className="filtered-cropper"
            style={{ height: '100%', width: '100%' }}
            autoCropArea={0.9}
            guides={true}
            viewMode={2}
            dragMode="crop"
            background={false}
            center={true}
          />
        </div>

        {/* FLOATING CONTROLS & TAB AREA */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-transparent pt-12 pb-safe z-50 flex flex-col">
          
          {/* Active Tool Slider / Actions */}
          <div className="h-16 px-6 flex items-center justify-center">
            {activeTool === 'crop' && (
              <div className="flex gap-8 items-center bg-zinc-900/50 backdrop-blur-md px-6 py-2 rounded-full border border-white/5 shadow-2xl">
                <button onClick={rotateLeft} className="flex flex-col items-center justify-center gap-1.5 text-zinc-400 hover:text-white transition-colors">
                  <RotateCcw className="w-5 h-5" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Trái</span>
                </button>
                <div className="h-8 w-px bg-white/10 mx-2" />
                <button onClick={rotateRight} className="flex flex-col items-center justify-center gap-1.5 text-zinc-400 hover:text-white transition-colors">
                  <RotateCw className="w-5 h-5" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Phải</span>
                </button>
                <div className="h-8 w-px bg-white/10 mx-2" />
                <button onClick={restoreDefaults} className="flex flex-col items-center justify-center gap-1.5 text-red-400/80 hover:text-red-400 transition-colors">
                  <Undo2 className="w-5 h-5" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Đặt lại</span>
                </button>
              </div>
            )}
            
            {activeTool === 'brightness' && (
              <div className="w-full max-w-sm flex items-center gap-4 bg-zinc-900/50 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/5 shadow-2xl">
                <Sun className="w-5 h-5 text-zinc-400 shrink-0" />
                <input type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className={sliderClass} />
                <span className="text-xs text-zinc-300 font-bold w-9 text-right shrink-0">{brightness - 100}</span>
              </div>
            )}

            {activeTool === 'contrast' && (
              <div className="w-full max-w-sm flex items-center gap-4 bg-zinc-900/50 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/5 shadow-2xl">
                <Contrast className="w-5 h-5 text-zinc-400 shrink-0" />
                <input type="range" min="50" max="150" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className={sliderClass} />
                <span className="text-xs text-zinc-300 font-bold w-9 text-right shrink-0">{contrast - 100}</span>
              </div>
            )}
          </div>

          {/* Bottom Tab Bar */}
          <div className="flex items-center justify-around py-4 px-2 mt-4 max-w-md mx-auto w-full">
            <button 
              onClick={() => setActiveTool('crop')} 
              className={`flex flex-col items-center gap-2 p-2 w-20 transition-all ${activeTool === 'crop' ? 'text-white scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Crop className="w-6 h-6" />
              <span className="text-[10px] uppercase font-black tracking-widest">Cắt</span>
            </button>
            <button 
              onClick={() => setActiveTool('brightness')} 
              className={`flex flex-col items-center gap-2 p-2 w-20 transition-all ${activeTool === 'brightness' ? 'text-white scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Sun className="w-6 h-6" />
              <span className="text-[10px] uppercase font-black tracking-widest">Sáng</span>
            </button>
            <button 
              onClick={() => setActiveTool('contrast')} 
              className={`flex flex-col items-center gap-2 p-2 w-20 transition-all ${activeTool === 'contrast' ? 'text-white scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Contrast className="w-6 h-6" />
              <span className="text-[10px] uppercase font-black tracking-widest">T.Phản</span>
            </button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
