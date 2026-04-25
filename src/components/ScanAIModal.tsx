import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Scan, FileJson, AlertCircle, CheckCircle2, Clipboard, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { scanInvoice, ScanResult } from '../services/geminiService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { logUserActivity } from './SystemLogsModal';
import { supabase } from '../supabase';

interface ScanAIModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrls: string[];
  defaultMode?: 'SAPO' | 'GPP';
}

export const ScanAIModal: React.FC<ScanAIModalProps> = ({ isOpen, onOpenChange, imageUrls, defaultMode = 'SAPO' }) => {
  const [mode, setMode] = useState<'SAPO' | 'GPP'>(defaultMode);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  // Sync mode when defaultMode changes (e.g. order changed while modal open)
  React.useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
    }
  }, [defaultMode, isOpen]);

  const checkPotentialDuplicate = async (newResult: ScanResult): Promise<ScanResult | null> => {
    if (!newResult.invoice_no || !newResult.supplier_name) return null;

    try {
      // Tìm kiếm trong Cloud Cache các bản ghi có số hóa đơn và tên NCC khớp
      const { data, error } = await supabase
        .from('ai_scan_cache')
        .select('result')
        .contains('result', { 
          invoice_no: newResult.invoice_no, 
          supplier_name: newResult.supplier_name 
        })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        return data[0].result as ScanResult;
      }
    } catch (err) {
      console.error("Duplicate Check Error:", err);
    }
    return null;
  };

  const handleScan = async (forceRescan: boolean = false) => {
    try {
      const cacheKey = `ai_scan_${mode}_${imageUrls.join(',')}`;
      
      if (!forceRescan) {
        // 1. Check Cloud Cache first (Sync for everyone)
        const { data: cloudCached } = await supabase
          .from('ai_scan_cache')
          .select('result')
          .eq('cache_key', cacheKey)
          .maybeSingle();

        if (cloudCached) {
          const cloudResult = cloudCached.result as ScanResult;
          const dup = await checkPotentialDuplicate(cloudResult);
          const finalResult = dup || cloudResult;
          
          setResult(finalResult);
          toast.info(dup ? "⚡ Tải dữ liệu từ hóa đơn đã tồn tại (Trùng lặp)" : "⚡ Tải kết quả từ Cloud Cache (Đồng bộ 0đ)");
          logUserActivity('Quét AI (Cloud)', `Sử dụng kết quả đồng bộ cho chế độ ${mode}${dup ? ' - Phát hiện trùng' : ''}`);
          return;
        }

        // 2. Fallback to Local Cache
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const cachedResult = JSON.parse(cached) as ScanResult;
          const dup = await checkPotentialDuplicate(cachedResult);
          const finalResult = dup || cachedResult;

          setResult(finalResult);
          toast.info(dup ? "⚡ Tải dữ liệu từ hóa đơn đã tồn tại (Trùng lặp)" : "Đã tải kết quả từ Bộ Nhớ Đệm (Miễn phí API)");
          logUserActivity('Quét AI (Cache)', `Sử dụng chế độ ${mode} bằng dữ liệu lưu trữ tạm${dup ? ' - Phát hiện trùng' : ''}`);
          return;
        }
      }

      setIsScanning(true);
      setResult(null);
      
      // Convert multiple image URLs to base64
      const base64Promises = imageUrls.map(async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        const reader = new FileReader();
        return new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      });
      const base64Images = await Promise.all(base64Promises);
      
      const scanResult = await scanInvoice(base64Images, mode);
      
      // 2. Save to Cache on success
      if (scanResult.quality.isGood) {
        const dup = await checkPotentialDuplicate(scanResult);
        const finalResult = dup || scanResult;

        // Save Local
        localStorage.setItem(cacheKey, JSON.stringify(finalResult));
        
        // Save Cloud (Sync for everyone)
        await supabase.from('ai_scan_cache').upsert({
          cache_key: cacheKey,
          result: finalResult
        });

        toast.success(dup ? "✅ Đã tự động lấy lại dữ liệu từ hóa đơn trùng lặp" : "Quét AI thành công!");
        logUserActivity('Quét AI (API)', `Sử dụng Gemini bóc tách hóa đơn ở chế độ ${mode}${dup ? ' - PHÁT HIỆN TRÙNG' : ''}`);
        setResult(finalResult);
      } else {
        toast.warning(`Chất lượng ảnh thấp: ${scanResult.quality.reason}`);
        logUserActivity('Quét AI (Thất bại)', `Ảnh chất lượng thấp: ${scanResult.quality.reason}`);
        setResult(scanResult);
      }
      
    } catch (error: any) {
      console.error(error);
      const msg = error.message || "Đã xảy ra lỗi không xác định";
      toast.error(`Lỗi AI: ${msg}`);
      setResult({
        quality: { isGood: false, reason: `Lỗi kết nối AI: ${msg}` },
        data: [],
        total_amount: "0"
      });
    } finally {
      setIsScanning(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result.data, null, 2));
    toast.success("Đã sao chép kết quả JSON!");
  };

  const handleCopyCell = (text: string | number | undefined | null) => {
    if (!text && text !== 0) return;
    const value = text.toString();
    navigator.clipboard.writeText(value);
    toast.success(`Đã chép: ${value}`, {
      duration: 1000,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="!max-w-none sm:!max-w-none w-screen h-[100dvh] flex flex-col p-0 gap-0 overflow-hidden bg-white border-none !rounded-none pb-0 pt-0 !translate-y-0 !translate-x-0 !top-0 !left-0">
        <DialogHeader className="p-4 sm:p-5 bg-zinc-900 text-white shrink-0 shadow-md z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-lg">
              <Sparkles className="h-5 w-5 text-white animate-[spin_3s_linear_infinite]" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">AI SCAN HUB</DialogTitle>
              <p className="text-xs text-zinc-400 font-medium">Trợ lý số hóa đơn hàng thông minh</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-zinc-50/50">
          <div className="flex flex-col lg:flex-row h-full">
            {/* Image & Controls Preview (Left Sidebar on Desktop) */}
            <div className="w-full lg:w-[450px] xl:w-[500px] shrink-0 p-4 sm:p-6 space-y-4 flex flex-col border-r border-zinc-200 bg-white overflow-y-auto">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Ảnh đang quét {imageUrls.length > 1 && `(${imageUrls.length} ảnh)`}
                </label>
              </div>
              <div className="relative rounded-2xl overflow-y-auto border border-zinc-200 bg-zinc-50 shadow-inner h-[280px] p-2 space-y-2 no-scrollbar">
                {imageUrls.map((url, idx) => (
                  <img 
                    key={idx}
                    src={url} 
                    alt={`Invoice ${idx + 1}`} 
                    className="w-full h-auto object-contain rounded-xl border border-zinc-200 shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
              
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setMode('SAPO')}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2",
                    mode === 'SAPO' 
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-md scale-[1.02]" 
                      : "border-zinc-100 bg-white text-zinc-400 hover:border-emerald-200 hover:bg-zinc-50"
                  )}
                >
                  <FileJson className={cn("h-6 w-6 mt-1", mode === 'SAPO' ? "text-emerald-500" : "text-zinc-300")} />
                  <div className="text-center pb-1">
                    <p className="text-base font-black tracking-widest">SAPO</p>
                  </div>
                </button>
                <button
                  onClick={() => setMode('GPP')}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2",
                    mode === 'GPP' 
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-md scale-[1.02]" 
                      : "border-zinc-100 bg-white text-zinc-400 hover:border-blue-200 hover:bg-zinc-50"
                  )}
                >
                  <CheckCircle2 className={cn("h-6 w-6 mt-1", mode === 'GPP' ? "text-blue-500" : "text-zinc-300")} />
                  <div className="text-center pb-1">
                    <p className="text-base font-black tracking-widest">GPP</p>
                  </div>
                </button>
              </div>

              <div className="pt-2">
                <Button 
                  onClick={() => handleScan(false)}
                  disabled={isScanning}
                  className="w-full h-14 rounded-2xl bg-zinc-900 border-none shadow-xl hover:bg-zinc-800 text-base font-black uppercase tracking-widest transition-all group overflow-hidden relative"
                >
                  <div className="absolute inset-0 bg-emerald-500/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  {isScanning ? (
                    <>
                      <Loader2 className="mr-2 h-6 w-6 animate-spin text-emerald-400" />
                      Đang phân tích...
                    </>
                  ) : (
                    <>
                      <Scan className="mr-2 h-5 w-5 text-emerald-400" />
                      Bắt đầu quét AI
                    </>
                  )}
                </Button>
                
                {localStorage.getItem(`ai_scan_${mode}_${imageUrls.join(',')}`) && (
                  <Button 
                    onClick={() => handleScan(true)}
                    disabled={isScanning}
                    variant="outline"
                    className="w-full h-10 mt-2 rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-900"
                  >
                    Quét Lại (Bỏ qua lưu tạm)
                  </Button>
                )}
              </div>
            </div>

            {/* Results Section (Right large panel on Desktop) */}
            <div className="flex-1 flex flex-col h-full bg-zinc-50/50 p-4 sm:p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Bảng kết quả
                </label>
                {result && result.quality.isGood && (
                  <Button variant="outline" size="sm" onClick={copyToClipboard} className="h-8 text-[11px] font-bold uppercase hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 bg-white border-zinc-200 text-zinc-700 shadow-sm transition-colors">
                    <Clipboard className="mr-1.5 h-3.5 w-3.5" />
                    Copy JSON Code
                  </Button>
                )}
              </div>

              <div className="flex-1 bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col relative w-full">
                <AnimatePresence mode="wait">
                  {!result && !isScanning && (
                    <motion.div 
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-4"
                    >
                      <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center shadow-inner border border-zinc-100">
                        <Scan className="h-8 w-8 text-zinc-300" />
                      </div>
                      <div>
                        <p className="text-zinc-600 font-bold text-lg">AI đang chờ lệnh</p>
                        <p className="text-zinc-400 text-sm mt-1 max-w-sm mx-auto">Chọn chế độ và nhấn Bắt đầu quét ở bên trái để tự động trích xuất bảng dữ liệu từ ảnh trên.</p>
                      </div>
                    </motion.div>
                  )}

                  {isScanning && (
                    <motion.div 
                      key="scanning"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-6"
                    >
                      <div className="relative">
                        <Loader2 className="h-16 w-16 text-emerald-500 animate-[spin_1.5s_linear_infinite]" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-8 h-8 bg-emerald-500/10 rounded-full animate-ping" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-zinc-900 font-black text-xl tracking-tight">AI ĐANG PHÂN TÍCH...</p>
                        <p className="text-zinc-500 text-sm animate-pulse max-w-sm mx-auto">Quá trình này có thể mất vài giây để hình thành cấu trúc dữ liệu theo chuẩn {mode}.</p>
                      </div>
                    </motion.div>
                  )}

                  {result && (
                    <motion.div 
                      key="results"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute inset-0 flex flex-col bg-white"
                    >
                      {/* Quality Alert */}
                      {!result.quality.isGood && (
                        <div className="m-4 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
                          <div>
                            <p className="text-orange-900 font-bold text-sm uppercase">Phát hiện ảnh mờ / Không đạt</p>
                            <p className="text-orange-700 text-sm mt-1 leading-relaxed">{result.quality.reason}</p>
                          </div>
                        </div>
                      )}

                      {/* Invoice Info Summary - Only show in GPP or if it's a rescan with data */}
                      {mode === 'GPP' && (result.invoice_date || result.invoice_no || result.tax_code || result.supplier_name || result.buyer_name || result.buyer_tax_code) && (
                        <div className="mx-4 mt-4 p-4 bg-white border border-zinc-200 rounded-xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 shadow-sm">
                          {result.supplier_name && (
                            <div className="space-y-1 group cursor-pointer" onClick={() => handleCopyCell(result.supplier_name)}>
                              <p className="text-[10px] font-black uppercase text-zinc-400 group-hover:text-emerald-500 transition-colors">Đơn vị bán</p>
                              <p className="text-sm font-bold text-zinc-900 truncate" title={result.supplier_name}>{result.supplier_name}</p>
                            </div>
                          )}
                          {result.tax_code && (
                            <div className="space-y-1 group cursor-pointer" onClick={() => handleCopyCell(result.tax_code)}>
                              <p className="text-[10px] font-black uppercase text-zinc-400 group-hover:text-emerald-500 transition-colors">MST Người bán</p>
                              <p className="text-sm font-bold text-zinc-900">{result.tax_code}</p>
                            </div>
                          )}
                          {result.buyer_name && (
                            <div className="space-y-1 group cursor-pointer" onClick={() => handleCopyCell(result.buyer_name)}>
                              <p className="text-[10px] font-black uppercase text-zinc-400 group-hover:text-emerald-500 transition-colors">Đơn vị mua</p>
                              <p className="text-sm font-bold text-zinc-900 truncate" title={result.buyer_name}>{result.buyer_name || 'N/A'}</p>
                            </div>
                          )}
                          {result.buyer_tax_code && (
                            <div className="space-y-1 group cursor-pointer" onClick={() => handleCopyCell(result.buyer_tax_code)}>
                              <p className="text-[10px] font-black uppercase text-zinc-400 group-hover:text-emerald-500 transition-colors">MST Người mua</p>
                              <p className="text-sm font-bold text-zinc-900">{result.buyer_tax_code || 'N/A'}</p>
                            </div>
                          )}
                          {result.invoice_date && (
                            <div className="space-y-1 group cursor-pointer" onClick={() => handleCopyCell(result.invoice_date)}>
                              <p className="text-[10px] font-black uppercase text-zinc-400 group-hover:text-emerald-500 transition-colors">Ngày HĐ</p>
                              <p className="text-sm font-bold text-zinc-900">{result.invoice_date}</p>
                            </div>
                          )}
                          {result.invoice_no && (
                            <div className="space-y-1 group cursor-pointer" onClick={() => handleCopyCell(result.invoice_no)}>
                              <p className="text-[10px] font-black uppercase text-zinc-400 group-hover:text-emerald-500 transition-colors">Số hóa đơn</p>
                              <p className="text-sm font-bold text-zinc-900">{result.invoice_no}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Table Display */}
                      <div className="flex-1 overflow-auto p-4 w-full h-full flex flex-col gap-4">
                        {result.data.length > 0 ? (
                          <>
                            <div className="block w-full overflow-x-auto rounded-xl border border-zinc-200 shadow-sm">
                              <table className="w-full text-sm text-left border-collapse whitespace-nowrap min-w-max">
                                <thead className="bg-zinc-50 sticky top-0 z-10 outline outline-1 outline-zinc-200">
                                <tr>
                                  {mode === 'SAPO' ? (
                                    <>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px] min-w-[50px]">STT</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">Tên sản phẩm</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">Số lô</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">Hạn dùng (HSD)</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">Đơn vị</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">SL nhập</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">Đơn giá</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">Chiết khấu</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">Thành tiền</th>
                                    </>
                                  ) : (
                                    <>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">Tên HH</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">Số lô</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">HSD</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">ĐVT</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">SL</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">ĐG Nhập</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">CK</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">VAT</th>
                                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-widest text-[11px]">Thành tiền</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-200">
                                {result.data.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-zinc-50 transition-colors bg-white">
                                    {mode === 'SAPO' ? (
                                      <>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-600 font-medium cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.stt)}
                                        >
                                          {item.stt}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 font-bold text-zinc-900 max-w-[300px] truncate cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200" 
                                          title={item.ten_san_pham}
                                          onClick={() => handleCopyCell(item.ten_san_pham)}
                                        >
                                          {item.ten_san_pham}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-600 font-medium cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.so_lo)}
                                        >
                                          {item.so_lo}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-600 font-medium cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.hsd)}
                                        >
                                          {item.hsd}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-600 font-medium cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.don_vi)}
                                        >
                                          {item.don_vi}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-800 font-bold cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.sl_nhap)}
                                        >
                                          {item.sl_nhap}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-emerald-600 font-mono font-bold tracking-tight cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.don_gia)}
                                        >
                                          {item.don_gia}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-500 font-mono text-xs cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.chiet_khau)}
                                        >
                                          {item.chiet_khau}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-emerald-700 font-mono font-bold tracking-tight bg-emerald-50/30 cursor-pointer hover:bg-emerald-100 transition-colors active:bg-emerald-200"
                                          onClick={() => handleCopyCell(item.thanh_tien)}
                                        >
                                          {item.thanh_tien}
                                        </td>
                                      </>
                                    ) : (
                                      <>
                                        <td 
                                          className="px-4 py-3.5 font-bold text-zinc-900 max-w-[250px] truncate cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200" 
                                          title={item.ten_hh}
                                          onClick={() => handleCopyCell(item.ten_hh)}
                                        >
                                          {item.ten_hh}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-600 font-medium cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.so_lo)}
                                        >
                                          {item.so_lo}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-600 font-medium cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.hsd)}
                                        >
                                          {item.hsd}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-600 font-medium cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.dvt)}
                                        >
                                          {item.dvt}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-800 font-bold cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.sl)}
                                        >
                                          {item.sl}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-blue-600 font-mono font-bold tracking-tight cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.don_gia_nhap)}
                                        >
                                          {item.don_gia_nhap}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-500 font-mono text-xs cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.chiet_khau)}
                                        >
                                          {item.chiet_khau}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-zinc-600 font-medium cursor-pointer hover:bg-zinc-100 transition-colors active:bg-zinc-200"
                                          onClick={() => handleCopyCell(item.vat)}
                                        >
                                          {item.vat}
                                        </td>
                                        <td 
                                          className="px-4 py-3.5 text-blue-700 font-mono font-bold tracking-tight bg-blue-50/30 cursor-pointer hover:bg-blue-100 transition-colors active:bg-blue-200"
                                          onClick={() => handleCopyCell(item.thanh_tien)}
                                        >
                                          {item.thanh_tien}
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          
                          {/* Total Amount Row */}
                          <div className={cn(
                            "w-full rounded-xl p-5 flex items-center justify-between shadow-sm border",
                            mode === 'SAPO' ? "bg-emerald-50/50 border-emerald-100" : "bg-blue-50/50 border-blue-100"
                          )}>
                            <div className="flex items-center gap-3">
                              <div className={cn("w-2 h-8 rounded-full", mode === 'SAPO' ? "bg-emerald-500" : "bg-blue-500")} />
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Tổng cộng thanh toán (Từ Hóa Đơn)</p>
                                <p className={cn("text-xs font-medium", mode === 'SAPO' ? "text-emerald-700" : "text-blue-700")}>
                                  Hệ thống đã tự động tìm và trích xuất đúng tổng giá trị thanh toán cuối cùng. Nhấp vào số tiền để copy.
                                </p>
                              </div>
                            </div>
                            <div 
                              className={cn(
                                "text-2xl font-black font-mono tracking-tighter cursor-pointer hover:scale-105 transition-transform",
                                mode === 'SAPO' ? "text-emerald-600" : "text-blue-600"
                              )}
                              onClick={() => handleCopyCell(result.total_amount)}
                            >
                              {result.total_amount} <span className="text-sm">VNĐ</span>
                            </div>
                          </div>
                        </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-zinc-400">
                            <AlertCircle className="h-12 w-12 mb-3 opacity-20" />
                            <p className="text-base font-medium">Không thể trích xuất bảng dữ liệu từ ảnh này.</p>
                            <p className="text-sm mt-1">Vui lòng thử lại với ảnh rõ nét hơn.</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-5 bg-white border-t border-zinc-200 flex-row justify-end space-x-3 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-10 shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl h-11 text-zinc-500 font-bold hover:bg-zinc-100 uppercase tracking-widest text-xs px-8">Đóng Hub</Button>
          <Button 
            className="rounded-xl h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-200 px-8 transition-colors"
            onClick={copyToClipboard}
            disabled={!result || !result.quality.isGood}
          >
            Lưu Kết Quả
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
