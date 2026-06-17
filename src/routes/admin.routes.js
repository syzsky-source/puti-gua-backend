const express = require('express');
const { adminAuth } = require('../middleware/adminAuth');
const ctrl = require('../controllers/adminController');

const router = express.Router();

router.use(adminAuth);

router.get('/orders', ctrl.listOrders);
router.post('/orders/:orderId/confirm', ctrl.confirmOrder);
router.post('/orders/:orderId/cancel', ctrl.cancelOrder);

router.get('/users', ctrl.listUsers);
router.get('/users/:userId', ctrl.getUserDetail);
router.get('/users/:userId/orders', ctrl.listUserOrders);
router.post('/users/:userId/points', ctrl.adjustUserPointsById);

// 兼容旧后台页面：POST /api/admin/users/points { user_id, points }
router.post('/users/points', ctrl.adjustUserPoints);

module.exports = router;
