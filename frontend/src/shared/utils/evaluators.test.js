/**
 * 수식 평가 — 숫자 · 문자열 · 배열.
 *
 * **이 검사가 필요한 이유**: 계산이 틀려도 그 자리에서는 아무 일도 일어나지
 * 않는다. 화면에 숫자가 하나 찍힐 뿐이라 사람이 눈으로 잡아야 하는데, 수식
 * 하나하나를 손으로 확인할 방법이 없다.
 *
 * 특히 아래 셋은 **틀려도 오류가 안 나고 값만 조용히 어긋난다**:
 *   - 값을 수식에 넘기는 방식 (문자열·배열이 섞일 때)
 *   - `^` 를 거듭제곱으로 바꾸는 치환 (문자열 안까지 건드리면 값이 달라진다)
 *   - 배열에 `+` 를 쓰는 실수 (자바스크립트는 오류 대신 이상한 문자열을 만든다)
 */

import { describe, expect, it } from 'vitest'

import { evaluateCondition, evaluateExpression, evaluateFormula } from './evaluators'

const S = {
  A: 5, B: 3, t: 12, name: 'SS400', grade: 'A', blank: '', numStr: '7',
  L: [1, 2, 3, 4],
  W: [10, 20, 30, 40],
  short: [1, 2],
  txt: ['a', 'b'],
}

/** 결과를 한 줄로 — 값이면 그대로, 오류면 `ERR(사유)`. */
const run = (expr, map = S) => {
  const r = evaluateFormula(expr, map)
  return r.error ? `ERR(${r.error})` : r.value
}

describe('숫자 계산', () => {
  it.each([
    ['A + B', 8],
    ['A * B - 2', 13],
    ['A ^ 2', 25],
    ['sqrt(A * 5)', 5],
    ['A / 2', 2.5],
    ['max(A, B)', 5],
    ['(A + B) * 2', 16],
  ])('%s → %s', (expr, want) => {
    expect(run(expr)).toBe(want)
  })

  it('숫자로 읽히는 문자열은 숫자로 다룬다', () => {
    // "7" + 5 가 "75" 가 되면 안 된다.
    expect(run('numStr + A')).toBe(12)
  })
})

describe('문자열 합치기', () => {
  it.each([
    ['"text" + "sample"', 'textsample'],
    ['"재료: " + name', '재료: SS400'],
    ['name + " 사용"', 'SS400 사용'],
    ['"두께 " + t + "mm"', '두께 12mm'],
    ['name + grade', 'SS400A'],
    ["'a' + 'b'", 'ab'],
  ])('%s → %s', (expr, want) => {
    expect(run(expr)).toBe(want)
  })

  it('문자열 안의 ^ 는 글자 그대로 남는다', () => {
    // 거듭제곱 치환이 문자열 안까지 들어가면 "a^b" 가 "a**b" 로 바뀐다.
    expect(run('"a^b"')).toBe('a^b')
    expect(run('"a^b" + (2 ^ 3)')).toBe('a^b8')
  })

  it('문자열 안의 기호와 한글', () => {
    expect(run('"1+2=3"')).toBe('1+2=3')
    expect(run('"항복강도 " + A')).toBe('항복강도 5')
  })
})

describe('배열 — 집계', () => {
  it.each([
    ['sum(L)', 10],
    ['average(L)', 2.5],
    ['max(L) - min(L)', 3],
    ['count(L)', 4],
    ['size(W)', 4],
    ['max(L, 99)', 99],
    ['sum(L) * 2 + A', 25],
  ])('%s → %s', (expr, want) => {
    expect(run(expr)).toBe(want)
  })
})

