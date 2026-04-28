import express from 'express';
import { createServer as createViteServer } from 'vite';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI

// Mongoose Schema for Project Settings
const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  targetLang: { type: String, default: 'Vietnamese' },
  model: { type: String, default: 'gemini-2.5-pro' },
  tone: { type: String, default: 'Bình thường / Tự nhiên' },
  movieContext: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

const Project = mongoose.model('Project', projectSchema);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Connect to MongoDB
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
  }

  // ==== API ROUTES ====
  app.get('/api/projects', async (req, res) => {
    try {
      const projects = await Project.find().sort({ updatedAt: -1 });
      res.json(projects);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const newCtx = new Project({ ...req.body, updatedAt: new Date() });
      const saved = await newCtx.save();
      res.json(saved);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.put('/api/projects/:id', async (req, res) => {
    try {
      const updated = await Project.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedAt: new Date() },
        { new: true }
      );
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      await Project.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Proxy Gemini API logic to backend to hide the key from client (Optional, but best practice)
  // For now, if the app explicitly needs the key exposed for the translation client library, we might keep it.
  
  // ==== VITE MIDDLEWARE ====
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
