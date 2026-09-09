'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  postKindLabels,
  type CommunityPostKind,
} from '@/lib/community/post-kind';

export function PostKindControl({
  kind,
  onSave,
  onChanged,
}: {
  kind: CommunityPostKind;
  onSave: (kind: CommunityPostKind) => Promise<{ kind: CommunityPostKind }>;
  onChanged: (kind: CommunityPostKind) => void;
}) {
  const [selected, setSelected] = useState(kind);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(false);
    setSaved(false);
    try {
      const result = await onSave(selected);
      setSelected(result.kind);
      onChanged(result.kind);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-5 rounded-xl border bg-muted/30 p-3">
      <label htmlFor="detail-post-kind" className="block text-sm font-semibold">
        글 종류
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          id="detail-post-kind"
          value={selected}
          disabled={saving}
          onChange={(event) => {
            setSelected(event.target.value as CommunityPostKind);
            setSaved(false);
          }}
          className="min-h-11 flex-1 rounded-lg border bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {Object.entries(postKindLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          className="min-h-11"
          disabled={saving || selected === kind}
        >
          {saving ? '저장 중…' : '종류 저장'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          종류를 저장하지 못했습니다. 권한과 연결을 확인한 뒤 다시 시도해
          주세요.
        </p>
      )}
      {saved && (
        <output className="mt-2 block text-sm text-muted-foreground">
          글 종류를 저장했습니다.
        </output>
      )}
    </form>
  );
}
