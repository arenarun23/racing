// 코스 정의. 새 코스는 이 목록에 같은 모양으로 추가한다.
// points: [x, 높이, z] 제어점 (단위 m). 시작선은 첫 제어점 근처.

export const COURSES = [
  {
    id: 'moon-base',
    group: '우주',
    name: '달 기지 서킷',
    place: '고요의 바다',
    laps: 3,
    width: 14,
    seed: 1969,
    gravity: 1.62, // 달 표면 중력 (m/s²) — 주행 물리에서 사용
    // 레골리스 먼지가 쌓인 구간 (진행률 범위). 바퀴 모드에 따라 미끄러지는 정도가 다르다
    dustZones: [[0.29, 0.37], [0.69, 0.77]],
    quizAt: [0.44, 0.86], // 바퀴마다 퀴즈가 나오는 지점
    pitZone: [0.94, 0.985], // 피트 예약 후 이 구간에 들어오면 정비한다
    points: [
      [0, 0, 0], [70, 0, 0], [135, 1, 8], [178, 4, 42], [184, 8, 92],
      [158, 11, 126], [112, 9, 128], [78, 5, 148], [82, 2, 196], [126, 0, 218],
      [168, 1, 252], [156, 5, 296], [104, 10, 314], [44, 14, 300], [-6, 10, 262],
      [-48, 5, 214], [-66, 1, 158], [-92, 0, 104], [-86, 0, 46], [-52, 0, 8],
    ],
    // 기지 시설 배치: at = 코스 진행률(0~1), side = 1 오른쪽 / -1 왼쪽, gap = 도로 끝에서 떨어진 거리
    landmarks: [
      { type: 'base', at: 0.02, side: -1, gap: 26 },
      { type: 'pit', at: 0.985, side: 1, gap: 9 },
      { type: 'solar', at: 0.13, side: 1, gap: 18 },
      { type: 'dish', at: 0.24, side: -1, gap: 30 },
      { type: 'lander', at: 0.4, side: 1, gap: 34 },
      { type: 'rover', at: 0.47, side: -1, gap: 14 },
      { type: 'solar', at: 0.56, side: -1, gap: 20 },
      { type: 'tower', at: 0.66, side: 1, gap: 16 },
      { type: 'dish', at: 0.78, side: 1, gap: 36 },
      { type: 'habitat', at: 0.86, side: -1, gap: 30 },
    ],
    theme: {
      kind: 'moon',
      summary: '회색 레골리스 평원과 크레이터. 하늘에 지구가 떠 있어요.',
      sky: 0x02040a, stars: true, planet: 'earth', fog: null,
      sun: 0xfff6e8, sunPower: 3.4, fill: [0x8fb4ff, 0x2b2620, 0.55],
      rock: 0x8d8a84, dust: [176, 168, 152],
      zone: '먼지 구간', zoneWhat: '레골리스 먼지', softTire: '먼지용',
      storm: {
        label: '후반 태양풍',
        toast: '태양풍이 강해졌어요! 전기를 띤 먼지가 떠올라 도로를 덮어요',
        chip: '태양풍 · 도로가 먼지로 덮였어요',
        hint: '2바퀴째부터 태양풍으로 도로가 먼지에 덮여요.',
      },
    },
  },
  {
    id: 'mars-canyon',
    group: '우주',
    name: '화성 협곡 서킷',
    place: '마리너스 협곡 가장자리',
    laps: 3,
    width: 14,
    seed: 2021,
    gravity: 3.71, // 화성 표면 중력: 지구의 약 3분의 1
    dustZones: [[0.2, 0.28], [0.52, 0.6], [0.8, 0.86]],
    quizAt: [0.4, 0.72],
    pitZone: [0.94, 0.985],
    points: [
      [0, 0, 0], [80, 0, -4], [150, 2, 10], [200, 6, 50], [210, 10, 110],
      [180, 14, 160], [120, 16, 170], [70, 12, 200], [60, 8, 260], [100, 4, 300],
      [170, 2, 320], [230, 6, 300], [260, 10, 250], [300, 12, 200], [310, 8, 140],
      [290, 4, 80], [260, 2, 20], [230, 0, -40], [160, 0, -80], [80, 0, -80],
      [10, 0, -60], [-30, 0, -30],
    ],
    landmarks: [
      { type: 'base', at: 0.05, side: 1, gap: 34 },
      { type: 'pit', at: 0.985, side: 1, gap: 9 },
      { type: 'rocket', at: 0.1, side: -1, gap: 40 },
      { type: 'rover', at: 0.24, side: 1, gap: 16 },
      { type: 'solar', at: 0.33, side: -1, gap: 18 },
      { type: 'habitat', at: 0.46, side: 1, gap: 28 },
      { type: 'dish', at: 0.62, side: -1, gap: 26 },
      { type: 'tower', at: 0.75, side: 1, gap: 16 },
      { type: 'lander', at: 0.88, side: -1, gap: 30 },
    ],
    theme: {
      kind: 'mars',
      summary: '붉은 모래와 언덕. 먼지 때문에 낮 하늘이 누르스름해요.',
      sky: 0xc9976c, stars: false, planet: 'mars-moons', fog: { near: 260, far: 1500 },
      sun: 0xffe7c4, sunPower: 2.8, fill: [0xf0c39a, 0x4a2414, 0.7],
      rock: 0x7a3f26, dust: [196, 120, 74],
      zone: '모래 구간', zoneWhat: '붉은 모래', softTire: '모래용',
      storm: {
        label: '후반 모래 폭풍',
        toast: '모래 폭풍이 불어와요! 붉은 모래가 도로를 덮고 앞이 흐려져요',
        chip: '모래 폭풍 · 도로가 모래로 덮였어요',
        hint: '2바퀴째부터 모래 폭풍으로 도로가 모래에 덮이고 앞이 흐려져요.',
      },
    },
  },
  {
    id: 'europa-ice',
    group: '우주',
    name: '유로파 얼음 서킷',
    place: '목성의 위성 유로파',
    laps: 3,
    width: 14,
    seed: 1610,
    gravity: 1.31, // 유로파 표면 중력: 달보다도 약하다
    dustZones: [[0.16, 0.24], [0.47, 0.55], [0.74, 0.8]],
    quizAt: [0.36, 0.68],
    pitZone: [0.95, 0.988],
    points: [
      [0, 0, 0], [76, 0, 0], [144, 1, 17], [187, 3, 60], [196, 4, 119],
      [170, 3, 170], [119, 2, 187], [76, 2, 162], [60, 1, 119], [26, 0, 94],
      [-17, 0, 119], [-34, 1, 170], [-8, 3, 221], [51, 4, 246], [119, 5, 255],
      [170, 4, 280], [170, 2, 332], [102, 1, 348], [17, 0, 332], [-60, 0, 280],
      [-94, 1, 204], [-102, 0, 128], [-85, 0, 60], [-51, 0, 13],
    ],
    landmarks: [
      { type: 'base', at: 0.015, side: -1, gap: 30 },
      { type: 'pit', at: 0.992, side: 1, gap: 11 },
      { type: 'spires', at: 0.09, side: 1, gap: 22 },
      { type: 'dish', at: 0.2, side: -1, gap: 30 },
      { type: 'tower', at: 0.3, side: 1, gap: 18 },
      { type: 'spires', at: 0.43, side: -1, gap: 26 },
      { type: 'habitat', at: 0.58, side: 1, gap: 28 },
      { type: 'rover', at: 0.66, side: -1, gap: 16 },
      { type: 'spires', at: 0.77, side: 1, gap: 24 },
      { type: 'lander', at: 0.9, side: -1, gap: 32 },
    ],
    theme: {
      kind: 'europa',
      summary: '갈색 줄무늬가 있는 얼음 평원. 하늘에 거대한 목성이 떠 있어요.',
      sky: 0x01030a, stars: true, planet: 'jupiter', fog: null,
      sun: 0xeef4ff, sunPower: 3.0, fill: [0xd8b088, 0x2a4058, 0.95],
      rock: 0xc4d6e2, dust: [226, 236, 244],
      zone: '서리 구간', zoneWhat: '얼음 서리', softTire: '서리용',
      storm: {
        label: '후반 얼음 분출',
        toast: '얼음 분출이 솟아올랐어요! 떨어진 서리가 도로를 덮어요',
        chip: '얼음 분출 · 도로가 서리로 덮였어요',
        hint: '2바퀴째부터 얼음 분출로 도로가 서리에 덮여요.',
      },
    },
  },
];

export function getCourse(id) {
  return COURSES.find((c) => c.id === id) || COURSES[0];
}
