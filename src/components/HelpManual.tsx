import React, { useState } from 'react';
import { 
  X, 
  HelpCircle, 
  ChevronRight, 
  ArrowRight, 
  Zap, 
  ShieldCheck, 
  Search, 
  Plus, 
  ClipboardCheck,
  Package,
  Scan,
  Sparkles,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GuideStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  content: string[];
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'intro',
    title: 'Tổng quan hệ thống',
    description: 'Bắt đầu với các tính năng cơ bản.',
    icon: <Zap className="h-5 w-5 text-amber-500" />,
    content: [
      'Quản Lý ảnh chụp theo từng nhà thuốc.',
      'Lưu trữ chứng từ nhanh chóng và an toàn.'
    ]
  },
  {
    id: 'create',
    title: 'Tạo đơn hàng mới',
    description: 'Chụp ảnh và lưu trữ thông tin nhà cung cấp.',
    icon: <Plus className="h-5 w-5 text-blue-500" />,
    content: [
      'Chụp ảnh hóa đơn hoặc chọn ảnh từ thư viện.',
      'Nhập tên Nhà cung cấp và các ghi chú quan trọng.',
      'Lưu đơn hàng vào hệ thống nhà thuốc tương ứng.'
    ]
  },
  {
    id: 'search',
    title: 'Tìm kiếm & Lọc',
    description: 'Truy xuất dữ liệu nhanh chóng.',
    icon: <Search className="h-5 w-5 text-purple-500" />,
    content: [
      'Chọn tab Nhà thuốc (Hưng Thịnh, 108,...) để xem đơn tương ứng.',
      'Sử dụng thanh tìm kiếm để tìm theo tên NCC hoặc ghi chú.',
      'Lọc theo trạng thái: Chờ xử lý hoặc Đã hoàn thành.'
    ]
  }
];

