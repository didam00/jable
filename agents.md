# Agents 구성

## 중요 사항
- **패키지 매니저: pnpm 사용** (npm 대신 pnpm 사용)
- **코드 구조: `src/agents/` 폴더에 에이전트별로 분리됨**
- **타입 안정성: any 타입 사용하지 않음, 모든 타입 명시**
- **기존 폴더: `src/stores/`, `src/utils/` 삭제됨 (agents로 통합)**
- **지원 형식: JSON, CSV, XML**
- **파일 업로드: 파일 선택, 드래그앤드롭, 클립보드 붙여넣기 모두 지원**

## 1. 프로젝트 설정 Agent (Project Setup Agent)
**책임:**
- Svelte 프로젝트 초기화 및 빌드 설정
- 개발 환경 구성 (Vite, TypeScript 등)
- 의존성 관리 (package.json)
- 프로젝트 구조 설계

**주요 작업:**
- Svelte + Vite 프로젝트 셋업
- TypeScript 설정
- 빌드 및 개발 서버 설정
- 폴더 구조 생성
- **패키지 매니저: pnpm 사용**

**구현 완료:**
- ✅ 프로젝트 초기화 완료
- ✅ pnpm으로 의존성 관리
- ✅ TypeScript 설정 완료

## 2. 데이터 파서 Agent (Data Parser Agent)
**책임:**
- JSON/CSV/XML 데이터 파싱 및 변환
- Flat/Nested 데이터 구조 분석
- 데이터 정규화 및 구조화
- 2차원 이상의 열 구조 처리

**주요 작업:**
- JSON 파서 구현
- CSV → JSON 변환기
- XML 파서 구현
- Nested 데이터 flattening 로직
- 데이터 구조 분석 및 메타데이터 생성

**구현 완료:**
- ✅ `src/agents/parser/parser.ts` - JSON/CSV/XML 파싱 및 export
- ✅ papaparse 라이브러리 사용 (타입 정의 포함)
- ✅ Flat/Nested 데이터 구조 처리
- ✅ XML 파싱 (DOMParser 사용, 속성/요소/텍스트 지원)
- ✅ XML Export 기능

## 3. 데이터 스토어 Agent (Data Store Agent)
**책임:**
- 전역 상태 관리 (Svelte stores)
- 데이터 변경 이력 관리 (Undo/Redo)
- 로컬스토리지 자동 저장
- 상태 동기화

**주요 작업:**
- Svelte stores 설정
- Undo/Redo 히스토리 관리
- 로컬스토리지 연동
- 상태 변경 추적

**구현 완료:**
- ✅ `src/agents/store/dataStore.ts` - 상태 관리 및 히스토리
- ✅ Undo/Redo 기능 (최대 50개 히스토리)
- ✅ 로컬스토리지 자동 저장/로드
- ✅ subscribe는 getter로 구현 (초기화 문제 해결)
- ✅ `merge()` 메서드 - 두 데이터 병합 기능 (컬럼/행 병합)
- ✅ `getCurrentData()` 메서드 - 현재 데이터 조회

## 4. 테이블 뷰 Agent (Table View Agent)
**책임:**
- 가상 스크롤링 구현
- 2층 컬럼 렌더링 (nested 구조)
- 테이블 레이아웃 및 스타일링
- 데이터 통계 정보 표시
- 열 고정 (freeze columns)
- 드래그 앤 드롭으로 열 순서 변경

**주요 작업:**
- 가상 스크롤링 컴포넌트
- 테이블 헤더/바디 렌더링
- 2층 컬럼 구조 UI
- 통계 패널 컴포넌트
- 열 관리 기능

**구현 완료:**
- ✅ `src/components/TableView.svelte` - 가상 스크롤링 테이블
- ✅ `src/components/StatsPanel.svelte` - 통계 정보 표시
- ✅ 가상 스크롤링으로 대용량 데이터 처리

## 5. 편집 기능 Agent (Editing Agent)
**책임:**
- 개별 셀 편집
- 행/열 추가/삭제/이름 변경
- 열별 filter, sort, replace, delete
- 다중 행 선택 및 일괄 편집
- JavaScript 함수 적용 기능
- 열 값 분포 확인

**주요 작업:**
- 인라인 셀 에디터
- 행/열 관리 UI 및 로직
- 필터링 시스템
- 정렬 기능
- 찾기/바꾸기 기능
- 다중 선택 기능
- JS 함수 실행 엔진

**구현 완료:**
- ✅ `src/agents/filters/filters.ts` - 필터링 및 정렬 로직
- ✅ `src/components/ColumnFilter.svelte` - 열별 필터 UI
- ✅ 인라인 셀 편집
- ✅ 열별 정렬 (오름차순/내림차순)

## 6. 변환/검증 Agent (Transform/Validation Agent)
**책임:**
- 데이터 타입 변환 (string ↔ number ↔ boolean)
- 날짜 형식 변환
- 데이터 타입 검증
- 스키마 정의 및 검사
- 에러 핸들링 및 표시

