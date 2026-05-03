import express from 'express';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(compression());
  const PORT = 3000;

  // Initialize Supabase Admin for backend triggers
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let supabaseAdmin: any = null;

  if (supabaseUrl && supabaseServiceKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    console.log('Supabase Admin initialized.');
  }

  // Listen for NEW orders in Supabase for logs or local triggers
  if (supabaseAdmin) {
    try {
      const channel = supabaseAdmin
        .channel('backend-trigger')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload: any) => {
          const order = payload.new;
          console.log('New Order detected via Supabase Backend Listener:', order.order_name);
          
          // Automatically create a notification record when a new order is placed
          try {
            const { error: notifError } = await supabaseAdmin
              .from('notifications')
              .insert([
                {
                  title: 'CÓ ĐƠN HÀNG MỚI',
                  body: `${order.sender_name} gửi: ${order.order_name}`,
                  read: false
                }
              ]);
            
            if (notifError) {
              if (notifError.message.includes('schema cache')) {
                console.warn('⚠️ LƯU Ý: Bảng "notifications" chưa tồn tại trong Supabase. Vui lòng chạy nội dung file supabase_setup.sql trong Supabase SQL Editor.');
              } else {
                console.error('Failed to create notification record:', notifError.message);
              }
            } else {
              console.log('Notification record created successfully for order:', order.id);
            }
          } catch (err) {
            console.error('Error during auto-notification creation:', err);
          }
        });

      channel.subscribe((status: string, err: any) => {
        if (err) {
            console.error('Backend Realtime Subscription Error:', err.message);
        } else {
            console.log('Backend Realtime Status:', status);
        }
      });
    } catch (e) {
      console.error('Failed to initialize backend supabase listener:', e);
    }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
