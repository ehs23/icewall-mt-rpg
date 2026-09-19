# 오라클 배포 준비

배포 파일만 준비된 상태입니다. 서버 생성·업로드·실행은 아직 진행하지 않았습니다.

## 1. 무료 서버 생성

오라클 콘솔에서 Compute → Instances → Create instance로 이동합니다.

- 이름: maze-game
- 이미지: Canonical Ubuntu 24.04, 선택한 Ampere 형태와 호환되는 이미지
- 형태: VM.Standard.A1.Flex (Always Free 대상 확인)
- CPU: 1 OCPU / 메모리: 2GB
- 부트 볼륨: 기본 크기 약 50GB, 추가 볼륨은 만들지 않습니다.
- 네트워크: 인터넷 게이트웨이가 연결된 VCN의 공용 서브넷
- 공인 IPv4: 할당
- SSH 키: 새 키를 생성하고 개인 키를 맥에 보관합니다. 채팅에 키 내용을 보내지 않습니다.

생성 전에 무료 대상과 계정 내 다른 자원의 사용량을 확인합니다. A1 용량 부족 오류가 나면 다른 유료 형태를 선택하지 말고 오류 내용을 확인합니다.

공식 안내: https://docs.oracle.com/en-us/iaas/Content/Compute/tutorials/first-linux-instance/overview.htm
무료 범위: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## 2. 서버가 만들어진 다음

1. 공인 IP와 개인 키 파일의 위치를 확인합니다. Ubuntu 기본 로그인 이름은 ubuntu입니다.
2. 오라클 네트워크 규칙에서 접속용 TCP 22는 관리자 IP에, 웹용 TCP 80·443은 사용자에게 허용합니다. 서버 운영체제의 방화벽도 확인합니다. 2567은 외부에 열지 않습니다.
3. 서버에 Docker Engine과 Compose 플러그인을 설치합니다. 공식 Ubuntu 안내: https://docs.docker.com/engine/install/ubuntu/
4. 프로젝트를 전송합니다. 로컬 node_modules, 테스트 데이터, SSH 키, 환경변수 파일은 전송 대상에서 제외합니다.
5. 서버 공인 IP를 가리키는 도메인을 준비합니다. 도메인이 정해지면 HTTPS를 자동 설정합니다. 무료 주소 선택은 다음 단계에서 진행합니다.
6. 현재 로컬 캐릭터·미로 수정안을 이어 쓰려면 첫 공개 실행 전에 SQLite의 일관된 백업을 만들어 game_data 볼륨으로 옮깁니다. 실행 중인 DB 파일 하나만 복사하면 최근 데이터가 빠질 수 있습니다. 이 이전 작업은 아직 수행하지 않았습니다.

## 3. 배포 설정과 실행 (오라클 서버에서만)

프로젝트의 deploy/oracle 폴더에서 .env.example을 .env로 복사하고 SITE_ADDRESS와 ADMIN_PASSWORD를 입력합니다. SITE_ADDRESS는 실제 도메인 이름입니다. 기본 예시는 작동하는 주소가 아닙니다.

설정 검사는 `docker compose config --quiet`입니다.
실제 배포는 준비가 끝난 뒤 `docker compose up -d --build`로 실행합니다.

이 명령은 이미지를 내려받아 빌드하고 게임을 실행합니다. 현재 로컬 환경에서는 실행하지 않았습니다.

- game 컨테이너: Node 24, 게임 화면과 Colyseus 서버를 같은 주소로 제공합니다.
- web 컨테이너: HTTPS와 WebSocket 연결을 중계합니다.
- game_data 볼륨: 캐릭터, 문제 수정안, 순위가 저장됩니다.
- caddy_data 볼륨: HTTPS 인증서가 저장됩니다.
- 서버 프로세스는 하나만 운영합니다. 현재 게임의 방·인원 제한·관찰 화면은 단일 프로세스를 전제로 합니다.
- 다시 배포하거나 재시작해도 볼륨은 유지됩니다. `docker compose down -v`는 저장 볼륨을 삭제하므로 사용하지 않습니다.
- 자동 재시작은 잠깐의 접속 끊김 자체를 없애지 못합니다. 무중단 배포 구성이 아니며, 20명 접속 검증은 별도로 필요합니다.
- 볼륨 보존은 백업이 아닙니다. 정식 사용 전에는 외부 백업을 마련합니다.

## 확인한 범위

TypeScript 검사와 서버 컴파일, Compose 설정 검사를 통과했습니다.
컨테이너 이미지 빌드, 인증서 발급, 실제 게임 실행, 20명 접속 테스트는 수행하지 않았습니다.
