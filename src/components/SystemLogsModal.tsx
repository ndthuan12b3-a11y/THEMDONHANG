import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Activity, Search, RefreshCw, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ActivityLog {
  id: string;
  created_at: string;
  user_name: string;
  action: string;
  details: string;
}

export const logUserActivity = async (action: string, details: string) => {
  const userName = localStorage.getItem('order_tracker_user_name') || 'Hệ thống';
  try {
    const { error } = await supabase.from('activity_logs').insert([
      { user_name: userName, action, details }
    ]);
    if (error) {
      console.warn("Could not log to Supabase. Table might not exist. Run the SQL to create it:", error);
    }
  } catch (e) {
    console.error("Log error", e);
  }
};

export const SystemLogsModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) {
        throw error;
      }
      setLogs(data || []);
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes('relation "public.activity_logs" does not exist')) {
        // Table doesn't exist
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  const filteredLogs = logs.filter(log => 
    log.user_name?.toLowerCase().includes(search.toLowerCase()) || 
    log.action?.toLowerCase().includes(search.toLowerCase()) ||
    log.details?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col p-4 bg-zinc-50 border-none rounded-2xl">
        <DialogHeader className="shrink-0 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">System Logs (Quản Trị)</DialogTitle>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">Lịch sử giám sát hoạt động 100 giao dịch gần nhất</p>
              </div>
            </div>
            <button 
              onClick={fetchLogs} 
              className="p-2 hover:bg-zinc-200 text-zinc-600 rounded-full transition-colors"
            >
              <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
            </button>
          </div>
        </DialogHeader>
        
        <div className="relative mb-4 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, hành động hoặc nội dung..."
            className="pl-9 bg-white border-zinc-200"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 bg-white rounded-xl border border-zinc-200 p-2 shadow-sm space-y-2">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p className="text-sm font-medium">Đang tải lịch sử dữ liệu...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400">
              <Activity className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm font-medium">Chưa có nhật ký hoạt động nào</p>
              <p className="text-xs max-w-xs text-center mt-2 opacity-70">
                Lưu ý: Bạn cần tạo bảng "activity_logs" trong Database để tính năng này hoạt động (nếu trước đó bị lỗi).
              </p>
            </div>
          ) : (
            filteredLogs.map(log => (
              <div key={log.id} className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 flex items-start gap-3">
                <div className="h-8 w-8 flex-shrink-0 bg-white rounded-full border border-zinc-200 flex items-center justify-center shadow-sm">
                  <span className="text-xs font-bold text-zinc-700">{log.user_name?.charAt(0)?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <p className="text-sm font-bold text-zinc-900 truncate pr-2">{log.user_name}</p>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 flex-shrink-0">
                      {log.created_at ? format(new Date(log.created_at), 'HH:mm - dd/MM', { locale: vi }) : ''}
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-blue-600 mb-1">{log.action}</p>
                  <p className="text-xs text-zinc-600 line-clamp-2">{log.details}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
