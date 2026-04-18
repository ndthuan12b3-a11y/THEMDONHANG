import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import webpush from 'web-push';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Web Push Setup ---
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BK4E9yiuRhuActY-H_0-ky59DtRmAWAyBQYZcMjqAHuSMdkTH4V91BiqrzZpthTZRCBr1kJe8GcD4rXKrcN6lnw";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "WUHzvZrsBvmQOGBkDBzYhQTMQXoSsl6X_--Kzdopn1Q";

webpush.setVapidDetails(
  'mailto:example@yourdomain.org',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const subscriptions: any[] = [];

const app = express();
app.use(cors());
app.use(express.json());

// --- Web Push Routes ---
app.get('/api/vapidPublicKey', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(VAPID_PUBLIC_KEY);
});

app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  res.status(201).json({});
});

app.post('/api/sendNotification', async (req, res) => {
  const notificationPayload = {
    notification: {
      title: req.body.title || 'Đơn hàng mới',
      body: req.body.body || 'Vừa có một đơn hàng mới được tạo.',
      icon: '/vite.svg',
      image: req.body.imageUrl || undefined,
      data: {
        url: req.body.url || '/'
      }
    },
  };

  try {
    const appInst = getApps().length === 0 ? initializeApp(firebaseConfig, 'backend-push') : getApp('backend-push');
    const db = getFirestore(appInst, (firebaseConfig as any).firestoreDatabaseId);

    const snap = await getDocs(collection(db, 'push_subscriptions'));
    const subscriptionsToPush: { id: string, subscription: any }[] = [];
    
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.subscription) {
        subscriptionsToPush.push({ id: docSnap.id, subscription: data.subscription });
      }
    });
    
    if (subscriptions.length > 0) {
      subscriptions.forEach(s => subscriptionsToPush.push({ id: '', subscription: s }));
    }

    if (subscriptionsToPush.length === 0) {
      return res.status(200).json({ message: "No subscribers found.", count: 0 });
    }

    let successCount = 0;
    let failCount = 0;

    const promises = subscriptionsToPush.map(async (item) => {
      try {
        await webpush.sendNotification(item.subscription, JSON.stringify(notificationPayload));
        successCount++;
      } catch (err: any) {
        failCount++;
        if (item.id && (err.statusCode === 410 || err.statusCode === 404)) {
          try {
            await deleteDoc(doc(db, 'push_subscriptions', item.id));
          } catch (deleteErr) {
            console.error("Failed to delete expired sub", deleteErr);
          }
        }
      }
    });

    await Promise.all(promises);
    res.status(200).json({ message: "Notifications sent.", success: successCount, failed: failCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to broadcast" });
  }
});

app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) return res.status(400).send('Missing image URL');

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    
    const buffer = await (response as any).buffer();
    res.send(buffer);
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).send('Error proxying image');
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Vite Middleware (Development Only)
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

const PORT = Number(process.env.PORT) || 3000;

// Only listen if explicitly told to or if not on Vercel
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL_DEV) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
