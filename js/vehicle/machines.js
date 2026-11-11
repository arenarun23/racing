// 고를 수 있는 머신과 색. 모양만 다르고 성능은 모두 같다.
export const MACHINES = [
  { id: 'racer', name: '루나 레이서', desc: '낮고 날렵한 기본 머신' },
  { id: 'rover', name: '탐사 로버', desc: '바퀴 6개의 튼튼한 탐사차' },
  { id: 'shuttle', name: '미니 셔틀', desc: '날개 달린 우주왕복선' },
  { id: 'pod', name: '캡슐 포드', desc: '둥근 착륙 캡슐' },
];

export const BODY_COLORS = ['#f2a33a', '#ff6b5a', '#ffd84a', '#3ddc84', '#4f8cff', '#b58cff', '#e25b8a', '#e8e6df'];
export const HELMET_COLORS = ['#f4f1e8', '#ffd84a', '#ff6b5a', '#4f8cff', '#3ddc84', '#2a313b'];

export const hex = (c) => (typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16));
export const machineName = (id) => (MACHINES.find((m) => m.id === id) || MACHINES[0]).name;
