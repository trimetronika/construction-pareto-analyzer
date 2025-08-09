import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { formatCurrency, Currency } from '../utils/currency';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(...registerables, ChartDataLabels);

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
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current || items.length === 0) return;

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    // Prepare data for top 20 items
    const topItems = items.slice(0, 20);
    const labels = topItems.map((item) => {
      const truncatedDesc = item.description.substring(0, 20);
      return `${item.itemCode}: ${truncatedDesc}${item.description.length > 20 ? '...' : ''}`;
    });
    const costs = topItems.map(item => item.totalCost);
    const cumulativePercentages = topItems.map(item => item.cumulativePercentage);
    const colors = topItems.map(item => item.isParetoCritical ? '#3b82f6' : '#94a3b8');

    // Set consistent minimum width (600px) with dynamic adjustment
    const itemWidth = 60; // Reduced width per item
    const dynamicWidth = Math.max(topItems.length * itemWidth, 600); // Minimum 600px

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '', // Remove label to avoid clutter
            data: costs,
            backgroundColor: colors,
            borderColor: colors,
            borderWidth: 1,
            yAxisID: 'y',
            barPercentage: 0.9,
            categoryPercentage: 0.8,
            datalabels: {
              display: false // Remove data labels from bars
            }
          },
          {
            label: 'Persentase Kumulatif (%)', // Specify unit in legend
            data: cumulativePercentages,
            type: 'line',
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2,
            fill: false,
            yAxisID: 'y1',
            pointBackgroundColor: '#ef4444',
            pointBorderColor: '#fff',
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 1000,
          easing: 'easeOutQuad'
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        onClick: (event, elements) => {
          if (elements.length > 0 && onItemClick && level < 3) {
            const index = elements[0].index;
            const item = topItems[index];
            onItemClick(item);
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              padding: 10,
              generateLabels: (chart) => {
                return chart.data.datasets.map((dataset, i) => ({
                  text: dataset.label || '',
                  fillStyle: dataset.borderColor as string,
                  hidden: !chart.isDatasetVisible(i),
                  datasetIndex: i
                }));
              }
            }
          },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#f9fafb',
            bodyColor: '#d1d5db',
            borderColor: '#4b5563',
            borderWidth: 1,
            cornerRadius: 4,
            padding: 8,
            callbacks: {
              label: function(context) {
                const item = topItems[context.dataIndex];
                const lines = [];
                if (context.datasetIndex === 0) {
                  lines.push(`Biaya: ${formatCurrency(context.parsed.y, currency)}`);
                  if (item.quantity) lines.push(`Kuantitas: ${item.quantity.toLocaleString()}`);
                  if (item.unit) lines.push(`Unit: ${item.unit}`);
                  if (item.unitRate) lines.push(`Tarif Unit: ${formatCurrency(item.unitRate, currency)}`);
                } else {
                  lines.push(`Kumulatif: ${context.parsed.y.toFixed(1)}%`);
                }
                return lines;
              },
              title: function(context) {
                const item = topItems[context[0].dataIndex];
                return `${item.itemCode}: ${item.description}`;
              }
            }
          },
          datalabels: {
            display: false // Disabled globally
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: `Item Level WBS ${level} (Dipesan Berdasarkan Biaya)`
            },
            ticks: {
              maxRotation: 0,
              padding: 5,
              font: {
                size: 10
              },
              display: true // Show ticks but handle overlap with tooltip
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: `Biaya (${currency})`
            },
            ticks: {
              callback: function(value) {
                return formatCurrency(value as number, currency);
              },
              padding: 5
            },
            grid: {
              color: '#e5e7eb'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Persentase Kumulatif (%)'
            },
            min: 0,
            max: 100,
            grid: {
              drawOnChartArea: false
            },
            ticks: {
              callback: function(value) {
                return value + '%';
              },
              padding: 5
            }
          }
        }
      },
      plugins: [{
        beforeInit: (chart) => {
          const originalFit = chart.legend.fit;
          chart.legend.fit = function fit() {
            originalFit.call(this);
            this.height += 10;
          };
        }
      }]
    });

    // Set container width dynamically
    if (chartContainerRef.current) {
      chartContainerRef.current.style.width = `${dynamicWidth}px`;
      chartContainerRef.current.style.minWidth = '600px'; // Ensure minimum width
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [items, currency, onItemClick, level]);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 text-gray-600 rounded-lg shadow">
        Tidak ada data tersedia untuk level WBS ini
      </div>
    );
  }

  return (
    <div ref={chartContainerRef} className="relative w-full max-w-full overflow-x-auto bg-white rounded-lg shadow-lg p-4">
      <div className="w-full h-[400px] md:h-[500px]">
        <canvas ref={chartRef} />
      </div>
      {level < 3 && (
        <div className="absolute top-2 right-2 text-xs text-gray-600 bg-white/90 px-2 py-1 rounded shadow-md">
          Gulir atau klik batang untuk zoom
        </div>
      )}
      <div className="absolute bottom-2 left-2 text-xs text-gray-600 bg-white/90 px-2 py-1 rounded shadow-md">
        Hanya item Level {level}
      </div>
    </div>
  );
}