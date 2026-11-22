// Approximate reference sizes based on actual panel-mount component families.
// Manufacturing fit still requires the exact vendor drawing and a test print.
export const JACK_VARIANTS = Object.freeze({
  box: Object.freeze({
    id: 'box', label: '박스잭 (PJ-612A — CAD 파일 별도 연결)',
    hole: 9.6, keepout: 19, bodyWidth: 17, bodyHeight: 17, bodyDepth: 20.8,
    source: 'https://wwwcmnip.3dcontentcentral.com/download-model.aspx?catalogid=171&id=3045911',
    note: 'PJ-612A 실제 3D CAD는 3D ContentCentral에 등록됨(로그인 다운로드). 도면 확인 전에는 미리보기 형상을 표시하지 않습니다.',
  }),
  turtle: Object.freeze({
    id: 'turtle', label: '거북잭 (RPJ-303 6핀 — CAD 파일 미확보)',
    hole: 11.2, keepout: 20, bodyWidth: 15.8, bodyHeight: 16, bodyDepth: 21.4,
    source: 'https://www.elecloud.co.kr/product/list.html?cate_no=27',
    note: 'RPJ-303 / SJ-6306D-6P는 실물 확인했으나 동일한 CAD 원본은 확보하지 못했습니다. 정확한 STEP을 연결하기 전까지 형상은 숨깁니다.',
  }),
});
export function jackVariant(part) {
  return JACK_VARIANTS[part?.jackType] || JACK_VARIANTS.box;
}
export function setJackVariant(part, kind) {
  const spec = JACK_VARIANTS[kind] || JACK_VARIANTS.box;
  return { ...part, jackType: spec.id, hole: spec.hole, keepout: spec.keepout };
}
