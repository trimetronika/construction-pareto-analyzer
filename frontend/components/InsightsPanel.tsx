import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Lightbulb, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle,
  DollarSign,
  Target
} from 'lucide-react';
import { formatCurrency, Currency } from '../utils/currency';

interface AIInsight {
  id: number;
  insightType: string;
  title: string;
  description: string;
  recommendation: string;
  potentialSavings?: number;
  confidenceScore: number;
  createdAt: Date;
}

interface WBSItem {
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

interface WBSData {
  projectId: string;
  level: number;
  parentItemCode?: string;
  totalCost: number;
  items: WBSItem[];
}

interface InsightsPanelProps {
  projectId: string;
  insights: AIInsight[];
  isLoading: boolean;
  currency?: Currency;
  currentWBSData?: WBSData | null;
}

export default function InsightsPanel({ 
  projectId, 
  insights, 
  isLoading, 
  currency = 'USD',
  currentWBSData 
}: InsightsPanelProps) {
  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'cost_concentration': return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'material_substitution': return <Target className="h-5 w-5 text-blue-500" />;
      case 'quantity_optimization': return <TrendingDown className="h-5 w-5 text-green-500" />;
      case 'rate_variance': return <DollarSign className="h-5 w-5 text-purple-500" />;
      case 'design_optimization': return <CheckCircle className="h-5 w-5 text-indigo-500" />;
      default: return <Lightbulb className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-800';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // Generate real-time insights based on current WBS data
  const generateCurrentLevelInsights = () => {
    if (!currentWBSData || currentWBSData.items.length === 0) return [];

    const criticalItems = currentWBSData.items.filter(item => item.isParetoCritical);
    const realTimeInsights = [];

    // High cost concentration analysis
    if (criticalItems.length > 0) {
      const topItem = criticalItems[0];
      const itemPercentage = (topItem.totalCost / currentWBSData.totalCost) * 100;
      
      if (itemPercentage > 15) {
        realTimeInsights.push({
          type: 'cost_concentration',
          title: `High Cost Concentration in ${topItem.itemCode}`,
          description: `Item "${topItem.description}" represents ${itemPercentage.toFixed(1)}% of current level cost (${formatCurrency(topItem.totalCost, currency)}).`,
          recommendation: 'Consider value engineering alternatives, bulk procurement strategies, or alternative specifications for this high-impact item.',
          potentialSavings: topItem.totalCost * 0.1,
          confidence: 0.85
        });
      }
    }

    // Rate variance analysis
    const unitRateGroups = new Map<string, number[]>();
    criticalItems.forEach(item => {
      if (item.unit && item.unitRate) {
        if (!unitRateGroups.has(item.unit)) {
          unitRateGroups.set(item.unit, []);
        }
        unitRateGroups.get(item.unit)!.push(item.unitRate);
      }
    });

    for (const [unit, rates] of unitRateGroups) {
      if (rates.length > 1) {
        const maxRate = Math.max(...rates);
        const minRate = Math.min(...rates);
        const variance = ((maxRate - minRate) / minRate) * 100;
        
        if (variance > 20) {
          realTimeInsights.push({
            type: 'rate_variance',
            title: `Rate Variance in ${unit} Items`,
            description: `Unit rates for ${unit} items vary by ${variance.toFixed(1)}% (${formatCurrency(minRate, currency)} - ${formatCurrency(maxRate, currency)}).`,
            recommendation: 'Standardize procurement processes and negotiate consistent rates with suppliers for similar items.',
            potentialSavings: (maxRate - minRate) * rates.length * 50,
            confidence: 0.70
          });
        }
      }
    }

    // Quantity optimization
    const highQuantityItems = criticalItems.filter(item => item.quantity && item.quantity > 100);
    if (highQuantityItems.length > 0) {
      const totalHighQuantityCost = highQuantityItems.reduce((sum, item) => sum + item.totalCost, 0);
      realTimeInsights.push({
        type: 'quantity_optimization',
        title: 'Bulk Procurement Opportunity',
        description: `${highQuantityItems.length} high-quantity items identified with total cost of ${formatCurrency(totalHighQuantityCost, currency)}.`,
        recommendation: 'Negotiate volume discounts and explore consortium purchasing opportunities for these high-quantity items.',
        potentialSavings: totalHighQuantityCost * 0.05,
        confidence: 0.75
      });
    }

    return realTimeInsights;
  };

  const currentLevelInsights = generateCurrentLevelInsights();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Lightbulb className="h-5 w-5" />
            <span>AI Insights & Recommendations</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Lightbulb className="h-5 w-5" />
          <span>AI Insights & Recommendations</span>
          {currentWBSData && (
            <Badge variant="outline" className="ml-2">
              Level {currentWBSData.level} Analysis
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Real-time insights based on current WBS level */}
        {currentLevelInsights.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
              <Target className="h-4 w-4 mr-2 text-blue-500" />
              Current Level Insights
              {currentWBSData?.parentItemCode && (
                <span className="text-gray-500 ml-2">({currentWBSData.parentItemCode})</span>
              )}
            </h4>
            <div className="space-y-4">
              {currentLevelInsights.map((insight, index) => (
                <div key={`current-${index}`} className="border rounded-lg p-4 space-y-3 bg-blue-50 border-blue-200">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      {getInsightIcon(insight.type)}
                      <div>
                        <h3 className="font-medium text-gray-900">{insight.title}</h3>
                        <Badge className={getConfidenceColor(insight.confidence)}>
                          {(insight.confidence * 100).toFixed(0)}% confidence
                        </Badge>
                      </div>
                    </div>
                    {insight.potentialSavings && (
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Potential Savings</p>
                        <p className="text-lg font-bold text-green-600">
                          {formatCurrency(insight.potentialSavings, currency)}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Analysis:</p>
                      <p className="text-sm text-gray-600">{insight.description}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Recommendation:</p>
                      <p className="text-sm text-gray-600">{insight.recommendation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historical insights from database */}
        {insights.length === 0 && currentLevelInsights.length === 0 ? (
          <div className="text-center py-8">
            <Lightbulb className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No insights available</h3>
            <p className="text-gray-500 mb-4">
              {currentWBSData 
                ? "No optimization opportunities found for the current WBS level."
                : "Click \"Generate Insights\" to get AI-powered recommendations for cost optimization."
              }
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {insights.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  Project-wide Insights
                </h4>
                <div className="space-y-4">
                  {insights.map((insight) => (
                    <div key={insight.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          {getInsightIcon(insight.insightType)}
                          <div>
                            <h3 className="font-medium text-gray-900">{insight.title}</h3>
                            <Badge className={getConfidenceColor(insight.confidenceScore)}>
                              {(insight.confidenceScore * 100).toFixed(0)}% confidence
                            </Badge>
                          </div>
                        </div>
                        {insight.potentialSavings && (
                          <div className="text-right">
                            <p className="text-sm text-gray-500">Potential Savings</p>
                            <p className="text-lg font-bold text-green-600">
                              {formatCurrency(insight.potentialSavings, currency)}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-1">Analysis:</p>
                          <p className="text-sm text-gray-600">{insight.description}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-1">Recommendation:</p>
                          <p className="text-sm text-gray-600">{insight.recommendation}</p>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2 pt-2">
                        <Button size="sm" variant="outline">
                          View Details
                        </Button>
                        <Button size="sm" variant="outline">
                          Implement
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                <h4 className="font-medium text-blue-900">Summary</h4>
              </div>
              <p className="text-sm text-blue-800">
                {currentLevelInsights.length + insights.length} optimization opportunities identified with potential savings of{' '}
                <span className="font-bold">
                  {formatCurrency(
                    [...currentLevelInsights, ...insights].reduce((sum, insight) => 
                      sum + (insight.potentialSavings || 0), 0
                    ), 
                    currency
                  )}
                </span>
                {currentWBSData && (
                  <span>
                    {' '}for the current analysis level ({currentWBSData.level === 1 ? 'Project Overview' : 
                    `Level ${currentWBSData.level} under ${currentWBSData.parentItemCode}`}).
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
