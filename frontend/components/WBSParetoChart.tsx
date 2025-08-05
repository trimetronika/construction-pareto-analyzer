import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { formatCurrency, Currency } from '../utils/currency';

Chart.register(...registerables);

export interface WBSItem {
  id: number;
  itemCode: string;
  description: string;
  totalCost: number;
  cumulativeCost: number;
  cumulativePercentage: number;
  isParetoCritical: boolean;
  itemCount: number;
  quantity?: number;
  unit?: string;
  unitRate?: number;
}

interface WBSParetoChartProps {
  items: WBSItem[];
  currency?: Currency;
  onItemClick?: (item: WBSItem) => void;
  level: number;
}

export default function WBSParetoChart({ items, currency = 'USD', onItemClick, level }: WBSParetoChartProps) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || items.length === 0) return;

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    // Prepare data for top 20 items
    const topItems = items.slice(0, 20);
    const labels = topItems.map((item, index) => {
      const truncatedDesc = item.description.substring(0, 20);
      return `${item.itemCode}: ${truncatedDesc}${item.description.length > 20 ? '...' : ''}`;
    });
    const costs = topItems.map(item => item.totalCost);
    const cumulativePercentages = topItems.map(item => item.cumulativePercentage);
    const colors = topItems.map(item => item.isParetoCritical ? '#3b82f6' : '#94a3b8');

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Cost',
            data: costs,
            backgroundColor: colors,
            borderColor: colors,
            borderWidth: 1,
            yAxisID: 'y'
          },
          {
            label: 'Cumulative %',
            data: cumulativePercentages,
            type: 'line',
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2,
            fill: false,
            yAxisID: 'y1',
            pointBackgroundColor: '#ef4444',
            pointBorderColor: '#ef4444',
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        onClick: (event, elements) => {
          if (elements.length > 0 && onItemClick) {
            const index = elements[0].index;
            const item = topItems[index];
            if (item && level < 3) { // Only allow drilling down to level 3
              onItemClick(item);
            }
          }
        },
        plugins: {
          legend: {
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                if (context.datasetIndex === 0) {
                  const item = topItems[context.dataIndex];
                  const tooltipLines = [
                    `Cost: ${formatCurrency(context.parsed.y, currency)}`
                  ];
                  
                  if (item.quantity) {
                    tooltipLines.push(`Quantity: ${item.quantity.toLocaleString()}`);
                  }
                  if (item.unit) {
                    tooltipLines.push(`Unit: ${item.unit}`);
                  }
                  if (item.unitRate) {
                    tooltipLines.push(`Unit Rate: ${formatCurrency(item.unitRate, currency)}`);
                  }
                  
                  return tooltipLines;
                } else {
                  return `Cumulative: ${context.parsed.y.toFixed(1)}%`;
                }
              },
              title: function(context) {
                const item = topItems[context[0].dataIndex];
                return `${item.itemCode}: ${item.description}`;
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: `WBS Level ${level} Items (Ranked by Cost)`
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: `Cost (${currency})`
            },
            ticks: {
              callback: function(value) {
                return formatCurrency(value as number, currency);
              }
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Cumulative Percentage (%)'
            },
            min: 0,
            max: 100,
            grid: {
              drawOnChartArea: false
            },
            ticks: {
              callback: function(value) {
                return value + '%';
              }
            }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [items, currency, onItemClick, level]);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available for this WBS level
      </div>
    );
  }

  return (
    <div className="relative h-64">
      <canvas ref={chartRef} />
      {level < 3 && (
        <div className="absolute top-2 right-2 text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
          Click bars to drill down
        </div>
      )}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
        Level {level} items only
      </div>
    </div>
  );
}
