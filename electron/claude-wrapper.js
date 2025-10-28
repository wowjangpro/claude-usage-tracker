import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createReadStream } from 'fs';
import FormData from 'form-data';
import http from 'http';
import https from 'https';

export class ClaudeWrapper {
  constructor() {
    this.configPath = path.join(os.homedir(), '.claude-usage-config');
    this.logPath = path.join(os.homedir(), '.claude-code-wrapper');
    this.logs = [];
    this.maxLogs = 1000;
    this.uploadCount = 0;
    this.lastUploadTime = null;
    this.uploadTimer = null;
    this.startAutoUpload();
  }

  async startAutoUpload() {
    // 기존 타이머가 있으면 중지
    if (this.uploadTimer) {
      clearInterval(this.uploadTimer);
    }

    const config = await this.getConfig();

    // 필수 설정이 없으면 자동 업로드 시작하지 않음
    if (!config.userEmail) {
      this.addLog('warning', '사용자 이메일이 설정되지 않아 자동 업로드가 비활성화되었습니다');
      return;
    }

    const intervalMs = (config.uploadInterval || 600) * 1000;
    this.addLog('info', `자동 업로드 시작 (${config.uploadInterval}초 주기)`);

    // 즉시 한 번 실행
    this.scheduleUpload();

    // 주기적 실행
    this.uploadTimer = setInterval(() => {
      this.scheduleUpload();
    }, intervalMs);
  }

  async scheduleUpload() {
    try {
      await this.uploadUsageData();
    } catch (error) {
      this.addLog('error', `자동 업로드 실패: ${error.message}`);
    }
  }

  async stop() {
    if (this.uploadTimer) {
      clearInterval(this.uploadTimer);
      this.uploadTimer = null;
      this.addLog('info', '자동 업로드 중지됨');
    }
  }

  async getConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      const config = {
        serverUrl: 'http://10.12.200.99:3498',
        uploadInterval: 600,
        userEmail: '',
      };

      // key=value 형식 파싱
      const lines = data.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();

