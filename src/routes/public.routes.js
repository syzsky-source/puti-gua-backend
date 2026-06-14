const express = require('express');
const ctrl = require('../controllers/publicController');
const { upload } = require('../middleware/upload');

const router = express.Router();

router.get('/settings', ctrl.getSettings);
router.get('/products', ctrl.getProducts);
router.get('/qrcode/active', ctrl.getActiveQrCode);
router.get('/users/:userId', ctrl.getUser);
router.post('/orders', ctrl.createOrder);
router.post('/orders/:orderId/proof', upload.single('image'), ctrl.uploadOrderProof);
router.post('/ai/chat', ctrl.aiChat);

module.exports = router;
