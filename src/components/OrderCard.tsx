import React, { useState, useEffect, useRef } from 'react';
import { Gallery, Item } from 'react-photoswipe-gallery';
import 'photoswipe/dist/photoswipe.css';
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
  Plus,
  Maximize2,
  ZoomIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { supabase } from '../supabase';
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
import { ScanAIModal } from './ScanAIModal';
import { Sparkles } from 'lucide-react';
import { logUserActivity } from './SystemLogsModal';

interface OrderCardProps {
  order: Order;
  viewMode: 'grid' | 'list';
}

const DynamicGalleryItem = React.memo(({ url, orderName, index }: { url: string; orderName: string; index: number }) => {
  const [dim, setDim] = useState({ w: 4000, h: 4000 }); // Default to high res to prevent initial capping
  const isFirst = index === 0;

  return (
    <Item
      original={url}
      thumbnail={url}
      width={dim.w}
      height={dim.h}
    >
      {({ ref, open }) => (
        <img 
          ref={ref as any}
          onClick={open}
          src={url} 
          alt={orderName} 
          className={cn(
            "cursor-zoom-in",
            isFirst 
              ? "h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
              : "hidden" // Hidden thumbnails for extra images
          )}
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            const target = e.currentTarget;
            if (target.naturalWidth && target.naturalHeight) {
              setDim({ w: target.naturalWidth, h: target.naturalHeight });
            }
          }}
        />
      )}
    </Item>
  );
});

export const OrderCard = React.memo(React.forwardRef<HTMLDivElement, OrderCardProps>(({ order, viewMode }, ref) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const [editOrderName, setEditOrderName] = useState(order.orderName);
  const [editPharmacy, setEditPharmacy] = useState<PharmacyName>(order.pharmacy);
  const [editNote, setEditNote] = useState(order.note || '');
  const [isScanOpen, setIsScanOpen] = useState(false);

  const pharmacyConfig = PHARMACIES.find(p => p.name === order.pharmacy) || PHARMACIES[0];
  const imageUrls = order.imageUrls || (order.imageUrl ? [order.imageUrl] : []);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', order.id);

      if (error) throw error;
      logUserActivity('Xóa đơn hàng', `Xóa vĩnh viễn đơn "${order.orderName}" của [${order.pharmacy}]`);
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
      const { error } = await supabase
        .from('orders')
        .update({
          order_name: editOrderName,
          pharmacy: editPharmacy,
          note: editNote
        })
        .eq('id', order.id);

      if (error) throw error;
      logUserActivity('Sửa đơn hàng', `Cập nhật thông tin đơn "${editOrderName}"`);
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
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', order.id);

      if (error) throw error;
      logUserActivity(
        newStatus === 'completed' ? 'Hoàn thành đơn' : 'Bỏ hoàn thành đơn',
        `Chuyển trạng thái đơn "${order.orderName}"`
      );
      toast.success(newStatus === 'completed' ? "Đã đánh dấu hoàn thành." : "Đã bỏ đánh dấu hoàn thành.");
    } catch (error) {
      console.error(error);
      toast.error("Lỗi khi cập nhật trạng thái.");
    }
  };

  const formattedTime = order.timestamp 
    ? format(order.timestamp.toDate(), 'HH:mm') 
    : '--:--';

