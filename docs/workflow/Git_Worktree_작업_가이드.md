# Git Worktree 작업 가이드

## 사용하는 이유

Git worktree는 하나의 Git 저장소에서 서로 다른 브랜치를 별도 폴더에 동시에 펼쳐 쓰는 기능이다. 설계와 안정된 현재 상태는 기본 작업 폴더에 보존하고, 규모가 있는 기능 구현은 격리된 worktree에서 진행한다.

```text
바이브코딩_NO.1/
├── 기본 작업 폴더
│   └── 설계·통합 브랜치
└── .worktrees/
    └── market-dashboard-v1/
        └── feature/market-dashboard-v1 구현 브랜치
```

worktree는 같은 저장소의 커밋 이력을 공유하지만 파일, 현재 브랜치와 설치된 의존성은 폴더별로 분리된다. 구현 중 문제가 생겨도 기본 작업 폴더의 파일은 영향을 받지 않는다.

## 프로젝트 규칙

- `.worktrees/`는 `.gitignore`에 포함한다.
- worktree마다 하나의 Git 브랜치만 체크아웃한다.
- 새 worktree에서는 `pnpm install`과 기준 검증을 별도로 실행한다.
- `.env.local`은 Git으로 공유하지 않는다. 필요한 경우 대상과 내용을 확인한 뒤 구현 worktree에만 안전하게 복사한다.
- 개발 서버를 동시에 실행하면 충돌을 피하기 위해 `3000`, `3001`처럼 포트를 나눈다.
- 구현 완료 전에는 `develop`, `main`, release 브랜치에 임의로 병합하거나 배포하지 않는다.

## 구현 시작 흐름

```text
설계 브랜치와 깨끗한 상태 확인
→ .worktrees/가 Git에서 제외됐는지 확인
→ feature/<topic> 구현 브랜치와 worktree 생성
→ pnpm install
→ 기존 lint·build 기준선 확인
→ 테스트 우선으로 구현
```

## 완료와 병합 흐름

사용자는 다음처럼 요청하면 된다.

> 구현 끝났으면 테스트하고 develop에 머지해줘.

요청을 받으면 다음 순서를 따른다.

1. 구현 worktree에서 test, lint와 production build를 실행한다.
2. 커밋되지 않은 파일, 생성물과 비밀정보 포함 여부를 확인한다.
3. 구현 브랜치의 커밋과 변경 범위를 검토한다.
4. 구현 브랜치를 `develop`에 병합한다.
5. 병합된 `develop`에서 다시 검증한다.
6. 사용자가 요청한 경우에만 GitHub에 push한다.
7. 커밋이 보존된 것을 확인한 뒤 사용이 끝난 worktree와 브랜치를 정리한다.

배포까지 필요하면 다음처럼 요청한다.

> 구현 브랜치를 develop에 머지하고, 검증 후 release 브랜치 만들어서 배포까지 해줘.

GitFlow 배포 순서는 다음과 같다.

```text
feature/<topic>
→ develop
→ release/<version>
→ main
→ 배포
```

push, merge, release, tag와 배포는 각각 별도 작업이다. 구현이나 커밋 요청만으로 자동 수행하지 않는다.

## 정리 시 주의사항

- 검증되지 않았거나 커밋되지 않은 변경이 있으면 worktree를 강제로 제거하지 않는다.
- worktree 폴더를 파일 탐색기에서 직접 삭제하지 않고 `git worktree remove`를 사용한다.
- 브랜치를 삭제하기 전에 필요한 커밋이 통합 브랜치 또는 원격 저장소에 보존됐는지 확인한다.
