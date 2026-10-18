import { useState, useEffect, useRef, useCallback } from 'react';

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * Phân tích giá trị header Retry-After (số giây hoặc chuỗi ngày HTTP) sang mili-giây.
 */
function parseRetryAfterMs(headerVal) {
  if (!headerVal) return null;
  const seconds = Number(headerVal);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.min(Math.max(seconds * 1000, 1000), 60000);
  }
  const dateMs = Date.parse(headerVal);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? Math.min(diff, 60000) : 1000;
  }
  return null;
}

/**
 * Chuyển mã lý do đóng luồng thành thông báo tiếng Việt rõ nghĩa.
 */
function getStopReasonMessage(reason, fallbackMessage) {
  switch (reason) {
    case 'left':
      return 'Em đã rời khỏi phòng đấu.';
    case 'suspended':
      return 'Tài khoản của em đang tạm khoá tính năng Đấu.';
    case 'emergency':
      return 'Hệ thống Đấu đang tạm dừng khẩn cấp theo yêu cầu của nhà trường.';
    case 'forbidden':
      return fallbackMessage || 'Em không có quyền truy cập vào luồng đấu này.';
    default:
      return fallbackMessage || 'Kết nối luồng đấu đã kết thúc.';
  }
}

/**
 * Hook kết nối SSE bằng fetch + ReadableStream.
 * @param {string|null} url Đường dẫn SSE (VD: '/api/battle/lobby/stream' hoặc `/api/battle/rooms/${id}/stream`)
 * @param {object} options { enabled?: boolean, initialSnapshot?: object|null, onEvent?: (eventName, payload) => void }
 */
