import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

function Dashboard({ status, onUploadNow, usageData, setUsageData, loading, setLoading }) {
  const isElectron = () => {
    return typeof window !== 'undefined' && window.electronAPI !== undefined;
  };

  useEffect(() => {
    // 데이터가 없거나 비어있을 때만 로드
    if (usageData.daily.length === 0) {
      loadUsageData();
    }
    const interval = setInterval(loadUsageData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadUsageData() {
    if (!isElectron()) {
      setLoading(false);
      return;
    }
    try {
      const result = await window.electronAPI.getUsageData();
      if (result && result.daily) {
        setUsageData(result);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to load usage data:', error);
      setLoading(false);
    }
  }

  const recentData = usageData.daily.slice(-30);

  const tokenChartData = {
    labels: recentData.map((d) => d.date),
    datasets: [
      {
        label: '입력 토큰',
        data: recentData.map((d) => d.totalInputTokens),
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
      },
      {
        label: '출력 토큰',
        data: recentData.map((d) => d.totalOutputTokens),
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
      },
      {
        label: '캐시 생성',
        data: recentData.map((d) => d.totalCacheWriteTokens),
        backgroundColor: 'rgba(251, 146, 60, 0.7)',
      },
      {
        label: '캐시 읽기',
        data: recentData.map((d) => d.totalCacheReadTokens),
        backgroundColor: 'rgba(168, 85, 247, 0.7)',
      },
    ],
  };

  const requestChartData = {
    labels: recentData.map((d) => d.date),
    datasets: [
      {
        label: '요청 수',
        data: recentData.map((d) => d.requestCount),
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: '#e5e7eb',
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#9ca3af' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      y: {
        ticks: { color: '#9ca3af' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
    },
  };

  const totalStats = recentData.reduce(
    (acc, day) => ({
      totalTokens: acc.totalTokens + day.totalTokens,
      totalRequests: acc.totalRequests + day.requestCount,
      totalInput: acc.totalInput + day.totalInputTokens,
      totalOutput: acc.totalOutput + day.totalOutputTokens,
    }),
    { totalTokens: 0, totalRequests: 0, totalInput: 0, totalOutput: 0 }
  );

  // 오늘 날짜 (로컬 시간대 기준)
  const getTodayLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayKST = getTodayLocal();
  const todayData = usageData.daily.find((d) => d.date === todayKST) || {
    totalTokens: 0,
    requestCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheWriteTokens: 0,
    totalCacheReadTokens: 0,
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold">대시보드</h2>
        <button
          onClick={onUploadNow}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          즉시 업로드
        </button>
      </div>

      {/* 오늘 사용량 */}
      <div className="mb-8 bg-gradient-to-r from-blue-900 to-purple-900 p-6 rounded-lg border border-blue-700">
        <h3 className="text-xl font-semibold mb-4 text-blue-200">오늘 사용량 ({todayKST})</h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-300 mb-1">총 토큰</div>
            <div className="text-xl font-bold text-white break-all">
              {todayData.totalTokens.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-300 mb-1">요청 수</div>
            <div className="text-xl font-bold text-white break-all">
              {todayData.requestCount.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-300 mb-1">입력 토큰</div>
            <div className="text-xl font-bold text-white break-all">
              {todayData.totalInputTokens.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-300 mb-1">출력 토큰</div>
            <div className="text-xl font-bold text-white break-all">
              {todayData.totalOutputTokens.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* 전체 통계 (최근 30일) */}
      <h3 className="text-xl font-semibold mb-4">전체 통계 (최근 30일)</h3>
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-sm text-gray-400 mb-2">총 토큰</div>
          <div className="text-2xl font-bold text-blue-400 break-all">
            {totalStats.totalTokens.toLocaleString()}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-sm text-gray-400 mb-2">총 요청</div>
          <div className="text-2xl font-bold text-green-400 break-all">
            {totalStats.totalRequests.toLocaleString()}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-sm text-gray-400 mb-2">입력 토큰</div>
          <div className="text-2xl font-bold text-orange-400 break-all">
            {totalStats.totalInput.toLocaleString()}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-sm text-gray-400 mb-2">출력 토큰</div>
          <div className="text-2xl font-bold text-purple-400 break-all">
            {totalStats.totalOutput.toLocaleString()}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">데이터 로딩 중...</div>
      ) : recentData.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          아직 사용량 데이터가 없습니다
        </div>
      ) : (
        <>
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mb-6">
            <h3 className="text-xl font-semibold mb-4">토큰 사용량 (최근 30일)</h3>
            <Bar data={tokenChartData} options={chartOptions} />
          </div>

          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-xl font-semibold mb-4">요청 수 (최근 30일)</h3>
            <Line data={requestChartData} options={chartOptions} />
          </div>
        </>
      )}

      <div className="mt-8 bg-gray-800 p-6 rounded-lg border border-gray-700">
        <h3 className="text-xl font-semibold mb-4">업로드 통계</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-400">총 업로드 횟수</div>
            <div className="text-2xl font-bold text-blue-400">{status.uploadCount}회</div>
          </div>
          <div>
            <div className="text-sm text-gray-400">마지막 업로드</div>
            <div className="text-lg text-gray-300">
              {status.lastUploadTime
                ? new Date(status.lastUploadTime).toLocaleString('ko-KR')
                : '없음'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