**주요 작업:**
- 타입 변환 유틸리티
- 날짜 파서/포맷터
- 스키마 검증 엔진
- 에러 처리 시스템
- 검증 결과 UI

## 7. 검색 Agent (Search Agent)
**책임:**
- 전체 데이터 검색
- 정규식 검색 지원
- 열별 검색 필터링
- 검색 결과 하이라이트

**주요 작업:**
- 검색 엔진 구현
- 정규식 파서
- 검색 UI 컴포넌트
- 결과 하이라이팅

**구현 완료:**
- ✅ `src/agents/search/search.ts` - 검색 엔진
- ✅ `src/components/SearchBar.svelte` - 검색 UI
- ✅ 정규식 검색 지원
- ✅ 전체 데이터 검색

## 8. Import/Export Agent (Import/Export Agent)
**책임:**
- JSON/CSV/XML 파일 업로드
- 드래그앤드롭 파일 업로드
- 클립보드 붙여넣기 (JSON/CSV/XML)
- JSON/CSV/XML 형식으로 export
- 파일 다운로드
- 데이터 병합 기능

**주요 작업:**
- 파일 업로드 컴포넌트
- 드래그앤드롭 핸들러
- CSV/XML 파서/변환기
- 클립보드 API 연동
- Export 포맷터
- 다운로드 기능
- 병합 다이얼로그

**구현 완료:**
- ✅ `src/agents/import-export/importExport.ts` - 파일 처리
- ✅ `src/components/Toolbar.svelte` - Import/Export UI
- ✅ JSON/CSV/XML 파일 업로드
- ✅ 드래그앤드롭 파일 업로드 (App.svelte)
- ✅ 클립보드 붙여넣기 (JSON → CSV → XML 순서로 시도)
- ✅ JSON/CSV/XML 다운로드
- ✅ `src/components/MergeDialog.svelte` - 병합 선택 다이얼로그
- ✅ 기존 데이터가 있을 때 병합/교체 선택 기능

## 9. UI/UX Agent (UI/UX Agent)
**책임:**
- 개발자 친화적인 디자인 시스템
- 애플 스러운 미니멀 디자인 구현
- 데이터 중심 레이아웃
- 키보드 단축키 지원
- 반응형 디자인
- Raw/Pretty 뷰 전환
- 코드 에디터 통합

**주요 작업:**
- 디자인 시스템 구축
- 컴포넌트 라이브러리
- 키보드 단축키 핸들러
- 반응형 레이아웃
- Raw/Pretty 뷰 컴포넌트
- 코드 에디터 (Monaco Editor 등)

**구현 완료:**
- ✅ `src/agents/ui-ux/shortcuts.ts` - 키보드 단축키
- ✅ `src/components/RawView.svelte` - Raw JSON 뷰
- ✅ `src/app.css` - 개발자 친화적 디자인 (애플 스타일)
- ✅ 키보드 단축키: Ctrl+Z/Y (Undo/Redo), Ctrl+E (뷰 전환)
- ✅ 드래그앤드롭 시각적 피드백 (드래그 오버 효과)
- ✅ `src/components/MergeDialog.svelte` - 병합 다이얼로그 UI

## 10. 성능 최적화 Agent (Performance Agent)
**책임:**
- 웹 워커를 활용한 대용량 데이터 처리
- 렌더링 최적화
- 메모리 관리
- 성능 모니터링

**주요 작업:**
- 웹 워커 설정 및 통신
- 대용량 데이터 처리 로직
- 렌더링 최적화 (debounce, throttle)
- 메모리 누수 방지
- 성능 프로파일링

**구현 완료:**
- ✅ 가상 스크롤링으로 렌더링 최적화
- ✅ 대용량 데이터 처리 (10000건 이상)
- ⏳ 웹 워커는 향후 구현 예정

## 프로젝트 구조
```
src/
├── agents/          # 에이전트별 코드 분리
│   ├── parser/      # 데이터 파서 Agent
│   ├── store/       # 데이터 스토어 Agent
│   ├── search/      # 검색 Agent
│   ├── filters/     # 필터 Agent
│   ├── import-export/ # Import/Export Agent
│   ├── table-view/  # 테이블 뷰 Agent
│   └── ui-ux/       # UI/UX Agent
├── components/      # Svelte 컴포넌트
├── app.css         # 전역 스타일
└── main.ts         # 진입점
```

## 타입 안정성
- 모든 파라미터에 명시적 타입 지정
- any 타입 사용 금지
- @types/papaparse 설치 완료
- svelte-check로 타입 검증 완료

## 개발 환경
- pnpm 사용 (npm 대신)
- 개발 서버: `pnpm dev`
- 빌드: `pnpm build`
- 타입 체크: `pnpm exec svelte-check --tsconfig ./tsconfig.json`

## 유의점
- 한국어로 대답할 것
- 같은 작업을 계속 반복하는 것 같고 해결이 잘 되지 않는 다면 나에게 물어볼 것