/**
 * 运行配置：全部来自环境变量（`scripts/dev.mjs` 会读取根目录的 .env 再传进来）。
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
  const token = (env.WREN_INTERNAL_TOKEN ?? '').trim();
  if (!token) {
    throw new Error(
      'WREN_INTERNAL_TOKEN 未设置：后端与 agent 之间的内部接口需要共享口令。' +
        '用 `node scripts/dev.mjs` 启动会自动生成；单独启动时请自行设置。',
    );
  }
  const backendPort = env.WREN_BACKEND_PORT || '5280';
  return {
    host: '127.0.0.1',
    port: Number(env.WREN_AGENT_PORT || 5281),
    backendUrl: env.WREN_BACKEND_URL || `http://127.0.0.1:${backendPort}`,
    internalToken: token,
  };
}

/** @typedef {ReturnType<typeof loadConfig>} AgentConfig */
