import * as THREE from 'three';

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
    // Heavy geometry operations are executed on-demand via executeNodeOnDemand
    // to avoid running Wasm inside the 60fps render loop.
    return inputs;
  }

  // ── On-Demand Node Execution ─────────────────────────────────────────────

  /**
   * Execute a single node immediately, parsing inputs from its DOM and
   * falling back to the current selection for missing mesh inputs.
   */
  async executeNodeOnDemand(node) {
    if (!node || !node.dom) {
      console.warn('[NodeGraphExecutor] Cannot execute invalid node');
      return null;
    }

    const parsed = this._parseNodeInputs(node);
    const [category, action] = node.type.split('/');

    if (category === 'Rust') {
      return this._executeRustNode(action, parsed);
    }

    if (category === 'Go') {
      return this._executeGoNode(action, parsed);
    }

    console.warn(`[NodeGraphExecutor] On-demand execution not yet implemented for ${node.type}`);
    return null;
  }

  _parseNodeInputs(node) {
    const inputs = {};
    if (!node.dom) return inputs;

    node.dom.querySelectorAll('[data-prop]').forEach(el => {
      const prop = el.dataset.prop;
      let value;

      if (el.tagName === 'INPUT') {
        if (el.type === 'file') {
          // Return the file input element itself so callers can read files
          value = el;
        } else if (el.type === 'number' || el.type === 'range') {
          value = parseFloat(el.value);
        } else if (el.type === 'checkbox') {
          value = el.checked;
        } else {
          value = el.value;
        }
      } else if (el.tagName === 'SELECT') {
        value = el.value;
      } else {
        value = el.textContent;
      }

      inputs[prop] = value;
    });

    return inputs;
  }

  async _executeRustNode(action, inputs) {
    const selection = this.state.data.selectedObjects || [];
    const rust = this.plugins._plugins.get('Rust');

    if (!rust) {
      console.warn('[NodeGraphExecutor] RustPlugin not registered');
      return null;
    }

    switch (action) {
      case 'BooleanCSGNode': {
        const meshA = inputs.meshA || selection[0];
        const meshB = inputs.meshB || selection[1];

        if (!meshA || !meshB) {
          console.warn('[NodeGraphExecutor] Boolean CSG requires 2 selected meshes');
          this._notify('Boolean CSG requires 2 selected meshes', 'warning');
          return null;
        }

        const operation = inputs.operation || 'union';
        const geometry = await rust.booleanCSG(meshA, meshB, operation);
        if (geometry) {
          return this._applyGeometryToScene(geometry, meshA, `CSG_${operation}`);
        }
        break;
      }

      case 'DecimateNode': {
        const mesh = inputs.mesh || selection[0];

        if (!mesh) {
          console.warn('[NodeGraphExecutor] Decimate requires a selected mesh');
          this._notify('Decimate requires a selected mesh', 'warning');
          return null;
        }

        const percent = typeof inputs.percent === 'number' ? inputs.percent : parseFloat(inputs.percent) || 50;
        const geometry = await rust.decimateMesh(mesh, percent);
        if (geometry) {
          return this._applyGeometryToScene(geometry, mesh, 'Decimated');
        }
        break;
      }

      default:
        console.warn(`[NodeGraphExecutor] Unknown Rust node action: ${action}`);
    }

    return null;
  }

  async _executeGoNode(action, inputs) {
    const go = this.plugins._plugins.get('Go');

    if (!go) {
      console.warn('[NodeGraphExecutor] GoPlugin not registered');
      return null;
    }

    switch (action) {
      case 'ParsePointCloudNode': {
        const fileInput = inputs.file;
        if (!fileInput || !fileInput.files?.length) {
          this._notify('Select a point cloud file (.las/.ply)', 'warning');
          return null;
        }
        const buffer = await fileInput.files[0].arrayBuffer();
        const points = await go.parsePointCloud(buffer);
        if (points) {
          this.state.data.scene.add(points);
          const selection = this.plugins._plugins.get('Selection');
          selection?._setSelection([points]);
          this._notify(`Imported ${points.name}`, 'success');
        }
        return points;
      }

      case 'ImportCADNode': {
        const fileInput = inputs.file;
        if (!fileInput || !fileInput.files?.length) {
          this._notify('Select a CAD file (.step/.iges)', 'warning');
          return null;
        }
        const buffer = await fileInput.files[0].arrayBuffer();
        const group = await go.importCAD(buffer);
        if (group) {
          this.state.data.scene.add(group);
          const selection = this.plugins._plugins.get('Selection');
          selection?._setSelection([group]);
          this._notify(`Imported ${group.name}`, 'success');
        }
        return group;
      }

      default:
        console.warn(`[NodeGraphExecutor] Unknown Go node action: ${action}`);
    }

    return null;
  }

  _applyGeometryToScene(geometry, sourceMesh, namePrefix) {
    if (!geometry || !sourceMesh) return null;

    const material = sourceMesh.material
      ? (Array.isArray(sourceMesh.material) ? sourceMesh.material[0].clone() : sourceMesh.material.clone())
      : new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5, metalness: 0.5 });

    const newMesh = new THREE.Mesh(geometry, material);
    newMesh.position.copy(sourceMesh.position);
    newMesh.rotation.copy(sourceMesh.rotation);
    newMesh.scale.copy(sourceMesh.scale);
    newMesh.name = `${namePrefix}_${Date.now()}`;
    newMesh.userData.isManagedObject = true;
    newMesh.castShadow = true;
    newMesh.receiveShadow = true;

    this.state.data.scene.add(newMesh);

    // Auto-select the new mesh for the user
    const selectionPlugin = this.plugins._plugins.get('Selection');
    if (selectionPlugin && selectionPlugin._setSelection) {
      selectionPlugin._setSelection([newMesh]);
    } else {
      this.state.data.selectedObjects = [newMesh];
      this.state.set('selectedObjects', [newMesh]);
      this.state.emit('selection:changed', [newMesh]);
    }

    this._notify(`Created ${newMesh.name}`, 'success');
    return newMesh;
  }

  _notify(message, type = 'info') {
    this.state.emit('notification', { message, type });
    console.log(`[NodeGraphExecutor] ${message}`);
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
