import { useState, useEffect } from 'react';
import { api } from '../api';

function Settings({ config, onSave }) {
  const [formData, setFormData] = useState(config);
  const [saveStatus, setSaveStatus] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // config가 변경되면 formData 업데이트
  useEffect(() => {
    setFormData(config);
    setHasChanges(false);
  }, [config]);

  // 로컬 프로젝트 목록 로드
  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const list = await api.getProjects();
      setProjects(list || []);
    } catch (error) {
      console.error('프로젝트 목록 로드 실패:', error);
    } finally {
      setProjectsLoading(false);
    }
  }

  // selectedProjects가 null이면 "전체 선택"으로 간주 (기존 동작 호환)
  const selectedIds = formData.selectedProjects ?? projects.map((p) => p.id);
  const selectedSet = new Set(selectedIds);
  const allSelected = projects.length > 0 && projects.every((p) => selectedSet.has(p.id));

  function handleChange(e) {
    const { name, value } = e.target;
    const newFormData = {
      ...formData,
      [name]: name === 'uploadInterval' ? parseInt(value, 10) : value,
    };
    setFormData(newFormData);
    setHasChanges(true);
  }

  function setSelected(ids) {
    setFormData({ ...formData, selectedProjects: ids });
    setHasChanges(true);
  }

  function toggleProject(id) {
    if (selectedSet.has(id)) {
      setSelected(selectedIds.filter((x) => x !== id));
    } else {
      setSelected([...selectedIds, id]);
    }
  }

  function toggleAll() {
    if (allSelected) {
      setSelected([]);
    } else {
      setSelected(projects.map((p) => p.id));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // 저장 시 선택 목록을 확정한다. 단, 프로젝트 목록이 아직 로드되지 않았고
    // 한 번도 선택한 적이 없으면 null을 유지해 의도치 않은 "전체 미전송" 저장을 막는다.
    const finalSelected =
      formData.selectedProjects ?? (projects.length > 0 ? projects.map((p) => p.id) : null);
    const payload = { ...formData, selectedProjects: finalSelected };

    setSaveStatus('저장 중...');
    await onSave(payload);
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
        </div>

        {/* 전송 대상 프로젝트 선택 */}
        <div className="mt-6 bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-gray-200">
              전송할 프로젝트 선택
            </h3>
            <span className="text-sm text-gray-400">
              {selectedSet.size} / {projects.length} 선택됨
            </span>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            체크한 프로젝트의 로그만 서버로 전송됩니다. 체크 해제된 프로젝트는 전송되지 않습니다.
          </p>

          {projectsLoading ? (
            <div className="text-center text-gray-400 py-6">프로젝트 목록 로딩 중...</div>
          ) : projects.length === 0 ? (
            <div className="text-center text-gray-400 py-6">
              로컬에 Claude 프로젝트가 없습니다
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleAll}
                className="mb-3 px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                {allSelected ? '전체 해제' : '전체 선택'}
              </button>

              <div className="max-h-72 overflow-auto space-y-1 border border-gray-700 rounded-lg p-2">
                {projects.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(p.id)}
                      onChange={() => toggleProject(p.id)}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <div className="min-w-0">
                      <div className="text-sm text-white truncate">{p.name}</div>
                      <div className="text-xs text-gray-500 truncate">{p.path}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          type="submit"
          className={`w-full mt-6 px-6 py-3 rounded-lg font-semibold transition-colors ${
            hasChanges
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
          disabled={!hasChanges}
        >
          {hasChanges ? '저장' : '변경사항 없음'}
        </button>

        <div className="mt-6 bg-gray-800 p-6 rounded-lg border border-yellow-600">
          <h3 className="text-lg font-semibold text-yellow-400 mb-3">주의사항</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>• 서버 URL은 반드시 http:// 또는 https://로 시작해야 합니다</li>
            <li>• 업로드 주기가 너무 짧으면 서버에 부하를 줄 수 있습니다</li>
            <li>• 사용자 이메일은 서버에 데이터를 업로드할 때 식별용으로 사용됩니다</li>
            <li>• 선택한 프로젝트의 로그만 서버로 전송됩니다</li>
          </ul>
        </div>
      </form>
    </div>
  );
}

export default Settings;
