import { useState, useEffect, useMemo } from 'react';
import { 
  db,
  auth,
  signInAnonymously,
  onAuthStateChanged
} from './firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  limit,
  doc, 
  writeBatch
} from 'firebase/firestore';
import { format, isToday, isYesterday } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Plus, 
  Search, 
  LayoutGrid, 
  List as ListIcon,
  Loader2,
  X,
  Package,
  User as UserIcon,
  Trash2,
  AlertCircle,
  RotateCw,
  Zap,
  Scan,
  HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Toaster, toast } from 'sonner';
import { AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

// New Components & Types
import { Order, PharmacyName, PHARMACIES } from './types';
import { OrderCard } from './components/OrderCard';
import { UploadForm } from './components/UploadForm';
import { GridSkeleton } from './components/SkeletonLoader';
import { HelpGuide, HelpTrigger } from './components/HelpManual';
import { PushNotificationManager } from './components/PushNotificationManager';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedPharmacy, setSelectedPharmacy] = useState<PharmacyName>('Hưng Thịnh');
  const [userName, setUserName] = useState<string | null>(null);
  const [isUserPromptOpen, setIsUserPromptOpen] = useState(false);
  const [tempUserName, setTempUserName] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isRetryingAuth, setIsRetryingAuth] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const handleAuthRetry = async () => {
    setIsRetryingAuth(true);
    try {
      await signInAnonymously(auth);
      setAuthError(null);
      toast.success("Xác thực thành công!");
    } catch (err: any) {
      console.error("Retry Auth Error:", err);
      if (err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed') {
        setAuthError('ANONYMOUS_DISABLED');
      } else {
        toast.error(`Lỗi xác thực: ${err.message}`);
      }
    } finally {
      setIsRetryingAuth(false);
    }
  };

  // Load User Name & Handle Auth
  useEffect(() => {
    // Auth logic
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch(err => {
          console.error("Anonymous Auth Error:", err);
          if (err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed') {
            setAuthError('ANONYMOUS_DISABLED');
          }
        });
      } else {
        setAuthError(null);
      }
    });

    const savedName = localStorage.getItem('order_tracker_user_name');
    if (savedName) {
      setUserName(savedName);
    } else {
      setIsUserPromptOpen(true);
    }
    
    // Auto-switch view mode based on screen size
    const handleResize = () => {
      if (window.innerWidth < 640) {
        setViewMode('list');
      } else {
        setViewMode('grid');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      unsubAuth();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleSaveUserName = () => {
    if (tempUserName.trim()) {
      localStorage.setItem('order_tracker_user_name', tempUserName.trim());
      setUserName(tempUserName.trim());
      setIsUserPromptOpen(false);
      toast.success(`Chào mừng ${tempUserName.trim()}!`);
    } else {
      toast.error("Vui lòng nhập tên của bạn.");
    }
  };

  const handleDeleteAllCompleted = async () => {
    const completedOrders = orders.filter(o => o.pharmacy === selectedPharmacy && o.status === 'completed');
    if (completedOrders.length === 0) return;

    if (!window.confirm(`Bạn có chắc chắn muốn xóa tất cả ${completedOrders.length} đơn hàng đã hoàn thành tại nhà thuốc ${selectedPharmacy}?`)) return;

    const batch = writeBatch(db);
    completedOrders.forEach(order => {
      batch.delete(doc(db, 'orders', order.id));
    });

    try {
      await batch.commit();
      toast.success(`Đã xóa ${completedOrders.length} đơn hàng của ${selectedPharmacy}.`);
    } catch (error) {
      console.error(error);
      toast.error("Lỗi khi xóa hàng loạt.");
    }
  };

  // Listen for NEW orders specifically for notifications
  useEffect(() => {
    // We only want to notify about orders added AFTER the app started
    const startTime = new Date();
    const q = query(
      collection(db, 'orders'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          // Verify it's really a new order (timestamp > app startup)
          if (data.timestamp?.toDate() > startTime) {
            // Even if permission is not granted, we can show a toast
            toast.info(`Đơn mới: ${data.orderName}`, {
              description: `Người gửi: ${data.senderName} (${data.pharmacy})`,
              duration: 5000
            });

            // Browser Notification
            if (Notification.permission === 'granted') {
              new Notification("Có đơn hàng mới!", {
                body: `${data.senderName} vừa tải lên đơn "${data.orderName}" cho ${data.pharmacy}`,
                icon: "/favicon.ico"
              });
            }
          }
        }
      });
    });

    return () => unsubscribe();
  }, []);

  // Fetch Orders - Real-time sync
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      toast.error("Kết nối dữ liệu thất bại. Kiểm tra internet.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = order.orderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           order.senderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (order.note || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPharmacy = order.pharmacy === selectedPharmacy;
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      return matchesSearch && matchesPharmacy && matchesStatus;
    });
  }, [orders, searchQuery, selectedPharmacy, statusFilter]);

  const stats = useMemo(() => {
    const pharmacyOrders = orders.filter(o => o.pharmacy === selectedPharmacy);
    return {
      total: pharmacyOrders.length,
      pending: pharmacyOrders.filter(o => o.status !== 'completed').length,
      completed: pharmacyOrders.filter(o => o.status === 'completed').length
    };
  }, [orders, selectedPharmacy]);

  // Group orders by date for easier navigation
  const groupedOrders = useMemo(() => {
    const groups: { [date: string]: Order[] } = {};
    filteredOrders.forEach(order => {
      if (!order.timestamp) return;
      const date = format(order.timestamp.toDate(), 'yyyy-MM-dd');
      if (!groups[date]) groups[date] = [];
      groups[date].push(order);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredOrders]);

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Hôm nay';
    if (isYesterday(date)) return 'Hôm qua';
    return format(date, 'eeee, dd MMMM yyyy', { locale: vi });
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <Toaster position="top-center" expand={false} richColors />
      
      <HelpGuide isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      
      {/* Firebase Config Warning Banner */}
      {authError === 'ANONYMOUS_DISABLED' && (
        <div className="bg-red-50 border-b border-red-100 p-4 sticky top-0 z-[100] animate-in slide-in-from-top duration-500">
           <div className="mx-auto max-w-7xl flex flex-col sm:flex-row gap-4 sm:items-center">
              <div className="flex gap-4 items-start flex-1">
                <div className="p-2 bg-red-100 rounded-xl text-red-600 shrink-0">
                   <AlertCircle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                   <h3 className="text-sm font-black text-red-900 uppercase tracking-tight">Vẫn chưa nhận được quyền truy cập</h3>
                   <p className="mt-1 text-xs text-red-700 font-medium leading-relaxed">
                     Hệ thống báo rằng tính năng <strong>Anonymous</strong> vẫn chưa hoạt động. Nếu bạn đã bật, vui lòng nhấn nút <strong>"Thử lại"</strong> hoặc <strong>làm mới (F5)</strong> trang web.
                   </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                 <Button 
                   onClick={handleAuthRetry}
                   disabled={isRetryingAuth}
                   className="h-10 px-6 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest gap-2"
                 >
                   {isRetryingAuth ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                   Thử lại ngay
                 </Button>
                 <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-red-900"
                    onClick={() => setAuthError(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
              </div>
           </div>
        </div>
      )}

      {/* Universal Header - Mobile & Desktop Hybrid */}
      <header className="sticky top-0 z-40 w-full border-b bg-white/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex h-14 sm:h-16 items-center justify-between gap-3 sm:gap-4">
            {/* Logo & Branding */}
            <div className="flex items-center gap-2 shrink-0">
               <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-lg shadow-zinc-200">
                  <Package className="h-4 w-4 sm:h-5 sm:w-5" />
               </div>
            </div>

            {/* Central Search Bar */}
            <div className="flex-1 max-w-md">
              <div className="relative group">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-950 transition-colors" />
                <Input 
                  placeholder="Tìm đơn, NCC, ghi chú..." 
                  className="w-full h-9 sm:h-10 rounded-xl sm:rounded-2xl bg-zinc-100/50 border-none pl-8 sm:pl-9 pr-8 focus-visible:ring-zinc-950 focus-visible:bg-white transition-all text-xs sm:text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-zinc-200 flex items-center justify-center hover:bg-zinc-300 transition-colors"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-3 w-3 text-zinc-600" />
                  </button>
                )}
              </div>
            </div>

            {/* User Profile & View Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <PushNotificationManager />
              
              <Button 
                variant="outline" 
                size="sm" 
                className="hidden sm:flex h-9 rounded-xl border-zinc-200 hover:bg-zinc-100 px-3 gap-2 bg-white"
                onClick={() => setIsHelpOpen(true)}
              >
                <HelpCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">HƯỚNG DẪN</span>
                <div className="h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                   <span className="text-[10px] font-black italic">!</span>
                </div>
              </Button>

              <Button 
                variant="ghost" 
                size="sm" 
                className="hidden sm:flex h-9 rounded-xl border border-transparent hover:border-zinc-200 hover:bg-zinc-100 px-3 gap-2"
                onClick={() => setIsUserPromptOpen(true)}
              >
                <div className="h-5 w-5 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-black uppercase">
                  {userName ? userName.charAt(0) : '?'}
                </div>
                <span className="text-xs font-bold text-zinc-600 truncate max-w-[80px]">{userName || 'Hồ sơ'}</span>
              </Button>

              <div className="hidden md:flex h-9 items-center gap-1 rounded-xl bg-zinc-100 p-1">
                <Button 
                   variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                   size="icon" 
                   className={cn("h-7 w-7 rounded-lg transition-all", viewMode === 'grid' && "bg-white shadow-sm")}
                   onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button 
                   variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                   size="icon" 
                   className={cn("h-7 w-7 rounded-lg transition-all", viewMode === 'list' && "bg-white shadow-sm")}
                   onClick={() => setViewMode('list')}
                >
                  <ListIcon className="h-4 w-4" />
                </Button>
              </div>

              {/* Mobile Profile Icon */}
              <button 
                className="flex sm:hidden h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600"
                onClick={() => setIsUserPromptOpen(true)}
              >
                <UserIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-3 border-t border-zinc-100 py-2">
               <div className="flex-1">
                 <div className="p-1.5 rounded-xl bg-zinc-100 flex items-center gap-1 shrink-0 overflow-x-auto no-scrollbar">
                   {PHARMACIES.map((p) => (
                     <button
                       key={p.name}
                       onClick={() => setSelectedPharmacy(p.name)}
                       className={cn(
                         "relative h-7 sm:h-8 px-3 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap overflow-hidden group",
                         selectedPharmacy === p.name 
                           ? "text-white shadow-md shadow-zinc-200" 
                           : "text-zinc-500 hover:text-zinc-900 bg-transparent hover:bg-zinc-200"
                       )}
                     >
                       {selectedPharmacy === p.name && (
                         <div className={cn("absolute inset-0 z-0", p.bg)} />
                       )}
                       <span className="relative z-10">{p.name}</span>
                     </button>
                   ))}
                 </div>
               </div>

               {/* Status Filter */}
               <div className="flex items-center gap-3 self-start sm:self-auto w-full sm:w-auto">
                 <div className="flex h-8 sm:h-9 items-center gap-1 bg-zinc-100/80 p-1 rounded-xl sm:rounded-2xl flex-1 sm:flex-initial">
                   {(['all', 'pending', 'completed'] as const).map((status) => (
                     <button
                       key={status}
                       onClick={() => setStatusFilter(status)}
                       className={cn(
                         "flex-1 sm:flex-none h-6 sm:h-7 px-3 sm:px-4 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all",
                         statusFilter === status 
                           ? "bg-white text-zinc-950 shadow-sm" 
                           : "text-zinc-400 hover:text-zinc-600"
                       )}
                     >
                       {status === 'all' ? 'Tất cả' : status === 'pending' ? 'Chờ' : 'Xong'}
                     </button>
                   ))}
                 </div>
                 <HelpTrigger 
                   title="Bộ lọc trạng thái" 
                   description="Lọc đơn hàng đang chờ xử lý (Chờ) hoặc đã hoàn tất nhập kho (Xong)." 
                 />
               </div>
            </div>
         </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 pb-32">
        {/* Content State Handling */}
        {loading ? (
          <GridSkeleton viewMode={viewMode} />
        ) : groupedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-6 h-20 w-20 rounded-3xl bg-zinc-100 flex items-center justify-center text-zinc-300">
              <Package className="h-10 w-10" />
            </div>
            <h4 className="text-lg font-black text-zinc-900">Không tìm thấy đơn hàng</h4>
            <p className="mt-1 text-sm text-zinc-500 max-w-xs mx-auto">
              Không có dữ liệu phù hợp với bộ lọc hiện tại. Thử thay đổi từ khóa hoặc nhà thuốc khác.
            </p>
            <Button 
               className="mt-6 rounded-2xl h-11 px-8 bg-zinc-950 font-bold"
               onClick={() => setIsUploadOpen(true)}
            >
               Thêm đơn ngay
            </Button>
          </div>
        ) : (
          <div className="space-y-12">
            {groupedOrders.map(([date, dateOrders]) => (
              <section key={date} className="space-y-6">
                <div className="flex items-center gap-3 sticky top-36 z-30 bg-zinc-50 py-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">
                    {formatDateHeader(date)}
                  </h3>
                  <div className="h-px flex-1 bg-zinc-200" />
                  <span className="text-[10px] font-black text-zinc-300 bg-white px-2 py-0.5 rounded-full border border-zinc-100 uppercase">
                    {dateOrders.length} đơn
                  </span>
                </div>
                
                <div className={cn(
                  viewMode === 'grid' 
                    ? "grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" 
                    : "flex flex-col gap-3 sm:gap-4"
                )}>
                  <AnimatePresence mode="popLayout">
                    {dateOrders.map((order) => (
                      <OrderCard key={order.id} order={order} viewMode={viewMode} />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Floating Action Menu - Compact & Aesthetic Pill */}
      <div className="fixed bottom-6 sm:bottom-8 inset-x-0 z-50 flex justify-center pointer-events-none">
         <div className="pointer-events-auto">
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
               <DialogTrigger
                 render={(props) => (
                  <Button 
                    {...props} 
                    className="h-14 pl-2 pr-7 rounded-full bg-zinc-950 text-white hover:bg-black font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-4 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border border-white/10 group transition-all active:scale-95 ring-offset-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-950"
                  >
                     <div className="h-10 w-10 rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center shadow-inner group-hover:rotate-90 transition-transform duration-500 ease-out">
                        <Plus className="h-5 w-5 stroke-[4]" />
                     </div>
                     <span className="drop-shadow-sm">Tạo đơn mới</span>
                  </Button>
                 )}
               />
               <DialogContent className="sm:max-w-xl h-full sm:h-[90vh] flex flex-col p-0 overflow-hidden !rounded-none sm:!rounded-3xl border-none">
                  <div className="p-6 pb-2">
                     <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">NHẬP TÊN NHÀ CUNG CẤP</DialogTitle>
                     </DialogHeader>
                  </div>
                  <div className="flex-1 overflow-hidden p-6 pt-2">
                     <UploadForm 
                        defaultPharmacy={selectedPharmacy} 
                        userName={userName || 'Người dùng'} 
                        onSuccess={() => setIsUploadOpen(false)} 
                     />
                  </div>
               </DialogContent>
            </Dialog>
         </div>
      </div>

      {/* User Name Setup Modal */}
      <Dialog open={isUserPromptOpen} onOpenChange={(open) => {
          if (!open && !userName) return;
          setIsUserPromptOpen(open);
      }}>
        <DialogContent className="sm:max-w-md !rounded-3xl p-8 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-black">Thiết lập tài khoản</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4 text-center">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-zinc-100 text-zinc-400 group overflow-hidden">
               <div className="absolute inset-0 bg-zinc-900/5 group-hover:scale-110 transition-transform" />
               <UserIcon className="h-10 w-10 relative z-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-zinc-900">Tên người dùng</h3>
              <p className="text-sm text-zinc-400 font-medium">Tên này sẽ được gán làm "Người gửi" cho tất cả đơn hàng bạn tải lên.</p>
            </div>
            <Input 
              placeholder="Nhập tên của bạn..." 
              className="h-14 rounded-2xl text-center text-xl font-bold bg-zinc-50 border-zinc-200 focus-visible:ring-zinc-950 focus-visible:bg-white transition-all"
              value={tempUserName}
              onChange={(e) => setTempUserName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveUserName()}
              autoFocus
            />
          </div>
          <DialogFooter className="sm:justify-center mt-6">
            <Button 
               onClick={handleSaveUserName} 
               className="h-14 w-full rounded-2xl bg-zinc-950 text-base font-black uppercase tracking-widest hover:bg-zinc-800 shadow-xl shadow-zinc-200 shadow-b-4 transition-all active:scale-[0.98]"
            >
               Lưu thông tin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
