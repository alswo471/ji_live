# PC 변경 재설치 체크리스트

Mac에서 Windows PC로 개발 환경을 옮긴 뒤 지투라이브 작업을 안전하게 이어가기 위한 문서다.

## 재설치 요청 문구

새 PC에서 Codex에 아래 문구를 입력한다.

> PC 변경으로 인한 재설치

이 문구를 받으면 Codex는 이 문서와 GitHub의 최신 상태를 먼저 확인한 뒤 설치를 진행한다. 이 문서에 적힌 branch나 commit SHA가 오래됐을 수 있으므로 현재 원격 저장소를 기준으로 재개 지점을 다시 판단한다.

## 권장 Windows 개발 환경

- Windows 11
- WSL2 + Ubuntu
- Docker Desktop의 WSL2 backend
- VS Code + WSL extension
- WSL 내부 Git, Node.js 22 이상, pnpm 11
- Codex

프로젝트는 Windows 파일시스템이나 OneDrive 동기화 폴더가 아니라 WSL 내부의 짧은 영문 경로에 둔다.

```text
~/dev/ji_live
```

이 구조를 사용하면 shell command, Docker volume, file watcher와 한글·공백 경로에서 발생할 수 있는 차이를 줄일 수 있다.

## 1. 기존 Mac에서 퇴사 전에 확인할 것

### GitHub에 보존

```bash
git status --short --branch
git log --oneline --branches --not --remotes
git branch -vv
```

- 필요한 변경을 commit한다.
- 원격에 없는 작업 branch를 push한다.
- GitHub에서 branch와 최근 commit이 실제로 보이는지 확인한다.
- `main`, `develop`, `feature/*`, `release/*` 역할은 기존 GitFlow를 유지한다.
- `.worktrees/` 폴더 자체는 옮기지 않는다. 새 PC에서 원격 branch로 다시 만든다.

### 비밀정보는 별도 보관

- `.env.local`과 API key는 Git, 문서, 메신저와 Codex 대화에 올리지 않는다.
- 계속 사용할 개인 secret만 password manager 등 암호화된 저장소에 보관한다.
- GitHub Actions의 Slack secret은 GitHub 저장소에 남아 있으므로 PC로 복사하지 않는다.
- 현재 공개판에서 제거한 Toss credential은 옮기지 말고, 더 이상 사용하지 않으면 공급자 화면에서 폐기한다.
- 회사 GitHub SSH key, 회사 token과 회사 계정 credential은 개인 PC로 복사하지 않는다.

### 개인 Codex 환경

다음 개인 skill은 새 PC에서 다시 설치할 목록으로 기록한다.

- `superpowers`: <https://github.com/alswo471/superpowers>
- `ui-ux-pro-max`: <https://github.com/nextlevelbuilder/ui-ux-pro-max-skill>
- `ip-as-logo`: <https://github.com/s1dashu/ip-as-logo-skill>
- `minjae-commit`: 개인 커스텀 skill이므로 현재 `CODEX_HOME/skills/minjae-commit`을 암호화된 개인 저장소에 별도 보관

정확한 subagent 진행 보고서까지 보존해야 한다면 `.superpowers/sdd/`를 별도 백업한다. 이 폴더는 Git에서 제외되므로 원격 저장소에는 올라가지 않는다. 코드 작업을 이어가는 데에는 Git에 기록된 설계·계획·commit만으로 충분하다.

### 옮기지 않아도 되는 것

- `node_modules/`, pnpm store
- `dist/`, build cache와 생성물
- `.worktrees/`
- Docker image, container와 local volume
- 회사 계정의 SSH key와 credential

의존성, build 결과와 local database는 새 PC에서 다시 생성한다.

## 2. Windows 기본 환경 설치

관리자 PowerShell에서 WSL2를 설치한다.

```powershell
wsl --install -d Ubuntu
```

재부팅 후 Ubuntu 초기 계정을 만들고 Docker Desktop을 설치한다. Docker Desktop 설정에서 WSL2 engine과 Ubuntu integration을 활성화한다.

이후 command는 Ubuntu terminal에서 실행한다.

```bash
sudo apt update
sudo apt install -y git curl build-essential
```

Node.js 22 이상을 WSL 안에 설치한 후 프로젝트가 사용한 pnpm 버전을 활성화한다.

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
node --version
pnpm --version
docker version
```

Node.js 설치 방식은 새 PC의 최신 공식 설치 안내를 확인해 선택한다. Windows용 Node.js와 WSL용 Node.js를 섞어 사용하지 않는다.

## 3. 개인 GitHub SSH와 commit 계정 설정

새 PC에서는 새 SSH key를 생성한다. 기존 Mac의 private key를 복사할 필요가 없다.

```bash
ssh-keygen -t ed25519 -C "alswo471-personal-github"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

출력된 public key만 GitHub의 **Settings → SSH and GPG keys**에 추가하고 연결을 확인한다.

