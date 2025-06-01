import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import api from '@/api/axios';

interface PaymentResponse {
  success: boolean;
  data: {
    instrumentResponse: {
      redirectInfo: {
        url: string;
      };
    };
  };
  rechargeId: string;
}

const PhonePePayment = () => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  const validateAmount = (value: string): string => {
    const num = Number(value);
    if (isNaN(num) || num < 1) {
      return 'Amount must be at least ₹1';
    }
    if (num > 100000) {
      return 'Amount cannot exceed ₹1,00,000';
    }
    return '';
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAmount(value);
    const error = validateAmount(value);
    setError(error);
  };

  const initiatePayment = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await api.post<PaymentResponse>('/recharge/create', {
        amount: Number(amount)
      });

      const paymentUrl = response.data.data.instrumentResponse.redirectInfo.url;
      
      // Store recharge ID in localStorage for verification
      localStorage.setItem('currentRechargeId', response.data.rechargeId);
      
      // Redirect to PhonePe
      window.location.href = paymentUrl;
    } catch (error: any) {
      console.error('Payment initiation failed:', error);
      const errorMessage = error.response?.data?.message || 'Payment initiation failed. Please try again.';
      setError(errorMessage);
      toast({
        title: "Payment Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-md mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Recharge Wallet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={handleAmountChange}
                placeholder="Enter amount"
                disabled={loading}
                className={error ? "border-red-500" : ""}
              />
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
            </div>

            <Button
              onClick={initiatePayment}
              disabled={loading || !amount || !!error}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Pay with PhonePe'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PhonePePayment; 