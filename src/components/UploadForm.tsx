import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Package, 
  Image as ImageIcon, 
  Camera,
  X, 
  Plus, 
  User as UserIcon, 
  Loader2,
  ChevronRight,
  Zap,
  TextCursorInput,
  Scan,
  Sparkles,
  RefreshCcw
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage, auth } from '../firebase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PharmacyName, PHARMACIES } from '../types';
import { HelpTrigger } from './HelpManual';
import { ImageEditorModal } from './ImageEditorModal';

interface UploadFormProps {
  defaultPharmacy: PharmacyName;
  userName: string;
  onSuccess: () => void;
}

export function UploadForm({ defaultPharmacy, userName, onSuccess }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [orderName, setOrderName] = useState('');
  const [supplierHistory, setSupplierHistory] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [pharmacy, setPharmacy] = useState<PharmacyName>(defaultPharmacy);

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('supplier_history');
    if (saved) {
      try {
        setSupplierHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse supplier history");
      }
    }
  }, []);

  // Filter suggestions when input changes
  useEffect(() => {
    if (orderName.trim().length > 0) {
      const filtered = supplierHistory
        .filter(name => 
          name.toLowerCase().includes(orderName.toLowerCase()) && 
          name.toLowerCase() !== orderName.toLowerCase()
        )
        .slice(0, 5); // Show top 5 matches
      setFilteredSuggestions(filtered);
    } else {
      setFilteredSuggestions([]);
    }
  }, [orderName, supplierHistory]);

  const saveSupplierToHistory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    
    setSupplierHistory(prev => {
      const exists = prev.find(item => item.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;
      
      const newHistory = [trimmed, ...prev].slice(0, 20); // Keep last 20
      localStorage.setItem('supplier_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);

  const handleSaveEditedImage = async (base64DataUrl: string) => {
    if (editingImageIndex === null) return;
    
    setPreviews(prev => {
      const newP = [...prev];
      newP[editingImageIndex] = base64DataUrl;
      return newP;
    });

    try {
      const fetchRes = await fetch(base64DataUrl);
      const blob = await fetchRes.blob();
      const newFile = new File([blob], `edited-image-${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      setFiles(prev => {
        const newF = [...prev];
        newF[editingImageIndex] = newFile;
        return newF;
      });
    } catch(e) {
      console.error("Failed to convert dataUrl to File", e);
    }
    
    setEditingImageIndex(null);
  };

  // Helper function to compress image
  const compressImage = async (file: File): Promise<Blob | File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 3000; // Increased for high-resolution zoom
          const MAX_HEIGHT = 3000;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                resolve(file); // Fallback to original
              }
            }, 'image/jpeg', 0.8); // 80% quality is perfect
          } else {
            resolve(file);
          }
        };
      };
      reader.onerror = () => resolve(file);
    });
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      // Create previews for the new files
      const newPreviewsPromises = acceptedFiles.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });

      const newPreviews = await Promise.all(newPreviewsPromises);
      
      setFiles(prev => [...prev, ...acceptedFiles]);
      setPreviews(prev => [...prev, ...newPreviews]);
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const { getRootProps, getInputProps, isDragActive, open: openLibrary } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
    noClick: true, // We'll handle clicking manually
  } as any);

  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onDrop(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0 || !orderName.trim()) {
      toast.error("Vui lòng nhập đầy đủ thông tin và chọn ít nhất 1 ảnh.");
      return;
    }

    setUploading(true);
    console.log("Starting upload process for", files.length, "files...");
    
    // Check if authenticated
    if (!auth.currentUser) {
      setUploading(false);
      toast.error("Bạn chưa được xác thực. Vui lòng kiểm tra thông báo màu đỏ ở đầu trang.");
      return;
    }

    try {
      // Parallel Compression and Upload
      const uploadPromises = files.map(async (file, i) => {
        console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`);
        
        // 1. Compress
        const compressedBlob = await compressImage(file);
        
        // 2. Upload
        const storageRef = ref(storage, `orders/${Date.now()}_${i}_${file.name}`);
        try {
          await uploadBytes(storageRef, compressedBlob);
          const url = await getDownloadURL(storageRef);
          console.log(`Successfully uploaded ${file.name}`);
          return url;
        } catch (storageErr: any) {
          console.error(`Storage Error for ${file.name}:`, storageErr);
          throw new Error(`Lỗi tải ảnh ${file.name}: ${storageErr.message}`);
        }
      });

      const uploadedUrls = await Promise.all(uploadPromises);

      console.log("Saving order data to Firestore...");
      await addDoc(collection(db, 'orders'), {
        imageUrls: uploadedUrls,
        orderName: orderName.trim(),
        senderName: userName,
        pharmacy,
        note: note.trim(),
        status: 'pending',
        timestamp: serverTimestamp()
      });

      // Save supplier name to history
      saveSupplierToHistory(orderName);

      console.log("Order saved successfully!");
      toast.success(`Đã thêm đơn hàng thành công!`);
      
      // Gửi thông báo đến toàn bộ hệ thống
      fetch('/api/sendNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: "🛒 Đơn hàng mới: " + orderName.trim(),
          body: `Người gửi: ${userName} - Nhà thuốc: ${pharmacy}`,
          imageUrl: uploadedUrls[0] || undefined, 
          url: '/'
        })
      }).catch(e => console.log("Push trigger failed", e));
      
      onSuccess();
    } catch (error: any) {
      console.error("Overall Submit Error:", error);
      toast.error(`Lỗi: ${error?.message || "Lỗi không xác định"}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-6 min-h-0 no-scrollbar">
        <div className="space-y-6">
          <div className="space-y-5">
            {/* Image Upload Area */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">Hình ảnh đơn hàng</label>
                <span className="text-[10px] text-zinc-400 font-medium">Đã chọn: {files.length}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Camera Button */}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-emerald-500/10 bg-emerald-50/30 hover:bg-emerald-50/50 hover:border-emerald-500/20 transition-all group active:scale-[0.98]"
                >
                  <div className="p-3 rounded-full bg-emerald-100 text-emerald-600 group-hover:scale-110 transition-transform">
                    <Camera className="h-6 w-6" />
                  </div>
                  <span className="text-sm font-black text-emerald-900">CHỤP ẢNH</span>
                  <input 
                    ref={cameraInputRef}
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    className="hidden" 
                    onChange={handleCameraCapture}
                  />
                </button>

                {/* Gallery Button */}
                <div 
                  {...getRootProps()}
                  onClick={openLibrary}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 transition-all active:scale-[0.98]",
                    isDragActive ? "border-zinc-900 bg-zinc-50" : "border-zinc-100 bg-zinc-50/50 hover:bg-zinc-100/50 hover:border-zinc-200"
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="p-3 rounded-full bg-zinc-200 text-zinc-500 group-hover:scale-110 transition-transform">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                  <span className="text-sm font-black text-zinc-900">THƯ VIỆN</span>
                </div>
              </div>

              {previews.length > 0 && (
                <div className="grid grid-cols-2 xs:grid-cols-3 gap-3 mt-3 p-4 bg-zinc-50 rounded-3xl border border-zinc-100">
                  {previews.map((src, index) => (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      whileHover={{ scale: 1.02 }}
                      key={`${index}-${src.slice(0, 20)}`} 
                      className="relative aspect-square overflow-hidden rounded-2xl border border-zinc-200 group shadow-sm bg-white"
                    >
                      <img src={src} alt={`Preview ${index}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 pointer-events-none" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      
                      {/* Viewer Trigger (Spans the whole image, sits under the delete button) */}
                      <div 
                        className="absolute inset-0 z-10 cursor-pointer" 
                        onClick={(e) => {
                           e.stopPropagation();
                           setEditingImageIndex(index);
                        }}
                      />
                      
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <div className="bg-zinc-900/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-lg shadow-black/20 mt-8">
                          CHẠM ĐỂ XEM
                        </div>
                      </div>
                      
                      {/* Delete Button (Enlarged hit area using padding, sits on top) */}
                      <div 
                        className="absolute right-0 top-0 cursor-pointer z-30 p-2"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          removeFile(index); 
                        }}
                      >
                        <div className="h-8 w-8 flex items-center justify-center rounded-full bg-red-500/90 backdrop-blur-md text-white shadow-lg shadow-black/20 active:scale-90 transition-transform">
                          <X className="h-4 w-4 stroke-[3]" />
                        </div>
                      </div>
                      
                      <div className="absolute left-2 bottom-2 px-2 py-1 rounded-md bg-black/50 backdrop-blur-md text-[9px] font-black text-white uppercase tracking-wider pointer-events-none z-10 shadow-lg shadow-black/20">
                        ẢNH {index + 1}
                      </div>
                    </motion.div>
                  ))}
                  
                  <button 
                    type="button"
                    onClick={openLibrary}
                    className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-zinc-200 bg-white text-zinc-400 hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50 transition-all active:scale-95 group"
                  >
                    <div className="p-2 rounded-full bg-zinc-50 group-hover:bg-emerald-100 transition-colors">
                      <Plus className="h-5 w-5" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest">Thêm ảnh</span>
                  </button>
                </div>
              )}
              
              <ImageEditorModal 
                isOpen={editingImageIndex !== null}
                imageSrc={editingImageIndex !== null ? previews[editingImageIndex] : ''}
                onSave={handleSaveEditedImage}
                onClose={() => setEditingImageIndex(null)}
              />
            </div>

            {/* Pharmacy Selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 px-1">Chọn nhà thuốc</label>
              <div className="flex p-1 bg-zinc-100 rounded-xl gap-1">
                {PHARMACIES.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setPharmacy(p.name)}
                    className={cn(
                      "flex-1 py-2 px-1 rounded-lg text-xs font-bold transition-all",
                      pharmacy === p.name 
                        ? `${p.bg} text-white shadow-lg ring-1 ring-black/5` 
                        : "text-zinc-500 hover:text-zinc-700 bg-transparent"
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Order Details */}
            <div className="grid gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 px-1">TÊN NHÀ CUNG CẤP</label>
                <div className="relative">
                  <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                  <Input 
                    placeholder="Nhập tên nhà cung cấp..." 
                    className="rounded-xl pl-10 focus-visible:ring-zinc-900 h-11 text-sm border-zinc-200"
                    value={orderName}
                    onChange={(e) => {
                      setOrderName(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => setShowSuggestions(false), 200);
                    }}
                  />
                  
                  {/* Autocomplete Suggestions */}
                  <AnimatePresence>
                    {showSuggestions && filteredSuggestions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute left-0 right-0 top-full mt-1.5 z-[60] overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-[0_10px_30px_-5px_rgba(0,0,0,0.1)] py-1"
                      >
                        {filteredSuggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-50 transition-colors group"
                            onClick={() => {
                              setOrderName(suggestion);
                              setShowSuggestions(false);
                            }}
                          >
                            <div className="h-5 w-5 rounded-md bg-zinc-100 flex items-center justify-center text-zinc-400 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                              <Package className="h-3 w-3" />
                            </div>
                            <span className="font-medium text-zinc-700 group-hover:text-zinc-900">{suggestion}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 px-1">Ghi chú bổ sung</label>
                <Textarea 
                  placeholder="Nhập ghi chú chi tiết (nếu có)..." 
                  className="rounded-xl focus-visible:ring-zinc-900 min-h-[80px] text-sm border-zinc-200 resize-none"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-[11px] text-zinc-500">
              <UserIcon className="h-3.5 w-3.5" />
              <span>Được tạo bởi: <strong className="text-zinc-900">{userName}</strong></span>
            </div>
          </div>
        </div>
      </form>

      <div className="pt-6 mt-auto border-t border-zinc-100">
        <div className="flex gap-3">
          <Button 
            onClick={(e) => handleSubmit(e as any)}
            type="button" 
            disabled={uploading} 
            className="flex-1 rounded-xl h-12 font-bold transition-all shadow-lg active:scale-[0.98] bg-zinc-900 hover:bg-zinc-800 shadow-zinc-200"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang tải lên...
              </>
            ) : (
              <>
                Hoàn tất & Lưu đơn
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
