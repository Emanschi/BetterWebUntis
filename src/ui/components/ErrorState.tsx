import { describeError } from '../../api/errors';

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
      {describeError(error)}
    </div>
  );
}
