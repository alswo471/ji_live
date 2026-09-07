'use client';

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';

export function DataSourcesDialog() {
  return (
    <Dialog>
      <DialogTrigger className="inline-flex min-h-11 items-center rounded font-semibold hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        데이터 출처·산정 기준
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[85dvh] overflow-y-auto p-6 sm:max-w-xl"
      >
        <div className="flex items-center justify-between gap-4">
          <DialogTitle>데이터 출처·산정 기준</DialogTitle>
          <DialogClose className="min-h-11 rounded-lg border px-4 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            닫기
          </DialogClose>
        </div>
        <DialogDescription>
          실제 거래상품, 참고 추정가, 일별 지표를 구분해서 확인하세요.
        </DialogDescription>
        <div className="space-y-5 text-sm leading-6 [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:focus-visible:ring-2">
          <section>
            <h3 className="font-bold">주식 참고 추정가</h3>
            <p className="mt-1 text-muted-foreground">
              <a
                href="https://hyperliquid.xyz/"
                target="_blank"
                rel="noreferrer"
              >
                Hyperliquid
              </a>
              ·
              <a
                href="https://www.binance.com/en"
                target="_blank"
                rel="noreferrer"
              >
                Binance
              </a>{' '}
              파생상품 기반입니다. KRX·NXT·미국 거래소의 주식 체결가가 아니며
              정규장에도 차이가 날 수 있습니다. 원화 환산에는 내부 USDT/KRW
              데이터를 사용하며 공식 원·달러 환율과 다릅니다. 등락률은 상품별
              비교 기준을 따릅니다.
            </p>
          </section>
          <section>
            <h3 className="font-bold">암호화폐·금 연동 상품</h3>
            <p className="mt-1 text-muted-foreground">
              <a
                href="https://www.bithumb.com/react/"
                target="_blank"
                rel="noreferrer"
              >
                Bithumb
              </a>{' '}
              원화 거래상품과 Binance PAXG/USDT 현물 상품의 시세입니다. PAXG는
              금 연동 토큰이며 금 현물 고시가격이 아닙니다.
            </p>
          </section>
          <section>
            <h3 className="font-bold">일별 기준환율</h3>
            <p className="mt-1 text-muted-foreground">
              <a
                href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"
                target="_blank"
                rel="noreferrer"
              >
                ECB
              </a>{' '}
              유로 기준값을 교차계산합니다. KRW 기준값 ÷ 해당 통화 기준값 × 표시
              단위(USD·THB 1, JPY 100)이며 등락률은 직전 발표값 대비입니다. 직접
              연결 실패 시{' '}
              <a
                href="https://frankfurter.dev/"
                target="_blank"
                rel="noreferrer"
              >
                Frankfurter
              </a>
              의 ECB 단일 공급자 데이터를 사용합니다. 실시간 거래 환율이 아니며
              주말·휴일에는 마지막 발표값을 표시합니다.
            </p>
          </section>
          <section>
            <h3 className="font-bold">공포·탐욕 지수</h3>
            <p className="mt-1 text-muted-foreground">
              <a
                href="https://alternative.me/crypto/fear-and-greed-index/"
                target="_blank"
                rel="noreferrer"
              >
                Alternative.me
              </a>
              의 비트코인 일별 지수(0~100)를 사용합니다. 한국·미국 주식 지수로
              대체 해석하지 않습니다. 한국·미국 주식 심리 지표는 현재
              미연동입니다.
            </p>
          </section>
          <section>
            <h3 className="font-bold">갱신 및 장애 안내</h3>
            <p className="mt-1 text-muted-foreground">
              시세 화면은 활성 탭에서 5초마다, 환율·심리는 5분마다 갱신을
              확인합니다. 일별 원본이 실시간 값으로 바뀌는 것은 아닙니다. 원본
              발표일과 갱신 지연 표시를 확인하세요. 연결 실패 시 임의의 숫자를
              생성하지 않습니다.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
