import React, { useState, WheelEvent, MouseEvent, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Trash2, 
  Search, 
  User as UserIcon, 
  CheckCircle2, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  FileText,
  Package,
  RotateCw,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Order, PharmacyName, PHARMACIES } from '../types';
import { HelpTrigger } from './HelpManual';

interface OrderCardProps {
  order: Order;
  viewMode: 'grid' | 'list';
}

export const OrderCard = React.memo(({ order, viewMode }: OrderCardProps) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState<number | null>(null);
  
  // Advanced Gallery State
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const viewerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const resetZoom = () => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  };

  // Helper to clamp position so image doesn't fly off screen
  const getClampedPosition = (newPos: { x: number, y: number }, zoom: number) => {
    if (!viewerRef.current || !imgRef.current) return newPos;
    
    const viewer = viewerRef.current.getBoundingClientRect();
    const img = imgRef.current.getBoundingClientRect();
    
    const limitX = Math.max(0, (img.width * zoom - viewer.width) / 2);
    const limitY = Math.max(0, (img.height * zoom - viewer.height) / 2);

    return {
      x: Math.max(-limitX, Math.min(limitX, newPos.x)),
      y: Math.max(-limitY, Math.min(limitY, newPos.y))
    };
  };

  const handleWheel = (e: WheelEvent) => {
    if (fullScreenImageIndex === null) return;
    
    const delta = e.deltaY > 0 ? -0.3 : 0.3;
    const newZoom = Math.min(8, Math.max(1, zoomLevel + delta));
    
    if (newZoom !== zoomLevel && viewerRef.current) {
      const rect = viewerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;
      
      const ratio = newZoom / zoomLevel;
      const newPos = {
        x: mouseX - (mouseX - position.x) * ratio,
        y: mouseY - (mouseY - position.y) * ratio
      };

      setPosition(getClampedPosition(newPos, newZoom));
      setZoomLevel(newZoom);
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      const newPos = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      };
      setPosition(getClampedPosition(newPos, zoomLevel));
    }
  };

  const handleDoubleClick = (e: MouseEvent) => {
    if (zoomLevel > 1) {
      resetZoom();
    } else {
      if (viewerRef.current) {
        const rect = viewerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left - rect.width / 2;
        const offsetY = e.clientY - rect.top - rect.height / 2;
        const newZoom = 3;
        const newPos = { x: -offsetX * 2, y: -offsetY * 2 };
        setZoomLevel(newZoom);
        setPosition(getClampedPosition(newPos, newZoom));
      }
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // Touch handlers for mobile
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y });
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setTouchStartDist(dist);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && e.touches.length === 1 && zoomLevel > 1) {
      const newPos = {
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      };
      setPosition(getClampedPosition(newPos, zoomLevel));
    } else if (e.touches.length === 2 && touchStartDist !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = (dist - touchStartDist) / 100;
      const newZoom = Math.min(8, Math.max(1, zoomLevel + delta));
      setZoomLevel(newZoom);
      setTouchStartDist(dist);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setTouchStartDist(null);
  };

  // Keyboard navigation for gallery
  useEffect(() => {
    if (fullScreenImageIndex === null) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullScreenImageIndex(null);
      if (e.key === 'ArrowRight') navigateGallery(1);
      if (e.key === 'ArrowLeft') navigateGallery(-1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullScreenImageIndex]);

  const navigateGallery = (direction: number) => {
    const urls = order.imageUrls || (order.imageUrl ? [order.imageUrl] : []);
    if (urls.length <= 1) return;
    
    setFullScreenImageIndex(prev => {
      if (prev === null) return null;
      let next = prev + direction;
      if (next < 0) next = urls.length - 1;
      if (next >= urls.length) next = 0;
      return next;
    });
    resetZoom();
  };

  // Improved Swipe for Mobile
  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
  };

  const handleDragEnd = (e: any, { offset, velocity }: any) => {
    if (zoomLevel > 1) return; // Don't swipe if zoomed
    const swipe = swipePower(offset.x, velocity.x);

    if (swipe < -swipeConfidenceThreshold) {
      navigateGallery(1);
    } else if (swipe > swipeConfidenceThreshold) {
      navigateGallery(-1);
    }
  };

  const [editOrderName, setEditOrderName] = useState(order.orderName);
  const [editPharmacy, setEditPharmacy] = useState<PharmacyName>(order.pharmacy);
  const [editNote, setEditNote] = useState(order.note || '');

  const pharmacyConfig = PHARMACIES.find(p => p.name === order.pharmacy) || PHARMACIES[0];
  const imageUrls = order.imageUrls || (order.imageUrl ? [order.imageUrl] : []);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const renderGallery = () => {
    return (
      <>
      {/* Professional Gallery Viewer stays centered/consistent */}
      {/* High-Performance Portal-based Gallery Viewer */}
      {fullScreenImageIndex !== null && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col bg-black overflow-hidden select-none">
          <AnimatePresence mode="wait">
            <motion.div 
            key="gallery-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col bg-black/95 backdrop-blur-3xl"
            >
             {/* Gallery Header */}
             <div className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6 bg-black/40 border-b border-white/5 z-[100]">
                <div className="flex items-center gap-3">
                   <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-emerald-500 text-black flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Package className="h-5 w-5 sm:h-6 sm:w-6" />
                   </div>
                   <div className="min-w-0">
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-white truncate max-w-[150px] sm:max-w-xs">{order.orderName}</h2>
                    <p className="text-[9px] sm:text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">Ảnh {fullScreenImageIndex + 1} / {imageUrls.length}</p>
                   </div>
                </div>
                
                <div className="flex items-center gap-2">
                   <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 text-white hover:text-white rounded-full hover:bg-white/10 bg-white/5 border border-white/10"
                    onClick={() => setFullScreenImageIndex(null)}
                   >
                    <X className="h-5 w-5" />
                   </Button>
                </div>
             </div>

             {/* Main Viewer Area */}
             <div 
                ref={viewerRef}
                className="relative flex-1 flex items-center justify-center overflow-hidden touch-none"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
             >
                <motion.div
                  key={fullScreenImageIndex}
                  drag={zoomLevel === 1 && imageUrls.length > 1 ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  onDragEnd={handleDragEnd}
                  initial={{ opacity: 0, scale: 0.9, x: 0 }}
                  animate={{ 
                  opacity: 1, 
                  scale: zoomLevel,
                  x: position.x,
                  y: position.y
                  }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  transition={isDragging ? { type: 'tween', ease: 'linear', duration: 0 } : { type: 'spring', damping: 25, stiffness: 200, mass: 0.5 }}
                  className="relative flex items-center justify-center"
                  style={{ pointerEvents: 'none' }}
                >
                  <img 
                  ref={imgRef}
                  src={imageUrls[fullScreenImageIndex]} 
                  alt="Full display" 
                  className="max-w-[95vw] max-h-[80vh] object-contain shadow-2xl rounded-sm sm:rounded-lg" 
                  style={{ 
                    pointerEvents: 'auto',
                    userSelect: 'none'
                  }}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  />
                </motion.div>

                {/* Desktop Navigation Arrows */}
                {imageUrls.length > 1 && zoomLevel === 1 && (
                  <>
                  <button 
                    type="button"
                    className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/5 p-4 text-white backdrop-blur-xl hover:bg-white/10 transition-all border border-white/10 hidden md:block z-50 pointer-events-auto"
                    onClick={(e) => { e.stopPropagation(); navigateGallery(-1); }}
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </button>
                  <button 
                    type="button"
                    className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/5 p-4 text-white backdrop-blur-xl hover:bg-white/10 transition-all border border-white/10 hidden md:block z-50 pointer-events-auto"
                    onClick={(e) => { e.stopPropagation(); navigateGallery(1); }}
                  >
                    <ChevronRight className="h-8 w-8" />
                  </button>
                  </>
                )}

                {/* Zoom Controls Overlay */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/40 backdrop-blur-2xl p-1.5 rounded-2xl border border-white/10 z-[100] pointer-events-auto">
                   <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-white/50 hover:text-white"
                    onClick={() => setZoomLevel(prev => Math.max(1, prev - 0.5))}
                   >
                    <Plus className="h-4 w-4 rotate-45" />
                   </Button>
                   <div className="h-4 w-px bg-white/10" />
                   <Button 
                    variant="ghost" 
                    className="h-9 px-3 text-[10px] font-black text-white uppercase tracking-widest"
                    onClick={resetZoom}
                   >
                    {Math.round(zoomLevel * 100)}%
                   </Button>
                   <div className="h-4 w-px bg-white/10" />
                   <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-white/50 hover:text-white"
                    onClick={() => setZoomLevel(prev => Math.min(8, prev + 0.5))}
                   >
                    <Plus className="h-4 w-4" />
                   </Button>
                </div>
             </div>

             {/* Gallery Footer / Thumbs */}
             <div className="h-24 sm:h-32 shrink-0 bg-black/60 border-t border-white/5 px-4 flex items-center justify-center gap-3 backdrop-blur-3xl overflow-x-auto no-scrollbar z-[100] pointer-events-auto">
                {imageUrls.map((url, i) => (
                  <div 
                  key={i} 
                  className={cn(
                    "relative h-14 sm:h-20 aspect-square rounded-lg sm:rounded-xl overflow-hidden cursor-pointer border-2 transition-all p-0.5 shrink-0",
                    fullScreenImageIndex === i ? "border-emerald-500 scale-105 sm:scale-110 shadow-xl" : "border-transparent opacity-40 hover:opacity-100"
                  )}
                  onClick={() => {
                    setFullScreenImageIndex(i);
                    resetZoom();
                  }}
                  >
                  <img src={url} alt={`Thumb ${i}`} className="h-full w-full object-cover rounded-md sm:rounded-lg" referrerPolicy="no-referrer" />
                  </div>
                ))}
             </div>
            </motion.div>
          </AnimatePresence>
        </div>,
        document.body
      )}
      </>
    );
  };

  const renderDeleteConfirmation = () => {
    if (!isDeleteConfirmOpen || typeof document === 'undefined') return null;
    return createPortal(
      <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 sm:p-0 bg-zinc-950/60 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-6 text-center select-none"
        >
          <div className="mx-auto w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
            <Trash2 className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-black text-zinc-900 uppercase tracking-widest mb-2">Xác nhận xóa</h3>
          <p className="text-sm font-medium text-zinc-500 mb-6 px-2">Bạn có chắc chắn muốn xóa đơn hàng <strong className="text-zinc-900 font-bold">{order.orderName}</strong>? Hành động này không thể hoàn tác.</p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setIsDeleteConfirmOpen(false)} className="flex-1 rounded-2xl h-12 uppercase font-black text-xs tracking-wider border-2 border-zinc-100 hover:bg-zinc-50">Hủy</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="flex-1 rounded-2xl bg-red-500 hover:bg-red-600 h-12 uppercase font-black text-xs tracking-wider shadow-lg shadow-red-500/25">
              {isDeleting ? "Đang xóa..." : "Xóa Ngay"}
            </Button>
          </div>
        </motion.div>
      </div>,
      document.body
    );
  };

  const renderEditDialog = () => {
    if (!isEditing || typeof document === 'undefined') return null;
    return createPortal(
      <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6"
        >
          <h3 className="text-xl font-black text-zinc-900 mb-6">Chỉnh sửa đơn hàng</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">TÊN NHÀ CUNG CẤP</label>
              <Input 
                value={editOrderName}
                onChange={(e) => setEditOrderName(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Nhà thuốc</label>
              <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl">
                {PHARMACIES.map(p => (
                  <Button
                    key={p.name}
                    variant={editPharmacy === p.name ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      "flex-1 rounded-lg text-xs h-9",
                      editPharmacy === p.name ? "bg-white shadow-sm font-bold" : "text-zinc-500"
                    )}
                    onClick={() => setEditPharmacy(p.name)}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Ghi chú</label>
              <Textarea 
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="rounded-xl min-h-[100px] resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" onClick={() => setIsEditing(false)} className="rounded-xl h-11 px-6">Hủy</Button>
            <Button onClick={handleUpdate} className="rounded-xl bg-zinc-900 hover:bg-zinc-800 h-11 px-8 text-white font-black">Cập nhật</Button>
          </div>
        </motion.div>
      </div>,
      document.body
    );
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'orders', order.id));
      toast.success("Đã xóa đơn hàng.");
      setIsDeleteConfirmOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Không thể xóa đơn hàng.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdate = async () => {
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        orderName: editOrderName,
        pharmacy: editPharmacy,
        note: editNote
      });
      setIsEditing(false);
      toast.success("Đã cập nhật thông tin đơn hàng.");
    } catch (error) {
      console.error(error);
      toast.error("Lỗi khi cập nhật.");
    }
  };

  const handleToggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newStatus = order.status === 'completed' ? 'pending' : 'completed';
      await updateDoc(doc(db, 'orders', order.id), {
        status: newStatus
      });
      toast.success(newStatus === 'completed' ? "Đã đánh dấu hoàn thành." : "Đã bỏ đánh dấu hoàn thành.");
    } catch (error) {
      console.error(error);
      toast.error("Lỗi khi cập nhật trạng thái.");
    }
  };

  const formattedTime = order.timestamp 
    ? format(order.timestamp.toDate(), 'HH:mm') 
    : '--:--';

  const renderListMode = () => {
    return (
      <>
      <motion.div
        layout
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn(
          "group flex gap-3 sm:gap-4 rounded-xl sm:rounded-2xl border border-zinc-100 bg-white p-2 sm:p-3 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
          pharmacyConfig.border
        )}
      >
        <div 
          className="relative h-20 w-20 sm:h-32 sm:w-32 shrink-0 overflow-hidden rounded-lg sm:rounded-xl border border-zinc-100 cursor-pointer"
          onClick={() => setFullScreenImageIndex(0)}
        >
          <img 
            src={imageUrls[0]} 
            alt={order.orderName} 
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" 
            referrerPolicy="no-referrer"
          />
          {order.status === 'completed' && (
            <div className="absolute inset-0 z-20 bg-emerald-500/10 flex items-center justify-center backdrop-blur-[0.5px]">
               <CheckCircle2 className="h-8 w-8 text-emerald-500 bg-white rounded-full p-1 shadow-sm" />
            </div>
          )}
          {imageUrls.length > 1 && (
            <div className="absolute bottom-1 right-1 z-20 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              +{imageUrls.length - 1}
            </div>
          )}
          <div className="absolute inset-0 bg-black/5 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center pointer-events-none">
            <Search className="text-white h-5 w-5" />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-between py-1">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={cn("text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-full text-white", pharmacyConfig.bg)}>
                {order.pharmacy}
              </span>
              <p className="text-[10px] sm:text-xs font-medium text-zinc-400">{formattedTime}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs sm:text-base font-bold text-zinc-900 line-clamp-1">{order.orderName}</h3>
              <HelpTrigger 
                title="Tên Nhà Cung Cấp" 
                description="Tên của NCC gửi đơn hàng giúp bạn dễ dàng tìm kiếm và quản lý." 
              />
            </div>
            <div className="flex items-center gap-1.5 text-[10px] sm:text-sm text-zinc-500">
              <UserIcon className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
              <span className="truncate">{order.senderName}</span>
            </div>
            {order.note && (
              <div className="mt-2 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-600 line-clamp-2 italic">
                "{order.note}"
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
            <Button 
              variant={order.status === 'completed' ? "default" : "outline"} 
              size="sm" 
              className={cn(
                "h-7 sm:h-9 gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[11px] font-black uppercase tracking-wider transition-all px-2 sm:px-4",
                order.status === 'completed' ? "bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-200" : "text-zinc-500 hover:text-zinc-900 border-zinc-200 shadow-none"
              )}
              onClick={handleToggleComplete}
            >
              <CheckCircle2 className={cn("h-3 w-3 sm:h-4 sm:w-4", order.status === 'completed' ? "text-white" : "text-zinc-400")} />
              <span className="hidden xs:inline">{order.status === 'completed' ? "Đã xong" : "Hoàn thành"}</span>
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 sm:h-9 gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[11px] font-black uppercase tracking-wider text-red-500 hover:bg-red-50 hover:text-red-600 px-2 sm:px-4"
              onClick={() => setIsDeleteConfirmOpen(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Xóa</span>
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-9 sm:w-9 text-zinc-400 hover:text-zinc-900" onClick={() => setIsEditing(true)}>
              <RotateCw className="h-3 w-3 sm:h-4 sm:w-4" /> 
            </Button>
          </div>
        </div>
      </motion.div>
      </>
    );
  };

  const renderGridMode = () => {
    return (
      <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <Card className={cn(
        "group overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] hover:border-zinc-200",
        pharmacyConfig.border
      )}>
        <div 
          className="relative aspect-[4/3] overflow-hidden bg-zinc-100 cursor-pointer"
          onClick={() => setFullScreenImageIndex(0)}
        >
          <img 
            src={imageUrls[0]} 
            alt={order.orderName} 
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
            referrerPolicy="no-referrer"
          />
          {order.status === 'completed' && (
            <div className="absolute inset-0 z-20 bg-emerald-500/10 flex items-center justify-center backdrop-blur-[0.5px]">
              <div className="bg-white rounded-full p-2 shadow-xl scale-110">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
            </div>
          )}
          {imageUrls.length > 1 && (
            <div className="absolute bottom-2 right-2 z-20 rounded-lg bg-black/60 px-2 py-1 text-xs font-bold text-white backdrop-blur-sm">
              +{imageUrls.length - 1} ảnh
            </div>
          )}
          <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center pointer-events-none">
            <Search className="text-white h-8 w-8 scale-0 transition-transform group-hover:scale-100" />
          </div>
          <div className="absolute left-2 top-2 z-20">
            <span className={cn("text-[10px] font-bold uppercase px-2 py-1 rounded-lg text-white shadow-lg", pharmacyConfig.bg)}>
              {order.pharmacy}
            </span>
          </div>
          <div className="absolute right-2 top-2 z-20 flex gap-1 opacity-0 transition-all group-hover:opacity-100">
            <Button 
              size="icon" 
              variant="secondary" 
              className="h-8 w-8 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white"
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteConfirmOpen(true);
              }}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
        <CardHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{formattedTime}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <h3 className="mt-1 font-bold text-zinc-900 line-clamp-1">{order.orderName}</h3>
            <HelpTrigger 
              title="Nhà cung cấp" 
              description="Tên NCC giúp bạn dễ dàng tìm kiếm và quản lý kho sau này." 
            />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <UserIcon className="h-3 w-3" />
            <span>Người gửi: {order.senderName}</span>
          </div>
          {order.note && (
            <div className="rounded-xl bg-zinc-50 p-2.5 text-[11px] text-zinc-600 italic border border-zinc-100 line-clamp-3">
              <FileText className="h-3 w-3 inline mr-1 mb-0.5" />
              {order.note}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 p-4 pt-0">
          <div className="flex gap-2 w-full">
            <Button 
              variant={order.status === 'completed' ? "default" : "outline"} 
              size="sm" 
              className={cn(
                "h-8 gap-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-none flex-1",
                order.status === 'completed' ? "bg-emerald-500 hover:bg-emerald-600" : "text-zinc-500 hover:text-zinc-900 border-zinc-200"
              )}
              onClick={handleToggleComplete}
            >
              <CheckCircle2 className={cn("h-3.5 w-3.5", order.status === 'completed' ? "text-white" : "text-zinc-400")} />
              {order.status === 'completed' ? "Đã xong" : "Xong"}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 gap-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 flex-1"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Sửa
            </Button>
          </div>
        </CardFooter>


      </Card>
    </motion.div>
    </>
    );
  };

  return (
    <>
      {viewMode === 'list' ? renderListMode() : renderGridMode()}
      {renderDeleteConfirmation()}
      {renderEditDialog()}
      {renderGallery()}
    </>
  );
}, (prev, next) => {
  return prev.order.id === next.order.id && 
         prev.order.status === next.order.status && 
         prev.viewMode === next.viewMode &&
         prev.order.timestamp === next.order.timestamp &&
         prev.order.orderName === next.order.orderName;
});
