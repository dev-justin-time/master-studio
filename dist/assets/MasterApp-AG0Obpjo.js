const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/TextGeometry-D70dcrEp.js","assets/WasmBridge-CrQEFFpc.js","assets/FontLoader-Czls5vVm.js"])))=>i.map(i=>d[i]);
import{M as p,O as ls,B as _e,F as ee,S as X,U as J,V as F,W as q,H as K,N as re,C as Xt,a as O,b as cs,D as it,R as us,c as ge,d as g,A as Qt,l as d,e as ie,f as At,g as hs,h as ds,P as Me,i as Se,L as ps,j as Ue,G as rt,k as at,m as oe,T as ms,E as fs,n as gs,o as Zt,p as _s,q as vs,r as Yt,s as ys,t as ws,u as xs,v as bs,w as Ss,x as Ms,y as Rt,z as Ps,I as Bt,Z as kt,J as Es,K as Cs,Q as Ds,X as Ts,Y as As,_ as Rs,$ as nt,a0 as Bs,a1 as ks,a2 as zs,a3 as Ns,a4 as Ls,a5 as qt,a6 as et,a7 as Is,a8 as Fs,a9 as Gs,aa as Os,ab as se,ac as Kt,ad as Ct,ae as Ws,af as V,ag as G,ah as $e,ai as de,aj as be,ak as tt,al as Us,am as Dt,an as js,ao as Hs,ap as Vs,aq as $s,ar as Xs,as as Qs,at as zt,au as Jt,av as Nt,aw as Zs,ax as Ys,ay as qs,az as Ks,aA as Js,aB as ei,aC as ti,aD as Mt,aE as Lt,aF as Xe,aG as si}from"./WasmBridge-CrQEFFpc.js";const Ce={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};class ve{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}}const ii=new ls(-1,1,1,-1,0,1);class ai extends _e{constructor(){super(),this.setAttribute("position",new ee([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new ee([0,2,0,0,2,0],2))}}const ni=new ai;class je{constructor(e){this._mesh=new p(ni,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,ii)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}}class es extends ve{constructor(e,s){super(),this.textureID=s!==void 0?s:"tDiffuse",e instanceof X?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=J.clone(e.uniforms),this.material=new X({name:e.name!==void 0?e.name:"unspecified",defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this.fsQuad=new je(this.material)}render(e,s,i){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=i.texture),this.fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(s),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this.fsQuad.render(e))}dispose(){this.material.dispose(),this.fsQuad.dispose()}}class It extends ve{constructor(e,s){super(),this.scene=e,this.camera=s,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,s,i){const a=e.getContext(),n=e.state;n.buffers.color.setMask(!1),n.buffers.depth.setMask(!1),n.buffers.color.setLocked(!0),n.buffers.depth.setLocked(!0);let r,o;this.inverse?(r=0,o=1):(r=1,o=0),n.buffers.stencil.setTest(!0),n.buffers.stencil.setOp(a.REPLACE,a.REPLACE,a.REPLACE),n.buffers.stencil.setFunc(a.ALWAYS,r,4294967295),n.buffers.stencil.setClear(o),n.buffers.stencil.setLocked(!0),e.setRenderTarget(i),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(s),this.clear&&e.clear(),e.render(this.scene,this.camera),n.buffers.color.setLocked(!1),n.buffers.depth.setLocked(!1),n.buffers.color.setMask(!0),n.buffers.depth.setMask(!0),n.buffers.stencil.setLocked(!1),n.buffers.stencil.setFunc(a.EQUAL,1,4294967295),n.buffers.stencil.setOp(a.KEEP,a.KEEP,a.KEEP),n.buffers.stencil.setLocked(!0)}}class ri extends ve{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}}class ts{constructor(e,s){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),s===void 0){const i=e.getSize(new F);this._width=i.width,this._height=i.height,s=new q(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:K}),s.texture.name="EffectComposer.rt1"}else this._width=s.width,this._height=s.height;this.renderTarget1=s,this.renderTarget2=s.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new es(Ce),this.copyPass.material.blending=re,this.clock=new Xt}swapBuffers(){const e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,s){this.passes.splice(s,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){const s=this.passes.indexOf(e);s!==-1&&this.passes.splice(s,1)}isLastEnabledPass(e){for(let s=e+1;s<this.passes.length;s++)if(this.passes[s].enabled)return!1;return!0}render(e){e===void 0&&(e=this.clock.getDelta());const s=this.renderer.getRenderTarget();let i=!1;for(let a=0,n=this.passes.length;a<n;a++){const r=this.passes[a];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(a),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,i),r.needsSwap){if(i){const o=this.renderer.getContext(),c=this.renderer.state.buffers.stencil;c.setFunc(o.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),c.setFunc(o.EQUAL,1,4294967295)}this.swapBuffers()}It!==void 0&&(r instanceof It?i=!0:r instanceof ri&&(i=!1))}}this.renderer.setRenderTarget(s)}reset(e){if(e===void 0){const s=this.renderer.getSize(new F);this._pixelRatio=this.renderer.getPixelRatio(),this._width=s.width,this._height=s.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,s){this._width=e,this._height=s;const i=this._width*this._pixelRatio,a=this._height*this._pixelRatio;this.renderTarget1.setSize(i,a),this.renderTarget2.setSize(i,a);for(let n=0;n<this.passes.length;n++)this.passes[n].setSize(i,a)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}}class ss extends ve{constructor(e,s,i=null,a=null,n=null){super(),this.scene=e,this.camera=s,this.overrideMaterial=i,this.clearColor=a,this.clearAlpha=n,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this._oldClearColor=new O}render(e,s,i){const a=e.autoClear;e.autoClear=!1;let n,r;this.overrideMaterial!==null&&(r=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(n=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:i),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(n),this.overrideMaterial!==null&&(this.scene.overrideMaterial=r),e.autoClear=a}}class fe extends ve{constructor(e,s,i,a){super(),this.renderScene=s,this.renderCamera=i,this.selectedObjects=a!==void 0?a:[],this.visibleEdgeColor=new O(1,1,1),this.hiddenEdgeColor=new O(.1,.04,.02),this.edgeGlow=0,this.usePatternTexture=!1,this.edgeThickness=1,this.edgeStrength=3,this.downSampleRatio=2,this.pulsePeriod=0,this._visibilityCache=new Map,this._selectionCache=new Set,this.resolution=e!==void 0?new F(e.x,e.y):new F(256,256);const n=Math.round(this.resolution.x/this.downSampleRatio),r=Math.round(this.resolution.y/this.downSampleRatio);this.renderTargetMaskBuffer=new q(this.resolution.x,this.resolution.y),this.renderTargetMaskBuffer.texture.name="OutlinePass.mask",this.renderTargetMaskBuffer.texture.generateMipmaps=!1,this.depthMaterial=new cs,this.depthMaterial.side=it,this.depthMaterial.depthPacking=us,this.depthMaterial.blending=re,this.prepareMaskMaterial=this.getPrepareMaskMaterial(),this.prepareMaskMaterial.side=it,this.prepareMaskMaterial.fragmentShader=u(this.prepareMaskMaterial.fragmentShader,this.renderCamera),this.renderTargetDepthBuffer=new q(this.resolution.x,this.resolution.y,{type:K}),this.renderTargetDepthBuffer.texture.name="OutlinePass.depth",this.renderTargetDepthBuffer.texture.generateMipmaps=!1,this.renderTargetMaskDownSampleBuffer=new q(n,r,{type:K}),this.renderTargetMaskDownSampleBuffer.texture.name="OutlinePass.depthDownSample",this.renderTargetMaskDownSampleBuffer.texture.generateMipmaps=!1,this.renderTargetBlurBuffer1=new q(n,r,{type:K}),this.renderTargetBlurBuffer1.texture.name="OutlinePass.blur1",this.renderTargetBlurBuffer1.texture.generateMipmaps=!1,this.renderTargetBlurBuffer2=new q(Math.round(n/2),Math.round(r/2),{type:K}),this.renderTargetBlurBuffer2.texture.name="OutlinePass.blur2",this.renderTargetBlurBuffer2.texture.generateMipmaps=!1,this.edgeDetectionMaterial=this.getEdgeDetectionMaterial(),this.renderTargetEdgeBuffer1=new q(n,r,{type:K}),this.renderTargetEdgeBuffer1.texture.name="OutlinePass.edge1",this.renderTargetEdgeBuffer1.texture.generateMipmaps=!1,this.renderTargetEdgeBuffer2=new q(Math.round(n/2),Math.round(r/2),{type:K}),this.renderTargetEdgeBuffer2.texture.name="OutlinePass.edge2",this.renderTargetEdgeBuffer2.texture.generateMipmaps=!1;const o=4,c=4;this.separableBlurMaterial1=this.getSeperableBlurMaterial(o),this.separableBlurMaterial1.uniforms.texSize.value.set(n,r),this.separableBlurMaterial1.uniforms.kernelRadius.value=1,this.separableBlurMaterial2=this.getSeperableBlurMaterial(c),this.separableBlurMaterial2.uniforms.texSize.value.set(Math.round(n/2),Math.round(r/2)),this.separableBlurMaterial2.uniforms.kernelRadius.value=c,this.overlayMaterial=this.getOverlayMaterial();const l=Ce;this.copyUniforms=J.clone(l.uniforms),this.materialCopy=new X({uniforms:this.copyUniforms,vertexShader:l.vertexShader,fragmentShader:l.fragmentShader,blending:re,depthTest:!1,depthWrite:!1}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new O,this.oldClearAlpha=1,this.fsQuad=new je(null),this.tempPulseColor1=new O,this.tempPulseColor2=new O,this.textureMatrix=new ge;function u(h,m){const f=m.isPerspectiveCamera?"perspective":"orthographic";return h.replace(/DEPTH_TO_VIEW_Z/g,f+"DepthToViewZ")}}dispose(){this.renderTargetMaskBuffer.dispose(),this.renderTargetDepthBuffer.dispose(),this.renderTargetMaskDownSampleBuffer.dispose(),this.renderTargetBlurBuffer1.dispose(),this.renderTargetBlurBuffer2.dispose(),this.renderTargetEdgeBuffer1.dispose(),this.renderTargetEdgeBuffer2.dispose(),this.depthMaterial.dispose(),this.prepareMaskMaterial.dispose(),this.edgeDetectionMaterial.dispose(),this.separableBlurMaterial1.dispose(),this.separableBlurMaterial2.dispose(),this.overlayMaterial.dispose(),this.materialCopy.dispose(),this.fsQuad.dispose()}setSize(e,s){this.renderTargetMaskBuffer.setSize(e,s),this.renderTargetDepthBuffer.setSize(e,s);let i=Math.round(e/this.downSampleRatio),a=Math.round(s/this.downSampleRatio);this.renderTargetMaskDownSampleBuffer.setSize(i,a),this.renderTargetBlurBuffer1.setSize(i,a),this.renderTargetEdgeBuffer1.setSize(i,a),this.separableBlurMaterial1.uniforms.texSize.value.set(i,a),i=Math.round(i/2),a=Math.round(a/2),this.renderTargetBlurBuffer2.setSize(i,a),this.renderTargetEdgeBuffer2.setSize(i,a),this.separableBlurMaterial2.uniforms.texSize.value.set(i,a)}updateSelectionCache(){const e=this._selectionCache;function s(i){i.isMesh&&e.add(i)}e.clear();for(let i=0;i<this.selectedObjects.length;i++)this.selectedObjects[i].traverse(s)}changeVisibilityOfSelectedObjects(e){const s=this._visibilityCache;for(const i of this._selectionCache)e===!0?i.visible=s.get(i):(s.set(i,i.visible),i.visible=e)}changeVisibilityOfNonSelectedObjects(e){const s=this._visibilityCache,i=this._selectionCache;function a(n){if(n.isMesh||n.isSprite){if(!i.has(n)){const r=n.visible;(e===!1||s.get(n)===!0)&&(n.visible=e),s.set(n,r)}}else(n.isPoints||n.isLine)&&(e===!0?n.visible=s.get(n):(s.set(n,n.visible),n.visible=e))}this.renderScene.traverse(a)}updateTextureMatrix(){this.textureMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),this.textureMatrix.multiply(this.renderCamera.projectionMatrix),this.textureMatrix.multiply(this.renderCamera.matrixWorldInverse)}render(e,s,i,a,n){if(this.selectedObjects.length>0){e.getClearColor(this._oldClearColor),this.oldClearAlpha=e.getClearAlpha();const r=e.autoClear;e.autoClear=!1,n&&e.state.buffers.stencil.setTest(!1),e.setClearColor(16777215,1),this.updateSelectionCache(),this.changeVisibilityOfSelectedObjects(!1);const o=this.renderScene.background;if(this.renderScene.background=null,this.renderScene.overrideMaterial=this.depthMaterial,e.setRenderTarget(this.renderTargetDepthBuffer),e.clear(),e.render(this.renderScene,this.renderCamera),this.changeVisibilityOfSelectedObjects(!0),this._visibilityCache.clear(),this.updateTextureMatrix(),this.changeVisibilityOfNonSelectedObjects(!1),this.renderScene.overrideMaterial=this.prepareMaskMaterial,this.prepareMaskMaterial.uniforms.cameraNearFar.value.set(this.renderCamera.near,this.renderCamera.far),this.prepareMaskMaterial.uniforms.depthTexture.value=this.renderTargetDepthBuffer.texture,this.prepareMaskMaterial.uniforms.textureMatrix.value=this.textureMatrix,e.setRenderTarget(this.renderTargetMaskBuffer),e.clear(),e.render(this.renderScene,this.renderCamera),this.renderScene.overrideMaterial=null,this.changeVisibilityOfNonSelectedObjects(!0),this._visibilityCache.clear(),this._selectionCache.clear(),this.renderScene.background=o,this.fsQuad.material=this.materialCopy,this.copyUniforms.tDiffuse.value=this.renderTargetMaskBuffer.texture,e.setRenderTarget(this.renderTargetMaskDownSampleBuffer),e.clear(),this.fsQuad.render(e),this.tempPulseColor1.copy(this.visibleEdgeColor),this.tempPulseColor2.copy(this.hiddenEdgeColor),this.pulsePeriod>0){const c=.625+Math.cos(performance.now()*.01/this.pulsePeriod)*.75/2;this.tempPulseColor1.multiplyScalar(c),this.tempPulseColor2.multiplyScalar(c)}this.fsQuad.material=this.edgeDetectionMaterial,this.edgeDetectionMaterial.uniforms.maskTexture.value=this.renderTargetMaskDownSampleBuffer.texture,this.edgeDetectionMaterial.uniforms.texSize.value.set(this.renderTargetMaskDownSampleBuffer.width,this.renderTargetMaskDownSampleBuffer.height),this.edgeDetectionMaterial.uniforms.visibleEdgeColor.value=this.tempPulseColor1,this.edgeDetectionMaterial.uniforms.hiddenEdgeColor.value=this.tempPulseColor2,e.setRenderTarget(this.renderTargetEdgeBuffer1),e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.separableBlurMaterial1,this.separableBlurMaterial1.uniforms.colorTexture.value=this.renderTargetEdgeBuffer1.texture,this.separableBlurMaterial1.uniforms.direction.value=fe.BlurDirectionX,this.separableBlurMaterial1.uniforms.kernelRadius.value=this.edgeThickness,e.setRenderTarget(this.renderTargetBlurBuffer1),e.clear(),this.fsQuad.render(e),this.separableBlurMaterial1.uniforms.colorTexture.value=this.renderTargetBlurBuffer1.texture,this.separableBlurMaterial1.uniforms.direction.value=fe.BlurDirectionY,e.setRenderTarget(this.renderTargetEdgeBuffer1),e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.separableBlurMaterial2,this.separableBlurMaterial2.uniforms.colorTexture.value=this.renderTargetEdgeBuffer1.texture,this.separableBlurMaterial2.uniforms.direction.value=fe.BlurDirectionX,e.setRenderTarget(this.renderTargetBlurBuffer2),e.clear(),this.fsQuad.render(e),this.separableBlurMaterial2.uniforms.colorTexture.value=this.renderTargetBlurBuffer2.texture,this.separableBlurMaterial2.uniforms.direction.value=fe.BlurDirectionY,e.setRenderTarget(this.renderTargetEdgeBuffer2),e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.overlayMaterial,this.overlayMaterial.uniforms.maskTexture.value=this.renderTargetMaskBuffer.texture,this.overlayMaterial.uniforms.edgeTexture1.value=this.renderTargetEdgeBuffer1.texture,this.overlayMaterial.uniforms.edgeTexture2.value=this.renderTargetEdgeBuffer2.texture,this.overlayMaterial.uniforms.patternTexture.value=this.patternTexture,this.overlayMaterial.uniforms.edgeStrength.value=this.edgeStrength,this.overlayMaterial.uniforms.edgeGlow.value=this.edgeGlow,this.overlayMaterial.uniforms.usePatternTexture.value=this.usePatternTexture,n&&e.state.buffers.stencil.setTest(!0),e.setRenderTarget(i),this.fsQuad.render(e),e.setClearColor(this._oldClearColor,this.oldClearAlpha),e.autoClear=r}this.renderToScreen&&(this.fsQuad.material=this.materialCopy,this.copyUniforms.tDiffuse.value=i.texture,e.setRenderTarget(null),this.fsQuad.render(e))}getPrepareMaskMaterial(){return new X({uniforms:{depthTexture:{value:null},cameraNearFar:{value:new F(.5,.5)},textureMatrix:{value:null}},vertexShader:`#include <morphtarget_pars_vertex>
				#include <skinning_pars_vertex>

				varying vec4 projTexCoord;
				varying vec4 vPosition;
				uniform mat4 textureMatrix;

				void main() {

					#include <skinbase_vertex>
					#include <begin_vertex>
					#include <morphtarget_vertex>
					#include <skinning_vertex>
					#include <project_vertex>

					vPosition = mvPosition;

					vec4 worldPosition = vec4( transformed, 1.0 );

					#ifdef USE_INSTANCING

						worldPosition = instanceMatrix * worldPosition;

					#endif

					worldPosition = modelMatrix * worldPosition;

					projTexCoord = textureMatrix * worldPosition;

				}`,fragmentShader:`#include <packing>
				varying vec4 vPosition;
				varying vec4 projTexCoord;
				uniform sampler2D depthTexture;
				uniform vec2 cameraNearFar;

				void main() {

					float depth = unpackRGBAToDepth(texture2DProj( depthTexture, projTexCoord ));
					float viewZ = - DEPTH_TO_VIEW_Z( depth, cameraNearFar.x, cameraNearFar.y );
					float depthTest = (-vPosition.z > viewZ) ? 1.0 : 0.0;
					gl_FragColor = vec4(0.0, depthTest, 1.0, 1.0);

				}`})}getEdgeDetectionMaterial(){return new X({uniforms:{maskTexture:{value:null},texSize:{value:new F(.5,.5)},visibleEdgeColor:{value:new g(1,1,1)},hiddenEdgeColor:{value:new g(1,1,1)}},vertexShader:`varying vec2 vUv;

				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;

				uniform sampler2D maskTexture;
				uniform vec2 texSize;
				uniform vec3 visibleEdgeColor;
				uniform vec3 hiddenEdgeColor;

				void main() {
					vec2 invSize = 1.0 / texSize;
					vec4 uvOffset = vec4(1.0, 0.0, 0.0, 1.0) * vec4(invSize, invSize);
					vec4 c1 = texture2D( maskTexture, vUv + uvOffset.xy);
					vec4 c2 = texture2D( maskTexture, vUv - uvOffset.xy);
					vec4 c3 = texture2D( maskTexture, vUv + uvOffset.yw);
					vec4 c4 = texture2D( maskTexture, vUv - uvOffset.yw);
					float diff1 = (c1.r - c2.r)*0.5;
					float diff2 = (c3.r - c4.r)*0.5;
					float d = length( vec2(diff1, diff2) );
					float a1 = min(c1.g, c2.g);
					float a2 = min(c3.g, c4.g);
					float visibilityFactor = min(a1, a2);
					vec3 edgeColor = 1.0 - visibilityFactor > 0.001 ? visibleEdgeColor : hiddenEdgeColor;
					gl_FragColor = vec4(edgeColor, 1.0) * vec4(d);
				}`})}getSeperableBlurMaterial(e){return new X({defines:{MAX_RADIUS:e},uniforms:{colorTexture:{value:null},texSize:{value:new F(.5,.5)},direction:{value:new F(.5,.5)},kernelRadius:{value:1}},vertexShader:`varying vec2 vUv;

				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 texSize;
				uniform vec2 direction;
				uniform float kernelRadius;

				float gaussianPdf(in float x, in float sigma) {
					return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
				}

				void main() {
					vec2 invSize = 1.0 / texSize;
					float sigma = kernelRadius/2.0;
					float weightSum = gaussianPdf(0.0, sigma);
					vec4 diffuseSum = texture2D( colorTexture, vUv) * weightSum;
					vec2 delta = direction * invSize * kernelRadius/float(MAX_RADIUS);
					vec2 uvOffset = delta;
					for( int i = 1; i <= MAX_RADIUS; i ++ ) {
						float x = kernelRadius * float(i) / float(MAX_RADIUS);
						float w = gaussianPdf(x, sigma);
						vec4 sample1 = texture2D( colorTexture, vUv + uvOffset);
						vec4 sample2 = texture2D( colorTexture, vUv - uvOffset);
						diffuseSum += ((sample1 + sample2) * w);
						weightSum += (2.0 * w);
						uvOffset += delta;
					}
					gl_FragColor = diffuseSum/weightSum;
				}`})}getOverlayMaterial(){return new X({uniforms:{maskTexture:{value:null},edgeTexture1:{value:null},edgeTexture2:{value:null},patternTexture:{value:null},edgeStrength:{value:1},edgeGlow:{value:1},usePatternTexture:{value:0}},vertexShader:`varying vec2 vUv;

				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;

				uniform sampler2D maskTexture;
				uniform sampler2D edgeTexture1;
				uniform sampler2D edgeTexture2;
				uniform sampler2D patternTexture;
				uniform float edgeStrength;
				uniform float edgeGlow;
				uniform bool usePatternTexture;

				void main() {
					vec4 edgeValue1 = texture2D(edgeTexture1, vUv);
					vec4 edgeValue2 = texture2D(edgeTexture2, vUv);
					vec4 maskColor = texture2D(maskTexture, vUv);
					vec4 patternColor = texture2D(patternTexture, 6.0 * vUv);
					float visibilityFactor = 1.0 - maskColor.g > 0.0 ? 1.0 : 0.5;
					vec4 edgeValue = edgeValue1 + edgeValue2 * edgeGlow;
					vec4 finalColor = edgeStrength * maskColor.r * edgeValue;
					if(usePatternTexture)
						finalColor += + visibilityFactor * (1.0 - maskColor.r) * (1.0 - patternColor.r);
					gl_FragColor = finalColor;
				}`,blending:Qt,depthTest:!1,depthWrite:!1,transparent:!0})}}fe.BlurDirectionX=new F(1,0);fe.BlurDirectionY=new F(0,1);class oi{constructor(){this.data={selectedObject:null,scene:null,camera:null,skeletons:new Map,mixers:new Map,clips:new Map,physicsBodies:new Map,timeline:{currentTime:0,isPlaying:!1,fps:60,duration:10}},this._listeners={}}on(e,s){this._listeners[e]||(this._listeners[e]=[]),this._listeners[e].push(s)}off(e,s){this._listeners[e]&&(this._listeners[e]=this._listeners[e].filter(i=>i!==s))}emit(e,s){this._listeners[e]&&this._listeners[e].forEach(i=>i(s))}set(e,s){this.data[e]=s,this.emit(`state:${e}:changed`,s)}}class li{constructor(e){this.state=e,this._plugins=new Map,this._nodeRegistry=new Map}register(e){this._plugins.has(e.name)||(this._plugins.set(e.name,e),e.init&&e.init(this.state),e.nodes&&Object.entries(e.nodes).forEach(([s,i])=>{this._nodeRegistry.set(s,i)}),d.log(`[PluginManager] Registered: ${e.name}`))}update(e){this._plugins.forEach(s=>{s.update&&s.update(e)})}getNodeCreator(e){return this._nodeRegistry.get(e)}getAvailableNodes(){return Array.from(this._nodeRegistry.keys())}}class ci{constructor(e,s){this.state=e,this.plugins=s,this.activeGraph=[]}setGraph(e){this.activeGraph=e}evaluate(e){if(this.activeGraph.length===0)return;this.activeGraph.filter(i=>i.type.includes("Output")).forEach(i=>{this._traceAndExecute(i,e)})}_traceAndExecute(e,s,i=new Set){if(!e)return null;if(i.has(e))return d.warn(`[NodeGraphExecutor] Cycle detected at node: ${e.type}`),null;i.add(e);const a={};return e.inputs&&Object.keys(e.inputs).forEach(n=>{const r=e.inputs[n];r&&r.sourceNode?a[n]=this._traceAndExecute(r.sourceNode,s,i):a[n]=e.inputs[n].value}),this._executeNodeLogic(e.type,a,s)}_executeNodeLogic(e,s,i){if(!e||!e.includes("/"))return d.warn("NodeGraphExecutor",`Invalid node type: "${e}"`),s;const[a,n]=e.split("/");switch(a){case"Physics":return this._handlePhysicsNode(n,s,i);case"Animation":return this._handleAnimationNode(n,s,i);case"Geometry":return this._handleGeometryNode(n,s);case"Logic":return this._handleLogicNode(n,s,i);case"Rigging":return this._handleRiggingNode(n,s);case"GameMap":return this._handleGameMapNode(n,s);case"Selection":return this._handleSelectionNode(n,s);case"Water":return this._handleWaterNode(n,s);default:return s}}_handlePhysicsNode(e,s,i){return e==="ApplyForceNode"&&window.RustPhysicsBridge?.applyForce(s.target,s.force,i),s}_handleAnimationNode(e,s,i){if(e==="PlayAnimationNode"){const a=this.state.data.mixers.get(s.target?.uuid);a&&a.update(i)}return s}_handleGeometryNode(e,s){return s}async executeNodeOnDemand(e){if(!e||!e.dom)return d.warn("NodeGraphExecutor","Cannot execute invalid node"),null;const s=this._parseNodeInputs(e),[i,a]=e.type.split("/");return i==="Rust"?this._executeRustNode(a,s):i==="Go"?this._executeGoNode(a,s):i==="Water"?this._executeWaterNode(e,s):(d.warn("NodeGraphExecutor",`On-demand execution not yet implemented for ${e.type}`),null)}_parseNodeInputs(e){const s={};return e.dom&&e.dom.querySelectorAll("[data-prop]").forEach(i=>{const a=i.dataset.prop;let n;i.tagName==="INPUT"?i.type==="file"?n=i:i.type==="number"||i.type==="range"?n=parseFloat(i.value):i.type==="checkbox"?n=i.checked:n=i.value:i.tagName==="TEXTAREA"||i.tagName==="SELECT"?n=i.value:n=i.textContent,s[a]=n}),s}async _executeRustNode(e,s){const i=this.state.data.selectedObjects||[],a=this.plugins._plugins.get("Rust");if(!a)return d.warn("NodeGraphExecutor","RustPlugin not registered"),null;switch(e){case"BooleanCSGNode":{const n=s.meshA||i[0],r=s.meshB||i[1];if(!n||!r)return d.warn("NodeGraphExecutor","Boolean CSG requires 2 selected meshes"),this._notify("Boolean CSG requires 2 selected meshes","warning"),null;const o=s.operation||"union",c=await a.booleanCSG(n,r,o);if(c)return this._applyGeometryToScene(c,n,`CSG_${o}`);break}case"DecimateNode":{const n=s.mesh||i[0];if(!n)return d.warn("NodeGraphExecutor","Decimate requires a selected mesh"),this._notify("Decimate requires a selected mesh","warning"),null;const r=typeof s.percent=="number"?s.percent:parseFloat(s.percent)||50,o=await a.decimateMesh(n,r);if(o)return this._applyGeometryToScene(o,n,"Decimated");break}default:d.warn("NodeGraphExecutor",`Unknown Rust node action: ${e}`)}return null}async _executeGoNode(e,s){const i=this.plugins._plugins.get("Go");if(!i)return d.warn("NodeGraphExecutor","GoPlugin not registered"),null;switch(e){case"ParsePointCloudNode":{const a=s.file;if(!a||!a.files?.length)return this._notify("Select a point cloud file (.las/.ply)","warning"),null;const n=await a.files[0].arrayBuffer(),r=await i.parsePointCloud(n);return r&&(this.state.data.scene.add(r),this.plugins._plugins.get("Selection")?._setSelection([r]),this._notify(`Imported ${r.name}`,"success")),r}case"ImportCADNode":{const a=s.file;if(!a||!a.files?.length)return this._notify("Select a CAD file (.step/.iges)","warning"),null;const n=await a.files[0].arrayBuffer(),r=await i.importCAD(n);return r&&(this.state.data.scene.add(r),this.plugins._plugins.get("Selection")?._setSelection([r]),this._notify(`Imported ${r.name}`,"success")),r}default:d.warn("NodeGraphExecutor",`Unknown Go node action: ${e}`)}return null}_applyGeometryToScene(e,s,i){if(!e||!s)return null;const a=s.material?Array.isArray(s.material)?s.material[0].clone():s.material.clone():new ie({color:13421772,roughness:.5,metalness:.5}),n=new p(e,a);n.position.copy(s.position),n.rotation.copy(s.rotation),n.scale.copy(s.scale),n.name=`${i}_${Date.now()}`,n.userData.isManagedObject=!0,n.castShadow=!0,n.receiveShadow=!0,this.state.data.scene.add(n);const r=this.plugins._plugins.get("Selection");return r&&r._setSelection?r._setSelection([n]):(this.state.data.selectedObjects=[n],this.state.set("selectedObjects",[n]),this.state.emit("selection:changed",[n])),this._notify(`Created ${n.name}`,"success"),n}_notify(e,s="info"){this.state.emit("notification",{message:e,type:s}),d.log("NodeGraphExecutor",`${e}`)}_handleLogicNode(e,s,i){return e==="StateMachineNode"&&window.LuaBridge?.execute(s.target,s.states,i),s}_handleRiggingNode(e,s){return e==="CreateSkeletonNode"?this.state.data.skeletons.get(s.Name):s}_handleGameMapNode(e,s){return s}_handleSelectionNode(e,s){return s}_handleWaterNode(e,s){return d.log("NodeGraphExecutor",`Water node ${e} pass-through`),s}async _executeWaterNode(e,s){const i=this.plugins._plugins.get("Water");if(!i)return this._notify("WaterPlugin not registered","warning"),null;if(typeof i.executeNode!="function")return this._notify("WaterPlugin missing executeNode()","warning"),null;try{const a=await i.executeNode(e,s);if(a?.mesh)return this._notify(`Created ${a.mesh.name}`,"success"),a.mesh}catch(a){d.error("NodeGraphExecutor","Water node execution failed:",a),this._notify(`Water node failed: ${a.message||a}`,"error")}return null}}const ui={_states:new Map,execute(t,e,s){!t||!e||d.log(`[Lua Sandbox] Executing script on ${t.name} (dt: ${s})`)}};typeof window<"u"&&(window.LuaBridge=ui);function P(t,e,s,i=[],a=[],n={}){const r=document.createElement("div");r.className=["node-card",...n.extraClasses||[]].join(" ").trim(),r.style.position="absolute",r.style.left=`${t}px`,r.style.top=`${e}px`;const o=document.createElement("div");if(o.className="node-header",o.textContent=s,r.appendChild(o),i.length){const c=document.createElement("div");c.className="node-inputs",c.innerHTML=i.map(l=>`
        <div class="pin-row">
          <span class="pin-dot"></span>
          <span data-type="Object" data-prop="${l}">${l}</span>
        </div>
      `).join(""),r.appendChild(c)}if(n.body){const c=document.createElement("div");c.className="node-body",c.appendChild(n.body),r.appendChild(c)}if(a.length){const c=document.createElement("div");c.className="node-outputs",c.innerHTML=a.map(l=>`
        <div class="pin-row">
          <span data-type="${l}">${l}</span>
          <span class="pin-dot out"></span>
        </div>
      `).join(""),r.appendChild(c)}return hi(r),r}function hi(t){let e=!1,s=0,i=0,a=0,n=0;t.addEventListener("mousedown",r=>{if(["INPUT","TEXTAREA","BUTTON","SELECT"].includes(r.target.tagName))return;e=!0,s=r.clientX,i=r.clientY;const o=t.style;a=parseInt(o.left,10)||0,n=parseInt(o.top,10)||0,t.style.cursor="grabbing",t.style.zIndex="999",t.style.position="absolute",r.preventDefault()}),window.addEventListener("mousemove",r=>{e&&(t.style.left=a+r.clientX-s+"px",t.style.top=n+r.clientY-i+"px")}),window.addEventListener("mouseup",()=>{e&&(e=!1,t.style.cursor="grab",t.style.zIndex="")})}const di={name:"RiggingPlugin",init(t){this._state=t,d.log("RiggingPlugin","Initialized")},update(t){this._state.data.skeletons?.forEach(e=>{e.bones.forEach(s=>{s.matrixWorldNeedsUpdate&&s.updateMatrixWorld()})})},createSkeleton(t,e){const s=[];e.forEach(n=>{const r=new At;r.name=n.name,r.position.set(n.x??0,n.y??0,n.z??0),n.parent!==void 0&&s[n.parent]?.add(r),s.push(r)});const i=s[0],a=new hs(s);return this._state.data.skeletons.set(t,a),this._state.emit("skeleton:created",{name:t,root:i}),i},addBone(t,e,s){const i=this._state.data.skeletons.get(t);if(!i)return;const a=i.bones.find(r=>r.name===e);if(!a)return;const n=new At;return n.name=s.name,n.position.set(s.x??0,s.y??0,s.z??0),a.add(n),i.bones.push(n),i.boneInverses=null,this._state.emit("skeleton:boneAdded",{skeletonName:t,bone:n}),n},nodes:{"Rigging/CreateSkeletonNode":(t,e)=>P(t,e,"Create Skeleton",["Name","Bone Defs"],["Root Bone"]),"Rigging/AddBoneNode":(t,e)=>P(t,e,"Add Bone",["Skeleton","Parent Bone","Bone Def"],["Bone"]),"Rigging/BindSkinNode":(t,e)=>P(t,e,"Bind Skin",["Mesh","Skeleton"],["Skinned Mesh"])}},pi={name:"AnimationPlugin",init(t){this._state=t,t.on("state:selectedObject:changed",e=>{this._activeMixer=e?t.data.mixers.get(e.uuid):null}),d.log("AnimationPlugin","Initialized")},update(t){this._state.data.mixers?.forEach(e=>{e.update(t)})},createMixer(t){const e=new ds(t);return this._state.data.mixers.set(t.uuid,e),e},registerClip(t,e){return this._state.data.clips.set(t,e),this._state.emit("clip:registered",{name:t,duration:e.duration}),e},play(t,e){const s=this._state.data.mixers.get(t.uuid),i=this._state.data.clips.get(e);if(!s||!i)return null;const a=s.clipAction(i);return a.play(),a},blend(t,e,s,i=.5){const a=this._state.data.mixers.get(t.uuid),n=this._state.data.clips.get(e),r=this._state.data.clips.get(s);if(!a||!n||!r)return;const o=a.clipAction(n),c=a.clipAction(r);return o.fadeOut(i),c.reset().fadeIn(i).play(),c},nodes:{"Animation/PlayAnimationNode":(t,e)=>P(t,e,"Play Animation",["Target","Clip Name","Speed","Loop"],["Action"]),"Animation/BlendAnimationNode":(t,e)=>P(t,e,"Blend Animation",["Target","From Clip","To Clip","Duration"],["Action"]),"Animation/AnimationOutputNode":(t,e)=>P(t,e,"Animation Output",["Target","Clip"],[])}},mi={name:"PhysicsPlugin",_gravity:{x:0,y:-9.81,z:0},_groundLevel:0,_restitution:.4,_friction:.3,_timeStep:1/60,_accumulator:0,init(t){this._state=t,d.log("PhysicsPlugin","Initialized")},update(t){for(this._accumulator+=t;this._accumulator>=this._timeStep;)this._accumulator-=this._timeStep,this._step(this._timeStep)},_step(t){const e=this._state.data.physicsBodies;if(!e)return;const s=[];e.forEach(i=>{i.isStatic||!i.object||(s.push(i),i.velocity.x+=this._gravity.x*t,i.velocity.y+=this._gravity.y*t,i.velocity.z+=this._gravity.z*t,i.object.position.x+=i.velocity.x*t,i.object.position.y+=i.velocity.y*t,i.object.position.z+=i.velocity.z*t,this._resolveGroundCollision(i))});for(let i=0;i<s.length;i++)for(let a=i+1;a<s.length;a++)this._resolveBodyCollision(s[i],s[a])},_resolveGroundCollision(t){const e=t.object,s=this._getBodyHalfHeight(t),i=this._groundLevel+s;e.position.y<i&&(e.position.y=i,t.velocity.y<-.1?(t.velocity.y=-t.velocity.y*this._restitution,t.velocity.x*=1-this._friction,t.velocity.z*=1-this._friction):(t.velocity.y=0,t.velocity.x*=1-this._friction*2,t.velocity.z*=1-this._friction*2))},_resolveBodyCollision(t,e){const s=t.object.position,i=e.object.position,a=i.x-s.x,n=i.y-s.y,r=i.z-s.z,o=Math.sqrt(a*a+n*n+r*r),c=this._getBodyHalfHeight(t)+this._getBodyHalfHeight(e);if(o<c&&o>.001){const l=a/o,u=n/o,h=r/o,m=t.velocity.x-e.velocity.x,f=t.velocity.y-e.velocity.y,y=t.velocity.z-e.velocity.z,v=m*l+f*u+y*h;if(v>0){const _=v*(1+this._restitution)*.5;t.velocity.x-=_*l,t.velocity.y-=_*u,t.velocity.z-=_*h,e.velocity.x+=_*l,e.velocity.y+=_*u,e.velocity.z+=_*h}const x=(c-o)*.5;s.x-=x*l,s.y-=x*u,s.z-=x*h,i.x+=x*l,i.y+=x*u,i.z+=x*h}},_getBodyHalfHeight(t){if(!t.object||!t.object.geometry)return .5;const e=t.object.geometry;return e.boundingSphere||e.computeBoundingSphere(),e.boundingSphere?.radius??.5},createRigidBody(t,e,s={}){const i={name:t,object:e,velocity:{x:0,y:0,z:0},mass:s.mass??1,isStatic:s.isStatic??!1};return this._state.data.physicsBodies.set(e.uuid,i),e.userData.physicsBody=i,this._state.emit("physics:bodyCreated",i),i},applyForce(t,e,s){window.RustPhysicsBridge?.applyForce(t,e,s);const i=t?.userData?.physicsBody;!i||i.isStatic||(i.velocity.x+=(e.x??0)*(s??this._timeStep),i.velocity.y+=(e.y??0)*(s??this._timeStep),i.velocity.z+=(e.z??0)*(s??this._timeStep))},setGravity(t,e,s){this._gravity={x:t,y:e,z:s}},setGroundLevel(t){this._groundLevel=t},setRestitution(t){this._restitution=Math.max(0,Math.min(1,t))},setFriction(t){this._friction=Math.max(0,Math.min(1,t))},nodes:{"Physics/RigidBodyNode":(t,e)=>P(t,e,"Rigid Body",["Object","Mass","Static"],["Body"]),"Physics/ApplyForceNode":(t,e)=>P(t,e,"Apply Force",["Target","Force","Delta Time"],["Velocity"]),"Physics/PhysicsOutputNode":(t,e)=>P(t,e,"Physics Output",["Body"],[])}},fi={name:"ProceduralPlugin",init(t){this._state=t,d.log("ProceduralPlugin","Initialized")},generateTerrain(t,e,s,i){const a=new Me(t,e,s,s),n=a.attributes.position;for(let o=0;o<n.count;o++){const c=n.getX(o),l=n.getY(o),u=i(c,l);n.setZ(o,u)}a.computeVertexNormals();const r=new p(a,new ie({color:4491332,wireframe:!1}));return r.name="ProceduralTerrain",this._state.data.scene?.add(r),this._state.emit("geometry:generated",r),r},noiseDisplace(t,e=1,s=1){const i=t.geometry.attributes.position;for(let a=0;a<i.count;a++){const n=i.getX(a)*s,r=i.getY(a)*s,o=i.getZ(a)*s,c=Math.sin(n*3)*Math.cos(o*3)*Math.sin(r*2)*e;i.setX(a,i.getX(a)+c*.1),i.setZ(a,i.getZ(a)+c*.1)}return t.geometry.computeVertexNormals(),t.geometry.attributes.position.needsUpdate=!0,this._state.emit("geometry:displaced",t),t},computeBoolean(t,e,s){return d.log(`[ProceduralPlugin] CSG ${s} on ${t?.name} + ${e?.name}`),window.RustGeometryBridge?.computeBoolean(t,e,s)??t},nodes:{"Geometry/NoiseDisplaceNode":(t,e)=>P(t,e,"Noise Displace",["Mesh","Amplitude","Frequency"],["Displaced Mesh"]),"Geometry/BooleanCSGNode":(t,e)=>P(t,e,"Boolean CSG",["Mesh A","Mesh B","Operation"],["Result Mesh"]),"Geometry/GeometryOutputNode":(t,e)=>P(t,e,"Geometry Output",["Mesh"],[])}},gi={name:"AIBehaviorPlugin",_behaviors:new Map,init(t){this._state=t,t.on("state:selectedObject:changed",e=>{e&&this._behaviors.has(e.uuid)&&d.log(`[AIBehavior] Selected: ${e.name}, state: ${this._behaviors.get(e.uuid).current}`)}),d.log("AIBehaviorPlugin","Initialized")},update(t){this._behaviors.forEach((e,s)=>{const i=this._state.data.scene?.getObjectByProperty("uuid",s);if(!i)return;const a=e.transitions[e.current];if(a){for(const[n,r]of Object.entries(a))if(typeof n!="function"||n(i,t)){e.current=r,this._state.emit("ai:stateChanged",{uuid:s,from:e.current,to:r});break}}window.LuaBridge?.execute(i,e.states[e.current],t)})},defineStateMachine(t,e,s,i){const a={states:e,transitions:s,current:i??Object.keys(e)[0]};return this._behaviors.set(t.uuid,a),this._state.emit("ai:stateMachineDefined",{uuid:t.uuid,states:Object.keys(e)}),a},findPath(t,e){return d.log("AIBehavior",`Pathfinding from ${t} to ${e}`),[t,e]},nodes:{"Logic/StateMachineNode":(t,e)=>P(t,e,"State Machine",["Target","States","Transitions","Initial State"],["Current State"]),"Logic/BehaviorTreeNode":(t,e)=>P(t,e,"Behavior Tree",["Root Task","Blackboard"],["Status"]),"Logic/PathfindingNode":(t,e)=>P(t,e,"Pathfinding",["Target","From","To"],["Path"])}},_i={name:"GameMap",_state:null,_activeWorld:null,_mapCache:new Map,init(t){this._state=t,t.on("mapmaker:map:loaded",e=>{this._cacheMap(e)})},update(t){this._activeWorld&&this._updateWorldAnimations(t)},async generateTiledWorld(t,e={}){const{blendEdges:s=!0,edgeBlendWidth:i=2,autoLOD:a=!0,collisionLayer:n=!0}=e,r=new rt;r.name="Generated_World",r.userData.isWorldMap=!0,r.userData.isManagedObject=!0;for(const o of t){const c=await this._loadMap(o.mapId);if(!c)continue;const l=this._createMapSegment(c,o);r.add(l)}if(s&&this._blendMapEdges(r,i),n){const o=this._generateCollisionLayer(r);o.name="World_Collision",o.userData.isCollisionLayer=!0,o.visible=!1,r.add(o)}return a&&this._applyWorldLOD(r),this._activeWorld=r,this._state.data.scene.add(r),this._state.emit("world:generated",{world:r}),r},_blendMapEdges(t,e){const s=t.children.filter(i=>i.userData.isMapSegment);for(let i=0;i<s.length;i++)for(let a=i+1;a<s.length;a++){const n=s[i],r=s[a];n.position.distanceTo(r.position)<e*2&&this._createBlendZone(n,r,e)}},_createBlendZone(t,e,s){const i=t.position.clone().lerp(e.position,.5),a=new Me(s*2,10,32,32),n=new ie({color:8421504,transparent:!0,opacity:.5,side:it}),r=new p(a,n);r.position.copy(i),r.lookAt(e.position),r.rotateX(-Math.PI/2),r.userData.isBlendZone=!0,this._deformBlendVertices(r,t,e,s),t.parent.add(r)},_deformBlendVertices(t,e,s,i){const a=t.geometry.attributes.position.array,n=e.userData.heightmap,r=s.userData.heightmap;for(let o=0;o<a.length;o+=3){const c=a[o],l=a[o+2],u=(c+i)/(i*2),h=this._sampleHeightmap(n,c,l),m=this._sampleHeightmap(r,c,l);a[o+1]=Se.lerp(h,m,u)}t.geometry.attributes.position.needsUpdate=!0,t.geometry.computeVertexNormals()},_generateCollisionLayer(t){const e=new _e,s=[],i=[];t.traverse(n=>{if(n.isMesh&&n.userData.isTerrain){const r=n.geometry,o=r.attributes.position.array,c=r.index?r.index.array:null,l=s.length/3;for(let u=0;u+9<=o.length;u+=9)s.push(o[u],o[u+1],o[u+2]),s.push(o[u+3],o[u+4],o[u+5]),s.push(o[u+6],o[u+7],o[u+8]);if(c)for(let u=0;u<c.length;u+=3)i.push(c[u]+l,c[u+1]+l,c[u+2]+l)}}),e.setAttribute("position",new ee(s,3)),i.length>0&&e.setIndex(i);const a=new Ue({color:65280,wireframe:!0,transparent:!0,opacity:.3});return new p(e,a)},_applyWorldLOD(t){t.traverse(e=>{if(e.isMesh&&e.userData.isTerrain){const s=new ps;s.addLevel(e,0);const i=this._simplifyGeometry(e.geometry,.5),a=new p(i,e.material);s.addLevel(a,50);const n=this._simplifyGeometry(e.geometry,.25),r=new p(n,e.material);s.addLevel(r,100),e.parent.add(s),e.parent.remove(e)}})},_simplifyGeometry(t,e){const s=t.clone(),i=s.attributes.position.array,a=[],n=Math.floor(1/e);for(let r=0;r<i.length;r+=n*3)a.push(i[r],i[r+1],i[r+2]);return s.setAttribute("position",new ee(a,3)),s.computeVertexNormals(),s},_cacheMap(t){this._mapCache.set(t.id,t)},async _loadMap(t){return this._mapCache.has(t)?this._mapCache.get(t):new Promise(e=>{this._state.emit("mapmaker:map:request",{mapId:t,callback:e})})},_createMapSegment(t,e){const{position:s={x:0,y:0,z:0},rotation:i={x:0,y:0,z:0},scale:a={x:1,y:1,z:1}}=e,n=t.size||100,r=t.segments||50,o=new Me(n,n,r,r);if(t.heightmap){const u=o.attributes.position.array;for(let h=0;h<u.length;h+=3){const m=u[h],f=u[h+1];u[h+2]=this._sampleHeightmap(t.heightmap,m,f)}o.attributes.position.needsUpdate=!0,o.computeVertexNormals()}const c=new ie({color:t.color||4881486,roughness:.8,metalness:.2,flatShading:!1}),l=new p(o,c);return l.rotation.set(i.x,i.y,i.z),l.scale.set(a.x,a.y,a.z),l.position.set(s.x,s.y,s.z),l.userData.isMapSegment=!0,l.userData.isTerrain=!0,l.userData.isManagedObject=!0,l.userData.heightmap=t.heightmap,l.userData.mapId=t.id,l},_sampleHeightmap(t,e,s){if(!t||!t.data)return 0;const i=t.width,a=t.height,n=e/i+.5,r=s/a+.5,o=Math.max(0,Math.min(1,n)),c=Math.max(0,Math.min(1,r)),l=o*(i-1),u=c*(a-1),h=Math.floor(l),m=Math.min(h+1,i-1),f=Math.floor(u),y=Math.min(f+1,a-1),v=l-h,S=u-f,x=t.data[f*i+h],_=t.data[f*i+m],w=t.data[y*i+h],M=t.data[y*i+m],C=Se.lerp(x,_,v),D=Se.lerp(w,M,v);return Se.lerp(C,D,S)},_updateWorldAnimations(t){this._activeWorld.traverse(e=>{e.userData.isWater&&e.material.map&&(e.material.map.offset.y+=t*.05)})},nodes:{"GameMap/GenerateWorldNode":(t,e)=>P(t,e,"Generate Tiled World",["Map Configs","Blend Width"],["World Group"]),"GameMap/HeightmapNode":(t,e)=>P(t,e,"Heightmap Generator",["Width","Height","Scale","Seed"],["Heightmap Data"])}},vi={name:"Selection",_state:null,_selectionMode:"single",_isLassoActive:!1,_lassoPoints:[],_overlayCanvas:null,_overlayCtx:null,_viewport:null,_stickySelect:!1,_selectionHistory:[],init(t){this._state=t,this._overlayCanvas=document.getElementById("lassoOverlay"),this._viewport=document.getElementById("viewport"),this._overlayCanvas&&(this._overlayCtx=this._overlayCanvas.getContext("2d")),t.on("selection:mode:change",e=>{this._selectionMode=e})},startLassoSelect(){if(this._isLassoActive=!0,this._lassoPoints=[],this._selectionMode="lasso",this._overlayCanvas){this._overlayCanvas.style.display="block";const t=this._viewport?.clientWidth??this._overlayCanvas.offsetWidth,e=this._viewport?.clientHeight??this._overlayCanvas.offsetHeight;this._overlayCanvas.width=t,this._overlayCanvas.height=e,this._overlayCtx?.clearRect(0,0,t,e)}this._state.emit("selection:lasso:started")},addLassoPoint(t,e){this._isLassoActive&&(this._lassoPoints.push({x:t,y:e}),this._drawLassoOnOverlay())},completeLassoSelect(){if(!this._isLassoActive||this._lassoPoints.length<3){this.cancelLassoSelect();return}const t=this._getSelectableObjects(),e=[];t.forEach(s=>{const i=this._getScreenPosition(s);i&&this._isPointInPolygon(i,this._lassoPoints)&&e.push(s)}),this._stickySelect?this._addToSelection(e):this._setSelection(e),this.cancelLassoSelect(),this._state.emit("selection:lasso:completed",{count:e.length})},cancelLassoSelect(){this._isLassoActive=!1,this._lassoPoints=[],this._overlayCanvas&&(this._overlayCanvas.style.display="none",this._overlayCtx?.clearRect(0,0,this._overlayCanvas.width,this._overlayCanvas.height)),this._selectionMode="single"},_drawLassoOnOverlay(){if(!this._overlayCtx||!this._overlayCanvas)return;const t=this._overlayCtx,e=this._lassoPoints;if(e.length<2)return;const s=this._overlayCanvas.getBoundingClientRect(),i=s.left,a=s.top;t.clearRect(0,0,this._overlayCanvas.width,this._overlayCanvas.height),t.beginPath(),t.moveTo(e[0].x-i,e[0].y-a);for(let n=1;n<e.length;n++)t.lineTo(e[n].x-i,e[n].y-a);t.closePath(),t.fillStyle="rgba(0, 255, 136, 0.12)",t.fill(),t.strokeStyle="rgba(0, 255, 136, 0.8)",t.lineWidth=2,t.setLineDash([6,4]),t.stroke(),t.setLineDash([]),e.forEach(n=>{t.beginPath(),t.arc(n.x-i,n.y-a,4,0,Math.PI*2),t.fillStyle="#00ff88",t.fill()})},groupSelected(){const t=this._state.data.selectedObjects||[];if(t.length<2){this._state.emit("notification",{message:"Select at least 2 objects to group",type:"warning"});return}const e=new rt;e.name="Group_"+Date.now(),e.userData.isGroup=!0,e.userData.isManagedObject=!0;const s=new g;return t.forEach(i=>s.add(i.position)),s.divideScalar(t.length),e.position.copy(s),t.forEach(i=>{i.parent.remove(i),e.add(i),i.position.sub(s)}),this._state.data.scene.add(e),this._setSelection([e]),this._state.emit("selection:grouped",{group:e}),e},ungroupSelected(){const t=this._state.data.selectedObjects||[];if(t.length!==1||!t[0].userData.isGroup){this._state.emit("notification",{message:"Select a single group to ungroup",type:"warning"});return}const e=t[0],s=[...e.children];s.forEach(i=>{const a=new g;i.getWorldPosition(a),e.remove(i),this._state.data.scene.add(i),i.position.copy(a)}),this._state.data.scene.remove(e),this._setSelection(s),this._state.emit("selection:ungrouped",{count:s.length})},toggleStickySelect(){return this._stickySelect=!this._stickySelect,this._state.emit("selection:sticky:toggled",{enabled:this._stickySelect}),this._stickySelect},selectByColor(t){const e=new O(t),s=this._getSelectableObjects(),i=[];return s.forEach(a=>{if(a.material){const n=Array.isArray(a.material)?a.material:[a.material];for(const r of n)if(r.color&&r.color.equals(e)){i.push(a);break}}}),this._stickySelect?this._addToSelection(i):this._setSelection(i),this._state.emit("selection:byColor",{color:t,count:i.length}),i},selectByType(t){const e=[];return this._state.data.scene.traverse(s=>{s.type===t&&e.push(s)}),this._stickySelect?this._addToSelection(e):this._setSelection(e),this._state.emit("selection:byType",{type:t,count:e.length}),e},selectAll(){const t=this._getSelectableObjects();this._setSelection(t),this._state.emit("selection:all",{count:t.length})},deselectAll(){this._setSelection([]),this._state.emit("selection:deselected")},invertSelection(){const t=this._getSelectableObjects(),e=this._state.data.selectedObjects||[],s=t.filter(i=>!e.includes(i));this._setSelection(s),this._state.emit("selection:inverted",{count:s.length})},selectByBoundingBox(t,e){const s=new at(t,e),i=this._getSelectableObjects(),a=[];return i.forEach(n=>{const r=new at().setFromObject(n);s.intersectsBox(r)&&a.push(n)}),this._stickySelect?this._addToSelection(a):this._setSelection(a),this._state.emit("selection:byBoundingBox",{count:a.length}),a},selectByNamePattern(t){const e=new RegExp(t,"i"),s=this._getSelectableObjects(),i=[];return s.forEach(a=>{a.name&&e.test(a.name)&&i.push(a)}),this._stickySelect?this._addToSelection(i):this._setSelection(i),this._state.emit("selection:byName",{pattern:t,count:i.length}),i},_getSelectableObjects(){const t=[];return this._state.data.scene.traverse(e=>{(e.isMesh||e.isGroup)&&t.push(e)}),t},_setSelection(t){this._state.data.selectedObjects=t,this._state.set("selectedObjects",t),this._state.set("selectedObject",t.length===1?t[0]:null),this._selectionHistory.push([...t]),this._state.emit("selection:changed",t)},_addToSelection(t){const s=[...this._state.data.selectedObjects||[]];t.forEach(i=>{s.includes(i)||s.push(i)}),this._setSelection(s)},_getScreenPosition(t){const e=this._state.data.camera;if(!e)return null;const s=new g;t.getWorldPosition(s),s.project(e);const i=this._viewport?.clientWidth??window.innerWidth,a=this._viewport?.clientHeight??window.innerHeight;return{x:(s.x+1)/2*i,y:(-s.y+1)/2*a}},_isPointInPolygon(t,e){if(!t)return!1;let s=!1;const i=t.x,a=t.y;for(let n=0,r=e.length-1;n<e.length;r=n++){const o=e[n].x,c=e[n].y,l=e[r].x,u=e[r].y;c>a!=u>a&&i<(l-o)*(a-c)/(u-c)+o&&(s=!s)}return s},nodes:{"Selection/LassoSelectNode":(t,e)=>P(t,e,"Lasso Select",["Sticky Mode"],["Selected Objects"]),"Selection/SelectByColorNode":(t,e)=>P(t,e,"Select by Color",["Color"],["Selected Objects"]),"Selection/GroupNode":(t,e)=>P(t,e,"Group Objects",["Objects"],["Grouped Object"])}},yi={name:"StateManager",_state:{},_listeners:new Map,_middleware:[],_history:[],_isDispatching:!1,_masterState:null,_gfxResources:typeof Map=="function"?new Map:null,init(t){this._masterState=t,this._state={scene:{objectCount:0,selectedUUIDs:[]},performance:{fps:60,frameTime:16,memoryMB:0,gfxBytes:0,gfxResources:0,gfxWaterBytes:0,gfxWaterCount:0},plugins:{},render:{outlinePass:!0},physics:{substeps:10,stepTimeMS:0},memory:{gc:!1},water:{recommendCleanup:null},ui:{activeEditor:"3d-viewport",theme:"dark"},nodeGraph:{cacheEnabled:!1}},this._restoreState(),this.addMiddleware(this._historyMiddleware.bind(this)),this.addMiddleware(this._agentTelemetryMiddleware.bind(this)),this.addMiddleware(this._persistenceMiddleware.bind(this)),d.log("StateManager","Engine initialized.")},getState(t=""){return t?t.split(".").reduce((e,s)=>e?.[s],this._state):this._state},emit(t,e){this._masterState&&typeof this._masterState.emit=="function"?this._masterState.emit(t,e):d.warn("StateManager",`emit("${t}") called but masterState bus is not available`)},trackGfxResource(t,e,s="unknown",i=""){if(!t||typeof e!="number"||!Number.isFinite(e)||e<0)return d.warn("StateManager",`trackGfxResource: invalid args id=${t} bytes=${e}`),!1;if(!this._gfxResources)return!1;const a=this._gfxResources.get(t),n=a?e-a.bytes:e;return this._gfxResources.set(t,{bytes:e,type:s,label:i,allocatedAt:a?a.allocatedAt:Date.now()}),this._refreshGfxAggregates(),this.dispatch({type:"PERF/GFX_DELTA",path:"performance.gfxDelta",payload:{event:a?"update":"allocate",resourceId:t,type:s,label:i,bytes:e,deltaBytes:n,totalBytes:this.getGfxTotalBytes(),waterCount:this.getGfxResourceCount("water-cubemap"),waterBytes:this.getGfxBytesByType("water-cubemap"),ts:Date.now()}}),!0},releaseGfxResource(t){if(!t||!this._gfxResources)return!1;const e=this._gfxResources.get(t);return e?(this._gfxResources.delete(t),this._refreshGfxAggregates(),this.dispatch({type:"PERF/GFX_DELTA",path:"performance.gfxDelta",payload:{event:"release",resourceId:t,type:e.type,label:e.label,bytes:0,deltaBytes:-e.bytes,totalBytes:this.getGfxTotalBytes(),waterCount:this.getGfxResourceCount("water-cubemap"),waterBytes:this.getGfxBytesByType("water-cubemap"),ts:Date.now()}}),!0):(d.warn("StateManager",`releaseGfxResource: unknown id "${t}"`),!1)},getGfxTotalBytes(){if(!this._gfxResources)return 0;let t=0;for(const e of this._gfxResources.values())t+=e.bytes;return t},getGfxResourceCount(t){if(!this._gfxResources)return 0;if(!t)return this._gfxResources.size;let e=0;for(const s of this._gfxResources.values())s.type===t&&e++;return e},getGfxBytesByType(t){if(!this._gfxResources)return 0;let e=0;for(const s of this._gfxResources.values())s.type===t&&(e+=s.bytes);return e},getGfxResources(){return this._gfxResources?Array.from(this._gfxResources.entries()).map(([t,e])=>({id:t,...e})):[]},_refreshGfxAggregates(){this._gfxResources&&(this._setNestedState("performance.gfxBytes",this.getGfxTotalBytes()),this._setNestedState("performance.gfxResources",this._gfxResources.size),this._setNestedState("performance.gfxWaterBytes",this.getGfxBytesByType("water-cubemap")),this._setNestedState("performance.gfxWaterCount",this.getGfxResourceCount("water-cubemap")))},dispatch(t){if(this._isDispatching)throw new Error("[StateManager] Reducers may not dispatch actions.");try{this._isDispatching=!0;let e=this._state;for(const s of this._middleware)e=s(e,t)||e;t.path&&t.payload!==void 0&&this._setNestedState(t.path,t.payload),this._notifyListeners(t)}finally{this._isDispatching=!1}},_setNestedState(t,e){const s=t.split(".");let i=this._state;for(let a=0;a<s.length-1;a++)i[s[a]]||(i[s[a]]={}),i=i[s[a]];i[s[s.length-1]]=e},subscribe(t,e){return this._listeners.has(t)||this._listeners.set(t,new Set),this._listeners.get(t).add(e),()=>{this._listeners.get(t)?.delete(e)}},addMiddleware(t){this._middleware.push(t)},_historyMiddleware(t,e){return e.type.startsWith("SCENE/")&&(this._history.push({state:JSON.parse(JSON.stringify(t)),action:e}),this._history.length>50&&this._history.shift()),t},_agentTelemetryMiddleware(t,e){return(e.type.includes("METRIC")||e.type.includes("PERF"))&&window.AgentOrchestrator?.ingestTelemetry(e),t},_notifyListeners(t){t.path&&this._listeners.has(t.path)&&this._listeners.get(t.path).forEach(e=>e(this.getState(t.path),t)),this._listeners.forEach((e,s)=>{if(s.endsWith("*")){const i=s.slice(0,-1);t.path?.startsWith(i)&&e.forEach(a=>a(this.getState(i),t))}})},_STORAGE_KEY:"masterstudio_state",_persistenceMiddleware(t,e){if(e.type.startsWith("SCENE/")||e.type.includes("SET_"))try{const s={render:t.render,physics:t.physics,ui:t.ui,nodeGraph:t.nodeGraph,_ts:Date.now()};localStorage.setItem(this._STORAGE_KEY,JSON.stringify(s))}catch{}return t},_restoreState(){try{const t=localStorage.getItem(this._STORAGE_KEY);if(!t)return;const e=JSON.parse(t);e.render&&Object.assign(this._state.render,e.render),e.physics&&Object.assign(this._state.physics,e.physics),e.ui&&Object.assign(this._state.ui,e.ui),e.nodeGraph&&Object.assign(this._state.nodeGraph,e.nodeGraph),d.log("StateManager","Restored persisted state from",new Date(e._ts).toLocaleString())}catch{}},nodes:{"State/ReadStateNode":(t,e)=>P(t,e,"Read State",["State Path"],["Value"]),"State/DispatchActionNode":(t,e)=>P(t,e,"Dispatch Action",["Action Type","Payload"],[])}};class ot{constructor(){this.thresholds={},this.domain="",this.stateManager=null}onSpawn(e){}analyze(e){return[]}execute(e,s){e.action&&s.dispatch(e.action)}}class wi extends ot{constructor(){super(),this.thresholds={minFPS:50,outlinePassEnabled:!0}}analyze(e){const s=e.filter(n=>n.path==="performance.fps").slice(-10);if(s.length===0)return[];const i=s.reduce((n,r)=>n+(r.value??0),0)/s.length,a=[];return i<this.thresholds.minFPS&&this.thresholds.outlinePassEnabled?(a.push({reason:`FPS dropped to ${i.toFixed(1)}. Disabling Outline Pass.`,action:{type:"RENDER/SET_OUTLINE_PASS",payload:!1,path:"render.outlinePass"}}),this.thresholds.outlinePassEnabled=!1):i>58&&!this.thresholds.outlinePassEnabled&&(a.push({reason:`FPS recovered to ${i.toFixed(1)}. Re-enabling Outline Pass.`,action:{type:"RENDER/SET_OUTLINE_PASS",payload:!0,path:"render.outlinePass"}}),this.thresholds.outlinePassEnabled=!0),a}}class xi extends ot{constructor(){super(),this.thresholds={maxMemoryMB:500,lastCleanup:0,maxWaterCount:4,waterRecommendCooldownMS:3e4,lastWaterRecommend:0}}analyze(e){const s=[],i=e.filter(n=>n.path==="performance.memoryMB").slice(-1);if(i.length>0){const n=i[0].value;n>this.thresholds.maxMemoryMB&&(s.push({reason:`Memory usage high (${n.toFixed(0)}MB). Triggering texture cleanup.`,action:{type:"MEMORY/GC_TEXTURES",payload:Date.now(),path:"memory.gc"}}),this.thresholds.maxMemoryMB+=50)}const a=e.filter(n=>n.path==="performance.gfxDelta"&&n.value&&n.value.type==="water-cubemap");if(a.length>0){let n=0,r=0;for(const c of a)c.value.event==="allocate"&&(n+=1),c.value.event==="release"&&(n-=1);const o=[...a].reverse().find(c=>typeof c.value.waterCount=="number"&&typeof c.value.waterBytes=="number");if(o&&(n=o.value.waterCount,r=o.value.waterBytes),n>=this.thresholds.maxWaterCount&&Date.now()-this.thresholds.lastWaterRecommend>this.thresholds.waterRecommendCooldownMS){const c=r/1048576;s.push({reason:`${n} water surfaces active (~${c.toFixed(1)}MB GPU). Consider deleting unused water surfaces to free cubemap render targets.`,action:{type:"WATER/RECOMMEND_CLEANUP",payload:{count:n,bytes:r,mb:c},path:"water.recommendCleanup"}}),this.thresholds.lastWaterRecommend=Date.now()}}return s}}class bi extends ot{constructor(){super(),this.thresholds={maxPhysicsTimeMS:8,currentSubsteps:10}}analyze(e){const s=e.filter(n=>n.path==="physics.stepTimeMS").slice(-5);if(s.length===0)return[];const i=s.reduce((n,r)=>n+(r.value??0),0)/s.length,a=[];return i>this.thresholds.maxPhysicsTimeMS&&this.thresholds.currentSubsteps>4&&(a.push({reason:`Physics step ${i.toFixed(1)}ms. Reducing substeps.`,action:{type:"PHYSICS/SET_SUBSTEPS",payload:this.thresholds.currentSubsteps-2,path:"physics.substeps"}}),this.thresholds.currentSubsteps-=2),a}}class Si extends ot{constructor(){super(),this.thresholds={maxNodeEvalTimeMS:5}}analyze(e){const s=e.filter(n=>n.type==="NODE_GRAPH/EVAL_TIME").slice(-1);if(s.length===0)return[];const i=s[0].value,a=[];return i>this.thresholds.maxNodeEvalTimeMS&&a.push({reason:`Node graph eval ${i.toFixed(1)}ms. Enabling aggressive caching.`,action:{type:"NODE_GRAPH/ENABLE_CACHE",payload:!0,path:"nodeGraph.cacheEnabled"}}),a}}const Mi={name:"AIAgents",_experts:new Map,_telemetryBuffer:[],_analysisInterval:2e3,_lastAnalysis:0,_state:null,init(t){this._state=t,window.AgentOrchestrator=this,this.spawnExpert("Performance",new wi),this.spawnExpert("Memory",new xi),this.spawnExpert("Physics",new bi),this.spawnExpert("NodeGraph",new Si),d.log(`[AIAgents] Orchestrator initialized with ${this._experts.size} experts.`)},update(t){const e=performance.now();e-this._lastAnalysis>this._analysisInterval&&(this._runAnalysisCycle(),this._lastAnalysis=e)},ingestTelemetry(t){this._telemetryBuffer.push({timestamp:performance.now(),type:t.type,path:t.path,value:t.payload}),this._telemetryBuffer.length>500&&this._telemetryBuffer.shift()},spawnExpert(t,e){e.domain=t,e.stateManager=this._state,this._experts.set(t,e),e.onSpawn(this._state)},_runAnalysisCycle(){this._experts.forEach((t,e)=>{try{const s=t.analyze(this._telemetryBuffer);s&&s.length>0&&s.forEach(i=>{d.log(`[AI Expert: ${e}]`,i.reason),t.execute(i,this._state),i.reason&&this._state.emit("notification",{message:`[${e}] ${i.reason}`,type:"info"})})}catch(s){d.error(`[AI Expert: ${e}]`,"Analysis failed:",s)}})},nodes:{"AI/AgentDashboardNode":(t,e)=>P(t,e,"AI Agent Dashboard",[],["System Healthy"])}},Pi={name:"MenuSystem",_state:null,_menuBar:null,_menus:new Map,init(t){this._state=t,this._createMenuBar(),this._setupMenus(),document.addEventListener("click",()=>this._closeAllMenus())},_createMenuBar(){const t=document.getElementById("app");t&&(t.style.height="calc(100vh - 32px)",t.style.marginTop="32px"),this._menuBar=document.createElement("div"),this._menuBar.id="studio-menu-bar",this._menuBar.style.cssText=`
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 32px;
      background: #1a1a1a;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: center;
      padding: 0 4px;
      z-index: 10000;
      font-family: system-ui, sans-serif;
      font-size: 13px;
    `,document.body.insertBefore(this._menuBar,document.body.firstChild)},_setupMenus(){this._addMenu("File",[{label:"Import GLB/GLTF",shortcut:"Ctrl+I",action:()=>document.getElementById("file-input")?.click()},{label:"Export GLB",action:()=>this._dispatch("export",{format:"glb"})},{label:"Export GLTF",action:()=>this._dispatch("export",{format:"gltf"})},{type:"separator"},{label:"Save Scene",shortcut:"Ctrl+S",action:()=>d.log("Menu","Save scene")},{label:"Load Scene",shortcut:"Ctrl+O",action:()=>d.log("Menu","Load scene")}]),this._addMenu("Edit",[{label:"Undo",shortcut:"Ctrl+Z",action:()=>this._dispatch("undo")},{label:"Redo",shortcut:"Ctrl+Shift+Z",action:()=>this._dispatch("redo")},{type:"separator"},{label:"Copy",shortcut:"Ctrl+C",action:()=>this._dispatch("copy")},{label:"Paste",shortcut:"Ctrl+V",action:()=>this._dispatch("paste")},{label:"Duplicate",shortcut:"Ctrl+D",action:()=>this._dispatch("duplicate")},{label:"Delete",shortcut:"Delete",action:()=>this._dispatch("delete")},{type:"separator"},{label:"Select All",shortcut:"A",action:()=>this._dispatch("selectAll")},{label:"Deselect All",shortcut:"Alt+A",action:()=>this._dispatch("deselectAll")},{label:"Invert Selection",action:()=>this._dispatch("invertSelection")}]),this._addMenu("Object",[{label:"Add Primitive",submenu:[{label:"Cube",action:()=>this._dispatch("addPrimitive",{type:"cube"})},{label:"UV Sphere",action:()=>this._dispatch("addPrimitive",{type:"uvsphere"})},{label:"Ico Sphere",action:()=>this._dispatch("addPrimitive",{type:"icosphere"})},{label:"Cone",action:()=>this._dispatch("addPrimitive",{type:"cone"})},{label:"Cylinder",action:()=>this._dispatch("addPrimitive",{type:"cylinder"})},{label:"Torus",action:()=>this._dispatch("addPrimitive",{type:"torus"})},{label:"Plane",action:()=>this._dispatch("addPrimitive",{type:"plane"})}]},{label:"Add Water Surface",action:()=>this._dispatch("addWater",{width:200,height:200,segments:128,distortionScale:3.7,alpha:1,sunDirection:[.7,.3,.7],sunColor:16777215,waterColor:7695,foamIntensity:.35})},{label:"Add Buoyant Box",action:()=>{this._dispatch("addPrimitive",{type:"cube"})}},{type:"separator"},{label:"Group",shortcut:"Ctrl+G",action:()=>this._dispatch("group")},{label:"Ungroup",shortcut:"Ctrl+Shift+G",action:()=>this._dispatch("ungroup")}]),this._addMenu("View",[{label:"Camera Views",submenu:[{label:"Perspective",shortcut:"5",action:()=>this._dispatch("setCameraView",{view:"perspective"})},{label:"Top",shortcut:"7",action:()=>this._dispatch("setCameraView",{view:"top"})},{label:"Front",shortcut:"1",action:()=>this._dispatch("setCameraView",{view:"front"})},{label:"Right",shortcut:"3",action:()=>this._dispatch("setCameraView",{view:"right"})},{type:"separator"},{label:"Reset View",shortcut:"Home",action:()=>this._dispatch("resetView")},{label:"Frame Selected",shortcut:"F",action:()=>this._dispatch("frameSelected")},{label:"Frame All",shortcut:"Shift+F",action:()=>this._dispatch("frameAll")}]},{type:"separator"},{label:"Lighting Presets",submenu:[{label:"Studio",action:()=>this._dispatch("applyLightingPreset",{preset:"studio"})},{label:"Outdoor Daylight",action:()=>this._dispatch("applyLightingPreset",{preset:"outdoor"})},{label:"Night Scene",action:()=>this._dispatch("applyLightingPreset",{preset:"night"})},{label:"Dramatic",action:()=>this._dispatch("applyLightingPreset",{preset:"dramatic"})}]}]),this._addMenu("Render",[{label:"Quality Presets",submenu:[{label:"Draft",action:()=>this._dispatch("setRenderPreset",{preset:"draft"})},{label:"Preview",action:()=>this._dispatch("setRenderPreset",{preset:"preview"})},{label:"Production",action:()=>this._dispatch("setRenderPreset",{preset:"production"})},{label:"Cinematic",action:()=>this._dispatch("setRenderPreset",{preset:"cinematic"})}]},{type:"separator"},{label:"Screenshot",shortcut:"F12",action:()=>this._dispatch("captureScreenshot")}]),this._addMenu("Window",[{label:"Toggle Node Graph",action:()=>this._dispatch("togglePanel",{panel:"sidebar"})},{label:"Toggle Debug Panel",action:()=>this._dispatch("togglePanel",{panel:"debug"})},{type:"separator"},{label:"Open Brutalist Editor →",action:()=>{window.location.href="/studio.html"}},{label:"Back to Node Editor ←",action:()=>{window.location.href="/index.html"}},{label:"Open Text Generator →",action:()=>{window.location.href="/scene.html"}},{label:"Open Main Scene →",action:()=>{window.location.href="/main.html"}},{label:"Open Node Architect →",action:()=>{window.location.href="/nodearchitect.html"}},{type:"separator"},{label:"Brutalist Skin v4.2.0",shortcut:"✓",action:()=>{this._dispatch("notification",{type:"success",message:"Brutalist skin active — drop nodes anywhere in the engine."}),d.info("Menu","Brutalist skin confirmed active")}},{label:"Add Node to Graph",action:()=>document.getElementById("add-node-menu")?.firstElementChild?.click()}]),this._addMenu("Help",[{label:"Keyboard Shortcuts",action:()=>d.log("Menu","Keyboard shortcuts: L=Lasso G=Group U=Ungroup S=Sticky P=Debug 1-3=Color")},{label:"About Master Studio",action:()=>alert("Master Studio — 3D Studio Environment")}])},_addMenu(t,e){const s=document.createElement("div");s.className="studio-menu-btn",s.textContent=t,s.style.cssText=`
      position: relative;
      padding: 6px 12px;
      cursor: pointer;
      color: #ccc;
      border-radius: 4px;
      user-select: none;
      white-space: nowrap;
    `,s.addEventListener("mouseenter",()=>{s.style.background="#333"}),s.addEventListener("mouseleave",()=>{s.style.background="transparent"});const i=document.createElement("div");i.className="studio-dropdown",i.style.cssText=`
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      background: #2a2a2a;
      border: 1px solid #444;
      min-width: 210px;
      z-index: 10001;
      box-shadow: 0 6px 16px rgba(0,0,0,0.6);
      border-radius: 0 0 6px 6px;
      padding: 4px 0;
    `,this._buildMenuItems(i,e),s.addEventListener("mouseenter",()=>{this._closeAllMenus(),i.style.display="block"}),s.addEventListener("click",a=>{a.stopPropagation();const n=i.style.display==="block";this._closeAllMenus(),n||(i.style.display="block")}),i.addEventListener("mouseenter",()=>{i.style.display="block"}),i.addEventListener("mouseleave",()=>{i.style.display="none"}),s.appendChild(i),this._menuBar.appendChild(s),this._menus.set(t,{button:s,dropdown:i})},_buildMenuItems(t,e){e.forEach(s=>{if(s.type==="separator"){const n=document.createElement("div");n.style.cssText="height: 1px; background: #444; margin: 4px 8px;",t.appendChild(n);return}const i=document.createElement("div");i.style.cssText=`
        position: relative;
        padding: 7px 16px;
        cursor: pointer;
        color: #ccc;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
      `;const a=document.createElement("span");if(a.textContent=s.label,i.appendChild(a),s.shortcut){const n=document.createElement("span");n.style.cssText="color: #666; font-size: 11px; margin-left: 24px;",n.textContent=s.shortcut,i.appendChild(n)}if(i.addEventListener("mouseenter",()=>{i.style.background="#4a9eff",i.style.color="#fff"}),i.addEventListener("mouseleave",()=>{i.style.background="transparent",i.style.color="#ccc"}),s.submenu){const n=document.createElement("span");n.style.cssText="margin-left: 8px; color: #666;",n.textContent="▶",i.appendChild(n);const r=document.createElement("div");r.style.cssText=`
          display: none;
          position: absolute;
          left: 100%;
          top: -4px;
          background: #2a2a2a;
          border: 1px solid #444;
          min-width: 200px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          border-radius: 0 6px 6px 6px;
          padding: 4px 0;
          z-index: 10002;
        `,this._buildMenuItems(r,s.submenu),i.addEventListener("mouseenter",()=>{r.style.display="block"}),i.addEventListener("mouseleave",()=>{r.style.display="none"}),r.addEventListener("mouseenter",()=>{r.style.display="block"}),r.addEventListener("mouseleave",()=>{r.style.display="none"}),i.appendChild(r)}else i.addEventListener("click",n=>{n.stopPropagation(),s.action&&s.action(),this._closeAllMenus()});t.appendChild(i)})},_closeAllMenus(){this._menus.forEach(t=>{t.dropdown.style.display="none",t.dropdown.querySelectorAll(".studio-dropdown").forEach(s=>{s.style.display="none"})})},_dispatch(t,e={}){window.dispatchEvent(new CustomEvent(t,{detail:e}))},update(t){},nodes:{}},Ei={name:"LightingCamera",_state:null,_cameraPresets:new Map,init(t){this._state=t,this._initCameraPresets(),this._setupEventListeners()},_initCameraPresets(){this._cameraPresets.set("perspective",{position:{x:6,y:5,z:10},target:{x:0,y:0,z:0},fov:75}),this._cameraPresets.set("top",{position:{x:0,y:15,z:.1},target:{x:0,y:0,z:0},fov:75}),this._cameraPresets.set("front",{position:{x:0,y:3,z:15},target:{x:0,y:0,z:0},fov:75}),this._cameraPresets.set("right",{position:{x:15,y:3,z:0},target:{x:0,y:0,z:0},fov:75})},_setupEventListeners(){window.addEventListener("setCameraView",t=>this.setCameraView(t.detail.view)),window.addEventListener("resetView",()=>this.setCameraView("perspective")),window.addEventListener("frameSelected",()=>this.frameSelected()),window.addEventListener("frameAll",()=>this.frameAll()),window.addEventListener("applyLightingPreset",t=>this.applyLightingPreset(t.detail.preset))},setCameraView(t){const e=this._cameraPresets.get(t);if(!e)return;const s=this._state.data.camera,i=this._state.data.controls;if(!s||!i)return;const a=s.position.clone(),n=i.target.clone(),r=new g(e.position.x,e.position.y,e.position.z),o=new g(e.target.x,e.target.y,e.target.z);e.fov&&(s.fov=e.fov,s.updateProjectionMatrix());const c=400,l=performance.now(),u=h=>{const m=h-l,f=Math.min(m/c,1),y=1-Math.pow(1-f,3);s.position.lerpVectors(a,r,y),i.target.lerpVectors(n,o,y),i.update(),f<1&&requestAnimationFrame(u)};requestAnimationFrame(u),this._state.emit("camera:view:changed",{preset:t})},frameSelected(){const t=this._state.data.selectedObjects;if(!t||t.length===0)return;const e=new at;t.forEach(s=>e.expandByObject(s)),this._frameBox(e)},frameAll(){const t=this._state.data.scene;if(!t)return;const e=new at;t.traverse(s=>{s.userData?.isManagedObject&&e.expandByObject(s)}),!e.isEmpty()&&this._frameBox(e)},_frameBox(t){const e=this._state.data.camera,s=this._state.data.controls;if(!e||!s)return;const i=t.getCenter(new g),a=t.getSize(new g),n=Math.max(a.x,a.y,a.z,.1),r=e.fov*(Math.PI/180),o=n/2/Math.tan(r/2)*1.5,c=e.position.clone().sub(s.target).normalize();c.length()<.01&&c.set(0,0,1),e.position.copy(i).addScaledVector(c,o),s.target.copy(i),s.update()},applyLightingPreset(t){const s=this._state.data.pluginManager?._plugins?.get("Lighting");if(s?.applyPreset){s.applyPreset(t),d.log(`[LightingCamera] Lighting preset → ${t}`);return}const i=this._state.data.scene;if(!i)return;const n={studio:{ambient:4473924,bg:1710618},outdoor:{ambient:8956620,bg:8900331},night:{ambient:1122884,bg:657946},dramatic:{ambient:1118481,bg:0}}[t];n&&(i.traverse(r=>{r.isAmbientLight&&r.color.set(n.ambient)}),i.background=new O(n.bg))},update(t){},nodes:{"Camera/SetViewNode":(t,e)=>P(t,e,"Set Camera View",["View"],[]),"Camera/FrameSelectedNode":(t,e)=>P(t,e,"Frame Selected",[],[]),"Camera/FrameAllNode":(t,e)=>P(t,e,"Frame All",[],[])}},Ci={name:"Lighting",_state:null,_lights:new Map,_environmentMap:null,_lightPresets:new Map,_pmremGenerator:null,_defaultPreset:"studio",init(t){this._state=t;const e=t.data.renderer;if(!e){d.warn("LightingPlugin","No renderer in state — PMREMGenerator skipped"),this._initDefaultPresets();return}this._pmremGenerator=new xs(e),this._pmremGenerator.compileEquirectangularShader(),this._initDefaultPresets(),this._setupDefaultLighting(),t.on("scene:cleared",()=>this._setupDefaultLighting())},update(t){this._lights.forEach(e=>{e.userData.animate&&this._animateLight(e,t)})},addLight(t,e={}){const{color:s=16777215,intensity:i=1,position:a={x:0,y:5,z:0},target:n={x:0,y:0,z:0},castShadow:r=!0,shadowMapSize:o=2048,name:c=`${t}_Light_${this._lights.size}`}=e;let l;switch(t){case"point":l=new ws(s,i,e.distance||50,e.decay||2);break;case"spot":l=new ys(s,i,e.distance||50,Se.degToRad(e.angle||45),e.penumbra||.5,e.decay||2),l.target.position.set(n.x,n.y,n.z),this._state.data.scene.add(l.target);break;case"directional":l=new Yt(s,i),l.target.position.set(n.x,n.y,n.z),this._state.data.scene.add(l.target);break;case"rectArea":l=new vs(s,i,e.width||5,e.height||5),l.lookAt(n.x,n.y,n.z);break;case"hemisphere":l=new _s(s,e.groundColor||4473924,i);break;case"ambient":l=new Zt(s,i);break;default:return d.warn(`[LightingPlugin] Unknown light type: ${t}`),null}return l.name=c,l.position.set(a.x,a.y,a.z),t!=="ambient"&&(l.castShadow=r),r&&l.shadow&&(l.shadow.mapSize.width=o,l.shadow.mapSize.height=o,l.shadow.camera.near=.1,l.shadow.camera.far=100,l.shadow.bias=-1e-4,l.shadow.normalBias=.05),l.userData.isLightSource=!0,l.userData.lightType=t,this._state.data.scene.add(l),this._lights.set(l.uuid,l),this._state.emit("lighting:light:added",{light:l,type:t}),l},removeLight(t){const e=this._lights.get(t);e&&(this._state.data.scene.remove(e),e.target&&this._state.data.scene.remove(e.target),this._lights.delete(t),this._state.emit("lighting:light:removed",{uuid:t}))},async loadHDRI(t,e=1,s=0){try{const a=await new ms().loadAsync(t);a.mapping=fs,a.colorSpace=gs;const n=this._pmremGenerator.fromEquirectangular(a).texture;return this._state.data.scene.environment=n,this._state.data.scene.background=(s>0,n),this._state.data.scene.backgroundIntensity=e,this._state.data.scene.environmentIntensity=e,this._environmentMap=n,a.dispose(),this._state.emit("lighting:hdri:loaded",{url:t,intensity:e}),n}catch(i){return d.error("LightingPlugin","Failed to load HDRI:",i),null}},applyPreset(t){const e=this._lightPresets.get(t);if(!e){d.warn("LightingPlugin",`Unknown preset: ${t}`);return}[...this._lights.keys()].forEach(i=>this.removeLight(i)),e.lights.forEach(i=>{this.addLight(i.type,i.options)}),e.environment&&(this._state.data.scene.background=new O(e.environment.background),this._state.data.scene.backgroundIntensity=e.environment.intensity||1),e.shadows&&this._state.data.renderer&&(this._state.data.renderer.shadowMap.enabled=e.shadows.enabled,this._state.data.renderer.shadowMap.type=e.shadows.type||oe),this._state.emit("lighting:preset:applied",{presetName:t})},updateLight(t,e){const s=this._lights.get(t);s&&(e.color!==void 0&&s.color.set(e.color),e.intensity!==void 0&&(s.intensity=e.intensity),e.position&&s.position.set(e.position.x,e.position.y,e.position.z),e.castShadow!==void 0&&(s.castShadow=e.castShadow),this._state.emit("lighting:light:updated",{uuid:t,properties:e}))},_initDefaultPresets(){this._lightPresets.set("studio",{name:"Studio",lights:[{type:"directional",options:{color:16777215,intensity:1.5,position:{x:5,y:10,z:7},castShadow:!0}},{type:"hemisphere",options:{color:16777215,groundColor:4473924,intensity:.6}},{type:"point",options:{color:16770244,intensity:.5,position:{x:-5,y:3,z:-5}}}],environment:{background:1710618,intensity:.3},shadows:{enabled:!0,type:oe}}),this._lightPresets.set("outdoor",{name:"Outdoor Daylight",lights:[{type:"directional",options:{color:16774368,intensity:2,position:{x:10,y:20,z:10},castShadow:!0,shadowMapSize:4096}},{type:"hemisphere",options:{color:8900331,groundColor:4021309,intensity:.8}}],environment:{background:8900331,intensity:1},shadows:{enabled:!0,type:oe}}),this._lightPresets.set("night",{name:"Night Scene",lights:[{type:"directional",options:{color:4482730,intensity:.3,position:{x:-5,y:10,z:5},castShadow:!0}},{type:"point",options:{color:16755268,intensity:1,position:{x:0,y:3,z:0},distance:20}},{type:"ambient",options:{color:1122884,intensity:.2}}],environment:{background:657946,intensity:.1},shadows:{enabled:!0,type:oe}}),this._lightPresets.set("dramatic",{name:"Dramatic",lights:[{type:"spot",options:{color:16777215,intensity:3,position:{x:0,y:8,z:5},angle:30,penumbra:.8,castShadow:!0,shadowMapSize:4096}},{type:"point",options:{color:16729156,intensity:.5,position:{x:-5,y:2,z:-3}}},{type:"point",options:{color:4474111,intensity:.5,position:{x:5,y:2,z:-3}}}],environment:{background:0,intensity:.05},shadows:{enabled:!0,type:oe}})},_setupDefaultLighting(){this.applyPreset(this._defaultPreset)},_animateLight(t,e){t.userData.flicker&&(t.intensity=t.userData.baseIntensity*(.8+Math.random()*.4)),t.userData.pulse&&(t.userData.pulseTime=(t.userData.pulseTime||0)+e,t.intensity=t.userData.baseIntensity*(.5+.5*Math.sin(t.userData.pulseTime*2)))},nodes:{"Lighting/AddLightNode":(t,e)=>P(t,e,"Add Light",["Type","Color","Intensity"],["Light"]),"Lighting/ApplyPresetNode":(t,e)=>P(t,e,"Lighting Preset",["Preset"],[]),"Lighting/LoadHDRINode":(t,e)=>P(t,e,"Load HDRI",["URL","Intensity"],["Env Map"])}},Di={uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new O(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`};class De extends ve{constructor(e,s,i,a){super(),this.strength=s!==void 0?s:1,this.radius=i,this.threshold=a,this.resolution=e!==void 0?new F(e.x,e.y):new F(256,256),this.clearColor=new O(0,0,0),this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let n=Math.round(this.resolution.x/2),r=Math.round(this.resolution.y/2);this.renderTargetBright=new q(n,r,{type:K}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let h=0;h<this.nMips;h++){const m=new q(n,r,{type:K});m.texture.name="UnrealBloomPass.h"+h,m.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(m);const f=new q(n,r,{type:K});f.texture.name="UnrealBloomPass.v"+h,f.texture.generateMipmaps=!1,this.renderTargetsVertical.push(f),n=Math.round(n/2),r=Math.round(r/2)}const o=Di;this.highPassUniforms=J.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=a,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new X({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];const c=[3,5,7,9,11];n=Math.round(this.resolution.x/2),r=Math.round(this.resolution.y/2);for(let h=0;h<this.nMips;h++)this.separableBlurMaterials.push(this.getSeperableBlurMaterial(c[h])),this.separableBlurMaterials[h].uniforms.invSize.value=new F(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2);this.compositeMaterial=this.getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=s,this.compositeMaterial.uniforms.bloomRadius.value=.1;const l=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=l,this.bloomTintColors=[new g(1,1,1),new g(1,1,1),new g(1,1,1),new g(1,1,1),new g(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;const u=Ce;this.copyUniforms=J.clone(u.uniforms),this.blendMaterial=new X({uniforms:this.copyUniforms,vertexShader:u.vertexShader,fragmentShader:u.fragmentShader,blending:Qt,depthTest:!1,depthWrite:!1,transparent:!0}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new O,this.oldClearAlpha=1,this.basic=new Ue,this.fsQuad=new je(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this.basic.dispose(),this.fsQuad.dispose()}setSize(e,s){let i=Math.round(e/2),a=Math.round(s/2);this.renderTargetBright.setSize(i,a);for(let n=0;n<this.nMips;n++)this.renderTargetsHorizontal[n].setSize(i,a),this.renderTargetsVertical[n].setSize(i,a),this.separableBlurMaterials[n].uniforms.invSize.value=new F(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2)}render(e,s,i,a,n){e.getClearColor(this._oldClearColor),this.oldClearAlpha=e.getClearAlpha();const r=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),n&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this.fsQuad.material=this.basic,this.basic.map=i.texture,e.setRenderTarget(null),e.clear(),this.fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=i.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this.fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this.fsQuad.render(e);let o=this.renderTargetBright;for(let c=0;c<this.nMips;c++)this.fsQuad.material=this.separableBlurMaterials[c],this.separableBlurMaterials[c].uniforms.colorTexture.value=o.texture,this.separableBlurMaterials[c].uniforms.direction.value=De.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[c]),e.clear(),this.fsQuad.render(e),this.separableBlurMaterials[c].uniforms.colorTexture.value=this.renderTargetsHorizontal[c].texture,this.separableBlurMaterials[c].uniforms.direction.value=De.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[c]),e.clear(),this.fsQuad.render(e),o=this.renderTargetsVertical[c];this.fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,n&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(i),this.fsQuad.render(e)),e.setClearColor(this._oldClearColor,this.oldClearAlpha),e.autoClear=r}getSeperableBlurMaterial(e){const s=[];for(let i=0;i<e;i++)s.push(.39894*Math.exp(-.5*i*i/(e*e))/e);return new X({defines:{KERNEL_RADIUS:e},uniforms:{colorTexture:{value:null},invSize:{value:new F(.5,.5)},direction:{value:new F(.5,.5)},gaussianCoefficients:{value:s}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {
					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`})}getCompositeMaterial(e){return new X({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`})}}De.BlurDirectionX=new F(1,0);De.BlurDirectionY=new F(0,1);class Ti{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let s=0;s<256;s++)this.p[s]=Math.floor(e.random()*256);this.perm=[];for(let s=0;s<512;s++)this.perm[s]=this.p[s&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}dot(e,s,i){return e[0]*s+e[1]*i}dot3(e,s,i,a){return e[0]*s+e[1]*i+e[2]*a}dot4(e,s,i,a,n){return e[0]*s+e[1]*i+e[2]*a+e[3]*n}noise(e,s){let i,a,n;const r=.5*(Math.sqrt(3)-1),o=(e+s)*r,c=Math.floor(e+o),l=Math.floor(s+o),u=(3-Math.sqrt(3))/6,h=(c+l)*u,m=c-h,f=l-h,y=e-m,v=s-f;let S,x;y>v?(S=1,x=0):(S=0,x=1);const _=y-S+u,w=v-x+u,M=y-1+2*u,C=v-1+2*u,D=c&255,R=l&255,N=this.perm[D+this.perm[R]]%12,B=this.perm[D+S+this.perm[R+x]]%12,A=this.perm[D+1+this.perm[R+1]]%12;let k=.5-y*y-v*v;k<0?i=0:(k*=k,i=k*k*this.dot(this.grad3[N],y,v));let E=.5-_*_-w*w;E<0?a=0:(E*=E,a=E*E*this.dot(this.grad3[B],_,w));let H=.5-M*M-C*C;return H<0?n=0:(H*=H,n=H*H*this.dot(this.grad3[A],M,C)),70*(i+a+n)}noise3d(e,s,i){let a,n,r,o;const l=(e+s+i)*.3333333333333333,u=Math.floor(e+l),h=Math.floor(s+l),m=Math.floor(i+l),f=1/6,y=(u+h+m)*f,v=u-y,S=h-y,x=m-y,_=e-v,w=s-S,M=i-x;let C,D,R,N,B,A;_>=w?w>=M?(C=1,D=0,R=0,N=1,B=1,A=0):_>=M?(C=1,D=0,R=0,N=1,B=0,A=1):(C=0,D=0,R=1,N=1,B=0,A=1):w<M?(C=0,D=0,R=1,N=0,B=1,A=1):_<M?(C=0,D=1,R=0,N=0,B=1,A=1):(C=0,D=1,R=0,N=1,B=1,A=0);const k=_-C+f,E=w-D+f,H=M-R+f,W=_-N+2*f,T=w-B+2*f,L=M-A+2*f,U=_-1+3*f,j=w-1+3*f,b=M-1+3*f,Q=u&255,Z=h&255,Y=m&255,ae=this.perm[Q+this.perm[Z+this.perm[Y]]]%12,ye=this.perm[Q+C+this.perm[Z+D+this.perm[Y+R]]]%12,He=this.perm[Q+N+this.perm[Z+B+this.perm[Y+A]]]%12,Ve=this.perm[Q+1+this.perm[Z+1+this.perm[Y+1]]]%12;let le=.6-_*_-w*w-M*M;le<0?a=0:(le*=le,a=le*le*this.dot3(this.grad3[ae],_,w,M));let ce=.6-k*k-E*E-H*H;ce<0?n=0:(ce*=ce,n=ce*ce*this.dot3(this.grad3[ye],k,E,H));let ue=.6-W*W-T*T-L*L;ue<0?r=0:(ue*=ue,r=ue*ue*this.dot3(this.grad3[He],W,T,L));let he=.6-U*U-j*j-b*b;return he<0?o=0:(he*=he,o=he*he*this.dot3(this.grad3[Ve],U,j,b)),32*(a+n+r+o)}noise4d(e,s,i,a){const n=this.grad4,r=this.simplex,o=this.perm,c=(Math.sqrt(5)-1)/4,l=(5-Math.sqrt(5))/20;let u,h,m,f,y;const v=(e+s+i+a)*c,S=Math.floor(e+v),x=Math.floor(s+v),_=Math.floor(i+v),w=Math.floor(a+v),M=(S+x+_+w)*l,C=S-M,D=x-M,R=_-M,N=w-M,B=e-C,A=s-D,k=i-R,E=a-N,H=B>A?32:0,W=B>k?16:0,T=A>k?8:0,L=B>E?4:0,U=A>E?2:0,j=k>E?1:0,b=H+W+T+L+U+j,Q=r[b][0]>=3?1:0,Z=r[b][1]>=3?1:0,Y=r[b][2]>=3?1:0,ae=r[b][3]>=3?1:0,ye=r[b][0]>=2?1:0,He=r[b][1]>=2?1:0,Ve=r[b][2]>=2?1:0,le=r[b][3]>=2?1:0,ce=r[b][0]>=1?1:0,ue=r[b][1]>=1?1:0,he=r[b][2]>=1?1:0,Tt=r[b][3]>=1?1:0,lt=B-Q+l,ct=A-Z+l,ut=k-Y+l,ht=E-ae+l,dt=B-ye+2*l,pt=A-He+2*l,mt=k-Ve+2*l,ft=E-le+2*l,gt=B-ce+3*l,_t=A-ue+3*l,vt=k-he+3*l,yt=E-Tt+3*l,wt=B-1+4*l,xt=A-1+4*l,bt=k-1+4*l,St=E-1+4*l,Te=S&255,Ae=x&255,Re=_&255,Be=w&255,is=o[Te+o[Ae+o[Re+o[Be]]]]%32,as=o[Te+Q+o[Ae+Z+o[Re+Y+o[Be+ae]]]]%32,ns=o[Te+ye+o[Ae+He+o[Re+Ve+o[Be+le]]]]%32,rs=o[Te+ce+o[Ae+ue+o[Re+he+o[Be+Tt]]]]%32,os=o[Te+1+o[Ae+1+o[Re+1+o[Be+1]]]]%32;let ke=.6-B*B-A*A-k*k-E*E;ke<0?u=0:(ke*=ke,u=ke*ke*this.dot4(n[is],B,A,k,E));let ze=.6-lt*lt-ct*ct-ut*ut-ht*ht;ze<0?h=0:(ze*=ze,h=ze*ze*this.dot4(n[as],lt,ct,ut,ht));let Ne=.6-dt*dt-pt*pt-mt*mt-ft*ft;Ne<0?m=0:(Ne*=Ne,m=Ne*Ne*this.dot4(n[ns],dt,pt,mt,ft));let Le=.6-gt*gt-_t*_t-vt*vt-yt*yt;Le<0?f=0:(Le*=Le,f=Le*Le*this.dot4(n[rs],gt,_t,vt,yt));let Ie=.6-wt*wt-xt*xt-bt*bt-St*St;return Ie<0?y=0:(Ie*=Ie,y=Ie*Ie*this.dot4(n[os],wt,xt,bt,St)),27*(u+h+m+f+y)}}const Qe={defines:{PERSPECTIVE_CAMERA:1,KERNEL_SIZE:32},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},kernel:{value:null},cameraNear:{value:null},cameraFar:{value:null},resolution:{value:new F},cameraProjectionMatrix:{value:new ge},cameraInverseProjectionMatrix:{value:new ge},kernelRadius:{value:8},minDistance:{value:.005},maxDistance:{value:.05}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`
		uniform highp sampler2D tNormal;
		uniform highp sampler2D tDepth;
		uniform sampler2D tNoise;

		uniform vec3 kernel[ KERNEL_SIZE ];

		uniform vec2 resolution;

		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraInverseProjectionMatrix;

		uniform float kernelRadius;
		uniform float minDistance; // avoid artifacts caused by neighbour fragments with minimal depth difference
		uniform float maxDistance; // avoid the influence of fragments which are too far away

		varying vec2 vUv;

		#include <packing>

		float getDepth( const in vec2 screenPosition ) {

			return texture2D( tDepth, screenPosition ).x;

		}

		float getLinearDepth( const in vec2 screenPosition ) {

			#if PERSPECTIVE_CAMERA == 1

				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );

			#else

				return texture2D( tDepth, screenPosition ).x;

			#endif

		}

		float getViewZ( const in float depth ) {

			#if PERSPECTIVE_CAMERA == 1

				return perspectiveDepthToViewZ( depth, cameraNear, cameraFar );

			#else

				return orthographicDepthToViewZ( depth, cameraNear, cameraFar );

			#endif

		}

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth, const in float viewZ ) {

			float clipW = cameraProjectionMatrix[2][3] * viewZ + cameraProjectionMatrix[3][3];

			vec4 clipPosition = vec4( ( vec3( screenPosition, depth ) - 0.5 ) * 2.0, 1.0 );

			clipPosition *= clipW; // unprojection.

			return ( cameraInverseProjectionMatrix * clipPosition ).xyz;

		}

		vec3 getViewNormal( const in vec2 screenPosition ) {

			return unpackRGBToNormal( texture2D( tNormal, screenPosition ).xyz );

		}

		void main() {

			float depth = getDepth( vUv );

			if ( depth == 1.0 ) {

				gl_FragColor = vec4( 1.0 ); // don't influence background
				
			} else {

				float viewZ = getViewZ( depth );

				vec3 viewPosition = getViewPosition( vUv, depth, viewZ );
				vec3 viewNormal = getViewNormal( vUv );

				vec2 noiseScale = vec2( resolution.x / 4.0, resolution.y / 4.0 );
				vec3 random = vec3( texture2D( tNoise, vUv * noiseScale ).r );

				// compute matrix used to reorient a kernel vector

				vec3 tangent = normalize( random - viewNormal * dot( random, viewNormal ) );
				vec3 bitangent = cross( viewNormal, tangent );
				mat3 kernelMatrix = mat3( tangent, bitangent, viewNormal );

				float occlusion = 0.0;

				for ( int i = 0; i < KERNEL_SIZE; i ++ ) {

					vec3 sampleVector = kernelMatrix * kernel[ i ]; // reorient sample vector in view space
					vec3 samplePoint = viewPosition + ( sampleVector * kernelRadius ); // calculate sample point

					vec4 samplePointNDC = cameraProjectionMatrix * vec4( samplePoint, 1.0 ); // project point and calculate NDC
					samplePointNDC /= samplePointNDC.w;

					vec2 samplePointUv = samplePointNDC.xy * 0.5 + 0.5; // compute uv coordinates

					float realDepth = getLinearDepth( samplePointUv ); // get linear depth from depth texture
					float sampleDepth = viewZToOrthographicDepth( samplePoint.z, cameraNear, cameraFar ); // compute linear depth of the sample view Z value
					float delta = sampleDepth - realDepth;

					if ( delta > minDistance && delta < maxDistance ) { // if fragment is before sample point, increase occlusion

						occlusion += 1.0;

					}

				}

				occlusion = clamp( occlusion / float( KERNEL_SIZE ), 0.0, 1.0 );

				gl_FragColor = vec4( vec3( 1.0 - occlusion ), 1.0 );

			}

		}`},Ze={defines:{PERSPECTIVE_CAMERA:1},uniforms:{tDepth:{value:null},cameraNear:{value:null},cameraFar:{value:null}},vertexShader:`varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`uniform sampler2D tDepth;

		uniform float cameraNear;
		uniform float cameraFar;

		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 screenPosition ) {

			#if PERSPECTIVE_CAMERA == 1

				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );

			#else

				return texture2D( tDepth, screenPosition ).x;

			#endif

		}

		void main() {

			float depth = getLinearDepth( vUv );
			gl_FragColor = vec4( vec3( 1.0 - depth ), 1.0 );

		}`},Ye={uniforms:{tDiffuse:{value:null},resolution:{value:new F}},vertexShader:`varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`uniform sampler2D tDiffuse;

		uniform vec2 resolution;

		varying vec2 vUv;

		void main() {

			vec2 texelSize = ( 1.0 / resolution );
			float result = 0.0;

			for ( int i = - 2; i <= 2; i ++ ) {

				for ( int j = - 2; j <= 2; j ++ ) {

					vec2 offset = ( vec2( float( i ), float( j ) ) ) * texelSize;
					result += texture2D( tDiffuse, vUv + offset ).r;

				}

			}

			gl_FragColor = vec4( vec3( result / ( 5.0 * 5.0 ) ), 1.0 );

		}`};class me extends ve{constructor(e,s,i,a,n=32){super(),this.width=i!==void 0?i:512,this.height=a!==void 0?a:512,this.clear=!0,this.needsSwap=!1,this.camera=s,this.scene=e,this.kernelRadius=8,this.kernel=[],this.noiseTexture=null,this.output=0,this.minDistance=.005,this.maxDistance=.1,this._visibilityCache=new Map,this.generateSampleKernel(n),this.generateRandomKernelRotations();const r=new bs;r.format=Ss,r.type=Ms,this.normalRenderTarget=new q(this.width,this.height,{minFilter:Rt,magFilter:Rt,type:K,depthTexture:r}),this.ssaoRenderTarget=new q(this.width,this.height,{type:K}),this.blurRenderTarget=this.ssaoRenderTarget.clone(),this.ssaoMaterial=new X({defines:Object.assign({},Qe.defines),uniforms:J.clone(Qe.uniforms),vertexShader:Qe.vertexShader,fragmentShader:Qe.fragmentShader,blending:re}),this.ssaoMaterial.defines.KERNEL_SIZE=n,this.ssaoMaterial.uniforms.tNormal.value=this.normalRenderTarget.texture,this.ssaoMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture,this.ssaoMaterial.uniforms.tNoise.value=this.noiseTexture,this.ssaoMaterial.uniforms.kernel.value=this.kernel,this.ssaoMaterial.uniforms.cameraNear.value=this.camera.near,this.ssaoMaterial.uniforms.cameraFar.value=this.camera.far,this.ssaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse),this.normalMaterial=new Ps,this.normalMaterial.blending=re,this.blurMaterial=new X({defines:Object.assign({},Ye.defines),uniforms:J.clone(Ye.uniforms),vertexShader:Ye.vertexShader,fragmentShader:Ye.fragmentShader}),this.blurMaterial.uniforms.tDiffuse.value=this.ssaoRenderTarget.texture,this.blurMaterial.uniforms.resolution.value.set(this.width,this.height),this.depthRenderMaterial=new X({defines:Object.assign({},Ze.defines),uniforms:J.clone(Ze.uniforms),vertexShader:Ze.vertexShader,fragmentShader:Ze.fragmentShader,blending:re}),this.depthRenderMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture,this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new X({uniforms:J.clone(Ce.uniforms),vertexShader:Ce.vertexShader,fragmentShader:Ce.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:Cs,blendDst:kt,blendEquation:Bt,blendSrcAlpha:Es,blendDstAlpha:kt,blendEquationAlpha:Bt}),this.fsQuad=new je(null),this.originalClearColor=new O}dispose(){this.normalRenderTarget.dispose(),this.ssaoRenderTarget.dispose(),this.blurRenderTarget.dispose(),this.normalMaterial.dispose(),this.blurMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this.fsQuad.dispose()}render(e,s,i){switch(this.overrideVisibility(),this.renderOverride(e,this.normalMaterial,this.normalRenderTarget,7829503,1),this.restoreVisibility(),this.ssaoMaterial.uniforms.kernelRadius.value=this.kernelRadius,this.ssaoMaterial.uniforms.minDistance.value=this.minDistance,this.ssaoMaterial.uniforms.maxDistance.value=this.maxDistance,this.renderPass(e,this.ssaoMaterial,this.ssaoRenderTarget),this.renderPass(e,this.blurMaterial,this.blurRenderTarget),this.output){case me.OUTPUT.SSAO:this.copyMaterial.uniforms.tDiffuse.value=this.ssaoRenderTarget.texture,this.copyMaterial.blending=re,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:i);break;case me.OUTPUT.Blur:this.copyMaterial.uniforms.tDiffuse.value=this.blurRenderTarget.texture,this.copyMaterial.blending=re,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:i);break;case me.OUTPUT.Depth:this.renderPass(e,this.depthRenderMaterial,this.renderToScreen?null:i);break;case me.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalRenderTarget.texture,this.copyMaterial.blending=re,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:i);break;case me.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=this.blurRenderTarget.texture,this.copyMaterial.blending=Ds,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:i);break;default:console.warn("THREE.SSAOPass: Unknown output type.")}}renderPass(e,s,i,a,n){e.getClearColor(this.originalClearColor);const r=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(i),e.autoClear=!1,a!=null&&(e.setClearColor(a),e.setClearAlpha(n||0),e.clear()),this.fsQuad.material=s,this.fsQuad.render(e),e.autoClear=o,e.setClearColor(this.originalClearColor),e.setClearAlpha(r)}renderOverride(e,s,i,a,n){e.getClearColor(this.originalClearColor);const r=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(i),e.autoClear=!1,a=s.clearColor||a,n=s.clearAlpha||n,a!=null&&(e.setClearColor(a),e.setClearAlpha(n||0),e.clear()),this.scene.overrideMaterial=s,e.render(this.scene,this.camera),this.scene.overrideMaterial=null,e.autoClear=o,e.setClearColor(this.originalClearColor),e.setClearAlpha(r)}setSize(e,s){this.width=e,this.height=s,this.ssaoRenderTarget.setSize(e,s),this.normalRenderTarget.setSize(e,s),this.blurRenderTarget.setSize(e,s),this.ssaoMaterial.uniforms.resolution.value.set(e,s),this.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse),this.blurMaterial.uniforms.resolution.value.set(e,s)}generateSampleKernel(e){const s=this.kernel;for(let i=0;i<e;i++){const a=new g;a.x=Math.random()*2-1,a.y=Math.random()*2-1,a.z=Math.random(),a.normalize();let n=i/e;n=Se.lerp(.1,1,n*n),a.multiplyScalar(n),s.push(a)}}generateRandomKernelRotations(){const i=new Ti,a=16,n=new Float32Array(a);for(let r=0;r<a;r++){const o=Math.random()*2-1,c=Math.random()*2-1,l=0;n[r]=i.noise3d(o,c,l)}this.noiseTexture=new Ts(n,4,4,As,Rs),this.noiseTexture.wrapS=nt,this.noiseTexture.wrapT=nt,this.noiseTexture.needsUpdate=!0}overrideVisibility(){const e=this.scene,s=this._visibilityCache;e.traverse(function(i){s.set(i,i.visible),(i.isPoints||i.isLine)&&(i.visible=!1)})}restoreVisibility(){const e=this.scene,s=this._visibilityCache;e.traverse(function(i){const a=s.get(i);i.visible=a}),s.clear()}}me.OUTPUT={Default:0,SSAO:1,Blur:2,Depth:3,Normal:4};const Ai={name:"FXAAShader",uniforms:{tDiffuse:{value:null},resolution:{value:new F(1/1024,1/512)}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		// FXAA algorithm from NVIDIA, C# implementation by Jasper Flick, GLSL port by Dave Hoskins
		// http://developer.download.nvidia.com/assets/gamedev/files/sdk/11/FXAA_WhitePaper.pdf
		// https://catlikecoding.com/unity/tutorials/advanced-rendering/fxaa/

		uniform sampler2D tDiffuse;
		uniform vec2 resolution;
		varying vec2 vUv;

		#define EDGE_STEP_COUNT 6
		#define EDGE_GUESS 8.0
		#define EDGE_STEPS 1.0, 1.5, 2.0, 2.0, 2.0, 4.0
		const float edgeSteps[EDGE_STEP_COUNT] = float[EDGE_STEP_COUNT]( EDGE_STEPS );

		float _ContrastThreshold = 0.0312;
		float _RelativeThreshold = 0.063;
		float _SubpixelBlending = 1.0;

		vec4 Sample( sampler2D  tex2D, vec2 uv ) {

			return texture( tex2D, uv );

		}

		float SampleLuminance( sampler2D tex2D, vec2 uv ) {

			return dot( Sample( tex2D, uv ).rgb, vec3( 0.3, 0.59, 0.11 ) );

		}

		float SampleLuminance( sampler2D tex2D, vec2 texSize, vec2 uv, float uOffset, float vOffset ) {

			uv += texSize * vec2(uOffset, vOffset);
			return SampleLuminance(tex2D, uv);

		}

		struct LuminanceData {

			float m, n, e, s, w;
			float ne, nw, se, sw;
			float highest, lowest, contrast;

		};

		LuminanceData SampleLuminanceNeighborhood( sampler2D tex2D, vec2 texSize, vec2 uv ) {

			LuminanceData l;
			l.m = SampleLuminance( tex2D, uv );
			l.n = SampleLuminance( tex2D, texSize, uv,  0.0,  1.0 );
			l.e = SampleLuminance( tex2D, texSize, uv,  1.0,  0.0 );
			l.s = SampleLuminance( tex2D, texSize, uv,  0.0, -1.0 );
			l.w = SampleLuminance( tex2D, texSize, uv, -1.0,  0.0 );

			l.ne = SampleLuminance( tex2D, texSize, uv,  1.0,  1.0 );
			l.nw = SampleLuminance( tex2D, texSize, uv, -1.0,  1.0 );
			l.se = SampleLuminance( tex2D, texSize, uv,  1.0, -1.0 );
			l.sw = SampleLuminance( tex2D, texSize, uv, -1.0, -1.0 );

			l.highest = max( max( max( max( l.n, l.e ), l.s ), l.w ), l.m );
			l.lowest = min( min( min( min( l.n, l.e ), l.s ), l.w ), l.m );
			l.contrast = l.highest - l.lowest;
			return l;

		}

		bool ShouldSkipPixel( LuminanceData l ) {

			float threshold = max( _ContrastThreshold, _RelativeThreshold * l.highest );
			return l.contrast < threshold;

		}

		float DeterminePixelBlendFactor( LuminanceData l ) {

			float f = 2.0 * ( l.n + l.e + l.s + l.w );
			f += l.ne + l.nw + l.se + l.sw;
			f *= 1.0 / 12.0;
			f = abs( f - l.m );
			f = clamp( f / l.contrast, 0.0, 1.0 );

			float blendFactor = smoothstep( 0.0, 1.0, f );
			return blendFactor * blendFactor * _SubpixelBlending;

		}

		struct EdgeData {

			bool isHorizontal;
			float pixelStep;
			float oppositeLuminance, gradient;

		};

		EdgeData DetermineEdge( vec2 texSize, LuminanceData l ) {

			EdgeData e;
			float horizontal =
				abs( l.n + l.s - 2.0 * l.m ) * 2.0 +
				abs( l.ne + l.se - 2.0 * l.e ) +
				abs( l.nw + l.sw - 2.0 * l.w );
			float vertical =
				abs( l.e + l.w - 2.0 * l.m ) * 2.0 +
				abs( l.ne + l.nw - 2.0 * l.n ) +
				abs( l.se + l.sw - 2.0 * l.s );
			e.isHorizontal = horizontal >= vertical;

			float pLuminance = e.isHorizontal ? l.n : l.e;
			float nLuminance = e.isHorizontal ? l.s : l.w;
			float pGradient = abs( pLuminance - l.m );
			float nGradient = abs( nLuminance - l.m );

			e.pixelStep = e.isHorizontal ? texSize.y : texSize.x;
			
			if (pGradient < nGradient) {

				e.pixelStep = -e.pixelStep;
				e.oppositeLuminance = nLuminance;
				e.gradient = nGradient;

			} else {

				e.oppositeLuminance = pLuminance;
				e.gradient = pGradient;

			}

			return e;

		}

		float DetermineEdgeBlendFactor( sampler2D  tex2D, vec2 texSize, LuminanceData l, EdgeData e, vec2 uv ) {

			vec2 uvEdge = uv;
			vec2 edgeStep;
			if (e.isHorizontal) {

				uvEdge.y += e.pixelStep * 0.5;
				edgeStep = vec2( texSize.x, 0.0 );

			} else {

				uvEdge.x += e.pixelStep * 0.5;
				edgeStep = vec2( 0.0, texSize.y );

			}

			float edgeLuminance = ( l.m + e.oppositeLuminance ) * 0.5;
			float gradientThreshold = e.gradient * 0.25;

			vec2 puv = uvEdge + edgeStep * edgeSteps[0];
			float pLuminanceDelta = SampleLuminance( tex2D, puv ) - edgeLuminance;
			bool pAtEnd = abs( pLuminanceDelta ) >= gradientThreshold;

			for ( int i = 1; i < EDGE_STEP_COUNT && !pAtEnd; i++ ) {

				puv += edgeStep * edgeSteps[i];
				pLuminanceDelta = SampleLuminance( tex2D, puv ) - edgeLuminance;
				pAtEnd = abs( pLuminanceDelta ) >= gradientThreshold;

			}

			if ( !pAtEnd ) {

				puv += edgeStep * EDGE_GUESS;

			}

			vec2 nuv = uvEdge - edgeStep * edgeSteps[0];
			float nLuminanceDelta = SampleLuminance( tex2D, nuv ) - edgeLuminance;
			bool nAtEnd = abs( nLuminanceDelta ) >= gradientThreshold;

			for ( int i = 1; i < EDGE_STEP_COUNT && !nAtEnd; i++ ) {

				nuv -= edgeStep * edgeSteps[i];
				nLuminanceDelta = SampleLuminance( tex2D, nuv ) - edgeLuminance;
				nAtEnd = abs( nLuminanceDelta ) >= gradientThreshold;

			}

			if ( !nAtEnd ) {

				nuv -= edgeStep * EDGE_GUESS;

			}

			float pDistance, nDistance;
			if ( e.isHorizontal ) {

				pDistance = puv.x - uv.x;
				nDistance = uv.x - nuv.x;

			} else {
				
				pDistance = puv.y - uv.y;
				nDistance = uv.y - nuv.y;

			}

			float shortestDistance;
			bool deltaSign;
			if ( pDistance <= nDistance ) {

				shortestDistance = pDistance;
				deltaSign = pLuminanceDelta >= 0.0;

			} else {

				shortestDistance = nDistance;
				deltaSign = nLuminanceDelta >= 0.0;

			}

			if ( deltaSign == ( l.m - edgeLuminance >= 0.0 ) ) {

				return 0.0;

			}

			return 0.5 - shortestDistance / ( pDistance + nDistance );

		}

		vec4 ApplyFXAA( sampler2D  tex2D, vec2 texSize, vec2 uv ) {

			LuminanceData luminance = SampleLuminanceNeighborhood( tex2D, texSize, uv );
			if ( ShouldSkipPixel( luminance ) ) {

				return Sample( tex2D, uv );

			}

			float pixelBlend = DeterminePixelBlendFactor( luminance );
			EdgeData edge = DetermineEdge( texSize, luminance );
			float edgeBlend = DetermineEdgeBlendFactor( tex2D, texSize, luminance, edge, uv );
			float finalBlend = max( pixelBlend, edgeBlend );

			if (edge.isHorizontal) {

				uv.y += edge.pixelStep * finalBlend;

			} else {

				uv.x += edge.pixelStep * finalBlend;

			}

			return Sample( tex2D, uv );

		}

		void main() {

			gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );
			
		}`},Ri={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`
	
		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`};class Bi extends ve{constructor(){super();const e=Ri;this.uniforms=J.clone(e.uniforms),this.material=new Bs({name:e.name,uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader}),this.fsQuad=new je(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,s,i){this.uniforms.tDiffuse.value=i.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},ks.getTransfer(this._outputColorSpace)===zs&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===Ns?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===Ls?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===qt?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===et?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===Is?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===Fs&&(this.material.defines.NEUTRAL_TONE_MAPPING=""),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(s),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this.fsQuad.render(e))}dispose(){this.material.dispose(),this.fsQuad.dispose()}}const ki={name:"PhotorealisticRender",_state:null,composer:null,_passes:new Map,_renderPresets:new Map,_currentPreset:"preview",init(t){this._state=t,this._initRenderPresets(),this._initComposer(),this.applyPreset("preview"),d.log("PhotorealisticRender","Pipeline initialized.")},update(t){if(this._passes.has("bloom")){const e=this._passes.get("bloom");e.userData?.animate&&(e.strength=e.userData.baseStrength*(.8+.2*Math.sin(performance.now()*.001)))}},_initComposer(){const t=this._state.data.renderer,e=this._state.data.scene,s=this._state.data.camera;if(!t||!e||!s){d.warn("PhotorealisticRender","Missing renderer/scene/camera — composer skipped");return}this.composer=new ts(t);const i=new ss(e,s);this.composer.addPass(i),this._passes.set("render",i);const a=new me(e,s,window.innerWidth,window.innerHeight);a.kernelRadius=16,a.minDistance=.005,a.maxDistance=.1,a.enabled=!1,this.composer.addPass(a),this._passes.set("ssao",a);const n=new De(new F(window.innerWidth,window.innerHeight),.5,.4,.85);n.enabled=!1,this.composer.addPass(n),this._passes.set("bloom",n);const r=new es(Ai);r.uniforms.resolution.value.set(1/window.innerWidth,1/window.innerHeight),this.composer.addPass(r),this._passes.set("fxaa",r);const o=new Bi;this.composer.addPass(o),this._passes.set("output",o),window.addEventListener("resize",()=>this._handleResize())},applyPreset(t){const e=this._renderPresets.get(t);if(!e){d.warn(`[PhotorealisticRender] Unknown preset: ${t}`);return}if(this._passes.has("ssao")){const i=this._passes.get("ssao");i.enabled=e.ssao.enabled,e.ssao.kernelRadius&&(i.kernelRadius=e.ssao.kernelRadius)}if(this._passes.has("bloom")){const i=this._passes.get("bloom");i.enabled=e.bloom.enabled,i.strength=e.bloom.strength,i.radius=e.bloom.radius,i.threshold=e.bloom.threshold}this._passes.has("fxaa")&&(this._passes.get("fxaa").enabled=e.fxaa);const s=this._state.data.renderer;s&&(s.toneMapping=e.toneMapping,s.toneMappingExposure=e.exposure,s.shadowMap.type=e.shadowType,s.setPixelRatio(e.pixelRatio)),this._currentPreset=t,this._state.emit("rendering:preset:applied",{presetName:t})},setSSAO(t,e={}){const s=this._passes.get("ssao");s&&(s.enabled=t,e.kernelRadius&&(s.kernelRadius=e.kernelRadius),e.minDistance&&(s.minDistance=e.minDistance),e.maxDistance&&(s.maxDistance=e.maxDistance),this._state.emit("rendering:ssao:toggled",{enabled:t,options:e}))},setBloom(t,e={}){const s=this._passes.get("bloom");s&&(s.enabled=t,e.strength!==void 0&&(s.strength=e.strength),e.radius!==void 0&&(s.radius=e.radius),e.threshold!==void 0&&(s.threshold=e.threshold),this._state.emit("rendering:bloom:toggled",{enabled:t,options:e}))},setToneMapping(t,e=1){const s=this._state.data.renderer;s&&(s.toneMapping=t,s.toneMappingExposure=e,this._state.emit("rendering:toneMapping:changed",{mode:t,exposure:e}))},async captureScreenshot(t={}){const e=this._state.data.renderer;if(!e)return null;const{width:s=1920,height:i=1080,format:a="image/png"}=t,n=e.domElement.width,r=e.domElement.height;e.setSize(s,i),this.composer?.setSize(s,i),this.composer?.render();const o=e.domElement.toDataURL(a);return e.setSize(n,r),this.composer?.setSize(n,r),this._state.emit("rendering:screenshot:captured",{width:s,height:i,format:a}),o},toggleRaytracing(t){this._state.emit("rendering:raytracing:toggled",{enabled:t}),d.log("PhotorealisticRender",`Raytracing ${t?"enabled":"disabled"} (experimental)`)},_initRenderPresets(){this._renderPresets.set("draft",{name:"Draft",ssao:{enabled:!1},bloom:{enabled:!1,strength:0,radius:0,threshold:0},fxaa:!1,toneMapping:et,exposure:1,shadowType:Gs,pixelRatio:1}),this._renderPresets.set("preview",{name:"Preview",ssao:{enabled:!0,kernelRadius:16},bloom:{enabled:!0,strength:.5,radius:.4,threshold:.85},fxaa:!0,toneMapping:et,exposure:1,shadowType:oe,pixelRatio:Math.min(window.devicePixelRatio,2)}),this._renderPresets.set("production",{name:"Production",ssao:{enabled:!0,kernelRadius:32},bloom:{enabled:!0,strength:.8,radius:.6,threshold:.7},fxaa:!0,toneMapping:et,exposure:1.2,shadowType:oe,pixelRatio:2}),this._renderPresets.set("cinematic",{name:"Cinematic",ssao:{enabled:!0,kernelRadius:24},bloom:{enabled:!0,strength:1.2,radius:.8,threshold:.6},fxaa:!0,toneMapping:qt,exposure:1.5,shadowType:oe,pixelRatio:2})},_handleResize(){const t=window.innerWidth,e=window.innerHeight;this.composer?.setSize(t,e);const s=this._passes.get("fxaa");s&&s.uniforms.resolution.value.set(1/t,1/e)},nodes:{"Rendering/ApplyPresetNode":(t,e)=>P(t,e,"Render Preset",["Preset"],[]),"Rendering/SSAONode":(t,e)=>P(t,e,"Screen Space AO",["Enabled","Kernel Radius"],[]),"Rendering/BloomNode":(t,e)=>P(t,e,"Bloom",["Enabled","Strength","Threshold"],[]),"Rendering/CaptureScreenshot":(t,e)=>P(t,e,"Capture Screenshot",["Width","Height"],["Screenshot"])}},we=new Kt,$=new g,pe=new g,I=new se,Ft={X:new g(1,0,0),Y:new g(0,1,0),Z:new g(0,0,1)},Pt={type:"change"},Gt={type:"mouseDown",mode:null},Ot={type:"mouseUp",mode:null},Wt={type:"objectChange"};class zi extends Os{constructor(e,s=null){super(void 0,s);const i=new Oi(this);this._root=i;const a=new Wi;this._gizmo=a,i.add(a);const n=new Ui;this._plane=n,i.add(n);const r=this;function o(w,M){let C=M;Object.defineProperty(r,w,{get:function(){return C!==void 0?C:M},set:function(D){C!==D&&(C=D,n[w]=D,a[w]=D,r.dispatchEvent({type:w+"-changed",value:D}),r.dispatchEvent(Pt))}}),r[w]=M,n[w]=M,a[w]=M}o("camera",e),o("object",void 0),o("enabled",!0),o("axis",null),o("mode","translate"),o("translationSnap",null),o("rotationSnap",null),o("scaleSnap",null),o("space","world"),o("size",1),o("dragging",!1),o("showX",!0),o("showY",!0),o("showZ",!0),o("minX",-1/0),o("maxX",1/0),o("minY",-1/0),o("maxY",1/0),o("minZ",-1/0),o("maxZ",1/0);const c=new g,l=new g,u=new se,h=new se,m=new g,f=new se,y=new g,v=new g,S=new g,x=0,_=new g;o("worldPosition",c),o("worldPositionStart",l),o("worldQuaternion",u),o("worldQuaternionStart",h),o("cameraPosition",m),o("cameraQuaternion",f),o("pointStart",y),o("pointEnd",v),o("rotationAxis",S),o("rotationAngle",x),o("eye",_),this._offset=new g,this._startNorm=new g,this._endNorm=new g,this._cameraScale=new g,this._parentPosition=new g,this._parentQuaternion=new se,this._parentQuaternionInv=new se,this._parentScale=new g,this._worldScaleStart=new g,this._worldQuaternionInv=new se,this._worldScale=new g,this._positionStart=new g,this._quaternionStart=new se,this._scaleStart=new g,this._getPointer=Ni.bind(this),this._onPointerDown=Ii.bind(this),this._onPointerHover=Li.bind(this),this._onPointerMove=Fi.bind(this),this._onPointerUp=Gi.bind(this),s!==null&&this.connect()}connect(){this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointermove",this._onPointerHover),this.domElement.addEventListener("pointerup",this._onPointerUp),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerHover),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.style.touchAction="auto"}getHelper(){return this._root}pointerHover(e){if(this.object===void 0||this.dragging===!0)return;e!==null&&we.setFromCamera(e,this.camera);const s=Et(this._gizmo.picker[this.mode],we);s?this.axis=s.object.name:this.axis=null}pointerDown(e){if(!(this.object===void 0||this.dragging===!0||e!=null&&e.button!==0)&&this.axis!==null){e!==null&&we.setFromCamera(e,this.camera);const s=Et(this._plane,we,!0);s&&(this.object.updateMatrixWorld(),this.object.parent.updateMatrixWorld(),this._positionStart.copy(this.object.position),this._quaternionStart.copy(this.object.quaternion),this._scaleStart.copy(this.object.scale),this.object.matrixWorld.decompose(this.worldPositionStart,this.worldQuaternionStart,this._worldScaleStart),this.pointStart.copy(s.point).sub(this.worldPositionStart)),this.dragging=!0,Gt.mode=this.mode,this.dispatchEvent(Gt)}}pointerMove(e){const s=this.axis,i=this.mode,a=this.object;let n=this.space;if(i==="scale"?n="local":(s==="E"||s==="XYZE"||s==="XYZ")&&(n="world"),a===void 0||s===null||this.dragging===!1||e!==null&&e.button!==-1)return;e!==null&&we.setFromCamera(e,this.camera);const r=Et(this._plane,we,!0);if(r){if(this.pointEnd.copy(r.point).sub(this.worldPositionStart),i==="translate")this._offset.copy(this.pointEnd).sub(this.pointStart),n==="local"&&s!=="XYZ"&&this._offset.applyQuaternion(this._worldQuaternionInv),s.indexOf("X")===-1&&(this._offset.x=0),s.indexOf("Y")===-1&&(this._offset.y=0),s.indexOf("Z")===-1&&(this._offset.z=0),n==="local"&&s!=="XYZ"?this._offset.applyQuaternion(this._quaternionStart).divide(this._parentScale):this._offset.applyQuaternion(this._parentQuaternionInv).divide(this._parentScale),a.position.copy(this._offset).add(this._positionStart),this.translationSnap&&(n==="local"&&(a.position.applyQuaternion(I.copy(this._quaternionStart).invert()),s.search("X")!==-1&&(a.position.x=Math.round(a.position.x/this.translationSnap)*this.translationSnap),s.search("Y")!==-1&&(a.position.y=Math.round(a.position.y/this.translationSnap)*this.translationSnap),s.search("Z")!==-1&&(a.position.z=Math.round(a.position.z/this.translationSnap)*this.translationSnap),a.position.applyQuaternion(this._quaternionStart)),n==="world"&&(a.parent&&a.position.add($.setFromMatrixPosition(a.parent.matrixWorld)),s.search("X")!==-1&&(a.position.x=Math.round(a.position.x/this.translationSnap)*this.translationSnap),s.search("Y")!==-1&&(a.position.y=Math.round(a.position.y/this.translationSnap)*this.translationSnap),s.search("Z")!==-1&&(a.position.z=Math.round(a.position.z/this.translationSnap)*this.translationSnap),a.parent&&a.position.sub($.setFromMatrixPosition(a.parent.matrixWorld)))),a.position.x=Math.max(this.minX,Math.min(this.maxX,a.position.x)),a.position.y=Math.max(this.minY,Math.min(this.maxY,a.position.y)),a.position.z=Math.max(this.minZ,Math.min(this.maxZ,a.position.z));else if(i==="scale"){if(s.search("XYZ")!==-1){let o=this.pointEnd.length()/this.pointStart.length();this.pointEnd.dot(this.pointStart)<0&&(o*=-1),pe.set(o,o,o)}else $.copy(this.pointStart),pe.copy(this.pointEnd),$.applyQuaternion(this._worldQuaternionInv),pe.applyQuaternion(this._worldQuaternionInv),pe.divide($),s.search("X")===-1&&(pe.x=1),s.search("Y")===-1&&(pe.y=1),s.search("Z")===-1&&(pe.z=1);a.scale.copy(this._scaleStart).multiply(pe),this.scaleSnap&&(s.search("X")!==-1&&(a.scale.x=Math.round(a.scale.x/this.scaleSnap)*this.scaleSnap||this.scaleSnap),s.search("Y")!==-1&&(a.scale.y=Math.round(a.scale.y/this.scaleSnap)*this.scaleSnap||this.scaleSnap),s.search("Z")!==-1&&(a.scale.z=Math.round(a.scale.z/this.scaleSnap)*this.scaleSnap||this.scaleSnap))}else if(i==="rotate"){this._offset.copy(this.pointEnd).sub(this.pointStart);const o=20/this.worldPosition.distanceTo($.setFromMatrixPosition(this.camera.matrixWorld));let c=!1;s==="XYZE"?(this.rotationAxis.copy(this._offset).cross(this.eye).normalize(),this.rotationAngle=this._offset.dot($.copy(this.rotationAxis).cross(this.eye))*o):(s==="X"||s==="Y"||s==="Z")&&(this.rotationAxis.copy(Ft[s]),$.copy(Ft[s]),n==="local"&&$.applyQuaternion(this.worldQuaternion),$.cross(this.eye),$.length()===0?c=!0:this.rotationAngle=this._offset.dot($.normalize())*o),(s==="E"||c)&&(this.rotationAxis.copy(this.eye),this.rotationAngle=this.pointEnd.angleTo(this.pointStart),this._startNorm.copy(this.pointStart).normalize(),this._endNorm.copy(this.pointEnd).normalize(),this.rotationAngle*=this._endNorm.cross(this._startNorm).dot(this.eye)<0?1:-1),this.rotationSnap&&(this.rotationAngle=Math.round(this.rotationAngle/this.rotationSnap)*this.rotationSnap),n==="local"&&s!=="E"&&s!=="XYZE"?(a.quaternion.copy(this._quaternionStart),a.quaternion.multiply(I.setFromAxisAngle(this.rotationAxis,this.rotationAngle)).normalize()):(this.rotationAxis.applyQuaternion(this._parentQuaternionInv),a.quaternion.copy(I.setFromAxisAngle(this.rotationAxis,this.rotationAngle)),a.quaternion.multiply(this._quaternionStart).normalize())}this.dispatchEvent(Pt),this.dispatchEvent(Wt)}}pointerUp(e){e!==null&&e.button!==0||(this.dragging&&this.axis!==null&&(Ot.mode=this.mode,this.dispatchEvent(Ot)),this.dragging=!1,this.axis=null)}dispose(){this.disconnect(),this._root.dispose()}attach(e){return this.object=e,this._root.visible=!0,this}detach(){return this.object=void 0,this.axis=null,this._root.visible=!1,this}reset(){this.enabled&&this.dragging&&(this.object.position.copy(this._positionStart),this.object.quaternion.copy(this._quaternionStart),this.object.scale.copy(this._scaleStart),this.dispatchEvent(Pt),this.dispatchEvent(Wt),this.pointStart.copy(this.pointEnd))}getRaycaster(){return we}getMode(){return this.mode}setMode(e){this.mode=e}setTranslationSnap(e){this.translationSnap=e}setRotationSnap(e){this.rotationSnap=e}setScaleSnap(e){this.scaleSnap=e}setSize(e){this.size=e}setSpace(e){this.space=e}}function Ni(t){if(this.domElement.ownerDocument.pointerLockElement)return{x:0,y:0,button:t.button};{const e=this.domElement.getBoundingClientRect();return{x:(t.clientX-e.left)/e.width*2-1,y:-(t.clientY-e.top)/e.height*2+1,button:t.button}}}function Li(t){if(this.enabled)switch(t.pointerType){case"mouse":case"pen":this.pointerHover(this._getPointer(t));break}}function Ii(t){this.enabled&&(document.pointerLockElement||this.domElement.setPointerCapture(t.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.pointerHover(this._getPointer(t)),this.pointerDown(this._getPointer(t)))}function Fi(t){this.enabled&&this.pointerMove(this._getPointer(t))}function Gi(t){this.enabled&&(this.domElement.releasePointerCapture(t.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.pointerUp(this._getPointer(t)))}function Et(t,e,s){const i=e.intersectObject(t,!0);for(let a=0;a<i.length;a++)if(i[a].object.visible||s)return i[a];return!1}const qe=new Us,z=new g(0,1,0),Ut=new g(0,0,0),jt=new ge,Ke=new se,st=new se,te=new g,Ht=new ge,Oe=new g(1,0,0),xe=new g(0,1,0),We=new g(0,0,1),Je=new g,Fe=new g,Ge=new g;class Oi extends Ct{constructor(e){super(),this.isTransformControlsRoot=!0,this.controls=e,this.visible=!1}updateMatrixWorld(e){const s=this.controls;s.object!==void 0&&(s.object.updateMatrixWorld(),s.object.parent===null?console.error("TransformControls: The attached 3D object must be a part of the scene graph."):s.object.parent.matrixWorld.decompose(s._parentPosition,s._parentQuaternion,s._parentScale),s.object.matrixWorld.decompose(s.worldPosition,s.worldQuaternion,s._worldScale),s._parentQuaternionInv.copy(s._parentQuaternion).invert(),s._worldQuaternionInv.copy(s.worldQuaternion).invert()),s.camera.updateMatrixWorld(),s.camera.matrixWorld.decompose(s.cameraPosition,s.cameraQuaternion,s._cameraScale),s.camera.isOrthographicCamera?s.camera.getWorldDirection(s.eye).negate():s.eye.copy(s.cameraPosition).sub(s.worldPosition).normalize(),super.updateMatrixWorld(e)}dispose(){this.traverse(function(e){e.geometry&&e.geometry.dispose(),e.material&&e.material.dispose()})}}class Wi extends Ct{constructor(){super(),this.isTransformControlsGizmo=!0,this.type="TransformControlsGizmo";const e=new Ue({depthTest:!1,depthWrite:!1,fog:!1,toneMapped:!1,transparent:!0}),s=new Ws({depthTest:!1,depthWrite:!1,fog:!1,toneMapped:!1,transparent:!0}),i=e.clone();i.opacity=.15;const a=s.clone();a.opacity=.5;const n=e.clone();n.color.setHex(16711680);const r=e.clone();r.color.setHex(65280);const o=e.clone();o.color.setHex(255);const c=e.clone();c.color.setHex(16711680),c.opacity=.5;const l=e.clone();l.color.setHex(65280),l.opacity=.5;const u=e.clone();u.color.setHex(255),u.opacity=.5;const h=e.clone();h.opacity=.25;const m=e.clone();m.color.setHex(16776960),m.opacity=.25,e.clone().color.setHex(16776960);const y=e.clone();y.color.setHex(7895160);const v=new V(0,.04,.1,12);v.translate(0,.05,0);const S=new G(.08,.08,.08);S.translate(0,.04,0);const x=new _e;x.setAttribute("position",new ee([0,0,0,1,0,0],3));const _=new V(.0075,.0075,.5,3);_.translate(0,.25,0);function w(T,L){const U=new be(T,.0075,3,64,L*Math.PI*2);return U.rotateY(Math.PI/2),U.rotateX(Math.PI/2),U}function M(){const T=new _e;return T.setAttribute("position",new ee([0,0,0,1,1,1],3)),T}const C={X:[[new p(v,n),[.5,0,0],[0,0,-Math.PI/2]],[new p(v,n),[-.5,0,0],[0,0,Math.PI/2]],[new p(_,n),[0,0,0],[0,0,-Math.PI/2]]],Y:[[new p(v,r),[0,.5,0]],[new p(v,r),[0,-.5,0],[Math.PI,0,0]],[new p(_,r)]],Z:[[new p(v,o),[0,0,.5],[Math.PI/2,0,0]],[new p(v,o),[0,0,-.5],[-Math.PI/2,0,0]],[new p(_,o),null,[Math.PI/2,0,0]]],XYZ:[[new p(new $e(.1,0),h.clone()),[0,0,0]]],XY:[[new p(new G(.15,.15,.01),u.clone()),[.15,.15,0]]],YZ:[[new p(new G(.15,.15,.01),c.clone()),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new p(new G(.15,.15,.01),l.clone()),[.15,0,.15],[-Math.PI/2,0,0]]]},D={X:[[new p(new V(.2,0,.6,4),i),[.3,0,0],[0,0,-Math.PI/2]],[new p(new V(.2,0,.6,4),i),[-.3,0,0],[0,0,Math.PI/2]]],Y:[[new p(new V(.2,0,.6,4),i),[0,.3,0]],[new p(new V(.2,0,.6,4),i),[0,-.3,0],[0,0,Math.PI]]],Z:[[new p(new V(.2,0,.6,4),i),[0,0,.3],[Math.PI/2,0,0]],[new p(new V(.2,0,.6,4),i),[0,0,-.3],[-Math.PI/2,0,0]]],XYZ:[[new p(new $e(.2,0),i)]],XY:[[new p(new G(.2,.2,.01),i),[.15,.15,0]]],YZ:[[new p(new G(.2,.2,.01),i),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new p(new G(.2,.2,.01),i),[.15,0,.15],[-Math.PI/2,0,0]]]},R={START:[[new p(new $e(.01,2),a),null,null,null,"helper"]],END:[[new p(new $e(.01,2),a),null,null,null,"helper"]],DELTA:[[new de(M(),a),null,null,null,"helper"]],X:[[new de(x,a.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]],Y:[[new de(x,a.clone()),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],"helper"]],Z:[[new de(x,a.clone()),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],"helper"]]},N={XYZE:[[new p(w(.5,1),y),null,[0,Math.PI/2,0]]],X:[[new p(w(.5,.5),n)]],Y:[[new p(w(.5,.5),r),null,[0,0,-Math.PI/2]]],Z:[[new p(w(.5,.5),o),null,[0,Math.PI/2,0]]],E:[[new p(w(.75,1),m),null,[0,Math.PI/2,0]]]},B={AXIS:[[new de(x,a.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]]},A={XYZE:[[new p(new tt(.25,10,8),i)]],X:[[new p(new be(.5,.1,4,24),i),[0,0,0],[0,-Math.PI/2,-Math.PI/2]]],Y:[[new p(new be(.5,.1,4,24),i),[0,0,0],[Math.PI/2,0,0]]],Z:[[new p(new be(.5,.1,4,24),i),[0,0,0],[0,0,-Math.PI/2]]],E:[[new p(new be(.75,.1,2,24),i)]]},k={X:[[new p(S,n),[.5,0,0],[0,0,-Math.PI/2]],[new p(_,n),[0,0,0],[0,0,-Math.PI/2]],[new p(S,n),[-.5,0,0],[0,0,Math.PI/2]]],Y:[[new p(S,r),[0,.5,0]],[new p(_,r)],[new p(S,r),[0,-.5,0],[0,0,Math.PI]]],Z:[[new p(S,o),[0,0,.5],[Math.PI/2,0,0]],[new p(_,o),[0,0,0],[Math.PI/2,0,0]],[new p(S,o),[0,0,-.5],[-Math.PI/2,0,0]]],XY:[[new p(new G(.15,.15,.01),u),[.15,.15,0]]],YZ:[[new p(new G(.15,.15,.01),c),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new p(new G(.15,.15,.01),l),[.15,0,.15],[-Math.PI/2,0,0]]],XYZ:[[new p(new G(.1,.1,.1),h.clone())]]},E={X:[[new p(new V(.2,0,.6,4),i),[.3,0,0],[0,0,-Math.PI/2]],[new p(new V(.2,0,.6,4),i),[-.3,0,0],[0,0,Math.PI/2]]],Y:[[new p(new V(.2,0,.6,4),i),[0,.3,0]],[new p(new V(.2,0,.6,4),i),[0,-.3,0],[0,0,Math.PI]]],Z:[[new p(new V(.2,0,.6,4),i),[0,0,.3],[Math.PI/2,0,0]],[new p(new V(.2,0,.6,4),i),[0,0,-.3],[-Math.PI/2,0,0]]],XY:[[new p(new G(.2,.2,.01),i),[.15,.15,0]]],YZ:[[new p(new G(.2,.2,.01),i),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new p(new G(.2,.2,.01),i),[.15,0,.15],[-Math.PI/2,0,0]]],XYZ:[[new p(new G(.2,.2,.2),i),[0,0,0]]]},H={X:[[new de(x,a.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]],Y:[[new de(x,a.clone()),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],"helper"]],Z:[[new de(x,a.clone()),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],"helper"]]};function W(T){const L=new Ct;for(const U in T)for(let j=T[U].length;j--;){const b=T[U][j][0].clone(),Q=T[U][j][1],Z=T[U][j][2],Y=T[U][j][3],ae=T[U][j][4];b.name=U,b.tag=ae,Q&&b.position.set(Q[0],Q[1],Q[2]),Z&&b.rotation.set(Z[0],Z[1],Z[2]),Y&&b.scale.set(Y[0],Y[1],Y[2]),b.updateMatrix();const ye=b.geometry.clone();ye.applyMatrix4(b.matrix),b.geometry=ye,b.renderOrder=1/0,b.position.set(0,0,0),b.rotation.set(0,0,0),b.scale.set(1,1,1),L.add(b)}return L}this.gizmo={},this.picker={},this.helper={},this.add(this.gizmo.translate=W(C)),this.add(this.gizmo.rotate=W(N)),this.add(this.gizmo.scale=W(k)),this.add(this.picker.translate=W(D)),this.add(this.picker.rotate=W(A)),this.add(this.picker.scale=W(E)),this.add(this.helper.translate=W(R)),this.add(this.helper.rotate=W(B)),this.add(this.helper.scale=W(H)),this.picker.translate.visible=!1,this.picker.rotate.visible=!1,this.picker.scale.visible=!1}updateMatrixWorld(e){const i=(this.mode==="scale"?"local":this.space)==="local"?this.worldQuaternion:st;this.gizmo.translate.visible=this.mode==="translate",this.gizmo.rotate.visible=this.mode==="rotate",this.gizmo.scale.visible=this.mode==="scale",this.helper.translate.visible=this.mode==="translate",this.helper.rotate.visible=this.mode==="rotate",this.helper.scale.visible=this.mode==="scale";let a=[];a=a.concat(this.picker[this.mode].children),a=a.concat(this.gizmo[this.mode].children),a=a.concat(this.helper[this.mode].children);for(let n=0;n<a.length;n++){const r=a[n];r.visible=!0,r.rotation.set(0,0,0),r.position.copy(this.worldPosition);let o;if(this.camera.isOrthographicCamera?o=(this.camera.top-this.camera.bottom)/this.camera.zoom:o=this.worldPosition.distanceTo(this.cameraPosition)*Math.min(1.9*Math.tan(Math.PI*this.camera.fov/360)/this.camera.zoom,7),r.scale.set(1,1,1).multiplyScalar(o*this.size/4),r.tag==="helper"){r.visible=!1,r.name==="AXIS"?(r.visible=!!this.axis,this.axis==="X"&&(I.setFromEuler(qe.set(0,0,0)),r.quaternion.copy(i).multiply(I),Math.abs(z.copy(Oe).applyQuaternion(i).dot(this.eye))>.9&&(r.visible=!1)),this.axis==="Y"&&(I.setFromEuler(qe.set(0,0,Math.PI/2)),r.quaternion.copy(i).multiply(I),Math.abs(z.copy(xe).applyQuaternion(i).dot(this.eye))>.9&&(r.visible=!1)),this.axis==="Z"&&(I.setFromEuler(qe.set(0,Math.PI/2,0)),r.quaternion.copy(i).multiply(I),Math.abs(z.copy(We).applyQuaternion(i).dot(this.eye))>.9&&(r.visible=!1)),this.axis==="XYZE"&&(I.setFromEuler(qe.set(0,Math.PI/2,0)),z.copy(this.rotationAxis),r.quaternion.setFromRotationMatrix(jt.lookAt(Ut,z,xe)),r.quaternion.multiply(I),r.visible=this.dragging),this.axis==="E"&&(r.visible=!1)):r.name==="START"?(r.position.copy(this.worldPositionStart),r.visible=this.dragging):r.name==="END"?(r.position.copy(this.worldPosition),r.visible=this.dragging):r.name==="DELTA"?(r.position.copy(this.worldPositionStart),r.quaternion.copy(this.worldQuaternionStart),$.set(1e-10,1e-10,1e-10).add(this.worldPositionStart).sub(this.worldPosition).multiplyScalar(-1),$.applyQuaternion(this.worldQuaternionStart.clone().invert()),r.scale.copy($),r.visible=this.dragging):(r.quaternion.copy(i),this.dragging?r.position.copy(this.worldPositionStart):r.position.copy(this.worldPosition),this.axis&&(r.visible=this.axis.search(r.name)!==-1));continue}r.quaternion.copy(i),this.mode==="translate"||this.mode==="scale"?(r.name==="X"&&Math.abs(z.copy(Oe).applyQuaternion(i).dot(this.eye))>.99&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1),r.name==="Y"&&Math.abs(z.copy(xe).applyQuaternion(i).dot(this.eye))>.99&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1),r.name==="Z"&&Math.abs(z.copy(We).applyQuaternion(i).dot(this.eye))>.99&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1),r.name==="XY"&&Math.abs(z.copy(We).applyQuaternion(i).dot(this.eye))<.2&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1),r.name==="YZ"&&Math.abs(z.copy(Oe).applyQuaternion(i).dot(this.eye))<.2&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1),r.name==="XZ"&&Math.abs(z.copy(xe).applyQuaternion(i).dot(this.eye))<.2&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1)):this.mode==="rotate"&&(Ke.copy(i),z.copy(this.eye).applyQuaternion(I.copy(i).invert()),r.name.search("E")!==-1&&r.quaternion.setFromRotationMatrix(jt.lookAt(this.eye,Ut,xe)),r.name==="X"&&(I.setFromAxisAngle(Oe,Math.atan2(-z.y,z.z)),I.multiplyQuaternions(Ke,I),r.quaternion.copy(I)),r.name==="Y"&&(I.setFromAxisAngle(xe,Math.atan2(z.x,z.z)),I.multiplyQuaternions(Ke,I),r.quaternion.copy(I)),r.name==="Z"&&(I.setFromAxisAngle(We,Math.atan2(z.y,z.x)),I.multiplyQuaternions(Ke,I),r.quaternion.copy(I))),r.visible=r.visible&&(r.name.indexOf("X")===-1||this.showX),r.visible=r.visible&&(r.name.indexOf("Y")===-1||this.showY),r.visible=r.visible&&(r.name.indexOf("Z")===-1||this.showZ),r.visible=r.visible&&(r.name.indexOf("E")===-1||this.showX&&this.showY&&this.showZ),r.material._color=r.material._color||r.material.color.clone(),r.material._opacity=r.material._opacity||r.material.opacity,r.material.color.copy(r.material._color),r.material.opacity=r.material._opacity,this.enabled&&this.axis&&(r.name===this.axis||this.axis.split("").some(function(c){return r.name===c}))&&(r.material.color.setHex(16776960),r.material.opacity=1)}super.updateMatrixWorld(e)}}class Ui extends p{constructor(){super(new Me(1e5,1e5,2,2),new Ue({visible:!1,wireframe:!0,side:it,transparent:!0,opacity:.1,toneMapped:!1})),this.isTransformControlsPlane=!0,this.type="TransformControlsPlane"}updateMatrixWorld(e){let s=this.space;switch(this.position.copy(this.worldPosition),this.mode==="scale"&&(s="local"),Je.copy(Oe).applyQuaternion(s==="local"?this.worldQuaternion:st),Fe.copy(xe).applyQuaternion(s==="local"?this.worldQuaternion:st),Ge.copy(We).applyQuaternion(s==="local"?this.worldQuaternion:st),z.copy(Fe),this.mode){case"translate":case"scale":switch(this.axis){case"X":z.copy(this.eye).cross(Je),te.copy(Je).cross(z);break;case"Y":z.copy(this.eye).cross(Fe),te.copy(Fe).cross(z);break;case"Z":z.copy(this.eye).cross(Ge),te.copy(Ge).cross(z);break;case"XY":te.copy(Ge);break;case"YZ":te.copy(Je);break;case"XZ":z.copy(Ge),te.copy(Fe);break;case"XYZ":case"E":te.set(0,0,0);break}break;case"rotate":default:te.set(0,0,0)}te.length()===0?this.quaternion.copy(this.cameraQuaternion):(Ht.lookAt($.set(0,0,0),te,z),this.quaternion.setFromRotationMatrix(Ht)),super.updateMatrixWorld(e)}}const ji={name:"TransformGizmo",_state:null,_controls:null,_orbitControls:null,_camera:null,_renderer:null,_scene:null,_mode:"translate",_space:"world",_dragging:!1,_initialTransform:null,init(t){this._state=t,this._onSelectionChangedBound=e=>this._onSelectionChanged(e),this._state.on("selection:changed",this._onSelectionChangedBound)},setup(t,e,s,i){this._camera=t,this._orbitControls=s,this._scene=i,this._controls=new zi(t,e.domElement),this._controls.setMode(this._mode),this._controls.setSpace(this._space),this._controls.addEventListener("dragging-changed",n=>this._onDraggingChanged(n)),this._controls.addEventListener("change",()=>this._onChange()),this._controls.addEventListener("mouseDown",()=>this._onTransformStart()),this._controls.addEventListener("mouseUp",()=>this._onTransformEnd()),i.add(this._controls);const a=this._state.data.selectedObjects||[];this._attachToSelection(a)},setMode(t){["translate","rotate","scale"].includes(t)&&(this._mode=t,this._controls?.setMode(t),this._state.emit("gizmo:mode:changed",{mode:t}))},getMode(){return this._mode},setSpace(t){["world","local"].includes(t)&&(this._space=t,this._controls?.setSpace(t),this._state.emit("gizmo:space:changed",{space:t}))},getSpace(){return this._space},toggleSpace(){this.setSpace(this._space==="world"?"local":"world")},_onSelectionChanged(t){this._attachToSelection(t)},_attachToSelection(t){if(!this._controls)return;const e=t?.length===1?t[0]:null;e&&(e.isMesh||e.isGroup)?(this._controls.attach(e),this._controls.visible=!0,this._controls.enabled=!0):(this._controls.detach(),this._controls.visible=!1,this._controls.enabled=!1)},_onDraggingChanged(t){this._orbitControls&&(this._orbitControls.enabled=!t.value),this._dragging=t.value},_onTransformStart(){const t=this._controls?.object;t&&(this._initialTransform={object:t,position:t.position.clone(),rotation:t.rotation.clone(),scale:t.scale.clone()},this._state.emit("gizmo:transform:start",{object:t,mode:this._mode}))},_onChange(){if(!this._dragging)return;const t=this._controls?.object;t&&this._state.emit("gizmo:transform:change",{object:t,mode:this._mode})},_onTransformEnd(){const t=this._controls?.object;if(!t||!this._initialTransform)return;const e=this._initialTransform,s=!e.position.equals(t.position)||!e.rotation.equals(t.rotation)||!e.scale.equals(t.scale);this._state.emit("gizmo:transform:end",{object:t,mode:this._mode,start:e,current:{position:t.position.clone(),rotation:t.rotation.clone(),scale:t.scale.clone()},changed:s}),this._initialTransform=null},handleKey(t,e){if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")return!1;switch(t.toLowerCase()){case"g":return this.setMode("translate"),!0;case"r":return this.setMode("rotate"),!0;case"s":return this.setMode("scale"),!0;case" ":return this.toggleSpace(),!0;default:return!1}},update(t){},dispose(){this._controls&&(this._controls.detach(),this._controls.dispose(),this._controls=null),this._state&&this._onSelectionChangedBound&&(this._state.off("selection:changed",this._onSelectionChangedBound),this._onSelectionChangedBound=null)},nodes:{"Transform/SetModeNode":(t,e)=>P(t,e,"Set Gizmo Mode",["Mode"],[]),"Transform/SetSpaceNode":(t,e)=>P(t,e,"Set Gizmo Space",["Space"],[])}},Hi={name:"Rust",_state:null,_wasmModule:null,_isInitialized:!1,_taskQueue:[],async init(t){this._state=t,await this._initWasm(),t.on("rust:task:queued",e=>{this._processQueue()})},async _initWasm(){try{this._wasmModule=js,this._isInitialized=!0,d.log("Rust","Wasm bridge initialized")}catch(t){d.error("Rust","Failed to initialize Wasm bridge:",t)}},async booleanCSG(t,e,s){if(!this._isInitialized)return d.warn("Rust","Wasm not initialized"),null;const i=await this._wasmModule.computeBoolean(t,e,s);if(!i||!i.positions)return d.warn("Rust","CSG operation returned no result"),null;const a=new _e;return a.setAttribute("position",new ee(i.positions,3)),i.indices&&a.setIndex(new Dt(i.indices,1)),a.computeVertexNormals(),a},async decimateMesh(t,e){if(!this._isInitialized)return null;const s=await this._wasmModule.decimateMesh(t,e);if(!s||!s.positions)return d.warn("Rust","Decimation returned no result"),null;const i=new _e;return i.setAttribute("position",new ee(s.positions,3)),s.indices&&i.setIndex(new Dt(s.indices,1)),i.computeVertexNormals(),i},async generateBVH(t){if(!this._isInitialized)return null;const e=await this._wasmModule.generateBVH(t);return t.userData.bvh=e,e},async applyPhysicsForces(t,e){if(!this._isInitialized)return;const s=t.map(a=>({position:[a.position.x,a.position.y,a.position.z],velocity:[a.velocity.x,a.velocity.y,a.velocity.z],mass:a.mass}));(await this._wasmModule.stepPhysics(s,e)).forEach((a,n)=>{t[n].position.set(a.position[0],a.position[1],a.position[2]),t[n].velocity.set(a.velocity[0],a.velocity[1],a.velocity[2])})},update(t){this._processQueue()},_processQueue(){if(this._taskQueue.length===0)return;const t=this._taskQueue.shift();t.execute().then(e=>{t.callback&&t.callback(e)})},nodes:{"Rust/BooleanCSGNode":(t,e)=>{const s=document.createElement("div");return s.className="node-card",s.style.left=`${t}px`,s.style.top=`${e}px`,s.innerHTML=`
        <div class="node-header">🧊 Boolean CSG (Rust)</div>
        <div class="node-body">
          <p style="font-size:10px;color:#888;margin:4px 0;">Uses first 2 selected meshes</p>
          <label>Operation:</label>
          <select class="node-input" data-prop="operation">
            <option value="union">Union</option>
            <option value="subtract">Subtract</option>
            <option value="intersect">Intersect</option>
          </select>
        </div>
        <button class="run-node-btn" data-action="run">Run CSG</button>
        <div class="node-outputs">
          <span data-type="Mesh">Result Mesh</span>
        </div>
      `,s},"Rust/DecimateNode":(t,e)=>{const s=document.createElement("div");return s.className="node-card",s.style.left=`${t}px`,s.style.top=`${e}px`,s.innerHTML=`
        <div class="node-header">📉 Decimate Mesh (Rust)</div>
        <div class="node-body">
          <p style="font-size:10px;color:#888;margin:4px 0;">Uses first selected mesh</p>
          <label>Target %:</label>
          <input type="range" class="node-input" data-prop="percent" min="10" max="100" value="50" />
          <span class="percent-value" style="font-size:10px;color:#aaa;">50%</span>
        </div>
        <button class="run-node-btn" data-action="run">Run Decimate</button>
        <div class="node-outputs">
          <span data-type="Mesh">Decimated Mesh</span>
        </div>
      `,s},"Rust/PhysicsStepNode":(t,e)=>{const s=document.createElement("div");return s.className="node-card",s.style.left=`${t}px`,s.style.top=`${e}px`,s.innerHTML=`
        <div class="node-header">⚡ Physics Step (Rust)</div>
        <div class="node-body">
          <label>Gravity:</label>
          <input type="number" class="node-input" data-prop="gravity" value="-9.81" step="0.1" />
        </div>
        <div class="node-outputs">
          <span data-type="Array">Updated Bodies</span>
        </div>
      `,s}}},Vi={name:"Go",_state:null,_wasmModule:null,_isInitialized:!1,_workerPool:[],_maxWorkers:4,async init(t){this._state=t,await this._initWasm(),this._initWorkerPool()},async _initWasm(){try{this._wasmModule=$s,this._isInitialized=!0,d.log("Go","Wasm bridge initialized")}catch(t){d.error("Go","Failed to initialize Wasm bridge:",t)}},_initWorkerPool(){for(let t=0;t<this._maxWorkers;t++)this._workerPool.push({id:t,busy:!1,task:null})},async parsePointCloud(t){if(!this._isInitialized)return null;const e=this._getAvailableWorker();if(!e)return d.warn("Go","No workers available, queuing task"),new Promise(s=>{setTimeout(()=>{this.parsePointCloud(t).then(s)},100)});e.busy=!0;try{const s=await this._wasmModule.parsePointCloud(t);if(!s||!s.positions)return d.warn("Go","Point cloud parsing returned no result"),null;const i=new _e;i.setAttribute("position",new ee(s.positions,3)),s.colors&&i.setAttribute("color",new ee(s.colors,3));const a=new Hs({size:.1,vertexColors:!!s.colors}),n=new Vs(i,a);return n.name="PointCloud_"+Date.now(),n.userData.isManagedObject=!0,n}finally{e.busy=!1}},async importCAD(t){if(!this._isInitialized)return null;const e=this._getAvailableWorker();if(!e)return null;e.busy=!0;try{const s=await this._wasmModule.importCAD(t);if(!s||!s.meshes)return d.warn("Go","CAD import returned no result"),null;const i=new rt;return i.name="CAD_Model_"+Date.now(),i.userData.isManagedObject=!0,s.meshes.forEach((a,n)=>{const r=new _e;r.setAttribute("position",new ee(a.positions,3)),r.setIndex(new Dt(a.indices,1)),r.computeVertexNormals();const o=new ie({color:13421772,metalness:.5,roughness:.5}),c=new p(r,o);c.name=`CAD_Part_${n}`,c.userData.isManagedObject=!0,i.add(c)}),i}finally{e.busy=!1}},async streamFileChunks(t,e,s){if(!this._isInitialized)return;const i=Math.ceil(t.byteLength/e),a=[];for(let n=0;n<i;n++){const r=n*e,o=Math.min(r+e,t.byteLength),c=t.slice(r,o);a.push(this._processChunk(c,n,s))}await Promise.all(a)},async _processChunk(t,e,s){const i=this._getAvailableWorker();if(i){i.busy=!0;try{return await s(t,e)}finally{i.busy=!1}}},_getAvailableWorker(){return this._workerPool.find(t=>!t.busy)},update(t){const e=this._workerPool.filter(s=>s.busy).length;this._state.emit("go:worker:status",{total:this._maxWorkers,busy:e,available:this._maxWorkers-e})},nodes:{"Go/ParsePointCloudNode":(t,e)=>{const s=document.createElement("div");return s.className="node-card",s.style.left=`${t}px`,s.style.top=`${e}px`,s.innerHTML=`
        <div class="node-header">☁️ Parse Point Cloud (Go)</div>
        <div class="node-body">
          <input type="file" class="node-input" data-prop="file" accept=".las,.ply" />
          <label>Point Size:</label>
          <input type="number" class="node-input" data-prop="size" value="0.1" step="0.01" />
        </div>
        <button class="run-node-btn" data-action="run">Parse Point Cloud</button>
        <div class="node-outputs">
          <span data-type="Points">Point Cloud</span>
        </div>
      `,s},"Go/ImportCADNode":(t,e)=>{const s=document.createElement("div");return s.className="node-card",s.style.left=`${t}px`,s.style.top=`${e}px`,s.innerHTML=`
        <div class="node-header">📐 Import CAD (Go)</div>
        <div class="node-body">
          <input type="file" class="node-input" data-prop="file" accept=".step,.iges" />
          <label>Tolerance:</label>
          <input type="number" class="node-input" data-prop="tolerance" value="0.001" step="0.0001" />
        </div>
        <button class="run-node-btn" data-action="run">Import CAD</button>
        <div class="node-outputs">
          <span data-type="Group">CAD Model</span>
        </div>
      `,s},"Go/WorkerStatusNode":(t,e)=>{const s=document.createElement("div");return s.className="node-card",s.style.left=`${t}px`,s.style.top=`${e}px`,s.innerHTML=`
        <div class="node-header">📊 Worker Pool Status</div>
        <div class="node-body" style="font-size:10px;">
          <div id="go-worker-status">Workers: 0/4 busy</div>
        </div>
        <div class="node-outputs">
          <span data-type="Boolean">Pool Available</span>
        </div>
      `,s}}},$i={name:"Lua",_state:null,_wasmModule:null,_isInitialized:!1,_scriptStates:new Map,_globalContext:{},async init(t){this._state=t,await this._initWasm(),this._setupGlobalContext()},async _initWasm(){try{this._isInitialized=!0,d.log("Lua","Fengari Wasm initialized")}catch(t){d.error("Lua","Failed to initialize Fengari:",t)}},_setupGlobalContext(){this._globalContext={THREE:{Vector3:g,Math:Se},console:{log:(...t)=>d.log("Lua",...t)}}},executeScript(t,e,s){if(!this._isInitialized||!t||!e)return;let i=this._scriptStates.get(t.uuid);i||(i=this._createLuaState(),this._scriptStates.set(t.uuid,i)),this._pushContext(i,t,s);try{if(this._wasmModule.luaL_dostring(i,e)!==0){const n=this._wasmModule.lua_tostring(i,-1);d.error("Lua","Script error:",n),this._wasmModule.lua_pop(i,1)}else this._readContext(i,t)}catch(a){d.error("Lua","Execution failed:",a)}},_createLuaState(){const t=this._wasmModule.luaL_newstate();return this._wasmModule.luaL_openlibs(t),t},_pushContext(t,e,s){this._wasmModule.lua_newtable(t),this._wasmModule.lua_pushstring(t,"self"),this._wasmModule.lua_newtable(t),this._pushVec3(t,"position",e.position),this._pushVec3(t,"rotation",e.rotation),this._pushVec3(t,"scale",e.scale),this._wasmModule.lua_settable(t,-3),this._wasmModule.lua_pushstring(t,"dt"),this._wasmModule.lua_pushnumber(t,s),this._wasmModule.lua_settable(t,-3),this._wasmModule.lua_pushstring(t,"time"),this._wasmModule.lua_pushnumber(t,performance.now()/1e3),this._wasmModule.lua_settable(t,-3),this._wasmModule.lua_setglobal(t,"ctx")},_readContext(t,e){if(this._wasmModule.lua_getglobal(t,"ctx"),this._wasmModule.lua_istable(t,-1)){if(this._wasmModule.lua_getfield(t,-1,"self"),this._wasmModule.lua_istable(t,-1)){const s=this._readVec3(t,"position"),i=this._readVec3(t,"rotation"),a=this._readVec3(t,"scale");s&&e.position.copy(s),i&&e.rotation.copy(i),a&&e.scale.copy(a)}this._wasmModule.lua_pop(t,1)}this._wasmModule.lua_pop(t,1)},_pushVec3(t,e,s){this._wasmModule.lua_pushstring(t,e),this._wasmModule.lua_newtable(t),this._wasmModule.lua_pushstring(t,"x"),this._wasmModule.lua_pushnumber(t,s.x),this._wasmModule.lua_settable(t,-3),this._wasmModule.lua_pushstring(t,"y"),this._wasmModule.lua_pushnumber(t,s.y),this._wasmModule.lua_settable(t,-3),this._wasmModule.lua_pushstring(t,"z"),this._wasmModule.lua_pushnumber(t,s.z),this._wasmModule.lua_settable(t,-3),this._wasmModule.lua_settable(t,-3)},_readVec3(t,e){if(this._wasmModule.lua_getfield(t,-1,e),this._wasmModule.lua_istable(t,-1)){this._wasmModule.lua_getfield(t,-1,"x");const s=this._wasmModule.lua_tonumber(t,-1);this._wasmModule.lua_pop(t,1),this._wasmModule.lua_getfield(t,-1,"y");const i=this._wasmModule.lua_tonumber(t,-1);this._wasmModule.lua_pop(t,1),this._wasmModule.lua_getfield(t,-1,"z");const a=this._wasmModule.lua_tonumber(t,-1);return this._wasmModule.lua_pop(t,1),this._wasmModule.lua_pop(t,1),new g(s,i,a)}return this._wasmModule.lua_pop(t,1),null},compileScript(t){if(!this._isInitialized)return null;const e=this._createLuaState();try{if(this._wasmModule.luaL_loadstring(e,t)!==0){const i=this._wasmModule.lua_tostring(e,-1);return d.error("Lua","Compilation error:",i),null}return e}catch(s){return d.error("Lua","Compilation failed:",s),null}},update(t){this._state.data.scene.traverse(e=>{e.userData.luaScript&&this.executeScript(e,e.userData.luaScript,t)})},nodes:{"Lua/ExecuteScriptNode":(t,e)=>{const s=document.createElement("textarea");s.className="node-input",s.dataset.prop="script",s.rows=4,s.placeholder="-- ctx.self.position.y = ctx.self.position.y + ctx.dt",s.textContent="ctx.self.position.y = ctx.self.position.y + ctx.dt";const i=document.createElement("label");i.textContent="Script:";const a=document.createElement("div");return a.appendChild(i),a.appendChild(s),P(t,e,"📜 Execute Lua Script",["Target Object"],["Modified Object"],{body:a,extraClasses:["node-card-yellow"]})},"Lua/StateNode":(t,e)=>P(t,e,"🔧 Lua State",[],["dt (Delta Time)","time (Elapsed)","self.position"],{extraClasses:["node-card-yellow"]})}};class Xi extends p{constructor(e,s={}){super(e),this.isWater=!0;const i=this,a=s.textureWidth!==void 0?s.textureWidth:512,n=s.textureHeight!==void 0?s.textureHeight:512,r=s.clipBias!==void 0?s.clipBias:0,o=s.alpha!==void 0?s.alpha:1,c=s.time!==void 0?s.time:0,l=s.waterNormals!==void 0?s.waterNormals:null,u=s.sunDirection!==void 0?s.sunDirection:new g(.70707,.70707,0),h=new O(s.sunColor!==void 0?s.sunColor:16777215),m=new O(s.waterColor!==void 0?s.waterColor:8355711),f=s.eye!==void 0?s.eye:new g(0,0,0),y=s.distortionScale!==void 0?s.distortionScale:20,v=s.side!==void 0?s.side:Xs,S=s.fog!==void 0?s.fog:!1,x=new Qs,_=new g,w=new g,M=new g,C=new ge,D=new g(0,0,-1),R=new zt,N=new g,B=new g,A=new zt,k=new ge,E=new Jt,H=new q(a,n),W={name:"MirrorShader",uniforms:J.merge([Nt.fog,Nt.lights,{normalSampler:{value:null},mirrorSampler:{value:null},alpha:{value:1},time:{value:0},size:{value:1},distortionScale:{value:20},textureMatrix:{value:new ge},sunColor:{value:new O(8355711)},sunDirection:{value:new g(.70707,.70707,0)},eye:{value:new g},waterColor:{value:new O(5592405)}}]),vertexShader:`
				uniform mat4 textureMatrix;
				uniform float time;

				varying vec4 mirrorCoord;
				varying vec4 worldPosition;

				#include <common>
				#include <fog_pars_vertex>
				#include <shadowmap_pars_vertex>
				#include <logdepthbuf_pars_vertex>

				void main() {
					mirrorCoord = modelMatrix * vec4( position, 1.0 );
					worldPosition = mirrorCoord.xyzw;
					mirrorCoord = textureMatrix * mirrorCoord;
					vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );
					gl_Position = projectionMatrix * mvPosition;

				#include <beginnormal_vertex>
				#include <defaultnormal_vertex>
				#include <logdepthbuf_vertex>
				#include <fog_vertex>
				#include <shadowmap_vertex>
			}`,fragmentShader:`
				uniform sampler2D mirrorSampler;
				uniform float alpha;
				uniform float time;
				uniform float size;
				uniform float distortionScale;
				uniform sampler2D normalSampler;
				uniform vec3 sunColor;
				uniform vec3 sunDirection;
				uniform vec3 eye;
				uniform vec3 waterColor;

				varying vec4 mirrorCoord;
				varying vec4 worldPosition;

				vec4 getNoise( vec2 uv ) {
					vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);
					vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );
					vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
					vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
					vec4 noise = texture2D( normalSampler, uv0 ) +
						texture2D( normalSampler, uv1 ) +
						texture2D( normalSampler, uv2 ) +
						texture2D( normalSampler, uv3 );
					return noise * 0.5 - 1.0;
				}

				void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
					vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
					float direction = max( 0.0, dot( eyeDirection, reflection ) );
					specularColor += pow( direction, shiny ) * sunColor * spec;
					diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;
				}

				#include <common>
				#include <packing>
				#include <bsdfs>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <lights_pars_begin>
				#include <shadowmap_pars_fragment>
				#include <shadowmask_pars_fragment>

				void main() {

					#include <logdepthbuf_fragment>
					vec4 noise = getNoise( worldPosition.xz * size );
					vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );

					vec3 diffuseLight = vec3(0.0);
					vec3 specularLight = vec3(0.0);

					vec3 worldToEye = eye-worldPosition.xyz;
					vec3 eyeDirection = normalize( worldToEye );
					sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );

					float distance = length(worldToEye);

					vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;
					vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );

					float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
					float rf0 = 0.3;
					float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
					vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;
					vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);
					vec3 outgoingLight = albedo;
					gl_FragColor = vec4( outgoingLight, alpha );

					#include <tonemapping_fragment>
					#include <colorspace_fragment>
					#include <fog_fragment>	
				}`},T=new X({name:W.name,uniforms:J.clone(W.uniforms),vertexShader:W.vertexShader,fragmentShader:W.fragmentShader,lights:!0,side:v,fog:S});T.uniforms.mirrorSampler.value=H.texture,T.uniforms.textureMatrix.value=k,T.uniforms.alpha.value=o,T.uniforms.time.value=c,T.uniforms.normalSampler.value=l,T.uniforms.sunColor.value=h,T.uniforms.waterColor.value=m,T.uniforms.sunDirection.value=u,T.uniforms.distortionScale.value=y,T.uniforms.eye.value=f,i.material=T,i.onBeforeRender=function(L,U,j){if(w.setFromMatrixPosition(i.matrixWorld),M.setFromMatrixPosition(j.matrixWorld),C.extractRotation(i.matrixWorld),_.set(0,0,1),_.applyMatrix4(C),N.subVectors(w,M),N.dot(_)>0)return;N.reflect(_).negate(),N.add(w),C.extractRotation(j.matrixWorld),D.set(0,0,-1),D.applyMatrix4(C),D.add(M),B.subVectors(w,D),B.reflect(_).negate(),B.add(w),E.position.copy(N),E.up.set(0,1,0),E.up.applyMatrix4(C),E.up.reflect(_),E.lookAt(B),E.far=j.far,E.updateMatrixWorld(),E.projectionMatrix.copy(j.projectionMatrix),k.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),k.multiply(E.projectionMatrix),k.multiply(E.matrixWorldInverse),x.setFromNormalAndCoplanarPoint(_,w),x.applyMatrix4(E.matrixWorldInverse),R.set(x.normal.x,x.normal.y,x.normal.z,x.constant);const b=E.projectionMatrix;A.x=(Math.sign(R.x)+b.elements[8])/b.elements[0],A.y=(Math.sign(R.y)+b.elements[9])/b.elements[5],A.z=-1,A.w=(1+b.elements[10])/b.elements[14],R.multiplyScalar(2/R.dot(A)),b.elements[2]=R.x,b.elements[6]=R.y,b.elements[10]=R.z+1-r,b.elements[14]=R.w,f.setFromMatrixPosition(j.matrixWorld);const Q=L.getRenderTarget(),Z=L.xr.enabled,Y=L.shadowMap.autoUpdate;i.visible=!1,L.xr.enabled=!1,L.shadowMap.autoUpdate=!1,L.setRenderTarget(H),L.state.buffers.depth.setMask(!0),L.autoClear===!1&&L.clear(),L.render(U,E),i.visible=!0,L.xr.enabled=Z,L.shadowMap.autoUpdate=Y,L.setRenderTarget(Q);const ae=j.viewport;ae!==void 0&&L.state.viewport(ae)}}}const Pe=Object.freeze({width:200,height:200,segments:128,textureWidth:512,textureHeight:512,distortionScale:3.7,alpha:1,sunDirection:[.7,.3,.7],sunColor:16777215,waterColor:7695,foamIntensity:.35,foamColor:12638463,fadeEnabled:!0,fadeNear:50,fadeFar:180}),Qi={name:"Water",_state:null,_waters:new Set,_normalMap:null,_normalMapReady:!1,init(t){this._state=t,this._initNormalMap(),this._wireWindowEvents(),d.log("WaterPlugin","Initialized.")},_initNormalMap(){try{const e=document.createElement("canvas");e.width=512,e.height=512;const s=e.getContext("2d"),i=s.createImageData(512,512),a=6,n=14,r=.4,o=.18,c=1/512,l=.06,u=m=>{const f=Math.tanh(m*l);return Math.round((f*.5+.5)*255)};for(let m=0;m<512;m++)for(let f=0;f<512;f++){const y=f*c,v=m*c,S=Math.sin((y*a+v*a*.66)*Math.PI*2)*r,x=Math.sin((y*n-v*n*.64)*Math.PI*2+.4)*o,_=Math.sin(((y+c)*a+v*a*.66)*Math.PI*2)*r,w=Math.sin(((y+c)*n-v*n*.64)*Math.PI*2+.4)*o,M=Math.sin((y*a+(v+c)*a*.66)*Math.PI*2)*r,C=Math.sin((y*n-(v+c)*n*.64)*Math.PI*2+.4)*o,D=(_+w-(S+x))/c,R=(M+C-(S+x))/c,N=(m*512+f)*4;i.data[N+0]=u(-D),i.data[N+1]=u(-R),i.data[N+2]=255,i.data[N+3]=255}s.putImageData(i,0,0);const h=new Zs(e);h.wrapS=nt,h.wrapT=nt,h.colorSpace=Ys,this._normalMap=h,this._normalMapReady=!0}catch(t){d.warn("WaterPlugin","Procedural normal map failed:",t),this._normalMapReady=!1}},createWaterSurface(t={}){if(!this._state?.data?.renderer||!this._state?.data?.scene)return d.warn("WaterPlugin","createWaterSurface called before renderer/scene ready"),null;const e={...Pe,...t},s=Array.isArray(e.sunDirection)?new g().fromArray(e.sunDirection):e.sunDirection instanceof g?e.sunDirection.clone():new g(.7,.3,.7);s.normalize();const i=new O(e.sunColor),a=new O(e.waterColor),n=new Me(e.width,e.height,e.segments,e.segments),r=new Xi(n,{textureWidth:e.textureWidth,textureHeight:e.textureHeight,waterNormals:this._normalMap,sunDirection:s,sunColor:i,waterColor:a,distortionScale:e.distortionScale,alpha:e.alpha,fog:this._state.data.scene.fog!==void 0});r.rotation.x=-Math.PI/2,r.position.y=0,this._extendWaterShader(r,e);const o=r;if(o.name=`Water_${Date.now()}`,o.userData.isManagedObject=!0,o.userData.isWater=!0,o.userData.waterType="shader-surface",o.userData.waterOpts=e,o.castShadow=!1,o.receiveShadow=!0,this._state?.data?.pluginManager?._plugins?.get){const l=this._state.data.pluginManager._plugins.get("StateManager");if(l&&typeof l.trackGfxResource=="function"){const u=r._renderTarget,h=u&&u.width||e.textureWidth,m=u&&u.height||e.textureHeight,f=6*h*m*4+6*h*m*2,y=`water/${o.uuid}/cubemap`;l.trackGfxResource(y,f,"water-cubemap",o.name),o.userData.gfxResourceId=y}}this._state.data.scene.add(o),this._waters.add(o);const c=this._state.data.pluginManager?._plugins?.get?.("Selection");return c&&typeof c._setSelection=="function"&&c._setSelection([o]),d.log("WaterPlugin",`Created water surface "${o.name}" (${e.width}×${e.height}, ${e.segments} seg)`),{mesh:o,water:r,setSun(l,u,h){s.set(l,u,h).normalize()},setWaterColor(l){a.set(l),r.material.uniforms.waterColor.value.copy(a)},setDistortion(l){r.material.uniforms.distortionScale.value=l},dispose:()=>this.disposeWater(o)}},_extendWaterShader(t,e){const s=e.foamIntensity,i=new O(e.foamColor),a=e.fadeEnabled!==!1,n=e.fadeNear??50,r=e.fadeFar??180,o=["uniform vec3 sunColor;","uniform float uFoamIntensity;","uniform vec3 uFoamColor;","uniform float uFadeEnabled;","uniform float uFadeNear;","uniform float uFadeFar;"].join(`
           `),c="uniform vec3 sunColor;",l="gl_FragColor = vec4( blendOverlay( base.rgb, color ), base.a );",u=["float foamTerm = uFoamIntensity * (1.0 - clamp(distortionUv.y, 0.0, 1.0));","vec3 withFoam = mix(blendOverlay(base.rgb, color), uFoamColor, smoothstep(0.4, 0.95, foamTerm));","float camDist = length(worldPosition.xz);","float fadeFactor = (uFadeEnabled > 0.5) ? smoothstep(uFadeNear, uFadeFar, camDist) : 0.0;","float finalAlpha = mix(base.a, 0.0, fadeFactor);","gl_FragColor = vec4(withFoam, finalAlpha);"].join(`
           `);t.material.onBeforeCompile=h=>{h.uniforms.uFoamIntensity={value:s},h.uniforms.uFoamColor={value:i},h.uniforms.uFadeEnabled={value:a?1:0},h.uniforms.uFadeNear={value:n},h.uniforms.uFadeFar={value:r};const m=h.fragmentShader;if(h.fragmentShader=h.fragmentShader.replace(c,o),h.fragmentShader===m){d.warn("WaterPlugin","sunColor uniform decl not found — foam uniforms skipped, foam effect disabled.");return}const f=h.fragmentShader;h.fragmentShader=h.fragmentShader.replace(l,u),h.fragmentShader===f&&d.warn("WaterPlugin","gl_FragColor assignment not found — edge fade / foam effect disabled. Three.js Water.js shader may have changed.")},t.material.needsUpdate=!0},update(t){for(const e of this._waters)e.material&&e.material.uniforms&&e.material.uniforms.time&&(e.material.uniforms.time.value+=t)},disposeWater(t){if(!(!t||!this._waters.has(t))){if(t.userData?.gfxResourceId){const e=this._state?.data?.pluginManager?._plugins?.get?.("StateManager");e&&typeof e.releaseGfxResource=="function"&&e.releaseGfxResource(t.userData.gfxResourceId),delete t.userData.gfxResourceId}t.parent&&t.parent.remove(t),t.geometry&&typeof t.geometry.dispose=="function"&&t.geometry.dispose(),t._renderTarget&&typeof t._renderTarget.dispose=="function"&&(t._renderTarget.dispose(),t._renderTarget=null),t.material&&typeof t.material.dispose=="function"&&t.material.dispose(),this._waters.delete(t),d.log("WaterPlugin",`Disposed water "${t.name}"`)}},_wireWindowEvents(){window.addEventListener("addWater",t=>{const e=t.detail||{};this.createWaterSurface(e)}),window.addEventListener("water:dispose",t=>{const e=t.detail&&t.detail.name,s=e?[...this._waters].find(a=>a.name===e):null;if(s){this.disposeWater(s);return}const i=[...this._waters][0];i&&this.disposeWater(i)})},nodes:{"Water/WaterSurfaceNode":function(e,s){const i=document.createElement("div");return i.className="water-node-body",i.style.cssText="display:flex;flex-direction:column;gap:6px;padding:8px;",i.innerHTML=['<label style="font-size:10px;color:#84967c;">WIDTH</label>','<input type="number" data-prop="width" value="200" min="1" max="2000" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">','<label style="font-size:10px;color:#84967c;">HEIGHT</label>','<input type="number" data-prop="height" value="200" min="1" max="2000" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">','<label style="font-size:10px;color:#84967c;">SEGMENTS</label>','<input type="number" data-prop="segments" value="128" min="1" max="512" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">','<label style="font-size:10px;color:#84967c;">DISTORTION</label>','<input type="range" data-prop="distortionScale" min="0" max="10" step="0.1" value="3.7" style="width:100%;">','<label style="font-size:10px;color:#84967c;">ALPHA</label>','<input type="range" data-prop="alpha" min="0" max="1" step="0.05" value="1" style="width:100%;">','<label style="font-size:10px;color:#84967c;">SUN_ELEVATION</label>','<input type="range" data-prop="sunElevation" min="0" max="90" step="1" value="30" style="width:100%;">','<label style="font-size:10px;color:#84967c;">SUN_AZIMUTH</label>','<input type="range" data-prop="sunAzimuth" min="0" max="360" step="1" value="45" style="width:100%;">','<label style="font-size:10px;color:#84967c;">WATER_COLOR</label>','<input type="color" data-prop="waterColor" value="#001e0f" style="width:100%;height:28px;background:#1c1b1b;border:1px solid #3b4b35;">','<button class="water-run" data-action="run" style="margin-top:6px;background:#00ff00;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;">',"▶ CREATE WATER","</button>"].join(""),P(e,s,"💧 Water Surface",["Width","Height","Segments","Distortion","Alpha","Sun"],["Water Mesh"],{body:i,extraClasses:["node-card-water"]})},"Water/WaterDepthNode":function(e,s){const i=document.createElement("div");return i.className="water-depth-body",i.style.cssText="display:flex;flex-direction:column;gap:6px;padding:8px;",i.innerHTML=['<label style="font-size:10px;color:#84967c;">TARGET_NAME (or empty=selection)</label>','<input type="text" data-prop="target" placeholder="Water_…" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">','<label style="font-size:10px;color:#84967c;">FADE_ENABLED (0=off, 1=on)</label>','<input type="range" data-prop="fadeEnabled" min="0" max="1" step="1" value="1" style="width:100%;">','<label style="font-size:10px;color:#84967c;">FADE_NEAR (scene units)</label>','<input type="number" data-prop="fadeNear" value="50" min="0" max="500" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">','<label style="font-size:10px;color:#84967c;">FADE_FAR (scene units)</label>','<input type="number" data-prop="fadeFar" value="180" min="0" max="1000" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">','<label style="font-size:10px;color:#84967c;">TINT_DENSITY (alpha multiplier)</label>','<input type="range" data-prop="tintDensity" min="0.1" max="1" step="0.05" value="1" style="width:100%;">','<button class="water-depth-run" data-action="run" style="margin-top:6px;background:#02e600;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;">',"▶ APPLY DEPTH","</button>"].join(""),P(e,s,"🌊 Water Depth",["Target","Fade"],["Updated Mesh"],{body:i,extraClasses:["node-card-water-depth"]})}},async executeNode(t,e){if(((t&&t.type?t.type.split("/")[1]:"")||"WaterSurfaceNode")==="WaterDepthNode")return this._updateWaterDepth(e);const i=parseFloat(e.sunElevation)||30,a=parseFloat(e.sunAzimuth)||45,n=i*Math.PI/180,r=a*Math.PI/180,o=[Math.cos(n)*Math.cos(r),Math.sin(n),Math.cos(n)*Math.sin(r)],c=(e.waterColor||"#001e0f").toString(),l=parseInt(c.replace("#",""),16);return this.createWaterSurface({width:parseFloat(e.width)||Pe.width,height:parseFloat(e.height)||Pe.height,segments:parseInt(e.segments)||Pe.segments,distortionScale:parseFloat(e.distortionScale)??Pe.distortionScale,alpha:parseFloat(e.alpha)??Pe.alpha,sunDirection:o,waterColor:l})},_updateWaterDepth(t={}){let e=null;const s=(t.target||"").toString().trim();if(s&&(e=[...this._waters].find(o=>o.name===s)||null,!e))return d.warn("WaterPlugin",`_updateWaterDepth: no active water named "${s}" — check spelling. (Not falling through to selection to avoid hiding typos.)`),null;if(!e&&this._state&&(e=(this._state.data.selectedObjects||[]).find(c=>c.userData&&c.userData.isWater)||null),!e&&this._waters.size&&(e=[...this._waters][0]),!e)return d.warn("WaterPlugin","_updateWaterDepth: no water mesh to update (no name match, no water in selection, no water in _waters)"),null;const i=e.material&&e.material.uniforms;if(!i)return d.warn("WaterPlugin",`_updateWaterDepth: target "${e.name}" has no uniforms`),null;if(t.fadeEnabled!==void 0)if(i.uFadeEnabled){const o=parseFloat(t.fadeEnabled);Number.isFinite(o)&&(i.uFadeEnabled.value=o>=.5?1:0)}else d.warn("WaterPlugin",`_updateWaterDepth: target "${e.name}" has no "uFadeEnabled" uniform — foam shader injection may not have run.`);let a=null,n=null;if(t.fadeNear!==void 0)if(i.uFadeNear){const o=parseFloat(t.fadeNear);Number.isFinite(o)&&o>=0&&(a=o)}else d.warn("WaterPlugin",`_updateWaterDepth: target "${e.name}" has no "uFadeNear" uniform.`);if(t.fadeFar!==void 0)if(i.uFadeFar){const o=parseFloat(t.fadeFar);Number.isFinite(o)&&o>=0&&(n=o)}else d.warn("WaterPlugin",`_updateWaterDepth: target "${e.name}" has no "uFadeFar" uniform.`);if(a!==null&&n!==null&&n<=a&&(d.warn("WaterPlugin",`_updateWaterDepth: fadeFar (${n}) must be > fadeNear (${a}) for a valid GLSL smoothstep curve. Skipping both writes.`),a=null,n=null),a!==null&&(i.uFadeNear.value=a),n!==null&&(i.uFadeFar.value=n),t.tintDensity!==void 0)if(i.alpha){const o=parseFloat(t.tintDensity);if(Number.isFinite(o)){const c=e.userData&&e.userData.waterOpts?e.userData.waterOpts.alpha:1;i.alpha.value=Math.max(0,Math.min(1,c*o))}}else d.warn("WaterPlugin",`_updateWaterDepth: target "${e.name}" has no "alpha" uniform.`);const r=this._state?.data?.pluginManager?._plugins?.get?.("Selection");return r&&typeof r._setSelection=="function"&&r._setSelection([e]),d.log("WaterPlugin",`Updated depth uniforms on "${e.name}" (fade=${i.uFadeEnabled?.value}, near=${i.uFadeNear?.value}, far=${i.uFadeFar?.value}, tint=${i.alpha?.value})`),e}},Zi=33,Yi=2,ne=200,qi=ne*ne*4,Ki={name:"WaterDebugOverlay",_state:null,_renderer:null,_container:null,_canvas:null,_ctx:null,_label:null,_currentWater:null,_buffer:null,_imageData:null,_lastUpdate:0,_mounted:!1,_visible:!1,_warnedReadback:!1,_flipRow:null,init(t){if(this._state=t,this._renderer=t&&t.data&&t.data.renderer,this._container=typeof document<"u"?document.getElementById("water-debug-container"):null,this._canvas=this._container?this._container.querySelector("#water-debug-canvas"):null,this._label=this._container?this._container.querySelector(".water-debug-label"):null,!this._container||!this._canvas){d.warn("WaterDebugOverlay","No #water-debug-container in DOM; overlay disabled.");return}const e=this._canvas.getContext("2d");if(!e){d.warn("WaterDebugOverlay","Failed to acquire 2D context on debug canvas.");return}this._ctx=e,this._buffer=new Uint8Array(qi),this._imageData=e.createImageData(ne,ne),this._flipRow=new Uint8ClampedArray(ne*4),this._container.style.display="none",this._visible=!1,this._mounted=!0,this._onSelectionChangedBound=this._onSelectionChanged.bind(this),this._state.on("selection:changed",this._onSelectionChangedBound);const s=this._state.data&&this._state.data.selectedObjects;s&&s.length&&this._onSelectionChanged(s),window.addEventListener("water:dispose",this._onWaterDisposeBound=i=>{const a=i.detail&&i.detail.name;this._currentWater&&(!a||this._currentWater.name===a)&&this._hide()}),d.log("WaterDebugOverlay","Initialized.")},_onSelectionChanged(t){if(!this._mounted)return;const s=(t||this._state.data&&this._state.data.selectedObjects||[]).find(i=>i&&i.userData&&i.userData.isWater);s&&s._renderTarget?this._show(s):this._hide()},_show(t){this._mounted&&(this._currentWater!==t&&(this._currentWater=t,this._label&&(this._label.textContent=`${t.name} [+Y FACE]`),this._ctx.clearRect(0,0,this._canvas.width,this._canvas.height)),this._container.style.display="",this._visible=!0)},_hide(){this._mounted&&(this._currentWater=null,this._container.style.display="none",this._visible=!1)},update(t){if(!this._mounted||!this._visible||!this._currentWater||!this._renderer)return;const e=typeof performance<"u"&&performance.now?performance.now():Date.now();if(e-this._lastUpdate<Zi)return;this._lastUpdate=e;const i=this._currentWater._renderTarget;if(!i){this._hide();return}try{this._renderer.readRenderTargetPixels(i,0,0,ne,ne,this._buffer,Yi)}catch(n){this._warnedReadback||(d.warn("WaterDebugOverlay","readRenderTargetPixels failed (RTT disposed?):",n&&n.message?n.message:n),this._warnedReadback=!0),this._hide();return}const a=this._imageData.data;a.set(this._buffer),this._flipYInPlace(a,ne),this._ctx.putImageData(this._imageData,0,0)},_flipYInPlace(t,e){const i=ne*4,a=e>>1;for(let n=0;n<a;n++){const r=n*i,o=(e-1-n)*i;this._flipRow.set(t.subarray(r,r+i)),t.copyWithin(r,o,o+i),t.set(this._flipRow,o)}},dispose(){this._mounted&&(this._state&&this._onSelectionChangedBound&&this._state.off("selection:changed",this._onSelectionChangedBound),this._onWaterDisposeBound&&window.removeEventListener("water:dispose",this._onWaterDisposeBound),this._hide(),this._mounted=!1,d.log("WaterDebugOverlay","Disposed."))}};function Vt(t){return!Number.isFinite(t)||t<=0?"0 B":t<1024?`${t} B`:t<1024*1024?`${(t/1024).toFixed(1)} KB`:t<1024*1024*1024?`${(t/(1024*1024)).toFixed(2)} MB`:`${(t/(1024*1024*1024)).toFixed(2)} GB`}function Ji(t){if(!Number.isFinite(t)||t<0)return"—";if(t<1e3)return`${Math.round(t)}ms`;const e=Math.floor(t/1e3);if(e<60)return`${e}s`;const s=Math.floor(e/60);if(s<60)return`${s}m`;const i=Math.floor(s/60);return i<24?`${i}h`:`${Math.floor(i/24)}d`}function $t(t,e){return t=String(t??""),t.length>e?t.slice(0,e-1)+"…":t}function Ee(t){return String(t??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e])}const ea={name:"GfxResourcePanel",_state:null,_sm:null,_container:null,_tbody:null,_countEl:null,_totalEl:null,_recommendEl:null,_recommendMsgEl:null,_recommendDismissBtn:null,_resources:new Map,_recommend:null,_mounted:!1,_unsubs:[],_onDismissBound:null,init(t){if(this._state=t,this._sm=t&&t.data&&t.data.pluginManager?t.data.pluginManager._plugins&&t.data.pluginManager._plugins.get("StateManager"):null,!this._sm){d.warn("GfxResourcePanel","StateManager not found via state.data.pluginManager; panel disabled.");return}if(this._container=typeof document<"u"?document.getElementById("gfx-resource-panel-container"):null,!this._container){d.warn("GfxResourcePanel","No #gfx-resource-panel-container in DOM; panel disabled.");return}if(this._tbody=this._container.querySelector("#gfx-tbody"),this._countEl=this._container.querySelector("#gfx-count"),this._totalEl=this._container.querySelector("#gfx-total"),this._recommendEl=this._container.querySelector("#gfx-recommend"),this._recommendMsgEl=this._container.querySelector("#gfx-recommend-msg"),this._recommendDismissBtn=this._container.querySelector("#gfx-recommend-dismiss"),!this._tbody){d.warn("GfxResourcePanel","Mount present but #gfx-tbody missing; panel disabled.");return}this._onDismissBound=this._onDismiss.bind(this),this._recommendDismissBtn&&this._recommendDismissBtn.addEventListener("click",this._onDismissBound);const e=this._sm.getGfxResources();for(const s of e)this._resources.set(s.id,{...s});this._recommend=this._sm.getState("water.recommendCleanup"),this._mounted=!0,this._unsubs.push(this._sm.subscribe("performance.gfxDelta",s=>this._onGfxDelta(s))),this._unsubs.push(this._sm.subscribe("water.recommendCleanup",s=>this._onRecommend(s))),this._renderTable(),this._renderRecommend(),d.log("GfxResourcePanel",`Initialized with ${this._resources.size} resource(s).`)},_onGfxDelta(t){if(!this._mounted||!t)return;const{event:e,resourceId:s,type:i,label:a,bytes:n}=t;if(e==="allocate")this._resources.set(s,{type:i||"unknown",label:a||"",bytes:typeof n=="number"?n:0,allocatedAt:Date.now()});else if(e==="update"){const r=this._resources.get(s);r?(r.bytes=typeof n=="number"?n:r.bytes,a&&(r.label=a),i&&(r.type=i)):this._resources.set(s,{type:i||"unknown",label:a||"",bytes:typeof n=="number"?n:0,allocatedAt:Date.now()})}else e==="release"&&this._resources.delete(s);this._renderTable()},_onRecommend(t){this._mounted&&(this._recommend=t,this._renderRecommend())},_onDismiss(){if(this._sm)try{this._sm.dispatch({type:"WATER/RECOMMEND_CLEANUP",payload:null,path:"water.recommendCleanup"})}catch(t){d.warn("GfxResourcePanel","Failed to dismiss recommendation:",t&&t.message?t.message:t)}},_renderTable(){if(!this._tbody)return;const t=Array.from(this._resources.entries()).map(([e,s])=>({id:e,...s})).sort((e,s)=>s.bytes-e.bytes);if(t.length===0)this._tbody.innerHTML='<tr class="gfx-empty"><td colspan="5">No GFX resources tracked</td></tr>';else{const e=Date.now(),s=t.map(i=>{const a=e-(i.allocatedAt||e);return'<tr><td class="gfx-cell-id" title="'+Ee(i.id)+'">'+Ee($t(i.id,28))+'</td><td><span class="gfx-type-badge gfx-type-'+Ee(i.type)+'">'+Ee(i.type)+'</span></td><td class="gfx-cell-bytes">'+Vt(i.bytes)+'</td><td class="gfx-cell-label" title="'+Ee(i.label||"")+'">'+Ee($t(i.label||"—",18))+'</td><td class="gfx-cell-age">'+Ji(a)+"</td></tr>"});this._tbody.innerHTML=s.join("")}if(this._countEl&&(this._countEl.textContent=String(t.length)),this._totalEl){const e=t.reduce((s,i)=>s+(i.bytes||0),0);this._totalEl.textContent=Vt(e)}},_renderRecommend(){if(this._recommendEl)if(this._recommend&&typeof this._recommend=="object"){const t=this._recommend.count,e=typeof this._recommend.mb=="number"?this._recommend.mb.toFixed(1):"?",s=`${t} water surface${t===1?"":"s"} active (~${e}MB GPU). Consider deleting unused water to free cubemap render targets.`;this._recommendMsgEl&&(this._recommendMsgEl.textContent=s),this._recommendEl.style.display=""}else this._recommendEl.style.display="none"},update(t){},dispose(){if(this._mounted){for(const t of this._unsubs)try{typeof t=="function"&&t()}catch{}this._unsubs=[],this._recommendDismissBtn&&this._onDismissBound&&this._recommendDismissBtn.removeEventListener("click",this._onDismissBound),this._mounted=!1,d.log("GfxResourcePanel","Disposed.")}}};class ta{constructor(){this.state=new oi,this.plugins=new li(this.state),this.nodeGraph=new ci(this.state,this.plugins),this.scene=new qs,this.scene.background=new O(1710618),this.camera=new Jt(75,window.innerWidth/window.innerHeight,.1,1e3),this.camera.position.set(0,5,10),this.renderer=null,this.composer=null,this._outlinePass=null,this.controls=null,this.clock=new Xt,this._physicsDebug=!1,this._debugGroup=null,this.state.set("scene",this.scene),this.state.set("camera",this.camera),this.state.set("renderer",null),this.state.set("pluginManager",this.plugins)}async init(){this._initRenderer(),this._initLights(),this._initPostProcessing(),this.plugins.register(yi),this.plugins.register(Mi);const e=this.plugins._plugins.get("StateManager");this.plugins._plugins.get("AIAgents").init(e),e.subscribe("render.outlinePass",n=>{this._outlinePass&&(this._outlinePass.enabled=n,d.log("AI Optimize","Outline pass:",n?"ON":"OFF"))}),e.subscribe("physics.substeps",n=>{const r=this.plugins._plugins.get("PhysicsPlugin");r&&n>0&&(r._timeStep=1/n,d.log("AI Optimize","Physics substeps:",n,"→ timestep:",r._timeStep.toFixed(4)))}),e.subscribe("memory.gc",n=>{d.log("AI Optimize","Memory GC triggered at",n),this.renderer&&this.renderer.info.reset()});let s=!1;document.getElementById("state-debug-toggle")?.addEventListener("click",()=>{s=!s;const n=document.getElementById("state-debug-body"),r=document.getElementById("state-debug-toggle");n&&(n.style.display=s?"block":"none"),r&&(r.textContent=s?"▾ State Debug":"▸ State Debug")}),window.addEventListener("togglePanel",n=>{if(n.detail.panel==="sidebar"){const r=document.getElementById("sidebar");r&&(r.style.display=r.style.display==="none"?"":"none")}else n.detail.panel==="debug"&&document.getElementById("state-debug-toggle")?.click()}),this.plugins.register(Pi),this.plugins.register(Ei),this.plugins.register(ji),this.plugins.register(di),this.plugins.register(pi),this.plugins.register(mi),this.plugins.register(fi),this.plugins.register(gi),this.plugins.register(_i),this.plugins.register(vi),this.plugins.register(Ci),this.plugins.register(ki),this.plugins.register(Hi),this.plugins.register(Vi),this.plugins.register($i),this.plugins.register(Qi),this.plugins.register(Ki),this.plugins.register(ea);const i=this.plugins._plugins.get("TransformGizmo");i?.setup&&i.setup(this.camera,this.renderer,this.controls,this.scene);const a=this.plugins._plugins.get("PhotorealisticRender");a?.composer&&(a.composer.addPass(this._outlinePass),this.composer=a.composer,d.log("MasterApp","Swapped to PhotorealisticRender pipeline.")),window.addEventListener("setRenderPreset",n=>{this.plugins._plugins.get("PhotorealisticRender")?.applyPreset(n.detail.preset)}),window.addEventListener("captureScreenshot",async()=>{const n=this.plugins._plugins.get("PhotorealisticRender");if(n?.captureScreenshot){const r=await n.captureScreenshot();if(r){const o=document.createElement("a");o.href=r,o.download=`screenshot-${Date.now()}.png`,o.click()}}}),this._initNodeEditorUI(),this._initToolbarButtons(),this._initKeybindings(),this._initDemoScene(),this._wireMenuEvents(),this._initImportHandlers(),await this._initWasmModules(),this._animate(),d.log("MasterApp","Initialized successfully.")}_initRenderer(){const e=document.getElementById("renderCanvas");this.renderer=new Ks({canvas:e,antialias:!0}),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));const s=e.clientWidth||window.innerWidth,i=e.clientHeight||window.innerHeight;this.renderer.setSize(s,i),this.renderer.shadowMap.enabled=!0,this.renderer.shadowMap.type=oe,this.state.set("renderer",this.renderer),this.controls=new Js(this.camera,this.renderer.domElement),this.controls.enableDamping=!0,this.state.set("controls",this.controls);const a=()=>{const n=e.clientWidth||window.innerWidth,r=e.clientHeight||window.innerHeight;this.camera.aspect=n/r,this.camera.updateProjectionMatrix(),this.renderer.setSize(n,r),this.composer.setSize(n,r),this._outlinePass?.setSize(n,r)};window.addEventListener("resize",a),typeof ResizeObserver<"u"&&new ResizeObserver(a).observe(e.parentElement||e)}_initLights(){const e=new Zt(16777215,.5);this.scene.add(e);const s=new Yt(16777215,1);s.position.set(5,10,7),this.scene.add(s)}_initPostProcessing(){this.composer=new ts(this.renderer),this.composer.addPass(new ss(this.scene,this.camera)),this._outlinePass=new fe(new F(window.innerWidth,window.innerHeight),this.scene,this.camera),this._outlinePass.edgeStrength=3,this._outlinePass.visibleEdgeColor.set("#00ff00"),this._outlinePass.edgeGlow=1,this._outlinePass.pulsePeriod=2,this.composer.addPass(this._outlinePass),this.state.on("selection:changed",i=>{const a=[];i.forEach(n=>{n.isMesh?a.push(n):n.isGroup&&n.traverse(r=>{r.isMesh&&a.push(r)})}),this._outlinePass.selectedObjects=a,window.dispatchEvent(new CustomEvent("selection:changed",{detail:i}))}),this._raycaster=new Kt,this._mouse=new F;let e=0,s=0;this.renderer.domElement.addEventListener("mousedown",i=>{e=i.clientX,s=i.clientY}),this.renderer.domElement.addEventListener("mouseup",i=>{const a=this.plugins._plugins.get("Selection");if(a?._isLassoActive)return;const n=i.clientX-e,r=i.clientY-s;if(Math.sqrt(n*n+r*r)>3)return;this._mouse.x=i.clientX/window.innerWidth*2-1,this._mouse.y=-(i.clientY/window.innerHeight)*2+1,this._raycaster.setFromCamera(this._mouse,this.camera);const o=[];this.scene.traverse(l=>{l.isMesh&&l.userData.isManagedObject&&o.push(l)});const c=this._raycaster.intersectObjects(o,!1);if(c.length>0){const l=c[0].object;if(a?._stickySelect){const u=this.state.data.selectedObjects||[];u.includes(l)?a._setSelection(u.filter(h=>h!==l)):a._setSelection([...u,l])}else a?._setSelection([l])}})}async _initWasmModules(){d.log("MasterApp","Initializing WebAssembly modules...");const e=this.plugins._plugins.get("Rust"),s=this.plugins._plugins.get("Go"),i=this.plugins._plugins.get("Lua");e?.init&&await e.init(this.state),s?.init&&await s.init(this.state),i?.init&&await i.init(this.state),d.log("MasterApp","Language plugins initialized.")}_initNodeEditorUI(){const e=document.getElementById("add-node-menu"),s=document.getElementById("node-graph-area");if(!e||!s)return;const i={};this.plugins.getAvailableNodes().forEach(a=>{const[n,r]=a.split("/");i[n]||(i[n]=[]),i[n].push({type:a,name:r})}),Object.entries(i).forEach(([a,n])=>{const r=document.createElement("div");r.className="menu-category",r.textContent=a,e.appendChild(r),n.forEach(o=>{const c=document.createElement("div");c.className="menu-item",c.textContent=o.name,c.addEventListener("click",()=>{const l=this.plugins.getNodeCreator(o.type);if(l){const u=l(100,100);u.dataset.nodeType=o.type,s.appendChild(u),this._registerNodeInGraph(o.type,u)}}),e.appendChild(c)})})}_registerNodeInGraph(e,s){const i={type:e,dom:s,inputs:{},outputs:{}};this.nodeGraph.activeGraph.push(i);const a=s.querySelector('[data-action="run"]');a&&a.addEventListener("click",()=>{this.nodeGraph.executeNodeOnDemand(i).catch(o=>{d.error("MasterApp","Node execution failed:",o)})});const n=s.querySelector('input[type="range"][data-prop="percent"]'),r=s.querySelector(".percent-value");n&&r&&n.addEventListener("input",()=>{r.textContent=`${n.value}%`})}_initToolbarButtons(){const e=this.plugins._plugins.get("Selection"),s=this.plugins._plugins.get("PhysicsPlugin");document.getElementById("btn-add-cube")?.addEventListener("click",()=>{const a=new G(.8,.8,.8),n=new ie({color:Math.random()*16777215,roughness:.4,metalness:.3}),r=new p(a,n);r.name="Cube_"+Date.now(),r.position.set((Math.random()-.5)*6,2+Math.random()*2,(Math.random()-.5)*6),r.userData.isManagedObject=!0,this.scene.add(r);const o=s?.createRigidBody(r.name,r,{mass:1});o&&(o.velocity.x=(Math.random()-.5)*4,o.velocity.y=2+Math.random()*3,o.velocity.z=(Math.random()-.5)*4),e?._setSelection([r]),d.log("Toolbar","Spawned cube:",r.name)}),document.getElementById("btn-select-all")?.addEventListener("click",()=>{e?.selectAll()}),document.getElementById("btn-deselect")?.addEventListener("click",()=>{e?.deselectAll()}),document.getElementById("btn-lasso")?.addEventListener("click",()=>{e?._isLassoActive?(e.completeLassoSelect(),document.getElementById("btn-lasso").textContent="🎯 Lasso"):(e?.startLassoSelect(),document.getElementById("btn-lasso").textContent="🎯 Complete")}),this.state.on("selection:lasso:started",()=>{document.getElementById("btn-lasso").textContent="🎯 Complete"}),this.state.on("selection:lasso:completed",()=>{document.getElementById("btn-lasso").textContent="🎯 Lasso"}),this.state.on("selection:sticky:toggled",({enabled:a})=>{const n=document.getElementById("sticky-indicator");n&&(n.textContent="Sticky: "+(a?"ON":"OFF"),n.style.color=a?"#00ff88":"#888")}),document.getElementById("btn-debug")?.addEventListener("click",()=>{this._togglePhysicsDebug()});const i=this.plugins._plugins.get("TransformGizmo");document.getElementById("btn-translate")?.addEventListener("click",()=>{i?.setMode("translate")}),document.getElementById("btn-rotate")?.addEventListener("click",()=>{i?.setMode("rotate")}),document.getElementById("btn-scale")?.addEventListener("click",()=>{i?.setMode("scale")}),this.state.on("gizmo:mode:changed",({mode:a})=>{["translate","rotate","scale"].forEach(n=>{const r=document.getElementById(`btn-${n}`);r&&r.classList.toggle("active",n===a)})}),this.state.on("physics:debug:toggled",a=>{const n=document.getElementById("btn-debug");n&&(n.textContent=a?"🐛 Debug ON":"🐛 Debug",n.style.background=a?"#2a4a2a":"#2a2a2a")})}_initKeybindings(){const e=this.plugins._plugins.get("Selection"),s=this.plugins._plugins.get("TransformGizmo");window.addEventListener("keydown",i=>{if(i.target.tagName==="INPUT"||i.target.tagName==="TEXTAREA")return;const a=i.key.toLowerCase(),n=i.ctrlKey||i.metaKey;switch(!0){case(n&&a==="a"):i.preventDefault(),e?.selectAll();break;case a==="escape":e?.deselectAll();break;case(a==="g"&&!n):case(a==="r"&&!n):case(a==="s"&&!n):i.preventDefault(),s?.handleKey(a,i);break;case(a==="t"&&!n):i.preventDefault(),e?.toggleStickySelect();break;case(a==="u"&&!n):e?.ungroupSelected();break;case(a==="i"&&!n):e?.invertSelection();break;case(a==="l"&&!n):e?._isLassoActive?e?.completeLassoSelect():e?.startLassoSelect();break;case a==="1":e?.selectByColor("#ff4444");break;case a==="2":e?.selectByColor("#44aaff");break;case a==="3":e?.selectByColor("#44ff44");break;case(a==="p"&&!n):this._togglePhysicsDebug();break}}),window.addEventListener("mousedown",i=>{e?._isLassoActive&&i.target===this.renderer.domElement&&e.addLassoPoint(i.clientX,i.clientY)}),window.addEventListener("dblclick",i=>{e?._isLassoActive&&e.completeLassoSelect()})}_togglePhysicsDebug(){this._physicsDebug=!this._physicsDebug,this._physicsDebug?this._debugGroup||(this._debugGroup=new rt,this._debugGroup.name="PhysicsDebug",this.scene.add(this._debugGroup)):this._debugGroup&&this._clearDebugMeshes(),this.state.emit("physics:debug:toggled",this._physicsDebug),d.log("PhysicsDebug",this._physicsDebug?"ON":"OFF")}_renderPhysicsDebug(){if(!this._physicsDebug||!this._debugGroup)return;this._clearDebugMeshes();const e=this.plugins._plugins.get("PhysicsPlugin"),s=e?._state?.data?.physicsBodies;s&&s.forEach(i=>{if(!i.object||i.isStatic)return;const a=i.object.position,n=e._getBodyHalfHeight(i),r=new tt(n,16,16),o=new Ue({color:65280,wireframe:!0,transparent:!0,opacity:.4}),c=new p(r,o);c.position.copy(a),c.userData._debug=!0,this._debugGroup.add(c);const l=Math.sqrt(i.velocity.x**2+i.velocity.y**2+i.velocity.z**2);if(l>.01){const u=new g(i.velocity.x,i.velocity.y,i.velocity.z).normalize(),h=new ei(u,a,l*.3,16729156,.15,.1);h.userData._debug=!0,this._debugGroup.add(h)}})}_clearDebugMeshes(){if(this._debugGroup)for(;this._debugGroup.children.length>0;){const e=this._debugGroup.children[0];e.geometry&&e.geometry.dispose(),e.material&&e.material.dispose(),e.line&&(e.line?.geometry?.dispose(),e.line?.material?.dispose(),e.cone?.geometry?.dispose(),e.cone?.material?.dispose()),this._debugGroup.remove(e)}}_initDemoScene(){const e=this.plugins._plugins.get("Selection"),s=this.plugins._plugins.get("PhysicsPlugin"),i=new ti(20,20,4473924,2236962);i.name="GridFloor",this.scene.add(i);const a=new Me(20,20),n=new ie({color:3815994,roughness:.9}),r=new p(a,n);r.rotation.x=-Math.PI/2,r.name="Ground",r.userData.isManagedObject=!0,this.scene.add(r),s?.createRigidBody("Ground",r,{mass:0,isStatic:!0});const o=[16729156,4500223,16755200,16729343,4521796,16777028,16737860,6728447,11206468,16737962,6750122,11184708],c=["Cube","Sphere","Cylinder","Cone","Torus","Icosahedron","Cube","Sphere","Cylinder","Cone","Torus","Icosahedron"],l=[new G(.7,.7,.7),new tt(.4,24,24),new V(.35,.35,.9,20),new Mt(.4,.9,20),new be(.35,.14,12,24),new Lt(.4)];o.forEach((h,m)=>{const f=l[m%l.length],y=new ie({color:h,roughness:.4,metalness:.3}),v=new p(f,y);v.name=`Demo_${c[m]}_${m}`,v.position.set((m%4-1.5)*3+(Math.random()-.5)*1.5,.8+Math.random()*.6,(Math.floor(m/4)-1)*3+(Math.random()-.5)*1.5),v.castShadow=!0,v.userData.isManagedObject=!0,this.scene.add(v),s?.createRigidBody(v.name,v,{mass:1}),m===0&&e?._setSelection([v])});const u=this.plugins._plugins.get("GameMap");if(u){const h=new Float32Array(2500);for(let m=0;m<50;m++)for(let f=0;f<50;f++){const y=f/50-.5,v=m/50-.5;h[m*50+f]=Math.sin(y*6)*Math.cos(v*6)*.8+Math.sin(y*v*10)*.3}u._cacheMap({id:"demo_terrain",size:10,segments:50,color:5938270,heightmap:{width:50,height:50,data:h}}),u.generateTiledWorld([{mapId:"demo_terrain",position:{x:-8,y:-.3,z:-3},scale:{x:.5,y:.5,z:.5}}],{blendEdges:!1,autoLOD:!1,collisionLayer:!1}).then(m=>{d.log("Demo","Terrain generated:",m?.name)})}d.log(`[Demo] Scene initialized with ${o.length} selectable objects + terrain`)}_initImportHandlers(){const e=document.getElementById("import-file-input"),s=document.getElementById("drop-zone"),i=document.getElementById("viewport");document.getElementById("btn-import")?.addEventListener("click",()=>{e?.click()}),e?.addEventListener("change",n=>{const r=n.target.files?.[0];r&&this._importFile(r),e.value=""});let a=0;i?.addEventListener("dragenter",n=>{n.preventDefault(),a++,s?.classList.add("active")}),i?.addEventListener("dragleave",n=>{n.preventDefault(),a--,a<=0&&(s?.classList.remove("active"),a=0)}),i?.addEventListener("dragover",n=>{n.preventDefault()}),i?.addEventListener("drop",n=>{n.preventDefault(),a=0,s?.classList.remove("active");const r=n.dataTransfer?.files?.[0];r&&this._importFile(r)})}async _importFile(e){const s=this.plugins._plugins.get("Go");if(!s){d.warn("MasterApp","GoPlugin not registered");return}const i=e.name.split(".").pop()?.toLowerCase(),a=await e.arrayBuffer();let n=null;if(["las","ply"].includes(i))n=await s.parsePointCloud(a);else if(["step","iges","stp","igs"].includes(i))n=await s.importCAD(a);else{d.warn("MasterApp","Unsupported import format:",i);return}if(!n){d.warn("MasterApp","Import returned no result for",e.name);return}n.position.set(0,0,0),this.scene.add(n),this.plugins._plugins.get("Selection")?._setSelection([n]),d.log("MasterApp","Imported",e.name,"→",n.name)}_wireMenuEvents(){const e=this.plugins._plugins.get("Selection");window.addEventListener("selectAll",()=>e?.selectAll()),window.addEventListener("deselectAll",()=>e?.deselectAll()),window.addEventListener("invertSelection",()=>e?.invertSelection()),window.addEventListener("group",()=>e?.groupSelected()),window.addEventListener("ungroup",()=>e?.ungroupSelected()),window.addEventListener("addPrimitive",async o=>{const c=this.plugins._plugins.get("PhysicsPlugin"),l=o.detail.type;let u;switch(l){case"cube":case"box":u=new G(.8,.8,.8);break;case"sphere":case"uvsphere":u=new tt(.45,32,32);break;case"icosphere":u=new Lt(.45);break;case"cone":u=new Mt(.45,.9,24);break;case"cylinder":u=new V(.4,.4,.9,24);break;case"torus":u=new be(.4,.15,16,32);break;case"plane":u=new Me(1.2,1.2);break;case"capsule":u=new si(.3,.6,4,8);break;case"pyramid":u=new Mt(.5,.9,4);break;case"text3d":{try{const{TextGeometry:f}=await Xe(async()=>{const{TextGeometry:S}=await import("./TextGeometry-D70dcrEp.js");return{TextGeometry:S}},__vite__mapDeps([0,1])),{FontLoader:y}=await Xe(async()=>{const{FontLoader:S}=await import("./FontLoader-Czls5vVm.js");return{FontLoader:S}},__vite__mapDeps([2,1])),v=await new Promise((S,x)=>{new y().load("https://threejs.org/examples/fonts/helvetiker_regular.typeface.json",S,void 0,x)});u=new f("MEME",{font:v,size:.5,depth:.1,curveSegments:4}),u.center()}catch(f){d.warn("MasterApp","Text3D font load failed, using fallback geometry:",f.message||f),u=new G(.8,.4,.1)}break}default:u=new G(.8,.8,.8)}const h=new ie({color:Math.random()*16777215,roughness:.4,metalness:.3}),m=new p(u,h);m.name=`${l}_${Date.now()}`,m.position.set((Math.random()-.5)*6,2+Math.random()*2,(Math.random()-.5)*6),m.userData.isManagedObject=!0,this.scene.add(m),c?.createRigidBody(m.name,m,{mass:1}),e?._setSelection([m])});const s={helvetiker:"https://threejs.org/examples/fonts/helvetiker_regular.typeface.json",space_grotesk:"https://threejs.org/examples/fonts/helvetiker_regular.typeface.json",roboto_mono:"https://threejs.org/examples/fonts/helvetiker_regular.typeface.json"},i=.012,a=.012,n=new Map;async function r(o){if(n.has(o))return n.get(o);const{FontLoader:c}=await Xe(async()=>{const{FontLoader:u}=await import("./FontLoader-Czls5vVm.js");return{FontLoader:u}},__vite__mapDeps([2,1])),l=new Promise((u,h)=>{new c().load(o,u,void 0,h)});return n.set(o,l),l}window.addEventListener("generateText3D",async o=>{this.plugins._plugins.get("PhysicsPlugin");const c=this.plugins._plugins.get("Selection"),l=o.detail||{},u=(l.text||"HODL").toString().slice(0,12),h=(l.font||"space_grotesk").toString(),m=parseFloat(l.size)||42,f=parseFloat(l.depth)||8.5,y=s[h]||s.helvetiker,v=h!=="helvetiker";let S;try{const{TextGeometry:w}=await Xe(async()=>{const{TextGeometry:C}=await import("./TextGeometry-D70dcrEp.js");return{TextGeometry:C}},__vite__mapDeps([0,1])),M=await r(y);S=new w(u,{font:M,size:m*i,depth:f*a,curveSegments:4,bevelEnabled:!1}),S.center(),v&&d.warn("MasterApp",`Font '${h}' not bundled — using helvetiker fallback.`)}catch(w){d.warn("MasterApp","Text3D font load failed, using BoxGeometry fallback:",w.message||w);const M=u.length*.4;S=new G(M,m*.012,f*.012)}const x=new ie({color:Math.random()*16777215,roughness:.4,metalness:.3}),_=new p(S,x);_.name=`Text3D_${u}_${Date.now()}`,_.position.set((Math.random()-.5)*4,1+Math.random()*1.5,(Math.random()-.5)*4),_.userData.isManagedObject=!0,_.userData.textContent=u,_.userData.fontFamily=h,this.scene.add(_),c?._setSelection([_]),window.dispatchEvent(new CustomEvent("text3d:created",{detail:{name:_.name}})),d.log("MasterApp",`Generated 3D text: "${u}" (${_.name})`)}),window.addEventListener("select:byName",o=>{const c=o.detail?.name;if(!c)return;let l=null;this.scene.traverse(u=>{l||u.userData?.isManagedObject&&u.name===c&&(l=u)}),l?this.plugins._plugins.get("Selection")?._setSelection([l]):d.warn("MasterApp",`select:byName: no managed object named "${c}"`)}),window.addEventListener("delete",()=>{const o=this.state.data.selectedObjects;if(o?.length){const c=this.state.data.physicsBodies;o.forEach(l=>{c&&c.delete(l.uuid),this.scene.remove(l),l.userData&&l.userData.isWater&&window.dispatchEvent(new CustomEvent("water:dispose",{detail:{name:l.name}}))}),e?._setSelection([])}}),window.addEventListener("duplicate",()=>{const o=this.state.data.selectedObjects;if(!o?.length)return;const c=this.plugins._plugins.get("PhysicsPlugin"),l=[];o.forEach(u=>{const h=u.clone(!0);h.name=u.name+"_copy",h.position.x+=1.5,h.userData.isManagedObject=!0,this.scene.add(h),c?.createRigidBody(h.name,h,{mass:1}),l.push(h)}),e?._setSelection(l)})}_updateDebugPanel(e){if(this._debugPanelAcc===void 0&&(this._debugPanelAcc=0),this._debugPanelAcc+=e,this._debugPanelAcc<1)return;this._debugPanelAcc=0;const s=this.plugins._plugins.get("StateManager");if(!s)return;const i=s.getState("performance.fps"),a=s.getState("performance.frameTime"),n=s.getState("performance.memoryMB"),r=s.getState("render.outlinePass"),o=s.getState("physics.substeps"),c=this.plugins._plugins.get("AIAgents"),l=c?._telemetryBuffer?.length??0,u=c?._experts?.size??0,h=(m,f)=>{const y=document.getElementById(m);y&&(y.textContent=f)};h("dbg-fps",i?.toFixed(0)??"--"),h("dbg-frame",a?.toFixed(1)??"--"),h("dbg-mem",n?.toFixed(0)??"--"),h("dbg-outline",r?"ON":"OFF"),h("dbg-substeps",o??"--"),h("dbg-mw",s._middleware.length),h("dbg-buf",l),h("dbg-experts",u),h("dbg-listeners",s._listeners.size)}_animate(){requestAnimationFrame(()=>this._animate());const e=this.clock.getDelta(),s=e>0?1/e:60,i=this.plugins._plugins.get("StateManager");if(i){i.dispatch({type:"PERF/UPDATE_FPS",payload:s,path:"performance.fps"}),i.dispatch({type:"PERF/UPDATE_FRAME_TIME",payload:e*1e3,path:"performance.frameTime"}),performance.memory&&i.dispatch({type:"PERF/UPDATE_MEMORY",payload:performance.memory.usedJSHeapSize/1048576,path:"performance.memoryMB"});const r=this.plugins._plugins.get("PhysicsPlugin"),o=r?._timeStep?r._timeStep*1e3:.5;i.dispatch({type:"PHYSICS/STEP_TIME",payload:o,path:"physics.stepTimeMS"})}this.controls.update();const a=performance.now();this.nodeGraph.evaluate(e);const n=performance.now()-a;i&&i.dispatch({type:"NODE_GRAPH/EVAL_TIME",payload:n,path:"nodeGraph.evalTimeMS"}),this.plugins.update(e),this._renderPhysicsDebug(),this.composer.render(),this._updateDebugPanel(e)}}window.app=new ta;window.app.init().catch(t=>d.error("MasterApp",t));
