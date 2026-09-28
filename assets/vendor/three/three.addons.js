import{HalfFloatType as le,NoBlending as ne,Timer as he,Vector2 as X,WebGLRenderTarget as ue}from"./three.module.js";var b={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

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


		}`};import{ShaderMaterial as K,UniformsUtils as ae}from"./three.module.js";import{BufferGeometry as te,Float32BufferAttribute as k,OrthographicCamera as ie,Mesh as se}from"./three.module.js";var d=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}},re=new ie(-1,1,1,-1,0,1),F=class extends te{constructor(){super(),this.setAttribute("position",new k([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new k([0,2,0,0,2,0],2))}},oe=new F,T=class{constructor(e){this._mesh=new se(oe,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,re)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}};var A=class extends d{constructor(e,i="tDiffuse"){super(),this.textureID=i,this.uniforms=null,this.material=null,e instanceof K?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=ae.clone(e.uniforms),this.material=new K({name:e.name!==void 0?e.name:"unspecified",defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new T(this.material)}render(e,i,r){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=r.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(i),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}};var w=class extends d{constructor(e,i){super(),this.scene=e,this.camera=i,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,i,r){let a=e.getContext(),s=e.state;s.buffers.color.setMask(!1),s.buffers.depth.setMask(!1),s.buffers.color.setLocked(!0),s.buffers.depth.setLocked(!0);let o,u;this.inverse?(o=0,u=1):(o=1,u=0),s.buffers.stencil.setTest(!0),s.buffers.stencil.setOp(a.REPLACE,a.REPLACE,a.REPLACE),s.buffers.stencil.setFunc(a.ALWAYS,o,4294967295),s.buffers.stencil.setClear(u),s.buffers.stencil.setLocked(!0),e.setRenderTarget(r),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(i),this.clear&&e.clear(),e.render(this.scene,this.camera),s.buffers.color.setLocked(!1),s.buffers.depth.setLocked(!1),s.buffers.color.setMask(!0),s.buffers.depth.setMask(!0),s.buffers.stencil.setLocked(!1),s.buffers.stencil.setFunc(a.EQUAL,1,4294967295),s.buffers.stencil.setOp(a.KEEP,a.KEEP,a.KEEP),s.buffers.stencil.setLocked(!0)}},B=class extends d{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}};var N=class{constructor(e,i){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),i===void 0){let r=e.getSize(new X);this._width=r.width,this._height=r.height,i=new ue(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:le}),i.texture.name="EffectComposer.rt1"}else this._width=i.width,this._height=i.height;this.renderTarget1=i,this.renderTarget2=i.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new A(b),this.copyPass.material.blending=ne,this.timer=new he}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,i){this.passes.splice(i,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let i=this.passes.indexOf(e);i!==-1&&this.passes.splice(i,1)}isLastEnabledPass(e){for(let i=e+1;i<this.passes.length;i++)if(this.passes[i].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let i=this.renderer.getRenderTarget(),r=!1;for(let a=0,s=this.passes.length;a<s;a++){let o=this.passes[a];if(o.enabled!==!1){if(o.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(a),o.render(this.renderer,this.writeBuffer,this.readBuffer,e,r),o.needsSwap){if(r){let u=this.renderer.getContext(),h=this.renderer.state.buffers.stencil;h.setFunc(u.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),h.setFunc(u.EQUAL,1,4294967295)}this.swapBuffers()}w!==void 0&&(o instanceof w?r=!0:o instanceof B&&(r=!1))}}this.renderer.setRenderTarget(i)}reset(e){if(e===void 0){let i=this.renderer.getSize(new X);this._pixelRatio=this.renderer.getPixelRatio(),this._width=i.width,this._height=i.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,i){this._width=e,this._height=i;let r=this._width*this._pixelRatio,a=this._height*this._pixelRatio;this.renderTarget1.setSize(r,a),this.renderTarget2.setSize(r,a);for(let s=0;s<this.passes.length;s++)this.passes[s].setSize(r,a)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}};import{Color as fe}from"./three.module.js";var O=class extends d{constructor(e,i,r=null,a=null,s=null){super(),this.scene=e,this.camera=i,this.overrideMaterial=r,this.clearColor=a,this.clearAlpha=s,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new fe}render(e,i,r){let a=e.autoClear;e.autoClear=!1;let s,o;this.overrideMaterial!==null&&(o=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(s=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:r),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(s),this.overrideMaterial!==null&&(this.scene.overrideMaterial=o),e.autoClear=a}};import{AdditiveBlending as me,Color as Y,HalfFloatType as I,MeshBasicMaterial as de,ShaderMaterial as D,UniformsUtils as Z,Vector2 as C,Vector3 as y,WebGLRenderTarget as z}from"./three.module.js";import{Color as pe}from"./three.module.js";var $={name:"LuminosityHighPassShader",uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new pe(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`};var P=class m extends d{constructor(e,i=1,r,a){super(),this.strength=i,this.radius=r,this.threshold=a,this.resolution=e!==void 0?new C(e.x,e.y):new C(256,256),this.clearColor=new Y(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let s=Math.round(this.resolution.x/2),o=Math.round(this.resolution.y/2);this.renderTargetBright=new z(s,o,{type:I,depthBuffer:!1}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let f=0;f<this.nMips;f++){let l=new z(s,o,{type:I,depthBuffer:!1});l.texture.name="UnrealBloomPass.h"+f,l.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(l);let M=new z(s,o,{type:I,depthBuffer:!1});M.texture.name="UnrealBloomPass.v"+f,M.texture.generateMipmaps=!1,this.renderTargetsVertical.push(M),s=Math.round(s/2),o=Math.round(o/2)}let u=$;this.highPassUniforms=Z.clone(u.uniforms),this.highPassUniforms.luminosityThreshold.value=a,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new D({uniforms:this.highPassUniforms,vertexShader:u.vertexShader,fragmentShader:u.fragmentShader}),this.separableBlurMaterials=[];let h=[6,10,14,18,22];s=Math.round(this.resolution.x/2),o=Math.round(this.resolution.y/2);for(let f=0;f<this.nMips;f++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(h[f])),this.separableBlurMaterials[f].uniforms.invSize.value=new C(1/s,1/o),s=Math.round(s/2),o=Math.round(o/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=i,this.compositeMaterial.uniforms.bloomRadius.value=.1;let p=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=p,this.bloomTintColors=[new y(1,1,1),new y(1,1,1),new y(1,1,1),new y(1,1,1),new y(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=Z.clone(b.uniforms),this.blendMaterial=new D({uniforms:this.copyUniforms,vertexShader:b.vertexShader,fragmentShader:b.fragmentShader,premultipliedAlpha:!0,blending:me,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new Y,this._oldClearAlpha=1,this._basic=new de,this._fsQuad=new T(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,i){let r=Math.round(e/2),a=Math.round(i/2);this.renderTargetBright.setSize(r,a);for(let s=0;s<this.nMips;s++)this.renderTargetsHorizontal[s].setSize(r,a),this.renderTargetsVertical[s].setSize(r,a),this.separableBlurMaterials[s].uniforms.invSize.value=new C(1/r,1/a),r=Math.round(r/2),a=Math.round(a/2)}render(e,i,r,a,s){e.getClearColor(this._oldClearColor),this._oldClearAlpha=e.getClearAlpha();let o=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),s&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,e.setRenderTarget(null),e.clear(),this._fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this._fsQuad.render(e);let u=this.renderTargetBright;for(let h=0;h<this.nMips;h++)this._fsQuad.material=this.separableBlurMaterials[h],this.separableBlurMaterials[h].uniforms.colorTexture.value=u.texture,this.separableBlurMaterials[h].uniforms.direction.value=m.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[h]),e.clear(),this._fsQuad.render(e),this.separableBlurMaterials[h].uniforms.colorTexture.value=this.renderTargetsHorizontal[h].texture,this.separableBlurMaterials[h].uniforms.direction.value=m.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[h]),e.clear(),this._fsQuad.render(e),u=this.renderTargetsVertical[h];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this._fsQuad.render(e),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,s&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(r),this._fsQuad.render(e)),e.setClearColor(this._oldClearColor,this._oldClearAlpha),e.autoClear=o}_getSeparableBlurMaterial(e){let i=[],r=e/3;for(let o=0;o<e;o++)i.push(.39894*Math.exp(-.5*o*o/(r*r))/r);let a=[],s=[];for(let o=1;o<e;o+=2){let u=i[o],h=o+1<e?i[o+1]:0,p=u+h;a.push((o*u+(o+1)*h)/p),s.push(p)}return new D({defines:{KERNEL_PAIRS:a.length},uniforms:{colorTexture:{value:null},invSize:{value:new C(.5,.5)},direction:{value:new C(.5,.5)},centerWeight:{value:i[0]},gaussianOffsets:{value:a},gaussianWeights:{value:s}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float centerWeight;
				uniform float gaussianOffsets[KERNEL_PAIRS];
				uniform float gaussianWeights[KERNEL_PAIRS];

				void main() {

					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * centerWeight;

					for ( int i = 0; i < KERNEL_PAIRS; i ++ ) {

						vec2 uvOffset = direction * invSize * gaussianOffsets[ i ];
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * gaussianWeights[ i ];

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new D({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}};P.BlurDirectionX=new C(1,0);P.BlurDirectionY=new C(0,1);import{ColorManagement as ce,RawShaderMaterial as ge,UniformsUtils as ve,LinearToneMapping as xe,ReinhardToneMapping as _e,CineonToneMapping as Te,AgXToneMapping as Ce,ACESFilmicToneMapping as Me,NeutralToneMapping as be,CustomToneMapping as Se,SRGBTransfer as we}from"./three.module.js";var E={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
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

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`};var L=class extends d{constructor(){super(),this.isOutputPass=!0,this.uniforms=ve.clone(E.uniforms),this.material=new ge({name:E.name,uniforms:this.uniforms,vertexShader:E.vertexShader,fragmentShader:E.fragmentShader}),this._fsQuad=new T(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,i,r){this.uniforms.tDiffuse.value=r.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},ce.getTransfer(this._outputColorSpace)===we&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===xe?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===_e?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===Te?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===Me?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===Ce?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===be?this.material.defines.NEUTRAL_TONE_MAPPING="":this._toneMapping===Se&&(this.material.defines.CUSTOM_TONE_MAPPING=""),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(i),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}};import{Matrix4 as j,Object3D as ye,Quaternion as Pe,Vector3 as ee}from"./three.module.js";var q=new ee,Ee=new Pe,J=new ee,Q=class extends ye{constructor(e=document.createElement("div")){super(),this.isCSS3DObject=!0,this.element=e,this.element.style.position="absolute",this.element.style.pointerEvents="auto",this.element.style.userSelect="none",this.element.setAttribute("draggable",!1),this.addEventListener("removed",function(){this.traverse(function(i){i.element&&i.element instanceof i.element.ownerDocument.defaultView.Element&&i.element.parentNode!==null&&i.element.remove()})})}copy(e,i){return super.copy(e,i),this.element=e.element.cloneNode(!0),this}};var g=new j,Re=new j,V=class{constructor(e={}){let i=this,r,a,s,o,u={camera:{style:""},objects:new WeakMap},h=e.element!==void 0?e.element:document.createElement("div");h.style.overflow="hidden",this.domElement=h;let p=document.createElement("div");p.style.transformOrigin="0 0",p.style.pointerEvents="none",h.appendChild(p);let f=document.createElement("div");f.style.transformStyle="preserve-3d",p.appendChild(f),this.getSize=function(){return{width:r,height:a}},this.render=function(n,t){let c=t.projectionMatrix.elements[5]*o;t.view&&t.view.enabled?(p.style.transform=`translate( ${-t.view.offsetX*(r/t.view.width)}px, ${-t.view.offsetY*(a/t.view.height)}px )`,p.style.transform+=`scale( ${t.view.fullWidth/t.view.width}, ${t.view.fullHeight/t.view.height} )`):p.style.transform="",n.matrixWorldAutoUpdate===!0&&n.updateMatrixWorld(),t.parent===null&&t.matrixWorldAutoUpdate===!0&&t.updateMatrixWorld();let R,v;t.isOrthographicCamera&&(R=-(t.right+t.left)/2,v=(t.top+t.bottom)/2);let x=t.view&&t.view.enabled?t.view.height/t.view.fullHeight:1,_=t.isOrthographicCamera?`scale( ${x} )scale(`+c+")translate("+l(R)+"px,"+l(v)+"px)"+M(t.matrixWorldInverse):`scale( ${x} )translateZ(`+c+"px)"+M(t.matrixWorldInverse),S=(t.isPerspectiveCamera?"perspective("+c+"px) ":"")+_+"translate("+s+"px,"+o+"px)";u.camera.style!==S&&(f.style.transform=S,u.camera.style=S),G(n,n,t,_)},this.setSize=function(n,t){r=n,a=t,s=r/2,o=a/2,h.style.width=n+"px",h.style.height=t+"px",p.style.width=n+"px",p.style.height=t+"px",f.style.width=n+"px",f.style.height=t+"px"};function l(n){return Math.abs(n)<1e-10?0:n}function M(n){let t=n.elements;return"matrix3d("+l(t[0])+","+l(-t[1])+","+l(t[2])+","+l(t[3])+","+l(t[4])+","+l(-t[5])+","+l(t[6])+","+l(t[7])+","+l(t[8])+","+l(-t[9])+","+l(t[10])+","+l(t[11])+","+l(t[12])+","+l(-t[13])+","+l(t[14])+","+l(t[15])+")"}function W(n){let t=n.elements;return"translate(-50%,-50%)"+("matrix3d("+l(t[0])+","+l(t[1])+","+l(t[2])+","+l(t[3])+","+l(-t[4])+","+l(-t[5])+","+l(-t[6])+","+l(-t[7])+","+l(t[8])+","+l(t[9])+","+l(t[10])+","+l(t[11])+","+l(t[12])+","+l(t[13])+","+l(t[14])+","+l(t[15])+")")}function H(n){n.isCSS3DObject&&(n.element.style.display="none");for(let t=0,c=n.children.length;t<c;t++)H(n.children[t])}function G(n,t,c,R){if(n.visible===!1){H(n);return}if(n.isCSS3DObject){let v=n.layers.test(c.layers)===!0,x=n.element;if(x.style.display=v===!0?"":"none",v===!0){n.onBeforeRender(i,t,c);let _;n.isCSS3DSprite?(g.copy(c.matrixWorldInverse),g.transpose(),n.rotation2D!==0&&g.multiply(Re.makeRotationZ(n.rotation2D)),n.matrixWorld.decompose(q,Ee,J),g.setPosition(q),g.scale(J),g.elements[3]=0,g.elements[7]=0,g.elements[11]=0,g.elements[15]=1,_=W(g)):_=W(n.matrixWorld);let U=u.objects.get(n);if(U===void 0||U.style!==_){x.style.transform=_;let S={style:_};u.objects.set(n,S)}x.parentNode!==f&&f.appendChild(x),n.onAfterRender(i,t,c)}}for(let v=0,x=n.children.length;v<x;v++)G(n.children[v],t,c,R)}}};export{Q as CSS3DObject,V as CSS3DRenderer,N as EffectComposer,L as OutputPass,O as RenderPass,P as UnrealBloomPass};
