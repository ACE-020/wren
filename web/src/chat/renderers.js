/**
 * 自定义事件的渲染注册表。
 *
 * agent 里的工具可以通过 `ctx.emit({ type: 'xxx', ... })` 发出框架不认识的事件，
 * 这些事件会原样到达前端，在对话里按注册的组件渲染（组件收到 `event` 属性）。
 * 没有注册的类型不渲染（开发模式下在控制台提示一次）。
 */

import { markRaw } from 'vue';

/** @type {Map<string, import('vue').Component>} */
const renderers = new Map();
const warned = new Set();

/**
 * @param {string} type
 * @param {import('vue').Component} component
 */
export function registerEventRenderer(type, component) {
  if (renderers.has(type)) throw new Error(`事件渲染器重复注册：${type}`);
  renderers.set(type, markRaw(component));
}

/** @param {string} type */
export function rendererFor(type) {
  const component = renderers.get(type);
  if (!component && import.meta.env.DEV && !warned.has(type)) {
    warned.add(type);
    console.warn(`[wren] 未注册渲染器的事件类型：${type}`);
  }
  return component ?? null;
}
