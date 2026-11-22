// Approximate reference sizes based on actual panel-mount component families.
// Manufacturing fit still requires the exact vendor drawing and a test print.
export const JACK_VARIANTS = Object.freeze({
  box: Object.freeze({
    id: 'box', label: '박스잭 (Switchcraft 111X형)',
    hole: 9.6, keepout: 19, bodyWidth: 17, bodyHeight: 17, bodyDepth: 20.8,
    source: 'https://www.digikey.kr/ko/products/detail/switchcraft-inc/111X/1288958',
    note: '3/8-32 부싱 Ø9.52mm, 밀폐형 솔더 러그; 9.6mm 가공 여유는 참고값',
  }),
  turtle: Object.freeze({
    id: 'turtle', label: '거북잭 (RPJ-303 6핀형)',
    hole: 11.2, keepout: 20, bodyWidth: 15.8, bodyHeight: 16, bodyDepth: 21.4,
    source: 'https://www.hireyele.com/product/Audio-Stereo-Jack-Socket-6-Pin-Female-PCB-Mount-Connector.html',
    note: '6핀 스테레오/스위치형 개방 구조; 실제 RPJ-303 판매품의 패널 홀 실측 권장',
  }),
});
export function jackVariant(part) {
  return JACK_VARIANTS[part?.jackType] || JACK_VARIANTS.box;
}
export function setJackVariant(part, kind) {
  const spec = JACK_VARIANTS[kind] || JACK_VARIANTS.box;
  return { ...part, jackType: spec.id, hole: spec.hole, keepout: spec.keepout };
}