// Helper to render PhotoSwipe gallery elements
        const renderGalleryItems = () => {
          return imageUrls.map((url, i) => (
             <React.Fragment key={i}>
                <DynamicGalleryItem url={url} orderName={order.orderName} index={i} />
             </React.Fragment>
          ));
        }

  const handleGalleryOpen = (pswp: any) => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pswp.currSlide) return;
      
      const center = { x: pswp.viewportSize.x / 2, y: pswp.viewportSize.y / 2 };
      const currentZoom = pswp.currSlide.currZoomLevel;
      
      if (e.key === '=' || e.key === '+') {
        pswp.currSlide.zoomTo(currentZoom * 1.3, center, 200);
      } else if (e.key === '-') {
        pswp.currSlide.zoomTo(currentZoom / 1.3, center, 200);
      }
    };

    // Explicit Mouse Wheel Zoom for professional feel and reliability in iframe
    const handleWheelEvent = (e: WheelEvent) => {
      if (!pswp.currSlide) return;
      
      // If user isn't holding Ctrl, we manually trigger zoom since some environments
      // might block the default PhotoSwipe wheel handler
      if (!e.ctrlKey) {
        e.preventDefault();
        const zoomSpeed = 0.0015; 
        const delta = -e.deltaY;
        const currentZoom = pswp.currSlide.currZoomLevel;
        
        let newZoom = currentZoom * (1 + delta * zoomSpeed);
        // Min/Max zoom boundaries - capped at 2.5x natural size to prevent heavy pixelation (vỡ ảnh)
        newZoom = Math.max(pswp.currSlide.zoomLevels.initial * 0.5, Math.min(newZoom, pswp.currSlide.zoomLevels.max * 2.5));

        const center = { x: e.clientX, y: e.clientY };
        pswp.currSlide.zoomTo(newZoom, center, 0); 
      }
    };
    
    // Attach to the photoswipe template element (the UI root)
    const galleryElement = pswp.template || pswp.element;
    if (galleryElement) {
      galleryElement.addEventListener('wheel', handleWheelEvent, { passive: false });
    }
    
    document.addEventListener('keydown', handleKeyDown);
    pswp.on('destroy', () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (galleryElement) {
        galleryElement.removeEventListener('wheel', handleWheelEvent);
      }
    });
  };

  if (viewMode === 'list') {
    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn(
          "group flex gap-3 sm:gap-4 rounded-xl sm:rounded-2xl border border-zinc-100 bg-white p-2 sm:p-3 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
          pharmacyConfig.border
        )}
      >
        <Gallery onOpen={handleGalleryOpen} options={{ bgOpacity: 0.9, padding: { top: 20, bottom: 20, left: 20, right: 20 }, wheelToZoom: true, secondaryZoomLevel: 1.5, maxZoomLevel: 3 }}>
          <div className="relative h-20 w-20 sm:h-32 sm:w-32 shrink-0 overflow-hidden rounded-lg sm:rounded-xl border border-zinc-100">
            {renderGalleryItems()}

            {order.status === 'completed' && (
              <div className="absolute inset-0 z-20 bg-emerald-500/10 flex items-center justify-center backdrop-blur-[0.5px] pointer-events-none">
                 <CheckCircle2 className="h-8 w-8 text-emerald-500 bg-white rounded-full p-1 shadow-sm" />
              </div>
            )}
            {imageUrls.length > 1 && (
              <div className="absolute bottom-1 right-1 z-20 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm pointer-events-none">
                +{imageUrls.length - 1}
              </div>
            )}
            <div className="absolute inset-0 bg-black/5 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center pointer-events-none">
              <Search className="text-white h-5 w-5" />
            </div>
          </div>
        </Gallery>
        
        <div className="flex flex-1 flex-col justify-between py-1">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={cn("text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-full text-white", pharmacyConfig.bg)}>
                {order.pharmacy}
              </span>
              <p className="text-[10px] sm:text-xs font-medium text-zinc-400">{formattedTime}</p>
            </div>
            <h3 className="text-xs sm:text-base font-bold text-zinc-900 line-clamp-1">{order.orderName}</h3>
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
              variant="outline" 
              size="sm" 
              className="hidden md:flex h-7 sm:h-9 gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[11px] font-black uppercase tracking-wider border-emerald-500/20 text-emerald-600 hover:bg-emerald-50 px-2 sm:px-4"
              onClick={(e) => {
                e.stopPropagation();
                setIsScanOpen(true);
              }}
            >
              <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>SCAN AI</span>
            </Button>
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
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteConfirmOpen(true);
              }}
              disabled={isDeleting}
            >
              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Xóa</span>
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 sm:h-9 sm:w-9 text-zinc-400 hover:text-zinc-900" 
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              <RotateCw className="h-3 w-3 sm:h-4 sm:w-4" /> 
            </Button>
          </div>
        </div>

        {/* Dialogs for List View */}
        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <DialogContent className="w-[95%] max-w-[425px] rounded-2xl sm:rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-center">Xác nhận xóa</DialogTitle>
            </DialogHeader>
            <div className="py-4 text-sm text-zinc-500 text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="h-6 w-6" />
              </div>
              Bạn có chắc chắn muốn xóa đơn hàng <strong className="text-zinc-900 font-bold">{order.orderName}</strong>? Hành động này không thể hoàn tác.
            </div>
            <DialogFooter className="flex flex-row gap-2">
              <Button variant="ghost" onClick={() => setIsDeleteConfirmOpen(false)} className="flex-1 rounded-xl h-11">Hủy</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="flex-1 rounded-xl h-11 bg-red-600 hover:bg-red-700 font-bold">
                {isDeleting ? "Đang xóa..." : "Xác nhận xóa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogContent className="w-[95%] max-w-md rounded-2xl sm:rounded-3xl">
            <DialogHeader>
              <DialogTitle>Chỉnh sửa đơn hàng</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
                        "flex-1 rounded-lg text-[10px] h-8 font-bold",
                        editPharmacy === p.name ? "bg-white shadow-sm" : ""
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
            <DialogFooter className="flex flex-row gap-2">
              <Button variant="ghost" onClick={() => setIsEditing(false)} className="flex-1 rounded-xl h-11">Hủy</Button>
              <Button onClick={handleUpdate} className="flex-1 rounded-xl h-11 bg-zinc-900 hover:bg-zinc-800 text-white font-bold">Cập nhật</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className={cn(
        "group overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] hover:border-zinc-200",
        pharmacyConfig.border
      )}>
        <Gallery onOpen={handleGalleryOpen} options={{ bgOpacity: 0.9, padding: { top: 20, bottom: 20, left: 20, right: 20 }, wheelToZoom: true, secondaryZoomLevel: 1.5, maxZoomLevel: 3 }}>
          <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
            {renderGalleryItems()}

            {order.status === 'completed' && (
              <div className="absolute inset-0 z-20 bg-emerald-500/10 flex items-center justify-center backdrop-blur-[0.5px] pointer-events-none">
                <div className="bg-white rounded-full p-2 shadow-xl scale-110">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
              </div>
            )}
            {imageUrls.length > 1 && (
              <div className="absolute bottom-2 right-2 z-20 rounded-lg bg-black/60 px-2 py-1 text-xs font-bold text-white backdrop-blur-sm pointer-events-none">
                +{imageUrls.length - 1} ảnh
              </div>
            )}
            <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center pointer-events-none">
              <Search className="text-white h-8 w-8 scale-0 transition-transform group-hover:scale-100" />
            </div>
            <div className="absolute left-2 top-2 z-20 pointer-events-none">
              <span className={cn("text-[10px] font-bold uppercase px-2 py-1 rounded-lg text-white shadow-lg", pharmacyConfig.bg)}>
                {order.pharmacy}
              </span>
            </div>
            <div className="absolute right-2 top-2 z-20 flex gap-1 opacity-0 transition-all group-hover:opacity-100">
              <Button 
                size="icon" 
                variant="secondary" 
                className="hidden md:flex h-8 w-8 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white text-emerald-600 shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsScanOpen(true);
                }}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
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
        </Gallery>
        
        <CardHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{formattedTime}</p>
          </div>
          <h3 className="mt-1 font-bold text-zinc-900 line-clamp-1">{order.orderName}</h3>
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
        <CardFooter className="flex justify-between p-4 pt-0">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="hidden md:flex h-8 gap-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border-emerald-500/20 text-emerald-600 hover:bg-emerald-50"
              onClick={(e) => {
                e.stopPropagation();
                setIsScanOpen(true);
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              SCAN AI
            </Button>
            <Button 
              size="sm" 
              className={cn(
                "h-8 gap-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md",
                order.status === 'completed' 
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                  : "bg-white border-2 border-zinc-200 text-zinc-700 hover:border-emerald-500 hover:text-emerald-600"
              )}
              onClick={handleToggleComplete}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {order.status === 'completed' ? "Đã xong" : "Hoàn thành"}
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              className="h-8 gap-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-900 border-2 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-400 bg-white shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Sửa
            </Button>
          </div>

          {/* Delete Confirmation */}
          <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
              <DialogContent className="w-[95%] sm:max-w-[425px] rounded-2xl sm:rounded-3xl bg-white shadow-2xl border-zinc-200">
              <DialogHeader>
                <DialogTitle className="sm:text-left text-center text-red-600">Xác nhận xóa đơn</DialogTitle>
              </DialogHeader>
              <div className="py-6 text-sm text-zinc-700 text-center">
                <div className="mx-auto w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4 border-2 border-red-100">
                  <Trash2 className="h-8 w-8" />
                </div>
                Bạn có chắc chắn muốn xóa đơn hàng <strong className="text-zinc-900 font-bold block text-base mt-2">{order.orderName}</strong>? 
                <p className="text-xs text-zinc-400 mt-2">Hành động này không thể hoàn tác.</p>
              </div>
              <DialogFooter className="flex flex-row gap-2 sm:justify-end">
                <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)} className="flex-1 sm:flex-none rounded-xl h-12 sm:h-10 border-zinc-200 font-bold">Hủy</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="flex-1 sm:flex-none rounded-xl h-12 sm:h-10 bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-200">
                  {isDeleting ? "Đang xóa..." : "Xác nhận xóa"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Dialog */}
          <Dialog open={isEditing} onOpenChange={setIsEditing}>
            <DialogContent className="w-[95%] sm:max-w-md rounded-2xl sm:rounded-3xl">
              <DialogHeader>
                <DialogTitle>Chỉnh sửa đơn hàng</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
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
                          "flex-1 rounded-lg text-[10px] h-8 font-bold",
                          editPharmacy === p.name ? "bg-white shadow-sm" : ""
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
              <DialogFooter className="flex flex-row gap-2 sm:justify-end">
                <Button variant="ghost" onClick={() => setIsEditing(false)} className="flex-1 sm:flex-none rounded-xl h-10 sm:h-9">Hủy</Button>
                <Button onClick={handleUpdate} className="flex-1 sm:flex-none rounded-xl h-10 sm:h-9 bg-zinc-900 hover:bg-zinc-800 text-white font-bold">Cập nhật</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ScanAIModal 
            isOpen={isScanOpen}
            onOpenChange={setIsScanOpen}
            imageUrls={imageUrls}
          />
        </CardFooter>
      </Card>
    </motion.div>
  );
}), (prev, next) => {
  return prev.order.id === next.order.id && 
         prev.order.status === next.order.status && 
         prev.viewMode === next.viewMode &&
         prev.order.timestamp === next.order.timestamp &&
         prev.order.orderName === next.order.orderName;
});

OrderCard.displayName = "OrderCard";
