# Hướng dẫn thiết lập OneSignal với Supabase

Để hoàn tất việc gửi thông báo đẩy (Push Notifications) khi có đơn hàng mới, bạn cần thực hiện 2 bước trên trang quản trị Supabase.

## Bước 1: Tạo Supabase Edge Function
Edge Function này sẽ nhận thông tin đơn hàng mới và gọi tới OneSignal API để gửi thông báo.

1. Truy cập **Supabase Dashboard** -> **Edge Functions**.
2. Tạo function mới tên là `onesignal-push`.
3. Dán đoạn mã sau vào:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')

serve(async (req) => {
  try {
    const { record } = await req.json()

    const body = {
      app_id: ONESIGNAL_APP_ID,
      included_segments: ["All"],
      contents: { 
        en: `New order: ${record.orderName} from ${record.senderName}`,
        vi: `Đơn hàng mới: ${record.orderName} từ ${record.senderName}`
      },
      headings: {
        en: "New Order Added",
        vi: "Có đơn hàng mới!"
      },
      data: { orderId: record.id }
    }

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify(body)
    })

    const result = await response.json()
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
```

4. Cài đặt các biến môi trường trong Supabase:
   - `ONESIGNAL_APP_ID`: App ID của bạn.
   - `ONESIGNAL_REST_API_KEY`: API Key lấy từ phần Settings -> Keys & IDs trong OneSignal.

## Bước 2: Thiết lập Database Webhook
Để mỗi khi có đơn hàng mới (INSERT), Supabase sẽ tự động gọi tới Edge Function ở trên.

1. Truy cập **Supabase Dashboard** -> **Database** -> **Webhooks**.
2. Nhấn **Enable Webhooks** (nếu chưa bật).
3. Tạo Webhook mới:
   - **Name:** `onesignal_trigger`
   - **Table:** `orders`
   - **Events:** Tích chọn `INSERT`.
   - **Type:** `Supabase Edge Functions`.
   - **Function:** Chọn `onesignal-push`.
4. Nhấn **Confirm**.

---
**Xong!** Bây giờ, bất cứ khi nào ai đó tạo đơn hàng mới, Supabase sẽ gửi thông báo đẩy tới tất cả các thiết bị đã đăng ký thông qua OneSignal.
