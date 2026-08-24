/**
 * 여기 있는 규칙은 **취향이 아니라 조용히 나가는 실패**만 잡는다.
 *
 * 이 프로젝트에서 실제로 두 번 나갔던 것이 그것이다.
 *
 *   import 를 빠뜨린 컴포넌트   빌드도 테스트도 초록불, 누르는 순간 하얀 화면
 *   없는 상태 변수를 참조        (`templates` 인데 실제 이름은 `tables`)
 *
 * esbuild 는 JSX 안의 식별자를 해석하지 않아서 둘 다 통과시킨다. `no-undef` 가
 * 그 자리를 막는다.
 *
 * 서식(따옴표·세미콜론·들여쓰기)은 건드리지 않는다. 그런 규칙을 켜면 경고가
 * 수백 줄 쏟아지고, 그 더미에 섞인 **진짜 오류 한 줄이 안 보이게 된다.**
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: '18.2' } },
  plugins: ['react', 'react-hooks'],
  extends: ['eslint:recommended'],
  rules: {
    // --- 켜는 것: 없는 이름을 부르는 코드 ---
    'no-undef': 'error',
    // no-undef 는 JSX 태그 이름을 보지 않는다. import 를 빠뜨린 컴포넌트를
    // 잡는 것은 **이 규칙**이다 — 실제로 그렇게 한 번 나갔다.
    'react/jsx-no-undef': 'error',

    // JSX 안에서만 쓰이는 컴포넌트를 "안 쓴다" 고 오해하지 않게 한다.
    // 이것이 없으면 no-unused-vars 가 import 를 지우라고 말한다.
    'react/jsx-uses-vars': 'error',
    'react/jsx-uses-react': 'error',

    // 쓰지 않는 이름은 대개 지우다 만 흔적이거나 오타다. 다만 catch 의 오류
    // 변수와 앞자리 인자는 흔히 일부러 남기므로 봐준다.
    'no-unused-vars': ['warn', {
      args: 'after-used',
      caughtErrors: 'none',
      ignoreRestSiblings: true,
    }],

    // 훅을 조건문·반복문 안에서 부르면 렌더마다 순서가 달라져 상태가 서로
    // 뒤바뀐다. 오류 없이 값만 어긋나는 종류라 눈으로는 찾기 어렵다.
    'react-hooks/rules-of-hooks': 'error',
    // exhaustive-deps 는 켜지 않는다. 일부러 비워 둔 의존성 배열이 많고,
    // 그 경고가 쌓이면 진짜 오류가 묻힌다.

    // --- 끄는 것: 이 코드베이스에서 사실이 아닌 규칙 ---
    // React 17+ 의 자동 런타임이라 import React 가 없어도 JSX 가 돈다.
    'react/react-in-jsx-scope': 'off',
    // 빈 catch 는 "실패해도 그냥 넘어간다" 를 일부러 적은 자리다.
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.test.jsx'],
      env: { node: true },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.config.js'],
}
