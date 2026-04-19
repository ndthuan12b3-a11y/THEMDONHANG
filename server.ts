import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
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
