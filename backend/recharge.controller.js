import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import Recharge from '../models/recharge.model.js';
import User from '../models/user.model.js';
import axios from 'axios';

const {
  PHONEPE_MERCHANT_ID,
  PHONEPE_SALT_KEY,
  PHONEPE_SALT_INDEX,
  PHONEPE_ENV = 'UAT',
  FRONTEND_URL,
  BACKEND_URL
} = process.env;

// Trim env variables to avoid trailing spaces causing issues
const MERCHANT_ID = PHONEPE_MERCHANT_ID?.trim();
const SALT_KEY = PHONEPE_SALT_KEY?.trim();
const SALT_INDEX = PHONEPE_SALT_INDEX?.trim();

const PHONEPE_BASE_URL = 
  PHONEPE_ENV === 'PROD'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

export const createRechargeOrder = asyncHandler(async (req, res) => {
  console.log('=== Starting Recharge Order Creation ===');
  console.log('Request body:', req.body);

  // Debug logging for environment variables
  console.log('Environment Variables:', {
    MERCHANT_ID: MERCHANT_ID,
    SALT_KEY_EXISTS: !!SALT_KEY,
    SALT_INDEX: SALT_INDEX,
    PHONEPE_ENV: PHONEPE_ENV,
    PHONEPE_BASE_URL: PHONEPE_BASE_URL
  });

  const { amount } = req.body;

  if (!MERCHANT_ID || !SALT_KEY || !SALT_INDEX) {
    console.error('Merchant credentials missing or invalid');
    return res.status(500).json({ success: false, message: 'Payment gateway credentials not configured properly' });
  }

  const user = await User.findById(req.user.id);
  console.log('User found:', { userId: user?._id, phone: user?.phone });

  if (!user || !amount || isNaN(amount) || amount < 1) {
    console.log('Invalid request:', { user: !!user, amount, isValidAmount: !isNaN(amount) && amount >= 1 });
    return res.status(400).json({ success: false, message: 'Invalid request parameters' });
  }

  // Generate a shorter merchantTransactionId
  const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
  const userId = user._id.toString().slice(-6); // Last 6 digits of user ID
  const merchantTransactionId = `MT${timestamp}${userId}`;
  console.log('Generated merchantTransactionId:', merchantTransactionId);

  const payload = {
    merchantId: MERCHANT_ID,
    merchantTransactionId,
    merchantUserId: user._id.toString(),
    amount: Math.round(amount * 100), // amount in paise
    redirectUrl: `${FRONTEND_URL}/dashboard/payment-callback`,
    // redirectMode: "GET",
    callbackUrl: `${BACKEND_URL}/api/recharge/verify`,
    mobileNumber: user.phone,
    paymentInstrument: { type: "PAY_PAGE" }
  };
  console.log('Payment payload:', payload);

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

  // Create checksum string exactly as PhonePe expects: base64Payload + path + saltKey
  const stringToSign = base64Payload + '/pg/v1/pay' + SALT_KEY;
  const checksumHash = crypto.createHash('sha256').update(stringToSign).digest('hex');
  const checksum = checksumHash + '###' + SALT_INDEX;

  console.log('String to sign:', stringToSign);
  console.log('Generated checksum:', checksum);

  console.log('Creating recharge record in database...');
  const recharge = await Recharge.create({
    user: user._id,
    amount,
    phonepeMerchantTransactionId: merchantTransactionId,
    status: 'not-processed'
  });
  console.log('Recharge record created:', recharge._id);

  try {
    console.log('Making PhonePe API request...');
    console.log('Request URL:', `${PHONEPE_BASE_URL}/pg/v1/pay`);
    console.log('Request headers:', {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum,
      'X-MERCHANT-ID': MERCHANT_ID
    });

    const response = await axios.post(
      `${PHONEPE_BASE_URL}/pg/v1/pay`,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': MERCHANT_ID
        }
      }
    );

    console.log('PhonePe API Response:', response.data);

    if (!response.data?.success) {
      console.log('PhonePe API returned unsuccessful response');
      await Recharge.findByIdAndDelete(recharge._id);
      return res.status(400).json({ success: false, message: 'PhonePe error: ' + (response.data.message || 'Unknown error') });
    }

    console.log('Payment initiation successful');
    console.log('Full PhonePe Response:', JSON.stringify(response.data, null, 2));
    
    return res.status(201).json({
      success: true,
      data: response.data,
      rechargeId: recharge._id
    });

  } catch (err) {
    console.error('PhonePe API Error:', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
      headers: err.response?.headers
    });

    await Recharge.findByIdAndDelete(recharge._id);

    return res.status(400).json({
      success: false,
      message: err.response?.data?.message || 'PhonePe request failed'
    });
  }
});

export const verifyRecharge = asyncHandler(async (req, res) => {
  console.log('=== Starting Recharge Verification ===');
  console.log('Verification request body:', req.body);

  const { rechargeId, phonepeMerchantTransactionId } = req.body;
  
  if (!rechargeId || !phonepeMerchantTransactionId) {
    console.log('Missing required fields:', { rechargeId, phonepeMerchantTransactionId });
    return res.status(400).json({ 
      success: false, 
      message: 'rechargeId and phonepeMerchantTransactionId are required' 
    });
  }

  const recharge = await Recharge.findOne({ 
    _id: rechargeId,
    phonepeMerchantTransactionId: phonepeMerchantTransactionId 
  });
  
  console.log('Found recharge record:', recharge?._id);

  if (!recharge) {
    console.log('Recharge record not found');
    return res.status(404).json({ success: false, message: 'Recharge not found' });
  }

  // Check payment status with PhonePe
  try {
    const stringToSign = `/pg/v1/status/${MERCHANT_ID}/${phonepeMerchantTransactionId}` + SALT_KEY;
    const checksumHash = crypto.createHash('sha256').update(stringToSign).digest('hex');
    const checksum = checksumHash + '###' + SALT_INDEX;

    const response = await axios.get(
      `${PHONEPE_BASE_URL}/pg/v1/status/${MERCHANT_ID}/${phonepeMerchantTransactionId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': MERCHANT_ID
        }
      }
    );

    console.log('PhonePe status response:', response.data);

    if (response.data.success) {
      const paymentSuccess = response.data.data.state === 'COMPLETED';
      
      recharge.status = paymentSuccess ? 'completed' : 'failed';
      recharge.phonepeTransactionId = response.data.data.merchantTransactionId;
      recharge.phonepeResponseCode = response.data.data.responseCode;
      await recharge.save();

      if (paymentSuccess) {
        console.log('Payment successful, updating user wallet...');
        const user = await User.findById(recharge.user);
        if (user) {
          user.walletBalance += recharge.amount;
          await user.save();
          console.log('User wallet updated. New balance:', user.walletBalance);
        }
      }

      return res.status(200).json({
        success: true,
        message: paymentSuccess ? 'Success' : 'Failed',
        recharge
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Failed to verify payment status'
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying payment status'
    });
  }
});
