// server.js - Backend NCB_AI 1.0
// Chạy: npm install express sqlite3 bcrypt jsonwebtoken cors body-parser
// Khởi động: node server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'NCB_AI_SECRET_2026_NGUYEN_CONG_BANG';

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==== DATABASE ====
const db = new sqlite3.Database('./ncbai.db');

db.serialize(() => {
  // Bảng users
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Bảng conversations
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT,
      messages TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Bảng chat_count
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_count (
      user_id INTEGER PRIMARY KEY,
      count INTEGER DEFAULT 0,
      unlocked INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
});

// ==== MIDDLEWARE AUTH ====
function authMiddleware(req, res, next){
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if(!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  }catch(e){
    return res.status(401).json({ error: 'Token không hợp lệ' });
  }
}

// ==== API: ĐĂNG KÝ ====
app.post('/api/register', async (req, res) => {
  const { username, password, display_name, avatar_url } = req.body;
  if(!username || !password){
    return res.status(400).json({ error: 'Thiếu username hoặc password' });
  }
  if(username.length < 3 || password.length < 4){
    return res.status(400).json({ error: 'Username >= 3, password >= 4 ký tự' });
  }

  try{
    const hash = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (username, password, display_name, avatar_url) VALUES (?, ?, ?, ?)',
      [username, hash, display_name || username, avatar_url || ''],
      function(err){
        if(err){
          if(err.message.includes('UNIQUE')){
            return res.status(409).json({ error: 'Username đã tồn tại' });
          }
          return res.status(500).json({ error: 'Lỗi server' });
        }
        const userId = this.lastID;
        // Tạo bản ghi chat_count
        db.run('INSERT INTO chat_count (user_id, count, unlocked) VALUES (?, 0, 0)', [userId]);

        const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({
          token,
          user: {
            id: userId,
            username,
            display_name: display_name || username,
            avatar_url: avatar_url || ''
          }
        });
      }
    );
  }catch(e){
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ==== API: ĐĂNG NHẬP ====
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if(!username || !password){
    return res.status(400).json({ error: 'Thiếu username hoặc password' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if(err || !user){
      return res.status(401).json({ error: 'Sai username hoặc password' });
    }
    const ok = await bcrypt.compare(password, user.password);
    if(!ok){
      return res.status(401).json({ error: 'Sai username hoặc password' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name || user.username,
        avatar_url: user.avatar_url || ''
      }
    });
  });
});

// ==== API: LẤY THÔNG TIN USER ====
app.get('/api/me', authMiddleware, (req, res) => {
  db.get(
    'SELECT id, username, display_name, avatar_url FROM users WHERE id = ?',
    [req.userId],
    (err, user) => {
      if(err || !user) return res.status(404).json({ error: 'Không tìm thấy user' });
      res.json({ user });
    }
  );
});

// ==== API: CẬP NHẬT PROFILE (avatar, tên) ====
app.post('/api/profile', authMiddleware, (req, res) => {
  const { display_name, avatar_url } = req.body;
  db.run(
    'UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?',
    [display_name || '', avatar_url || '', req.userId],
    function(err){
      if(err) return res.status(500).json({ error: 'Lỗi cập nhật' });
      res.json({ ok: true });
    }
  );
});

// ==== API: LẤY DANH SÁCH HỘI THOẠI ====
app.get('/api/conversations', authMiddleware, (req, res) => {
  db.all(
    'SELECT id, title, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100',
    [req.userId],
    (err, rows) => {
      if(err) return res.status(500).json({ error: 'Lỗi server' });
      res.json({ conversations: rows || [] });
    }
  );
});

// ==== API: LẤY CHI TIẾT 1 HỘI THOẠI ====
app.get('/api/conversations/:id', authMiddleware, (req, res) => {
  db.get(
    'SELECT * FROM conversations WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
    (err, row) => {
      if(err || !row) return res.status(404).json({ error: 'Không tìm thấy' });
      try{ row.messages = JSON.parse(row.messages || '[]'); }catch(e){ row.messages = []; }
      res.json({ conversation: row });
    }
  );
});

// ==== API: LƯU / CẬP NHẬT HỘI THOẠI ====
app.post('/api/conversations', authMiddleware, (req, res) => {
  const { id, title, messages } = req.body;
  if(!id || !Array.isArray(messages)){
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  }
  const messagesJson = JSON.stringify(messages);
  const titleSafe = (title || 'Cuộc trò chuyện mới').slice(0, 80);

  db.run(`
    INSERT INTO conversations (id, user_id, title, messages, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      messages = excluded.messages,
      updated_at = CURRENT_TIMESTAMP
  `, [id, req.userId, titleSafe, messagesJson], function(err){
    if(err) return res.status(500).json({ error: 'Lỗi lưu' });
    res.json({ ok: true });
  });
});

// ==== API: XÓA HỘI THOẠI ====
app.delete('/api/conversations/:id', authMiddleware, (req, res) => {
  db.run(
    'DELETE FROM conversations WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
    function(err){
      if(err) return res.status(500).json({ error: 'Lỗi xóa' });
      res.json({ ok: true });
    }
  );
});

// ==== API: ĐỒNG BỘ CHAT COUNT + UNLOCKED ====
app.get('/api/chat-count', authMiddleware, (req, res) => {
  db.get('SELECT count, unlocked FROM chat_count WHERE user_id = ?', [req.userId], (err, row) => {
    if(err || !row){
      db.run('INSERT INTO chat_count (user_id, count, unlocked) VALUES (?, 0, 0)', [req.userId]);
      return res.json({ count: 0, unlocked: 0 });
    }
    res.json({ count: row.count, unlocked: row.unlocked });
  });
});

app.post('/api/chat-count', authMiddleware, (req, res) => {
  const { count, unlocked } = req.body;
  db.run(
    'UPDATE chat_count SET count = ?, unlocked = ? WHERE user_id = ?',
    [count || 0, unlocked ? 1 : 0, req.userId],
    function(err){
      if(err) return res.status(500).json({ error: 'Lỗi cập nhật' });
      res.json({ ok: true });
    }
  );
});

// ==== KHỞI ĐỘNG ====
app.listen(PORT, () => {
  console.log('===========================================');
  console.log('  NCB_AI 1.0 Backend Server');
  console.log('  Đang chạy: http://localhost:' + PORT);
  console.log('  Admin: NGUYỄN CÔNG BẰNG');
  console.log('===========================================');
});