        if (key === 'user_email') {
          config.userEmail = value;
        } else if (key === 'server_url') {
          config.serverUrl = value;
        } else if (key === 'upload_interval') {
          config.uploadInterval = parseInt(value, 10);
        }
      }

      return config;
    } catch {
      return {
        serverUrl: 'http://10.12.200.99:3498',
        uploadInterval: 600,
        userEmail: '',
      };
    }
  }

  async saveConfig(config) {
    try {
      // 필수 필드 검증
      if (!config.userEmail || !config.userEmail.trim()) {
        return { success: false, error: '사용자 이메일은 필수 항목입니다' };
      }
      if (!config.serverUrl || !config.serverUrl.trim()) {
        return { success: false, error: '서버 URL은 필수 항목입니다' };
      }
      if (!config.uploadInterval || config.uploadInterval <= 0) {
        return { success: false, error: '업로드 주기는 필수 항목입니다' };
      }

      // key=value 형식으로 저장
      const lines = [];
      lines.push(`user_email=${config.userEmail}`);
      lines.push(`server_url=${config.serverUrl}`);
      lines.push(`upload_interval=${config.uploadInterval}`);

      await fs.writeFile(this.configPath, lines.join('\n') + '\n');

      // 설정 변경 후 자동 업로드 재시작
      this.addLog('info', '설정이 변경되어 자동 업로드를 재시작합니다');
      await this.startAutoUpload();

      return { success: true };
    } catch (error) {
      console.error('Error saving config:', error);
      return { success: false, error: error.message };
    }
  }


  addLog(level, message) {
    const timestamp = new Date().toISOString();
    const log = { timestamp, level, message };
    this.logs.push(log);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    return log;
  }

  getLogs() {
    return this.logs;
  }

  getStatus() {
    return {
      uploadCount: this.uploadCount,
      lastUploadTime: this.lastUploadTime,
    };
  }

  async scanUsageData() {
    const projectsDir = path.join(os.homedir(), '.claude/projects');

    try {
      await fs.access(projectsDir);
    } catch {
      throw new Error('Claude projects 디렉토리가 존재하지 않습니다');
    }

    const seenMessages = new Set();
    const cutoffTime = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const dailyStats = {};

    const files = await this.findJsonlFiles(projectsDir);

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          if (entry.type !== 'assistant') continue;

          const timestamp = entry.timestamp;
          if (!timestamp) continue;

          const msgTime = new Date(timestamp);
          if (msgTime < cutoffTime) continue;

          // 로컬 시간대 기준으로 날짜 추출
          const year = msgTime.getFullYear();
          const month = String(msgTime.getMonth() + 1).padStart(2, '0');
          const day = String(msgTime.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;

          const message = entry.message || {};
          const msgId = message.id;
          const usage = message.usage || {};

          if (!usage || Object.keys(usage).length === 0) continue;
          if (msgId && seenMessages.has(msgId)) continue;

          if (msgId) seenMessages.add(msgId);

          if (!dailyStats[dateStr]) {
            dailyStats[dateStr] = {
              input_tokens: 0,
              output_tokens: 0,
              cache_creation_tokens: 0,
              cache_read_tokens: 0,
              message_count: 0,
            };
          }

          dailyStats[dateStr].input_tokens += usage.input_tokens || 0;
          dailyStats[dateStr].output_tokens += usage.output_tokens || 0;
          dailyStats[dateStr].cache_creation_tokens += usage.cache_creation_input_tokens || 0;
          dailyStats[dateStr].cache_read_tokens += usage.cache_read_input_tokens || 0;
          dailyStats[dateStr].message_count += 1;
        } catch {}
      }
    }

    const daily = Object.keys(dailyStats)
      .sort()
      .map((date) => {
        const stats = dailyStats[date];
        const totalTokens =
          stats.input_tokens +
          stats.output_tokens +
          stats.cache_creation_tokens +
          stats.cache_read_tokens;

        return {
          date,
          totalInputTokens: stats.input_tokens,
          totalOutputTokens: stats.output_tokens,
          totalCacheWriteTokens: stats.cache_creation_tokens,
          totalCacheReadTokens: stats.cache_read_tokens,
          totalTokens,
          requestCount: stats.message_count,
        };
      });

    return { daily };
  }

  async findJsonlFiles(dir) {
    const results = [];

    async function walk(currentDir) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          results.push(fullPath);
        }
      }
    }

    await walk(dir);
    return results;
  }

  async uploadUsageData() {
    const config = await this.getConfig();

    if (!config.userEmail) {
      throw new Error('사용자 이메일이 설정되지 않았습니다');
    }

    this.addLog('info', '사용량 데이터 수집 중...');

    const usageData = await this.scanUsageData();
    const jsonData = JSON.stringify(usageData);

    if (jsonData.length < 10) {
      throw new Error('데이터가 너무 작거나 비어있습니다');
    }

    const tempFile = path.join(os.tmpdir(), `claude-usage-${Date.now()}.json`);
    await fs.writeFile(tempFile, jsonData);

    try {
      const form = new FormData();
      form.append('file', createReadStream(tempFile));
      form.append('hostname', os.hostname());
      form.append('timestamp', Math.floor(Date.now() / 1000).toString());
      form.append('userEmail', config.userEmail);

      const uploadUrl = `${config.serverUrl}/api/claude-usage/upload`;
      const urlObj = new URL(uploadUrl);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      await new Promise((resolve, reject) => {
        const req = protocol.request(
          {
            method: 'POST',
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            headers: form.getHeaders(),
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode === 200 || res.statusCode === 201) {
                this.uploadCount++;
                this.lastUploadTime = new Date().toISOString();
                this.addLog('success', `업로드 성공 (#${this.uploadCount})`);
                resolve();
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              }
            });
          }
        );

        req.on('error', reject);
        form.pipe(req);
      });
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }

    return usageData;
  }
}
