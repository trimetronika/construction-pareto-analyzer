import React, { useEffect, useState } from 'react';
import backend from '~backend/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, type Currency } from '../utils/currency';
import { useToast } from '@/components/ui/use-toast';

export interface VESuggestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    itemCode: string;
    description: string;
    quantity?: number;
    unitRate?: number;
    totalCost: number;
  } | null;
  currency?: Currency;
  workCategory?: string; // structure | finishing | mep | other
}

interface VEResponse {
  original: {
    itemName: string;
    description: string;
    quantity: number;
    unitRate: number;
    totalCost: number;
  };
  alternatives: {
    description: string;
    newUnitRate: number;
    newTotalCost: number;
    estimatedSaving: number;
    savingPercent: number;
    tradeOffs: string;
  }[];
  notes: string[];
}

function inferCategory(description: string): string {
  const d = description.toLowerCase();
  if (d.includes('concrete') || d.includes('reinforcement') || d.includes('rebar') || d.includes('formwork') || d.includes('bekisting') || d.includes('struktur')) {
    return 'structure';
  }
  if (d.includes('tile') || d.includes('paint') || d.includes('floor') || d.includes('plaster') || d.includes('finishing')) {
    return 'finishing';
  }
  if (d.includes('pipe') || d.includes('duct') || d.includes('cable') || d.includes('panel') || d.includes('mep') || d.includes('hvac')) {
    return 'mep';
  }
  return 'other';
}

export default function VESuggestionsDialog({ open, onOpenChange, item, currency = 'USD', workCategory }: VESuggestionsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VEResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!open || !item) return;
      if (!item.quantity || !item.unitRate) {
        // If missing key fields, try to back-calc unitRate from totalCost
        if (!item.quantity) {
          toast({
            title: 'Missing quantity',
            description: 'Quantity is required to simulate VE alternatives for this item.',
            variant: 'destructive'
          });
          return;
        }
      }
      setLoading(true);
      setData(null);
      try {
        const req = {
          itemName: `${item.itemCode}`,
          itemDescription: item.description,
          quantity: item.quantity ?? 1,
          unitRate: item.unitRate ?? (item.totalCost / Math.max(1, item.quantity || 1)),
          totalCost: item.totalCost,
          workCategory: workCategory || inferCategory(`${item.itemCode} ${item.description}`)
        };
        const resp = await backend.insights.veSuggestions(req);
        if (!cancelled) {
          setData(resp);
        }
      } catch (err) {
        console.error('VE suggestions error:', err);
        toast({
          title: 'Failed to get VE suggestions',
          description: 'An error occurred while generating suggestions.',
          variant: 'destructive'
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [open, item, workCategory, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Value Engineering Suggestions</DialogTitle>
          <DialogDescription>
            Realistic alternatives that maintain functionality with potential cost reductions.
          </DialogDescription>
        </DialogHeader>

        {!item ? (
          <div className="text-sm text-gray-500">No item selected.</div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Original Item</div>
              <div className="font-medium text-gray-900">
                {data.original.itemName}: {data.original.description}
              </div>
              <div className="text-sm text-gray-700 mt-1">
                Quantity: <span className="font-medium">{data.original.quantity.toLocaleString()}</span>{' '}
                • Unit Rate: <span className="font-medium">{formatCurrency(data.original.unitRate, currency)}</span>{' '}
                • Total Cost: <span className="font-semibold">{formatCurrency(data.original.totalCost, currency)}</span>
              </div>
              {data.notes.length > 0 && (
                <div className="mt-2 space-y-1">
                  {data.notes.map((n, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{n}</Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {data.alternatives.map((alt, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Alternative {idx + 1}</div>
                      <div className="font-medium text-gray-900">{alt.description}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {alt.savingPercent.toFixed(1)}% saving
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-700 mt-2">
                    New Unit Rate: <span className="font-medium">{formatCurrency(alt.newUnitRate, currency)}</span>{' '}
                    • New Total Cost: <span className="font-medium">{formatCurrency(alt.newTotalCost, currency)}</span>{' '}
                    • Estimated Saving: <span className="font-semibold text-green-700">
                      {formatCurrency(alt.estimatedSaving, currency)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-2">
                    Trade-offs: {alt.tradeOffs}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">No suggestions available.</div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
