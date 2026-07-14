import { logger } from './Logger.js';
/**
 * PluginManager - Handles plugin lifecycle and visual node registration.
 */
export class PluginManager {
  constructor(state) {
    this.state = state;
    this._plugins = new Map();
    this._nodeRegistry = new Map(); // Node Type -> DOM Creator Function
  }

  register(plugin) {
    if (this._plugins.has(plugin.name)) return;
    this._plugins.set(plugin.name, plugin);

    if (plugin.init) plugin.init(this.state);

    if (plugin.nodes) {
      Object.entries(plugin.nodes).forEach(([nodeName, domCreator]) => {
        this._nodeRegistry.set(nodeName, domCreator);
      });
    }
    logger.log(`[PluginManager] Registered: ${plugin.name}`);
  }

  update(deltaTime) {
    this._plugins.forEach(plugin => {
      if (plugin.update) plugin.update(deltaTime);
    });
  }

  getNodeCreator(nodeType) {
    return this._nodeRegistry.get(nodeType);
  }

  getAvailableNodes() {
    return Array.from(this._nodeRegistry.keys());
  }
}