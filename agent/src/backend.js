/**
 * 调用后端内部接口（/internal/*）的客户端。工具需要读写持久化数据时也走这里，
 * agent 自身不保存任何跨回合状态。
 */
export class BackendClient {
  /**
   * @param {string} baseUrl
   * @param {string} token
   */
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  /**
   * @param {string} method
   * @param {string} path 以 /internal/ 开头
   * @param {unknown} [body]
   * @param {AbortSignal} [signal]
   * @returns {Promise<any>}
   */
  async request(method, path, body, signal) {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: {
        'X-Wren-Internal-Token': this.token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new BackendError(res.status, data?.error ?? text.slice(0, 300));
    }
    return data;
  }

  /**
   * @param {number} turnId
   * @returns {Promise<import('./types.js').TurnContext>}
   */
  turnContext(turnId) {
    return this.request('GET', `/internal/turns/${turnId}/context`);
  }
}

export class BackendError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(`后端 ${status}：${message}`);
    this.status = status;
  }
}
