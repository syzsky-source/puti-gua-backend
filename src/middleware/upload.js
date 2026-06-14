const fs = require('fs');
const path = require('path');
const multer = require('multer');
const env = require('../config/env');

const uploadDirAbs = path.resolve(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadDirAbs, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDirAbs),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('只允许上传图片文件'));
    }
    return cb(null, true);
  }
});

module.exports = { upload };
