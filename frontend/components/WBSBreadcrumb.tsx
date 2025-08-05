import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface WBSLevel {
  level: number;
  itemNumber?: string;
  description: string;
}

interface WBSBreadcrumbProps {
  levels: WBSLevel[];
  onLevelClick: (level: number, itemNumber?: string) => void;
}

export default function WBSBreadcrumb({ levels, onLevelClick }: WBSBreadcrumbProps) {
  return (
    <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg border">
      <Home className="h-4 w-4 text-gray-500" />
      <span className="text-sm text-gray-600">WBS Path:</span>
      
      {levels.map((level, index) => (
        <React.Fragment key={index}>
          {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
          <Button
            variant={index === levels.length - 1 ? "default" : "ghost"}
            size="sm"
            onClick={() => onLevelClick(level.level, level.itemNumber)}
            className="text-xs"
          >
            Level {level.level}: {level.description}
          </Button>
        </React.Fragment>
      ))}
    </div>
  );
}
