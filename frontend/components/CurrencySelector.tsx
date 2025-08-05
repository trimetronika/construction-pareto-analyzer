import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign } from 'lucide-react';

export type Currency = 'USD' | 'IDR';

interface CurrencySelectorProps {
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

export default function CurrencySelector({ currency, onCurrencyChange }: CurrencySelectorProps) {
  return (
    <div className="flex items-center space-x-2">
      <DollarSign className="h-4 w-4 text-gray-500" />
      <Select value={currency} onValueChange={(value: Currency) => onCurrencyChange(value)}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="USD">USD</SelectItem>
          <SelectItem value="IDR">IDR</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
