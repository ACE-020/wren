import { currentTime, fetchUrl } from './builtin.js';
import { ToolRegistry } from './registry.js';

/** 创建并注册全部工具。新增工具：写一个 ToolDefinition，在这里 register。 */
export function createToolRegistry() {
  return new ToolRegistry().register(currentTime).register(fetchUrl);
}
