/**
 * Antigravity History Manager — Unified IPC Contract API (Tauri v2)
 */

(function (window) {
  'use strict';

  async function invokeCommand(cmdName, args = {}) {
    if (!window.__TAURI__ || !window.__TAURI__.core || typeof window.__TAURI__.core.invoke !== 'function') {
      const msg = 'Tauri core API is unavailable (window.__TAURI__.core.invoke missing)';
      console.error(`[IPC ERROR] ${cmdName}:`, msg);
      throw new Error(msg);
    }

    try {
      return await window.__TAURI__.core.invoke(cmdName, args);
    } catch (err) {
      console.error(`[IPC ERROR] ${cmdName}:`, err);
      const errMsg = typeof err === 'string' ? err : (err && err.message ? err.message : JSON.stringify(err));
      throw new Error(errMsg);
    }
  }

  async function listenEvent(eventName, handler) {
    if (!window.__TAURI__ || !window.__TAURI__.event || typeof window.__TAURI__.event.listen !== 'function') {
      console.warn(`[IPC WARN] listenEvent(${eventName}): window.__TAURI__.event.listen unavailable`);
      return () => {};
    }
    try {
      return await window.__TAURI__.event.listen(eventName, handler);
    } catch (err) {
      console.error(`[IPC ERROR] listenEvent(${eventName}):`, err);
      return () => {};
    }
  }

  const api = {
    async getEnvStatus() {
      return await invokeCommand('get_env_status');
    },

    async getConversationsDb() {
      const res = await invokeCommand('get_conversations_db');
      return Array.isArray(res) ? res : [];
    },

    async runCommand(opts) {
      const options = {
        cmd_type: opts.cmd_type || 'list',
        chat_id: opts.chat_id || null,
        chat_ids: Array.isArray(opts.chat_ids) ? opts.chat_ids : null,
        output_dir: opts.output_dir || null,
        format: opts.format || 'all',
        organize_folders: opts.organize_folders !== false,
        thinking: Boolean(opts.thinking),
        full: Boolean(opts.full),
        today: Boolean(opts.today),
      };
      return await invokeCommand('run_command', { options });
    },

    async stopRunningCommand() {
      return await invokeCommand('stop_running_command');
    },

    async pickExportDirectory(currentDir = null) {
      return await invokeCommand('pick_export_directory', { current_dir: currentDir || null });
    },

    async openFolder(path) {
      if (!path) throw new Error('Path is required');
      return await invokeCommand('open_folder', { path });
    },

    async revealDbFile(chatId) {
      if (!chatId) throw new Error('Chat ID is required');
      return await invokeCommand('reveal_db_file', { chat_id: chatId });
    },

    async loadSettings() {
      return await invokeCommand('load_settings');
    },

    async saveSettings(settings) {
      return await invokeCommand('save_settings', { settings });
    },

    async requestWindowAttention() {
      try {
        return await invokeCommand('request_window_attention');
      } catch (e) {
        // Non-critical, ignore
      }
    },

    onCmdOutput(callback) {
      return listenEvent('cmd-output', (event) => {
        if (event && event.payload) {
          callback(event.payload);
        }
      });
    },

    onCmdFinished(callback) {
      return listenEvent('cmd-finished', (event) => {
        if (event && event.payload) {
          callback(event.payload);
        }
      });
    }
  };

  window.api = api;
})(window);
