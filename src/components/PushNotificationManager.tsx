import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { db, auth } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [subCount, setSubCount] = useState<number>(0);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    // Detect iOS
    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) || 
                       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);
    
    // Detect In-App Browsers (Facebook, Zalo, Instagram, etc)
    const isInsideApp = /FBAN|FBAV|Instagram|Zalo|Line|Twitter/.test(ua);
    setIsInAppBrowser(isInsideApp);

    // Check if app is running in standalone mode (PWA)
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  (window.navigator as any).standalone === true;
    setIsStandalone(isPWA);

    // Listen for total connected devices
    import('firebase/firestore').then(({ collection, onSnapshot }) => {
      const unsubscribe = onSnapshot(collection(db, 'push_subscriptions'), (snapshot) => {
        setSubCount(snapshot.size);
      });
      return () => unsubscribe();
    }).catch(e => console.log("Failed to load firestore for sub count", e));

    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      // Register Service Worker from public folder
      navigator.serviceWorker.register('/sw.js').then(registration => {
        console.log('Service Worker registered', registration);
        return registration.pushManager.getSubscription();
      }).then(subscription => {
        setIsSubscribed(!!subscription);
      }).catch(err => {
        console.error('Service Worker registration failed', err);
      });
    }
  }, []);

  const subscribeUser = async () => {
    setIsLoading(true);
    try {
      if (Notification.permission === 'denied') {
        if (window !== window.parent) {
          throw new Error("Bạn đang xem ứng dụng trong màn hình nhúng (iFrame). Trình duyệt chặn quyền thông báo ở đây. Vui lòng nhấn vào biểu tượng ↗️ ở góc trên bên phải để mở ứng dụng ở tab mới nhé.");
        }
        throw new Error("Trình duyệt hoặc hệ điều hành đã chặn quyền thông báo. Vui lòng bấm vào ổ khóa trên thanh địa chỉ URL để cho phép lại.");
      }

      // Inside iframe, calling requestPermission usually auto-denies or throws
      if (window !== window.parent) {
         toast.info("Đang xin quyền thông báo. Nếu không hiện bảng hỏi, vui lòng mở ứng dụng ra trang web riêng (Tab mới) nhé.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (window !== window.parent) {
          throw new Error("Trình duyệt chặn xin quyền trong chế độ xem trước. Vui lòng mở ứng dụng ở tab mới (nút góc trên cùng bên phải).");
        }
        throw new Error("Bạn chưa cấp quyền nhận thông báo.");
      }

      const registration = await navigator.serviceWorker.ready;

      // Hardcode the public key directly to bypass any fetch/network corruption issues
      const publicVapidKey = "BK4E9yiuRhuActY-H_0-ky59DtRmAWAyBQYZcMjqAHuSMdkTH4V91BiqrzZpthTZRCBr1kJe8GcD4rXKrcN6lnw";
      const convertedVapidKey = urlBase64ToUint8Array(publicVapidKey);

      // Fix "applicationServerKey is not valid" by purging old mismatching subscriptions
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
         try {
           await existingSubscription.unsubscribe();
         } catch(e) {
           console.error("Failed to unsubscribe old token", e);
           // Nuclear option for bad state
           await registration.unregister();
           // Reload page to let component re-mount and get a fresh SW
           window.location.reload();
           return;
         }
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      console.log('User is subscribed:', subscription);

      // Extract User ID if logged in, or use a generated local ID
      const uid = auth.currentUser?.uid || 'anonymous_sub_' + Math.random().toString(36).substring(7);

      // Save subscription to Firestore directly so Vercel does not wipe it
      await setDoc(doc(db, 'push_subscriptions', uid), {
        subscription: JSON.parse(JSON.stringify(subscription)),
        timestamp: new Date(),
        userId: uid
      });

      // Still optionally send to backend test endpoint if required, but we can rely on DB for real ones over time.
      await fetch('/api/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
        headers: {
          'Content-Type': 'application/json'
        }
      }).catch(e => console.log("Backend legacy hook error", e));

      setIsSubscribed(true);
      toast.success("Đã bật thông báo thành công!");
    } catch (err: any) {
      console.error('Failed to subscribe the user: ', err);
      // Give a nicer error mapping for known issues
      const errorMessage = err.message || JSON.stringify(err);
      if (errorMessage.includes("permission denied")) {
        toast.error('Lỗi: Bạn đã từ chối cấp quyền thông báo hoặc trình duyệt tự động chặn.', { duration: 5000 });
      } else {
        toast.error('Lỗi khi bật thông báo: ' + errorMessage, { duration: 8000 });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestNotification = async () => {
    try {
      await fetch('/api/sendNotification', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Notification',
          body: 'Hello! This is a test Web Push notification.'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      toast.success("Đã gửi thông báo test!");
    } catch (err) {
      console.error(err);
      toast.error("Gửi thông báo thất bại.");
    }
  };

  if (isInAppBrowser) {
    return (
      <Button 
        variant="outline" 
        size="sm" 
        className="bg-red-50 border-red-200 text-red-700"
        onClick={() => {
          toast.error("Trình duyệt trong ứng dụng bị chặn thông báo!", {
            description: "Vui lòng bấm vào dấu 3 chấm góc trên bên phải và chọn 'MỞ TRONG TRÌNH DUYỆT' (Chrome/Safari) để bật thông báo nhé.",
            duration: 10000
          });
        }}
      >
        <BellOff className="h-4 w-4 mr-2" />
        Lỗi: Vui lòng mở bằng Chrome/Safari
      </Button>
    );
  }

  if (!isSupported) {
    if (isIOS && !isStandalone) {
      return (
        <Button 
          variant="outline" 
          size="sm" 
          className="bg-amber-50 border-amber-200 text-amber-700"
          onClick={() => {
            toast.info("Để bật thông báo trên iPhone:", {
              description: "1. Nhấn nút 'Chia sẻ' (hình vuông mũi tên lên)\n2. Chọn 'Thêm vào MH chính' (Add to Home Screen)\n3. Mở ứng dụng từ màn hình chính và bật thông báo.",
              duration: 10000
            });
          }}
        >
          <Zap className="h-4 w-4 mr-2 animate-pulse" />
          iPhone: Xem cách bật thông báo
        </Button>
      );
    }

    return (
      <Button variant="outline" size="sm" className="hidden sm:inline-flex" disabled>
        <BellOff className="h-4 w-4 mr-2" />
        Trình duyệt không hỗ trợ Push
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {subCount > 0 && (
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-100 text-xs font-medium cursor-help" title={`${subCount} thiết bị đang nhận thông báo`}>
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          {subCount} máy đã kết nối
        </div>
      )}
      {!isSubscribed ? (
        <Button onClick={subscribeUser} disabled={isLoading} variant="outline" size="sm" className="bg-zinc-50 border-zinc-200 hover:bg-zinc-100">
          {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bell className="h-4 w-4 mr-2 text-zinc-600" />}
          Bật Thông Báo
        </Button>
      ) : (
        <Button onClick={sendTestNotification} variant="outline" size="sm" className="bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100">
          <Bell className="h-4 w-4 mr-2" />
          Test Thông Báo
        </Button>
      )}
    </div>
  );
}
