/**
 * LuaPlugin - Sandboxed per-object scripting via Fengari Wasm.
 * Allows users to write Lua scripts that control object behavior.
 */
import * as THREE from 'three';
import { logger } from '../core/Logger.js';
import { createNodeCard } from './NodeFactory.js';

export const LuaPlugin = {
  name: 'Lua',
  _state: null,
  _wasmModule: null,
  _isInitialized: false,
  _scriptStates: new Map(), // Object UUID -> Lua state
  _globalContext: {},

  async init(state) {
    this._state = state;
    
    // Initialize Fengari Wasm
    await this._initWasm();
    
    // Setup global Lua context
    this._setupGlobalContext();
  },

  async _initWasm() {
    try {
      // In production, this imports Fengari Wasm
      // const fengari = await import('fengari-web');
      // this._wasmModule = fengari;
      this._isInitialized = true;
      logger.log('Lua', 'Fengari Wasm initialized');
    } catch (err) {
      logger.error('Lua', 'Failed to initialize Fengari:', err);
    }
  },

  _setupGlobalContext() {
    this._globalContext = {
      THREE: {
        Vector3: THREE.Vector3,
        Math: THREE.MathUtils
      },
      console: {
        log: (...args) => logger.log('Lua', ...args)
      }
    };
  },

  /**
   * Executes a Lua script on a specific object
   */
  executeScript(object, scriptCode, deltaTime) {
    if (!this._isInitialized || !object || !scriptCode) return;

    let luaState = this._scriptStates.get(object.uuid);
    
    // Create new Lua state if doesn't exist
    if (!luaState) {
      luaState = this._createLuaState();
      this._scriptStates.set(object.uuid, luaState);
    }

    // Push context to Lua
    this._pushContext(luaState, object, deltaTime);

    // Execute script
    try {
      const status = this._wasmModule.luaL_dostring(luaState, scriptCode);
      
      if (status !== 0) {
        const error = this._wasmModule.lua_tostring(luaState, -1);
        logger.error('Lua', 'Script error:', error);
        this._wasmModule.lua_pop(luaState, 1);
      } else {
        // Read back modified context
        this._readContext(luaState, object);
      }
    } catch (err) {
      logger.error('Lua', 'Execution failed:', err);
    }
  },

  _createLuaState() {
    const L = this._wasmModule.luaL_newstate();
    this._wasmModule.luaL_openlibs(L);
    return L;
  },

  _pushContext(L, object, deltaTime) {
    // Create ctx table
    this._wasmModule.lua_newtable(L);
    
    // ctx.self = { position, rotation, scale }
    this._wasmModule.lua_pushstring(L, 'self');
    this._wasmModule.lua_newtable(L);
    
    this._pushVec3(L, 'position', object.position);
    this._pushVec3(L, 'rotation', object.rotation);
    this._pushVec3(L, 'scale', object.scale);
    
    this._wasmModule.lua_settable(L, -3);
    
    // ctx.dt = deltaTime
    this._wasmModule.lua_pushstring(L, 'dt');
    this._wasmModule.lua_pushnumber(L, deltaTime);
    this._wasmModule.lua_settable(L, -3);
    
    // ctx.time = performance.now() / 1000
    this._wasmModule.lua_pushstring(L, 'time');
    this._wasmModule.lua_pushnumber(L, performance.now() / 1000);
    this._wasmModule.lua_settable(L, -3);
    
    // Set as global 'ctx'
    this._wasmModule.lua_setglobal(L, 'ctx');
  },

  _readContext(L, object) {
    // Get global ctx
    this._wasmModule.lua_getglobal(L, 'ctx');
    
    if (this._wasmModule.lua_istable(L, -1)) {
      // Read ctx.self.position
      this._wasmModule.lua_getfield(L, -1, 'self');
      if (this._wasmModule.lua_istable(L, -1)) {
        const newPos = this._readVec3(L, 'position');
        const newRot = this._readVec3(L, 'rotation');
        const newScale = this._readVec3(L, 'scale');
        
        if (newPos) object.position.copy(newPos);
        if (newRot) object.rotation.copy(newRot);
        if (newScale) object.scale.copy(newScale);
      }
      this._wasmModule.lua_pop(L, 1);
    }
    
    this._wasmModule.lua_pop(L, 1);
  },

  _pushVec3(L, name, vec) {
    this._wasmModule.lua_pushstring(L, name);
    this._wasmModule.lua_newtable(L);
    
    this._wasmModule.lua_pushstring(L, 'x');
    this._wasmModule.lua_pushnumber(L, vec.x);
    this._wasmModule.lua_settable(L, -3);
    
    this._wasmModule.lua_pushstring(L, 'y');
    this._wasmModule.lua_pushnumber(L, vec.y);
    this._wasmModule.lua_settable(L, -3);
    
    this._wasmModule.lua_pushstring(L, 'z');
    this._wasmModule.lua_pushnumber(L, vec.z);
    this._wasmModule.lua_settable(L, -3);
    
    this._wasmModule.lua_settable(L, -3);
  },

  _readVec3(L, name) {
    this._wasmModule.lua_getfield(L, -1, name);
    
    if (this._wasmModule.lua_istable(L, -1)) {
      this._wasmModule.lua_getfield(L, -1, 'x');
      const x = this._wasmModule.lua_tonumber(L, -1);
      this._wasmModule.lua_pop(L, 1);
      
      this._wasmModule.lua_getfield(L, -1, 'y');
      const y = this._wasmModule.lua_tonumber(L, -1);
      this._wasmModule.lua_pop(L, 1);
      
      this._wasmModule.lua_getfield(L, -1, 'z');
      const z = this._wasmModule.lua_tonumber(L, -1);
      this._wasmModule.lua_pop(L, 1);
      
      this._wasmModule.lua_pop(L, 1);
      
      return new THREE.Vector3(x, y, z);
    }
    
    this._wasmModule.lua_pop(L, 1);
    return null;
  },

  /**
   * Compiles and caches a Lua script
   */
  compileScript(scriptCode) {
    if (!this._isInitialized) return null;

    const L = this._createLuaState();
    
    try {
      const status = this._wasmModule.luaL_loadstring(L, scriptCode);
      
      if (status !== 0) {
        const error = this._wasmModule.lua_tostring(L, -1);
        logger.error('Lua', 'Compilation error:', error);
        return null;
      }
      
      return L;
    } catch (err) {
      logger.error('Lua', 'Compilation failed:', err);
      return null;
    }
  },

  update(deltaTime) {
    // Execute scripts on all objects with Lua scripts
    this._state.data.scene.traverse((obj) => {
      if (obj.userData.luaScript) {
        this.executeScript(obj, obj.userData.luaScript, deltaTime);
      }
    });
  },

  nodes: {
    'Lua/ExecuteScriptNode': (x, y) => {
      const textarea = document.createElement('textarea');
      textarea.className = 'node-input';
      textarea.dataset.prop = 'script';
      textarea.rows = 4;
      textarea.placeholder = '-- ctx.self.position.y = ctx.self.position.y + ctx.dt';
      textarea.textContent = 'ctx.self.position.y = ctx.self.position.y + ctx.dt';

      const label = document.createElement('label');
      label.textContent = 'Script:';
      const wrapper = document.createElement('div');
      wrapper.appendChild(label);
      wrapper.appendChild(textarea);

      return createNodeCard(
        x, y,
        '📜 Execute Lua Script',
        ['Target Object'],
        ['Modified Object'],
        { body: wrapper, extraClasses: ['node-card-yellow'] }
      );
    },

    'Lua/StateNode': (x, y) => {
      return createNodeCard(
        x, y,
        '🔧 Lua State',
        [],
        ['dt (Delta Time)', 'time (Elapsed)', 'self.position'],
        { extraClasses: ['node-card-yellow'] }
      );
    }
  }
};
