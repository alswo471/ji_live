'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type {
  ReportInput,
  ReportReason,
  ReportTargetType,
} from '@/lib/community/types';

export function ReportDialog({
  targetType,
  targetId,
  onSubmit,
}: {
  targetType: ReportTargetType;
  targetId: string;
  onSubmit: (input: ReportInput) => Promise<void>;
}) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!reason) {
      setError('신고 사유를 선택해 주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ targetType, targetId, reason, detail: detail.trim() });
      setSuccess(true);
    } catch {
      setError('신고를 접수하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" className="min-h-11" />}>
        <Flag aria-hidden="true" /> 신고
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>콘텐츠 신고</DialogTitle>
          <DialogDescription>
            개인정보·불법 콘텐츠는 접수 즉시 임시로 숨겨질 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        {success ? (
          <output className="rounded-xl bg-primary/10 p-4 text-sm font-semibold">
            신고가 접수됐습니다.
          </output>
        ) : (
          <>
            <label
              htmlFor={`report-reason-${targetId}`}
              className="text-sm font-semibold"
            >
              신고 사유
            </label>
            <select
              id={`report-reason-${targetId}`}
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as ReportReason)
              }
              className="min-h-11 rounded-lg border bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">선택해 주세요</option>
              <option value="privacy">개인정보 노출</option>
              <option value="illegal">불법 콘텐츠</option>
              <option value="copyright">저작권 침해</option>
              <option value="harassment">욕설·혐오·괴롭힘</option>
              <option value="spam">도배·광고</option>
              <option value="financial_solicitation">
                투자 유도·금전 요구
              </option>
              <option value="other">기타</option>
            </select>
            <label
              htmlFor={`report-detail-${targetId}`}
              className="text-sm font-semibold"
            >
              상세 내용{' '}
              <span className="font-normal text-muted-foreground">(선택)</span>
            </label>
            <Textarea
              id={`report-detail-${targetId}`}
              maxLength={500}
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                className="min-h-11"
                disabled={submitting}
                onClick={() => void submit()}
              >
                {submitting ? '접수 중…' : '신고하기'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
