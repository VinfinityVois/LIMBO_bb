uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uRoughness;
uniform float uScroll;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

void main(){
  vec3 N=normalize(vNormal); vec3 V=normalize(vViewDir);
  float fresnel=pow(1.0-max(dot(V,N),0.0),3.0);
  float ir=sin(dot(N,V)*8.0+uTime*0.45)*0.5+0.5;
  vec3 irCol=mix(uColorA,uColorB,ir);
  vec3 base=mix(vec3(0.02,0.04,0.08),irCol,fresnel*0.88);
  base+=irCol*fresnel*(1.0-uRoughness)*0.55;
  base+=uColorA*0.035*sin(uScroll*6.28318+uTime);
  float alpha=mix(0.5,0.92,fresnel);
  gl_FragColor=vec4(base,alpha);
}