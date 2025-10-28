import { useState, useEffect, useRef } from 'react';

function LogViewer() {
  const [logs, setLogs] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef(null);

  const isElectron = () => {
    return typeof window !== 'undefined' && window.electronAPI !== undefined;
  };

  useEffect(() => {
    loadLogs();

    const interval = setInterval(loadLogs, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  async function loadLogs() {
    if (!isElectron()) {
      setLogs([]);
      return;
    }
    const result = await window.electronAPI.getLogs();
    setLogs(result);
  }

  function getLogColor(level) {
    switch (level) {
      case 'success':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      case 'stderr':
        return 'text-red-300';
      case 'stdout':
        return 'text-blue-300';
      default:
        return 'text-gray-300';
    }
  }

  function getLogIcon(level) {
    switch (level) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      case 'stderr':
        return '⊗';
      case 'stdout':
        return '⊙';
      default:
        return '•';
    }
  }


  return (
    <div className="p-8 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">로그</h2>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-4 h-4"
            />
            자동 스크롤
          </label>
        </div>
      </div>

      <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="h-full overflow-y-auto p-4 font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              아직 로그가 없습니다
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`flex gap-3 py-1 hover:bg-gray-700 px-2 rounded ${getLogColor(
                    log.level
                  )}`}
                >
                  <span className="text-gray-500 shrink-0 w-5 text-center">
                    {getLogIcon(log.level)}
                  </span>
                  <span className="text-gray-400 shrink-0 w-40">
                    {new Date(log.timestamp).toLocaleString('ko-KR', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <span className="text-gray-500 shrink-0 w-16 uppercase text-xs">
                    [{log.level}]
                  </span>
                  <span className="flex-1 break-all">{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">총 로그 수: {logs.length}</span>
          <span className="text-gray-400">최대 1000개까지 표시됩니다</span>
        </div>
      </div>
    </div>
  );
}

export default LogViewer;
