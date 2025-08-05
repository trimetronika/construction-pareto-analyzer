import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface BoQItem {
  id: number;
  description: string;
  totalCost: number;
  cumulativePercentage?: number;
  isParetoCritical: boolean;
}

interface ParetoChartProps {
  items: BoQItem[];
}

export default function ParetoChart({ items }: ParetoChartProps) {
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
    const labels = topItems.map((item, index) => `${index + 1}. ${item.description.substring(0, 30)}...`);
    const costs = topItems.map(item => item.totalCost);
    const cumulativePercentages = topItems.map(item => item.cumulativePercentage || 0);
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
        plugins: {
          legend: {
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                if (context.datasetIndex === 0) {
                  return `Cost: $${context.parsed.y.toLocaleString()}`;
                } else {
                  return `Cumulative: ${context.parsed.y.toFixed(1)}%`;
                }
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'BoQ Items (Ranked by Cost)'
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
              text: 'Cost ($)'
            },
            ticks: {
              callback: function(value) {
                return '$' + (value as number).toLocaleString();
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
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available for chart
      </div>
    );
  }

  return (
    <div className="relative h-64">
      <canvas ref={chartRef} />
    </div>
  );
}
