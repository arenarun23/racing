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
    gravity: 1.62, // 달 표면 중력 (m/s²) — 2단계 주행 물리에서 사용
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
  },
];

export function getCourse(id) {
  return COURSES.find((c) => c.id === id) || COURSES[0];
}
