import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'id';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Terjemahan untuk bahasa Inggris dan Indonesia
const translations = {
  en: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.upload_project': 'Upload Project',
    'nav.app_title': 'Construction Pareto Analyzer',
    
    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.welcome': 'Welcome to Construction Pareto Analyzer',
    'dashboard.description': 'Analyze your construction projects with Pareto analysis',
    'dashboard.recent_projects': 'Recent Projects',
    'dashboard.no_projects': 'No projects found',
    'dashboard.upload_new': 'Upload New Project',
    'dashboard.total_projects': 'Total Projects',
    'dashboard.processed_projects': 'Processed Projects',
    'dashboard.recent_uploads': 'Recent Uploads',
    
    // Upload
    'upload.title': 'Upload Project',
    'upload.description': 'Upload your construction project data for analysis',
    'upload.select_file': 'Select File',
    'upload.drag_drop': 'Drag and drop your file here, or click to select',
    'upload.supported_formats': 'Supported formats: CSV, Excel',
    'upload.upload_button': 'Upload Project',
    'upload.uploading': 'Uploading...',
    'upload.success': 'Project uploaded successfully!',
    'upload.error': 'Error uploading project',
    'upload.project_details': 'Project Details',
    'upload.project_name': 'Project Name',
    'upload.project_name_placeholder': 'Enter project name (e.g., Arumaya Office Building)',
    'upload.spreadsheet_file': 'Spreadsheet File',
    'upload.choose_file': 'Choose a file',
    'upload.file_requirements': 'CSV or XLSX files only. Max file size: 10MB',
    'upload.invalid_file_type': 'Please select a CSV or XLSX file.',
    'upload.project_name_required': 'Please enter a project name.',
    'upload.file_required': 'Please select a spreadsheet file to upload.',
    
    // Analysis
    'analysis.title': 'Project Analysis',
    'analysis.pareto_chart': 'Pareto Chart',
    'analysis.insights': 'Insights',
    'analysis.ve_suggestions': 'Value Engineering Suggestions',
    'analysis.back_to_dashboard': 'Back to Dashboard',
    
    // Common
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.view': 'View',
    'common.close': 'Close',
    'common.yes': 'Yes',
    'common.no': 'No',
    
    // Language selector
    'language.english': 'English',
    'language.indonesian': 'Indonesian',
    'language.select': 'Select Language',
  },
  id: {
    // Navigation
    'nav.dashboard': 'Dasbor',
    'nav.upload_project': 'Unggah Proyek',
    'nav.app_title': 'Analisis Pareto Konstruksi',
    
    // Dashboard
    'dashboard.title': 'Dasbor',
    'dashboard.welcome': 'Selamat datang di Analisis Pareto Konstruksi',
    'dashboard.description': 'Analisis proyek konstruksi Anda dengan analisis Pareto',
    'dashboard.recent_projects': 'Proyek Terbaru',
    'dashboard.no_projects': 'Tidak ada proyek ditemukan',
    'dashboard.upload_new': 'Unggah Proyek Baru',
    'dashboard.total_projects': 'Total Proyek',
    'dashboard.processed_projects': 'Proyek Diproses',
    'dashboard.recent_uploads': 'Unggahan Terbaru',
    
    // Upload
    'upload.title': 'Unggah Proyek',
    'upload.description': 'Unggah data proyek konstruksi Anda untuk analisis',
    'upload.select_file': 'Pilih File',
    'upload.drag_drop': 'Seret dan lepas file Anda di sini, atau klik untuk memilih',
    'upload.supported_formats': 'Format yang didukung: CSV, Excel',
    'upload.upload_button': 'Unggah Proyek',
    'upload.uploading': 'Mengunggah...',
    'upload.success': 'Proyek berhasil diunggah!',
    'upload.error': 'Error saat mengunggah proyek',
    'upload.project_details': 'Detail Proyek',
    'upload.project_name': 'Nama Proyek',
    'upload.project_name_placeholder': 'Masukkan nama proyek (contoh: Gedung Kantor Arumaya)',
    'upload.spreadsheet_file': 'File Spreadsheet',
    'upload.choose_file': 'Pilih file',
    'upload.file_requirements': 'File CSV atau XLSX saja. Ukuran maksimal: 10MB',
    'upload.invalid_file_type': 'Silakan pilih file CSV atau XLSX.',
    'upload.project_name_required': 'Silakan masukkan nama proyek.',
    'upload.file_required': 'Silakan pilih file spreadsheet untuk diunggah.',
    
    // Analysis
    'analysis.title': 'Analisis Proyek',
    'analysis.pareto_chart': 'Grafik Pareto',
    'analysis.insights': 'Wawasan',
    'analysis.ve_suggestions': 'Saran Value Engineering',
    'analysis.back_to_dashboard': 'Kembali ke Dasbor',
    
    // Common
    'common.loading': 'Memuat...',
    'common.error': 'Error',
    'common.success': 'Berhasil',
    'common.cancel': 'Batal',
    'common.save': 'Simpan',
    'common.delete': 'Hapus',
    'common.edit': 'Edit',
    'common.view': 'Lihat',
    'common.close': 'Tutup',
    'common.yes': 'Ya',
    'common.no': 'Tidak',
    
    // Language selector
    'language.english': 'English',
    'language.indonesian': 'Bahasa Indonesia',
    'language.select': 'Pilih Bahasa',
  }
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations[typeof language]] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
