import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabase';
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
  Bell,
  CheckCircle2,
  Info,
  Activity
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
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Toaster, toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

// New Components & Types
import { Order, PharmacyName, PHARMACIES } from './types';
import { OrderCard } from './components/OrderCard';
import { UploadForm } from './components/UploadForm';
import { GridSkeleton } from './components/SkeletonLoader';
import { initOneSignal, subscribeToNotifications, checkOneSignalAvailable, isSubscribedToOneSignal } from './lib/onesignal';
import { SystemLogsModal, logUserActivity } from './components/SystemLogsModal';

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
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [notifications, setNotifications] = useState<{id: string, title: string, body: string, time: Date, read: boolean}[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isSystemLogsOpen, setIsSystemLogsOpen] = useState(false);
  
  const isConfigMissing = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Permission check
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
    // Audio setup
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audioRef.current.load();

    // Initialize OneSignal
    initOneSignal();
  }, []);

  // Load User Name
  useEffect(() => {
    const savedName = localStorage.getItem('order_tracker_user_name');
    if (savedName) {
      setUserName(savedName);
    } else {
      setIsUserPromptOpen(true);
    }
    
    // Auto-switch view mode based on screen size
    const handleResize = () => {
      if (window.innerWidth < 640) setViewMode('list');
      else setViewMode('grid');
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    const completedOrdersIDs = orders
      .filter(o => o.pharmacy === selectedPharmacy && o.status === 'completed')
      .map(o => o.id);

    if (completedOrdersIDs.length === 0) return;
    if (!window.confirm(`Xóa tất cả đơn hoàn thành tại ${selectedPharmacy}?`)) return;

    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .in('id', completedOrdersIDs);

      if (error) throw error;
      toast.success("Đã xóa đơn hàng.");
      logUserActivity('Xóa hàng loạt', `Đã dọn dẹp ${completedOrdersIDs.length} đơn hàng hoàn thành tại ${selectedPharmacy}`);
    } catch (error) {
      toast.error("Lỗi khi xóa.");
    }
  };

  const requestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          toast.success("Đã bật thông báo trình duyệt!");
        }
      });
    }
  };

  // Fetch Orders - Real-time sync
  useEffect(() => {
    const fetchOrdersData = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Supabase Error:", error);
        return;
      }

      const mappedOrders: Order[] = (data || []).map(o => ({
        id: o.id,
        imageUrls: o.image_urls,
        orderName: o.order_name,
        senderName: o.sender_name,
        pharmacy: o.pharmacy as PharmacyName,
        hasRecordedEntry: o.has_recorded_entry,
        hasRecordedBatchInfo: o.has_recorded_batch_info,
        note: o.note || '',
        timestamp: { toDate: () => new Date(o.created_at) },
        status: o.status
      }));

      setOrders(mappedOrders);
      setLoading(false);
    };

    fetchOrdersData();

    // Set up Realtime Subscription
    const channel = supabase
      .channel('public-orders-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.log('🔔 Realtime change detected! Event:', payload.eventType);
        fetchOrdersData();

        if (payload.eventType === 'INSERT') {
          const newOrder = payload.new;
          
          // Add to hub
          setNotifications(prev => [
            {
              id: Math.random().toString(36).substr(2, 9),
              title: 'CÓ ĐƠN HÀNG MỚI',
              body: `${newOrder.sender_name} gửi: ${newOrder.order_name}`,
              time: new Date(),
              read: false
            },
            ...prev
          ].slice(0, 20));

          // Sound
          if (audioRef.current) {
            audioRef.current.play().catch(e => console.log('Audio play failed:', e));
          }

          toast.info(`Đơn mới: ${newOrder.order_name}`, {
            description: `Người gửi: ${newOrder.sender_name}`,
            duration: 8000
          });
          
          if (Notification.permission === 'granted') {
            new Notification("Có đơn hàng mới!", {
              body: `${newOrder.sender_name} vừa gửi đơn "${newOrder.order_name}"`,
              icon: "/favicon.ico"
            });
          }
        }
      })
      .subscribe((status, err) => {
        console.log('📡 Supabase Realtime Status:', status);
        if (err) console.error('❌ Supabase Realtime Subscription Error:', err);

        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeStatus('error');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
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
      // Handle Supabase timestamp mapping (it has toDate from my mapping)
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

      {isConfigMissing && (
        <div className="bg-amber-50 border-b border-amber-100 p-4 sticky top-0 z-[100] animate-in slide-in-from-top duration-500">
           <div className="mx-auto max-w-7xl flex flex-col sm:flex-row gap-4 sm:items-center">
              <div className="flex gap-4 items-start flex-1">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-600 shrink-0">
                   <AlertCircle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                   <h3 className="text-sm font-black text-amber-900 uppercase tracking-tight">Cấu hình Supabase bị thiếu</h3>
                   <p className="mt-1 text-xs text-amber-700 font-medium leading-relaxed">
                     Vui lòng thiết lập <strong>VITE_SUPABASE_URL</strong> và <strong>VITE_SUPABASE_ANON_KEY</strong> trong bảng <strong>Secrets</strong> để ứng dụng có thể hoạt động.
                   </p>
                </div>
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
            <div className="flex-1 max-w-md flex items-center gap-2">
              <div className="relative group flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-950 transition-colors" />
                <Input 
                  placeholder="Tìm đơn, NCC, ghi chú..." 
                  className="w-full h-9 sm:h-10 rounded-xl sm:rounded-2xl bg-zinc-100/50 border-none pl-8 sm:pl-9 pr-8 focus-visible:ring-zinc-950 focus-visible:bg-white transition-all text-xs sm:text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {searchQuery && (
                    <button 
                      className="h-5 w-5 rounded-full bg-zinc-200 flex items-center justify-center hover:bg-zinc-300 transition-colors"
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="h-3 w-3 text-zinc-600" />
                    </button>
                  )}
                  <button 
                    onClick={() => {
                        window.location.reload();
                    }}
                    title="Làm mới trang"
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-zinc-200 text-zinc-500 hover:text-zinc-950 transition-all active:scale-95"
                  >
                    <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  </button>
                </div>
              </div>
              
              {/* Realtime Status Indicator */}
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-zinc-100 border border-zinc-200 shadow-sm whitespace-nowrap">
                <div className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  realtimeStatus === 'connected' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
                  realtimeStatus === 'connecting' ? "bg-amber-500 animate-pulse" : 
                  "bg-rose-500"
                )} />
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-tight">
                  {realtimeStatus === 'connected' ? 'Realtime' : realtimeStatus === 'connecting' ? 'Đang nối...' : 'Lỗi sync'}
                </span>
              </div>
            </div>

            {/* User Profile & View Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Notification Hub */}
              <Popover>
                <PopoverTrigger
                  render={
                    <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl hover:bg-zinc-100">
                      <Bell className="h-4 w-4 text-zinc-600" />
                      {notifications.some(n => !n.read) && (
                        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500 border-2 border-white shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                      )}
                    </Button>
                  }
                />
                <PopoverContent className="w-80 p-0 rounded-2xl border-zinc-100 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] overflow-hidden" align="end">
                  <div className="flex items-center justify-between p-4 border-b bg-zinc-50/50">
                    <h4 className="text-xs font-black uppercase tracking-widest text-zinc-950">Thông báo</h4>
                    {notifications.length > 0 && (
                      <button 
                        onClick={() => setNotifications(prev => prev.map(n => ({...n, read: true})))}
                        className="text-[10px] font-bold text-zinc-500 hover:text-zinc-950 transition-colors"
                      >
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>
                  <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <div className="mx-auto h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
                           <Bell className="h-5 w-5 text-zinc-400" />
                        </div>
                        <p className="text-xs text-zinc-500 font-medium text-center">Bạn chưa có thông báo mới nào</p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className={cn("p-4 border-b border-zinc-50 hover:bg-zinc-50 transition-colors relative", !n.read && "bg-emerald-50/30")}>
                          <div className="flex gap-3">
                            <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", !n.read ? "bg-emerald-100 text-emerald-600" : "bg-zinc-100 text-zinc-400")}>
                               <Package className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                               <p className="text-xs font-black text-zinc-950 truncate leading-none mb-1 uppercase tracking-tight">{n.title}</p>
                               <p className="text-[11px] text-zinc-600 font-medium leading-normal">{n.body}</p>
                               <p className="text-[9px] text-zinc-400 mt-1 font-bold">{format(n.time, 'HH:mm', { locale: vi })} • {isToday(n.time) ? 'Hôm nay' : 'Gần đây'}</p>
                            </div>
                            {!n.read && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {notificationPermission !== 'granted' ? (
                    <div className="p-3 bg-zinc-900 border-t border-white/5">
                      <Button onClick={requestNotificationPermission} variant="outline" className="w-full h-8 border-white/10 text-white hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest bg-transparent">
                        Bật thông báo trình duyệt
                      </Button>
                    </div>
                  ) : (
                    <div className="p-3 bg-zinc-900 border-t border-white/5 flex flex-col gap-2">
                      <p className="text-[10px] text-zinc-400 font-medium px-1">Đã bật thông báo trình duyệt</p>
                      <Button 
                        onClick={subscribeToNotifications} 
                        variant="outline" 
                        disabled={!checkOneSignalAvailable() || isSubscribedToOneSignal()}
                        className={cn(
                          "w-full h-8 text-[10px] font-bold uppercase tracking-widest bg-transparent",
                          isSubscribedToOneSignal()
                            ? "border-emerald-500/50 text-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/5 cursor-default"
                            : checkOneSignalAvailable() 
                              ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                              : "border-orange-500/30 text-orange-400 opacity-60 cursor-not-allowed"
                        )}
                      >
                        {isSubscribedToOneSignal() 
                          ? 'Đã đăng ký thông báo đẩy ✅' 
                          : checkOneSignalAvailable() 
                            ? 'Đăng ký thông báo đẩy (OneSignal)' 
                            : 'OneSignal: Sai domain (Xem Console)'}
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

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

              {userName && userName.trim().toLowerCase() === 'thuận' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsSystemLogsOpen(true)}
                  className="hidden md:flex h-9 rounded-xl border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 transition-colors"
                >
                  <Activity className="h-4 w-4 mr-1.5" />
                  <span className="text-xs font-bold uppercase tracking-tight">Giám Sát</span>
                </Button>
              )}

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
        </div>

        {/* Dynamic Context Bar: Pharmacies & Status */}
        <div className="border-t bg-white/50 px-3 py-1.5 sm:px-6 sm:py-2">
           <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-3">
              {/* Pharmacy Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth">
                {PHARMACIES.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setSelectedPharmacy(p.name)}
                    className={cn(
                      "relative h-7 sm:h-8 px-3 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap overflow-hidden group",
                      selectedPharmacy === p.name 
                        ? "text-white shadow-md shadow-zinc-200" 
                        : "text-zinc-500 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200"
                    )}
                  >
                    {selectedPharmacy === p.name && (
                      <div className={cn("absolute inset-0 z-0", p.bg)} />
                    )}
                    <span className="relative z-10">{p.name}</span>
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <div className="flex h-8 sm:h-9 items-center gap-1 bg-zinc-100/80 p-1 rounded-xl sm:rounded-2xl self-start sm:self-auto w-full sm:w-auto">
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
                 render={
                  <Button 
                    className="h-14 pl-2 pr-7 rounded-full bg-zinc-950 text-white hover:bg-black font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-4 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border border-white/10 group transition-all active:scale-95 ring-offset-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-950"
                  >
                     <div className="h-10 w-10 rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center shadow-inner group-hover:rotate-90 transition-transform duration-500 ease-out">
                        <Plus className="h-5 w-5 stroke-[4]" />
                     </div>
                     <span className="drop-shadow-sm">Tạo đơn mới</span>
                  </Button>
                 }
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
              <h3 className="text-lg font-bold text-zinc-900">Tên người xử lý đơn</h3>
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

      <SystemLogsModal 
        isOpen={isSystemLogsOpen}
        onClose={() => setIsSystemLogsOpen(false)}
      />
    </div>
  );
}
