/**
 * NodeGraphExecutor - Evaluates visual logic graphs (Geometry, Shader, Physics).
 */
export class NodeGraphExecutor {
  constructor(state, pluginManager) {
    this.state = state;
    this.plugins = pluginManager;
    this.activeGraph = []; // Array of node data objects
  }

  setGraph(graphData) {
    this.activeGraph = graphData;
  }

  evaluate(deltaTime) {
    if (this.activeGraph.length === 0) return;

    // 1. Find all "Output" nodes (the end of the execution chain)
    const outputNodes = this.activeGraph.filter(n => n.type.includes('Output'));

    outputNodes.forEach(outNode => {
      this._traceAndExecute(outNode, deltaTime);
    });
  }

  _traceAndExecute(node, deltaTime, visited = new Set()) {
    if (!node) return null;

    // Cycle detection — prevent infinite recursion
    if (visited.has(node)) {
      console.warn(`[NodeGraphExecutor] Cycle detected at node: ${node.type}`);
      return null;
    }
    visited.add(node);

    // Gather input data by tracing connections backwards
    const inputData = {};
    if (node.inputs) {
      Object.keys(node.inputs).forEach(inputKey => {
        const connection = node.inputs[inputKey];
        if (connection && connection.sourceNode) {
          inputData[inputKey] = this._traceAndExecute(connection.sourceNode, deltaTime, visited);
        } else {
          inputData[inputKey] = node.inputs[inputKey].value; // Fallback to UI value
        }
      });
    }

    // Execute the specific node logic based on its category
    return this._executeNodeLogic(node.type, inputData, deltaTime);
  }

  _executeNodeLogic(nodeType, inputs, deltaTime) {
    if (!nodeType || !nodeType.includes('/')) {
      console.warn(`[NodeGraphExecutor] Invalid node type: "${nodeType}"`);
      return inputs;
    }
    const [category, action] = nodeType.split('/');

    switch (category) {
      case 'Physics':
        return this._handlePhysicsNode(action, inputs, deltaTime);
      case 'Animation':
        return this._handleAnimationNode(action, inputs, deltaTime);
      case 'Geometry':
        return this._handleGeometryNode(action, inputs);
      case 'Logic':
        return this._handleLogicNode(action, inputs, deltaTime);
      case 'Rigging':
        return this._handleRiggingNode(action, inputs);
      case 'GameMap':
        return this._handleGameMapNode(action, inputs);
      case 'Selection':
        return this._handleSelectionNode(action, inputs);
      default:
        return inputs;
    }
  }

  // ── Category Handlers (Bridging to Wasm/Lua) ──
  _handlePhysicsNode(action, inputs, dt) {
    if (action === 'ApplyForceNode') {
      // Handoff to Rust Wasm for parallel force calculation
      window.RustPhysicsBridge?.applyForce(inputs.target, inputs.force, dt);
    }
    return inputs;
  }

  _handleAnimationNode(action, inputs, dt) {
    if (action === 'PlayAnimationNode') {
      const mixer = this.state.data.mixers.get(inputs.target?.uuid);
      if (mixer) mixer.update(dt);
    }
    return inputs;
  }

  _handleGeometryNode(action, inputs) {
    if (action === 'BooleanCSGNode') {
      // Handoff to Rust Wasm for heavy CSG math
      return window.RustGeometryBridge?.computeBoolean(inputs.meshA, inputs.meshB, inputs.operation);
    }
    return inputs;
  }

  _handleLogicNode(action, inputs, dt) {
    if (action === 'StateMachineNode') {
      // Handoff to Lua Wasm for sandboxed per-object logic
      window.LuaBridge?.execute(inputs.target, inputs.states, dt);
    }
    return inputs;
  }

  _handleRiggingNode(action, inputs) {
    if (action === 'CreateSkeletonNode') {
      const skeleton = this.state.data.skeletons.get(inputs.Name);
      return skeleton;
    }
    return inputs;
  }

  _handleGameMapNode(action, inputs) {
    // GameMap nodes self-manage via plugin methods — pass-through for now
    return inputs;
  }

  _handleSelectionNode(action, inputs) {
    // Selection nodes self-manage via plugin methods — pass-through for now
    return inputs;
  }
}
