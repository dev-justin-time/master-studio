/**
 * AnimationPlugin - Animation clip management, mixer control, timeline playback.
 *
 * Reads/writes state.data.mixers (Map<uuid, THREE.AnimationMixer>)
 * and state.data.clips (Map<name, THREE.AnimationClip>).
 */
import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';

export const AnimationPlugin = {
  name: 'AnimationPlugin',

  init(state) {
    this._state = state;
    state.on('state:selectedObject:changed', obj => {
      this._activeMixer = obj ? state.data.mixers.get(obj.uuid) : null;
    });
    console.log('[AnimationPlugin] Initialized');
  },

  update(deltaTime) {
    // Advance all active mixers
    this._state.data.mixers?.forEach(mixer => {
      mixer.update(deltaTime);
    });
  },

  /** Create a mixer for a skinned mesh */
  createMixer(mesh) {
    const mixer = new THREE.AnimationMixer(mesh);
    this._state.data.mixers.set(mesh.uuid, mixer);
    return mixer;
  },

  /** Register an animation clip */
  registerClip(name, clip) {
    this._state.data.clips.set(name, clip);
    this._state.emit('clip:registered', { name, duration: clip.duration });
    return clip;
  },

  /** Play a named clip on a target object */
  play(target, clipName) {
    const mixer = this._state.data.mixers.get(target.uuid);
    const clip = this._state.data.clips.get(clipName);
    if (!mixer || !clip) return null;
    const action = mixer.clipAction(clip);
    action.play();
    return action;
  },

  /** Crossfade between two clips on a target */
  blend(target, fromClip, toClip, duration = 0.5) {
    const mixer = this._state.data.mixers.get(target.uuid);
    const clipA = this._state.data.clips.get(fromClip);
    const clipB = this._state.data.clips.get(toClip);
    if (!mixer || !clipA || !clipB) return;
    const actionA = mixer.clipAction(clipA);
    const actionB = mixer.clipAction(clipB);
    actionA.fadeOut(duration);
    actionB.reset().fadeIn(duration).play();
    return actionB;
  },

  // ── Visual Nodes ──
  nodes: {
    'Animation/PlayAnimationNode': (x, y) =>
      createNodeCard(x, y, 'Play Animation', ['Target', 'Clip Name', 'Speed', 'Loop'], ['Action']),

    'Animation/BlendAnimationNode': (x, y) =>
      createNodeCard(x, y, 'Blend Animation', ['Target', 'From Clip', 'To Clip', 'Duration'], ['Action']),

    'Animation/AnimationOutputNode': (x, y) =>
      createNodeCard(x, y, 'Animation Output', ['Target', 'Clip'], []),
  }
};
