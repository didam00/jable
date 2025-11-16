<div align="center">

![logo](./title.png)

# 📊 JSON Table Editor

**JSON 데이터를 엑셀처럼 편리하게 편집할 수 있는 웹 애플리케이션**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Svelte](https://img.shields.io/badge/Svelte-4.0-orange.svg)](https://svelte.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.0-purple.svg)](https://vitejs.dev/)

🌐 **[라이브 데모](https://didam00.github.io/jable/)** | 📖 **[문서](#-사용-방법)** | 🚀 **[시작하기](#-개발)**

</div>

---

## ✨ 주요 기능

### 📥 데이터 Import/Export
- ✨ **JSON/CSV 파일 업로드** - 드래그 앤 드롭 지원
- 📋 **클립보드 붙여넣기** - JSON/CSV 자동 감지 및 변환
- 💾 **다양한 형식 Export** - JSON, CSV 형식으로 저장
- 🔄 **자동 저장** - 로컬스토리지에 자동 저장
- 🔀 **데이터 병합** - 여러 데이터셋 통합

### 🎨 뷰 및 표시
- ⚡ **대용량 데이터 처리** - 10,000건 이상의 데이터 지원
- 🚀 **가상 스크롤링** - 성능 최적화로 부드러운 스크롤
- 📄 **Raw/Pretty JSON 뷰** - 전환 가능한 뷰 모드
- 📊 **데이터 통계** - 행/열 수, 데이터 타입 정보 표시
- 🏗️ **2층 헤더 구조** - Nested JSON 완벽 지원
- 📌 **인덱스 열 고정** - 가로 스크롤 시에도 항상 보임

### ✏️ 편집 기능
- 📝 **개별 셀 편집** - 직접 편집 가능
- 🔍 **열별 필터링 및 정렬** - 강력한 데이터 탐색
- 🔎 **전체 데이터 검색** - 정규식 지원 고급 검색
- ⏪ **Undo/Redo** - 최대 50단계 실행 취소/다시 실행
- 🧮 **열 변환 함수** - JavaScript로 열 데이터 일괄 변환

### 🎯 테이블 조작
- ➕ **열 추가/삭제** - 컨텍스트 메뉴로 간편하게
- ➕ **행 추가/삭제** - 컨텍스트 메뉴로 간편하게
- 📏 **열 너비 조정** - 드래그로 직관적 조정
- 🔢 **열 정렬** - 헤더 클릭으로 오름차순/내림차순 정렬

### 🎛️ 필터 기능
- 🎚️ **열별 필터** - 각 열에 독립적인 필터 적용
- 📋 **고유 값 목록** - 자동 추출된 고유 값 (최대 20개)
- ⚡ **실시간 필터링** - 입력 즉시 결과 반영
- 📐 **자동 크기 조정** - 열 너비에 맞춰 필터 창 표시

---

## ⌨️ 키보드 단축키

| 단축키 | 기능 |
|--------|------|
| `Ctrl+Z` | 실행 취소 (Undo) |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 다시 실행 (Redo) |
| `Ctrl+E` | 테이블/Raw 뷰 전환 |
| `Ctrl+G` / `Ctrl+F` | 검색창 포커스 |
| `Ctrl+S` | 저장 (Tauri 환경) |
| `Ctrl+Enter` | 검색 실행 |
| `Esc` | 검색창 닫기 |

---

## 📖 사용 방법

### 🚀 기본 사용법

1. **데이터 로드**
   - 📁 파일을 드래그 앤 드롭하거나
   - 📂 툴바의 "파일 가져오기" 버튼 클릭 또는
   - 📋 클립보드에서 JSON/CSV 데이터 붙여넣기 (`Ctrl+V`)

2. **데이터 편집**
   - ✏️ 셀을 클릭하여 직접 편집
   - ⏎ `Enter` 키로 다음 셀 이동

3. **데이터 저장**
   - 💾 툴바의 "저장" 버튼 (`Ctrl+S`)
   - 📥 "다른 이름으로 저장"으로 다양한 형식 저장
   - 🔄 자동으로 로컬스토리지에 저장됨

### ➕ 열 추가/삭제

**열 추가:**
1. 열 헤더에서 **오른쪽 클릭**
2. "왼쪽에 열 추가" 또는 "오른쪽에 열 추가" 선택

**열 삭제:**
1. 삭제할 열 헤더에서 **오른쪽 클릭**
2. "열 삭제" 선택

### ➕ 행 추가/삭제

**행 추가:**
1. 행 번호 또는 셀에서 **오른쪽 클릭**
2. "위에 행 추가" 또는 "아래에 행 추가" 선택

**행 삭제:**
1. 삭제할 행 번호 또는 셀에서 **오른쪽 클릭**
2. "행 삭제" 선택

### 🎛️ 필터 사용

1. 열 헤더의 **필터 아이콘** 클릭
2. 필터 입력창에 값 입력 (실시간 필터링)
3. 또는 고유 값 목록에서 값 클릭하여 선택
4. ❌ 버튼으로 필터 닫기

---

## 🔍 고급 검색 기능

검색창에서 특수 문법을 사용하여 다양한 방식으로 데이터를 검색하고 필터링할 수 있습니다.

### 1️⃣ 기본 검색
- 일반 텍스트를 입력하면 모든 열에서 검색됩니다
- 🔍 정규식 버튼을 활성화하면 정규식 검색이 가능합니다

### 2️⃣ 특정 열에서 검색
```javascript
column=값
```
- 특정 열에서만 검색합니다
- 예: `name=John` - name 열에서 "John" 검색

### 3️⃣ 숫자 범위 검색
```javascript
column>number
column>=number
column<number
column<=number
column=number
column!=number
column>number&column<number  // 복합 조건
```
- 숫자 값을 비교하여 검색합니다
- `&`를 사용하여 여러 조건을 조합할 수 있습니다
- 예: `price>100` - price 열에서 100보다 큰 값 검색
- 예: `age>18&age<65` - age 열에서 18보다 크고 65보다 작은 값 검색

### 4️⃣ 행 필터링
```javascript
:number          // 특정 행
:number1-number2 // 행 범위
```
- 특정 행 또는 행 범위를 필터링합니다
- 행 번호는 1부터 시작합니다
- 예: `:5` - 5번째 행만 표시
- 예: `:10-20` - 10번째부터 20번째 행까지 표시

### 5️⃣ 셀 필터링
```javascript
:a:b           // 특정 행의 특정 열
:a:b-c         // 특정 행의 열 범위
:a:b,c,d       // 특정 행의 여러 열
```
- 특정 행의 특정 열을 필터링합니다
- `a`: 행 번호 (1부터 시작)
- `b`: 열 번호 또는 열 이름
- 예: `:5:name` - 5번째 행의 name 열
- 예: `:5:1-3` - 5번째 행의 1~3번째 열
- 예: `:5:name,age,email` - 5번째 행의 name, age, email 열

### 6️⃣ 열 필터링
```javascript
::b  // 특정 열만 표시
```
- 특정 열만 표시합니다
- `b`: 열 번호 또는 열 이름
- 예: `::name` - name 열만 표시
- 예: `::2` - 2번째 열만 표시

### 💡 검색 문법 예제

```javascript
// 기본 검색
hello

// 특정 열에서 검색
email=gmail.com

// 숫자 비교
price>100
score>=80
age<65
amount!=0

// 복합 조건
price>10&price<100

// 행 필터링
:5
:10-20

// 셀 필터링
:5:name
:10:1-5
:3:name,age,email

// 열 필터링
::name
::2
```

---

## 📏 열 너비 조정

- 열 헤더의 **오른쪽 가장자리**를 마우스로 드래그
- 드래그 중에는 가이드라인이 표시됨
- 마우스를 놓으면 너비가 적용됨

---

## 🧮 열 변환 함수 사용법

열 헤더의 **`functions`** 아이콘을 클릭하여 열 변환 함수를 적용할 수 있습니다.

### 🔄 변환 모드

#### 1️⃣ 단일 값 변환 모드
각 셀을 개별적으로 변환합니다. `value` 변수를 사용합니다.

**특징:**
- 같은 행의 다른 열 값은 `$column-name` 형식으로 참조 가능
- 한 줄이면 `return` 생략 가능
- 여러 줄이거나 제어문이 있으면 `return` 필요

**예제:**
```javascript
// 한 줄: return 생략 가능
value * 2

// 다른 열 값 참조 ($column-name 형식)
value + $price * 0.1

// 여러 줄: return 필요
if (typeof value === "number") {
  return value * 2;
} else {
  return value;
}

// 같은 행의 여러 열 값 사용
$firstName + " " + $lastName

// 조건부 변환
value > 100 ? value * 0.9 : value
```

#### 2️⃣ 배열 변환 모드
전체 열을 배열로 변환합니다. `list` 변수를 사용합니다.

**단일 열 선택 시:**
- `list`: 선택된 열의 모든 값 배열 (`타입[]`)
- 리턴값: 배열 (`타입[]`)

```javascript
// 모든 값을 2배로
list.map(val => val * 2)

// 0보다 큰 값만 필터링
list.filter(val => val > 0)

// 값 정렬
list.sort((a, b) => a - b)
```

**여러 열 선택 시:**
- `list`: 선택된 열들의 객체 배열 (`{col1: 타입, col2: 타입}[]`)
- 리턴값: 같은 형식의 객체 배열 (`{col1: 타입, col2: 타입}[]`)

```javascript
// 두 열의 값을 교환
list.map((val) => {
  return {col1: val.col2, col2: val.col1};
})

// 여러 열 조작
list.map((val) => {
  return {
    col1: val.col1.toUpperCase(),
    col2: val.col2 * 2,
    col3: val.col1 + val.col2
  };
})

// 조건부 변환
list.map((val) => {
  if (val.price > 100) {
    return { ...val, discount: val.price * 0.1 };
  }
  return val;
})
```

### ✅ 사용 가능한 문법

- **제어문**: `if`, `while`, `for` 문 사용 가능
- **함수**: JavaScript 내장 함수 및 메서드 사용 가능
- **자동 return**: 한 줄 코드는 `return` 생략 가능
- **열 참조**: 단일 값 변환 모드에서 `$column-name` 형식으로 같은 행의 다른 열 값 참조

### ⚠️ 제한 사항

다음 키워드/함수는 보안상 사용할 수 없습니다:
- `import`, `require`, `fetch`, `eval`, `Function`
- `window`, `document`, `localStorage`, `sessionStorage`
- `setTimeout`, `setInterval`
- `constructor`, `__proto__`, `prototype`

### 🔍 리턴값 검증

배열 변환 모드에서 리턴값 형식이 맞지 않으면 자동으로 오류 메시지가 표시됩니다:
- 단일 열: `타입[]` 형식으로 주세요
- 여러 열: `{col1: 타입, col2: 타입}[]` 형식으로 주세요

### 👁️ 미리보기

함수를 작성하면 첫 번째 행(또는 처음 5개 행)에 대해 미리보기 결과를 확인할 수 있습니다:
- ✅ 성공: 변환된 결과 미리보기
- ❌ 오류: 오류 메시지 표시

---

## 🖥️ 데스크톱 앱 (Tauri)

이 프로젝트는 웹 버전과 함께 **Tauri**를 사용한 데스크톱 앱도 지원합니다.

### 🚀 데스크톱 앱 실행

```bash
# 개발 모드 실행
pnpm tauri:dev

# 프로덕션 빌드
pnpm tauri:build
```

### ✨ 데스크톱 앱 특징

- 💾 **네이티브 파일 시스템** - 로컬 파일 직접 열기/저장
- ⌨️ **전역 단축키** - `Ctrl+S`로 빠른 저장
- 🪟 **네이티브 UI** - 운영체제 기본 스타일

---

## 🛠️ 기술 스택

<div align="center">

| 카테고리 | 기술 |
|---------|------|
| **프레임워크** | [Svelte 4](https://svelte.dev/) |
| **언어** | [TypeScript](https://www.typescriptlang.org/) |
| **빌드 도구** | [Vite](https://vitejs.dev/) |
| **패키지 매니저** | [pnpm](https://pnpm.io/) |
| **CSV 파싱** | [PapaParse](https://www.papaparse.com/) |
| **데스크톱** | [Tauri 2.0](https://tauri.app/) |

</div>

---

## 🚀 개발

### 📋 필수 요구사항

- Node.js 20+
- pnpm 8+

### 🔧 설치 및 실행

```bash
# 의존성 설치
pnpm install

# 개발 서버 실행
pnpm dev

# 빌드
pnpm build

# 빌드 결과 미리보기
pnpm preview
```

### 🖥️ Tauri 개발

```bash
# Tauri 개발 서버 실행
pnpm tauri:dev

# Tauri 프로덕션 빌드
pnpm tauri:build
```

---

## 📁 프로젝트 구조

```
src/
├── agents/              # 기능별 Agent 모듈
│   ├── filters/        # 필터링 및 정렬
│   ├── import-export/  # 데이터 입출력
│   ├── parser/         # JSON/CSV 파싱
│   ├── search/         # 검색 기능
│   ├── store/          # 상태 관리 (Undo/Redo 포함)
│   ├── table-view/     # 테이블 뷰 로직
│   └── ui-ux/          # UI/UX 기능 (단축키 등)
├── components/          # Svelte 컴포넌트
│   ├── ColumnFilter.svelte        # 열 필터 컴포넌트
│   ├── ColumnTransformDialog.svelte # 열 변환 다이얼로그
│   ├── ContextMenu.svelte         # 컨텍스트 메뉴
│   ├── TableView.svelte           # 메인 테이블 뷰
│   └── ...
├── utils/               # 유틸리티
│   └── safeFunctionExecutor.ts   # 안전한 함수 실행 엔진
└── main.ts              # 진입점
```

---

## 🔧 주요 기능 상세

### 📋 컨텍스트 메뉴
- **열 헤더에서 오른쪽 클릭**: 열 추가/삭제 메뉴
- **행 번호/셀에서 오른쪽 클릭**: 행 추가/삭제 메뉴
- 메뉴 외부 클릭 시 자동으로 닫힘

### 🎛️ 필터 시스템
- 각 열별 독립적인 필터
- 한 번에 하나의 필터만 열림 (다른 필터 열면 이전 필터 자동 닫힘)
- 필터 창은 해당 열 너비에 맞춰 표시
- 전체 데이터에서 고유 값 추출 (화면에 보이는 행만이 아님)

### ⚡ 성능 최적화
- 가상 스크롤링으로 대량 데이터 효율 처리
- 열 너비 조정 시 드래그 중에는 가이드라인만 표시, 마우스 놓을 때만 실제 너비 적용
- 필터 값 목록은 최대 20개만 표시

### 📊 데이터 구조 지원
- **Flat 데이터**: 일반적인 1차원 객체 배열
- **Nested 데이터**: 중첩된 객체 구조 (2층 헤더로 표시)
- 그룹화된 열은 1층에 그룹명, 2층에 개별 열명 표시

---

## 📝 라이선스

이 프로젝트는 [MIT License](https://opensource.org/licenses/MIT) 하에 배포됩니다.

---

<div align="center">

**⭐ 이 프로젝트가 유용하다면 Star를 눌러주세요! ⭐**

Made with ❤️ using [Cursor](https://cursor.sh/)

</div>
