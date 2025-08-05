import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  AlertTriangle,
  Lightbulb,
  Download,
  Play,
  Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import backend from '~backend/client';
import ParetoChart from '../components/ParetoChart';
import WBSParetoChart, { WBSItem } from '../components/WBSParetoChart';
import WBSBreadcrumb, { WBSLevel } from '../components/WBSBreadcrumb';
import InsightsPanel from '../components/InsightsPanel';
import CurrencySelector, { Currency } from '../components/CurrencySelector';
import { formatCurrency } from '../utils/currency';

export default function ProjectAnalysis() {
  const { projectId } = useParams<{ projectId: string }>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [currentWBSLevel, setCurrentWBSLevel] = useState(1);
  const [currentParentItem, setCurrentParentItem] = useState<string | undefined>();
  const [wbsPath, setWbsPath] = useState<WBSLevel[]>([{ level: 1, description: 'Project Overview' }]);
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: analysisData, isLoading: isLoadingAnalysis, refetch: refetchAnalysis } = useQuery({
    queryKey: ['analysis', projectId],
    queryFn: () => backend.analysis.getAnalysisData({ projectId: projectId! }),
    enabled: !!projectId
  });

  const { data: wbsData, isLoading: isLoadingWBS, refetch: refetchWBS } = useQuery({
    queryKey: ['wbs', projectId, currentWBSLevel, currentParentItem],
    queryFn: () => backend.analysis.getWBSData({ 
      projectId: projectId!, 
      level: currentWBSLevel,
      parentItemNumber: currentParentItem
    }),
    enabled: !!projectId && analysisData?.project.status === 'processed'
  });

  const { data: insightsData, isLoading: isLoadingInsights, refetch: refetchInsights } = useQuery({
    queryKey: ['insights', projectId],
    queryFn: () => backend.insights.getInsights({ projectId: projectId! }),
    enabled: !!projectId
  });

  const handleProcessSpreadsheet = async () => {
    if (!projectId) return;

    setIsProcessing(true);
    try {
      await backend.analysis.processSpreadsheet({ projectId });
      toast({
        title: "Processing complete",
        description: "Pareto analysis has been completed successfully."
      });
      refetchAnalysis();
      refetchWBS();
    } catch (error) {
      console.error('Processing error:', error);
      toast({
        title: "Processing failed",
        description: "There was an error processing the spreadsheet.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateInsights = async () => {
    if (!projectId) return;

    setIsGeneratingInsights(true);
    try {
      await backend.insights.generateInsights({ projectId });
      toast({
        title: "Insights generated",
        description: "AI insights have been generated successfully."
      });
      refetchInsights();
    } catch (error) {
      console.error('Insights generation error:', error);
      toast({
        title: "Insights generation failed",
        description: "There was an error generating insights.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectId) return;

    const confirmed = window.confirm('Are you sure you want to delete this project? This action cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await backend.projects.deleteProject({ projectId });
      toast({
        title: "Project deleted",
        description: "The project has been deleted successfully."
      });
      navigate('/');
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Delete failed",
        description: "There was an error deleting the project.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleWBSItemClick = (item: WBSItem) => {
    if (currentWBSLevel >= 3) return; // Max 3 levels

    const newLevel = currentWBSLevel + 1;
    const newParentItem = item.itemNumber;
    
    setCurrentWBSLevel(newLevel);
    setCurrentParentItem(newParentItem);
    
    // Update breadcrumb path
    const newPath = [...wbsPath, {
      level: newLevel,
      itemNumber: newParentItem,
      description: item.description
    }];
    setWbsPath(newPath);
  };

  const handleBreadcrumbClick = (level: number, itemNumber?: string) => {
    setCurrentWBSLevel(level);
    setCurrentParentItem(itemNumber);
    
    // Update breadcrumb path
    const newPath = wbsPath.slice(0, level);
    setWbsPath(newPath);
  };

  if (isLoadingAnalysis) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Project not found</h3>
        <p className="text-gray-500">The requested project could not be found.</p>
      </div>
    );
  }

  const { project, totalItems, totalProjectCost, paretoCriticalItems, items } = analysisData;
  const needsProcessing = project.status === 'uploaded';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-600">
            {project.fileName} • Uploaded {new Date(project.uploadedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <CurrencySelector currency={currency} onCurrencyChange={setCurrency} />
          {needsProcessing && (
            <Button 
              onClick={handleProcessSpreadsheet}
              disabled={isProcessing}
              className="flex items-center space-x-2"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Process Spreadsheet</span>
                </>
              )}
            </Button>
          )}
          {!needsProcessing && (
            <Button 
              onClick={handleGenerateInsights}
              disabled={isGeneratingInsights}
              variant="outline"
              className="flex items-center space-x-2"
            >
              {isGeneratingInsights ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Lightbulb className="h-4 w-4" />
                  <span>Generate Insights</span>
                </>
              )}
            </Button>
          )}
          <Button variant="outline" className="flex items-center space-x-2">
            <Download className="h-4 w-4" />
            <span>Export Report</span>
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDeleteProject}
            disabled={isDeleting}
            className="flex items-center space-x-2"
          >
            {isDeleting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {needsProcessing ? (
        <Card>
          <CardContent className="text-center py-8">
            <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Ready for Processing</h3>
            <p className="text-gray-500 mb-4">
              Click "Process Spreadsheet" to perform Pareto analysis on your uploaded data.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalItems}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Project Cost</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalProjectCost, currency)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Critical Items (80%)</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{paretoCriticalItems}</div>
                <p className="text-xs text-muted-foreground">
                  {((paretoCriticalItems / totalItems) * 100).toFixed(1)}% of total items
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Potential Savings</CardTitle>
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {insightsData ? formatCurrency(insightsData.totalPotentialSavings, currency) : '-'}
                </div>
                <p className="text-xs text-muted-foreground">
                  From AI recommendations
                </p>
              </CardContent>
            </Card>
          </div>

          {/* WBS Navigation */}
          <WBSBreadcrumb 
            levels={wbsPath} 
            onLevelClick={handleBreadcrumbClick}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  WBS Level {currentWBSLevel} Pareto Analysis
                  {currentWBSLevel > 1 && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      (Drill-down Analysis)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingWBS ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : wbsData && wbsData.items.length > 0 ? (
                  <WBSParetoChart 
                    items={wbsData.items} 
                    currency={currency}
                    onItemClick={handleWBSItemClick}
                    level={currentWBSLevel}
                  />
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    No data available for this WBS level
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  Critical Items - Level {currentWBSLevel}
                  {wbsData && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      ({wbsData.items.filter(item => item.isParetoCritical).length} items)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {wbsData?.items.filter(item => item.isParetoCritical).slice(0, 10).map((item) => (
                    <div 
                      key={item.id} 
                      className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                        currentWBSLevel < 3 ? 'hover:bg-gray-50 cursor-pointer' : ''
                      }`}
                      onClick={() => currentWBSLevel < 3 && handleWBSItemClick(item)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.description}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.itemNumber && `Item: ${item.itemNumber} • `}
                          {item.itemCount} sub-item{item.itemCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatCurrency(item.totalCost, currency)}</p>
                        <Badge variant="secondary" className="text-xs">
                          {item.cumulativePercentage.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
                {currentWBSLevel < 3 && wbsData?.items.some(item => item.isParetoCritical) && (
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    Click items to drill down to the next level
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Original Pareto Chart for reference */}
          {currentWBSLevel === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Overall Project Pareto Analysis (All Items)</CardTitle>
              </CardHeader>
              <CardContent>
                <ParetoChart items={items} currency={currency} />
              </CardContent>
            </Card>
          )}

          <InsightsPanel 
            projectId={projectId!} 
            insights={insightsData?.insights || []}
            isLoading={isLoadingInsights}
            currency={currency}
          />
        </>
      )}
    </div>
  );
}
