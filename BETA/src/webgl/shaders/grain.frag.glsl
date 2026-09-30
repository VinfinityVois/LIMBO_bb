uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 uv=vUv; float ca=0.0012;
  float r=texture2D(tDiffuse,uv+vec2(ca,0.0)).r;
  float g=texture2D(tDiffuse,uv).g;
  float b=texture2D(tDiffuse,uv-vec2(ca,0.0)).b;
  vec3 col=vec3(r,g,b);
  float grain=rand(uv+fract(uTime))*uStrength;
  col+=grain-uStrength*0.5;
  gl_FragColor=vec4(col,1.0);
}