export function useBattleStream(url, options = {}) {
  const { enabled = true, initialSnapshot = null, onEvent } = options;

  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [status, setStatus] = useState(() => (enabled && url ? 'connecting' : 'stopped'));
  const [stopReason, setStopReason] = useState(null);
  const [offsetMs, setOffsetMs] = useState(0);

  const metaRef = useRef({
    run_id: initialSnapshot?.run_id ?? null,
    version: typeof initialSnapshot?.version === 'number' ? initialSnapshot.version : -1,
  });

  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Cho phép cập nhật snapshot từ bên ngoài (ví dụ ngay sau khi POST /rooms hoặc GET /lobby)
  const applyExternalSnapshot = useCallback((incoming) => {
    if (!incoming || typeof incoming !== 'object') return;
    const current = metaRef.current;
    const isNewRun = incoming.run_id && incoming.run_id !== current.run_id;
    const hasHigherVersion =
      typeof incoming.version === 'number' && incoming.version > current.version;
    const hasNoVersionTracking =
      incoming.run_id === undefined && incoming.version === undefined;

    if (isNewRun || hasHigherVersion || hasNoVersionTracking || current.run_id === null) {
      if (incoming.run_id !== undefined) {
        current.run_id = incoming.run_id;
      }
      if (typeof incoming.version === 'number') {
        current.version = incoming.version;
      }
      if (typeof incoming.server_now === 'number') {
        setOffsetMs(incoming.server_now - Date.now());
      }
      setSnapshot(incoming);
    }
  }, []);

  useEffect(() => {
    if (initialSnapshot) {
      applyExternalSnapshot(initialSnapshot);
    }
  }, [initialSnapshot, applyExternalSnapshot]);

  useEffect(() => {
    if (!enabled || !url) {
      setStatus('stopped');
      return undefined;
    }

    let isUnmounted = false;
    let currentAbortController = null;
    let reconnectTimer = null;
    let attemptIndex = 0;
    let hasConnectedOnce = false;

    const clearTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = (customDelayMs = null) => {
      if (isUnmounted) return;
      clearTimer();
      setStatus('reconnecting');
      const delay =
        customDelayMs !== null
          ? customDelayMs
          : BACKOFF_STEPS_MS[Math.min(attemptIndex, BACKOFF_STEPS_MS.length - 1)];
      if (customDelayMs === null) {
        attemptIndex += 1;
      }
      reconnectTimer = setTimeout(() => {
        if (!isUnmounted) {
          connectStream();
        }
      }, delay);
    };

    const stopPermanently = (reasonCode, customText) => {
      if (isUnmounted) return;
      clearTimer();
      setStatus('stopped');
      setStopReason({
        code: reasonCode,
        message: getStopReasonMessage(reasonCode, customText),
      });
    };

    const handleSseBlock = (rawBlock) => {
      const lines = rawBlock.split(/\r?\n/);
      let eventName = 'message';
      const dataLines = [];

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line) continue;
        // Bỏ qua dòng nhịp `: ping` hoặc comment SSE
        if (line.startsWith(':')) continue;

        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }

      if (dataLines.length === 0) return null;
      const rawData = dataLines.join('\n');
      let parsed = null;
      try {
        parsed = JSON.parse(rawData);
      } catch {
        parsed = rawData;
      }

      if (onEventRef.current) {
        try {
          onEventRef.current(eventName, parsed);
        } catch {
          // Không làm gãy luồng nếu callback phụ gặp lỗi
        }
      }

      if (eventName === 'snapshot' && parsed && typeof parsed === 'object') {
        const current = metaRef.current;
        const isDifferentRun =
          parsed.run_id !== undefined && parsed.run_id !== current.run_id;
        const isNewerVersion =
          typeof parsed.version === 'number' && parsed.version > current.version;
        const untrackable =
          parsed.run_id === undefined && parsed.version === undefined;

        if (isDifferentRun || isNewerVersion || untrackable || current.run_id === null) {
          metaRef.current = {
            run_id: parsed.run_id ?? current.run_id,
            version:
              typeof parsed.version === 'number' ? parsed.version : current.version,
          };
          if (typeof parsed.server_now === 'number') {
            setOffsetMs(parsed.server_now - Date.now());
          }
          setSnapshot(parsed);
        }
        return { action: 'continue' };
      }

      if (eventName === 'closed') {
        const reason = parsed?.reason || 'unknown';
        if (reason === 'expired') {
          window.location.href = '/login';
          return { action: 'abort' };
        }
        if (reason === 'left' || reason === 'suspended' || reason === 'emergency') {
          stopPermanently(reason, parsed?.message);
          return { action: 'abort' };
        }
        if (reason === 'slow') {
          return { action: 'reconnect', delayMs: 2000 };
        }
        if (reason === 'unavailable' || reason === 'shutdown') {
          return { action: 'reconnect', delayMs: null };
        }
        return { action: 'reconnect', delayMs: null };
      }

      return { action: 'continue' };
    };

    const connectStream = async () => {
      if (isUnmounted) return;
      clearTimer();

      if (currentAbortController) {
        currentAbortController.abort();
      }
      const controller = new AbortController();
      currentAbortController = controller;

      setStatus(hasConnectedOnce ? 'reconnecting' : 'connecting');

      try {
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          signal: controller.signal,
        });

        if (isUnmounted) return;

        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }

        if (response.status === 403) {
          let errBody = null;
          try {
            errBody = await response.json();
          } catch {
            // Bỏ qua nếu không phải JSON
          }
          stopPermanently(
            errBody?.code || 'forbidden',
            errBody?.error || errBody?.message || 'Em không có quyền truy cập vào phòng này.'
          );
          return;
        }

        if (response.status === 429) {
          const retryMs = parseRetryAfterMs(response.headers.get('Retry-After')) ?? 5000;
          scheduleReconnect(retryMs);
          return;
        }

        if (!response.ok || !response.body) {
          scheduleReconnect(null);
          return;
        }

        // Đã mở luồng thành công
        hasConnectedOnce = true;
        attemptIndex = 0;
        setStopReason(null);
        setStatus('open');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (!isUnmounted) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const normalized = buffer.replace(/\r\n/g, '\n');
          const parts = normalized.split('\n\n');
          buffer = parts.pop() ?? '';

          for (let i = 0; i < parts.length; i += 1) {
            const block = parts[i];
            if (!block.trim()) continue;
            const directive = handleSseBlock(block);
            if (directive?.action === 'abort') {
              controller.abort();
              return;
            }
            if (directive?.action === 'reconnect') {
              controller.abort();
              scheduleReconnect(directive.delayMs);
              return;
            }
          }
        }

        // Xử lý phần còn sót nếu stream đóng tự nhiên
        if (buffer.trim()) {
          const directive = handleSseBlock(buffer.replace(/\r\n/g, '\n'));
          if (directive?.action === 'abort') return;
          if (directive?.action === 'reconnect') {
            scheduleReconnect(directive.delayMs);
            return;
          }
        }

        if (!isUnmounted) {
          scheduleReconnect(null);
        }
      } catch (err) {
        if (isUnmounted || err?.name === 'AbortError') return;
        scheduleReconnect(null);
      }
    };

    connectStream();

    return () => {
      isUnmounted = true;
      clearTimer();
      if (currentAbortController) {
        currentAbortController.abort();
      }
    };
  }, [url, enabled]);

  return {
    snapshot,
    status,
    stopReason,
    offsetMs,
    applyExternalSnapshot,
  };
}
