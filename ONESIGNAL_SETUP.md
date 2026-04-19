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

### Lựa chọn A: Cấu hình trên Giao diện (Khuyên dùng)
1. Truy cập **Supabase Dashboard** -> **Database** -> **Webhooks**.
2. Nhấn **Enable Webhooks** (nếu chưa bật).
3. Tạo Webhook mới:
   - **Name:** `onesignal_trigger`
   - **Table:** `public.orders`
   - **Events:** Tích chọn `INSERT`.
   - **Type:** `Supabase Edge Functions`.
   - **Function:** Chọn `onesignal-push`.
4. Nhấn **Confirm**.

### Lựa chọn B: Cấu hình bằng mã SQL (SQL Editor)
Nếu bạn muốn dùng mã SQL, hãy dán đoạn code sau vào **SQL Editor**:

```sql
-- 1. Kích hoạt extension pg_net để cho phép gọi HTTP
create extension if not exists pg_net;

-- 2. Tạo Function để gọi Edge Function
create or replace function public.send_onesignal_notification()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://' || current_setting('request.headers')::json->>'host' || '/functions/v1/onesignal-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('request.headers')::json->>'authorization'
    ),
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$ language plpgsql security definer;

-- 3. Tạo Trigger trên bảng orders
drop trigger if exists on_new_order_push on public.orders;
create trigger on_new_order_push
  after insert on public.orders
  for each row execute function public.send_onesignal_notification();
```

> **Lưu ý:** Cách dùng SQL này yêu cầu bạn phải thay URL chính xác của Project nếu biến `host` không tự nhận diện được. Tốt nhất nên dùng **Lựa chọn A** để Supabase tự xử lý bảo mật và URL.

---
**Xong!** Bây giờ, bất cứ khi nào ai đó tạo đơn hàng mới, Supabase sẽ gửi thông báo đẩy tới tất cả các thiết bị đã đăng ký thông qua OneSignal.

## Xử lý lỗi "Domain Mismatch"

Nếu bạn thấy lỗi "Domain Mismatch" trong Console hoặc nút đăng ký bị vô hiệu hóa:

1. OneSignal yêu cầu domain của trang web phải khớp với **Site URL** bạn đã đăng ký.
2. Truy cập **OneSignal Dashboard** -> **Settings** -> **Web Configuration**.
3. Tại phần **Site Setup**, cập nhật **Site URL** thành URL hiện tại của ứng dụng (ví dụ: `https://ais-dev-...run.app`).
4. Nếu bạn muốn chạy trên cả domain chính (`vercel.app`) và preview, bạn có thể tạo 2 App khác nhau trong OneSignal hoặc sử dụng tính năng domain phụ nếu có.
5. Đảm bảo file `OneSignalSDKWorker.js` (nếu có yêu cầu cài đặt thủ công) được đặt ở thư mục `public/`. Tuy nhiên, với `react-onesignal`, việc khởi tạo thường tự xử lý service worker.
