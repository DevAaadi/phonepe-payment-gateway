import express from 'express';
// import { protect } from '../middleware/auth.middleware.js';
import { validateTokenHandler } from '../middleware/auth.middleware.js';

import {
    createRechargeOrder,
    verifyRecharge,
    getRechargeHistory,
    getWalletBalance
} from '../controllers/recharge.controller.js';

const router = express.Router();

// All routes are protected
router.use(validateTokenHandler);

// Create a new recharge order
router.post('/create', createRechargeOrder);

// Verify and complete the recharge (this route should be public as PhonePe will call it)
router.post('/verify', verifyRecharge);

// Get user's recharge history
router.get('/history', getRechargeHistory);

// Get user's wallet balance
router.get('/balance', getWalletBalance);

export default router; 