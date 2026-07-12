/**
 * RiggingPlugin - Skeleton creation, bone management, skinning.
 *
 * Reads/writes state.data.skeletons (Map<name, THREE.Skeleton>).
 */
import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

export const RiggingPlugin = {
  name: 'RiggingPlugin',

  init(state) {
    this._state = state;
    logger.log('RiggingPlugin', 'Initialized');
  },

  update(deltaTime) {
    // Update bone world matrices after any skeleton manipulation
    this._state.data.skeletons?.forEach(skeleton => {
      skeleton.bones.forEach(bone => {
        if (bone.matrixWorldNeedsUpdate) bone.updateMatrixWorld();
      });
    });
  },

  /** Called by nodes when they are executed in the graph */
  createSkeleton(name, boneDefs) {
    const bones = [];
    boneDefs.forEach(def => {
      const bone = new THREE.Bone();
      bone.name = def.name;
      bone.position.set(def.x ?? 0, def.y ?? 0, def.z ?? 0);
      if (def.parent !== undefined) bones[def.parent]?.add(bone);
      bones.push(bone);
    });
    const root = bones[0];
    const skeleton = new THREE.Skeleton(bones);
    this._state.data.skeletons.set(name, skeleton);
    this._state.emit('skeleton:created', { name, root });
    return root;
  },

  addBone(skeletonName, parentName, boneDef) {
    const skeleton = this._state.data.skeletons.get(skeletonName);
    if (!skeleton) return;
    const parent = skeleton.bones.find(b => b.name === parentName);
    if (!parent) return;
    const bone = new THREE.Bone();
    bone.name = boneDef.name;
    bone.position.set(boneDef.x ?? 0, boneDef.y ?? 0, boneDef.z ?? 0);
    parent.add(bone);
    skeleton.bones.push(bone);
    skeleton.boneInverses = null; // force recompute
    this._state.emit('skeleton:boneAdded', { skeletonName, bone });
    return bone;
  },

  // ── Visual Nodes ──
  nodes: {
    'Rigging/CreateSkeletonNode': (x, y) =>
      createNodeCard(x, y, 'Create Skeleton', ['Name', 'Bone Defs'], ['Root Bone']),

    'Rigging/AddBoneNode': (x, y) =>
      createNodeCard(x, y, 'Add Bone', ['Skeleton', 'Parent Bone', 'Bone Def'], ['Bone']),

    'Rigging/BindSkinNode': (x, y) =>
      createNodeCard(x, y, 'Bind Skin', ['Mesh', 'Skeleton'], ['Skinned Mesh']),
  }
};
