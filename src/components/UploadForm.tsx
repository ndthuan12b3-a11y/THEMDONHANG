import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Package, Image as ImageIcon, Camera, X, Plus, User as UserIcon, Loader2, ChevronRight, Settings2, AlertTriangle, Sparkles } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, handleSupabaseError } from '../supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PharmacyName, PHARMACIES, PharmacyConfig } from '../types';
import { ImageEditor } from './ImageEditor';
import { logUserActivity } from './SystemLogsModal';
import { checkImageQuality, scanInvoice, ScanResult } from '../services/geminiService';

interface UploadFormProps {
  defaultPharmacy: PharmacyName;
  userName: string;
  onSuccess: () => void;
  availablePharmacies: PharmacyConfig[];
}

export function UploadForm({ defaultPharmacy, userName, onSuccess, availablePharmacies }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [orderName, setOrderName] = useState('');
  const [supplierHistory, setSupplierHistory] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [pharmacy, setPharmacy] = useState<PharmacyName>(defaultPharmacy);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [aiResults, setAiResults] = useState<Record<string, { isScanning: boolean, issues: string[], score?: number, verdict?: string }>>({});
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [scanMode, setScanMode] = useState<'SAPO' | 'GPP'>('SAPO');

  const DEFAULT_SUPPLIERS = ['TỔNG KHO 0907', 'NT TUỆ THIỆN', 'NT HƯNG THỊNH', 'NT PHÚC AN'];

  useEffect(() => {
    const saved = localStorage.getItem('supplier_history');
    let history = [...DEFAULT_SUPPLIERS];
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Merge default with saved, removing duplicates (case-insensitive)
          const historySet = new Set(history.map(s => s.trim().toUpperCase()));
          parsed.forEach(p => {
            const trimmed = p.trim();
            if (trimmed && !historySet.has(trimmed.toUpperCase())) {
              history.push(trimmed);
            }
          });
        }
      } catch (e) {
        console.error("Failed to parse supplier history");
      }
    }
    setSupplierHistory(history);
  }, []);

  useEffect(() => {
    const input = orderName.trim().toLowerCase();
    
    const suggestions = supplierHistory
      .filter(name => {
        const nameLower = name.toLowerCase();
        const pharmacyLower = pharmacy.toLowerCase();
        if (input && !nameLower.includes(input)) return false;
        if (nameLower.includes(pharmacyLower)) return false;
        if (input && nameLower === input) return false;
        return true;
      })
      .slice(0, 8);
      
    setFilteredSuggestions(suggestions);
  }, [orderName, supplierHistory, pharmacy]);

  const saveSupplierToHistory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSupplierHistory(prev => {
      const exists = prev.find(item => item.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;
      const newHistory = [trimmed, ...prev].slice(0, 20);
      localStorage.setItem('supplier_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const compressImage = async (file: File): Promise<Blob | File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(file);
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => resolve(file);
        img.src = event.target?.result as string;
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            // Giảm kích thước xuống 3000px để an toàn hơn cho bộ nhớ RAM của điện thoại đời cũ (Tránh màn hình đen)
            const MAX_SIZE = 3000; 
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
              if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              // 1. Phải đổ nền trắng trước (Tránh đổ nền đen khi vẽ lỗi hoặc file gốc có độ trong suốt)
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, width, height);

              // 2. Kiểm tra hỗ trợ filter để tránh crash/lỗi màn hình đen trên trình duyệt cũ
              const supportsFilter = typeof ctx.filter !== 'undefined';
              
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              
              if (supportsFilter) {
                // Chỉ áp dụng filter nếu trình duyệt hỗ trợ (Giảm độ phức tạp để tăng tính tương thích)
                ctx.filter = 'contrast(1.2) brightness(1.05)';
              }
              
              ctx.drawImage(img, 0, 0, width, height);
              
              // 3. Reset filter sau khi vẽ để không ảnh hưởng các lần vẽ sau
              if (supportsFilter) ctx.filter = 'none';

              canvas.toBlob((blob) => {
                if (!blob) {
                  console.error("Canvas toBlob null, using original file");
                  resolve(file);
                  return;
                }
                resolve(blob);
              }, 'image/jpeg', 0.9); // Quality 0.9 để tối ưu dung lượng
            } else {
              resolve(file);
            }
          } catch (e) {
            console.error("Compression error:", e);
            resolve(file);
          }
        };
      };
      reader.readAsDataURL(file);
    });
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFiles(prev => [...prev, ...acceptedFiles]);
      
      acceptedFiles.forEach(file => {
        const key = `${file.name}_${file.size}`;
        setAiResults(prev => ({ ...prev, [key]: { isScanning: true, issues: [] } }));
        
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          setPreviews(prev => [...prev, base64]);
          
          try {
            // Tạm dừng cực ngắn để UI không bị đơ
            await new Promise(r => setTimeout(r, 100));
            // Quét lỗi mờ, lóa bằng Gemini Flash Lite (Chi phí siêu rẻ)
            const quality = await checkImageQuality(base64);
            
            if (!quality.isGood && quality.issues.length > 0) {
              toast.warning(`Ảnh "${file.name}" có thể bị: ${quality.issues.join(', ')}. Khuyến nghị chụp lại nếu quá mờ.`, {
                duration: 5000,
                icon: '⚠️'
              });
            }
            
            setAiResults(prev => ({ 
              ...prev, 
              [key]: { 
                isScanning: false, 
                issues: quality.issues || [],
                score: quality.score,
                verdict: quality.verdict
              } 
            }));
          } catch (e) {
            setAiResults(prev => ({ ...prev, [key]: { isScanning: false, issues: [] } }));
          }
        };
        reader.readAsDataURL(file);
      });
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        const imageFiles = Array.from(e.clipboardData.files).filter(file => file.type.startsWith('image/'));
        if (imageFiles.length > 0) {
          onDrop(imageFiles);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onDrop]);

  const { getRootProps, getInputProps, isDragActive, open: openLibrary } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
    noClick: true,
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
    const loadingToast = toast.loading("Đang nén & Nâng cao độ nét AI...");
    
    try {
      const uploadedUrls: string[] = [];
      
      // Sequential upload is more reliable for large files/weak networks
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        toast.loading(`Đang tải ảnh ${i + 1}/${files.length}...`, { id: loadingToast });
        
        const compressedBlob = await compressImage(file);
        // Clean filename for Supabase storage
        const safeFileName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        const fileName = `${Date.now()}_${i}_${safeFileName}`;
        const filePath = `${fileName}`;

        // Upload to Supabase Storage bucket 'orders'
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('orders')
          .upload(filePath, compressedBlob, {
            contentType: file.type || 'image/jpeg',
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('orders')
          .getPublicUrl(filePath);
          
        uploadedUrls.push(publicUrl);
      }

      toast.loading("Đang lưu đơn hàng vào hệ thống...", { id: loadingToast });

      // Insert into Supabase table 'orders'
      const orderPayload = {
        image_urls: uploadedUrls,
        order_name: orderName.trim(),
        sender_name: userName,
        pharmacy: pharmacy,
        has_recorded_entry: true,
        has_recorded_batch_info: true,
        note: note.trim(),
        status: 'pending',
        scan_mode: scanMode
      };

      let { error: insertError } = await supabase
        .from('orders')
        .insert(orderPayload);

      // Handle missing 'scan_mode' column error (PGRST204)
      if (insertError && (insertError.code === 'PGRST204' || insertError.message?.includes('scan_mode'))) {
        console.warn("Scan mode column not found in database. Retrying with mode in notes...");
        const { scan_mode, ...legacyPayload } = orderPayload;
        // Prepend to note for permanent visibility
        legacyPayload.note = `[NHẬP ${scan_mode.toUpperCase()}]\n${legacyPayload.note}`;
        const { error: retryError } = await supabase
          .from('orders')
          .insert(legacyPayload);
        insertError = retryError;
      }

      if (insertError) throw insertError;

      // Add to notifications table for real-time sync across all users
      try {
        await supabase
          .from('notifications')
          .insert({
            title: `Đơn mới từ ${userName}`,
            body: `Đã gửi đơn "${orderName.trim()}" tới ${pharmacy}`,
            read: false
          });
      } catch (notifErr) {
        console.warn("Failed to create notification record, but order was saved.");
      }

      saveSupplierToHistory(orderName);
      toast.success("Đã thêm đơn hàng thành công!", { id: loadingToast });
      logUserActivity('Tải lên đơn hàng', `Gửi đơn "${orderName.trim()}" với ${files.length} ảnh tới ${pharmacy}`);
      
      // Cleanup locally
      files.forEach((f: any) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
      onSuccess();
    } catch (error: any) {
      console.error("Supabase Submit Error:", error);
      toast.error(`Lỗi hệ thống: ${error?.message || "Lỗi không xác định"}`, { id: loadingToast });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div {...getRootProps()} className="flex flex-col h-full relative w-full focus:outline-none">
      <input {...getInputProps()} />
      
      <AnimatePresence>
        {isDragActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 rounded-3xl bg-emerald-500/95 flex flex-col items-center justify-center text-white backdrop-blur-md border-4 border-white/20 border-dashed m-1 shadow-2xl"
          >
            <div className="p-6 bg-white/10 rounded-full mb-6">
              <ImageIcon className="h-16 w-16 animate-bounce" />
            </div>
            <p className="text-2xl font-black tracking-widest uppercase">Thả ảnh vào đây</p>
            <p className="text-sm font-medium opacity-80 mt-2 tracking-wider">Tự động nhận diện và thêm vào đơn hàng</p>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-6 min-h-0 no-scrollbar pb-6 pt-4">
            <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">Hình Ảnh</label>
              <span className="text-[10px] text-zinc-400 font-medium">Đã chọn: {files.length}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
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

              <div 
                onClick={openLibrary}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 transition-all cursor-pointer active:scale-[0.98]",
                  "border-zinc-100 bg-zinc-50/50 hover:bg-zinc-100/50 hover:border-zinc-200"
                )}
              >
                <div className="p-3 rounded-full bg-zinc-200 text-zinc-500 group-hover:scale-110 transition-transform">
                  <ImageIcon className="h-6 w-6" />
                </div>
                <span className="text-sm font-black text-zinc-900">THƯ VIỆN</span>
              </div>
            </div>

            {previews.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-4 p-3 bg-zinc-50 rounded-2xl border border-zinc-100">
                {previews.map((src, index) => {
                  const file = files[index];
                  const aiKey = file ? `${file.name}_${file.size}` : '';
                  const aiStatus = aiResults[aiKey];

                  return (
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      key={index} 
                      className={cn(
                        "relative aspect-square overflow-hidden rounded-lg border group",
                        aiStatus && !aiStatus.isScanning && aiStatus.issues.length > 0 
                          ? "border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.3)]" 
                          : "border-zinc-200"
                      )}
                    >
                      <img src={src} alt={`Preview ${index}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      
                      {/* AI Quality Indicator */}
                      {aiStatus && (
                        <div className="absolute top-1 left-1 pointer-events-none">
                          {aiStatus.isScanning ? (
                            <div className="bg-black/60 backdrop-blur text-white p-1 rounded-md shadow flex items-center gap-1 border border-white/10">
                              <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                              <span className="text-[8px] font-bold uppercase tracking-wider">AI Check</span>
                            </div>
                          ) : aiStatus.issues.length > 0 ? (
                            <div className="bg-amber-500/90 backdrop-blur text-white px-1.5 py-0.5 rounded-md shadow flex items-center gap-1 border border-amber-400">
                               <AlertTriangle className="w-3 h-3" />
                               <div className="flex flex-col">
                                 <span className="text-[9px] font-bold leading-tight">{aiStatus.verdict}</span>
                                 <span className="text-[7px] font-medium opacity-80 leading-none">{aiStatus.score}% OCR</span>
                               </div>
                            </div>
                          ) : (
                            <div className="bg-emerald-500/90 backdrop-blur text-white px-1.5 py-0.5 rounded-md shadow flex items-center gap-1 border border-emerald-400">
                               <Sparkles className="w-3 h-3" />
                               <div className="flex flex-col">
                                 <span className="text-[9px] font-bold leading-tight">NÉT</span>
                                 <span className="text-[7px] font-medium opacity-80 leading-none">{aiStatus.score}% OCR</span>
                               </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]">
                        <button
                          type="button"
                          className="bg-zinc-900/80 text-white rounded-full p-2 hover:bg-emerald-500 transition-colors shadow-lg scale-90 group-hover:scale-100"
                          onClick={(e) => { e.stopPropagation(); setEditingIndex(index); }}
                        >
                           <Settings2 className="h-4 w-4" />
                        </button>
                      </div>
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </motion.div>
                  );
                })}
                <button 
                  type="button"
                  onClick={openLibrary}
                  className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 bg-white text-zinc-400 hover:border-zinc-300 hover:bg-zinc-50 transition-all"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 px-1">Chọn nhà thuốc</label>
            <div className="flex p-1 bg-zinc-100 rounded-xl gap-1">
              {availablePharmacies.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setPharmacy(p.name as PharmacyName)}
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

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 px-1">LOẠI NHẬP HÀNG</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-xl">
              <button
                type="button"
                onClick={() => setScanMode('SAPO')}
                className={cn(
                  "py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all gap-2 flex items-center justify-center",
                  scanMode === 'SAPO' 
                    ? "bg-zinc-900 text-white shadow-md shadow-zinc-200" 
                    : "text-zinc-500 hover:text-zinc-900 bg-transparent"
                )}
              >
                <Sparkles className={cn("h-3.5 w-3.5", scanMode === 'SAPO' ? "text-emerald-400" : "text-zinc-400")} />
                SAPO
              </button>
              <button
                type="button"
                onClick={() => setScanMode('GPP')}
                className={cn(
                  "py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all gap-2 flex items-center justify-center",
                  scanMode === 'GPP' 
                    ? "bg-red-600 text-white shadow-md shadow-red-200" 
                    : "text-zinc-500 hover:text-zinc-900 bg-transparent"
                )}
              >
                <Sparkles className={cn("h-3.5 w-3.5", scanMode === 'GPP' ? "text-red-400" : "text-zinc-400")} />
                GPP
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 px-1">TÊN NHÀ CUNG CẤP</label>
              <div className="relative">
                <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                <Input 
                  placeholder="Nhập tên nhà cung cấp..." 
                  className="rounded-xl pl-10 focus-visible:ring-zinc-900 h-11 text-sm border-zinc-200 shadow-sm"
                  value={orderName}
                  onChange={(e) => {
                    setOrderName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => {
                    // Refresh suggestions on focus even if empty
                    setShowSuggestions(true);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 250)}
                />
                
                <AnimatePresence>
                  {showSuggestions && (orderName.trim().length > 0 || filteredSuggestions.length > 0) && filteredSuggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute left-0 right-0 top-full mt-1.5 z-[60] overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-[0_10px_40px_-5px_rgba(0,0,0,0.1)] py-1"
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
                className="rounded-xl focus-visible:ring-zinc-900 min-h-[80px] text-sm border-zinc-200 resize-none shadow-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-[11px] text-zinc-500">
            <UserIcon className="h-3.5 w-3.5" />
            <span>Được tạo bởi: <strong className="text-zinc-900">{userName}</strong></span>
          </div>
        </form>

      <div className="pt-4 mt-auto border-t border-zinc-100 bg-white left-0 right-0 z-10 p-2 sm:p-0 sm:pt-4">
        <Button 
          onClick={(e) => handleSubmit(e as any)}
          type="button"
          disabled={uploading} 
          className="w-full rounded-xl h-14 font-black text-sm uppercase tracking-widest transition-all shadow-xl active:scale-[0.98] bg-zinc-950 hover:bg-black text-white hover:shadow-2xl"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Đang tải lên...
            </>
          ) : (
            <>
              Hoàn tất & Lưu đơn
              <ChevronRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </div>

      {editingIndex !== null && (
        <ImageEditor 
          isOpen={true}
          file={files[editingIndex]}
          previewUrl={previews[editingIndex]}
          onSave={(newFile, newPreviewUrl) => {
             const newFiles = [...files];
             newFiles[editingIndex] = newFile;
             setFiles(newFiles);
             
             const newPreviews = [...previews];
             newPreviews[editingIndex] = newPreviewUrl;
             setPreviews(newPreviews);
             
             setEditingIndex(null);
          }}
          onCancel={() => setEditingIndex(null)}
        />
      )}
    </div>
  );
}
