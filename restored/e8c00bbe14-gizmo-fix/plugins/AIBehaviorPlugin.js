/**
 * AIBehaviorPlugin - State machines, behavior trees, and pathfinding.
 *
 * Sandboxed per-object AI logic delegates to Lua Wasm via the bridge.
 */
import { createNodeCard } from './NodeFactory.js';

export const AIBehaviorPlugin = {
  name: 'AIBehaviorPlugin',

  _behaviors: new Map(), // uuid -> { states, transitions, current }

  init(state) {
    this._state = state;
    state.on('state:selectedObject:changed', obj => {
      if (obj && this._behaviors.has(obj.uuid)) {
        console.log(`[AIBehavior] Selected: ${obj.name}, state: ${this._behaviors.get(obj.uuid).current}`);
      }
    });
    console.log('[AIBehaviorPlugin] Initialized');
  },

  update(deltaTime) {
    this._behaviors.forEach((behavior, uuid) => {
      const obj = this._state.data.scene?.getObjectByProperty('uuid', uuid);
      if (!obj) return;
      // Evaluate transitions
      const trans = behavior.transitions[behavior.current];
      if (trans) {
        for (const [condition, nextState] of Object.entries(trans)) {
          if (typeof condition === 'function' ? condition(obj, deltaTime) : true) {
            behavior.current = nextState;
            this._state.emit('ai:stateChanged', { uuid, from: behavior.current, to: nextState });
            break;
          }
        }
      }
      // Delegate to Lua Wasm for sandboxed per-object logic
      window.LuaBridge?.execute(obj, behavior.states[behavior.current], deltaTime);
    });
  },

  /** Define a state machine for an object */
  defineStateMachine(target, states, transitions, initialState) {
    const entry = {
      states,        // { stateName: 'Lua script string' }
      transitions,   // { stateName: { condition: 'nextState' } }
      current: initialState ?? Object.keys(states)[0],
    };
    this._behaviors.set(target.uuid, entry);
    this._state.emit('ai:stateMachineDefined', { uuid: target.uuid, states: Object.keys(states) });
    return entry;
  },

  /** Find a path between two points (simple A* stub) */
  findPath(from, to) {
    console.log(`[AIBehavior] Pathfinding from ${from} to ${to}`);
    // Stub — in production, delegates to Go Wasm for concurrent pathfinding
    return [from, to];
  },

  // ── Visual Nodes ──
  nodes: {
    'Logic/StateMachineNode': (x, y) =>
      createNodeCard(x, y, 'State Machine', ['Target', 'States', 'Transitions', 'Initial State'], ['Current State']),

    'Logic/BehaviorTreeNode': (x, y) =>
      createNodeCard(x, y, 'Behavior Tree', ['Root Task', 'Blackboard'], ['Status']),

    'Logic/PathfindingNode': (x, y) =>
      createNodeCard(x, y, 'Pathfinding', ['Target', 'From', 'To'], ['Path']),
  }
};
