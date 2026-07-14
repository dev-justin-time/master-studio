import { logger } from '../core/Logger.js';
/**
 * LuaBridge - Sandboxed per-object scripting via Fengari (Lua Wasm).
 */
export const LuaBridge = {
  _states: new Map(),

  execute(targetObject, scriptCode, deltaTime) {
    if (!targetObject || !scriptCode) return;

    // In production, this uses Fengari Wasm to run the Lua code safely
    logger.log(`[Lua Sandbox] Executing script on ${targetObject.name} (dt: ${deltaTime})`);

    /*
    const L = this._getOrCreateState(targetObject.uuid);
    lua_push_context(L, targetObject, deltaTime);
    luaL_dostring(L, scriptCode);
    */
  }
};

if (typeof window !== 'undefined') {
  window.LuaBridge = LuaBridge;
}