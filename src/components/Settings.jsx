import { useState, useEffect } from 'react';

function Settings({ config, onSave }) {
  const [formData, setFormData] = useState(config);
  const [saveStatus, setSaveStatus] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // config가 변경되면 formData 업데이트
  useEffect(() => {
    setFormData(config);
    setHasChanges(false);
  }, [config]);

  function handleChange(e) {
    const { name, value } = e.target;
    const newFormData = {
      ...formData,
      [name]: name === 'uploadInterval' ? parseInt(value, 10) : value,
    };
    setFormData(newFormData);
    setHasChanges(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    setSaveStatus('저장 중...');
    await onSave(formData);
    setSaveStatus('저장 완료!');
    setHasChanges(false);
    setTimeout(() => setSaveStatus(''), 2000);
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold">설정</h2>
        {saveStatus && (
          <div className="text-sm text-green-400 animate-pulse">
            {saveStatus}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              사용자 이메일 <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              name="userEmail"
              value={formData.userEmail}
              onChange={handleChange}
              className={`w-full px-4 py-2 bg-gray-700 border ${
                !formData.userEmail ? 'border-red-500' : 'border-gray-600'
              } rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="your-email@example.com"
            />
            <p className={`text-sm mt-1 ${
              !formData.userEmail ? 'text-red-400' : 'text-gray-400'
            }`}>
              {!formData.userEmail
                ? '⚠️ 필수 항목입니다. Claude를 시작하려면 이메일을 입력해주세요.'
                : '서버에 업로드할 때 사용되는 이메일입니다'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              서버 URL <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              name="serverUrl"
              value={formData.serverUrl}
              onChange={handleChange}
              required
              className={`w-full px-4 py-2 bg-gray-700 border ${
                !formData.serverUrl ? 'border-red-500' : 'border-gray-600'
              } rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="http://localhost:3498"
            />
            <p className={`text-sm mt-1 ${
              !formData.serverUrl ? 'text-red-400' : 'text-gray-400'
            }`}>
              {!formData.serverUrl
                ? '⚠️ 필수 항목입니다.'
                : '사용량 데이터를 업로드할 서버 주소입니다'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              업로드 주기 (초) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              name="uploadInterval"
              value={formData.uploadInterval}
              onChange={handleChange}
              required
              min="60"
              max="3600"
              className={`w-full px-4 py-2 bg-gray-700 border ${
                !formData.uploadInterval || formData.uploadInterval <= 0 ? 'border-red-500' : 'border-gray-600'
              } rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            <p className={`text-sm mt-1 ${
              !formData.uploadInterval || formData.uploadInterval <= 0 ? 'text-red-400' : 'text-gray-400'
            }`}>
              {!formData.uploadInterval || formData.uploadInterval <= 0
                ? '⚠️ 필수 항목입니다.'
                : '자동 업로드 주기 (60~3600초, 기본값: 600초 = 10분)'}
            </p>
          </div>

          <button
            type="submit"
            className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors ${
              hasChanges
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
            disabled={!hasChanges}
          >
            {hasChanges ? '저장' : '변경사항 없음'}
          </button>
        </div>

        <div className="mt-6 bg-gray-800 p-6 rounded-lg border border-yellow-600">
          <h3 className="text-lg font-semibold text-yellow-400 mb-3">주의사항</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>• 서버 URL은 반드시 http:// 또는 https://로 시작해야 합니다</li>
            <li>• 업로드 주기가 너무 짧으면 서버에 부하를 줄 수 있습니다</li>
            <li>• 사용자 이메일은 서버에 데이터를 업로드할 때 식별용으로 사용됩니다</li>
          </ul>
        </div>
      </form>
    </div>
  );
}

export default Settings;
