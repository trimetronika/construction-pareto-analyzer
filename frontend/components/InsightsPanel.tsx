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

interface InsightsPanelProps {
  projectId: string;
  insights: AIInsight[];
  isLoading: boolean;
}

export default function InsightsPanel({ projectId, insights, isLoading }: InsightsPanelProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

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
        </CardTitle>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <div className="text-center py-8">
            <Lightbulb className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No insights generated yet</h3>
            <p className="text-gray-500 mb-4">
              Click "Generate Insights" to get AI-powered recommendations for cost optimization.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
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
                        {formatCurrency(insight.potentialSavings)}
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
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                <h4 className="font-medium text-blue-900">Summary</h4>
              </div>
              <p className="text-sm text-blue-800">
                {insights.length} optimization opportunities identified with potential savings of{' '}
                <span className="font-bold">
                  {formatCurrency(insights.reduce((sum, insight) => sum + (insight.potentialSavings || 0), 0))}
                </span>
                . Implementing these recommendations could reduce project costs by{' '}
                {((insights.reduce((sum, insight) => sum + (insight.potentialSavings || 0), 0) / 1000000) * 100).toFixed(1)}%.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