```bash
ssh -T git@github.com
git config --global user.name "alswo471"
git config --global user.email "92145785+alswo471@users.noreply.github.com"
git config --global --get user.name
git config --global --get user.email
```

`ssh -T` 결과의 GitHub 계정과 commit identity가 모두 `alswo471`인지 확인한다. SSH 인증 계정과 commit 작성자 정보는 별도 설정이므로 둘 다 확인해야 한다.

## 4. 저장소 복원과 기준 검증

```bash
mkdir -p ~/dev
cd ~/dev
git clone git@github.com:alswo471/ji_live.git
cd ji_live
git fetch --all --prune
git branch -a
```

GitHub의 최신 작업 branch를 확인한 뒤 전환한다. 현재 기록 기준 재개 후보는 다음과 같다.

```bash
git switch feature/community-mvp
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm build
```

아래 항목도 확인한다.

```bash
git status --short --branch
git log -5 --oneline --decorate
git remote -v
git check-ignore .env.local
```

`.env.local`이 ignore 대상으로 확인되지 않으면 secret을 넣기 전에 `.gitignore`를 먼저 점검한다.

## 5. 환경변수 복원 원칙

- 저장소의 `.env.example`에는 변수 이름과 public placeholder만 둔다.
- 실제 secret은 password manager에서 꺼내 `.env.local`에 직접 입력한다.
- secret 값을 Codex 대화에 붙여넣지 않는다.
- Supabase project를 만들기 전에는 임의의 production key를 생성하지 않는다.

커뮤니티 구현에서 향후 필요한 범주는 Supabase URL·public key·server secret, Turnstile, 익명 식별용 HMAC secret, 보존 기간과 권리침해 문의 정보다. 실제 변수명은 최신 `.env.example`과 설계 문서를 기준으로 확인한다.

## 6. Local Supabase 재구성

Docker가 정상 실행되는지 먼저 확인한다.

```bash
docker version
```

Local Supabase migration은 Git에 기록되므로 새 PC에서는 다음 방식으로 database를 재생성한다.

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset
```

local database를 옮기기 위해 기존 Mac의 Docker volume을 복사하지 않는다. schema와 seed는 migration으로 재현한다.

## 7. 현재 재개 지점

이 섹션은 2026-09-03 기준 기록이며, 재설치 시 반드시 GitHub 최신 이력과 비교한다.

- 작업 branch: `feature/community-mvp`
- 완료: community environment 경계, local Supabase schema·RLS, anonymous Auth·Turnstile·validation·abuse key, public read API
- 관련 commit: `3aad1d9`, `05f716e`, `5f556ce`, `8fbb68b` 및 GitHub의 후속 Task 4 commit
- 미완료: 구현 계획 Task 5 API-only post·comment·delete·report write
- 기존 Mac local runtime: Colima + Docker CLI
- 재개 순서: Docker 확인 → `supabase db reset` → Task 5 테스트 우선 구현
- 기준 문서: [익명 커뮤니티 설계](../superpowers/specs/2026-09-03-익명-커뮤니티-설계.md), [커뮤니티 구현 계획](../superpowers/plans/2026-09-03-community-mvp.md)

별도의 `feature/market-dashboard-v1-design`은 과거 설계 기록 보존용 branch다. 커뮤니티 구현 branch에 필요한 최신 설계와 계획이 포함되어 있으므로 새 구현 기준으로 merge하지 않는다.

## 8. 새 PC에서 Codex가 따를 재설치 순서

`PC 변경으로 인한 재설치` 요청을 받으면 다음 순서로 진행한다.

1. 현재 OS, WSL2, Git, Node.js, pnpm, Docker와 Codex 설치 상태를 확인한다.
2. GitHub remote branch와 최신 commit을 읽어 실제 재개 지점을 찾는다.
3. GitHub SSH 인증 계정과 Git commit identity가 `alswo471`인지 각각 확인한다.
4. 필요한 system 설치나 계정 연결은 사용자에게 화면과 목적을 설명하며 진행한다.
5. 저장소를 WSL 내부에 clone하고 올바른 branch에서 install·test·lint·build를 실행한다.
6. secret 값은 요구하지 않고 필요한 변수 이름만 안내한다.
7. 설계·구현 계획과 Git history를 대조해 첫 번째 미완료 Task부터 이어서 작업한다.

## 9. 기존 Mac 정리 시점

새 Windows PC에서 clone, GitHub SSH, 의존성 설치, test와 필요한 secret 복원까지 확인한 뒤 기존 Mac을 정리한다.

- GitHub에서 기존 Mac에 연결된 개인 SSH key를 폐기한다.
- 개인 GitHub, Codex, Slack과 password manager에서 로그아웃한다.
- 개인 `.env.local`, token과 repository 제거는 회사의 반납·초기화 정책을 따른다.
- 새 PC 검증 전에 기존 Mac의 유일한 파일이나 credential을 먼저 삭제하지 않는다.
