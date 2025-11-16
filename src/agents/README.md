# Agents 구조

이 디렉토리는 각 에이전트의 책임에 따라 코드를 분리한 구조입니다.

## Agent별 디렉토리 구조

### 1. parser (데이터 파서 Agent)
- **책임**: JSON/CSV 데이터 파싱 및 변환, Flat/Nested 데이터 구조 분석
- **파일**: `parser/parser.ts`, `parser/types.ts`
- **Export**: `parseJSON`, `parseCSV`, `exportToJSON`, `exportToCSV`

### 2. store (데이터 스토어 Agent)
- **책임**: 전역 상태 관리, Undo/Redo, 로컬스토리지 자동 저장
- **파일**: `store/dataStore.ts`, `store/types.ts`
- **Export**: `dataStore`, `TableData`, `Row`, `Column`, `Cell`

### 3. search (검색 Agent)
- **책임**: 전체 데이터 검색, 정규식 검색, 열별 검색 필터링
- **파일**: `search/search.ts`, `search/types.ts`
- **Export**: `searchData`, `SearchResult`

### 4. filters (필터 Agent)
- **책임**: 열별 필터링, 정렬, 값 분포 확인
- **파일**: `filters/filters.ts`, `filters/types.ts`
- **Export**: `applyFilters`, `sortRows`, `getColumnValues`, `Filter`

### 5. import-export (Import/Export Agent)
- **책임**: 파일 업로드, 클립보드, Export, 다운로드
- **파일**: `import-export/importExport.ts`
- **Export**: `importFile`, `importFromClipboard`, `exportFile`

### 6. table-view (테이블 뷰 Agent)
- **책임**: 가상 스크롤링, 테이블 렌더링, 통계 표시
- **컴포넌트**: `components/TableView.svelte`, `components/StatsPanel.svelte`

### 7. ui-ux (UI/UX Agent)
- **책임**: 디자인 시스템, 키보드 단축키, Raw/Pretty 뷰
- **파일**: `ui-ux/shortcuts.ts`
- **컴포넌트**: `components/RawView.svelte`, `components/SearchBar.svelte`, `components/Toolbar.svelte`

## 사용 방법

각 에이전트는 독립적인 모듈로 구성되어 있으며, `index.ts`를 통해 통합 인터페이스를 제공합니다.

```typescript
// 예시: 데이터 파서 Agent 사용
import { parseJSON, parseCSV } from './agents/parser';

// 예시: 데이터 스토어 Agent 사용
import { dataStore } from './agents/store';

// 예시: 검색 Agent 사용
import { searchData } from './agents/search';
```

## 확장성

새로운 에이전트를 추가하려면:
1. `src/agents/[agent-name]/` 디렉토리 생성
2. `index.ts`에서 통합 인터페이스 제공
3. 필요한 타입과 로직 구현
4. `agents.md`에 문서화