describe('배열 — 원소별 계산', () => {
  it('배열끼리', () => {
    expect(run('add(L, W)')).toEqual([11, 22, 33, 44])
    expect(run('sub(W, L)')).toEqual([9, 18, 27, 36])
  })

  it('배열과 스칼라', () => {
    expect(run('mul(L, 10)')).toEqual([10, 20, 30, 40])
    expect(run('div(100, W)')).toEqual([10, 5, 100 / 30, 2.5])
  })

  it('원소별 결과를 다시 집계할 수 있다', () => {
    expect(run('sum(mul(L, W))')).toBe(300)
    expect(run('max(add(L, W))')).toBe(44)
  })

  it('길이가 다르면 오류 — 짧은 쪽에 맞추면 조용히 틀린다', () => {
    expect(run('add(L, short)')).toBe('ERR(add: 길이가 다른 배열입니다 (4 vs 2))')
  })

  it('숫자가 아닌 원소는 오류', () => {
    expect(run('add(txt, 1)')).toBe('ERR(add: 숫자가 아닙니다 (a))')
  })

  it('0으로 나누면 오류', () => {
    expect(run('div(L, 0)')).toBe('ERR(div: 0으로 나눌 수 없습니다)')
  })
})

describe('배열 — 만들기와 꺼내기', () => {
  it('range', () => {
    expect(run('range(1, 5)')).toEqual([1, 2, 3, 4, 5])
    expect(run('range(0, 10, 5)')).toEqual([0, 5, 10])
    expect(run('range(3, 1, -1)')).toEqual([3, 2, 1])
    expect(run('range(1, 5, 0)')).toBe('ERR(range: 간격이 0일 수 없습니다)')
  })

  it('at 은 1번째부터 — 화면이 "열 1" 처럼 1부터 세기 때문', () => {
    expect(run('at(L, 1)')).toBe(1)
    expect(run('at(L, 4)')).toBe(4)
    expect(run('at(L, 9)')).toBe('ERR(at: 9 번째 원소가 없습니다 (1 ~ 4))')
    expect(run('at(A, 1)')).toBe('ERR(at: 첫 번째 인자가 배열이 아닙니다)')
  })

  it('range 를 바로 집계', () => {
    expect(run('sum(range(1, 100))')).toBe(5050)
  })
})

describe('수학 함수는 배열에도 원소별로 걸린다', () => {
  // 전에는 sin(배열) 이 ArrayValue.valueOf 에 걸려 "+ - * / 를 쓰지 마세요" 라는
  // **엉뚱한** 오류를 냈다. + 를 쓴 적도 없는 사람이 그 문구를 보고 add() 를
  // 찾다가, sin 에는 그런 짝이 없다는 것을 뒤늦게 알게 된다.
  it.each([
    ['sqrt(L)', [1, Math.SQRT2, Math.sqrt(3), 2]],
    ['abs(sub(0, L))', [1, 2, 3, 4]],
    ['radians(range(0, 180, 90))', [0, Math.PI / 2, Math.PI]],
  ])('%s', (expr, want) => {
    expect(run(expr)).toEqual(want)
  })

  it('sin·cos 는 각 원소에 걸린다', () => {
    const got = run('sin(radians(range(0, 90, 30)))')
    expect(got.map((v) => Number(v.toFixed(4)))).toEqual([0, 0.5, 0.8660, 1])
  })

  it('원소별 결과를 다시 집계할 수 있다 — sin+cos 의 최댓값은 √2', () => {
    const got = run('max(add(sin(radians(range(0, 360, 5))), cos(radians(range(0, 360, 5)))))')
    expect(got).toBeCloseTo(Math.SQRT2, 10)
  })

  it('두 자리 함수도 원소별 — pow·atan2', () => {
    expect(run('pow(L, 2)')).toEqual([1, 4, 9, 16])
    expect(run('pow(2, L)')).toEqual([2, 4, 8, 16])
    expect(run('atan2(L, L)')).toEqual([Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4])
  })

  it('스칼라는 그대로 스칼라다', () => {
    expect(run('sqrt(16)')).toBe(4)
    expect(run('sin(radians(30))')).toBeCloseTo(0.5, 10)
  })

  it('길이가 다른 배열은 두 자리 함수에서도 막힌다', () => {
    expect(run('pow(L, short)')).toBe('ERR(pow: 길이가 다른 배열입니다 (4 vs 2))')
  })

  it('숫자가 아닌 원소는 그 함수 이름으로 알려 준다', () => {
    expect(run('sqrt(txt)')).toBe('ERR(sqrt: 숫자가 아닙니다 (a))')
  })

  it('집계 함수는 여전히 값 하나로 줄인다', () => {
    expect(run('sum(L)')).toBe(10)
    expect(run('max(L)')).toBe(4)
  })
})