interface HelpGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpGuide({ isOpen, onClose }: HelpGuideProps) {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-zinc-950/60 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 40 }}
            className="relative w-full max-w-4xl bg-white rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[85dvh] md:h-[80vh] sm:max-h-[90vh]"
          >
            {/* Sidebar - Navigation */}
            <div className="w-full md:w-80 bg-zinc-50 border-b md:border-r md:border-b-0 border-zinc-100 p-4 sm:p-6 md:p-8 shrink-0 flex flex-col z-10 relative">
              <div className="flex items-center justify-between mb-4 md:mb-8">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl md:rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-lg shadow-zinc-200">
                    <HelpCircle className="h-5 w-5 md:h-6 md:w-6" />
                  </div>
                  <div>
                    <h2 className="text-xs md:text-sm font-black uppercase tracking-tight text-zinc-900">Hướng dẫn</h2>
                    <p className="text-[9px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sử dụng chi tiết</p>
                  </div>
                </div>
                {/* Mobile Close Button */}
                <button 
                  onClick={onClose}
                  className="md:hidden h-10 w-10 flex items-center justify-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all font-bold"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex overflow-x-auto md:flex-col gap-2 md:gap-2 pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 no-scrollbar snap-x">
                {GUIDE_STEPS.map((step, index) => (
                  <button
                    key={step.id}
                    onClick={() => setActiveStep(index)}
                    className={cn(
                      "w-48 md:w-full flex-shrink-0 flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl md:rounded-3xl transition-all text-left group snap-start border border-transparent",
                      activeStep === index 
                        ? "bg-white shadow-sm md:shadow-md border-zinc-100" 
                        : "bg-zinc-100/50 hover:bg-zinc-200/50"
                    )}
                  >
                    <div className={cn(
                      "h-8 w-8 md:h-10 md:w-10 rounded-xl md:rounded-2xl flex items-center justify-center transition-all shrink-0",
                      activeStep === index ? "bg-zinc-900 text-white" : "bg-white text-zinc-500 group-hover:bg-zinc-100"
                    )}>
                      {step.icon}
                    </div>
                    <div className="overflow-hidden">
                      <h3 className={cn("text-[11px] md:text-xs font-bold leading-tight truncate", activeStep === index ? "text-zinc-900" : "text-zinc-600")}>
                        {step.title}
                      </h3>
                      <p className="text-[9px] md:text-[10px] text-zinc-400 font-medium truncate mt-0.5 hidden md:block">{step.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="hidden md:block mt-8 pt-6 border-t border-zinc-200">
                 <div className="p-4 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center gap-3">
                   <div className="h-8 w-8 rounded-full bg-zinc-900 text-white flex items-center justify-center shadow-sm">
                      <Zap className="h-4 w-4 fill-current" />
                   </div>
                   <p className="text-[10px] font-bold text-zinc-900 leading-snug">
                     Hệ thống quản lý kho Hưng Thịnh & 108.
                   </p>
                 </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between p-6 sm:p-8 border-b border-zinc-100 shrink-0">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">Bước {activeStep + 1} / {GUIDE_STEPS.length}</span>
                  <h1 className="text-xl sm:text-2xl font-black text-zinc-900 uppercase tracking-tight">{GUIDE_STEPS[activeStep].title}</h1>
                </div>
                <button 
                  onClick={onClose}
                  className="hidden md:flex h-12 w-12 items-center justify-center rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-all"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 no-scrollbar bg-zinc-50/20">
                <div className="space-y-6">
                  <p className="text-sm sm:text-base font-medium text-zinc-600 leading-relaxed italic border-l-4 border-zinc-900 pl-6 py-2">
                    "{GUIDE_STEPS[activeStep].description}"
                  </p>

                  <div className="grid gap-4">
                    {GUIDE_STEPS[activeStep].content.map((item, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-start gap-4 p-5 rounded-[2rem] bg-white border border-zinc-100 shadow-sm hover:shadow-md transition-all group"
                      >
                        <div className="h-6 w-6 rounded-full bg-zinc-100 text-[10px] font-black flex items-center justify-center text-zinc-400 group-hover:bg-zinc-900 group-hover:text-white transition-all shrink-0">
                          {i + 1}
                        </div>
                        <p className="text-sm font-bold text-zinc-700 leading-snug">{item}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8 bg-white border-t border-zinc-100 flex items-center justify-between shrink-0">
                <Button 
                  variant="ghost" 
                  className="rounded-2xl h-12 px-6 font-bold"
                  onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
                  disabled={activeStep === 0}
                >
                  Trước đó
                </Button>
                
                {activeStep < GUIDE_STEPS.length - 1 ? (
                  <Button 
                    className="rounded-2xl h-12 px-8 bg-zinc-900 hover:bg-zinc-800 text-white font-bold gap-2 shadow-lg shadow-zinc-200"
                    onClick={() => setActiveStep(activeStep + 1)}
                  >
                    Tiếp tục <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    className="rounded-2xl h-12 px-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-200"
                    onClick={onClose}
                  >
                    Khám phá ngay
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Circular Help Trigger Component
interface HelpTriggerProps {
  title: string;
  description: string;
  className?: string;
}

export function HelpTrigger({ title, description, className }: HelpTriggerProps) {
  const [showPopup, setShowPopup] = useState(false);

  return (
    <div className={cn("relative inline-block", className)}>
      <span
        role="button"
        onMouseEnter={() => setShowPopup(true)}
        onMouseLeave={() => setShowPopup(false)}
        onClick={(e) => {
          e.stopPropagation();
          setShowPopup(!showPopup);
        }}
        tabIndex={0}
        className="h-5 w-5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-400 flex items-center justify-center transition-colors focus:outline-none ring-offset-white focus:ring-2 focus:ring-zinc-900 border border-zinc-200 cursor-help"
      >
        <span className="text-[10px] font-black font-serif italic">!</span>
      </span>

      <AnimatePresence>
        {showPopup && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 5 }}
            className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-56 z-[70] pointer-events-none"
          >
            <div className="relative p-4 rounded-2xl bg-zinc-900 text-white shadow-2xl border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-3 w-3 rounded-full bg-amber-500" />
                <h4 className="text-[10px] font-black uppercase tracking-widest leading-none">{title}</h4>
              </div>
              <p className="text-[11px] font-medium leading-relaxed text-zinc-400">
                {description}
              </p>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-900" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
