// Each part selects a real external CAD model or remains unmodelled.
// Original drill templates are kept separate from third-party CAD substitutes.
export const JACK_VARIANTS = Object.freeze({
  box: Object.freeze({
    id: 'box', label: '박스잭 · PJ-612A (로그인 후 CAD 직접 업로드)',
    hole: 9.6, keepout: 19,
    source: 'https://wwwcmnip.3dcontentcentral.com/download-model.aspx?catalogid=171&id=3045911',
    note: 'PJ-612A CAD는 3D ContentCentral에서 로그인 다운로드 후 직접 업로드합니다. 다른 제품으로 자동 대체하지 않습니다.',
  }),
  'box-amphenol': Object.freeze({
    id: 'box-amphenol', label: '박스잭 · Amphenol ACJS-MHOM (실제 STEP)',
    hole: 10, keepout: 20,
    source: 'https://github.com/whbeers/noise_floor/blob/master/hardware/noise_floor.pretty/ACJS-MHOM.stp',
    note: '밀폐형 6.35mm 스테레오 Amphenol ACJS-MHOM. PJ-612A와 다른 제품이며 홀 Ø10mm는 시제품 확인용 참고값입니다.',
  }),
  turtle: Object.freeze({
    id: 'turtle', label: '거북잭 · RPJ-303 6핀 (CAD 직접 연결)',
    hole: 11.2, keepout: 20,
    source: 'https://www.elecloud.co.kr/product/list.html?cate_no=27',
    note: 'RPJ-303 실물과 동일한 STEP은 아직 확보하지 못했습니다. 다른 제품을 RPJ-303이라고 표시하지 않습니다.',
  }),
  'turtle-pj609ba': Object.freeze({
    id: 'turtle-pj609ba', label: '거북잭 · HOOYA PJ-609BA 6핀 (실제 VRML)',
    hole: 11.2, keepout: 20,
    source: 'https://github.com/dvhx/perfect-pedal-layout/blob/master/kicad/footprints/wrl/jack_6.35mm_female.wrl',
    note: '실제 이펙터 PCB의 HOOYA PJ-609BA 6핀 6.35mm 오디오 잭 원본. RPJ-303과 다른 모델입니다. 홀 Ø는 실물 도면으로 확인하세요.',
  }),
});
export function jackVariant(part) {
  return JACK_VARIANTS[part?.jackType] || JACK_VARIANTS.box;
}
export function setJackVariant(part, kind) {
  const spec = JACK_VARIANTS[kind] || JACK_VARIANTS.box;
  return { ...part, jackType: spec.id, hole: spec.hole, keepout: spec.keepout };
}
