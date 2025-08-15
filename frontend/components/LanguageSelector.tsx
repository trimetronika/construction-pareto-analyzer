import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

export default function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();

  const handleLanguageChange = (value: string) => {
    setLanguage(value as 'en' | 'id');
  };

  return (
    <div className="flex items-center space-x-2">
      <Globe className="h-4 w-4 text-gray-600" />
      <Select value={language} onValueChange={handleLanguageChange}>
        <SelectTrigger className="w-[140px] h-8">
          <SelectValue placeholder={t('language.select')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">
            <div className="flex items-center space-x-2">
              <span className="text-sm">🇺🇸</span>
              <span>{t('language.english')}</span>
            </div>
          </SelectItem>
          <SelectItem value="id">
            <div className="flex items-center space-x-2">
              <span className="text-sm">🇮🇩</span>
              <span>{t('language.indonesian')}</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
