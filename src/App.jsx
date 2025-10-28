import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import LogViewer from './components/LogViewer';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState({ running: false, uploadCount: 0 });
  const [usageData, setUsageData] = useState({ daily: [] });
  const [usageDataLoading, setUsageDataLoading] = useState(true);

  // Electron API가 있는지 확인 (함수로)
  const isElectron = () => {
    return typeof window !== 'undefined' && window.electronAPI !== undefined;
  };

  useEffect(() => {
    loadConfig();
    updateStatus();

    const statusInterval = setInterval(updateStatus, 5000);

    return () => {
      clearInterval(statusInterval);
    };
  }, []);

  async function loadConfig() {
    if (!isElectron()) {
      // 브라우저 모드: 기본값 사용
      setConfig({
        serverUrl: 'http://10.12.200.99:3498',
        uploadInterval: 600,
        userEmail: '',
      });
      return;
    }
    const cfg = await window.electronAPI.getConfig();
    setConfig(cfg);
  }

  async function updateStatus() {
    if (!isElectron()) {
      setStatus({ running: false, uploadCount: 0 });
      return;
    }
    const st = await window.electronAPI.getStatus();
    setStatus(st);
  }


  async function handleSaveConfig(newConfig) {
    if (!isElectron()) {
      setConfig(newConfig);
      return;
    }

    const result = await window.electronAPI.saveConfig(newConfig);

    if (result.success) {
      setConfig(newConfig);
    } else {
      alert(`저장 실패: ${result.error}`);
    }
  }

  async function handleUploadNow() {
    if (!isElectron()) {
      alert('Electron 환경에서만 사용 가능합니다');
      return;
    }
    try {
      setUsageDataLoading(true);
      const result = await window.electronAPI.uploadNow();
      if (result && result.daily) {
        setUsageData(result);
      }
      setUsageDataLoading(false);
      updateStatus();
      alert('업로드가 완료되었습니다');
    } catch (error) {
      setUsageDataLoading(false);
      alert(`업로드 실패: ${error.message}`);
    }
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <div className="w-64 bg-gray-800 p-6 flex flex-col">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-blue-400">Claude Usage</h1>
          <p className="text-sm text-gray-400 mt-1">Tracker</p>
        </div>

        <nav className="flex-1 space-y-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            대시보드
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            설정
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'logs'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            로그
          </button>
        </nav>

        <div className="mt-auto space-y-3">
          <div className="p-4 bg-gray-700 rounded-lg">
            <div className="text-sm text-gray-400 mb-1">업로드 통계</div>
            <div className="text-xs text-gray-400 mt-2">
              총 업로드: {status.uploadCount}회
            </div>
            {status.lastUploadTime && (
              <div className="text-xs text-gray-400 mt-1">
                마지막: {new Date(status.lastUploadTime).toLocaleString('ko-KR', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'dashboard' && (
          <Dashboard
            status={status}
            onUploadNow={handleUploadNow}
            usageData={usageData}
            setUsageData={setUsageData}
            loading={usageDataLoading}
            setLoading={setUsageDataLoading}
          />
        )}
        {activeTab === 'settings' && (
          <Settings config={config} onSave={handleSaveConfig} />
        )}
        {activeTab === 'logs' && <LogViewer />}
      </div>
    </div>
  );
}

export default App;
