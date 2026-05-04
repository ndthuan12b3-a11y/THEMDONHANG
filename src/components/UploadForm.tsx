import React, { useState, useCallback, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Package, Image as ImageIcon, Camera, X, Plus, User as UserIcon, Loader2, ChevronRight, Settings2, AlertTriangle, Sparkles, FileText } from 'lucide-react';
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
import { checkImageQuality, scanInvoice, scanInvoiceNumber, ScanResult } from '../services/geminiService';

interface UploadFormProps {
  defaultPharmacy: PharmacyName;
  userName: string;
  onSuccess: () => void;
  availablePharmacies: PharmacyConfig[];
}

export function UploadForm({ defaultPharmacy, userName, onSuccess, availablePharmacies }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [orderName, setOrderName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierHistory, setSupplierHistory] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [pharmacy, setPharmacy] = useState<PharmacyName | ''>('');
  const [note, setNote] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '80px';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [note]);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [aiResults, setAiResults] = useState<Record<string, { isScanning: boolean, issues: string[], score?: number, verdict?: string }>>({});
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [isScanningInvoice, setIsScanningInvoice] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [scanMode, setScanMode] = useState<'SAPO' | 'GPP'>('SAPO');
  const [submitDate, setSubmitDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const isThuan = userName.toLowerCase().includes('thuận');

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
            
            // Quét số hóa đơn nếu chưa có và đang ở chế độ GPP
            if (scanMode === 'GPP' && !invoiceNumber.trim()) {
              setIsScanningInvoice(true);
              try {
                const foundNumber = await scanInvoiceNumber(base64);
                if (foundNumber && foundNumber.trim()) {
                  setInvoiceNumber(foundNumber.trim());
                  toast.success(`Đã tìm thấy số hóa đơn: ${foundNumber}`, { icon: '🔍' });
                }
              } catch (scanErr) {
                console.warn("Lỗi scan số HĐ:", scanErr);
              } finally {
                setIsScanningInvoice(false);
              }
            }

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
  }, [scanMode, invoiceNumber]);

  const [isInvoiceDuplicate, setIsInvoiceDuplicate] = useState(false);

  // Kiểm tra trùng mã hóa đơn ngay khi nhập hoặc AI quét xong
  useEffect(() => {
    if (!invoiceNumber.trim()) {
      setIsInvoiceDuplicate(false);
      return;
    }

    const checkDuplicate = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, pharmacy, order_name')
        .eq('invoice_number', invoiceNumber.trim())
        .limit(1);
      
      if (!error && data && data.length > 0) {
        setIsInvoiceDuplicate(true);
      } else {
        setIsInvoiceDuplicate(false);
      }
    };

    const timer = setTimeout(checkDuplicate, 500);
    return () => clearTimeout(timer);
  }, [invoiceNumber]);

  // Tự động quét hóa đơn khi chuyển sang chế độ GPP nếu đã có ảnh mà chưa có số HĐ
  useEffect(() => {
    if (scanMode === 'GPP' && !invoiceNumber.trim() && previews.length > 0 && !isScanningInvoice) {
      const scanFirstImage = async () => {
        setIsScanningInvoice(true);
        try {
          const foundNumber = await scanInvoiceNumber(previews[0]);
          if (foundNumber && foundNumber.trim()) {
            setInvoiceNumber(foundNumber.trim());
            toast.success(`Đã tìm thấy số hóa đơn: ${foundNumber}`, { icon: '🔍' });
          }
        } catch (err) {
          console.warn("Auto-scan error on mode switch:", err);
        } finally {
          setIsScanningInvoice(false);
        }
      };
      scanFirstImage();
    }
  }, [scanMode]);

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
    if (files.length === 0 || !orderName.trim() || !pharmacy) {
      toast.error("Vui lòng nhập đầy đủ thông tin, chọn nhà thuốc và ít nhất 1 ảnh.");
      return;
    }

    if (scanMode === 'GPP' && !invoiceNumber.trim()) {
      toast.error("Vui lòng nhập số hóa đơn khi chọn chế độ NHẬP GPP.");
      return;
    }

    // KIỂM TRA TRÙNG MÃ HÓA ĐƠN NGAY TẠI ĐÂY (TRƯỚC KHI TẢI ẢNH)
    if (invoiceNumber.trim()) {
      setUploading(true);
      const { data: existing, error: checkError } = await supabase
        .from('orders')
        .select('id, pharmacy, order_name, created_at')
        .eq('invoice_number', invoiceNumber.trim())
        .limit(1);
      
      if (checkError) {
        console.warn("Lỗi kiểm tra mã HĐ:", checkError);
      } else if (existing && existing.length > 0) {
        setUploading(false);
        toast.error(`Trùng mã hóa đơn!`, {
          description: `Mã "${invoiceNumber.trim()}" đã được dùng cho đơn "${existing[0].order_name}" tại ${existing[0].pharmacy}. Vui lòng kiểm tra lại.`,
          duration: 6000
        });
        return;
      }
      setUploading(false);
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
      const now = new Date();
      const finalDate = isThuan ? new Date(submitDate) : now;
      const monthYear = format(finalDate, 'MM-yyyy'); // Format MM-YYYY for storage consistency

      const orderPayload: any = {
        image_urls: uploadedUrls,
        order_name: orderName.trim(),
        sender_name: userName,
        pharmacy: pharmacy,
        invoice_number: invoiceNumber.trim() || null,
        month_year: monthYear,
        has_recorded_entry: true,
        has_recorded_batch_info: true,
        note: note.trim(),
        status: 'pending',
        scan_mode: scanMode
      };

      if (isThuan) {
         // Cố gắng ghi đè created_at nếu là Thuận, kèm theo giờ hiện tại
         const timeStr = format(now, "HH:mm:ss");
         orderPayload.created_at = `${submitDate}T${timeStr}`;
      }

      let { error: insertError } = await supabase
        .from('orders')
        .insert(orderPayload);

      // Handle missing 'scan_mode', 'month_year' or column permission errors
      if (insertError && (insertError.code === 'PGRST204' || insertError.code === '42703' || insertError.code === '42501' || insertError.message?.includes('created_at') || insertError.message?.includes('scan_mode') || insertError.message?.includes('month_year'))) {
        console.warn("Possible column collision or missing column. Retrying with safe payload...");
        const { scan_mode, created_at, month_year, ...safePayload } = orderPayload;
        
        let extraNote = "";
        if (scan_mode) extraNote += `[NHẬP ${scan_mode.toUpperCase()}] `;
        if (isThuan && submitDate) extraNote += `[NGÀY CHỈNH: ${submitDate}] `;
        if (month_year) extraNote += `[THÁNG: ${month_year}] `;
        
        const finalPayload = { 
          ...safePayload, 
          note: extraNote ? `${extraNote}\n${safePayload.note}` : safePayload.note 
        };
        
        const { error: retryError } = await supabase
          .from('orders')
          .insert(finalPayload);
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
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Điều khiển đầu vào</label>
              <div className="flex items-center gap-1.5 bg-emerald-50 text-[9px] font-black text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100">
                <Sparkles className="h-2.5 w-2.5" />
                <span>AI OPTIMIZED</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center justify-center p-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/20 hover:bg-emerald-50/50 hover:border-emerald-400 transition-all group active:scale-[0.95]"
                title="Chụp ảnh"
              >
                <div className="h-9 w-9 flex items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                  <Camera className="h-5 w-5" />
                </div>
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
                  "flex items-center justify-center p-3 rounded-xl border border-dashed transition-all cursor-pointer active:scale-[0.95] group",
                  "border-zinc-300 bg-white hover:bg-zinc-50 hover:border-zinc-400"
                )}
                title="Thư viện"
              >
                <div className="h-9 w-9 flex items-center justify-center rounded-xl bg-zinc-900 text-white shadow-lg shadow-zinc-900/20 group-hover:scale-110 transition-transform">
                  <ImageIcon className="h-5 w-5" />
                </div>
              </div>
            </div>

            {previews.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-2 p-2 bg-zinc-50/50 rounded-xl border border-dashed border-zinc-200">
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

          <AnimatePresence>
            {pharmacy && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden"
              >
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">PHƯƠNG THỨC XỬ LÝ</label>
                </div>
                <div className="grid grid-cols-2 gap-2 p-1.5 bg-zinc-100/50 border border-zinc-200/50 rounded-2xl relative overflow-hidden backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => setScanMode('SAPO')}
                    className={cn(
                      "relative py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all gap-2 flex items-center justify-center group",
                      scanMode === 'SAPO' 
                        ? "bg-zinc-900 text-white shadow-xl shadow-zinc-950/20" 
                        : "text-zinc-500 hover:text-zinc-900 hover:bg-white/50"
                    )}
                  >
                    {scanMode === 'SAPO' && (
                      <motion.div layoutId="scanModeBg" className="absolute inset-0 bg-zinc-900 rounded-xl -z-10" />
                    )}
                    <Sparkles className={cn("h-3.5 w-3.5 mb-0.5 transition-colors", scanMode === 'SAPO' ? "text-emerald-400" : "text-zinc-400")} />
                    <span className="relative">SAPO</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanMode('GPP')}
                    className={cn(
                      "relative py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all gap-2 flex items-center justify-center group",
                      scanMode === 'GPP' 
                        ? "bg-red-600 text-white shadow-xl shadow-red-600/20" 
                        : "text-zinc-500 hover:text-zinc-900 hover:bg-white/50"
                    )}
                  >
                    {scanMode === 'GPP' && (
                      <motion.div layoutId="scanModeBg" className="absolute inset-0 bg-red-600 rounded-xl -z-10" />
                    )}
                    <Sparkles className={cn("h-3.5 w-3.5 mb-0.5 transition-colors", scanMode === 'GPP' ? "text-white/60" : "text-zinc-400")} />
                    <span className="relative">GPP</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-4">
            <div className={cn("grid gap-4", scanMode === 'GPP' ? "grid-cols-2" : "grid-cols-1")}>
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 px-1">TÊN NHÀ CUNG CẤP</label>
                <div className="relative">
                  <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                  <Input 
                    placeholder="Nhập tên NCC..." 
                    className="rounded-xl pl-10 focus-visible:ring-zinc-900 h-11 text-sm border-zinc-200 shadow-sm"
                    value={orderName}
                    onChange={(e) => {
                      setOrderName(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
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

              {scanMode === 'GPP' && (
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-red-500 px-1 flex items-center gap-1">
                    MÃ HÓA ĐƠN
                    {isScanningInvoice && <Loader2 className="h-3 w-3 animate-spin ml-2 text-emerald-500" />}
                  </label>
                  <div className="relative">
                    {isScanningInvoice ? (
                      <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin" />
                    ) : (
                      <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                    )}
                    <Input 
                      placeholder={isScanningInvoice ? "AI đang quét..." : "Số HĐ..."} 
                      className={cn(
                        "rounded-xl pl-10 h-11 text-sm shadow-sm transition-all focus-visible:ring-red-500 border-red-100 bg-red-50/20",
                        isScanningInvoice && "border-emerald-200 bg-emerald-50/20 ring-1 ring-emerald-100",
                        isInvoiceDuplicate && "border-red-500 bg-red-50 ring-1 ring-red-200"
                      )}
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                    />
                    {isInvoiceDuplicate && (
                      <div className="absolute -bottom-5 left-1 flex items-center gap-1 text-[9px] font-bold text-red-600 animate-pulse">
                        <AlertTriangle className="h-3 w-3" />
                        MÃ HÓA ĐƠN NÀY ĐÃ TỒN TẠI!
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {isThuan && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 px-1">NGÀY GỬI ĐƠN (Dành cho Thuận)</label>
                <div className="relative">
                  <Input 
                    type="date"
                    className="rounded-xl focus-visible:ring-zinc-900 h-11 text-sm border-zinc-200 shadow-sm"
                    value={submitDate}
                    onChange={(e) => setSubmitDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 px-1">Ghi chú bổ sung</label>
              <Textarea 
                ref={textareaRef}
                placeholder="Nhập ghi chú chi tiết (nếu có)..." 
                className="rounded-xl focus-visible:ring-zinc-900 min-h-[80px] text-sm border-zinc-200 resize-none shadow-sm overflow-hidden transition-[height] duration-200"
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

      <div className="pt-4 mt-auto border-t border-zinc-100 bg-white left-0 right-0 z-10 p-2 sm:p-0 sm:pt-4 relative overflow-hidden">
        <Button 
          onClick={(e) => handleSubmit(e as any)}
          type="button"
          disabled={uploading} 
          className="w-full rounded-2xl h-15 font-black text-sm uppercase tracking-[0.3em] transition-all shadow-[0_20px_40px_-12px_rgba(0,0,0,0.3)] active:scale-[0.98] bg-zinc-950 hover:bg-black text-white hover:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.4)] group overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 translate-x-full group-hover:translate-x-0 transition-transform duration-700 ease-out" />
          {uploading ? (
            <>
              <Loader2 className="mr-3 h-5 w-5 animate-spin text-emerald-400" />
              ĐANG XỬ LÝ...
            </>
          ) : (
            <div className="flex items-center justify-center gap-4 relative">
              <span className="drop-shadow-sm">HOÀN TẤT & LƯU ĐƠN</span>
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <ChevronRight className="h-5 w-5" />
              </div>
            </div>
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