describe('배열에 + - * / 를 쓰면 막는다', () => {
  // 자바스크립트에서 [1,2] + [3,4] 는 오류가 아니라 "1,23,4" 라는 문자열이다.
  // 그대로 두면 틀린 값이 조용히 흘러간다.
  const GUARD = 'ERR(배열에는 + - * / 를 직접 쓸 수 없습니다. add(), sub(), mul(), div() 를 쓰세요.)'

  it.each(['L + W', 'L * 2', 'L - 1', '"값: " + L'])('%s', (expr) => {
    expect(run(expr)).toBe(GUARD)
  })
})

describe('오류', () => {
  it.each([
    ['blank + 1', 'ERR(blank 값 없음)'],
    ['zzz + 1', 'ERR(알 수 없는 이름: zzz)'],
    ['A / 0', 'ERR(계산 오류)'],
    ['', 'ERR(수식 없음)'],
    ['"abc + A', 'ERR(따옴표 짝이 맞지 않습니다)'],
    ['"a" - "b"', 'ERR(계산 오류)'],
  ])('%s → %s', (expr, want) => {
    expect(run(expr)).toBe(want)
  })

  it('빈 배열은 값 없음', () => {
    expect(run('sum(empty)', { ...S, empty: [] })).toBe('ERR(empty 값 없음 (빈 배열))')
  })
})

describe('실행 차단', () => {
  // 수식은 new Function 으로 돈다. 문자열 밖에 남는 글자를 허용 목록으로 좁혀
  // 자바스크립트 코드가 실행되지 않게 한다.
  it.each([
    ['L[0]', 'ERR(잘못된 수식)'],
    ['"abc"[0]', 'ERR(잘못된 수식)'],
    ['"a".constructor', 'ERR(알 수 없는 이름: constructor)'],
    ['"a" + {}', 'ERR(잘못된 수식)'],
    ['"a"; 1', 'ERR(잘못된 수식)'],
    ['(()=>1)()', 'ERR(잘못된 수식)'],
    ['globalThis', 'ERR(알 수 없는 이름: globalThis)'],
    ['`sqrt`', 'ERR(잘못된 수식)'],
    ['`${A}`', 'ERR(잘못된 수식)'],
  ])('%s → %s', (expr, want) => {
    expect(run(expr)).toBe(want)
  })

  it('문자열 안의 코드처럼 보이는 글자는 값일 뿐이다', () => {
    expect(run('"a\\"; process.exit(1); //"')).toBe('a"; process.exit(1); //')
  })
})

describe('자바스크립트 예약어를 기호로 써도 동작한다', () => {
  // 값을 소스에 끼워 넣지 않고 안전한 이름으로 바꿔 인자로 넘기기 때문이다.
  it.each([
    ['if + 1', { if: 5 }, 6],
    ['class * 2', { class: 5 }, 10],
    ['sqrt(new)', { new: 9 }, 3],
  ])('%s → %s', (expr, map, want) => {
    expect(run(expr, map)).toBe(want)
  })
})

describe('다른 평가 경로', () => {
  it('기호 하나만 쓰면 값을 그대로 준다', () => {
    expect(evaluateExpression('L', S).value).toEqual([1, 2, 3, 4])
    expect(evaluateExpression('name', S).value).toBe('SS400')
  })

  it('조회 키에서도 문자열을 합칠 수 있다', () => {
    expect(evaluateExpression('"SS" + "400"', S).value).toBe('SS400')
  })

  it('조건식', () => {
    expect(evaluateCondition('name == "SS400"', S).value).toBe(true)
    expect(evaluateCondition('A > 3 && B < 5', S).value).toBe(true)
    expect(evaluateCondition('sum(L) > 5', S).value).toBe(true)
    expect(evaluateCondition('A > 100', S).value).toBe(false)
  })
})
