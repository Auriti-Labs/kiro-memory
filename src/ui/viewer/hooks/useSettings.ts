import { useState, useEffect } from 'react';
import { ViewerSettings } from '../types';

export function useSettings() {
  const [settings, setSettings] = useState<ViewerSettings>({
    sidebarOpen: true,
    selectedProject: null,
    theme: 'system'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem('kiro-memory-settings') || localStorage.getItem('contextkit-settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to parse settings:', error);
      }
    }
  }, []);

  const saveSettings = async (newSettings: ViewerSettings) => {
    setIsSaving(true);
    try {
      localStorage.setItem('kiro-memory-settings', JSON.stringify(newSettings));
      setSettings(newSettings);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  return { settings, saveSettings, isSaving, saveStatus };
}
