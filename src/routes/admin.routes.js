const express = require('express');
const { adminAuth } = require('../middleware/adminAuth');
const ctrl = require('../controllers/adminController');

const router = express.Router();

router.use(adminAuth);

router.get('/dashboard', ctrl.getDashboard);

router.get('/orders', ctrl.listOrders);
router.post('/orders/:orderId/confirm', ctrl.confirmOrder);
router.post('/orders/:orderId/cancel', ctrl.cancelOrder);

router.get('/users', ctrl.listUsers);
router.get('/users/:userId', ctrl.getUserDetail);
router.get('/users/:userId/orders', ctrl.listUserOrders);
router.post('/users/:userId/points', ctrl.adjustUserPointsById);

// 兼容旧后台页面：POST /api/admin/users/points { user_id, points }
router.post('/users/points', ctrl.adjustUserPoints);

router.get('/products', ctrl.listProducts);
router.post('/products', ctrl.saveProduct);
router.patch('/products/:productId', ctrl.saveProduct);

router.get('/qrcodes', ctrl.listQrCodes);
router.post('/qrcodes', ctrl.saveQrCode);
router.patch('/qrcodes/:qrcodeId', ctrl.saveQrCode);
router.post('/qrcodes/:qrcodeId/active', ctrl.activateQrCode);

router.get('/settings', ctrl.listSettings);
router.patch('/settings/:key', ctrl.updateSetting);

router.get('/music', ctrl.getMusicConfig);
router.patch('/music', ctrl.updateMusicConfig);

router.get('/security', ctrl.getSecurityStatus);
router.get('/audit-logs', ctrl.listAuditLogs);

module.exports = router;
