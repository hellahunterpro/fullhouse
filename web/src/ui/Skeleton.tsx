import './Skeleton.css';

interface Props {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  className?: string;
}

export function Skeleton({ width = '100%', height = 16, radius, className }: Props) {
  return (
    <div
      className={className ? `ui-skeleton ${className}` : 'ui-skeleton'}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
