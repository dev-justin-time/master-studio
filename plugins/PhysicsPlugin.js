/**
 * PhysicsPlugin - Rigid bodies, forces, and physics simulation stepping.
 *
 * Reads/writes state.data.physicsBodies (Map<uuid, body data>).
 * In production, this delegates heavy lifting to Rust Wasm via the bridge.
 */
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

export const PhysicsPlugin = {
  name: 'PhysicsPlugin',

  _gravity: { x: 0, y: -9.81, z: 0 },
  _groundLevel: 0,
  _restitution: 0.4,
  _friction: 0.3,
  _timeStep: 1 / 60,
  _accumulator: 0,

  init(state) {
    this._state = state;
    logger.log('PhysicsPlugin', 'Initialized');
  },

  update(deltaTime) {
    this._accumulator += deltaTime;
    while (this._accumulator >= this._timeStep) {
      this._accumulator -= this._timeStep;
      this._step(this._timeStep);
    }
  },

  _step(dt) {
    const bodies = this._state.data.physicsBodies;
    if (!bodies) return;

    const activeBodies = [];

    // ── Integrate positions ──
    bodies.forEach(body => {
      if (body.isStatic || !body.object) return;
      activeBodies.push(body);

      // Apply gravity
      body.velocity.x += this._gravity.x * dt;
      body.velocity.y += this._gravity.y * dt;
      body.velocity.z += this._gravity.z * dt;

      // Integrate position
      body.object.position.x += body.velocity.x * dt;
      body.object.position.y += body.velocity.y * dt;
      body.object.position.z += body.velocity.z * dt;

      // ── Ground-plane collision ──
      this._resolveGroundCollision(body);
    });

    // ── Body-vs-body collision ──
    for (let i = 0; i < activeBodies.length; i++) {
      for (let j = i + 1; j < activeBodies.length; j++) {
        this._resolveBodyCollision(activeBodies[i], activeBodies[j]);
      }
    }
  },

  /** Clamp object above the ground with restitution and friction */
  _resolveGroundCollision(body) {
    const obj = body.object;
    const halfHeight = this._getBodyHalfHeight(body);
    const groundY = this._groundLevel + halfHeight;

    if (obj.position.y < groundY) {
      obj.position.y = groundY;

      // Only bounce if moving downward fast enough
      if (body.velocity.y < -0.1) {
        body.velocity.y = -body.velocity.y * this._restitution;
        // Apply friction to horizontal velocity on bounce
        body.velocity.x *= (1 - this._friction);
        body.velocity.z *= (1 - this._friction);
      } else {
        // Settle on the ground
        body.velocity.y = 0;
        body.velocity.x *= (1 - this._friction * 2);
        body.velocity.z *= (1 - this._friction * 2);
      }
    }
  },

  /** Simple sphere-sphere collision between two bodies */
  _resolveBodyCollision(bodyA, bodyB) {
    const a = bodyA.object.position;
    const b = bodyB.object.position;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const minDist = this._getBodyHalfHeight(bodyA) + this._getBodyHalfHeight(bodyB);

    if (dist < minDist && dist > 0.001) {
      // Normalize collision normal
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;

      // ── Impulse resolution (only when approaching) ──
      const relVelX = bodyA.velocity.x - bodyB.velocity.x;
      const relVelY = bodyA.velocity.y - bodyB.velocity.y;
      const relVelZ = bodyA.velocity.z - bodyB.velocity.z;
      const relVelN = relVelX * nx + relVelY * ny + relVelZ * nz;

      if (relVelN > 0) {
        const impulse = relVelN * (1 + this._restitution) * 0.5;
        bodyA.velocity.x -= impulse * nx;
        bodyA.velocity.y -= impulse * ny;
        bodyA.velocity.z -= impulse * nz;
        bodyB.velocity.x += impulse * nx;
        bodyB.velocity.y += impulse * ny;
        bodyB.velocity.z += impulse * nz;
      }

      // ── Positional correction (always separate overlapping bodies) ──
      const overlap = minDist - dist;
      const correction = overlap * 0.5;
      a.x -= correction * nx;
      a.y -= correction * ny;
      a.z -= correction * nz;
      b.x += correction * nx;
      b.y += correction * ny;
      b.z += correction * nz;
    }
  },

  /** Estimate half-height of a body from its object's bounding box */
  _getBodyHalfHeight(body) {
    if (!body.object || !body.object.geometry) return 0.5;
    const geo = body.object.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    return geo.boundingSphere?.radius ?? 0.5;
  },

  createRigidBody(name, object, options = {}) {
    const body = {
      name,
      object,
      velocity: { x: 0, y: 0, z: 0 },
      mass: options.mass ?? 1,
      isStatic: options.isStatic ?? false,
    };
    this._state.data.physicsBodies.set(object.uuid, body);
    object.userData.physicsBody = body;
    this._state.emit('physics:bodyCreated', body);
    return body;
  },

  applyForce(target, force, dt) {
    // Delegate to Rust Wasm for parallel computation
    window.RustPhysicsBridge?.applyForce(target, force, dt);

    const body = target?.userData?.physicsBody;
    if (!body || body.isStatic) return;
    body.velocity.x += (force.x ?? 0) * (dt ?? this._timeStep);
    body.velocity.y += (force.y ?? 0) * (dt ?? this._timeStep);
    body.velocity.z += (force.z ?? 0) * (dt ?? this._timeStep);
  },

  setGravity(x, y, z) {
    this._gravity = { x, y, z };
  },

  setGroundLevel(level) {
    this._groundLevel = level;
  },

  setRestitution(value) {
    this._restitution = Math.max(0, Math.min(1, value));
  },

  setFriction(value) {
    this._friction = Math.max(0, Math.min(1, value));
  },

  // ── Visual Nodes ──
  nodes: {
    'Physics/RigidBodyNode': (x, y) =>
      createNodeCard(x, y, 'Rigid Body', ['Object', 'Mass', 'Static'], ['Body']),

    'Physics/ApplyForceNode': (x, y) =>
      createNodeCard(x, y, 'Apply Force', ['Target', 'Force', 'Delta Time'], ['Velocity']),

    'Physics/PhysicsOutputNode': (x, y) =>
      createNodeCard(x, y, 'Physics Output', ['Body'], []),
  }
};
