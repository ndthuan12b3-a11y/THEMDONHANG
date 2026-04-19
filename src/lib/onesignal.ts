import OneSignal from 'react-onesignal';

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

let isInitializing = false;
let isAvailable = false;

export const checkOneSignalAvailable = () => isAvailable;

export const initOneSignal = async () => {
  if (isInitializing || isAvailable) return;
  
  if (!ONESIGNAL_APP_ID) {
    console.warn("OneSignal App ID is missing. Please set VITE_ONESIGNAL_APP_ID in the Secrets panel.");
    return;
  }

  try {
    isInitializing = true;
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
      notifyButton: {
        enable: false,
        prenotify: false,
        showCredit: false,
        text: {
          'tip.state.unsubscribed': 'Bấm để nhận thông báo',
          'tip.state.subscribed': 'Bạn đã đăng ký thông báo',
          'tip.state.blocked': 'Bạn đã chặn thông báo',
          'message.prenotify': 'Bấm để nhận thông báo mới nhất',
          'dialog.main.title': 'Quản lý thông báo',
          'dialog.main.button.subscribe': 'ĐĂNG KÝ',
          'dialog.main.button.unsubscribe': 'HỦY ĐĂNG KÝ',
          'dialog.blocked.title': 'Bỏ chặn thông báo',
          'dialog.blocked.message': 'Hãy làm theo hướng dẫn để bỏ chặn thông báo.',
          'message.action.resubscribed': 'Bạn đã đăng ký lại',
          'message.action.subscribed': 'Đăng ký thành công',
          'message.action.subscribing': 'Đang đăng ký...',
          'message.action.unsubscribed': 'Đã hủy đăng ký'
        }
      },
      welcomeNotification: {
        disable: false,
        title: "Hệ thống đơn hàng",
        message: "Cảm ơn bạn đã bật thông báo!"
      }
    });

    // Option to auto-prompt for permission on some browsers
    // await OneSignal.Slidedown.promptPush();
    
    isAvailable = true;
    console.log("OneSignal Initialized successfully", {
      id: OneSignal.User.PushSubscription.id,
      optedIn: OneSignal.User.PushSubscription.optedIn
    });

    // Tự động hiện gợi ý đăng ký nếu chưa đăng ký
    if (!OneSignal.User.PushSubscription.optedIn) {
      setTimeout(() => {
        OneSignal.Slidedown.promptPush();
      }, 3000); // Đợi 3 giây sau khi vào trang để không gây khó chịu
    }

    // Listen for subscription changes
    OneSignal.User.PushSubscription.addEventListener("change", (event) => {
      console.log("OneSignal Subscription Changed:", event.current);
    });
  } catch (error: any) {
    isInitializing = false;
    if (error?.message?.includes('already initialized')) {
      console.log("OneSignal was already initialized");
      return;
    }
    if (error?.message?.includes('Can only be used on')) {
      const expectedDomain = error.message.match(/Can only be used on: (https?:\/\/[^\s]+)/)?.[1];
      console.warn(
        `OneSignal Domain Mismatch:
        - Domain hiện tại: ${window.location.origin}
        - Domain đăng ký: ${expectedDomain || 'Chưa rõ'}
        
        Thông báo đẩy sẽ KHÔNG hoạt động cho đến khi bạn cập nhập 'Site URL' trong OneSignal Dashboard 
        để khớp với domain hiện tại (${window.location.origin}).`
      );
      return;
    }
    console.error("Error initializing OneSignal:", error);
  }
};

export const getOneSignalId = () => {
  try {
    return OneSignal.User.PushSubscription.id;
  } catch (e) {
    return null;
  }
};

export const isSubscribedToOneSignal = () => {
  try {
    return OneSignal.User.PushSubscription.optedIn || false;
  } catch (e) {
    return false;
  }
};

export const subscribeToNotifications = async () => {
  try {
    // OneSignal.Slidedown.promptPush() shows a friendly prompt before the browser one
    await OneSignal.Slidedown.promptPush();
    return true;
  } catch (error) {
    console.error("Error subscribing to OneSignal:", error);
    return false;
  }
};
