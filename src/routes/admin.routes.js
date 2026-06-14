const express = require('express');
const { adminAuth } = require('../middleware/adminAuth');
const ctrl = require('../controllers/adminController');

const router = express.Router();

router.use(adminAuth);
router.get('/orders', ctrl.listOrders);
router.post('/orders/:orderId/confirm', ctrl.confirmOrder);
router.post('/orders/:orderId/cancel', ctrl.cancelOrder);
router.post('/users/points', ctrl.adjustUserPoints);

module.exports = router;
