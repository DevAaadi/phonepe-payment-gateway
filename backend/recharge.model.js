import mongoose from "mongoose";

const rechargeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: [1, "Amount must be at least 1"]
    },
    phonepeMerchantTransactionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    phonepeTransactionId: {
        type: String,
        unique: true,
        sparse: true
    },
    phonepeResponseCode: {
        type: String,
        sparse: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    }
}, {
    timestamps: true
});

// Drop the old razorpayOrderId index if it exists
rechargeSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });

const Recharge = mongoose.model("Recharge", rechargeSchema);

// Drop the old index
Recharge.collection.dropIndex('razorpayOrderId_1').catch(err => {
    if (err.code !== 26) { // Ignore if index doesn't exist
        console.error('Error dropping old index:', err);
    }
});

export default Recharge; 