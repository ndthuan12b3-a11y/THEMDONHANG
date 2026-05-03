import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import { cn } from '@/lib/utils';
import { 
  Plus, 
  RotateCw, 
  Bell, 
  Search, 
  Trash2, 
  Ban, 
  Download, 
  X, 
  Check, 
  ExternalLink, 
  Edit2, 
  Trash,
  AlertTriangle,
  Calendar,
  FileText,
  Clock,
  Activity,
  ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence, Variants } from 'motion/react';
import { format, isBefore, subDays, startOfDay, parseISO } from 'date-fns';
import { logUserActivity } from './SystemLogsModal';

interface Invoice {
  id: string;
  name: string;
  date: string;
  link?: string;
  note?: string;
  pharmacy: string;
  completed: boolean;
  is_deleted: boolean;
  ever_blacklisted: boolean;
  created_at: string;
  deleted_at?: string;
  invoice_number?: string;
}

const removeVietnameseTones = (str: string) => {
  if (!str) return "";
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|ã|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  return str;
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 5 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { type: "tween", duration: 0.15, ease: "easeOut" }
  },
  exit: { opacity: 0, transition: { duration: 0.1 } }
};

export function HuoctsiHub({ onClose }: { onClose?: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [currentPharmacy, setCurrentPharmacy] = useState('NT Tuệ Thiện');
  const [filterType, setFilterType] = useState<'all' | 'pending' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [monthFilter, setMonthFilter] = useState<string>(format(new Date(), 'MM-yyyy'));
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  
  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isBlacklistOpen, setIsBlacklistOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [isListModalOpen, setIsListModalOpen] = useState<'all' | 'completed' | 'pending' | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formNote, setFormNote] = useState('');

  const isAnyModalOpen = isFormOpen || isBlacklistOpen || isRecycleBinOpen || isListModalOpen !== null || isAlertOpen;

  // Fetch data and setup real-time
  useEffect(() => {
    const fetchAvailableMonths = async () => {
      // Trying to fetch the date column
      const { data, error } = await supabase.from('medx_invoices').select('date');
      
      const monthsSet = new Set<string>();
      monthsSet.add(format(new Date(), 'MM-yyyy'));
      
      if (!error && data) {
        data.forEach(row => {
          if (row.date) {
            const d = new Date(row.date);
            if (!isNaN(d.getTime())) {
              monthsSet.add(format(d, 'MM-yyyy'));
            }
          }
        });
      } else if (error) {
         console.warn("Lỗi khi lấy danh sách tháng cho hóa đơn:", error);
      }
      
      setAvailableMonths(prev => {
        const newArray = Array.from(monthsSet);
        if (JSON.stringify(prev) === JSON.stringify(newArray)) return prev;
        return newArray;
      });
    };
    fetchAvailableMonths();
    fetchInvoices();

    const channel = supabase
      .channel('medx_invoices_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'medx_invoices' },
        (payload) => {
          console.log('Realtime change detected:', payload.eventType);
          fetchInvoices(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [monthFilter]); // Refetch when month filter changes, realtime handles other updates

  const fetchInvoices = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let query = supabase
        .from('medx_invoices')
        .select('*');
      
      if (monthFilter !== 'all') {
        const [month, year] = monthFilter.split('-');
        const startDate = `${year}-${month.padStart(2, '0')}-01`;
        const endDate = `${year}-${month.padStart(2, '0')}-31`;
        query = query.gte('date', startDate).lte('date', endDate);
      }

      const { data, error } = await query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Fetch error:', error);
        // Fallback: If query fails (likely due to missing column), fetch all and filter locally
        const { data: fallbackData } = await supabase.from('medx_invoices').select('*').order('date', { ascending: false });
        
        let results = (fallbackData || []).map(inv => ({
            ...inv,
            // Ensure date is string if it comes back as something else
            date: inv.date || format(new Date(inv.created_at || Date.now()), 'yyyy-MM-dd')
        }));

        if (monthFilter !== 'all') {
          const [month, year] = monthFilter.split('-');
          // local filter for YYYY-MM-DD string
          results = results.filter(inv => inv.date && inv.date.startsWith(`${year}-${month.padStart(2, '0')}`));
        }
        setInvoices(results);
      } else {
        setInvoices(data || []);
      }
      
      // Clear alerts after successful fetch
      if (data && data.length > 0) {
        const overdue = data.filter(i => 
          !i.completed && 
          !i.is_deleted && 
          i.date &&
          isBefore(parseISO(i.date), subDays(startOfDay(new Date()), 3))
        );
        if (overdue.length > 0) setIsAlertOpen(true);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      if (!silent) setLoading(false);
      setIsInitialLoading(false);
    }
  };

  // Helper for consistent pharmacy matching
  const isPharmacyMatch = (invoicePharmacy: string, targetPharmacy: string) => {
    const p1 = (invoicePharmacy || "").toLowerCase().replace('nt ', '').trim();
    const p2 = (targetPharmacy || "").toLowerCase().replace('nt ', '').trim();
    return p1 === p2 || p1.includes(p2) || p2.includes(p1);
  };

  const filteredInvoices = useMemo(() => {
    let filtered = invoices.filter(i => {
      // Robust check for is_deleted (handle null/undefined)
      if (i.is_deleted === true) return false;

      // Lenient pharmacy matching using helper
      return isPharmacyMatch(i.pharmacy, currentPharmacy);
    });
    
    if (filterType === 'pending') {
      filtered = filtered.filter(i => !i.completed);
    } else if (filterType === 'completed') {
      filtered = filtered.filter(i => i.completed);
    }

    if (searchTerm) {
      const search = removeVietnameseTones(searchTerm.toLowerCase());
      filtered = filtered.filter(i => 
        removeVietnameseTones(i.name.toLowerCase()).includes(search) || 
        (i.note && removeVietnameseTones(i.note.toLowerCase()).includes(search))
      );
    }

    return filtered;
  }, [invoices, currentPharmacy, filterType, searchTerm]);

  const stats = useMemo(() => {
    const current = invoices.filter(i => !i.is_deleted && i.pharmacy === currentPharmacy);
    return {
      total: current.length,
      completed: current.filter(i => i.completed).length,
      pending: current.filter(i => !i.completed).length
    };
  }, [invoices, currentPharmacy]);

  const blacklist = useMemo(() => invoices.filter(i => i.ever_blacklisted), [invoices]);
  const deletedInvoices = useMemo(() => invoices.filter(i => i.is_deleted), [invoices]);

  // Actions
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formName || !formDate) return;

    try {
      if (editingInvoice) {
        const { error } = await supabase
          .from('medx_invoices')
          .update({
            name: formName,
            date: formDate,
            invoice_number: formInvoiceNumber.trim() || null,
            link: formLink,
            note: formNote
          })
          .eq('id', editingInvoice.id);
        if (error) throw error;
      } else {
        // Duplicate check
        if (formInvoiceNumber.trim()) {
          const { data: existing } = await supabase
            .from('medx_invoices')
            .select('id, pharmacy')
            .eq('invoice_number', formInvoiceNumber.trim())
            .limit(1);
          
          if (existing && existing.length > 0) {
            const confirmRes = window.confirm(`⚠️ CẢNH BÁO: Mã hóa đơn "${formInvoiceNumber.trim()}" đã tồn tại trong hệ thống (tại ${existing[0].pharmacy}). Bạn có chắc chắn muốn tiếp tục gửi không?`);
            if (!confirmRes) return;
          }
        }

        const names = formName.split('\n').filter(n => n.trim() !== "");
        const newRecords = names.map(name => ({
          name: name.trim(),
          date: formDate,
          invoice_number: formInvoiceNumber.trim() || null,
          link: formLink,
          note: formNote,
          pharmacy: currentPharmacy,
          completed: false,
          is_deleted: false,
          ever_blacklisted: false
        }));

        const { error } = await supabase.from('medx_invoices').insert(newRecords);
        if (error) throw error;
      }
      
      // Manually fetch after save to ensure UI updates even if realtime is slow (silent update)
      await fetchInvoices(true);
      const namesCount = formName.split('\n').filter(n => n.trim() !== "").length;
      logUserActivity('Hóa Đơn', `Đã ${editingInvoice ? 'cập nhật' : 'thêm mới'} ${namesCount} hóa đơn tại ${currentPharmacy}`);
      
      setIsFormOpen(false);
      setEditingInvoice(null);
      setFormName('');
      setFormLink('');
      setFormNote('');
    } catch (err) {
      console.error('Save error:', err);
    }
  };

  const toggleComplete = async (id: string, currentStatus: boolean) => {
    try {
      // Optimistic Update
      setInvoices(prev => prev.map(inv => 
        inv.id === id ? { ...inv, completed: !currentStatus } : inv
      ));

      const { error } = await supabase
        .from('medx_invoices')
        .update({ completed: !currentStatus })
        .eq('id', id);
      
      if (error) {
        // Rollback
        setInvoices(prev => prev.map(inv => 
          inv.id === id ? { ...inv, completed: currentStatus } : inv
        ));
        console.error('Toggle complete error:', error);
        alert(`Lỗi kết nối: ${error.message}`);
        return;
      }
      logUserActivity('Trạng thái HĐ', `${!currentStatus ? 'Hoàn thành' : 'Mở lại'} hóa đơn #${id.slice(0,5)}...`);
      await fetchInvoices(true);
    } catch (err) {
      console.error('Toggle complete exception:', err);
    }
  };

  const toggleBlacklist = async (invoice: Invoice) => {
    try {
      // Optimistic
      setInvoices(prev => prev.map(inv => 
        inv.id === invoice.id ? { ...inv, ever_blacklisted: !invoice.ever_blacklisted } : inv
      ));

      const { error } = await supabase
        .from('medx_invoices')
        .update({ ever_blacklisted: !invoice.ever_blacklisted })
        .eq('id', invoice.id);
      
      if (error) {
        // Rollback
        setInvoices(prev => prev.map(inv => 
          inv.id === invoice.id ? { ...inv, ever_blacklisted: invoice.ever_blacklisted } : inv
        ));
        console.error('Blacklist error:', error);
        alert(`Lỗi Blacklist: ${error.message}`);
        return;
      }
      await fetchInvoices(true);
    } catch (err) {
      console.error('Blacklist exception:', err);
    }
  };

  const deleteInvoice = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    console.log('Attempting to delete invoice:', id);
    
    try {
      // Optimistic
      setInvoices(prev => prev.map(inv => 
        inv.id === id ? { ...inv, is_deleted: true, deleted_at: new Date().toISOString() } : inv
      ));

      const { error } = await supabase
        .from('medx_invoices')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) {
        // Rollback is tricky here as it disappears, but let's just re-fetch
        await fetchInvoices(true);
        console.error('Delete error:', error);
        alert(`Lỗi khi xóa: ${error.message}`);
        return;
      }
      logUserActivity('Xóa Hóa Đơn', `Đã xóa hóa đơn #${id.slice(0,5)}... vào thùng rác`);
      await fetchInvoices(true);
    } catch (err) {
      console.error('Delete exception:', err);
    }
  };

  const restoreInvoice = async (id: string) => {
    try {
      await supabase
        .from('medx_invoices')
        .update({ is_deleted: false, deleted_at: null })
        .eq('id', id);
      await fetchInvoices(true);
    } catch (err) {
      console.error('Restore error:', err);
    }
  };

  const cleanupCompleted = async () => {
    const listToCleanup = invoices.filter(i => 
      isPharmacyMatch(i.pharmacy, currentPharmacy) && i.completed && !i.is_deleted
    );
    if (listToCleanup.length === 0) {
      alert(`Không có mục nào đã xong để dọn dẹp tại ${currentPharmacy}`);
      return;
    }
    
    // Attempting to delete without confirmation since modals are blocked
    try {
      const ids = listToCleanup.map(i => i.id);
      
      // Optimistic
      setInvoices(prev => prev.filter(inv => !ids.includes(inv.id)));

      const { error } = await supabase
        .from('medx_invoices')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .in('id', ids);
      
      if (error) {
        console.error('Cleanup error:', error);
        alert(`Lỗi Cleanup: ${error.message}`);
        await fetchInvoices(true);
        return;
      }
      await fetchInvoices(true);
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  };

  const exportExcel = () => {
    const data = invoices.filter(i => !i.completed && !i.is_deleted);
    if (!data.length) return;
    
    const excelData = data.map(i => ({
      "Ngày": i.date,
      "Nhà Thuốc": i.pharmacy,
      "Nhà Cung Cấp": i.name,
      "Ghi chú": i.note || "",
      "Link": i.link || ""
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    XLSX.writeFile(wb, `HOA_DON_TONG_HOP_${format(new Date(), 'yyyy_MM_dd')}.xlsx`);
  };

  // Grouping for render
  const groupedInvoices = useMemo(() => {
    const months: { [key: string]: { [key: string]: { [key: string]: Invoice[] } } } = {};
    
    filteredInvoices.forEach(item => {
      try {
        const dateStr = item.date || format(new Date(), 'yyyy-MM-dd');
        const d = parseISO(dateStr);
        if (isNaN(d.getTime())) return; // Skip invalid dates

        const monthKey = format(d, 'MM-yyyy');
        const linkKey = item.link && item.link.trim() !== "" ? item.link : "no_link";

        if (!months[monthKey]) months[monthKey] = {};
        if (!months[monthKey][dateStr]) months[monthKey][dateStr] = {};
        if (!months[monthKey][dateStr][linkKey]) months[monthKey][dateStr][linkKey] = [];
        
        months[monthKey][dateStr][linkKey].push(item);
      } catch (e) {
        console.error("Grouping error for item:", item, e);
      }
    });

    // Sort within each batch: pending first
    Object.keys(months).forEach(m => {
      Object.keys(months[m]).forEach(d => {
        Object.keys(months[m][d]).forEach(l => {
          months[m][d][l].sort((a, b) => {
            if (a.completed && !b.completed) return 1;
            if (!a.completed && b.completed) return -1;
            return 0;
          });
        });
      });
    });

    return months;
  }, [filteredInvoices]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName);

      if (e.key === 'Escape') {
        setIsFormOpen(false);
        setIsBlacklistOpen(false);
        setIsRecycleBinOpen(false);
        setIsAlertOpen(false);
        setIsListModalOpen(null);
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        openAddForm();
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        exportExcel();
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'x') {
        if (!isTyping) {
          e.preventDefault();
          cleanupCompleted();
          return;
        }
      }

      if (!isTyping && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Tìm kiếm"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
        return;
      }

      if (!isTyping && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === '1') {
          e.preventDefault();
          setCurrentPharmacy('NT Tuệ Thiện');
        } else if (e.key === '2') {
          e.preventDefault();
          setCurrentPharmacy('NT Hưng Thịnh');
        } else if (e.key === '3') {
          e.preventDefault();
          setCurrentPharmacy('NT Phúc An');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPharmacy, invoices]); // Re-bind when state changes for actions like cleanup

  const openAddForm = () => {
    setEditingInvoice(null);
    setFormName('');
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormInvoiceNumber('');
    setFormLink('');
    setFormNote('');
    setIsFormOpen(true);
  };

  const openEditForm = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setFormName(invoice.name);
    setFormDate(invoice.date);
    setFormInvoiceNumber(invoice.invoice_number || '');
    setFormLink(invoice.link || '');
    setFormNote(invoice.note || '');
    setIsFormOpen(true);
  };

    const monthOptions = useMemo(() => {
    const options = availableMonths.map(val => {
      const [m, y] = val.split('-');
      return {
        value: val,
        label: `Tháng ${m}/${y}`
      };
    });

    // Sort descending
    options.sort((a, b) => {
      const [ma, ya] = a.value.split('-').map(Number);
      const [mb, yb] = b.value.split('-').map(Number);
      return (yb * 12 + mb) - (ya * 12 + ma);
    });

    options.push({ value: 'all', label: 'Tất cả thời gian' });
    return options;
  }, [availableMonths]);

  if (isInitialLoading) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#020617]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400 animate-pulse">Vui lòng chờ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative font-sans text-white/90 overflow-x-hidden pb-32 bg-[#020617] selection:bg-blue-500/30">
      {/* Ultra-Stable Background Gradients */}
      <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div 
          className={cn(
            "absolute transition-all duration-1000 blur-[120px] rounded-full opacity-30",
            currentPharmacy === 'NT Tuệ Thiện' ? "top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-blue-600" :
            currentPharmacy === 'NT Hưng Thịnh' ? "top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-emerald-600" :
            "top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-rose-600"
          )}
        />
        <div 
          className={cn(
            "absolute transition-all duration-1000 blur-[120px] rounded-full opacity-20",
            currentPharmacy === 'NT Tuệ Thiện' ? "bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-indigo-600" :
            currentPharmacy === 'NT Hưng Thịnh' ? "bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-teal-600" :
            "bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-fuchsia-600"
          )}
        />
      </div>

      <div className={cn(
        "transition-all duration-500",
        isAnyModalOpen ? "opacity-0 blur-sm pointer-events-none -translate-y-4" : "opacity-100 blur-0 pointer-events-auto translate-y-0"
      )}>
        <nav className="relative py-4 px-4 sm:py-6 sm:px-6 backdrop-blur-md bg-black/40 border-b border-white/5">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
            <div className="flex items-center gap-4">
              {onClose && (
                <button 
                  onClick={onClose}
                  className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.1)] shrink-0">
                <FileText className="text-blue-400" size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[18px] font-black uppercase tracking-[0.3em] text-white">HÓA ĐƠN</h1>
                </div>
                <p className="text-[11px] text-white/40 font-bold uppercase tracking-widest mt-0.5">{currentPharmacy.replace('NT ', '')}</p>
              </div>
            </div>

            <div className="w-full md:w-auto overflow-x-auto no-scrollbar pb-1">
              <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-xl w-max">
              {['NT Tuệ Thiện', 'NT Hưng Thịnh', 'NT Phúc An'].map((name, idx) => (
                <button
                  key={name}
                  onClick={() => setCurrentPharmacy(name)}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] transition-all relative group overflow-hidden shrink-0",
                    currentPharmacy === name 
                      ? "text-black" 
                      : "text-white/40 hover:text-white/80 hover:bg-white/5"
                  )}
                >
                  {currentPharmacy === name && (
                    <motion.div 
                      layoutId="huoctsiActiveTab"
                      transition={{ type: "tween", duration: 0.15 }}
                      className="absolute inset-0 bg-white shadow-[0_0_25px_rgba(255,255,255,0.2)] z-0" 
                    />
                  )}
                  <span className="relative z-10">
                    {name.replace('NT ', '')}
                    <span className="hidden md:inline-block ml-1 opacity-40 text-[9px] font-normal tracking-normal group-hover:opacity-60">[{idx + 1}]</span>
                  </span>
                </button>
              ))}
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
          {/* Stats Row - Unified with background to prevent leaping */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
          {[
            { label: 'Tổng Hóa Đơn', val: stats.total, color: 'text-white', icon: <FileText size={18} />, bg: 'bg-white/5' },
            { label: 'Đã Hoàn Thành', val: stats.completed, color: 'text-emerald-400', icon: <Check size={18} />, bg: 'bg-emerald-500/5' },
            { label: 'Đang Chờ Xử Lý', val: stats.pending, color: 'text-amber-400', icon: <Clock size={18} />, bg: 'bg-amber-500/5' }
          ].map(s => (
            <div 
              key={s.label}
              className={cn(
                "p-6 sm:p-8 rounded-3xl sm:rounded-[2rem] border border-white/10 backdrop-blur-sm transition-all hover:bg-white/10",
                s.bg
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-white/30">{s.icon}</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{s.label}</span>
              </div>
              <p className={cn("text-3xl sm:text-4xl font-jakarta font-black transition-all", s.color)}>{s.val}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 mb-12 sm:mb-16">
          <div className="relative flex-1 group">
            <Search className="absolute left-5 sm:left-6 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-blue-400 transition-colors" size={20} />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên, ghi chú... (F)" 
              className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] sm:rounded-[2rem] py-4 sm:py-5 px-14 sm:px-16 text-[14px] sm:text-[15px] focus:outline-none focus:border-blue-500/40 focus:bg-white/10 transition-all font-medium placeholder:text-white/20"
            />
          </div>

              <div className="w-full lg:w-auto overflow-x-auto no-scrollbar pb-1">
            <div className="flex items-center gap-3 w-max">
              <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-md">
                <select 
                  value={monthFilter}
                  onChange={(e) => {
                    setMonthFilter(e.target.value);
                    setLoading(true);
                  }}
                  className="bg-transparent text-[11px] font-bold uppercase tracking-widest px-3 focus:outline-none cursor-pointer text-white/60 hover:text-white"
                >
                  {monthOptions.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-[#020617] text-white">{opt.label}</option>
                  ))}
                </select>
                <div className="w-px h-4 bg-white/10 my-auto mx-1" />
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'pending', label: 'Chờ' },
                  { id: 'completed', label: 'Xong' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilterType(f.id as any)}
                    className={cn(
                      "px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all shrink-0",
                      filterType === f.id ? "bg-white/10 text-white shadow-inner" : "text-white/30 hover:text-white"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button 
                onClick={openAddForm}
                className="bg-blue-600 hover:bg-blue-500 text-white h-[44px] sm:h-full px-6 sm:px-8 rounded-2xl text-[11px] sm:text-[12px] font-black uppercase tracking-widest flex items-center gap-2 sm:gap-3 shadow-xl shadow-blue-600/20 active:scale-95 transition-all shrink-0"
              >
                <Plus size={20} /> Thêm Mới <span className="hidden xl:inline opacity-50">(F2)</span>
              </button>
            </div>
          </div>
        </div>

        <div className="relative grid">
          <AnimatePresence initial={false}>
            <motion.div 
              key={`${currentPharmacy}-${filterType}-${searchTerm}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="col-start-1 row-start-1 space-y-16 w-full will-change-opacity"
            >
              {filteredInvoices.length === 0 ? (
              <div className="py-32 flex flex-col items-center justify-center text-center opacity-40">
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                  <Search size={40} />
                </div>
                <h3 className="text-xl font-bold uppercase tracking-widest mb-2">Danh sách trống</h3>
                <p className="text-[12px] max-w-sm font-medium">Không tìm thấy hóa đơn nào phù hợp với bộ lọc hiện tại.</p>
              </div>
            ) : (
              Object.keys(groupedInvoices).map(monthKey => (
                <div key={monthKey} className="month-block">
                  <div className="timeline-month-header flex items-center justify-between mb-8">
                    <div className="flex items-center gap-2">
                      <Calendar className="text-2xl drop-shadow-md" />
                      <h2 className="text-[20px] font-jakarta font-extrabold text-white tracking-widest drop-shadow-md">{monthKey}</h2>
                    </div>
                  </div>
                  
                  {Object.keys(groupedInvoices[monthKey]).map(dateStr => (
                    <div key={dateStr} className="mb-12">
                      <div className="sticky top-[80px] z-10 py-3 flex items-center justify-between mb-4 px-6 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-xl transition-all hover:bg-white/10">
                        <div className="flex items-center gap-6">
                          <div className="flex flex-col items-center justify-center min-w-[50px]">
                            <span className="text-[10px] font-black text-blue-400/60 uppercase tracking-widest mb-0.5">Ngày</span>
                            <span className="text-3xl font-jakarta font-black leading-none text-white">{format(parseISO(dateStr), 'dd')}</span>
                          </div>
                          <div className="h-8 w-[1px] bg-white/10" />
                          <div>
                            <p className="text-[14px] font-black text-white/90 uppercase tracking-widest">{format(parseISO(dateStr), 'EEEE', { locale: undefined })}</p>
                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-tight">{format(parseISO(dateStr), 'dd/MM/yyyy')}</p>
                          </div>
                        </div>
                      </div>

                      {Object.keys(groupedInvoices[monthKey][dateStr]).map(linkKey => {
                        const items = groupedInvoices[monthKey][dateStr][linkKey];
                        const isNoLink = linkKey === "no_link";
                        const completedCount = items.filter(it => it.completed).length;

                        return (
                          <div key={linkKey} className="link-batch-box ml-2">
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
                              <div className="flex items-center gap-2">
                                {isNoLink ? <FileText className="opacity-80" size={20} /> : <Clock className="opacity-80" size={20} />}
                                <span className={cn(
                                  "text-[11px] font-bold uppercase tracking-widest",
                                  isNoLink ? "text-white/60" : "text-blue-300 drop-shadow-md"
                                )}>
                                  {isNoLink ? 'Hóa đơn lẻ' : 'DANH SÁCH '} 
                                  <span className="ml-2 bg-white/10 text-white/80 px-2 py-0.5 rounded-full text-[10px] border border-white/5">
                                    Hóa đơn: {completedCount}/{items.length}
                                  </span>
                                </span>
                              </div>
                              {!isNoLink && (
                                <a 
                                  href={linkKey} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="px-3.5 py-1.5 bg-blue-500/20 hover:bg-blue-500/40 border border-blue-400/30 text-blue-100 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all shadow-lg flex items-center gap-1 backdrop-blur-md"
                                >
                                  Xem hóa đơn <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                            
                            <motion.div 
                              variants={containerVariants}
                              initial="hidden"
                              animate="show"
                              className="space-y-1"
                            >
                              {items.map(item => (
                                <motion.div 
                                  key={item.id} 
                                  variants={itemVariants}
                                  id={`invoice-card-${item.id}`}
                                  className={cn(
                                    "invoice-card group transition-all duration-300",
                                    item.ever_blacklisted && "border-l-[4px] border-l-red-500 bg-red-500/5"
                                  )}
                                >
                                  <div className="invoice-content-wrapper flex items-start gap-4 p-4 hover:bg-white/5 rounded-2xl">
                                    <button 
                                      id={`btn-toggle-complete-${item.id}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleComplete(item.id, item.completed);
                                      }}
                                      className={cn(
                                        "w-10 h-10 min-w-[40px] rounded-full border flex items-center justify-center transition-all mt-0.5",
                                        item.completed ? "bg-green-500/80 border-green-400 text-white shadow-lg" : "bg-white/5 border-white/20 text-white/30 hover:border-white/50 hover:bg-white/10"
                                      )}
                                    >
                                      {item.completed && <Check size={20} />}
                                    </button>
                                    
                                    <div className="flex-1 min-w-0">
                                      <span 
                                        id={`invoice-name-${item.id}`}
                                        onClick={() => openEditForm(item)}
                                        className={cn(
                                          "invoice-name text-lg font-semibold block cursor-pointer transition-all",
                                          item.completed ? "line-through opacity-40 hover:opacity-100" : "text-white"
                                        )}
                                      >
                                        {item.name}
                                      </span>
                                      {item.invoice_number && (
                                        <p className="text-[10px] font-black text-blue-400/60 uppercase tracking-widest mt-1">
                                          Số HĐ: {item.invoice_number}
                                        </p>
                                      )}
                                      {item.note && (
                                        <p id={`invoice-note-${item.id}`} className="text-[13px] text-white/70 font-medium mt-2.5 bg-white/5 px-3 py-2 rounded-lg border border-white/10 inline-block w-full backdrop-blur-sm">
                                          <span className="mr-2 opacity-70">📝</span>{item.note}
                                        </p>
                                      )}
                                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-2">{item.pharmacy}</p>
                                    </div>

                                    <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                      <button 
                                        id={`btn-blacklist-${item.id}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleBlacklist(item);
                                        }}
                                        className="p-2 bg-white/5 border border-white/10 text-white/70 rounded-xl hover:bg-white/10 transition-all"
                                        title="Danh sách đen"
                                      >
                                        <Ban size={18} className={item.ever_blacklisted ? "text-red-500" : ""} />
                                      </button>
                                      <button 
                                        id={`btn-delete-${item.id}`}
                                        onClick={(e) => deleteInvoice(item.id, e)}
                                        className="p-2 bg-red-500/10 border border-white/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-all"
                                        title="Xóa"
                                      >
                                        <Trash2 size={18} />
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                            </motion.div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))
            )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Floating Action Buttons */}
      <div className={cn(
        "fixed bottom-10 right-10 flex flex-col gap-5 items-end z-[9000] transition-all duration-500",
        isAnyModalOpen ? "opacity-0 translate-x-12 pointer-events-none" : "opacity-100 translate-x-0 pointer-events-auto"
      )}>
        {[
          { icon: <Plus size={24} />, label: 'Thêm mới', hint: '(F2)', onClick: openAddForm, color: 'bg-blue-600' },
          { icon: <Search size={22} />, label: 'Làm mới', hint: '(F5)', onClick: () => fetchInvoices(false), color: 'bg-white/10' },
          { icon: <Trash2 size={22} />, label: 'Dọn dẹp', hint: '(Ctrl+X)', onClick: cleanupCompleted, color: 'bg-white/10' },
          { icon: <Ban size={22} />, label: 'Danh Sách Đen', onClick: () => setIsBlacklistOpen(true), badge: blacklist.length, color: 'bg-white/10' },
          { icon: <Download size={22} />, label: 'Xuất Excel', onClick: exportExcel, color: 'bg-white/10' },
          { icon: <Trash size={22} />, label: 'Thùng Rác', onClick: () => setIsRecycleBinOpen(true), badge: deletedInvoices.length, color: 'bg-white/10' }
        ].map((btn, idx) => (
          <div key={idx} className="group relative flex items-center">
            <span className="absolute right-full mr-6 px-4 py-2 bg-black/80 backdrop-blur-xl border border-white/10 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-xl opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0 whitespace-nowrap pointer-events-none shadow-2xl">
              {btn.label} <span className="text-white/40 ml-2">{btn.hint}</span>
            </span>
            <button 
              onClick={btn.onClick}
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl transition-all hover:scale-110 active:scale-95 group relative",
                btn.color,
                idx === 1 && loading && "animate-spin text-blue-400"
              )}
            >
              {btn.icon === <Search size={22} /> && loading ? <RotateCw size={24} className="animate-spin" /> : btn.icon}
              {btn.badge !== undefined && btn.badge > 0 && (
                <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] w-6 h-6 flex items-center justify-center rounded-full font-black border-2 border-[#020617] shadow-lg">
                  {btn.badge}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>

      </div>

      <AnimatePresence>
        {/* Overdue Alert Modal */}
        {isAlertOpen && (
          <Modal close={() => setIsAlertOpen(false)} variant="amber">
            <div className="text-center">
              <AlertTriangle className="mx-auto text-amber-500 mb-4" size={64} />
              <h3 className="text-2xl font-jakarta font-bold text-white uppercase tracking-wider">Hóa Đơn Quá Hạn</h3>
              <p className="text-white/60 text-[14px] mt-2 mb-6">Bạn có hóa đơn chưa hoàn thành từ 3 ngày trước!</p>
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-3 mb-8 px-2 custom-scrollbar">
              {invoices
                .filter(i => !i.completed && !i.is_deleted && isBefore(parseISO(i.date), subDays(startOfDay(new Date()), 3)))
                .map(i => (
                  <div key={i.id} className="p-3.5 bg-red-500/10 rounded-xl flex justify-between items-center border border-red-500/20">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white text-[15px] truncate">{i.name}</p>
                      <p className="text-[10px] font-bold text-amber-400 mt-1 tracking-wider uppercase">{i.pharmacy} • {i.date}</p>
                    </div>
                    <span className="text-red-400 font-bold text-[10px] ml-3 shrink-0 bg-red-500/20 px-2 py-1 rounded border border-red-500/30">TRỄ!</span>
                  </div>
                ))}
            </div>
            <button 
              onClick={() => setIsAlertOpen(false)}
              className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-xl transition-all text-[14px] tracking-widest"
            >
              Đã Hiểu (ESC)
            </button>
          </Modal>
        )}

        {/* Blacklist Modal */}
        {isBlacklistOpen && (
          <Modal close={() => setIsBlacklistOpen(false)} title="Danh Sách Đen 🚫">
            <div className="space-y-3">
              {blacklist.length === 0 ? (
                <p className="text-center py-10 text-white/40 font-medium">Trống ✨</p>
              ) : (
                blacklist.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                    <div className="flex-1">
                      <p className="font-bold text-red-400 text-[16px] drop-shadow-md">{item.name}</p>
                      <p className="text-[11px] text-white/50 mt-1 uppercase tracking-wider">{item.date} • {item.pharmacy}</p>
                    </div>
                    <button 
                      onClick={() => toggleBlacklist(item)} 
                      className="p-2.5 bg-white/10 text-white/80 rounded-lg hover:bg-white/20 transition-colors"
                    >
                      <RotateCw size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Modal>
        )}

        {/* Recycle Bin Modal */}
        {isRecycleBinOpen && (
          <Modal close={() => setIsRecycleBinOpen(false)} title="Thùng Rác 🗑️">
            <div className="space-y-3 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
              {deletedInvoices.length === 0 ? (
                <p className="text-center py-10 text-white/40 font-medium">Trống ✨</p>
              ) : (
                deletedInvoices.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                    <div className="flex flex-col">
                      <span className="font-bold text-white text-[15px] drop-shadow-sm">{item.name}</span>
                      <span className="text-[11px] text-white/50 mt-1 uppercase tracking-widest">{item.date} • {item.pharmacy}</span>
                    </div>
                    <button 
                      onClick={() => restoreInvoice(item.id)}
                      className="bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg font-bold text-[11px] hover:bg-white/20 transition-all uppercase tracking-widest"
                    >
                      Phục hồi
                    </button>
                  </div>
                ))
              )}
            </div>
          </Modal>
        )}

        {/* List Modal (Total, Completed, Pending) */}
        {isListModalOpen && (
          <Modal 
            close={() => setIsListModalOpen(null)} 
            title={
              isListModalOpen === 'all' ? 'Tổng Hóa Đơn' : 
              isListModalOpen === 'completed' ? 'Đã Xong' : 'Còn Lại'
            }
          >
            <div className="space-y-3 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
              {(isListModalOpen === 'all' ? invoices.filter(i => !i.is_deleted && i.pharmacy === currentPharmacy) :
                isListModalOpen === 'completed' ? invoices.filter(i => !i.is_deleted && i.pharmacy === currentPharmacy && i.completed) :
                invoices.filter(i => !i.is_deleted && i.pharmacy === currentPharmacy && !i.completed))
                .length === 0 ? (
                <p className="text-center py-10 text-white/40 font-medium uppercase text-[12px]">Trống ✨</p>
              ) : (
                (isListModalOpen === 'all' ? invoices.filter(i => !i.is_deleted && i.pharmacy === currentPharmacy) :
                 isListModalOpen === 'completed' ? invoices.filter(i => !i.is_deleted && i.pharmacy === currentPharmacy && i.completed) :
                 invoices.filter(i => !i.is_deleted && i.pharmacy === currentPharmacy && !i.completed))
                .map(item => (
                  <div key={item.id} className="flex flex-col p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 break-words">
                        {item.link ? (
                          <a href={item.link} target="_blank" rel="noreferrer" className="font-bold text-blue-300 hover:text-blue-100 hover:underline text-[16px]">
                            {item.name} ↗
                          </a>
                        ) : (
                          <span className="font-bold text-white text-[16px]">{item.name}</span>
                        )}
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold border px-2 py-1 rounded uppercase tracking-widest shrink-0 mt-0.5",
                        item.completed ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-orange-400 bg-orange-500/10 border-orange-500/20"
                      )}>
                        {item.completed ? '✓ Đã xong' : '⏳ Còn lại'}
                      </span>
                    </div>
                    <div className="flex items-center mt-2 opacity-70">
                      <span className="text-[12px] font-medium text-white flex items-center gap-1 uppercase tracking-wider">📅 {item.date}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Modal>
        )}

        {/* Add/Edit Form Modal */}
        {isFormOpen && (
          <Modal close={() => setIsFormOpen(false)} title={editingInvoice ? "Sửa Hóa Đơn" : "Thêm Hóa Đơn Mới"}>
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase mb-2 tracking-widest">Mã hóa đơn (Check trùng)</label>
                <input 
                  type="text" 
                  value={formInvoiceNumber}
                  onChange={(e) => setFormInvoiceNumber(e.target.value)}
                  className="w-full p-4 rounded-xl glass-input font-medium text-[15px]" 
                  placeholder="X-XXXXXX"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase mb-2 tracking-widest">Nhà cung cấp (Mỗi dòng 1 nhà)</label>
                <textarea 
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  rows={3} 
                  className="w-full p-4 rounded-xl glass-input font-medium text-[15px]"
                  placeholder="Nhập tên nhà cung cấp..."
                ></textarea>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase mb-2 tracking-widest">Ngày hóa đơn</label>
                <input 
                  type="date" 
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full p-4 rounded-xl glass-input font-medium text-[15px]" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase mb-2 tracking-widest">Liên kết</label>
                <input 
                  type="url" 
                  value={formLink}
                  onChange={(e) => setFormLink(e.target.value)}
                  placeholder="https://..." 
                  className="w-full p-4 rounded-xl glass-input font-medium text-[14px]" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase mb-2 tracking-widest">Ghi chú</label>
                <textarea 
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  rows={2} 
                  placeholder="Tùy chọn..." 
                  className="w-full p-4 rounded-xl glass-input font-medium text-[14px]"
                ></textarea>
              </div>
              <div className="flex gap-3 pt-4 border-t border-white/10">
                <button 
                  type="button"
                  onClick={() => setIsFormOpen(false)} 
                  className="flex-1 py-3.5 font-bold text-white/50 text-[13px] hover:bg-white/10 rounded-xl transition-colors"
                >
                  Hủy Bỏ
                </button>
                <button 
                  type="submit"
                  className="flex-[2] py-3.5 bg-white/15 backdrop-blur-md text-white font-bold rounded-xl shadow-lg text-[13px] hover:scale-105 active:scale-95 transition-all border border-white/20"
                >
                  {editingInvoice ? 'Cập Nhật' : 'Lưu Dữ Liệu'}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-components for cleaner render
function Modal({ children, close, title, variant = "default" }: { children: React.ReactNode, close: () => void, title?: string, variant?: 'default' | 'amber' }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-[10000] flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className={cn(
          "glass-modal w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 border-t-[4px] relative bg-[#0a0a0a]/80 backdrop-blur-3xl shadow-3xl custom-scrollbar",
          variant === 'amber' ? "border-amber-500" : "border-blue-400"
        )}
      >
        {title && (
          <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
            <h3 className="text-xl font-jakarta font-bold text-white uppercase tracking-widest drop-shadow-md">{title}</h3>
            <button onClick={close} className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full text-white/50 hover:bg-white/20 transition-colors">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </motion.div>
    </motion.div>
  );
}
