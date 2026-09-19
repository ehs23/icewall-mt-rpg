import type { EventDefinition, Stats } from './types.js';
import { rebalanceMonsters } from './monster-balance.js';
import { tileKey } from './maze.js';
// Example content only. Operators can replace each prompt and answer in the tile editor.
const quizBank: [
    string,
    string[],
    number,
    string,
    string
][] = [
    ['웹 주소에서 암호화된 연결을 나타내는 것은 무엇입니까?', ['HTTP', 'HTTPS', 'FTP'], 1, '암호화된 웹 연결에 사용하는 프로토콜을 영문으로 입력해 주세요.', 'HTTPS'],
    ['1바이트는 몇 비트입니까?', ['4비트', '8비트', '16비트'], 1, '1바이트가 몇 비트인지 숫자로 입력해 주세요.', '8'],
    ['파일 내용을 읽기만 하는 권한은 무엇입니까?', ['읽기', '쓰기', '실행'], 0, '중앙 처리 장치의 영문 약어를 입력해 주세요.', 'CPU'],
    ['이진수 10을 십진수로 바꾸면 무엇입니까?', ['1', '2', '10'], 1, '이진수 11을 십진수로 바꾼 숫자를 입력해 주세요.', '3'],
    ['가장 안전한 비밀번호 관리 방법은 무엇입니까?', ['모든 사이트에서 재사용', '메모를 공개 게시', '사이트마다 다른 비밀번호 사용'], 2, '도메인 이름을 IP 주소로 찾는 시스템의 영문 약어를 입력해 주세요.', 'DNS'],
    ['프로그램 실행 순서를 나타내는 것은 무엇입니까?', ['알고리즘', '모니터', '키보드'], 0, '웹 문서의 구조를 작성하는 언어의 영문 약어를 입력해 주세요.', 'HTML'],
    ['백업의 주된 목적은 무엇입니까?', ['데이터 복구', '화면 밝기 조절', '인터넷 속도 증가'], 0, '웹 문서의 스타일을 지정하는 언어의 영문 약어를 입력해 주세요.', 'CSS'],
    ['버전 관리 도구는 무엇입니까?', ['Git', 'PNG', 'USB'], 0, '버전 관리 도구 Git의 이름을 입력해 주세요.', 'Git'],
    ['피싱 메시지를 받았을 때 적절한 행동은 무엇입니까?', ['즉시 비밀번호 입력', '공식 경로로 사실 확인', '첨부 파일 실행'], 1, '2의 5제곱을 숫자로 입력해 주세요.', '32'],
    ['컴퓨터의 휘발성 메모리는 무엇입니까?', ['RAM', 'SSD', 'DVD'], 0, '컴퓨터의 휘발성 메모리의 영문 약어를 입력해 주세요.', 'RAM'],
    ['공개하면 안 되는 정보는 무엇입니까?', ['공식 홈페이지 주소', '일회용 인증번호', '공개 행사 일정'], 1, '이진수 100을 십진수로 바꾼 숫자를 입력해 주세요.', '4'],
    ['프로그램의 오류를 찾아 수정하는 작업은 무엇입니까?', ['디버깅', '압축', '인쇄'], 0, '웹에서 찾을 수 없는 페이지를 나타내는 상태 코드를 숫자로 입력해 주세요.', '404'],
];
const placements: [
    number,
    number,
    'choice' | 'text' | 'monster',
    boolean
][] = [
    [3, 3, 'choice', false], [7, 1, 'text', false], [12, 3, 'choice', false], [15, 6, 'text', false], [9, 7, 'choice', false], [7, 7, 'monster', false],
    [3, 9, 'choice', false], [6, 11, 'text', false], [1, 12, 'choice', false], [5, 15, 'monster', false],
    [1, 17, 'text', false], [5, 19, 'choice', false], [7, 14, 'choice', false], [10, 15, 'text', false], [12, 17, 'monster', false],
    [11, 19, 'choice', false], [15, 17, 'text', false], [18, 13, 'choice', false], [18, 17, 'monster', false],
    [11, 5, 'choice', true], [5, 5, 'text', true], [17, 5, 'choice', true], [17, 1, 'text', true], [11, 1, 'choice', true], [15, 9, 'monster', true],
];
const monsters: Stats[] = [
    { hp: 26, attack: 6, defense: 3, crit: 0, critDamage: 100 },
    { hp: 55, attack: 10, defense: 7, crit: 5, critDamage: 125 },
    { hp: 85, attack: 15, defense: 10, crit: 8, critDamage: 130 },
    { hp: 115, attack: 18, defense: 14, crit: 10, critDamage: 140 },
    { hp: 65, attack: 11, defense: 8, crit: 5, critDamage: 120 },
];
export function initialEvents() {
    const result = new Map<string, EventDefinition>();
    let q = 0, m = 0;
    for (const [x, y, kind, side] of placements) {
        const id = tileKey(x, y);
        let e: EventDefinition;
        if (kind === 'monster') {
            e = { id, x, y, kind, prompt: side ? '우회로 파수꾼' : `미로 파수꾼 ${m + 1}`, stats: monsters[m], xp: side ? 250 : [150, 200, 250, 300][m], revision: 1 };
            m++;
        }
        else {
            const sample = quizBank[q % quizBank.length];
            e = { id, x, y, kind, prompt: kind === 'choice' ? sample[0] : sample[3], choices: kind === 'choice' ? sample[1] : undefined, answer: kind === 'choice' ? String(sample[2]) : sample[4], xp: 120, revision: 1 };
            q++;
        }
        result.set(id, e);
    }
    result.set('19,19', { id: '19,19', x: 19, y: 19, kind: 'monster', prompt: '출구의 수호자', boss: true, stats: { hp: 160, attack: 18, defense: 12, crit: 10, critDamage: 150 }, xp: 300, revision: 1 });
    return rebalanceMonsters(result);
}
