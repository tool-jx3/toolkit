import{$ as e,d as t}from"./image-_aSXR7GW.js";import{o as n}from"./fonts-D4UhEyox.js";import{A as r,U as i,w as a}from"./imagefx-Cid2bGbf.js";import{A as o,C as s,E as c,M as l,N as u,S as d,W as f,X as p,Y as m,Z as h,a as g,d as _,et as v,h as ee,i as y,it as b,j as x,n as S,nt as C,p as w,q as te,r as ne,rt as T,s as E,tt as re,u as ie,v as D,x as ae,y as O,z as oe}from"./view-BBhgsEAz.js";import{C as se,E as ce,F as le,I as ue,L as de,M as fe,N as pe,P as me,b as he,j as ge,t as k,w as _e,y as ve}from"./map-fx-gSFzxnBI.js";g.line={worldUnits:{value:1},linewidth:{value:1},resolution:{value:new re},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}},y.line={uniforms:v.merge([g.common,g.fog,g.line]),vertexShader:`
		#include <common>
		#include <color_pars_vertex>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>
		#include <clipping_planes_pars_vertex>

		uniform float linewidth;
		uniform vec2 resolution;

		attribute vec3 instanceStart;
		attribute vec3 instanceEnd;

		attribute vec3 instanceColorStart;
		attribute vec3 instanceColorEnd;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#ifdef USE_DASH

			uniform float dashScale;
			attribute float instanceDistanceStart;
			attribute float instanceDistanceEnd;
			varying float vLineDistance;

		#endif

		float trimSegmentAlpha( const in vec4 start, const in vec4 end ) {

			// compute the interpolation factor needed to trim the segment so it terminates
			// between the camera plane and the near plane

			// conservative estimate of the near plane
			float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
			float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column

			// we need different nearEstimate formula for reversed and default depth buffer
			// a is positive with a reversed depth buffer so it can be used for controlling the code flow
			float nearEstimate = ( a > 0.0 ) ? ( - b / ( a + 1.0 ) ) : ( - 0.5 * b / a );

			return ( nearEstimate - start.z ) / ( end.z - start.z );

		}

		void main() {

			#ifdef USE_COLOR

				vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

			#endif

			float aspect = resolution.x / resolution.y;

			// camera space
			vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
			vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

			#ifdef USE_DASH

				float lineDistanceStart = dashScale * instanceDistanceStart;
				float lineDistanceEnd = dashScale * instanceDistanceEnd;

			#endif

			#ifdef WORLD_UNITS

				worldStart = start.xyz;
				worldEnd = end.xyz;

			#else

				vUv = uv;

			#endif

			// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
			// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
			// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
			// perhaps there is a more elegant solution -- WestLangley

			bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

			if ( perspective ) {

				if ( start.z < 0.0 && end.z >= 0.0 ) {

					float alpha = trimSegmentAlpha( start, end );
					end.xyz = mix( start.xyz, end.xyz, alpha );

					#ifdef USE_DASH

						lineDistanceEnd = mix( lineDistanceStart, lineDistanceEnd, alpha );

					#endif

				} else if ( end.z < 0.0 && start.z >= 0.0 ) {

					float alpha = trimSegmentAlpha( end, start );
					start.xyz = mix( end.xyz, start.xyz, alpha );

					#ifdef USE_DASH

						lineDistanceStart = mix( lineDistanceEnd, lineDistanceStart, alpha );

					#endif

				}

			}

			#ifdef USE_DASH

				vLineDistance = ( position.y < 0.5 ) ? lineDistanceStart : lineDistanceEnd;
				vUv = uv;

			#endif

			// clip space
			vec4 clipStart = projectionMatrix * start;
			vec4 clipEnd = projectionMatrix * end;

			// ndc space
			vec3 ndcStart = clipStart.xyz / clipStart.w;
			vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

			// direction
			vec2 dir = ndcEnd.xy - ndcStart.xy;

			// account for clip-space aspect ratio
			dir.x *= aspect;
			dir = normalize( dir );

			#ifdef WORLD_UNITS

				vec3 worldDir = normalize( end.xyz - start.xyz );
				vec3 tmpFwd = normalize( mix( start.xyz, end.xyz, 0.5 ) );
				vec3 worldUp = normalize( cross( worldDir, tmpFwd ) );
				vec3 worldFwd = cross( worldDir, worldUp );
				worldPos = position.y < 0.5 ? start: end;

				// height offset
				float hw = linewidth * 0.5;
				worldPos.xyz += position.x < 0.0 ? hw * worldUp : - hw * worldUp;

				// don't extend the line if we're rendering dashes because we
				// won't be rendering the endcaps
				#ifndef USE_DASH

					// cap extension
					worldPos.xyz += position.y < 0.5 ? - hw * worldDir : hw * worldDir;

					// add width to the box
					worldPos.xyz += worldFwd * hw;

					// endcaps
					if ( position.y > 1.0 || position.y < 0.0 ) {

						worldPos.xyz -= worldFwd * 2.0 * hw;

					}

				#endif

				// project the worldpos
				vec4 clip = projectionMatrix * worldPos;

				// shift the depth of the projected points so the line
				// segments overlap neatly
				vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
				clip.z = clipPose.z * clip.w;

			#else

				vec2 offset = vec2( dir.y, - dir.x );
				// undo aspect ratio adjustment
				dir.x /= aspect;
				offset.x /= aspect;

				// sign flip
				if ( position.x < 0.0 ) offset *= - 1.0;

				// endcaps
				if ( position.y < 0.0 ) {

					offset += - dir;

				} else if ( position.y > 1.0 ) {

					offset += dir;

				}

				// adjust for linewidth
				offset *= linewidth;

				// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
				offset /= resolution.y;

				// select end
				vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

				// back to clip space
				offset *= clip.w;

				clip.xy += offset;

			#endif

			gl_Position = clip;

			vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

			#include <logdepthbuf_vertex>
			#include <clipping_planes_vertex>
			#include <fog_vertex>

		}
		`,fragmentShader:`
		uniform vec3 diffuse;
		uniform float opacity;
		uniform float linewidth;

		#ifdef USE_DASH

			uniform float dashOffset;
			uniform float dashSize;
			uniform float gapSize;

		#endif

		varying float vLineDistance;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#include <common>
		#include <color_pars_fragment>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>
		#include <clipping_planes_pars_fragment>

		vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

			float mua;
			float mub;

			vec3 p13 = p1 - p3;
			vec3 p43 = p4 - p3;

			vec3 p21 = p2 - p1;

			float d1343 = dot( p13, p43 );
			float d4321 = dot( p43, p21 );
			float d1321 = dot( p13, p21 );
			float d4343 = dot( p43, p43 );
			float d2121 = dot( p21, p21 );

			float denom = d2121 * d4343 - d4321 * d4321;

			float numer = d1343 * d4321 - d1321 * d4343;

			mua = numer / denom;
			mua = clamp( mua, 0.0, 1.0 );
			mub = ( d1343 + d4321 * ( mua ) ) / d4343;
			mub = clamp( mub, 0.0, 1.0 );

			return vec2( mua, mub );

		}

		void main() {

			float alpha = opacity;
			vec4 diffuseColor = vec4( diffuse, alpha );

			#include <clipping_planes_fragment>

			#ifdef USE_DASH

				if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

				if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

			#endif

			#ifdef WORLD_UNITS

				// Find the closest points on the view ray and the line segment
				vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
				vec3 lineDir = worldEnd - worldStart;
				vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

				vec3 p1 = worldStart + lineDir * params.x;
				vec3 p2 = rayEnd * params.y;
				vec3 delta = p1 - p2;
				float len = length( delta );
				float norm = len / linewidth;

				#ifndef USE_DASH

					#ifdef USE_ALPHA_TO_COVERAGE

						float dnorm = fwidth( norm );
						alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

					#else

						if ( norm > 0.5 ) {

							discard;

						}

					#endif

				#endif

			#else

				#ifdef USE_ALPHA_TO_COVERAGE

					// artifacts appear on some hardware if a derivative is taken within a conditional
					float a = vUv.x;
					float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
					float len2 = a * a + b * b;
					float dlen = fwidth( len2 );

					if ( abs( vUv.y ) > 1.0 ) {

						alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

					}

				#else

					if ( abs( vUv.y ) > 1.0 ) {

						float a = vUv.x;
						float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
						float len2 = a * a + b * b;

						if ( len2 > 1.0 ) discard;

					}

				#endif

			#endif

			#include <logdepthbuf_fragment>
			#include <color_fragment>

			gl_FragColor = vec4( diffuseColor.rgb, alpha );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
			#include <fog_fragment>
			#include <premultiplied_alpha_fragment>

		}
		`};var ye=class extends te{constructor(e){super({type:`LineMaterial`,uniforms:v.clone(y.line.uniforms),vertexShader:y.line.vertexShader,fragmentShader:y.line.fragmentShader,clipping:!0}),this.isLineMaterial=!0,this.setValues(e)}get color(){return this.uniforms.diffuse.value}set color(e){this.uniforms.diffuse.value=e}get worldUnits(){return`WORLD_UNITS`in this.defines}set worldUnits(e){e===!0!==this.worldUnits&&(this.needsUpdate=!0),e===!0?this.defines.WORLD_UNITS=``:delete this.defines.WORLD_UNITS}get linewidth(){return this.uniforms.linewidth.value}set linewidth(e){this.uniforms.linewidth&&(this.uniforms.linewidth.value=e)}get dashed(){return`USE_DASH`in this.defines}set dashed(e){e===!0!==this.dashed&&(this.needsUpdate=!0),e===!0?this.defines.USE_DASH=``:delete this.defines.USE_DASH}get dashScale(){return this.uniforms.dashScale.value}set dashScale(e){this.uniforms.dashScale.value=e}get dashSize(){return this.uniforms.dashSize.value}set dashSize(e){this.uniforms.dashSize.value=e}get dashOffset(){return this.uniforms.dashOffset.value}set dashOffset(e){this.uniforms.dashOffset.value=e}get gapSize(){return this.uniforms.gapSize.value}set gapSize(e){this.uniforms.gapSize.value=e}get opacity(){return this.uniforms.opacity.value}set opacity(e){this.uniforms&&(this.uniforms.opacity.value=e)}get resolution(){return this.uniforms.resolution.value}set resolution(e){this.uniforms.resolution.value.copy(e)}get alphaToCoverage(){return`USE_ALPHA_TO_COVERAGE`in this.defines}set alphaToCoverage(e){this.defines&&(e===!0!==this.alphaToCoverage&&(this.needsUpdate=!0),e===!0?this.defines.USE_ALPHA_TO_COVERAGE=``:delete this.defines.USE_ALPHA_TO_COVERAGE)}},be=new E,A=new C,j=class extends ae{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type=`LineSegmentsGeometry`,this.setIndex([0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5]),this.setAttribute(`position`,new D([-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],3)),this.setAttribute(`uv`,new D([-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],2))}applyMatrix4(e){let t=this.attributes.instanceStart,n=this.attributes.instanceEnd;return t!==void 0&&(t.applyMatrix4(e),n.applyMatrix4(e),t.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new d(t,6,1);return this.setAttribute(`instanceStart`,new s(n,3,0)),this.setAttribute(`instanceEnd`,new s(n,3,3)),this.instanceCount=this.attributes.instanceStart.count,this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new d(t,6,1);return this.setAttribute(`instanceColorStart`,new s(n,3,0)),this.setAttribute(`instanceColorEnd`,new s(n,3,3)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new b(e.geometry)),this}fromLineSegments(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new E);let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;e!==void 0&&t!==void 0&&(this.boundingBox.setFromBufferAttribute(e),be.setFromBufferAttribute(t),this.boundingBox.union(be))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new m),this.boundingBox===null&&this.computeBoundingBox();let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(e!==void 0&&t!==void 0){let n=this.boundingSphere.center;this.boundingBox.getCenter(n);let r=0;for(let i=0,a=e.count;i<a;i++)A.fromBufferAttribute(e,i),r=Math.max(r,n.distanceToSquared(A)),A.fromBufferAttribute(t,i),r=Math.max(r,n.distanceToSquared(A));this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error(`THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.`,this)}}toJSON(){}},M=new T,N=new C,xe=new C,P=new T,F=new T,I=new T,L=new C,R=new x,z=new c,Se=new C,B=new E,V=new m,H=new T,U,W;function Ce(e,t,n){return H.set(0,0,-t,1).applyMatrix4(e.projectionMatrix),H.multiplyScalar(1/H.w),H.x=W/n.width,H.y=W/n.height,H.applyMatrix4(e.projectionMatrixInverse),H.multiplyScalar(1/H.w),Math.abs(Math.max(H.x,H.y))}function we(e,t){let n=e.matrixWorld,r=e.geometry,i=r.attributes.instanceStart,a=r.attributes.instanceEnd,o=Math.min(r.instanceCount,i.count);for(let r=0,s=o;r<s;r++){z.start.fromBufferAttribute(i,r),z.end.fromBufferAttribute(a,r),z.applyMatrix4(n);let o=new C,s=new C;U.distanceSqToSegment(z.start,z.end,s,o),s.distanceTo(o)<W*.5&&t.push({point:s,pointOnLine:o,distance:U.origin.distanceTo(s),object:e,face:null,faceIndex:r,uv:null,uv1:null})}}function Te(e,t,n){let r=t.projectionMatrix,i=e.material.resolution,a=e.matrixWorld,s=e.geometry,c=s.attributes.instanceStart,l=s.attributes.instanceEnd,u=Math.min(s.instanceCount,c.count),d=-t.near;U.at(1,I),I.w=1,I.applyMatrix4(t.matrixWorldInverse),I.applyMatrix4(r),I.multiplyScalar(1/I.w),I.x*=i.x/2,I.y*=i.y/2,I.z=0,L.copy(I),R.multiplyMatrices(t.matrixWorldInverse,a);for(let t=0,s=u;t<s;t++){if(P.fromBufferAttribute(c,t),F.fromBufferAttribute(l,t),P.w=1,F.w=1,P.applyMatrix4(R),F.applyMatrix4(R),P.z>d&&F.z>d)continue;if(P.z>d){let e=P.z-F.z,t=(P.z-d)/e;P.lerp(F,t)}else if(F.z>d){let e=F.z-P.z,t=(F.z-d)/e;F.lerp(P,t)}P.applyMatrix4(r),F.applyMatrix4(r),P.multiplyScalar(1/P.w),F.multiplyScalar(1/F.w),P.x*=i.x/2,P.y*=i.y/2,F.x*=i.x/2,F.y*=i.y/2,z.start.copy(P),z.start.z=0,z.end.copy(F),z.end.z=0;let s=z.closestPointToPointParameter(L,!0);z.at(s,Se);let u=o.lerp(P.z,F.z,s),f=u>=-1&&u<=1,p=L.distanceTo(Se)<W*.5;if(f&&p){z.start.fromBufferAttribute(c,t),z.end.fromBufferAttribute(l,t),z.start.applyMatrix4(a),z.end.applyMatrix4(a);let r=new C,i=new C;U.distanceSqToSegment(z.start,z.end,i,r),n.push({point:i,pointOnLine:r,distance:U.origin.distanceTo(i),object:e,face:null,faceIndex:t,uv:null,uv1:null})}}}var Ee=class extends l{constructor(e=new j,t=new ye({color:Math.random()*16777215})){super(e,t),this.isLineSegments2=!0,this.type=`LineSegments2`}computeLineDistances(){let e=this.geometry,t=e.attributes.instanceStart,n=e.attributes.instanceEnd,r=new Float32Array(2*t.count);for(let e=0,i=0,a=t.count;e<a;e++,i+=2)N.fromBufferAttribute(t,e),xe.fromBufferAttribute(n,e),r[i]=i===0?0:r[i-1],r[i+1]=r[i]+N.distanceTo(xe);let i=new d(r,2,1);return e.setAttribute(`instanceDistanceStart`,new s(i,1,0)),e.setAttribute(`instanceDistanceEnd`,new s(i,1,1)),this}raycast(e,t){let n=this.material.worldUnits,r=e.camera;if(r===null&&!n&&console.error(`LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.`),n===!1&&(this.material.resolution.x===0||this.material.resolution.y===0))return;let i=e.params.Line2===void 0?0:e.params.Line2.threshold||0;U=e.ray;let a=this.matrixWorld,o=this.geometry,s=this.material;W=s.linewidth+i,o.boundingSphere===null&&o.computeBoundingSphere(),V.copy(o.boundingSphere).applyMatrix4(a);let c;if(c=n?W*.5:Ce(r,Math.max(r.near,V.distanceToPoint(U.origin)),s.resolution),V.radius+=c,U.intersectsSphere(V)===!1)return;o.boundingBox===null&&o.computeBoundingBox(),B.copy(o.boundingBox).applyMatrix4(a);let l;l=n?W*.5:Ce(r,Math.max(r.near,B.distanceToPoint(U.origin)),s.resolution),B.expandByScalar(l),U.intersectsBox(B)!==!1&&(n?we(this,t):Te(this,r,t))}onBeforeRender(e){let t=this.material.uniforms;t&&t.resolution&&(e.getViewport(M),this.material.uniforms.resolution.value.set(M.z,M.w))}},G={room:`#7cf5b8`,hall:`#5cd6d0`,roomFace:`#36c98e`,hallFace:`#3bb7b0`,door:`#ffd27a`,route:`#ffc94d`,arrow:`#fff4cf`,start:`#62e3ff`,goal:`#ff7a5c`,label:`#eafff4`,labelBg:`rgba(6, 18, 14, 0.78)`},De=1.7,Oe=7,ke=2048,Ae=700;async function je(e,t){let r=`${e}${t.start}${t.goal}`;r.trim()&&await n(`Noto Sans TC`,Ae,r).catch(()=>!1)}function K(e,t,n,r){let i=ue(e,t);return i.horizontal?new C(n,r,i.fixed):new C(i.fixed,r,n)}var q=(e,t)=>[e.x,e.y,e.z,t.x,t.y,t.z];function J(e,t,n,r,i){e.push(t.x,t.y,t.z,n.x,n.y,n.z,r.x,r.y,r.z),e.push(t.x,t.y,t.z,r.x,r.y,r.z,i.x,i.y,i.z)}function Y(e,t){let n=new ie;return n.setAttribute(`position`,new D(e,3)),new l(n,t)}function Me(e,t){let n=t.wall,r=ce(n),i=.6,a=[],o=[],s=[],c=0;for(let l of he){let u=ue(e,l),d=de(e,l,t.rooms,t.doors,t.door);c+=d.length;let f=ge(u,d);for(let[t,r]of f)a.push(q(K(e,l,t,i),K(e,l,r,i))),J(s,K(e,l,t,0),K(e,l,r,0),K(e,l,r,n),K(e,l,t,n));a.push(q(K(e,l,u.from,n),K(e,l,u.from+u.len,n)));for(let[t,a]of d)o.push(q(K(e,l,t,0),K(e,l,t,r))),o.push(q(K(e,l,a,0),K(e,l,a,r))),o.push(q(K(e,l,t,r),K(e,l,a,r))),o.push(q(K(e,l,t,i),K(e,l,a,i))),J(s,K(e,l,t,r),K(e,l,a,r),K(e,l,a,n),K(e,l,t,n))}for(let[t,r]of[[e.x,e.y],[e.x+e.w,e.y],[e.x+e.w,e.y+e.h],[e.x,e.y+e.h]])a.push([t,0,r,t,n,r]);return{lines:a,doors:o,faces:s,openings:c}}function Ne(n,i,a,o){let s=`${Ae} 44px ${r}`,c=t(8,8).getContext(`2d`);c.font=s;let l=Math.ceil(c.measureText(n).width),u=Math.min(2048,l+32),d=t(u,72),f=d.getContext(`2d`);f.fillStyle=G.labelBg,e(f,2,2,u-4,68,12),f.fill(),f.strokeStyle=a,f.lineWidth=3,f.stroke(),f.font=s,f.fillStyle=i,f.textAlign=`center`,f.textBaseline=`middle`,f.fillText(n,u/2,38,u-32);let m=new _(d);m.anisotropy=4;let g=new h({map:m,transparent:!0,depthWrite:!1}),v=new p(g);return v.scale.set(o*u/72,o,1),v.renderOrder=10,v}function Pe(e,t){let n=new O,r=_e(e);if(r.length<2)return n;let i=1.4,a=[],o=[],s=t/2;for(let e=1;e<r.length;e++){let t=r[e-1],n=r[e],o=Math.hypot(n.x-t.x,n.y-t.y),c=-(n.y-t.y)/o,l=(n.x-t.x)/o;J(a,new C(t.x+c*s,i,t.y+l*s),new C(n.x+c*s,i,n.y+l*s),new C(n.x-c*s,i,n.y-l*s),new C(t.x-c*s,i,t.y-l*s))}for(let e of r)for(let t=0;t<18;t++){let n=t/18*Math.PI*2,r=(t+1)/18*Math.PI*2;a.push(e.x,i,e.y),a.push(e.x+Math.cos(r)*s,i,e.y+Math.sin(r)*s),a.push(e.x+Math.cos(n)*s,i,e.y+Math.sin(n)*s)}let c=Math.max(t*6,24),l=0,d=c/2;for(let e=1;e<r.length;e++){let n=r[e-1],i=r[e],a=Math.hypot(i.x-n.x,i.y-n.y),s=(i.x-n.x)/a,u=(i.y-n.y)/a,f=t*.9,p=t*.75;for(;d<=l+a;){let e=d-l,t=n.x+s*e,r=n.y+u*e;o.push(t+s*f*.5,1.7999999999999998,r+u*f*.5),o.push(t-s*f*.5-u*p,1.7999999999999998,r-u*f*.5+s*p),o.push(t-s*f*.5+u*p,1.7999999999999998,r-u*f*.5-s*p),d+=c}l+=a}let f={transparent:!0,depthWrite:!1,side:2};return n.add(Y(a,new u({color:G.route,opacity:.85,...f}))),o.length&&n.add(Y(o,new u({color:G.arrow,opacity:.95,...f}))),n}function Fe(e,t,n,r,i){let a=new O;a.position.set(e.x,0,e.y);let o={color:t,transparent:!0,depthWrite:!1,side:2},s=new l(new f(i*.72,i,40),new u({...o,opacity:.95}));s.rotation.x=-Math.PI/2,s.position.y=2,a.add(s);let c=new l(new f(i*.92,i,40),new u({...o,opacity:.6}));c.rotation.x=-Math.PI/2,c.position.y=2.2,a.add(c);let d=r.wall*1.25,p=new l(new ee(i*.08,i*.08,d,10,1,!0),new u({...o,opacity:.55}));p.position.y=d/2,a.add(p);let m=Ne(n,t,t,r.wall*.34);return m.position.y=d+r.wall*.22,a.add(m),{group:a,pulse:c,tall:[p,m],label:m}}var Ie={preview:null},Le=class{view;content=null;lineMats=[];pulses=[];markers=[];roomLabels=[];floorTex=null;input=null;orbitSaved=null;framedFor=``;mode=`orbit`;time=0;stats={rooms:0,halls:0,openings:0,labels:0,route:!1,floor:!1};constructor(e,t){this.view=S(e,{width:t.width,height:t.height,fov:45,near:1,far:4e4,position:[0,600,600]}),this.view.controls.maxPolarAngle=Math.PI*.49,this.setResolution(t.width,t.height)}setResolution(e,t){let n=t/720;for(let{mat:r,width:i}of this.lineMats)r.resolution.set(e,t),r.linewidth=i*n}setSize(e,t){this.view.setSize(e,t),this.setResolution(e,t)}lineSet(e,t,n){let r=new O;if(!e.length)return r;let i=e.flat(),a=(e,n)=>{let r=new j;r.setPositions(i);let a=new ye({color:new w(t),linewidth:e,transparent:!0,opacity:n,depthWrite:!1});this.lineMats.push({mat:a,width:e});let o=new Ee(r,a);return o.renderOrder=2,o};return n&&r.add(a(Oe,.16)),r.add(a(De,.95)),r}floorTexture(e){if(this.floorTex?.src===e)return this.floorTex.tex;this.floorTex?.tex.dispose();let n=Math.min(1,ke/Math.max(e.width,e.height)),r=t(Math.round(e.width*n),Math.round(e.height*n)),i=r.getContext(`2d`);i.imageSmoothingQuality=`high`,i.drawImage(e,0,0,r.width,r.height);let a=this.view.prepareTexture(new _(r));return a.anisotropy=8,this.floorTex={src:e,tex:a},a}update(e){this.input=e;let{walk:t,size:n}=e;this.dropContent(),this.lineMats=[],this.pulses=[],this.markers=[],this.roomLabels=[];let r=new O;this.view.scene.background=new w(e.bg);let i=t.floor&&!!e.image;if(i&&e.image){let t=new l(new oe(n.width,n.height),new u({map:this.floorTexture(e.image),color:new w(`#9aa8a2`),transparent:!0,opacity:.8,depthWrite:!1}));t.rotation.x=-Math.PI/2,t.position.set(n.width/2,0,n.height/2),t.renderOrder=0,r.add(t)}let a=[],o=[],s=[],c=[],d=[],f={room:[],hall:[]},p=0;for(let e of t.rooms){let n=Me(e,t);p+=n.openings,(e.kind===`hall`?o:a).push(...n.lines),s.push(...n.doors),(e.kind===`hall`?d:c).push(...n.faces),J(f[e.kind],new C(e.x,.3,e.y),new C(e.x+e.w,.3,e.y),new C(e.x+e.w,.3,e.y+e.h),new C(e.x,.3,e.y+e.h))}let m=(e,t)=>new u({color:e,transparent:!0,opacity:t,depthWrite:!1,side:2});c.length&&r.add(Y(c,m(G.roomFace,.1))),d.length&&r.add(Y(d,m(G.hallFace,.06)));let h=i?.1:.2;f.room.length&&r.add(Y(f.room,m(G.roomFace,h))),f.hall.length&&r.add(Y(f.hall,m(G.hallFace,h*.7))),r.add(this.lineSet(a,G.room,!0)),r.add(this.lineSet(o,G.hall,!0)),r.add(this.lineSet(s,G.door,!0));let g=0;if(t.names)for(let e of t.rooms){let n=e.name.trim();if(!n)continue;let i=Ne(n,G.label,e.kind===`hall`?G.hall:G.room,t.wall*.36);i.position.set(e.x+e.w/2,t.wall*.92,e.y+e.h/2),i.name=`room-label`,r.add(i),this.roomLabels.push({sprite:i,at:{x:e.x+e.w/2,y:e.y+e.h/2}}),g++}let _=_e(t.path),v=_.length>=2,ee=Math.max(4,Math.min(24,t.door*.22)),y=Math.max(10,t.door*.42),b=[];_.length&&b.push([_[0],G.start,e.text.start]),v&&(r.add(Pe(_,ee)),b.push([_[_.length-1],G.goal,e.text.goal]));for(let[e,n,i]of b){let a=Fe(e,n,i,t,y);r.add(a.group),this.pulses.push(a.pulse),this.markers.push({at:e,tall:a.tall,radius:y,label:a.label,text:i})}this.content=r,this.view.scene.add(r),this.stats={rooms:t.rooms.filter(e=>e.kind===`room`).length,halls:t.rooms.filter(e=>e.kind===`hall`).length,openings:p,labels:g,route:v,floor:i},this.setResolution(this.view.size.width,this.view.size.height);let x=fe(t.rooms,n),S=`${x.x},${x.y},${x.w},${x.h}`;S!==this.framedFor&&(this.framedFor=S,this.orbitSaved=null,this.mode===`orbit`&&this.resetOrbit()),this.applyTime(),this.view.invalidate()}dropContent(){this.content&&=(this.view.scene.remove(this.content),this.content.traverse(e=>{let t=e.material;t&&this.floorTex&&t.map===this.floorTex.tex&&(t.map=null)}),ne(this.content),null)}resetOrbit(){if(!this.input)return;let{walk:e,size:t}=this.input,n=fe(e.rooms,t),r=n.x+n.w/2,i=n.y+n.h/2,a=this.view.camera,o=a.fov*Math.PI/180,s=Math.max(60,n.w/Math.max(.2,a.aspect),n.h)/2/Math.tan(o/2)*1.5,c=55*Math.PI/180,l=this.view.controls,u=l.enableDamping;l.enableDamping=!1,l.update(),a.position.set(r,Math.sin(c)*s,i+Math.cos(c)*s),l.target.set(r,0,i),l.update(),l.enableDamping=u,this.view.invalidate()}setMode(e){if(e===this.mode)return;let t=this.view.camera,n=this.view.controls;if(e===`walk`?(this.orbitSaved={pos:t.position.clone(),target:n.target.clone()},n.enabled=!1,t.fov=70):(n.enabled=!0,t.fov=45),t.updateProjectionMatrix(),this.mode=e,e===`orbit`){if(this.orbitSaved){let e=n.enableDamping;n.enableDamping=!1,n.update(),t.position.copy(this.orbitSaved.pos),n.target.copy(this.orbitSaved.target),n.update(),n.enableDamping=e}else this.resetOrbit()}this.applyTime(),this.view.invalidate()}setTime(e){this.time=e,this.applyTime(),this.view.invalidate()}applyTime(){let e=this.time,t=(e%1.6+1.6)%1.6/1.6;for(let e of this.pulses){let n=1+t*1.4;e.scale.set(n,n,1),e.material.opacity=.6*(1-t)}let n=this.mode===`walk`&&this.input?pe(this.input.walk,e):null;for(let e of this.markers){let t=!!n&&Math.hypot(n.pos.x-e.at.x,n.pos.y-e.at.y)<e.radius*2;for(let n of e.tall)n.visible=!t}let r=this.input?.walk.wall??48;for(let e of this.roomLabels){let t=n?Math.hypot(n.pos.x-e.at.x,n.pos.y-e.at.y)/r:99,i=Math.min(1,Math.max(0,(t-1.2)/1.8));e.sprite.material.opacity=i,e.sprite.visible=i>.01}if(!n)return;let i=this.view.camera,a=this.view.controls;i.position.set(n.pos.x,n.eye,n.pos.y),a.target.set(n.look.x,n.lookHeight,n.look.y),i.lookAt(a.target),i.updateMatrixWorld()}drawTo(e,t,n,r){this.setMode(`walk`),this.setTime(r),this.setResolution(t,n),this.view.capture(e,t,n)}labelInfo(){this.view.camera.updateMatrixWorld();let e=e=>{let t=e.getWorldPosition(new C).project(this.view.camera);return[t.x,t.y,t.z]};return{markers:this.markers.map(t=>({text:t.text,visible:t.label.visible,ndc:e(t.label)})),rooms:this.roomLabels.map(t=>({opacity:t.sprite.material.opacity,visible:t.sprite.visible,ndc:e(t.sprite)}))}}cameraState(){let e=this.view.camera.position,t=this.view.controls.target;return{mode:this.mode,pos:[e.x,e.y,e.z],target:[t.x,t.y,t.z],fov:this.view.camera.fov}}dispose(e=!1){this.dropContent(),this.floorTex?.tex.dispose(),this.view.dispose(),e&&this.view.renderer.forceContextLoss()}},X=null;function Re(){if(X!==null)return X;try{let e=document.createElement(`canvas`),t=e.getContext(`webgl2`)??e.getContext(`webgl`);X=!!t,t?.getExtension(`WEBGL_lose_context`)?.loseContext()}catch{X=!1}return X}var Z=new WeakMap;function ze(e,t){let n=Z.get(e);return n!==void 0&&(window.clearTimeout(n),Z.delete(e)),new Le(e,t)}function Be(e){let t=e.view.canvas,n=e.view.renderer.getContext();e.dispose(),Z.set(t,window.setTimeout(()=>{Z.delete(t),n.getExtension(`WEBGL_lose_context`)?.loseContext()},0))}var Q=()=>({start:k.walk.start,goal:k.walk.goal});async function $(e,t,n){await je(e.walk.rooms.map(e=>e.name).join(``),Q());let r=document.createElement(`canvas`);r.width=n.width,r.height=n.height;let i=new Le(r,n);return i.update({walk:e.walk,image:t,size:{width:t.width,height:t.height},bg:e.bg.color,text:Q()}),i.setMode(`walk`),i}async function Ve(e,t,n,r){if(!se(e.walk.path))throw Error(k.walk.needPath);if(!Re())throw Error(k.walk.webglFailed);let o=le(i(e,{width:t.width,height:t.height}).canvas),s;try{s=await $(e,t,o)}catch{throw Error(k.walk.webglFailed)}try{return await a(n,{size:o,fps:30,total:me(e.walk),matte:e.bg.color,draw:(e,t)=>s.drawTo(e,o.width,o.height,t),fileName:e=>ve(e,new Date)},k,r)}catch(e){throw e instanceof DOMException&&e.name===`AbortError`||e instanceof Error&&/[\u3400-\u9fff]/.test(e.message)?e:(console.warn(`3D 移動影片：`,e),Error(k.walk.exportFailed))}finally{s.dispose(!0)}}export{ze as createPreviewView,je as ensureWalkFonts,Ve as exportWalkVideo,$ as offscreenWalkView,Be as releasePreviewView,Ie as walkRegistry,Q as walkText,Re as webglAvailable};