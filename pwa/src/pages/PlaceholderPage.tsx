// 未移植画面のプレースホルダ。desktop/frontend/src/pages から順次本実装を移植する。

interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div>
      <h1>{title}</h1>
    </div>
  );
}
